-- FIN-13: hardening aditivo do orçamento gerencial e dos cenários de expansão.
--
-- Princípios aplicados nesta migração (somente aditiva; nenhuma migração
-- histórica é alterada e nenhum tipo existente é modificado):
--   * premissa explícita é obrigatória: orçamento e cenário não existem sem
--     premissas registradas (texto, origem do número e data-base no cenário);
--   * estimativa nunca se disfarça de resultado: is_estimate fica travado em
--     true e o aviso de estimativa é obrigatório — nada aqui promete resultado;
--   * dado ausente é lacuna visível, não zero: cenário sem base é incompleto
--     com motivo, e a margem projetada não é calculada;
--   * máquina de estados do orçamento: rascunho -> em_revisao ->
--     aprovado | rejeitado | arquivado, com aprovação auditada exigindo
--     aprovador e data;
--   * alterar premissas de algo aprovado revoga a aprovação e incrementa a
--     versão das premissas (nenhuma aprovação sobrevive a premissas novas);
--   * histórico imutável em fin_budget_history.

-- ---------------------------------------------------------------------------
-- Histórico imutável de orçamento e cenário
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_budget_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('budget','scenario')),
  entity_id UUID NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL CHECK (char_length(next_status) BETWEEN 3 AND 50),
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_budget_history_entity_idx ON fin_budget_history(entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION fin_budget_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_budget_history_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_budget_history_immutable ON fin_budget_history;
CREATE TRIGGER trg_fin_budget_history_immutable
  BEFORE UPDATE OR DELETE ON fin_budget_history
  FOR EACH ROW EXECUTE FUNCTION fin_budget_history_immutable();

-- ---------------------------------------------------------------------------
-- Orçamento: idempotência, versão de premissas, aviso de estimativa travado
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budgets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS premises_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS fin_budgets_idempotency_key
  ON fin_budgets(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserva linhas do rascunho 080, mas as regras valem integralmente
-- para toda escrita nova e para toda alteração.
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
-- Estimativa nunca se disfarça de resultado: a trava vale para todo o ciclo.
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_is_estimate_locked
  CHECK (is_estimate = true) NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_premises_version_positive
  CHECK (premises_version >= 1) NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_state_fields
  CHECK (
    (status = 'rascunho' AND approved_by_identity IS NULL AND approved_at IS NULL)
    OR (status = 'em_revisao' AND approved_by_identity IS NULL AND approved_at IS NULL AND submitted_at IS NOT NULL)
    OR (status = 'aprovado' AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL)
    OR (status = 'rejeitado' AND approved_by_identity IS NULL AND approved_at IS NULL)
    OR (status = 'arquivado')
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin13_guard_budget_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Orçamento gerencial é sempre estimativa com premissas explícitas.
  IF NEW.is_estimate = false THEN
    RAISE EXCEPTION 'fin_budget_estimate_flag_locked' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'fin_budget_initial_status_must_be_rascunho' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL
       OR NEW.submitted_at IS NOT NULL OR NEW.premises_version <> 1 THEN
      RAISE EXCEPTION 'fin_budget_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.protocol <> OLD.protocol
     OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'fin_budget_identity_fields_immutable' USING ERRCODE = '23514';
  END IF;

  -- Versão das premissas acompanha cada mudança de premissa, e só ela.
  IF NEW.premises <> OLD.premises THEN
    IF NEW.premises_version <> OLD.premises_version + 1 THEN
      RAISE EXCEPTION 'fin_budget_premises_version_increment_required' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.premises_version <> OLD.premises_version THEN
    RAISE EXCEPTION 'fin_budget_premises_version_increment_required' USING ERRCODE = '23514';
  END IF;

  -- Conteúdo (título, descrição, premissas, totais previstos) só muda com o
  -- orçamento em rascunho — inclusive quando a revisão de premissas tira um
  -- orçamento aprovado de circulação no mesmo comando.
  IF (NEW.title <> OLD.title OR NEW.description <> OLD.description
      OR NEW.premises <> OLD.premises
      OR NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents
      OR NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents)
     AND NEW.status <> 'rascunho' THEN
    RAISE EXCEPTION 'fin_budget_edit_requires_rascunho' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = OLD.status THEN
    -- Sem transição, a única escrita legítima é a edição de rascunho.
    IF NEW.status <> 'rascunho'
       OR (NEW.title = OLD.title AND NEW.description = OLD.description
           AND NEW.premises = OLD.premises
           AND NEW.total_revenue_cents IS NOT DISTINCT FROM OLD.total_revenue_cents
           AND NEW.total_cost_cents IS NOT DISTINCT FROM OLD.total_cost_cents) THEN
      RAISE EXCEPTION 'fin_budget_status_transition_required' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'rascunho' AND NEW.status IN ('em_revisao','arquivado'))
    OR (OLD.status = 'em_revisao' AND NEW.status IN ('aprovado','rejeitado','rascunho'))
    OR (OLD.status = 'aprovado' AND NEW.status IN ('arquivado','rascunho'))
    OR (OLD.status = 'rejeitado' AND NEW.status IN ('rascunho','arquivado'))
  ) THEN
    RAISE EXCEPTION 'fin_budget_invalid_status_transition' USING ERRCODE = '23514';
  END IF;

  -- Aprovação auditada: aprovador e data são obrigatórios, nunca presumidos.
  IF NEW.status = 'aprovado' AND (NEW.approved_by_identity IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'fin_budget_approval_requires_approver_and_date' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'em_revisao' AND NEW.submitted_at IS NULL THEN
    RAISE EXCEPTION 'fin_budget_review_requires_submission_date' USING ERRCODE = '23514';
  END IF;
  -- Sair de aprovado para rascunho é revisão de premissas: a aprovação não
  -- sobrevive e a saída exige premissa nova.
  IF OLD.status = 'aprovado' AND NEW.status = 'rascunho' THEN
    IF NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'fin_budget_revision_revokes_approval' USING ERRCODE = '23514';
    END IF;
    IF NEW.premises = OLD.premises THEN
      RAISE EXCEPTION 'fin_budget_revision_requires_premise_change' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status IN ('rascunho','em_revisao','rejeitado')
     AND (NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'fin_budget_approval_fields_only_when_approved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin13_guard_budget_write ON fin_budgets;
CREATE TRIGGER trg_fin13_guard_budget_write
  BEFORE INSERT OR UPDATE ON fin_budgets
  FOR EACH ROW EXECUTE FUNCTION fin13_guard_budget_write();

-- ---------------------------------------------------------------------------
-- Cenário: premissa explícita com origem e data-base, lacuna visível e
-- margem projetada calculada pelo servidor — nunca declarada pelo cliente
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budget_scenarios
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS premise_source TEXT,
  ADD COLUMN IF NOT EXISTS premise_base_date DATE,
  ADD COLUMN IF NOT EXISTS premises_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incomplete_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS fin_budget_scenarios_idempotency_key
  ON fin_budget_scenarios(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_is_estimate_locked
  CHECK (is_estimate = true) NOT VALID;
-- Premissa explícita: texto, origem do número e data-base.
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_premise_explicit_required
  CHECK (
    premise_source IS NOT NULL AND char_length(trim(premise_source)) BETWEEN 5 AND 200
    AND premise_base_date IS NOT NULL
  ) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_premises_version_positive
  CHECK (premises_version >= 1) NOT VALID;
-- Dado ausente é lacuna visível, não zero: sem base completa não há margem.
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_completeness_fields
  CHECK (
    (is_complete = true AND projected_revenue_cents IS NOT NULL AND projected_cost_cents IS NOT NULL
      AND projected_margin_percent IS NOT NULL AND incomplete_reason IS NULL)
    OR (is_complete = false AND projected_revenue_cents IS NULL AND projected_cost_cents IS NULL
      AND projected_margin_percent IS NULL AND incomplete_reason IS NOT NULL
      AND char_length(trim(incomplete_reason)) BETWEEN 10 AND 1000)
  ) NOT VALID;
-- Aprovação de cenário é auditada e só existe sobre base completa.
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_approval_fields
  CHECK (
    (is_approved = true AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL AND is_complete = true)
    OR (is_approved = false AND approved_by_identity IS NULL AND approved_at IS NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin13_guard_scenario_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_percent NUMERIC(5,2);
BEGIN
  IF NEW.is_estimate = false THEN
    RAISE EXCEPTION 'fin_scenario_estimate_flag_locked' USING ERRCODE = '23514';
  END IF;

  -- Completo exige base e margem calculada; incompleto exige motivo e lacuna.
  IF NEW.is_complete THEN
    IF NEW.projected_revenue_cents IS NULL OR NEW.projected_cost_cents IS NULL THEN
      RAISE EXCEPTION 'fin_scenario_complete_requires_projection_base' USING ERRCODE = '23514';
    END IF;
    IF NEW.projected_revenue_cents <= 0 THEN
      RAISE EXCEPTION 'fin_scenario_margin_requires_positive_revenue' USING ERRCODE = '23514';
    END IF;
    expected_percent := round(((NEW.projected_revenue_cents - NEW.projected_cost_cents)::numeric * 100)
      / NEW.projected_revenue_cents::numeric, 2);
    IF NEW.projected_margin_percent IS NULL OR NEW.projected_margin_percent <> expected_percent THEN
      RAISE EXCEPTION 'fin_scenario_margin_mismatch' USING ERRCODE = '23514';
    END IF;
    IF NEW.incomplete_reason IS NOT NULL THEN
      RAISE EXCEPTION 'fin_scenario_complete_must_not_carry_incomplete_reason' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.projected_revenue_cents IS NOT NULL OR NEW.projected_cost_cents IS NOT NULL
       OR NEW.projected_margin_percent IS NOT NULL THEN
      RAISE EXCEPTION 'fin_scenario_incomplete_must_not_carry_projection' USING ERRCODE = '23514';
    END IF;
    IF NEW.incomplete_reason IS NULL OR char_length(trim(NEW.incomplete_reason)) < 10 THEN
      RAISE EXCEPTION 'fin_scenario_incomplete_requires_reason' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_approved = true OR NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'fin_scenario_approval_is_explicit_transition' USING ERRCODE = '23514';
    END IF;
    IF NEW.premises_version <> 1 THEN
      RAISE EXCEPTION 'fin_scenario_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.budget_id <> OLD.budget_id OR NEW.scenario_type <> OLD.scenario_type
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'fin_scenario_identity_fields_immutable' USING ERRCODE = '23514';
  END IF;

  -- Premissa nova (texto, origem ou data-base) incrementa a versão e revoga
  -- qualquer aprovação existente — nunca silenciosamente.
  IF NEW.premises <> OLD.premises
     OR NEW.premise_source IS DISTINCT FROM OLD.premise_source
     OR NEW.premise_base_date IS DISTINCT FROM OLD.premise_base_date THEN
    IF NEW.premises_version <> OLD.premises_version + 1 THEN
      RAISE EXCEPTION 'fin_scenario_premises_version_increment_required' USING ERRCODE = '23514';
    END IF;
    IF OLD.is_approved = true AND NEW.is_approved = true THEN
      RAISE EXCEPTION 'fin_scenario_premise_change_revokes_approval' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.premises_version <> OLD.premises_version THEN
    RAISE EXCEPTION 'fin_scenario_premises_version_increment_required' USING ERRCODE = '23514';
  END IF;

  -- Cenário aprovado tem números congelados: para mexer é preciso revogar.
  IF OLD.is_approved = true AND NEW.is_approved = true
     AND (NEW.projected_revenue_cents IS DISTINCT FROM OLD.projected_revenue_cents
          OR NEW.projected_cost_cents IS DISTINCT FROM OLD.projected_cost_cents
          OR NEW.projected_margin_percent IS DISTINCT FROM OLD.projected_margin_percent
          OR NEW.is_complete <> OLD.is_complete) THEN
    RAISE EXCEPTION 'fin_scenario_approved_projection_immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.is_approved = false AND NEW.is_approved = true THEN
    IF NEW.is_complete = false THEN
      RAISE EXCEPTION 'fin_scenario_approval_requires_complete' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by_identity IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'fin_scenario_approval_requires_approver_and_date' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.is_approved = false AND (NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'fin_scenario_approval_fields_only_when_approved' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin13_guard_scenario_write ON fin_budget_scenarios;
CREATE TRIGGER trg_fin13_guard_scenario_write
  BEFORE INSERT OR UPDATE ON fin_budget_scenarios
  FOR EACH ROW EXECUTE FUNCTION fin13_guard_scenario_write();

-- FIN-13: hardening aditivo de orçamento gerencial e cenários de expansão.
--
-- Princípios aplicados nesta migração (somente aditiva; nenhuma migração
-- histórica é alterada e nenhum tipo existente é modificado — o status do
-- cenário reutiliza o enum fin_budget_status de 080):
--   * premissa explícita é obrigatória e estruturada: texto com faixa mínima,
--     ORIGEM do número e DATA-BASE — o banco recusa, não só a API;
--   * estimativa nunca se disfarça de resultado: projetado e realizado são
--     campos distintos; is_estimate é travado em true;
--   * dado ausente é lacuna visível, não zero: is_complete é CALCULADO pelo
--     banco a partir dos valores realizados; sem base, o cenário é marcado
--     incompleto com motivo obrigatório e a margem realizada não é calculada;
--   * premissas são versionadas: alterar premissa (ou os números que dela
--     derivam) incrementa premises_version e derruba a aprovação;
--   * aprovar orçamento/cenário não cria compromisso: nenhum recebível,
--     pagável, despesa, meta ou provisão nasce da aprovação (o gate prova por
--     contagem antes/depois);
--   * estados e transições explícitos: rascunho -> em_revisao ->
--     aprovado|rejeitado -> arquivado, validados por trigger;
--   * idempotência por chave única em toda criação;
--   * histórico imutável em fin_budget_history.

-- ---------------------------------------------------------------------------
-- Histórico imutável compartilhado de orçamento e cenário
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
-- Orçamento gerencial: premissa estruturada, estimativa permanente,
-- transições explícitas e versionamento de premissas
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budgets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS premise_source TEXT,
  ADD COLUMN IF NOT EXISTS premise_base_date DATE,
  ADD COLUMN IF NOT EXISTS premises_version INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS fin_budgets_idempotency_key
  ON fin_budgets(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserva linhas do rascunho 080, mas as regras valem integralmente
-- para toda escrita nova e para toda alteração.
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_premise_source_required
  CHECK (premise_source IS NOT NULL AND char_length(trim(premise_source)) BETWEEN 5 AND 200) NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_premise_base_date_required
  CHECK (premise_base_date IS NOT NULL) NOT VALID;
-- Orçamento é sempre estimativa com premissas explícitas: nunca resultado.
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_estimate_only
  CHECK (is_estimate = true) NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_approval_fields_consistent
  CHECK (
    (status = 'aprovado' AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL)
    OR (status <> 'aprovado' AND approved_by_identity IS NULL AND approved_at IS NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin13_guard_budget_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  premise_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'fin_budget_initial_status_must_be_rascunho' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.premises_version <> 1 THEN
      RAISE EXCEPTION 'fin_budget_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Campos de identidade e idempotência nunca mudam depois de criados.
  IF NEW.id <> OLD.id OR NEW.protocol <> OLD.protocol
     OR NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity THEN
    RAISE EXCEPTION 'fin_budget_identity_fields_immutable' USING ERRCODE = '23514';
  END IF;

  premise_changed :=
       NEW.premises IS DISTINCT FROM OLD.premises
    OR NEW.premise_source IS DISTINCT FROM OLD.premise_source
    OR NEW.premise_base_date IS DISTINCT FROM OLD.premise_base_date
    OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents
    OR NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents;

  IF premise_changed THEN
    IF NEW.premises_version <> OLD.premises_version + 1 THEN
      RAISE EXCEPTION 'fin_budget_premises_version_must_increment' USING ERRCODE = '23514';
    END IF;
    -- Alterar a premissa de um orçamento aprovado retira a aprovação.
    IF OLD.status = 'aprovado' AND NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'fin_budget_premise_change_drops_approval' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'aprovado' AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'fin_budget_revision_must_not_change_status' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.premises_version <> OLD.premises_version THEN
      RAISE EXCEPTION 'fin_budget_premises_version_immutable_without_change' USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'rascunho' AND NEW.status IN ('em_revisao','arquivado'))
      OR (OLD.status = 'em_revisao' AND NEW.status IN ('aprovado','rejeitado','rascunho','arquivado'))
      OR (OLD.status = 'aprovado' AND NEW.status = 'arquivado')
      OR (OLD.status = 'rejeitado' AND NEW.status IN ('rascunho','arquivado'))
    ) THEN
      RAISE EXCEPTION 'fin_budget_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin13_guard_budget_write ON fin_budgets;
CREATE TRIGGER trg_fin13_guard_budget_write
  BEFORE INSERT OR UPDATE ON fin_budgets
  FOR EACH ROW EXECUTE FUNCTION fin13_guard_budget_write();

-- ---------------------------------------------------------------------------
-- Cenário de expansão: premissa estruturada, projetado != realizado,
-- completude calculada pelo banco e aprovação que não cria compromisso
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budget_scenarios
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS premise_source TEXT,
  ADD COLUMN IF NOT EXISTS premise_base_date DATE,
  ADD COLUMN IF NOT EXISTS premises_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status fin_budget_status NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS approved_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS realized_revenue_cents BIGINT,
  ADD COLUMN IF NOT EXISTS realized_cost_cents BIGINT,
  ADD COLUMN IF NOT EXISTS realized_margin_cents BIGINT GENERATED ALWAYS AS (
    CASE WHEN realized_revenue_cents IS NOT NULL AND realized_cost_cents IS NOT NULL
         THEN realized_revenue_cents - realized_cost_cents ELSE NULL END
  ) STORED,
  -- A completude é veredito do banco, não do cliente: só é completa quando os
  -- dois valores realizados existem. Dado ausente é lacuna visível, não zero.
  ADD COLUMN IF NOT EXISTS is_complete BOOLEAN GENERATED ALWAYS AS (
    realized_revenue_cents IS NOT NULL AND realized_cost_cents IS NOT NULL
  ) STORED,
  ADD COLUMN IF NOT EXISTS incomplete_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_budget_scenarios_idempotency_key
  ON fin_budget_scenarios(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_premise_source_required
  CHECK (premise_source IS NOT NULL AND char_length(trim(premise_source)) BETWEEN 5 AND 200) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_premise_base_date_required
  CHECK (premise_base_date IS NOT NULL) NOT VALID;
-- Cenário é sempre estimativa identificada: projeção não é resultado.
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_estimate_only
  CHECK (is_estimate = true) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_realized_nonnegative
  CHECK (
    (realized_revenue_cents IS NULL OR realized_revenue_cents >= 0)
    AND (realized_cost_cents IS NULL OR realized_cost_cents >= 0)
  ) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_completeness_consistent
  CHECK (
    (is_complete = true AND incomplete_reason IS NULL
       AND realized_revenue_cents IS NOT NULL AND realized_cost_cents IS NOT NULL)
    OR (is_complete = false AND incomplete_reason IS NOT NULL
       AND char_length(trim(incomplete_reason)) >= 10)
  ) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin_scenario_approval_fields_consistent
  CHECK (
    (status = 'aprovado' AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL)
    OR (status <> 'aprovado' AND approved_by_identity IS NULL AND approved_at IS NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin13_guard_scenario_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  premise_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'fin_scenario_initial_status_must_be_rascunho' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.premises_version <> 1 THEN
      RAISE EXCEPTION 'fin_scenario_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.budget_id <> OLD.budget_id
     OR NEW.scenario_type <> OLD.scenario_type
     OR NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity THEN
    RAISE EXCEPTION 'fin_scenario_identity_fields_immutable' USING ERRCODE = '23514';
  END IF;

  premise_changed :=
       NEW.premises IS DISTINCT FROM OLD.premises
    OR NEW.premise_source IS DISTINCT FROM OLD.premise_source
    OR NEW.premise_base_date IS DISTINCT FROM OLD.premise_base_date
    OR NEW.projected_revenue_cents IS DISTINCT FROM OLD.projected_revenue_cents
    OR NEW.projected_cost_cents IS DISTINCT FROM OLD.projected_cost_cents
    OR NEW.projected_margin_percent IS DISTINCT FROM OLD.projected_margin_percent;

  IF premise_changed THEN
    IF NEW.premises_version <> OLD.premises_version + 1 THEN
      RAISE EXCEPTION 'fin_scenario_premises_version_must_increment' USING ERRCODE = '23514';
    END IF;
    -- Alterar a premissa de um cenário aprovado retira a aprovação.
    IF OLD.status = 'aprovado' AND NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'fin_scenario_premise_change_drops_approval' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'aprovado' AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'fin_scenario_revision_must_not_change_status' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.premises_version <> OLD.premises_version THEN
      RAISE EXCEPTION 'fin_scenario_premises_version_immutable_without_change' USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'rascunho' AND NEW.status IN ('em_revisao','arquivado'))
      OR (OLD.status = 'em_revisao' AND NEW.status IN ('aprovado','rejeitado','rascunho','arquivado'))
      OR (OLD.status = 'aprovado' AND NEW.status = 'arquivado')
      OR (OLD.status = 'rejeitado' AND NEW.status IN ('rascunho','arquivado'))
    ) THEN
      RAISE EXCEPTION 'fin_scenario_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;
  -- Atualizar valores REALIZADOS nunca altera aprovação nem versão de
  -- premissas: realizado é fato registrado, não premissa revisada.
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin13_guard_scenario_write ON fin_budget_scenarios;
CREATE TRIGGER trg_fin13_guard_scenario_write
  BEFORE INSERT OR UPDATE ON fin_budget_scenarios
  FOR EACH ROW EXECUTE FUNCTION fin13_guard_scenario_write();

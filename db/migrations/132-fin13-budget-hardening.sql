-- FIN-13: hardening aditivo do orçamento gerencial e dos cenários de expansão.
--
-- Princípios aplicados nesta migração (somente aditiva; nenhuma migração
-- histórica é alterada e nenhum tipo existente é modificado — os enums
-- fin_budget_status e fin_scenario_type vêm de 080 e já bastam):
--   * o orçamento é uma ESTIMATIVA declarada: is_estimate fica travado em
--     true e o aviso de premissas/estimativa é obrigatório no próprio texto;
--   * promessa de resultado é recusada pelo banco em qualquer campo textual
--     (garantia de resultado, retorno garantido, "prometemos", "sem risco"…);
--   * premissas são obrigatórias e estruturadas: além do texto, a coluna
--     assumptions exige uma lista de itens {premissa, fonte};
--   * o estado percorre rascunho -> em_revisao -> aprovado | rejeitado, e
--     aprovado/rejeitado/rascunho -> arquivado; nenhum atalho é aceito;
--   * aprovação é auditada: exige aprovador E data, e o aprovador não pode
--     ser o autor do orçamento;
--   * enviar para revisão exige cenários explícitos (base + alternativa);
--   * o conteúdo do orçamento é imutável: depois de criado, a única mudança
--     possível é a transição de estado — revisão e aprovação viram histórico;
--   * cenário é imutável, só nasce enquanto o orçamento é rascunho, carrega
--     premissas explícitas e tem a MARGEM PROJETADA CALCULADA PELO BANCO;
--   * histórico imutável em fin_budget_history.

-- ---------------------------------------------------------------------------
-- Detector de promessa de resultado (usado por orçamento e cenário)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin13_promises_result(value TEXT) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT value IS NOT NULL AND value ~* '(garantimos|prometemos|\mprometo\M|\mprometido\M|garantia de resultado|resultado garantido|resultados garantidos|lucro garantido|retorno garantido|ganho garantido|rentabilidade garantida|margem garantida|receita garantida|faturamento garantido|sem risco|risco zero|resultado assegurado|assegura o resultado|asseguramos o resultado)';
$$;

-- ---------------------------------------------------------------------------
-- Histórico imutável de revisões/aprovações de orçamento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_budget_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('budget','scenario')),
  entity_id UUID NOT NULL,
  budget_id UUID REFERENCES fin_budgets(id) ON DELETE RESTRICT,
  previous_status TEXT,
  next_status TEXT NOT NULL CHECK (char_length(next_status) BETWEEN 3 AND 50),
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_budget_history_entity_idx ON fin_budget_history(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fin_budget_history_budget_idx ON fin_budget_history(budget_id, created_at DESC);

CREATE OR REPLACE FUNCTION fin_budget_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_budget_history_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_budget_history_immutable ON fin_budget_history;
CREATE TRIGGER trg_fin_budget_history_immutable
  BEFORE UPDATE OR DELETE ON fin_budget_history
  FOR EACH ROW EXECUTE FUNCTION fin_budget_history_immutable();

-- ---------------------------------------------------------------------------
-- Orçamento: protocolo, premissas obrigatórias, travas de status e aprovação
-- auditada
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budgets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS fin_budgets_idempotency_key
  ON fin_budgets(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserva linhas do rascunho 080, mas as regras valem integralmente
-- para toda escrita nova e para toda alteração.
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin13_budget_protocol_format
  CHECK (protocol ~ '^ORC-FIN-[0-9]{8}-[A-Z0-9]{4}$') NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin13_budget_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 10 AND 200) NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin13_budget_premises_required
  CHECK (char_length(trim(premises)) >= 30 AND jsonb_typeof(assumptions) = 'array' AND jsonb_array_length(assumptions) >= 2) NOT VALID;
-- Estimativa declarada: o aviso precisa dizer que é estimativa E que não se
-- promete resultado.
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin13_budget_estimate_locked
  CHECK (is_estimate = true AND estimate_note ILIKE '%estimativa%' AND estimate_note ILIKE '%não prometer resultado%') NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin13_budget_totals_required
  CHECK (total_revenue_cents IS NOT NULL AND total_revenue_cents > 0 AND total_cost_cents IS NOT NULL AND total_cost_cents >= 0) NOT VALID;
ALTER TABLE fin_budgets
  ADD CONSTRAINT fin13_budget_state_fields
  CHECK (
    (status = 'rascunho' AND submitted_at IS NULL AND submitted_by_identity IS NULL
      AND approved_by_identity IS NULL AND approved_at IS NULL
      AND rejected_by_identity IS NULL AND rejected_at IS NULL
      AND archived_by_identity IS NULL AND archived_at IS NULL AND decision_reason IS NULL)
    OR (status = 'em_revisao' AND submitted_at IS NOT NULL AND submitted_by_identity IS NOT NULL
      AND approved_by_identity IS NULL AND approved_at IS NULL
      AND rejected_by_identity IS NULL AND rejected_at IS NULL
      AND archived_by_identity IS NULL AND archived_at IS NULL)
    OR (status = 'aprovado' AND submitted_at IS NOT NULL AND submitted_by_identity IS NOT NULL
      AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL AND decision_reason IS NOT NULL
      AND rejected_by_identity IS NULL AND rejected_at IS NULL
      AND archived_by_identity IS NULL AND archived_at IS NULL)
    OR (status = 'rejeitado' AND submitted_at IS NOT NULL AND submitted_by_identity IS NOT NULL
      AND rejected_by_identity IS NOT NULL AND rejected_at IS NOT NULL AND decision_reason IS NOT NULL
      AND approved_by_identity IS NULL AND approved_at IS NULL
      AND archived_by_identity IS NULL AND archived_at IS NULL)
    OR (status = 'arquivado' AND archived_by_identity IS NOT NULL AND archived_at IS NOT NULL AND decision_reason IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin13_guard_budget_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  item JSONB;
  scenario_total INT;
  scenario_base INT;
BEGIN
  IF NEW.is_estimate IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'fin13_budget_is_estimate_locked' USING ERRCODE = '23514';
  END IF;
  IF NEW.estimate_note IS NULL OR NEW.estimate_note NOT ILIKE '%estimativa%' OR NEW.estimate_note NOT ILIKE '%não prometer resultado%' THEN
    RAISE EXCEPTION 'fin13_budget_estimate_note_required' USING ERRCODE = '23514';
  END IF;
  -- Nenhum campo textual pode prometer resultado.
  IF fin13_promises_result(NEW.title) OR fin13_promises_result(NEW.description)
     OR fin13_promises_result(NEW.premises) OR fin13_promises_result(NEW.decision_reason) THEN
    RAISE EXCEPTION 'fin13_budget_result_promise_refused' USING ERRCODE = '23514';
  END IF;
  -- Premissas explícitas e estruturadas.
  IF jsonb_typeof(NEW.assumptions) <> 'array' OR jsonb_array_length(NEW.assumptions) < 2 THEN
    RAISE EXCEPTION 'fin13_budget_assumptions_required' USING ERRCODE = '23514';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.assumptions) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR COALESCE(jsonb_typeof(item->'premissa'),'') <> 'string'
       OR COALESCE(jsonb_typeof(item->'fonte'),'') <> 'string'
       OR char_length(item->>'premissa') < 10 OR char_length(item->>'premissa') > 500
       OR char_length(item->>'fonte') < 3 OR char_length(item->>'fonte') > 200
       OR fin13_promises_result(item->>'premissa') THEN
      RAISE EXCEPTION 'fin13_budget_assumption_item_invalid' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'fin13_budget_initial_status_must_be_rascunho' USING ERRCODE = '23514';
    END IF;
    IF NEW.created_by_identity IS NULL THEN
      RAISE EXCEPTION 'fin13_budget_author_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.submitted_at IS NOT NULL OR NEW.submitted_by_identity IS NOT NULL
       OR NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL
       OR NEW.rejected_by_identity IS NOT NULL OR NEW.rejected_at IS NOT NULL
       OR NEW.archived_by_identity IS NOT NULL OR NEW.archived_at IS NOT NULL
       OR NEW.decision_reason IS NOT NULL THEN
      RAISE EXCEPTION 'fin13_budget_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- O conteúdo do orçamento é imutável: a única mudança é de estado.
  IF NEW.id <> OLD.id OR NEW.protocol <> OLD.protocol OR NEW.title <> OLD.title
     OR NEW.description <> OLD.description OR NEW.premises <> OLD.premises
     OR NEW.assumptions::text <> OLD.assumptions::text
     OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end
     OR NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents
     OR NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.estimate_note <> OLD.estimate_note
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity THEN
    RAISE EXCEPTION 'fin13_budget_content_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'fin13_budget_status_transition_required' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD.status = 'rascunho' AND NEW.status IN ('em_revisao','arquivado'))
    OR (OLD.status = 'em_revisao' AND NEW.status IN ('aprovado','rejeitado'))
    OR (OLD.status IN ('aprovado','rejeitado') AND NEW.status = 'arquivado')
  ) THEN
    RAISE EXCEPTION 'fin13_budget_invalid_status_transition' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'em_revisao' THEN
    IF NEW.submitted_at IS NULL OR NEW.submitted_by_identity IS NULL THEN
      RAISE EXCEPTION 'fin13_budget_review_requires_submitter' USING ERRCODE = '23514';
    END IF;
    -- Revisão sem cenário explícito não existe: base + alternativa.
    SELECT count(*), count(*) FILTER (WHERE scenario_type = 'base')
      INTO scenario_total, scenario_base
      FROM fin_budget_scenarios WHERE budget_id = NEW.id;
    IF scenario_total < 2 OR scenario_base < 1 THEN
      RAISE EXCEPTION 'fin13_budget_review_requires_scenarios' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'aprovado' THEN
    IF NEW.approved_by_identity IS NULL OR NEW.approved_at IS NULL
       OR NEW.decision_reason IS NULL OR char_length(trim(NEW.decision_reason)) < 10 THEN
      RAISE EXCEPTION 'fin13_budget_approval_requires_approver_and_date' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by_identity = NEW.created_by_identity THEN
      RAISE EXCEPTION 'fin13_budget_approver_must_differ_from_author' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'rejeitado' THEN
    IF NEW.rejected_by_identity IS NULL OR NEW.rejected_at IS NULL
       OR NEW.decision_reason IS NULL OR char_length(trim(NEW.decision_reason)) < 10 THEN
      RAISE EXCEPTION 'fin13_budget_rejection_requires_reviewer_and_reason' USING ERRCODE = '23514';
    END IF;
    IF NEW.rejected_by_identity = NEW.created_by_identity THEN
      RAISE EXCEPTION 'fin13_budget_approver_must_differ_from_author' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'arquivado' THEN
    IF NEW.archived_by_identity IS NULL OR NEW.archived_at IS NULL
       OR NEW.decision_reason IS NULL OR char_length(trim(NEW.decision_reason)) < 10 THEN
      RAISE EXCEPTION 'fin13_budget_archive_requires_reason' USING ERRCODE = '23514';
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
-- Cenários vinculados: premissas explícitas e margem projetada calculada
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budget_scenarios
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expansion_investment_cents BIGINT,
  ADD COLUMN IF NOT EXISTS margin_formula TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_budget_scenarios_idempotency_key
  ON fin_budget_scenarios(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin13_scenario_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 10 AND 200) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin13_scenario_premises_required
  CHECK (char_length(trim(premises)) >= 30 AND jsonb_typeof(assumptions) = 'array' AND jsonb_array_length(assumptions) >= 2) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin13_scenario_amounts_required
  CHECK (projected_revenue_cents IS NOT NULL AND projected_revenue_cents > 0 AND projected_cost_cents IS NOT NULL AND projected_cost_cents >= 0) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin13_scenario_margin_calculated
  CHECK (projected_margin_percent IS NOT NULL AND margin_formula IS NOT NULL) NOT VALID;
-- Cenário de expansão declara o investimento que sustenta a premissa.
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin13_scenario_expansion_investment
  CHECK (
    (scenario_type = 'expansao' AND expansion_investment_cents IS NOT NULL AND expansion_investment_cents > 0)
    OR (scenario_type <> 'expansao' AND expansion_investment_cents IS NULL)
  ) NOT VALID;
ALTER TABLE fin_budget_scenarios
  ADD CONSTRAINT fin13_scenario_estimate_locked
  CHECK (is_estimate = true AND estimate_note ILIKE '%estimativa%' AND estimate_note ILIKE '%não prometer resultado%') NOT VALID;

CREATE OR REPLACE FUNCTION fin13_guard_scenario_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  item JSONB;
  budget_row fin_budgets%ROWTYPE;
  margin NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- O cenário é parte da evidência da revisão: nasce e não muda.
    RAISE EXCEPTION 'fin13_scenario_immutable' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO budget_row FROM fin_budgets WHERE id = NEW.budget_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin13_scenario_budget_required' USING ERRCODE = '23514';
  END IF;
  IF budget_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'fin13_scenario_budget_must_be_rascunho' USING ERRCODE = '23514';
  END IF;

  IF NEW.is_estimate IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'fin13_scenario_is_estimate_locked' USING ERRCODE = '23514';
  END IF;
  IF NEW.estimate_note IS NULL OR NEW.estimate_note NOT ILIKE '%estimativa%' OR NEW.estimate_note NOT ILIKE '%não prometer resultado%' THEN
    RAISE EXCEPTION 'fin13_scenario_estimate_note_required' USING ERRCODE = '23514';
  END IF;
  IF fin13_promises_result(NEW.title) OR fin13_promises_result(NEW.premises) THEN
    RAISE EXCEPTION 'fin13_scenario_result_promise_refused' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.assumptions) <> 'array' OR jsonb_array_length(NEW.assumptions) < 2 THEN
    RAISE EXCEPTION 'fin13_scenario_assumptions_required' USING ERRCODE = '23514';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.assumptions) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR COALESCE(jsonb_typeof(item->'premissa'),'') <> 'string'
       OR COALESCE(jsonb_typeof(item->'fonte'),'') <> 'string'
       OR char_length(item->>'premissa') < 10 OR char_length(item->>'premissa') > 500
       OR char_length(item->>'fonte') < 3 OR char_length(item->>'fonte') > 200
       OR fin13_promises_result(item->>'premissa') THEN
      RAISE EXCEPTION 'fin13_scenario_assumption_item_invalid' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF NEW.projected_revenue_cents IS NULL OR NEW.projected_revenue_cents <= 0
     OR NEW.projected_cost_cents IS NULL OR NEW.projected_cost_cents < 0 THEN
    RAISE EXCEPTION 'fin13_scenario_amounts_required' USING ERRCODE = '23514';
  END IF;

  -- A margem projetada é CALCULADA pelo banco; o cliente não a declara.
  margin := round(((NEW.projected_revenue_cents - NEW.projected_cost_cents)::numeric * 100)
                  / NEW.projected_revenue_cents::numeric, 2);
  IF margin < -100 OR margin > 100 THEN
    RAISE EXCEPTION 'fin13_scenario_margin_out_of_range' USING ERRCODE = '23514';
  END IF;
  NEW.projected_margin_percent := margin;
  NEW.margin_formula := 'margem_projetada_percent = (receita_projetada - custo_projetado) * 100 / receita_projetada';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin13_guard_scenario_write ON fin_budget_scenarios;
CREATE TRIGGER trg_fin13_guard_scenario_write
  BEFORE INSERT OR UPDATE ON fin_budget_scenarios
  FOR EACH ROW EXECUTE FUNCTION fin13_guard_scenario_write();

-- Cenário só pode ser removido enquanto o orçamento ainda é rascunho.
CREATE OR REPLACE FUNCTION fin13_guard_scenario_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE budget_status TEXT;
BEGIN
  SELECT status::text INTO budget_status FROM fin_budgets WHERE id = OLD.budget_id;
  IF budget_status IS NOT NULL AND budget_status <> 'rascunho' THEN
    RAISE EXCEPTION 'fin13_scenario_locked_after_review' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin13_guard_scenario_delete ON fin_budget_scenarios;
CREATE TRIGGER trg_fin13_guard_scenario_delete
  BEFORE DELETE ON fin_budget_scenarios
  FOR EACH ROW EXECUTE FUNCTION fin13_guard_scenario_delete();

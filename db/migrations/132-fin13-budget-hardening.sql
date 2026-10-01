-- FIN-13: hardening aditivo do orçamento gerencial e cenários.
-- Não altera migrações históricas nem tipos existentes. Todo resultado é
-- estimativa baseada em premissas explícitas; o sistema não promete resultado.

ALTER TABLE fin_budgets
  ADD CONSTRAINT fin_budget_estimate_only_check
    CHECK (is_estimate = true) NOT VALID,
  ADD CONSTRAINT fin_budget_estimate_warning_check
    CHECK (
      lower(estimate_note) LIKE '%premiss%' AND
      lower(estimate_note) LIKE '%estimativ%' AND
      lower(estimate_note) LIKE '%não prometer resultado%'
    ) NOT VALID;

ALTER TABLE fin_budget_scenarios
  ADD COLUMN IF NOT EXISTS projected_margin_percent_calculated NUMERIC(7,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN projected_revenue_cents IS NULL
          OR projected_cost_cents IS NULL
          OR projected_revenue_cents = 0
        THEN NULL
        ELSE ROUND(
          ((projected_revenue_cents - projected_cost_cents)::NUMERIC * 100)
          / projected_revenue_cents,
          2
        )
      END
    ) STORED,
  ADD CONSTRAINT fin_budget_scenario_estimate_only_check
    CHECK (is_estimate = true) NOT VALID,
  ADD CONSTRAINT fin_budget_scenario_estimate_warning_check
    CHECK (
      lower(estimate_note) LIKE '%premiss%' AND
      lower(estimate_note) LIKE '%estimativ%' AND
      lower(estimate_note) LIKE '%não prometer resultado%'
    ) NOT VALID,
  ADD CONSTRAINT fin_budget_scenario_margin_calculated_check
    CHECK (
      projected_margin_percent IS NULL
      AND projected_margin_percent_calculated IS NULL
      OR projected_margin_percent IS NOT NULL
      AND projected_margin_percent_calculated IS NOT NULL
      AND projected_margin_percent = projected_margin_percent_calculated
    ) NOT VALID;

CREATE TABLE IF NOT EXISTS fin_budget_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES fin_budgets(id) ON DELETE RESTRICT,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('criacao','revisao','mudanca_status','aprovacao')),
  previous_status fin_budget_status,
  next_status fin_budget_status NOT NULL,
  previous_title TEXT,
  next_title TEXT NOT NULL,
  previous_description TEXT,
  next_description TEXT NOT NULL,
  previous_premises TEXT,
  next_premises TEXT NOT NULL,
  previous_period_start DATE,
  next_period_start DATE NOT NULL,
  previous_period_end DATE,
  next_period_end DATE NOT NULL,
  previous_revenue_cents BIGINT,
  next_revenue_cents BIGINT,
  previous_cost_cents BIGINT,
  next_cost_cents BIGINT,
  previous_margin_cents BIGINT,
  next_margin_cents BIGINT,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (budget_id, revision_no)
);
CREATE INDEX IF NOT EXISTS fin_budget_history_budget_idx
  ON fin_budget_history (budget_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS fin_budget_history_created_idx
  ON fin_budget_history (created_at DESC);

CREATE OR REPLACE FUNCTION fin_budget_capture_history() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  next_revision INTEGER;
  actor UUID;
  change_reason TEXT;
  event_kind TEXT;
BEGIN
  SELECT COALESCE(MAX(revision_no), 0) + 1
    INTO next_revision
    FROM fin_budget_history
   WHERE budget_id = NEW.id;

  actor := NULLIF(current_setting('fin.budget_actor', true), '')::UUID;
  change_reason := NULLIF(current_setting('fin.budget_reason', true), '');
  change_reason := COALESCE(
    change_reason,
    CASE WHEN TG_OP = 'INSERT'
      THEN 'Orçamento gerencial criado com premissas explícitas e estimativa.'
      ELSE 'Revisão de orçamento registrada com premissas explícitas.'
    END
  );
  event_kind := CASE
    WHEN TG_OP = 'INSERT' THEN 'criacao'
    WHEN NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN 'aprovacao'
    WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'mudanca_status'
    ELSE 'revisao'
  END;

  INSERT INTO fin_budget_history (
    budget_id, revision_no, event_type,
    previous_status, next_status,
    previous_title, next_title,
    previous_description, next_description,
    previous_premises, next_premises,
    previous_period_start, next_period_start,
    previous_period_end, next_period_end,
    previous_revenue_cents, next_revenue_cents,
    previous_cost_cents, next_cost_cents,
    previous_margin_cents, next_margin_cents,
    approved_by_identity, approved_at,
    changed_by_identity, reason
  ) VALUES (
    NEW.id, next_revision, event_kind,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.title END, NEW.title,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.description END, NEW.description,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.premises END, NEW.premises,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.period_start END, NEW.period_start,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.period_end END, NEW.period_end,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.total_revenue_cents END, NEW.total_revenue_cents,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.total_cost_cents END, NEW.total_cost_cents,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.total_margin_cents END, NEW.total_margin_cents,
    NEW.approved_by_identity, NEW.approved_at,
    COALESCE(actor, NEW.approved_by_identity, NEW.created_by_identity), change_reason
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_budget_capture_history ON fin_budgets;
CREATE TRIGGER trg_fin_budget_capture_history
  AFTER INSERT OR UPDATE ON fin_budgets
  FOR EACH ROW EXECUTE FUNCTION fin_budget_capture_history();

CREATE OR REPLACE FUNCTION fin_budget_guard_update() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_estimate IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'fin_budget_estimate_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'rascunho' AND NEW.status = 'em_revisao') OR
      (OLD.status = 'em_revisao' AND NEW.status IN ('aprovado','rejeitado','arquivado')) OR
      (OLD.status IN ('aprovado','rejeitado') AND NEW.status = 'arquivado')
    ) THEN
      RAISE EXCEPTION 'fin_budget_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'aprovado'
     AND (NEW.approved_by_identity IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'fin_budget_approval_audit_required' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('aprovado','rejeitado','arquivado') AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.premises IS DISTINCT FROM OLD.premises OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents OR
    NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents
  ) THEN
    RAISE EXCEPTION 'fin_budget_approved_revision_locked' USING ERRCODE = '23514';
  END IF;
  IF NEW.estimate_note IS DISTINCT FROM OLD.estimate_note
     AND (
       lower(NEW.estimate_note) NOT LIKE '%premiss%' OR
       lower(NEW.estimate_note) NOT LIKE '%estimativ%' OR
       lower(NEW.estimate_note) NOT LIKE '%não prometer resultado%'
     ) THEN
    RAISE EXCEPTION 'fin_budget_estimate_warning_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_budget_guard_update ON fin_budgets;
CREATE TRIGGER trg_fin_budget_guard_update
  BEFORE UPDATE ON fin_budgets
  FOR EACH ROW EXECUTE FUNCTION fin_budget_guard_update();

CREATE OR REPLACE FUNCTION fin_budget_history_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fin_budget_history_immutable';
END;
$$;
DROP TRIGGER IF EXISTS trg_fin_budget_history_immutable ON fin_budget_history;
CREATE TRIGGER trg_fin_budget_history_immutable
  BEFORE UPDATE OR DELETE ON fin_budget_history
  FOR EACH ROW EXECUTE FUNCTION fin_budget_history_immutable();

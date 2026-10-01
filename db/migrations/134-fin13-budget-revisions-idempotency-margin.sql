-- FIN-13: revisão explícita, snapshots, idempotência e margem calculada.
-- A migração é aditiva: 001–133 permanecem imutáveis e registros históricos
-- não recebem autoria ou cálculo retroativo inventados.

ALTER TABLE fin_budgets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS budget_version INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fin_budget_version_positive'
  ) THEN
    ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_version_positive
      CHECK (budget_version > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fin_budget_idempotency_key_format'
  ) THEN
    ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_idempotency_key_format
      CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,200}$') NOT VALID;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS fin_budgets_idempotency_key_uidx
  ON fin_budgets(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE fin_budget_history
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS version_before INTEGER,
  ADD COLUMN IF NOT EXISTS version_after INTEGER,
  ADD COLUMN IF NOT EXISTS previous_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS next_snapshot JSONB;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fin_budget_history_event_type_valid'
  ) THEN
    -- NULL is retained for rows written by migration 132. They are historical
    -- records without enough information to classify a complete event.
    ALTER TABLE fin_budget_history ADD CONSTRAINT fin_budget_history_event_type_valid
      CHECK (event_type IS NULL OR event_type IN ('creation','edit','status_change','revision')) NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS fin_budget_history_event_type_idx
  ON fin_budget_history(budget_id, event_type, changed_at DESC);

-- The old column is retained as the response field, but is now written by the
-- database from the two cents columns. A wide numeric range also represents a
-- loss below -100% instead of rejecting a mathematically valid result.
ALTER TABLE fin_budget_scenarios
  DROP CONSTRAINT IF EXISTS fin_budget_scenarios_projected_margin_percent_check;
ALTER TABLE fin_budget_scenarios
  ALTER COLUMN projected_margin_percent TYPE NUMERIC(20,2);
ALTER TABLE fin_budget_scenarios
  ADD COLUMN IF NOT EXISTS projected_margin_status TEXT,
  ADD COLUMN IF NOT EXISTS projected_margin_reason TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fin_scenario_margin_status_valid'
  ) THEN
    ALTER TABLE fin_budget_scenarios ADD CONSTRAINT fin_scenario_margin_status_valid
      CHECK (
        projected_margin_status IS NULL OR projected_margin_status IN
          ('calculada','incompleta','receita_zero','legado_nao_verificado')
      ) NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS fin_budget_scenarios_margin_status_idx
  ON fin_budget_scenarios(projected_margin_status);

CREATE OR REPLACE FUNCTION fin_scenario_margin_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.projected_revenue_cents IS NULL AND NEW.projected_cost_cents IS NULL THEN
    NEW.projected_margin_percent := NULL;
    NEW.projected_margin_status := 'incompleta';
    NEW.projected_margin_reason := 'receita_e_custo_ausentes';
  ELSIF NEW.projected_revenue_cents IS NULL THEN
    NEW.projected_margin_percent := NULL;
    NEW.projected_margin_status := 'incompleta';
    NEW.projected_margin_reason := 'receita_ausente';
  ELSIF NEW.projected_cost_cents IS NULL THEN
    NEW.projected_margin_percent := NULL;
    NEW.projected_margin_status := 'incompleta';
    NEW.projected_margin_reason := 'custo_ausente';
  ELSIF NEW.projected_revenue_cents = 0 THEN
    NEW.projected_margin_percent := NULL;
    NEW.projected_margin_status := 'receita_zero';
    NEW.projected_margin_reason := 'receita_zero_sem_percentual_definido';
  ELSE
    NEW.projected_margin_percent := ROUND(
      ((NEW.projected_revenue_cents::NUMERIC - NEW.projected_cost_cents::NUMERIC) * 100)
      / NEW.projected_revenue_cents::NUMERIC, 2
    );
    NEW.projected_margin_status := 'calculada';
    NEW.projected_margin_reason := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_scenario_margin_guard ON fin_budget_scenarios;
CREATE TRIGGER trg_fin_scenario_margin_guard
  BEFORE INSERT OR UPDATE OF projected_revenue_cents, projected_cost_cents, projected_margin_percent
  ON fin_budget_scenarios FOR EACH ROW EXECUTE FUNCTION fin_scenario_margin_guard();

CREATE OR REPLACE FUNCTION fin_budget_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  revision_mode BOOLEAN := current_setting('fin.budget_revision', true) = 'on';
  content_changed BOOLEAN := TG_OP = 'UPDATE' AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.premises IS DISTINCT FROM OLD.premises OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents OR
    NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents
  );
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key THEN
    RAISE EXCEPTION 'fin_budget_idempotency_key_immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status AND NOT (
    (OLD.status='rascunho' AND NEW.status='em_revisao') OR
    (OLD.status='em_revisao' AND NEW.status IN ('aprovado','rejeitado')) OR
    (OLD.status='aprovado' AND NEW.status IN ('arquivado','em_revisao')) OR
    (OLD.status='rejeitado' AND NEW.status='arquivado')
  ) THEN
    RAISE EXCEPTION 'fin_budget_invalid_transition';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' AND content_changed AND NOT revision_mode THEN
    RAISE EXCEPTION 'fin_budget_approved_requires_revision';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' AND NEW.status = 'em_revisao' AND NOT revision_mode THEN
    RAISE EXCEPTION 'fin_budget_approved_requires_revision';
  END IF;
  IF revision_mode AND TG_OP = 'UPDATE' AND NOT (OLD.status = 'aprovado' AND NEW.status = 'em_revisao') THEN
    RAISE EXCEPTION 'fin_budget_revision_requires_approved_source';
  END IF;
  IF NEW.status = 'em_revisao' THEN
    NEW.approved_by_identity := NULL;
    NEW.approved_at := NULL;
  END IF;
  IF NEW.status = 'aprovado' AND (NEW.approved_by_identity IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'fin_budget_approval_requires_auditor';
  END IF;
  NEW.is_estimate := true;
  NEW.estimate_note := CASE WHEN NEW.estimate_note ILIKE '%não prometer%' THEN NEW.estimate_note
    ELSE 'estimativa com premissas explícitas; não prometer resultado' END;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fin_budget_history_capture() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_text TEXT := NULLIF(current_setting('fin.budget_actor', true), '');
  reason_text TEXT := NULLIF(current_setting('fin.budget_reason', true), '');
  revision_mode BOOLEAN := current_setting('fin.budget_revision', true) = 'on';
  event_name TEXT;
BEGIN
  IF actor_text IS NULL OR actor_text !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'fin_budget_audit_actor_required';
  END IF;
  IF reason_text IS NULL OR char_length(reason_text) < 10 OR char_length(reason_text) > 1000 THEN
    RAISE EXCEPTION 'fin_budget_audit_reason_required';
  END IF;
  event_name := CASE
    WHEN TG_OP = 'INSERT' THEN 'creation'
    WHEN revision_mode THEN 'revision'
    WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change'
    ELSE 'edit'
  END;
  INSERT INTO fin_budget_history(
    budget_id, previous_status, next_status, changed_by_identity, changed_at,
    reason, metadata, event_type, version_before, version_after,
    previous_snapshot, next_snapshot
  ) VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    actor_text::uuid,
    NOW(),
    reason_text,
    jsonb_build_object('estimate', true, 'revision', revision_mode),
    event_name,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.budget_version END,
    NEW.budget_version,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fin_budget_history_capture ON fin_budgets;
CREATE TRIGGER trg_fin_budget_history_capture
  AFTER INSERT OR UPDATE ON fin_budgets FOR EACH ROW EXECUTE FUNCTION fin_budget_history_capture();

-- New writes must identify the actor and preserve monotonic versions. Existing
-- rows remain untouched and keep their incomplete historical evidence.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fin_budget_version_transition_valid'
  ) THEN
    ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_version_transition_valid
      CHECK (budget_version > 0) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fin_budget_revision_context_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  revision_mode BOOLEAN := current_setting('fin.budget_revision', true) = 'on';
  content_changed BOOLEAN := TG_OP = 'UPDATE' AND (
    NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR
    NEW.premises IS DISTINCT FROM OLD.premises OR NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents OR
    NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents
  );
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' AND content_changed AND NOT revision_mode THEN
    RAISE EXCEPTION 'fin_budget_approved_requires_revision';
  END IF;
  IF TG_OP = 'UPDATE' AND content_changed AND NEW.budget_version <= OLD.budget_version THEN
    RAISE EXCEPTION 'fin_budget_version_must_increment';
  END IF;
  IF revision_mode AND NOT (TG_OP = 'UPDATE' AND OLD.status = 'aprovado' AND NEW.status = 'em_revisao') THEN
    RAISE EXCEPTION 'fin_budget_revision_requires_approved_source';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_budget_revision_context_guard ON fin_budgets;
CREATE TRIGGER trg_fin_budget_revision_context_guard
  BEFORE INSERT OR UPDATE ON fin_budgets FOR EACH ROW EXECUTE FUNCTION fin_budget_revision_context_guard();

-- EXT-06 — satisfação/carteira sobre a fonte canônica CLI-11.
-- Aditiva sobre 001–151. ext_satisfaction_surveys permanece legado, sem writer.
-- Linhas antigas de CLI-11 ficam registro_legado; nenhuma autoria/destinatário é inventado.
-- PostgreSQL exige que o novo valor de enum seja confirmado antes de uso.
ALTER TYPE cli_satisfaction_status ADD VALUE IF NOT EXISTS 'cancelada';
BEGIN;

ALTER TABLE cli_satisfaction_surveys
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS methodology TEXT,
  ADD COLUMN IF NOT EXISTS methodology_source TEXT,
  ADD COLUMN IF NOT EXISTS scale_min INTEGER,
  ADD COLUMN IF NOT EXISTS scale_max INTEGER,
  ADD COLUMN IF NOT EXISTS classification_rule JSONB,
  ADD COLUMN IF NOT EXISTS follow_up_operator TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_threshold INTEGER,
  ADD COLUMN IF NOT EXISTS reference_start DATE,
  ADD COLUMN IF NOT EXISTS reference_end DATE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_ext06_origin_check
  CHECK (origin IN ('registro_legado','ext06_canonica')) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_ext06_method_check
  CHECK (origin <> 'ext06_canonica' OR (
    char_length(purpose) BETWEEN 5 AND 500 AND methodology IN ('generica','nps','csat')
    AND char_length(methodology_source) BETWEEN 5 AND 500
    AND scale_min IS NOT NULL AND scale_max IS NOT NULL AND scale_min < scale_max
    AND follow_up_operator='lte' AND follow_up_threshold BETWEEN scale_min AND scale_max
    AND target_identity_id IS NOT NULL AND created_by_identity IS NOT NULL
    AND (methodology <> 'nps' OR (scale_min=0 AND scale_max=10))
    AND (methodology <> 'csat' OR (scale_min=1 AND scale_max=5))
    AND ((reference_start IS NULL AND reference_end IS NULL) OR (reference_start IS NOT NULL AND reference_end >= reference_start))
  )) NOT VALID;
COMMENT ON TABLE ext_satisfaction_surveys IS 'LEGADO EXT-06 (085): preservado somente para leitura autorizada; autoridade de escrita aposentada pela migração 152.';
COMMENT ON TABLE cli_satisfaction_surveys IS 'Fonte canônica compartilhada CLI-11/EXT-06 a partir da migração 152; origin distingue registros históricos.';

CREATE TABLE cli_satisfaction_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL UNIQUE REFERENCES cli_satisfaction_surveys(id) ON DELETE RESTRICT,
  target_identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  responded_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  score INTEGER NOT NULL,
  feedback TEXT NOT NULL CHECK (char_length(feedback) BETWEEN 10 AND 2000),
  methodology_snapshot JSONB NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(responded_by_identity,idempotency_key)
);
CREATE INDEX cli_satisfaction_responses_survey_idx ON cli_satisfaction_responses(survey_id,responded_at DESC);

ALTER TABLE cli_satisfaction_action_plans
  ADD COLUMN IF NOT EXISTS response_id UUID REFERENCES cli_satisfaction_responses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS trigger_rule JSONB,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS completed_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS completion_result TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT;
CREATE UNIQUE INDEX cli_satisfaction_action_plans_response_unique ON cli_satisfaction_action_plans(response_id) WHERE response_id IS NOT NULL;
ALTER TABLE cli_satisfaction_action_plans ADD CONSTRAINT cli_satisfaction_action_terminal_shape CHECK (
 (status='aberta' AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL)
 OR (status='em_andamento' AND started_at IS NOT NULL AND started_by_identity IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
 OR (status='concluida' AND completed_at IS NOT NULL AND completed_by_identity IS NOT NULL AND char_length(completion_result) BETWEEN 10 AND 2000 AND cancelled_at IS NULL)
 OR (status='cancelada' AND cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL AND char_length(cancellation_justification) BETWEEN 10 AND 1000 AND completed_at IS NULL)
) NOT VALID;

CREATE TABLE cli_satisfaction_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 survey_id UUID NOT NULL REFERENCES cli_satisfaction_surveys(id) ON DELETE RESTRICT,
 response_id UUID REFERENCES cli_satisfaction_responses(id) ON DELETE RESTRICT,
 action_plan_id UUID REFERENCES cli_satisfaction_action_plans(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 100),
 payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff','client')),
 actor_identity_id UUID NOT NULL REFERENCES auth_identities(id),
 idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
 request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(actor_kind,actor_identity_id,idempotency_key)
);
CREATE INDEX cli_satisfaction_events_survey_idx ON cli_satisfaction_events(survey_id,created_at);

CREATE OR REPLACE FUNCTION cli_satisfaction_immutable() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'satisfaction historical record is immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cli_satisfaction_response_immutable BEFORE UPDATE OR DELETE ON cli_satisfaction_responses FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_immutable();
CREATE TRIGGER cli_satisfaction_event_immutable BEFORE UPDATE OR DELETE ON cli_satisfaction_events FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_immutable();

CREATE OR REPLACE FUNCTION cli_satisfaction_guard_survey() RETURNS TRIGGER AS $$ BEGIN
 IF OLD.origin='ext06_canonica' AND (NEW.client_account_id IS DISTINCT FROM OLD.client_account_id OR NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.visit_id IS DISTINCT FROM OLD.visit_id OR NEW.target_identity_id IS DISTINCT FROM OLD.target_identity_id OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.methodology IS DISTINCT FROM OLD.methodology OR NEW.methodology_source IS DISTINCT FROM OLD.methodology_source OR NEW.scale_min IS DISTINCT FROM OLD.scale_min OR NEW.scale_max IS DISTINCT FROM OLD.scale_max OR NEW.follow_up_operator IS DISTINCT FROM OLD.follow_up_operator OR NEW.follow_up_threshold IS DISTINCT FROM OLD.follow_up_threshold OR NEW.classification_rule IS DISTINCT FROM OLD.classification_rule) THEN RAISE EXCEPTION 'canonical satisfaction configuration is immutable'; END IF;
 IF OLD.status::text IN ('respondida','concluida') AND NEW.status::text='pendente' THEN RAISE EXCEPTION 'terminal satisfaction state cannot reopen silently'; END IF;
 IF OLD.score IS NOT NULL AND (NEW.score IS DISTINCT FROM OLD.score OR NEW.feedback IS DISTINCT FROM OLD.feedback OR NEW.responded_by_identity IS DISTINCT FROM OLD.responded_by_identity OR NEW.responded_at IS DISTINCT FROM OLD.responded_at) THEN RAISE EXCEPTION 'satisfaction response is immutable'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cli_satisfaction_guard_survey_trg BEFORE UPDATE ON cli_satisfaction_surveys FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_guard_survey();

CREATE OR REPLACE FUNCTION cli_satisfaction_guard_plan() RETURNS TRIGGER AS $$ BEGIN
 IF NEW.survey_id IS DISTINCT FROM OLD.survey_id OR NEW.response_id IS DISTINCT FROM OLD.response_id OR NEW.responsible_identity_id IS DISTINCT FROM OLD.responsible_identity_id OR NEW.action IS DISTINCT FROM OLD.action OR NEW.trigger_rule IS DISTINCT FROM OLD.trigger_rule OR NEW.facts_json IS DISTINCT FROM OLD.facts_json THEN RAISE EXCEPTION 'canonical satisfaction plan fields are immutable'; END IF;
 IF OLD.status='aberta' AND NEW.status NOT IN ('em_andamento','concluida','cancelada') THEN RAISE EXCEPTION 'invalid satisfaction plan transition'; END IF;
 IF OLD.status='em_andamento' AND NEW.status NOT IN ('concluida','cancelada') THEN RAISE EXCEPTION 'invalid satisfaction plan transition'; END IF;
 IF OLD.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'terminal satisfaction plan is immutable'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cli_satisfaction_guard_plan_trg BEFORE UPDATE ON cli_satisfaction_action_plans FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_guard_plan();
COMMIT;

-- EXT-05 — jornada interna canônica de qualidade.
-- Aditiva sobre 001–150; preserva linhas da 085 como registro_legado sem
-- atribuir autoria retroativa. Não há seed. Referências de evidência são apenas
-- declarações rastreáveis: esta migração não cria upload nem armazenamento.
BEGIN;

ALTER TABLE ext_quality_nonconformities
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS closing_verification_id UUID,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS reopen_justification TEXT;
ALTER TABLE ext_quality_nonconformities ADD CONSTRAINT ext_quality_nc_origin_check
  CHECK (origin IN ('registro_legado','jornada_canonica')) NOT VALID;
ALTER TABLE ext_quality_nonconformities ADD CONSTRAINT ext_quality_nc_canonical_identity_check
  CHECK (origin <> 'jornada_canonica' OR (created_by_identity IS NOT NULL AND responsible_identity IS NOT NULL)) NOT VALID;
ALTER TABLE ext_quality_nonconformities ADD CONSTRAINT ext_quality_nc_close_shape_check
  CHECK ((status::text <> 'encerrada' AND closed_at IS NULL AND closed_by_identity IS NULL AND closing_verification_id IS NULL)
      OR (status::text = 'encerrada' AND closed_at IS NOT NULL AND closed_by_identity IS NOT NULL AND closing_verification_id IS NOT NULL)) NOT VALID;
ALTER TABLE ext_quality_nonconformities ADD CONSTRAINT ext_quality_nc_reopen_shape_check
  CHECK ((status::text <> 'reaberta' AND reopened_at IS NULL AND reopened_by_identity IS NULL AND reopen_justification IS NULL)
      OR (status::text = 'reaberta' AND reopened_at IS NOT NULL AND reopened_by_identity IS NOT NULL AND char_length(reopen_justification) BETWEEN 10 AND 1000)) NOT VALID;
COMMENT ON COLUMN ext_quality_nonconformities.recurrence_count IS 'LEGADO 085: a API canônica ignora este contador; reincidência é derivada de ext_quality_recurrences.';

CREATE TABLE ext_quality_causes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id UUID NOT NULL REFERENCES ext_quality_nonconformities(id) ON DELETE RESTRICT,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  declared_source TEXT NOT NULL CHECK (char_length(declared_source) BETWEEN 3 AND 300),
  replaces_cause_id UUID REFERENCES ext_quality_causes(id) ON DELETE RESTRICT,
  replacement_reason TEXT CHECK (replacement_reason IS NULL OR char_length(replacement_reason) BETWEEN 10 AND 1000),
  registered_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((replaces_cause_id IS NULL AND replacement_reason IS NULL) OR (replaces_cause_id IS NOT NULL AND replacement_reason IS NOT NULL))
);
CREATE UNIQUE INDEX ext_quality_causes_replaced_once ON ext_quality_causes(replaces_cause_id) WHERE replaces_cause_id IS NOT NULL;
CREATE INDEX ext_quality_causes_nc_idx ON ext_quality_causes(nonconformity_id,registered_at DESC);

ALTER TABLE ext_quality_actions
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS due_date_source TEXT,
  ADD COLUMN IF NOT EXISTS due_date_base_date DATE,
  ADD COLUMN IF NOT EXISTS completed_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT;
ALTER TABLE ext_quality_actions ADD CONSTRAINT ext_quality_action_origin_check CHECK (origin IN ('registro_legado','jornada_canonica')) NOT VALID;
ALTER TABLE ext_quality_actions ADD CONSTRAINT ext_quality_action_canonical_check CHECK (origin <> 'jornada_canonica' OR (responsible_identity IS NOT NULL AND created_by_identity IS NOT NULL)) NOT VALID;
ALTER TABLE ext_quality_actions ADD CONSTRAINT ext_quality_action_due_source_check CHECK ((due_date IS NULL AND due_date_source IS NULL AND due_date_base_date IS NULL) OR (due_date IS NOT NULL AND char_length(due_date_source) BETWEEN 3 AND 300 AND due_date_base_date IS NOT NULL)) NOT VALID;
ALTER TABLE ext_quality_actions ADD CONSTRAINT ext_quality_action_terminal_check CHECK (
 (status='pendente' AND completed_recorded_at IS NULL AND completed_by_identity IS NULL AND cancelled_at IS NULL AND cancelled_by_identity IS NULL AND cancellation_justification IS NULL)
 OR (status='concluida' AND completed_recorded_at IS NOT NULL AND completed_by_identity IS NOT NULL AND cancelled_at IS NULL)
 OR (status='cancelada' AND cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL AND char_length(cancellation_justification) BETWEEN 10 AND 1000 AND completed_recorded_at IS NULL)
) NOT VALID;

CREATE TABLE ext_quality_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id UUID NOT NULL REFERENCES ext_quality_nonconformities(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK (outcome IN ('eficaz','ineficaz')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  evidence_type TEXT NOT NULL CHECK (char_length(evidence_type) BETWEEN 3 AND 100),
  evidence_reference TEXT NOT NULL CHECK (char_length(evidence_reference) BETWEEN 5 AND 1000),
  evidence_source TEXT NOT NULL CHECK (char_length(evidence_source) BETWEEN 3 AND 300),
  verified_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ext_quality_verifications_nc_idx ON ext_quality_verifications(nonconformity_id,verified_at DESC);
COMMENT ON COLUMN ext_quality_verifications.evidence_reference IS 'Referência declarada e rastreável; não comprova upload, recebimento, armazenamento ou conteúdo do arquivo.';

CREATE TABLE ext_quality_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id UUID NOT NULL REFERENCES ext_quality_nonconformities(id) ON DELETE RESTRICT,
  verification_id UUID NOT NULL REFERENCES ext_quality_verifications(id) ON DELETE RESTRICT,
  responsible_identity UUID NOT NULL REFERENCES auth_identities(id),
  closed_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closure_note TEXT NOT NULL CHECK (char_length(closure_note) BETWEEN 10 AND 1000)
);
CREATE INDEX ext_quality_closures_nc_idx ON ext_quality_closures(nonconformity_id,closed_at DESC);
ALTER TABLE ext_quality_nonconformities ADD CONSTRAINT ext_quality_nc_closing_verification_fk FOREIGN KEY(closing_verification_id) REFERENCES ext_quality_verifications(id) NOT VALID;

CREATE TABLE ext_quality_reopenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id UUID NOT NULL REFERENCES ext_quality_nonconformities(id) ON DELETE RESTRICT,
  closure_id UUID NOT NULL REFERENCES ext_quality_closures(id) ON DELETE RESTRICT,
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  reopened_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  reopened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ext_quality_recurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_nonconformity_id UUID NOT NULL REFERENCES ext_quality_nonconformities(id) ON DELETE RESTRICT,
  new_nonconformity_id UUID NOT NULL UNIQUE REFERENCES ext_quality_nonconformities(id) ON DELETE RESTRICT,
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  declared_criterion TEXT NOT NULL CHECK (char_length(declared_criterion) BETWEEN 5 AND 500),
  declared_source TEXT NOT NULL CHECK (char_length(declared_source) BETWEEN 3 AND 300),
  registered_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (predecessor_nonconformity_id <> new_nonconformity_id)
);
CREATE INDEX ext_quality_recurrences_predecessor_idx ON ext_quality_recurrences(predecessor_nonconformity_id,registered_at DESC);

CREATE TABLE ext_quality_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id UUID NOT NULL REFERENCES ext_quality_nonconformities(id) ON DELETE RESTRICT,
  action_id UUID REFERENCES ext_quality_actions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 100),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(created_by_identity,idempotency_key)
);
CREATE INDEX ext_quality_events_nc_idx ON ext_quality_events(nonconformity_id,created_at DESC);

CREATE OR REPLACE FUNCTION ext_quality_immutable_row() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'quality historical record is immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_quality_causes_immutable BEFORE UPDATE OR DELETE ON ext_quality_causes FOR EACH ROW EXECUTE FUNCTION ext_quality_immutable_row();
CREATE TRIGGER ext_quality_verifications_immutable BEFORE UPDATE OR DELETE ON ext_quality_verifications FOR EACH ROW EXECUTE FUNCTION ext_quality_immutable_row();
CREATE TRIGGER ext_quality_closures_immutable BEFORE UPDATE OR DELETE ON ext_quality_closures FOR EACH ROW EXECUTE FUNCTION ext_quality_immutable_row();
CREATE TRIGGER ext_quality_reopenings_immutable BEFORE UPDATE OR DELETE ON ext_quality_reopenings FOR EACH ROW EXECUTE FUNCTION ext_quality_immutable_row();
CREATE TRIGGER ext_quality_recurrences_immutable BEFORE UPDATE OR DELETE ON ext_quality_recurrences FOR EACH ROW EXECUTE FUNCTION ext_quality_immutable_row();
CREATE TRIGGER ext_quality_events_immutable BEFORE UPDATE OR DELETE ON ext_quality_events FOR EACH ROW EXECUTE FUNCTION ext_quality_immutable_row();

CREATE OR REPLACE FUNCTION ext_quality_guard_action_update() RETURNS TRIGGER AS $$ BEGIN
 IF OLD.origin='jornada_canonica' AND (NEW.nonconformity_id IS DISTINCT FROM OLD.nonconformity_id OR NEW.description IS DISTINCT FROM OLD.description OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.due_date_source IS DISTINCT FROM OLD.due_date_source OR NEW.due_date_base_date IS DISTINCT FROM OLD.due_date_base_date) THEN RAISE EXCEPTION 'canonical quality action fields are immutable'; END IF;
 IF OLD.status <> NEW.status AND NOT (OLD.status='pendente' AND NEW.status IN ('concluida','cancelada')) THEN RAISE EXCEPTION 'invalid quality action transition'; END IF;
 IF OLD.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'terminal quality action is immutable'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_quality_guard_action_update_trg BEFORE UPDATE ON ext_quality_actions FOR EACH ROW EXECUTE FUNCTION ext_quality_guard_action_update();

CREATE OR REPLACE FUNCTION ext_quality_guard_nc_update() RETURNS TRIGGER AS $$
DECLARE allowed BOOLEAN; causes INT; done_actions INT; pending_actions INT; valid_verification INT;
BEGIN
 IF OLD.origin='jornada_canonica' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.category IS DISTINCT FROM OLD.category OR NEW.severity IS DISTINCT FROM OLD.severity OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.recurrence_count IS DISTINCT FROM OLD.recurrence_count) THEN RAISE EXCEPTION 'canonical quality identity is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND OLD.origin='jornada_canonica' THEN
  allowed := CASE OLD.status::text WHEN 'aberta' THEN NEW.status::text='em_analise' WHEN 'em_analise' THEN NEW.status::text='em_acao_corretiva' WHEN 'em_acao_corretiva' THEN NEW.status::text='verificacao' WHEN 'verificacao' THEN NEW.status::text='encerrada' WHEN 'encerrada' THEN NEW.status::text='reaberta' WHEN 'reaberta' THEN NEW.status::text='em_analise' ELSE FALSE END;
  IF NOT allowed THEN RAISE EXCEPTION 'invalid quality status transition: % -> %',OLD.status,NEW.status; END IF;
 END IF;
 IF NEW.status::text='encerrada' AND OLD.status::text<>'encerrada' THEN
  SELECT count(*) INTO causes FROM ext_quality_causes c WHERE c.nonconformity_id=OLD.id;
  SELECT count(*) FILTER(WHERE status='concluida'),count(*) FILTER(WHERE status='pendente') INTO done_actions,pending_actions FROM ext_quality_actions a WHERE a.nonconformity_id=OLD.id AND a.origin='jornada_canonica';
  SELECT count(*) INTO valid_verification FROM ext_quality_verifications v WHERE v.id=NEW.closing_verification_id AND v.nonconformity_id=OLD.id AND v.outcome='eficaz' AND v.evidence_reference IS NOT NULL;
  IF NEW.responsible_identity IS NULL OR causes=0 OR done_actions=0 OR pending_actions>0 OR valid_verification=0 OR NEW.closed_by_identity IS NULL OR NEW.closed_at IS NULL THEN RAISE EXCEPTION 'quality closure prerequisites not met: evidence and responsible required'; END IF;
 END IF;
 IF OLD.status::text='encerrada' AND NEW.status::text='reaberta' AND (NEW.reopened_by_identity IS NULL OR NEW.reopened_at IS NULL OR char_length(NEW.reopen_justification)<10) THEN RAISE EXCEPTION 'formal reopening metadata required'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_quality_guard_nc_update_trg BEFORE UPDATE ON ext_quality_nonconformities FOR EACH ROW EXECUTE FUNCTION ext_quality_guard_nc_update();
COMMIT;

-- EXT-07 — jornada canônica interna de compliance corporativo.
-- Aditiva sobre 001–153. Linhas da 086 são preservadas como legado; não há seed
-- nem atribuição retroativa de obrigação, identidade, arquivo ou privacidade.

CREATE TABLE IF NOT EXISTS ext_compliance_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_type TEXT NOT NULL CHECK (char_length(obligation_type) BETWEEN 3 AND 100),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  declared_source TEXT NOT NULL CHECK (char_length(declared_source) BETWEEN 5 AND 1000),
  applicability_scope TEXT NOT NULL CHECK (char_length(applicability_scope) BETWEEN 3 AND 500),
  applicability_justification TEXT NOT NULL CHECK (char_length(applicability_justification) BETWEEN 10 AND 2000),
  validity_rule TEXT NOT NULL CHECK (char_length(validity_rule) BETWEEN 5 AND 500),
  renewal_lead_days INTEGER NOT NULL DEFAULT 30 CHECK (renewal_lead_days BETWEEN 0 AND 3650),
  criticality TEXT NOT NULL DEFAULT 'media' CHECK (criticality IN ('baixa','media','alta','critica')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','vigente','a_vencer','vencida','em_renovacao','nao_aplicavel','encerrada')),
  responsible_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS obligation_id UUID REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS effective_start_date DATE,
  ADD COLUMN IF NOT EXISTS validity_rule TEXT,
  ADD COLUMN IF NOT EXISTS evaluation_date DATE,
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS declared_reference TEXT,
  ADD COLUMN IF NOT EXISTS reference_source TEXT,
  ADD COLUMN IF NOT EXISTS replacement_of UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT,
  ADD COLUMN IF NOT EXISTS created_by_identity UUID;
ALTER TABLE ext_compliance_documents ALTER COLUMN is_private SET DEFAULT true;
UPDATE ext_compliance_documents SET is_private=true WHERE origin='registro_legado';
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_origin_check CHECK (origin IN ('registro_legado','ext07_canonica')) NOT VALID;
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_dates_check CHECK (expiry_date IS NULL OR effective_start_date IS NULL OR expiry_date >= effective_start_date) NOT VALID;
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_canonical_shape CHECK (origin <> 'ext07_canonica' OR (obligation_id IS NOT NULL AND responsible_identity IS NOT NULL AND is_private AND validity_rule IS NOT NULL AND (reference_type IS NOT NULL OR file_name IS NOT NULL))) NOT VALID;
CREATE INDEX IF NOT EXISTS ext_compliance_documents_obligation_idx ON ext_compliance_documents(obligation_id,version_no);
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_current_version_unique ON ext_compliance_documents(obligation_id) WHERE origin='ext07_canonica' AND status NOT IN ('cancelada') AND replacement_of IS NULL;

CREATE TABLE IF NOT EXISTS ext_compliance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  validity_period TEXT NOT NULL CHECK (char_length(validity_period) BETWEEN 5 AND 200),
  rule TEXT NOT NULL CHECK (char_length(rule) BETWEEN 5 AND 1000),
  evaluation_date DATE NOT NULL, due_date DATE NOT NULL,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  responsible_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  completion_result TEXT,
  cancellation_justification TEXT,
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
  UNIQUE(document_id,validity_period,rule)
);
CREATE INDEX IF NOT EXISTS ext_compliance_tasks_status_idx ON ext_compliance_tasks(status,due_date);

CREATE TABLE IF NOT EXISTS ext_compliance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), obligation_id UUID REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT, document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT, task_id UUID REFERENCES ext_compliance_tasks(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 100), payload JSONB NOT NULL DEFAULT '{}'::jsonb, idempotency_key TEXT NOT NULL, request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'), created_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(created_by_identity,idempotency_key)
);
CREATE OR REPLACE FUNCTION ext_compliance_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'compliance historical record is immutable'; END $$;
DROP TRIGGER IF EXISTS ext_compliance_events_immutable ON ext_compliance_events; CREATE TRIGGER ext_compliance_events_immutable BEFORE UPDATE OR DELETE ON ext_compliance_events FOR EACH ROW EXECUTE FUNCTION ext_compliance_immutable();
DROP TRIGGER IF EXISTS ext_compliance_documents_legacy_guard ON ext_compliance_documents;
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF OLD.origin='ext07_canonica' AND (NEW.obligation_id IS DISTINCT FROM OLD.obligation_id OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date OR NEW.file_url IS DISTINCT FROM OLD.file_url OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.document_number IS DISTINCT FROM OLD.document_number) THEN RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal'; END IF; IF OLD.status IN ('cancelada') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'terminal compliance document cannot reopen'; END IF; RETURN NEW; END $$;
CREATE TRIGGER ext_compliance_document_guard BEFORE UPDATE ON ext_compliance_documents FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_guard();
DROP TRIGGER IF EXISTS ext_compliance_task_guard ON ext_compliance_tasks;
CREATE OR REPLACE FUNCTION ext_compliance_task_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF OLD.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'terminal compliance task is immutable'; END IF; IF NEW.status='concluida' AND (NEW.responsible_identity IS NULL OR char_length(COALESCE(NEW.completion_result,'')) < 10) THEN RAISE EXCEPTION 'task completion requires responsible and result'; END IF; IF NEW.status='cancelada' AND char_length(COALESCE(NEW.cancellation_justification,'')) < 10 THEN RAISE EXCEPTION 'task cancellation requires justification'; END IF; RETURN NEW; END $$;
CREATE TRIGGER ext_compliance_task_guard BEFORE UPDATE ON ext_compliance_tasks FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_guard();
COMMENT ON TABLE ext_compliance_documents IS 'EXT-07 canonical rows are private documentary references; 086 rows remain registro_legado and do not prove bytes, upload or verified storage.';
COMMENT ON TABLE ext_compliance_tasks IS 'Dedicated compliance task source; one task per document validity period and declared rule.';

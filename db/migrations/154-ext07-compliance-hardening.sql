-- EXT-07 hardening. Aditiva sobre 001–153; sem seed e sem retroatribuição.
-- Referências declaradas continuam distintas de arquivo armazenado/verificado.

ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS renewal_justification TEXT;

-- A linha canônica é sempre privada, mesmo quando um cliente tenta forjar o campo.
CREATE OR REPLACE FUNCTION ext_compliance_private_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin = 'ext07_canonica' THEN
    NEW.is_private := true;
    IF NEW.file_url IS NOT NULL OR NEW.storage_key IS NOT NULL OR NEW.file_name IS NOT NULL THEN
      RAISE EXCEPTION 'canonical compliance accepts a declared reference, not stored file metadata';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.origin = 'ext07_canonica' THEN
    IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
       OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
       OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
       OR NEW.version_no < OLD.version_no THEN
      RAISE EXCEPTION 'canonical compliance validity is immutable; create a renewal';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_private_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_private_guard BEFORE INSERT OR UPDATE ON ext_compliance_documents
FOR EACH ROW EXECUTE FUNCTION ext_compliance_private_guard();

ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_effective_issue_check CHECK (origin <> 'ext07_canonica' OR (effective_start_date IS NOT NULL AND issue_date IS NOT NULL AND effective_start_date >= issue_date)) NOT VALID,
  ADD CONSTRAINT ext_compliance_expiry_rule_check CHECK (origin <> 'ext07_canonica' OR (validity_rule IS NOT NULL AND expiry_date IS NOT NULL AND expiry_date >= effective_start_date)) NOT VALID,
  ADD CONSTRAINT ext_compliance_private_check CHECK (origin <> 'ext07_canonica' OR is_private) NOT VALID;

-- A renovação formal aponta para a versão anterior e não reutiliza o índice de versão atual.
DROP INDEX IF EXISTS ext_compliance_current_version_unique;
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_one_current_version
  ON ext_compliance_documents(obligation_id)
  WHERE origin = 'ext07_canonica' AND superseded_at IS NULL AND status <> 'cancelada';
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_version_link_unique
  ON ext_compliance_documents(replacement_of)
  WHERE origin = 'ext07_canonica' AND replacement_of IS NOT NULL;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_renewal_shape CHECK (origin <> 'ext07_canonica' OR (version_no = 1 AND replacement_of IS NULL) OR (version_no > 1 AND replacement_of IS NOT NULL AND renewal_justification IS NOT NULL AND char_length(renewal_justification) >= 10)) NOT VALID;

ALTER TABLE ext_compliance_tasks
  ADD CONSTRAINT ext_compliance_task_responsible_check CHECK (responsible_identity IS NOT NULL) NOT VALID,
  ADD CONSTRAINT ext_compliance_task_dates_check CHECK (due_date >= evaluation_date) NOT VALID;

COMMENT ON COLUMN ext_compliance_documents.declared_reference IS 'Referência declarada por staff; não comprova bytes, upload, checksum, malware scan, armazenamento ou download.';
COMMENT ON COLUMN ext_compliance_documents.renewal_justification IS 'Justificativa da nova versão; o registro anterior permanece histórico.';
COMMENT ON TABLE ext_compliance_tasks IS 'Fonte canônica de tarefas EXT-07; uma tarefa por documento, período e regra, gerada na avaliação transacional.';

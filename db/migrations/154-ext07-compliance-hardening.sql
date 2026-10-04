-- 154-ext07-compliance-hardening.sql
-- EXT-07 — Endurecimento da jornada canônica interna de compliance corporativo.
-- Aditiva sobre 001–153. Preserva dados legados e não cria seed retroativo.
-- Reforça versionamento, renovação não-destrutiva, ciclo de vida das tarefas,
-- privacidade documental e proteção contra reabertura de estados terminais.

DO $$ BEGIN
  ALTER TYPE ext_compliance_status ADD VALUE IF NOT EXISTS 'substituida';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reforço estrutural de privacidade e integridade temporal em documentos
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_documents_is_private CHECK (is_private = true) NOT VALID,
  ADD CONSTRAINT ext_compliance_documents_dates_start CHECK (effective_start_date IS NULL OR issue_date IS NULL OR effective_start_date >= issue_date) NOT VALID,
  ADD CONSTRAINT ext_compliance_documents_dates_expiry CHECK (expiry_date IS NULL OR effective_start_date IS NULL OR expiry_date >= effective_start_date) NOT VALID,
  ADD CONSTRAINT ext_compliance_documents_dates_issue_expiry CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date) NOT VALID,
  ADD CONSTRAINT ext_compliance_documents_no_self_replacement CHECK (replacement_of IS NULL OR replacement_of <> id) NOT VALID,
  ADD CONSTRAINT ext_compliance_documents_version_positive CHECK (version_no >= 1) NOT VALID;

-- No máximo um documento ativo (vigente/a_vencer) por obrigação na jornada canônica
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_active_document_unique
  ON ext_compliance_documents(obligation_id)
  WHERE origin = 'ext07_canonica' AND status IN ('vigente', 'a_vencer');

-- Versão documental única por obrigação
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_doc_version_unique
  ON ext_compliance_documents(obligation_id, version_no)
  WHERE origin = 'ext07_canonica';

-- Função e gatilho de proteção para documentos canônicos
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origin = 'ext07_canonica' THEN
    -- Impedir alteração de campos estruturais imutáveis
    IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
       OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
       OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
       OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
       OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
       OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
       OR NEW.reference_source IS DISTINCT FROM OLD.reference_source
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.replacement_of IS DISTINCT FROM OLD.replacement_of
       OR NEW.file_url IS DISTINCT FROM OLD.file_url
       OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.document_number IS DISTINCT FROM OLD.document_number
       OR NEW.protocol IS DISTINCT FROM OLD.protocol
       OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.is_private IS DISTINCT FROM OLD.is_private
       OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal';
    END IF;

    -- Impedir reabertura de estado terminal
    IF OLD.status::text IN ('cancelada', 'substituida') AND NEW.status::text IS DISTINCT FROM OLD.status::text THEN
      RAISE EXCEPTION 'terminal compliance document cannot reopen';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ext_compliance_document_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_guard
  BEFORE UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_guard();

-- Função e gatilho de proteção para tarefas de compliance
CREATE OR REPLACE FUNCTION ext_compliance_task_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Impedir alteração de identificadores e regras de amarração
  IF NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
     OR NEW.validity_period IS DISTINCT FROM OLD.validity_period
     OR NEW.rule IS DISTINCT FROM OLD.rule
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'compliance task core attributes are immutable';
  END IF;

  -- Impedir reabertura de estado terminal
  IF OLD.status IN ('concluida', 'cancelada') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal compliance task is immutable';
  END IF;

  -- Validação estrita de conclusão
  IF NEW.status = 'concluida' AND (NEW.responsible_identity IS NULL OR char_length(COALESCE(NEW.completion_result, '')) < 10) THEN
    RAISE EXCEPTION 'task completion requires responsible and result';
  END IF;

  -- Validação estrita de cancelamento
  IF NEW.status = 'cancelada' AND char_length(COALESCE(NEW.cancellation_justification, '')) < 10 THEN
    RAISE EXCEPTION 'task cancellation requires justification';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ext_compliance_task_guard ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_task_guard
  BEFORE UPDATE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_guard();

-- Garantir imutabilidade de eventos
CREATE OR REPLACE FUNCTION ext_compliance_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'compliance historical record is immutable';
END $$;

DROP TRIGGER IF EXISTS ext_compliance_events_immutable ON ext_compliance_events;
CREATE TRIGGER ext_compliance_events_immutable
  BEFORE UPDATE OR DELETE ON ext_compliance_events
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_immutable();

COMMENT ON TABLE ext_compliance_obligations IS 'EXT-07 compliance obligations source with declared applicability and responsible staff.';
COMMENT ON TABLE ext_compliance_documents IS 'EXT-07 canonical documents are private references; pre-153 rows remain registro_legado and do not prove bytes or storage.';
COMMENT ON TABLE ext_compliance_tasks IS 'EXT-07 compliance tasks generated on expiry evaluation; unique per document, period and rule.';
COMMENT ON TABLE ext_compliance_events IS 'EXT-07 immutable audit and idempotency event log for compliance mutations.';

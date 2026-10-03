-- EXT-07 — endurecimento probatório da jornada interna de compliance.
-- Aditiva sobre 001–153: preserva ext_compliance_documents como fonte canônica,
-- não cria seed, não atribui evidência retroativa e não declara arquivo/bytes.

ALTER TYPE ext_compliance_status ADD VALUE IF NOT EXISTS 'substituida';

ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN,
  ADD COLUMN IF NOT EXISTS superseded_by UUID,
  ADD COLUMN IF NOT EXISTS renewal_justification TEXT,
  ADD COLUMN IF NOT EXISTS renewed_by_identity UUID,
  ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMPTZ;

-- A 153 ainda não oferecia operação de renovação. Para linhas canônicas já
-- criadas por ela, o indicador abaixo apenas materializa o estado estrutural
-- observável (cancelada não é atual; sem sucessora é atual), sem inventar prova.
UPDATE ext_compliance_documents d
   SET is_current = CASE
     WHEN d.status::text = 'cancelada' THEN false
     WHEN EXISTS (
       SELECT 1 FROM ext_compliance_documents child
        WHERE child.replacement_of = d.id
          AND child.origin = 'ext07_canonica'
     ) THEN false
     ELSE true
   END
 WHERE d.origin = 'ext07_canonica'
   AND d.is_current IS NULL;

UPDATE ext_compliance_documents previous
   SET superseded_by = (
     SELECT d.id
       FROM ext_compliance_documents d
      WHERE d.replacement_of = previous.id
        AND d.origin = 'ext07_canonica'
      ORDER BY d.created_at, d.id
      LIMIT 1
   )
 WHERE previous.origin = 'ext07_canonica'
   AND previous.superseded_by IS NULL
   AND EXISTS (
     SELECT 1 FROM ext_compliance_documents d
      WHERE d.replacement_of = previous.id
        AND d.origin = 'ext07_canonica'
   );

ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_documents_superseded_by_fk
    FOREIGN KEY (superseded_by) REFERENCES ext_compliance_documents(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT ext_compliance_documents_renewed_by_fk
    FOREIGN KEY (renewed_by_identity) REFERENCES auth_identities(id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT ext_compliance_canonical_private_v154 CHECK (
    origin <> 'ext07_canonica' OR is_private = true
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_canonical_no_file_claim_v154 CHECK (
    origin <> 'ext07_canonica'
    OR (file_name IS NULL AND file_url IS NULL AND storage_key IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_canonical_dates_v154 CHECK (
    origin <> 'ext07_canonica'
    OR (
      issue_date IS NOT NULL
      AND effective_start_date IS NOT NULL
      AND expiry_date IS NOT NULL
      AND effective_start_date >= issue_date
      AND expiry_date >= issue_date
      AND expiry_date >= effective_start_date
    )
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_canonical_current_v154 CHECK (
    origin <> 'ext07_canonica' OR is_current IS NOT NULL
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_canonical_version_v154 CHECK (
    origin <> 'ext07_canonica' OR version_no > 0
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_canonical_renewal_v154 CHECK (
    origin <> 'ext07_canonica'
    OR replacement_of IS NULL
    OR (
      char_length(COALESCE(renewal_justification, '')) BETWEEN 10 AND 1000
      AND renewed_by_identity IS NOT NULL
      AND renewed_at IS NOT NULL
    )
  ) NOT VALID;

-- O índice da 153 considerava replacement_of IS NULL e, por isso, não
-- representava "versão atual" após a primeira renovação formal.
DROP INDEX IF EXISTS ext_compliance_current_version_unique;
CREATE UNIQUE INDEX ext_compliance_current_version_unique
  ON ext_compliance_documents(obligation_id)
  WHERE origin = 'ext07_canonica' AND is_current IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_replacement_unique
  ON ext_compliance_documents(replacement_of)
  WHERE origin = 'ext07_canonica' AND replacement_of IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_superseded_unique
  ON ext_compliance_documents(superseded_by)
  WHERE origin = 'ext07_canonica' AND superseded_by IS NOT NULL;

ALTER TABLE ext_compliance_tasks
  ADD COLUMN IF NOT EXISTS started_by_identity UUID,
  ADD COLUMN IF NOT EXISTS completed_by_identity UUID,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD CONSTRAINT ext_compliance_tasks_started_by_fk
    FOREIGN KEY (started_by_identity) REFERENCES auth_identities(id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT ext_compliance_tasks_completed_by_fk
    FOREIGN KEY (completed_by_identity) REFERENCES auth_identities(id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT ext_compliance_tasks_cancelled_by_fk
    FOREIGN KEY (cancelled_by_identity) REFERENCES auth_identities(id)
    ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT ext_compliance_tasks_responsible_v154 CHECK (
    responsible_identity IS NOT NULL
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_tasks_dates_v154 CHECK (
    due_date <= evaluation_date
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_tasks_facts_v154 CHECK (
    jsonb_typeof(facts) = 'object'
    AND facts ? 'source'
    AND facts ? 'date_base'
    AND facts ? 'expiry_date'
  ) NOT VALID;

ALTER TABLE ext_compliance_events
  ADD CONSTRAINT ext_compliance_events_payload_v154 CHECK (
    jsonb_typeof(payload) = 'object'
  ) NOT VALID,
  ADD CONSTRAINT ext_compliance_events_key_v154 CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
  ) NOT VALID;

ALTER TABLE ext_compliance_obligations
  ADD CONSTRAINT ext_compliance_obligations_creator_fk_v154
    FOREIGN KEY (created_by_identity) REFERENCES auth_identities(id)
    ON DELETE RESTRICT NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_documents_creator_fk_v154
    FOREIGN KEY (created_by_identity) REFERENCES auth_identities(id)
    ON DELETE RESTRICT NOT VALID;

CREATE OR REPLACE FUNCTION ext_compliance_obligation_guard_v154()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'canonical compliance obligation is immutable';
  END IF;
  IF NEW.obligation_type IS DISTINCT FROM OLD.obligation_type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.declared_source IS DISTINCT FROM OLD.declared_source
     OR NEW.applicability_scope IS DISTINCT FROM OLD.applicability_scope
     OR NEW.applicability_justification IS DISTINCT FROM OLD.applicability_justification
     OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
     OR NEW.renewal_lead_days IS DISTINCT FROM OLD.renewal_lead_days
     OR NEW.criticality IS DISTINCT FROM OLD.criticality
     OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'canonical compliance obligation fields are immutable';
  END IF;
  IF NEW.status::text NOT IN ('pendente','vigente','a_vencer','vencida','em_renovacao','nao_aplicavel','encerrada') THEN
    RAISE EXCEPTION 'invalid compliance obligation state';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_obligation_guard_v154 ON ext_compliance_obligations;
CREATE TRIGGER ext_compliance_obligation_guard_v154
  BEFORE UPDATE OR DELETE ON ext_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_obligation_guard_v154();

CREATE OR REPLACE FUNCTION ext_compliance_document_guard_v154()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  lead_days INTEGER;
  expected_status TEXT;
  previous ext_compliance_documents%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origin = 'ext07_canonica' THEN
      RAISE EXCEPTION 'canonical compliance document is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.origin = 'ext07_canonica'
     AND NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'canonical compliance origin is immutable';
  END IF;
  IF NEW.origin <> 'ext07_canonica' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_private IS DISTINCT FROM true
     OR NEW.file_name IS NOT NULL
     OR NEW.file_url IS NOT NULL
     OR NEW.storage_key IS NOT NULL THEN
    RAISE EXCEPTION 'canonical compliance document is a private reference, not a file claim';
  END IF;
  IF NEW.obligation_id IS NULL OR NEW.responsible_identity IS NULL
     OR NEW.created_by_identity IS NULL OR NEW.is_current IS NULL
     OR char_length(COALESCE(NEW.validity_rule, '')) < 5
     OR NEW.issue_date IS NULL OR NEW.effective_start_date IS NULL OR NEW.expiry_date IS NULL
     OR NEW.effective_start_date < NEW.issue_date
     OR NEW.expiry_date < NEW.issue_date
     OR NEW.expiry_date < NEW.effective_start_date THEN
    RAISE EXCEPTION 'invalid canonical compliance validity';
  END IF;

  SELECT o.renewal_lead_days INTO lead_days
    FROM ext_compliance_obligations o WHERE o.id = NEW.obligation_id;
  IF lead_days IS NULL THEN
    RAISE EXCEPTION 'canonical compliance obligation is required';
  END IF;
  expected_status := CASE
    WHEN NEW.expiry_date <= CURRENT_DATE THEN 'vencida'
    WHEN NEW.expiry_date <= CURRENT_DATE + lead_days THEN 'a_vencer'
    ELSE 'vigente'
  END;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.origin = 'ext07_canonica' AND (
      NEW.protocol IS DISTINCT FROM OLD.protocol
      OR NEW.origin IS DISTINCT FROM OLD.origin
      OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.compliance_type IS DISTINCT FROM OLD.compliance_type
      OR NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.issuer IS DISTINCT FROM OLD.issuer
      OR NEW.responsible_name IS DISTINCT FROM OLD.responsible_name
      OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
      OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
      OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
      OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
      OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
      OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
      OR NEW.reference_source IS DISTINCT FROM OLD.reference_source
      OR NEW.replacement_of IS DISTINCT FROM OLD.replacement_of
      OR NEW.version_no IS DISTINCT FROM OLD.version_no
      OR NEW.cancellation_justification IS DISTINCT FROM OLD.cancellation_justification
      OR NEW.renewal_justification IS DISTINCT FROM OLD.renewal_justification
      OR NEW.renewed_by_identity IS DISTINCT FROM OLD.renewed_by_identity
      OR NEW.renewed_at IS DISTINCT FROM OLD.renewed_at
      OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
      RAISE EXCEPTION 'canonical compliance document validity/history is immutable; create a renewal';
    END IF;
    IF OLD.is_current IS FALSE OR OLD.status::text IN ('cancelada','substituida') THEN
      RAISE EXCEPTION 'terminal compliance document is immutable';
    END IF;
    IF NEW.is_current IS FALSE THEN
      IF OLD.is_current IS DISTINCT FROM true
         OR OLD.superseded_by IS NOT NULL
         OR NEW.status::text <> 'substituida'
         OR NEW.superseded_by IS NULL
         OR NEW.superseded_by = NEW.id
         OR NEW.evaluation_date IS DISTINCT FROM OLD.evaluation_date THEN
        RAISE EXCEPTION 'formal compliance substitution metadata is required';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.superseded_by IS NOT NULL OR NEW.status::text <> expected_status THEN
      RAISE EXCEPTION 'compliance state must be derived from server date';
    END IF;
    IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.evaluation_date IS DISTINCT FROM OLD.evaluation_date)
       AND NEW.evaluation_date IS DISTINCT FROM CURRENT_DATE THEN
      RAISE EXCEPTION 'compliance evaluation must use server date';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_current IS DISTINCT FROM true OR NEW.status::text <> expected_status THEN
    RAISE EXCEPTION 'new compliance document must be current with server-derived state';
  END IF;
  IF NEW.replacement_of IS NULL THEN
    IF NEW.version_no <> 1 OR NEW.superseded_by IS NOT NULL
       OR NEW.renewal_justification IS NOT NULL
       OR NEW.renewed_by_identity IS NOT NULL OR NEW.renewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid initial compliance version';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO previous FROM ext_compliance_documents WHERE id = NEW.replacement_of;
  IF NOT FOUND OR previous.origin <> 'ext07_canonica'
     OR previous.obligation_id IS DISTINCT FROM NEW.obligation_id
     OR previous.is_current IS DISTINCT FROM false
     OR previous.status::text <> 'substituida'
     OR previous.superseded_by IS DISTINCT FROM NEW.id
     OR NEW.version_no <> previous.version_no + 1
     OR char_length(COALESCE(NEW.renewal_justification, '')) NOT BETWEEN 10 AND 1000
     OR NEW.renewed_by_identity IS NULL OR NEW.renewed_at IS NULL THEN
    RAISE EXCEPTION 'invalid formal compliance renewal chain';
  END IF;
  IF NEW.id = NEW.replacement_of OR EXISTS (
    WITH RECURSIVE chain(id, replacement_of) AS (
      SELECT d.id, d.replacement_of FROM ext_compliance_documents d WHERE d.id = NEW.replacement_of
      UNION ALL
      SELECT d.id, d.replacement_of
        FROM ext_compliance_documents d JOIN chain c ON d.id = c.replacement_of
       WHERE c.replacement_of IS NOT NULL
    )
    SELECT 1 FROM chain WHERE id = NEW.id OR replacement_of = NEW.id
  ) THEN
    RAISE EXCEPTION 'compliance renewal cycle is forbidden';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_document_guard_v154 ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_guard_v154
  BEFORE INSERT OR UPDATE OR DELETE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_guard_v154();

CREATE OR REPLACE FUNCTION ext_compliance_task_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'compliance task history is immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'aberta' OR NEW.responsible_identity IS NULL
       OR NEW.created_by_identity IS NULL
       OR jsonb_typeof(NEW.facts) <> 'object'
       OR NOT (NEW.facts ? 'source' AND NEW.facts ? 'date_base' AND NEW.facts ? 'expiry_date')
       OR NEW.due_date > NEW.evaluation_date
       OR NEW.completion_result IS NOT NULL
       OR NEW.cancellation_justification IS NOT NULL
       OR NEW.started_at IS NOT NULL OR NEW.started_by_identity IS NOT NULL
       OR NEW.completed_at IS NOT NULL OR NEW.completed_by_identity IS NOT NULL
       OR NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by_identity IS NOT NULL THEN
      RAISE EXCEPTION 'invalid canonical compliance task';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.validity_period IS DISTINCT FROM OLD.validity_period
     OR NEW.rule IS DISTINCT FROM OLD.rule
     OR NEW.evaluation_date IS DISTINCT FROM OLD.evaluation_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.facts IS DISTINCT FROM OLD.facts
     OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'canonical compliance task facts are immutable';
  END IF;
  IF OLD.status IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'terminal compliance task is immutable';
  END IF;
  IF NEW.status = 'em_andamento' THEN
    IF OLD.status <> 'aberta' OR NEW.started_at IS NULL OR NEW.started_by_identity IS NULL
       OR NEW.completion_result IS DISTINCT FROM OLD.completion_result
       OR NEW.cancellation_justification IS DISTINCT FROM OLD.cancellation_justification
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.completed_by_identity IS DISTINCT FROM OLD.completed_by_identity
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_by_identity IS DISTINCT FROM OLD.cancelled_by_identity THEN
      RAISE EXCEPTION 'invalid compliance task transition';
    END IF;
  ELSIF NEW.status = 'concluida' THEN
    IF OLD.status <> 'em_andamento' OR NEW.responsible_identity IS NULL
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.started_by_identity IS DISTINCT FROM OLD.started_by_identity
       OR char_length(COALESCE(NEW.completion_result,'')) < 10
       OR NEW.completed_at IS NULL OR NEW.completed_by_identity IS NULL
       OR NEW.cancellation_justification IS DISTINCT FROM OLD.cancellation_justification
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_by_identity IS DISTINCT FROM OLD.cancelled_by_identity THEN
      RAISE EXCEPTION 'task completion requires started state, responsible and result';
    END IF;
  ELSIF NEW.status = 'cancelada' THEN
    IF OLD.status NOT IN ('aberta','em_andamento')
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.started_by_identity IS DISTINCT FROM OLD.started_by_identity
       OR NEW.completion_result IS DISTINCT FROM OLD.completion_result
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.completed_by_identity IS DISTINCT FROM OLD.completed_by_identity
       OR char_length(COALESCE(NEW.cancellation_justification,'')) < 10
       OR NEW.cancelled_at IS NULL OR NEW.cancelled_by_identity IS NULL THEN
      RAISE EXCEPTION 'task cancellation requires justification';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid compliance task transition';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_task_guard ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_task_guard
  BEFORE INSERT OR UPDATE OR DELETE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_guard();

COMMENT ON COLUMN ext_compliance_documents.declared_reference IS
  'Referência documental declarada; não representa bytes, upload, checksum, malware scan, armazenamento verificado ou download.';
COMMENT ON COLUMN ext_compliance_documents.is_current IS
  'Uma única versão atual por obrigação canônica; renovação cria nova linha e torna a anterior substituída.';
COMMENT ON TABLE ext_compliance_tasks IS
  'Fonte canônica de tarefas EXT-07; geração ocorre na mesma transação da avaliação temporal explícita.';

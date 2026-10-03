-- EXT-07 — hardening da jornada canônica de compliance corporativo.
-- Exclusivamente aditiva sobre 001–153: preserva o legado (origin
-- 'registro_legado'), não inventa dados retroativos, não semeia nada, não
-- cria tabela paralela (fonte canônica continua ext_compliance_documents;
-- fonte da tarefa continua ext_compliance_tasks, dedicada e sem concorrente).
-- Corrige incompatibilidades observadas na 153: linhagem regravável,
-- ausência de guarda temporal, renovação sem forma canônica e transições
-- arbitrárias de estado. Constraints novas em NOT VALID porque bases já
-- abertas podem conter linhas anteriores à 153.

-- 1. Cadeia de versões: renovação é registro novo, ligado, acíclico e único.
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_replacement_successor_unique
  ON ext_compliance_documents(replacement_of) WHERE replacement_of IS NOT NULL;

CREATE OR REPLACE FUNCTION ext_compliance_chain_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pred RECORD;
BEGIN
  IF NEW.origin::text <> 'ext07_canonica' THEN
    IF NEW.replacement_of IS NOT NULL THEN
      RAISE EXCEPTION 'legacy compliance record cannot join the canonical chain';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.obligation_id IS NULL THEN
    RAISE EXCEPTION 'canonical compliance document requires an obligation';
  END IF;
  IF NEW.replacement_of IS NULL THEN
    IF NEW.version_no <> 1 THEN
      RAISE EXCEPTION 'first canonical compliance document version must be version_no 1';
    END IF;
    RETURN NEW;
  END IF;
  -- Renovação: nova versão apontando para a ponta vigente da mesma cadeia.
  SELECT id, obligation_id, version_no, status INTO pred
    FROM ext_compliance_documents WHERE id = NEW.replacement_of FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'replacement predecessor not found'; END IF;
  IF pred.id = NEW.id THEN RAISE EXCEPTION 'compliance replacement cycle is forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM ext_compliance_documents d WHERE d.replacement_of = NEW.id) THEN
    RAISE EXCEPTION 'compliance replacement cycle is forbidden';
  END IF;
  IF pred.obligation_id IS DISTINCT FROM NEW.obligation_id THEN
    RAISE EXCEPTION 'compliance renewal must stay in the same obligation chain';
  END IF;
  IF pred.status::text = 'cancelada' THEN
    RAISE EXCEPTION 'cancelled compliance document cannot be renewed';
  END IF;
  IF EXISTS (SELECT 1 FROM ext_compliance_documents d WHERE d.replacement_of = NEW.replacement_of AND d.id <> NEW.id) THEN
    RAISE EXCEPTION 'compliance renewal must start from the current chain tip';
  END IF;
  IF NEW.version_no <> pred.version_no + 1 THEN
    RAISE EXCEPTION 'compliance renewal must increment version_no by one';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_chain_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_chain_guard BEFORE INSERT ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_chain_guard();

-- 2. Documento canônico: campos estruturais e linhagem imutáveis após INSERT;
--    máquina de estados explícita; estado terminal não reabre.
--    (Substitui a função da 153 endurecendo a mesma fronteira; o gatilho é o mesmo.)
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origin::text <> 'ext07_canonica' THEN
    RETURN NEW;
  END IF;
  IF NEW.protocol IS DISTINCT FROM OLD.protocol
     OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
     OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
     OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
     OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
     OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
     OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
     OR NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.file_url IS DISTINCT FROM OLD.file_url
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
     OR NEW.document_number IS DISTINCT FROM OLD.document_number
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.is_private IS DISTINCT FROM OLD.is_private
     OR NEW.version_no IS DISTINCT FROM OLD.version_no
     OR NEW.replacement_of IS DISTINCT FROM OLD.replacement_of
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
  THEN
    RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal';
  END IF;
  IF NEW.status::text IS DISTINCT FROM OLD.status::text THEN
    IF OLD.status::text = 'cancelada' THEN
      RAISE EXCEPTION 'terminal compliance document cannot reopen';
    END IF;
    IF NOT (
         (OLD.status::text = 'vigente'      AND NEW.status::text IN ('a_vencer','vencida','cancelada'))
      OR (OLD.status::text = 'a_vencer'     AND NEW.status::text IN ('vencida','cancelada'))
      OR (OLD.status::text = 'vencida'      AND NEW.status::text IN ('em_renovacao','cancelada'))
      OR (OLD.status::text = 'em_renovacao' AND NEW.status::text IN ('vencida','cancelada'))
    ) THEN
      RAISE EXCEPTION 'invalid canonical compliance document status transition';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 3. Guarda temporal e de privacidade do documento canônico (vai além do CHECK
--    porque compara com o relógio do servidor, não do cliente).
CREATE OR REPLACE FUNCTION ext_compliance_temporal_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin::text <> 'ext07_canonica' THEN
    RETURN NEW;
  END IF;
  IF NEW.file_name IS NOT NULL OR NEW.file_url IS NOT NULL OR NEW.storage_key IS NOT NULL THEN
    RAISE EXCEPTION 'canonical compliance document is a declared reference, not a stored file';
  END IF;
  IF NEW.is_private IS NOT true THEN
    RAISE EXCEPTION 'canonical compliance document must be private';
  END IF;
  IF NEW.declared_reference IS NULL OR NEW.reference_type IS NULL THEN
    RAISE EXCEPTION 'canonical compliance document requires declared reference and reference type';
  END IF;
  IF NEW.issue_date IS NULL OR NEW.effective_start_date IS NULL OR NEW.expiry_date IS NULL THEN
    RAISE EXCEPTION 'canonical compliance document requires issue, effective start and expiry dates';
  END IF;
  IF NEW.expiry_date < NEW.issue_date OR NEW.expiry_date < NEW.effective_start_date THEN
    RAISE EXCEPTION 'expiry cannot precede issue or effective start';
  END IF;
  IF NEW.status::text = 'vigente' AND NEW.expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'vigente compliance document cannot have an expired validity date';
  END IF;
  -- Vencida exige validade já encerrada na data-base do servidor: o relógio
  -- vence o documento quando expiry_date <= CURRENT_DATE (mesmo critério da
  -- avaliação). Uma validade ainda futura como "vencida" é classificação
  -- arbitrária e permanece rejeitada.
  IF NEW.status::text = 'vencida' AND NEW.expiry_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'arbitrary expired compliance document state';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_temporal_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_temporal_guard BEFORE INSERT OR UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_temporal_guard();

-- 4. Tarefa de compliance: transições explícitas (aberta→em_andamento→fim;
--    aberta→fim), terminal imutável, conclusão e cancelamento justificados.
--    (Substitui a função da 153 mantendo cada mensagem de guarda existente.)
CREATE OR REPLACE FUNCTION ext_compliance_task_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'terminal compliance task is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'aberta'       AND NEW.status IN ('em_andamento','concluida','cancelada'))
    OR (OLD.status = 'em_andamento' AND NEW.status IN ('concluida','cancelada'))
  ) THEN
    RAISE EXCEPTION 'invalid compliance task status transition';
  END IF;
  IF NEW.status = 'concluida' AND (NEW.responsible_identity IS NULL OR char_length(COALESCE(NEW.completion_result,'')) < 10) THEN
    RAISE EXCEPTION 'task completion requires responsible and result';
  END IF;
  IF NEW.status = 'cancelada' AND char_length(COALESCE(NEW.cancellation_justification,'')) < 10 THEN
    RAISE EXCEPTION 'task cancellation requires justification';
  END IF;
  RETURN NEW;
END $$;

-- 5. Obrigação: estado terminal não reabre silenciosamente.
CREATE OR REPLACE FUNCTION ext_compliance_obligation_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status::text = 'encerrada' AND NEW.status::text IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal compliance obligation cannot reopen';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_obligation_guard ON ext_compliance_obligations;
CREATE TRIGGER ext_compliance_obligation_guard BEFORE UPDATE ON ext_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_obligation_guard();

-- 6. Forma canônica declarada em CHECK (enforçada nas escritas novas; NOT
--    VALID para não exigir prova retroativa de linhas anteriores à 153).
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_canonical_no_file
  CHECK (origin::text <> 'ext07_canonica' OR (
    file_name IS NULL AND file_url IS NULL AND storage_key IS NULL
    AND declared_reference IS NOT NULL AND reference_type IS NOT NULL AND is_private
  )) NOT VALID;
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_canonical_full_validity
  CHECK (origin::text <> 'ext07_canonica' OR (
    issue_date IS NOT NULL AND effective_start_date IS NOT NULL AND expiry_date IS NOT NULL
    AND expiry_date >= issue_date AND expiry_date >= effective_start_date
  )) NOT VALID;

COMMENT ON TABLE ext_compliance_documents IS 'EXT-07 canonical rows form one version chain per obligation: renewal is a NEW row (replacement_of, version_no+1), never an overwrite. Declared private references only; no upload, bytes, checksum, malware scan, verified storage or download. 086 rows remain registro_legado and prove nothing retroactively.';
COMMENT ON COLUMN ext_compliance_documents.replacement_of IS 'Canonical lineage: points to the immediately replaced version. Immutable after INSERT (154); at most one successor per version and one root chain per obligation.';
COMMENT ON TABLE ext_compliance_tasks IS 'Task source for EXT-07: dedicated to compliance, unique per document, validity period and rule; created in the same transaction as the server-date evaluation; fail-closed without an active canonical staff responsible.';

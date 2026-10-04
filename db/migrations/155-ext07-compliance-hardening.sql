-- EXT-07 — hardening da jornada canônica de compliance (aditiva sobre 001–154).
-- Camada sobre a 154 (merge PR #113): preserva as constraints compatíveis
-- (private_canonical, issue_start, expiry_rule, task_owner, version_positive,
-- events_entity_idx) e corrige as duas incompatibilidades comprovadas pelo
-- gate HTTP real contra a jornada exigida ("vencimento gera tarefa"):
--  * ext_compliance_one_current_version não via renovações (replacement_of IS
--    NULL exclui a nova versão corrente) e continuava bloqueando re-registro
--    após vencimento — substituído por ext_compliance_current_document_unique;
--  * ext_compliance_task_dates (due_date >= evaluation_date) impede criar a
--    tarefa de um documento já vencido (due = validade passada, avaliação =
--    hoje): a tarefa do vencimento é o critério de aceite da jornada.
-- Sem seed, sem dado retroativo, sem reescrever 001–154; comparações enum/texto
-- usam ::text; constraints novas vêm com NOT VALID.

-- 1) Estado terminal de substituição formal (renovação cria novo registro).
-- Valor novo não é referenciado nesta transação: comparações usam ::text.
ALTER TYPE ext_compliance_status ADD VALUE IF NOT EXISTS 'substituida';

-- 2) Correção da 154: índice de versão corrente correto — no máximo um
--    documento corrente por obrigação; vencidas/substituídas/canceladas são
--    histórico e liberam novo registro (renovação ou re-registro).
DROP INDEX IF EXISTS ext_compliance_current_version_unique;
DROP INDEX IF EXISTS ext_compliance_one_current_version;
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_current_document_unique
  ON ext_compliance_documents(obligation_id)
  WHERE origin = 'ext07_canonica' AND status IN ('vigente','a_vencer','em_renovacao');

-- 3) Correção da 154: a tarefa do vencimento precisa poder nascer com
--    due_date (validade) anterior à avaliação (hoje).
ALTER TABLE ext_compliance_tasks DROP CONSTRAINT IF EXISTS ext_compliance_task_dates;

-- 4) Guard de documento: coerência temporal no INSERT, imutabilidade canônica
--    e terminalidade (cancelada/substituida) no UPDATE.
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin = 'ext07_canonica' THEN
    IF NEW.is_private IS NOT TRUE THEN
      RAISE EXCEPTION 'canonical compliance document must be private';
    END IF;
    IF NEW.reference_type IS NULL OR NEW.declared_reference IS NULL THEN
      RAISE EXCEPTION 'canonical compliance document requires a declared reference, not stored bytes';
    END IF;
    IF NEW.status::text = 'vigente' AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'vigente compliance document cannot have an expired validity';
    END IF;
    IF NEW.status::text = 'vencida' AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'vencida compliance document cannot have a future validity';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.origin = 'ext07_canonica' THEN
    IF OLD.status::text IN ('cancelada','substituida') THEN
      RAISE EXCEPTION 'terminal compliance document is immutable';
    END IF;
    IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
       OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
       OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
       OR NEW.document_number IS DISTINCT FROM OLD.document_number
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.file_url IS DISTINCT FROM OLD.file_url
       OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
       OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
       OR NEW.is_private IS DISTINCT FROM OLD.is_private
       OR NEW.replacement_of IS DISTINCT FROM OLD.replacement_of
       OR NEW.version_no IS DISTINCT FROM OLD.version_no THEN
      RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_document_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_guard BEFORE UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_guard();
DROP TRIGGER IF EXISTS ext_compliance_document_guard_insert ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_guard_insert BEFORE INSERT ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_guard();

-- 5) Guard de tarefa: nasce 'aberta' com responsável staff (fail-closed),
--    transições explícitas e terminais imutáveis.
CREATE OR REPLACE FUNCTION ext_compliance_task_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text <> 'aberta' THEN
      RAISE EXCEPTION 'compliance task is born open';
    END IF;
    IF NEW.responsible_identity IS NULL THEN
      RAISE EXCEPTION 'compliance task requires a staff responsible (fail closed)';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::text IN ('concluida','cancelada') THEN
      RAISE EXCEPTION 'terminal compliance task is immutable';
    END IF;
    IF NEW.status::text = 'em_andamento' AND OLD.status::text <> 'aberta' THEN
      RAISE EXCEPTION 'invalid compliance task transition';
    END IF;
    IF NEW.status::text = 'concluida' AND OLD.status::text NOT IN ('aberta','em_andamento') THEN
      RAISE EXCEPTION 'invalid compliance task transition';
    END IF;
    IF NEW.status::text = 'cancelada' AND OLD.status::text NOT IN ('aberta','em_andamento') THEN
      RAISE EXCEPTION 'invalid compliance task transition';
    END IF;
    IF NEW.status::text = 'concluida' AND (NEW.responsible_identity IS NULL OR char_length(COALESCE(NEW.completion_result,'')) < 10) THEN
      RAISE EXCEPTION 'task completion requires responsible and result';
    END IF;
    IF NEW.status::text = 'cancelada' AND char_length(COALESCE(NEW.cancellation_justification,'')) < 10 THEN
      RAISE EXCEPTION 'task cancellation requires justification';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_task_guard ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_task_guard BEFORE UPDATE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_guard();
DROP TRIGGER IF EXISTS ext_compliance_task_guard_insert ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_task_guard_insert BEFORE INSERT ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_guard();

-- 6) Versionamento/renovação: cadeia sem autoreferência e referência declarada
--    obrigatória em registro canônico (version_no > 0 já vem da 154). NOT VALID
--    preserva linhas legadas sem reescrevê-las.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_replacement_no_self_check
  CHECK (replacement_of IS NULL OR replacement_of <> id) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_reference_check
  CHECK (origin <> 'ext07_canonica' OR (reference_type IS NOT NULL AND declared_reference IS NOT NULL)) NOT VALID;

-- 7) Listagem de tarefas por obrigação.
CREATE INDEX IF NOT EXISTS ext_compliance_tasks_obligation_idx ON ext_compliance_tasks(obligation_id);

COMMENT ON TABLE ext_compliance_documents IS 'EXT-07 canonical rows are private declared references (registro_legado kept from 086); renewal creates a new row and marks the previous one substituida. No bytes, upload, checksum, malware scan, verified storage or download is claimed.';
COMMENT ON TABLE ext_compliance_tasks IS 'Dedicated compliance task source; born open with a staff responsible (fail closed), one task per document validity period and declared rule, terminal states immutable.';

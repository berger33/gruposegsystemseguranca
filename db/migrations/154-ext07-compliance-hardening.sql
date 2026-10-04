-- EXT-07 — endurecimento da jornada canônica de compliance corporativo.
-- Aditiva sobre 001–153. Não altera arquivos anteriores, não cria tabela
-- paralela, não semeia dados e não atribui obrigação, identidade, arquivo ou
-- privacidade retroativamente. Linhas da 086 permanecem `registro_legado`.
-- Nenhuma linha aqui prova upload, bytes, checksum, malware scan,
-- armazenamento verificado, download, validação jurídica, confirmação por
-- órgão público ou aceite humano.
--
-- Correções de incompatibilidade encontradas na 153:
--   1. `ext_compliance_current_version_unique` filtrava `replacement_of IS NULL`,
--      o que marcava como "versão atual" apenas a primeira versão e impedia
--      qualquer renovação posterior. A versão atual passa a ser determinada por
--      `superseded_by IS NULL`.
--   2. Não havia marcação estrutural de substituição, justificativa de
--      renovação, raiz de versão nem bloqueio de ciclo.
--   3. Estado `vigente` podia conviver com validade já vencida.
--   4. Tarefa canônica podia nascer sem responsável e sem fatos.
--   5. Idempotência não registrava a rota que originou a chave.

-- ---------------------------------------------------------------------------
-- 1. Versionamento e renovação de documentos/referências canônicas
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewal_justification TEXT,
  ADD COLUMN IF NOT EXISTS version_root UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS state_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS state_evaluation_rule TEXT;

-- A 153 só considerava atual a primeira versão; a renovação ficava impossível.
DROP INDEX IF EXISTS ext_compliance_current_version_unique;
-- "No máximo uma versão atual por obrigação" precisa ser verificado no COMMIT:
-- a renovação insere a nova versão e marca a anterior como substituída dentro
-- da mesma transação, e um índice único parcial (sempre imediato) reprovaria o
-- estado intermediário legítimo. A chave é materializada em coluna gerada
-- (expressão IMMUTABLE: `origin` é TEXT e `status` usa o operador nativo do
-- enum) e protegida por UNIQUE DEFERRABLE.
ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS current_version_key UUID
  GENERATED ALWAYS AS (
    CASE WHEN origin = 'ext07_canonica' AND superseded_by IS NULL
              AND status <> 'cancelada'::ext_compliance_status
         THEN obligation_id END
  ) STORED;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_documents_current_version_unique
  UNIQUE (current_version_key) DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS ext_compliance_documents_version_root_idx
  ON ext_compliance_documents(version_root, version_no);
CREATE INDEX IF NOT EXISTS ext_compliance_documents_superseded_idx
  ON ext_compliance_documents(superseded_by) WHERE superseded_by IS NOT NULL;

ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_no_self_supersede
  CHECK (superseded_by IS NULL OR superseded_by <> id) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_no_self_replacement
  CHECK (replacement_of IS NULL OR replacement_of <> id) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_supersede_shape
  CHECK ((superseded_by IS NULL) = (superseded_at IS NULL)) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_version_no_positive
  CHECK (version_no >= 1) NOT VALID;
-- Renovação precisa de justificativa explícita e autoria registrada.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_renewal_justification
  CHECK (replacement_of IS NULL OR char_length(COALESCE(renewal_justification, '')) >= 10) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_author
  CHECK (origin::text <> 'ext07_canonica' OR created_by_identity IS NOT NULL) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Validade e estado temporal
-- ---------------------------------------------------------------------------
-- A 086 já compara expiry_date com issue_date; a 153 comparava apenas com
-- effective_start_date. O recorte canônico exige regra declarada e as duas
-- comparações, sem depender do relógio do cliente.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_validity_rule
  CHECK (origin::text <> 'ext07_canonica' OR char_length(COALESCE(validity_rule, '')) >= 5) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_expiry_required
  CHECK (origin::text <> 'ext07_canonica' OR (issue_date IS NOT NULL AND expiry_date IS NOT NULL)) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_start_within_validity
  CHECK (origin::text <> 'ext07_canonica' OR effective_start_date IS NULL OR issue_date IS NULL
         OR effective_start_date >= issue_date) NOT VALID;

-- ---------------------------------------------------------------------------
-- 3. Privacidade estrutural
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_private
  CHECK (origin::text <> 'ext07_canonica' OR is_private) NOT VALID;
-- Referência declarada é diferente de arquivo real: quando não há file_name,
-- a linha canônica precisa declarar tipo e conteúdo da referência.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_reference_declared
  CHECK (origin::text <> 'ext07_canonica'
         OR (char_length(COALESCE(reference_type, '')) >= 3 AND char_length(COALESCE(declared_reference, '')) >= 3)) NOT VALID;
-- Sem infraestrutura de arquivo real provada, a linha canônica não declara
-- storage_key nem URL de download.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_canonical_no_storage_claim
  CHECK (origin::text <> 'ext07_canonica' OR (storage_key IS NULL AND file_url IS NULL AND file_name IS NULL)) NOT VALID;

-- ---------------------------------------------------------------------------
-- 4. Guarda de mutação do documento canônico (substitui a função da 153)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $ext07_doc_guard$
DECLARE
  cursor_id UUID;
  hops INTEGER := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.origin::text = 'ext07_canonica' THEN
      IF NEW.status::text = 'vigente' AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'compliance state vigente is incompatible with an expired validity';
      END IF;
      IF NEW.status::text NOT IN ('vigente', 'a_vencer', 'vencida', 'em_renovacao') THEN
        RAISE EXCEPTION 'canonical compliance document cannot be created in state %', NEW.status;
      END IF;
      IF NEW.superseded_by IS NOT NULL THEN
        RAISE EXCEPTION 'a new canonical compliance document cannot already be superseded';
      END IF;
      -- Impede ciclo na cadeia de versões declarada na criação.
      cursor_id := NEW.replacement_of;
      WHILE cursor_id IS NOT NULL LOOP
        hops := hops + 1;
        IF cursor_id = NEW.id OR hops > 500 THEN
          RAISE EXCEPTION 'compliance version chain cycle detected';
        END IF;
        SELECT replacement_of INTO cursor_id FROM ext_compliance_documents WHERE id = cursor_id;
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.origin::text = 'ext07_canonica' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.protocol IS DISTINCT FROM OLD.protocol
       OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
       OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
       OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
       OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
       OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.replacement_of IS DISTINCT FROM OLD.replacement_of
       OR NEW.version_root IS DISTINCT FROM OLD.version_root
       OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
       OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
       OR NEW.file_url IS DISTINCT FROM OLD.file_url
       OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.document_number IS DISTINCT FROM OLD.document_number THEN
      RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal';
    END IF;
    IF NEW.is_private IS DISTINCT FROM OLD.is_private THEN
      RAISE EXCEPTION 'canonical compliance document privacy cannot be downgraded';
    END IF;
    IF OLD.superseded_by IS NOT NULL AND NEW.superseded_by IS DISTINCT FROM OLD.superseded_by THEN
      RAISE EXCEPTION 'a superseded compliance document cannot be relinked';
    END IF;
    IF NEW.status::text = 'vigente' AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'compliance state vigente is incompatible with an expired validity';
    END IF;
  END IF;

  IF OLD.status::text = 'cancelada' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal compliance document cannot reopen';
  END IF;
  RETURN NEW;
END
$ext07_doc_guard$;

DROP TRIGGER IF EXISTS ext_compliance_document_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_guard
  BEFORE INSERT OR UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_guard();

-- ---------------------------------------------------------------------------
-- 5. Tarefas: fail-closed, fatos e transições
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_tasks
  ADD COLUMN IF NOT EXISTS base_date DATE,
  ADD COLUMN IF NOT EXISTS rule_source TEXT,
  ADD COLUMN IF NOT EXISTS completed_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT;

ALTER TABLE ext_compliance_tasks
  ADD CONSTRAINT ext_compliance_task_responsible_required
  CHECK (responsible_identity IS NOT NULL) NOT VALID;
ALTER TABLE ext_compliance_tasks
  ADD CONSTRAINT ext_compliance_task_facts_required
  CHECK (facts <> '{}'::jsonb) NOT VALID;
ALTER TABLE ext_compliance_tasks
  ADD CONSTRAINT ext_compliance_task_completion_shape
  CHECK (status::text <> 'concluida'
         OR (completed_at IS NOT NULL AND char_length(COALESCE(completion_result, '')) >= 10 AND responsible_identity IS NOT NULL)) NOT VALID;
ALTER TABLE ext_compliance_tasks
  ADD CONSTRAINT ext_compliance_task_cancellation_shape
  CHECK (status::text <> 'cancelada'
         OR (cancelled_at IS NOT NULL AND char_length(COALESCE(cancellation_justification, '')) >= 10)) NOT VALID;
-- Unicidade defensiva: a obrigação também participa da chave da tarefa.
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_tasks_obligation_period_unique
  ON ext_compliance_tasks(obligation_id, document_id, validity_period, rule);

CREATE OR REPLACE FUNCTION ext_compliance_task_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $ext07_task_guard$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.responsible_identity IS NULL THEN
      RAISE EXCEPTION 'compliance task requires a canonical staff responsible';
    END IF;
    IF NEW.facts = '{}'::jsonb THEN
      RAISE EXCEPTION 'compliance task requires recorded facts';
    END IF;
    IF char_length(COALESCE(NEW.rule, '')) < 5 THEN
      RAISE EXCEPTION 'compliance task requires an explicit declared rule';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status::text IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'terminal compliance task is immutable';
  END IF;
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.validity_period IS DISTINCT FROM OLD.validity_period
     OR NEW.rule IS DISTINCT FROM OLD.rule
     OR NEW.evaluation_date IS DISTINCT FROM OLD.evaluation_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.facts IS DISTINCT FROM OLD.facts
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'compliance task origin facts are immutable';
  END IF;
  IF NEW.status::text = 'aberta' AND OLD.status::text <> 'aberta' THEN
    RAISE EXCEPTION 'compliance task cannot silently return to aberta';
  END IF;
  IF NEW.status::text = 'concluida'
     AND (NEW.responsible_identity IS NULL OR char_length(COALESCE(NEW.completion_result, '')) < 10) THEN
    RAISE EXCEPTION 'task completion requires responsible and result';
  END IF;
  IF NEW.status::text = 'cancelada' AND char_length(COALESCE(NEW.cancellation_justification, '')) < 10 THEN
    RAISE EXCEPTION 'task cancellation requires justification';
  END IF;
  RETURN NEW;
END
$ext07_task_guard$;

DROP TRIGGER IF EXISTS ext_compliance_task_guard ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_task_guard
  BEFORE INSERT OR UPDATE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_guard();

-- ---------------------------------------------------------------------------
-- 6. Obrigações: estado, timestamps de servidor e responsável
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_obligations
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'declarada_internamente',
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE ext_compliance_obligations
  ADD CONSTRAINT ext_compliance_obligation_source_kind
  CHECK (source_kind IN ('declarada_internamente', 'referencia_externa_declarada')) NOT VALID;

CREATE OR REPLACE FUNCTION ext_compliance_obligation_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $ext07_ob_guard$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'compliance obligation authorship is immutable';
    END IF;
    IF OLD.status::text = 'encerrada' AND NEW.status::text <> 'encerrada' THEN
      RAISE EXCEPTION 'terminal compliance obligation cannot reopen';
    END IF;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END
$ext07_ob_guard$;

DROP TRIGGER IF EXISTS ext_compliance_obligation_guard ON ext_compliance_obligations;
CREATE TRIGGER ext_compliance_obligation_guard
  BEFORE UPDATE ON ext_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_obligation_guard();

-- ---------------------------------------------------------------------------
-- 7. Idempotência e auditoria
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_events
  ADD COLUMN IF NOT EXISTS request_route TEXT;
ALTER TABLE ext_compliance_events
  ADD CONSTRAINT ext_compliance_event_route_shape
  CHECK (request_route IS NULL OR char_length(request_route) BETWEEN 3 AND 200) NOT VALID;
CREATE INDEX IF NOT EXISTS ext_compliance_events_entity_idx
  ON ext_compliance_events(obligation_id, document_id, task_id, created_at);

-- ---------------------------------------------------------------------------
-- 8. Comentários probatórios
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN ext_compliance_documents.superseded_by IS
  'EXT-07: renovação cria novo registro e aponta a versão anterior; a versão anterior não é sobrescrita.';
COMMENT ON COLUMN ext_compliance_documents.declared_reference IS
  'EXT-07: referência documental declarada. Não prova upload, bytes, checksum, malware scan, armazenamento verificado nem download.';
COMMENT ON COLUMN ext_compliance_obligations.declared_source IS
  'EXT-07: fonte declarada internamente. Não é validação jurídica nem confirmação por órgão público.';
COMMENT ON COLUMN ext_compliance_tasks.rule IS
  'EXT-07: regra explícita que gerou a tarefa, registrada junto com data-base e fatos.';

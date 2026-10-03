-- EXT-07 — endurecimento da jornada canônica de compliance corporativo.
--
-- Aditiva sobre 001–153. NÃO altera arquivos anteriores, NÃO semeia dados e
-- NÃO atribui obrigação, identidade, arquivo ou privacidade retroativamente.
-- As linhas anteriores à 153 continuam `registro_legado`: elas não provam
-- obrigação aplicável, responsável canônico nem referência documental, e esta
-- migração não inventa essa prova.
--
-- O que esta migração corrige/reforça, a partir das lacunas REPRODUZIDAS em
-- PostgreSQL real contra a 153:
--   * versionamento/renovação: a 153 só impedia uma segunda versão "atual"
--     quando `replacement_of IS NULL`; bastava encadear `replacement_of` para
--     manter N documentos vigentes na mesma obrigação. Passa a existir
--     supersessão explícita (`superseded_by`) e a unicidade da versão atual é
--     calculada por ela;
--   * ciclos de substituição (um documento substituindo a si mesmo ou um
--     ancestral) eram aceitos; passam a ser bloqueados por CHECK e por guarda
--     recursiva;
--   * sobrescrita destrutiva: a 153 só travava parte das colunas canônicas
--     (título, descrição, referência declarada, regra e versão eram mutáveis);
--   * tarefa sem responsável era aceita pelo banco (não era fail-closed);
--   * estado `vigente` convivia com validade vencida;
--   * fronteira documental: linha canônica não pode declarar `storage_key` nem
--     `file_url`, porque NÃO existe upload, bytes, checksum, malware scan,
--     armazenamento verificado ou download nesta entrega.
--
-- Comparações com colunas enum usam `::text` de propósito; `status` é do tipo
-- `ext_compliance_status` e `origin` é TEXT.
-- Constraints novas entram como NOT VALID: elas valem para INSERT/UPDATE a
-- partir de agora e preservam o legado existente sem reescrevê-lo.

-- ---------------------------------------------------------------------------
-- 1. Documentos: supersessão explícita, autoria e justificativa da renovação.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS superseded_by UUID,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS renewal_justification TEXT;

-- A renovação precisa marcar o registro anterior como substituído ANTES de
-- inserir a nova versão, senão as duas convivem como "atual" e o índice único
-- de versão atual rejeita a renovação legítima. Por isso a FK de supersessão é
-- DEFERRABLE INITIALLY DEFERRED: dentro da transação o ponteiro aponta para a
-- linha que ainda vai nascer, e no COMMIT ela precisa existir de verdade.
DO $ext07_supersede_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'ext_compliance_documents'::regclass
       AND conname = 'ext_compliance_documents_superseded_by_fkey'
  ) THEN
    ALTER TABLE ext_compliance_documents
      ADD CONSTRAINT ext_compliance_documents_superseded_by_fkey
      FOREIGN KEY (superseded_by) REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $ext07_supersede_fk$;

CREATE INDEX IF NOT EXISTS ext_compliance_documents_supersede_idx
  ON ext_compliance_documents(superseded_by);
CREATE INDEX IF NOT EXISTS ext_compliance_documents_replacement_idx
  ON ext_compliance_documents(replacement_of);

DO $ext07_doc_checks$
DECLARE
  wanted CONSTANT TEXT[][] := ARRAY[
    -- Nenhum documento substitui a si mesmo, nem se declara sucessor de si.
    ['ext_compliance_no_self_replacement',
     'replacement_of IS NULL OR replacement_of <> id'],
    ['ext_compliance_no_self_supersede',
     'superseded_by IS NULL OR superseded_by <> id'],
    -- Supersessão é um ato com autor e carimbo do servidor.
    ['ext_compliance_supersede_shape',
     'superseded_by IS NULL OR (superseded_at IS NOT NULL AND superseded_by_identity IS NOT NULL)'],
    -- Renovação é registro novo, versionado e justificado; nunca sobrescrita.
    ['ext_compliance_renewal_shape',
     'replacement_of IS NULL OR (char_length(COALESCE(renewal_justification, '''')) >= 10 AND version_no > 1)'],
    -- Vigência não pode começar antes da emissão declarada.
    ['ext_compliance_start_after_issue',
     'effective_start_date IS NULL OR issue_date IS NULL OR effective_start_date >= issue_date'],
    -- Linha canônica precisa de regra de validade declarada e vencimento real.
    ['ext_compliance_canonical_rule',
     'origin::text <> ''ext07_canonica'' OR (validity_rule IS NOT NULL AND char_length(validity_rule) >= 5)'],
    ['ext_compliance_canonical_expiry',
     'origin::text <> ''ext07_canonica'' OR expiry_date IS NOT NULL'],
    ['ext_compliance_canonical_version',
     'origin::text <> ''ext07_canonica'' OR version_no >= 1'],
    -- Privacidade estrutural: linha canônica é sempre privada.
    ['ext_compliance_canonical_private',
     'origin::text <> ''ext07_canonica'' OR is_private'],
    -- FRONTEIRA DOCUMENTAL: referência declarada NÃO é arquivo verificado.
    -- Sem upload/bytes/checksum/scan/armazenamento, a linha canônica fica
    -- proibida de alegar chave de armazenamento ou URL de download.
    ['ext_compliance_canonical_reference_only',
     'origin::text <> ''ext07_canonica'' OR (storage_key IS NULL AND file_url IS NULL)'],
    ['ext_compliance_canonical_reference_declared',
     'origin::text <> ''ext07_canonica'' OR (reference_type IS NOT NULL AND declared_reference IS NOT NULL)']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1 .. array_length(wanted, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'ext_compliance_documents'::regclass AND conname = wanted[i][1]
    ) THEN
      EXECUTE format('ALTER TABLE ext_compliance_documents ADD CONSTRAINT %I CHECK (%s) NOT VALID',
                     wanted[i][1], wanted[i][2]);
    END IF;
  END LOOP;
END $ext07_doc_checks$;

-- Unicidade da versão atual recalculada por supersessão. A 153 usava
-- `replacement_of IS NULL`, o que deixava toda renovação encadeada "atual".
-- Predicado de índice exige IMMUTABLE: aqui a comparação usa o literal do
-- próprio enum (`::ext_compliance_status`), porque o cast enum->text é STABLE
-- e o PostgreSQL recusa `status::text` em predicado de índice. Nos CHECK e nas
-- triggers a comparação segue em `::text`, como manda o padrão da entrega.
DROP INDEX IF EXISTS ext_compliance_current_version_unique;
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_current_version_unique
  ON ext_compliance_documents(obligation_id)
  WHERE origin = 'ext07_canonica' AND superseded_by IS NULL
    AND status <> 'cancelada'::ext_compliance_status;

-- ---------------------------------------------------------------------------
-- 2. Guarda de documento canônico: histórico preservado, renovação obrigatória.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $ext07_doc_guard$
BEGIN
  IF OLD.origin::text = 'ext07_canonica' THEN
    -- Identidade, vínculo, validade, referência e versão do registro canônico
    -- são imutáveis: corrigir é registrar renovação/substituição formal.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.protocol IS DISTINCT FROM OLD.protocol
       OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
       OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
       OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.compliance_type IS DISTINCT FROM OLD.compliance_type
       OR NEW.document_number IS DISTINCT FROM OLD.document_number
       OR NEW.issuer IS DISTINCT FROM OLD.issuer
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
       OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
       OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
       OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
       OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
       OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
       OR NEW.reference_source IS DISTINCT FROM OLD.reference_source
       OR NEW.renewal_justification IS DISTINCT FROM OLD.renewal_justification
       OR NEW.replacement_of IS DISTINCT FROM OLD.replacement_of
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.file_url IS DISTINCT FROM OLD.file_url
       OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.is_private IS DISTINCT FROM OLD.is_private THEN
      RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal';
    END IF;
    -- Supersessão é irreversível: não se "des-substitui" um documento.
    IF OLD.superseded_by IS NOT NULL AND NEW.superseded_by IS DISTINCT FROM OLD.superseded_by THEN
      RAISE EXCEPTION 'compliance document supersession is irreversible';
    END IF;
    -- Relógio do servidor decide vigência: vencido não volta a vigente.
    IF NEW.status::text = 'vigente' AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'compliance document cannot be vigente with expired validity';
    END IF;
  END IF;
  IF OLD.status::text = 'cancelada' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal compliance document cannot reopen';
  END IF;
  RETURN NEW;
END $ext07_doc_guard$;

DROP TRIGGER IF EXISTS ext_compliance_document_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_guard
  BEFORE UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_guard();

-- Guarda de ciclo: a cadeia de substituição precisa terminar em um ancestral.
CREATE OR REPLACE FUNCTION ext_compliance_chain_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $ext07_chain$
DECLARE
  cursor_id UUID := NEW.replacement_of;
  steps INTEGER := 0;
BEGIN
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'compliance renewal chain cannot form a cycle';
    END IF;
    steps := steps + 1;
    IF steps > 200 THEN
      RAISE EXCEPTION 'compliance renewal chain is too deep to validate';
    END IF;
    SELECT replacement_of INTO cursor_id FROM ext_compliance_documents WHERE id = cursor_id;
  END LOOP;
  RETURN NEW;
END $ext07_chain$;

DROP TRIGGER IF EXISTS ext_compliance_chain_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_chain_guard
  BEFORE INSERT OR UPDATE OF replacement_of ON ext_compliance_documents
  FOR EACH ROW WHEN (NEW.replacement_of IS NOT NULL)
  EXECUTE FUNCTION ext_compliance_chain_guard();

-- ---------------------------------------------------------------------------
-- 3. Tarefas: fail-closed sem responsável, autoria de transição e fatos reais.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_tasks
  ADD COLUMN IF NOT EXISTS started_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS completed_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT;

DO $ext07_task_checks$
DECLARE
  wanted CONSTANT TEXT[][] := ARRAY[
    -- Sem responsável canônico não existe tarefa: a geração falha fechada.
    ['ext_compliance_tasks_responsible_required',
     'responsible_identity IS NOT NULL'],
    -- Fatos e data-base são obrigatórios: tarefa sem prova não é tarefa.
    ['ext_compliance_tasks_facts_shape',
     'jsonb_typeof(facts) = ''object'' AND facts <> ''{}''::jsonb'],
    ['ext_compliance_tasks_completion_shape',
     'status::text <> ''concluida'' OR (completed_at IS NOT NULL AND completed_by_identity IS NOT NULL AND char_length(COALESCE(completion_result, '''')) >= 10)'],
    ['ext_compliance_tasks_cancellation_shape',
     'status::text <> ''cancelada'' OR (cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL AND char_length(COALESCE(cancellation_justification, '''')) >= 10)']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1 .. array_length(wanted, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'ext_compliance_tasks'::regclass AND conname = wanted[i][1]
    ) THEN
      EXECUTE format('ALTER TABLE ext_compliance_tasks ADD CONSTRAINT %I CHECK (%s) NOT VALID',
                     wanted[i][1], wanted[i][2]);
    END IF;
  END LOOP;
END $ext07_task_checks$;

CREATE OR REPLACE FUNCTION ext_compliance_task_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $ext07_task_guard$
BEGIN
  -- Estado terminal é final: concluída/cancelada não reabrem em silêncio.
  IF OLD.status::text IN ('concluida', 'cancelada') THEN
    RAISE EXCEPTION 'terminal compliance task is immutable';
  END IF;
  -- Origem da tarefa é imutável: regra, período, data-base e fatos ficam como
  -- foram gravados pela avaliação que a criou.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.validity_period IS DISTINCT FROM OLD.validity_period
     OR NEW.rule IS DISTINCT FROM OLD.rule
     OR NEW.evaluation_date IS DISTINCT FROM OLD.evaluation_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.facts IS DISTINCT FROM OLD.facts
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'compliance task provenance is immutable';
  END IF;
  -- Responsável canônico não pode ser removido depois de atribuído.
  IF NEW.responsible_identity IS NULL THEN
    RAISE EXCEPTION 'compliance task requires a canonical responsible identity';
  END IF;
  -- Transições aceitas: aberta -> em_andamento | concluida | cancelada;
  --                     em_andamento -> concluida | cancelada.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status::text = 'aberta' AND NEW.status::text IN ('em_andamento', 'concluida', 'cancelada'))
       OR (OLD.status::text = 'em_andamento' AND NEW.status::text IN ('concluida', 'cancelada'))
     ) THEN
    RAISE EXCEPTION 'invalid compliance task transition: % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status::text = 'concluida'
     AND (NEW.completed_by_identity IS NULL OR char_length(COALESCE(NEW.completion_result, '')) < 10) THEN
    RAISE EXCEPTION 'task completion requires responsible and result';
  END IF;
  IF NEW.status::text = 'cancelada'
     AND (NEW.cancelled_by_identity IS NULL OR char_length(COALESCE(NEW.cancellation_justification, '')) < 10) THEN
    RAISE EXCEPTION 'task cancellation requires justification';
  END IF;
  RETURN NEW;
END $ext07_task_guard$;

DROP TRIGGER IF EXISTS ext_compliance_task_guard ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_task_guard
  BEFORE UPDATE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_guard();

-- Tarefa não se apaga: o histórico de vencimento é prova.
CREATE OR REPLACE FUNCTION ext_compliance_task_delete_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $ext07_task_delete$
BEGIN
  RAISE EXCEPTION 'compliance task history is immutable';
END $ext07_task_delete$;

DROP TRIGGER IF EXISTS ext_compliance_tasks_no_delete ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_tasks_no_delete
  BEFORE DELETE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_task_delete_guard();

-- ---------------------------------------------------------------------------
-- 4. Obrigações: autoria e carimbo de criação imutáveis.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_obligations
  ADD COLUMN IF NOT EXISTS updated_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION ext_compliance_obligation_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $ext07_ob_guard$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'compliance obligation authorship is immutable';
  END IF;
  IF OLD.status = 'encerrada' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal compliance obligation cannot reopen';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END $ext07_ob_guard$;

DROP TRIGGER IF EXISTS ext_compliance_obligation_guard ON ext_compliance_obligations;
CREATE TRIGGER ext_compliance_obligation_guard
  BEFORE UPDATE ON ext_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_obligation_guard();

-- ---------------------------------------------------------------------------
-- 5. Eventos: índices de leitura; a imutabilidade já vem da 153.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ext_compliance_events_obligation_idx
  ON ext_compliance_events(obligation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ext_compliance_events_document_idx
  ON ext_compliance_events(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ext_compliance_events_task_idx
  ON ext_compliance_events(task_id, created_at DESC);

COMMENT ON COLUMN ext_compliance_documents.declared_reference IS
  'Referência documental DECLARADA pela equipe interna. Não é arquivo: não há upload, bytes, checksum, malware scan, armazenamento verificado nem download nesta entrega.';
COMMENT ON COLUMN ext_compliance_documents.superseded_by IS
  'Renovação/substituição formal: aponta para a versão que passou a valer. O registro anterior permanece intacto como histórico.';
COMMENT ON COLUMN ext_compliance_tasks.rule IS
  'Regra declarada que gerou a tarefa, gravada junto com a data-base e os fatos da avaliação.';

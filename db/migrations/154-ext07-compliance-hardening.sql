-- EXT-07 hardening — endurecimento aditivo sobre 001–153.
-- Não altera 001–153, não inventa dados retroativos, não faz seed. Linhas
-- anteriores à 153 permanecem `registro_legado`. Novas restrições entram como
-- NOT VALID quando tocam linhas legadas; todas valem para escritas novas.
-- Comparações enum usam ::text explicitamente.

-- 1. Versionamento formal: ponteiro de substituição (a versão atual é a que
--    não foi superada) e justificativa de renovação explícita. A FK de
--    superseded_by é DEFERRABLE porque a escrita pareada da renovação define o
--    ponteiro na versão anterior antes de inserir a nova versão, na mesma
--    transação; a verificação no COMMIT mantém integridade sem ordenação
--    circular.
ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS renewal_justification TEXT;
ALTER TABLE ext_compliance_documents DROP CONSTRAINT IF EXISTS ext_compliance_documents_superseded_by_fkey;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_documents_superseded_by_fkey
  FOREIGN KEY (superseded_by) REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_no_self_replace CHECK (replacement_of IS NULL OR replacement_of <> id) NOT VALID,
  ADD CONSTRAINT ext_compliance_no_self_supersede CHECK (superseded_by IS NULL OR superseded_by <> id) NOT VALID;

-- 2. Exatamente uma versão atual por obrigação: atual = canônica, não superada
--    e não cancelada. Substitui o índice da 153, que usava replacement_of e
--    permitia mais de uma "atual" após renovações encadeadas. Predicado de
--    índice exige IMUTABILIDADE e enum_out é STABLE: aqui a comparação é
--    enum com literal enum (sem ::text). Nos triggers e CHECKs a regra ::text
--    é mantida, pois lá STABLE é permitido.
DROP INDEX IF EXISTS ext_compliance_current_version_unique;
CREATE UNIQUE INDEX ext_compliance_current_version_unique
  ON ext_compliance_documents(obligation_id)
  WHERE origin = 'ext07_canonica' AND superseded_by IS NULL AND status <> 'cancelada';
CREATE INDEX IF NOT EXISTS ext_compliance_documents_chain_idx
  ON ext_compliance_documents(obligation_id, version_no) WHERE origin = 'ext07_canonica';

-- 3. Fronteira documental: registros canônicos são referência declarada, nunca
--    bytes. Sem storage_key/file_url/file_name em linha canônica nova e com
--    validade sempre delimitada (regra declarada já era exigida pela 153).
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_reference_only_check
    CHECK (origin <> 'ext07_canonica' OR (storage_key IS NULL AND file_url IS NULL AND file_name IS NULL)) NOT VALID,
  ADD CONSTRAINT ext_compliance_validity_bound_check
    CHECK (origin <> 'ext07_canonica' OR expiry_date IS NOT NULL) NOT VALID;

-- 4. Máquina de estados do documento canônico (INSERT): um documento só nasce
--    vigente se a validade ainda não passou na data do servidor; se já venceu,
--    só pode nascer como vencida com evaluation_date do próprio servidor.
--    `a_vencer` não é estado de nascimento canônico; cancelada/em_renovacao
--    nunca nascem por INSERT. Renovação encadeada exige que o documento
--    substituído já aponte para o novo (escrita pareada na mesma transação).
CREATE OR REPLACE FUNCTION ext_compliance_document_insert_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  prev_row ext_compliance_documents%ROWTYPE;
BEGIN
  IF NEW.origin <> 'ext07_canonica' THEN RETURN NEW; END IF;
  IF NEW.is_private IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'canonical compliance document must be private';
  END IF;
  IF NEW.storage_key IS NOT NULL OR NEW.file_url IS NOT NULL OR NEW.file_name IS NOT NULL THEN
    RAISE EXCEPTION 'canonical compliance document is a declared reference, not stored bytes';
  END IF;
  IF NEW.obligation_id IS NULL OR NEW.responsible_identity IS NULL OR NEW.validity_rule IS NULL THEN
    RAISE EXCEPTION 'canonical compliance document requires obligation, responsible and validity rule';
  END IF;
  IF NEW.expiry_date IS NULL THEN
    RAISE EXCEPTION 'canonical compliance document requires a bounded validity';
  END IF;
  IF NEW.evaluation_date IS NOT NULL AND NEW.evaluation_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'client clock is not an authority for compliance evaluation';
  END IF;
  IF NEW.status::text = 'vigente' AND NEW.expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'vigente compliance document cannot be born expired';
  END IF;
  IF NEW.status::text = 'vencida' AND (NEW.expiry_date >= CURRENT_DATE OR NEW.evaluation_date IS DISTINCT FROM CURRENT_DATE) THEN
    RAISE EXCEPTION 'vencida compliance document requires past expiry evaluated on the server date';
  END IF;
  IF NEW.status::text NOT IN ('vigente','vencida') THEN
    RAISE EXCEPTION 'canonical compliance document is born vigente or vencida only';
  END IF;
  IF NEW.replacement_of IS NOT NULL THEN
    SELECT * INTO prev_row FROM ext_compliance_documents WHERE id = NEW.replacement_of;
    IF NOT FOUND OR prev_row.origin <> 'ext07_canonica' OR prev_row.obligation_id IS DISTINCT FROM NEW.obligation_id THEN
      RAISE EXCEPTION 'renewal must reference a canonical document of the same obligation';
    END IF;
    IF prev_row.superseded_by IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'renewal must be paired: previous document must point to the new version';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_document_insert_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_insert_guard BEFORE INSERT ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_insert_guard();

-- 5. Máquina de estados do documento canônico (UPDATE): substitui a guarda da
--    153 com imutabilidade ampliada e transições temporais estruturadas.
--    - vigente/a_vencer -> vencida: só com validade vencida na data do servidor
--      e evaluation_date gravada como CURRENT_DATE na mesma escrita;
--    - vigente/a_vencer/vencida -> em_renovacao: só junto com superseded_by
--      preenchido (renovação formal, nunca alteração destrutiva);
--    - qualquer não cancelada/não superada -> cancelada: só com justificativa;
--    - cancelada e superada são terminais/imutáveis;
--    - campos estruturais, referência, validade, autoria e vínculos nunca
--      mudam; evaluation_date só muda na avaliação temporal; justificativa de
--      cancelamento só muda na transição para cancelada; superseded_by só sai
--      de NULL uma vez, junto com a transição para em_renovacao.
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  status_changed BOOLEAN := NEW.status IS DISTINCT FROM OLD.status;
  eval_changed BOOLEAN := NEW.evaluation_date IS DISTINCT FROM OLD.evaluation_date;
  just_changed BOOLEAN := NEW.cancellation_justification IS DISTINCT FROM OLD.cancellation_justification;
  sup_changed BOOLEAN := NEW.superseded_by IS DISTINCT FROM OLD.superseded_by;
  temporal_transition BOOLEAN := status_changed AND OLD.status::text IN ('vigente','a_vencer') AND NEW.status::text = 'vencida';
  renewal_transition BOOLEAN := status_changed AND OLD.status::text IN ('vigente','a_vencer','vencida') AND NEW.status::text = 'em_renovacao';
  cancel_transition BOOLEAN := status_changed AND NEW.status::text = 'cancelada';
BEGIN
  IF OLD.status::text = 'cancelada' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal compliance document cannot reopen';
  END IF;
  IF OLD.origin <> 'ext07_canonica' THEN RETURN NEW; END IF;
  IF OLD.status::text = 'cancelada' OR OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'terminal or superseded compliance document is immutable history';
  END IF;
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
     OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
     OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
     OR NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.file_url IS DISTINCT FROM OLD.file_url
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
     OR NEW.document_number IS DISTINCT FROM OLD.document_number
     OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
     OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
     OR NEW.reference_source IS DISTINCT FROM OLD.reference_source
     OR NEW.replacement_of IS DISTINCT FROM OLD.replacement_of
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.version_no IS DISTINCT FROM OLD.version_no
     OR NEW.protocol IS DISTINCT FROM OLD.protocol
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.compliance_type IS DISTINCT FROM OLD.compliance_type
     OR NEW.issuer IS DISTINCT FROM OLD.issuer
     OR NEW.responsible_name IS DISTINCT FROM OLD.responsible_name
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.validity_rule IS DISTINCT FROM OLD.validity_rule
     OR NEW.is_private IS DISTINCT FROM OLD.is_private THEN
    RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal';
  END IF;
  IF eval_changed AND NOT (temporal_transition AND NEW.evaluation_date = CURRENT_DATE AND OLD.expiry_date <= CURRENT_DATE) THEN
    RAISE EXCEPTION 'compliance evaluation date moves only in a server-clock temporal transition';
  END IF;
  IF just_changed AND NOT (cancel_transition AND char_length(COALESCE(NEW.cancellation_justification, '')) >= 10) THEN
    RAISE EXCEPTION 'cancellation justification moves only into a justified cancelada transition';
  END IF;
  IF sup_changed AND NOT (renewal_transition AND OLD.superseded_by IS NULL AND NEW.superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'superseded_by moves only once, paired with the renewal transition';
  END IF;
  IF status_changed
     AND NOT (temporal_transition AND OLD.expiry_date <= CURRENT_DATE AND NEW.evaluation_date = CURRENT_DATE)
     AND NOT (renewal_transition AND OLD.superseded_by IS NULL AND NEW.superseded_by IS NOT NULL)
     AND NOT (cancel_transition AND char_length(COALESCE(NEW.cancellation_justification, '')) >= 10) THEN
    RAISE EXCEPTION 'invalid canonical compliance document transition: % -> %', OLD.status::text, NEW.status::text;
  END IF;
  RETURN NEW;
END $$;

-- 6. Máquina de estados da tarefa: substitui a guarda da 153 adicionando o
--    mapa explícito aberta -> em_andamento/concluida/cancelada e
--    em_andamento -> concluida/cancelada; terminais imutáveis; responsável só
--    sai de NULL uma vez; conclusão exige responsável e resultado; cancelamento
--    exige justificativa.
CREATE OR REPLACE FUNCTION ext_compliance_task_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status::text IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'terminal compliance task is immutable';
  END IF;
  IF NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity AND OLD.responsible_identity IS NOT NULL THEN
    RAISE EXCEPTION 'compliance task responsible is immutable once assigned';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status::text = 'aberta' AND NEW.status::text NOT IN ('em_andamento','concluida','cancelada') THEN
      RAISE EXCEPTION 'invalid compliance task transition: % -> %', OLD.status::text, NEW.status::text;
    END IF;
    IF OLD.status::text = 'em_andamento' AND NEW.status::text NOT IN ('concluida','cancelada') THEN
      RAISE EXCEPTION 'invalid compliance task transition: % -> %', OLD.status::text, NEW.status::text;
    END IF;
  END IF;
  IF NEW.status::text = 'concluida' AND (NEW.responsible_identity IS NULL OR char_length(COALESCE(NEW.completion_result,'')) < 10) THEN
    RAISE EXCEPTION 'task completion requires responsible and result';
  END IF;
  IF NEW.status::text = 'cancelada' AND char_length(COALESCE(NEW.cancellation_justification,'')) < 10 THEN
    RAISE EXCEPTION 'task cancellation requires justification';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON COLUMN ext_compliance_documents.superseded_by IS 'Aponta para a versão que substituiu este registro; NULL = versão atual. Impede ciclos junto com a guarda de inserção pareada.';
COMMENT ON COLUMN ext_compliance_documents.renewal_justification IS 'Justificativa registrada pelo staff na renovação formal (nova versão), com autor e timestamp derivados da sessão.';
COMMENT ON INDEX ext_compliance_current_version_unique IS 'No máximo uma versão atual por obrigação: canônica, não superada e não cancelada.';

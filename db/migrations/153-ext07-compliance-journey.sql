-- EXT-07 — jornada interna canônica de compliance corporativo.
--
-- Decisão de fonte canônica: `ext_compliance_documents` (criada pela 086) é
-- preservada e endurecida como fonte canônica do documento/versão. Não há
-- tabela paralela equivalente. Linhas anteriores permanecem classificadas como
-- `registro_legado`: não há evidência suficiente para atribuir obrigação,
-- responsável canônico, autoria, privacidade, origem, regra de validade,
-- tarefa ou armazenamento verificado, e esta migração não inventa esses dados.
--
-- Decisão de fonte da tarefa: `ext_compliance_tasks`. `crm_tasks` é a fila
-- pessoal do CRM-07, presa a oportunidade/empresa e à identidade comercial
-- dona do registro; `crm_document_obligations` exige contrato ou empresa e
-- possui writer legado próprio. Nenhuma das duas impõe vínculo com obrigação
-- de compliance, privacidade documental, responsável canônico fail-closed,
-- unicidade por documento/período/regra ou idempotência. Criar uma tarefa de
-- compliance específica é, portanto, justificado e não duplica entidade
-- existente.
--
-- Fronteira documental: referência declarada e rastreável. Esta migração não
-- cria upload, bytes, checksum, varredura de malware, download ou
-- armazenamento verificado. `file_name`/`file_url`/`storage_key` da 086
-- permanecem metadados legados e não provam arquivo recebido.
--
-- Aditiva sobre 001–152. Sem seed. Sem ator externo. Sem rota pública.
BEGIN;

-- Evolução aditiva do enum legado: a 086 não comporta o estado de documento
-- formalmente substituído por uma renovação. O valor novo não é usado nesta
-- transação; todas as comparações desta migração usam `::text`.
ALTER TYPE ext_compliance_status ADD VALUE IF NOT EXISTS 'substituida';

DO $$ BEGIN CREATE TYPE ext_compliance_obligation_status AS ENUM ('rascunho','sem_documento','vigente','a_vencer','vencida','em_renovacao','nao_aplicavel','encerrada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Obrigação aplicável: escopo, fundamento declarado e justificativa de
-- aplicabilidade. Fonte declarada e rastreável; não é parecer jurídico
-- verificado nem consulta automática a órgão público.
-- ---------------------------------------------------------------------------
CREATE TABLE ext_compliance_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^OBR-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  obligation_type ext_compliance_type NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  legal_basis TEXT NOT NULL CHECK (char_length(legal_basis) BETWEEN 5 AND 500),
  basis_source TEXT NOT NULL CHECK (char_length(basis_source) BETWEEN 3 AND 300),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('entidade','unidade','contrato','operacao','outro')),
  scope_reference TEXT NOT NULL CHECK (char_length(scope_reference) BETWEEN 3 AND 200),
  applicability_justification TEXT NOT NULL CHECK (char_length(applicability_justification) BETWEEN 10 AND 2000),
  periodicity TEXT NOT NULL CHECK (periodicity IN ('unica','mensal','trimestral','semestral','anual','sem_vencimento','outra')),
  validity_rule_source TEXT NOT NULL CHECK (char_length(validity_rule_source) BETWEEN 3 AND 300),
  renewal_window_days INT NOT NULL CHECK (renewal_window_days BETWEEN 0 AND 365),
  criticality TEXT CHECK (criticality IS NULL OR criticality IN ('baixa','media','alta','critica')),
  status ext_compliance_obligation_status NOT NULL DEFAULT 'sem_documento',
  responsible_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  closed_at TIMESTAMPTZ,
  closed_by_identity UUID REFERENCES auth_identities(id),
  closure_justification TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status::text NOT IN ('nao_aplicavel','encerrada') AND closed_at IS NULL AND closed_by_identity IS NULL AND closure_justification IS NULL)
    OR (status::text IN ('nao_aplicavel','encerrada') AND closed_at IS NOT NULL AND closed_by_identity IS NOT NULL AND char_length(closure_justification) BETWEEN 10 AND 1000)
  ),
  CHECK (periodicity <> 'sem_vencimento' OR renewal_window_days = 0)
);
CREATE INDEX ext_compliance_obligations_status_idx ON ext_compliance_obligations(status, created_at DESC);
CREATE INDEX ext_compliance_obligations_responsible_idx ON ext_compliance_obligations(responsible_identity);
CREATE INDEX ext_compliance_obligations_scope_idx ON ext_compliance_obligations(scope_kind, scope_reference);
COMMENT ON COLUMN ext_compliance_obligations.legal_basis IS 'Fundamento declarado e rastreável. Não é parecer jurídico verificado nem consulta a órgão público.';
COMMENT ON COLUMN ext_compliance_obligations.applicability_justification IS 'Aplicabilidade declarada pela equipe interna, com fonte; não há integração regulatória real.';

-- ---------------------------------------------------------------------------
-- Documento canônico: a 086 é endurecida, não substituída.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS obligation_id UUID REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supersedes_document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  -- DEFERRABLE: a renovação encerra a versão anterior e insere a nova na mesma
  -- transação, sem janela em que duas versões sejam simultaneamente atuais.
  ADD COLUMN IF NOT EXISTS superseded_by_document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supersede_reason TEXT,
  ADD COLUMN IF NOT EXISTS validity_start DATE,
  ADD COLUMN IF NOT EXISTS no_expiry BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validity_rule_source TEXT,
  ADD COLUMN IF NOT EXISTS renewal_window_days INT,
  ADD COLUMN IF NOT EXISTS evaluation_base_date DATE,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reference_kind TEXT,
  ADD COLUMN IF NOT EXISTS reference_value TEXT,
  ADD COLUMN IF NOT EXISTS reference_source TEXT,
  ADD COLUMN IF NOT EXISTS reference_note TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT;

ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_origin_check
  CHECK (origin IN ('registro_legado','jornada_canonica')) NOT VALID;
-- Privacidade canônica imposta pelo banco: documento da jornada é sempre privado,
-- sempre vinculado a uma obrigação e sempre tem responsável e autor canônicos.
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_canonical_check
  CHECK (origin <> 'jornada_canonica' OR (
    obligation_id IS NOT NULL AND responsible_identity IS NOT NULL AND created_by_identity IS NOT NULL
    AND is_private = true AND version >= 1
  )) NOT VALID;
-- Referência documental declarada: não é upload nem armazenamento verificado.
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_reference_check
  CHECK (origin <> 'jornada_canonica' OR (
    reference_kind IN ('referencia_declarada','sem_referencia')
    AND (reference_kind = 'sem_referencia' OR char_length(reference_value) BETWEEN 3 AND 500)
    AND (reference_kind = 'sem_referencia' OR char_length(reference_source) BETWEEN 3 AND 300)
  )) NOT VALID;
-- Regra temporal: ausência de vencimento é declarada, nunca inferida do silêncio.
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_validity_check
  CHECK (origin <> 'jornada_canonica' OR (
    issue_date IS NOT NULL AND validity_start IS NOT NULL AND validity_start >= issue_date
    AND char_length(validity_rule_source) BETWEEN 3 AND 300
    AND renewal_window_days IS NOT NULL AND renewal_window_days BETWEEN 0 AND 365
    AND ((no_expiry = true AND expiry_date IS NULL AND renewal_window_days = 0)
      OR (no_expiry = false AND expiry_date IS NOT NULL AND expiry_date >= validity_start))
  )) NOT VALID;
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_supersede_check
  CHECK (
    (supersedes_document_id IS NULL OR supersedes_document_id <> id)
    AND (superseded_by_document_id IS NULL OR superseded_by_document_id <> id)
    AND ((superseded_by_document_id IS NULL AND superseded_at IS NULL AND supersede_reason IS NULL)
      OR (superseded_by_document_id IS NOT NULL AND superseded_at IS NOT NULL AND char_length(supersede_reason) BETWEEN 10 AND 1000))
  ) NOT VALID;
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_cancel_check
  CHECK (
    (status::text <> 'cancelada' AND cancelled_at IS NULL AND cancelled_by_identity IS NULL AND cancellation_justification IS NULL)
    OR (status::text = 'cancelada' AND (origin <> 'jornada_canonica' OR (cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL AND char_length(cancellation_justification) BETWEEN 10 AND 1000)))
  ) NOT VALID;
-- Estado terminal/substituído nunca é "atual"; estado vigente exige ser atual.
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_current_state_check
  CHECK (origin <> 'jornada_canonica' OR (
    (is_current = false AND status::text IN ('substituida','cancelada'))
    OR (is_current = true AND status::text IN ('vigente','a_vencer','vencida','em_renovacao'))
  )) NOT VALID;

-- Exatamente um documento atual por obrigação.
CREATE UNIQUE INDEX ext_compliance_documents_current_per_obligation
  ON ext_compliance_documents(obligation_id) WHERE is_current AND obligation_id IS NOT NULL;
-- Um documento só pode ser substituído uma vez: impede ciclos e bifurcações.
CREATE UNIQUE INDEX ext_compliance_documents_supersedes_once
  ON ext_compliance_documents(supersedes_document_id) WHERE supersedes_document_id IS NOT NULL;
CREATE UNIQUE INDEX ext_compliance_documents_obligation_version
  ON ext_compliance_documents(obligation_id, version) WHERE obligation_id IS NOT NULL;
CREATE INDEX ext_compliance_documents_obligation_idx ON ext_compliance_documents(obligation_id, created_at DESC);

COMMENT ON COLUMN ext_compliance_documents.origin IS 'registro_legado = linha anterior à 153, sem obrigação, responsável canônico, autoria, privacidade, regra de validade, tarefa ou armazenamento comprovados.';
COMMENT ON COLUMN ext_compliance_documents.responsible_name IS 'LEGADO 086: projeção nominal. A jornada canônica deriva o nome de auth_identities; este campo nunca é fonte de autoridade.';
COMMENT ON COLUMN ext_compliance_documents.file_url IS 'LEGADO 086: metadado declarado. Não prova upload, recebimento, checksum, armazenamento ou download.';
COMMENT ON COLUMN ext_compliance_documents.storage_key IS 'LEGADO 086: metadado declarado. A jornada canônica não grava bytes nem armazenamento verificado.';
COMMENT ON COLUMN ext_compliance_documents.reference_value IS 'Referência documental privada declarada e rastreável; não é arquivo verificado.';

-- ---------------------------------------------------------------------------
-- Tarefa de compliance gerada por vencimento (critério de aceite).
-- ---------------------------------------------------------------------------
CREATE TABLE ext_compliance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^TRF-COMP-[0-9]{8}-[A-Z0-9]{4}$'),
  obligation_id UUID NOT NULL REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  trigger_rule TEXT NOT NULL CHECK (trigger_rule IN ('janela_renovacao','vencimento')),
  trigger_rule_detail JSONB NOT NULL,
  trigger_facts JSONB NOT NULL,
  evaluation_base_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  responsible_identity UUID REFERENCES auth_identities(id),
  pending_reason TEXT,
  started_at TIMESTAMPTZ,
  started_by_identity UUID REFERENCES auth_identities(id),
  completed_at TIMESTAMPTZ,
  completed_by_identity UUID REFERENCES auth_identities(id),
  completion_result TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_identity UUID REFERENCES auth_identities(id),
  cancellation_justification TEXT,
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  -- Fail-closed: ou existe responsável staff canônico, ou a pendência é explícita.
  CHECK ((responsible_identity IS NOT NULL AND pending_reason IS NULL)
      OR (responsible_identity IS NULL AND char_length(pending_reason) BETWEEN 10 AND 500)),
  CHECK ((status <> 'em_andamento' AND status <> 'concluida') OR (started_at IS NOT NULL AND started_by_identity IS NOT NULL)),
  CHECK ((status <> 'concluida' AND completed_at IS NULL AND completed_by_identity IS NULL AND completion_result IS NULL)
      OR (status = 'concluida' AND completed_at IS NOT NULL AND completed_by_identity IS NOT NULL
          AND responsible_identity IS NOT NULL AND char_length(completion_result) BETWEEN 10 AND 2000)),
  CHECK ((status <> 'cancelada' AND cancelled_at IS NULL AND cancelled_by_identity IS NULL AND cancellation_justification IS NULL)
      OR (status = 'cancelada' AND cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL
          AND char_length(cancellation_justification) BETWEEN 10 AND 1000)),
  -- Exatamente uma tarefa por documento/período/regra.
  UNIQUE (document_id, period_end, trigger_rule)
);
CREATE INDEX ext_compliance_tasks_obligation_idx ON ext_compliance_tasks(obligation_id, created_at DESC);
CREATE INDEX ext_compliance_tasks_status_idx ON ext_compliance_tasks(status, period_end);
COMMENT ON TABLE ext_compliance_tasks IS 'Fonte da tarefa de compliance. crm_tasks (fila pessoal CRM-07) e crm_document_obligations (preso a contrato/empresa) não impõem vínculo, privacidade, responsável fail-closed nem unicidade por documento/período/regra.';

-- ---------------------------------------------------------------------------
-- Eventos imutáveis + ledger de idempotência por identidade staff.
-- ---------------------------------------------------------------------------
CREATE TABLE ext_compliance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  task_id UUID REFERENCES ext_compliance_tasks(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 100),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by_identity, idempotency_key)
);
CREATE INDEX ext_compliance_events_obligation_idx ON ext_compliance_events(obligation_id, created_at DESC);
CREATE INDEX ext_compliance_events_document_idx ON ext_compliance_events(document_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Imutabilidade e máquinas de estado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ext_compliance_immutable_row() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'compliance historical record is immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_compliance_events_immutable BEFORE UPDATE OR DELETE ON ext_compliance_events
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_immutable_row();

CREATE OR REPLACE FUNCTION ext_compliance_guard_obligation_update() RETURNS TRIGGER AS $$
DECLARE allowed BOOLEAN;
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.obligation_type IS DISTINCT FROM OLD.obligation_type OR NEW.legal_basis IS DISTINCT FROM OLD.legal_basis
     OR NEW.basis_source IS DISTINCT FROM OLD.basis_source OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
     OR NEW.scope_reference IS DISTINCT FROM OLD.scope_reference
     OR NEW.applicability_justification IS DISTINCT FROM OLD.applicability_justification
     OR NEW.periodicity IS DISTINCT FROM OLD.periodicity OR NEW.validity_rule_source IS DISTINCT FROM OLD.validity_rule_source
     OR NEW.renewal_window_days IS DISTINCT FROM OLD.renewal_window_days
     OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.protocol IS DISTINCT FROM OLD.protocol THEN
    RAISE EXCEPTION 'canonical compliance obligation fields are immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status::text
      WHEN 'rascunho' THEN NEW.status::text IN ('sem_documento','nao_aplicavel','encerrada')
      WHEN 'sem_documento' THEN NEW.status::text IN ('vigente','a_vencer','vencida','nao_aplicavel','encerrada')
      WHEN 'vigente' THEN NEW.status::text IN ('a_vencer','vencida','em_renovacao','sem_documento','nao_aplicavel','encerrada')
      WHEN 'a_vencer' THEN NEW.status::text IN ('vencida','em_renovacao','vigente','sem_documento','nao_aplicavel','encerrada')
      WHEN 'vencida' THEN NEW.status::text IN ('em_renovacao','vigente','sem_documento','nao_aplicavel','encerrada')
      WHEN 'em_renovacao' THEN NEW.status::text IN ('vigente','a_vencer','vencida','sem_documento','nao_aplicavel','encerrada')
      ELSE FALSE END;
    IF NOT allowed THEN RAISE EXCEPTION 'invalid compliance obligation transition: % -> %', OLD.status, NEW.status; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_compliance_guard_obligation_update_trg BEFORE UPDATE ON ext_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_guard_obligation_update();

CREATE OR REPLACE FUNCTION ext_compliance_guard_document_update() RETURNS TRIGGER AS $$
DECLARE allowed BOOLEAN;
BEGIN
  IF OLD.origin = 'jornada_canonica' THEN
    -- Sem sobrescrita destrutiva de identidade documental, validade ou vínculo.
    IF NEW.protocol IS DISTINCT FROM OLD.protocol OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description OR NEW.compliance_type IS DISTINCT FROM OLD.compliance_type
       OR NEW.document_number IS DISTINCT FROM OLD.document_number OR NEW.issuer IS DISTINCT FROM OLD.issuer
       OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
       OR NEW.responsible_name IS DISTINCT FROM OLD.responsible_name
       OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
       OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR NEW.validity_start IS DISTINCT FROM OLD.validity_start
       OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date OR NEW.no_expiry IS DISTINCT FROM OLD.no_expiry
       OR NEW.validity_rule_source IS DISTINCT FROM OLD.validity_rule_source
       OR NEW.renewal_window_days IS DISTINCT FROM OLD.renewal_window_days
       OR NEW.reference_kind IS DISTINCT FROM OLD.reference_kind
       OR NEW.reference_value IS DISTINCT FROM OLD.reference_value
       OR NEW.reference_source IS DISTINCT FROM OLD.reference_source
       OR NEW.is_private IS DISTINCT FROM OLD.is_private
       OR NEW.supersedes_document_id IS DISTINCT FROM OLD.supersedes_document_id THEN
      RAISE EXCEPTION 'canonical compliance document fields are immutable';
    END IF;
    IF OLD.status::text IN ('substituida','cancelada') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'terminal compliance document is immutable';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      allowed := CASE OLD.status::text
        WHEN 'vigente' THEN NEW.status::text IN ('a_vencer','vencida','em_renovacao','cancelada')
        WHEN 'a_vencer' THEN NEW.status::text IN ('vencida','em_renovacao','cancelada')
        WHEN 'vencida' THEN NEW.status::text IN ('em_renovacao','substituida','cancelada')
        WHEN 'em_renovacao' THEN NEW.status::text IN ('substituida','vencida','cancelada')
        ELSE FALSE END;
      IF NOT allowed THEN RAISE EXCEPTION 'invalid compliance document transition: % -> %', OLD.status, NEW.status; END IF;
    END IF;
    -- "vigente" é incompatível com validade já alcançada na data-base do servidor.
    IF NEW.status::text = 'vigente' AND NEW.no_expiry = false AND NEW.expiry_date <= CURRENT_DATE THEN
      RAISE EXCEPTION 'compliance document cannot be vigente after expiry date';
    END IF;
    IF NEW.status::text = 'vencida' AND NEW.no_expiry = false AND NEW.expiry_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'compliance document cannot be vencida before expiry date';
    END IF;
    IF NEW.superseded_by_document_id IS NOT NULL AND OLD.superseded_by_document_id IS NOT NULL
       AND NEW.superseded_by_document_id IS DISTINCT FROM OLD.superseded_by_document_id THEN
      RAISE EXCEPTION 'compliance document supersession is immutable';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_compliance_guard_document_update_trg BEFORE UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_guard_document_update();

-- O estado inicial do documento canônico é derivado da data-base do servidor e
-- da janela registrada na obrigação; nunca é aceito arbitrariamente.
CREATE OR REPLACE FUNCTION ext_compliance_guard_document_insert() RETURNS TRIGGER AS $$
DECLARE derived TEXT;
BEGIN
  IF NEW.origin <> 'jornada_canonica' THEN RETURN NEW; END IF;
  IF NEW.no_expiry THEN derived := 'vigente';
  ELSIF NEW.expiry_date <= CURRENT_DATE THEN derived := 'vencida';
  ELSIF (NEW.expiry_date - CURRENT_DATE) <= NEW.renewal_window_days THEN derived := 'a_vencer';
  ELSE derived := 'vigente';
  END IF;
  IF NEW.status::text <> derived THEN
    RAISE EXCEPTION 'compliance document state must be derived from server base date: expected %, got %', derived, NEW.status;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_compliance_guard_document_insert_trg BEFORE INSERT ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_guard_document_insert();

CREATE OR REPLACE FUNCTION ext_compliance_guard_task_update() RETURNS TRIGGER AS $$
DECLARE allowed BOOLEAN;
BEGIN
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end
     OR NEW.trigger_rule IS DISTINCT FROM OLD.trigger_rule
     OR NEW.trigger_rule_detail::text IS DISTINCT FROM OLD.trigger_rule_detail::text
     OR NEW.trigger_facts::text IS DISTINCT FROM OLD.trigger_facts::text
     OR NEW.evaluation_base_date IS DISTINCT FROM OLD.evaluation_base_date
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
     OR NEW.protocol IS DISTINCT FROM OLD.protocol THEN
    RAISE EXCEPTION 'canonical compliance task fields are immutable';
  END IF;
  IF OLD.status IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'terminal compliance task is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'aberta' THEN NEW.status IN ('em_andamento','cancelada')
      WHEN 'em_andamento' THEN NEW.status IN ('concluida','cancelada')
      ELSE FALSE END;
    IF NOT allowed THEN RAISE EXCEPTION 'invalid compliance task transition: % -> %', OLD.status, NEW.status; END IF;
  END IF;
  IF NEW.status = 'concluida' AND (NEW.responsible_identity IS NULL OR NEW.pending_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'compliance task completion requires a canonical responsible identity';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ext_compliance_guard_task_update_trg BEFORE UPDATE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_guard_task_update();

DROP TRIGGER IF EXISTS ext_compliance_obligations_touch ON ext_compliance_obligations;
CREATE TRIGGER ext_compliance_obligations_touch BEFORE UPDATE ON ext_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();

COMMIT;

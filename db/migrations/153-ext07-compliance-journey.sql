-- EXT-07 — compliance corporativo: obrigação aplicável, documento/referência privada,
-- validade com data-base do servidor, versionamento/renovação e tarefa única por vencimento.
-- Aditiva sobre 001–152. ext_compliance_documents (086) é endurecida como fonte canônica:
-- nenhuma tabela paralela equivalente de documento é criada.
-- Linhas antigas da 086 permanecem origin='registro_legado'; nenhuma obrigação, responsável,
-- autoria, privacidade, regra de validade, tarefa ou armazenamento é inventado retroativamente.
-- Comparações com listas TEXT[]/literais usam ::text para não depender do enum no mesmo commit.
ALTER TYPE ext_compliance_status ADD VALUE IF NOT EXISTS 'substituida';

CREATE TABLE IF NOT EXISTS ext_compliance_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^OBR-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  obligation_type ext_compliance_type NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  -- Fundamento DECLARADO pela gestão. Não é parecer jurídico verificado nem consulta a órgão público.
  legal_basis TEXT NOT NULL CHECK (char_length(legal_basis) BETWEEN 5 AND 500),
  basis_kind TEXT NOT NULL CHECK (basis_kind IN ('declarada_interna','norma_citada','contrato','outro')),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('entidade','unidade','contrato','operacao')),
  scope_label TEXT NOT NULL CHECK (char_length(scope_label) BETWEEN 3 AND 200),
  applicability_justification TEXT NOT NULL CHECK (char_length(applicability_justification) BETWEEN 10 AND 2000),
  periodicity TEXT NOT NULL CHECK (periodicity IN ('unica','mensal','trimestral','semestral','anual','sob_demanda')),
  -- Regra explícita e armazenada de geração de tarefa. Não há limiar global oculto.
  renewal_window_days INTEGER NOT NULL CHECK (renewal_window_days BETWEEN 0 AND 365),
  criticality TEXT CHECK (criticality IS NULL OR criticality IN ('baixa','media','alta','critica')),
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','encerrada','nao_aplicavel')),
  closure_justification TEXT CHECK (closure_justification IS NULL OR char_length(closure_justification) BETWEEN 10 AND 1000),
  closed_at TIMESTAMPTZ,
  closed_by_identity UUID REFERENCES auth_identities(id),
  responsible_identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_compliance_obligation_closure_shape CHECK (
    (status = 'ativa' AND closure_justification IS NULL AND closed_at IS NULL AND closed_by_identity IS NULL)
    OR (status IN ('encerrada','nao_aplicavel') AND closure_justification IS NOT NULL AND closed_at IS NOT NULL AND closed_by_identity IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ext_compliance_obligations_status_idx ON ext_compliance_obligations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ext_compliance_obligations_responsible_idx ON ext_compliance_obligations(responsible_identity_id);
COMMENT ON TABLE ext_compliance_obligations IS 'EXT-07 (153): obrigação aplicável declarada e rastreável. legal_basis/applicability_justification são declaração interna, não parecer jurídico verificado nem consulta regulatória.';

ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS obligation_id UUID REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS responsible_identity_id UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS has_expiry BOOLEAN,
  ADD COLUMN IF NOT EXISTS reference_kind TEXT,
  ADD COLUMN IF NOT EXISTS reference_declared TEXT,
  ADD COLUMN IF NOT EXISTS reference_source TEXT,
  ADD COLUMN IF NOT EXISTS reference_note TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS superseded_by_document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS renewal_justification TEXT,
  ADD COLUMN IF NOT EXISTS state_rule JSONB,
  ADD COLUMN IF NOT EXISTS state_base_date DATE,
  ADD COLUMN IF NOT EXISTS state_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT;

ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_origin_check
  CHECK (origin IN ('registro_legado','ext07_canonica')) NOT VALID;

-- Registro canônico: obrigação, responsável canônico, autoria, vigência e privacidade são obrigatórios.
-- O metadado documental é explicitamente uma REFERÊNCIA DECLARADA; não prova upload, bytes, checksum nem armazenamento verificado.
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_canonical_shape CHECK (
  origin <> 'ext07_canonica' OR (
    obligation_id IS NOT NULL
    AND responsible_identity_id IS NOT NULL
    AND created_by_identity IS NOT NULL
    AND is_private = true
    AND valid_from IS NOT NULL
    AND has_expiry IS NOT NULL
    AND (issue_date IS NULL OR valid_from >= issue_date)
    AND ((has_expiry = true AND expiry_date IS NOT NULL AND expiry_date >= valid_from)
      OR (has_expiry = false AND expiry_date IS NULL))
    AND reference_kind IN ('referencia_declarada','protocolo_externo','via_fisica','outro')
    AND char_length(reference_declared) BETWEEN 3 AND 500
    AND char_length(reference_source) BETWEEN 3 AND 300
    AND version >= 1
    AND state_rule IS NOT NULL
    AND state_base_date IS NOT NULL
  )
) NOT VALID;

-- Estado temporal não pode contradizer a data-base do servidor.
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_temporal_state CHECK (
  origin <> 'ext07_canonica' OR has_expiry = false OR expiry_date IS NULL OR state_base_date IS NULL OR (
    (status::text <> 'vigente' OR expiry_date >= state_base_date)
    AND (status::text <> 'vencida' OR expiry_date < state_base_date)
  )
) NOT VALID;

ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_terminal_shape CHECK (
  origin <> 'ext07_canonica' OR (
    (status::text <> 'cancelada' OR (cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL AND char_length(cancellation_justification) BETWEEN 10 AND 1000))
    AND (status::text <> 'substituida' OR superseded_by_document_id IS NOT NULL)
  )
) NOT VALID;

-- Impede ciclo direto de substituição e autossubstituição.
ALTER TABLE ext_compliance_documents ADD CONSTRAINT ext_compliance_documents_no_self_supersede CHECK (
  (supersedes_document_id IS NULL OR supersedes_document_id <> id)
  AND (superseded_by_document_id IS NULL OR superseded_by_document_id <> id)
  AND (supersedes_document_id IS NULL OR superseded_by_document_id IS NULL OR supersedes_document_id <> superseded_by_document_id)
) NOT VALID;

-- Uma única versão atual por obrigação; renovação cria versão nova sem apagar a anterior.
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_documents_current_unique
  ON ext_compliance_documents(obligation_id) WHERE origin = 'ext07_canonica' AND is_current;
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_documents_version_unique
  ON ext_compliance_documents(obligation_id, version) WHERE origin = 'ext07_canonica';
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_documents_supersedes_unique
  ON ext_compliance_documents(supersedes_document_id) WHERE supersedes_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_compliance_documents_obligation_idx ON ext_compliance_documents(obligation_id, version DESC);
COMMENT ON TABLE ext_compliance_documents IS 'Fonte canônica EXT-07 a partir da 153; origin distingue registros históricos da 086. file_name/file_url/storage_key são metadados legados e NÃO provam upload, bytes, checksum, varredura ou armazenamento verificado.';
COMMENT ON COLUMN ext_compliance_documents.reference_declared IS 'Referência documental privada DECLARADA por staff. Não é arquivo armazenado nem verificado.';
COMMENT ON COLUMN ext_compliance_documents.responsible_name IS 'LEGADO 086: nome nominal. Não é fonte de autoridade; a identidade canônica é responsible_identity_id.';

-- Tarefa dedicada de compliance. Justificativa de não reuso registrada por inspeção/execução:
-- crm_tasks (014) tem escopo/autorização CRM (opportunity/company), sem vínculo a documento/período,
-- sem ledger de idempotência, sem privacidade, sem imutabilidade e sem unicidade por vencimento;
-- crm_document_obligations (037) modela documento contratual do cliente, não compliance corporativo.
CREATE TABLE IF NOT EXISTS ext_compliance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  validity_period_start DATE NOT NULL,
  validity_period_end DATE NOT NULL,
  trigger_rule JSONB NOT NULL,
  trigger_rule_key TEXT NOT NULL CHECK (char_length(trigger_rule_key) BETWEEN 3 AND 120),
  trigger_facts JSONB NOT NULL,
  base_date DATE NOT NULL,
  responsible_identity_id UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  pending_reason TEXT CHECK (pending_reason IS NULL OR char_length(pending_reason) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  started_at TIMESTAMPTZ,
  started_by_identity UUID REFERENCES auth_identities(id),
  completed_at TIMESTAMPTZ,
  completed_by_identity UUID REFERENCES auth_identities(id),
  completion_result TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_identity UUID REFERENCES auth_identities(id),
  cancellation_justification TEXT,
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_compliance_tasks_period_shape CHECK (validity_period_end >= validity_period_start),
  -- Fail-closed: sem responsável canônico a tarefa nasce pendente e não pode ser concluída.
  CONSTRAINT ext_compliance_tasks_pending_shape CHECK (
    (responsible_identity_id IS NOT NULL AND pending_reason IS NULL)
    OR (responsible_identity_id IS NULL AND pending_reason IS NOT NULL)
  ),
  CONSTRAINT ext_compliance_tasks_terminal_shape CHECK (
    (status = 'aberta' AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'em_andamento' AND started_at IS NOT NULL AND started_by_identity IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'concluida' AND completed_at IS NOT NULL AND completed_by_identity IS NOT NULL
        AND responsible_identity_id IS NOT NULL AND pending_reason IS NULL
        AND char_length(completion_result) BETWEEN 10 AND 2000 AND cancelled_at IS NULL)
    OR (status = 'cancelada' AND cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL
        AND char_length(cancellation_justification) BETWEEN 10 AND 1000 AND completed_at IS NULL)
  )
);
-- "Vencimento gera tarefa": exatamente uma por documento/período/regra.
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_tasks_unique_per_expiry
  ON ext_compliance_tasks(document_id, validity_period_end, trigger_rule_key);
CREATE INDEX IF NOT EXISTS ext_compliance_tasks_obligation_idx ON ext_compliance_tasks(obligation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ext_compliance_tasks_status_idx ON ext_compliance_tasks(status, validity_period_end);
COMMENT ON TABLE ext_compliance_tasks IS 'EXT-07 (153): tarefa canônica de vencimento de compliance. Criada na mesma transação que avalia o vencimento; nunca aceita responsável, vínculo ou estado pelo corpo da requisição.';

CREATE TABLE IF NOT EXISTS ext_compliance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  task_id UUID REFERENCES ext_compliance_tasks(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 100),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(actor_identity_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ext_compliance_events_obligation_idx ON ext_compliance_events(obligation_id, created_at);
COMMENT ON TABLE ext_compliance_events IS 'EXT-07 (153): evento histórico imutável e ledger de idempotência por identidade staff.';

CREATE OR REPLACE FUNCTION ext_compliance_immutable() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'compliance historical record is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_compliance_event_immutable ON ext_compliance_events;
CREATE TRIGGER ext_compliance_event_immutable BEFORE UPDATE OR DELETE ON ext_compliance_events
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_immutable();

-- Documento canônico: identidade, vínculo, validade, número, emissor, referência e privacidade
-- não podem ser sobrescritos destrutivamente; correção exige substituição formal.
CREATE OR REPLACE FUNCTION ext_compliance_guard_document() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.origin = 'ext07_canonica' THEN
    IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
      OR NEW.origin IS DISTINCT FROM OLD.origin
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
      OR NEW.responsible_identity_id IS DISTINCT FROM OLD.responsible_identity_id
      OR NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.issuer IS DISTINCT FROM OLD.issuer
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
      OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
      OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
      OR NEW.has_expiry IS DISTINCT FROM OLD.has_expiry
      OR NEW.reference_kind IS DISTINCT FROM OLD.reference_kind
      OR NEW.reference_declared IS DISTINCT FROM OLD.reference_declared
      OR NEW.reference_source IS DISTINCT FROM OLD.reference_source
      OR NEW.supersedes_document_id IS DISTINCT FROM OLD.supersedes_document_id
      OR NEW.state_rule IS DISTINCT FROM OLD.state_rule
      OR NEW.is_private IS DISTINCT FROM OLD.is_private
    THEN RAISE EXCEPTION 'canonical compliance document fields are immutable'; END IF;
    IF OLD.status::text IN ('cancelada','substituida') AND NEW.status::text <> OLD.status::text
      THEN RAISE EXCEPTION 'terminal compliance document state cannot reopen silently'; END IF;
    IF OLD.superseded_by_document_id IS NOT NULL AND NEW.superseded_by_document_id IS DISTINCT FROM OLD.superseded_by_document_id
      THEN RAISE EXCEPTION 'compliance supersession link is immutable'; END IF;
    IF OLD.is_current = false AND NEW.is_current = true
      THEN RAISE EXCEPTION 'superseded compliance version cannot become current again'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_compliance_guard_document_trg ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_guard_document_trg BEFORE UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_guard_document();

CREATE OR REPLACE FUNCTION ext_compliance_guard_task() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
    OR NEW.document_id IS DISTINCT FROM OLD.document_id
    OR NEW.responsible_identity_id IS DISTINCT FROM OLD.responsible_identity_id
    OR NEW.trigger_rule IS DISTINCT FROM OLD.trigger_rule
    OR NEW.trigger_rule_key IS DISTINCT FROM OLD.trigger_rule_key
    OR NEW.trigger_facts IS DISTINCT FROM OLD.trigger_facts
    OR NEW.base_date IS DISTINCT FROM OLD.base_date
    OR NEW.validity_period_end IS DISTINCT FROM OLD.validity_period_end
    OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
  THEN RAISE EXCEPTION 'canonical compliance task fields are immutable'; END IF;
  IF OLD.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'terminal compliance task is immutable'; END IF;
  IF OLD.status = 'aberta' AND NEW.status NOT IN ('aberta','em_andamento','concluida','cancelada')
    THEN RAISE EXCEPTION 'invalid compliance task transition'; END IF;
  IF OLD.status = 'em_andamento' AND NEW.status NOT IN ('em_andamento','concluida','cancelada')
    THEN RAISE EXCEPTION 'invalid compliance task transition'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_compliance_guard_task_trg ON ext_compliance_tasks;
CREATE TRIGGER ext_compliance_guard_task_trg BEFORE UPDATE ON ext_compliance_tasks
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_guard_task();

CREATE OR REPLACE FUNCTION ext_compliance_guard_obligation() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.protocol IS DISTINCT FROM OLD.protocol
    OR NEW.obligation_type IS DISTINCT FROM OLD.obligation_type
    OR NEW.legal_basis IS DISTINCT FROM OLD.legal_basis
    OR NEW.basis_kind IS DISTINCT FROM OLD.basis_kind
    OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
    OR NEW.scope_label IS DISTINCT FROM OLD.scope_label
    OR NEW.applicability_justification IS DISTINCT FROM OLD.applicability_justification
    OR NEW.periodicity IS DISTINCT FROM OLD.periodicity
    OR NEW.renewal_window_days IS DISTINCT FROM OLD.renewal_window_days
    OR NEW.responsible_identity_id IS DISTINCT FROM OLD.responsible_identity_id
    OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
  THEN RAISE EXCEPTION 'canonical compliance obligation configuration is immutable'; END IF;
  IF OLD.status IN ('encerrada','nao_aplicavel') AND NEW.status <> OLD.status
    THEN RAISE EXCEPTION 'terminal compliance obligation cannot reopen silently'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_compliance_guard_obligation_trg ON ext_compliance_obligations;
CREATE TRIGGER ext_compliance_guard_obligation_trg BEFORE UPDATE ON ext_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_guard_obligation();

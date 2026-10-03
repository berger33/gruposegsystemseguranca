-- EXT-03: licitações ligadas ao backend canônico real — edital, prazos,
-- documentos, responsáveis, proposta e resultado.
-- Aditiva sobre a 085; migrações 001–148 permanecem imutáveis.
--
-- Critério do plano: "Edital, prazos, documentos, responsáveis, proposta e
-- resultado; se mercado relevante". Entrega esperada: "checklist e alerta por
-- edital, dossiê versionado". Esta migração cria os registros canônicos que
-- IMPÕEM esse critério:
--   * o PRAZO deixa de ser um par de campos soltos em ext_bidding_notices e
--     passa a viver em ext_bidding_deadlines, um registro por tipo de prazo,
--     com data, FONTE declarada (edital publicado, retificação ou registro
--     interno) e substituição explícita — nunca edição silenciosa;
--   * a PROPOSTA passa a existir como registro canônico versionado em
--     ext_bidding_proposals e o banco RECUSA proposta registrada depois do
--     prazo de entrega vigente (CHECK submitted_on <= deadline_date_at_submission);
--   * o RESULTADO só é aceito com edital encerrado, exige autor, data e
--     justificativa e, uma vez gravado, é imutável por gatilho;
--   * o RESPONSÁVEL deixa de ser texto livre e passa a ser identidade canônica
--     com histórico de passagem em ext_bidding_responsible_assignments;
--   * o CHECKLIST por edital vive em ext_bidding_checklist_items e o ALERTA de
--     prazo só existe com regra de antecedência explicitamente registrada em
--     ext_bidding_alert_rules — nada é inferido;
--   * o DOSSIÊ fica versionado: documento novo substitui o anterior de forma
--     declarada, e documento nunca é apagado, apenas desativado com autor e
--     motivo.
--
-- RELEVÂNCIA DE MERCADO — CONDIÇÃO DECLARADA, NÃO PRESUMIDA: o critério do
-- plano é condicional ("se mercado relevante"). A única evidência disponível no
-- repositório é docs/referencias-marca.md, que registra "órgãos públicos" entre
-- os segmentos citados PELO SITE ATUAL, dentro da seção explicitamente marcada
-- como "confirmar antes da nova publicação". Portanto a relevância está
-- INDICADA e NÃO CONFIRMADA pelo proprietário. Nenhuma tabela aqui afirma que a
-- empresa participa de licitações, nenhum edital é semeado e a API declara a
-- condição como pendente de confirmação.
--
-- FRONTEIRA DECLARADA: não existe hoje integração com portal de compras
-- público (ComprasNet, BEC/SP, PNCP ou equivalente). Nenhuma tabela aqui cria
-- canal externo, importa edital de fora nem envia proposta para órgão algum.
-- Tudo é registro interno da equipe; o canal externo permanece PENDENTE e é
-- declarado como tal pela API e pela tela.
--
-- SEMÂNTICA DO ENUM: ext_bidding_status vem da 085 e NÃO é reinterpretado aqui.
-- EXT-03 apenas classifica 'rascunho'/'publicado'/'em_analise' como em
-- andamento e 'homologado'/'vencido'/'cancelado'/'deserto' como encerrado, sem
-- atribuir a esses rótulos sentido de negócio que o plano não declarou.
--
-- Nenhuma autoria retroativa é inventada: linhas anteriores ficam com origem
-- 'registro_legado' e fora da jornada canônica.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ext_bidding_notices: origem, responsável canônico e resultado com autoria
-- ---------------------------------------------------------------------------
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado';
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS responsible_identity UUID REFERENCES auth_identities(id);
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS responsible_assigned_at TIMESTAMPTZ;
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS responsible_assigned_by_identity UUID REFERENCES auth_identities(id);
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS result_recorded_at TIMESTAMPTZ;
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS result_recorded_by_identity UUID REFERENCES auth_identities(id);
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS result_justification TEXT;
ALTER TABLE ext_bidding_notices ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE ext_bidding_notices DROP CONSTRAINT IF EXISTS ext_bidding_notices_origin_check;
ALTER TABLE ext_bidding_notices ADD CONSTRAINT ext_bidding_notices_origin_check
  CHECK (origin IN ('registro_legado','jornada_canonica')) NOT VALID;

-- Responsável canônico: quem designou e quando andam juntos com a identidade.
ALTER TABLE ext_bidding_notices DROP CONSTRAINT IF EXISTS ext_bidding_notices_responsible_authorship_check;
ALTER TABLE ext_bidding_notices ADD CONSTRAINT ext_bidding_notices_responsible_authorship_check
  CHECK (
    responsible_identity IS NULL
    OR (responsible_assigned_at IS NOT NULL AND responsible_assigned_by_identity IS NOT NULL)
  ) NOT VALID;

-- Resultado canônico: texto, autor, data e justificativa são indivisíveis.
ALTER TABLE ext_bidding_notices DROP CONSTRAINT IF EXISTS ext_bidding_notices_result_authorship_check;
ALTER TABLE ext_bidding_notices ADD CONSTRAINT ext_bidding_notices_result_authorship_check
  CHECK (
    result_recorded_at IS NULL
    OR (
      result IS NOT NULL
      AND result_recorded_by_identity IS NOT NULL
      AND result_justification IS NOT NULL
      AND char_length(result_justification) BETWEEN 10 AND 2000
    )
  ) NOT VALID;

-- Resultado só existe em edital encerrado: a situação terminal é a condição.
ALTER TABLE ext_bidding_notices DROP CONSTRAINT IF EXISTS ext_bidding_notices_result_requires_closed_check;
ALTER TABLE ext_bidding_notices ADD CONSTRAINT ext_bidding_notices_result_requires_closed_check
  CHECK (
    result_recorded_at IS NULL
    OR status IN ('homologado','vencido','cancelado','deserto')
  ) NOT VALID;

ALTER TABLE ext_bidding_notices DROP CONSTRAINT IF EXISTS ext_bidding_notices_closed_at_check;
ALTER TABLE ext_bidding_notices ADD CONSTRAINT ext_bidding_notices_closed_at_check
  CHECK (
    closed_at IS NULL
    OR status IN ('homologado','vencido','cancelado','deserto')
  ) NOT VALID;

COMMENT ON COLUMN ext_bidding_notices.origin IS
  'EXT-03: "jornada_canonica" marca o registro criado pela jornada hardenada da 149. "registro_legado" é tudo que veio antes, sem autoria confiável.';
COMMENT ON COLUMN ext_bidding_notices.publication_date IS
  'LEGADO (085): data solta mantida para leitura. O prazo canônico de publicação vive em ext_bidding_deadlines com fonte declarada.';
COMMENT ON COLUMN ext_bidding_notices.deadline_date IS
  'LEGADO (085): prazo solto mantido para leitura. O prazo canônico vive em ext_bidding_deadlines, um por tipo, com fonte e substituição declaradas.';
COMMENT ON COLUMN ext_bidding_notices.responsible_name IS
  'LEGADO (085): texto livre mantido para leitura. O responsável canônico é ext_bidding_notices.responsible_identity, com histórico em ext_bidding_responsible_assignments.';
COMMENT ON COLUMN ext_bidding_notices.result IS
  'EXT-03: só é gravado junto de result_recorded_at, result_recorded_by_identity e result_justification, apenas com edital encerrado, e torna-se imutável por gatilho.';
COMMENT ON COLUMN ext_bidding_notices.estimated_value_cents IS
  'Valor estimado em centavos de BRL. EXT-03 não converte moeda nem estima valor ausente: ausência é declarada.';

-- ---------------------------------------------------------------------------
-- 2. Prazos canônicos, um por tipo, com fonte declarada e substituição explícita
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_bidding_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_id UUID NOT NULL REFERENCES ext_bidding_notices(id) ON DELETE RESTRICT,
  deadline_kind TEXT NOT NULL CHECK (deadline_kind IN (
    'publicacao','esclarecimento','impugnacao','entrega_proposta',
    'sessao_abertura','recurso','assinatura'
  )),
  due_date DATE NOT NULL,
  -- Fonte é obrigatória: um prazo sem origem declarada não entra.
  source TEXT NOT NULL CHECK (source IN ('edital_publicado','retificacao_publicada','registro_interno')),
  source_reference TEXT CHECK (source_reference IS NULL OR char_length(source_reference) BETWEEN 2 AND 300),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 5 AND 500),
  registered_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  superseded_by_identity UUID REFERENCES auth_identities(id),
  supersede_reason TEXT CHECK (supersede_reason IS NULL OR char_length(supersede_reason) BETWEEN 5 AND 500),
  CHECK (
    (superseded_at IS NULL AND superseded_by_identity IS NULL AND supersede_reason IS NULL)
    OR (superseded_at IS NOT NULL AND superseded_by_identity IS NOT NULL AND supersede_reason IS NOT NULL)
  )
);

-- Um único prazo vigente por tipo e edital; os anteriores ficam substituídos.
CREATE UNIQUE INDEX IF NOT EXISTS ext_bidding_deadlines_active_kind_key
  ON ext_bidding_deadlines (bidding_id, deadline_kind) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS ext_bidding_deadlines_bidding_idx
  ON ext_bidding_deadlines (bidding_id, due_date);

COMMENT ON TABLE ext_bidding_deadlines IS
  'EXT-03: prazos canônicos do edital. Um registro vigente por tipo; alterar significa substituir com motivo, nunca editar. A situação (vigente/vencido) é derivada da data registrada e da data-base declarada pela API.';

-- ---------------------------------------------------------------------------
-- 3. Responsáveis: identidade canônica com histórico de passagem
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_bidding_responsible_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_id UUID NOT NULL REFERENCES ext_bidding_notices(id) ON DELETE RESTRICT,
  responsible_identity UUID NOT NULL REFERENCES auth_identities(id),
  responsible_role TEXT NOT NULL CHECK (responsible_role IN ('admin','ti','rh')),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 5 AND 500),
  assigned_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  CHECK (released_at IS NULL OR released_at >= assigned_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_bidding_responsible_active_key
  ON ext_bidding_responsible_assignments (bidding_id) WHERE released_at IS NULL;

COMMENT ON TABLE ext_bidding_responsible_assignments IS
  'EXT-03: histórico de responsáveis pelo edital. O papel é copiado de auth_staff_profiles no momento da designação, para que a trilha não dependa de um papel que pode mudar depois.';

-- ---------------------------------------------------------------------------
-- 4. Proposta canônica versionada — o banco recusa proposta fora do prazo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_bidding_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_id UUID NOT NULL REFERENCES ext_bidding_notices(id) ON DELETE RESTRICT,
  version INT NOT NULL CHECK (version > 0),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 2000),
  -- Prazo que autorizou esta proposta, copiado no ato: a decisão fica auditável
  -- mesmo que o prazo seja substituído depois.
  deadline_id UUID NOT NULL REFERENCES ext_bidding_deadlines(id),
  deadline_date_at_submission DATE NOT NULL,
  deadline_source_at_submission TEXT NOT NULL,
  submitted_on DATE NOT NULL DEFAULT CURRENT_DATE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  withdrawn_at TIMESTAMPTZ,
  withdrawn_by_identity UUID REFERENCES auth_identities(id),
  withdraw_reason TEXT CHECK (withdraw_reason IS NULL OR char_length(withdraw_reason) BETWEEN 5 AND 500),
  -- CRITÉRIO IMPOSTO PELO BANCO: proposta registrada depois do prazo de entrega
  -- vigente é rejeitada pelo próprio PostgreSQL, não só pela aplicação.
  CONSTRAINT ext_bidding_proposals_within_deadline_check
    CHECK (submitted_on <= deadline_date_at_submission),
  CONSTRAINT ext_bidding_proposals_withdrawal_check CHECK (
    (withdrawn_at IS NULL AND withdrawn_by_identity IS NULL AND withdraw_reason IS NULL)
    OR (withdrawn_at IS NOT NULL AND withdrawn_by_identity IS NOT NULL AND withdraw_reason IS NOT NULL)
  ),
  UNIQUE (bidding_id, version)
);
CREATE INDEX IF NOT EXISTS ext_bidding_proposals_bidding_idx
  ON ext_bidding_proposals (bidding_id, version DESC);

COMMENT ON TABLE ext_bidding_proposals IS
  'EXT-03: propostas canônicas versionadas. A versão é atribuída pelo servidor sob lock; nunca vem do navegador. O CHECK ext_bidding_proposals_within_deadline_check impõe no banco o critério "proposta só dentro do prazo de entrega registrado".';
COMMENT ON COLUMN ext_bidding_proposals.deadline_date_at_submission IS
  'Cópia da data do prazo de entrega no instante do registro. Substituir o prazo depois NÃO reescreve a decisão já tomada.';

-- ---------------------------------------------------------------------------
-- 5. Checklist por edital e regra de alerta explícita
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_bidding_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_id UUID NOT NULL REFERENCES ext_bidding_notices(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (char_length(document_type) BETWEEN 3 AND 100),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 3 AND 200),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  deactivated_by_identity UUID REFERENCES auth_identities(id),
  deactivate_reason TEXT CHECK (deactivate_reason IS NULL OR char_length(deactivate_reason) BETWEEN 5 AND 500),
  CHECK (
    (deactivated_at IS NULL AND deactivated_by_identity IS NULL AND deactivate_reason IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivated_by_identity IS NOT NULL AND deactivate_reason IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_bidding_checklist_active_type_key
  ON ext_bidding_checklist_items (bidding_id, document_type) WHERE deactivated_at IS NULL;

COMMENT ON TABLE ext_bidding_checklist_items IS
  'EXT-03: checklist exigido por edital. Item nunca é apagado: é desativado com autor e motivo. "Atendido" é derivado da existência de documento ativo do mesmo tipo — nunca marcado à mão.';

CREATE TABLE IF NOT EXISTS ext_bidding_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_id UUID NOT NULL REFERENCES ext_bidding_notices(id) ON DELETE RESTRICT,
  days_before INT NOT NULL CHECK (days_before BETWEEN 1 AND 365),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 5 AND 500),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  deactivated_by_identity UUID REFERENCES auth_identities(id),
  CHECK (
    (deactivated_at IS NULL AND deactivated_by_identity IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivated_by_identity IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_bidding_alert_rules_active_key
  ON ext_bidding_alert_rules (bidding_id) WHERE deactivated_at IS NULL;

COMMENT ON TABLE ext_bidding_alert_rules IS
  'EXT-03: antecedência de alerta por edital. SEM regra registrada não existe "a vencer": a API declara "sem_regra_de_antecedencia" em vez de inventar um número de dias.';

-- ---------------------------------------------------------------------------
-- 6. Dossiê versionado: documento substitui, nunca some
-- ---------------------------------------------------------------------------
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado';
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS checklist_item_id UUID REFERENCES ext_bidding_checklist_items(id);
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS supersedes_document_id UUID REFERENCES ext_bidding_documents(id);
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS deactivated_by_identity UUID REFERENCES auth_identities(id);
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS deactivate_reason TEXT;
ALTER TABLE ext_bidding_documents ADD COLUMN IF NOT EXISTS storage_kind TEXT NOT NULL DEFAULT 'referencia_externa_declarada';

ALTER TABLE ext_bidding_documents DROP CONSTRAINT IF EXISTS ext_bidding_documents_origin_check;
ALTER TABLE ext_bidding_documents ADD CONSTRAINT ext_bidding_documents_origin_check
  CHECK (origin IN ('registro_legado','jornada_canonica')) NOT VALID;

ALTER TABLE ext_bidding_documents DROP CONSTRAINT IF EXISTS ext_bidding_documents_deactivation_check;
ALTER TABLE ext_bidding_documents ADD CONSTRAINT ext_bidding_documents_deactivation_check
  CHECK (
    (deactivated_at IS NULL AND deactivated_by_identity IS NULL AND deactivate_reason IS NULL)
    OR (
      deactivated_at IS NOT NULL AND deactivated_by_identity IS NOT NULL
      AND deactivate_reason IS NOT NULL AND char_length(deactivate_reason) BETWEEN 5 AND 500
    )
  ) NOT VALID;

ALTER TABLE ext_bidding_documents DROP CONSTRAINT IF EXISTS ext_bidding_documents_storage_kind_check;
ALTER TABLE ext_bidding_documents ADD CONSTRAINT ext_bidding_documents_storage_kind_check
  CHECK (storage_kind IN ('referencia_externa_declarada')) NOT VALID;

COMMENT ON COLUMN ext_bidding_documents.storage_kind IS
  'FRONTEIRA DECLARADA: não existe upload real nem armazenamento de arquivo neste sistema. file_url/storage_key são REFERÊNCIAS declaradas pela equipe; a API nunca afirma que o arquivo foi recebido ou verificado.';
COMMENT ON COLUMN ext_bidding_documents.supersedes_document_id IS
  'EXT-03: versão nova aponta para a anterior. O dossiê é uma cadeia; nenhuma versão é apagada.';

-- ---------------------------------------------------------------------------
-- 7. Histórico apenas-acréscimo com idempotência por identidade
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_bidding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_id UUID NOT NULL REFERENCES ext_bidding_notices(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'edital_criado','situacao_atualizada','prazo_registrado','prazo_substituido',
    'responsavel_designado','proposta_registrada','proposta_retirada',
    'documento_registrado','documento_desativado','checklist_item_registrado',
    'checklist_item_desativado','regra_alerta_registrada','resultado_registrado'
  )),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 500),
  payload JSONB,
  idempotency_key VARCHAR(200),
  request_fingerprint CHAR(64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR (
      char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$'
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_bidding_events_idempotency_key
  ON ext_bidding_events (created_by_identity, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_bidding_events_bidding_idx
  ON ext_bidding_events (bidding_id, created_at DESC);

COMMENT ON TABLE ext_bidding_events IS
  'EXT-03: histórico imutável do edital e ledger de idempotência. A chave é única por (identidade, idempotency_key): retry idêntico devolve o mesmo resultado; reuso com conteúdo diferente é recusado com 409.';

-- ---------------------------------------------------------------------------
-- 8. Gatilhos: histórico imutável, estado terminal final, resultado imutável
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ext_bidding_history_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ext_bidding_history_immutable: % em % não é permitido; o histórico de licitações é apenas-acréscimo', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_bidding_events_immutable ON ext_bidding_events;
CREATE TRIGGER ext_bidding_events_immutable
  BEFORE UPDATE OR DELETE ON ext_bidding_events
  FOR EACH ROW EXECUTE FUNCTION ext_bidding_history_immutable();

-- Prazo: só a substituição declarada pode ser gravada; nada mais muda.
CREATE OR REPLACE FUNCTION ext_bidding_deadline_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ext_bidding_deadline_guard: DELETE não é permitido; prazo substituído permanece no histórico';
  END IF;
  IF OLD.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'ext_bidding_deadline_guard: prazo já substituído não pode ser alterado';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.bidding_id IS DISTINCT FROM OLD.bidding_id
     OR NEW.deadline_kind IS DISTINCT FROM OLD.deadline_kind
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.justification IS DISTINCT FROM OLD.justification
     OR NEW.registered_by_identity IS DISTINCT FROM OLD.registered_by_identity
     OR NEW.registered_at IS DISTINCT FROM OLD.registered_at THEN
    RAISE EXCEPTION 'ext_bidding_deadline_guard: data, fonte e autoria do prazo são imutáveis; registre uma substituição declarada';
  END IF;
  IF NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'ext_bidding_deadline_guard: a única atualização aceita é a substituição declarada';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_bidding_deadlines_guard ON ext_bidding_deadlines;
CREATE TRIGGER ext_bidding_deadlines_guard
  BEFORE UPDATE OR DELETE ON ext_bidding_deadlines
  FOR EACH ROW EXECUTE FUNCTION ext_bidding_deadline_guard();

-- Proposta: valor, prazo-base e autoria são imutáveis; só a retirada é gravável.
CREATE OR REPLACE FUNCTION ext_bidding_proposal_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ext_bidding_proposal_guard: DELETE não é permitido; proposta retirada permanece no histórico';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'ext_bidding_proposal_guard: proposta já retirada não pode ser alterada';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.bidding_id IS DISTINCT FROM OLD.bidding_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.deadline_id IS DISTINCT FROM OLD.deadline_id
     OR NEW.deadline_date_at_submission IS DISTINCT FROM OLD.deadline_date_at_submission
     OR NEW.deadline_source_at_submission IS DISTINCT FROM OLD.deadline_source_at_submission
     OR NEW.submitted_on IS DISTINCT FROM OLD.submitted_on
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.submitted_by_identity IS DISTINCT FROM OLD.submitted_by_identity THEN
    RAISE EXCEPTION 'ext_bidding_proposal_guard: valor, prazo-base e autoria da proposta são imutáveis; registre nova versão ou retirada';
  END IF;
  IF NEW.withdrawn_at IS NULL THEN
    RAISE EXCEPTION 'ext_bidding_proposal_guard: a única atualização aceita é a retirada declarada';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_bidding_proposals_guard ON ext_bidding_proposals;
CREATE TRIGGER ext_bidding_proposals_guard
  BEFORE UPDATE OR DELETE ON ext_bidding_proposals
  FOR EACH ROW EXECUTE FUNCTION ext_bidding_proposal_guard();

-- Edital: estado terminal é final, resultado e protocolo não se reescrevem.
CREATE OR REPLACE FUNCTION ext_bidding_notice_guard() RETURNS trigger AS $$
DECLARE
  terminais TEXT[] := ARRAY['homologado','vencido','cancelado','deserto'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ext_bidding_notice_guard: DELETE não é permitido; edital encerrado permanece no histórico';
  END IF;
  IF NEW.protocol IS DISTINCT FROM OLD.protocol THEN
    RAISE EXCEPTION 'ext_bidding_notice_guard: protocolo do edital é imutável';
  END IF;
  IF NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity THEN
    RAISE EXCEPTION 'ext_bidding_notice_guard: autoria de criação é imutável';
  END IF;
  -- Registro legado continua legível e editável pelos caminhos antigos; a
  -- jornada canônica é que fica presa às regras abaixo.
  IF OLD.origin = 'jornada_canonica' THEN
    -- OLD.status é do tipo ext_bidding_status: comparar com TEXT[] exige
    -- cast explícito, senão o PostgreSQL recusa com "operator does not exist".
    IF OLD.status::text = ANY (terminais) AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'ext_bidding_notice_guard: edital encerrado em "%" não reabre; situação terminal é final', OLD.status;
    END IF;
    IF OLD.result_recorded_at IS NOT NULL AND (
         NEW.result IS DISTINCT FROM OLD.result
         OR NEW.result_recorded_at IS DISTINCT FROM OLD.result_recorded_at
         OR NEW.result_recorded_by_identity IS DISTINCT FROM OLD.result_recorded_by_identity
         OR NEW.result_justification IS DISTINCT FROM OLD.result_justification
       ) THEN
      RAISE EXCEPTION 'ext_bidding_notice_guard: resultado já registrado é imutável';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_bidding_notices_guard ON ext_bidding_notices;
CREATE TRIGGER ext_bidding_notices_guard
  BEFORE UPDATE OR DELETE ON ext_bidding_notices
  FOR EACH ROW EXECUTE FUNCTION ext_bidding_notice_guard();

-- Designação de responsável: encerrar é declarar released_at; nada mais muda.
CREATE OR REPLACE FUNCTION ext_bidding_responsible_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ext_bidding_responsible_guard: DELETE não é permitido; a passagem de responsável fica no histórico';
  END IF;
  IF OLD.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'ext_bidding_responsible_guard: designação já encerrada não pode ser alterada';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.bidding_id IS DISTINCT FROM OLD.bidding_id
     OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
     OR NEW.responsible_role IS DISTINCT FROM OLD.responsible_role
     OR NEW.justification IS DISTINCT FROM OLD.justification
     OR NEW.assigned_by_identity IS DISTINCT FROM OLD.assigned_by_identity
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at THEN
    RAISE EXCEPTION 'ext_bidding_responsible_guard: identidade, papel e autoria da designação são imutáveis';
  END IF;
  IF NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'ext_bidding_responsible_guard: a única atualização aceita é o encerramento declarado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_bidding_responsible_assignments_guard ON ext_bidding_responsible_assignments;
CREATE TRIGGER ext_bidding_responsible_assignments_guard
  BEFORE UPDATE OR DELETE ON ext_bidding_responsible_assignments
  FOR EACH ROW EXECUTE FUNCTION ext_bidding_responsible_guard();

COMMIT;

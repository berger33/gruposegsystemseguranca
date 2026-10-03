-- EXT-04: portal de fornecedores — jornada INTERNA de equipe para cotações,
-- documentos e pedidos. Aditiva sobre a 085; migrações 001–149 são imutáveis.
--
-- CONDIÇÃO DO PLANO, NÃO PRESUMIDA: "se volume justificar". O repositório só
-- define a condição em docs/PLANO-MESTRE-IMPLEMENTACAO.md:423 e marca a
-- capacidade como não verificada em docs/AUDITORIA-TERRENO-L08.md:85. Não há
-- medição, meta ou histórico de volume. Veredito: SEM EVIDÊNCIA DE VOLUME.
-- Nenhum fornecedor, cotação ou pedido é semeado por esta migração.
--
-- FRONTEIRA DE ATOR EXTERNO: não existe identidade, credencial, sessão, grant ou
-- canal HTTP canônico de fornecedor. Esta migração NÃO cria nenhum deles. A
-- jornada é administrativa e interna; "escopo próprio" do fornecedor permanece
-- pendente até haver um ator externo canônico comprovável por HTTP/DB.
-- file_url/storage_key são somente referências declaradas: não há upload,
-- armazenamento, entrega ou aceite externo de documento.
--
-- A 150 endurece as tabelas da 085 sem inventar autoria retroativa: registros
-- anteriores mantêm origin='registro_legado'. Toda mutação canônica gera evento
-- imutável e usa o mesmo commit da auditoria na camada HTTP.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Cotação canônica: vínculos reais, origem e decisão imutável
-- ---------------------------------------------------------------------------
ALTER TABLE ext_supplier_portal_quotations
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS decision TEXT,
  ADD COLUMN IF NOT EXISTS decision_justification TEXT,
  ADD COLUMN IF NOT EXISTS decision_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_recorded_by_identity UUID REFERENCES auth_identities(id);

ALTER TABLE ext_supplier_portal_quotations DROP CONSTRAINT IF EXISTS ext_supplier_quote_origin_check;
ALTER TABLE ext_supplier_portal_quotations ADD CONSTRAINT ext_supplier_quote_origin_check
  CHECK (origin IN ('registro_legado','jornada_canonica')) NOT VALID;

ALTER TABLE ext_supplier_portal_quotations DROP CONSTRAINT IF EXISTS ext_supplier_quote_canonical_links_check;
ALTER TABLE ext_supplier_portal_quotations ADD CONSTRAINT ext_supplier_quote_canonical_links_check
  CHECK (origin <> 'jornada_canonica' OR (
    supplier_id IS NOT NULL AND product_id IS NOT NULL AND created_by_identity IS NOT NULL
  )) NOT VALID;

ALTER TABLE ext_supplier_portal_quotations DROP CONSTRAINT IF EXISTS ext_supplier_quote_total_check;
ALTER TABLE ext_supplier_portal_quotations ADD CONSTRAINT ext_supplier_quote_total_check
  CHECK (origin <> 'jornada_canonica' OR total_price_cents = quantity::bigint * unit_price_cents) NOT VALID;

ALTER TABLE ext_supplier_portal_quotations DROP CONSTRAINT IF EXISTS ext_supplier_quote_decision_check;
ALTER TABLE ext_supplier_portal_quotations ADD CONSTRAINT ext_supplier_quote_decision_check
  CHECK (
    (
      status::text NOT IN ('aprovado','rejeitado')
      AND decision IS NULL AND decision_justification IS NULL
      AND decision_recorded_at IS NULL AND decision_recorded_by_identity IS NULL
    )
    OR (
      decision IN ('aprovada','rejeitada')
      AND decision_justification IS NOT NULL
      AND char_length(decision_justification) BETWEEN 10 AND 1000
      AND decision_recorded_at IS NOT NULL
      AND decision_recorded_by_identity IS NOT NULL
      AND ((decision='aprovada' AND status='aprovado') OR (decision='rejeitada' AND status='rejeitado'))
    )
  ) NOT VALID;

COMMENT ON COLUMN ext_supplier_portal_quotations.origin IS
  'EXT-04: jornada_canonica identifica criação pela API hardenada da 150; registro_legado não recebe autoria retroativa.';
COMMENT ON COLUMN ext_supplier_portal_quotations.is_visible_to_supplier IS
  'LEGADO (085): não concede acesso. Não existe sessão/canal de fornecedor; a API canônica nunca usa este booleano como autorização.';

-- ---------------------------------------------------------------------------
-- 2. Validade da cotação com fonte; substituir é novo registro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_supplier_quotation_validities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES ext_supplier_portal_quotations(id) ON DELETE RESTRICT,
  valid_until DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('documento_declarado','email_declarado','registro_interno')),
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
CREATE UNIQUE INDEX IF NOT EXISTS ext_supplier_quotation_validities_active_key
  ON ext_supplier_quotation_validities (quotation_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS ext_supplier_quotation_validities_quote_idx
  ON ext_supplier_quotation_validities (quotation_id, registered_at DESC);
COMMENT ON TABLE ext_supplier_quotation_validities IS
  'EXT-04: validade canônica com fonte declarada. Situação é derivada da data registrada e da data-base informada pela API; ausência nunca é estimada.';

-- ---------------------------------------------------------------------------
-- 3. Documentos: metadados versionados sob lock, sem upload real
-- ---------------------------------------------------------------------------
ALTER TABLE ext_supplier_portal_documents
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS version INT,
  ADD COLUMN IF NOT EXISTS supersedes_document_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS deactivate_reason TEXT;

ALTER TABLE ext_supplier_portal_documents DROP CONSTRAINT IF EXISTS ext_supplier_document_supersedes_fk;
ALTER TABLE ext_supplier_portal_documents ADD CONSTRAINT ext_supplier_document_supersedes_fk
  FOREIGN KEY (supersedes_document_id) REFERENCES ext_supplier_portal_documents(id) NOT VALID;
ALTER TABLE ext_supplier_portal_documents DROP CONSTRAINT IF EXISTS ext_supplier_document_origin_check;
ALTER TABLE ext_supplier_portal_documents ADD CONSTRAINT ext_supplier_document_origin_check
  CHECK (origin IN ('registro_legado','jornada_canonica')) NOT VALID;
ALTER TABLE ext_supplier_portal_documents DROP CONSTRAINT IF EXISTS ext_supplier_document_canonical_check;
ALTER TABLE ext_supplier_portal_documents ADD CONSTRAINT ext_supplier_document_canonical_check
  CHECK (origin <> 'jornada_canonica' OR (
    document_type IS NOT NULL AND char_length(document_type) BETWEEN 3 AND 100
    AND version > 0 AND created_by_identity IS NOT NULL
  )) NOT VALID;
ALTER TABLE ext_supplier_portal_documents DROP CONSTRAINT IF EXISTS ext_supplier_document_deactivation_check;
ALTER TABLE ext_supplier_portal_documents ADD CONSTRAINT ext_supplier_document_deactivation_check
  CHECK (
    (deactivated_at IS NULL AND deactivated_by_identity IS NULL AND deactivate_reason IS NULL)
    OR (deactivated_at IS NOT NULL AND deactivated_by_identity IS NOT NULL AND char_length(deactivate_reason) BETWEEN 5 AND 500)
  ) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS ext_supplier_documents_canonical_version_key
  ON ext_supplier_portal_documents (quotation_id, version) WHERE origin='jornada_canonica';
COMMENT ON COLUMN ext_supplier_portal_documents.file_url IS
  'EXT-04: referência textual declarada pela equipe; não comprova upload, armazenamento, entrega ou aceite por fornecedor.';
COMMENT ON COLUMN ext_supplier_portal_documents.storage_key IS
  'EXT-04: chave declarada pela equipe; não existe caminho real de upload nesta jornada.';

-- ---------------------------------------------------------------------------
-- 4. Pedidos próprios da jornada, derivados de cotação aprovada
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_supplier_portal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^PED-FORN-[0-9]{8}-[A-Z0-9]{4}$'),
  quotation_id UUID NOT NULL UNIQUE REFERENCES ext_supplier_portal_quotations(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES ast_suppliers(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES ast_products(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  total_price_cents BIGINT NOT NULL CHECK (total_price_cents = quantity::bigint * unit_price_cents),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','emitido','em_entrega','recebido','fechado','cancelado')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by_identity UUID REFERENCES auth_identities(id),
  CHECK (
    (status IN ('fechado','cancelado') AND closed_at IS NOT NULL AND closed_by_identity IS NOT NULL)
    OR (status NOT IN ('fechado','cancelado') AND closed_at IS NULL AND closed_by_identity IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS ext_supplier_orders_supplier_idx ON ext_supplier_portal_orders (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ext_supplier_orders_status_idx ON ext_supplier_portal_orders (status, created_at DESC);
COMMENT ON TABLE ext_supplier_portal_orders IS
  'EXT-04: pedido interno derivado integralmente de cotação aprovada; fornecedor/produto/quantidade/valores não vêm do corpo do navegador.';

CREATE TABLE IF NOT EXISTS ext_supplier_order_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES ext_supplier_portal_orders(id) ON DELETE RESTRICT,
  due_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cotacao_aprovada','pedido_emitido','registro_interno')),
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
CREATE UNIQUE INDEX IF NOT EXISTS ext_supplier_order_deadlines_active_key
  ON ext_supplier_order_deadlines (order_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS ext_supplier_order_deadlines_order_idx ON ext_supplier_order_deadlines (order_id, registered_at DESC);

-- Limiar só existe quando uma pessoa registra a regra explícita.
CREATE TABLE IF NOT EXISTS ext_supplier_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL UNIQUE REFERENCES ext_supplier_portal_quotations(id) ON DELETE RESTRICT,
  days_before INT NOT NULL CHECK (days_before BETWEEN 1 AND 365),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 5 AND 500),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ext_supplier_alert_rules IS
  'EXT-04: antecedência explícita usada para validade/prazo. Sem registro, a API declara ausência e nunca inventa "a vencer".';

-- ---------------------------------------------------------------------------
-- 5. Ledger imutável de negócio + idempotência por identidade staff
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_supplier_portal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES ext_supplier_portal_quotations(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES ext_supplier_portal_orders(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 100),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by_identity, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ext_supplier_events_quote_idx ON ext_supplier_portal_events (quotation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ext_supplier_events_order_idx ON ext_supplier_portal_events (order_id, created_at DESC) WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Guardas de banco: estados terminais, decisão/documentos/fontes imutáveis
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ext_supplier_guard_quotation_update() RETURNS TRIGGER AS $$
DECLARE allowed BOOLEAN := FALSE;
BEGIN
  IF OLD.origin='jornada_canonica' AND (
    NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents
    OR NEW.total_price_cents IS DISTINCT FROM OLD.total_price_cents OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
    OR NEW.origin IS DISTINCT FROM OLD.origin
  ) THEN RAISE EXCEPTION 'canonical quotation identity and values are immutable'; END IF;

  IF OLD.decision_recorded_at IS NOT NULL AND (
    NEW.decision IS DISTINCT FROM OLD.decision OR NEW.decision_justification IS DISTINCT FROM OLD.decision_justification
    OR NEW.decision_recorded_at IS DISTINCT FROM OLD.decision_recorded_at
    OR NEW.decision_recorded_by_identity IS DISTINCT FROM OLD.decision_recorded_by_identity
  ) THEN RAISE EXCEPTION 'quotation decision is immutable'; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.origin='jornada_canonica' THEN
    allowed := CASE OLD.status::text
      WHEN 'rascunho' THEN NEW.status::text = ANY (ARRAY['enviado','cancelado'])
      WHEN 'enviado' THEN NEW.status::text = ANY (ARRAY['em_analise','cancelado'])
      WHEN 'em_analise' THEN NEW.status::text = ANY (ARRAY['aprovado','rejeitado','cancelado'])
      ELSE FALSE END;
    IF NOT allowed THEN RAISE EXCEPTION 'invalid quotation status transition: % -> %', OLD.status, NEW.status; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_supplier_guard_quotation_update_trg ON ext_supplier_portal_quotations;
CREATE TRIGGER ext_supplier_guard_quotation_update_trg BEFORE UPDATE ON ext_supplier_portal_quotations
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_guard_quotation_update();

CREATE OR REPLACE FUNCTION ext_supplier_guard_order_update() RETURNS TRIGGER AS $$
DECLARE allowed BOOLEAN := FALSE;
BEGIN
  IF NEW.quotation_id IS DISTINCT FROM OLD.quotation_id OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents OR NEW.total_price_cents IS DISTINCT FROM OLD.total_price_cents
    OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
  THEN RAISE EXCEPTION 'order canonical links and values are immutable'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'rascunho' THEN NEW.status = ANY (ARRAY['emitido','cancelado'])
      WHEN 'emitido' THEN NEW.status = ANY (ARRAY['em_entrega','cancelado'])
      WHEN 'em_entrega' THEN NEW.status = ANY (ARRAY['recebido','cancelado'])
      WHEN 'recebido' THEN NEW.status = 'fechado'
      ELSE FALSE END;
    IF NOT allowed THEN RAISE EXCEPTION 'invalid supplier order transition: % -> %', OLD.status, NEW.status; END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_supplier_guard_order_update_trg ON ext_supplier_portal_orders;
CREATE TRIGGER ext_supplier_guard_order_update_trg BEFORE UPDATE ON ext_supplier_portal_orders
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_guard_order_update();

CREATE OR REPLACE FUNCTION ext_supplier_guard_validity_update() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quotation_id IS DISTINCT FROM OLD.quotation_id OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    OR NEW.source IS DISTINCT FROM OLD.source OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
    OR NEW.justification IS DISTINCT FROM OLD.justification OR NEW.registered_by_identity IS DISTINCT FROM OLD.registered_by_identity
    OR NEW.registered_at IS DISTINCT FROM OLD.registered_at
  THEN RAISE EXCEPTION 'quotation validity source is immutable'; END IF;
  IF OLD.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'superseded quotation validity is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_supplier_guard_validity_update_trg ON ext_supplier_quotation_validities;
CREATE TRIGGER ext_supplier_guard_validity_update_trg BEFORE UPDATE ON ext_supplier_quotation_validities
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_guard_validity_update();

CREATE OR REPLACE FUNCTION ext_supplier_guard_deadline_update() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.source IS DISTINCT FROM OLD.source OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
    OR NEW.justification IS DISTINCT FROM OLD.justification OR NEW.registered_by_identity IS DISTINCT FROM OLD.registered_by_identity
    OR NEW.registered_at IS DISTINCT FROM OLD.registered_at
  THEN RAISE EXCEPTION 'order deadline source is immutable'; END IF;
  IF OLD.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'superseded order deadline is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_supplier_guard_deadline_update_trg ON ext_supplier_order_deadlines;
CREATE TRIGGER ext_supplier_guard_deadline_update_trg BEFORE UPDATE ON ext_supplier_order_deadlines
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_guard_deadline_update();

CREATE OR REPLACE FUNCTION ext_supplier_guard_document_update() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quotation_id IS DISTINCT FROM OLD.quotation_id OR NEW.file_name IS DISTINCT FROM OLD.file_name
    OR NEW.file_url IS DISTINCT FROM OLD.file_url OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
    OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.document_type IS DISTINCT FROM OLD.document_type
    OR NEW.version IS DISTINCT FROM OLD.version OR NEW.supersedes_document_id IS DISTINCT FROM OLD.supersedes_document_id
  THEN RAISE EXCEPTION 'supplier document version is immutable'; END IF;
  IF OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
  THEN RAISE EXCEPTION 'document supersession is immutable'; END IF;
  IF OLD.deactivated_at IS NOT NULL AND (
    NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at OR NEW.deactivated_by_identity IS DISTINCT FROM OLD.deactivated_by_identity
    OR NEW.deactivate_reason IS DISTINCT FROM OLD.deactivate_reason
  ) THEN RAISE EXCEPTION 'document deactivation is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_supplier_guard_document_update_trg ON ext_supplier_portal_documents;
CREATE TRIGGER ext_supplier_guard_document_update_trg BEFORE UPDATE ON ext_supplier_portal_documents
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_guard_document_update();

CREATE OR REPLACE FUNCTION ext_supplier_reject_immutable_change() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION '% is immutable', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_supplier_events_immutable_trg ON ext_supplier_portal_events;
CREATE TRIGGER ext_supplier_events_immutable_trg BEFORE UPDATE OR DELETE ON ext_supplier_portal_events
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_reject_immutable_change();
DROP TRIGGER IF EXISTS ext_supplier_alert_rules_immutable_trg ON ext_supplier_alert_rules;
CREATE TRIGGER ext_supplier_alert_rules_immutable_trg BEFORE UPDATE OR DELETE ON ext_supplier_alert_rules
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_reject_immutable_change();
DROP TRIGGER IF EXISTS ext_supplier_validities_delete_trg ON ext_supplier_quotation_validities;
CREATE TRIGGER ext_supplier_validities_delete_trg BEFORE DELETE ON ext_supplier_quotation_validities
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_reject_immutable_change();
DROP TRIGGER IF EXISTS ext_supplier_deadlines_delete_trg ON ext_supplier_order_deadlines;
CREATE TRIGGER ext_supplier_deadlines_delete_trg BEFORE DELETE ON ext_supplier_order_deadlines
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_reject_immutable_change();
DROP TRIGGER IF EXISTS ext_supplier_documents_delete_trg ON ext_supplier_portal_documents;
CREATE TRIGGER ext_supplier_documents_delete_trg BEFORE DELETE ON ext_supplier_portal_documents
  FOR EACH ROW EXECUTE FUNCTION ext_supplier_reject_immutable_change();

COMMIT;

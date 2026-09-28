-- AST-01/02/03/04/05/06 produtos/SKU fornecedores unidade custo local estoque mínimo entradas/saídas/transferências/ajustes histórico saldo derivado movimentos consistentes reserva proposta/implantação sem confundir reserva com saída liberação cancelamento equipamentos serializados cliente/posto/colaborador proprietário garantia manutenção termo guarda entrega/devolução avaria/perda fotos conferência requisição cotação seleção aprovação pedido recebimento vínculo conta a pagar

DO $$ BEGIN CREATE TYPE ast_movement_type AS ENUM ('entrada','saida','transferencia','ajuste','reserva','liberacao','conversao','cancelamento'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_reservation_type AS ENUM ('proposta','implantacao','os','manutencao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_reservation_status AS ENUM ('reservado','liberado','convertido','cancelado','expirado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_asset_status AS ENUM ('disponivel','em_uso','em_manutencao','perdido','avariado','devolvido','reservado','baixado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_delivery_type AS ENUM ('entrega','devolucao','avaria','perda','conferencia','transferencia'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_requisition_status AS ENUM ('rascunho','em_cotacao','cotado','aprovado','rejeitado','pedido','recebido_parcial','recebido_total','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_urgency AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_order_status AS ENUM ('rascunho','enviado','recebido_parcial','recebido_total','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AST-01 produtos/SKU fornecedores unidade medida custo local estoque mínimo
CREATE TABLE IF NOT EXISTS ast_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 200),
  document TEXT CHECK (document IS NULL OR char_length(document) BETWEEN 3 AND 30),
  contact_name TEXT CHECK (contact_name IS NULL OR char_length(contact_name) BETWEEN 2 AND 200),
  contact_email TEXT CHECK (contact_email IS NULL OR char_length(contact_email) BETWEEN 5 AND 320),
  contact_phone TEXT CHECK (contact_phone IS NULL OR char_length(contact_phone) BETWEEN 8 AND 20),
  address TEXT CHECK (address IS NULL OR char_length(address) BETWEEN 10 AND 500),
  category TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 3 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_suppliers_name_idx ON ast_suppliers(name);
CREATE INDEX IF NOT EXISTS ast_suppliers_active_idx ON ast_suppliers(is_active);

CREATE TABLE IF NOT EXISTS ast_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE CHECK (char_length(sku) BETWEEN 3 AND 100),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 3 AND 100),
  unit_measure TEXT NOT NULL CHECK (char_length(unit_measure) BETWEEN 2 AND 50),
  cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (cost_cents >=0),
  sale_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (sale_price_cents >=0),
  stock_min INT NOT NULL DEFAULT 0 CHECK (stock_min >=0),
  stock_current INT NOT NULL DEFAULT 0,
  location TEXT CHECK (location IS NULL OR char_length(location) BETWEEN 3 AND 200),
  supplier_id UUID REFERENCES ast_suppliers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_products_sku_idx ON ast_products(sku);
CREATE INDEX IF NOT EXISTS ast_products_category_idx ON ast_products(category);
CREATE INDEX IF NOT EXISTS ast_products_supplier_idx ON ast_products(supplier_id);

-- AST-02 entradas/saídas/transferências/ajustes por motivo com histórico saldo derivado de movimentos consistentes
CREATE TABLE IF NOT EXISTS ast_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES ast_products(id) ON DELETE CASCADE,
  movement_type ast_movement_type NOT NULL,
  quantity INT NOT NULL CHECK (quantity != 0),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  reference_type TEXT CHECK (reference_type IS NULL OR char_length(reference_type) BETWEEN 3 AND 100),
  reference_id TEXT CHECK (reference_id IS NULL OR char_length(reference_id) BETWEEN 3 AND 200),
  from_location TEXT CHECK (from_location IS NULL OR char_length(from_location) BETWEEN 3 AND 200),
  to_location TEXT CHECK (to_location IS NULL OR char_length(to_location) BETWEEN 3 AND 200),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_stock_movements_product_idx ON ast_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS ast_stock_movements_type_idx ON ast_stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS ast_stock_movements_created_idx ON ast_stock_movements(created_at);

-- Trigger para atualizar stock_current derivado de movimentos consistentes
CREATE OR REPLACE FUNCTION ast_update_stock_current() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type IN ('entrada','ajuste') AND NEW.quantity >0 THEN
    UPDATE ast_products SET stock_current = stock_current + NEW.quantity, updated_at = NOW() WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'entrada' AND NEW.quantity <0 THEN
    UPDATE ast_products SET stock_current = stock_current + NEW.quantity, updated_at = NOW() WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'saida' THEN
    UPDATE ast_products SET stock_current = stock_current - ABS(NEW.quantity), updated_at = NOW() WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'transferencia' THEN
    -- transferência não altera total, apenas local
    UPDATE ast_products SET updated_at = NOW() WHERE id = NEW.product_id;
  ELSIF NEW.movement_type = 'reserva' THEN
    -- reserva não é saída, apenas reserva lógica
    UPDATE ast_products SET updated_at = NOW() WHERE id = NEW.product_id;
  ELSIF NEW.movement_type IN ('liberacao','conversao','cancelamento') THEN
    UPDATE ast_products SET updated_at = NOW() WHERE id = NEW.product_id;
  ELSE
    UPDATE ast_products SET updated_at = NOW() WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ast_stock_movements_update_stock ON ast_stock_movements;
CREATE TRIGGER ast_stock_movements_update_stock AFTER INSERT ON ast_stock_movements FOR EACH ROW EXECUTE FUNCTION ast_update_stock_current();

-- AST-03 reserva para proposta/implantação sem confundir reserva com saída liberação em cancelamento
CREATE TABLE IF NOT EXISTS ast_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES ast_products(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity >0),
  reservation_type ast_reservation_type NOT NULL DEFAULT 'outro',
  reference_type TEXT NOT NULL CHECK (char_length(reference_type) BETWEEN 3 AND 100),
  reference_id TEXT NOT NULL CHECK (char_length(reference_id) BETWEEN 3 AND 200),
  status ast_reservation_status NOT NULL DEFAULT 'reservado',
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ast_reservation_expires_check CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS ast_reservations_product_idx ON ast_reservations(product_id);
CREATE INDEX IF NOT EXISTS ast_reservations_status_idx ON ast_reservations(status);
CREATE INDEX IF NOT EXISTS ast_reservations_ref_idx ON ast_reservations(reference_type, reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS ast_reservations_unique_active ON ast_reservations(product_id, reference_type, reference_id) WHERE status='reservado';

-- AST-04 equipamentos serializados por cliente/posto/colaborador proprietário garantia manutenção termo de guarda
CREATE TABLE IF NOT EXISTS ast_serialized_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES ast_products(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL UNIQUE CHECK (char_length(serial_number) BETWEEN 3 AND 200),
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  employee_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  owner_type TEXT NOT NULL CHECK (char_length(owner_type) BETWEEN 3 AND 100),
  owner_name TEXT NOT NULL CHECK (char_length(owner_name) BETWEEN 2 AND 200),
  warranty_until DATE,
  status ast_asset_status NOT NULL DEFAULT 'disponivel',
  custody_term_file_name TEXT CHECK (custody_term_file_name IS NULL OR char_length(custody_term_file_name) BETWEEN 1 AND 500),
  custody_term_file_url TEXT CHECK (custody_term_file_url IS NULL OR char_length(custody_term_file_url) BETWEEN 5 AND 1000),
  custody_term_storage_key TEXT UNIQUE CHECK (custody_term_storage_key IS NULL OR char_length(custody_term_storage_key) BETWEEN 5 AND 500),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_serialized_assets_product_idx ON ast_serialized_assets(product_id);
CREATE INDEX IF NOT EXISTS ast_serialized_assets_serial_idx ON ast_serialized_assets(serial_number);
CREATE INDEX IF NOT EXISTS ast_serialized_assets_client_idx ON ast_serialized_assets(client_account_id);
CREATE INDEX IF NOT EXISTS ast_serialized_assets_contract_idx ON ast_serialized_assets(contract_id);
CREATE INDEX IF NOT EXISTS ast_serialized_assets_status_idx ON ast_serialized_assets(status);

-- AST-05 entrega/devolução avaria/perda fotos pertinentes e conferência
CREATE TABLE IF NOT EXISTS ast_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES ast_serialized_assets(id) ON DELETE CASCADE,
  delivery_type ast_delivery_type NOT NULL,
  delivered_to_name TEXT NOT NULL CHECK (char_length(delivered_to_name) BETWEEN 2 AND 200),
  delivered_to_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  delivered_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  condition_before TEXT CHECK (condition_before IS NULL OR char_length(condition_before) BETWEEN 10 AND 1000),
  condition_after TEXT CHECK (condition_after IS NULL OR char_length(condition_after) BETWEEN 10 AND 1000),
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  conference_notes TEXT CHECK (conference_notes IS NULL OR char_length(conference_notes) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_deliveries_asset_idx ON ast_deliveries(asset_id);
CREATE INDEX IF NOT EXISTS ast_deliveries_type_idx ON ast_deliveries(delivery_type);

-- AST-06 requisição cotação seleção aprovação pedido recebimento vínculo conta a pagar
CREATE TABLE IF NOT EXISTS ast_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^REQ-AST-[0-9]{8}-[A-Z0-9]{4}$'),
  product_id UUID REFERENCES ast_products(id) ON DELETE SET NULL,
  quantity INT NOT NULL CHECK (quantity >0),
  requester_name TEXT NOT NULL CHECK (char_length(requester_name) BETWEEN 2 AND 200),
  requester_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  urgency ast_urgency NOT NULL DEFAULT 'media',
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  status ast_requisition_status NOT NULL DEFAULT 'rascunho',
  approved_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ast_requisition_approved_requires_approver CHECK ((status != 'aprovado') OR (approved_by_identity IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ast_requisitions_protocol_idx ON ast_requisitions(protocol);
CREATE INDEX IF NOT EXISTS ast_requisitions_status_idx ON ast_requisitions(status);
CREATE INDEX IF NOT EXISTS ast_requisitions_product_idx ON ast_requisitions(product_id);

CREATE TABLE IF NOT EXISTS ast_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES ast_requisitions(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES ast_suppliers(id) ON DELETE CASCADE,
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >=0),
  total_price_cents BIGINT NOT NULL CHECK (total_price_cents >=0),
  delivery_days INT CHECK (delivery_days IS NULL OR delivery_days >=0),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  is_selected BOOLEAN NOT NULL DEFAULT false,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requisition_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS ast_quotations_requisition_idx ON ast_quotations(requisition_id);
CREATE INDEX IF NOT EXISTS ast_quotations_supplier_idx ON ast_quotations(supplier_id);

CREATE TABLE IF NOT EXISTS ast_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^PED-AST-[0-9]{8}-[A-Z0-9]{4}$'),
  requisition_id UUID REFERENCES ast_requisitions(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES ast_suppliers(id) ON DELETE SET NULL,
  status ast_order_status NOT NULL DEFAULT 'rascunho',
  total_amount_cents BIGINT NOT NULL CHECK (total_amount_cents >=0),
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  payable_id UUID REFERENCES fin_accounts_payable(id) ON DELETE SET NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_purchase_orders_protocol_idx ON ast_purchase_orders(protocol);
CREATE INDEX IF NOT EXISTS ast_purchase_orders_status_idx ON ast_purchase_orders(status);
CREATE INDEX IF NOT EXISTS ast_purchase_orders_supplier_idx ON ast_purchase_orders(supplier_id);

-- Históricos imutáveis
CREATE TABLE IF NOT EXISTS ast_requisition_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES ast_requisitions(id) ON DELETE CASCADE,
  previous_status ast_requisition_status,
  next_status ast_requisition_status NOT NULL,
  previous_quantity INT,
  next_quantity INT,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_requisition_history_req_idx ON ast_requisition_history(requisition_id);

CREATE TABLE IF NOT EXISTS ast_order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES ast_purchase_orders(id) ON DELETE CASCADE,
  previous_status ast_order_status,
  next_status ast_order_status NOT NULL,
  previous_amount BIGINT,
  next_amount BIGINT,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_order_history_order_idx ON ast_order_history(order_id);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION ast_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ast_suppliers_touch ON ast_suppliers; CREATE TRIGGER ast_suppliers_touch BEFORE UPDATE ON ast_suppliers FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at();
DROP TRIGGER IF EXISTS ast_products_touch ON ast_products; CREATE TRIGGER ast_products_touch BEFORE UPDATE ON ast_products FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at();
DROP TRIGGER IF EXISTS ast_reservations_touch ON ast_reservations; CREATE TRIGGER ast_reservations_touch BEFORE UPDATE ON ast_reservations FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at();
DROP TRIGGER IF EXISTS ast_serialized_assets_touch ON ast_serialized_assets; CREATE TRIGGER ast_serialized_assets_touch BEFORE UPDATE ON ast_serialized_assets FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at();
DROP TRIGGER IF EXISTS ast_requisitions_touch ON ast_requisitions; CREATE TRIGGER ast_requisitions_touch BEFORE UPDATE ON ast_requisitions FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at();
DROP TRIGGER IF EXISTS ast_purchase_orders_touch ON ast_purchase_orders; CREATE TRIGGER ast_purchase_orders_touch BEFORE UPDATE ON ast_purchase_orders FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at();

-- Imutabilidade históricos
CREATE OR REPLACE FUNCTION ast_block_update_delete() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'immutable_history'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ast_requisition_history_immutable ON ast_requisition_history; CREATE TRIGGER ast_requisition_history_immutable BEFORE UPDATE OR DELETE ON ast_requisition_history FOR EACH ROW EXECUTE FUNCTION ast_block_update_delete();
DROP TRIGGER IF EXISTS ast_order_history_immutable ON ast_order_history; CREATE TRIGGER ast_order_history_immutable BEFORE UPDATE OR DELETE ON ast_order_history FOR EACH ROW EXECUTE FUNCTION ast_block_update_delete();

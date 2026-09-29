-- AST-07/08/09/10/11/12 inventário físico divergências ajuste aprovado ordem serviço solicitante contrato técnico agenda diagnóstico checklist peças execução evidências antes/depois aceite garantia retorno custo acesso cliente somente aprovado manutenção preventiva/corretiva periodicidade alerta próxima visita histórico por ativo dossiê técnico CFTV modelos localização autorizada garantia documentação senhas fora cadastro/log comum materiais limpeza consumo por local reposição comparação previsto

DO $$ BEGIN CREATE TYPE ast_inventory_status AS ENUM ('rascunho','em_contagem','divergente','ajustado','aprovado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_os_status AS ENUM ('rascunho','aberta','em_execucao','aguardando_peca','aguardando_aprovacao','concluida','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_os_priority AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_maintenance_type AS ENUM ('preventiva','corretiva','preditiva','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ast_maintenance_status AS ENUM ('agendada','em_execucao','concluida','atrasada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AST-07 inventário físico divergências ajuste aprovado
CREATE TABLE IF NOT EXISTS ast_inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^INV-AST-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status ast_inventory_status NOT NULL DEFAULT 'rascunho',
  location TEXT NOT NULL CHECK (char_length(location) BETWEEN 3 AND 200),
  counted_by_identity UUID REFERENCES auth_identities(id),
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ast_inventory_approved_requires_approver CHECK ((status != 'aprovado') OR (approved_by_identity IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ast_inventories_protocol_idx ON ast_inventories(protocol);
CREATE INDEX IF NOT EXISTS ast_inventories_status_idx ON ast_inventories(status);

CREATE TABLE IF NOT EXISTS ast_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES ast_inventories(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES ast_products(id) ON DELETE CASCADE,
  expected_quantity INT NOT NULL CHECK (expected_quantity >=0),
  counted_quantity INT NOT NULL CHECK (counted_quantity >=0),
  divergence INT GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
  adjustment_quantity INT CHECK (adjustment_quantity IS NULL OR adjustment_quantity >=0),
  adjustment_reason TEXT CHECK (adjustment_reason IS NULL OR char_length(adjustment_reason) BETWEEN 10 AND 1000),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inventory_id, product_id)
);
CREATE INDEX IF NOT EXISTS ast_inventory_items_inventory_idx ON ast_inventory_items(inventory_id);
CREATE INDEX IF NOT EXISTS ast_inventory_items_product_idx ON ast_inventory_items(product_id);

-- AST-08 ordem serviço solicitante contrato técnico agenda diagnóstico checklist peças execução
CREATE TABLE IF NOT EXISTS ast_service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^OS-AST-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  requester_name TEXT NOT NULL CHECK (char_length(requester_name) BETWEEN 2 AND 200),
  requester_identity UUID REFERENCES auth_identities(id),
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  technician_name TEXT CHECK (technician_name IS NULL OR char_length(technician_name) BETWEEN 2 AND 200),
  technician_identity UUID REFERENCES auth_identities(id),
  status ast_os_status NOT NULL DEFAULT 'rascunho',
  priority ast_os_priority NOT NULL DEFAULT 'media',
  scheduled_at TIMESTAMPTZ,
  diagnosis TEXT CHECK (diagnosis IS NULL OR char_length(diagnosis) BETWEEN 10 AND 2000),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  execution_notes TEXT CHECK (execution_notes IS NULL OR char_length(execution_notes) BETWEEN 10 AND 2000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_service_orders_protocol_idx ON ast_service_orders(protocol);
CREATE INDEX IF NOT EXISTS ast_service_orders_status_idx ON ast_service_orders(status);
CREATE INDEX IF NOT EXISTS ast_service_orders_client_idx ON ast_service_orders(client_account_id);

-- AST-09 evidências antes/depois aceite garantia retorno custo acesso cliente somente aprovado
CREATE TABLE IF NOT EXISTS ast_service_order_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES ast_service_orders(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (char_length(evidence_type) BETWEEN 3 AND 100),
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  before_after TEXT NOT NULL CHECK (before_after IN ('antes','depois','outro')),
  is_client_visible BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  warranty_until DATE,
  cost_cents BIGINT CHECK (cost_cents IS NULL OR cost_cents >=0),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_service_order_evidences_order_idx ON ast_service_order_evidences(service_order_id);
CREATE INDEX IF NOT EXISTS ast_service_order_evidences_visible_idx ON ast_service_order_evidences(is_client_visible);

-- AST-10 manutenção preventiva/corretiva periodicidade alerta próxima visita histórico por ativo
CREATE TABLE IF NOT EXISTS ast_maintenance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES ast_serialized_assets(id) ON DELETE CASCADE,
  maintenance_type ast_maintenance_type NOT NULL DEFAULT 'preventiva',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  periodicity_days INT NOT NULL CHECK (periodicity_days >0),
  next_due_date DATE NOT NULL,
  status ast_maintenance_status NOT NULL DEFAULT 'agendada',
  alert_days_before INT NOT NULL DEFAULT 7 CHECK (alert_days_before >=0),
  last_executed_at DATE,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_maintenance_plans_asset_idx ON ast_maintenance_plans(asset_id);
CREATE INDEX IF NOT EXISTS ast_maintenance_plans_due_idx ON ast_maintenance_plans(next_due_date);
CREATE INDEX IF NOT EXISTS ast_maintenance_plans_status_idx ON ast_maintenance_plans(status);

CREATE TABLE IF NOT EXISTS ast_maintenance_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES ast_maintenance_plans(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES ast_serialized_assets(id) ON DELETE CASCADE,
  executed_at DATE NOT NULL,
  executed_by_name TEXT NOT NULL CHECK (char_length(executed_by_name) BETWEEN 2 AND 200),
  executed_by_identity UUID REFERENCES auth_identities(id),
  result TEXT NOT NULL CHECK (char_length(result) BETWEEN 10 AND 2000),
  next_due_date DATE,
  cost_cents BIGINT CHECK (cost_cents IS NULL OR cost_cents >=0),
  evidence_file_url TEXT CHECK (evidence_file_url IS NULL OR char_length(evidence_file_url) BETWEEN 5 AND 1000),
  evidence_storage_key TEXT UNIQUE CHECK (evidence_storage_key IS NULL OR char_length(evidence_storage_key) BETWEEN 5 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_maintenance_executions_plan_idx ON ast_maintenance_executions(plan_id);
CREATE INDEX IF NOT EXISTS ast_maintenance_executions_asset_idx ON ast_maintenance_executions(asset_id);

-- AST-11 dossiê técnico CFTV modelos localização autorizada garantia documentação senhas fora cadastro/log comum
CREATE TABLE IF NOT EXISTS ast_cftv_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  location TEXT NOT NULL CHECK (char_length(location) BETWEEN 3 AND 200),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 3 AND 200),
  manufacturer TEXT CHECK (manufacturer IS NULL OR char_length(manufacturer) BETWEEN 2 AND 200),
  serial_number TEXT CHECK (serial_number IS NULL OR char_length(serial_number) BETWEEN 3 AND 200),
  ip_address TEXT CHECK (ip_address IS NULL OR char_length(ip_address) BETWEEN 7 AND 45),
  warranty_until DATE,
  installation_date DATE,
  documentation_file_name TEXT CHECK (documentation_file_name IS NULL OR char_length(documentation_file_name) BETWEEN 1 AND 500),
  documentation_file_url TEXT CHECK (documentation_file_url IS NULL OR char_length(documentation_file_url) BETWEEN 5 AND 1000),
  documentation_storage_key TEXT UNIQUE CHECK (documentation_storage_key IS NULL OR char_length(documentation_storage_key) BETWEEN 5 AND 500),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 2000),
  -- senhas de equipamentos fora do cadastro/log comum: armazenar apenas referência segura, nunca senha em texto
  password_reference TEXT CHECK (password_reference IS NULL OR char_length(password_reference) BETWEEN 5 AND 200),
  password_storage_hint TEXT CHECK (password_storage_hint IS NULL OR char_length(password_storage_hint) BETWEEN 10 AND 500),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_cftv_dossiers_client_idx ON ast_cftv_dossiers(client_account_id);
CREATE INDEX IF NOT EXISTS ast_cftv_dossiers_contract_idx ON ast_cftv_dossiers(contract_id);

-- AST-12 materiais limpeza consumo por local reposição comparação previsto
CREATE TABLE IF NOT EXISTS ast_cleaning_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES ast_products(id) ON DELETE CASCADE,
  location TEXT NOT NULL CHECK (char_length(location) BETWEEN 3 AND 200),
  expected_consumption INT NOT NULL CHECK (expected_consumption >=0),
  actual_consumption INT NOT NULL CHECK (actual_consumption >=0),
  variance INT GENERATED ALWAYS AS (actual_consumption - expected_consumption) STORED,
  variance_percent NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN expected_consumption >0 THEN ((actual_consumption - expected_consumption)::NUMERIC / expected_consumption::NUMERIC * 100) ELSE NULL END
  ) STORED,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  needs_replacement BOOLEAN NOT NULL DEFAULT false,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, location, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS ast_cleaning_materials_product_idx ON ast_cleaning_materials(product_id);
CREATE INDEX IF NOT EXISTS ast_cleaning_materials_location_idx ON ast_cleaning_materials(location);

-- Históricos
CREATE TABLE IF NOT EXISTS ast_inventory_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES ast_inventories(id) ON DELETE CASCADE,
  previous_status ast_inventory_status,
  next_status ast_inventory_status NOT NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_inventory_history_inventory_idx ON ast_inventory_history(inventory_id);

CREATE TABLE IF NOT EXISTS ast_service_order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES ast_service_orders(id) ON DELETE CASCADE,
  previous_status ast_os_status,
  next_status ast_os_status NOT NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ast_service_order_history_order_idx ON ast_service_order_history(service_order_id);

-- Triggers
CREATE OR REPLACE FUNCTION ast_touch_updated_at2() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ast_inventories_touch ON ast_inventories; CREATE TRIGGER ast_inventories_touch BEFORE UPDATE ON ast_inventories FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at2();
DROP TRIGGER IF EXISTS ast_service_orders_touch ON ast_service_orders; CREATE TRIGGER ast_service_orders_touch BEFORE UPDATE ON ast_service_orders FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at2();
DROP TRIGGER IF EXISTS ast_maintenance_plans_touch ON ast_maintenance_plans; CREATE TRIGGER ast_maintenance_plans_touch BEFORE UPDATE ON ast_maintenance_plans FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at2();
DROP TRIGGER IF EXISTS ast_cftv_dossiers_touch ON ast_cftv_dossiers; CREATE TRIGGER ast_cftv_dossiers_touch BEFORE UPDATE ON ast_cftv_dossiers FOR EACH ROW EXECUTE FUNCTION ast_touch_updated_at2();

CREATE OR REPLACE FUNCTION ast_block_update_delete2() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'immutable_history'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ast_inventory_history_immutable ON ast_inventory_history; CREATE TRIGGER ast_inventory_history_immutable BEFORE UPDATE OR DELETE ON ast_inventory_history FOR EACH ROW EXECUTE FUNCTION ast_block_update_delete2();
DROP TRIGGER IF EXISTS ast_service_order_history_immutable ON ast_service_order_history; CREATE TRIGGER ast_service_order_history_immutable BEFORE UPDATE OR DELETE ON ast_service_order_history FOR EACH ROW EXECUTE FUNCTION ast_block_update_delete2();

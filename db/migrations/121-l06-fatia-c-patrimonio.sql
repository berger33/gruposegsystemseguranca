-- Migration 121: L06 Fatia C - Patrimônio, Estoque, Reservas, Ativos e Requisições Sintéticas
-- Adiciona vínculos canônicos com contratos, unidades e postos, flags de fluxo sintético e trava de estoque não-negativo.

DO $$
BEGIN
  -- 1. Trava de saldo não-negativo em ast_products
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ast_products_stock_non_negative'
  ) THEN
    ALTER TABLE ast_products ADD CONSTRAINT ast_products_stock_non_negative CHECK (stock_current >= 0);
  END IF;

  -- 2. Escopo de contrato e conta de cliente em ast_stock_movements
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_stock_movements' AND column_name='contract_id') THEN
    ALTER TABLE ast_stock_movements ADD COLUMN contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_stock_movements' AND column_name='client_account_id') THEN
    ALTER TABLE ast_stock_movements ADD COLUMN client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL;
  END IF;

  -- 3. Escopo de contrato e conta de cliente em ast_reservations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_reservations' AND column_name='contract_id') THEN
    ALTER TABLE ast_reservations ADD COLUMN contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_reservations' AND column_name='client_account_id') THEN
    ALTER TABLE ast_reservations ADD COLUMN client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL;
  END IF;

  -- 4. Vínculo de unidade e posto em ast_serialized_assets
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_serialized_assets' AND column_name='unit_id') THEN
    ALTER TABLE ast_serialized_assets ADD COLUMN unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_serialized_assets' AND column_name='post_id') THEN
    ALTER TABLE ast_serialized_assets ADD COLUMN post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL;
  END IF;

  -- 5. Vínculo de contrato e unidade em ast_requisitions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_requisitions' AND column_name='contract_id') THEN
    ALTER TABLE ast_requisitions ADD COLUMN contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_requisitions' AND column_name='unit_id') THEN
    ALTER TABLE ast_requisitions ADD COLUMN unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;
  END IF;

  -- 6. Rotulação sintética explícita em compras e cotações internas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_purchase_orders' AND column_name='is_synthetic_flow') THEN
    ALTER TABLE ast_purchase_orders ADD COLUMN is_synthetic_flow BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_quotations' AND column_name='is_synthetic_flow') THEN
    ALTER TABLE ast_quotations ADD COLUMN is_synthetic_flow BOOLEAN NOT NULL DEFAULT true;
  END IF;

END $$;

CREATE INDEX IF NOT EXISTS ast_stock_movements_contract_idx ON ast_stock_movements(contract_id);
CREATE INDEX IF NOT EXISTS ast_stock_movements_client_idx ON ast_stock_movements(client_account_id);
CREATE INDEX IF NOT EXISTS ast_reservations_contract_idx ON ast_reservations(contract_id);
CREATE INDEX IF NOT EXISTS ast_reservations_client_idx ON ast_reservations(client_account_id);
CREATE INDEX IF NOT EXISTS ast_serialized_assets_unit_idx ON ast_serialized_assets(unit_id);
CREATE INDEX IF NOT EXISTS ast_serialized_assets_post_idx ON ast_serialized_assets(post_id);
CREATE INDEX IF NOT EXISTS ast_requisitions_contract_idx ON ast_requisitions(contract_id);
CREATE INDEX IF NOT EXISTS ast_requisitions_unit_idx ON ast_requisitions(unit_id);

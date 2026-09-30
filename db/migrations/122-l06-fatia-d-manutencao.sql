-- Migration 122: L06 Fatia D - Inventário, Ordens de Serviço, Manutenção, Materiais e Dossiê Técnico
-- Adiciona vínculos canônicos com contratos, unidades e postos, além de suporte a evidências privadas L02.

DO $$
BEGIN
  -- 1. Vínculo de documento privado L02 em evidências de OS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_service_order_evidences' AND column_name='client_document_id') THEN
    ALTER TABLE ast_service_order_evidences ADD COLUMN client_document_id UUID REFERENCES client_documents(id) ON DELETE SET NULL;
  END IF;

  -- 2. Vínculo de posto e unidade em ast_service_orders
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_service_orders' AND column_name='post_id') THEN
    ALTER TABLE ast_service_orders ADD COLUMN post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_service_orders' AND column_name='unit_id') THEN
    ALTER TABLE ast_service_orders ADD COLUMN unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;
  END IF;

  -- 3. Vínculo de posto e unidade em ast_cftv_dossiers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_cftv_dossiers' AND column_name='post_id') THEN
    ALTER TABLE ast_cftv_dossiers ADD COLUMN post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_cftv_dossiers' AND column_name='unit_id') THEN
    ALTER TABLE ast_cftv_dossiers ADD COLUMN unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;
  END IF;

  -- 4. Vínculo de contrato e posto em ast_maintenance_plans
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_maintenance_plans' AND column_name='contract_id') THEN
    ALTER TABLE ast_maintenance_plans ADD COLUMN contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_maintenance_plans' AND column_name='post_id') THEN
    ALTER TABLE ast_maintenance_plans ADD COLUMN post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL;
  END IF;

  -- 5. Vínculo de contrato e posto em ast_cleaning_materials
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_cleaning_materials' AND column_name='contract_id') THEN
    ALTER TABLE ast_cleaning_materials ADD COLUMN contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_cleaning_materials' AND column_name='post_id') THEN
    ALTER TABLE ast_cleaning_materials ADD COLUMN post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL;
  END IF;

  -- 6. Vínculo de contrato e posto em ast_inventories
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_inventories' AND column_name='contract_id') THEN
    ALTER TABLE ast_inventories ADD COLUMN contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ast_inventories' AND column_name='post_id') THEN
    ALTER TABLE ast_inventories ADD COLUMN post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL;
  END IF;

END $$;

CREATE INDEX IF NOT EXISTS ast_service_order_evidences_doc_idx ON ast_service_order_evidences(client_document_id);
CREATE INDEX IF NOT EXISTS ast_service_orders_post_idx ON ast_service_orders(post_id);
CREATE INDEX IF NOT EXISTS ast_service_orders_unit_idx ON ast_service_orders(unit_id);
CREATE INDEX IF NOT EXISTS ast_cftv_dossiers_post_idx ON ast_cftv_dossiers(post_id);
CREATE INDEX IF NOT EXISTS ast_cftv_dossiers_unit_idx ON ast_cftv_dossiers(unit_id);
CREATE INDEX IF NOT EXISTS ast_maintenance_plans_contract_idx ON ast_maintenance_plans(contract_id);
CREATE INDEX IF NOT EXISTS ast_maintenance_plans_post_idx ON ast_maintenance_plans(post_id);
CREATE INDEX IF NOT EXISTS ast_cleaning_materials_contract_idx ON ast_cleaning_materials(contract_id);
CREATE INDEX IF NOT EXISTS ast_cleaning_materials_post_idx ON ast_cleaning_materials(post_id);
CREATE INDEX IF NOT EXISTS ast_inventories_contract_idx ON ast_inventories(contract_id);
CREATE INDEX IF NOT EXISTS ast_inventories_post_idx ON ast_inventories(post_id);

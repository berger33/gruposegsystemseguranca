-- CRM-15: orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção.

CREATE TABLE IF NOT EXISTS crm_technical_budgets (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  inspection_id UUID REFERENCES crm_inspections(id) ON DELETE SET NULL,
  labor_budget_id UUID REFERENCES crm_labor_budgets(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','aprovado','arquivado')),
  total_materials_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_materials_cost >= 0),
  total_equipment_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_equipment_cost >= 0),
  total_labor_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_labor_cost >= 0),
  total_installation_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_installation_cost >= 0),
  total_displacement_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_displacement_cost >= 0),
  total_infrastructure_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_infrastructure_cost >= 0),
  total_licenses_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_licenses_cost >= 0),
  total_warranty_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_warranty_cost >= 0),
  total_maintenance_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_maintenance_cost >= 0),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  margin_percent NUMERIC(5,2) CHECK (margin_percent IS NULL OR margin_percent BETWEEN -100 AND 100),
  warranty_description TEXT CHECK (warranty_description IS NULL OR char_length(warranty_description) <= 1000),
  maintenance_description TEXT CHECK (maintenance_description IS NULL OR char_length(maintenance_description) <= 1000),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by TEXT,
  created_by_id UUID REFERENCES auth_identities(id),
  approved_by UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_tech_budgets_company_idx ON crm_technical_budgets (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_tech_budgets_opportunity_idx ON crm_technical_budgets (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_tech_budgets_status_idx ON crm_technical_budgets (status, created_at DESC);

CREATE OR REPLACE FUNCTION crm_tech_budgets_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_tech_budgets_updated_at_trg ON crm_technical_budgets;
CREATE TRIGGER crm_tech_budgets_updated_at_trg BEFORE UPDATE ON crm_technical_budgets FOR EACH ROW EXECUTE FUNCTION crm_tech_budgets_set_updated_at();

CREATE TABLE IF NOT EXISTS crm_technical_budget_items (
  id UUID PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES crm_technical_budgets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('material','equipamento','mao_obra','instalacao','deslocamento','infraestrutura','licenca','garantia','manutencao','outro')),
  description VARCHAR(500) NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  equipment_id TEXT REFERENCES crm_equipment(id) ON DELETE SET NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit VARCHAR(50) CHECK (unit IS NULL OR char_length(unit) <= 50),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  supplier_name VARCHAR(200),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_tech_items_budget_idx ON crm_technical_budget_items (budget_id, type, created_at);
CREATE INDEX IF NOT EXISTS crm_tech_items_type_idx ON crm_technical_budget_items (type, created_at);

DROP TRIGGER IF EXISTS crm_tech_items_updated_at_trg ON crm_technical_budget_items;
CREATE TRIGGER crm_tech_items_updated_at_trg BEFORE UPDATE ON crm_technical_budget_items FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Auditoria
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept',
  'login','logout','session_revoke_all',
  'email_confirm','email_confirm_resend',
  'password_reset_request','password_reset_complete',
  'account_create','account_status',
  'grant_issue','grant_revoke',
  'contract_create','contract_status','contract_list',
  'document_upload','document_download','document_list',
  'ticket_open','ticket_status','ticket_list',
  'mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify',
  'email_change_request','email_change_confirm','email_change_cancel','email_change_alert',
  'grant_contract_restrict','grant_unit_restrict',
  'staff_invite','staff_login','staff_role_change','staff_session_revoke',
  'permission_grant','permission_revoke','access_review',
  'assignment_create','assignment_end','assignment_suspend',
  'scale_create','scale_update',
  'time_entry_start','time_entry_end','time_entry_ronda',
  'handover_create','handover_accept',
  'audit_query','audit_export','invite_rate_limited',
  'notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry',
  'integration_check','integration_test','integration_update',
  'catalog_create','catalog_update','catalog_publish',
  'lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel',
  'crm_company_create','crm_company_update','crm_company_status',
  'crm_contact_create','crm_contact_update',
  'crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change',
  'crm_task_create','crm_task_update','crm_task_status',
  'crm_interaction_create',
  'crm_visit_create','crm_visit_update','crm_visit_status','crm_visit_confirm','crm_visit_cancel',
  'crm_lead_convert',
  'crm_import_create','crm_import_commit','crm_import_export',
  'crm_equipment_create','crm_equipment_update',
  'crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer',
  'crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_status','crm_labor_budget_item_create','crm_labor_budget_item_update',
  'crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_status','crm_technical_budget_item_create','crm_technical_budget_item_update'
));

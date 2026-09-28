-- 032-con01-contract-units-docs: CON-01 contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada
DO $$
BEGIN
  -- Adicionar colunas para CON-01 em crm_contracts se não existirem
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='responsible_id') THEN
    ALTER TABLE crm_contracts ADD COLUMN responsible_id UUID REFERENCES auth_identities(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='responsible_name') THEN
    ALTER TABLE crm_contracts ADD COLUMN responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='starts_on') THEN
    ALTER TABLE crm_contracts ADD COLUMN starts_on DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='ends_on') THEN
    ALTER TABLE crm_contracts ADD COLUMN ends_on DATE CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='origin_details') THEN
    ALTER TABLE crm_contracts ADD COLUMN origin_details TEXT CHECK (origin_details IS NULL OR char_length(origin_details) BETWEEN 1 AND 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='service_summary') THEN
    ALTER TABLE crm_contracts ADD COLUMN service_summary TEXT CHECK (service_summary IS NULL OR char_length(service_summary) BETWEEN 1 AND 2000);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_contract_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES crm_company_units(id) ON DELETE CASCADE,
  role TEXT CHECK (role IS NULL OR char_length(role) BETWEEN 1 AND 100),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, unit_id)
);

CREATE INDEX IF NOT EXISTS crm_contract_units_contract_idx ON crm_contract_units(contract_id);
CREATE INDEX IF NOT EXISTS crm_contract_units_unit_idx ON crm_contract_units(unit_id);

CREATE TABLE IF NOT EXISTS crm_contract_responsibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT NOT NULL CHECK (char_length(responsible_name) BETWEEN 1 AND 120),
  role TEXT NOT NULL CHECK (char_length(role) BETWEEN 1 AND 100),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, responsible_id, role)
);

CREATE INDEX IF NOT EXISTS crm_contract_responsibles_contract_idx ON crm_contract_responsibles(contract_id);
CREATE INDEX IF NOT EXISTS crm_contract_responsibles_responsible_idx ON crm_contract_responsibles(responsible_id);

CREATE TABLE IF NOT EXISTS crm_contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 100),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 1 AND 1000),
  storage_key TEXT CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  uploaded_by TEXT NOT NULL CHECK (char_length(uploaded_by) BETWEEN 1 AND 80),
  uploaded_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contract_documents_contract_idx ON crm_contract_documents(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_contract_documents_category_idx ON crm_contract_documents(category);

-- Índices adicionais para CON-01
CREATE INDEX IF NOT EXISTS crm_contracts_responsible_idx ON crm_contracts(responsible_id);
CREATE INDEX IF NOT EXISTS crm_contracts_vigencia_idx ON crm_contracts(starts_on, ends_on);
CREATE INDEX IF NOT EXISTS crm_contracts_origin_idx ON crm_contracts(origin);

-- Auditoria CON-01
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
  'crm_company_create','crm_company_update','crm_company_export',
  'crm_contact_create','crm_contact_update',
  'crm_opportunity_create','crm_opportunity_update',
  'crm_lead_convert',
  'crm_import_create','crm_import_preview','crm_import_commit',
  'crm_equipment_create','crm_equipment_update',
  'crm_inspection_template_create','crm_inspection_create','crm_inspection_answer',
  'crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_item_create',
  'crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_item_create',
  'crm_cost_parameter_create','crm_cost_parameter_update',
  'crm_price_scenario_create','crm_price_scenario_update',
  'crm_discount_policy_create','crm_discount_policy_update',
  'crm_discount_request_create','crm_discount_request_update',
  'crm_proposal_create','crm_proposal_update','crm_proposal_status_enviada','crm_proposal_status_aceita','crm_proposal_item_create',
  'crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status',
  'crm_acceptance_link_create','crm_acceptance_link_used',
  'crm_contract_create','crm_contract_idempotent_hit','crm_contract_implantation_create',
  'crm_report_view','crm_report_snapshot',
  'crm_goal_create','crm_goal_update','crm_goal_status',
  'crm_commission_rule_create','crm_commission_rule_update','crm_commission_rule_status',
  'crm_commission_create','crm_commission_update','crm_commission_status',
  'crm_library_create','crm_library_update','crm_library_approve','crm_library_reject',
  'crm_campaign_create','crm_campaign_update','crm_campaign_status',
  'crm_proposal_comparison_create',
  'crm_partner_create','crm_partner_update','crm_partner_status',
  'crm_referral_create','crm_referral_update','crm_referral_status',
  'crm_renewal_create','crm_renewal_update','crm_renewal_status',
  'crm_contract_unit_add','crm_contract_unit_remove',
  'crm_contract_responsible_add','crm_contract_responsible_remove',
  'crm_contract_document_upload'
));

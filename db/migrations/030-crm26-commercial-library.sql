-- 030-crm26-commercial-library: CRM-26 biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_library_type') THEN
    CREATE TYPE crm_library_type AS ENUM ('apresentacao','case','documento','video','planilha','imagem','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_library_status') THEN
    CREATE TYPE crm_library_status AS ENUM ('rascunho','em_revisao','aprovado','rejeitado','arquivado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_campaign_status') THEN
    CREATE TYPE crm_campaign_status AS ENUM ('rascunho','ativa','pausada','encerrada','cancelada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_campaign_segment') THEN
    CREATE TYPE crm_campaign_segment AS ENUM ('setor','cidade','tipo_empresa','campanha','origem','responsavel','outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_commercial_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  type crm_library_type NOT NULL DEFAULT 'documento',
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  category TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 100),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 1 AND 1000),
  storage_key TEXT CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 1 AND 200),
  status crm_library_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  approved_by_role TEXT CHECK (approved_by_role IS NULL OR char_length(approved_by_role) BETWEEN 1 AND 80),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 500),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_library_type_status_idx ON crm_commercial_library(type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_library_category_idx ON crm_commercial_library(category);
CREATE INDEX IF NOT EXISTS crm_library_created_at_idx ON crm_commercial_library(created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_library_updated_at ON crm_commercial_library;
CREATE TRIGGER trg_crm_library_updated_at BEFORE UPDATE ON crm_commercial_library FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  segment_type crm_campaign_segment NOT NULL DEFAULT 'outro',
  segment_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  status crm_campaign_status NOT NULL DEFAULT 'rascunho',
  start_date DATE,
  end_date DATE CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  target_count INT CHECK (target_count IS NULL OR target_count >= 0),
  library_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_campaigns_status_idx ON crm_campaigns(status, start_date DESC);
CREATE INDEX IF NOT EXISTS crm_campaigns_segment_idx ON crm_campaigns(segment_type);
CREATE INDEX IF NOT EXISTS crm_campaigns_created_at_idx ON crm_campaigns(created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_campaigns_updated_at ON crm_campaigns;
CREATE TRIGGER trg_crm_campaigns_updated_at BEFORE UPDATE ON crm_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','respondido','convertido','descartado')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, company_id, contact_id)
);

CREATE INDEX IF NOT EXISTS crm_campaign_targets_campaign_idx ON crm_campaign_targets(campaign_id, status);
CREATE INDEX IF NOT EXISTS crm_campaign_targets_company_idx ON crm_campaign_targets(company_id);

CREATE TABLE IF NOT EXISTS crm_proposal_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  proposal_ids JSONB NOT NULL CHECK (jsonb_array_length(proposal_ids) BETWEEN 2 AND 5),
  comparison_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_proposal_comparisons_created_at_idx ON crm_proposal_comparisons(created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_proposal_comparisons_updated_at ON crm_proposal_comparisons;
CREATE TRIGGER trg_crm_proposal_comparisons_updated_at BEFORE UPDATE ON crm_proposal_comparisons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria CRM-26
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
  'crm_proposal_comparison_create'
));

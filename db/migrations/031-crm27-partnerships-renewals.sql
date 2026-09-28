-- 031-crm27-partnerships-renewals: CRM-27 parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_partner_type') THEN
    CREATE TYPE crm_partner_type AS ENUM ('parceiro','revenda','indicador','fornecedor','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_partner_status') THEN
    CREATE TYPE crm_partner_status AS ENUM ('ativo','inativo','suspenso','arquivado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_referral_status') THEN
    CREATE TYPE crm_referral_status AS ENUM ('pendente','em_contato','qualificada','convertida','rejeitada','expirada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_renewal_type') THEN
    CREATE TYPE crm_renewal_type AS ENUM ('renovacao','upsell','cross_sell','recuperacao');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_renewal_status') THEN
    CREATE TYPE crm_renewal_status AS ENUM ('planejada','em_negociacao','proposta_enviada','ganha','perdida','cancelada');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  type crm_partner_type NOT NULL DEFAULT 'parceiro',
  document_ref TEXT CHECK (document_ref IS NULL OR char_length(document_ref) BETWEEN 1 AND 32),
  email TEXT CHECK (email IS NULL OR char_length(email) BETWEEN 5 AND 320),
  phone TEXT CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 30),
  city TEXT CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 100),
  state TEXT CHECK (state IS NULL OR char_length(state) BETWEEN 1 AND 2),
  status crm_partner_status NOT NULL DEFAULT 'ativo',
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  commission_percent NUMERIC(5,2) CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100)),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000),
  origin TEXT CHECK (origin IS NULL OR char_length(origin) BETWEEN 1 AND 100),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_partners_type_status_idx ON crm_partners(type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_partners_responsible_idx ON crm_partners(responsible_id);
CREATE INDEX IF NOT EXISTS crm_partners_city_idx ON crm_partners(city, state);

DROP TRIGGER IF EXISTS trg_crm_partners_updated_at ON crm_partners;
CREATE TRIGGER trg_crm_partners_updated_at BEFORE UPDATE ON crm_partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES crm_partners(id) ON DELETE SET NULL,
  referrer_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  referrer_company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  referred_company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  referred_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  status crm_referral_status NOT NULL DEFAULT 'pendente',
  reward_type TEXT CHECK (reward_type IS NULL OR char_length(reward_type) BETWEEN 1 AND 100),
  reward_value NUMERIC(14,2) CHECK (reward_value IS NULL OR reward_value >= 0),
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  converted_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 500),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (partner_id IS NOT NULL OR referrer_contact_id IS NOT NULL OR referrer_company_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS crm_referrals_partner_idx ON crm_referrals(partner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_referrals_status_idx ON crm_referrals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_referrals_responsible_idx ON crm_referrals(responsible_id);
CREATE INDEX IF NOT EXISTS crm_referrals_opportunity_idx ON crm_referrals(opportunity_id);

DROP TRIGGER IF EXISTS trg_crm_referrals_updated_at ON crm_referrals;
CREATE TRIGGER trg_crm_referrals_updated_at BEFORE UPDATE ON crm_referrals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  previous_contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  type crm_renewal_type NOT NULL DEFAULT 'renovacao',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  previous_value NUMERIC(14,2) CHECK (previous_value IS NULL OR previous_value >= 0),
  new_value NUMERIC(14,2) CHECK (new_value IS NULL OR new_value >= 0),
  uplift_percent NUMERIC(6,2),
  renewal_date DATE,
  forecast_date DATE,
  status crm_renewal_status NOT NULL DEFAULT 'planejada',
  loss_reason TEXT CHECK (loss_reason IS NULL OR char_length(loss_reason) BETWEEN 1 AND 500),
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  metrics JSONB NOT NULL DEFAULT '{"dias_desde_ultimo_contato": null, "tentativas_contato": 0, "motivo_perda_anterior": null}'::jsonb,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_renewals_company_idx ON crm_renewals(company_id, type, status, renewal_date DESC);
CREATE INDEX IF NOT EXISTS crm_renewals_contract_idx ON crm_renewals(contract_id);
CREATE INDEX IF NOT EXISTS crm_renewals_status_idx ON crm_renewals(status, renewal_date DESC);
CREATE INDEX IF NOT EXISTS crm_renewals_responsible_idx ON crm_renewals(responsible_id, renewal_date DESC);
CREATE INDEX IF NOT EXISTS crm_renewals_type_idx ON crm_renewals(type, status);

DROP TRIGGER IF EXISTS trg_crm_renewals_updated_at ON crm_renewals;
CREATE TRIGGER trg_crm_renewals_updated_at BEFORE UPDATE ON crm_renewals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Métricas por responsável
CREATE TABLE IF NOT EXISTS crm_partner_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES crm_partners(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  referrals_count INT NOT NULL DEFAULT 0 CHECK (referrals_count >= 0),
  converted_count INT NOT NULL DEFAULT 0 CHECK (converted_count >= 0),
  conversion_rate NUMERIC(5,2),
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  responsible_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(partner_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS crm_partner_metrics_partner_idx ON crm_partner_metrics(partner_id, period_start DESC);

-- Auditoria CRM-27
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
  'crm_renewal_create','crm_renewal_update','crm_renewal_status'
));

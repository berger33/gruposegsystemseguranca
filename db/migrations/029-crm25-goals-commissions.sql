-- 029-crm25-goals-commissions: CRM-25 metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento automático
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_goal_status') THEN
    CREATE TYPE crm_goal_status AS ENUM ('rascunho','ativo','atingida','nao_atingida','cancelada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_commission_base') THEN
    CREATE TYPE crm_commission_base AS ENUM ('contratado','faturado','recebido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_commission_period') THEN
    CREATE TYPE crm_commission_period AS ENUM ('mensal','trimestral','semestral','anual','por_contrato');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_commission_cancel_rule') THEN
    CREATE TYPE crm_commission_cancel_rule AS ENUM ('mantem','estorna_proporcional','estorna_total','recalcula');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_commission_status') THEN
    CREATE TYPE crm_commission_status AS ENUM ('rascunho','pendente_aprovacao','aprovada','rejeitada','cancelada','estornada');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  target_value NUMERIC(14,2) NOT NULL CHECK (target_value >= 0),
  target_type crm_commission_base NOT NULL DEFAULT 'contratado',
  status crm_goal_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS crm_goals_responsible_idx ON crm_goals(responsible_id, period_start DESC);
CREATE INDEX IF NOT EXISTS crm_goals_period_idx ON crm_goals(period_start, period_end);
CREATE INDEX IF NOT EXISTS crm_goals_status_idx ON crm_goals(status);

DROP TRIGGER IF EXISTS trg_crm_goals_updated_at ON crm_goals;
CREATE TRIGGER trg_crm_goals_updated_at BEFORE UPDATE ON crm_goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  base_type crm_commission_base NOT NULL DEFAULT 'contratado',
  period_type crm_commission_period NOT NULL DEFAULT 'mensal',
  percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  cancel_rule crm_commission_cancel_rule NOT NULL DEFAULT 'estorna_proporcional',
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approver_role TEXT CHECK (approver_role IS NULL OR char_length(approver_role) BETWEEN 1 AND 80),
  min_value NUMERIC(14,2) CHECK (min_value IS NULL OR min_value >= 0),
  max_value NUMERIC(14,2) CHECK (max_value IS NULL OR max_value >= 0),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativa','inativa')),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_commission_rules_base_idx ON crm_commission_rules(base_type, status);
CREATE INDEX IF NOT EXISTS crm_commission_rules_status_idx ON crm_commission_rules(status);

DROP TRIGGER IF EXISTS trg_crm_commission_rules_updated_at ON crm_commission_rules;
CREATE TRIGGER trg_crm_commission_rules_updated_at BEFORE UPDATE ON crm_commission_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES crm_commission_rules(id) ON DELETE RESTRICT,
  goal_id UUID REFERENCES crm_goals(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  base_type crm_commission_base NOT NULL,
  base_value NUMERIC(14,2) NOT NULL CHECK (base_value >= 0),
  percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  calculated_value NUMERIC(14,2) NOT NULL CHECK (calculated_value >= 0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  status crm_commission_status NOT NULL DEFAULT 'rascunho',
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR char_length(cancel_reason) BETWEEN 1 AND 500),
  approval_notes TEXT CHECK (approval_notes IS NULL OR char_length(approval_notes) BETWEEN 1 AND 1000),
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  paid_note TEXT CHECK (paid_note IS NULL OR char_length(paid_note) BETWEEN 1 AND 500),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS crm_commissions_rule_idx ON crm_commissions(rule_id, status);
CREATE INDEX IF NOT EXISTS crm_commissions_goal_idx ON crm_commissions(goal_id);
CREATE INDEX IF NOT EXISTS crm_commissions_responsible_idx ON crm_commissions(responsible_id, period_start DESC);
CREATE INDEX IF NOT EXISTS crm_commissions_status_idx ON crm_commissions(status);
CREATE INDEX IF NOT EXISTS crm_commissions_period_idx ON crm_commissions(period_start, period_end);

DROP TRIGGER IF EXISTS trg_crm_commissions_updated_at ON crm_commissions;
CREATE TRIGGER trg_crm_commissions_updated_at BEFORE UPDATE ON crm_commissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria CRM-25
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
  'crm_commission_create','crm_commission_update','crm_commission_status'
));

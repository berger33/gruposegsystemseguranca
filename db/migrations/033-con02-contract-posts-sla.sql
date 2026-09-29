-- 033-con02-contract-posts-sla: CON-02 itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_post_shift') THEN
    CREATE TYPE crm_post_shift AS ENUM ('diurno','noturno','12x36_dia','12x36_noite','24x48','comercial','madrugada','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_sla_service') THEN
    CREATE TYPE crm_sla_service AS ENUM ('vigilancia','portaria','limpeza','monitoramento','manutencao','atendimento','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_obligation_party') THEN
    CREATE TYPE crm_obligation_party AS ENUM ('contratante','contratada','ambas');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_contract_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  shift crm_post_shift NOT NULL DEFAULT 'comercial',
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 100),
  schedule JSONB NOT NULL DEFAULT '{"dias": ["seg","ter","qua","qui","sex"], "inicio": "08:00", "fim": "18:00"}'::jsonb,
  location TEXT CHECK (location IS NULL OR char_length(location) BETWEEN 1 AND 200),
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  is_24h BOOLEAN NOT NULL DEFAULT false,
  recurrence_type TEXT NOT NULL DEFAULT 'recorrente' CHECK (recurrence_type IN ('recorrente','avulso','implantacao','outro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contract_posts_contract_idx ON crm_contract_posts(contract_id, shift);
CREATE INDEX IF NOT EXISTS crm_contract_posts_unit_idx ON crm_contract_posts(unit_id);

DROP TRIGGER IF EXISTS trg_crm_contract_posts_updated_at ON crm_contract_posts;
CREATE TRIGGER trg_crm_contract_posts_updated_at BEFORE UPDATE ON crm_contract_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_sla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  service_type crm_sla_service NOT NULL DEFAULT 'vigilancia',
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  response_time_minutes INT CHECK (response_time_minutes IS NULL OR response_time_minutes BETWEEN 1 AND 10080),
  resolution_time_minutes INT CHECK (resolution_time_minutes IS NULL OR resolution_time_minutes BETWEEN 1 AND 10080),
  availability_percent NUMERIC(5,2) CHECK (availability_percent IS NULL OR (availability_percent >= 0 AND availability_percent <= 100)),
  penalty_description TEXT CHECK (penalty_description IS NULL OR char_length(penalty_description) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contract_sla_contract_idx ON crm_contract_sla(contract_id, service_type);

DROP TRIGGER IF EXISTS trg_crm_contract_sla_updated_at ON crm_contract_sla;
CREATE TRIGGER trg_crm_contract_sla_updated_at BEFORE UPDATE ON crm_contract_sla FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  party crm_obligation_party NOT NULL DEFAULT 'contratada',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','atrasada','cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contract_obligations_contract_idx ON crm_contract_obligations(contract_id, party, status);

DROP TRIGGER IF EXISTS trg_crm_contract_obligations_updated_at ON crm_contract_obligations;
CREATE TRIGGER trg_crm_contract_obligations_updated_at BEFORE UPDATE ON crm_contract_obligations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  category TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contract_exclusions_contract_idx ON crm_contract_exclusions(contract_id);

CREATE TABLE IF NOT EXISTS crm_contract_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL CHECK (char_length(milestone) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  planned_date DATE NOT NULL,
  completed_date DATE CHECK (completed_date IS NULL OR completed_date >= planned_date),
  status TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado','em_andamento','concluido','atrasado','cancelado')),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contract_schedule_contract_idx ON crm_contract_schedule(contract_id, planned_date);
CREATE INDEX IF NOT EXISTS crm_contract_schedule_status_idx ON crm_contract_schedule(status, planned_date);

DROP TRIGGER IF EXISTS trg_crm_contract_schedule_updated_at ON crm_contract_schedule;
CREATE TRIGGER trg_crm_contract_schedule_updated_at BEFORE UPDATE ON crm_contract_schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria CON-02
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
  'crm_contract_document_upload',
  'crm_contract_post_create','crm_contract_post_update','crm_contract_post_remove',
  'crm_contract_sla_create','crm_contract_sla_update',
  'crm_contract_obligation_create','crm_contract_obligation_update',
  'crm_contract_exclusion_create','crm_contract_schedule_create','crm_contract_schedule_update'
));

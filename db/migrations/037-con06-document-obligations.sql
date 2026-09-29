-- 037-con06-document-obligations: CON-06 obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_doc_obligation_category') THEN
    CREATE TYPE crm_doc_obligation_category AS ENUM ('certidao','alvara','licenca','comprovante','contrato','atestado','seguro','treinamento','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_doc_obligation_periodicity') THEN
    CREATE TYPE crm_doc_obligation_periodicity AS ENUM ('unica','mensal','trimestral','semestral','anual','sob_demanda','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_doc_obligation_status') THEN
    CREATE TYPE crm_doc_obligation_status AS ENUM ('pendente','em_analise','aprovado','rejeitado','vencido','cancelado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_document_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category crm_doc_obligation_category NOT NULL DEFAULT 'outro',
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  periodicity crm_doc_obligation_periodicity NOT NULL DEFAULT 'unica',
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  status crm_doc_obligation_status NOT NULL DEFAULT 'pendente',
  due_date DATE,
  last_submitted_at TIMESTAMPTZ,
  next_due_date DATE,
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 1 AND 1000),
  storage_key TEXT CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 1 AND 200),
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 1000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (contract_id IS NOT NULL OR company_id IS NOT NULL),
  CHECK (due_date IS NULL OR next_due_date IS NULL OR next_due_date >= due_date)
);

CREATE INDEX IF NOT EXISTS crm_doc_obligations_contract_idx ON crm_document_obligations(contract_id, status, due_date);
CREATE INDEX IF NOT EXISTS crm_doc_obligations_company_idx ON crm_document_obligations(company_id, category, status);
CREATE INDEX IF NOT EXISTS crm_doc_obligations_responsible_idx ON crm_document_obligations(responsible_id, status);
CREATE INDEX IF NOT EXISTS crm_doc_obligations_due_idx ON crm_document_obligations(due_date, status) WHERE status IN ('pendente','em_analise');
CREATE INDEX IF NOT EXISTS crm_doc_obligations_category_idx ON crm_document_obligations(category, periodicity);

DROP TRIGGER IF EXISTS trg_crm_doc_obligations_updated_at ON crm_document_obligations;
CREATE TRIGGER trg_crm_doc_obligations_updated_at BEFORE UPDATE ON crm_document_obligations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_document_obligation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL REFERENCES crm_document_obligations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
  previous_status crm_doc_obligation_status,
  next_status crm_doc_obligation_status NOT NULL,
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 1 AND 1000),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
  changed_by TEXT NOT NULL CHECK (char_length(changed_by) BETWEEN 1 AND 80),
  changed_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_doc_oblig_hist_obligation_idx ON crm_document_obligation_history(obligation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_doc_oblig_hist_contract_idx ON crm_document_obligation_history(contract_id, created_at DESC);

-- Auditoria CON-06
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
  'crm_contract_exclusion_create',
  'crm_contract_schedule_create','crm_contract_schedule_update',
  'crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed',
  'crm_contract_amendment_create','crm_contract_amendment_update','crm_contract_amendment_approve','crm_contract_amendment_reject',
  'crm_contract_alert_rule_create','crm_contract_alert_rule_update','crm_contract_alert_create','crm_contract_alert_status',
  'crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit'
));

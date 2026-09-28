-- 039-con08-implantation-blocks: CON-08 bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_implantation_block_type') THEN
    CREATE TYPE crm_implantation_block_type AS ENUM ('documentacao','treinamento','equipamento','legal','operacional','financeiro','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_implantation_exception_status') THEN
    CREATE TYPE crm_implantation_exception_status AS ENUM ('solicitada','em_analise','autorizada','rejeitada','cancelada');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_implantation_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  implantation_id UUID NOT NULL REFERENCES crm_contract_implantations(id) ON DELETE CASCADE,
  step_id crm_implantation_step_id,
  block_type crm_implantation_block_type NOT NULL DEFAULT 'operacional',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  is_legal_requirement BOOLEAN NOT NULL DEFAULT false,
  is_blocking BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT CHECK (resolved_by IS NULL OR char_length(resolved_by) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS crm_implantation_blocks_contract_idx ON crm_implantation_blocks(contract_id, is_blocking, block_type);
CREATE INDEX IF NOT EXISTS crm_implantation_blocks_implantation_idx ON crm_implantation_blocks(implantation_id, is_blocking);

CREATE TABLE IF NOT EXISTS crm_implantation_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  implantation_id UUID NOT NULL REFERENCES crm_contract_implantations(id) ON DELETE CASCADE,
  block_id UUID REFERENCES crm_implantation_blocks(id) ON DELETE SET NULL,
  step_id crm_implantation_step_id,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  motivation TEXT NOT NULL CHECK (char_length(motivation) BETWEEN 20 AND 2000),
  legal_basis TEXT CHECK (legal_basis IS NULL OR char_length(legal_basis) BETWEEN 1 AND 1000),
  is_legal_exception BOOLEAN NOT NULL DEFAULT false,
  applicable_rule TEXT CHECK (applicable_rule IS NULL OR char_length(applicable_rule) BETWEEN 1 AND 500),
  status crm_implantation_exception_status NOT NULL DEFAULT 'solicitada',
  authorized_by TEXT CHECK (authorized_by IS NULL OR char_length(authorized_by) BETWEEN 1 AND 80),
  authorized_by_id UUID REFERENCES auth_identities(id),
  authorized_at TIMESTAMPTZ,
  authorization_notes TEXT CHECK (authorization_notes IS NULL OR char_length(authorization_notes) BETWEEN 1 AND 1000),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 1000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(motivation) >= 20),
  CHECK (is_legal_exception = false OR (legal_basis IS NOT NULL AND applicable_rule IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS crm_implantation_exceptions_contract_idx ON crm_implantation_exceptions(contract_id, status);
CREATE INDEX IF NOT EXISTS crm_implantation_exceptions_block_idx ON crm_implantation_exceptions(block_id, status);
CREATE INDEX IF NOT EXISTS crm_implantation_exceptions_legal_idx ON crm_implantation_exceptions(is_legal_exception, status) WHERE is_legal_exception = true;

DROP TRIGGER IF EXISTS trg_crm_implantation_exceptions_updated_at ON crm_implantation_exceptions;
CREATE TRIGGER trg_crm_implantation_exceptions_updated_at BEFORE UPDATE ON crm_implantation_exceptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria CON-08
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
  'crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit',
  'crm_implantation_create','crm_implantation_update','crm_implantation_step_create','crm_implantation_step_update',
  'crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject'
));

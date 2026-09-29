-- 048-plt10-lgpd-requests: PLT-10 pedidos acesso/correção/eliminação verificação identidade responsável prazo impedimentos legais documentados
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_lgpd_request_type') THEN
    CREATE TYPE crm_lgpd_request_type AS ENUM ('acesso','correcao','eliminacao','portabilidade','oposicao','revogacao_consentimento','informacao','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_lgpd_request_status') THEN
    CREATE TYPE crm_lgpd_request_status AS ENUM ('recebido','em_verificacao','em_analise','aguardando_titular','aprovado','atendido','rejeitado','cancelado','expirado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_lgpd_verification_method') THEN
    CREATE TYPE crm_lgpd_verification_method AS ENUM ('email','documento','presencial','video','outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lgpd_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type crm_lgpd_request_type NOT NULL,
  status crm_lgpd_request_status NOT NULL DEFAULT 'recebido',
  requester_name TEXT NOT NULL CHECK (char_length(requester_name) BETWEEN 1 AND 200),
  requester_email TEXT NOT NULL CHECK (char_length(requester_email) BETWEEN 5 AND 320),
  requester_document_hash TEXT CHECK (requester_document_hash IS NULL OR char_length(requester_document_hash) BETWEEN 1 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  verification_method crm_lgpd_verification_method,
  is_identity_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by TEXT CHECK (verified_by IS NULL OR char_length(verified_by) BETWEEN 1 AND 80),
  verified_by_id UUID REFERENCES auth_identities(id),
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 200),
  due_date DATE,
  legal_impediment TEXT CHECK (legal_impediment IS NULL OR char_length(legal_impediment) BETWEEN 1 AND 2000),
  impediment_documented BOOLEAN NOT NULL DEFAULT false,
  response TEXT CHECK (response IS NULL OR char_length(response) BETWEEN 1 AND 5000),
  response_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lgpd_requests_type_idx ON lgpd_requests(request_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS lgpd_requests_email_idx ON lgpd_requests(requester_email, created_at DESC);
CREATE INDEX IF NOT EXISTS lgpd_requests_status_idx ON lgpd_requests(status, due_date);
CREATE INDEX IF NOT EXISTS lgpd_requests_responsible_idx ON lgpd_requests(responsible_id, status);

DROP TRIGGER IF EXISTS trg_lgpd_requests_updated_at ON lgpd_requests;
CREATE TRIGGER trg_lgpd_requests_updated_at BEFORE UPDATE ON lgpd_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS lgpd_request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES lgpd_requests(id) ON DELETE CASCADE,
  previous_status crm_lgpd_request_status,
  next_status crm_lgpd_request_status NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 2000),
  changed_by TEXT NOT NULL CHECK (char_length(changed_by) BETWEEN 1 AND 80),
  changed_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lgpd_history_request_idx ON lgpd_request_history(request_id, created_at DESC);

-- Auditoria PLT-10
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
  'notification_preference_update','notification_template_create','notification_template_update','notification_template_approve','notification_template_reject',
  'observability_query','observability_alert_ack','observability_alert_resolve',
  'healthcheck_query','healthcheck_ready','healthcheck_live',
  'backup_create','backup_status','backup_restore_test','backup_restore','backup_retention_update','backup_delete',
  'privacy_inventory_create','privacy_inventory_update','privacy_policy_create','privacy_policy_update','privacy_policy_approve','privacy_policy_publish','privacy_policy_reject',
  'lgpd_request_create','lgpd_request_verify','lgpd_request_update','lgpd_request_respond','lgpd_request_reject',
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
  'crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject',
  'crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_create','crm_closure_step_update','crm_scope_revocation_create',
  'crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_service_measurement_create','crm_service_measurement_approve','crm_quality_evidence_create',
  'crm_management_diary_create','crm_management_diary_update','crm_management_diary_search',
  'crm_notification_preference_update','crm_notification_template_create','crm_notification_template_update','crm_notification_template_approve','crm_notification_template_reject'
));

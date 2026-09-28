-- 046-plt08-backup: PLT-08 backup banco e documentos criptografia acesso retenção restauração testada isolado
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_backup_type') THEN
    CREATE TYPE crm_backup_type AS ENUM ('database','documents','full','incremental');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_backup_status') THEN
    CREATE TYPE crm_backup_status AS ENUM ('pending','running','success','failed','expired','deleted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_restore_type') THEN
    CREATE TYPE crm_restore_type AS ENUM ('test','production','verification');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_restore_status') THEN
    CREATE TYPE crm_restore_status AS ENUM ('pending','running','success','failed','cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS backup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type crm_backup_type NOT NULL DEFAULT 'full',
  status crm_backup_status NOT NULL DEFAULT 'pending',
  storage_location TEXT CHECK (storage_location IS NULL OR char_length(storage_location) BETWEEN 1 AND 500),
  storage_provider TEXT CHECK (storage_provider IS NULL OR char_length(storage_provider) BETWEEN 1 AND 100),
  encryption_enabled BOOLEAN NOT NULL DEFAULT true,
  encryption_method TEXT NOT NULL DEFAULT 'AES-256-GCM' CHECK (char_length(encryption_method) BETWEEN 1 AND 50),
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum TEXT CHECK (checksum IS NULL OR char_length(checksum) BETWEEN 1 AND 200),
  retention_days INT NOT NULL DEFAULT 30 CHECK (retention_days >= 1 AND retention_days <= 3650),
  retention_until TIMESTAMPTZ,
  is_restore_tested BOOLEAN NOT NULL DEFAULT false,
  restore_tested_at TIMESTAMPTZ,
  restore_test_env TEXT CHECK (restore_test_env IS NULL OR char_length(restore_test_env) BETWEEN 1 AND 100),
  restore_test_result TEXT CHECK (restore_test_result IS NULL OR char_length(restore_test_result) BETWEEN 1 AND 1000),
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 1 AND 1000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS backup_jobs_type_idx ON backup_jobs(backup_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS backup_jobs_status_idx ON backup_jobs(status, retention_until);
CREATE INDEX IF NOT EXISTS backup_jobs_retention_idx ON backup_jobs(retention_until) WHERE status = 'success';

DROP TRIGGER IF EXISTS trg_backup_jobs_updated_at ON backup_jobs;
CREATE TRIGGER trg_backup_jobs_updated_at BEFORE UPDATE ON backup_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS backup_restores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_job_id UUID NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
  restore_type crm_restore_type NOT NULL DEFAULT 'test',
  status crm_restore_status NOT NULL DEFAULT 'pending',
  target_env TEXT NOT NULL CHECK (char_length(target_env) BETWEEN 1 AND 100),
  is_isolated BOOLEAN NOT NULL DEFAULT true,
  requested_by TEXT NOT NULL CHECK (char_length(requested_by) BETWEEN 1 AND 80),
  requested_by_id UUID REFERENCES auth_identities(id),
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 1 AND 1000),
  verification_notes TEXT CHECK (verification_notes IS NULL OR char_length(verification_notes) BETWEEN 1 AND 2000),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS backup_restores_job_idx ON backup_restores(backup_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS backup_restores_status_idx ON backup_restores(status, is_isolated, created_at DESC);

DROP TRIGGER IF EXISTS trg_backup_restores_updated_at ON backup_restores;
CREATE TRIGGER trg_backup_restores_updated_at BEFORE UPDATE ON backup_restores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS backup_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 100),
  retention_days INT NOT NULL CHECK (retention_days >= 1 AND retention_days <= 3650),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category)
);

CREATE INDEX IF NOT EXISTS backup_retention_active_idx ON backup_retention_policies(is_active, category);

DROP TRIGGER IF EXISTS trg_backup_retention_updated_at ON backup_retention_policies;
CREATE TRIGGER trg_backup_retention_updated_at BEFORE UPDATE ON backup_retention_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO backup_retention_policies (category, retention_days, description, created_by) VALUES
  ('database', 90, 'Backup completo do banco com retenção 90 dias, criptografado AES-256-GCM, restauração testada isolado', 'system'),
  ('documents', 365, 'Backup documentos com retenção 365 dias, criptografado, acesso restrito admin/ti', 'system'),
  ('full', 90, 'Backup full banco+documentos 90 dias, restauração testada em ambiente isolado', 'system'),
  ('audit_logs', 365, 'Logs auditoria 12 meses conforme SEC-14', 'system')
ON CONFLICT (category) DO NOTHING;

-- Auditoria PLT-08
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

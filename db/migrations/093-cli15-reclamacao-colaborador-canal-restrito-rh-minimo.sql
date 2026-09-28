-- CLI-15 reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com RH

DO $$ BEGIN CREATE TYPE cli_complaint_status AS ENUM ('pendente','em_analise','em_apuracao','resolvida','arquivada','cancelada','escalonada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_complaint_severity AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_complaint_category AS ENUM ('atendimento','comportamento','seguranca','assédio','discriminacao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_complaint_sender AS ENUM ('cliente','rh','compliance','gestao','sistema'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cli_employee_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^CLI-COMP-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  employee_reference TEXT CHECK (employee_reference IS NULL OR char_length(employee_reference) BETWEEN 3 AND 200),
  employee_reference_hash CHAR(64) CHECK (employee_reference_hash IS NULL OR char_length(employee_reference_hash)=64),
  category cli_complaint_category NOT NULL DEFAULT 'outro',
  severity cli_complaint_severity NOT NULL DEFAULT 'media',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 5000),
  status cli_complaint_status NOT NULL DEFAULT 'pendente',
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  is_shared_with_hr BOOLEAN NOT NULL DEFAULT false,
  shared_with_hr_at TIMESTAMPTZ,
  shared_with_hr_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  shared_with_hr_by_name TEXT CHECK (shared_with_hr_by_name IS NULL OR char_length(shared_with_hr_by_name) BETWEEN 2 AND 200),
  shared_reason TEXT CHECK (shared_reason IS NULL OR char_length(shared_reason) BETWEEN 10 AND 1000),
  minimal_share BOOLEAN NOT NULL DEFAULT true,
  responsible_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  due_date DATE,
  resolved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_by_name TEXT CHECK (created_by_name IS NULL OR char_length(created_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (is_restricted = true),
  CHECK (minimal_share = true)
);
CREATE INDEX IF NOT EXISTS cli_employee_complaints_protocol_idx ON cli_employee_complaints(protocol);
CREATE INDEX IF NOT EXISTS cli_employee_complaints_client_idx ON cli_employee_complaints(client_account_id);
CREATE INDEX IF NOT EXISTS cli_employee_complaints_status_idx ON cli_employee_complaints(status);
CREATE INDEX IF NOT EXISTS cli_employee_complaints_restricted_idx ON cli_employee_complaints(is_restricted) WHERE is_restricted = true;
CREATE INDEX IF NOT EXISTS cli_employee_complaints_hr_share_idx ON cli_employee_complaints(is_shared_with_hr) WHERE is_shared_with_hr = true;

CREATE TABLE IF NOT EXISTS cli_employee_complaint_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES cli_employee_complaints(id) ON DELETE CASCADE,
  sender_type cli_complaint_sender NOT NULL DEFAULT 'cliente',
  sender_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL CHECK (char_length(sender_name) BETWEEN 2 AND 200),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  is_hr_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (is_restricted = true)
);
CREATE INDEX IF NOT EXISTS cli_employee_complaint_messages_complaint_idx ON cli_employee_complaint_messages(complaint_id);
CREATE INDEX IF NOT EXISTS cli_employee_complaint_messages_hr_visible_idx ON cli_employee_complaint_messages(is_hr_visible) WHERE is_hr_visible = true;

CREATE TABLE IF NOT EXISTS cli_employee_complaint_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES cli_employee_complaints(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  is_hr_visible BOOLEAN NOT NULL DEFAULT false,
  uploaded_by_identity UUID REFERENCES auth_identities(id),
  uploaded_by_name TEXT CHECK (uploaded_by_name IS NULL OR char_length(uploaded_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (is_restricted = true)
);
CREATE INDEX IF NOT EXISTS cli_employee_complaint_evidences_complaint_idx ON cli_employee_complaint_evidences(complaint_id);
CREATE INDEX IF NOT EXISTS cli_employee_complaint_evidences_storage_idx ON cli_employee_complaint_evidences(storage_key);

CREATE TABLE IF NOT EXISTS cli_employee_complaint_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES cli_employee_complaints(id) ON DELETE CASCADE,
  previous_status cli_complaint_status,
  next_status cli_complaint_status NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  is_hr_share BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_employee_complaint_history_complaint_idx ON cli_employee_complaint_history(complaint_id);
CREATE INDEX IF NOT EXISTS cli_employee_complaint_history_created_idx ON cli_employee_complaint_history(created_at DESC);

CREATE TABLE IF NOT EXISTS cli_employee_complaint_hr_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES cli_employee_complaints(id) ON DELETE CASCADE,
  shared_field TEXT NOT NULL CHECK (char_length(shared_field) BETWEEN 3 AND 100),
  shared_value TEXT NOT NULL CHECK (char_length(shared_value) BETWEEN 1 AND 1000),
  shared_by_identity UUID REFERENCES auth_identities(id),
  shared_by_name TEXT CHECK (shared_by_name IS NULL OR char_length(shared_by_name) BETWEEN 2 AND 200),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_employee_complaint_hr_shares_complaint_idx ON cli_employee_complaint_hr_shares(complaint_id);

-- Triggers
CREATE OR REPLACE FUNCTION cli_complaint_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS cli_employee_complaints_touch ON cli_employee_complaints; CREATE TRIGGER cli_employee_complaints_touch BEFORE UPDATE ON cli_employee_complaints FOR EACH ROW EXECUTE FUNCTION cli_complaint_touch_updated_at();

CREATE OR REPLACE FUNCTION prevent_cli_complaint_history_update() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'cli_employee_complaint_history is immutable'; RETURN NULL; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_complaint_history_immutable ON cli_employee_complaint_history; CREATE TRIGGER trg_cli_complaint_history_immutable BEFORE UPDATE OR DELETE ON cli_employee_complaint_history FOR EACH ROW EXECUTE FUNCTION prevent_cli_complaint_history_update();
DROP TRIGGER IF EXISTS trg_cli_complaint_hr_shares_immutable ON cli_employee_complaint_hr_shares; CREATE TRIGGER trg_cli_complaint_hr_shares_immutable BEFORE UPDATE OR DELETE ON cli_employee_complaint_hr_shares FOR EACH ROW EXECUTE FUNCTION prevent_cli_complaint_history_update();

-- Auditoria
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept','login','logout','session_revoke_all','email_confirm','email_confirm_resend','password_reset_request','password_reset_complete','account_create','account_status','grant_issue','grant_revoke','contract_create','contract_status','contract_list','document_upload','document_download','document_list','ticket_open','ticket_status','ticket_list','mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify','email_change_request','email_change_confirm','email_change_cancel','email_change_alert','grant_contract_restrict','grant_unit_restrict','staff_invite','staff_login','staff_role_change','staff_session_revoke','permission_grant','permission_revoke','access_review','assignment_create','assignment_end','assignment_suspend','scale_create','scale_update','time_entry_start','time_entry_end','time_entry_ronda','handover_create','handover_accept','audit_query','audit_export','invite_rate_limited','notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry','integration_check','integration_test','integration_update','catalog_create','catalog_update','catalog_publish','lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel','crm_company_create','crm_company_update','crm_contact_create','crm_contact_update','crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change','crm_import_create','crm_import_commit','crm_import_export','crm_equipment_create','crm_equipment_update','crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer','crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_status','crm_labor_budget_item_create','crm_labor_budget_item_update','crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_status','crm_technical_budget_item_create','crm_technical_budget_item_update','crm_cost_param_create','crm_cost_param_update','crm_cost_param_status','crm_price_scenario_create','crm_price_scenario_update','crm_price_scenario_status','crm_discount_policy_create','crm_discount_policy_update','crm_discount_policy_status','crm_discount_request_create','crm_discount_request_status','crm_proposal_create','crm_proposal_update','crm_proposal_status','crm_proposal_item_create','crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status','crm_acceptance_link_create','crm_acceptance_link_used','crm_contract_create','crm_contract_idempotent_hit','crm_contract_update','crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed','crm_contract_unit_add','crm_contract_unit_remove','crm_contract_responsible_add','crm_contract_responsible_remove','crm_contract_document_upload','crm_contract_post_create','crm_contract_post_delete','crm_contract_sla_create','crm_contract_sla_delete','crm_contract_obligation_create','crm_contract_obligation_delete','crm_contract_exclusion_create','crm_contract_exclusion_delete','crm_contract_schedule_create','crm_contract_schedule_update','crm_amendment_create','crm_amendment_update','crm_amendment_approve','crm_amendment_reject','crm_alert_rule_create','crm_alert_rule_update','crm_alert_create','crm_alert_status','crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit','crm_implantation_create','crm_implantation_update','crm_implantation_step_create','crm_implantation_step_update','crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject','crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_update','crm_scope_revocation_create','crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_measurement_create','crm_measurement_approve','crm_quality_evidence_create','crm_diary_create','crm_diary_update','crm_diary_search','crm_notification_preference_update','crm_notification_template_create','crm_notification_template_update','crm_notification_template_approve','crm_notification_template_reject','crm_observability_query','crm_observability_alert_ack','crm_observability_alert_resolve','crm_healthcheck_query','crm_healthcheck_ready','crm_healthcheck_live','crm_backup_create','crm_backup_status','crm_backup_restore_test','crm_backup_restore','crm_backup_retention_update','crm_backup_delete','crm_privacy_inventory_create','crm_privacy_inventory_update','crm_privacy_policy_create','crm_privacy_policy_update','crm_privacy_policy_approve','crm_privacy_policy_publish','crm_privacy_policy_reject','crm_lgpd_request_create','crm_lgpd_request_verify','crm_lgpd_request_update','crm_lgpd_request_respond','crm_lgpd_request_reject','crm_retention_policy_create','crm_retention_policy_update','crm_retention_exception_create','crm_retention_exception_approve','crm_retention_exception_reject','crm_retention_exception_revoke','crm_retention_job_create','crm_retention_job_execute','crm_retention_log_create','crm_incident_create','crm_incident_update','crm_incident_contain','crm_incident_evidence_add','crm_incident_action_create','crm_incident_action_complete','crm_incident_communicate','crm_incident_close','crm_config_flag_create','crm_config_flag_update','crm_config_flag_rollback','crm_maintenance_create','crm_maintenance_update','crm_rollout_create','crm_rollout_approve','crm_rollout_execute','crm_rollout_rollback','crm_dependency_audit_create','crm_dependency_audit_review','crm_dependency_update_approve','crm_dependency_update_apply','crm_integration_job_create','crm_integration_job_execute','crm_webhook_create','crm_webhook_update','crm_webhook_deliver','crm_reconciliation_create','crm_budget_create','crm_budget_update','crm_usage_metric_create','crm_usage_alert_ack','crm_env_create','crm_env_verify','crm_env_check','crm_maintenance_doc_create','crm_maintenance_doc_publish','cms_content_create','cms_content_update','cms_content_publish','cms_content_revert','cms_content_approve','cms_content_reject','cms_content_archive','theme_create','theme_update','theme_publish','theme_rollback','theme_preview_create','theme_preference_update','seo_config_create','seo_config_update','seo_redirect_create','seo_redirect_update','seo_sitemap_update','domain_verification_create','domain_verification_verify','package_rule_create','package_rule_approve','package_create','package_update','package_publish','package_comparison_create','origin_metric_create','origin_metric_update','conversion_event_create','ab_test_create','ab_test_update','ab_test_approve','ab_test_start','ab_test_conclude','cli_complaint_create','cli_complaint_update','cli_complaint_status','cli_complaint_hr_share','cli_complaint_message_create','cli_complaint_evidence_create'
));

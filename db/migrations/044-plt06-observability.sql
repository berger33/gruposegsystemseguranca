-- 044-plt06-observability: PLT-06 observabilidade HTTP/jobs/DB correlação request/event ID métricas alertas sem segredos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_observability_alert_severity') THEN
    CREATE TYPE crm_observability_alert_severity AS ENUM ('info','warning','critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_observability_alert_status') THEN
    CREATE TYPE crm_observability_alert_status AS ENUM ('firing','acknowledged','resolved','suppressed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_observability_job_status') THEN
    CREATE TYPE crm_observability_job_status AS ENUM ('started','success','failed','retry','dead');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS observability_http_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL CHECK (char_length(request_id) BETWEEN 8 AND 100),
  correlation_id TEXT CHECK (correlation_id IS NULL OR char_length(correlation_id) BETWEEN 8 AND 100),
  method TEXT NOT NULL CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD')),
  path TEXT NOT NULL CHECK (char_length(path) BETWEEN 1 AND 500),
  status_code INT CHECK (status_code IS NULL OR (status_code >= 100 AND status_code <= 599)),
  duration_ms INT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  user_kind TEXT CHECK (user_kind IS NULL OR char_length(user_kind) BETWEEN 1 AND 50),
  user_id TEXT CHECK (user_id IS NULL OR char_length(user_id) BETWEEN 1 AND 100),
  ip_hash TEXT CHECK (ip_hash IS NULL OR char_length(ip_hash) BETWEEN 1 AND 200),
  user_agent_hash TEXT CHECK (user_agent_hash IS NULL OR char_length(user_agent_hash) BETWEEN 1 AND 200),
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS obs_http_req_id_idx ON observability_http_requests(request_id);
CREATE INDEX IF NOT EXISTS obs_http_path_idx ON observability_http_requests(path, status_code, created_at DESC);
CREATE INDEX IF NOT EXISTS obs_http_created_idx ON observability_http_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS obs_http_status_idx ON observability_http_requests(status_code, created_at DESC);

CREATE TABLE IF NOT EXISTS observability_job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL CHECK (char_length(job_name) BETWEEN 1 AND 100),
  correlation_id TEXT CHECK (correlation_id IS NULL OR char_length(correlation_id) BETWEEN 8 AND 100),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 8 AND 100),
  status crm_observability_job_status NOT NULL,
  duration_ms INT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  attempts INT CHECK (attempts IS NULL OR attempts >= 0),
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 1 AND 1000),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS obs_job_name_idx ON observability_job_executions(job_name, status, created_at DESC);
CREATE INDEX IF NOT EXISTS obs_job_corr_idx ON observability_job_executions(correlation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS observability_db_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_type TEXT NOT NULL CHECK (query_type IN ('SELECT','INSERT','UPDATE','DELETE','OTHER')),
  table_name TEXT CHECK (table_name IS NULL OR char_length(table_name) BETWEEN 1 AND 100),
  duration_ms INT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  success BOOLEAN NOT NULL DEFAULT true,
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 1 AND 1000),
  correlation_id TEXT CHECK (correlation_id IS NULL OR char_length(correlation_id) BETWEEN 8 AND 100),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 8 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS obs_db_table_idx ON observability_db_metrics(table_name, success, created_at DESC);
CREATE INDEX IF NOT EXISTS obs_db_corr_idx ON observability_db_metrics(correlation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS observability_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL CHECK (char_length(metric_name) BETWEEN 1 AND 100),
  metric_value NUMERIC(14,4) NOT NULL,
  labels JSONB,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS obs_metrics_name_idx ON observability_metrics(metric_name, collected_at DESC);

CREATE TABLE IF NOT EXISTS observability_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key TEXT NOT NULL CHECK (char_length(alert_key) BETWEEN 1 AND 200),
  metric_name TEXT NOT NULL CHECK (char_length(metric_name) BETWEEN 1 AND 100),
  severity crm_observability_alert_severity NOT NULL DEFAULT 'warning',
  status crm_observability_alert_status NOT NULL DEFAULT 'firing',
  threshold_value NUMERIC(14,4),
  current_value NUMERIC(14,4),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  correlation_id TEXT CHECK (correlation_id IS NULL OR char_length(correlation_id) BETWEEN 8 AND 100),
  acknowledged_by TEXT CHECK (acknowledged_by IS NULL OR char_length(acknowledged_by) BETWEEN 1 AND 80),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS obs_alerts_key_idx ON observability_alerts(alert_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS obs_alerts_status_idx ON observability_alerts(status, severity, created_at DESC);

DROP TRIGGER IF EXISTS trg_obs_alerts_updated_at ON observability_alerts;
CREATE TRIGGER trg_obs_alerts_updated_at BEFORE UPDATE ON observability_alerts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria PLT-06
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

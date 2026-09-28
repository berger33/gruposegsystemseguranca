-- PUB-06 CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão

DO $$ BEGIN CREATE TYPE cms_content_type AS ENUM ('pagina','faq','case','blog','vaga','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cms_content_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cms_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL CHECK (char_length(slug) BETWEEN 3 AND 200),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  excerpt TEXT CHECK (excerpt IS NULL OR char_length(excerpt) BETWEEN 10 AND 1000),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 50 AND 20000),
  content_type cms_content_type NOT NULL DEFAULT 'pagina',
  status cms_content_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  published_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  published_by_name TEXT CHECK (published_by_name IS NULL OR char_length(published_by_name) BETWEEN 2 AND 200),
  author_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  author_name TEXT CHECK (author_name IS NULL OR char_length(author_name) BETWEEN 2 AND 200),
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  seo_title TEXT CHECK (seo_title IS NULL OR char_length(seo_title) BETWEEN 5 AND 200),
  seo_description TEXT CHECK (seo_description IS NULL OR char_length(seo_description) BETWEEN 10 AND 500),
  is_authorized BOOLEAN NOT NULL DEFAULT false,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(slug, version)
);
CREATE INDEX IF NOT EXISTS cms_contents_slug_idx ON cms_contents(slug);
CREATE INDEX IF NOT EXISTS cms_contents_type_idx ON cms_contents(content_type);
CREATE INDEX IF NOT EXISTS cms_contents_status_idx ON cms_contents(status);
CREATE INDEX IF NOT EXISTS cms_contents_published_idx ON cms_contents(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS cms_contents_author_idx ON cms_contents(author_id);
CREATE UNIQUE INDEX IF NOT EXISTS cms_contents_published_slug_unique ON cms_contents(slug, content_type) WHERE is_published = true;
CREATE UNIQUE INDEX IF NOT EXISTS cms_contents_storage_key_unique ON cms_contents(storage_key) WHERE storage_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS cms_content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES cms_contents(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >=1),
  snapshot JSONB NOT NULL,
  change_summary TEXT NOT NULL CHECK (char_length(change_summary) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_by_name TEXT CHECK (created_by_name IS NULL OR char_length(created_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(content_id, version)
);
CREATE INDEX IF NOT EXISTS cms_content_versions_content_idx ON cms_content_versions(content_id);

CREATE TABLE IF NOT EXISTS cms_content_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES cms_contents(id) ON DELETE CASCADE,
  previous_version INT,
  next_version INT NOT NULL,
  previous_status cms_content_status,
  next_status cms_content_status NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cms_content_history_content_idx ON cms_content_history(content_id);
CREATE INDEX IF NOT EXISTS cms_content_history_created_idx ON cms_content_history(created_at DESC);

-- Triggers
CREATE OR REPLACE FUNCTION cms_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS cms_contents_touch ON cms_contents; CREATE TRIGGER cms_contents_touch BEFORE UPDATE ON cms_contents FOR EACH ROW EXECUTE FUNCTION cms_touch_updated_at();

CREATE OR REPLACE FUNCTION prevent_cms_history_update() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'cms_content_history is immutable'; RETURN NULL; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cms_content_history_immutable ON cms_content_history; CREATE TRIGGER trg_cms_content_history_immutable BEFORE UPDATE OR DELETE ON cms_content_history FOR EACH ROW EXECUTE FUNCTION prevent_cms_history_update();
DROP TRIGGER IF EXISTS trg_cms_content_versions_immutable ON cms_content_versions; CREATE TRIGGER trg_cms_content_versions_immutable BEFORE UPDATE OR DELETE ON cms_content_versions FOR EACH ROW EXECUTE FUNCTION prevent_cms_history_update();

-- Auditoria
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
  'crm_company_create','crm_company_update','crm_contact_create','crm_contact_update','crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change',
  'crm_import_create','crm_import_commit','crm_import_export','crm_equipment_create','crm_equipment_update',
  'crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer',
  'crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_status','crm_labor_budget_item_create','crm_labor_budget_item_update',
  'crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_status','crm_technical_budget_item_create','crm_technical_budget_item_update',
  'crm_cost_param_create','crm_cost_param_update','crm_cost_param_status',
  'crm_price_scenario_create','crm_price_scenario_update','crm_price_scenario_status',
  'crm_discount_policy_create','crm_discount_policy_update','crm_discount_policy_status','crm_discount_request_create','crm_discount_request_status',
  'crm_proposal_create','crm_proposal_update','crm_proposal_status','crm_proposal_item_create',
  'crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status',
  'crm_acceptance_link_create','crm_acceptance_link_used',
  'crm_contract_create','crm_contract_idempotent_hit','crm_contract_update','crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed',
  'crm_contract_unit_add','crm_contract_unit_remove','crm_contract_responsible_add','crm_contract_responsible_remove','crm_contract_document_upload',
  'crm_contract_post_create','crm_contract_post_delete','crm_contract_sla_create','crm_contract_sla_delete','crm_contract_obligation_create','crm_contract_obligation_delete','crm_contract_exclusion_create','crm_contract_exclusion_delete','crm_contract_schedule_create','crm_contract_schedule_update',
  'crm_amendment_create','crm_amendment_update','crm_amendment_approve','crm_amendment_reject',
  'crm_alert_rule_create','crm_alert_rule_update','crm_alert_create','crm_alert_status',
  'crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit',
  'crm_implantation_create','crm_implantation_update','crm_implantation_step_create','crm_implantation_step_update','crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject',
  'crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_update','crm_scope_revocation_create',
  'crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_measurement_create','crm_measurement_approve','crm_quality_evidence_create',
  'crm_diary_create','crm_diary_update','crm_diary_search',
  'crm_notification_preference_update','crm_notification_template_create','crm_notification_template_update','crm_notification_template_approve','crm_notification_template_reject',
  'crm_observability_query','crm_observability_alert_ack','crm_observability_alert_resolve',
  'crm_healthcheck_query','crm_healthcheck_ready','crm_healthcheck_live',
  'crm_backup_create','crm_backup_status','crm_backup_restore_test','crm_backup_restore','crm_backup_retention_update','crm_backup_delete',
  'crm_privacy_inventory_create','crm_privacy_inventory_update','crm_privacy_policy_create','crm_privacy_policy_update','crm_privacy_policy_approve','crm_privacy_policy_publish','crm_privacy_policy_reject',
  'crm_lgpd_request_create','crm_lgpd_request_verify','crm_lgpd_request_update','crm_lgpd_request_respond','crm_lgpd_request_reject',
  'crm_retention_policy_create','crm_retention_policy_update','crm_retention_exception_create','crm_retention_exception_approve','crm_retention_exception_reject','crm_retention_exception_revoke','crm_retention_job_create','crm_retention_job_execute','crm_retention_log_create',
  'crm_incident_create','crm_incident_update','crm_incident_contain','crm_incident_evidence_add','crm_incident_action_create','crm_incident_action_complete','crm_incident_communicate','crm_incident_close',
  'crm_config_flag_create','crm_config_flag_update','crm_config_flag_rollback','crm_maintenance_create','crm_maintenance_update','crm_rollout_create','crm_rollout_approve','crm_rollout_execute','crm_rollout_rollback',
  'crm_dependency_audit_create','crm_dependency_audit_review','crm_dependency_update_approve','crm_dependency_update_apply',
  'crm_integration_job_create','crm_integration_job_execute','crm_webhook_create','crm_webhook_update','crm_webhook_deliver','crm_reconciliation_create',
  'crm_budget_create','crm_budget_update','crm_usage_metric_create','crm_usage_alert_ack',
  'crm_env_create','crm_env_verify','crm_env_check',
  'crm_maintenance_doc_create','crm_maintenance_doc_publish',
  'cms_content_create','cms_content_update','cms_content_publish','cms_content_revert','cms_content_approve','cms_content_reject','cms_content_archive'
));

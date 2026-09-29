-- PUB-07 temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global

DO $$ BEGIN CREATE TYPE theme_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado','revertido'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE theme_mode AS ENUM ('claro','escuro','sistema'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pub_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_key TEXT NOT NULL CHECK (char_length(theme_key) BETWEEN 3 AND 100),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  status theme_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  preview_url TEXT CHECK (preview_url IS NULL OR char_length(preview_url) BETWEEN 5 AND 1000),
  published_at TIMESTAMPTZ,
  approved_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_by_name TEXT CHECK (approved_by_name IS NULL OR char_length(approved_by_name) BETWEEN 2 AND 200),
  approved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_by_name TEXT CHECK (created_by_name IS NULL OR char_length(created_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(theme_key, version)
);
CREATE INDEX IF NOT EXISTS pub_themes_key_idx ON pub_themes(theme_key);
CREATE INDEX IF NOT EXISTS pub_themes_status_idx ON pub_themes(status);
CREATE INDEX IF NOT EXISTS pub_themes_published_idx ON pub_themes(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS pub_themes_active_idx ON pub_themes(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS pub_themes_active_unique ON pub_themes(theme_key) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS pub_theme_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES pub_themes(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >=1),
  snapshot JSONB NOT NULL,
  change_summary TEXT NOT NULL CHECK (char_length(change_summary) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_by_name TEXT CHECK (created_by_name IS NULL OR char_length(created_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(theme_id, version)
);
CREATE INDEX IF NOT EXISTS pub_theme_versions_theme_idx ON pub_theme_versions(theme_id);

CREATE TABLE IF NOT EXISTS pub_theme_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES pub_themes(id) ON DELETE CASCADE,
  previous_version INT,
  next_version INT NOT NULL,
  previous_status theme_status,
  next_status theme_status NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_theme_history_theme_idx ON pub_theme_history(theme_id);

CREATE TABLE IF NOT EXISTS pub_theme_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES pub_themes(id) ON DELETE CASCADE,
  preview_token TEXT NOT NULL UNIQUE CHECK (char_length(preview_token) BETWEEN 10 AND 200),
  preview_url TEXT NOT NULL CHECK (char_length(preview_url) BETWEEN 5 AND 1000),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_theme_previews_theme_idx ON pub_theme_previews(theme_id);
CREATE INDEX IF NOT EXISTS pub_theme_previews_token_idx ON pub_theme_previews(preview_token);
CREATE INDEX IF NOT EXISTS pub_theme_previews_expires_idx ON pub_theme_previews(expires_at);

CREATE TABLE IF NOT EXISTS pub_theme_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  theme_mode theme_mode NOT NULL DEFAULT 'sistema',
  theme_key TEXT CHECK (theme_key IS NULL OR char_length(theme_key) BETWEEN 3 AND 100),
  is_global BOOLEAN NOT NULL DEFAULT false,
  is_separate_from_global BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_identity)
);
CREATE INDEX IF NOT EXISTS pub_theme_preferences_user_idx ON pub_theme_preferences(user_identity);

-- Triggers
CREATE OR REPLACE FUNCTION pub_theme_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS pub_themes_touch ON pub_themes; CREATE TRIGGER pub_themes_touch BEFORE UPDATE ON pub_themes FOR EACH ROW EXECUTE FUNCTION pub_theme_touch_updated_at();
DROP TRIGGER IF EXISTS pub_theme_preferences_touch ON pub_theme_preferences; CREATE TRIGGER pub_theme_preferences_touch BEFORE UPDATE ON pub_theme_preferences FOR EACH ROW EXECUTE FUNCTION pub_theme_touch_updated_at();

CREATE OR REPLACE FUNCTION prevent_pub_theme_history_update() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'pub_theme_history is immutable'; RETURN NULL; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pub_theme_history_immutable ON pub_theme_history; CREATE TRIGGER trg_pub_theme_history_immutable BEFORE UPDATE OR DELETE ON pub_theme_history FOR EACH ROW EXECUTE FUNCTION prevent_pub_theme_history_update();
DROP TRIGGER IF EXISTS trg_pub_theme_versions_immutable ON pub_theme_versions; CREATE TRIGGER trg_pub_theme_versions_immutable BEFORE UPDATE OR DELETE ON pub_theme_versions FOR EACH ROW EXECUTE FUNCTION prevent_pub_theme_history_update();

-- Seed tema padrão layout 06
INSERT INTO pub_themes (theme_key, name, description, config, tokens, layout, status, version, is_published, is_active)
VALUES ('layout-06', 'Layout 06 Padrão', 'Tema padrão preservado conforme plano mestre, identidade visual existente e 10 prévias mantidas', '{"primary":"#0f172a","secondary":"#334155","mode":"sistema"}'::jsonb, '{"brand":"default"}'::jsonb, '{"sections":"default"}'::jsonb, 'publicado', 1, true, true)
ON CONFLICT (theme_key, version) DO NOTHING;

-- Auditoria expandida
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept','login','logout','session_revoke_all','email_confirm','email_confirm_resend','password_reset_request','password_reset_complete','account_create','account_status','grant_issue','grant_revoke','contract_create','contract_status','contract_list','document_upload','document_download','document_list','ticket_open','ticket_status','ticket_list','mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify','email_change_request','email_change_confirm','email_change_cancel','email_change_alert','grant_contract_restrict','grant_unit_restrict','staff_invite','staff_login','staff_role_change','staff_session_revoke','permission_grant','permission_revoke','access_review','assignment_create','assignment_end','assignment_suspend','scale_create','scale_update','time_entry_start','time_entry_end','time_entry_ronda','handover_create','handover_accept','audit_query','audit_export','invite_rate_limited','notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry','integration_check','integration_test','integration_update','catalog_create','catalog_update','catalog_publish','lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel','crm_company_create','crm_company_update','crm_contact_create','crm_contact_update','crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change','crm_import_create','crm_import_commit','crm_import_export','crm_equipment_create','crm_equipment_update','crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer','crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_status','crm_labor_budget_item_create','crm_labor_budget_item_update','crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_status','crm_technical_budget_item_create','crm_technical_budget_item_update','crm_cost_param_create','crm_cost_param_update','crm_cost_param_status','crm_price_scenario_create','crm_price_scenario_update','crm_price_scenario_status','crm_discount_policy_create','crm_discount_policy_update','crm_discount_policy_status','crm_discount_request_create','crm_discount_request_status','crm_proposal_create','crm_proposal_update','crm_proposal_status','crm_proposal_item_create','crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status','crm_acceptance_link_create','crm_acceptance_link_used','crm_contract_create','crm_contract_idempotent_hit','crm_contract_update','crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed','crm_contract_unit_add','crm_contract_unit_remove','crm_contract_responsible_add','crm_contract_responsible_remove','crm_contract_document_upload','crm_contract_post_create','crm_contract_post_delete','crm_contract_sla_create','crm_contract_sla_delete','crm_contract_obligation_create','crm_contract_obligation_delete','crm_contract_exclusion_create','crm_contract_exclusion_delete','crm_contract_schedule_create','crm_contract_schedule_update','crm_amendment_create','crm_amendment_update','crm_amendment_approve','crm_amendment_reject','crm_alert_rule_create','crm_alert_rule_update','crm_alert_create','crm_alert_status','crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit','crm_implantation_create','crm_implantation_update','crm_implantation_step_create','crm_implantation_step_update','crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject','crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_update','crm_scope_revocation_create','crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_measurement_create','crm_measurement_approve','crm_quality_evidence_create','crm_diary_create','crm_diary_update','crm_diary_search','crm_notification_preference_update','crm_notification_template_create','crm_notification_template_update','crm_notification_template_approve','crm_notification_template_reject','crm_observability_query','crm_observability_alert_ack','crm_observability_alert_resolve','crm_healthcheck_query','crm_healthcheck_ready','crm_healthcheck_live','crm_backup_create','crm_backup_status','crm_backup_restore_test','crm_backup_restore','crm_backup_retention_update','crm_backup_delete','crm_privacy_inventory_create','crm_privacy_inventory_update','crm_privacy_policy_create','crm_privacy_policy_update','crm_privacy_policy_approve','crm_privacy_policy_publish','crm_privacy_policy_reject','crm_lgpd_request_create','crm_lgpd_request_verify','crm_lgpd_request_update','crm_lgpd_request_respond','crm_lgpd_request_reject','crm_retention_policy_create','crm_retention_policy_update','crm_retention_exception_create','crm_retention_exception_approve','crm_retention_exception_reject','crm_retention_exception_revoke','crm_retention_job_create','crm_retention_job_execute','crm_retention_log_create','crm_incident_create','crm_incident_update','crm_incident_contain','crm_incident_evidence_add','crm_incident_action_create','crm_incident_action_complete','crm_incident_communicate','crm_incident_close','crm_config_flag_create','crm_config_flag_update','crm_config_flag_rollback','crm_maintenance_create','crm_maintenance_update','crm_rollout_create','crm_rollout_approve','crm_rollout_execute','crm_rollout_rollback','crm_dependency_audit_create','crm_dependency_audit_review','crm_dependency_update_approve','crm_dependency_update_apply','crm_integration_job_create','crm_integration_job_execute','crm_webhook_create','crm_webhook_update','crm_webhook_deliver','crm_reconciliation_create','crm_budget_create','crm_budget_update','crm_usage_metric_create','crm_usage_alert_ack','crm_env_create','crm_env_verify','crm_env_check','crm_maintenance_doc_create','crm_maintenance_doc_publish','cms_content_create','cms_content_update','cms_content_publish','cms_content_revert','cms_content_approve','cms_content_reject','cms_content_archive','theme_create','theme_update','theme_publish','theme_rollback','theme_preview_create','theme_preference_update'
));

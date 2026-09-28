-- PUB-09 montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produção

DO $$ BEGIN CREATE TYPE package_status AS ENUM ('rascunho','em_revisao','aprovado','rejeitado','arquivado','publicado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE package_rule_type AS ENUM ('inclusao_obrigatoria','exclusao','compatibilidade','preco_minimo','desconto_maximo','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pub_package_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL UNIQUE CHECK (char_length(rule_key) BETWEEN 3 AND 100),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  rule_type package_rule_type NOT NULL DEFAULT 'outro',
  rule_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_by_name TEXT CHECK (approved_by_name IS NULL OR char_length(approved_by_name) BETWEEN 2 AND 200),
  approved_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_package_rules_key_idx ON pub_package_rules(rule_key);
CREATE INDEX IF NOT EXISTS pub_package_rules_approved_idx ON pub_package_rules(is_approved) WHERE is_approved = true;

CREATE TABLE IF NOT EXISTS pub_service_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^PKG-PUB-[0-9]{8}-[A-Z0-9]{4}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  service_ids TEXT[] NOT NULL DEFAULT '{}',
  service_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  rules_applied JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_cost_cents BIGINT CHECK (total_cost_cents IS NULL OR total_cost_cents >=0),
  total_price_cents BIGINT CHECK (total_price_cents IS NULL OR total_price_cents >=0),
  margin_percent NUMERIC(5,2) CHECK (margin_percent IS NULL OR (margin_percent >= -100 AND margin_percent <= 100)),
  status package_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  is_price_from_approved_catalog BOOLEAN NOT NULL DEFAULT true,
  estimate_note TEXT NOT NULL DEFAULT 'pacote montado a partir de catálogo e regras aprovadas, sem promessa/preço de demonstração em produção' CHECK (char_length(estimate_note) BETWEEN 10 AND 500),
  approved_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_by_name TEXT CHECK (approved_by_name IS NULL OR char_length(approved_by_name) BETWEEN 2 AND 200),
  approved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_by_name TEXT CHECK (created_by_name IS NULL OR char_length(created_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (is_demo = false OR is_published = false),
  CHECK (is_price_from_approved_catalog = true)
);
CREATE INDEX IF NOT EXISTS pub_service_packages_protocol_idx ON pub_service_packages(protocol);
CREATE INDEX IF NOT EXISTS pub_service_packages_status_idx ON pub_service_packages(status);
CREATE INDEX IF NOT EXISTS pub_service_packages_published_idx ON pub_service_packages(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS pub_service_packages_demo_idx ON pub_service_packages(is_demo) WHERE is_demo = true;

CREATE TABLE IF NOT EXISTS pub_package_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  package_ids TEXT[] NOT NULL CHECK (array_length(package_ids,1) BETWEEN 2 AND 5),
  comparison_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 2000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_by_name TEXT CHECK (created_by_name IS NULL OR char_length(created_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_package_comparisons_created_idx ON pub_package_comparisons(created_at DESC);

CREATE TABLE IF NOT EXISTS pub_package_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES pub_service_packages(id) ON DELETE CASCADE,
  previous_version INT,
  next_version INT NOT NULL,
  previous_status package_status,
  next_status package_status NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_package_history_package_idx ON pub_package_history(package_id);

-- Triggers
CREATE OR REPLACE FUNCTION pub_package_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS pub_package_rules_touch ON pub_package_rules; CREATE TRIGGER pub_package_rules_touch BEFORE UPDATE ON pub_package_rules FOR EACH ROW EXECUTE FUNCTION pub_package_touch_updated_at();
DROP TRIGGER IF EXISTS pub_service_packages_touch ON pub_service_packages; CREATE TRIGGER pub_service_packages_touch BEFORE UPDATE ON pub_service_packages FOR EACH ROW EXECUTE FUNCTION pub_package_touch_updated_at();
DROP TRIGGER IF EXISTS pub_package_comparisons_touch ON pub_package_comparisons; CREATE TRIGGER pub_package_comparisons_touch BEFORE UPDATE ON pub_package_comparisons FOR EACH ROW EXECUTE FUNCTION pub_package_touch_updated_at();

CREATE OR REPLACE FUNCTION prevent_pub_package_history_update() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'pub_package_history is immutable'; RETURN NULL; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pub_package_history_immutable ON pub_package_history; CREATE TRIGGER trg_pub_package_history_immutable BEFORE UPDATE OR DELETE ON pub_package_history FOR EACH ROW EXECUTE FUNCTION prevent_pub_package_history_update();

-- Seed regras aprovadas a partir de catálogo validado
INSERT INTO pub_package_rules (rule_key, name, description, rule_type, rule_data, is_approved, version)
VALUES
  ('catalogo_apenas_validado', 'Apenas serviços validados', 'Pacote somente a partir de catálogo único dos seis serviços validados, flag isPublished true, isValidated true', 'inclusao_obrigatoria', '{"source":"service_catalog","filter":{"isPublished":true,"isValidated":true}}'::jsonb, true, 1),
  ('sem_preco_demo_producao', 'Sem preço demonstração em produção', 'Nenhuma promessa/preço de demonstração em produção, is_demo false quando is_published true', 'preco_minimo', '{"check":"is_demo false OR is_published false","note":"nenhuma promessa/preço de demonstração em produção"}'::jsonb, true, 1),
  ('compatibilidade_servicos', 'Compatibilidade serviços', 'Verificar compatibilidades de equipamentos quando pacote inclui CFTV e instalação', 'compatibilidade', '{"check":"service_catalog compatibilities"}'::jsonb, true, 1)
ON CONFLICT (rule_key) DO NOTHING;

-- Auditoria
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept','login','logout','session_revoke_all','email_confirm','email_confirm_resend','password_reset_request','password_reset_complete','account_create','account_status','grant_issue','grant_revoke','contract_create','contract_status','contract_list','document_upload','document_download','document_list','ticket_open','ticket_status','ticket_list','mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify','email_change_request','email_change_confirm','email_change_cancel','email_change_alert','grant_contract_restrict','grant_unit_restrict','staff_invite','staff_login','staff_role_change','staff_session_revoke','permission_grant','permission_revoke','access_review','assignment_create','assignment_end','assignment_suspend','scale_create','scale_update','time_entry_start','time_entry_end','time_entry_ronda','handover_create','handover_accept','audit_query','audit_export','invite_rate_limited','notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry','integration_check','integration_test','integration_update','catalog_create','catalog_update','catalog_publish','lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel','crm_company_create','crm_company_update','crm_contact_create','crm_contact_update','crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change','crm_import_create','crm_import_commit','crm_import_export','crm_equipment_create','crm_equipment_update','crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer','crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_status','crm_labor_budget_item_create','crm_labor_budget_item_update','crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_status','crm_technical_budget_item_create','crm_technical_budget_item_update','crm_cost_param_create','crm_cost_param_update','crm_cost_param_status','crm_price_scenario_create','crm_price_scenario_update','crm_price_scenario_status','crm_discount_policy_create','crm_discount_policy_update','crm_discount_policy_status','crm_discount_request_create','crm_discount_request_status','crm_proposal_create','crm_proposal_update','crm_proposal_status','crm_proposal_item_create','crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status','crm_acceptance_link_create','crm_acceptance_link_used','crm_contract_create','crm_contract_idempotent_hit','crm_contract_update','crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed','crm_contract_unit_add','crm_contract_unit_remove','crm_contract_responsible_add','crm_contract_responsible_remove','crm_contract_document_upload','crm_contract_post_create','crm_contract_post_delete','crm_contract_sla_create','crm_contract_sla_delete','crm_contract_obligation_create','crm_contract_obligation_delete','crm_contract_exclusion_create','crm_contract_exclusion_delete','crm_contract_schedule_create','crm_contract_schedule_update','crm_amendment_create','crm_amendment_update','crm_amendment_approve','crm_amendment_reject','crm_alert_rule_create','crm_alert_rule_update','crm_alert_create','crm_alert_status','crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit','crm_implantation_create','crm_implantation_update','crm_implantation_step_create','crm_implantation_step_update','crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject','crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_update','crm_scope_revocation_create','crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_measurement_create','crm_measurement_approve','crm_quality_evidence_create','crm_diary_create','crm_diary_update','crm_diary_search','crm_notification_preference_update','crm_notification_template_create','crm_notification_template_update','crm_notification_template_approve','crm_notification_template_reject','crm_observability_query','crm_observability_alert_ack','crm_observability_alert_resolve','crm_healthcheck_query','crm_healthcheck_ready','crm_healthcheck_live','crm_backup_create','crm_backup_status','crm_backup_restore_test','crm_backup_restore','crm_backup_retention_update','crm_backup_delete','crm_privacy_inventory_create','crm_privacy_inventory_update','crm_privacy_policy_create','crm_privacy_policy_update','crm_privacy_policy_approve','crm_privacy_policy_publish','crm_privacy_policy_reject','crm_lgpd_request_create','crm_lgpd_request_verify','crm_lgpd_request_update','crm_lgpd_request_respond','crm_lgpd_request_reject','crm_retention_policy_create','crm_retention_policy_update','crm_retention_exception_create','crm_retention_exception_approve','crm_retention_exception_reject','crm_retention_exception_revoke','crm_retention_job_create','crm_retention_job_execute','crm_retention_log_create','crm_incident_create','crm_incident_update','crm_incident_contain','crm_incident_evidence_add','crm_incident_action_create','crm_incident_action_complete','crm_incident_communicate','crm_incident_close','crm_config_flag_create','crm_config_flag_update','crm_config_flag_rollback','crm_maintenance_create','crm_maintenance_update','crm_rollout_create','crm_rollout_approve','crm_rollout_execute','crm_rollout_rollback','crm_dependency_audit_create','crm_dependency_audit_review','crm_dependency_update_approve','crm_dependency_update_apply','crm_integration_job_create','crm_integration_job_execute','crm_webhook_create','crm_webhook_update','crm_webhook_deliver','crm_reconciliation_create','crm_budget_create','crm_budget_update','crm_usage_metric_create','crm_usage_alert_ack','crm_env_create','crm_env_verify','crm_env_check','crm_maintenance_doc_create','crm_maintenance_doc_publish','cms_content_create','cms_content_update','cms_content_publish','cms_content_revert','cms_content_approve','cms_content_reject','cms_content_archive','theme_create','theme_update','theme_publish','theme_rollback','theme_preview_create','theme_preference_update','seo_config_create','seo_config_update','seo_redirect_create','seo_redirect_update','seo_sitemap_update','domain_verification_create','domain_verification_verify','package_rule_create','package_rule_approve','package_create','package_update','package_publish','package_comparison_create'
));

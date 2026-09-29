-- PUB-10 mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos

DO $$ BEGIN CREATE TYPE ab_test_status AS ENUM ('rascunho','em_revisao','aprovado','em_execucao','concluido','cancelado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE conversion_event_type AS ENUM ('lead_received','lead_converted','opportunity_created','proposal_sent','contract_created','visit_confirmed','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pub_origin_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin TEXT NOT NULL CHECK (char_length(origin) BETWEEN 3 AND 100),
  campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) BETWEEN 3 AND 100),
  channel TEXT CHECK (channel IS NULL OR channel IN ('site','whatsapp','phone','referral','other','email','organic','paid','social')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  total_leads INT NOT NULL DEFAULT 0 CHECK (total_leads >=0),
  converted_leads INT NOT NULL DEFAULT 0 CHECK (converted_leads >=0),
  conversion_rate NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_leads >0 THEN (converted_leads::numeric / total_leads::numeric * 100) ELSE 0 END
  ) STORED,
  total_opportunities INT NOT NULL DEFAULT 0 CHECK (total_opportunities >=0),
  total_contracts INT NOT NULL DEFAULT 0 CHECK (total_contracts >=0),
  is_minimized BOOLEAN NOT NULL DEFAULT true,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(origin, campaign, channel, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS pub_origin_metrics_origin_idx ON pub_origin_metrics(origin);
CREATE INDEX IF NOT EXISTS pub_origin_metrics_period_idx ON pub_origin_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS pub_origin_metrics_minimized_idx ON pub_origin_metrics(is_minimized) WHERE is_minimized = true;

CREATE TABLE IF NOT EXISTS pub_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type conversion_event_type NOT NULL DEFAULT 'lead_received',
  origin TEXT CHECK (origin IS NULL OR char_length(origin) BETWEEN 3 AND 100),
  campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) BETWEEN 3 AND 100),
  channel TEXT CHECK (channel IS NULL OR char_length(channel) BETWEEN 1 AND 100),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lead_id UUID REFERENCES public_leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  is_minimized BOOLEAN NOT NULL DEFAULT true,
  ip_hash CHAR(64) CHECK (ip_hash IS NULL OR char_length(ip_hash)=64),
  user_agent_hash CHAR(64) CHECK (user_agent_hash IS NULL OR char_length(user_agent_hash)=64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_conversion_events_type_idx ON pub_conversion_events(event_type);
CREATE INDEX IF NOT EXISTS pub_conversion_events_origin_idx ON pub_conversion_events(origin, campaign);
CREATE INDEX IF NOT EXISTS pub_conversion_events_occurred_idx ON pub_conversion_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS pub_conversion_events_minimized_idx ON pub_conversion_events(is_minimized) WHERE is_minimized = true;

CREATE TABLE IF NOT EXISTS pub_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_key TEXT NOT NULL UNIQUE CHECK (char_length(test_key) BETWEEN 3 AND 100),
  hypothesis TEXT NOT NULL CHECK (char_length(hypothesis) BETWEEN 20 AND 2000),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  variant_a JSONB NOT NULL DEFAULT '{}'::jsonb,
  variant_b JSONB NOT NULL DEFAULT '{}'::jsonb,
  metric_name TEXT NOT NULL CHECK (char_length(metric_name) BETWEEN 3 AND 200),
  traffic_required INT NOT NULL DEFAULT 100 CHECK (traffic_required >=10),
  treatment TEXT NOT NULL CHECK (char_length(treatment) BETWEEN 10 AND 2000),
  privacy_compliance_note TEXT NOT NULL DEFAULT 'teste A/B com minimização de dados, hipótese e tratamento definidos, sem dados pessoais' CHECK (char_length(privacy_compliance_note) BETWEEN 10 AND 1000),
  status ab_test_status NOT NULL DEFAULT 'rascunho',
  winner TEXT CHECK (winner IS NULL OR winner IN ('A','B','empate','inconclusivo')),
  result_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_privacy_compliant BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_by_name TEXT CHECK (created_by_name IS NULL OR char_length(created_by_name) BETWEEN 2 AND 200),
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_by_name TEXT CHECK (approved_by_name IS NULL OR char_length(approved_by_name) BETWEEN 2 AND 200),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_ab_tests_key_idx ON pub_ab_tests(test_key);
CREATE INDEX IF NOT EXISTS pub_ab_tests_status_idx ON pub_ab_tests(status);
CREATE INDEX IF NOT EXISTS pub_ab_tests_privacy_idx ON pub_ab_tests(is_privacy_compliant) WHERE is_privacy_compliant = true;

CREATE TABLE IF NOT EXISTS pub_ab_test_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES pub_ab_tests(id) ON DELETE CASCADE,
  previous_status ab_test_status,
  next_status ab_test_status NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_ab_test_history_test_idx ON pub_ab_test_history(test_id);

-- Triggers
CREATE OR REPLACE FUNCTION pub_metrics_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS pub_origin_metrics_touch ON pub_origin_metrics; CREATE TRIGGER pub_origin_metrics_touch BEFORE UPDATE ON pub_origin_metrics FOR EACH ROW EXECUTE FUNCTION pub_metrics_touch_updated_at();
DROP TRIGGER IF EXISTS pub_ab_tests_touch ON pub_ab_tests; CREATE TRIGGER pub_ab_tests_touch BEFORE UPDATE ON pub_ab_tests FOR EACH ROW EXECUTE FUNCTION pub_metrics_touch_updated_at();

CREATE OR REPLACE FUNCTION prevent_ab_test_history_update() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'pub_ab_test_history is immutable'; RETURN NULL; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pub_ab_test_history_immutable ON pub_ab_test_history; CREATE TRIGGER trg_pub_ab_test_history_immutable BEFORE UPDATE OR DELETE ON pub_ab_test_history FOR EACH ROW EXECUTE FUNCTION prevent_ab_test_history_update();

-- Seed origem métricas minimizadas a partir de public_leads existentes (sem dados pessoais)
INSERT INTO pub_origin_metrics (origin, campaign, channel, period_start, period_end, total_leads, converted_leads, total_opportunities, total_contracts, is_minimized, notes)
SELECT
  COALESCE(origin,'site') as origin,
  campaign,
  COALESCE(channel,'site') as channel,
  CURRENT_DATE - INTERVAL '30 days' as period_start,
  CURRENT_DATE as period_end,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE status IN ('em_agendamento','confirmada','realizada')) as converted,
  0 as total_opportunities,
  0 as total_contracts,
  true as is_minimized,
  'seed minimizado a partir de public_leads sem IP/user_agent, apenas contagens por origem/campanha/canal'
FROM public_leads
GROUP BY COALESCE(origin,'site'), campaign, COALESCE(channel,'site')
ON CONFLICT (origin, campaign, channel, period_start, period_end) DO NOTHING;

-- Auditoria
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept','login','logout','session_revoke_all','email_confirm','email_confirm_resend','password_reset_request','password_reset_complete','account_create','account_status','grant_issue','grant_revoke','contract_create','contract_status','contract_list','document_upload','document_download','document_list','ticket_open','ticket_status','ticket_list','mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify','email_change_request','email_change_confirm','email_change_cancel','email_change_alert','grant_contract_restrict','grant_unit_restrict','staff_invite','staff_login','staff_role_change','staff_session_revoke','permission_grant','permission_revoke','access_review','assignment_create','assignment_end','assignment_suspend','scale_create','scale_update','time_entry_start','time_entry_end','time_entry_ronda','handover_create','handover_accept','audit_query','audit_export','invite_rate_limited','notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry','integration_check','integration_test','integration_update','catalog_create','catalog_update','catalog_publish','lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel','crm_company_create','crm_company_update','crm_contact_create','crm_contact_update','crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change','crm_import_create','crm_import_commit','crm_import_export','crm_equipment_create','crm_equipment_update','crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer','crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_status','crm_labor_budget_item_create','crm_labor_budget_item_update','crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_status','crm_technical_budget_item_create','crm_technical_budget_item_update','crm_cost_param_create','crm_cost_param_update','crm_cost_param_status','crm_price_scenario_create','crm_price_scenario_update','crm_price_scenario_status','crm_discount_policy_create','crm_discount_policy_update','crm_discount_policy_status','crm_discount_request_create','crm_discount_request_status','crm_proposal_create','crm_proposal_update','crm_proposal_status','crm_proposal_item_create','crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status','crm_acceptance_link_create','crm_acceptance_link_used','crm_contract_create','crm_contract_idempotent_hit','crm_contract_update','crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed','crm_contract_unit_add','crm_contract_unit_remove','crm_contract_responsible_add','crm_contract_responsible_remove','crm_contract_document_upload','crm_contract_post_create','crm_contract_post_delete','crm_contract_sla_create','crm_contract_sla_delete','crm_contract_obligation_create','crm_contract_obligation_delete','crm_contract_exclusion_create','crm_contract_exclusion_delete','crm_contract_schedule_create','crm_contract_schedule_update','crm_amendment_create','crm_amendment_update','crm_amendment_approve','crm_amendment_reject','crm_alert_rule_create','crm_alert_rule_update','crm_alert_create','crm_alert_status','crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit','crm_implantation_create','crm_implantation_update','crm_implantation_step_create','crm_implantation_step_update','crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject','crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_update','crm_scope_revocation_create','crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_measurement_create','crm_measurement_approve','crm_quality_evidence_create','crm_diary_create','crm_diary_update','crm_diary_search','crm_notification_preference_update','crm_notification_template_create','crm_notification_template_update','crm_notification_template_approve','crm_notification_template_reject','crm_observability_query','crm_observability_alert_ack','crm_observability_alert_resolve','crm_healthcheck_query','crm_healthcheck_ready','crm_healthcheck_live','crm_backup_create','crm_backup_status','crm_backup_restore_test','crm_backup_restore','crm_backup_retention_update','crm_backup_delete','crm_privacy_inventory_create','crm_privacy_inventory_update','crm_privacy_policy_create','crm_privacy_policy_update','crm_privacy_policy_approve','crm_privacy_policy_publish','crm_privacy_policy_reject','crm_lgpd_request_create','crm_lgpd_request_verify','crm_lgpd_request_update','crm_lgpd_request_respond','crm_lgpd_request_reject','crm_retention_policy_create','crm_retention_policy_update','crm_retention_exception_create','crm_retention_exception_approve','crm_retention_exception_reject','crm_retention_exception_revoke','crm_retention_job_create','crm_retention_job_execute','crm_retention_log_create','crm_incident_create','crm_incident_update','crm_incident_contain','crm_incident_evidence_add','crm_incident_action_create','crm_incident_action_complete','crm_incident_communicate','crm_incident_close','crm_config_flag_create','crm_config_flag_update','crm_config_flag_rollback','crm_maintenance_create','crm_maintenance_update','crm_rollout_create','crm_rollout_approve','crm_rollout_execute','crm_rollout_rollback','crm_dependency_audit_create','crm_dependency_audit_review','crm_dependency_update_approve','crm_dependency_update_apply','crm_integration_job_create','crm_integration_job_execute','crm_webhook_create','crm_webhook_update','crm_webhook_deliver','crm_reconciliation_create','crm_budget_create','crm_budget_update','crm_usage_metric_create','crm_usage_alert_ack','crm_env_create','crm_env_verify','crm_env_check','crm_maintenance_doc_create','crm_maintenance_doc_publish','cms_content_create','cms_content_update','cms_content_publish','cms_content_revert','cms_content_approve','cms_content_reject','cms_content_archive','theme_create','theme_update','theme_publish','theme_rollback','theme_preview_create','theme_preference_update','seo_config_create','seo_config_update','seo_redirect_create','seo_redirect_update','seo_sitemap_update','domain_verification_create','domain_verification_verify','package_rule_create','package_rule_approve','package_create','package_update','package_publish','package_comparison_create','origin_metric_create','origin_metric_update','conversion_event_create','ab_test_create','ab_test_update','ab_test_approve','ab_test_start','ab_test_conclude'
));

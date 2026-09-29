-- PUB-08 SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos

DO $$ BEGIN CREATE TYPE seo_redirect_type AS ENUM ('301','302','307','308'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE seo_changefreq AS ENUM ('always','hourly','daily','weekly','monthly','yearly','never'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE domain_verification_status AS ENUM ('pendente','verificado','falha','expirado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE domain_verification_method AS ENUM ('dns_txt','file','meta_tag','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS seo_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL UNIQUE CHECK (char_length(path) BETWEEN 1 AND 500),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 500),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  canonical_url TEXT CHECK (canonical_url IS NULL OR char_length(canonical_url) BETWEEN 5 AND 1000),
  robots TEXT NOT NULL DEFAULT 'noindex, nofollow' CHECK (char_length(robots) BETWEEN 5 AND 200),
  og_title TEXT CHECK (og_title IS NULL OR char_length(og_title) BETWEEN 5 AND 200),
  og_description TEXT CHECK (og_description IS NULL OR char_length(og_description) BETWEEN 10 AND 500),
  og_image_url TEXT CHECK (og_image_url IS NULL OR char_length(og_image_url) BETWEEN 5 AND 1000),
  sitemap_priority NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (sitemap_priority >=0 AND sitemap_priority <=1),
  changefreq seo_changefreq NOT NULL DEFAULT 'weekly',
  is_noindex BOOLEAN NOT NULL DEFAULT true,
  is_published BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS seo_configs_path_idx ON seo_configs(path);
CREATE INDEX IF NOT EXISTS seo_configs_published_idx ON seo_configs(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS seo_configs_noindex_idx ON seo_configs(is_noindex);

CREATE TABLE IF NOT EXISTS seo_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_path TEXT NOT NULL UNIQUE CHECK (char_length(old_path) BETWEEN 1 AND 500),
  new_path TEXT NOT NULL CHECK (char_length(new_path) BETWEEN 1 AND 500),
  redirect_type seo_redirect_type NOT NULL DEFAULT '301',
  is_active BOOLEAN NOT NULL DEFAULT true,
  hits INT NOT NULL DEFAULT 0 CHECK (hits >=0),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (old_path != new_path)
);
CREATE INDEX IF NOT EXISTS seo_redirects_old_idx ON seo_redirects(old_path);
CREATE INDEX IF NOT EXISTS seo_redirects_active_idx ON seo_redirects(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS seo_sitemap_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE CHECK (char_length(url) BETWEEN 1 AND 1000), -- '/' é entrada válida
  lastmod DATE NOT NULL DEFAULT CURRENT_DATE,
  priority NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (priority >=0 AND priority <=1),
  changefreq seo_changefreq NOT NULL DEFAULT 'weekly',
  is_included BOOLEAN NOT NULL DEFAULT true,
  source TEXT CHECK (source IS NULL OR char_length(source) BETWEEN 3 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS seo_sitemap_url_idx ON seo_sitemap_entries(url);
CREATE INDEX IF NOT EXISTS seo_sitemap_included_idx ON seo_sitemap_entries(is_included) WHERE is_included = true;

CREATE TABLE IF NOT EXISTS domain_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE CHECK (char_length(domain) BETWEEN 3 AND 200),
  verification_method domain_verification_method NOT NULL DEFAULT 'dns_txt',
  verification_token TEXT NOT NULL CHECK (char_length(verification_token) BETWEEN 10 AND 500),
  status domain_verification_status NOT NULL DEFAULT 'pendente',
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS domain_verifications_domain_idx ON domain_verifications(domain);
CREATE INDEX IF NOT EXISTS domain_verifications_status_idx ON domain_verifications(status);

-- Triggers
CREATE OR REPLACE FUNCTION seo_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS seo_configs_touch ON seo_configs; CREATE TRIGGER seo_configs_touch BEFORE UPDATE ON seo_configs FOR EACH ROW EXECUTE FUNCTION seo_touch_updated_at();
DROP TRIGGER IF EXISTS seo_redirects_touch ON seo_redirects; CREATE TRIGGER seo_redirects_touch BEFORE UPDATE ON seo_redirects FOR EACH ROW EXECUTE FUNCTION seo_touch_updated_at();
DROP TRIGGER IF EXISTS seo_sitemap_entries_touch ON seo_sitemap_entries; CREATE TRIGGER seo_sitemap_entries_touch BEFORE UPDATE ON seo_sitemap_entries FOR EACH ROW EXECUTE FUNCTION seo_touch_updated_at();
DROP TRIGGER IF EXISTS domain_verifications_touch ON domain_verifications; CREATE TRIGGER domain_verifications_touch BEFORE UPDATE ON domain_verifications FOR EACH ROW EXECUTE FUNCTION seo_touch_updated_at();

-- Seed SEO configs preservando noindex em não produtivo
INSERT INTO seo_configs (path, title, description, keywords, robots, is_noindex, is_published, sitemap_priority, changefreq)
VALUES
  ('/', 'Grupo SEG System Segurança - Portaria, Vigilância, Limpeza', 'Segurança desarmada, portaria, monitoramento 24h, CFTV, limpeza e supervisão em Guarulhos e região metropolitana. Orçamento com protocolo persistido, sem preço fictício.', ARRAY['segurança','portaria','vigilância','limpeza','CFTV','monitoramento'], 'noindex, nofollow', true, false, 1.0, 'daily'),
  ('/servicos', 'Serviços - Grupo SEG System', 'Catálogo único dos seis serviços validados: segurança desarmada, monitoramento 24h, CFTV, portaria, limpeza, supervisão. Descrição, público e perguntas de qualificação.', ARRAY['serviços','segurança','portaria'], 'noindex, nofollow', true, false, 0.9, 'weekly'),
  ('/orcamento', 'Orçamento - Grupo SEG System', 'Solicite orçamento com protocolo persistido, origem/campanha, consentimento e responsável de atendimento. Sem promessa de horário sem reserva real.', ARRAY['orçamento','visita técnica'], 'noindex, nofollow', true, false, 0.8, 'weekly'),
  ('/contato', 'Contato - Grupo SEG System', 'Entre em contato: Av Armando Bei 305, Guarulhos, tel 11 3437-2217, email contato@gruposegsystemseguranca.com.br', ARRAY['contato','Guarulhos'], 'noindex, nofollow', true, false, 0.7, 'monthly'),
  ('/privacidade', 'Política de Privacidade - Minuta Pendente', 'Minuta pendente de aprovação formal, base legal, retenção 12m auditoria/CFTV sensível, encarregado a definir, direitos titular. Noindex até publicação.', ARRAY['privacidade','LGPD'], 'noindex, nofollow', true, false, 0.3, 'monthly')
ON CONFLICT (path) DO NOTHING;

-- Seed redirects preservando rotas antigas
INSERT INTO seo_redirects (old_path, new_path, redirect_type, is_active, reason)
VALUES
  ('/cliente/acesso', '/cliente/entrar', '301', true, 'CLI-01 entrada única preservada, rota antiga identificada/redirecionada com cuidado'),
  ('/cliente/login', '/cliente/entrar', '301', true, 'CLI-01 entrada única'),
  ('/servicos/cerca-eletrica', '/servicos', '302', true, 'PUB-01 cerca elétrica só após validação comercial, redireciona para catálogo validado'),
  ('/admin/funcionarios', '/admin/ti', '302', false, 'Prévia descritiva não concede permissão, preservada como redirect inativo até homologação')
ON CONFLICT (old_path) DO NOTHING;

-- Seed sitemap preservando noindex (não incluir até produção liberada)
INSERT INTO seo_sitemap_entries (url, priority, changefreq, is_included, source)
VALUES
  ('/', 1.0, 'daily', false, 'seed noindex preservado até produção liberada'),
  ('/servicos', 0.9, 'weekly', false, 'seed noindex'),
  ('/orcamento', 0.8, 'weekly', false, 'seed noindex'),
  ('/contato', 0.7, 'monthly', false, 'seed noindex'),
  ('/faq', 0.6, 'weekly', false, 'seed noindex'),
  ('/privacidade', 0.3, 'monthly', false, 'seed noindex minuta pendente')
ON CONFLICT (url) DO NOTHING;

-- Auditoria
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept','login','logout','session_revoke_all','email_confirm','email_confirm_resend','password_reset_request','password_reset_complete','account_create','account_status','grant_issue','grant_revoke','contract_create','contract_status','contract_list','document_upload','document_download','document_list','ticket_open','ticket_status','ticket_list','mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify','email_change_request','email_change_confirm','email_change_cancel','email_change_alert','grant_contract_restrict','grant_unit_restrict','staff_invite','staff_login','staff_role_change','staff_session_revoke','permission_grant','permission_revoke','access_review','assignment_create','assignment_end','assignment_suspend','scale_create','scale_update','time_entry_start','time_entry_end','time_entry_ronda','handover_create','handover_accept','audit_query','audit_export','invite_rate_limited','notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry','integration_check','integration_test','integration_update','catalog_create','catalog_update','catalog_publish','lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel','crm_company_create','crm_company_update','crm_contact_create','crm_contact_update','crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change','crm_import_create','crm_import_commit','crm_import_export','crm_equipment_create','crm_equipment_update','crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer','crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_status','crm_labor_budget_item_create','crm_labor_budget_item_update','crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_status','crm_technical_budget_item_create','crm_technical_budget_item_update','crm_cost_param_create','crm_cost_param_update','crm_cost_param_status','crm_price_scenario_create','crm_price_scenario_update','crm_price_scenario_status','crm_discount_policy_create','crm_discount_policy_update','crm_discount_policy_status','crm_discount_request_create','crm_discount_request_status','crm_proposal_create','crm_proposal_update','crm_proposal_status','crm_proposal_item_create','crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status','crm_acceptance_link_create','crm_acceptance_link_used','crm_contract_create','crm_contract_idempotent_hit','crm_contract_update','crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed','crm_contract_unit_add','crm_contract_unit_remove','crm_contract_responsible_add','crm_contract_responsible_remove','crm_contract_document_upload','crm_contract_post_create','crm_contract_post_delete','crm_contract_sla_create','crm_contract_sla_delete','crm_contract_obligation_create','crm_contract_obligation_delete','crm_contract_exclusion_create','crm_contract_exclusion_delete','crm_contract_schedule_create','crm_contract_schedule_update','crm_amendment_create','crm_amendment_update','crm_amendment_approve','crm_amendment_reject','crm_alert_rule_create','crm_alert_rule_update','crm_alert_create','crm_alert_status','crm_doc_obligation_create','crm_doc_obligation_update','crm_doc_obligation_approve','crm_doc_obligation_reject','crm_doc_obligation_submit','crm_implantation_create','crm_implantation_update','crm_implantation_step_create','crm_implantation_step_update','crm_implantation_block_create','crm_implantation_block_resolve','crm_implantation_exception_create','crm_implantation_exception_authorize','crm_implantation_exception_reject','crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_update','crm_scope_revocation_create','crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_measurement_create','crm_measurement_approve','crm_quality_evidence_create','crm_diary_create','crm_diary_update','crm_diary_search','crm_notification_preference_update','crm_notification_template_create','crm_notification_template_update','crm_notification_template_approve','crm_notification_template_reject','crm_observability_query','crm_observability_alert_ack','crm_observability_alert_resolve','crm_healthcheck_query','crm_healthcheck_ready','crm_healthcheck_live','crm_backup_create','crm_backup_status','crm_backup_restore_test','crm_backup_restore','crm_backup_retention_update','crm_backup_delete','crm_privacy_inventory_create','crm_privacy_inventory_update','crm_privacy_policy_create','crm_privacy_policy_update','crm_privacy_policy_approve','crm_privacy_policy_publish','crm_privacy_policy_reject','crm_lgpd_request_create','crm_lgpd_request_verify','crm_lgpd_request_update','crm_lgpd_request_respond','crm_lgpd_request_reject','crm_retention_policy_create','crm_retention_policy_update','crm_retention_exception_create','crm_retention_exception_approve','crm_retention_exception_reject','crm_retention_exception_revoke','crm_retention_job_create','crm_retention_job_execute','crm_retention_log_create','crm_incident_create','crm_incident_update','crm_incident_contain','crm_incident_evidence_add','crm_incident_action_create','crm_incident_action_complete','crm_incident_communicate','crm_incident_close','crm_config_flag_create','crm_config_flag_update','crm_config_flag_rollback','crm_maintenance_create','crm_maintenance_update','crm_rollout_create','crm_rollout_approve','crm_rollout_execute','crm_rollout_rollback','crm_dependency_audit_create','crm_dependency_audit_review','crm_dependency_update_approve','crm_dependency_update_apply','crm_integration_job_create','crm_integration_job_execute','crm_webhook_create','crm_webhook_update','crm_webhook_deliver','crm_reconciliation_create','crm_budget_create','crm_budget_update','crm_usage_metric_create','crm_usage_alert_ack','crm_env_create','crm_env_verify','crm_env_check','crm_maintenance_doc_create','crm_maintenance_doc_publish','cms_content_create','cms_content_update','cms_content_publish','cms_content_revert','cms_content_approve','cms_content_reject','cms_content_archive','theme_create','theme_update','theme_publish','theme_rollback','theme_preview_create','theme_preference_update','seo_config_create','seo_config_update','seo_redirect_create','seo_redirect_update','seo_sitemap_update','domain_verification_create','domain_verification_verify'
));

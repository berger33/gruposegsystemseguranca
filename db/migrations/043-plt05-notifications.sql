-- 043-plt05-notifications: PLT-05 notificações painel e-mail canais externos preferências templates sem info médica em assunto/push
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_notification_channel') THEN
    CREATE TYPE crm_notification_channel AS ENUM ('email','whatsapp','sms','push','webhook','internal','sistema');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_notification_template_status') THEN
    CREATE TYPE crm_notification_template_status AS ENUM ('rascunho','em_revisao','aprovado','arquivado','rejeitado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('client','staff','lead','system','marcelo','ti','admin','rh')),
  recipient_id UUID REFERENCES auth_identities(id) ON DELETE CASCADE,
  recipient_email TEXT CHECK (recipient_email IS NULL OR char_length(recipient_email) BETWEEN 5 AND 320),
  channel crm_notification_channel NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_email_enabled BOOLEAN NOT NULL DEFAULT true,
  is_push_enabled BOOLEAN NOT NULL DEFAULT true,
  is_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  is_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  is_internal_enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(recipient_kind, recipient_id, channel)
);

CREATE INDEX IF NOT EXISTS crm_notification_prefs_kind_idx ON crm_notification_preferences(recipient_kind, recipient_id);
CREATE INDEX IF NOT EXISTS crm_notification_prefs_channel_idx ON crm_notification_preferences(channel, is_enabled);

DROP TRIGGER IF EXISTS trg_crm_notification_prefs_updated_at ON crm_notification_preferences;
CREATE TRIGGER trg_crm_notification_prefs_updated_at BEFORE UPDATE ON crm_notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL CHECK (char_length(template_key) BETWEEN 1 AND 100),
  channel crm_notification_channel NOT NULL,
  subject TEXT CHECK (subject IS NULL OR char_length(subject) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  is_medical_safe BOOLEAN NOT NULL DEFAULT true,
  status crm_notification_template_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 1000),
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_key, channel, version)
);

CREATE INDEX IF NOT EXISTS crm_notification_templates_key_idx ON crm_notification_templates(template_key, channel);
CREATE INDEX IF NOT EXISTS crm_notification_templates_status_idx ON crm_notification_templates(status, channel);

DROP TRIGGER IF EXISTS trg_crm_notification_templates_updated_at ON crm_notification_templates;
CREATE TRIGGER trg_crm_notification_templates_updated_at BEFORE UPDATE ON crm_notification_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Garantir que templates não contenham info médica em assunto/push via CHECK aplicativo + validação
-- Adiciona coluna para rastrear se template foi revisado para segurança médica
ALTER TABLE crm_notification_templates ADD COLUMN IF NOT EXISTS medical_review_note TEXT CHECK (medical_review_note IS NULL OR char_length(medical_review_note) BETWEEN 1 AND 1000);

-- Auditoria PLT-05
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

INSERT INTO crm_notification_templates (template_key, channel, subject, body, is_medical_safe, status, version, created_by) VALUES
  ('lead_new', 'internal', 'Novo lead: {{company}}', 'Novo lead recebido de {{name}} ({{city}}) interessado em {{services}}. Origem: {{origin}}. Protocolo {{protocol}}.', true, 'aprovado', 1, 'system'),
  ('lead_new_email', 'email', 'Novo lead recebido', 'Olá equipe, novo lead {{name}} interessado em {{services}} ({{city}}). Protocolo {{protocol}}. Acesse /admin/leads.', true, 'aprovado', 1, 'system'),
  ('contract_status_change', 'internal', 'Contrato {{contract_id}} status {{next_status}}', 'Contrato {{contract_id}} mudou de {{previous_status}} para {{next_status}} em {{effective_date}}. Motivo: {{reason}}.', true, 'aprovado', 1, 'system'),
  ('implantation_blocked', 'internal', 'Implantação bloqueada: {{contract_id}}', 'Implantação do contrato {{contract_id}} bloqueada em {{step_id}} por {{block_type}}. Título: {{title}}.', true, 'aprovado', 1, 'system')
ON CONFLICT (template_key, channel, version) DO NOTHING;

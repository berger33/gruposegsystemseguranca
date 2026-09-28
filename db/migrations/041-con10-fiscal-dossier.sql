-- 041-con10-fiscal-dossier: CON-10 dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_fiscal_dossier_status') THEN
    CREATE TYPE crm_fiscal_dossier_status AS ENUM ('rascunho','em_analise','aprovado','arquivado','cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_service_measurement_status') THEN
    CREATE TYPE crm_service_measurement_status AS ENUM ('pendente','aprovado','rejeitado','em_ajuste');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_quality_evidence_type') THEN
    CREATE TYPE crm_quality_evidence_type AS ENUM ('foto','relatorio','indicador','checklist','outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_contract_fiscal_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  period_start DATE,
  period_end DATE CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  status crm_fiscal_dossier_status NOT NULL DEFAULT 'rascunho',
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_fiscal_dossiers_contract_idx ON crm_contract_fiscal_dossiers(contract_id, period_start DESC);
CREATE INDEX IF NOT EXISTS crm_fiscal_dossiers_status_idx ON crm_contract_fiscal_dossiers(status, period_start);

DROP TRIGGER IF EXISTS trg_crm_fiscal_dossiers_updated_at ON crm_contract_fiscal_dossiers;
CREATE TRIGGER trg_crm_fiscal_dossiers_updated_at BEFORE UPDATE ON crm_contract_fiscal_dossiers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_service_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES crm_contract_fiscal_dossiers(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK (char_length(service_type) BETWEEN 1 AND 100),
  measurement_date DATE NOT NULL,
  quantity NUMERIC(12,2) CHECK (quantity IS NULL OR quantity >= 0),
  quality_score NUMERIC(5,2) CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  acceptance_status crm_service_measurement_status NOT NULL DEFAULT 'pendente',
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  evidence_file_url TEXT CHECK (evidence_file_url IS NULL OR char_length(evidence_file_url) BETWEEN 1 AND 1000),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_service_measurements_dossier_idx ON crm_contract_service_measurements(dossier_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS crm_service_measurements_contract_idx ON crm_contract_service_measurements(contract_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS crm_service_measurements_status_idx ON crm_contract_service_measurements(acceptance_status, measurement_date);

DROP TRIGGER IF EXISTS trg_crm_service_measurements_updated_at ON crm_contract_service_measurements;
CREATE TRIGGER trg_crm_service_measurements_updated_at BEFORE UPDATE ON crm_contract_service_measurements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_quality_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES crm_contract_fiscal_dossiers(id) ON DELETE CASCADE,
  measurement_id UUID REFERENCES crm_contract_service_measurements(id) ON DELETE SET NULL,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  evidence_type crm_quality_evidence_type NOT NULL DEFAULT 'outro',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 1 AND 1000),
  storage_key TEXT CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  captured_at DATE,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_quality_evidences_dossier_idx ON crm_contract_quality_evidences(dossier_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS crm_quality_evidences_contract_idx ON crm_contract_quality_evidences(contract_id, evidence_type);
CREATE INDEX IF NOT EXISTS crm_quality_evidences_measurement_idx ON crm_contract_quality_evidences(measurement_id);

-- Auditoria CON-10
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
  'crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_service_measurement_create','crm_service_measurement_approve','crm_quality_evidence_create'
));

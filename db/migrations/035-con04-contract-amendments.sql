-- 035-con04-contract-amendments: CON-04 aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_amendment_type') THEN
    CREATE TYPE crm_amendment_type AS ENUM ('aditivo','reajuste','repactuacao','prorrogacao','supressao','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_amendment_base_type') THEN
    CREATE TYPE crm_amendment_base_type AS ENUM ('indice_igpm','indice_ipca','indice_inpc','dissidio_coletivo','convencao_coletiva','alteracao_escopo','prorrogacao_prazo','reajuste_contratual','acordo_comercial','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_amendment_status') THEN
    CREATE TYPE crm_amendment_status AS ENUM ('rascunho','em_revisao','aprovado','rejeitado','cancelado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_contract_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  type crm_amendment_type NOT NULL DEFAULT 'aditivo',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000),
  base_type crm_amendment_base_type NOT NULL DEFAULT 'outro',
  base_description TEXT CHECK (base_description IS NULL OR char_length(base_description) BETWEEN 1 AND 1000),
  base_value NUMERIC(14,6) CHECK (base_value IS NULL OR base_value BETWEEN -100 AND 10000),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 2000),
  vigencia_start DATE NOT NULL,
  vigencia_end DATE CHECK (vigencia_end IS NULL OR vigencia_end >= vigencia_start),
  effective_date DATE NOT NULL,
  previous_total_cost NUMERIC(14,2) CHECK (previous_total_cost IS NULL OR previous_total_cost >= 0),
  previous_total_price NUMERIC(14,2) CHECK (previous_total_price IS NULL OR previous_total_price >= 0),
  new_total_cost NUMERIC(14,2) CHECK (new_total_cost IS NULL OR new_total_cost >= 0),
  new_total_price NUMERIC(14,2) CHECK (new_total_price IS NULL OR new_total_price >= 0),
  status crm_amendment_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 1000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(idempotency_key),
  CHECK (effective_date >= vigencia_start OR vigencia_end IS NULL OR effective_date >= vigencia_start)
);

CREATE INDEX IF NOT EXISTS crm_contract_amendments_contract_idx ON crm_contract_amendments(contract_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS crm_contract_amendments_type_idx ON crm_contract_amendments(type, base_type);
CREATE INDEX IF NOT EXISTS crm_contract_amendments_status_idx ON crm_contract_amendments(status, effective_date);
CREATE INDEX IF NOT EXISTS crm_contract_amendments_vigencia_idx ON crm_contract_amendments(vigencia_start, vigencia_end);

DROP TRIGGER IF EXISTS trg_crm_contract_amendments_updated_at ON crm_contract_amendments;
CREATE TRIGGER trg_crm_contract_amendments_updated_at BEFORE UPDATE ON crm_contract_amendments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_amendment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amendment_id UUID NOT NULL REFERENCES crm_contract_amendments(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  previous_status crm_amendment_status,
  next_status crm_amendment_status NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
  changed_by TEXT NOT NULL CHECK (char_length(changed_by) BETWEEN 1 AND 80),
  changed_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_amendment_history_amendment_idx ON crm_contract_amendment_history(amendment_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS crm_amendment_history_contract_idx ON crm_contract_amendment_history(contract_id, effective_date DESC);

-- Auditoria CON-04
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
  'crm_contract_amendment_create','crm_contract_amendment_update','crm_contract_amendment_approve','crm_contract_amendment_reject'
));

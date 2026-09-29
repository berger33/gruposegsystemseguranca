-- 034-con03-contract-status-transitions: CON-03 estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura com ativação operacional
DO $$
BEGIN
  BEGIN
    ALTER TYPE crm_contract_status ADD VALUE 'em_revisao';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE crm_contract_status ADD VALUE 'aguardando_assinatura';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Colunas para distinguir assinatura vs ativação operacional e data de efeito
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='signed_at') THEN
    ALTER TABLE crm_contracts ADD COLUMN signed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='signed_by') THEN
    ALTER TABLE crm_contracts ADD COLUMN signed_by TEXT CHECK (signed_by IS NULL OR char_length(signed_by) BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='signed_by_id') THEN
    ALTER TABLE crm_contracts ADD COLUMN signed_by_id UUID REFERENCES auth_identities(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='operational_activated_at') THEN
    ALTER TABLE crm_contracts ADD COLUMN operational_activated_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='current_status_effective_date') THEN
    ALTER TABLE crm_contracts ADD COLUMN current_status_effective_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='suspension_reason') THEN
    ALTER TABLE crm_contracts ADD COLUMN suspension_reason TEXT CHECK (suspension_reason IS NULL OR char_length(suspension_reason) BETWEEN 1 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='closure_reason') THEN
    ALTER TABLE crm_contracts ADD COLUMN closure_reason TEXT CHECK (closure_reason IS NULL OR char_length(closure_reason) BETWEEN 1 AND 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='status_changed_at') THEN
    ALTER TABLE crm_contracts ADD COLUMN status_changed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='status_changed_by') THEN
    ALTER TABLE crm_contracts ADD COLUMN status_changed_by TEXT CHECK (status_changed_by IS NULL OR char_length(status_changed_by) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_contracts' AND column_name='status_changed_by_id') THEN
    ALTER TABLE crm_contracts ADD COLUMN status_changed_by_id UUID REFERENCES auth_identities(id);
  END IF;
END $$;

-- Histórico de transições com data de efeito e distinção assinatura vs ativação operacional
CREATE TABLE IF NOT EXISTS crm_contract_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  previous_status crm_contract_status,
  next_status crm_contract_status NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
  is_signature_event BOOLEAN NOT NULL DEFAULT false,
  is_operational_activation BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMPTZ,
  operational_activated_at TIMESTAMPTZ,
  changed_by TEXT NOT NULL CHECK (char_length(changed_by) BETWEEN 1 AND 80),
  changed_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contract_status_history_contract_idx ON crm_contract_status_history(contract_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS crm_contract_status_history_next_idx ON crm_contract_status_history(next_status, effective_date);
CREATE INDEX IF NOT EXISTS crm_contract_status_history_signature_idx ON crm_contract_status_history(contract_id, is_signature_event) WHERE is_signature_event = true;
CREATE INDEX IF NOT EXISTS crm_contract_status_history_activation_idx ON crm_contract_status_history(contract_id, is_operational_activation) WHERE is_operational_activation = true;

-- Índices para novas colunas
CREATE INDEX IF NOT EXISTS crm_contracts_signed_at_idx ON crm_contracts(signed_at);
CREATE INDEX IF NOT EXISTS crm_contracts_operational_idx ON crm_contracts(operational_activated_at);
CREATE INDEX IF NOT EXISTS crm_contracts_status_effective_idx ON crm_contracts(current_status_effective_date);

-- Auditoria CON-03
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
  'crm_contract_status_change','crm_contract_signed','crm_contract_activated','crm_contract_suspended','crm_contract_closed'
));

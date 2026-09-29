-- 040-con09-contract-closure: CON-09 encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_closure_type') THEN
    CREATE TYPE crm_closure_type AS ENUM ('encerramento','rescisao','distrato','termino_vigencia','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_closure_status') THEN
    CREATE TYPE crm_closure_status AS ENUM ('planejado','em_andamento','concluido','cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_closure_step_type') THEN
    CREATE TYPE crm_closure_step_type AS ENUM ('desmobilizacao_equipe','devolucao_equipamentos','devolucao_chaves','cobrancas_pendencias','documentos_finais','revogacao_escopos','comunicacao_cliente','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_closure_step_status') THEN
    CREATE TYPE crm_closure_step_status AS ENUM ('pendente','em_andamento','concluido','nao_aplicavel');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_contract_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  closure_type crm_closure_type NOT NULL DEFAULT 'encerramento',
  closure_date DATE NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  status crm_closure_status NOT NULL DEFAULT 'planejado',
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id),
  CHECK (effective_date >= closure_date OR effective_date = closure_date)
);

CREATE INDEX IF NOT EXISTS crm_contract_closures_contract_idx ON crm_contract_closures(contract_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS crm_contract_closures_status_idx ON crm_contract_closures(status, effective_date);
CREATE INDEX IF NOT EXISTS crm_contract_closures_effective_idx ON crm_contract_closures(effective_date) WHERE status = 'concluido';

DROP TRIGGER IF EXISTS trg_crm_contract_closures_updated_at ON crm_contract_closures;
CREATE TRIGGER trg_crm_contract_closures_updated_at BEFORE UPDATE ON crm_contract_closures FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_closure_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES crm_contract_closures(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  step_type crm_closure_step_type NOT NULL DEFAULT 'outro',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  status crm_closure_step_status NOT NULL DEFAULT 'pendente',
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 1 AND 120),
  completed_at DATE,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_closure_steps_closure_idx ON crm_closure_steps(closure_id, status);
CREATE INDEX IF NOT EXISTS crm_closure_steps_contract_idx ON crm_closure_steps(contract_id, step_type, status);

DROP TRIGGER IF EXISTS trg_crm_closure_steps_updated_at ON crm_closure_steps;
CREATE TRIGGER trg_crm_closure_steps_updated_at BEFORE UPDATE ON crm_closure_steps FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_scope_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  closure_id UUID REFERENCES crm_contract_closures(id) ON DELETE SET NULL,
  scope_type TEXT NOT NULL CHECK (char_length(scope_type) BETWEEN 1 AND 100),
  scope_description TEXT CHECK (scope_description IS NULL OR char_length(scope_description) BETWEEN 1 AND 1000),
  revoked_at DATE NOT NULL,
  revoked_by TEXT CHECK (revoked_by IS NULL OR char_length(revoked_by) BETWEEN 1 AND 80),
  revoked_by_id UUID REFERENCES auth_identities(id),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_scope_revocations_contract_idx ON crm_contract_scope_revocations(contract_id, revoked_at DESC);

-- Preservar histórico: não deletar contrato, itens, etc. Apenas marcar encerrado com data de efeito
-- Tabela de histórico de encerramento
CREATE TABLE IF NOT EXISTS crm_closure_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES crm_contract_closures(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  previous_status crm_closure_status,
  next_status crm_closure_status NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
  changed_by TEXT NOT NULL CHECK (char_length(changed_by) BETWEEN 1 AND 80),
  changed_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_closure_history_closure_idx ON crm_closure_history(closure_id, effective_date DESC);

-- Auditoria CON-09
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
  'crm_closure_create','crm_closure_update','crm_closure_conclude','crm_closure_step_create','crm_closure_step_update','crm_scope_revocation_create'
));

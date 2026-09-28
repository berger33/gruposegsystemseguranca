-- 028-crm24-reports: CRM-24 relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário. Previsão ponderada é estimativa identificada.
-- Não cria tabelas novas obrigatórias, apenas garante índices para relatórios e auditoria, e cria tabela de snapshots opcional para cache

CREATE TABLE IF NOT EXISTS crm_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('conversion','sales_cycle','overdue_tasks','loss_reasons','pipeline','weighted_forecast','conversion_origin','pipeline_period','pipeline_scenario')),
  period_start DATE,
  period_end DATE,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  data JSONB NOT NULL,
  is_estimate BOOLEAN NOT NULL DEFAULT true,
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_report_snapshots_type_idx ON crm_report_snapshots(report_type, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_report_snapshots_period_idx ON crm_report_snapshots(period_start, period_end);

-- Índices adicionais para relatórios
CREATE INDEX IF NOT EXISTS crm_opps_stage_origin_idx ON crm_opportunities(stage, origin, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_opps_loss_reason_idx ON crm_opportunities(loss_reason) WHERE loss_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_opps_stage_changed_idx ON crm_opportunities(stage_changed_at DESC);
CREATE INDEX IF NOT EXISTS crm_tasks_overdue_idx ON crm_tasks(due_date, status) WHERE status IN ('aberta','em_andamento');

-- Auditoria relatórios
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
  'crm_report_view','crm_report_snapshot'
));

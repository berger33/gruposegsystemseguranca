-- L04 (fechamento de lacunas) — CRM-07..10: tarefas, histórico de interações
-- com anexos, agenda de visitas, cadências de prospecção e carteira.
--
-- 1) A migração 103 corrigiu o CHECK de auth_access_audit.action para as ações
--    que já existiam no código. As telas de engajamento comercial entregues
--    agora (crm-engagement-api) emitem 16 ações novas; sem ampliar a mesma
--    restrição, cada INSERT de auditoria seria rejeitado silenciosamente
--    (o INSERT vive dentro de try/catch), repetindo exatamente o defeito que a
--    103 corrigiu. Nunca editamos uma migração aplicada: este arquivo repete a
--    lista completa da 103 e apenas acrescenta as novas ações.
-- 2) Cadências de prospecção (CRM-09) são materializadas como tarefas reais.
--    Para que a adesão seja idempotente de verdade (e não por checagem de
--    corrida no app), crm_tasks ganha cadence_key/cadence_step com índices
--    únicos parciais por oportunidade e por empresa.
-- 3) Anexos do histórico (CRM-07) reaproveitam o padrão já provado no L02:
--    bytes fora do banco, storage_key opaco, sha256 conferido no download.
--    Não há assinatura nem entrega externa envolvida.

ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'access_review', 'account_create', 'account_status', 'assignment_create',
  'assignment_end', 'assignment_suspend', 'audit_export', 'audit_query',
  'catalog_create', 'catalog_publish', 'catalog_update', 'cli_contact_create',
  'cli_contact_delegate', 'cli_contact_scope_create', 'cli_contract_item_create', 'cli_contract_scope_create',
  'cli_document_download', 'cli_document_version_create', 'cli_old_route_redirect', 'cli_vigencia_create',
  'contract_create', 'contract_list', 'contract_status', 'crm_cadence_enroll',
  'crm_campaign_create', 'crm_campaign_status', 'crm_closure_conclude', 'crm_closure_create',
  'crm_closure_step_update', 'crm_closure_update', 'crm_commission_create', 'crm_commission_rule_create',
  'crm_commission_rule_status', 'crm_commission_status', 'crm_company_create', 'crm_company_update',
  'crm_contact_create', 'crm_contract_activated', 'crm_contract_alert_create', 'crm_contract_alert_rule_create',
  'crm_contract_alert_rule_update', 'crm_contract_alert_status', 'crm_contract_amendment_approve', 'crm_contract_amendment_create',
  'crm_contract_amendment_reject', 'crm_contract_amendment_update', 'crm_contract_closed', 'crm_contract_create',
  'crm_contract_document_upload', 'crm_contract_exclusion_create', 'crm_contract_idempotent_hit', 'crm_contract_implantation_create',
  'crm_contract_obligation_create', 'crm_contract_post_create', 'crm_contract_responsible_add', 'crm_contract_responsible_remove',
  'crm_contract_schedule_create', 'crm_contract_signed', 'crm_contract_sla_create', 'crm_contract_status_change',
  'crm_contract_suspended', 'crm_contract_unit_add', 'crm_contract_unit_remove', 'crm_cost_param_create',
  'crm_cost_param_status_aprovado', 'crm_cost_param_update', 'crm_discount_policy_create', 'crm_discount_policy_status_aprovado',
  'crm_discount_policy_update', 'crm_discount_request_approval_denied', 'crm_discount_request_create', 'crm_discount_request_self_approval_denied',
  'crm_discount_request_status_aprovado', 'crm_discount_request_status_rejeitado', 'crm_discount_request_update', 'crm_doc_obligation_approve',
  'crm_doc_obligation_create', 'crm_doc_obligation_reject', 'crm_doc_obligation_submit', 'crm_doc_obligation_update',
  'crm_equipment_create', 'crm_fiscal_dossier_create', 'crm_fiscal_dossier_update', 'crm_goal_create',
  'crm_goal_status', 'crm_implantation_block_create', 'crm_implantation_block_resolve', 'crm_implantation_exception_authorize',
  'crm_implantation_exception_create', 'crm_implantation_exception_reject', 'crm_implantation_step_update', 'crm_implantation_update',
  'crm_import_commit', 'crm_import_create', 'crm_import_export', 'crm_inspection_answer',
  'crm_inspection_create', 'crm_interaction_attachment_download', 'crm_interaction_attachment_upload', 'crm_interaction_create',
  'crm_labor_budget_create', 'crm_labor_budget_item_create', 'crm_lead_convert', 'crm_library_approve',
  'crm_library_create', 'crm_library_reject', 'crm_library_update', 'crm_management_diary_create',
  'crm_management_diary_search', 'crm_management_diary_update', 'crm_notification_preference_update', 'crm_notification_template_approve',
  'crm_notification_template_create', 'crm_notification_template_reject', 'crm_notification_template_update', 'crm_opportunity_create',
  'crm_opportunity_stage_change', 'crm_opportunity_update', 'crm_partner_create', 'crm_partner_status',
  'crm_price_scenario_create', 'crm_price_scenario_status_aprovado', 'crm_price_scenario_update', 'crm_proposal_acceptance',
  'crm_proposal_acceptance_link_create', 'crm_proposal_accepted_via_secure_link', 'crm_proposal_comparison_create', 'crm_proposal_create',
  'crm_proposal_delivery_create', 'crm_proposal_delivery_sent', 'crm_proposal_delivery_status_aceito', 'crm_proposal_delivery_status_entregue_comprovada',
  'crm_proposal_delivery_status_enviado_pelo_provedor', 'crm_proposal_delivery_status_falhou', 'crm_proposal_delivery_status_fila', 'crm_proposal_delivery_status_leitura_comprovada',
  'crm_proposal_delivery_status_recusado', 'crm_proposal_item_create', 'crm_proposal_status_aceita', 'crm_proposal_status_enviada',
  'crm_proposal_update', 'crm_quality_evidence_create', 'crm_referral_create', 'crm_referral_status',
  'crm_renewal_create', 'crm_renewal_status', 'crm_report_view', 'crm_scope_revocation_create',
  'crm_service_measurement_approve', 'crm_service_measurement_create', 'crm_task_create', 'crm_task_status_aberta',
  'crm_task_status_cancelada', 'crm_task_status_concluida', 'crm_task_status_em_andamento', 'crm_task_update',
  'crm_technical_budget_create', 'crm_technical_budget_item_create', 'crm_visit_create', 'crm_visit_reschedule',
  'crm_visit_status_cancelada', 'crm_visit_status_confirmada', 'crm_visit_status_em_agendamento', 'crm_visit_status_realizada',
  'document_download', 'document_list', 'document_upload', 'email_change_alert',
  'email_change_cancel', 'email_change_confirm', 'email_change_request', 'email_confirm',
  'email_confirm_resend', 'emp_accessibility_pref_update', 'emp_faq_access', 'emp_faq_internal_create',
  'emp_faq_internal_update', 'emp_offline_conflict', 'emp_offline_conflict_resolve', 'emp_offline_queue_create',
  'emp_offline_queue_update', 'emp_pwa_config_create', 'emp_pwa_config_update', 'grant_contract_restrict',
  'grant_issue', 'grant_revoke', 'grant_unit_restrict', 'handover_accept',
  'handover_create', 'hr_advance_approve', 'hr_advance_pay', 'hr_advance_request',
  'hr_benefit_conference', 'hr_benefit_create', 'hr_benefit_export', 'hr_benefit_request',
  'hr_integration_error', 'hr_integration_export', 'hr_integration_receipt', 'hr_occupational_document',
  'hr_occupational_schedule', 'integration_check', 'integration_test', 'integration_update',
  'invite_accept', 'invite_issue', 'invite_rate_limited', 'invite_revoke',
  'lead_create', 'lead_responsible_assign', 'lead_status_change', 'lead_visit_cancel',
  'lead_visit_confirm', 'local_outbox_list', 'local_outbox_purge', 'local_outbox_read',
  'local_outbox_write', 'login', 'logout', 'mfa_activate',
  'mfa_challenge_issue', 'mfa_challenge_verify', 'mfa_disable', 'mfa_recovery_use',
  'mfa_verify', 'notification_dead', 'notification_enqueue', 'notification_failed',
  'notification_local_outbox', 'notification_preference_update', 'notification_retry', 'notification_send',
  'notification_template_approve', 'notification_template_create', 'notification_template_reject', 'notification_template_update',
  'ops_allocation_create', 'ops_assisted_proposal_create', 'ops_client_report_create', 'ops_coverage_request_create',
  'ops_handover_create', 'ops_job_role_create', 'ops_key_create', 'ops_key_movement',
  'ops_metrics_definition_create', 'ops_metrics_snapshot_create', 'ops_monitoring_event_create', 'ops_occurrence_create',
  'ops_patrol_create', 'ops_post_create', 'ops_schedule_ack', 'ops_schedule_version_update',
  'ops_supervision_action_plan_create', 'ops_supervision_inspection_create', 'ops_supervision_visit_create', 'password_reset_complete',
  'password_reset_request', 'permission_grant', 'permission_revoke', 'scale_create',
  'scale_update', 'session_revoke_all', 'staff_epoch_bump', 'staff_invite',
  'staff_legacy_token_login', 'staff_legacy_token_refused', 'staff_login', 'staff_login_denied',
  'staff_mfa_challenge_denied', 'staff_mfa_challenge_issue', 'staff_mfa_challenge_verify', 'staff_profile_missing',
  'staff_role_change', 'staff_session_expired', 'staff_session_revoke', 'ticket_list',
  'ticket_open', 'ticket_status', 'time_entry_end', 'time_entry_ronda',
  'time_entry_start'
));

-- CRM-09 — cadência de prospecção materializada como tarefas.
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS cadence_key VARCHAR(60);
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS cadence_step SMALLINT
  CHECK (cadence_step IS NULL OR (cadence_step BETWEEN 1 AND 50));

CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_cadence_opportunity_unique
  ON crm_tasks (opportunity_id, cadence_key, cadence_step)
  WHERE cadence_key IS NOT NULL AND opportunity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_cadence_company_unique
  ON crm_tasks (company_id, cadence_key, cadence_step)
  WHERE cadence_key IS NOT NULL AND opportunity_id IS NULL AND company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_tasks_due_status_idx ON crm_tasks (status, due_date);

-- CRM-07 — anexos de interação (ligação/reunião/nota) com integridade conferida.
CREATE TABLE IF NOT EXISTS crm_interaction_attachments (
  id UUID PRIMARY KEY,
  interaction_id UUID NOT NULL REFERENCES crm_interactions(id) ON DELETE CASCADE,
  display_name VARCHAR(200) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  content_type VARCHAR(120),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_key VARCHAR(48) NOT NULL UNIQUE CHECK (storage_key ~ '^[0-9a-f]{48}$'),
  uploaded_by_id UUID REFERENCES auth_identities(id),
  uploaded_by_role VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_interaction_attachments_interaction_idx
  ON crm_interaction_attachments (interaction_id, created_at DESC);

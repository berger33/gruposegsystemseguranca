-- L04 (fechamento das lacunas CRM-07..10) — engajamento comercial: tarefas,
-- histórico de interações com anexos, agenda de visitas, cadências de
-- prospecção e carteira. O schema base dessas entidades já existe desde a
-- migração 014 (crm_tasks, crm_interactions, crm_visits), mas três coisas
-- faltavam para que a operação real fosse possível e auditável:
--
--   1. A lista de ações válidas de auth_access_audit (ampliada pela migração
--      103) não contempla nenhuma ação de tarefa, interação, anexo, visita ou
--      cadência. Como toda chamada de auditoria vive dentro de try/catch, a
--      escrita principal passaria e a trilha seria descartada em silêncio —
--      exatamente o defeito que a 103 corrigiu para o restante do CRM.
--   2. crm_tasks não tem como registrar de qual cadência de prospecção e de
--      qual passo uma tarefa nasceu (CRM-09 exige cadência "inicialmente como
--      tarefas", com adesão idempotente).
--   3. Não havia onde guardar anexos do histórico de relacionamento (CRM-07
--      exige "anexos e notas internas autorizadas").
--
-- Nada aqui altera migração já aplicada: o CHECK é recriado como superconjunto
-- estrito do anterior (265 -> 281 valores) e as demais mudanças são aditivas.

ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue', 'invite_revoke', 'invite_accept', 'login', 'logout',
  'session_revoke_all', 'email_confirm', 'email_confirm_resend', 'password_reset_request', 'password_reset_complete',
  'account_create', 'account_status', 'grant_issue', 'grant_revoke', 'contract_create',
  'contract_status', 'contract_list', 'document_upload', 'document_download', 'document_list',
  'ticket_open', 'ticket_status', 'ticket_list', 'mfa_activate', 'mfa_verify',
  'mfa_disable', 'mfa_recovery_use', 'mfa_challenge_issue', 'mfa_challenge_verify', 'email_change_request',
  'email_change_confirm', 'email_change_cancel', 'email_change_alert', 'grant_contract_restrict', 'grant_unit_restrict',
  'staff_invite', 'staff_login', 'staff_role_change', 'staff_session_revoke', 'permission_grant',
  'permission_revoke', 'access_review', 'assignment_create', 'assignment_end', 'assignment_suspend',
  'scale_create', 'scale_update', 'time_entry_start', 'time_entry_end', 'time_entry_ronda',
  'handover_create', 'handover_accept', 'audit_query', 'audit_export', 'invite_rate_limited',
  'notification_enqueue', 'notification_send', 'notification_failed', 'notification_dead', 'notification_retry',
  'notification_preference_update', 'notification_template_create', 'notification_template_update', 'notification_template_approve', 'notification_template_reject',
  'integration_check', 'integration_test', 'integration_update', 'catalog_create', 'catalog_update',
  'catalog_publish', 'lead_create', 'lead_status_change', 'lead_responsible_assign', 'lead_visit_confirm',
  'lead_visit_cancel', 'staff_login_denied', 'staff_profile_missing', 'staff_mfa_challenge_issue', 'staff_mfa_challenge_verify',
  'staff_mfa_challenge_denied', 'staff_legacy_token_login', 'staff_legacy_token_refused', 'staff_session_expired', 'staff_epoch_bump',
  'local_outbox_write', 'local_outbox_read', 'local_outbox_list', 'local_outbox_purge', 'notification_local_outbox',
  'cli_contact_create', 'cli_contact_delegate', 'cli_contact_scope_create', 'cli_contract_item_create', 'cli_contract_scope_create',
  'cli_document_download', 'cli_document_version_create', 'cli_old_route_redirect', 'cli_vigencia_create', 'crm_campaign_create',
  'crm_campaign_status', 'crm_closure_conclude', 'crm_closure_create', 'crm_closure_step_update', 'crm_closure_update',
  'crm_commission_create', 'crm_commission_rule_create', 'crm_commission_rule_status', 'crm_commission_status', 'crm_company_create',
  'crm_company_update', 'crm_contact_create', 'crm_contract_activated', 'crm_contract_alert_create', 'crm_contract_alert_rule_create',
  'crm_contract_alert_rule_update', 'crm_contract_alert_status', 'crm_contract_amendment_approve', 'crm_contract_amendment_create', 'crm_contract_amendment_reject',
  'crm_contract_amendment_update', 'crm_contract_closed', 'crm_contract_create', 'crm_contract_document_upload', 'crm_contract_exclusion_create',
  'crm_contract_idempotent_hit', 'crm_contract_implantation_create', 'crm_contract_obligation_create', 'crm_contract_post_create', 'crm_contract_responsible_add',
  'crm_contract_responsible_remove', 'crm_contract_schedule_create', 'crm_contract_signed', 'crm_contract_sla_create', 'crm_contract_status_change',
  'crm_contract_suspended', 'crm_contract_unit_add', 'crm_contract_unit_remove', 'crm_cost_param_create', 'crm_cost_param_status_aprovado',
  'crm_cost_param_update', 'crm_discount_policy_create', 'crm_discount_policy_status_aprovado', 'crm_discount_policy_update', 'crm_discount_request_approval_denied',
  'crm_discount_request_create', 'crm_discount_request_self_approval_denied', 'crm_discount_request_status_aprovado', 'crm_discount_request_status_rejeitado', 'crm_discount_request_update',
  'crm_doc_obligation_approve', 'crm_doc_obligation_create', 'crm_doc_obligation_reject', 'crm_doc_obligation_submit', 'crm_doc_obligation_update',
  'crm_equipment_create', 'crm_fiscal_dossier_create', 'crm_fiscal_dossier_update', 'crm_goal_create', 'crm_goal_status',
  'crm_implantation_block_create', 'crm_implantation_block_resolve', 'crm_implantation_exception_authorize', 'crm_implantation_exception_create', 'crm_implantation_exception_reject',
  'crm_implantation_step_update', 'crm_implantation_update', 'crm_import_commit', 'crm_import_create', 'crm_import_export',
  'crm_inspection_answer', 'crm_inspection_create', 'crm_labor_budget_create', 'crm_labor_budget_item_create', 'crm_lead_convert',
  'crm_library_approve', 'crm_library_create', 'crm_library_reject', 'crm_library_update', 'crm_management_diary_create',
  'crm_management_diary_search', 'crm_management_diary_update', 'crm_notification_preference_update', 'crm_notification_template_approve', 'crm_notification_template_create',
  'crm_notification_template_reject', 'crm_notification_template_update', 'crm_opportunity_create', 'crm_opportunity_stage_change', 'crm_opportunity_update',
  'crm_partner_create', 'crm_partner_status', 'crm_price_scenario_create', 'crm_price_scenario_status_aprovado', 'crm_price_scenario_update',
  'crm_proposal_acceptance', 'crm_proposal_acceptance_link_create', 'crm_proposal_accepted_via_secure_link', 'crm_proposal_comparison_create', 'crm_proposal_create',
  'crm_proposal_delivery_create', 'crm_proposal_delivery_sent', 'crm_proposal_delivery_status_aceito', 'crm_proposal_delivery_status_entregue_comprovada', 'crm_proposal_delivery_status_enviado_pelo_provedor',
  'crm_proposal_delivery_status_falhou', 'crm_proposal_delivery_status_fila', 'crm_proposal_delivery_status_leitura_comprovada', 'crm_proposal_delivery_status_recusado', 'crm_proposal_item_create',
  'crm_proposal_status_aceita', 'crm_proposal_status_enviada', 'crm_proposal_update', 'crm_quality_evidence_create', 'crm_referral_create',
  'crm_referral_status', 'crm_renewal_create', 'crm_renewal_status', 'crm_report_view', 'crm_scope_revocation_create',
  'crm_service_measurement_approve', 'crm_service_measurement_create', 'crm_technical_budget_create', 'crm_technical_budget_item_create', 'emp_accessibility_pref_update',
  'emp_faq_access', 'emp_faq_internal_create', 'emp_faq_internal_update', 'emp_offline_conflict', 'emp_offline_conflict_resolve',
  'emp_offline_queue_create', 'emp_offline_queue_update', 'emp_pwa_config_create', 'emp_pwa_config_update', 'hr_advance_approve',
  'hr_advance_pay', 'hr_advance_request', 'hr_benefit_conference', 'hr_benefit_create', 'hr_benefit_export',
  'hr_benefit_request', 'hr_integration_error', 'hr_integration_export', 'hr_integration_receipt', 'hr_occupational_document',
  'hr_occupational_schedule', 'ops_allocation_create', 'ops_assisted_proposal_create', 'ops_client_report_create', 'ops_coverage_request_create',
  'ops_handover_create', 'ops_job_role_create', 'ops_key_create', 'ops_key_movement', 'ops_metrics_definition_create',
  'ops_metrics_snapshot_create', 'ops_monitoring_event_create', 'ops_occurrence_create', 'ops_patrol_create', 'ops_post_create',
  'ops_schedule_ack', 'ops_schedule_version_update', 'ops_supervision_action_plan_create', 'ops_supervision_inspection_create', 'ops_supervision_visit_create',
  'crm_task_create', 'crm_task_update', 'crm_task_status_aberta', 'crm_task_status_em_andamento', 'crm_task_status_concluida',
  'crm_task_status_cancelada', 'crm_interaction_create', 'crm_interaction_attachment_upload', 'crm_interaction_attachment_download', 'crm_visit_create',
  'crm_visit_status_em_agendamento', 'crm_visit_status_confirmada', 'crm_visit_status_realizada', 'crm_visit_status_cancelada', 'crm_visit_reschedule',
  'crm_cadence_enroll'
));

-- CRM-09 — cadência de prospecção materializada como tarefas reais. A adesão é
-- idempotente por alvo (oportunidade ou empresa) + cadência + passo, para que
-- reenviar a mesma adesão não gere fila duplicada de trabalho.
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS cadence_key VARCHAR(60);
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS cadence_step SMALLINT
  CHECK (cadence_step IS NULL OR (cadence_step >= 1 AND cadence_step <= 50));

CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_cadence_opportunity_uniq
  ON crm_tasks (opportunity_id, cadence_key, cadence_step)
  WHERE cadence_key IS NOT NULL AND opportunity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_cadence_company_uniq
  ON crm_tasks (company_id, cadence_key, cadence_step)
  WHERE cadence_key IS NOT NULL AND opportunity_id IS NULL AND company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_tasks_due_status_idx ON crm_tasks (due_date, status);
CREATE INDEX IF NOT EXISTS crm_tasks_responsible_idx ON crm_tasks (responsible_id, status);

-- CRM-07 — anexos do histórico de relacionamento. Mesma disciplina de bytes
-- privados já provada no L02 (documentos do cliente): a chave de storage é
-- gerada no servidor, o conteúdo fica fora do banco e o hash permite detectar
-- adulteração no download. Nenhum caminho vindo do cliente é aceito.
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

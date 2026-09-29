-- L04 — migração 102 já passou a aceitar 'comercial' e 'financeiro' como
-- papéis válidos de staff (auth_staff_profiles / auth_permissions /
-- auth_staff_sessions), mas a tabela crm_companies (migração 014, aplicada)
-- ainda restringe created_by a ('marcelo','ti','admin','rh','system').
-- Como resultado, uma identidade comercial real não conseguia converter um
-- lead em empresa — a conversão falhava com 503/violação de CHECK. Nunca
-- editamos uma migração já aplicada: este arquivo apenas amplia a mesma
-- restrição, preservando os valores antigos.
ALTER TABLE crm_companies DROP CONSTRAINT IF EXISTS crm_companies_created_by_check;
ALTER TABLE crm_companies ADD CONSTRAINT crm_companies_created_by_check
  CHECK (created_by IN ('marcelo','ti','admin','rh','comercial','financeiro','system') OR created_by IS NULL);

-- L04 — a segunda tabela restrita ao papel antigo é a auditoria de estado de
-- leads/visita (PUB-04): sem 'comercial'/'admin', a confirmação de visita por
-- um comercial falhava com violação de CHECK, não com 403 (efeito colateral:
-- a tela dava erro genérico em vez de negar corretamente quem não tem papel).
ALTER TABLE public_lead_status_audit DROP CONSTRAINT IF EXISTS public_lead_status_audit_changed_by_check;
ALTER TABLE public_lead_status_audit ADD CONSTRAINT public_lead_status_audit_changed_by_check
  CHECK (changed_by IN ('marcelo','ti','admin','rh','comercial','financeiro'));

-- L04 — auditoria "muda" desde muito antes desta entrega: a lista de ações
-- válidas de auth_access_audit nunca foi atualizada para as centenas de
-- chamadas `action: 'crm_...'/'cli_...'/'ops_...'/'hr_...'/'emp_...'` já
-- existentes no código (crm-api, proposal-api, discount-api, contract-api,
-- ops-*, hr-*, emp-*, cli-* etc.). Cada uma dessas chamadas está dentro de um
-- try/catch que absorve o erro, então a escrita principal nunca falhava, mas
-- a trilha de auditoria correspondente também nunca era gravada — silenciosa
-- para quem exercita a função, mas real. Isso viola diretamente o requisito
-- de trilha de auditoria honesta (L04 exige "estado final correto e trilha
-- de auditoria na interface"). Ampliar aqui é aditivo (só permite valores que
-- o próprio código já tenta gravar) e não muda nenhum comportamento validado
-- por outro gate.
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
  'staff_login_denied','staff_profile_missing','staff_mfa_challenge_issue',
  'staff_mfa_challenge_verify','staff_mfa_challenge_denied',
  'staff_legacy_token_login','staff_legacy_token_refused',
  'staff_session_expired','staff_epoch_bump',
  'local_outbox_write','local_outbox_read','local_outbox_list','local_outbox_purge',
  'notification_local_outbox',
  'cli_contact_create','cli_contact_delegate','cli_contact_scope_create','cli_contract_item_create','cli_contract_scope_create','cli_document_download',
  'cli_document_version_create','cli_old_route_redirect','cli_vigencia_create','crm_campaign_create','crm_campaign_status','crm_closure_conclude',
  'crm_closure_create','crm_closure_step_update','crm_closure_update','crm_commission_create','crm_commission_rule_create','crm_commission_rule_status',
  'crm_commission_status','crm_company_create','crm_company_update','crm_contact_create','crm_contract_activated','crm_contract_alert_create',
  'crm_contract_alert_rule_create','crm_contract_alert_rule_update','crm_contract_alert_status','crm_contract_amendment_approve','crm_contract_amendment_create','crm_contract_amendment_reject',
  'crm_contract_amendment_update','crm_contract_closed','crm_contract_create','crm_contract_document_upload','crm_contract_exclusion_create','crm_contract_idempotent_hit',
  'crm_contract_implantation_create','crm_contract_obligation_create','crm_contract_post_create','crm_contract_responsible_add','crm_contract_responsible_remove','crm_contract_schedule_create',
  'crm_contract_signed','crm_contract_sla_create','crm_contract_status_change','crm_contract_suspended','crm_contract_unit_add','crm_contract_unit_remove',
  'crm_cost_param_create','crm_cost_param_status_aprovado','crm_cost_param_update','crm_discount_policy_create','crm_discount_policy_status_aprovado','crm_discount_policy_update',
  'crm_discount_request_approval_denied','crm_discount_request_create','crm_discount_request_self_approval_denied','crm_discount_request_status_aprovado','crm_discount_request_status_rejeitado','crm_discount_request_update',
  'crm_doc_obligation_approve','crm_doc_obligation_create','crm_doc_obligation_reject','crm_doc_obligation_submit','crm_doc_obligation_update','crm_equipment_create',
  'crm_fiscal_dossier_create','crm_fiscal_dossier_update','crm_goal_create','crm_goal_status','crm_implantation_block_create','crm_implantation_block_resolve',
  'crm_implantation_exception_authorize','crm_implantation_exception_create','crm_implantation_exception_reject','crm_implantation_step_update','crm_implantation_update','crm_import_commit',
  'crm_import_create','crm_import_export','crm_inspection_answer','crm_inspection_create','crm_labor_budget_create','crm_labor_budget_item_create',
  'crm_lead_convert','crm_library_approve','crm_library_create','crm_library_reject','crm_library_update','crm_management_diary_create',
  'crm_management_diary_search','crm_management_diary_update','crm_notification_preference_update','crm_notification_template_approve','crm_notification_template_create','crm_notification_template_reject',
  'crm_notification_template_update','crm_opportunity_create','crm_opportunity_stage_change','crm_opportunity_update','crm_partner_create','crm_partner_status',
  'crm_price_scenario_create','crm_price_scenario_status_aprovado','crm_price_scenario_update','crm_proposal_acceptance','crm_proposal_acceptance_link_create','crm_proposal_accepted_via_secure_link',
  'crm_proposal_comparison_create','crm_proposal_create','crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status_aceito','crm_proposal_delivery_status_entregue_comprovada',
  'crm_proposal_delivery_status_enviado_pelo_provedor','crm_proposal_delivery_status_falhou','crm_proposal_delivery_status_fila','crm_proposal_delivery_status_leitura_comprovada','crm_proposal_delivery_status_recusado','crm_proposal_item_create',
  'crm_proposal_status_aceita','crm_proposal_status_enviada','crm_proposal_update','crm_quality_evidence_create','crm_referral_create','crm_referral_status',
  'crm_renewal_create','crm_renewal_status','crm_report_view','crm_scope_revocation_create','crm_service_measurement_approve','crm_service_measurement_create',
  'crm_technical_budget_create','crm_technical_budget_item_create','emp_accessibility_pref_update','emp_faq_access','emp_faq_internal_create','emp_faq_internal_update',
  'emp_offline_conflict','emp_offline_conflict_resolve','emp_offline_queue_create','emp_offline_queue_update','emp_pwa_config_create','emp_pwa_config_update',
  'hr_advance_approve','hr_advance_pay','hr_advance_request','hr_benefit_conference','hr_benefit_create','hr_benefit_export',
  'hr_benefit_request','hr_integration_error','hr_integration_export','hr_integration_receipt','hr_occupational_document','hr_occupational_schedule',
  'ops_allocation_create','ops_assisted_proposal_create','ops_client_report_create','ops_coverage_request_create','ops_handover_create','ops_job_role_create',
  'ops_key_create','ops_key_movement','ops_metrics_definition_create','ops_metrics_snapshot_create','ops_monitoring_event_create','ops_occurrence_create',
  'ops_patrol_create','ops_post_create','ops_schedule_ack','ops_schedule_version_update','ops_supervision_action_plan_create','ops_supervision_inspection_create',
  'ops_supervision_visit_create'));

-- L04 — mesmo problema em outra coluna: o código comercial (crm-api,
-- inspection-api, labor/technical-budget-api, price-scenario-api,
-- discount-api, proposal-api etc.) grava `actor_kind = session.role` na
-- auditoria (mesmo padrão já usado por HR/CRM antes desta entrega), mas o
-- CHECK de actor_kind (migração 006) só aceitava
-- ('client','staff','system','marcelo','ti','admin') — sem 'rh', 'comercial',
-- 'financeiro' ou 'supervisor', papéis de staff já válidos desde a migração
-- 102. Resultado: toda auditoria de uma ação comercial também era descartada
-- silenciosamente. Ampliar para os mesmos papéis de auth_staff_profiles.
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_actor_kind_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_actor_kind_check
  CHECK (actor_kind IN ('client','staff','system','marcelo','ti','admin','rh','comercial','financeiro','supervisor'));

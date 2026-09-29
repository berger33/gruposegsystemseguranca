-- 047-plt09-privacy: PLT-09 política privacidade completa inventário dados finalidades bases destinatários prazos contatos direitos revisão competente antes publicar
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_privacy_data_category') THEN
    CREATE TYPE crm_privacy_data_category AS ENUM ('identificacao','contato','localizacao','profissional','financeiro','tecnico','comportamental','sensivel','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_privacy_legal_basis') THEN
    CREATE TYPE crm_privacy_legal_basis AS ENUM ('consentimento','execucao_contrato','cumprimento_legal','legitimo_interesse','protecao_vida','tutela_saude','exercicio_direitos','protecao_credito','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_privacy_policy_status') THEN
    CREATE TYPE crm_privacy_policy_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS privacy_data_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_category crm_privacy_data_category NOT NULL,
  data_field TEXT NOT NULL CHECK (char_length(data_field) BETWEEN 1 AND 100),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  purpose TEXT NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 1000),
  legal_basis crm_privacy_legal_basis NOT NULL,
  legal_basis_detail TEXT CHECK (legal_basis_detail IS NULL OR char_length(legal_basis_detail) BETWEEN 1 AND 1000),
  retention_days INT CHECK (retention_days IS NULL OR (retention_days >= 1 AND retention_days <= 3650)),
  retention_description TEXT CHECK (retention_description IS NULL OR char_length(retention_description) BETWEEN 1 AND 1000),
  recipients TEXT[] CHECK (recipients IS NULL OR array_length(recipients,1) <= 20),
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_required BOOLEAN NOT NULL DEFAULT false,
  source TEXT CHECK (source IS NULL OR char_length(source) BETWEEN 1 AND 200),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(data_category, data_field)
);

CREATE INDEX IF NOT EXISTS privacy_inventory_category_idx ON privacy_data_inventory(data_category, is_sensitive);
CREATE INDEX IF NOT EXISTS privacy_inventory_basis_idx ON privacy_data_inventory(legal_basis);

DROP TRIGGER IF EXISTS trg_privacy_inventory_updated_at ON privacy_data_inventory;
CREATE TRIGGER trg_privacy_inventory_updated_at BEFORE UPDATE ON privacy_data_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS privacy_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL CHECK (version >= 1),
  status crm_privacy_policy_status NOT NULL DEFAULT 'rascunho',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  inventory_snapshot JSONB,
  contact_email TEXT CHECK (contact_email IS NULL OR char_length(contact_email) BETWEEN 5 AND 320),
  dpo_name TEXT CHECK (dpo_name IS NULL OR char_length(dpo_name) BETWEEN 1 AND 200),
  dpo_contact TEXT CHECK (dpo_contact IS NULL OR char_length(dpo_contact) BETWEEN 1 AND 500),
  retention_summary TEXT CHECK (retention_summary IS NULL OR char_length(retention_summary) BETWEEN 1 AND 2000),
  rights_description TEXT CHECK (rights_description IS NULL OR char_length(rights_description) BETWEEN 1 AND 2000),
  recipients_description TEXT CHECK (recipients_description IS NULL OR char_length(recipients_description) BETWEEN 1 AND 2000),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  approved_by TEXT CHECK (approved_by IS NULL OR char_length(approved_by) BETWEEN 1 AND 80),
  approved_by_id UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 1 AND 1000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version)
);

CREATE INDEX IF NOT EXISTS privacy_policies_status_idx ON privacy_policies(status, version DESC);
CREATE INDEX IF NOT EXISTS privacy_policies_published_idx ON privacy_policies(is_published, published_at DESC) WHERE is_published = true;

DROP TRIGGER IF EXISTS trg_privacy_policies_updated_at ON privacy_policies;
CREATE TRIGGER trg_privacy_policies_updated_at BEFORE UPDATE ON privacy_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO privacy_data_inventory (data_category, data_field, description, purpose, legal_basis, legal_basis_detail, retention_days, retention_description, recipients, is_sensitive, is_required, source, created_by) VALUES
  ('identificacao','nome','Nome completo do solicitante','Identificação para atendimento orçamento/visita e contato comercial','consentimento','Consentimento explícito no formulário orçamento/simulador/contato','365','Até conversão/descarte + 12 meses auditoria','{"equipe_comercial","ti"}',false,true,'formulario_site','system'),
  ('contato','telefone','Telefone/WhatsApp','Contato para agendamento visita e envio proposta','consentimento','Consentimento + execução contrato quando convertido','365','Até conversão + 12 meses','{"equipe_comercial","ti"}',false,true,'formulario_site','system'),
  ('contato','email','E-mail opcional','Envio proposta, notificações e acesso portal cliente','consentimento','Consentimento opcional','365','Até revogação consentimento','{"equipe_comercial","ti","sistema_email"}',false,false,'formulario_site','system'),
  ('localizacao','cidade','Cidade/bairro do imóvel','Dimensionamento serviço, logística equipe, cobertura','legitimo_interesse','Legítimo interesse comercial + execução contrato','365','Até conversão','{"equipe_comercial","operacional"}',false,true,'formulario_site','system'),
  ('profissional','cargo_funcao','Função no processo compra decisor/influenciador/usuario/financeiro','Qualificação oportunidade e abordagem adequada','legitimo_interesse','Legítimo interesse sem coleta indiscriminada','365','Até conversão','{"equipe_comercial"}',false,false,'crm_contacts','system'),
  ('tecnico','servicos_interesse','Serviços interesse vigilância/portaria/limpeza/monitoramento','Oferta adequada catálogo 6 serviços validados','consentimento','Consentimento + execução contrato','365','Até conversão','{"equipe_comercial","tecnico"}',false,true,'formulario_site','system'),
  ('comportamental','origem_campanha','Origem/campanha/canal/dedup_key','Mensuração origem conversão minimização dados','legitimo_interesse','Legítimo interesse medição conversão','365','12 meses','{"marketing","ti"}',false,false,'formulario_site','system'),
  ('sensivel','cftv_imagem','Imagem CFTV quando contrato inclui monitoramento','Segurança patrimonial, dado sensível opcional','execucao_contrato','Execução contrato + legítimo interesse segurança','30','30 dias salvo incidente, a definir com RH/encarregado','{"operacional","seguranca"}',true,false,'contrato_cftv','system'),
  ('sensivel','geolocalizacao','Geolocalização ronda/equipe quando aplicável','Controle operacional postos','execucao_contrato','Execução contrato','90','90 dias','{"operacional","ti"}',true,false,'app_ronda','system'),
  ('identificacao','documento_fiscal','CNPJ/CPF quando necessário para contrato','Emissão contrato e nota fiscal','cumprimento_legal','Cumprimento legal fiscal','1825','5 anos fiscal','{"financeiro","ti"}',false,false,'crm_companies','system')
ON CONFLICT (data_category, data_field) DO NOTHING;

INSERT INTO privacy_policies (version, status, title, content, contact_email, dpo_name, dpo_contact, retention_summary, rights_description, recipients_description, is_published, created_by) VALUES
  (1, 'rascunho', 'Política de Privacidade — Grupo SEG System Segurança — Minuta Técnica',
   'Minuta técnica pendente de aprovação formal. Esta política descreve tratamento de dados pessoais conforme LGPD para site institucional, orçamento, simulador, CRM, contratos, implantação, fiscalização e portal cliente. Nenhuma declaração definitiva até aprovação do responsável/Marcelo. Site com noindex até publicação oficial.',
   'contato@gruposegsystemseguranca.com.br', 'Encarregado a definir (D-11)', 'contato@gruposegsystemseguranca.com.br (pendente confirmação)', 'Auditoria 12 meses, leads até conversão/descarte, CFTV 30 dias salvo incidente, geo 90 dias, documentos fiscais 5 anos, backups 90/365 dias criptografados', 'Direitos titular: confirmação, acesso, correção, anonimização, eliminação, portabilidade, revogação consentimento, oposição, revisão decisão automatizada. Canal contato@gruposegsystemseguranca.com.br. Prazo resposta até 15 dias.',
   'Destinatários: equipe comercial, operacional, TI, financeiro, segurança, marketing, provedores e-mail/storage (quando configurados), sem compartilhamento indiscriminado. RBAC granular PLT-01, sessão HttpOnly Secure, auditoria durável.', false, 'system')
ON CONFLICT (version) DO NOTHING;

-- Auditoria PLT-09
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
  'observability_query','observability_alert_ack','observability_alert_resolve',
  'healthcheck_query','healthcheck_ready','healthcheck_live',
  'backup_create','backup_status','backup_restore_test','backup_restore','backup_retention_update','backup_delete',
  'privacy_inventory_create','privacy_inventory_update','privacy_policy_create','privacy_policy_update','privacy_policy_approve','privacy_policy_publish','privacy_policy_reject',
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

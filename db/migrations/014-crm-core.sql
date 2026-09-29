-- CRM-01..CRM-10: cadastro central de empresas e contatos, oportunidades, funil, kanban, agenda, cadências, carteira
-- F3: CRM completo por sublotes

-- CRM-01: cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distinguir prospect/cliente/parceiro sem duplicar entidade.

CREATE TABLE IF NOT EXISTS crm_companies (
  id UUID PRIMARY KEY,
  display_name VARCHAR(200) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  document_ref VARCHAR(32),
  document_type TEXT CHECK (document_type IN ('cnpj','cpf','other') OR document_type IS NULL),
  segment TEXT CHECK (segment IS NULL OR char_length(segment) <= 100),
  city VARCHAR(100),
  state VARCHAR(2),
  type TEXT NOT NULL DEFAULT 'prospect' CHECK (type IN ('prospect','client','partner')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name VARCHAR(120),
  parent_company_id UUID REFERENCES crm_companies(id),
  notes VARCHAR(1000),
  origin TEXT CHECK (origin IS NULL OR char_length(origin) <= 100),
  campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) <= 100),
  created_by TEXT CHECK (created_by IN ('marcelo','ti','admin','rh','system') OR created_by IS NULL),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_document_unique ON crm_companies (document_ref) WHERE document_ref IS NOT NULL AND document_ref <> '';
CREATE INDEX IF NOT EXISTS crm_companies_type_status_idx ON crm_companies (type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_companies_city_idx ON crm_companies (city, state);
CREATE INDEX IF NOT EXISTS crm_companies_responsible_idx ON crm_companies (responsible_id);
CREATE INDEX IF NOT EXISTS crm_companies_parent_idx ON crm_companies (parent_company_id);

-- Unidades atendidas (CRM-01 unidades)
CREATE TABLE IF NOT EXISTS crm_company_units (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  display_name VARCHAR(200) NOT NULL,
  city VARCHAR(100),
  address VARCHAR(300),
  is_main BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_units_company_idx ON crm_company_units (company_id, created_at);

-- CRM-02: contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem legítima, sem coleta indiscriminada.

CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  display_name VARCHAR(200) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  email VARCHAR(254),
  phone VARCHAR(30),
  role TEXT CHECK (role IN ('decisor','influenciador','usuario','financeiro','outro') OR role IS NULL),
  buying_role TEXT CHECK (buying_role IN ('decisor','influenciador','usuario','financeiro','outro') OR buying_role IS NULL),
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  restrictions TEXT CHECK (restrictions IS NULL OR char_length(restrictions) <= 500),
  origin TEXT CHECK (origin IS NULL OR char_length(origin) <= 100),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_contacts_company_idx ON crm_contacts (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_contacts_email_idx ON crm_contacts (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_company_email_unique ON crm_contacts (company_id, email) WHERE email IS NOT NULL AND email <> '';

-- CRM-05: oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda.

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  service_id TEXT REFERENCES service_catalog(id),
  service_name VARCHAR(100),
  need_description TEXT CHECK (need_description IS NULL OR char_length(need_description) <= 2000),
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name VARCHAR(120),
  forecast_date DATE,
  estimated_value NUMERIC(12,2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  next_action VARCHAR(200),
  next_action_date TIMESTAMPTZ,
  origin TEXT CHECK (origin IS NULL OR char_length(origin) <= 100),
  campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) <= 100),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta','critica')),
  loss_reason TEXT CHECK (loss_reason IS NULL OR char_length(loss_reason) <= 500),
  public_lead_id UUID REFERENCES public_leads(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_opps_company_idx ON crm_opportunities (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_opps_responsible_idx ON crm_opportunities (responsible_id, next_action_date);
CREATE INDEX IF NOT EXISTS crm_opps_forecast_idx ON crm_opportunities (forecast_date);
CREATE INDEX IF NOT EXISTS crm_opps_next_action_idx ON crm_opportunities (next_action_date) WHERE next_action_date IS NOT NULL;

-- CRM-06: funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para perda; reabertura auditada. Não tratar “ganho” como dinheiro recebido.

CREATE TABLE IF NOT EXISTS crm_opportunity_stages (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  previous_stage TEXT,
  next_stage TEXT NOT NULL CHECK (next_stage IN ('novo','qualificacao','vistoria','proposta_elaboracao','proposta_enviada','negociacao','ganho','perdido')),
  changed_by_id UUID REFERENCES auth_identities(id),
  changed_by_role TEXT,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_stage_opp_idx ON crm_opportunity_stages (opportunity_id, created_at DESC);

-- Adicionar stage atual na oportunidade
ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'novo' CHECK (stage IN ('novo','qualificacao','vistoria','proposta_elaboracao','proposta_enviada','negociacao','ganho','perdido')),
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_won BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_lost BOOLEAN NOT NULL DEFAULT false;

-- CRM-07: kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas.

CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  responsible_id UUID REFERENCES auth_identities(id),
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta','critica')),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_tasks_opp_idx ON crm_tasks (opportunity_id, status, due_date);
CREATE INDEX IF NOT EXISTS crm_tasks_due_idx ON crm_tasks (due_date) WHERE status IN ('aberta','em_andamento');
CREATE INDEX IF NOT EXISTS crm_tasks_responsible_idx ON crm_tasks (responsible_id, due_date);

CREATE TABLE IF NOT EXISTS crm_interactions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('ligacao','reuniao','email','whatsapp','visita','nota','outro')),
  title VARCHAR(200) NOT NULL,
  details TEXT CHECK (details IS NULL OR char_length(details) <= 5000),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_interactions_company_idx ON crm_interactions (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_interactions_opp_idx ON crm_interactions (opportunity_id, occurred_at DESC);

-- CRM-08: agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento.

CREATE TABLE IF NOT EXISTS crm_visits (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  responsible_id UUID REFERENCES auth_identities(id),
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 480),
  status TEXT NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','em_agendamento','confirmada','realizada','cancelada')),
  public_lead_id UUID REFERENCES public_leads(id) ON DELETE SET NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_visits_company_idx ON crm_visits (company_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS crm_visits_responsible_idx ON crm_visits (responsible_id, scheduled_at);
CREATE INDEX IF NOT EXISTS crm_visits_status_idx ON crm_visits (status, scheduled_at);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION crm_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_companies_updated_at_trg ON crm_companies;
CREATE TRIGGER crm_companies_updated_at_trg BEFORE UPDATE ON crm_companies FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_contacts_updated_at_trg ON crm_contacts;
CREATE TRIGGER crm_contacts_updated_at_trg BEFORE UPDATE ON crm_contacts FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_opportunities_updated_at_trg ON crm_opportunities;
CREATE TRIGGER crm_opportunities_updated_at_trg BEFORE UPDATE ON crm_opportunities FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_tasks_updated_at_trg ON crm_tasks;
CREATE TRIGGER crm_tasks_updated_at_trg BEFORE UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS crm_visits_updated_at_trg ON crm_visits;
CREATE TRIGGER crm_visits_updated_at_trg BEFORE UPDATE ON crm_visits FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Auditoria CRM
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
  'crm_company_create','crm_company_update','crm_company_status',
  'crm_contact_create','crm_contact_update',
  'crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change',
  'crm_task_create','crm_task_update','crm_task_status',
  'crm_interaction_create',
  'crm_visit_create','crm_visit_update','crm_visit_status','crm_visit_confirm','crm_visit_cancel',
  'crm_lead_convert'
));

-- CLI-09/10/11/12/13/14 cobranças oportunidade satisfação renovação modos segurança
-- CLI-09 cobranças/documentos fiscais/comprovantes somente quando financeiro integrado dados própria conta
-- CLI-10 solicitação serviço adicional gera oportunidade CRM origem responsável
-- CLI-11 satisfação pós-atendimento periódica plano ação risco renovação baseado em fatos
-- CLI-12 renovação comunicação contratual registro sem bloquear indiscriminadamente portal por inadimplência
-- CLI-13 modos convite solicitação com aprovação autocadastro configuráveis vínculo verificado servidor todos autocadastro nunca libera contratos sozinho
-- CLI-14 segurança conta MFA opcional gestão sessões troca e-mail concluída fluxos ligados backend real

DO $$ BEGIN CREATE TYPE cli_charge_type AS ENUM ('mensalidade','taxa_extra','multa','desconto','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_charge_status AS ENUM ('pendente','pago','vencido','cancelado','em_disputa'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_service_request_status AS ENUM ('solicitada','em_analise','aprovada','rejeitada','convertida_crm','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_satisfaction_type AS ENUM ('pos_atendimento','periodica','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_satisfaction_status AS ENUM ('pendente','respondida','em_acao','concluida'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_renewal_risk AS ENUM ('baixo','medio','alto'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_renewal_comm_type AS ENUM ('aviso_vencimento','proposta_renovacao','reajuste','encerramento','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_portal_mode AS ENUM ('convite','solicitacao_aprovacao','autocadastro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_security_event_type AS ENUM ('mfa_enabled','mfa_disabled','session_revoked','email_change_requested','email_changed','login','logout'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_email_change_status AS ENUM ('pendente','confirmado','cancelado','expirado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CLI-09 cobranças
CREATE TABLE IF NOT EXISTS cli_charges_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^CHG-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  charge_type cli_charge_type NOT NULL DEFAULT 'mensalidade',
  status cli_charge_status NOT NULL DEFAULT 'pendente',
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  competence_date DATE,
  is_fiscal BOOLEAN NOT NULL DEFAULT false,
  fiscal_document_url TEXT CHECK (fiscal_document_url IS NULL OR char_length(fiscal_document_url) BETWEEN 5 AND 1000),
  fiscal_document_storage_key TEXT UNIQUE CHECK (fiscal_document_storage_key IS NULL OR char_length(fiscal_document_storage_key) BETWEEN 5 AND 500),
  comprovante_url TEXT CHECK (comprovante_url IS NULL OR char_length(comprovante_url) BETWEEN 5 AND 1000),
  comprovante_storage_key TEXT UNIQUE CHECK (comprovante_storage_key IS NULL OR char_length(comprovante_storage_key) BETWEEN 5 AND 500),
  finance_integration_id UUID,
  finance_integration_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fiscal_requires_finance CHECK ((is_fiscal = false) OR (is_fiscal = true AND finance_integration_active = true)),
  CONSTRAINT chk_comprovante_requires_paid CHECK ((comprovante_url IS NULL) OR (status = 'pago'))
);
CREATE INDEX IF NOT EXISTS cli_charges_v2_account_idx ON cli_charges_v2(client_account_id, due_date DESC);
CREATE INDEX IF NOT EXISTS cli_charges_v2_protocol_idx ON cli_charges_v2(protocol);
CREATE INDEX IF NOT EXISTS cli_charges_v2_finance_active_idx ON cli_charges_v2(finance_integration_active) WHERE finance_integration_active=true;

-- CLI-10 solicitação serviço adicional gera oportunidade CRM
CREATE TABLE IF NOT EXISTS cli_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^SRV-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status cli_service_request_status NOT NULL DEFAULT 'solicitada',
  origin TEXT NOT NULL DEFAULT 'portal_cliente' CHECK (origin IN ('portal_cliente','telefone','email','visita','outro')),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  crm_opportunity_id UUID,
  crm_lead_id UUID,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_service_requests_account_idx ON cli_service_requests(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_service_requests_protocol_idx ON cli_service_requests(protocol);
CREATE INDEX IF NOT EXISTS cli_service_requests_crm_idx ON cli_service_requests(crm_opportunity_id) WHERE crm_opportunity_id IS NOT NULL;

-- CLI-11 satisfação pós-atendimento periódica plano ação risco renovação baseado em fatos
CREATE TABLE IF NOT EXISTS cli_satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^SAT-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES cli_tickets_v2(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES cli_visits(id) ON DELETE SET NULL,
  survey_type cli_satisfaction_type NOT NULL DEFAULT 'pos_atendimento',
  status cli_satisfaction_status NOT NULL DEFAULT 'pendente',
  score INT CHECK (score IS NULL OR (score BETWEEN 0 AND 10)),
  feedback TEXT CHECK (feedback IS NULL OR char_length(feedback) BETWEEN 10 AND 2000),
  action_plan TEXT CHECK (action_plan IS NULL OR char_length(action_plan) BETWEEN 10 AND 2000),
  renewal_risk cli_renewal_risk,
  renewal_risk_reason TEXT CHECK (renewal_risk_reason IS NULL OR char_length(renewal_risk_reason) BETWEEN 10 AND 1000),
  facts_json JSONB,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT chk_renewal_risk_requires_facts CHECK ((renewal_risk IS NULL) OR (facts_json IS NOT NULL AND renewal_risk_reason IS NOT NULL)),
  CONSTRAINT chk_score_requires_feedback CHECK ((score IS NULL) OR (feedback IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cli_satisfaction_surveys_account_idx ON cli_satisfaction_surveys(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_satisfaction_surveys_protocol_idx ON cli_satisfaction_surveys(protocol);

CREATE TABLE IF NOT EXISTS cli_satisfaction_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES cli_satisfaction_surveys(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 10 AND 1000),
  responsible_name TEXT NOT NULL CHECK (char_length(responsible_name) BETWEEN 2 AND 200),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cli_satisfaction_action_plans_survey_idx ON cli_satisfaction_action_plans(survey_id);

-- CLI-12 renovação comunicação contratual registro sem bloquear indiscriminadamente portal por inadimplência
CREATE TABLE IF NOT EXISTS cli_renewal_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^REN-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  comm_type cli_renewal_comm_type NOT NULL DEFAULT 'aviso_vencimento',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 20 AND 5000),
  sent_at TIMESTAMPTZ,
  is_blocking BOOLEAN NOT NULL DEFAULT false CHECK (is_blocking = false OR comm_type = 'encerramento'),
  block_reason TEXT CHECK (block_reason IS NULL OR char_length(block_reason) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_blocking_requires_reason CHECK ((is_blocking = false AND block_reason IS NULL) OR (is_blocking = true AND block_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cli_renewal_communications_account_idx ON cli_renewal_communications(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_renewal_communications_protocol_idx ON cli_renewal_communications(protocol);

-- CLI-13 modos convite solicitação com aprovação autocadastro configuráveis vínculo verificado servidor todos autocadastro nunca libera contratos sozinho
CREATE TABLE IF NOT EXISTS cli_portal_mode_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode cli_portal_mode NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  auto_release_contracts BOOLEAN NOT NULL DEFAULT false,
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_autocadastro_never_releases_contracts CHECK ((mode != 'autocadastro') OR (auto_release_contracts = false))
);
INSERT INTO cli_portal_mode_configs (mode, is_active, requires_approval, auto_release_contracts, description) VALUES
  ('convite', true, false, false, 'Acesso apenas via convite verificado servidor'),
  ('solicitacao_aprovacao', true, true, false, 'Solicitação com aprovação vínculo verificado servidor'),
  ('autocadastro', false, true, false, 'Autocadastro configurável vínculo verificado servidor autocadastro nunca libera contratos sozinho')
ON CONFLICT (mode) DO NOTHING;

CREATE TABLE IF NOT EXISTS cli_portal_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^ACC-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  mode cli_portal_mode NOT NULL,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  requested_email TEXT NOT NULL CHECK (char_length(requested_email) BETWEEN 5 AND 200),
  requested_name TEXT NOT NULL CHECK (char_length(requested_name) BETWEEN 2 AND 200),
  document_ref TEXT CHECK (document_ref IS NULL OR char_length(document_ref) BETWEEN 5 AND 32),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada','cancelada')),
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 10 AND 1000),
  verified_link BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_approved_requires_verification CHECK ((status != 'aprovada') OR (verified_link = true))
);
CREATE INDEX IF NOT EXISTS cli_portal_access_requests_email_idx ON cli_portal_access_requests(requested_email);
CREATE INDEX IF NOT EXISTS cli_portal_access_requests_protocol_idx ON cli_portal_access_requests(protocol);

-- CLI-14 segurança conta MFA opcional gestão sessões troca e-mail concluída fluxos ligados backend real
CREATE TABLE IF NOT EXISTS cli_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  event_type cli_security_event_type NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_security_events_account_idx ON cli_security_events(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_security_events_identity_idx ON cli_security_events(identity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cli_email_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^EML-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  old_email TEXT NOT NULL CHECK (char_length(old_email) BETWEEN 5 AND 200),
  new_email TEXT NOT NULL CHECK (char_length(new_email) BETWEEN 5 AND 200),
  status cli_email_change_status NOT NULL DEFAULT 'pendente',
  token TEXT NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 10 AND 200),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_new_email_different CHECK (old_email != new_email),
  CONSTRAINT chk_confirmed_requires_token CHECK ((status != 'confirmado') OR (confirmed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cli_email_change_requests_account_idx ON cli_email_change_requests(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_email_change_requests_token_idx ON cli_email_change_requests(token);

CREATE TABLE IF NOT EXISTS cli_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  session_token_hash TEXT NOT NULL CHECK (char_length(session_token_hash) BETWEEN 10 AND 500),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT CHECK (revoked_reason IS NULL OR char_length(revoked_reason) BETWEEN 10 AND 500),
  is_active BOOLEAN GENERATED ALWAYS AS (revoked_at IS NULL) STORED
);
CREATE INDEX IF NOT EXISTS cli_sessions_identity_idx ON cli_sessions(identity_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS cli_sessions_account_idx ON cli_sessions(client_account_id);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_cli_charges_v2_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_charges_v2_updated_at ON cli_charges_v2;
CREATE TRIGGER trg_cli_charges_v2_updated_at BEFORE UPDATE ON cli_charges_v2 FOR EACH ROW EXECUTE FUNCTION update_cli_charges_v2_updated_at();

CREATE OR REPLACE FUNCTION update_cli_service_requests_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_service_requests_updated_at ON cli_service_requests;
CREATE TRIGGER trg_cli_service_requests_updated_at BEFORE UPDATE ON cli_service_requests FOR EACH ROW EXECUTE FUNCTION update_cli_service_requests_updated_at();

CREATE OR REPLACE FUNCTION update_cli_satisfaction_surveys_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_satisfaction_surveys_updated_at ON cli_satisfaction_surveys;
CREATE TRIGGER trg_cli_satisfaction_surveys_updated_at BEFORE UPDATE ON cli_satisfaction_surveys FOR EACH ROW EXECUTE FUNCTION update_cli_satisfaction_surveys_updated_at();

CREATE OR REPLACE FUNCTION update_cli_satisfaction_action_plans_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_satisfaction_action_plans_updated_at ON cli_satisfaction_action_plans;
CREATE TRIGGER trg_cli_satisfaction_action_plans_updated_at BEFORE UPDATE ON cli_satisfaction_action_plans FOR EACH ROW EXECUTE FUNCTION update_cli_satisfaction_action_plans_updated_at();

CREATE OR REPLACE FUNCTION update_cli_renewal_communications_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_renewal_communications_updated_at ON cli_renewal_communications;
CREATE TRIGGER trg_cli_renewal_communications_updated_at BEFORE UPDATE ON cli_renewal_communications FOR EACH ROW EXECUTE FUNCTION update_cli_renewal_communications_updated_at();

CREATE OR REPLACE FUNCTION update_cli_portal_mode_configs_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_portal_mode_configs_updated_at ON cli_portal_mode_configs;
CREATE TRIGGER trg_cli_portal_mode_configs_updated_at BEFORE UPDATE ON cli_portal_mode_configs FOR EACH ROW EXECUTE FUNCTION update_cli_portal_mode_configs_updated_at();

CREATE OR REPLACE FUNCTION update_cli_portal_access_requests_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_portal_access_requests_updated_at ON cli_portal_access_requests;
CREATE TRIGGER trg_cli_portal_access_requests_updated_at BEFORE UPDATE ON cli_portal_access_requests FOR EACH ROW EXECUTE FUNCTION update_cli_portal_access_requests_updated_at();

CREATE OR REPLACE FUNCTION update_cli_email_change_requests_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_email_change_requests_updated_at ON cli_email_change_requests;
CREATE TRIGGER trg_cli_email_change_requests_updated_at BEFORE UPDATE ON cli_email_change_requests FOR EACH ROW EXECUTE FUNCTION update_cli_email_change_requests_updated_at();

-- O catálogo audit_log é separado de auth_access_audit; CHECK de formato
-- em 075 aceita novas ações versionadas sem rejeitar eventos históricos.

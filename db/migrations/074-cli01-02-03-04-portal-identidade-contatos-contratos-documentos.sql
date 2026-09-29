-- 074-cli01-02-03-04-portal-identidade-contatos-contratos-documentos
-- CLI-01 identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identificadas/redirecionadas com cuidado.
-- CLI-02 múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo cliente apenas se autorizada, sem ampliação fora do próprio escopo.
-- CLI-03 contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico interno não publicado automaticamente.
-- CLI-04 documentos com categoria/validade/versão, busca e download privado; autorização testada em todos os caminhos.

-- Enums
DO $$ BEGIN CREATE TYPE cli_contact_role AS ENUM ('titular','financeiro','operacional','rh','comercial','tecnico','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_contact_status AS ENUM ('ativo','inativo','suspenso','pendente_convite'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_contract_item_type AS ENUM ('vigilancia','portaria','limpeza','zeladoria','recepcao','monitoramento','manutencao','equipamento','material','servico_adicional','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_document_category AS ENUM ('contrato','aditivo','proposta','relatorio','vistoria','certidao','comprovante','fatura','nota_fiscal','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_document_status AS ENUM ('rascunho','publicado','arquivado','vencido','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_old_route_action AS ENUM ('redirect','block','allow'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CLI-01: entrada única e rotas antigas mapeadas
CREATE TABLE IF NOT EXISTS cli_entry_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT UNIQUE NOT NULL CHECK (char_length(path) >= 1 AND char_length(path) <= 500),
  description TEXT CHECK (char_length(description) <= 500),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cli_old_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_path TEXT UNIQUE NOT NULL CHECK (char_length(old_path) >= 1 AND char_length(old_path) <= 500),
  new_path TEXT NOT NULL CHECK (char_length(new_path) >= 1 AND char_length(new_path) <= 500),
  action cli_old_route_action NOT NULL DEFAULT 'redirect',
  reason TEXT CHECK (char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CLI-02: múltiplos contatos do cliente e papéis por conta/unidade/contrato
CREATE TABLE IF NOT EXISTS cli_client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) >= 2 AND char_length(display_name) <= 200),
  email TEXT NOT NULL CHECK (char_length(email) >= 5 AND char_length(email) <= 320),
  phone TEXT CHECK (char_length(phone) <= 50),
  role cli_contact_role NOT NULL DEFAULT 'operacional',
  status cli_contact_status NOT NULL DEFAULT 'pendente_convite',
  can_delegate BOOLEAN NOT NULL DEFAULT false,
  delegated_by_contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  delegated_at TIMESTAMPTZ,
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_account_id, email)
);
CREATE INDEX IF NOT EXISTS idx_cli_contacts_account ON cli_client_contacts(client_account_id);
CREATE INDEX IF NOT EXISTS idx_cli_contacts_identity ON cli_client_contacts(identity_id);
CREATE INDEX IF NOT EXISTS idx_cli_contacts_email ON cli_client_contacts(email);
CREATE INDEX IF NOT EXISTS idx_cli_contacts_role ON cli_client_contacts(role);

CREATE TABLE IF NOT EXISTS cli_contact_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES cli_client_contacts(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  role cli_contact_role NOT NULL,
  can_delegate BOOLEAN NOT NULL DEFAULT false,
  delegated_by_contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id, client_account_id, unit_id, contract_id, role)
);
CREATE INDEX IF NOT EXISTS idx_cli_contact_scopes_contact ON cli_contact_scopes(contact_id);
CREATE INDEX IF NOT EXISTS idx_cli_contact_scopes_account ON cli_contact_scopes(client_account_id);
CREATE INDEX IF NOT EXISTS idx_cli_contact_scopes_contract ON cli_contact_scopes(contract_id);

-- CLI-03: contratos itens serviço vigência documentos escopo claro conteúdo técnico interno não publicado automaticamente
CREATE TABLE IF NOT EXISTS cli_contract_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  item_type cli_contract_item_type NOT NULL DEFAULT 'outro',
  title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 2000),
  quantity NUMERIC(10,2) CHECK (quantity >= 0),
  unit TEXT CHECK (char_length(unit) <= 50),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cli_contract_items_contract ON cli_contract_items(contract_id);
CREATE INDEX IF NOT EXISTS idx_cli_contract_items_type ON cli_contract_items(item_type);

CREATE TABLE IF NOT EXISTS cli_contract_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  scope_description TEXT NOT NULL CHECK (char_length(scope_description) >= 10 AND char_length(scope_description) <= 2000),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cli_contract_scopes_contract ON cli_contract_scopes(contract_id);
CREATE INDEX IF NOT EXISTS idx_cli_contract_scopes_account ON cli_contract_scopes(client_account_id);

CREATE TABLE IF NOT EXISTS cli_contract_vigencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE,
  status TEXT NOT NULL CHECK (status IN ('vigente','encerrado','suspenso','renovado','cancelado')),
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cli_vigencia_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS idx_cli_vigencia_contract ON cli_contract_vigencia(contract_id);
CREATE INDEX IF NOT EXISTS idx_cli_vigencia_status ON cli_contract_vigencia(status);

-- CLI-04: documentos categoria validade versão busca download privado autorização testada todos caminhos
CREATE TABLE IF NOT EXISTS cli_document_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cli_client_documents_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  category cli_document_category NOT NULL DEFAULT 'outro',
  title TEXT NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 2000),
  file_name TEXT NOT NULL CHECK (char_length(file_name) >= 1 AND char_length(file_name) <= 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) >= 5 AND char_length(file_url) <= 1000),
  storage_key TEXT UNIQUE NOT NULL CHECK (char_length(storage_key) >= 5 AND char_length(storage_key) <= 500),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  status cli_document_status NOT NULL DEFAULT 'rascunho',
  valid_from DATE,
  valid_to DATE,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  is_private BOOLEAN NOT NULL DEFAULT true,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cli_doc_validity CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  UNIQUE(client_account_id, title, version)
);
CREATE INDEX IF NOT EXISTS idx_cli_doc_v2_account ON cli_client_documents_v2(client_account_id);
CREATE INDEX IF NOT EXISTS idx_cli_doc_v2_contract ON cli_client_documents_v2(contract_id);
CREATE INDEX IF NOT EXISTS idx_cli_doc_v2_category ON cli_client_documents_v2(category);
CREATE INDEX IF NOT EXISTS idx_cli_doc_v2_status ON cli_client_documents_v2(status);
CREATE INDEX IF NOT EXISTS idx_cli_doc_v2_valid ON cli_client_documents_v2(valid_to) WHERE valid_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cli_doc_v2_private ON cli_client_documents_v2(is_private) WHERE is_private = true;

CREATE TABLE IF NOT EXISTS cli_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES cli_client_documents_v2(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >= 1),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by TEXT,
  change_reason TEXT CHECK (char_length(change_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, version)
);
CREATE INDEX IF NOT EXISTS idx_cli_doc_versions_doc ON cli_document_versions(document_id);

CREATE TABLE IF NOT EXISTS cli_document_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES cli_client_documents_v2(id) ON DELETE CASCADE,
  identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('view','download','search')),
  ip_hash TEXT,
  user_agent TEXT CHECK (char_length(user_agent) <= 500),
  was_authorized BOOLEAN NOT NULL DEFAULT true,
  denied_reason TEXT CHECK (char_length(denied_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cli_doc_access_doc ON cli_document_access_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_cli_doc_access_identity ON cli_document_access_logs(identity_id);
CREATE INDEX IF NOT EXISTS idx_cli_doc_access_contact ON cli_document_access_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_cli_doc_access_type ON cli_document_access_logs(access_type);

-- Triggers updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_cli_updated_at') THEN
    CREATE OR REPLACE FUNCTION update_cli_updated_at() RETURNS TRIGGER AS $f$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_cli_contacts_updated ON cli_client_contacts;
CREATE TRIGGER trg_cli_contacts_updated BEFORE UPDATE ON cli_client_contacts FOR EACH ROW EXECUTE FUNCTION update_cli_updated_at();
DROP TRIGGER IF EXISTS trg_cli_contract_items_updated ON cli_contract_items;
CREATE TRIGGER trg_cli_contract_items_updated BEFORE UPDATE ON cli_contract_items FOR EACH ROW EXECUTE FUNCTION update_cli_updated_at();
DROP TRIGGER IF EXISTS trg_cli_doc_v2_updated ON cli_client_documents_v2;
CREATE TRIGGER trg_cli_doc_v2_updated BEFORE UPDATE ON cli_client_documents_v2 FOR EACH ROW EXECUTE FUNCTION update_cli_updated_at();

-- Seeds
INSERT INTO cli_entry_points (path, description, is_primary) VALUES ('/cliente/entrar', 'Entrada única portal cliente - login', true) ON CONFLICT (path) DO NOTHING;
INSERT INTO cli_entry_points (path, description, is_primary) VALUES ('/cliente/painel', 'Painel cliente autenticado', false) ON CONFLICT (path) DO NOTHING;
INSERT INTO cli_old_routes (old_path, new_path, action, reason) VALUES ('/cliente/acesso', '/cliente/entrar', 'redirect', 'Rota antiga identificada - redirecionar com cuidado CLI-01'), ('/cliente/app', '/cliente/painel', 'redirect', 'Rota antiga app -> painel'), ('/cliente/conta', '/cliente/painel', 'redirect', 'Rota antiga conta -> painel') ON CONFLICT (old_path) DO NOTHING;
INSERT INTO cli_document_categories (name, description) VALUES ('contrato','Contratos vigentes'), ('relatorio','Relatórios periódicos'), ('fatura','Faturas e cobranças'), ('vistoria','Vistorias e inspeções'), ('certidao','Certidões e documentos legais') ON CONFLICT (name) DO NOTHING;

-- Amplia auditoria
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
  'cli_contact_create','cli_contact_scope_create','cli_contact_delegate',
  'cli_contract_item_create','cli_contract_scope_create','cli_vigencia_create',
  'cli_document_create','cli_document_version_create','cli_document_download','cli_document_search','cli_old_route_redirect'
));

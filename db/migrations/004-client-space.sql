-- Etapa 2 do portal do cliente: cadastro central de clientes, vínculos verificados,
-- contratos, documentos privados e chamados (docs/portal-acesso-e-seguranca.md).
-- Nenhum dado de demonstração deve ser inserido aqui: a administração cadastra
-- manualmente os dados reais; ambientes de teste identificam registros como tal.

-- Cadastro central de clientes. parent_account_id prepara o modelo para filiais futuras;
-- o controle de acesso desta etapa não herda escopo entre unidades.
CREATE TABLE IF NOT EXISTS client_accounts (
  id UUID PRIMARY KEY,
  parent_account_id UUID REFERENCES client_accounts(id),
  display_name VARCHAR(160) NOT NULL,
  document_ref VARCHAR(32),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  notes VARCHAR(500),
  created_by TEXT NOT NULL CHECK (created_by IN ('marcelo','ti')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vínculo verificado entre uma identidade do portal e uma conta de cliente.
-- Separar identidade de vínculo: controlar um e-mail não prova representar o cliente.
-- A concessão/revogação exige motivo obrigatório (auditado).
CREATE TABLE IF NOT EXISTS client_access_grants (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  scope_note VARCHAR(500),
  reason VARCHAR(500) NOT NULL,
  granted_by TEXT NOT NULL CHECK (granted_by IN ('marcelo','ti')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT CHECK (revoked_by IS NULL OR revoked_by IN ('marcelo','ti')),
  revoke_reason VARCHAR(500)
);

-- Um vínculo ativo por par identidade+conta.
CREATE UNIQUE INDEX IF NOT EXISTS client_access_grants_active_key
  ON client_access_grants (identity_id, client_account_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS client_access_grants_identity_idx
  ON client_access_grants (identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_access_grants_account_idx
  ON client_access_grants (client_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS client_contracts (
  id UUID PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  service VARCHAR(120) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','suspended','ended')),
  starts_on DATE,
  ends_on DATE,
  summary VARCHAR(500),
  created_by TEXT NOT NULL CHECK (created_by IN ('marcelo','ti')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_contracts_account_idx
  ON client_contracts (client_account_id, created_at DESC);

-- Documentos privados compartilhados com o cliente. O arquivo fica fora do banco, em
-- armazenamento privado (CLIENT_DOCS_DIR); aqui vão somente metadados e a chave
-- aleatória de armazenamento. Cada download exige verificação de vínculo no servidor.
CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  category VARCHAR(60) NOT NULL,
  original_filename VARCHAR(200) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0),
  storage_key VARCHAR(64) NOT NULL UNIQUE,
  uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('marcelo','ti')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_documents_account_idx
  ON client_documents (client_account_id, created_at DESC);

-- Chamados abertos pelo cliente autenticado, com trilha própria de status.
CREATE TABLE IF NOT EXISTS client_tickets (
  id UUID PRIMARY KEY,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  opened_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  category TEXT NOT NULL CHECK (category IN ('Acesso ao portal','Contratos ou documentos','Atendimento sobre serviço','Outro assunto')),
  title VARCHAR(120) NOT NULL,
  details VARCHAR(500) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  admin_response VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_tickets_account_idx
  ON client_tickets (client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_tickets_status_idx
  ON client_tickets (status, created_at DESC);

CREATE TABLE IF NOT EXISTS client_ticket_status_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES client_tickets(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL CHECK (previous_status IN ('open','in_progress','resolved','closed')),
  next_status TEXT NOT NULL CHECK (next_status IN ('open','in_progress','resolved','closed')),
  changed_by TEXT NOT NULL CHECK (changed_by IN ('marcelo','ti')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_ticket_status_audit_ticket_idx
  ON client_ticket_status_audit (ticket_id, changed_at DESC);

-- Amplia a lista fechada de ações auditadas para cobrir a etapa 2.
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
  'ticket_open','ticket_status','ticket_list'
));

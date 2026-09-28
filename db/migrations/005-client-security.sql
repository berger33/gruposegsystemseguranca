-- Etapa 3 (opção A): segurança do cliente — vínculo restrito por contrato/unidade,
-- MFA opcional (TOTP), troca de e-mail com "Não fui eu", auditoria expandida.
-- Idempotente; não insere dados de demonstração.

-- 1. Ampliação de vínculo: contrato(s) selecionados e unidade/filial.
ALTER TABLE client_access_grants
  ADD COLUMN IF NOT EXISTS contract_scope_mode TEXT NOT NULL DEFAULT 'all'
    CHECK (contract_scope_mode IN ('all','selected')),
  ADD COLUMN IF NOT EXISTS allowed_contract_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS unit_account_id UUID REFERENCES client_accounts(id);

CREATE INDEX IF NOT EXISTS client_access_grants_contract_mode_idx
  ON client_access_grants (contract_scope_mode);
CREATE INDEX IF NOT EXISTS client_access_grants_unit_idx
  ON client_access_grants (unit_account_id);

CREATE TABLE IF NOT EXISTS client_access_grant_contracts (
  grant_id UUID NOT NULL REFERENCES client_access_grants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  PRIMARY KEY (grant_id, contract_id)
);
CREATE INDEX IF NOT EXISTS grant_contracts_contract_idx
  ON client_access_grant_contracts (contract_id);

-- 2. MFA opcional: TOTP (secret criptografado no app), códigos recuperação hasheados.
CREATE TABLE IF NOT EXISTS auth_mfa (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT NOT NULL,
  recovery_hashes TEXT[] NOT NULL DEFAULT '{}',
  activated_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  attempts_since_verified INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_mfa_identity_idx ON auth_mfa (identity_id);

-- 3. Troca de e-mail: pendente, confirmações, cancelamento.
CREATE TABLE IF NOT EXISTS auth_email_change (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  old_email VARCHAR(254) NOT NULL,
  new_email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT CHECK (cancelled_by IN ('user','system','security_alert')),
  alert_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_email_change_identity_idx
  ON auth_email_change (identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_email_change_token_idx
  ON auth_email_change (token_hash);

-- 4. Auditoria expandida para esta etapa.
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
  'mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use',
  'email_change_request','email_change_confirm','email_change_cancel','email_change_alert',
  'grant_contract_restrict','grant_unit_restrict'
));

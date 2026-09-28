-- Etapa 3 (opção A): identidades administrativas individuais — substituir tokens
-- compartilhados por convite seguro, perfis e auditoria de staff.
-- Idempotente. Nenhum dado de demonstração.

-- 1. Expandir tipo de identidade para staff (admin, ti, rh) — o modelo já previa.
ALTER TABLE auth_identities ALTER COLUMN kind TYPE TEXT;
-- 003 já cria implicitamente kind_check; troque-o antes de ampliar os valores.
ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_kind_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_kind_check
  CHECK (kind IN ('client','staff'));
DROP INDEX IF EXISTS auth_identities_kind_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_kind_email_key
  ON auth_identities (kind, email);

-- 2. Convites aceitam staff.
ALTER TABLE auth_invites ALTER COLUMN kind TYPE TEXT;
ALTER TABLE auth_invites DROP CONSTRAINT IF EXISTS auth_invites_kind_check;
ALTER TABLE auth_invites ADD CONSTRAINT auth_invites_kind_check
  CHECK (kind IN ('client','staff'));
ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS role TEXT
  CHECK (role IN ('admin','ti','rh'));

-- 3. Perfil de staff (papel mínimo: admin, ti, rh). Atribuição por convite ou admin.
CREATE TABLE IF NOT EXISTS auth_staff_profiles (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','ti','rh')),
  assigned_by TEXT NOT NULL CHECK (assigned_by IN ('invitation','admin_system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_staff_profiles_role_idx
  ON auth_staff_profiles (role, created_at DESC);

-- 4. Auditoria aceita staff como ator e amplia ações administrativas.
ALTER TABLE auth_access_audit ALTER COLUMN actor_kind TYPE TEXT;
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_actor_kind_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_actor_kind_check
  CHECK (actor_kind IN ('client','staff','system','marcelo','ti','admin'));
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
  'grant_contract_restrict','grant_unit_restrict',
  'staff_invite','staff_login','staff_role_change','staff_session_revoke'
));

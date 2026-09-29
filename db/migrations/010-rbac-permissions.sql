-- PLT-01 / SEC-04 / SEC-05: diretório de permissões granulares domain.action com escopo
-- Idempotente

CREATE TABLE IF NOT EXISTS auth_permissions (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission ~ '^[a-z_]+\.[a-z_\.]+$'),
  scope_type TEXT NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global','own','team','unit','account','contract','organization')),
  scope_id UUID,
  granted_by UUID REFERENCES auth_identities(id),
  granted_by_role TEXT CHECK (granted_by_role IN ('marcelo','ti','admin','rh','system')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth_identities(id),
  revoke_reason TEXT CHECK (revoke_reason IS NULL OR char_length(revoke_reason) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_permissions_active_unique
  ON auth_permissions (identity_id, permission, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS auth_permissions_identity_idx
  ON auth_permissions (identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_permissions_permission_idx
  ON auth_permissions (permission, scope_type);

-- Revisão periódica de acesso: registro de revisões
CREATE TABLE IF NOT EXISTS auth_access_reviews (
  id UUID PRIMARY KEY,
  reviewed_by UUID NOT NULL REFERENCES auth_identities(id),
  target_identity_id UUID NOT NULL REFERENCES auth_identities(id),
  decision TEXT NOT NULL CHECK (decision IN ('keep','revoke','adjust')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_access_reviews_target_idx
  ON auth_access_reviews (target_identity_id, created_at DESC);

-- Ampliar auditoria para permissões
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
  'handover_create','handover_accept'
));

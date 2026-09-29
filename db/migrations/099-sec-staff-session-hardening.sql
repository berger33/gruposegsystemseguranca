-- L01 / SEC-04, SEC-05, SEC-06: endurecimento da sessão administrativa (staff).
--
-- Motivação verificada no commit de trabalho:
--   1. server.mjs emitia sessão com papel "admin" quando a identidade não tinha
--      perfil em auth_staff_profiles (fallback de elevação silenciosa).
--   2. O cookie de staff era um token assinado sem estado no servidor: suspender,
--      desligar, trocar senha ou reduzir permissões NÃO invalidava a sessão.
--   3. Não havia desafio MFA anterior à sessão privilegiada de staff, embora o
--      fluxo de cliente já exigisse (auth_mfa_challenges existe desde 009).
--   4. Tokens compartilhados (SITE_ADMIN_TOKEN_MARCELO/TI) emitiam sessão sem
--      identidade individual, portanto sem ator auditável.
--
-- Idempotente. Nenhum dado de demonstração, nenhum segredo.

-- 1. Versionamento de sessão por identidade. Incrementar invalida imediatamente
--    todas as sessões emitidas antes da mudança (senha, papel, status, permissão).
ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS session_epoch INTEGER NOT NULL DEFAULT 0;

-- 2. Registro durável das sessões de staff. A validação deixa de ser apenas
--    "assinatura + expiração" e passa a exigir uma linha viva no servidor.
CREATE TABLE IF NOT EXISTS auth_staff_sessions (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','ti','rh','marcelo')),
  epoch INTEGER NOT NULL DEFAULT 0,
  mfa_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  last_seen_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS auth_staff_sessions_identity_idx
  ON auth_staff_sessions (identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_staff_sessions_expires_idx
  ON auth_staff_sessions (expires_at);
CREATE INDEX IF NOT EXISTS auth_staff_sessions_live_idx
  ON auth_staff_sessions (identity_id) WHERE revoked_at IS NULL;

-- 3. auth_staff_profiles precisa aceitar o papel "marcelo" para que a conta de
--    gestão deixe de depender do token compartilhado. O nome continua sendo um
--    PAPEL, não uma pessoa: a autorização segue por papel/permissão.
ALTER TABLE auth_staff_profiles DROP CONSTRAINT IF EXISTS auth_staff_profiles_role_check;
ALTER TABLE auth_staff_profiles ADD CONSTRAINT auth_staff_profiles_role_check
  CHECK (role IN ('admin','ti','rh','marcelo'));

-- Perfil criado pelo bootstrap por token compartilhado. Ele NÃO conta como
-- conta individual provisionada: se contasse, o primeiro uso do token
-- desligaria o próprio bootstrap e travaria a instalação inicial.
ALTER TABLE auth_staff_profiles ADD COLUMN IF NOT EXISTS is_bootstrap BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_staff_profiles DROP CONSTRAINT IF EXISTS auth_staff_profiles_assigned_by_check;
ALTER TABLE auth_staff_profiles ADD CONSTRAINT auth_staff_profiles_assigned_by_check
  CHECK (assigned_by IN ('invitation','admin_system','legacy_bootstrap'));
ALTER TABLE auth_invites DROP CONSTRAINT IF EXISTS auth_invites_role_check;
ALTER TABLE auth_invites ADD CONSTRAINT auth_invites_role_check
  CHECK (role IS NULL OR role IN ('admin','ti','rh','marcelo'));

-- 4. Ações de auditoria novas deste lote. Mantém todas as anteriores (009 e
--    migrações posteriores só ampliaram esta lista).
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
  'assignment_create','assignment_end','assignment_suspend',
  'scale_create','scale_update',
  'time_entry_start','time_entry_end','time_entry_ronda',
  'handover_create','handover_accept',
  -- L01
  'staff_login_denied','staff_profile_missing','staff_mfa_challenge_issue',
  'staff_mfa_challenge_verify','staff_mfa_challenge_denied',
  'staff_legacy_token_login','staff_legacy_token_refused',
  'staff_session_expired','staff_epoch_bump'
));

-- 5. Higiene: sessões de staff expiradas há mais de 30 dias não precisam ficar.
--    A remoção é responsabilidade de rotina operacional, não desta migração.
COMMENT ON TABLE auth_staff_sessions IS
  'Sessões administrativas com estado no servidor. Revogação e epoch invalidam imediatamente; ver docs/EVIDENCIAS-ENTREGA-LOCAL.md (L01).';

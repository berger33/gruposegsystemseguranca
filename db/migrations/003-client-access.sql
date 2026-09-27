-- Portal do cliente: identidades, credenciais, sessões, convites e trilha de auditoria.
-- Implementa as decisões confirmadas em docs/portal-acesso-e-seguranca.md (etapa 1).
-- Nenhum segredo ou token em texto claro deve ser gravado aqui: somente hashes SHA-256
-- de tokens e hashes scrypt de senha.

CREATE TABLE IF NOT EXISTS auth_identities (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('client')),
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(120),
  status TEXT NOT NULL DEFAULT 'pending_email' CHECK (status IN ('pending_email','active','suspended','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Um e-mail por tipo de identidade (hoje só 'client'; futuros papéis usam outros kinds).
CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_kind_email_key ON auth_identities (kind, email);

CREATE TABLE IF NOT EXISTS auth_credentials (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  -- Formato "s1$N$r$p$keylen$<sal>$<chave>" com parâmetros embutidos; nunca registrar em logs.
  password_hash TEXT NOT NULL,
  password_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessões do cliente: revogáveis no servidor. O token bruto só existe no cookie do navegador.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT CHECK (revoked_at IS NULL OR revoke_reason IN ('logout','password_reset','email_change','status_block','expired')),
  ip_hash CHAR(64),
  user_agent VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS auth_sessions_identity_idx ON auth_sessions (identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at);

-- Convites: validade de 7 dias, uso único, revogáveis antes do uso.
CREATE TABLE IF NOT EXISTS auth_invites (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'client' CHECK (kind IN ('client')),
  email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  scope_note VARCHAR(500),
  issued_by TEXT NOT NULL CHECK (issued_by IN ('marcelo','ti')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_identity UUID REFERENCES auth_identities(id),
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS auth_invites_email_idx ON auth_invites (kind, email, created_at DESC);

-- Links de confirmação de e-mail (7 dias) e de recuperação de senha (1 hora).
-- Novo link invalida o anterior (superseded_at); cada token é de uso único (used_at).
CREATE TABLE IF NOT EXISTS auth_email_tokens (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('confirm_email','password_reset')),
  email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS auth_email_tokens_identity_idx ON auth_email_tokens (identity_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_email_tokens_email_idx ON auth_email_tokens (email, kind, created_at DESC);

-- Espera progressiva por conta (e-mail) e origem (hash do IP): após a 5ª falha,
-- esperas de 1, 5 e 15 minutos nas faixas seguintes. Zera após login bem-sucedido
-- ou 24 horas sem falhas.
CREATE TABLE IF NOT EXISTS auth_login_throttle (
  email VARCHAR(254) NOT NULL,
  origin_hash CHAR(64) NOT NULL,
  failures INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (email, origin_hash)
);

-- Trilha de auditoria de acesso (retenção prevista: 12 meses; exclusão automática
-- ainda não está ativa). Nunca gravar senhas, tokens completos ou códigos.
CREATE TABLE IF NOT EXISTS auth_access_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('client','marcelo','ti','system')),
  actor_id TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'invite_issue','invite_revoke','invite_accept',
    'login','logout','session_revoke_all',
    'email_confirm','email_confirm_resend',
    'password_reset_request','password_reset_complete'
  )),
  target TEXT,
  result TEXT NOT NULL CHECK (result IN ('allowed','denied','error')),
  detail_category TEXT NOT NULL DEFAULT 'none' CHECK (detail_category IN (
    'none','authorization_denied','not_found','expired','used','superseded','revoked',
    'invalid_credentials','throttled','policy_violation','service_unavailable','transition_invalid'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_access_audit_time_idx ON auth_access_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS auth_access_audit_actor_idx ON auth_access_audit (actor_kind, actor_id, created_at DESC);

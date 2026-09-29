-- SEC-06: bind MFA proof to each client session; never use a global verified flag.
-- Applies also to legacy portal fixtures which only have migrations 001-007.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;
ALTER TABLE auth_mfa ADD COLUMN IF NOT EXISTS last_used_step BIGINT;

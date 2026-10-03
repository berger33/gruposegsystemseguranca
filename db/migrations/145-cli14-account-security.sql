-- CLI-14: reconcile account security with canonical auth_* tables.
-- Additive only; auth_sessions, auth_mfa and auth_email_change remain the sources of truth.
CREATE INDEX IF NOT EXISTS auth_email_change_pending_identity_idx
  ON auth_email_change(identity_id, created_at DESC)
  WHERE used_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_sessions_identity_active_idx
  ON auth_sessions(identity_id, created_at DESC)
  WHERE revoked_at IS NULL;
ALTER TABLE auth_email_change
  ADD CONSTRAINT auth_email_change_expiry_valid CHECK (expires_at > created_at) NOT VALID;
ALTER TABLE auth_email_change
  VALIDATE CONSTRAINT auth_email_change_expiry_valid;

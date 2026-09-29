-- SEC-07 / CLI-01: manual identity check is NOT proof of mailbox ownership.
-- Do not backfill active legacy accounts: unknown verification must fail closed.
ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS verification_method TEXT
  CHECK (verification_method IN ('email_link','manual'));
ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_verification_pair_check
  CHECK ((verification_method IS NULL) = (verified_at IS NULL));

CREATE TABLE IF NOT EXISTS client_manual_verifications (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL UNIQUE REFERENCES auth_identities(id),
  staff_identity_id UUID NOT NULL REFERENCES auth_identities(id),
  method TEXT NOT NULL CHECK (method IN ('in_person','known_contact_callback')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 30 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_manual_verifications_staff_time_idx
  ON client_manual_verifications (staff_identity_id, created_at DESC);

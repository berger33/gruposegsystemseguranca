-- CRM-07 follow-up: typed interactions, contact link, auditable correction/removal,
-- paginated history and private attachments. Existing migrations remain immutable.

ALTER TABLE crm_interactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE crm_interactions SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE crm_interactions
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE crm_interactions
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_interactions_opp_active_idx
  ON crm_interactions (opportunity_id, occurred_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- Bytes are held by the existing private local-document provider (server-only
-- random key + SHA-256 verification on download). Metadata remains linked to
-- the interaction and is not exposed through a public URL.
CREATE TABLE IF NOT EXISTS crm_interaction_attachments (
  id UUID PRIMARY KEY,
  interaction_id UUID NOT NULL REFERENCES crm_interactions(id) ON DELETE RESTRICT,
  storage_key CHAR(48) NOT NULL UNIQUE CHECK (storage_key ~ '^[0-9a-f]{48}$'),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  original_filename VARCHAR(240) NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  content_type VARCHAR(120) NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png','text/plain')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  created_by_id UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_interaction_attachments_interaction_idx
  ON crm_interaction_attachments (interaction_id, created_at ASC);

-- Preserve all previously accepted action names and incrementally authorize
-- the events emitted by this CRM-07 slice. If the parent constraint ever
-- disappears, migration must fail rather than silently weaken audit rules.
DO $$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_definition
  FROM pg_constraint
  WHERE conrelid = 'auth_access_audit'::regclass
    AND conname = 'auth_access_audit_action_check'
    AND contype = 'c';
  IF current_definition IS NULL OR left(current_definition, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_action_constraint_missing';
  END IF;
  IF current_definition LIKE '%crm_interaction_attachment_download%' THEN
    RETURN;
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_interaction_update'',''crm_interaction_delete'',''crm_interaction_attachment_create'',''crm_interaction_attachment_download''))',
    substring(current_definition FROM 7)
  );
END $$;

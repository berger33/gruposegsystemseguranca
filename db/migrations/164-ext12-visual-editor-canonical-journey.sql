-- Migração aditiva 164: EXT-12 / F08 Editor visual avançado.
-- Preserva 001–163. As tabelas da migração 086 continuam existindo como
-- legado; a jornada canônica usa origin='ext12_canonica' e eventos append-only.

ALTER TABLE ext_visual_tokens
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS published_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS publish_note TEXT,
  ADD CONSTRAINT ext_visual_tokens_origin_check CHECK (origin IN ('registro_legado', 'ext12_canonica')) NOT VALID,
  ADD CONSTRAINT ext_visual_tokens_fingerprint_check CHECK (request_fingerprint IS NULL OR char_length(request_fingerprint) = 64) NOT VALID,
  ADD CONSTRAINT ext_visual_tokens_approval_note_check CHECK (approval_note IS NULL OR char_length(approval_note) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_visual_tokens_publish_note_check CHECK (publish_note IS NULL OR char_length(publish_note) BETWEEN 10 AND 1000) NOT VALID;

ALTER TABLE ext_visual_layouts
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS token_id UUID REFERENCES ext_visual_tokens(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS published_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS publish_note TEXT,
  ADD CONSTRAINT ext_visual_layouts_origin_check CHECK (origin IN ('registro_legado', 'ext12_canonica')) NOT VALID,
  ADD CONSTRAINT ext_visual_layouts_fingerprint_check CHECK (request_fingerprint IS NULL OR char_length(request_fingerprint) = 64) NOT VALID,
  ADD CONSTRAINT ext_visual_layouts_approval_note_check CHECK (approval_note IS NULL OR char_length(approval_note) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_visual_layouts_publish_note_check CHECK (publish_note IS NULL OR char_length(publish_note) BETWEEN 10 AND 1000) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ext_visual_tokens_canonical_identity_key_idx
  ON ext_visual_tokens(created_by_identity, idempotency_key)
  WHERE origin = 'ext12_canonica' AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ext_visual_layouts_canonical_identity_key_idx
  ON ext_visual_layouts(created_by_identity, idempotency_key)
  WHERE origin = 'ext12_canonica' AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ext_visual_tokens_canonical_published_idx
  ON ext_visual_tokens(token_key)
  WHERE origin = 'ext12_canonica' AND is_published;
CREATE UNIQUE INDEX IF NOT EXISTS ext_visual_layouts_canonical_published_idx
  ON ext_visual_layouts(layout_key)
  WHERE origin = 'ext12_canonica' AND is_published;
CREATE INDEX IF NOT EXISTS ext_visual_layouts_token_idx ON ext_visual_layouts(token_id);

CREATE TABLE IF NOT EXISTS ext_visual_editor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('token', 'layout')),
  token_id UUID REFERENCES ext_visual_tokens(id) ON DELETE CASCADE,
  layout_id UUID REFERENCES ext_visual_layouts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((entity_type = 'token' AND token_id IS NOT NULL AND layout_id IS NULL)
      OR (entity_type = 'layout' AND layout_id IS NOT NULL AND token_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_visual_events_identity_key_idx
  ON ext_visual_editor_events(created_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS ext_visual_events_token_idx
  ON ext_visual_editor_events(token_id, created_at ASC) WHERE token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_visual_events_layout_idx
  ON ext_visual_editor_events(layout_id, created_at ASC) WHERE layout_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ext_visual_append_only_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'EXT-12 visual editor history is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_visual_events_immutable_trg ON ext_visual_editor_events;
CREATE TRIGGER ext_visual_events_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_visual_editor_events
  FOR EACH ROW EXECUTE FUNCTION ext_visual_append_only_guard();

DROP TRIGGER IF EXISTS ext_editor_history_immutable_trg ON ext_editor_history;
CREATE TRIGGER ext_editor_history_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_editor_history
  FOR EACH ROW EXECUTE FUNCTION ext_visual_append_only_guard();

INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, p.permission, 'global', NULL, i.id, 'admin', 'EXT-12 permissões canônicas do editor visual'
FROM auth_identities i
JOIN auth_staff_profiles sp ON sp.identity_id = i.id
CROSS JOIN (VALUES ('visual_editor.read'), ('visual_editor.write'), ('visual_editor.review'), ('visual_editor.publish')) p(permission)
WHERE i.kind = 'staff' AND i.status = 'active'
  AND sp.role IN ('admin', 'ti')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_ext12_role_permissions() RETURNS trigger AS $$
DECLARE permission_name TEXT;
BEGIN
  IF NEW.role IN ('admin', 'ti') THEN
    FOR permission_name IN SELECT unnest(ARRAY['visual_editor.read','visual_editor.write','visual_editor.review','visual_editor.publish']) LOOP
      INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
      VALUES (gen_random_uuid(), NEW.identity_id, permission_name, 'global', NULL, 'system', 'Provisionamento inicial EXT-12 por papel staff')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_staff_profiles_ext12_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_ext12_permissions
  AFTER INSERT ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_ext12_role_permissions();

DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check'
     AND contype = 'c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)) NOT VALID',
      previous_check,
      'visual_token_create',
      'visual_token_revision_create',
      'visual_token_transition',
      'visual_token_publish',
      'visual_layout_create',
      'visual_layout_revision_create',
      'visual_layout_transition',
      'visual_layout_preview',
      'visual_layout_publish',
      'visual_token_legacy_write_retired',
      'visual_layout_legacy_write_retired'
    );
  END IF;
END
$audit_actions$;

-- A escrita dos aliases /api/ext/visual-tokens e /api/ext/visual-layouts é
-- aposentada no servidor com HTTP 410. Estados canônicos nascem por HTTP em
-- /api/ext/visual/*, nunca por INSERT SQL de negócio no gate.

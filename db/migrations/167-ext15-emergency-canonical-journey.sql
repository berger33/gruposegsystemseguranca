-- Migração aditiva 167: EXT-15 / F11 Apoio emergencial canônico.
-- Preserva 001–166. Os canais/testes da 087 permanecem como legado; a jornada
-- canônica registra configuração, testes internos declarados de recebimento e
-- atendimento e ativação humana. Nenhum telefonema ou mensagem é disparado.

ALTER TABLE ext_emergency_channels
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS activated_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_note TEXT,
  ADD CONSTRAINT ext_emergency_channels_origin_check CHECK (origin IN ('registro_legado','ext15_canonica')) NOT VALID,
  ADD CONSTRAINT ext_emergency_channels_purpose_check CHECK (purpose IS NULL OR char_length(purpose) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_emergency_channels_fingerprint_check CHECK (request_fingerprint IS NULL OR char_length(request_fingerprint)=64) NOT VALID,
  ADD CONSTRAINT ext_emergency_channels_activation_note_check CHECK (activation_note IS NULL OR char_length(activation_note) BETWEEN 10 AND 1000) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ext_emergency_channels_canonical_identity_key_idx
  ON ext_emergency_channels(created_by_identity,idempotency_key)
  WHERE origin='ext15_canonica' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_emergency_channels_origin_idx
  ON ext_emergency_channels(origin,created_at DESC);

ALTER TABLE ext_emergency_tests
  ADD COLUMN IF NOT EXISTS test_kind TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD CONSTRAINT ext_emergency_tests_kind_check CHECK (test_kind IS NULL OR test_kind IN ('recebimento','atendimento')) NOT VALID,
  ADD CONSTRAINT ext_emergency_tests_evidence_check CHECK (evidence_note IS NULL OR char_length(evidence_note) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_emergency_tests_fingerprint_check CHECK (request_fingerprint IS NULL OR char_length(request_fingerprint)=64) NOT VALID;

CREATE TABLE IF NOT EXISTS ext_emergency_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES ext_emergency_channels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint)=64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_emergency_events_identity_key_idx
  ON ext_emergency_events(created_by_identity,idempotency_key);
CREATE INDEX IF NOT EXISTS ext_emergency_events_channel_idx
  ON ext_emergency_events(channel_id,created_at,id);

CREATE OR REPLACE FUNCTION ext15_emergency_append_only_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'EXT-15 emergency history is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_emergency_events_immutable_trg ON ext_emergency_events;
CREATE TRIGGER ext_emergency_events_immutable_trg BEFORE UPDATE OR DELETE ON ext_emergency_events
  FOR EACH ROW EXECUTE FUNCTION ext15_emergency_append_only_guard();
DROP TRIGGER IF EXISTS ext_emergency_tests_immutable_trg ON ext_emergency_tests;
CREATE TRIGGER ext_emergency_tests_immutable_trg BEFORE UPDATE OR DELETE ON ext_emergency_tests
  FOR EACH ROW EXECUTE FUNCTION ext15_emergency_append_only_guard();

INSERT INTO auth_permissions (identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason)
SELECT i.id,p.permission,'global',NULL,i.id,'admin','EXT-15 permissões canônicas do apoio emergencial'
FROM auth_identities i JOIN auth_staff_profiles sp ON sp.identity_id=i.id
CROSS JOIN (VALUES ('emergency.read'),('emergency.write'),('emergency.test'),('emergency.activate')) p(permission)
WHERE i.kind='staff' AND i.status='active' AND sp.role IN ('admin','ti')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_ext15_role_permissions() RETURNS trigger AS $$
DECLARE permission_name TEXT;
BEGIN
  IF NEW.role IN ('admin','ti') THEN
    FOR permission_name IN SELECT unnest(ARRAY['emergency.read','emergency.write','emergency.test','emergency.activate']) LOOP
      INSERT INTO auth_permissions (id,identity_id,permission,scope_type,granted_by,granted_by_role,reason)
      VALUES (gen_random_uuid(),NEW.identity_id,permission_name,'global',NULL,'system','Provisionamento inicial EXT-15 por papel staff')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_staff_profiles_ext15_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_ext15_permissions AFTER INSERT ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_ext15_role_permissions();

DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO previous_check FROM pg_constraint
   WHERE conrelid='auth_access_audit'::regclass AND conname='auth_access_audit_action_check' AND contype='c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format('ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L)) NOT VALID',
      previous_check,'emergency_channel_create','emergency_channel_transition','emergency_test_register');
  END IF;
END
$audit_actions$;

-- Escritas legadas /api/ext/emergency-channels e /api/ext/emergency-tests são
-- aposentadas com 410 após autenticação, RBAC e same-origin. Testes canônicos
-- são declarações internas auditadas; não provam disponibilidade externa.

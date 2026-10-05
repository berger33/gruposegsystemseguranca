-- Migração aditiva 166: EXT-14 / F10 Inteligência comercial canônica.
-- Preserva 001–165. A tabela ext_commercial_intelligence da migração 087
-- continua existindo como legado; a jornada canônica usa origin='ext14_canonica',
-- evidência contada de tabelas internas reais, aprovação humana obrigatória e
-- contato registrado internamente (nenhum contato externo é realizado).

-- Novos estados canônicos do ciclo de vida. Os valores legados
-- ('convertida','expirada') permanecem apenas para linhas antigas.
ALTER TYPE ext_intel_status ADD VALUE IF NOT EXISTS 'contato_registrado';
ALTER TYPE ext_intel_status ADD VALUE IF NOT EXISTS 'arquivada';

ALTER TABLE ext_commercial_intelligence
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS history_start DATE,
  ADD COLUMN IF NOT EXISTS history_end DATE,
  ADD COLUMN IF NOT EXISTS evidence JSONB,
  ADD COLUMN IF NOT EXISTS evidence_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS evidence_built_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evidence_built_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS decision_note TEXT,
  ADD COLUMN IF NOT EXISTS contact_note TEXT,
  ADD COLUMN IF NOT EXISTS contact_registered_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS contact_registered_at TIMESTAMPTZ,
  ADD CONSTRAINT ext_commercial_intelligence_origin_check CHECK (origin IN ('registro_legado', 'ext14_canonica')) NOT VALID,
  ADD CONSTRAINT ext_commercial_intelligence_fingerprint_check CHECK (request_fingerprint IS NULL OR char_length(request_fingerprint) = 64) NOT VALID,
  ADD CONSTRAINT ext_commercial_intelligence_evidence_fp_check CHECK (evidence_fingerprint IS NULL OR char_length(evidence_fingerprint) = 64) NOT VALID,
  ADD CONSTRAINT ext_commercial_intelligence_decision_note_check CHECK (decision_note IS NULL OR char_length(decision_note) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_commercial_intelligence_contact_note_check CHECK (contact_note IS NULL OR char_length(contact_note) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_commercial_intelligence_history_window_check CHECK (
    origin <> 'ext14_canonica'
    OR (history_start IS NOT NULL AND history_end IS NOT NULL AND history_end >= history_start)
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ext_commercial_intelligence_canonical_identity_key_idx
  ON ext_commercial_intelligence(created_by_identity, idempotency_key)
  WHERE origin = 'ext14_canonica' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_commercial_intelligence_origin_idx
  ON ext_commercial_intelligence(origin, created_at DESC);

-- Trilha canônica de eventos EXT-14, append-only, com idempotência por autor.
CREATE TABLE IF NOT EXISTS ext_intel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intel_id UUID NOT NULL REFERENCES ext_commercial_intelligence(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_intel_events_identity_key_idx
  ON ext_intel_events(created_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS ext_intel_events_intel_idx
  ON ext_intel_events(intel_id, created_at ASC);

CREATE OR REPLACE FUNCTION ext14_intel_append_only_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'EXT-14 intelligence history is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_intel_events_immutable_trg ON ext_intel_events;
CREATE TRIGGER ext_intel_events_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_intel_events
  FOR EACH ROW EXECUTE FUNCTION ext14_intel_append_only_guard();

INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, p.permission, 'global', NULL, i.id, 'admin', 'EXT-14 permissões canônicas da inteligência comercial'
FROM auth_identities i
JOIN auth_staff_profiles sp ON sp.identity_id = i.id
CROSS JOIN (VALUES ('intel.read'), ('intel.write'), ('intel.review'), ('intel.contact')) p(permission)
WHERE i.kind = 'staff' AND i.status = 'active'
  AND sp.role IN ('admin', 'ti')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_ext14_role_permissions() RETURNS trigger AS $$
DECLARE permission_name TEXT;
BEGIN
  IF NEW.role IN ('admin', 'ti') THEN
    FOR permission_name IN SELECT unnest(ARRAY['intel.read','intel.write','intel.review','intel.contact']) LOOP
      INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
      VALUES (gen_random_uuid(), NEW.identity_id, permission_name, 'global', NULL, 'system', 'Provisionamento inicial EXT-14 por papel staff')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_staff_profiles_ext14_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_ext14_permissions
  AFTER INSERT ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_ext14_role_permissions();

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
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L)) NOT VALID',
      previous_check,
      'intel_create',
      'intel_transition',
      'intel_evidence_build',
      'intel_contact_register'
    );
  END IF;
END
$audit_actions$;

-- A escrita dos aliases /api/ext/commercial-intelligence é aposentada no
-- servidor com HTTP 410 após autenticação, RBAC e same-origin. Estados
-- canônicos nascem por HTTP em /api/ext/intel/suggestions, nunca por INSERT
-- SQL de negócio no gate. A sugestão é explicada com evidência contada de
-- tabelas internas reais; o contato exige aprovação humana anterior e é
-- registro interno autorizado: nenhum e-mail, telefonema ou mensagem externa
-- é disparado por esta migração.

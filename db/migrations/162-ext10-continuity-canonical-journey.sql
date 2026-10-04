-- Migração aditiva 162: EXT-10 Continuidade de Negócios e Contingência.
-- Preserva 001–161. Estados materiais somente pela API canônica HTTP.
ALTER TABLE ext_continuity_plans
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'ext10_canonica' CHECK (origin = 'ext10_canonica'),
  ADD COLUMN IF NOT EXISTS justification TEXT CHECK (justification IS NULL OR char_length(justification) BETWEEN 5 AND 2000),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

CREATE TABLE IF NOT EXISTS ext_continuity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES ext_continuity_plans(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 3 AND 500),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(created_by_identity, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ext_continuity_events_plan_idx ON ext_continuity_events(plan_id);
CREATE INDEX IF NOT EXISTS ext_continuity_events_created_idx ON ext_continuity_events(created_at);

CREATE OR REPLACE FUNCTION ext_continuity_events_immutable_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN RAISE EXCEPTION 'ext_continuity_events is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_continuity_events_immutable_trg ON ext_continuity_events;
CREATE TRIGGER ext_continuity_events_immutable_trg BEFORE UPDATE OR DELETE ON ext_continuity_events
FOR EACH ROW EXECUTE FUNCTION ext_continuity_events_immutable_guard();

DO $audit$
DECLARE previous_check TEXT;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO previous_check FROM pg_constraint
 WHERE conrelid='auth_access_audit'::regclass AND conname='auth_access_audit_action_check' AND contype='c';
 IF previous_check IS NOT NULL THEN
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format('ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L,%L,%L,%L)) NOT VALID', previous_check,
   'continuity_plan_create','continuity_plan_update','continuity_plan_transition_aprovado','continuity_plan_transition_em_teste','continuity_plan_transition_testado','continuity_plan_transition_desatualizado','continuity_exercise_create');
 END IF;
END $audit$;

INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, p.permission, 'global', NULL, i.id, 'admin', 'EXT-10 permissões canônicas de continuidade'
FROM auth_identities i CROSS JOIN (VALUES ('continuity.read'),('continuity.write'),('continuity.activate')) p(permission)
WHERE i.kind='staff' AND i.status='active' ON CONFLICT DO NOTHING;

-- EXT-10 permissions are explicit and independently revocable.

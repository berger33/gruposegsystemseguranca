-- Migração aditiva 163: EXT-11 / F07 Analytics e experimentos A/B controlados.
-- 001–162 são imutáveis. A tabela 086 continua existindo como legado; somente
-- origin=ext11_canonica é servido pela jornada canônica.

ALTER TABLE ext_analytics_experiments
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conclusion_note TEXT,
  ADD COLUMN IF NOT EXISTS data_minimization_note TEXT NOT NULL DEFAULT 'Somente métrica agregada necessária; sem nome, contato, IP ou identificador direto.',
  ADD CONSTRAINT ext_analytics_legacy_origin_check CHECK (origin IN ('registro_legado', 'ext11_canonica')) NOT VALID,
  ADD CONSTRAINT ext_analytics_approval_note_check CHECK (approval_note IS NULL OR char_length(approval_note) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_analytics_conclusion_note_check CHECK (conclusion_note IS NULL OR char_length(conclusion_note) BETWEEN 10 AND 2000) NOT VALID,
  ADD CONSTRAINT ext_analytics_minimization_note_check CHECK (char_length(data_minimization_note) BETWEEN 10 AND 1000) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ext_analytics_canonical_idempotency_idx
  ON ext_analytics_experiments(created_by_identity, idempotency_key)
  WHERE origin = 'ext11_canonica' AND idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ext_analytics_experiment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES ext_analytics_experiments(id),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_analytics_events_identity_key_idx
  ON ext_analytics_experiment_events(created_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS ext_analytics_events_experiment_idx
  ON ext_analytics_experiment_events(experiment_id, created_at ASC);

CREATE TABLE IF NOT EXISTS ext_analytics_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES ext_analytics_experiments(id),
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  metric_name TEXT NOT NULL CHECK (char_length(metric_name) BETWEEN 3 AND 100),
  metric_value NUMERIC(20, 8) NOT NULL CHECK (metric_value >= 0),
  sample_size INTEGER NOT NULL CHECK (sample_size > 0 AND sample_size <= 1000000000),
  source_type TEXT NOT NULL CHECK (source_type IN ('internal_operational_record', 'internal_event')),
  source_reference TEXT NOT NULL CHECK (char_length(source_reference) BETWEEN 3 AND 500),
  source_recorded_at TIMESTAMPTZ NOT NULL,
  source_record_id UUID,
  recorded_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  is_synthetic BOOLEAN NOT NULL DEFAULT false CHECK (is_synthetic = false),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_analytics_observations_identity_key_idx
  ON ext_analytics_observations(recorded_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS ext_analytics_observations_experiment_idx
  ON ext_analytics_observations(experiment_id, variant, created_at ASC);

CREATE OR REPLACE FUNCTION ext_analytics_append_only_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'EXT-11 analytics history is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_analytics_events_immutable_trg ON ext_analytics_experiment_events;
CREATE TRIGGER ext_analytics_events_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_analytics_experiment_events
  FOR EACH ROW EXECUTE FUNCTION ext_analytics_append_only_guard();
DROP TRIGGER IF EXISTS ext_analytics_observations_immutable_trg ON ext_analytics_observations;
CREATE TRIGGER ext_analytics_observations_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_analytics_observations
  FOR EACH ROW EXECUTE FUNCTION ext_analytics_append_only_guard();

-- Permissões explícitas e revogáveis. O INSERT é apenas provisionamento de
-- diretório; nenhum experimento ou observação é criado por SQL.
INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, p.permission, 'global', NULL, i.id, 'admin', 'EXT-11 permissões canônicas de analytics'
FROM auth_identities i
JOIN auth_staff_profiles sp ON sp.identity_id = i.id
CROSS JOIN (VALUES ('analytics.read'), ('analytics.write'), ('analytics.approve'), ('analytics.execute')) p(permission)
WHERE i.kind = 'staff' AND i.status = 'active'
  AND ((sp.role IN ('admin', 'ti', 'marcelo'))
       OR (sp.role IN ('comercial', 'financeiro') AND p.permission IN ('analytics.read', 'analytics.write')))
ON CONFLICT DO NOTHING;

-- Contas staff criadas depois do ledger também recebem apenas o conjunto
-- compatível com seu papel. Revogação manual continua possível e não há
-- fallback de autorização por texto de papel na API.
CREATE OR REPLACE FUNCTION provision_ext11_role_permissions() RETURNS trigger AS $$
DECLARE permission_name TEXT;
BEGIN
  IF NEW.role IN ('admin', 'ti', 'marcelo') THEN
    FOR permission_name IN SELECT unnest(ARRAY['analytics.read','analytics.write','analytics.approve','analytics.execute']) LOOP
      INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
      VALUES (gen_random_uuid(), NEW.identity_id, permission_name, 'global', NULL, 'system', 'Provisionamento inicial EXT-11 por papel staff')
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSIF NEW.role IN ('comercial', 'financeiro') THEN
    INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
    VALUES
      (gen_random_uuid(), NEW.identity_id, 'analytics.read', 'global', NULL, 'system', 'Provisionamento inicial EXT-11 por papel staff'),
      (gen_random_uuid(), NEW.identity_id, 'analytics.write', 'global', NULL, 'system', 'Provisionamento inicial EXT-11 por papel staff')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_staff_profiles_ext11_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_ext11_permissions
  AFTER INSERT ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_ext11_role_permissions();

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
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L,%L,%L,%L,%L,%L)) NOT VALID',
      previous_check,
      'analytics_experiment_create',
      'analytics_experiment_approve',
      'analytics_experiment_transition_em_execucao',
      'analytics_experiment_transition_concluido',
      'analytics_experiment_transition_cancelado',
      'analytics_experiment_transition_arquivado',
      'analytics_experiment_transition_rascunho',
      'analytics_observation_create',
      'analytics_experiment_legacy_write_retired'
    );
  END IF;
END
$audit_actions$;

-- A tabela 086 não ganha uma escrita nova: as rotas legadas são aposentadas
-- no servidor com HTTP 410. Este marcador torna a distinção auditável.

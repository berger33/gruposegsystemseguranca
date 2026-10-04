-- Migração aditiva 165: EXT-13 / F09 Relatório periódico canônico.
-- Preserva 001–164. A tabela ext_periodic_reports da migração 087 continua
-- existindo como legado; a jornada canônica usa origin='ext13_canonica',
-- eventos append-only e envio registrado internamente (sem SMTP externo).

-- Novos estados canônicos do ciclo de vida. Os valores legados
-- ('gerando','enviado','falhou') permanecem apenas para linhas antigas.
ALTER TYPE ext_report_status ADD VALUE IF NOT EXISTS 'em_revisao';
ALTER TYPE ext_report_status ADD VALUE IF NOT EXISTS 'aprovado';
ALTER TYPE ext_report_status ADD VALUE IF NOT EXISTS 'envio_registrado';

ALTER TABLE ext_periodic_reports
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS generated_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS generation_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS sent_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS send_note TEXT,
  ADD CONSTRAINT ext_periodic_reports_origin_check CHECK (origin IN ('registro_legado', 'ext13_canonica')) NOT VALID,
  ADD CONSTRAINT ext_periodic_reports_fingerprint_check CHECK (request_fingerprint IS NULL OR char_length(request_fingerprint) = 64) NOT VALID,
  ADD CONSTRAINT ext_periodic_reports_generation_fp_check CHECK (generation_fingerprint IS NULL OR char_length(generation_fingerprint) = 64) NOT VALID,
  ADD CONSTRAINT ext_periodic_reports_approval_note_check CHECK (approval_note IS NULL OR char_length(approval_note) BETWEEN 10 AND 1000) NOT VALID,
  ADD CONSTRAINT ext_periodic_reports_send_note_check CHECK (send_note IS NULL OR char_length(send_note) BETWEEN 10 AND 1000) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ext_periodic_reports_canonical_identity_key_idx
  ON ext_periodic_reports(created_by_identity, idempotency_key)
  WHERE origin = 'ext13_canonica' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_periodic_reports_origin_idx
  ON ext_periodic_reports(origin, created_at DESC);

-- Trilha canônica de eventos EXT-13, append-only, com idempotência por autor.
CREATE TABLE IF NOT EXISTS ext_report_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES ext_periodic_reports(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_report_events_identity_key_idx
  ON ext_report_events(created_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS ext_report_events_report_idx
  ON ext_report_events(report_id, created_at ASC);

CREATE OR REPLACE FUNCTION ext13_report_append_only_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'EXT-13 report history is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_report_events_immutable_trg ON ext_report_events;
CREATE TRIGGER ext_report_events_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_report_events
  FOR EACH ROW EXECUTE FUNCTION ext13_report_append_only_guard();

DROP TRIGGER IF EXISTS ext_periodic_report_logs_immutable_trg ON ext_periodic_report_logs;
CREATE TRIGGER ext_periodic_report_logs_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_periodic_report_logs
  FOR EACH ROW EXECUTE FUNCTION ext13_report_append_only_guard();

INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, p.permission, 'global', NULL, i.id, 'admin', 'EXT-13 permissões canônicas do relatório periódico'
FROM auth_identities i
JOIN auth_staff_profiles sp ON sp.identity_id = i.id
CROSS JOIN (VALUES ('reports.read'), ('reports.write'), ('reports.review'), ('reports.send')) p(permission)
WHERE i.kind = 'staff' AND i.status = 'active'
  AND sp.role IN ('admin', 'ti')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_ext13_role_permissions() RETURNS trigger AS $$
DECLARE permission_name TEXT;
BEGIN
  IF NEW.role IN ('admin', 'ti') THEN
    FOR permission_name IN SELECT unnest(ARRAY['reports.read','reports.write','reports.review','reports.send']) LOOP
      INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
      VALUES (gen_random_uuid(), NEW.identity_id, permission_name, 'global', NULL, 'system', 'Provisionamento inicial EXT-13 por papel staff')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_staff_profiles_ext13_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_ext13_permissions
  AFTER INSERT ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_ext13_role_permissions();

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
      'report_create',
      'report_transition',
      'report_generate',
      'report_dispatch_register'
    );
  END IF;
END
$audit_actions$;

-- A escrita dos aliases /api/ext/periodic-reports é aposentada no servidor
-- com HTTP 410 após autenticação, RBAC e same-origin. Estados canônicos
-- nascem por HTTP em /api/ext/reports/periodic, nunca por INSERT SQL de
-- negócio no gate. O envio é registro interno autorizado: nenhum e-mail,
-- SMTP, arquivo ou fornecedor externo é acionado por esta migração.

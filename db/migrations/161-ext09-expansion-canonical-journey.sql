-- Migração aditiva 161: EXT-09 Planejamento de Expansão, Capacidade e Cenários Financeiros Canônicos
-- Preserva 001–160 imutáveis.

-- Ampliações e colunas canônicas em ext_expansion_plans
ALTER TABLE ext_expansion_plans
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'ext09_canonica' CHECK (origin = 'ext09_canonica'),
  ADD COLUMN IF NOT EXISTS justification TEXT CHECK (justification IS NULL OR char_length(justification) BETWEEN 5 AND 2000),
  ADD COLUMN IF NOT EXISTS approved_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

-- Tabela de eventos históricos imutáveis de expansão
CREATE TABLE IF NOT EXISTS ext_expansion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES ext_expansion_plans(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 3 AND 500),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  request_fingerprint TEXT,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ext_expansion_events_plan_idx ON ext_expansion_events(plan_id);
CREATE INDEX IF NOT EXISTS ext_expansion_events_idemp_idx ON ext_expansion_events(idempotency_key);
CREATE INDEX IF NOT EXISTS ext_expansion_events_created_idx ON ext_expansion_events(created_at);

-- Trilha de auditoria append-only para eventos de expansão
CREATE OR REPLACE FUNCTION ext_expansion_events_immutable_guard()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ext_expansion_events is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_expansion_events_immutable_trg ON ext_expansion_events;
CREATE TRIGGER ext_expansion_events_immutable_trg
  BEFORE UPDATE OR DELETE ON ext_expansion_events
  FOR EACH ROW EXECUTE FUNCTION ext_expansion_events_immutable_guard();

-- Ampliação do check de ações de auditoria em auth_access_audit
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
      'expansion_plan_create',
      'expansion_plan_update',
      'expansion_plan_transition_em_analise',
      'expansion_plan_transition_aprovado',
      'expansion_plan_transition_rejeitado',
      'expansion_plan_transition_em_execucao',
      'expansion_plan_transition_concluido',
      'expansion_plan_transition_cancelado',
      'expansion_plan_transition_rascunho',
      'expansion_scenario_create',
      'expansion_scenario_delete'
    );
  END IF;
END
$audit_actions$;

-- Permissões explícitas para expansão
INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, p.perm, 'global', NULL, i.id, 'admin', 'EXT-09 permissões canônicas de expansão'
FROM auth_identities i
CROSS JOIN (
  VALUES
    ('expansion.read'),
    ('expansion.write'),
    ('expansion.approve')
) AS p(perm)
WHERE i.kind = 'staff' AND i.status = 'active'
ON CONFLICT DO NOTHING;


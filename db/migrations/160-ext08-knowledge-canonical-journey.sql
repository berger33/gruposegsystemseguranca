-- EXT-08 — base de conhecimento e procedimentos operacionais canônicos.
-- Aditiva sobre 001–159; preserva linhas da 086 como registro_legado sem
-- atribuir autoria retroativa. Procedimentos versionados, busca, acesso e ciência.
BEGIN;

-- 1. Ampliação da tabela canônica ext_knowledge_base
ALTER TABLE ext_knowledge_base
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado',
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE ext_knowledge_base ADD CONSTRAINT ext_knowledge_origin_check
  CHECK (origin IN ('registro_legado', 'ext08_canonica')) NOT VALID;

ALTER TABLE ext_knowledge_base ADD CONSTRAINT ext_knowledge_canonical_identity_check
  CHECK (origin <> 'ext08_canonica' OR created_by_identity IS NOT NULL) NOT VALID;

ALTER TABLE ext_knowledge_base ADD CONSTRAINT ext_knowledge_summary_check
  CHECK (summary IS NULL OR char_length(summary) BETWEEN 10 AND 500) NOT VALID;

ALTER TABLE ext_knowledge_base ADD CONSTRAINT ext_knowledge_review_notes_check
  CHECK (review_notes IS NULL OR char_length(review_notes) BETWEEN 5 AND 1000) NOT VALID;

ALTER TABLE ext_knowledge_base ADD CONSTRAINT ext_knowledge_archive_reason_check
  CHECK (archive_reason IS NULL OR char_length(archive_reason) BETWEEN 5 AND 1000) NOT VALID;

ALTER TABLE ext_knowledge_base ADD CONSTRAINT ext_knowledge_published_state_check
  CHECK (
    (status = 'publicado' AND is_published = true AND published_at IS NOT NULL)
    OR (status <> 'publicado' AND (is_published = false OR status = 'arquivado'))
  ) NOT VALID;

-- 2. Ampliação da tabela de ciência ext_knowledge_acknowledgments
ALTER TABLE ext_knowledge_acknowledgments
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'jornada_canonica';

ALTER TABLE ext_knowledge_acknowledgments ADD CONSTRAINT ext_knowledge_ack_notes_check
  CHECK (notes IS NULL OR char_length(notes) BETWEEN 3 AND 500) NOT VALID;

CREATE INDEX IF NOT EXISTS ext_knowledge_ack_user_idx
  ON ext_knowledge_acknowledgments(user_identity, acknowledged_at DESC);

-- 3. Tabela de eventos para idempotência, auditoria e rastreabilidade imutável
CREATE TABLE IF NOT EXISTS ext_knowledge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID REFERENCES ext_knowledge_base(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 60),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (char_length(request_fingerprint) = 64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ext_knowledge_events_identity_key
  ON ext_knowledge_events(created_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS ext_knowledge_events_kb_idx
  ON ext_knowledge_events(kb_id, created_at DESC);

-- 4. Permissões explícitas para base de conhecimento
INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, p.perm, 'global', NULL, i.id, 'admin', 'EXT-08 permissões canônicas de base de conhecimento'
FROM auth_identities i
CROSS JOIN (
  VALUES
    ('knowledge.read'),
    ('knowledge.write'),
    ('knowledge.publish'),
    ('knowledge.acknowledge')
) AS p(perm)
WHERE i.kind = 'staff' AND i.status = 'active'
ON CONFLICT DO NOTHING;

COMMIT;

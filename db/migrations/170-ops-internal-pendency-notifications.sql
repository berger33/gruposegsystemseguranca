-- Migração aditiva 170: F15 — Caixa interna canônica de pendências da equipe.
-- Preserva 001–169 imutáveis.
-- Fronteira: registro interno por identidade staff, alimentado por fontes internas reais já
-- existentes (obrigações, planos de ação e tarefas de compliance, testes de continuidade).
-- NÃO usa a fila legada `notification_queue` (PLT-04) e NÃO envia e-mail, SMS, WhatsApp, push,
-- webhook ou qualquer mensagem externa: nada sai do sistema.

CREATE TABLE IF NOT EXISTS ops_pendency_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  source_module TEXT NOT NULL CHECK (source_module IN (
    'ext07_obligation', 'ext07_action_plan', 'ext07_task', 'ext10_continuity_plan'
  )),
  source_id UUID NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (char_length(source_fingerprint) BETWEEN 8 AND 128),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 1000),
  criticality TEXT NOT NULL DEFAULT 'media' CHECK (criticality IN ('baixa', 'media', 'alta', 'critica')),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'nao_lida' CHECK (status IN ('nao_lida', 'lida', 'arquivada')),
  archive_note TEXT CHECK (archive_note IS NULL OR char_length(archive_note) BETWEEN 10 AND 1000),
  generated_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotência da varredura: a mesma pendência, para o mesmo destinatário e com o mesmo
-- estado de origem, nunca é duplicada. Mudança real na origem muda o fingerprint.
CREATE UNIQUE INDEX IF NOT EXISTS ops_pendency_notifications_dedup_key
  ON ops_pendency_notifications(recipient_identity, source_module, source_id, source_fingerprint);
CREATE INDEX IF NOT EXISTS ops_pendency_notifications_inbox_idx
  ON ops_pendency_notifications(recipient_identity, status, due_date);

CREATE OR REPLACE FUNCTION ops_pendency_notification_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recipient_ok BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'internal pendency notification cannot be physically deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'nao_lida' THEN
      RAISE EXCEPTION 'internal pendency notification is born nao_lida';
    END IF;
    -- Fail-closed: destinatário precisa ser identidade staff ativa com perfil.
    SELECT TRUE INTO recipient_ok FROM auth_identities i
      JOIN auth_staff_profiles p ON p.identity_id = i.id
     WHERE i.id = NEW.recipient_identity AND i.kind = 'staff' AND i.status = 'active';
    IF recipient_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'internal pendency notification requires an active staff recipient';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'arquivada' THEN
    RAISE EXCEPTION 'archived internal pendency notification is immutable';
  END IF;
  IF NEW.recipient_identity IS DISTINCT FROM OLD.recipient_identity
     OR NEW.source_module IS DISTINCT FROM OLD.source_module
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.generated_by_identity IS DISTINCT FROM OLD.generated_by_identity
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'internal pendency notification core fields are immutable';
  END IF;
  IF NEW.status = 'nao_lida' AND OLD.status = 'lida' THEN
    RAISE EXCEPTION 'internal pendency notification cannot return to nao_lida';
  END IF;
  IF NEW.status = 'arquivada' AND char_length(COALESCE(NEW.archive_note, '')) < 10 THEN
    RAISE EXCEPTION 'archiving an internal pendency notification requires a justification';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ops_pendency_notification_guard_trg ON ops_pendency_notifications;
CREATE TRIGGER ops_pendency_notification_guard_trg BEFORE INSERT OR UPDATE ON ops_pendency_notifications
  FOR EACH ROW EXECUTE FUNCTION ops_pendency_notification_guard();

DROP TRIGGER IF EXISTS ops_pendency_notification_guard_delete ON ops_pendency_notifications;
CREATE TRIGGER ops_pendency_notification_guard_delete BEFORE DELETE ON ops_pendency_notifications
  FOR EACH ROW EXECUTE FUNCTION ops_pendency_notification_guard();

-- Permissões explícitas e revogáveis: a varredura é privilégio de admin/TI; a caixa é pessoal.
INSERT INTO auth_permissions (identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT i.id, 'pendency.sweep', 'global', NULL, i.id, 'admin', 'F15 varredura interna de pendências'
  FROM auth_identities i JOIN auth_staff_profiles p ON p.identity_id = i.id
 WHERE i.kind = 'staff' AND i.status = 'active' AND p.role IN ('admin', 'ti')
ON CONFLICT DO NOTHING;

DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass AND conname = 'auth_access_audit_action_check' AND contype = 'c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format('ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L, %L, %L)) NOT VALID',
      previous_check, 'ops_pendency_sweep', 'ops_pendency_read', 'ops_pendency_archive');
  END IF;
END
$audit_actions$;

COMMENT ON TABLE ops_pendency_notifications IS
  'F15: caixa interna de pendências por identidade staff, derivada de fontes internas reais (EXT-07 obrigações/planos de ação/tarefas e EXT-10 testes de continuidade). Não usa a fila legada notification_queue e não envia nenhuma mensagem externa (sem SMTP, SMS, WhatsApp, push ou webhook).';

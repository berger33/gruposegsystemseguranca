-- 158 · F03 · jornada canônica de chamados afim de: cliente → chamado →
-- atendimento → aceite. Aditiva sobre 001–157 (tabelas legadas preservadas).
--
-- 1) client_ticket_messages: trilha canônica de mensagens do chamado
--    (registro do atendimento, da resolução e do aceite). Cada transição de
--    estado nasce nesta trilha na MESMA transação do UPDATE + auditorias, com
--    chave de idempotência por chamado e fingerprint do conteúdo integral.
--
-- 2) client_ticket_status_audit.changed_by passa a aceitar todos os papéis de
--    staff válidos (admin, ti, rh, marcelo, supervisor, comercial, financeiro):
--    a autoridade fina sobre chamados vive em auth_permissions
--    (client.tickets.read / client.tickets.write), não neste rótulo.
--
-- 3) audit_check de auth_access_audit passa a conhecer as novas ações
--    canônicas: ticket_attend, ticket_resolve, ticket_accept.

BEGIN;

CREATE TABLE IF NOT EXISTS client_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES client_tickets(id) ON DELETE CASCADE,
  message_kind TEXT NOT NULL CHECK (message_kind IN ('attendance', 'resolution', 'acceptance')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 5 AND 1000),
  author_kind TEXT NOT NULL CHECK (author_kind IN ('client', 'staff')),
  author_identity UUID NOT NULL REFERENCES auth_identities(id),
  author_name VARCHAR(200),
  idempotency_key VARCHAR(200),
  request_fingerprint CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotência por chamado: replay idêntico devolve o estado atual; mesmo
-- axioma com conteúdo divergente responde 409 idempotency_conflict, sem
-- efeito colateral. Reuso intencional exige chave nova.
CREATE UNIQUE INDEX IF NOT EXISTS client_ticket_messages_ticket_idempotency_unique
  ON client_ticket_messages (ticket_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_ticket_messages_ticket_idx
  ON client_ticket_messages (ticket_id, created_at ASC);

COMMENT ON TABLE client_ticket_messages IS
  'Trilha canônica de devolutivas do chamado: mensagem de atendimento (assumir), de resolução (resolver) e de aceite do cliente. Append-only por API; chave de idempotência única por chamado.';
COMMENT ON COLUMN client_ticket_messages.request_fingerprint IS
  'SHA-256 do conteúdo normalizado da transição (ação/alvo + mensagem); replay idêntico devolve estado atual, divergente responde 409.';

-- O histórico do chamado registra o papel real da sessão staff que atendeu;
-- a autorização granular é verificada por auth_permissions antes da escrita.
ALTER TABLE client_ticket_status_audit
  DROP CONSTRAINT IF EXISTS client_ticket_status_audit_changed_by_check;
ALTER TABLE client_ticket_status_audit
  ADD CONSTRAINT client_ticket_status_audit_changed_by_check
  CHECK (changed_by IN ('client', 'marcelo', 'ti', 'admin', 'rh', 'supervisor', 'comercial', 'financeiro')) NOT VALID;

-- A tabela auth_access_audit tem CHECK fechado e precisa conhecer as novas ações.
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
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L)) NOT VALID',
      previous_check,
      'ticket_attend', 'ticket_resolve', 'ticket_accept'
    );
  END IF;
END
$audit_actions$;

COMMIT;

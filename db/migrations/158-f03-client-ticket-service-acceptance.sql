-- F03: jornada cliente -> chamado -> atendimento -> aceite.
--
-- Migração estritamente aditiva sobre 001–157. Nenhuma linha histórica é
-- reescrita: chamados, relatórios e trilhas existentes continuam válidos sem
-- chave de idempotência e sem vínculo de chamado.
--
-- Ela entrega três coisas que faltavam para a jornada ser canônica:
--   1. o relatório de aceite passa a apontar para o chamado que ele encerra,
--      de modo que o aceite do cliente tenha origem rastreável;
--   2. só pode existir um aceite pendente por chamado (índice parcial), sem
--      impedir um novo ciclo depois de uma reabertura legítima;
--   3. retries do atendimento (equipe) e da publicação do relatório ganham
--      chave/impressão explícitas, serializadas por índices únicos parciais.

BEGIN;

ALTER TABLE client_reports
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES client_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

ALTER TABLE client_reports
  DROP CONSTRAINT IF EXISTS client_reports_idempotency_pair_check;
ALTER TABLE client_reports
  ADD CONSTRAINT client_reports_idempotency_pair_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR
    (char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$')
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS client_reports_ticket_idx
  ON client_reports (ticket_id, created_at DESC)
  WHERE ticket_id IS NOT NULL;

-- Um único aceite em aberto por chamado. Aceites já registrados ficam fora do
-- índice para que uma reabertura possa abrir um novo ciclo de aceite.
CREATE UNIQUE INDEX IF NOT EXISTS client_reports_ticket_acceptance_pending_unique
  ON client_reports (ticket_id)
  WHERE ticket_id IS NOT NULL AND report_type = 'acceptance' AND status <> 'acknowledged';

CREATE UNIQUE INDEX IF NOT EXISTS client_reports_identity_idempotency_key
  ON client_reports (created_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE client_ticket_status_audit
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

ALTER TABLE client_ticket_status_audit
  DROP CONSTRAINT IF EXISTS client_ticket_status_audit_idempotency_pair_check;
ALTER TABLE client_ticket_status_audit
  ADD CONSTRAINT client_ticket_status_audit_idempotency_pair_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR
    (char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$')
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS client_ticket_status_audit_ticket_idempotency_unique
  ON client_ticket_status_audit (ticket_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN client_reports.ticket_id IS
  'Chamado canônico (client_tickets) que este relatório de aceite encerra quando o cliente registra o aceite.';
COMMENT ON COLUMN client_reports.idempotency_key IS
  'Chave de retry da publicação do relatório, única por identidade da equipe.';
COMMENT ON COLUMN client_reports.request_fingerprint IS
  'SHA-256 do escopo e conteúdo do relatório; impede reuso divergente da chave.';
COMMENT ON COLUMN client_ticket_status_audit.idempotency_key IS
  'Chave de retry da transição de atendimento, única por chamado.';
COMMENT ON COLUMN client_ticket_status_audit.request_fingerprint IS
  'SHA-256 do comando de atendimento; impede reuso divergente da chave.';

COMMIT;

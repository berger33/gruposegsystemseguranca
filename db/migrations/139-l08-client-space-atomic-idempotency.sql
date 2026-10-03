-- L08 / CLI-04..05: idempotência explícita para documentos e chamados,
-- autoria individual no histórico de chamado e suporte ao hardening atômico.
--
-- A migração é somente aditiva em relação a 001–138. Linhas legadas continuam
-- válidas sem chave/fingerprint; toda nova escrita promovida pela API exige o
-- par completo e usa índices parciais para serializar retries concorrentes.

BEGIN;

ALTER TABLE client_tickets
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

ALTER TABLE client_tickets
  DROP CONSTRAINT IF EXISTS client_tickets_idempotency_pair_check;
ALTER TABLE client_tickets
  ADD CONSTRAINT client_tickets_idempotency_pair_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR
    (char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$')
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS client_tickets_identity_idempotency_key
  ON client_tickets (opened_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

ALTER TABLE client_documents
  DROP CONSTRAINT IF EXISTS client_documents_idempotency_pair_check;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_idempotency_pair_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR
    (char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$')
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS client_documents_uploader_idempotency_key
  ON client_documents (uploaded_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE client_ticket_status_audit
  ADD COLUMN IF NOT EXISTS changed_by_identity UUID REFERENCES auth_identities(id),
  ALTER COLUMN previous_status DROP NOT NULL;

ALTER TABLE client_ticket_status_audit
  DROP CONSTRAINT IF EXISTS client_ticket_status_audit_changed_by_check;
ALTER TABLE client_ticket_status_audit
  ADD CONSTRAINT client_ticket_status_audit_changed_by_check
  CHECK (changed_by IN ('client', 'marcelo', 'ti')) NOT VALID;

ALTER TABLE client_ticket_status_audit
  DROP CONSTRAINT IF EXISTS client_ticket_status_audit_client_identity_check;
ALTER TABLE client_ticket_status_audit
  ADD CONSTRAINT client_ticket_status_audit_client_identity_check
  CHECK (changed_by <> 'client' OR changed_by_identity IS NOT NULL) NOT VALID;

COMMENT ON COLUMN client_tickets.idempotency_key IS
  'Chave de retry enviada pelo cliente; única por identidade autenticada.';
COMMENT ON COLUMN client_tickets.request_fingerprint IS
  'SHA-256 do escopo e conteúdo relevante do chamado; detecta reuso divergente da chave.';
COMMENT ON COLUMN client_documents.idempotency_key IS
  'Chave de retry do upload; única por identidade staff autenticada.';
COMMENT ON COLUMN client_documents.request_fingerprint IS
  'SHA-256 da conta, metadados e bytes do documento; detecta reuso divergente da chave.';
COMMENT ON COLUMN client_ticket_status_audit.changed_by_identity IS
  'Identidade individual derivada da sessão que abriu ou alterou o chamado.';

COMMIT;

-- 139 — L08/CLI-04 e CLI-05: idempotência de chamado, protocolo único e
-- registro atômico de download de documento privado.
--
-- Regras seguidas:
-- - estritamente aditiva: nenhuma das migrações 001–138 é reescrita;
-- - reexecutável (o gate de migrações aplica o conjunto em dois passes);
-- - constraint nova entra como NOT VALID: o histórico existente não é
--   reprocessado nem reescrito, apenas a escrita nova é verificada;
-- - a fonte canônica continua sendo `client_tickets` e `client_documents`
--   (003–005, endurecidas por 097–101). Nenhuma fonte v2 concorrente é criada.

-- CLI-05: chave de idempotência enviada pelo cliente, impressão digital do
-- conteúdo e protocolo estável. Sem isso, um retry concorrente abre dois
-- chamados e devolve dois protocolos para o mesmo pedido.
ALTER TABLE client_tickets ADD COLUMN IF NOT EXISTS protocol VARCHAR(32);
ALTER TABLE client_tickets ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80);
ALTER TABLE client_tickets ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS client_tickets_protocol_uidx
  ON client_tickets (protocol) WHERE protocol IS NOT NULL;

-- A chave é única por conta: contas diferentes não compartilham espaço de
-- idempotência, e um cliente não consegue "reservar" a chave de outro.
CREATE UNIQUE INDEX IF NOT EXISTS client_tickets_idempotency_uidx
  ON client_tickets (client_account_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_tickets_protocol_format') THEN
    ALTER TABLE client_tickets
      ADD CONSTRAINT client_tickets_protocol_format
      CHECK (protocol IS NULL OR protocol ~ '^CLI-[0-9]{8}-[0-9A-Z]{6}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_tickets_fingerprint_requires_key') THEN
    ALTER TABLE client_tickets
      ADD CONSTRAINT client_tickets_fingerprint_requires_key
      CHECK (idempotency_key IS NULL OR request_fingerprint IS NOT NULL) NOT VALID;
  END IF;
END
$$;

-- A auditoria canônica precisa aceitar o replay idempotente e o conflito de
-- chave. Segue o padrão já usado pelas migrações 004–007 e 118: a lista
-- existente é preservada e apenas ampliada, de forma idempotente.
DO $$
DECLARE
  current_action TEXT;
  current_category TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_action
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check' AND contype = 'c';
  IF current_action IS NULL OR left(current_action, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_action_constraint_missing';
  END IF;
  IF current_action NOT LIKE '%ticket_open_replay%' THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''ticket_open_replay''))',
      substring(current_action FROM 7)
    );
  END IF;

  SELECT pg_get_constraintdef(oid) INTO current_category
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_detail_category_check' AND contype = 'c';
  IF current_category IS NULL OR left(current_category, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_detail_category_constraint_missing';
  END IF;
  IF current_category NOT LIKE '%idempotency_conflict%' THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_detail_category_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_detail_category_check CHECK ((%s) OR detail_category IN (''idempotency_conflict'',''integrity_failed''))',
      substring(current_category FROM 7)
    );
  END IF;
END
$$;

-- CLI-04: todo download de documento privado grava uma linha de acesso na mesma
-- transação da auditoria, antes de qualquer byte sair. Falha aqui é 503 e
-- nenhum byte é entregue.
CREATE TABLE IF NOT EXISTS client_document_access_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES client_documents(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('client','marcelo','ti')),
  actor_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed','denied','integrity_failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_document_access_log_document_idx
  ON client_document_access_log (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_document_access_log_actor_idx
  ON client_document_access_log (actor_id, created_at DESC);

-- L08 / CLI-12: jornada autenticada de renovação e comunicação contratual.
-- Promove cli_renewal_communications (076) para leitura real no portal e cria a
-- ciência/resposta registrada do cliente, idempotente por identidade e com
-- histórico imutável. Nenhuma resposta renova contrato, cria cobrança ou altera
-- valor; restrição de acesso só pode vir de comunicação 'encerramento' com
-- block_reason explícito, conforme o CHECK já existente na 076.

BEGIN;

-- Ciência/resposta do cliente a uma comunicação de renovação. Histórico
-- imutável: não há UPDATE nem DELETE na jornada; cada linha carrega autoria
-- derivada da sessão e fingerprint do conteúdo para impedir reuso divergente
-- da chave de retry.
CREATE TABLE IF NOT EXISTS cli_renewal_comm_responses (
  id UUID PRIMARY KEY,
  communication_id UUID NOT NULL REFERENCES cli_renewal_communications(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  response_kind TEXT NOT NULL,
  message TEXT,
  idempotency_key VARCHAR(200) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cli_renewal_comm_responses
  DROP CONSTRAINT IF EXISTS cli_renewal_comm_responses_kind_check;
ALTER TABLE cli_renewal_comm_responses
  ADD CONSTRAINT cli_renewal_comm_responses_kind_check
  CHECK (response_kind IN ('ciencia','interesse_renovar','solicitar_contato'))
  NOT VALID;

ALTER TABLE cli_renewal_comm_responses
  DROP CONSTRAINT IF EXISTS cli_renewal_comm_responses_message_check;
ALTER TABLE cli_renewal_comm_responses
  ADD CONSTRAINT cli_renewal_comm_responses_message_check
  CHECK (message IS NULL OR char_length(message) BETWEEN 5 AND 1000)
  NOT VALID;

ALTER TABLE cli_renewal_comm_responses
  DROP CONSTRAINT IF EXISTS cli_renewal_comm_responses_idempotency_check;
ALTER TABLE cli_renewal_comm_responses
  ADD CONSTRAINT cli_renewal_comm_responses_idempotency_check
  CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 200
    AND request_fingerprint ~ '^[0-9a-f]{64}$'
  ) NOT VALID;

-- Retry não duplica: a chave é única por identidade autenticada.
CREATE UNIQUE INDEX IF NOT EXISTS cli_renewal_comm_responses_identity_idempotency_key
  ON cli_renewal_comm_responses (identity_id, idempotency_key);

-- Idempotência por identidade também no conteúdo: uma manifestação de cada
-- tipo por identidade e comunicação; nova tentativa com chave nova é 409.
CREATE UNIQUE INDEX IF NOT EXISTS cli_renewal_comm_responses_identity_kind_unique
  ON cli_renewal_comm_responses (communication_id, identity_id, response_kind);

CREATE INDEX IF NOT EXISTS cli_renewal_comm_responses_account_idx
  ON cli_renewal_comm_responses (client_account_id, created_at DESC);

COMMENT ON TABLE cli_renewal_comm_responses IS
  'Ciência/resposta do cliente a comunicações de renovação; histórico imutável, autoria derivada da sessão. Não renova contrato, não cria cobrança e não altera valor.';
COMMENT ON COLUMN cli_renewal_comm_responses.identity_id IS
  'Autoria derivada da sessão do portal; identidade vinda do corpo da requisição é ignorada.';
COMMENT ON COLUMN cli_renewal_comm_responses.request_fingerprint IS
  'SHA-256 do conteúdo da resposta; chave reusada com conteúdo diferente é recusada com 409.';

-- Linhas históricas de cli_renewal_communications não recebem autoria nem
-- destinatário inventados: a leitura do portal expõe somente comunicações da
-- própria conta com sent_at registrado ("envio" é transição de estado local).
COMMENT ON COLUMN cli_renewal_communications.sent_at IS
  'Transição de estado local de envio; sem sent_at a comunicação não aparece na jornada autenticada do portal.';

-- A auditoria canônica de acesso participa da mesma transação da resposta.
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
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L)) NOT VALID',
      previous_check, 'renewal_communication_list', 'renewal_communication_respond'
    );
  END IF;
END
$audit_actions$;

COMMIT;

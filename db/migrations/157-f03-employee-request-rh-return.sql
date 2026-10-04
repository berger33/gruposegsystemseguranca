-- F03: jornada funcionário -> solicitação -> análise RH -> retorno.
-- Migração aditiva: torna retries explícitos nos dois comandos canônicos da
-- jornada. Linhas históricas permanecem válidas sem chave de idempotência.

ALTER TABLE emp_self_requests
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

ALTER TABLE emp_self_request_followups
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS emp_self_requests_employee_idempotency_unique
  ON emp_self_requests (employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS emp_self_request_followups_request_idempotency_unique
  ON emp_self_request_followups (request_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS emp_self_request_followups_request_created_idx
  ON emp_self_request_followups (request_id, created_at ASC);

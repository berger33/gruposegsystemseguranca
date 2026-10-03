-- L08 / CLI-15: reclamação sobre colaborador aberta pelo cliente em canal
-- restrito, com compartilhamento mínimo e justificado com RH.
-- Aditiva sobre a 093; migrações 001–145 permanecem imutáveis.
-- A jornada do portal deriva autoria/conta no servidor: linhas históricas sem
-- origem de portal ficam fora da jornada autenticada, sem autoria inventada.

BEGIN;

ALTER TABLE cli_employee_complaints
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_interno',
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

ALTER TABLE cli_employee_complaints
  DROP CONSTRAINT IF EXISTS cli_employee_complaints_origin_check;
ALTER TABLE cli_employee_complaints
  ADD CONSTRAINT cli_employee_complaints_origin_check
  CHECK (origin IN ('registro_interno','portal_cliente'))
  NOT VALID;

-- Reclamação do portal nasce vinculada no servidor: identidade autenticada,
-- conta com grant ativo e idempotência obrigatória. Nada disso vem do corpo.
ALTER TABLE cli_employee_complaints
  DROP CONSTRAINT IF EXISTS cli_employee_complaints_portal_binding_check;
ALTER TABLE cli_employee_complaints
  ADD CONSTRAINT cli_employee_complaints_portal_binding_check
  CHECK (
    origin <> 'portal_cliente'
    OR (
      created_by_identity IS NOT NULL
      AND client_account_id IS NOT NULL
      AND char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$'
    )
  )
  NOT VALID;

ALTER TABLE cli_employee_complaints
  DROP CONSTRAINT IF EXISTS cli_employee_complaints_idempotency_shape_check;
ALTER TABLE cli_employee_complaints
  ADD CONSTRAINT cli_employee_complaints_idempotency_shape_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR (
      char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$'
    )
  )
  NOT VALID;

-- Retry idêntico não duplica: uma chave por identidade autenticada.
CREATE UNIQUE INDEX IF NOT EXISTS cli_employee_complaints_identity_idempotency_key
  ON cli_employee_complaints (created_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS cli_employee_complaints_portal_identity_idx
  ON cli_employee_complaints (created_by_identity, client_account_id, created_at DESC)
  WHERE origin = 'portal_cliente';

COMMENT ON COLUMN cli_employee_complaints.origin IS
  'portal_cliente: aberta pela jornada autenticada do portal com autoria derivada da sessão; registro_interno: linhas legadas/staff.';
COMMENT ON COLUMN cli_employee_complaints.idempotency_key IS
  'Chave de idempotência enviada no header; única por identidade autenticada. Reuso com conteúdo divergente responde 409.';
COMMENT ON COLUMN cli_employee_complaints.request_fingerprint IS
  'SHA-256 do conteúdo normalizado da abertura; replay idêntico devolve a mesma reclamação.';

-- A auditoria canônica de acesso participa da mesma transação da abertura,
-- listagem e consulta do canal restrito.
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
      previous_check, 'employee_complaint_list', 'employee_complaint_view', 'employee_complaint_open'
    );
  END IF;
END
$audit_actions$;

COMMIT;

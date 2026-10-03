-- L08 / CLI-10: jornada autenticada de solicitação de serviço adicional.
-- Vincula explicitamente o cadastro do portal à empresa canônica do CRM e torna
-- a criação solicitação + oportunidade idempotente e transacional.

BEGIN;

ALTER TABLE client_accounts
  ADD COLUMN IF NOT EXISTS crm_company_id UUID REFERENCES crm_companies(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS client_accounts_crm_company_unique
  ON client_accounts (crm_company_id)
  WHERE crm_company_id IS NOT NULL;

-- Backfill conservador: somente identificadores não vazios e exatamente iguais.
-- crm_companies.document_ref já é único quando preenchido.
UPDATE client_accounts account
   SET crm_company_id = company.id
  FROM crm_companies company
 WHERE account.crm_company_id IS NULL
   AND account.document_ref IS NOT NULL
   AND account.document_ref <> ''
   AND company.document_ref = account.document_ref
   AND (
     SELECT COUNT(*) FROM client_accounts candidate
      WHERE candidate.document_ref = account.document_ref
   ) = 1
   AND NOT EXISTS (
     SELECT 1 FROM client_accounts other
      WHERE other.crm_company_id = company.id
   );

ALTER TABLE cli_service_requests
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS responsible_identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL;

ALTER TABLE cli_service_requests
  DROP CONSTRAINT IF EXISTS cli_service_requests_idempotency_pair_check;
ALTER TABLE cli_service_requests
  ADD CONSTRAINT cli_service_requests_idempotency_pair_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR
    (char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$')
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS cli_service_requests_identity_idempotency_key
  ON cli_service_requests (created_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN client_accounts.crm_company_id IS
  'Vínculo explícito e verificado com a empresa canônica usada pelas oportunidades do CRM.';
COMMENT ON COLUMN cli_service_requests.idempotency_key IS
  'Chave de retry do portal, única por identidade cliente.';
COMMENT ON COLUMN cli_service_requests.request_fingerprint IS
  'SHA-256 do escopo e conteúdo da solicitação; impede reuso divergente da chave.';

-- A auditoria canônica de acesso é obrigatória e participa da mesma transação.
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
      previous_check, 'service_request_list', 'service_request_create'
    );
  END IF;
END
$audit_actions$;

COMMIT;

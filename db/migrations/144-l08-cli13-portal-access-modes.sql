-- L08 / CLI-13: modos de entrada configuráveis e solicitação de acesso real.
-- A promoção é aditiva sobre as tabelas da 076 e encaminha toda aprovação ao
-- convite canônico da 003. Aprovar pedido não cria identidade, sessão, grant ou
-- escopo contratual; grant continua sendo uma ação administrativa separada.

BEGIN;

ALTER TABLE cli_portal_mode_configs
  ADD COLUMN IF NOT EXISTS updated_by_identity UUID;
ALTER TABLE cli_portal_mode_configs
  ADD CONSTRAINT cli_portal_mode_configs_updated_by_fk
  FOREIGN KEY (updated_by_identity) REFERENCES auth_identities(id) NOT VALID;

CREATE TABLE IF NOT EXISTS cli_portal_mode_config_history (
  id UUID PRIMARY KEY,
  mode cli_portal_mode NOT NULL,
  previous_is_active BOOLEAN NOT NULL,
  next_is_active BOOLEAN NOT NULL,
  previous_requires_approval BOOLEAN NOT NULL,
  next_requires_approval BOOLEAN NOT NULL,
  previous_auto_release_contracts BOOLEAN NOT NULL,
  next_auto_release_contracts BOOLEAN NOT NULL,
  reason VARCHAR(500) NOT NULL,
  changed_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cli_portal_mode_config_history
  ADD CONSTRAINT cli_portal_mode_history_reason_check
  CHECK (char_length(reason) BETWEEN 10 AND 500) NOT VALID;

ALTER TABLE cli_portal_access_requests
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS requester_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS origin_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS decision_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_id UUID;

ALTER TABLE cli_portal_access_requests
  ADD CONSTRAINT cli_portal_access_requests_invite_fk
  FOREIGN KEY (invite_id) REFERENCES auth_invites(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE cli_portal_access_requests
  ADD CONSTRAINT cli_portal_access_request_idempotency_check
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL AND requester_fingerprint IS NULL AND origin_fingerprint IS NULL)
    OR
    (char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$'
      AND requester_fingerprint ~ '^[0-9a-f]{64}$'
      AND origin_fingerprint ~ '^[0-9a-f]{64}$')
  ) NOT VALID;

ALTER TABLE cli_portal_access_requests
  ADD CONSTRAINT cli_portal_access_request_decision_reason_check
  CHECK (decision_reason IS NULL OR char_length(decision_reason) BETWEEN 10 AND 500) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS cli_portal_access_requests_retry_unique
  ON cli_portal_access_requests (requester_fingerprint, origin_fingerprint, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cli_portal_access_requests_invite_unique
  ON cli_portal_access_requests (invite_id) WHERE invite_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cli_portal_access_request_history (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES cli_portal_access_requests(id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_identity_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cli_portal_access_request_history
  ADD CONSTRAINT cli_portal_access_request_history_status_check
  CHECK (previous_status IS NULL OR previous_status IN ('pendente','aprovada','rejeitada','cancelada')) NOT VALID;
ALTER TABLE cli_portal_access_request_history
  ADD CONSTRAINT cli_portal_access_request_history_next_status_check
  CHECK (next_status IN ('pendente','aprovada','rejeitada','cancelada')) NOT VALID;
ALTER TABLE cli_portal_access_request_history
  ADD CONSTRAINT cli_portal_access_request_history_reason_check
  CHECK (char_length(reason) BETWEEN 10 AND 500) NOT VALID;
ALTER TABLE cli_portal_access_request_history
  ADD CONSTRAINT cli_portal_access_request_history_actor_check
  CHECK ((actor_kind='public' AND actor_identity_id IS NULL) OR (actor_kind='staff' AND actor_identity_id IS NOT NULL)) NOT VALID;

CREATE INDEX IF NOT EXISTS cli_portal_access_request_history_request_idx
  ON cli_portal_access_request_history (request_id, created_at);

-- O papel administrativo atual também pode emitir o convite resultante. Linhas
-- antigas são preservadas; as constraints substitutas são deliberadamente NOT VALID.
ALTER TABLE auth_invites DROP CONSTRAINT IF EXISTS auth_invites_issued_by_check;
ALTER TABLE auth_invites ADD CONSTRAINT auth_invites_issued_by_check
  CHECK (issued_by IN ('marcelo','ti','admin')) NOT VALID;

DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check' AND contype = 'c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L)) NOT VALID',
      previous_check, 'portal_mode_config_update', 'portal_access_request_create',
      'portal_access_request_review', 'portal_access_request_list'
    );
  END IF;
END
$audit_actions$;

COMMENT ON COLUMN cli_portal_access_requests.verified_link IS
  'Resultado exclusivo da comparação no servidor entre conta ativa e document_ref; nunca é aceito do corpo cliente.';
COMMENT ON COLUMN cli_portal_access_requests.invite_id IS
  'Convite canônico da 003 criado na aprovação. Não representa identidade, sessão, grant ou acesso a contratos.';
COMMENT ON COLUMN cli_portal_access_requests.request_fingerprint IS
  'SHA-256 do conteúdo canônico para detectar reuso divergente da chave idempotente.';

COMMIT;

-- 159 · F03 · jornada canônica financeira: conta → baixa → relatório.
-- Aditiva sobre 001–158 (nenhuma tabela ou coluna anterior é removida e
-- nenhum dado existente é reescrito).
--
-- 1) fin_settlement_requests: ledger de idempotência da jornada. Cada abertura
--    de conta e cada baixa nascem com chave do cliente e impressão digital do
--    conteúdo integral, gravadas na MESMA transação do efeito material. Replay
--    idêntico devolve o estado atual; mesma chave com conteúdo divergente
--    responde 409 sem efeito colateral.
--
-- 2) fin_canonical_accounts: marcador de governança. A conta nascida pela rota
--    canônica `/api/admin/finance/l07/settlements` passa a recusar as escritas
--    legadas FIN-01/02/04 (410), impedindo que a baixa contorne a máquina de
--    estados, a idempotência e a auditoria desta jornada. Contas legadas
--    anteriores continuam atendidas pela rota legada — nada é quebrado
--    retroativamente.
--
-- 3) auth_access_audit passa a conhecer as ações canônicas desta fatia:
--    fin_account_open, fin_account_settle, fin_settlement_report_read.

BEGIN;

CREATE TABLE IF NOT EXISTS fin_settlement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_kind TEXT NOT NULL CHECK (request_kind IN ('account_open', 'settlement')),
  account_type fin_account_type NOT NULL,
  receivable_id UUID REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  payable_id UUID REFERENCES fin_accounts_payable(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(200) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint CHAR(64) NOT NULL,
  actor_identity UUID NOT NULL REFERENCES auth_identities(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  result_status fin_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_settlement_request_account_ref CHECK (
    (account_type = 'receber' AND receivable_id IS NOT NULL AND payable_id IS NULL)
    OR (account_type = 'pagar' AND payable_id IS NOT NULL AND receivable_id IS NULL)
  )
);

-- Idempotência por intenção: a mesma chave não pode produzir dois efeitos
-- materiais, nem na abertura da conta nem na baixa.
CREATE UNIQUE INDEX IF NOT EXISTS fin_settlement_requests_kind_key_unique
  ON fin_settlement_requests (request_kind, idempotency_key);
CREATE INDEX IF NOT EXISTS fin_settlement_requests_receivable_idx
  ON fin_settlement_requests (receivable_id, created_at ASC) WHERE receivable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_settlement_requests_payable_idx
  ON fin_settlement_requests (payable_id, created_at ASC) WHERE payable_id IS NOT NULL;

COMMENT ON TABLE fin_settlement_requests IS
  'Ledger de idempotência da jornada canônica conta → baixa → relatório (F03). Append-only por API; gravado na mesma transação do efeito material.';
COMMENT ON COLUMN fin_settlement_requests.request_fingerprint IS
  'SHA-256 do conteúdo normalizado da intenção; replay idêntico devolve o estado atual, divergente responde 409 idempotency_conflict.';

CREATE TABLE IF NOT EXISTS fin_canonical_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type fin_account_type NOT NULL,
  receivable_id UUID REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  payable_id UUID REFERENCES fin_accounts_payable(id) ON DELETE CASCADE,
  opened_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_canonical_account_ref CHECK (
    (account_type = 'receber' AND receivable_id IS NOT NULL AND payable_id IS NULL)
    OR (account_type = 'pagar' AND payable_id IS NOT NULL AND receivable_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fin_canonical_accounts_receivable_unique
  ON fin_canonical_accounts (receivable_id) WHERE receivable_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_canonical_accounts_payable_unique
  ON fin_canonical_accounts (payable_id) WHERE payable_id IS NOT NULL;

COMMENT ON TABLE fin_canonical_accounts IS
  'Contas sob governança da rota canônica F03. Para elas, a baixa e a mudança de situação legadas (FIN-01/02/04) respondem 410: a baixa só existe pela máquina de estados canônica, com idempotência e auditoria transacional.';

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
      'fin_account_open', 'fin_account_settle', 'fin_settlement_report_read'
    );
  END IF;
END
$audit_actions$;

COMMIT;

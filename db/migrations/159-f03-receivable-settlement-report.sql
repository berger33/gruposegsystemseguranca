-- 159 · F03 · quarta e última jornada: conta a receber → baixa → relatório.
-- Aditiva sobre 001–158 (nenhuma tabela ou coluna anterior é removida).
--
-- 1) fin_accounts_receivable ganha a chave de idempotência da abertura
--    canônica. A conta continua sendo a ÚNICA fonte do saldo; a chave só
--    impede que o mesmo clique/retry crie duas contas materialmente iguais.
--
-- 2) fin_receivable_settlements: trilha canônica da baixa. Cada baixa nasce
--    na MESMA transação do UPDATE do saldo, do fin_payments, do
--    fin_payment_history e da auditoria. A tabela é append-only e guarda a
--    chave de idempotência por conta + fingerprint do conteúdo integral, de
--    modo que replay idêntico devolve o estado atual e a mesma chave com
--    conteúdo divergente responde 409 sem efeito material.
--    Ela NÃO substitui fin_payments/fin_payment_history (fontes canônicas do
--    dinheiro e do histórico): é o registro do pedido de baixa que os gerou.
--
-- 3) fin_receivable_report_emissions: recibo imutável de um relatório
--    emitido. O relatório é SEMPRE recalculado a partir das contas e baixas
--    canônicas; a emissão guarda apenas os totais e o SHA-256 do conteúdo
--    daquele instante, para que qualquer leitura posterior possa dizer com
--    honestidade se o relatório emitido ainda corresponde ao banco. A emissão
--    nunca vira fonte de saldo.
--
-- 4) auth_access_audit passa a conhecer receivable_open, receivable_settle e
--    receivable_report_emit.

BEGIN;

-- 1 ---------------------------------------------------------------------
ALTER TABLE fin_accounts_receivable
  ADD COLUMN IF NOT EXISTS canonical_idempotency_key VARCHAR(200);
ALTER TABLE fin_accounts_receivable
  ADD COLUMN IF NOT EXISTS canonical_request_fingerprint CHAR(64);

DO $receivable_fingerprint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'fin_accounts_receivable'::regclass
       AND conname = 'fin_receivable_canonical_fingerprint_format'
  ) THEN
    ALTER TABLE fin_accounts_receivable
      ADD CONSTRAINT fin_receivable_canonical_fingerprint_format
      CHECK (canonical_request_fingerprint IS NULL OR canonical_request_fingerprint ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;
END
$receivable_fingerprint$;

-- A chave vale por autor: dois operadores distintos nunca disputam a mesma
-- impressão, e o mesmo operador nunca abre duas contas com um clique repetido.
CREATE UNIQUE INDEX IF NOT EXISTS fin_accounts_receivable_canonical_idempotency_unique
  ON fin_accounts_receivable (created_by_identity, canonical_idempotency_key)
  WHERE canonical_idempotency_key IS NOT NULL;

COMMENT ON COLUMN fin_accounts_receivable.canonical_idempotency_key IS
  'Chave de idempotência da abertura canônica (POST /api/admin/finance/l07/receivables). Contas legadas permanecem NULL.';
COMMENT ON COLUMN fin_accounts_receivable.canonical_request_fingerprint IS
  'SHA-256 do conteúdo normalizado da abertura; replay idêntico devolve a conta existente, divergente responde 409.';

-- 2 ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_receivable_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID NOT NULL REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES fin_payments(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  previous_status fin_status NOT NULL,
  next_status fin_status NOT NULL,
  previous_paid_cents BIGINT NOT NULL CHECK (previous_paid_cents >= 0),
  next_paid_cents BIGINT NOT NULL CHECK (next_paid_cents > 0),
  payment_method fin_payment_method NOT NULL DEFAULT 'pix',
  settled_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  settled_by_role TEXT NOT NULL CHECK (settled_by_role IN ('admin', 'ti', 'rh', 'marcelo', 'supervisor', 'comercial', 'financeiro')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  idempotency_key VARCHAR(200) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_settlement_next_status_allowed CHECK (next_status IN ('parcial', 'recebido')),
  CONSTRAINT fin_settlement_previous_status_allowed CHECK (previous_status IN ('pendente', 'parcial', 'vencido')),
  CONSTRAINT fin_settlement_progress CHECK (next_paid_cents = previous_paid_cents + amount_cents)
);

CREATE UNIQUE INDEX IF NOT EXISTS fin_receivable_settlements_idempotency_unique
  ON fin_receivable_settlements (receivable_id, idempotency_key);
CREATE INDEX IF NOT EXISTS fin_receivable_settlements_receivable_idx
  ON fin_receivable_settlements (receivable_id, created_at ASC);

COMMENT ON TABLE fin_receivable_settlements IS
  'Trilha canônica das baixas de contas a receber: um registro por pedido aceito, na mesma transação do saldo, do pagamento, do histórico e da auditoria. Append-only; a fonte do dinheiro continua em fin_payments.';

-- 3 ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_receivable_report_emissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^REL-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  competence_month DATE NOT NULL,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE CASCADE,
  scope_account_ids UUID[] NOT NULL,
  account_count INTEGER NOT NULL CHECK (account_count >= 0),
  receivable_count INTEGER NOT NULL CHECK (receivable_count >= 0),
  settlement_count INTEGER NOT NULL CHECK (settlement_count >= 0),
  total_receivable_cents BIGINT NOT NULL CHECK (total_receivable_cents >= 0),
  total_settled_cents BIGINT NOT NULL CHECK (total_settled_cents >= 0),
  total_open_cents BIGINT NOT NULL CHECK (total_open_cents >= 0),
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 10 AND 1000),
  emitted_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  emitted_by_role TEXT NOT NULL CHECK (emitted_by_role IN ('admin', 'ti', 'rh', 'marcelo', 'supervisor', 'comercial', 'financeiro')),
  idempotency_key VARCHAR(200) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_report_emission_month_first_day CHECK (competence_month = date_trunc('month', competence_month)::date),
  CONSTRAINT fin_report_emission_totals CHECK (total_open_cents = total_receivable_cents - total_settled_cents)
);

CREATE UNIQUE INDEX IF NOT EXISTS fin_receivable_report_emissions_idempotency_unique
  ON fin_receivable_report_emissions (emitted_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS fin_receivable_report_emissions_competence_idx
  ON fin_receivable_report_emissions (competence_month DESC, created_at DESC);

COMMENT ON TABLE fin_receivable_report_emissions IS
  'Recibo imutável de relatório financeiro emitido: competência, recorte autorizado, totais e SHA-256 do conteúdo calculado naquele instante. O relatório é sempre recalculado das fontes canônicas; a emissão só permite dizer se ainda confere.';

-- Append-only: nem a baixa nem o recibo do relatório podem ser reescritos.
CREATE OR REPLACE FUNCTION fin_f03_block_rewrite() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fin_f03_append_only_table';
END $$;

DROP TRIGGER IF EXISTS trg_fin_receivable_settlements_append_only ON fin_receivable_settlements;
CREATE TRIGGER trg_fin_receivable_settlements_append_only
BEFORE UPDATE OR DELETE ON fin_receivable_settlements
FOR EACH ROW EXECUTE FUNCTION fin_f03_block_rewrite();

DROP TRIGGER IF EXISTS trg_fin_report_emissions_append_only ON fin_receivable_report_emissions;
CREATE TRIGGER trg_fin_report_emissions_append_only
BEFORE UPDATE OR DELETE ON fin_receivable_report_emissions
FOR EACH ROW EXECUTE FUNCTION fin_f03_block_rewrite();

-- 4 ---------------------------------------------------------------------
DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check'
     AND contype = 'c';
  IF previous_check IS NOT NULL AND previous_check NOT LIKE '%receivable_settle%' THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L)) NOT VALID',
      previous_check,
      'receivable_open', 'receivable_settle', 'receivable_report_emit'
    );
  END IF;
END
$audit_actions$;

COMMIT;

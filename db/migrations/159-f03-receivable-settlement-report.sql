-- 159 · F03 · jornada canônica contas → baixa → relatório.
-- Aditiva sobre 001–158: a fonte financeira continua sendo
-- fin_accounts_receivable / fin_payments / fin_payment_history.
BEGIN;

ALTER TABLE fin_payments
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS fin_payments_receivable_idempotency_uq
  ON fin_payments(receivable_id, idempotency_key)
  WHERE receivable_id IS NOT NULL AND idempotency_key IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE fin_payments ADD CONSTRAINT fin_payments_idempotency_key_format
    CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 200) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE fin_payments ADD CONSTRAINT fin_payments_request_fingerprint_format
    CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fin_f03_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^REL-F03-[0-9]{8}-[A-Z0-9]{4}$'),
  account_id UUID REFERENCES client_accounts(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  settled_cents BIGINT NOT NULL CHECK (settled_cents >= 0),
  remaining_cents BIGINT NOT NULL CHECK (remaining_cents >= 0),
  snapshot JSONB NOT NULL,
  generated_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(200) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE(generated_by_identity, idempotency_key)
);
CREATE INDEX IF NOT EXISTS fin_f03_reports_account_created_idx
  ON fin_f03_reports(account_id, created_at DESC);

COMMENT ON TABLE fin_f03_reports IS
  'Snapshot limitado e imutável da jornada F03 contas→baixa→relatório; não representa integração bancária nem envio externo.';

-- O papel financeiro recebe um conjunto explícito (ainda registrado em
-- auth_permissions) para manter o workspace vigente funcional. Não existe
-- bypass por rótulo: remover a concessão revoga o acesso imediatamente.
CREATE OR REPLACE FUNCTION provision_financeiro_role_permissions() RETURNS trigger AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.role='financeiro' AND NEW.role<>'financeiro' THEN
    UPDATE auth_permissions SET revoked_at=NOW(),revoke_reason='Papel financeiro removido; concessão padrão revogada'
     WHERE identity_id=NEW.identity_id AND revoked_at IS NULL AND granted_by IS NULL
       AND permission LIKE 'financeiro.%' AND reason='Conjunto padrão do papel financeiro F03';
  END IF;
  IF NEW.role='financeiro' THEN
    INSERT INTO auth_permissions(id,identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason)
    SELECT gen_random_uuid(),NEW.identity_id,p,'organization',NULL,NULL,'system','Conjunto padrão do papel financeiro F03'
      FROM unnest(ARRAY['financeiro.receivables.read','financeiro.receivables.write','financeiro.reports.read','financeiro.reports.generate']) p
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_staff_profiles_financeiro_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_financeiro_permissions
  AFTER INSERT OR UPDATE OF role ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_financeiro_role_permissions();
INSERT INTO auth_permissions(id,identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason)
SELECT gen_random_uuid(),s.identity_id,p,'organization',NULL,NULL,'system','Conjunto padrão do papel financeiro F03'
  FROM auth_staff_profiles s
  CROSS JOIN unnest(ARRAY['financeiro.receivables.read','financeiro.receivables.write','financeiro.reports.read','financeiro.reports.generate']) p
 WHERE s.role='financeiro'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_fin_f03_report_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'fin_f03_reports is immutable'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_f03_reports_immutable ON fin_f03_reports;
CREATE TRIGGER trg_fin_f03_reports_immutable
  BEFORE UPDATE OR DELETE ON fin_f03_reports
  FOR EACH ROW EXECUTE FUNCTION prevent_fin_f03_report_mutation();

COMMIT;

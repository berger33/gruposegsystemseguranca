-- FIN-14/15/16 — garantias aditivas exigidas pelas jornadas operacionais.
-- Linhas históricas permanecem válidas: as novas chaves/fingerprints são
-- anuláveis e os índices únicos consideram apenas valores preenchidos.

ALTER TABLE fin_exports
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
ALTER TABLE fin_commission_provisions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
ALTER TABLE fin_competence_closures
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_export_request_fingerprint_format') THEN
    ALTER TABLE fin_exports ADD CONSTRAINT fin_export_request_fingerprint_format
      CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_commission_idempotency_key_format') THEN
    ALTER TABLE fin_commission_provisions ADD CONSTRAINT fin_commission_idempotency_key_format
      CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 200) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_commission_request_fingerprint_format') THEN
    ALTER TABLE fin_commission_provisions ADD CONSTRAINT fin_commission_request_fingerprint_format
      CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_closure_request_fingerprint_format') THEN
    ALTER TABLE fin_competence_closures ADD CONSTRAINT fin_closure_request_fingerprint_format
      CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fin_commission_provisions_idempotency_key_uq
  ON fin_commission_provisions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Uma competência fechada não aceita criação, alteração ou exclusão direta de
-- lançamentos-base. A reabertura explícita remove a trava. A comparação é pelo
-- mês, pois competence_date pode representar qualquer dia da competência.
CREATE OR REPLACE FUNCTION fin_assert_competence_open() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  checked_date date;
BEGIN
  checked_date := CASE WHEN TG_OP='DELETE' THEN OLD.competence_date ELSE NEW.competence_date END;
  IF EXISTS (
    SELECT 1 FROM fin_competence_closures c
     WHERE date_trunc('month', c.competence_date)::date = date_trunc('month', checked_date)::date
       AND c.status IN ('fechada','bloqueada')
  ) THEN
    RAISE EXCEPTION 'fin_competence_closed';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_fin_receivable_competence_open ON fin_accounts_receivable;
CREATE TRIGGER trg_fin_receivable_competence_open
BEFORE INSERT OR UPDATE OR DELETE ON fin_accounts_receivable
FOR EACH ROW EXECUTE FUNCTION fin_assert_competence_open();

DROP TRIGGER IF EXISTS trg_fin_payable_competence_open ON fin_accounts_payable;
CREATE TRIGGER trg_fin_payable_competence_open
BEFORE INSERT OR UPDATE OR DELETE ON fin_accounts_payable
FOR EACH ROW EXECUTE FUNCTION fin_assert_competence_open();

DROP TRIGGER IF EXISTS trg_fin_cost_competence_open ON fin_costs;
CREATE TRIGGER trg_fin_cost_competence_open
BEFORE INSERT OR UPDATE OR DELETE ON fin_costs
FOR EACH ROW EXECUTE FUNCTION fin_assert_competence_open();

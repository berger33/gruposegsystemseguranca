-- FIN-14/15/16 jornadas operacionais: chaves de retry e bloqueio de lançamentos
-- em competência fechada. Aditiva; linhas legadas permanecem explicitamente
-- sem chave/fingerprint. Constraints entram NOT VALID conforme a política L07.

ALTER TABLE fin_exports ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE fin_exports ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
ALTER TABLE fin_competence_closures ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE fin_competence_closures ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
ALTER TABLE fin_commission_provisions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE fin_commission_provisions ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_export_idempotency_pair') THEN
    ALTER TABLE fin_exports ADD CONSTRAINT fin_export_idempotency_pair CHECK (
      (idempotency_key IS NULL AND content_fingerprint IS NULL) OR
      (char_length(idempotency_key) BETWEEN 8 AND 200 AND content_fingerprint ~ '^[0-9a-f]{64}$')
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_closure_idempotency_pair') THEN
    ALTER TABLE fin_competence_closures ADD CONSTRAINT fin_closure_idempotency_pair CHECK (
      (idempotency_key IS NULL AND content_fingerprint IS NULL) OR
      (char_length(idempotency_key) BETWEEN 8 AND 200 AND content_fingerprint ~ '^[0-9a-f]{64}$')
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_commission_idempotency_pair') THEN
    ALTER TABLE fin_commission_provisions ADD CONSTRAINT fin_commission_idempotency_pair CHECK (
      (idempotency_key IS NULL AND content_fingerprint IS NULL) OR
      (char_length(idempotency_key) BETWEEN 8 AND 200 AND content_fingerprint ~ '^[0-9a-f]{64}$')
    ) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fin_exports_idempotency_key_uq ON fin_exports(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_closures_idempotency_key_uq ON fin_competence_closures(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_commission_provisions_idempotency_key_uq ON fin_commission_provisions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Um fechamento mensal bloqueia novos lançamentos e mudanças nos lançamentos
-- canônicos a receber/a pagar, inclusive SQL direto. Reabertura libera o mês.
CREATE OR REPLACE FUNCTION fin15_block_closed_competence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_date date;
  closed_exists boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN target_date := OLD.competence_date;
  ELSE target_date := NEW.competence_date;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM fin_competence_closures c
     WHERE date_trunc('month', c.competence_date)::date = date_trunc('month', target_date)::date
       AND c.status = 'fechada'
  ) INTO closed_exists;

  IF closed_exists THEN RAISE EXCEPTION 'fin_competence_closed'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fin_receivable_closed_competence ON fin_accounts_receivable;
CREATE TRIGGER trg_fin_receivable_closed_competence BEFORE INSERT OR UPDATE OR DELETE ON fin_accounts_receivable
FOR EACH ROW EXECUTE FUNCTION fin15_block_closed_competence();
DROP TRIGGER IF EXISTS trg_fin_payable_closed_competence ON fin_accounts_payable;
CREATE TRIGGER trg_fin_payable_closed_competence BEFORE INSERT OR UPDATE OR DELETE ON fin_accounts_payable
FOR EACH ROW EXECUTE FUNCTION fin15_block_closed_competence();

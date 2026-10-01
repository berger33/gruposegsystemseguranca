-- FIN-07 hardening: snapshots de fluxo de caixa e aging são dados financeiros
-- sintéticos, auditáveis e coerentes com o recebível canônico. A migration 078
-- deixou estes objetos como rascunho; esta alteração é aditiva e preserva as
-- linhas existentes, permitindo mais de uma competência de aging por recebível.

ALTER TABLE fin_aging_receivables
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_paid_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_remaining_cents BIGINT
    GENERATED ALWAYS AS (amount_cents - amount_paid_cents) STORED;

-- Backfill somente do vínculo derivável do recebível canônico. A API não aceita
-- um cliente/contrato arbitrário para uma nova linha de aging.
UPDATE fin_aging_receivables aging
   SET contract_id = receivable.contract_id
  FROM fin_accounts_receivable receivable
 WHERE receivable.id = aging.receivable_id
   AND aging.contract_id IS NULL;

ALTER TABLE fin_aging_receivables
  DROP CONSTRAINT IF EXISTS fin_aging_receivables_receivable_id_key;

DO $$ BEGIN
  ALTER TABLE fin_aging_receivables
    ADD CONSTRAINT chk_fin_aging_amount_paid
    CHECK (amount_paid_cents >= 0 AND amount_paid_cents <= amount_cents);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE fin_aging_receivables
    ADD CONSTRAINT fin_aging_receivables_receivable_competence_key
    UNIQUE (receivable_id, competence_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS fin_aging_receivables_competence_idx
  ON fin_aging_receivables(competence_date DESC);

-- Escritas diretas também precisam respeitar o recebível canônico e a faixa
-- calculada pela competência. Isso impede que uma UI/API futura falsifique
-- bucket, cliente, contrato ou vencimento.
CREATE OR REPLACE FUNCTION validate_fin_aging_receivable_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  canonical RECORD;
  expected_bucket fin_aging_bucket;
  overdue_days INT;
BEGIN
  SELECT id, client_account_id, contract_id, due_date
    INTO canonical
    FROM fin_accounts_receivable
   WHERE id = NEW.receivable_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin aging receivable does not exist';
  END IF;
  IF NEW.client_account_id IS DISTINCT FROM canonical.client_account_id THEN
    RAISE EXCEPTION 'fin aging client account does not match receivable';
  END IF;
  IF NEW.contract_id IS DISTINCT FROM canonical.contract_id THEN
    RAISE EXCEPTION 'fin aging contract does not match receivable';
  END IF;
  IF NEW.due_date IS DISTINCT FROM canonical.due_date THEN
    RAISE EXCEPTION 'fin aging due date does not match receivable';
  END IF;
  IF NEW.amount_paid_cents < 0 OR NEW.amount_paid_cents > NEW.amount_cents THEN
    RAISE EXCEPTION 'fin aging paid amount is invalid';
  END IF;

  overdue_days := GREATEST(0, NEW.competence_date - NEW.due_date);
  expected_bucket := CASE
    WHEN overdue_days = 0 THEN 'a_vencer'::fin_aging_bucket
    WHEN overdue_days <= 30 THEN 'vencido_0_30'::fin_aging_bucket
    WHEN overdue_days <= 60 THEN 'vencido_31_60'::fin_aging_bucket
    WHEN overdue_days <= 90 THEN 'vencido_61_90'::fin_aging_bucket
    ELSE 'vencido_90_plus'::fin_aging_bucket
  END;
  IF NEW.bucket IS DISTINCT FROM expected_bucket THEN
    RAISE EXCEPTION 'fin aging bucket does not match competence and due date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_fin_aging_receivable_snapshot ON fin_aging_receivables;
CREATE TRIGGER trg_validate_fin_aging_receivable_snapshot
  BEFORE INSERT OR UPDATE ON fin_aging_receivables
  FOR EACH ROW EXECUTE FUNCTION validate_fin_aging_receivable_snapshot();

-- FIN-08 hardening: custos sintéticos por cliente/contrato/posto, com origem,
-- competência, importação idempotente e regra de rateio verificável. A migration
-- 078 criou o rascunho; esta migration é aditiva e não altera seu histórico.

ALTER TABLE fin_costs
  ADD COLUMN IF NOT EXISTS source_amount_cents BIGINT,
  ADD COLUMN IF NOT EXISTS import_record_key TEXT;

-- Linhas históricas do rascunho continuam legíveis. Novas linhas passam pelo
-- trigger e sempre recebem o valor de origem explícito.
UPDATE fin_costs
   SET source_amount_cents = CASE
     WHEN rateio_percent > 0 THEN ROUND(amount_cents * 100.0 / rateio_percent)::BIGINT
     ELSE amount_cents
   END
 WHERE source_amount_cents IS NULL;

ALTER TABLE fin_costs
  ALTER COLUMN source_amount_cents SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE fin_costs
    ADD CONSTRAINT chk_fin_cost_source_amount_positive
    CHECK (source_amount_cents > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE fin_costs
    ADD CONSTRAINT chk_fin_cost_allocated_amount_positive
    CHECK (amount_cents > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE fin_costs
    ADD CONSTRAINT chk_fin_cost_import_record_key
    CHECK (
      (import_id IS NULL AND import_record_key IS NULL)
      OR
      (import_id IS NOT NULL AND char_length(import_record_key) BETWEEN 1 AND 200)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fin_costs_import_record_unique_idx
  ON fin_costs(import_id, import_record_key)
  WHERE import_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fin_costs_competence_idx
  ON fin_costs(competence_date DESC);

-- Protege também escritas diretas: conta é obrigatória; contrato pertence à
-- conta; posto só pode ser usado quando estiver no escopo canônico do mesmo
-- contrato/conta; importação deve ter a mesma origem e competência; valor
-- alocado é o arredondamento em centavos do valor de origem pelo percentual.
CREATE OR REPLACE FUNCTION validate_fin08_cost_allocation()
RETURNS TRIGGER AS $$
DECLARE
  canonical_account UUID;
  import_row RECORD;
  expected_amount BIGINT;
BEGIN
  IF NEW.client_account_id IS NULL THEN
    RAISE EXCEPTION 'fin cost requires client account';
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT client_account_id INTO canonical_account
      FROM client_contracts
     WHERE id = NEW.contract_id;
    IF NOT FOUND OR canonical_account IS DISTINCT FROM NEW.client_account_id THEN
      RAISE EXCEPTION 'fin cost contract does not belong to client account';
    END IF;
  END IF;

  IF NEW.post_id IS NOT NULL THEN
    IF NEW.contract_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM cli_contract_scopes scope
       WHERE scope.post_id = NEW.post_id
         AND scope.contract_id = NEW.contract_id
         AND scope.client_account_id = NEW.client_account_id
    ) THEN
      RAISE EXCEPTION 'fin cost post is outside canonical contract scope';
    END IF;
  END IF;

  IF NEW.import_id IS NOT NULL THEN
    SELECT source, competence_date, total_costs_cents, total_records
      INTO import_row
      FROM fin_cost_imports
     WHERE id = NEW.import_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'fin cost import does not exist';
    END IF;
    IF NEW.cost_source IS DISTINCT FROM import_row.source
       OR NEW.competence_date IS DISTINCT FROM import_row.competence_date THEN
      RAISE EXCEPTION 'fin cost does not match import source and competence';
    END IF;
    IF import_row.total_records > 0 AND (
      SELECT COUNT(*) FROM fin_costs WHERE import_id = NEW.import_id AND id IS DISTINCT FROM NEW.id
    ) >= import_row.total_records THEN
      RAISE EXCEPTION 'fin cost import record limit exceeded';
    END IF;
    IF import_row.total_costs_cents > 0 AND (
      SELECT COALESCE(SUM(amount_cents), 0) FROM fin_costs WHERE import_id = NEW.import_id AND id IS DISTINCT FROM NEW.id
    ) + NEW.amount_cents > import_row.total_costs_cents THEN
      RAISE EXCEPTION 'fin cost import amount exceeded';
    END IF;
  END IF;

  expected_amount := ROUND(NEW.source_amount_cents::NUMERIC * NEW.rateio_percent / 100)::BIGINT;
  IF NEW.rateio_percent <= 0 OR expected_amount IS DISTINCT FROM NEW.amount_cents THEN
    RAISE EXCEPTION 'fin cost allocated amount does not match documented rateio';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_fin08_cost_allocation ON fin_costs;
CREATE TRIGGER trg_validate_fin08_cost_allocation
  BEFORE INSERT OR UPDATE ON fin_costs
  FOR EACH ROW EXECUTE FUNCTION validate_fin08_cost_allocation();

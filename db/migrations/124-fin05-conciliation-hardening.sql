-- FIN-05 hardening: uma transação bancária sintética só pode ter uma
-- conciliação, inclusive quando a mesma sugestão chega em paralelo.
-- O índice parcial mantém linhas legadas sem bank_transaction_id fora da
-- conciliação, mas torna a referência bancária idempotente para novas linhas.
CREATE UNIQUE INDEX IF NOT EXISTS fin_conciliations_bank_transaction_unique_idx
  ON fin_conciliations (bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

-- A API também valida este limite; o CHECK impede escrita direta inválida.
DO $$ BEGIN
  ALTER TABLE fin_conciliations
    ADD CONSTRAINT chk_conciliation_amount_nonnegative
    CHECK (amount_matched_cents IS NULL OR amount_matched_cents >= 0)
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

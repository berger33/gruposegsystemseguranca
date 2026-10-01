-- FIN-05: cada movimento bancário sintético pode apontar para uma única sugestão
-- de conciliação. A relação deixa de aceitar referências vazias ou duas contas.
-- Não corrige dados existentes silenciosamente: uma base com duplicidade deve ser
-- saneada explicitamente antes de aplicar esta migração.

LOCK TABLE fin_conciliations IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE fin_conciliations
  DROP CONSTRAINT IF EXISTS fin_conciliations_receivable_id_fkey,
  DROP CONSTRAINT IF EXISTS fin_conciliations_payable_id_fkey,
  DROP CONSTRAINT IF EXISTS fin_conciliations_bank_transaction_id_fkey;

ALTER TABLE fin_conciliations
  ADD CONSTRAINT fin_conciliations_receivable_id_fkey
    FOREIGN KEY (receivable_id) REFERENCES fin_accounts_receivable(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fin_conciliations_payable_id_fkey
    FOREIGN KEY (payable_id) REFERENCES fin_accounts_payable(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fin_conciliations_bank_transaction_id_fkey
    FOREIGN KEY (bank_transaction_id) REFERENCES fin_bank_transactions(id) ON DELETE RESTRICT;

ALTER TABLE fin_conciliations
  ADD CONSTRAINT fin05_conciliation_requires_one_account_and_transaction
  CHECK (
    bank_transaction_id IS NOT NULL
    AND ((receivable_id IS NOT NULL) <> (payable_id IS NOT NULL))
  );

CREATE UNIQUE INDEX fin05_one_conciliation_per_bank_transaction_idx
  ON fin_conciliations (bank_transaction_id);

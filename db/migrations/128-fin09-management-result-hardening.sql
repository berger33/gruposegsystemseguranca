-- FIN-09: hardening aditivo do resultado gerencial; não altera migrações históricas.
ALTER TABLE fin_management_results
  ADD CONSTRAINT fin_result_nonnegative_values CHECK (
    (revenue_contracted_cents IS NULL OR revenue_contracted_cents >= 0) AND
    (revenue_billed_cents IS NULL OR revenue_billed_cents >= 0) AND
    (revenue_received_cents IS NULL OR revenue_received_cents >= 0) AND
    (costs_cents IS NULL OR costs_cents >= 0) AND
    (cash_cents IS NULL OR cash_cents >= 0)
  );
ALTER TABLE fin_management_results
  ADD CONSTRAINT fin_result_margin_matches_values CHECK (
    margin_percent IS NULL OR (is_complete = true AND revenue_received_cents IS NOT NULL AND costs_cents IS NOT NULL)
  );
CREATE INDEX IF NOT EXISTS fin_management_results_client_competence_idx
  ON fin_management_results(client_account_id, competence_date);

CREATE OR REPLACE FUNCTION fin_result_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_result_history_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_result_history_immutable ON fin_result_history;
CREATE TRIGGER trg_fin_result_history_immutable
  BEFORE UPDATE OR DELETE ON fin_result_history
  FOR EACH ROW EXECUTE FUNCTION fin_result_history_immutable();

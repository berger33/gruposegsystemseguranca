-- FIN-10: hardening aditivo de despesas, reembolsos e compras.
-- Evidência é somente metadado sintético; nenhuma integração ou compra é executada.

CREATE TABLE IF NOT EXISTS fin_expense_approval_authorities (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE RESTRICT,
  max_amount_cents BIGINT NOT NULL CHECK (max_amount_cents > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  granted_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fin_expenses
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_expenses_idempotency_key_key
  ON fin_expenses(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserva eventuais registros históricos, mas as regras são aplicadas
-- imediatamente a toda nova despesa e a toda alteração.
ALTER TABLE fin_expenses
  ADD CONSTRAINT fin_expense_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_expenses
  ADD CONSTRAINT fin_expense_canonical_references_required
  CHECK (contract_id IS NOT NULL AND cost_center_id IS NOT NULL AND supplier_id IS NOT NULL) NOT VALID;
ALTER TABLE fin_expenses
  ADD CONSTRAINT fin_expense_requester_required
  CHECK (requester_identity IS NOT NULL AND created_by_identity = requester_identity) NOT VALID;
ALTER TABLE fin_expenses
  ADD CONSTRAINT fin_expense_threshold_required
  CHECK (threshold_cents IS NOT NULL AND threshold_cents > 0) NOT VALID;
ALTER TABLE fin_expenses
  ADD CONSTRAINT fin_expense_synthetic_evidence_required
  CHECK (
    evidence_file_name IS NOT NULL
    AND char_length(trim(evidence_file_name)) BETWEEN 1 AND 500
    AND evidence_file_url IS NOT NULL
    AND evidence_file_url ~ '^synthetic://[A-Za-z0-9][A-Za-z0-9._/-]+$'
    AND evidence_storage_key IS NOT NULL
    AND evidence_storage_key ~ '^synthetic/[A-Za-z0-9][A-Za-z0-9._/-]+$'
  ) NOT VALID;
ALTER TABLE fin_expenses
  ADD CONSTRAINT fin_expense_decision_fields
  CHECK (
    (status = 'pendente' AND approved_at IS NULL AND approved_by_identity IS NULL AND rejection_reason IS NULL)
    OR (status = 'aprovado' AND approver_identity IS NOT NULL AND approved_by_identity = approver_identity AND approved_at IS NOT NULL AND rejection_reason IS NULL)
    OR (status = 'rejeitado' AND approver_identity IS NOT NULL AND approved_by_identity IS NULL AND approved_at IS NULL AND rejection_reason IS NOT NULL)
    OR (status = 'cancelado' AND approved_by_identity IS NULL AND approved_at IS NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin10_guard_expense_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  authority_limit BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_expense_initial_status_must_be_pending' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'fin_expense_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'pendente' OR NEW.status NOT IN ('aprovado','rejeitado','cancelado') THEN
      RAISE EXCEPTION 'fin_expense_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
    IF NEW.id <> OLD.id OR NEW.protocol <> OLD.protocol OR NEW.expense_type <> OLD.expense_type
       OR NEW.category <> OLD.category OR NEW.description <> OLD.description
       OR NEW.amount_cents <> OLD.amount_cents OR NEW.threshold_cents <> OLD.threshold_cents
       OR NEW.requester_name <> OLD.requester_name OR NEW.requester_identity <> OLD.requester_identity
       OR NEW.evidence_file_name <> OLD.evidence_file_name OR NEW.evidence_file_url <> OLD.evidence_file_url
       OR NEW.evidence_storage_key <> OLD.evidence_storage_key OR NEW.contract_id <> OLD.contract_id
       OR NEW.cost_center_id <> OLD.cost_center_id OR NEW.supplier_id <> OLD.supplier_id
       OR NEW.created_by_identity <> OLD.created_by_identity OR NEW.idempotency_key <> OLD.idempotency_key THEN
      RAISE EXCEPTION 'fin_expense_request_fields_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status IN ('aprovado','rejeitado') THEN
    IF NEW.approver_identity IS NULL OR NEW.approver_identity = NEW.requester_identity THEN
      RAISE EXCEPTION 'fin_expense_segregation_required' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'aprovado' THEN
    SELECT max_amount_cents INTO authority_limit
      FROM fin_expense_approval_authorities
     WHERE identity_id = NEW.approver_identity AND is_active = true;
    IF authority_limit IS NULL OR NEW.amount_cents > authority_limit THEN
      RAISE EXCEPTION 'fin_expense_approval_authority_exceeded' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin10_guard_expense_write ON fin_expenses;
CREATE TRIGGER trg_fin10_guard_expense_write
  BEFORE INSERT OR UPDATE ON fin_expenses
  FOR EACH ROW EXECUTE FUNCTION fin10_guard_expense_write();

CREATE OR REPLACE FUNCTION fin_expense_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_expense_history_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_expense_history_immutable ON fin_expense_history;
CREATE TRIGGER trg_fin_expense_history_immutable
  BEFORE UPDATE OR DELETE ON fin_expense_history
  FOR EACH ROW EXECUTE FUNCTION fin_expense_history_immutable();

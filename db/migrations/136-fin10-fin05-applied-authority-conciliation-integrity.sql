-- FIN-10 + FIN-05: garantias residuais em fatia aditiva (migrações 001–135
-- permanecem intactas; nada aqui é reescrito).
--
-- FIN-10: a decisão de aprovação registra a alçada efetivamente aplicada na
-- própria despesa e no histórico imutável (com snapshot anterior/posterior), e
-- a exclusão de despesa — que apagaria a trilha por CASCADE — passa a ser
-- recusada pelo banco. Nenhuma política de alçada é inventada aqui: o catálogo
-- fin_expense_approval_authorities continua vazio por padrão e a ausência de
-- política continua significando "ninguém aprova", nunca aprovação automática.
--
-- FIN-05 (resíduos úteis da PR #47, adaptados ao modelo canônico): a
-- conciliação passa a exigir, no banco, exatamente uma conta e um movimento, e
-- os vínculos deixam de se perder silenciosamente em exclusões (ON DELETE
-- RESTRICT). A conciliação FIN-12 -> FIN-04 entregue pela migração 135 não
-- usa fin_conciliations e permanece intacta.

ALTER TABLE fin_expenses
  ADD COLUMN IF NOT EXISTS applied_authority_limit_cents BIGINT;

ALTER TABLE fin_expense_history
  ADD COLUMN IF NOT EXISTS authority_limit_cents BIGINT,
  ADD COLUMN IF NOT EXISTS is_authority_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snapshot_before JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_after JSONB;

-- NOT VALID preserva aprovações históricas (sem limite aplicado registrado);
-- toda nova escrita passa a exigir limite aplicado >= valor na aprovação.
DO $$ BEGIN
  ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_applied_authority_limit
    CHECK (
      (status = 'aprovado' AND applied_authority_limit_cents IS NOT NULL AND applied_authority_limit_cents >= amount_cents)
      OR (status <> 'aprovado' AND applied_authority_limit_cents IS NULL)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Gatilho da 129 estendido por substituição de função (mesmo trigger): além da
-- máquina de estados, da imutabilidade dos campos do pedido e da alçada mínima,
-- a aprovação grava o limite efetivamente aplicado e o resto o mantém nulo.
CREATE OR REPLACE FUNCTION fin10_guard_expense_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  authority_limit BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_expense_initial_status_must_be_pending' USING ERRCODE = '23514';
    END IF;
    IF NEW.applied_authority_limit_cents IS NOT NULL THEN
      RAISE EXCEPTION 'fin_expense_applied_limit_only_on_approval' USING ERRCODE = '23514';
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
    IF authority_limit IS NULL THEN
      RAISE EXCEPTION 'fin_expense_approval_authority_missing' USING ERRCODE = '23514';
    END IF;
    IF NEW.amount_cents > authority_limit THEN
      RAISE EXCEPTION 'fin_expense_approval_authority_exceeded' USING ERRCODE = '23514';
    END IF;
    NEW.applied_authority_limit_cents := authority_limit;
  ELSE
    IF NEW.applied_authority_limit_cents IS NOT NULL THEN
      RAISE EXCEPTION 'fin_expense_applied_limit_only_on_approval' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trava de exclusão: apagar a despesa apagaria o histórico por CASCADE.
CREATE OR REPLACE FUNCTION fin10_expense_delete_forbidden() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin10_expense_delete_forbidden' USING ERRCODE = '23514'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin10_expense_delete_forbidden ON fin_expenses;
CREATE TRIGGER trg_fin10_expense_delete_forbidden
  BEFORE DELETE ON fin_expenses
  FOR EACH ROW EXECUTE FUNCTION fin10_expense_delete_forbidden();

-- FIN-05 — conta e movimento obrigatórios na própria tabela, e o vínculo não
-- se perde em exclusões. FKs trocadas de SET NULL para RESTRICT.
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

-- NOT VALID preserva linhas legadas sem movimento/conta; novas escritas exigem
-- exatamente uma conta e um movimento (a API já validava; agora o banco também).
DO $$ BEGIN
  ALTER TABLE fin_conciliations ADD CONSTRAINT fin05_conciliation_requires_account_and_transaction
    CHECK (
      bank_transaction_id IS NOT NULL
      AND ((receivable_id IS NOT NULL) <> (payable_id IS NOT NULL))
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

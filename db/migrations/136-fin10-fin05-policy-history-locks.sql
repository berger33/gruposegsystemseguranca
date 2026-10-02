-- FIN-10 (resíduos úteis #53) e FIN-05 (resíduos úteis #47): política de
-- alçada configurável, snapshot da alçada aplicada, trava de exclusão,
-- duplicidade natural pendente e conciliação exigindo movimento + uma conta.
--
-- Aditiva: nenhuma migração 001–135 é reescrita e nenhum dado é apagado.
-- Não cria pagamento, baixa, cobrança, recebível, pagável, saída externa ou
-- efeito financeiro. A ausência de política nunca aprova automaticamente.

-- (1) Alçada configurável: sem linha ativa, ninguém aprova. A autoaprovação
-- só passa a ser possível quando o dono da política a liga explicitamente;
-- o padrão continua exigindo aprovador distinto do solicitante.
ALTER TABLE fin_expense_approval_authorities
  ADD COLUMN IF NOT EXISTS allow_self_approval BOOLEAN NOT NULL DEFAULT false;

-- (2) Snapshot do limite efetivamente aplicado na aprovação. Se a alçada
-- mudar depois, a trilha continua comprovando por que aquela decisão foi
-- legítima no momento em que ocorreu.
ALTER TABLE fin_expenses ADD COLUMN IF NOT EXISTS approval_limit_cents BIGINT;
DO $$ BEGIN
  ALTER TABLE fin_expenses
    ADD CONSTRAINT fin_expense_approval_limit_snapshot
    CHECK (status <> 'aprovado' OR (approval_limit_cents IS NOT NULL AND approval_limit_cents >= amount_cents))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- (3) Histórico carrega a alçada aplicada e as identidades da transição.
ALTER TABLE fin_expense_history
  ADD COLUMN IF NOT EXISTS authority_limit_cents BIGINT,
  ADD COLUMN IF NOT EXISTS requester_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approver_identity UUID REFERENCES auth_identities(id);

-- (4) A segregação deixa o CHECK fixo da 079 e passa a ser decidida no
-- gatilho pela política: por padrão o solicitante não decide a própria
-- solicitação; a exceção exige allow_self_approval explícito na alçada ativa.
ALTER TABLE fin_expenses DROP CONSTRAINT IF EXISTS fin_expense_segregation;

CREATE OR REPLACE FUNCTION fin10_guard_expense_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  authority_limit BIGINT;
  authority_self BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_expense_initial_status_must_be_pending' USING ERRCODE = '23514';
    END IF;
  ELSE
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
    IF NEW.status = OLD.status THEN
      -- Após uma aprovação, a única escrita permitida fora da máquina é a
      -- sincronização do snapshot para a alçada vigente do mesmo aprovador
      -- (todos os demais campos permanecem intactos). Qualquer outro caso é
      -- uma edição silenciosa da transação de decisão.
      IF OLD.status = 'aprovado'
         AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at
         AND NEW.approved_by_identity IS NOT DISTINCT FROM OLD.approved_by_identity
         AND NEW.approver_identity IS NOT DISTINCT FROM OLD.approver_identity
         AND NEW.approver_name IS NOT DISTINCT FROM OLD.approver_name
         AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason
         AND NEW.is_segregated IS NOT DISTINCT FROM OLD.is_segregated
         AND NEW.segregation_checked IS NOT DISTINCT FROM OLD.segregation_checked THEN
        SELECT max_amount_cents INTO authority_limit
          FROM fin_expense_approval_authorities
         WHERE identity_id = NEW.approver_identity AND is_active = true;
        IF authority_limit IS NULL OR authority_limit IS DISTINCT FROM NEW.approval_limit_cents OR authority_limit < NEW.amount_cents THEN
          RAISE EXCEPTION 'fin_expense_approval_authority_exceeded' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'fin_expense_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF OLD.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_expense_immutable_after_decision' USING ERRCODE = '23514';
    END IF;
    IF NEW.status NOT IN ('aprovado','rejeitado','cancelado') THEN
      RAISE EXCEPTION 'fin_expense_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status IN ('aprovado','rejeitado') THEN
    IF NEW.approver_identity IS NULL THEN
      RAISE EXCEPTION 'fin_expense_segregation_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.approver_identity = NEW.requester_identity THEN
      SELECT allow_self_approval INTO authority_self
        FROM fin_expense_approval_authorities
       WHERE identity_id = NEW.approver_identity AND is_active = true;
      IF authority_self IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'fin_expense_segregation_required' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'aprovado' THEN
    -- O banco sempre confere a alçada ativa do aprovador: sem envio do limite
    -- o snapshot é recalculado no servidor; um valor enviado precisa cobrir a
    -- despesa e não pode exceder a alçada vigente no momento da decisão.
    SELECT max_amount_cents INTO authority_limit
      FROM fin_expense_approval_authorities
     WHERE identity_id = NEW.approver_identity AND is_active = true;
    IF authority_limit IS NULL OR NEW.amount_cents > authority_limit THEN
      RAISE EXCEPTION 'fin_expense_approval_authority_exceeded' USING ERRCODE = '23514';
    END IF;
    IF NEW.approval_limit_cents IS NULL THEN
      NEW.approval_limit_cents := authority_limit;
    ELSIF NEW.approval_limit_cents < NEW.amount_cents OR NEW.approval_limit_cents > authority_limit THEN
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

-- (5) Duplicidade natural: a mesma identidade não mantém duas solicitações
-- pendentes idênticas (mesmo centro de custo, tipo, valor e descrição),
-- mesmo que o cliente troque a chave de idempotência entre tentativas.
CREATE UNIQUE INDEX IF NOT EXISTS fin_expenses_pending_natural_key
  ON fin_expenses (requester_identity, cost_center_id, expense_type, amount_cents, md5(description))
  WHERE status = 'pendente';

-- (6) Trava de exclusão: apagar a despesa apagaria a trilha por CASCADE no
-- histórico; a exclusão é sempre bloqueada, inclusive por SQL direto.
CREATE OR REPLACE FUNCTION fin_expense_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_expense_delete_forbidden' USING ERRCODE = '23514'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_expense_no_delete ON fin_expenses;
CREATE TRIGGER trg_fin_expense_no_delete
  BEFORE DELETE ON fin_expenses
  FOR EACH ROW EXECUTE FUNCTION fin_expense_no_delete();

-- (7) FIN-05 (#47): a conciliação exige um movimento bancário e exatamente
-- uma conta, também por escrita direta, e a trilha conciliada não desaparece
-- por exclusão de conta ou transação bancária. O índice parcial da 124 já
-- garante uma conciliação por movimento para as linhas válidas.
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
DO $$ BEGIN
  ALTER TABLE fin_conciliations
    ADD CONSTRAINT fin05_conciliation_requires_movement_and_one_account
    CHECK (bank_transaction_id IS NOT NULL AND ((receivable_id IS NOT NULL) <> (payable_id IS NOT NULL)))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FIN-10: endurecimento aditivo de despesas, reembolsos e compras.
--
-- Migrações históricas 001–128 permanecem imutáveis. Esta migração apenas
-- acrescenta: alçada canônica por identidade, máquina de estados explícita,
-- segregação solicitar/aprovar verificada no próprio banco, evidência
-- obrigatoriamente sintética (metadado local, nunca arquivo externo),
-- idempotência/duplicidade e histórico imutável enriquecido.
--
-- Nada aqui executa compra real, integração externa ou cobrança.

-- Alçada canônica: sem linha ativa a identidade simplesmente não aprova.
-- O limite é consultado pelo servidor E revalidado por gatilho, de modo que
-- um UPDATE direto no banco não consegue burlar a regra de negócio.
CREATE TABLE IF NOT EXISTS fin_expense_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL UNIQUE REFERENCES auth_identities(id) ON DELETE CASCADE,
  max_amount_cents BIGINT NOT NULL CHECK (max_amount_cents > 0 AND max_amount_cents <= 100000000000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 10 AND 1000),
  granted_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_expense_authorities_active_idx
  ON fin_expense_authorities(identity_id) WHERE is_active;

CREATE OR REPLACE FUNCTION fin_expense_authorities_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_expense_authorities_updated ON fin_expense_authorities;
CREATE TRIGGER trg_fin_expense_authorities_updated
  BEFORE UPDATE ON fin_expense_authorities
  FOR EACH ROW EXECUTE FUNCTION fin_expense_authorities_touch();

-- Colunas aditivas da despesa: idempotência, limite aplicado na aprovação e
-- os campos explícitos de rejeição/cancelamento que antes não existiam.
ALTER TABLE fin_expenses
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS approval_limit_cents BIGINT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS fin_expenses_idempotency_key_idx
  ON fin_expenses(idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Duplicidade natural: a mesma identidade não mantém duas solicitações
-- pendentes idênticas (mesmo centro de custo, tipo, valor e descrição).
CREATE UNIQUE INDEX IF NOT EXISTS fin_expenses_pending_natural_idx
  ON fin_expenses(requester_identity, cost_center_id, expense_type, amount_cents, md5(description))
  WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS fin_expenses_cost_center_idx ON fin_expenses(cost_center_id);
CREATE INDEX IF NOT EXISTS fin_expenses_supplier_idx ON fin_expenses(supplier_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_amount_bounded') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_amount_bounded
      CHECK (amount_cents > 0 AND amount_cents <= 100000000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_idempotency_key_length') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_idempotency_key_length
      CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 10 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_cancellation_reason_length') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_cancellation_reason_length
      CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) BETWEEN 10 AND 1000);
  END IF;
  -- Quem solicita não assina a aprovação, em nenhuma das duas colunas.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_approved_by_segregation') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_approved_by_segregation
      CHECK (approved_by_identity IS NULL OR requester_identity IS NULL OR approved_by_identity <> requester_identity);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_rejected_by_segregation') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_rejected_by_segregation
      CHECK (rejected_by_identity IS NULL OR requester_identity IS NULL OR rejected_by_identity <> requester_identity);
  END IF;
  -- Evidência é metadado sintético completo ou ausente; nunca pela metade.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_evidence_complete') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_evidence_complete
      CHECK (
        (evidence_file_name IS NULL AND evidence_file_url IS NULL AND evidence_storage_key IS NULL)
        OR (evidence_file_name IS NOT NULL AND evidence_file_url IS NOT NULL AND evidence_storage_key IS NOT NULL)
      );
  END IF;
  -- A URL é uma referência local sintética. http/https e caminhos de rede
  -- são recusados pelo banco para que nenhum arquivo externo seja prometido.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_evidence_synthetic') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_evidence_synthetic
      CHECK (
        evidence_file_url IS NULL
        OR (evidence_file_url ~ '^local://synthetic/[A-Za-z0-9][A-Za-z0-9._/-]{2,}$' AND evidence_file_url !~ '\.\.')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_evidence_storage_synthetic') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_evidence_storage_synthetic
      CHECK (
        evidence_storage_key IS NULL
        OR (evidence_storage_key ~ '^synthetic/fin10/[A-Za-z0-9][A-Za-z0-9._/-]{2,}$' AND evidence_storage_key !~ '\.\.')
      );
  END IF;
  -- Estado terminal carrega obrigatoriamente os campos que o justificam.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_approved_fields') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_approved_fields
      CHECK (
        status <> 'aprovado'
        OR (approver_identity IS NOT NULL AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL
            AND approval_limit_cents IS NOT NULL AND approval_limit_cents >= amount_cents
            AND evidence_storage_key IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_rejected_fields') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_rejected_fields
      CHECK (status <> 'rejeitado' OR (rejection_reason IS NOT NULL AND rejected_by_identity IS NOT NULL AND rejected_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expenses'::regclass AND conname='fin_expense_canceled_fields') THEN
    ALTER TABLE fin_expenses ADD CONSTRAINT fin_expense_canceled_fields
      CHECK (status <> 'cancelado' OR (cancellation_reason IS NOT NULL AND canceled_by_identity IS NOT NULL AND canceled_at IS NOT NULL));
  END IF;
END $$;

-- Histórico: colunas aditivas que registram a alçada efetivamente aplicada e
-- as duas identidades envolvidas na transição. A imutabilidade continua a
-- cargo do gatilho criado em 079.
ALTER TABLE fin_expense_history
  ADD COLUMN IF NOT EXISTS authority_limit_cents BIGINT,
  ADD COLUMN IF NOT EXISTS requester_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS approver_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS is_authority_verified BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS fin_expense_history_expense_created_idx
  ON fin_expense_history(expense_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='fin_expense_history'::regclass AND conname='fin_expense_history_segregation') THEN
    ALTER TABLE fin_expense_history ADD CONSTRAINT fin_expense_history_segregation
      CHECK (requester_identity IS NULL OR approver_identity IS NULL OR requester_identity <> approver_identity);
  END IF;
END $$;

-- Máquina de estados e alçada no banco.
--
-- Os erros abaixo são tokens estáveis e sem detalhe de SQL: a API os mapeia
-- para códigos HTTP e devolve apenas o token ao cliente.
CREATE OR REPLACE FUNCTION fin_expense_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  authority_limit BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_expense_initial_status_invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_at IS NOT NULL OR NEW.approved_by_identity IS NOT NULL
       OR NEW.approval_limit_cents IS NOT NULL OR NEW.rejected_at IS NOT NULL
       OR NEW.canceled_at IS NOT NULL THEN
      RAISE EXCEPTION 'fin_expense_initial_status_invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW.requester_identity IS NOT NULL AND NEW.approver_identity IS NOT NULL
       AND NEW.requester_identity = NEW.approver_identity THEN
      RAISE EXCEPTION 'fin_expense_segregation_violated' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Campos estruturais nunca mudam depois de criados.
  IF NEW.protocol IS DISTINCT FROM OLD.protocol THEN
    RAISE EXCEPTION 'fin_expense_protocol_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN
    RAISE EXCEPTION 'fin_expense_amount_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.requester_identity IS DISTINCT FROM OLD.requester_identity THEN
    RAISE EXCEPTION 'fin_expense_requester_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.expense_type IS DISTINCT FROM OLD.expense_type THEN
    RAISE EXCEPTION 'fin_expense_type_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_expense_transition_invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW.status NOT IN ('aprovado', 'rejeitado', 'cancelado') THEN
      RAISE EXCEPTION 'fin_expense_transition_invalid' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status <> 'pendente' THEN
    RAISE EXCEPTION 'fin_expense_terminal_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'aprovado' THEN
    IF NEW.requester_identity IS NULL THEN
      RAISE EXCEPTION 'fin_expense_requester_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.approver_identity IS NULL THEN
      RAISE EXCEPTION 'fin_expense_approver_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.approver_identity = NEW.requester_identity
       OR NEW.approved_by_identity IS DISTINCT FROM NEW.approver_identity THEN
      RAISE EXCEPTION 'fin_expense_segregation_violated' USING ERRCODE = '23514';
    END IF;
    IF NEW.evidence_file_name IS NULL OR NEW.evidence_file_url IS NULL OR NEW.evidence_storage_key IS NULL THEN
      RAISE EXCEPTION 'fin_expense_evidence_required' USING ERRCODE = '23514';
    END IF;
    SELECT max_amount_cents INTO authority_limit
      FROM fin_expense_authorities
     WHERE identity_id = NEW.approver_identity AND is_active;
    IF authority_limit IS NULL THEN
      RAISE EXCEPTION 'fin_expense_authority_missing' USING ERRCODE = '23514';
    END IF;
    IF authority_limit < NEW.amount_cents THEN
      RAISE EXCEPTION 'fin_expense_authority_insufficient' USING ERRCODE = '23514';
    END IF;
    NEW.approval_limit_cents := authority_limit;
    IF NEW.approved_at IS NULL THEN NEW.approved_at := NOW(); END IF;
  END IF;

  IF NEW.status = 'rejeitado' THEN
    IF NEW.rejection_reason IS NULL THEN
      RAISE EXCEPTION 'fin_expense_rejection_reason_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.rejected_by_identity IS NULL THEN
      RAISE EXCEPTION 'fin_expense_rejection_actor_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.requester_identity IS NOT NULL AND NEW.rejected_by_identity = NEW.requester_identity THEN
      RAISE EXCEPTION 'fin_expense_segregation_violated' USING ERRCODE = '23514';
    END IF;
    IF NEW.rejected_at IS NULL THEN NEW.rejected_at := NOW(); END IF;
  END IF;

  IF NEW.status = 'cancelado' THEN
    IF NEW.cancellation_reason IS NULL THEN
      RAISE EXCEPTION 'fin_expense_cancellation_reason_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.canceled_by_identity IS NULL THEN
      RAISE EXCEPTION 'fin_expense_cancellation_actor_required' USING ERRCODE = '23514';
    END IF;
    IF NEW.canceled_at IS NULL THEN NEW.canceled_at := NOW(); END IF;
  END IF;

  NEW.segregation_checked := true;
  NEW.is_segregated := (
    NEW.requester_identity IS NULL OR NEW.approver_identity IS NULL
    OR NEW.requester_identity <> NEW.approver_identity
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_expense_guard_insert ON fin_expenses;
CREATE TRIGGER trg_fin_expense_guard_insert
  BEFORE INSERT ON fin_expenses
  FOR EACH ROW EXECUTE FUNCTION fin_expense_guard();

DROP TRIGGER IF EXISTS trg_fin_expense_guard_update ON fin_expenses;
CREATE TRIGGER trg_fin_expense_guard_update
  BEFORE UPDATE ON fin_expenses
  FOR EACH ROW EXECUTE FUNCTION fin_expense_guard();

-- A exclusão de despesa apagaria a trilha por CASCADE no histórico.
CREATE OR REPLACE FUNCTION fin_expense_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_expense_delete_forbidden' USING ERRCODE = '23514'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_expense_no_delete ON fin_expenses;
CREATE TRIGGER trg_fin_expense_no_delete
  BEFORE DELETE ON fin_expenses
  FOR EACH ROW EXECUTE FUNCTION fin_expense_no_delete();

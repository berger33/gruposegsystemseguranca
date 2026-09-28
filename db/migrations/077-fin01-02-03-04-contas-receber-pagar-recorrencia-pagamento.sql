-- FIN-01/02/03/04 contas receber pagar recorrência pagamento parcial estorno cancelamento renegociação baixa auditada nunca apagar saldo por edição silenciosa
-- FIN-01 contas a receber vinculadas a contrato competência vencimento recorrência moeda valor situação
-- FIN-02 contas a pagar fornecedores categoria centro custo vencimento aprovação anexos
-- FIN-03 geração recorrente idempotente por contrato/competência/item pró-rata reajuste suspensão conforme regras aprovadas
-- FIN-04 pagamento/recebimento parcial estorno cancelamento renegociação baixa auditada nunca apagar saldo por edição silenciosa

DO $$ BEGIN CREATE TYPE fin_account_type AS ENUM ('receber','pagar'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_status AS ENUM ('pendente','aprovado','pago','recebido','vencido','cancelado','em_disputa','renegociado','estornado','parcial'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_currency AS ENUM ('BRL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_recurrence_type AS ENUM ('unica','mensal','semanal','quinzenal','anual','sob_demanda'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_category AS ENUM ('servico','material','equipamento','imposto','taxa','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_payment_method AS ENUM ('pix','boleto','transferencia','dinheiro','cartao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_approval_status AS ENUM ('pendente','aprovado','rejeitado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fornecedores
CREATE TABLE IF NOT EXISTS fin_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 200),
  document_ref TEXT CHECK (document_ref IS NULL OR char_length(document_ref) BETWEEN 5 AND 32),
  category fin_category NOT NULL DEFAULT 'outro',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_suppliers_name_idx ON fin_suppliers(name);

-- Centro custo
CREATE TABLE IF NOT EXISTS fin_cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 10 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Regras recorrência idempotente por contrato/competência/item pró-rata reajuste suspensão conforme regras aprovadas
CREATE TABLE IF NOT EXISTS fin_recurrence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  contract_item_id UUID REFERENCES cli_contract_items(id) ON DELETE SET NULL,
  recurrence_type fin_recurrence_type NOT NULL DEFAULT 'mensal',
  start_date DATE NOT NULL,
  end_date DATE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  currency fin_currency NOT NULL DEFAULT 'BRL',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  last_generated_competence DATE,
  proration_enabled BOOLEAN NOT NULL DEFAULT false,
  proration_rule TEXT CHECK (proration_rule IS NULL OR char_length(proration_rule) BETWEEN 10 AND 1000),
  reajuste_enabled BOOLEAN NOT NULL DEFAULT false,
  reajuste_percent NUMERIC(5,2) CHECK (reajuste_percent IS NULL OR reajuste_percent BETWEEN 0 AND 100),
  reajuste_rule TEXT CHECK (reajuste_rule IS NULL OR char_length(reajuste_rule) BETWEEN 10 AND 1000),
  suspension_enabled BOOLEAN NOT NULL DEFAULT false,
  suspension_reason TEXT CHECK (suspension_reason IS NULL OR char_length(suspension_reason) BETWEEN 10 AND 1000),
  recurrence_id TEXT NOT NULL CHECK (char_length(recurrence_id) BETWEEN 3 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_end_ge_start CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_approved_requires_approver CHECK ((is_approved = false) OR (is_approved = true AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL)),
  UNIQUE(contract_id, recurrence_id)
);
CREATE INDEX IF NOT EXISTS fin_recurrence_rules_contract_idx ON fin_recurrence_rules(contract_id);
CREATE INDEX IF NOT EXISTS fin_recurrence_rules_active_idx ON fin_recurrence_rules(is_active) WHERE is_active=true;

-- Contas a receber
CREATE TABLE IF NOT EXISTS fin_accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^REC-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  contract_item_id UUID REFERENCES cli_contract_items(id) ON DELETE SET NULL,
  competence_date DATE NOT NULL,
  due_date DATE NOT NULL,
  recurrence_type fin_recurrence_type NOT NULL DEFAULT 'unica',
  recurrence_id TEXT CHECK (recurrence_id IS NULL OR char_length(recurrence_id) BETWEEN 3 AND 100),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_cents >=0),
  amount_remaining_cents BIGINT GENERATED ALWAYS AS (amount_cents - amount_paid_cents) STORED,
  currency fin_currency NOT NULL DEFAULT 'BRL',
  status fin_status NOT NULL DEFAULT 'pendente',
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 10 AND 1000),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule_id UUID REFERENCES fin_recurrence_rules(id) ON DELETE SET NULL,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  UNIQUE(contract_id, competence_date, contract_item_id, recurrence_id),
  CONSTRAINT chk_due_ge_competence CHECK (due_date >= competence_date),
  CONSTRAINT chk_paid_le_amount CHECK (amount_paid_cents <= amount_cents)
);
CREATE INDEX IF NOT EXISTS fin_accounts_receivable_account_idx ON fin_accounts_receivable(client_account_id, competence_date DESC);
CREATE INDEX IF NOT EXISTS fin_accounts_receivable_protocol_idx ON fin_accounts_receivable(protocol);
CREATE INDEX IF NOT EXISTS fin_accounts_receivable_status_idx ON fin_accounts_receivable(status);
CREATE INDEX IF NOT EXISTS fin_accounts_receivable_contract_competence_idx ON fin_accounts_receivable(contract_id, competence_date);

-- Contas a pagar
CREATE TABLE IF NOT EXISTS fin_accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^PAG-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  supplier_id UUID REFERENCES fin_suppliers(id) ON DELETE SET NULL,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES fin_cost_centers(id) ON DELETE SET NULL,
  category fin_category NOT NULL DEFAULT 'outro',
  competence_date DATE NOT NULL,
  due_date DATE NOT NULL,
  recurrence_type fin_recurrence_type NOT NULL DEFAULT 'unica',
  recurrence_id TEXT CHECK (recurrence_id IS NULL OR char_length(recurrence_id) BETWEEN 3 AND 100),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_cents >=0),
  amount_remaining_cents BIGINT GENERATED ALWAYS AS (amount_cents - amount_paid_cents) STORED,
  currency fin_currency NOT NULL DEFAULT 'BRL',
  status fin_status NOT NULL DEFAULT 'pendente',
  approval_status fin_approval_status NOT NULL DEFAULT 'pendente',
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 10 AND 1000),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule_id UUID REFERENCES fin_recurrence_rules(id) ON DELETE SET NULL,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  UNIQUE(contract_id, competence_date, supplier_id, recurrence_id),
  CONSTRAINT chk_due_ge_competence_pay CHECK (due_date >= competence_date),
  CONSTRAINT chk_paid_le_amount_pay CHECK (amount_paid_cents <= amount_cents),
  CONSTRAINT chk_approval_requires_approver CHECK ((approval_status != 'aprovado') OR (approved_by_identity IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS fin_accounts_payable_supplier_idx ON fin_accounts_payable(supplier_id);
CREATE INDEX IF NOT EXISTS fin_accounts_payable_protocol_idx ON fin_accounts_payable(protocol);
CREATE INDEX IF NOT EXISTS fin_accounts_payable_status_idx ON fin_accounts_payable(status);
CREATE INDEX IF NOT EXISTS fin_accounts_payable_approval_idx ON fin_accounts_payable(approval_status);

-- Pagamentos parcial estorno cancelamento renegociação baixa auditada nunca apagar saldo por edição silenciosa
CREATE TABLE IF NOT EXISTS fin_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type fin_account_type NOT NULL,
  receivable_id UUID REFERENCES fin_accounts_receivable(id) ON DELETE SET NULL,
  payable_id UUID REFERENCES fin_accounts_payable(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >0),
  payment_method fin_payment_method NOT NULL DEFAULT 'pix',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_partial BOOLEAN NOT NULL DEFAULT false,
  is_estorno BOOLEAN NOT NULL DEFAULT false,
  is_renegotiation BOOLEAN NOT NULL DEFAULT false,
  previous_payment_id UUID REFERENCES fin_payments(id) ON DELETE SET NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_account_ref CHECK ((account_type='receber' AND receivable_id IS NOT NULL AND payable_id IS NULL) OR (account_type='pagar' AND payable_id IS NOT NULL AND receivable_id IS NULL)),
  CONSTRAINT chk_estorno_requires_previous CHECK ((is_estorno = false) OR (is_estorno = true AND previous_payment_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS fin_payments_receivable_idx ON fin_payments(receivable_id) WHERE receivable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_payments_payable_idx ON fin_payments(payable_id) WHERE payable_id IS NOT NULL;

-- Histórico imutável baixa auditada
CREATE TABLE IF NOT EXISTS fin_payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type fin_account_type NOT NULL,
  receivable_id UUID REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  payable_id UUID REFERENCES fin_accounts_payable(id) ON DELETE CASCADE,
  previous_status fin_status,
  next_status fin_status NOT NULL,
  previous_paid_cents BIGINT,
  next_paid_cents BIGINT,
  payment_id UUID REFERENCES fin_payments(id) ON DELETE SET NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  is_estorno BOOLEAN NOT NULL DEFAULT false,
  is_cancelamento BOOLEAN NOT NULL DEFAULT false,
  is_renegociacao BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_payment_history_receivable_idx ON fin_payment_history(receivable_id, created_at DESC) WHERE receivable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_payment_history_payable_idx ON fin_payment_history(payable_id, created_at DESC) WHERE payable_id IS NOT NULL;

-- Anexos
CREATE TABLE IF NOT EXISTS fin_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type fin_account_type NOT NULL,
  receivable_id UUID REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  payable_id UUID REFERENCES fin_accounts_payable(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  uploaded_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_attachment_account_ref CHECK ((account_type='receber' AND receivable_id IS NOT NULL AND payable_id IS NULL) OR (account_type='pagar' AND payable_id IS NOT NULL AND receivable_id IS NULL))
);
CREATE INDEX IF NOT EXISTS fin_attachments_receivable_idx ON fin_attachments(receivable_id) WHERE receivable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_attachments_payable_idx ON fin_attachments(payable_id) WHERE payable_id IS NOT NULL;

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_fin_suppliers_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_suppliers_updated_at ON fin_suppliers;
CREATE TRIGGER trg_fin_suppliers_updated_at BEFORE UPDATE ON fin_suppliers FOR EACH ROW EXECUTE FUNCTION update_fin_suppliers_updated_at();

CREATE OR REPLACE FUNCTION update_fin_cost_centers_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_cost_centers_updated_at ON fin_cost_centers;
CREATE TRIGGER trg_fin_cost_centers_updated_at BEFORE UPDATE ON fin_cost_centers FOR EACH ROW EXECUTE FUNCTION update_fin_cost_centers_updated_at();

CREATE OR REPLACE FUNCTION update_fin_recurrence_rules_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_recurrence_rules_updated_at ON fin_recurrence_rules;
CREATE TRIGGER trg_fin_recurrence_rules_updated_at BEFORE UPDATE ON fin_recurrence_rules FOR EACH ROW EXECUTE FUNCTION update_fin_recurrence_rules_updated_at();

CREATE OR REPLACE FUNCTION update_fin_receivable_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_receivable_updated_at ON fin_accounts_receivable;
CREATE TRIGGER trg_fin_receivable_updated_at BEFORE UPDATE ON fin_accounts_receivable FOR EACH ROW EXECUTE FUNCTION update_fin_receivable_updated_at();

CREATE OR REPLACE FUNCTION update_fin_payable_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_payable_updated_at ON fin_accounts_payable;
CREATE TRIGGER trg_fin_payable_updated_at BEFORE UPDATE ON fin_accounts_payable FOR EACH ROW EXECUTE FUNCTION update_fin_payable_updated_at();

-- Immutable history
CREATE OR REPLACE FUNCTION prevent_fin_payment_history_update_delete() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'fin_payment_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_payment_history_immutable ON fin_payment_history;
CREATE TRIGGER trg_fin_payment_history_immutable BEFORE UPDATE OR DELETE ON fin_payment_history FOR EACH ROW EXECUTE FUNCTION prevent_fin_payment_history_update_delete();

-- Prevent silent balance deletion: never apagar saldo por edição silenciosa, must use history
CREATE OR REPLACE FUNCTION prevent_fin_silent_balance_edit() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.amount_cents != NEW.amount_cents AND OLD.amount_cents IS DISTINCT FROM NEW.amount_cents THEN
    IF NOT EXISTS (SELECT 1 FROM fin_payment_history WHERE (receivable_id = OLD.id OR payable_id = OLD.id) AND created_at >= NOW() - INTERVAL '5 seconds') THEN
      RAISE EXCEPTION 'never apagar saldo por edição silenciosa: use fin_payments + fin_payment_history com motivo';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_receivable_no_silent_edit ON fin_accounts_receivable;
CREATE TRIGGER trg_fin_receivable_no_silent_edit BEFORE UPDATE ON fin_accounts_receivable FOR EACH ROW EXECUTE FUNCTION prevent_fin_silent_balance_edit();
DROP TRIGGER IF EXISTS trg_fin_payable_no_silent_edit ON fin_accounts_payable;
CREATE TRIGGER trg_fin_payable_no_silent_edit BEFORE UPDATE ON fin_accounts_payable FOR EACH ROW EXECUTE FUNCTION prevent_fin_silent_balance_edit();

-- O catálogo audit_log é separado de auth_access_audit; CHECK de formato
-- em 075 aceita novas ações versionadas sem rejeitar eventos históricos.

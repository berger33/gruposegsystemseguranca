-- FIN-09/10/11/12 resultado gerencial despesas fiscal gateway
-- FIN-09 resultado gerencial por contrato separando receita contratada faturada recebida custos caixa margem sem dados completos exibida como incompleta
-- FIN-10 despesas/reembolsos compras alçada evidência segregação solicitar/aprovar quando definida
-- FIN-11 integração contábil/fiscal mediante provedor determinar NFS-e/NF-e ou outra obrigação conforme atividade sem assumir uma nota para tudo
-- FIN-12 boletos/Pix/gateway somente após seleção e sandbox validar assinatura webhook replay idempotência conciliação sem cobrança real em testes

DO $$ BEGIN CREATE TYPE fin_result_status AS ENUM ('rascunho','em_revisao','aprovado','incompleto','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_expense_type AS ENUM ('despesa','reembolso','compra','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_expense_status AS ENUM ('pendente','aprovado','rejeitado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_fiscal_doc_type AS ENUM ('nfse','nfe','nfce','cte','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_fiscal_doc_status AS ENUM ('rascunho','emitido','cancelado','erro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_fiscal_provider_status AS ENUM ('configurado','nao_configurado','falha'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_fiscal_obligation_status AS ENUM ('pendente','determinada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_gateway_type AS ENUM ('boleto','pix','cartao','gateway','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_gateway_status AS ENUM ('nao_selecionado','selecionado','sandbox','producao','desativado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_webhook_status AS ENUM ('recebido','validado','rejeitado','replay','conciliado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_charge_status AS ENUM ('pendente','pago','falhou','cancelado','estornado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FIN-09 resultado gerencial por contrato
CREATE TABLE IF NOT EXISTS fin_management_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^RES-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  competence_date DATE NOT NULL,
  revenue_contracted_cents BIGINT CHECK (revenue_contracted_cents IS NULL OR revenue_contracted_cents >=0),
  revenue_billed_cents BIGINT CHECK (revenue_billed_cents IS NULL OR revenue_billed_cents >=0),
  revenue_received_cents BIGINT CHECK (revenue_received_cents IS NULL OR revenue_received_cents >=0),
  costs_cents BIGINT CHECK (costs_cents IS NULL OR costs_cents >=0),
  cash_cents BIGINT CHECK (cash_cents IS NULL OR cash_cents >=0),
  margin_cents BIGINT GENERATED ALWAYS AS (
    CASE WHEN revenue_received_cents IS NOT NULL AND costs_cents IS NOT NULL THEN revenue_received_cents - costs_cents ELSE NULL END
  ) STORED,
  margin_percent NUMERIC(5,2) CHECK (margin_percent IS NULL OR margin_percent BETWEEN -100 AND 100),
  is_complete BOOLEAN NOT NULL DEFAULT false,
  incomplete_reason TEXT CHECK (incomplete_reason IS NULL OR char_length(incomplete_reason) BETWEEN 10 AND 1000),
  status fin_result_status NOT NULL DEFAULT 'rascunho',
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 2000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_result_complete_check CHECK (
    (is_complete = true AND incomplete_reason IS NULL) OR
    (is_complete = false AND incomplete_reason IS NOT NULL AND char_length(incomplete_reason) >=10)
  ),
  CONSTRAINT fin_result_margin_incomplete CHECK (
    (is_complete = false AND margin_percent IS NULL) OR
    (is_complete = true)
  ),
  UNIQUE(contract_id, competence_date)
);
CREATE INDEX IF NOT EXISTS fin_management_results_contract_idx ON fin_management_results(contract_id);
CREATE INDEX IF NOT EXISTS fin_management_results_competence_idx ON fin_management_results(competence_date);
CREATE INDEX IF NOT EXISTS fin_management_results_protocol_idx ON fin_management_results(protocol);

CREATE TABLE IF NOT EXISTS fin_result_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES fin_management_results(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  previous_status fin_result_status,
  next_status fin_result_status NOT NULL,
  previous_contracted BIGINT,
  next_contracted BIGINT,
  previous_billed BIGINT,
  next_billed BIGINT,
  previous_received BIGINT,
  next_received BIGINT,
  previous_costs BIGINT,
  next_costs BIGINT,
  previous_cash BIGINT,
  next_cash BIGINT,
  previous_complete BOOLEAN,
  next_complete BOOLEAN,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  is_incomplete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_result_history_result_idx ON fin_result_history(result_id);
CREATE INDEX IF NOT EXISTS fin_result_history_contract_idx ON fin_result_history(contract_id);

-- FIN-10 despesas/reembolsos e compras com alçada evidência segregação solicitar/aprovar
CREATE TABLE IF NOT EXISTS fin_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^DES-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  expense_type fin_expense_type NOT NULL DEFAULT 'despesa',
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >0),
  threshold_cents BIGINT CHECK (threshold_cents IS NULL OR threshold_cents >0),
  requester_name TEXT NOT NULL CHECK (char_length(requester_name) BETWEEN 2 AND 200),
  requester_identity UUID REFERENCES auth_identities(id),
  approver_name TEXT CHECK (approver_name IS NULL OR char_length(approver_name) BETWEEN 2 AND 200),
  approver_identity UUID REFERENCES auth_identities(id),
  status fin_expense_status NOT NULL DEFAULT 'pendente',
  evidence_file_name TEXT CHECK (evidence_file_name IS NULL OR char_length(evidence_file_name) BETWEEN 1 AND 500),
  evidence_file_url TEXT CHECK (evidence_file_url IS NULL OR char_length(evidence_file_url) BETWEEN 5 AND 1000),
  evidence_storage_key TEXT UNIQUE CHECK (evidence_storage_key IS NULL OR char_length(evidence_storage_key) BETWEEN 5 AND 500),
  is_segregated BOOLEAN NOT NULL DEFAULT true,
  segregation_checked BOOLEAN NOT NULL DEFAULT false,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES fin_cost_centers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES fin_suppliers(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_identity UUID REFERENCES auth_identities(id),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_expense_segregation CHECK (
    (requester_identity IS NULL OR approver_identity IS NULL) OR
    (requester_identity != approver_identity)
  )
);
CREATE INDEX IF NOT EXISTS fin_expenses_protocol_idx ON fin_expenses(protocol);
CREATE INDEX IF NOT EXISTS fin_expenses_status_idx ON fin_expenses(status);
CREATE INDEX IF NOT EXISTS fin_expenses_requester_idx ON fin_expenses(requester_identity);
CREATE INDEX IF NOT EXISTS fin_expenses_contract_idx ON fin_expenses(contract_id);

CREATE TABLE IF NOT EXISTS fin_expense_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES fin_expenses(id) ON DELETE CASCADE,
  previous_status fin_expense_status,
  next_status fin_expense_status NOT NULL,
  previous_amount BIGINT,
  next_amount BIGINT,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  is_segregation_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_expense_history_expense_idx ON fin_expense_history(expense_id);

-- FIN-11 integração contábil/fiscal mediante provedor determinar NFS-e/NF-e ou outra obrigação conforme atividade sem assumir uma nota para tudo
CREATE TABLE IF NOT EXISTS fin_fiscal_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 200),
  provider_type fin_fiscal_doc_type NOT NULL DEFAULT 'nfse',
  status fin_fiscal_provider_status NOT NULL DEFAULT 'nao_configurado',
  last_processed_at TIMESTAMPTZ,
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 10 AND 1000),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_fiscal_providers_status_idx ON fin_fiscal_providers(status);

CREATE TABLE IF NOT EXISTS fin_fiscal_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  obligation_type fin_fiscal_doc_type NOT NULL DEFAULT 'nfse',
  activity_type TEXT NOT NULL CHECK (char_length(activity_type) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
  rule TEXT NOT NULL CHECK (char_length(rule) BETWEEN 10 AND 1000),
  is_determined BOOLEAN NOT NULL DEFAULT false,
  determined_by_identity UUID REFERENCES auth_identities(id),
  determined_at TIMESTAMPTZ,
  status fin_fiscal_obligation_status NOT NULL DEFAULT 'pendente',
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 2000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_fiscal_obligation_determined_check CHECK (
    (is_determined = false) OR
    (is_determined = true AND determined_by_identity IS NOT NULL AND determined_at IS NOT NULL AND char_length(rule) >=10)
  )
);
CREATE INDEX IF NOT EXISTS fin_fiscal_obligations_contract_idx ON fin_fiscal_obligations(contract_id);
CREATE INDEX IF NOT EXISTS fin_fiscal_obligations_type_idx ON fin_fiscal_obligations(obligation_type);

CREATE TABLE IF NOT EXISTS fin_fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^NF-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  obligation_id UUID REFERENCES fin_fiscal_obligations(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES fin_fiscal_providers(id) ON DELETE SET NULL,
  document_type fin_fiscal_doc_type NOT NULL DEFAULT 'nfse',
  status fin_fiscal_doc_status NOT NULL DEFAULT 'rascunho',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 10 AND 1000),
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_fiscal_documents_protocol_idx ON fin_fiscal_documents(protocol);
CREATE INDEX IF NOT EXISTS fin_fiscal_documents_obligation_idx ON fin_fiscal_documents(obligation_id);
CREATE INDEX IF NOT EXISTS fin_fiscal_documents_provider_idx ON fin_fiscal_documents(provider_id);

-- FIN-12 boletos/Pix/gateway somente após seleção e sandbox validar assinatura webhook replay idempotência conciliação sem cobrança real em testes
CREATE TABLE IF NOT EXISTS fin_payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 200),
  gateway_type fin_gateway_type NOT NULL DEFAULT 'pix',
  status fin_gateway_status NOT NULL DEFAULT 'nao_selecionado',
  is_selected BOOLEAN NOT NULL DEFAULT false,
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_secret_hash TEXT CHECK (webhook_secret_hash IS NULL OR char_length(webhook_secret_hash) BETWEEN 10 AND 500),
  last_test_at TIMESTAMPTZ,
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 10 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_gateway_sandbox_check CHECK (
    (is_selected = false) OR
    (is_selected = true AND is_sandbox = true)
  )
);
CREATE INDEX IF NOT EXISTS fin_payment_gateways_status_idx ON fin_payment_gateways(status);
CREATE INDEX IF NOT EXISTS fin_payment_gateways_selected_idx ON fin_payment_gateways(is_selected) WHERE is_selected = true;

CREATE TABLE IF NOT EXISTS fin_gateway_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id UUID NOT NULL REFERENCES fin_payment_gateways(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 200),
  signature TEXT NOT NULL CHECK (char_length(signature) BETWEEN 10 AND 1000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_valid_signature BOOLEAN NOT NULL DEFAULT false,
  is_replay BOOLEAN NOT NULL DEFAULT false,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 10 AND 200),
  status fin_webhook_status NOT NULL DEFAULT 'recebido',
  processed_at TIMESTAMPTZ,
  conciliated_at TIMESTAMPTZ,
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_gateway_webhooks_gateway_idx ON fin_gateway_webhooks(gateway_id);
CREATE INDEX IF NOT EXISTS fin_gateway_webhooks_idempotency_idx ON fin_gateway_webhooks(idempotency_key);
CREATE INDEX IF NOT EXISTS fin_gateway_webhooks_status_idx ON fin_gateway_webhooks(status);

CREATE TABLE IF NOT EXISTS fin_gateway_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^CHG-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  gateway_id UUID NOT NULL REFERENCES fin_payment_gateways(id) ON DELETE CASCADE,
  receivable_id UUID REFERENCES fin_accounts_receivable(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >0),
  status fin_charge_status NOT NULL DEFAULT 'pendente',
  idempotency_key TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 10 AND 200),
  is_sandbox BOOLEAN NOT NULL DEFAULT true CHECK (is_sandbox = true),
  is_conciliated BOOLEAN NOT NULL DEFAULT false,
  conciliated_at TIMESTAMPTZ,
  provider_charge_id TEXT CHECK (provider_charge_id IS NULL OR char_length(provider_charge_id) BETWEEN 3 AND 200),
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_gateway_charges_gateway_idx ON fin_gateway_charges(gateway_id);
CREATE INDEX IF NOT EXISTS fin_gateway_charges_receivable_idx ON fin_gateway_charges(receivable_id);
CREATE INDEX IF NOT EXISTS fin_gateway_charges_idempotency_idx ON fin_gateway_charges(idempotency_key);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_fin_management_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_management_results_updated ON fin_management_results;
CREATE TRIGGER trg_fin_management_results_updated BEFORE UPDATE ON fin_management_results FOR EACH ROW EXECUTE FUNCTION update_fin_management_updated_at();
DROP TRIGGER IF EXISTS trg_fin_expenses_updated ON fin_expenses;
CREATE TRIGGER trg_fin_expenses_updated BEFORE UPDATE ON fin_expenses FOR EACH ROW EXECUTE FUNCTION update_fin_management_updated_at();
DROP TRIGGER IF EXISTS trg_fin_fiscal_providers_updated ON fin_fiscal_providers;
CREATE TRIGGER trg_fin_fiscal_providers_updated BEFORE UPDATE ON fin_fiscal_providers FOR EACH ROW EXECUTE FUNCTION update_fin_management_updated_at();
DROP TRIGGER IF EXISTS trg_fin_fiscal_obligations_updated ON fin_fiscal_obligations;
CREATE TRIGGER trg_fin_fiscal_obligations_updated BEFORE UPDATE ON fin_fiscal_obligations FOR EACH ROW EXECUTE FUNCTION update_fin_management_updated_at();
DROP TRIGGER IF EXISTS trg_fin_fiscal_documents_updated ON fin_fiscal_documents;
CREATE TRIGGER trg_fin_fiscal_documents_updated BEFORE UPDATE ON fin_fiscal_documents FOR EACH ROW EXECUTE FUNCTION update_fin_management_updated_at();
DROP TRIGGER IF EXISTS trg_fin_payment_gateways_updated ON fin_payment_gateways;
CREATE TRIGGER trg_fin_payment_gateways_updated BEFORE UPDATE ON fin_payment_gateways FOR EACH ROW EXECUTE FUNCTION update_fin_management_updated_at();
DROP TRIGGER IF EXISTS trg_fin_gateway_charges_updated ON fin_gateway_charges;
CREATE TRIGGER trg_fin_gateway_charges_updated BEFORE UPDATE ON fin_gateway_charges FOR EACH ROW EXECUTE FUNCTION update_fin_management_updated_at();

-- Immutable history triggers
CREATE OR REPLACE FUNCTION prevent_fin_result_history_update() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'fin_result_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_result_history_immutable ON fin_result_history;
CREATE TRIGGER trg_fin_result_history_immutable BEFORE UPDATE OR DELETE ON fin_result_history FOR EACH ROW EXECUTE FUNCTION prevent_fin_result_history_update();

CREATE OR REPLACE FUNCTION prevent_fin_expense_history_update() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'fin_expense_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_expense_history_immutable ON fin_expense_history;
CREATE TRIGGER trg_fin_expense_history_immutable BEFORE UPDATE OR DELETE ON fin_expense_history FOR EACH ROW EXECUTE FUNCTION prevent_fin_expense_history_update();

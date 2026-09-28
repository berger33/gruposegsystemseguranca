-- FIN-05/06/07/08 conciliação cobrança fluxo caixa custo por cliente/contrato/posto
-- FIN-05 conciliação por importação/extrato ou provedor sugestão e confirmação evitar duplicar transações
-- FIN-06 cobrança com responsável lembretes histórico política aprovada sem mensagens reais ou bloqueio portal automático
-- FIN-07 fluxo caixa previsto/realizado vencidos próximos pagamentos aging recebíveis
-- FIN-08 custo por cliente/contrato/posto importação custos pessoal equipamentos materiais supervisão rateio documentado

DO $$ BEGIN CREATE TYPE fin_conciliation_source AS ENUM ('importacao','extrato','provedor','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_conciliation_status AS ENUM ('pendente','sugerida','conciliada','divergente','ignorada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_collection_status AS ENUM ('pendente','lembrete_enviado','em_negociacao','acordado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_cashflow_type AS ENUM ('previsto','realizado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_cost_source AS ENUM ('pessoal','equipamento','material','supervisao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_aging_bucket AS ENUM ('a_vencer','vencido_0_30','vencido_31_60','vencido_61_90','vencido_90_plus'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_reminder_type AS ENUM ('email','whatsapp','ligacao','notificacao_portal','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FIN-05 conciliação
CREATE TABLE IF NOT EXISTS fin_bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^EXT-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  source fin_conciliation_source NOT NULL DEFAULT 'extrato',
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  import_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_transactions INT NOT NULL DEFAULT 0 CHECK (total_transactions >=0),
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_bank_statements_protocol_idx ON fin_bank_statements(protocol);

CREATE TABLE IF NOT EXISTS fin_bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES fin_bank_statements(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 3 AND 500),
  bank_ref TEXT NOT NULL UNIQUE CHECK (char_length(bank_ref) BETWEEN 3 AND 200),
  is_conciliated BOOLEAN NOT NULL DEFAULT false,
  conciliated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliated_requires_date CHECK ((is_conciliated = false AND conciliated_at IS NULL) OR (is_conciliated = true AND conciliated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS fin_bank_transactions_statement_idx ON fin_bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS fin_bank_transactions_bank_ref_idx ON fin_bank_transactions(bank_ref);
CREATE INDEX IF NOT EXISTS fin_bank_transactions_date_idx ON fin_bank_transactions(transaction_date);

CREATE TABLE IF NOT EXISTS fin_conciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID REFERENCES fin_accounts_receivable(id) ON DELETE SET NULL,
  payable_id UUID REFERENCES fin_accounts_payable(id) ON DELETE SET NULL,
  bank_transaction_id UUID REFERENCES fin_bank_transactions(id) ON DELETE SET NULL,
  source fin_conciliation_source NOT NULL DEFAULT 'extrato',
  status fin_conciliation_status NOT NULL DEFAULT 'pendente',
  suggested_by_identity UUID REFERENCES auth_identities(id),
  suggested_at TIMESTAMPTZ,
  confirmed_by_identity UUID REFERENCES auth_identities(id),
  confirmed_at TIMESTAMPTZ,
  suggestion_reason TEXT CHECK (suggestion_reason IS NULL OR char_length(suggestion_reason) BETWEEN 10 AND 1000),
  divergence_reason TEXT CHECK (divergence_reason IS NULL OR char_length(divergence_reason) BETWEEN 10 AND 1000),
  amount_matched_cents BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_account_ref_conciliation CHECK ((receivable_id IS NOT NULL AND payable_id IS NULL) OR (payable_id IS NOT NULL AND receivable_id IS NULL) OR (receivable_id IS NULL AND payable_id IS NULL)),
  CONSTRAINT chk_suggested_requires_reason CHECK ((status != 'sugerida') OR (suggestion_reason IS NOT NULL)),
  CONSTRAINT chk_divergent_requires_reason CHECK ((status != 'divergente') OR (divergence_reason IS NOT NULL)),
  UNIQUE(receivable_id, bank_transaction_id),
  UNIQUE(payable_id, bank_transaction_id)
);
CREATE INDEX IF NOT EXISTS fin_conciliations_receivable_idx ON fin_conciliations(receivable_id) WHERE receivable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_conciliations_payable_idx ON fin_conciliations(payable_id) WHERE payable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_conciliations_bank_idx ON fin_conciliations(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_conciliations_status_idx ON fin_conciliations(status);

-- FIN-06 cobrança responsável lembretes histórico política aprovada sem mensagens reais ou bloqueio portal automático
CREATE TABLE IF NOT EXISTS fin_collection_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 10 AND 1000),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  rules JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_approved_requires_approver_coll CHECK ((is_approved = false) OR (is_approved = true AND approved_by_identity IS NOT NULL AND approved_at IS NOT NULL))
);
-- Exemplo sintético: requer aprovação humana identificada antes de ativação.
INSERT INTO fin_collection_policies (name, description, is_approved, is_active, rules) VALUES
  ('Política Padrão Cobrança', 'Rascunho de lembretes com responsável e histórico; sem mensagens reais nem bloqueio automático até aprovação', false, false, '{"lembretes": ["email","notificacao_portal"], "sem_bloqueio_automatico": true, "sem_mensagens_reais": true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS fin_collection_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID NOT NULL REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES fin_collection_policies(id) ON DELETE SET NULL,
  responsible_name TEXT NOT NULL CHECK (char_length(responsible_name) BETWEEN 2 AND 200),
  due_date DATE NOT NULL,
  reminder_type fin_reminder_type NOT NULL DEFAULT 'notificacao_portal',
  status fin_collection_status NOT NULL DEFAULT 'pendente',
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 20 AND 2000),
  sent_at TIMESTAMPTZ,
  is_real_message BOOLEAN NOT NULL DEFAULT false CHECK (is_real_message = false),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sent_requires_status CHECK ((sent_at IS NULL) OR (status = 'lembrete_enviado'))
);
CREATE INDEX IF NOT EXISTS fin_collection_reminders_receivable_idx ON fin_collection_reminders(receivable_id, due_date DESC);

CREATE TABLE IF NOT EXISTS fin_collection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID NOT NULL REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  previous_status fin_collection_status,
  next_status fin_collection_status NOT NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_collection_history_receivable_idx ON fin_collection_history(receivable_id, created_at DESC);

-- FIN-07 fluxo caixa previsto/realizado vencidos próximos pagamentos aging recebíveis
CREATE TABLE IF NOT EXISTS fin_cashflow_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competence_date DATE NOT NULL,
  cashflow_type fin_cashflow_type NOT NULL DEFAULT 'previsto',
  total_receivable_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_receivable_cents >=0),
  total_payable_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_payable_cents >=0),
  balance_cents BIGINT GENERATED ALWAYS AS (total_receivable_cents - total_payable_cents) STORED,
  vencidos_cents BIGINT NOT NULL DEFAULT 0 CHECK (vencidos_cents >=0),
  proximos_pagamentos_cents BIGINT NOT NULL DEFAULT 0 CHECK (proximos_pagamentos_cents >=0),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competence_date, cashflow_type)
);
CREATE INDEX IF NOT EXISTS fin_cashflow_snapshots_date_idx ON fin_cashflow_snapshots(competence_date DESC);

CREATE TABLE IF NOT EXISTS fin_aging_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID NOT NULL REFERENCES fin_accounts_receivable(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  bucket fin_aging_bucket NOT NULL,
  -- Snapshot imutável do período informado, sem subquery nem CURRENT_DATE variável.
  days_overdue INT GENERATED ALWAYS AS (GREATEST(0, competence_date - due_date)) STORED,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  competence_date DATE NOT NULL,
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(receivable_id)
);
CREATE INDEX IF NOT EXISTS fin_aging_receivables_bucket_idx ON fin_aging_receivables(bucket);
CREATE INDEX IF NOT EXISTS fin_aging_receivables_account_idx ON fin_aging_receivables(client_account_id);

-- FIN-08 custo por cliente/contrato/posto importação custos pessoal equipamentos materiais supervisão rateio documentado
CREATE TABLE IF NOT EXISTS fin_cost_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^COST-IMP-[0-9]{8}-[A-Z0-9]{4}$'),
  source fin_cost_source NOT NULL,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  competence_date DATE NOT NULL,
  total_costs_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_costs_cents >=0),
  total_records INT NOT NULL DEFAULT 0 CHECK (total_records >=0),
  created_by_identity UUID REFERENCES auth_identities(id),
  import_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_cost_imports_protocol_idx ON fin_cost_imports(protocol);

CREATE TABLE IF NOT EXISTS fin_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID REFERENCES fin_cost_imports(id) ON DELETE SET NULL,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  cost_source fin_cost_source NOT NULL,
  competence_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
  source_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  source_equipment_id UUID,
  source_material TEXT,
  supervision_id UUID,
  rateio_rule TEXT NOT NULL CHECK (char_length(rateio_rule) BETWEEN 10 AND 1000),
  rateio_percent NUMERIC(5,2) NOT NULL CHECK (rateio_percent BETWEEN 0 AND 100),
  rateio_documented BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rateio_documented CHECK (rateio_documented = true AND rateio_rule IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fin_costs_account_idx ON fin_costs(client_account_id, competence_date DESC);
CREATE INDEX IF NOT EXISTS fin_costs_contract_idx ON fin_costs(contract_id, competence_date DESC);
CREATE INDEX IF NOT EXISTS fin_costs_post_idx ON fin_costs(post_id, competence_date DESC);
CREATE INDEX IF NOT EXISTS fin_costs_source_idx ON fin_costs(cost_source);
CREATE INDEX IF NOT EXISTS fin_costs_import_idx ON fin_costs(import_id) WHERE import_id IS NOT NULL;

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_fin_bank_statements_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_bank_statements_updated_at ON fin_bank_statements;
-- bank_statements has no updated_at, skip

CREATE OR REPLACE FUNCTION update_fin_conciliations_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_conciliations_updated_at ON fin_conciliations;
CREATE TRIGGER trg_fin_conciliations_updated_at BEFORE UPDATE ON fin_conciliations FOR EACH ROW EXECUTE FUNCTION update_fin_conciliations_updated_at();

CREATE OR REPLACE FUNCTION update_fin_collection_policies_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_collection_policies_updated_at ON fin_collection_policies;
CREATE TRIGGER trg_fin_collection_policies_updated_at BEFORE UPDATE ON fin_collection_policies FOR EACH ROW EXECUTE FUNCTION update_fin_collection_policies_updated_at();

CREATE OR REPLACE FUNCTION update_fin_collection_reminders_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_collection_reminders_updated_at ON fin_collection_reminders;
CREATE TRIGGER trg_fin_collection_reminders_updated_at BEFORE UPDATE ON fin_collection_reminders FOR EACH ROW EXECUTE FUNCTION update_fin_collection_reminders_updated_at();

CREATE OR REPLACE FUNCTION update_fin_costs_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_costs_updated_at ON fin_costs;
CREATE TRIGGER trg_fin_costs_updated_at BEFORE UPDATE ON fin_costs FOR EACH ROW EXECUTE FUNCTION update_fin_costs_updated_at();

-- Immutable history
CREATE OR REPLACE FUNCTION prevent_fin_collection_history_update_delete() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'fin_collection_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_collection_history_immutable ON fin_collection_history;
CREATE TRIGGER trg_fin_collection_history_immutable BEFORE UPDATE OR DELETE ON fin_collection_history FOR EACH ROW EXECUTE FUNCTION prevent_fin_collection_history_update_delete();

-- O catálogo audit_log é separado de auth_access_audit; CHECK de formato
-- em 075 aceita novas ações versionadas sem rejeitar eventos históricos.

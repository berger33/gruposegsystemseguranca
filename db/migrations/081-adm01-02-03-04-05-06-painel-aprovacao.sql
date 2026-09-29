-- ADM-01/02/03/04/05/06 painel meu dia comercial operacional financeiro renovação aprovação unificada
-- ADM-01 painel Meu dia com pendências reais prioridade responsável e ação
-- ADM-02 visão comercial com leads novos oportunidades paradas propostas e próximas ações
-- ADM-03 visão operacional com cobertura ocorrências críticas SLA e implantação
-- ADM-04 visão financeira com fonte/competência saldo vencimentos e margem por contrato
-- ADM-05 contratos próximos de renovar reclamações reincidentes e risco de perda justificado
-- ADM-06 aprovação unificada de descontos compras despesas e exceções permitidas alçadas por valor/escopo

DO $$ BEGIN CREATE TYPE adm_priority AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_task_status AS ENUM ('pendente','em_andamento','concluida','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_source_module AS ENUM ('crm','con','hr','ops','fin','cli','plt','adm','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_approval_type AS ENUM ('desconto','compra','despesa','excecao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_approval_status AS ENUM ('pendente','aprovado','rejeitado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_renewal_risk_level AS ENUM ('baixo','medio','alto','critico'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ADM-01 meu dia
CREATE TABLE IF NOT EXISTS adm_my_day_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
  priority adm_priority NOT NULL DEFAULT 'media',
  responsible_name TEXT NOT NULL CHECK (char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id),
  action_type TEXT NOT NULL CHECK (char_length(action_type) BETWEEN 3 AND 100),
  action_ref_id UUID,
  action_url TEXT CHECK (action_url IS NULL OR char_length(action_url) BETWEEN 5 AND 500),
  status adm_task_status NOT NULL DEFAULT 'pendente',
  due_date DATE,
  source_module adm_source_module NOT NULL DEFAULT 'adm',
  is_real_pending BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_my_day_items_status_idx ON adm_my_day_items(status);
CREATE INDEX IF NOT EXISTS adm_my_day_items_priority_idx ON adm_my_day_items(priority);
CREATE INDEX IF NOT EXISTS adm_my_day_items_responsible_idx ON adm_my_day_items(responsible_identity);
CREATE INDEX IF NOT EXISTS adm_my_day_items_due_idx ON adm_my_day_items(due_date);
CREATE INDEX IF NOT EXISTS adm_my_day_items_source_idx ON adm_my_day_items(source_module);

-- ADM-02 comercial
CREATE TABLE IF NOT EXISTS adm_commercial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  new_leads_count INT NOT NULL DEFAULT 0 CHECK (new_leads_count >=0),
  stalled_opportunities_count INT NOT NULL DEFAULT 0 CHECK (stalled_opportunities_count >=0),
  proposals_count INT NOT NULL DEFAULT 0 CHECK (proposals_count >=0),
  next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_value_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_value_cents >=0),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_date)
);
CREATE INDEX IF NOT EXISTS adm_commercial_snapshots_date_idx ON adm_commercial_snapshots(snapshot_date);

-- ADM-03 operacional
CREATE TABLE IF NOT EXISTS adm_operational_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  coverage_required_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (coverage_required_hours >=0),
  coverage_covered_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (coverage_covered_hours >=0),
  coverage_percent NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN coverage_required_hours >0 THEN (coverage_covered_hours / coverage_required_hours * 100) ELSE NULL END
  ) STORED,
  critical_occurrences_count INT NOT NULL DEFAULT 0 CHECK (critical_occurrences_count >=0),
  sla_breach_count INT NOT NULL DEFAULT 0 CHECK (sla_breach_count >=0),
  implantation_pending_count INT NOT NULL DEFAULT 0 CHECK (implantation_pending_count >=0),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_date)
);
CREATE INDEX IF NOT EXISTS adm_operational_snapshots_date_idx ON adm_operational_snapshots(snapshot_date);

-- ADM-04 financeiro
CREATE TABLE IF NOT EXISTS adm_financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competence_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 3 AND 100),
  total_receivables_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_receivables_cents >=0),
  total_payables_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_payables_cents >=0),
  balance_cents BIGINT GENERATED ALWAYS AS (total_receivables_cents - total_payables_cents) STORED,
  overdue_cents BIGINT NOT NULL DEFAULT 0 CHECK (overdue_cents >=0),
  upcoming_cents BIGINT NOT NULL DEFAULT 0 CHECK (upcoming_cents >=0),
  margin_by_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competence_date, source)
);
CREATE INDEX IF NOT EXISTS adm_financial_snapshots_competence_idx ON adm_financial_snapshots(competence_date);
CREATE INDEX IF NOT EXISTS adm_financial_snapshots_source_idx ON adm_financial_snapshots(source);

-- ADM-05 renovação risco
CREATE TABLE IF NOT EXISTS adm_renewal_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  renewal_date DATE NOT NULL,
  risk_level adm_renewal_risk_level NOT NULL DEFAULT 'medio',
  risk_score INT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  reincidence_count INT NOT NULL DEFAULT 0 CHECK (reincidence_count >=0),
  is_justified BOOLEAN NOT NULL DEFAULT false,
  facts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT adm_renewal_justified_check CHECK (
    (is_justified = false) OR (is_justified = true AND char_length(justification) >=10)
  )
);
CREATE INDEX IF NOT EXISTS adm_renewal_risks_contract_idx ON adm_renewal_risks(contract_id);
CREATE INDEX IF NOT EXISTS adm_renewal_risks_renewal_date_idx ON adm_renewal_risks(renewal_date);
CREATE INDEX IF NOT EXISTS adm_renewal_risks_level_idx ON adm_renewal_risks(risk_level);

-- ADM-06 aprovação unificada
CREATE TABLE IF NOT EXISTS adm_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^APR-ADM-[0-9]{8}-[A-Z0-9]{4}$'),
  approval_type adm_approval_type NOT NULL DEFAULT 'outro',
  reference_id UUID,
  reference_type TEXT CHECK (reference_type IS NULL OR char_length(reference_type) BETWEEN 3 AND 100),
  amount_cents BIGINT CHECK (amount_cents IS NULL OR amount_cents >=0),
  threshold_cents BIGINT CHECK (threshold_cents IS NULL OR threshold_cents >=0),
  requester_name TEXT NOT NULL CHECK (char_length(requester_name) BETWEEN 2 AND 200),
  requester_identity UUID REFERENCES auth_identities(id),
  approver_name TEXT CHECK (approver_name IS NULL OR char_length(approver_name) BETWEEN 2 AND 200),
  approver_identity UUID REFERENCES auth_identities(id),
  status adm_approval_status NOT NULL DEFAULT 'pendente',
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 1000),
  scope TEXT CHECK (scope IS NULL OR char_length(scope) BETWEEN 3 AND 200),
  approved_at TIMESTAMPTZ,
  approved_by_identity UUID REFERENCES auth_identities(id),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT adm_approval_scope_check CHECK (
    (amount_cents IS NULL OR threshold_cents IS NULL) OR (amount_cents <= threshold_cents OR approver_identity IS NOT NULL)
  ),
  CONSTRAINT adm_approval_requester_approver_diff CHECK (
    (requester_identity IS NULL OR approver_identity IS NULL) OR (requester_identity != approver_identity)
  )
);
CREATE INDEX IF NOT EXISTS adm_approvals_protocol_idx ON adm_approvals(protocol);
CREATE INDEX IF NOT EXISTS adm_approvals_status_idx ON adm_approvals(status);
CREATE INDEX IF NOT EXISTS adm_approvals_type_idx ON adm_approvals(approval_type);
CREATE INDEX IF NOT EXISTS adm_approvals_requester_idx ON adm_approvals(requester_identity);

CREATE TABLE IF NOT EXISTS adm_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES adm_approvals(id) ON DELETE CASCADE,
  previous_status adm_approval_status,
  next_status adm_approval_status NOT NULL,
  previous_amount BIGINT,
  next_amount BIGINT,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_approval_history_approval_idx ON adm_approval_history(approval_id);

-- Triggers
CREATE OR REPLACE FUNCTION update_adm_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_adm_my_day_updated ON adm_my_day_items;
CREATE TRIGGER trg_adm_my_day_updated BEFORE UPDATE ON adm_my_day_items FOR EACH ROW EXECUTE FUNCTION update_adm_updated_at();
DROP TRIGGER IF EXISTS trg_adm_renewal_risks_updated ON adm_renewal_risks;
CREATE TRIGGER trg_adm_renewal_risks_updated BEFORE UPDATE ON adm_renewal_risks FOR EACH ROW EXECUTE FUNCTION update_adm_updated_at();
DROP TRIGGER IF EXISTS trg_adm_approvals_updated ON adm_approvals;
CREATE TRIGGER trg_adm_approvals_updated BEFORE UPDATE ON adm_approvals FOR EACH ROW EXECUTE FUNCTION update_adm_updated_at();

CREATE OR REPLACE FUNCTION prevent_adm_approval_history_update() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'adm_approval_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_adm_approval_history_immutable ON adm_approval_history;
CREATE TRIGGER trg_adm_approval_history_immutable BEFORE UPDATE OR DELETE ON adm_approval_history FOR EACH ROW EXECUTE FUNCTION prevent_adm_approval_history_update();

-- FIN-13/14/15/16 orçamento gerencial cenários expansão exportação trilha fechamento competência reabertura autorizada versões relatório comissões CRM-25 provisão revisão não pagar automático
-- FIN-13 orçamento gerencial e cenários de expansão com premissas explícitas não prometer resultado
-- FIN-14 exportação do período com trilha filtros totais conciliáveis e acesso limitado do contador
-- FIN-15 fechamento de competência e reabertura autorizada preservar versões de relatório
-- FIN-16 comissões ligadas à regra CRM-25 provisão e revisão não pagar automaticamente

DO $$ BEGIN CREATE TYPE fin_budget_status AS ENUM ('rascunho','em_revisao','aprovado','rejeitado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_scenario_type AS ENUM ('conservador','base','otimista','expansao','pessimista'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_export_status AS ENUM ('pendente','gerando','gerado','falhou','expirado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_closure_status AS ENUM ('aberta','fechada','reaberta','bloqueada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fin_commission_provision_status AS ENUM ('provisionada','em_revisao','revisada','paga','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FIN-13 orçamento gerencial e cenários
CREATE TABLE IF NOT EXISTS fin_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^ORC-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  premises TEXT NOT NULL CHECK (char_length(premises) BETWEEN 10 AND 2000),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  total_revenue_cents BIGINT CHECK (total_revenue_cents IS NULL OR total_revenue_cents >=0),
  total_cost_cents BIGINT CHECK (total_cost_cents IS NULL OR total_cost_cents >=0),
  total_margin_cents BIGINT GENERATED ALWAYS AS (
    CASE WHEN total_revenue_cents IS NOT NULL AND total_cost_cents IS NOT NULL THEN total_revenue_cents - total_cost_cents ELSE NULL END
  ) STORED,
  status fin_budget_status NOT NULL DEFAULT 'rascunho',
  is_estimate BOOLEAN NOT NULL DEFAULT true,
  estimate_note TEXT NOT NULL DEFAULT 'não prometer resultado - premissas explícitas' CHECK (char_length(estimate_note) BETWEEN 10 AND 500),
  created_by_identity UUID REFERENCES auth_identities(id),
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_budget_approved_requires_approver CHECK (
    (status != 'aprovado') OR (approved_by_identity IS NOT NULL AND approved_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS fin_budgets_protocol_idx ON fin_budgets(protocol);
CREATE INDEX IF NOT EXISTS fin_budgets_period_idx ON fin_budgets(period_start, period_end);
CREATE INDEX IF NOT EXISTS fin_budgets_status_idx ON fin_budgets(status);

CREATE TABLE IF NOT EXISTS fin_budget_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES fin_budgets(id) ON DELETE CASCADE,
  scenario_type fin_scenario_type NOT NULL DEFAULT 'base',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  premises TEXT NOT NULL CHECK (char_length(premises) BETWEEN 10 AND 2000),
  projected_revenue_cents BIGINT CHECK (projected_revenue_cents IS NULL OR projected_revenue_cents >=0),
  projected_cost_cents BIGINT CHECK (projected_cost_cents IS NULL OR projected_cost_cents >=0),
  projected_margin_cents BIGINT GENERATED ALWAYS AS (
    CASE WHEN projected_revenue_cents IS NOT NULL AND projected_cost_cents IS NOT NULL THEN projected_revenue_cents - projected_cost_cents ELSE NULL END
  ) STORED,
  projected_margin_percent NUMERIC(5,2) CHECK (projected_margin_percent IS NULL OR projected_margin_percent BETWEEN -100 AND 100),
  is_estimate BOOLEAN NOT NULL DEFAULT true,
  estimate_note TEXT NOT NULL DEFAULT 'cenário é estimativa identificada - não prometer resultado' CHECK (char_length(estimate_note) BETWEEN 10 AND 500),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(budget_id, scenario_type)
);
CREATE INDEX IF NOT EXISTS fin_budget_scenarios_budget_idx ON fin_budget_scenarios(budget_id);

-- FIN-14 exportação do período com trilha filtros totais conciliáveis acesso limitado do contador
CREATE TABLE IF NOT EXISTS fin_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^EXP-FIN-[0-9]{8}-[A-Z0-9]{4}$'),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_records INT NOT NULL DEFAULT 0 CHECK (total_records >=0),
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  status fin_export_status NOT NULL DEFAULT 'pendente',
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  is_accountant_limited BOOLEAN NOT NULL DEFAULT true,
  access_role TEXT NOT NULL DEFAULT 'contador' CHECK (char_length(access_role) BETWEEN 3 AND 100),
  requested_by_identity UUID REFERENCES auth_identities(id),
  generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_exports_protocol_idx ON fin_exports(protocol);
CREATE INDEX IF NOT EXISTS fin_exports_period_idx ON fin_exports(period_start, period_end);
CREATE INDEX IF NOT EXISTS fin_exports_status_idx ON fin_exports(status);

CREATE TABLE IF NOT EXISTS fin_export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id UUID NOT NULL REFERENCES fin_exports(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 3 AND 200),
  actor_identity UUID REFERENCES auth_identities(id),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_export_logs_export_idx ON fin_export_logs(export_id);

-- FIN-15 fechamento de competência e reabertura autorizada preservar versões de relatório
CREATE TABLE IF NOT EXISTS fin_competence_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competence_date DATE NOT NULL UNIQUE,
  status fin_closure_status NOT NULL DEFAULT 'aberta',
  closed_by_identity UUID REFERENCES auth_identities(id),
  closed_at TIMESTAMPTZ,
  reopened_by_identity UUID REFERENCES auth_identities(id),
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT CHECK (reopen_reason IS NULL OR char_length(reopen_reason) BETWEEN 10 AND 1000),
  authorized_by_identity UUID REFERENCES auth_identities(id),
  authorized_at TIMESTAMPTZ,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_closure_reopen_requires_reason CHECK (
    (status != 'reaberta') OR (reopen_reason IS NOT NULL AND char_length(reopen_reason) >=10 AND authorized_by_identity IS NOT NULL)
  ),
  CONSTRAINT fin_closure_closed_requires_closer CHECK (
    (status NOT IN ('fechada','reaberta')) OR (closed_by_identity IS NOT NULL AND closed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS fin_competence_closures_competence_idx ON fin_competence_closures(competence_date);
CREATE INDEX IF NOT EXISTS fin_competence_closures_status_idx ON fin_competence_closures(status);

CREATE TABLE IF NOT EXISTS fin_report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES fin_competence_closures(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >0),
  report_type TEXT NOT NULL CHECK (char_length(report_type) BETWEEN 3 AND 200),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_preserved BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(closure_id, version)
);
CREATE INDEX IF NOT EXISTS fin_report_versions_closure_idx ON fin_report_versions(closure_id);
CREATE INDEX IF NOT EXISTS fin_report_versions_type_idx ON fin_report_versions(report_type);

-- FIN-16 comissões ligadas à regra CRM-25 provisão e revisão não pagar automaticamente
CREATE TABLE IF NOT EXISTS fin_commission_provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES crm_commission_rules(id) ON DELETE SET NULL,
  commission_id UUID REFERENCES crm_commissions(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  provision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >=0),
  status fin_commission_provision_status NOT NULL DEFAULT 'provisionada',
  is_auto_paid BOOLEAN NOT NULL DEFAULT false CHECK (is_auto_paid = false),
  provisioned_by_identity UUID REFERENCES auth_identities(id),
  reviewed_by_identity UUID REFERENCES auth_identities(id),
  reviewed_at TIMESTAMPTZ,
  revision_reason TEXT CHECK (revision_reason IS NULL OR char_length(revision_reason) BETWEEN 10 AND 1000),
  paid_at TIMESTAMPTZ,
  paid_by_identity UUID REFERENCES auth_identities(id),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fin_commission_provision_review_requires_reason CHECK (
    (status NOT IN ('em_revisao','revisada')) OR (revision_reason IS NOT NULL AND char_length(revision_reason) >=10)
  )
);
CREATE INDEX IF NOT EXISTS fin_commission_provisions_rule_idx ON fin_commission_provisions(rule_id);
CREATE INDEX IF NOT EXISTS fin_commission_provisions_commission_idx ON fin_commission_provisions(commission_id);
CREATE INDEX IF NOT EXISTS fin_commission_provisions_status_idx ON fin_commission_provisions(status);
CREATE INDEX IF NOT EXISTS fin_commission_provisions_date_idx ON fin_commission_provisions(provision_date);

CREATE TABLE IF NOT EXISTS fin_commission_provision_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provision_id UUID NOT NULL REFERENCES fin_commission_provisions(id) ON DELETE CASCADE,
  previous_status fin_commission_provision_status,
  next_status fin_commission_provision_status NOT NULL,
  previous_amount BIGINT,
  next_amount BIGINT,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  is_auto_paid_attempt BOOLEAN NOT NULL DEFAULT false CHECK (is_auto_paid_attempt = false),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_commission_provision_history_provision_idx ON fin_commission_provision_history(provision_id);

-- Triggers
CREATE OR REPLACE FUNCTION update_fin_budget_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_budgets_updated ON fin_budgets;
CREATE TRIGGER trg_fin_budgets_updated BEFORE UPDATE ON fin_budgets FOR EACH ROW EXECUTE FUNCTION update_fin_budget_updated_at();
DROP TRIGGER IF EXISTS trg_fin_exports_updated ON fin_exports;
CREATE TRIGGER trg_fin_exports_updated BEFORE UPDATE ON fin_exports FOR EACH ROW EXECUTE FUNCTION update_fin_budget_updated_at();
DROP TRIGGER IF EXISTS trg_fin_competence_closures_updated ON fin_competence_closures;
CREATE TRIGGER trg_fin_competence_closures_updated BEFORE UPDATE ON fin_competence_closures FOR EACH ROW EXECUTE FUNCTION update_fin_budget_updated_at();
DROP TRIGGER IF EXISTS trg_fin_commission_provisions_updated ON fin_commission_provisions;
CREATE TRIGGER trg_fin_commission_provisions_updated BEFORE UPDATE ON fin_commission_provisions FOR EACH ROW EXECUTE FUNCTION update_fin_budget_updated_at();

CREATE OR REPLACE FUNCTION prevent_fin_commission_history_update() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'fin_commission_provision_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_fin_commission_history_immutable ON fin_commission_provision_history;
CREATE TRIGGER trg_fin_commission_history_immutable BEFORE UPDATE OR DELETE ON fin_commission_provision_history FOR EACH ROW EXECUTE FUNCTION prevent_fin_commission_history_update();

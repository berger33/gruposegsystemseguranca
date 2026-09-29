-- 022-crm17-price-scenarios: CRM-17 cenários preço/margem, separa margem de markup, fórmula custo/(1-taxa-margem) sob premissas explícitas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_price_formula_type') THEN
    CREATE TYPE crm_price_formula_type AS ENUM ('margem_receita','markup_custo','custom','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_price_scenario_status') THEN
    CREATE TYPE crm_price_scenario_status AS ENUM ('rascunho','em_revisao','aprovado','arquivado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_price_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  technical_budget_id UUID REFERENCES crm_technical_budgets(id) ON DELETE SET NULL,
  labor_budget_id UUID REFERENCES crm_labor_budgets(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT CHECK (char_length(description) BETWEEN 1 AND 2000),
  base_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (base_cost >= 0),
  tax_rate NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 1),
  margin_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (margin_percent >= -100 AND margin_percent <= 100),
  markup_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (markup_percent >= -100 AND markup_percent <= 500),
  price_calculated NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (price_calculated >= 0),
  price_by_margin_formula NUMERIC(14,2) CHECK (price_by_margin_formula IS NULL OR price_by_margin_formula >= 0),
  price_by_markup NUMERIC(14,2) CHECK (price_by_markup IS NULL OR price_by_markup >= 0),
  formula_type crm_price_formula_type NOT NULL DEFAULT 'outro',
  premises TEXT CHECK (char_length(premises) BETWEEN 1 AND 2000),
  denominator_valid BOOLEAN NOT NULL DEFAULT false,
  denominator_value NUMERIC(10,6),
  tax_is_proportional_to_revenue BOOLEAN NOT NULL DEFAULT false,
  margin_is_on_revenue BOOLEAN NOT NULL DEFAULT false,
  requires_accounting_approval BOOLEAN NOT NULL DEFAULT true,
  approval_status crm_price_scenario_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_role TEXT CHECK (char_length(approved_by_role) BETWEEN 1 AND 50),
  accounting_approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  accounting_approved_at TIMESTAMPTZ,
  accounting_approval_note TEXT CHECK (char_length(accounting_approval_note) BETWEEN 1 AND 1000),
  notes TEXT CHECK (char_length(notes) BETWEEN 1 AND 2000),
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_premises_for_margin_formula CHECK (
    formula_type != 'margem_receita' OR (premises IS NOT NULL AND char_length(premises) >= 10)
  )
);

CREATE INDEX IF NOT EXISTS idx_crm_price_scenarios_company ON crm_price_scenarios(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_price_scenarios_opportunity ON crm_price_scenarios(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_price_scenarios_tech_budget ON crm_price_scenarios(technical_budget_id);
CREATE INDEX IF NOT EXISTS idx_crm_price_scenarios_labor_budget ON crm_price_scenarios(labor_budget_id);
CREATE INDEX IF NOT EXISTS idx_crm_price_scenarios_status ON crm_price_scenarios(approval_status);
CREATE INDEX IF NOT EXISTS idx_crm_price_scenarios_formula ON crm_price_scenarios(formula_type);

DROP TRIGGER IF EXISTS trg_crm_price_scenarios_updated ON crm_price_scenarios;
CREATE TRIGGER trg_crm_price_scenarios_updated
BEFORE UPDATE ON crm_price_scenarios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

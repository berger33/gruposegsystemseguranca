-- 023-crm18-discount-tiers: CRM-18 alçadas desconto e exceções, motivo, solicitante, aprovador, versão, reabre aprovação se alterar itens/custos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_discount_policy_status') THEN
    CREATE TYPE crm_discount_policy_status AS ENUM ('rascunho','em_revisao','aprovado','arquivado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_discount_request_status') THEN
    CREATE TYPE crm_discount_request_status AS ENUM ('rascunho','solicitado','em_analise','aprovado','rejeitado','arquivado','expirado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_discount_scope_type') THEN
    CREATE TYPE crm_discount_scope_type AS ENUM ('global','company','opportunity','service','technical_budget','labor_budget','price_scenario','outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_discount_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (char_length(description) BETWEEN 1 AND 2000),
  scope_type crm_discount_scope_type NOT NULL DEFAULT 'global',
  scope_id UUID,
  min_discount_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (min_discount_percent >= 0 AND min_discount_percent <= 100),
  max_discount_percent NUMERIC(6,3) NOT NULL DEFAULT 100 CHECK (max_discount_percent >= 0 AND max_discount_percent <= 100),
  min_amount NUMERIC(14,2) CHECK (min_amount IS NULL OR min_amount >= 0),
  max_amount NUMERIC(14,2) CHECK (max_amount IS NULL OR max_amount >= 0),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approver_role TEXT CHECK (char_length(approver_role) BETWEEN 1 AND 50),
  approval_status crm_discount_policy_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_role TEXT CHECK (char_length(approved_by_role) BETWEEN 1 AND 50),
  notes TEXT CHECK (char_length(notes) BETWEEN 1 AND 2000),
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_discount_range CHECK (max_discount_percent >= min_discount_percent),
  CONSTRAINT chk_amount_range CHECK (max_amount IS NULL OR min_amount IS NULL OR max_amount >= min_amount)
);

CREATE INDEX IF NOT EXISTS idx_crm_discount_policies_scope ON crm_discount_policies(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_crm_discount_policies_status ON crm_discount_policies(approval_status);

DROP TRIGGER IF EXISTS trg_crm_discount_policies_updated ON crm_discount_policies;
CREATE TRIGGER trg_crm_discount_policies_updated BEFORE UPDATE ON crm_discount_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_discount_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES crm_discount_policies(id) ON DELETE SET NULL,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  technical_budget_id UUID REFERENCES crm_technical_budgets(id) ON DELETE SET NULL,
  labor_budget_id UUID REFERENCES crm_labor_budgets(id) ON DELETE SET NULL,
  price_scenario_id UUID REFERENCES crm_price_scenarios(id) ON DELETE SET NULL,
  requested_discount_percent NUMERIC(6,3) NOT NULL CHECK (requested_discount_percent >= 0 AND requested_discount_percent <= 100),
  requested_amount NUMERIC(14,2) CHECK (requested_amount IS NULL OR requested_amount >= 0),
  original_price NUMERIC(14,2) NOT NULL CHECK (original_price >= 0),
  discounted_price NUMERIC(14,2) NOT NULL CHECK (discounted_price >= 0),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  requester_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  requester_role TEXT CHECK (char_length(requester_role) BETWEEN 1 AND 50),
  requester_name TEXT CHECK (char_length(requester_name) BETWEEN 1 AND 120),
  approver_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approver_role TEXT CHECK (char_length(approver_role) BETWEEN 1 AND 50),
  approver_name TEXT CHECK (char_length(approver_name) BETWEEN 1 AND 120),
  status crm_discount_request_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  budget_version_at_request INT,
  budget_version_at_approval INT,
  technical_budget_version_at_approval INT,
  labor_budget_version_at_approval INT,
  price_scenario_version_at_approval INT,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(rejection_reason) BETWEEN 1 AND 1000),
  reapproval_required BOOLEAN NOT NULL DEFAULT false,
  reapproval_reason TEXT CHECK (char_length(reapproval_reason) BETWEEN 1 AND 1000),
  notes TEXT CHECK (char_length(notes) BETWEEN 1 AND 2000),
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_policy ON crm_discount_requests(policy_id);
CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_company ON crm_discount_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_opportunity ON crm_discount_requests(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_tech_budget ON crm_discount_requests(technical_budget_id);
CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_labor_budget ON crm_discount_requests(labor_budget_id);
CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_price_scenario ON crm_discount_requests(price_scenario_id);
CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_status ON crm_discount_requests(status);
CREATE INDEX IF NOT EXISTS idx_crm_discount_requests_reapproval ON crm_discount_requests(reapproval_required) WHERE reapproval_required = true;

DROP TRIGGER IF EXISTS trg_crm_discount_requests_updated ON crm_discount_requests;
CREATE TRIGGER trg_crm_discount_requests_updated BEFORE UPDATE ON crm_discount_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

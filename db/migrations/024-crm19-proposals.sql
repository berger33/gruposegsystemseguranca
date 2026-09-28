-- 024-crm19-proposals: CRM-19 proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões, prazo, reajuste, validade, condições, PDF da mesma versão
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_proposal_status') THEN
    CREATE TYPE crm_proposal_status AS ENUM ('rascunho','em_revisao','aprovada_para_envio','enviada','aceita','recusada','expirada','substituida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_proposal_recurrence') THEN
    CREATE TYPE crm_proposal_recurrence AS ENUM ('recorrente','avulso','implantacao','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_proposal_item_type') THEN
    CREATE TYPE crm_proposal_item_type AS ENUM ('material','equipamento','mao_obra','servico','instalacao','deslocamento','infraestrutura','licenca','garantia','manutencao','outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  technical_budget_id UUID REFERENCES crm_technical_budgets(id) ON DELETE SET NULL,
  labor_budget_id UUID REFERENCES crm_labor_budgets(id) ON DELETE SET NULL,
  price_scenario_id UUID REFERENCES crm_price_scenarios(id) ON DELETE SET NULL,
  discount_request_id UUID REFERENCES crm_discount_requests(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status crm_proposal_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  scope_description TEXT CHECK (char_length(scope_description) BETWEEN 1 AND 5000),
  exclusions TEXT CHECK (char_length(exclusions) BETWEEN 1 AND 5000),
  implementation_details TEXT CHECK (char_length(implementation_details) BETWEEN 1 AND 5000),
  deadline_description TEXT CHECK (char_length(deadline_description) BETWEEN 1 AND 1000),
  readjustment_forecast TEXT CHECK (char_length(readjustment_forecast) BETWEEN 1 AND 1000),
  validity_days INT CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 365)),
  validity_until DATE,
  conditions TEXT CHECK (char_length(conditions) BETWEEN 1 AND 5000),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  margin_percent NUMERIC(6,3) CHECK (margin_percent IS NULL OR (margin_percent >= -100 AND margin_percent <= 100)),
  notes TEXT CHECK (char_length(notes) BETWEEN 1 AND 5000),
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_role TEXT CHECK (char_length(approved_by_role) BETWEEN 1 AND 50),
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_company ON crm_proposals(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_opportunity ON crm_proposals(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_status ON crm_proposals(status);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_version ON crm_proposals(version);

DROP TRIGGER IF EXISTS trg_crm_proposals_updated ON crm_proposals;
CREATE TRIGGER trg_crm_proposals_updated BEFORE UPDATE ON crm_proposals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
  proposal_version INT NOT NULL DEFAULT 1 CHECK (proposal_version >= 1),
  type crm_proposal_item_type NOT NULL DEFAULT 'outro',
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  equipment_id TEXT REFERENCES crm_equipment(id) ON DELETE SET NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT CHECK (char_length(unit) BETWEEN 1 AND 50),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  recurrence_type crm_proposal_recurrence NOT NULL DEFAULT 'avulso',
  recurrence_details TEXT CHECK (char_length(recurrence_details) BETWEEN 1 AND 500),
  supplier_name TEXT CHECK (char_length(supplier_name) BETWEEN 1 AND 200),
  notes TEXT CHECK (char_length(notes) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_proposal_items_proposal ON crm_proposal_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposal_items_proposal_version ON crm_proposal_items(proposal_id, proposal_version);
CREATE INDEX IF NOT EXISTS idx_crm_proposal_items_type ON crm_proposal_items(type);

DROP TRIGGER IF EXISTS trg_crm_proposal_items_updated ON crm_proposal_items;
CREATE TRIGGER trg_crm_proposal_items_updated BEFORE UPDATE ON crm_proposal_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_proposal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >= 1),
  snapshot JSONB NOT NULL,
  reason TEXT CHECK (char_length(reason) BETWEEN 1 AND 1000),
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id, version)
);

CREATE INDEX IF NOT EXISTS idx_crm_proposal_versions_proposal ON crm_proposal_versions(proposal_id);

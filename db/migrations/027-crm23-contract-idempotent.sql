-- 027-crm23-contract-idempotent: CRM-23 proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_contract_status') THEN
    CREATE TYPE crm_contract_status AS ENUM ('rascunho','ativo','suspenso','encerrado','cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_contract_origin') THEN
    CREATE TYPE crm_contract_origin AS ENUM ('manual','crm_proposal_acceptance','importacao');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_implantation_status') THEN
    CREATE TYPE crm_implantation_status AS ENUM ('planejada','em_andamento','concluida','cancelada');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
  proposal_version INT NOT NULL CHECK (proposal_version >= 1),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status crm_contract_status NOT NULL DEFAULT 'ativo',
  origin crm_contract_origin NOT NULL DEFAULT 'crm_proposal_acceptance',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin_percent NUMERIC(5,2),
  validity_days INT CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 365)),
  validity_until DATE,
  conditions TEXT CHECK (conditions IS NULL OR char_length(conditions) BETWEEN 1 AND 5000),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 5000),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id, proposal_version),
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS crm_contracts_proposal_idx ON crm_contracts(proposal_id);
CREATE INDEX IF NOT EXISTS crm_contracts_company_idx ON crm_contracts(company_id);
CREATE INDEX IF NOT EXISTS crm_contracts_status_idx ON crm_contracts(status);
CREATE INDEX IF NOT EXISTS crm_contracts_created_at_idx ON crm_contracts(created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_contracts_updated_at ON crm_contracts;
CREATE TRIGGER trg_crm_contracts_updated_at
BEFORE UPDATE ON crm_contracts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS crm_contract_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  proposal_item_id UUID REFERENCES crm_proposal_items(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (char_length(type) BETWEEN 1 AND 50),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  equipment_id TEXT REFERENCES crm_equipment(id) ON DELETE SET NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'un' CHECK (char_length(unit) BETWEEN 1 AND 50),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  recurrence_type TEXT NOT NULL DEFAULT 'avulso' CHECK (recurrence_type IN ('recorrente','avulso','implantacao','outro')),
  recurrence_details TEXT CHECK (recurrence_details IS NULL OR char_length(recurrence_details) BETWEEN 1 AND 500),
  supplier_name TEXT CHECK (supplier_name IS NULL OR char_length(supplier_name) BETWEEN 1 AND 200),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, proposal_item_id)
);

CREATE INDEX IF NOT EXISTS crm_contract_items_contract_idx ON crm_contract_items(contract_id);
CREATE INDEX IF NOT EXISTS crm_contract_items_type_idx ON crm_contract_items(type);

CREATE TABLE IF NOT EXISTS crm_contract_implantations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES crm_proposals(id) ON DELETE CASCADE,
  proposal_version INT NOT NULL CHECK (proposal_version >= 1),
  status crm_implantation_status NOT NULL DEFAULT 'planejada',
  checklist JSONB NOT NULL DEFAULT '{"itens": [{"id": "contrato", "label": "Contrato assinado", "done": false}, {"id": "data_inicio", "label": "Data de início definida", "done": false}, {"id": "postos", "label": "Postos/turnos contratados dimensionados", "done": false}, {"id": "dimensionamento", "label": "Dimensionamento validado", "done": false}, {"id": "contratacao_alocacao", "label": "Contratação/alocação de equipe", "done": false}, {"id": "exames_treinamentos", "label": "Exames/treinamentos", "done": false}, {"id": "equipamentos", "label": "Equipamentos", "done": false}, {"id": "instrucoes", "label": "Instruções operacionais", "done": false}, {"id": "faturamento", "label": "Faturamento configurado", "done": false}, {"id": "convite_cliente", "label": "Convite do cliente para portal", "done": false}]}'::jsonb,
  started_at DATE,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 80),
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id)
);

CREATE INDEX IF NOT EXISTS crm_contract_implantations_contract_idx ON crm_contract_implantations(contract_id);
CREATE INDEX IF NOT EXISTS crm_contract_implantations_status_idx ON crm_contract_implantations(status);

DROP TRIGGER IF EXISTS trg_crm_contract_implantations_updated_at ON crm_contract_implantations;
CREATE TRIGGER trg_crm_contract_implantations_updated_at
BEFORE UPDATE ON crm_contract_implantations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoria para CRM-23
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept',
  'login','logout','session_revoke_all',
  'email_confirm','email_confirm_resend',
  'password_reset_request','password_reset_complete',
  'account_create','account_status',
  'grant_issue','grant_revoke',
  'contract_create','contract_status','contract_list',
  'document_upload','document_download','document_list',
  'ticket_open','ticket_status','ticket_list',
  'crm_company_create','crm_company_update','crm_company_export',
  'crm_contact_create','crm_contact_update',
  'crm_opportunity_create','crm_opportunity_update',
  'crm_lead_convert',
  'crm_import_create','crm_import_preview','crm_import_commit',
  'crm_equipment_create','crm_equipment_update',
  'crm_inspection_template_create','crm_inspection_create','crm_inspection_answer',
  'crm_labor_budget_create','crm_labor_budget_update','crm_labor_budget_item_create',
  'crm_technical_budget_create','crm_technical_budget_update','crm_technical_budget_item_create',
  'crm_cost_parameter_create','crm_cost_parameter_update',
  'crm_price_scenario_create','crm_price_scenario_update',
  'crm_discount_policy_create','crm_discount_policy_update',
  'crm_discount_request_create','crm_discount_request_update',
  'crm_proposal_create','crm_proposal_update','crm_proposal_status_enviada','crm_proposal_status_aceita','crm_proposal_item_create',
  'crm_proposal_delivery_create','crm_proposal_delivery_sent','crm_proposal_delivery_status',
  'crm_acceptance_link_create','crm_acceptance_link_used',
  'crm_contract_create','crm_contract_idempotent_hit','crm_contract_implantation_create'
));

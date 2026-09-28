-- 021-crm16-cost-parameters: CRM-16 parâmetros tributos/custos/jornada versionados
-- idempotente, sem alíquota inventada, com validade, fonte, aprovador, essencial para impedir preço oficial

-- Trigger utilizado nesta migração; definições de HR posteriores não podem ser
-- pré-requisito da instalação em PostgreSQL limpo.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $trigger$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_cost_param_category') THEN
    CREATE TYPE crm_cost_param_category AS ENUM ('tributo','custo','jornada','beneficio','provisao','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_cost_param_value_type') THEN
    CREATE TYPE crm_cost_param_value_type AS ENUM ('percentual','valor','json');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_cost_param_status') THEN
    CREATE TYPE crm_cost_param_status AS ENUM ('rascunho','em_revisao','aprovado','arquivado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_cost_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  category crm_cost_param_category NOT NULL DEFAULT 'outro',
  param_key TEXT NOT NULL CHECK (char_length(param_key) BETWEEN 1 AND 100),
  param_value NUMERIC(14,6) NOT NULL DEFAULT 0 CHECK (param_value >= -1000000),
  value_type crm_cost_param_value_type NOT NULL DEFAULT 'percentual',
  value_json JSONB,
  unit TEXT CHECK (char_length(unit) BETWEEN 1 AND 50),
  validity_start DATE,
  validity_end DATE CHECK (validity_end IS NULL OR validity_start IS NULL OR validity_end >= validity_start),
  source TEXT CHECK (char_length(source) BETWEEN 1 AND 500),
  source_url TEXT CHECK (char_length(source_url) BETWEEN 1 AND 500),
  is_essential BOOLEAN NOT NULL DEFAULT false,
  approval_status crm_cost_param_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_role TEXT CHECK (char_length(approved_by_role) BETWEEN 1 AND 50),
  notes TEXT CHECK (char_length(notes) BETWEEN 1 AND 2000),
  created_by TEXT CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_validity CHECK (validity_start IS NULL OR validity_end IS NULL OR validity_end >= validity_start)
);

CREATE INDEX IF NOT EXISTS idx_crm_cost_params_company ON crm_cost_parameters(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_cost_params_category ON crm_cost_parameters(category);
CREATE INDEX IF NOT EXISTS idx_crm_cost_params_key ON crm_cost_parameters(param_key);
CREATE INDEX IF NOT EXISTS idx_crm_cost_params_status ON crm_cost_parameters(approval_status);
CREATE INDEX IF NOT EXISTS idx_crm_cost_params_essential ON crm_cost_parameters(is_essential) WHERE is_essential = true;
CREATE INDEX IF NOT EXISTS idx_crm_cost_params_validity ON crm_cost_parameters(validity_start, validity_end);

DROP TRIGGER IF EXISTS trg_crm_cost_params_updated ON crm_cost_parameters;
CREATE TRIGGER trg_crm_cost_params_updated
BEFORE UPDATE ON crm_cost_parameters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Exemplos iniciais SEM alíquota inventada: placeholders rascunho aguardando validação contábil/jurídica
-- Não inserir valores reais sem fonte aprovada; inserir apenas estrutura com status rascunho e is_essential true para bloquear preço oficial se faltar parâmetro
INSERT INTO crm_cost_parameters (id, category, param_key, param_value, value_type, unit, source, is_essential, approval_status, version, notes)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'tributo', 'INSS_PATRONAL', 0, 'percentual', '%', 'A definir - aguardando validação contábil', true, 'rascunho', 1, 'Parâmetro essencial - sem valor oficial inventado. Definir com contador. Impede preço oficial se faltar.'),
  ('00000000-0000-0000-0000-000000000002', 'tributo', 'FGTS', 0, 'percentual', '%', 'A definir - aguardando validação contábil', true, 'rascunho', 1, 'Parâmetro essencial FGTS.'),
  ('00000000-0000-0000-0000-000000000003', 'jornada', 'HORAS_MES_220', 220, 'valor', 'horas', 'Convenção coletiva - aguardando confirmação RH', true, 'rascunho', 1, 'Jornada padrão mensal - validar convenção.')
ON CONFLICT (id) DO NOTHING;

-- Auditoria: reutiliza auth_access_audit com categorias crm_cost_param_*
-- Sem dados pessoais, sem segredos

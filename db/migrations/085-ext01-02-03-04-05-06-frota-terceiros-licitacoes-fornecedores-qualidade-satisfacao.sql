-- EXT-01/02/03/04/05/06 frota terceiros licitações portal fornecedores qualidade satisfação/carteira
-- EXT-01 Frota veículo responsável abastecimento manutenção documentos custo se frota própria existir
-- EXT-02 Terceiros cadastro contrato documentos vencimentos acesso temporário avaliação
-- EXT-03 Licitações edital prazos documentos responsáveis proposta resultado se mercado relevante
-- EXT-04 Portal fornecedores cotações/documentos/pedidos escopo próprio se volume justificar
-- EXT-05 Qualidade não conformidade causa ação corretiva verificação reincidência
-- EXT-06 Satisfação/carteira pesquisas CSAT/NPS histórico tarefa recuperação

DO $$ BEGIN CREATE TYPE ext_fleet_status AS ENUM ('disponivel','em_uso','em_manutencao','baixado','reservado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_fuel_type AS ENUM ('gasolina','etanol','diesel','flex','eletrico','hibrido','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_third_party_status AS ENUM ('ativo','inativo','suspenso','encerrado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_bidding_status AS ENUM ('rascunho','publicado','em_analise','homologado','vencido','cancelado','deserto'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_supplier_portal_status AS ENUM ('rascunho','enviado','em_analise','aprovado','rejeitado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_quality_status AS ENUM ('aberta','em_analise','em_acao_corretiva','verificacao','encerrada','reaberta'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_quality_severity AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_satisfaction_type AS ENUM ('pesquisa','csat','nps','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_satisfaction_status AS ENUM ('pendente','em_acompanhamento','concluida','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EXT-01 frota
CREATE TABLE IF NOT EXISTS ext_fleet_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate TEXT NOT NULL UNIQUE CHECK (char_length(plate) BETWEEN 3 AND 20),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 3 AND 200),
  manufacturer TEXT CHECK (manufacturer IS NULL OR char_length(manufacturer) BETWEEN 2 AND 200),
  year INT CHECK (year IS NULL OR year BETWEEN 1900 AND 2100),
  fuel_type ext_fuel_type NOT NULL DEFAULT 'flex',
  status ext_fleet_status NOT NULL DEFAULT 'disponivel',
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  mileage INT NOT NULL DEFAULT 0 CHECK (mileage >=0),
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  cost_center TEXT CHECK (cost_center IS NULL OR char_length(cost_center) BETWEEN 3 AND 100),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_fleet_vehicles_plate_idx ON ext_fleet_vehicles(plate);
CREATE INDEX IF NOT EXISTS ext_fleet_vehicles_status_idx ON ext_fleet_vehicles(status);

CREATE TABLE IF NOT EXISTS ext_fleet_fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES ext_fleet_vehicles(id) ON DELETE CASCADE,
  fuel_date DATE NOT NULL,
  liters NUMERIC(10,2) NOT NULL CHECK (liters >0),
  cost_cents BIGINT NOT NULL CHECK (cost_cents >=0),
  mileage INT CHECK (mileage IS NULL OR mileage >=0),
  station TEXT CHECK (station IS NULL OR char_length(station) BETWEEN 3 AND 200),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_fleet_fuel_logs_vehicle_idx ON ext_fleet_fuel_logs(vehicle_id);

CREATE TABLE IF NOT EXISTS ext_fleet_maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES ext_fleet_vehicles(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL CHECK (char_length(maintenance_type) BETWEEN 3 AND 100),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  cost_cents BIGINT NOT NULL CHECK (cost_cents >=0),
  mileage INT CHECK (mileage IS NULL OR mileage >=0),
  performed_at DATE NOT NULL,
  next_due_date DATE,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_fleet_maintenance_logs_vehicle_idx ON ext_fleet_maintenance_logs(vehicle_id);

CREATE TABLE IF NOT EXISTS ext_fleet_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES ext_fleet_vehicles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (char_length(document_type) BETWEEN 3 AND 100),
  document_number TEXT CHECK (document_number IS NULL OR char_length(document_number) BETWEEN 3 AND 200),
  expiry_date DATE,
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_fleet_documents_vehicle_idx ON ext_fleet_documents(vehicle_id);

-- EXT-02 terceiros
CREATE TABLE IF NOT EXISTS ext_third_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  document TEXT CHECK (document IS NULL OR char_length(document) BETWEEN 3 AND 30),
  category TEXT CHECK (category IS NULL OR char_length(category) BETWEEN 3 AND 100),
  status ext_third_party_status NOT NULL DEFAULT 'ativo',
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  access_start DATE,
  access_end DATE CHECK (access_end IS NULL OR access_start IS NULL OR access_end >= access_start),
  evaluation_score INT CHECK (evaluation_score IS NULL OR evaluation_score BETWEEN 0 AND 10),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_third_parties_status_idx ON ext_third_parties(status);
CREATE INDEX IF NOT EXISTS ext_third_parties_contract_idx ON ext_third_parties(contract_id);

CREATE TABLE IF NOT EXISTS ext_third_party_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  third_party_id UUID NOT NULL REFERENCES ext_third_parties(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (char_length(document_type) BETWEEN 3 AND 100),
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  expiry_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_third_party_documents_third_idx ON ext_third_party_documents(third_party_id);

CREATE TABLE IF NOT EXISTS ext_third_party_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  third_party_id UUID NOT NULL REFERENCES ext_third_parties(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL CHECK (char_length(access_type) BETWEEN 3 AND 100),
  granted_by_identity UUID REFERENCES auth_identities(id),
  revoked_at TIMESTAMPTZ,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_third_party_access_logs_third_idx ON ext_third_party_access_logs(third_party_id);

-- EXT-03 licitações
CREATE TABLE IF NOT EXISTS ext_bidding_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^LIC-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  edital_number TEXT NOT NULL UNIQUE CHECK (char_length(edital_number) BETWEEN 3 AND 200),
  status ext_bidding_status NOT NULL DEFAULT 'rascunho',
  publication_date DATE,
  deadline_date DATE CHECK (deadline_date IS NULL OR publication_date IS NULL OR deadline_date >= publication_date),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  estimated_value_cents BIGINT CHECK (estimated_value_cents IS NULL OR estimated_value_cents >=0),
  result TEXT CHECK (result IS NULL OR char_length(result) BETWEEN 10 AND 2000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_bidding_notices_protocol_idx ON ext_bidding_notices(protocol);
CREATE INDEX IF NOT EXISTS ext_bidding_notices_status_idx ON ext_bidding_notices(status);

CREATE TABLE IF NOT EXISTS ext_bidding_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_id UUID NOT NULL REFERENCES ext_bidding_notices(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (char_length(document_type) BETWEEN 3 AND 100),
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  version INT NOT NULL DEFAULT 1 CHECK (version >0),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bidding_id, storage_key)
);
CREATE INDEX IF NOT EXISTS ext_bidding_documents_bidding_idx ON ext_bidding_documents(bidding_id);

-- EXT-04 portal fornecedores
CREATE TABLE IF NOT EXISTS ext_supplier_portal_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^FORN-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  supplier_id UUID REFERENCES ast_suppliers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES ast_products(id) ON DELETE SET NULL,
  quantity INT NOT NULL CHECK (quantity >0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >=0),
  total_price_cents BIGINT NOT NULL CHECK (total_price_cents >=0),
  status ext_supplier_portal_status NOT NULL DEFAULT 'rascunho',
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  is_visible_to_supplier BOOLEAN NOT NULL DEFAULT false,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_supplier_portal_quotations_protocol_idx ON ext_supplier_portal_quotations(protocol);
CREATE INDEX IF NOT EXISTS ext_supplier_portal_quotations_supplier_idx ON ext_supplier_portal_quotations(supplier_id);

CREATE TABLE IF NOT EXISTS ext_supplier_portal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES ext_supplier_portal_quotations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_supplier_portal_documents_quotation_idx ON ext_supplier_portal_documents(quotation_id);

-- EXT-05 qualidade
CREATE TABLE IF NOT EXISTS ext_quality_nonconformities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^QUAL-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 3 AND 100),
  severity ext_quality_severity NOT NULL DEFAULT 'media',
  status ext_quality_status NOT NULL DEFAULT 'aberta',
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  cause TEXT CHECK (cause IS NULL OR char_length(cause) BETWEEN 10 AND 2000),
  corrective_action TEXT CHECK (corrective_action IS NULL OR char_length(corrective_action) BETWEEN 10 AND 2000),
  verification TEXT CHECK (verification IS NULL OR char_length(verification) BETWEEN 10 AND 2000),
  recurrence_count INT NOT NULL DEFAULT 0 CHECK (recurrence_count >=0),
  related_contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_quality_nonconformities_protocol_idx ON ext_quality_nonconformities(protocol);
CREATE INDEX IF NOT EXISTS ext_quality_nonconformities_status_idx ON ext_quality_nonconformities(status);

CREATE TABLE IF NOT EXISTS ext_quality_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id UUID NOT NULL REFERENCES ext_quality_nonconformities(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (char_length(action_type) BETWEEN 3 AND 100),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  due_date DATE,
  completed_at DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida','cancelada')),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_quality_actions_nonconformity_idx ON ext_quality_actions(nonconformity_id);

-- EXT-06 satisfação/carteira
CREATE TABLE IF NOT EXISTS ext_satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^SAT-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  survey_type ext_satisfaction_type NOT NULL DEFAULT 'pesquisa',
  score INT CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) BETWEEN 10 AND 2000),
  status ext_satisfaction_status NOT NULL DEFAULT 'pendente',
  recovery_task TEXT CHECK (recovery_task IS NULL OR char_length(recovery_task) BETWEEN 10 AND 2000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_satisfaction_surveys_protocol_idx ON ext_satisfaction_surveys(protocol);
CREATE INDEX IF NOT EXISTS ext_satisfaction_surveys_client_idx ON ext_satisfaction_surveys(client_account_id);
CREATE INDEX IF NOT EXISTS ext_satisfaction_surveys_score_idx ON ext_satisfaction_surveys(score);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION ext_touch_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_fleet_vehicles_touch ON ext_fleet_vehicles; CREATE TRIGGER ext_fleet_vehicles_touch BEFORE UPDATE ON ext_fleet_vehicles FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at();
DROP TRIGGER IF EXISTS ext_third_parties_touch ON ext_third_parties; CREATE TRIGGER ext_third_parties_touch BEFORE UPDATE ON ext_third_parties FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at();
DROP TRIGGER IF EXISTS ext_bidding_notices_touch ON ext_bidding_notices; CREATE TRIGGER ext_bidding_notices_touch BEFORE UPDATE ON ext_bidding_notices FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at();
DROP TRIGGER IF EXISTS ext_supplier_portal_quotations_touch ON ext_supplier_portal_quotations; CREATE TRIGGER ext_supplier_portal_quotations_touch BEFORE UPDATE ON ext_supplier_portal_quotations FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at();
DROP TRIGGER IF EXISTS ext_quality_nonconformities_touch ON ext_quality_nonconformities; CREATE TRIGGER ext_quality_nonconformities_touch BEFORE UPDATE ON ext_quality_nonconformities FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at();
DROP TRIGGER IF EXISTS ext_satisfaction_surveys_touch ON ext_satisfaction_surveys; CREATE TRIGGER ext_satisfaction_surveys_touch BEFORE UPDATE ON ext_satisfaction_surveys FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at();

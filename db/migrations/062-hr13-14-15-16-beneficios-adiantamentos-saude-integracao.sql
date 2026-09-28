-- HR-13 benefícios elegibilidade solicitações conferência alterações por período exportação fornecedor
-- HR-14 adiantamentos/reembolsos alçada comprovantes integração financeiro prevenção duplicidade
-- HR-15 saúde ocupacional agenda vencimentos documentos necessários acesso restrito não replicar prontuário completo
-- HR-16 integração/exportação contabilidade/SST recibos processamento erros correção não declarar eSocial sem protocolo válido

DO $$ BEGIN
  CREATE TYPE hr_benefit_type AS ENUM ('vale_transporte','vale_refeicao','vale_alimentacao','plano_saude','plano_odontologico','seguro_vida','auxilio_creche','auxilio_educacao','auxilio_combustivel','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_benefit_catalog_status AS ENUM ('rascunho','em_revisao','aprovado','arquivado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_benefit_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','ativo','inativo','suspenso','cancelado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_benefit_request_type AS ENUM ('inscricao','alteracao','cancelamento','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_benefit_conference_status AS ENUM ('aberto','em_conferencia','conferido','com_divergencia','fechado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_benefit_export_status AS ENUM ('pendente','gerado','enviado','confirmado','falhou','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_advance_type AS ENUM ('adiantamento_salarial','adiantamento_13','reembolso_despesa','reembolso_km','auxilio','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_advance_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','pago','cancelado','estornado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_advance_financial_status AS ENUM ('pendente','enviado','falha','confirmado','estornado','nao_aplicavel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_occupational_exam_type AS ENUM ('admissional','periodico','retorno','mudanca_funcao','demissional','complementar','pcd','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_occupational_status AS ENUM ('agendado','realizado','vencido','cancelado','pendente','em_analise','aprovado','rejeitado','rascunho');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_occupational_doc_type AS ENUM ('aso','atestado','exame','laudo','comprovante','carteira_vacinacao','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_integration_type AS ENUM ('contabilidade','esocial','sst','folha','ponto','financeiro','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_integration_export_type AS ENUM ('admissao','desligamento','afastamento','ferias','folha','cat','aso','exame','beneficio','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_integration_status AS ENUM ('pendente','em_processamento','enviado_com_protocolo','falhou','rejeitado','corrigido','cancelado','processado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HR-13 benefício catálogo
CREATE TABLE IF NOT EXISTS hr_benefit_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type hr_benefit_type NOT NULL,
  description VARCHAR(2000),
  provider_name VARCHAR(200),
  provider_contact VARCHAR(500),
  cost NUMERIC(12,2) DEFAULT 0 CHECK (cost >= 0),
  eligibility_rules JSONB DEFAULT '{}'::jsonb,
  validity_start DATE,
  validity_end DATE,
  version INT NOT NULL DEFAULT 1,
  approval_status hr_benefit_catalog_status NOT NULL DEFAULT 'rascunho',
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (validity_end IS NULL OR validity_start IS NULL OR validity_end > validity_start),
  UNIQUE(name, version)
);
CREATE INDEX IF NOT EXISTS idx_benefit_catalog_type ON hr_benefit_catalog(type);
CREATE INDEX IF NOT EXISTS idx_benefit_catalog_status ON hr_benefit_catalog(approval_status);
CREATE INDEX IF NOT EXISTS idx_benefit_catalog_validity ON hr_benefit_catalog(validity_start, validity_end);

-- HR-13 matrículas
CREATE TABLE IF NOT EXISTS hr_benefit_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  benefit_id UUID NOT NULL REFERENCES hr_benefit_catalog(id) ON DELETE RESTRICT,
  competence CHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  enrollment_date DATE NOT NULL,
  termination_date DATE,
  status hr_benefit_status NOT NULL DEFAULT 'ativo',
  is_eligible BOOLEAN DEFAULT true,
  eligibility_details JSONB DEFAULT '{}'::jsonb,
  benefit_version INT,
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (termination_date IS NULL OR termination_date >= enrollment_date),
  UNIQUE(employee_id, benefit_id, competence)
);
CREATE INDEX IF NOT EXISTS idx_benefit_enroll_employee ON hr_benefit_enrollments(employee_id);
CREATE INDEX IF NOT EXISTS idx_benefit_enroll_benefit ON hr_benefit_enrollments(benefit_id);
CREATE INDEX IF NOT EXISTS idx_benefit_enroll_competence ON hr_benefit_enrollments(competence);
CREATE INDEX IF NOT EXISTS idx_benefit_enroll_status ON hr_benefit_enrollments(status);

-- HR-13 solicitações
CREATE TABLE IF NOT EXISTS hr_benefit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  benefit_id UUID NOT NULL REFERENCES hr_benefit_catalog(id) ON DELETE RESTRICT,
  request_type hr_benefit_request_type NOT NULL,
  competence CHAR(7) CHECK (competence IS NULL OR competence ~ '^\d{4}-\d{2}$'),
  requested_data JSONB DEFAULT '{}'::jsonb,
  reason VARCHAR(1000) NOT NULL CHECK (char_length(reason) >= 10),
  status hr_benefit_status NOT NULL DEFAULT 'solicitado',
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_benefit_req_employee ON hr_benefit_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_benefit_req_benefit ON hr_benefit_requests(benefit_id);
CREATE INDEX IF NOT EXISTS idx_benefit_req_status ON hr_benefit_requests(status);
CREATE INDEX IF NOT EXISTS idx_benefit_req_competence ON hr_benefit_requests(competence);

-- HR-13 conferência
CREATE TABLE IF NOT EXISTS hr_benefit_conferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competence CHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  benefit_id UUID REFERENCES hr_benefit_catalog(id) ON DELETE SET NULL,
  status hr_benefit_conference_status NOT NULL DEFAULT 'aberto',
  total_enrollments INT DEFAULT 0,
  total_requests INT DEFAULT 0,
  divergences_count INT DEFAULT 0,
  conference_data JSONB DEFAULT '{}'::jsonb,
  notes VARCHAR(2000),
  closed_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competence, benefit_id)
);
CREATE INDEX IF NOT EXISTS idx_benefit_conf_competence ON hr_benefit_conferences(competence);
CREATE INDEX IF NOT EXISTS idx_benefit_conf_status ON hr_benefit_conferences(status);

-- HR-13 exportação fornecedor
CREATE TABLE IF NOT EXISTS hr_benefit_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id UUID REFERENCES hr_benefit_conferences(id) ON DELETE SET NULL,
  benefit_id UUID REFERENCES hr_benefit_catalog(id) ON DELETE SET NULL,
  competence CHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  provider_name VARCHAR(200),
  export_type VARCHAR(100) NOT NULL DEFAULT 'adesao',
  file_url VARCHAR(1000),
  storage_key VARCHAR(200),
  status hr_benefit_export_status NOT NULL DEFAULT 'pendente',
  protocol_number VARCHAR(100),
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  error_details VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_benefit_export_conf ON hr_benefit_exports(conference_id);
CREATE INDEX IF NOT EXISTS idx_benefit_export_benefit ON hr_benefit_exports(benefit_id);
CREATE INDEX IF NOT EXISTS idx_benefit_export_competence ON hr_benefit_exports(competence);
CREATE INDEX IF NOT EXISTS idx_benefit_export_status ON hr_benefit_exports(status);

-- HR-14 políticas alçada
CREATE TABLE IF NOT EXISTS hr_advance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type hr_advance_type NOT NULL,
  description VARCHAR(2000),
  min_amount NUMERIC(12,2) DEFAULT 0 CHECK (min_amount >= 0),
  max_amount NUMERIC(12,2) DEFAULT 10000 CHECK (max_amount >= 0),
  requires_approval BOOLEAN DEFAULT true,
  approver_role VARCHAR(100) DEFAULT 'rh',
  max_installments INT DEFAULT 1 CHECK (max_installments >= 1 AND max_installments <= 12),
  approval_status hr_benefit_catalog_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, version),
  CHECK (max_amount >= min_amount)
);
CREATE INDEX IF NOT EXISTS idx_advance_policy_type ON hr_advance_policies(type);
CREATE INDEX IF NOT EXISTS idx_advance_policy_status ON hr_advance_policies(approval_status);

-- HR-14 adiantamentos/reembolsos
CREATE TABLE IF NOT EXISTS hr_advance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  type hr_advance_type NOT NULL,
  competence CHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  installments INT NOT NULL DEFAULT 1 CHECK (installments >= 1 AND installments <= 12),
  reason VARCHAR(1000) NOT NULL CHECK (char_length(reason) >= 10),
  receipt_url VARCHAR(1000),
  storage_key VARCHAR(200),
  status hr_advance_status NOT NULL DEFAULT 'solicitado',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  financial_status hr_advance_financial_status NOT NULL DEFAULT 'pendente',
  financial_integration_id VARCHAR(100),
  financial_protocol VARCHAR(100),
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(12,2) CHECK (paid_amount IS NULL OR paid_amount >= 0),
  is_duplicate_check BOOLEAN DEFAULT false,
  duplicate_of_id UUID REFERENCES hr_advance_requests(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES hr_advance_policies(id) ON DELETE SET NULL,
  policy_version INT,
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_advance_req_employee ON hr_advance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_req_type ON hr_advance_requests(type);
CREATE INDEX IF NOT EXISTS idx_advance_req_competence ON hr_advance_requests(competence);
CREATE INDEX IF NOT EXISTS idx_advance_req_status ON hr_advance_requests(status);
CREATE INDEX IF NOT EXISTS idx_advance_req_financial ON hr_advance_requests(financial_status);
CREATE INDEX IF NOT EXISTS idx_advance_req_duplicate ON hr_advance_requests(employee_id, competence, type, amount);
-- prevenção duplicidade parcial: mesmo employee, competence, type, amount com status não cancelado/rejeitado/estornado
CREATE UNIQUE INDEX IF NOT EXISTS uq_advance_no_duplicate_active ON hr_advance_requests(employee_id, competence, type, amount) WHERE status NOT IN ('cancelado','rejeitado','estornado');

-- HR-15 requisitos saúde ocupacional
CREATE TABLE IF NOT EXISTS hr_occupational_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo VARCHAR(100) NOT NULL,
  exam_type hr_occupational_exam_type NOT NULL,
  description VARCHAR(1000),
  validity_days INT NOT NULL DEFAULT 365 CHECK (validity_days >= 1 AND validity_days <= 1825),
  is_required BOOLEAN DEFAULT true,
  applicable_employment_types TEXT[] DEFAULT ARRAY['clt']::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cargo, exam_type)
);
CREATE INDEX IF NOT EXISTS idx_occ_req_cargo ON hr_occupational_requirements(cargo);
CREATE INDEX IF NOT EXISTS idx_occ_req_exam ON hr_occupational_requirements(exam_type);

-- HR-15 agenda
CREATE TABLE IF NOT EXISTS hr_occupational_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES hr_occupational_requirements(id) ON DELETE SET NULL,
  exam_type hr_occupational_exam_type NOT NULL,
  scheduled_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status hr_occupational_status NOT NULL DEFAULT 'agendado',
  responsible_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  responsible_name VARCHAR(200),
  result_summary VARCHAR(1000), -- resumo operacional, não prontuário completo
  is_fit_for_duty BOOLEAN,
  aptidao_operacional VARCHAR(500), -- aptidão operacional, não diagnóstico
  next_due_date DATE,
  notes VARCHAR(1000), -- notas operacionais, não dados médicos sensíveis
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_date >= scheduled_date)
);
CREATE INDEX IF NOT EXISTS idx_occ_agenda_employee ON hr_occupational_agenda(employee_id);
CREATE INDEX IF NOT EXISTS idx_occ_agenda_exam ON hr_occupational_agenda(exam_type);
CREATE INDEX IF NOT EXISTS idx_occ_agenda_status ON hr_occupational_agenda(status);
CREATE INDEX IF NOT EXISTS idx_occ_agenda_due ON hr_occupational_agenda(due_date);
CREATE INDEX IF NOT EXISTS idx_occ_agenda_scheduled ON hr_occupational_agenda(scheduled_date);

-- HR-15 documentos restritos
CREATE TABLE IF NOT EXISTS hr_occupational_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES hr_occupational_agenda(id) ON DELETE SET NULL,
  doc_type hr_occupational_doc_type NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_url VARCHAR(1000),
  storage_key VARCHAR(200),
  validity_start DATE,
  validity_end DATE,
  status hr_occupational_status NOT NULL DEFAULT 'pendente',
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  is_medical_record BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  uploaded_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  notes VARCHAR(1000), -- sem prontuário completo
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (validity_end IS NULL OR validity_start IS NULL OR validity_end >= validity_start)
);
CREATE INDEX IF NOT EXISTS idx_occ_doc_employee ON hr_occupational_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_occ_doc_agenda ON hr_occupational_documents(agenda_id);
CREATE INDEX IF NOT EXISTS idx_occ_doc_type ON hr_occupational_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_occ_doc_validity ON hr_occupational_documents(validity_end);
CREATE INDEX IF NOT EXISTS idx_occ_doc_restricted ON hr_occupational_documents(is_restricted) WHERE is_restricted = true;

-- HR-16 integração contabilidade/SST
CREATE TABLE IF NOT EXISTS hr_integration_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  integration_type hr_integration_type NOT NULL,
  export_type hr_integration_export_type NOT NULL,
  competence CHAR(7) CHECK (competence IS NULL OR competence ~ '^\d{4}-\d{2}$'),
  period_start DATE,
  period_end DATE,
  payload JSONB DEFAULT '{}'::jsonb,
  file_url VARCHAR(1000),
  storage_key VARCHAR(200),
  status hr_integration_status NOT NULL DEFAULT 'pendente',
  protocol_number VARCHAR(200),
  provider_name VARCHAR(200),
  provider_response JSONB DEFAULT '{}'::jsonb,
  error_code VARCHAR(100),
  error_message VARCHAR(2000),
  is_protocol_valid BOOLEAN NOT NULL DEFAULT false,
  correction_of_id UUID REFERENCES hr_integration_exports(id) ON DELETE SET NULL,
  correction_reason VARCHAR(1000),
  requested_by UUID,
  requested_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_integration_type ON hr_integration_exports(integration_type);
CREATE INDEX IF NOT EXISTS idx_integration_export_type ON hr_integration_exports(export_type);
CREATE INDEX IF NOT EXISTS idx_integration_status ON hr_integration_exports(status);
CREATE INDEX IF NOT EXISTS idx_integration_competence ON hr_integration_exports(competence);
CREATE INDEX IF NOT EXISTS idx_integration_protocol ON hr_integration_exports(protocol_number) WHERE protocol_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integration_employee ON hr_integration_exports(employee_id);
CREATE INDEX IF NOT EXISTS idx_integration_protocol_valid ON hr_integration_exports(is_protocol_valid) WHERE is_protocol_valid = true;

CREATE TABLE IF NOT EXISTS hr_integration_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id UUID NOT NULL REFERENCES hr_integration_exports(id) ON DELETE CASCADE,
  receipt_type VARCHAR(50) NOT NULL DEFAULT 'protocolo' CHECK (receipt_type IN ('protocolo','recibo','erro','comprovante')),
  protocol_number VARCHAR(200) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','processado','falha','rejeitado')),
  is_valid BOOLEAN NOT NULL DEFAULT false,
  notes VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_receipt_export ON hr_integration_receipts(export_id);
CREATE INDEX IF NOT EXISTS idx_integration_receipt_protocol ON hr_integration_receipts(protocol_number);
CREATE INDEX IF NOT EXISTS idx_integration_receipt_valid ON hr_integration_receipts(is_valid) WHERE is_valid = true;

CREATE TABLE IF NOT EXISTS hr_integration_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id UUID NOT NULL REFERENCES hr_integration_exports(id) ON DELETE CASCADE,
  error_code VARCHAR(100),
  error_message VARCHAR(2000) NOT NULL,
  correction_required BOOLEAN DEFAULT true,
  corrected_at TIMESTAMPTZ,
  correction_notes VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_error_export ON hr_integration_errors(export_id);
CREATE INDEX IF NOT EXISTS idx_integration_error_code ON hr_integration_errors(error_code);

-- Triggers updated_at: set_updated_at() é definida em 021, antes destes triggers.

DROP TRIGGER IF EXISTS trg_benefit_catalog_updated ON hr_benefit_catalog;
CREATE TRIGGER trg_benefit_catalog_updated BEFORE UPDATE ON hr_benefit_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_benefit_enroll_updated ON hr_benefit_enrollments;
CREATE TRIGGER trg_benefit_enroll_updated BEFORE UPDATE ON hr_benefit_enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_benefit_req_updated ON hr_benefit_requests;
CREATE TRIGGER trg_benefit_req_updated BEFORE UPDATE ON hr_benefit_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_benefit_conf_updated ON hr_benefit_conferences;
CREATE TRIGGER trg_benefit_conf_updated BEFORE UPDATE ON hr_benefit_conferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_benefit_export_updated ON hr_benefit_exports;
CREATE TRIGGER trg_benefit_export_updated BEFORE UPDATE ON hr_benefit_exports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_advance_policy_updated ON hr_advance_policies;
CREATE TRIGGER trg_advance_policy_updated BEFORE UPDATE ON hr_advance_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_advance_req_updated ON hr_advance_requests;
CREATE TRIGGER trg_advance_req_updated BEFORE UPDATE ON hr_advance_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_occ_req_updated ON hr_occupational_requirements;
CREATE TRIGGER trg_occ_req_updated BEFORE UPDATE ON hr_occupational_requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_occ_agenda_updated ON hr_occupational_agenda;
CREATE TRIGGER trg_occ_agenda_updated BEFORE UPDATE ON hr_occupational_agenda FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_occ_doc_updated ON hr_occupational_documents;
CREATE TRIGGER trg_occ_doc_updated BEFORE UPDATE ON hr_occupational_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_integration_export_updated ON hr_integration_exports;
CREATE TRIGGER trg_integration_export_updated BEFORE UPDATE ON hr_integration_exports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed benefício catálogo
INSERT INTO hr_benefit_catalog (name, type, description, provider_name, cost, eligibility_rules, version, approval_status)
VALUES
  ('Vale Transporte CLT', 'vale_transporte', 'Vale transporte para CLT conforme deslocamento', 'Fornecedor VT', 200.00, '{"employment_types":["clt"],"cargos":["vigilante","porteiro","geral"],"min_tempo_meses":0}'::jsonb, 1, 'aprovado'),
  ('Vale Refeição', 'vale_refeicao', 'Vale refeição/alimentação', 'Fornecedor VR', 500.00, '{"employment_types":["clt"],"cargos":["vigilante","porteiro","geral"]}'::jsonb, 1, 'aprovado'),
  ('Plano de Saúde Básico', 'plano_saude', 'Plano saúde básico elegibilidade após experiência', 'Operadora Saúde', 300.00, '{"employment_types":["clt"],"min_tempo_meses":3}'::jsonb, 1, 'aprovado')
ON CONFLICT (name, version) DO NOTHING;

-- Seed advance policies
INSERT INTO hr_advance_policies (name, type, description, min_amount, max_amount, requires_approval, approver_role, max_installments, version, approval_status)
VALUES
  ('Adiantamento Salarial CLT até 40%', 'adiantamento_salarial', 'Adiantamento salarial até 40% salário', 100.00, 3000.00, true, 'rh', 1, 1, 'aprovado'),
  ('Reembolso Despesa Operacional', 'reembolso_despesa', 'Reembolso com comprovante obrigatório integração financeiro', 10.00, 2000.00, true, 'financeiro', 1, 1, 'aprovado')
ON CONFLICT (name, version) DO NOTHING;

-- Seed occupational requirements
INSERT INTO hr_occupational_requirements (cargo, exam_type, description, validity_days, is_required, applicable_employment_types)
VALUES
  ('vigilante', 'admissional', 'ASO admissional vigilante', 365, true, ARRAY['clt']),
  ('vigilante', 'periodico', 'ASO periódico vigilante', 365, true, ARRAY['clt']),
  ('vigilante', 'demissional', 'ASO demissional', 15, true, ARRAY['clt']),
  ('porteiro', 'admissional', 'ASO admissional portaria', 365, true, ARRAY['clt']),
  ('porteiro', 'periodico', 'ASO periódico portaria', 365, true, ARRAY['clt']),
  ('geral', 'admissional', 'ASO admissional geral', 365, true, ARRAY['clt','terceirizado'])
ON CONFLICT (cargo, exam_type) DO NOTHING;

-- audit_action enum values
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_benefit_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_benefit_request';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_benefit_conference';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_benefit_export';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_advance_request';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_advance_approve';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_advance_pay';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_occupational_schedule';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_occupational_document';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_integration_export';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_integration_receipt';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_integration_error';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HR-17 treinamento por cargo/atividade obrigatoriedade validade inscrição presença comprovante
-- HR-18 matriz competências integrada alocação sem decisão automática contratação/punição
-- HR-19 uniformes/EPI entrega recibo substituição validade controle devolução
-- HR-20 fechamento DP faltas férias variáveis documentos conferidos exportação versionada acesso contador limitado

DO $$ BEGIN
  CREATE TYPE hr_training_type AS ENUM ('nr','reciclagem','capacitacao','obrigatorio','opcional','integracao','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_training_catalog_status AS ENUM ('rascunho','em_revisao','aprovado','arquivado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_training_enrollment_status AS ENUM ('inscrito','em_andamento','concluido','reprovado','cancelado','pendente','em_analise','aprovado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_competency_type AS ENUM ('tecnica','comportamental','certificacao','habilitacao','idioma','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_competency_level AS ENUM ('basico','intermediario','avancado','especialista','nao_avaliado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_competency_status AS ENUM ('ativo','vencido','cancelado','pendente','em_avaliacao','aprovado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_uniform_type AS ENUM ('uniforme','epi','equipamento','acessorio','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_uniform_status AS ENUM ('pendente','entregue','devolvido','substituido','vencido','cancelado','solicitado','em_analise','aprovado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_dp_closure_status AS ENUM ('aberto','em_conferencia','conferido','com_divergencia','fechado','reaberto','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_dp_variable_type AS ENUM ('falta','ferias','hora_extra','adicional','desconto','bonus','adiantamento','reembolso','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_dp_document_status AS ENUM ('pendente','conferido','com_divergencia','aprovado','rejeitado','arquivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_dp_export_status AS ENUM ('pendente','gerado','enviado','confirmado','falhou','cancelado','processado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HR-17 catálogo treinamentos
CREATE TABLE IF NOT EXISTS hr_training_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type hr_training_type NOT NULL,
  description VARCHAR(2000),
  cargo_aplicavel VARCHAR(100),
  atividade VARCHAR(200),
  carga_horaria INT CHECK (carga_horaria IS NULL OR (carga_horaria >= 1 AND carga_horaria <= 500)),
  validity_days INT CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 1825)),
  is_required BOOLEAN DEFAULT false,
  provider_name VARCHAR(200),
  provider_contact VARCHAR(500),
  version INT NOT NULL DEFAULT 1,
  approval_status hr_training_catalog_status NOT NULL DEFAULT 'rascunho',
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, version)
);
CREATE INDEX IF NOT EXISTS idx_training_catalog_type ON hr_training_catalog(type);
CREATE INDEX IF NOT EXISTS idx_training_catalog_cargo ON hr_training_catalog(cargo_aplicavel);
CREATE INDEX IF NOT EXISTS idx_training_catalog_status ON hr_training_catalog(approval_status);
CREATE INDEX IF NOT EXISTS idx_training_catalog_required ON hr_training_catalog(is_required) WHERE is_required = true;

CREATE TABLE IF NOT EXISTS hr_training_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo VARCHAR(100) NOT NULL,
  training_id UUID NOT NULL REFERENCES hr_training_catalog(id) ON DELETE CASCADE,
  is_required BOOLEAN DEFAULT true,
  validity_days INT CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 1825)),
  description VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cargo, training_id)
);
CREATE INDEX IF NOT EXISTS idx_training_req_cargo ON hr_training_requirements(cargo);
CREATE INDEX IF NOT EXISTS idx_training_req_training ON hr_training_requirements(training_id);

CREATE TABLE IF NOT EXISTS hr_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES hr_training_catalog(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  location VARCHAR(300),
  instructor_name VARCHAR(200),
  vagas INT CHECK (vagas IS NULL OR (vagas >= 1 AND vagas <= 500)),
  status hr_training_catalog_status NOT NULL DEFAULT 'rascunho',
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_session_training ON hr_training_sessions(training_id);
CREATE INDEX IF NOT EXISTS idx_training_session_date ON hr_training_sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_training_session_status ON hr_training_sessions(status);

CREATE TABLE IF NOT EXISTS hr_training_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  training_id UUID NOT NULL REFERENCES hr_training_catalog(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES hr_training_sessions(id) ON DELETE SET NULL,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completion_date DATE,
  status hr_training_enrollment_status NOT NULL DEFAULT 'inscrito',
  presence_percent NUMERIC(5,2) CHECK (presence_percent IS NULL OR (presence_percent >= 0 AND presence_percent <= 100)),
  score NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  certificate_url VARCHAR(1000),
  storage_key VARCHAR(200),
  is_certificate_valid BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (completion_date IS NULL OR completion_date >= enrollment_date)
);
CREATE INDEX IF NOT EXISTS idx_training_enroll_employee ON hr_training_enrollments(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_enroll_training ON hr_training_enrollments(training_id);
CREATE INDEX IF NOT EXISTS idx_training_enroll_session ON hr_training_enrollments(session_id);
CREATE INDEX IF NOT EXISTS idx_training_enroll_status ON hr_training_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_training_enroll_employee_training ON hr_training_enrollments(employee_id, training_id);

-- HR-18 matriz competências
CREATE TABLE IF NOT EXISTS hr_competency_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type hr_competency_type NOT NULL,
  description VARCHAR(2000),
  level hr_competency_level NOT NULL DEFAULT 'basico',
  validity_days INT CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 1825)),
  version INT NOT NULL DEFAULT 1,
  approval_status hr_training_catalog_status NOT NULL DEFAULT 'rascunho',
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, version)
);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_type ON hr_competency_catalog(type);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_level ON hr_competency_catalog(level);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_status ON hr_competency_catalog(approval_status);

CREATE TABLE IF NOT EXISTS hr_competency_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo VARCHAR(100) NOT NULL,
  competency_id UUID NOT NULL REFERENCES hr_competency_catalog(id) ON DELETE CASCADE,
  required_level hr_competency_level NOT NULL DEFAULT 'basico',
  is_required BOOLEAN DEFAULT true,
  description VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cargo, competency_id)
);
CREATE INDEX IF NOT EXISTS idx_competency_req_cargo ON hr_competency_requirements(cargo);
CREATE INDEX IF NOT EXISTS idx_competency_req_competency ON hr_competency_requirements(competency_id);

CREATE TABLE IF NOT EXISTS hr_employee_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES hr_competency_catalog(id) ON DELETE RESTRICT,
  level hr_competency_level NOT NULL DEFAULT 'basico',
  acquired_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  status hr_competency_status NOT NULL DEFAULT 'ativo',
  proof_url VARCHAR(1000),
  storage_key VARCHAR(200),
  evaluated_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  evaluated_by_name VARCHAR(200),
  evaluation_date DATE,
  evaluation_notes VARCHAR(2000),
  is_human_evaluation BOOLEAN NOT NULL DEFAULT true, -- sem decisão automática
  is_auto_decision BOOLEAN NOT NULL DEFAULT false CHECK (is_auto_decision = false), -- bloqueia decisão automática contratação/punição
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expiry_date IS NULL OR expiry_date >= acquired_date)
);
CREATE INDEX IF NOT EXISTS idx_emp_comp_employee ON hr_employee_competencies(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_comp_competency ON hr_employee_competencies(competency_id);
CREATE INDEX IF NOT EXISTS idx_emp_comp_status ON hr_employee_competencies(status);
CREATE INDEX IF NOT EXISTS idx_emp_comp_level ON hr_employee_competencies(level);
CREATE INDEX IF NOT EXISTS idx_emp_comp_expiry ON hr_employee_competencies(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_competency_active ON hr_employee_competencies(employee_id, competency_id) WHERE status = 'ativo';

CREATE TABLE IF NOT EXISTS hr_competency_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES hr_competency_catalog(id) ON DELETE RESTRICT,
  evaluated_level hr_competency_level NOT NULL,
  evaluator_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  evaluator_name VARCHAR(200) NOT NULL,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  criteria VARCHAR(2000) NOT NULL CHECK (char_length(criteria) >= 10),
  score NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  notes VARCHAR(2000),
  is_human_participation BOOLEAN NOT NULL DEFAULT true CHECK (is_human_participation = true), -- participação humana obrigatória
  is_auto_punishment BOOLEAN NOT NULL DEFAULT false CHECK (is_auto_punishment = false), -- feedback cliente não vira punição automática
  status hr_competency_status NOT NULL DEFAULT 'em_avaliacao',
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comp_eval_employee ON hr_competency_evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_comp_eval_competency ON hr_competency_evaluations(competency_id);
CREATE INDEX IF NOT EXISTS idx_comp_eval_status ON hr_competency_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_comp_eval_date ON hr_competency_evaluations(evaluation_date);

-- HR-19 uniformes/EPI
CREATE TABLE IF NOT EXISTS hr_uniform_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type hr_uniform_type NOT NULL,
  description VARCHAR(2000),
  size VARCHAR(50),
  is_epi BOOLEAN DEFAULT false,
  ca_number VARCHAR(50), -- Certificado Aprovação EPI
  validity_days INT CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 1825)),
  provider_name VARCHAR(200),
  cost NUMERIC(12,2) DEFAULT 0 CHECK (cost >= 0),
  version INT NOT NULL DEFAULT 1,
  approval_status hr_training_catalog_status NOT NULL DEFAULT 'rascunho',
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, version)
);
CREATE INDEX IF NOT EXISTS idx_uniform_catalog_type ON hr_uniform_catalog(type);
CREATE INDEX IF NOT EXISTS idx_uniform_catalog_epi ON hr_uniform_catalog(is_epi) WHERE is_epi = true;
CREATE INDEX IF NOT EXISTS idx_uniform_catalog_status ON hr_uniform_catalog(approval_status);

CREATE TABLE IF NOT EXISTS hr_uniform_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  uniform_id UUID NOT NULL REFERENCES hr_uniform_catalog(id) ON DELETE RESTRICT,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 100),
  size VARCHAR(50),
  status hr_uniform_status NOT NULL DEFAULT 'entregue',
  receipt_url VARCHAR(1000),
  storage_key VARCHAR(200),
  receipt_signed BOOLEAN DEFAULT false,
  validity_start DATE DEFAULT CURRENT_DATE,
  validity_end DATE,
  uniform_version INT,
  delivered_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  delivered_by_name VARCHAR(200),
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (validity_end IS NULL OR validity_end >= validity_start)
);
CREATE INDEX IF NOT EXISTS idx_uniform_delivery_employee ON hr_uniform_deliveries(employee_id);
CREATE INDEX IF NOT EXISTS idx_uniform_delivery_uniform ON hr_uniform_deliveries(uniform_id);
CREATE INDEX IF NOT EXISTS idx_uniform_delivery_status ON hr_uniform_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_uniform_delivery_date ON hr_uniform_deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_uniform_delivery_validity ON hr_uniform_deliveries(validity_end) WHERE validity_end IS NOT NULL;

CREATE TABLE IF NOT EXISTS hr_uniform_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES hr_uniform_deliveries(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  uniform_id UUID NOT NULL REFERENCES hr_uniform_catalog(id) ON DELETE RESTRICT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason VARCHAR(1000) NOT NULL CHECK (char_length(reason) >= 10),
  condition_description VARCHAR(1000),
  status hr_uniform_status NOT NULL DEFAULT 'devolvido',
  received_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  received_by_name VARCHAR(200),
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uniform_return_delivery ON hr_uniform_returns(delivery_id);
CREATE INDEX IF NOT EXISTS idx_uniform_return_employee ON hr_uniform_returns(employee_id);
CREATE INDEX IF NOT EXISTS idx_uniform_return_status ON hr_uniform_returns(status);

CREATE TABLE IF NOT EXISTS hr_uniform_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  uniform_id UUID NOT NULL REFERENCES hr_uniform_catalog(id) ON DELETE RESTRICT,
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('entrega','substituicao','devolucao','outro')),
  reason VARCHAR(1000) NOT NULL CHECK (char_length(reason) >= 10),
  size VARCHAR(50),
  quantity INT DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 100),
  status hr_uniform_status NOT NULL DEFAULT 'solicitado',
  requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  delivery_id UUID REFERENCES hr_uniform_deliveries(id) ON DELETE SET NULL,
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uniform_request_employee ON hr_uniform_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_uniform_request_uniform ON hr_uniform_requests(uniform_id);
CREATE INDEX IF NOT EXISTS idx_uniform_request_status ON hr_uniform_requests(status);
CREATE INDEX IF NOT EXISTS idx_uniform_request_type ON hr_uniform_requests(request_type);

-- HR-20 fechamento DP
CREATE TABLE IF NOT EXISTS hr_dp_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competence CHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$') UNIQUE,
  status hr_dp_closure_status NOT NULL DEFAULT 'aberto',
  total_employees INT DEFAULT 0,
  total_faltas NUMERIC(10,2) DEFAULT 0,
  total_ferias INT DEFAULT 0,
  total_variables INT DEFAULT 0,
  documents_conferidos INT DEFAULT 0,
  divergences_count INT DEFAULT 0,
  closed_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  reopen_reason VARCHAR(1000) CHECK (reopen_reason IS NULL OR char_length(reopen_reason) >= 10),
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_closure_status ON hr_dp_closures(status);
CREATE INDEX IF NOT EXISTS idx_dp_closure_competence ON hr_dp_closures(competence);

CREATE TABLE IF NOT EXISTS hr_dp_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES hr_dp_closures(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  variable_type hr_dp_variable_type NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 0,
  amount NUMERIC(12,2) DEFAULT 0,
  competence CHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  description VARCHAR(1000),
  status hr_dp_document_status NOT NULL DEFAULT 'pendente',
  approved_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_var_closure ON hr_dp_variables(closure_id);
CREATE INDEX IF NOT EXISTS idx_dp_var_employee ON hr_dp_variables(employee_id);
CREATE INDEX IF NOT EXISTS idx_dp_var_type ON hr_dp_variables(variable_type);
CREATE INDEX IF NOT EXISTS idx_dp_var_status ON hr_dp_variables(status);
CREATE INDEX IF NOT EXISTS idx_dp_var_competence ON hr_dp_variables(competence);

CREATE TABLE IF NOT EXISTS hr_dp_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES hr_dp_closures(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  doc_type VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_url VARCHAR(1000),
  storage_key VARCHAR(200),
  status hr_dp_document_status NOT NULL DEFAULT 'pendente',
  is_restricted BOOLEAN DEFAULT false,
  checked_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  rejection_reason VARCHAR(1000),
  notes VARCHAR(2000),
  created_by UUID,
  created_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_doc_closure ON hr_dp_documents(closure_id);
CREATE INDEX IF NOT EXISTS idx_dp_doc_employee ON hr_dp_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_dp_doc_status ON hr_dp_documents(status);
CREATE INDEX IF NOT EXISTS idx_dp_doc_type ON hr_dp_documents(doc_type);

CREATE TABLE IF NOT EXISTS hr_dp_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES hr_dp_closures(id) ON DELETE CASCADE,
  competence CHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  export_type VARCHAR(100) NOT NULL DEFAULT 'folha' CHECK (export_type IN ('folha','contabilidade','fiscal','contador','outro')),
  file_url VARCHAR(1000),
  storage_key VARCHAR(200),
  version INT NOT NULL DEFAULT 1,
  status hr_dp_export_status NOT NULL DEFAULT 'pendente',
  protocol_number VARCHAR(200),
  is_protocol_valid BOOLEAN DEFAULT false,
  provider_name VARCHAR(200),
  requested_by UUID,
  requested_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  access_role VARCHAR(100) DEFAULT 'contador' CHECK (access_role IN ('contador','rh','financeiro','admin','ti','outro')),
  is_counter_access_limited BOOLEAN NOT NULL DEFAULT true,
  allowed_counter_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  processed_at TIMESTAMPTZ,
  error_message VARCHAR(2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(closure_id, version)
);
CREATE INDEX IF NOT EXISTS idx_dp_export_closure ON hr_dp_exports(closure_id);
CREATE INDEX IF NOT EXISTS idx_dp_export_competence ON hr_dp_exports(competence);
CREATE INDEX IF NOT EXISTS idx_dp_export_status ON hr_dp_exports(status);
CREATE INDEX IF NOT EXISTS idx_dp_export_access ON hr_dp_exports(access_role) WHERE is_counter_access_limited = true;
CREATE INDEX IF NOT EXISTS idx_dp_export_protocol_valid ON hr_dp_exports(is_protocol_valid) WHERE is_protocol_valid = true;

-- Triggers: set_updated_at() já é definida em 021.

DROP TRIGGER IF EXISTS trg_training_catalog_updated ON hr_training_catalog;
CREATE TRIGGER trg_training_catalog_updated BEFORE UPDATE ON hr_training_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_training_req_updated ON hr_training_requirements;
CREATE TRIGGER trg_training_req_updated BEFORE UPDATE ON hr_training_requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_training_session_updated ON hr_training_sessions;
CREATE TRIGGER trg_training_session_updated BEFORE UPDATE ON hr_training_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_training_enroll_updated ON hr_training_enrollments;
CREATE TRIGGER trg_training_enroll_updated BEFORE UPDATE ON hr_training_enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_competency_catalog_updated ON hr_competency_catalog;
CREATE TRIGGER trg_competency_catalog_updated BEFORE UPDATE ON hr_competency_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_competency_req_updated ON hr_competency_requirements;
CREATE TRIGGER trg_competency_req_updated BEFORE UPDATE ON hr_competency_requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_emp_comp_updated ON hr_employee_competencies;
CREATE TRIGGER trg_emp_comp_updated BEFORE UPDATE ON hr_employee_competencies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_comp_eval_updated ON hr_competency_evaluations;
CREATE TRIGGER trg_comp_eval_updated BEFORE UPDATE ON hr_competency_evaluations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_uniform_catalog_updated ON hr_uniform_catalog;
CREATE TRIGGER trg_uniform_catalog_updated BEFORE UPDATE ON hr_uniform_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_uniform_delivery_updated ON hr_uniform_deliveries;
CREATE TRIGGER trg_uniform_delivery_updated BEFORE UPDATE ON hr_uniform_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_uniform_return_updated ON hr_uniform_returns;
CREATE TRIGGER trg_uniform_return_updated BEFORE UPDATE ON hr_uniform_returns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_uniform_request_updated ON hr_uniform_requests;
CREATE TRIGGER trg_uniform_request_updated BEFORE UPDATE ON hr_uniform_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_dp_closure_updated ON hr_dp_closures;
CREATE TRIGGER trg_dp_closure_updated BEFORE UPDATE ON hr_dp_closures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_dp_var_updated ON hr_dp_variables;
CREATE TRIGGER trg_dp_var_updated BEFORE UPDATE ON hr_dp_variables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_dp_doc_updated ON hr_dp_documents;
CREATE TRIGGER trg_dp_doc_updated BEFORE UPDATE ON hr_dp_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_dp_export_updated ON hr_dp_exports;
CREATE TRIGGER trg_dp_export_updated BEFORE UPDATE ON hr_dp_exports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seeds
INSERT INTO hr_training_catalog (name, type, description, cargo_aplicavel, carga_horaria, validity_days, is_required, provider_name, version, approval_status)
VALUES
  ('Reciclagem Vigilante NR', 'reciclagem', 'Reciclagem obrigatória vigilante conforme PF', 'vigilante', 50, 730, true, 'Escola Formação', 1, 'aprovado'),
  ('Integração Portaria', 'integracao', 'Integração e procedimentos portaria', 'porteiro', 8, 365, true, 'RH Interno', 1, 'aprovado'),
  ('NR-10 Básico', 'nr', 'Segurança instalações elétricas', 'geral', 40, 730, false, 'Treinamento Externo', 1, 'aprovado')
ON CONFLICT (name, version) DO NOTHING;

INSERT INTO hr_training_requirements (cargo, training_id, is_required, validity_days, description)
SELECT 'vigilante', id, true, 730, 'Obrigatório para vigilante' FROM hr_training_catalog WHERE name='Reciclagem Vigilante NR' LIMIT 1
ON CONFLICT (cargo, training_id) DO NOTHING;
INSERT INTO hr_training_requirements (cargo, training_id, is_required, validity_days, description)
SELECT 'porteiro', id, true, 365, 'Obrigatório para porteiro' FROM hr_training_catalog WHERE name='Integração Portaria' LIMIT 1
ON CONFLICT (cargo, training_id) DO NOTHING;

INSERT INTO hr_competency_catalog (name, type, description, level, validity_days, version, approval_status)
VALUES
  ('Vigilância Patrimonial', 'tecnica', 'Competência técnica vigilância', 'intermediario', 730, 1, 'aprovado'),
  ('Atendimento ao Cliente', 'comportamental', 'Atendimento e comunicação', 'basico', 365, 1, 'aprovado'),
  ('CFTV Operação', 'tecnica', 'Operação CFTV e monitoramento', 'avancado', 365, 1, 'aprovado')
ON CONFLICT (name, version) DO NOTHING;

INSERT INTO hr_competency_requirements (cargo, competency_id, required_level, is_required, description)
SELECT 'vigilante', id, 'intermediario'::hr_competency_level, true, 'Requerido para vigilante' FROM hr_competency_catalog WHERE name='Vigilância Patrimonial' LIMIT 1
ON CONFLICT (cargo, competency_id) DO NOTHING;
INSERT INTO hr_competency_requirements (cargo, competency_id, required_level, is_required, description)
SELECT 'porteiro', id, 'basico'::hr_competency_level, true, 'Requerido para porteiro' FROM hr_competency_catalog WHERE name='Atendimento ao Cliente' LIMIT 1
ON CONFLICT (cargo, competency_id) DO NOTHING;

INSERT INTO hr_uniform_catalog (name, type, description, size, is_epi, ca_number, validity_days, provider_name, version, approval_status)
VALUES
  ('Uniforme Vigilante Completo', 'uniforme', 'Calça, camisa, cinto', 'M', false, NULL, 365, 'Fornecedor Uniformes', 1, 'aprovado'),
  ('Colete Balístico Nível II', 'epi', 'Colete balístico com CA', 'M', true, 'CA 12345', 1825, 'Fornecedor EPI', 1, 'aprovado'),
  ('Bota Segurança', 'epi', 'Bota segurança com CA', '42', true, 'CA 67890', 365, 'Fornecedor EPI', 1, 'aprovado')
ON CONFLICT (name, version) DO NOTHING;

-- audit_action
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_training_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_training_enroll';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_competency_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_competency_evaluate';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_uniform_delivery';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_uniform_return';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_uniform_request';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_dp_closure';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_dp_export';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

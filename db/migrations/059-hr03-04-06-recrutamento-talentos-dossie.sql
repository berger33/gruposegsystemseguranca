-- HR-03 recrutamento vaga requisitos candidatos triagem entrevista decisão comunicação retenção currículo
-- HR-04 banco de talentos autorização/base descarte configurado sem acúmulo indefinido
-- HR-06 dossiê tipos versões validade pendências aprovador CNV funções aplicáveis após confirmação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_vacancy_status') THEN
    CREATE TYPE hr_vacancy_status AS ENUM ('rascunho','aberta','em_triagem','entrevista','em_decisao','fechada','cancelada','arquivada');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_candidate_status') THEN
    CREATE TYPE hr_candidate_status AS ENUM ('inscrito','em_triagem','entrevista','aprovado','rejeitado','contratado','descartado','talent_pool');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_interview_status') THEN
    CREATE TYPE hr_interview_status AS ENUM ('agendada','realizada','cancelada','reagendada','nao_compareceu');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_consent_base') THEN
    CREATE TYPE hr_consent_base AS ENUM ('consentimento','legitimo_interesse','execucao_contrato','cumprimento_legal','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_dossier_type') THEN
    CREATE TYPE hr_dossier_type AS ENUM ('rg','cpf','cnh','cnv','ctps','comprovante_residencia','certidao','curso','aso','treinamento','comprovante_escolaridade','reservista','titulo_eleitor','pis','foto','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_dossier_status') THEN
    CREATE TYPE hr_dossier_status AS ENUM ('pendente','em_analise','aprovado','rejeitado','vencido','cancelado','arquivado');
  END IF;
END $$;

-- HR-03 vagas
CREATE TABLE IF NOT EXISTS hr_vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 200),
  cargo VARCHAR(100) NOT NULL CHECK (char_length(cargo) >= 2 AND char_length(cargo) <= 100),
  description TEXT CHECK (char_length(description) <= 5000),
  requisitos TEXT CHECK (char_length(requisitos) <= 2000),
  department VARCHAR(100),
  location VARCHAR(200),
  employment_type hr_employment_type NOT NULL DEFAULT 'clt',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 100),
  status hr_vacancy_status NOT NULL DEFAULT 'rascunho',
  salary_range_note VARCHAR(200),
  is_salary_sensitive BOOLEAN NOT NULL DEFAULT TRUE,
  responsible_id VARCHAR(80),
  responsible_name VARCHAR(200),
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_vacancies_status ON hr_vacancies(status);
CREATE INDEX IF NOT EXISTS idx_hr_vacancies_cargo ON hr_vacancies(cargo);
CREATE INDEX IF NOT EXISTS idx_hr_vacancies_responsible ON hr_vacancies(responsible_id);
DROP TRIGGER IF EXISTS trg_hr_vacancies_updated ON hr_vacancies;
CREATE TRIGGER trg_hr_vacancies_updated BEFORE UPDATE ON hr_vacancies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HR-03 candidatos com retenção currículo acesso próprio
CREATE TABLE IF NOT EXISTS hr_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id UUID REFERENCES hr_vacancies(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 200),
  email VARCHAR(320) CHECK (char_length(email) <= 320),
  phone VARCHAR(30),
  resume_file_url VARCHAR(1000),
  resume_storage_key VARCHAR(500),
  resume_text_excerpt TEXT CHECK (char_length(resume_text_excerpt) <= 2000),
  source VARCHAR(100),
  status hr_candidate_status NOT NULL DEFAULT 'inscrito',
  consent_base hr_consent_base NOT NULL DEFAULT 'consentimento',
  consent_version VARCHAR(20) DEFAULT 'v1',
  consent_at TIMESTAMPTZ DEFAULT now(),
  consent_proof VARCHAR(500),
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days >= 30 AND retention_days <= 1825),
  retention_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '365 days'),
  is_talent_pool BOOLEAN NOT NULL DEFAULT FALSE,
  is_anonymized BOOLEAN NOT NULL DEFAULT FALSE,
  anonymized_at TIMESTAMPTZ,
  notes TEXT CHECK (char_length(notes) <= 2000),
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_vacancy ON hr_candidates(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_status ON hr_candidates(status);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_email ON hr_candidates(email);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_retention ON hr_candidates(retention_until);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_talent ON hr_candidates(is_talent_pool) WHERE is_talent_pool = true;
DROP TRIGGER IF EXISTS trg_hr_candidates_updated ON hr_candidates;
CREATE TRIGGER trg_hr_candidates_updated BEFORE UPDATE ON hr_candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_candidate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  vacancy_id UUID REFERENCES hr_vacancies(id) ON DELETE SET NULL,
  previous_status hr_candidate_status,
  next_status hr_candidate_status NOT NULL,
  reason TEXT CHECK (char_length(reason) <= 1000),
  changed_by VARCHAR(80),
  changed_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_candidate_history_candidate ON hr_candidate_history(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_history_vacancy ON hr_candidate_history(vacancy_id);

CREATE TABLE IF NOT EXISTS hr_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  vacancy_id UUID REFERENCES hr_vacancies(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  interviewer_id VARCHAR(80),
  interviewer_name VARCHAR(200),
  interview_type VARCHAR(20) NOT NULL DEFAULT 'presencial' CHECK (interview_type IN ('presencial','video','telefone','outro')),
  status hr_interview_status NOT NULL DEFAULT 'agendada',
  location VARCHAR(200),
  notes TEXT CHECK (char_length(notes) <= 2000),
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  decision TEXT CHECK (char_length(decision) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_interviews_candidate ON hr_interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_hr_interviews_vacancy ON hr_interviews(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_hr_interviews_scheduled ON hr_interviews(scheduled_at);
DROP TRIGGER IF EXISTS trg_hr_interviews_updated ON hr_interviews;
CREATE TRIGGER trg_hr_interviews_updated BEFORE UPDATE ON hr_interviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HR-04 banco de talentos com autorização/base e descarte configurado
CREATE TABLE IF NOT EXISTS hr_talent_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES hr_candidates(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 200),
  email VARCHAR(320),
  phone VARCHAR(30),
  cargo_interesse VARCHAR(100) NOT NULL,
  areas TEXT[] DEFAULT '{}',
  skills TEXT[] DEFAULT '{}',
  resume_file_url VARCHAR(1000),
  resume_storage_key VARCHAR(500),
  consent_base hr_consent_base NOT NULL DEFAULT 'consentimento',
  consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_proof VARCHAR(500),
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days >= 30 AND retention_days <= 1825),
  retention_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '365 days'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_anonymized BOOLEAN NOT NULL DEFAULT FALSE,
  anonymized_at TIMESTAMPTZ,
  discard_reason TEXT CHECK (char_length(discard_reason) <= 1000),
  source VARCHAR(100),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_talent_pool_cargo ON hr_talent_pool(cargo_interesse);
CREATE INDEX IF NOT EXISTS idx_talent_pool_active ON hr_talent_pool(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_talent_pool_retention ON hr_talent_pool(retention_until);
CREATE INDEX IF NOT EXISTS idx_talent_pool_email ON hr_talent_pool(email);
DROP TRIGGER IF EXISTS trg_talent_pool_updated ON hr_talent_pool;
CREATE TRIGGER trg_talent_pool_updated BEFORE UPDATE ON hr_talent_pool FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HR-06 dossiê com tipos versões validade pendências aprovador CNV funções aplicáveis após confirmação
CREATE TABLE IF NOT EXISTS hr_dossier_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo VARCHAR(100) NOT NULL,
  doc_type hr_dossier_type NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_cnv_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  description VARCHAR(500),
  validity_days INTEGER CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 3650)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cargo, doc_type)
);
CREATE INDEX IF NOT EXISTS idx_dossier_req_cargo ON hr_dossier_requirements(cargo);
CREATE INDEX IF NOT EXISTS idx_dossier_req_type ON hr_dossier_requirements(doc_type);

INSERT INTO hr_dossier_requirements (cargo, doc_type, is_required, is_cnv_applicable, description, validity_days)
VALUES
  ('vigilante','rg', true, false, 'RG obrigatório', NULL),
  ('vigilante','cpf', true, false, 'CPF obrigatório', NULL),
  ('vigilante','ctps', true, false, 'CTPS obrigatória', NULL),
  ('vigilante','comprovante_residencia', true, false, 'Comprovante residência', 365),
  ('vigilante','cnv', true, true, 'CNV apenas para funções/atividades aplicáveis vigilante, após confirmação', 365),
  ('vigilante','curso', true, false, 'Curso formação vigilante', 730),
  ('vigilante','aso', true, false, 'ASO admissional', 365),
  ('porteiro','rg', true, false, 'RG obrigatório', NULL),
  ('porteiro','cpf', true, false, 'CPF obrigatório', NULL),
  ('porteiro','comprovante_residencia', true, false, 'Comprovante residência', 365),
  ('porteiro','aso', true, false, 'ASO', 365),
  ('supervisor','rg', true, false, 'RG', NULL),
  ('supervisor','cpf', true, false, 'CPF', NULL),
  ('supervisor','curso', false, false, 'Curso liderança opcional', NULL)
ON CONFLICT (cargo, doc_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS hr_employee_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  doc_type hr_dossier_type NOT NULL,
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 1000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  file_url VARCHAR(1000),
  storage_key VARCHAR(500),
  validity_start DATE,
  validity_end DATE CHECK (validity_end IS NULL OR validity_start IS NULL OR validity_end >= validity_start),
  status hr_dossier_status NOT NULL DEFAULT 'pendente',
  is_required_for_role BOOLEAN NOT NULL DEFAULT FALSE,
  applicable_roles TEXT[] DEFAULT '{}',
  is_cnv BOOLEAN NOT NULL DEFAULT FALSE,
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by VARCHAR(80),
  confirmed_by_id VARCHAR(80),
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, doc_type, version)
);
CREATE INDEX IF NOT EXISTS idx_emp_dossiers_employee ON hr_employee_dossiers(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_dossiers_type ON hr_employee_dossiers(doc_type);
CREATE INDEX IF NOT EXISTS idx_emp_dossiers_status ON hr_employee_dossiers(status);
CREATE INDEX IF NOT EXISTS idx_emp_dossiers_validity ON hr_employee_dossiers(validity_end) WHERE validity_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_dossiers_cnv ON hr_employee_dossiers(is_cnv) WHERE is_cnv = true;
DROP TRIGGER IF EXISTS trg_emp_dossiers_updated ON hr_employee_dossiers;
CREATE TRIGGER trg_emp_dossiers_updated BEFORE UPDATE ON hr_employee_dossiers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_vacancy_create') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_vacancy_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_candidate_create') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_candidate_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_candidate_status_change') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_candidate_status_change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_talent_pool_add') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_talent_pool_add';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_talent_pool_discard') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_talent_pool_discard';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_dossier_create') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_dossier_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_dossier_approve') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_dossier_approve';
  END IF;
END $$;

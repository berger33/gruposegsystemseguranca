-- HR-01 cadastro profissional separado de identidade de login + HR-02 histórico cargo/lotação/remuneração + HR-05 admissão checklist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_employee_status') THEN
    CREATE TYPE hr_employee_status AS ENUM ('em_admissao','ativo','afastado','suspenso','desligado','arquivado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_employment_type') THEN
    CREATE TYPE hr_employment_type AS ENUM ('clt','terceirizado','temporario','estagio','pj','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_admission_status') THEN
    CREATE TYPE hr_admission_status AS ENUM ('pendente','em_andamento','concluida','cancelada','rejeitada');
  END IF;
END $$;

-- Cadastro profissional separado de identidade de login
CREATE TABLE IF NOT EXISTS hr_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula VARCHAR(50) NOT NULL,
  identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  display_name VARCHAR(200) NOT NULL CHECK (char_length(display_name) >= 3 AND char_length(display_name) <= 200),
  cpf_hash VARCHAR(128),
  birth_date DATE,
  admission_date DATE,
  status hr_employee_status NOT NULL DEFAULT 'em_admissao',
  employment_type hr_employment_type NOT NULL DEFAULT 'clt',
  cargo VARCHAR(100) NOT NULL CHECK (char_length(cargo) >= 2 AND char_length(cargo) <= 100),
  cargo_nivel VARCHAR(50),
  empregador VARCHAR(200),
  filial VARCHAR(200),
  lotacao VARCHAR(200),
  gestor_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  gestor_name VARCHAR(200),
  contact_email VARCHAR(320) CHECK (contact_email IS NULL OR char_length(contact_email) <= 320),
  contact_phone VARCHAR(30),
  address_city VARCHAR(100),
  address_state VARCHAR(2),
  remuneracao_atual DECIMAL(12,2) CHECK (remuneracao_atual IS NULL OR remuneracao_atual >= 0),
  is_remuneracao_sensitive BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  updated_by VARCHAR(80),
  updated_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (matricula)
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_identity ON hr_employees(identity_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_status ON hr_employees(status);
CREATE INDEX IF NOT EXISTS idx_hr_employees_cargo ON hr_employees(cargo);
CREATE INDEX IF NOT EXISTS idx_hr_employees_gestor ON hr_employees(gestor_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_matricula ON hr_employees(matricula);
CREATE INDEX IF NOT EXISTS idx_hr_employees_employer ON hr_employees(empregador, filial);

DROP TRIGGER IF EXISTS trg_hr_employees_updated ON hr_employees;
CREATE TRIGGER trg_hr_employees_updated BEFORE UPDATE ON hr_employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HR-02 histórico de cargo, lotação, remuneração com datas de efeito
CREATE TABLE IF NOT EXISTS hr_employee_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  previous_cargo VARCHAR(100),
  next_cargo VARCHAR(100) NOT NULL,
  previous_lotacao VARCHAR(200),
  next_lotacao VARCHAR(200),
  previous_remuneracao DECIMAL(12,2),
  next_remuneracao DECIMAL(12,2),
  previous_empregador VARCHAR(200),
  next_empregador VARCHAR(200),
  previous_filial VARCHAR(200),
  next_filial VARCHAR(200),
  previous_status hr_employee_status,
  next_status hr_employee_status,
  effective_date DATE NOT NULL,
  reason TEXT CHECK (char_length(reason) <= 1000),
  changed_by VARCHAR(80),
  changed_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_history_employee ON hr_employee_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_history_effective ON hr_employee_history(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_history_cargo ON hr_employee_history(next_cargo);

-- HR-05 admissão com checklist por função
CREATE TABLE IF NOT EXISTS hr_admission_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL CHECK (char_length(name) >= 5 AND char_length(name) <= 200),
  description TEXT CHECK (char_length(description) <= 2000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cargo, version)
);

CREATE INDEX IF NOT EXISTS idx_admission_checklists_cargo ON hr_admission_checklists(cargo);
CREATE INDEX IF NOT EXISTS idx_admission_checklists_active ON hr_admission_checklists(is_active);

DROP TRIGGER IF EXISTS trg_admission_checklists_updated ON hr_admission_checklists;
CREATE TRIGGER trg_admission_checklists_updated BEFORE UPDATE ON hr_admission_checklists FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_admission_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES hr_admission_checklists(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 1000),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  category VARCHAR(50) NOT NULL DEFAULT 'documento' CHECK (category IN ('documento','exame','treinamento','integracao','equipamento','outro')),
  order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admission_items_checklist ON hr_admission_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_admission_items_order ON hr_admission_items(checklist_id, order_index);

CREATE TABLE IF NOT EXISTS hr_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  checklist_id UUID REFERENCES hr_admission_checklists(id) ON DELETE SET NULL,
  status hr_admission_status NOT NULL DEFAULT 'pendente',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  responsible_id VARCHAR(80),
  responsible_name VARCHAR(200),
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_admissions_employee ON hr_admissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_admissions_status ON hr_admissions(status);
CREATE INDEX IF NOT EXISTS idx_hr_admissions_checklist ON hr_admissions(checklist_id);

DROP TRIGGER IF EXISTS trg_hr_admissions_updated ON hr_admissions;
CREATE TRIGGER trg_hr_admissions_updated BEFORE UPDATE ON hr_admissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_admission_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID NOT NULL REFERENCES hr_admissions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES hr_admission_items(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_analise','aprovado','rejeitado','nao_aplicavel')),
  completed_at TIMESTAMPTZ,
  completed_by VARCHAR(80),
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  file_url VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admission_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_admission_progress_admission ON hr_admission_progress(admission_id);
CREATE INDEX IF NOT EXISTS idx_admission_progress_status ON hr_admission_progress(status);

DROP TRIGGER IF EXISTS trg_admission_progress_updated ON hr_admission_progress;
CREATE TRIGGER trg_admission_progress_updated BEFORE UPDATE ON hr_admission_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed checklists por função
INSERT INTO hr_admission_checklists (cargo, name, description, version, created_by)
VALUES
  ('vigilante','Admissão Vigilante - checklist padrão','Checklist para função vigilante: documentos RG CPF CNH CNV quando aplicável, ASO, treinamento reciclagem, uniforme, integração posto', 1, 'seed'),
  ('porteiro','Admissão Porteiro - checklist padrão','Checklist porteiro: documentos, ASO, treinamento atendimento, uniforme, integração', 1, 'seed'),
  ('supervisor','Admissão Supervisor - checklist padrão','Checklist supervisor: documentos, ASO, treinamento liderança, acesso sistema, integração equipes', 1, 'seed')
ON CONFLICT (cargo, version) DO NOTHING;

INSERT INTO hr_admission_items (checklist_id, title, category, is_required, order_index)
SELECT id, 'Documento RG + CPF', 'documento', true, 1 FROM hr_admission_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Comprovante residência', 'documento', true, 2 FROM hr_admission_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'CNV quando aplicável para vigilante', 'documento', false, 3 FROM hr_admission_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'ASO admissional', 'exame', true, 4 FROM hr_admission_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Treinamento integração', 'treinamento', true, 5 FROM hr_admission_checklists WHERE cargo='vigilante' AND version=1
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_employee_create') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_employee_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_employee_update') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_employee_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_employee_status_change') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_employee_status_change';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_admission_create') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_admission_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_admission_complete') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_admission_complete';
  END IF;
END $$;

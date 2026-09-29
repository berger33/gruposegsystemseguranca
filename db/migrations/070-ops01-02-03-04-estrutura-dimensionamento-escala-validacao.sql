-- 070-ops01-02-03-04-estrutura-dimensionamento-escala-validacao
-- OPS-01 estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação; cargo/função em entidade própria.
-- OPS-02 dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado.
-- OPS-03 escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência.
-- OPS-04 validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas.

-- Enums
DO $$ BEGIN CREATE TYPE ops_post_type AS ENUM ('portaria','vigilancia','limpeza','zeladoria','recepcao','monitoramento','manutencao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_shift_type AS ENUM ('diurno','noturno','12x36_dia','12x36_noite','24x48','comercial','madrugada','flexivel','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_job_role_type AS ENUM ('cargo','funcao'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_allocation_status AS ENUM ('planejado','confirmado','em_andamento','concluido','cancelado','substituido'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_dimensioning_status AS ENUM ('rascunho','aprovado','em_execucao','concluido','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_coverage_gap_status AS ENUM ('aberto','em_tratamento','resolvido','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_schedule_status AS ENUM ('rascunho','em_revisao','publicada','revisada','arquivada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_schedule_entry_status AS ENUM ('planejado','confirmado','em_andamento','realizado','falta','substituido','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_validation_type AS ENUM ('sobreposicao','indisponibilidade','habilitacao','documentacao','jornada','descanso','certificacao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OPS-01: cargo/função em entidade própria
CREATE TABLE IF NOT EXISTS ops_job_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 100),
  role_type ops_job_role_type NOT NULL DEFAULT 'funcao',
  description TEXT CHECK (char_length(description) BETWEEN 10 AND 2000),
  requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, role_type)
);
CREATE INDEX IF NOT EXISTS idx_ops_job_roles_type ON ops_job_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_ops_job_roles_active ON ops_job_roles(is_active) WHERE is_active = true;

-- OPS-01: posto físico
CREATE TABLE IF NOT EXISTS ops_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  location TEXT CHECK (char_length(location) <= 500),
  post_type ops_post_type NOT NULL DEFAULT 'portaria',
  description TEXT CHECK (char_length(description) <= 2000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_posts_company ON ops_posts(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_posts_unit ON ops_posts(unit_id);
CREATE INDEX IF NOT EXISTS idx_ops_posts_type ON ops_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_ops_posts_active ON ops_posts(is_active) WHERE is_active = true;

-- OPS-01: turno template
CREATE TABLE IF NOT EXISTS ops_shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 100),
  shift_type ops_shift_type NOT NULL DEFAULT 'diurno',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_hours NUMERIC(5,2) NOT NULL CHECK (duration_hours > 0 AND duration_hours <= 24),
  description TEXT CHECK (char_length(description) <= 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, shift_type)
);
CREATE INDEX IF NOT EXISTS idx_ops_shift_type ON ops_shift_templates(shift_type);
CREATE INDEX IF NOT EXISTS idx_ops_shift_active ON ops_shift_templates(is_active) WHERE is_active = true;

-- OPS-01: necessidade por turno
CREATE TABLE IF NOT EXISTS ops_post_shift_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  shift_template_id UUID NOT NULL REFERENCES ops_shift_templates(id) ON DELETE RESTRICT,
  role_id UUID REFERENCES ops_job_roles(id) ON DELETE SET NULL,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  required_headcount INT NOT NULL DEFAULT 1 CHECK (required_headcount BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, shift_template_id, day_of_week, role_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_needs_post ON ops_post_shift_needs(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_needs_shift ON ops_post_shift_needs(shift_template_id);
CREATE INDEX IF NOT EXISTS idx_ops_needs_role ON ops_post_shift_needs(role_id);
CREATE INDEX IF NOT EXISTS idx_ops_needs_day ON ops_post_shift_needs(day_of_week);

-- OPS-01: alocação
CREATE TABLE IF NOT EXISTS ops_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
  shift_template_id UUID NOT NULL REFERENCES ops_shift_templates(id) ON DELETE RESTRICT,
  role_id UUID REFERENCES ops_job_roles(id) ON DELETE SET NULL,
  allocation_date DATE NOT NULL,
  status ops_allocation_status NOT NULL DEFAULT 'planejado',
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, employee_id, allocation_date, shift_template_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_alloc_post ON ops_allocations(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_alloc_employee ON ops_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_alloc_date ON ops_allocations(allocation_date);
CREATE INDEX IF NOT EXISTS idx_ops_alloc_status ON ops_allocations(status);
CREATE INDEX IF NOT EXISTS idx_ops_alloc_shift ON ops_allocations(shift_template_id);

-- OPS-02: dimensionamento
CREATE TABLE IF NOT EXISTS ops_dimensioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  post_id UUID REFERENCES ops_posts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  contracted_headcount INT NOT NULL DEFAULT 0 CHECK (contracted_headcount >= 0),
  planned_headcount INT NOT NULL DEFAULT 0 CHECK (planned_headcount >= 0),
  realized_headcount INT NOT NULL DEFAULT 0 CHECK (realized_headcount >= 0),
  coverage_hours_required NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (coverage_hours_required >= 0),
  coverage_hours_realized NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (coverage_hours_realized >= 0),
  coverage_percent NUMERIC(5,2) GENERATED ALWAYS AS (CASE WHEN coverage_hours_required > 0 THEN LEAST(100, (coverage_hours_realized / coverage_hours_required * 100)) ELSE 0 END) STORED,
  status ops_dimensioning_status NOT NULL DEFAULT 'rascunho',
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_period_valid CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_ops_dim_company ON ops_dimensioning(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_dim_post ON ops_dimensioning(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_dim_contract ON ops_dimensioning(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_dim_period ON ops_dimensioning(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ops_dim_status ON ops_dimensioning(status);

-- OPS-02: gaps cobertura
CREATE TABLE IF NOT EXISTS ops_coverage_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimensioning_id UUID REFERENCES ops_dimensioning(id) ON DELETE SET NULL,
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  gap_date DATE NOT NULL,
  gap_start TIMESTAMPTZ NOT NULL,
  gap_end TIMESTAMPTZ NOT NULL,
  uncovered_minutes INT NOT NULL CHECK (uncovered_minutes >= 0),
  reason TEXT CHECK (char_length(reason) <= 1000),
  status ops_coverage_gap_status NOT NULL DEFAULT 'aberto',
  responsible_id TEXT,
  responsible_name TEXT CHECK (char_length(responsible_name) <= 200),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_gap_end_after_start CHECK (gap_end > gap_start)
);
CREATE INDEX IF NOT EXISTS idx_ops_gap_post ON ops_coverage_gaps(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_gap_date ON ops_coverage_gaps(gap_date);
CREATE INDEX IF NOT EXISTS idx_ops_gap_status ON ops_coverage_gaps(status);

-- OPS-03: versão escala
CREATE TABLE IF NOT EXISTS ops_schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  version INT NOT NULL CHECK (version >= 1),
  status ops_schedule_status NOT NULL DEFAULT 'rascunho',
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  published_at TIMESTAMPTZ,
  published_by TEXT,
  created_by TEXT,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, unit_id, version),
  CONSTRAINT chk_valid_to_after_from CHECK (valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_ops_sched_company ON ops_schedule_versions(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_sched_status ON ops_schedule_versions(status);
CREATE INDEX IF NOT EXISTS idx_ops_sched_valid ON ops_schedule_versions(valid_from, valid_to);

-- OPS-03: entradas escala
CREATE TABLE IF NOT EXISTS ops_schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES ops_schedule_versions(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
  shift_template_id UUID NOT NULL REFERENCES ops_shift_templates(id) ON DELETE RESTRICT,
  role_id UUID REFERENCES ops_job_roles(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  status ops_schedule_entry_status NOT NULL DEFAULT 'planejado',
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, post_id, employee_id, entry_date, shift_template_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_sched_entry_version ON ops_schedule_entries(version_id);
CREATE INDEX IF NOT EXISTS idx_ops_sched_entry_post ON ops_schedule_entries(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_sched_entry_employee ON ops_schedule_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_sched_entry_date ON ops_schedule_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_ops_sched_entry_status ON ops_schedule_entries(status);

-- OPS-03: ciência versão
CREATE TABLE IF NOT EXISTS ops_schedule_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES ops_schedule_versions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash TEXT CHECK (char_length(ip_hash) <= 200),
  notes TEXT CHECK (char_length(notes) <= 500),
  UNIQUE(version_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_ack_version ON ops_schedule_acknowledgments(version_id);
CREATE INDEX IF NOT EXISTS idx_ops_ack_employee ON ops_schedule_acknowledgments(employee_id);

-- OPS-03: histórico escala
CREATE TABLE IF NOT EXISTS ops_schedule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES ops_schedule_versions(id) ON DELETE CASCADE,
  previous_status ops_schedule_status,
  next_status ops_schedule_status NOT NULL,
  changed_by TEXT,
  reason TEXT CHECK (char_length(reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_sched_hist_version ON ops_schedule_history(version_id);
CREATE INDEX IF NOT EXISTS idx_ops_sched_hist_next ON ops_schedule_history(next_status);

-- OPS-04: regras jornada/descanso configuradas e aprovadas
CREATE TABLE IF NOT EXISTS ops_work_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT CHECK (char_length(description) BETWEEN 10 AND 2000),
  max_daily_hours NUMERIC(5,2) NOT NULL DEFAULT 12 CHECK (max_daily_hours > 0 AND max_daily_hours <= 24),
  min_rest_hours NUMERIC(5,2) NOT NULL DEFAULT 11 CHECK (min_rest_hours >= 0 AND min_rest_hours <= 168),
  max_consecutive_days INT NOT NULL DEFAULT 6 CHECK (max_consecutive_days BETWEEN 1 AND 30),
  max_weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 44 CHECK (max_weekly_hours > 0 AND max_weekly_hours <= 80),
  requires_certification BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name)
);
CREATE INDEX IF NOT EXISTS idx_ops_work_rules_active ON ops_work_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ops_work_rules_approved ON ops_work_rules(is_approved) WHERE is_approved = true;

-- OPS-04: qualificações funcionário (habilitação, documentação)
CREATE TABLE IF NOT EXISTS ops_employee_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  role_id UUID REFERENCES ops_job_roles(id) ON DELETE SET NULL,
  certification_type TEXT NOT NULL CHECK (char_length(certification_type) BETWEEN 3 AND 100),
  valid_until DATE,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  document_url TEXT CHECK (char_length(document_url) <= 1000),
  issued_by TEXT CHECK (char_length(issued_by) <= 200),
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, role_id, certification_type)
);
CREATE INDEX IF NOT EXISTS idx_ops_qual_employee ON ops_employee_qualifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_qual_role ON ops_employee_qualifications(role_id);
CREATE INDEX IF NOT EXISTS idx_ops_qual_valid ON ops_employee_qualifications(is_valid) WHERE is_valid = true;
CREATE INDEX IF NOT EXISTS idx_ops_qual_valid_until ON ops_employee_qualifications(valid_until);

-- OPS-04: validações escala
CREATE TABLE IF NOT EXISTS ops_schedule_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES ops_schedule_versions(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES ops_schedule_entries(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  validation_type ops_validation_type NOT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  conflict_details JSONB,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_version_or_entry CHECK (version_id IS NOT NULL OR entry_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ops_val_version ON ops_schedule_validations(version_id);
CREATE INDEX IF NOT EXISTS idx_ops_val_entry ON ops_schedule_validations(entry_id);
CREATE INDEX IF NOT EXISTS idx_ops_val_employee ON ops_schedule_validations(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_val_type ON ops_schedule_validations(validation_type);
CREATE INDEX IF NOT EXISTS idx_ops_val_is_valid ON ops_schedule_validations(is_valid) WHERE is_valid = false;

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ops_job_roles_updated ON ops_job_roles;
CREATE TRIGGER trg_ops_job_roles_updated BEFORE UPDATE ON ops_job_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_posts_updated ON ops_posts;
CREATE TRIGGER trg_ops_posts_updated BEFORE UPDATE ON ops_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_shift_templates_updated ON ops_shift_templates;
CREATE TRIGGER trg_ops_shift_templates_updated BEFORE UPDATE ON ops_shift_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_post_shift_needs_updated ON ops_post_shift_needs;
CREATE TRIGGER trg_ops_post_shift_needs_updated BEFORE UPDATE ON ops_post_shift_needs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_allocations_updated ON ops_allocations;
CREATE TRIGGER trg_ops_allocations_updated BEFORE UPDATE ON ops_allocations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_dimensioning_updated ON ops_dimensioning;
CREATE TRIGGER trg_ops_dimensioning_updated BEFORE UPDATE ON ops_dimensioning FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_coverage_gaps_updated ON ops_coverage_gaps;
CREATE TRIGGER trg_ops_coverage_gaps_updated BEFORE UPDATE ON ops_coverage_gaps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_schedule_versions_updated ON ops_schedule_versions;
CREATE TRIGGER trg_ops_schedule_versions_updated BEFORE UPDATE ON ops_schedule_versions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_schedule_entries_updated ON ops_schedule_entries;
CREATE TRIGGER trg_ops_schedule_entries_updated BEFORE UPDATE ON ops_schedule_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_work_rules_updated ON ops_work_rules;
CREATE TRIGGER trg_ops_work_rules_updated BEFORE UPDATE ON ops_work_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_employee_qualifications_updated ON ops_employee_qualifications;
CREATE TRIGGER trg_ops_employee_qualifications_updated BEFORE UPDATE ON ops_employee_qualifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed job roles (cargo/função em entidade própria)
INSERT INTO ops_job_roles (name, role_type, description, requirements, is_active)
VALUES
('Vigilante', 'cargo', 'Cargo vigilante - segurança desarmada', '{"certificacoes": ["CNV"], "experiencia_minima": "6 meses"}'::jsonb, true),
('Porteiro', 'cargo', 'Cargo porteiro - controle acesso', '{"certificacoes": [], "experiencia_minima": "3 meses"}'::jsonb, true),
('Zelador', 'cargo', 'Cargo zelador - manutenção predial', '{"certificacoes": [], "experiencia_minima": "3 meses"}'::jsonb, true),
('Supervisor Operacional', 'cargo', 'Cargo supervisor operacional', '{"certificacoes": ["lideranca"], "experiencia_minima": "1 ano"}'::jsonb, true),
('Ronda', 'funcao', 'Função ronda - verificação pontos', '{"certificacoes": [], "equipamentos": ["radio"]}'::jsonb, true),
('Apoio', 'funcao', 'Função apoio - cobertura temporária', '{"certificacoes": []}'::jsonb, true)
ON CONFLICT (name, role_type) DO NOTHING;

-- Seed shift templates
INSERT INTO ops_shift_templates (name, shift_type, start_time, end_time, duration_hours, description, is_active)
VALUES
('Diurno 08h-18h', 'diurno', '08:00', '18:00', 10, 'Turno diurno 10h com intervalo', true),
('Noturno 19h-07h', 'noturno', '19:00', '07:00', 12, 'Turno noturno 12h', true),
('12x36 Dia 07h-19h', '12x36_dia', '07:00', '19:00', 12, 'Escala 12x36 dia', true),
('12x36 Noite 19h-07h', '12x36_noite', '19:00', '07:00', 12, 'Escala 12x36 noite', true),
('Comercial 08h-17h', 'comercial', '08:00', '17:00', 9, 'Turno comercial seg-sex', true)
ON CONFLICT (name, shift_type) DO NOTHING;

-- Hipóteses de jornada para revisão por RH/jurídico e convenção aplicável; seed não aprova nem ativa.
INSERT INTO ops_work_rules (name, description, max_daily_hours, min_rest_hours, max_consecutive_days, max_weekly_hours, requires_certification, is_approved, approved_by, is_active)
VALUES
('Regra Padrão CLT 44h', 'Jornada máxima 8h dia, 44h semana, descanso mínimo 11h entre jornadas, 1 folga semanal, máximo 6 dias consecutivos', 8, 11, 6, 44, false, false, NULL, false),
('Regra 12x36', 'Jornada 12h trabalho 36h descanso, máximo 12h dia, descanso mínimo 36h, máximo 3 dias consecutivos em caso de troca', 12, 36, 3, 44, true, false, NULL, false),
('Regra Limpeza 8h', 'Jornada limpeza 8h diárias, descanso 11h, máximo 6 dias consecutivos', 8, 11, 6, 44, false, false, NULL, false)
ON CONFLICT (name) DO NOTHING;

SELECT 'Migration 070 OPS-01/02/03/04 estrutura dimensionamento escala validacao applied' AS result;

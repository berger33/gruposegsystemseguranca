-- HR-10 afastamentos período retorno documentação restrita substituição supervisor vê indisponibilidade/aptidão não diagnóstico
-- HR-11 integração ponto justificativas divergências workflow correção fechamento competência trilha reabertura
-- HR-12 banco horas adicionais horas extras somente regras versionadas validadas vínculo/convenção não fixar 12x36/6x1 universal
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_absence_type') THEN
    CREATE TYPE hr_absence_type AS ENUM ('atestado_medico','licenca_maternidade','licenca_paternidade','acidente_trabalho','afastamento_inss','licenca_nao_remunerada','falta_justificada','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_absence_status') THEN
    CREATE TYPE hr_absence_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','em_afastamento','retornado','cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_time_entry_status') THEN
    CREATE TYPE hr_time_entry_status AS ENUM ('pendente','aprovado','divergente','em_correcao','corrigido','rejeitado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_time_entry_source') THEN
    CREATE TYPE hr_time_entry_source AS ENUM ('manual','importado','provedor','ajuste');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_competence_status') THEN
    CREATE TYPE hr_competence_status AS ENUM ('aberto','fechado','reaberto');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_work_rule_status') THEN
    CREATE TYPE hr_work_rule_status AS ENUM ('rascunho','em_revisao','aprovado','arquivado','rejeitado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_hour_bank_status') THEN
    CREATE TYPE hr_hour_bank_status AS ENUM ('aberto','fechado','arquivado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_hour_movement_type') THEN
    CREATE TYPE hr_hour_movement_type AS ENUM ('extra','falta','adicional_noturno','adicional_periculosidade','compensacao','ajuste','feriado','outro');
  END IF;
END $$;

-- HR-10 afastamentos
CREATE TABLE IF NOT EXISTS hr_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  type hr_absence_type NOT NULL DEFAULT 'atestado_medico',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  expected_return_date DATE,
  actual_return_date DATE,
  status hr_absence_status NOT NULL DEFAULT 'solicitado',
  is_medical_document BOOLEAN NOT NULL DEFAULT TRUE,
  medical_document_url VARCHAR(1000),
  medical_document_storage_key VARCHAR(500),
  is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  -- Supervisor view apenas indisponibilidade/aptidão, não diagnóstico
  is_fit_for_duty BOOLEAN,
  operational_notes VARCHAR(1000),
  has_substitution BOOLEAN NOT NULL DEFAULT FALSE,
  substitute_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  substitute_employee_name VARCHAR(200),
  reason TEXT CHECK (char_length(reason) <= 1000),
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_absences_employee ON hr_absences(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_absences_status ON hr_absences(status);
CREATE INDEX IF NOT EXISTS idx_hr_absences_dates ON hr_absences(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_hr_absences_type ON hr_absences(type);
CREATE INDEX IF NOT EXISTS idx_hr_absences_substitute ON hr_absences(substitute_employee_id);
DROP TRIGGER IF EXISTS trg_hr_absences_updated ON hr_absences;
CREATE TRIGGER trg_hr_absences_updated BEFORE UPDATE ON hr_absences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_absence_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  absence_id UUID NOT NULL REFERENCES hr_absences(id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL DEFAULT 'atestado' CHECK (doc_type IN ('atestado','laudo','receita','exame','comprovante','outro')),
  file_url VARCHAR(1000),
  storage_key VARCHAR(500),
  is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by VARCHAR(80),
  uploaded_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_absence_docs_absence ON hr_absence_documents(absence_id);
CREATE INDEX IF NOT EXISTS idx_absence_docs_restricted ON hr_absence_documents(is_restricted) WHERE is_restricted = true;

-- HR-11 ponto
CREATE TABLE IF NOT EXISTS hr_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  hours_worked DECIMAL(5,2) CHECK (hours_worked IS NULL OR (hours_worked >= 0 AND hours_worked <= 24)),
  source hr_time_entry_source NOT NULL DEFAULT 'manual',
  status hr_time_entry_status NOT NULL DEFAULT 'pendente',
  justification TEXT CHECK (char_length(justification) <= 1000),
  divergence_reason TEXT CHECK (char_length(divergence_reason) <= 1000),
  original_snapshot JSONB,
  corrected_by VARCHAR(80),
  corrected_by_id VARCHAR(80),
  corrected_at TIMESTAMPTZ,
  is_imported BOOLEAN NOT NULL DEFAULT FALSE,
  import_batch_id VARCHAR(100),
  competence VARCHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON hr_time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON hr_time_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_competence ON hr_time_entries(competence);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON hr_time_entries(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON hr_time_entries(employee_id, entry_date);
DROP TRIGGER IF EXISTS trg_time_entries_updated ON hr_time_entries;
CREATE TRIGGER trg_time_entries_updated BEFORE UPDATE ON hr_time_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_time_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES hr_time_entries(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  previous_data JSONB,
  new_data JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) >= 10 AND char_length(reason) <= 1000),
  requested_by VARCHAR(80),
  requested_by_id VARCHAR(80),
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado','em_analise','aprovado','rejeitado','cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_corrections_entry ON hr_time_corrections(entry_id);
CREATE INDEX IF NOT EXISTS idx_time_corrections_employee ON hr_time_corrections(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_corrections_status ON hr_time_corrections(status);
DROP TRIGGER IF EXISTS trg_time_corrections_updated ON hr_time_corrections;
CREATE TRIGGER trg_time_corrections_updated BEFORE UPDATE ON hr_time_corrections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_time_competence_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competence VARCHAR(7) NOT NULL UNIQUE CHECK (competence ~ '^\d{4}-\d{2}$'),
  status hr_competence_status NOT NULL DEFAULT 'aberto',
  closed_by VARCHAR(80),
  closed_by_id VARCHAR(80),
  closed_at TIMESTAMPTZ,
  reopened_by VARCHAR(80),
  reopened_by_id VARCHAR(80),
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT CHECK (char_length(reopen_reason) <= 1000),
  total_entries INTEGER DEFAULT 0,
  divergences_count INTEGER DEFAULT 0,
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competence_closures_status ON hr_time_competence_closures(status);
DROP TRIGGER IF EXISTS trg_competence_closures_updated ON hr_time_competence_closures;
CREATE TRIGGER trg_competence_closures_updated BEFORE UPDATE ON hr_time_competence_closures FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HR-12 banco horas regras versionadas validadas vínculo/convenção não fixar 12x36/6x1 universal
CREATE TABLE IF NOT EXISTS hr_work_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL CHECK (char_length(name) >= 5 AND char_length(name) <= 200),
  description TEXT CHECK (char_length(description) <= 2000),
  employment_type hr_employment_type NOT NULL DEFAULT 'clt',
  convention_ref VARCHAR(200),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  validity_start DATE NOT NULL,
  validity_end DATE CHECK (validity_end IS NULL OR validity_end > validity_start),
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_status hr_work_rule_status NOT NULL DEFAULT 'rascunho',
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);
CREATE INDEX IF NOT EXISTS idx_work_rules_employment ON hr_work_rules(employment_type);
CREATE INDEX IF NOT EXISTS idx_work_rules_status ON hr_work_rules(approval_status);
CREATE INDEX IF NOT EXISTS idx_work_rules_validity ON hr_work_rules(validity_start, validity_end);
DROP TRIGGER IF EXISTS trg_work_rules_updated ON hr_work_rules;
CREATE TRIGGER trg_work_rules_updated BEFORE UPDATE ON hr_work_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO hr_work_rules (name, description, employment_type, convention_ref, version, validity_start, validity_end, rules, approval_status, created_by)
VALUES
  ('Regra padrão CLT vigilante - jornada variável por convenção','Regra versionada para CLT vigilante, jornada definida por convenção e escala, não fixa 12x36/6x1 como universal, descanso configurado, adicional noturno e horas extras conforme convenção validada', 'clt', 'CCT Vigilantes SP 2026', 1, '2026-01-01', '2026-12-31', '{"jornada":{"tipo":"variavel_por_convenção","nota":"Não fixar 12x36/6x1 como regra universal, definir por escala e convenção","horas_semanais":44,"intervalo_minimo_descanso_horas":11,"descanso_semanal_horas":24},"adicionais":{"noturno_percent":20,"periculosidade_percent":30,"hora_extra_percent":50,"hora_extra_100_percent":100},"banco_horas":{"permite_compensacao":true,"limite_mensal_horas":20,"validade_meses":6}}'::jsonb, 'aprovado', 'seed'),
  ('Regra padrão CLT portaria - jornada variável','Regra portaria jornada variável por escala, não fixa 12x36', 'clt', 'CCT Portaria SP 2026', 1, '2026-01-01', '2026-12-31', '{"jornada":{"tipo":"variavel_por_escala","nota":"Não fixar 12x36/6x1 universal","horas_semanais":44},"adicionais":{"noturno_percent":20,"hora_extra_percent":50}}'::jsonb, 'aprovado', 'seed')
ON CONFLICT (name, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS hr_hour_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  competence VARCHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  saldo_anterior DECIMAL(6,2) NOT NULL DEFAULT 0,
  horas_extras DECIMAL(6,2) NOT NULL DEFAULT 0,
  horas_falta DECIMAL(6,2) NOT NULL DEFAULT 0,
  adicionais DECIMAL(6,2) NOT NULL DEFAULT 0,
  saldo_atual DECIMAL(6,2) NOT NULL DEFAULT 0,
  status hr_hour_bank_status NOT NULL DEFAULT 'aberto',
  rule_id UUID REFERENCES hr_work_rules(id) ON DELETE SET NULL,
  rule_version INTEGER,
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, competence)
);
CREATE INDEX IF NOT EXISTS idx_hour_bank_employee ON hr_hour_bank(employee_id);
CREATE INDEX IF NOT EXISTS idx_hour_bank_competence ON hr_hour_bank(competence);
CREATE INDEX IF NOT EXISTS idx_hour_bank_status ON hr_hour_bank(status);
CREATE INDEX IF NOT EXISTS idx_hour_bank_rule ON hr_hour_bank(rule_id);
DROP TRIGGER IF EXISTS trg_hour_bank_updated ON hr_hour_bank;
CREATE TRIGGER trg_hour_bank_updated BEFORE UPDATE ON hr_hour_bank FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_hour_bank_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour_bank_id UUID NOT NULL REFERENCES hr_hour_bank(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  movement_date DATE NOT NULL,
  type hr_hour_movement_type NOT NULL DEFAULT 'extra',
  quantity DECIMAL(6,2) NOT NULL CHECK (quantity >= -24 AND quantity <= 24),
  reason TEXT CHECK (char_length(reason) <= 1000),
  rule_id UUID REFERENCES hr_work_rules(id) ON DELETE SET NULL,
  rule_version INTEGER,
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hour_movements_bank ON hr_hour_bank_movements(hour_bank_id);
CREATE INDEX IF NOT EXISTS idx_hour_movements_employee ON hr_hour_bank_movements(employee_id);
CREATE INDEX IF NOT EXISTS idx_hour_movements_date ON hr_hour_bank_movements(movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_hour_movements_type ON hr_hour_bank_movements(type);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_absence_create') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_absence_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_time_entry_import') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_time_entry_import';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_time_correction_request') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_time_correction_request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_competence_close') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_competence_close';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_competence_reopen') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_competence_reopen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_work_rule_approve') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_work_rule_approve';
  END IF;
END $$;

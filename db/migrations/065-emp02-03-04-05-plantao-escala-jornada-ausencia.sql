-- EMP-02 próximo plantão local horário função contato supervisor orientações itens necessários
-- EMP-03 calendário escala folgas alterações ciência versão publicada usuário não modifica unilateralmente escala
-- EMP-04 jornada individual comprovantes/importação provedor divergências pedido correção preservar registro original
-- EMP-05 aviso ausência/atraso protocolo motivo limitado responsável acompanhamento aciona fluxo cobertura

DO $$ BEGIN
  CREATE TYPE emp_shift_status AS ENUM ('rascunho','publicado','confirmado','cancelado','realizado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_schedule_version_status AS ENUM ('rascunho','publicado','arquivado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_schedule_entry_type AS ENUM ('trabalho','folga','ferias','afastamento','reserva','compensacao','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_journey_proof_status AS ENUM ('pendente','em_analise','aprovado','rejeitado','arquivado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_journey_correction_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','cancelado','concluido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_absence_notice_type AS ENUM ('ausencia','atraso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_absence_reason AS ENUM ('doenca','transporte','familiar','pessoal','acidente','condicoes_climaticas','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_absence_notice_status AS ENUM ('aberto','em_analise','aprovado','rejeitado','em_acompanhamento','encerrado','cancelado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EMP-02 próximo plantão
CREATE TABLE IF NOT EXISTS emp_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  shift_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location VARCHAR(200),
  function_name VARCHAR(100),
  supervisor_id UUID,
  supervisor_name VARCHAR(200),
  supervisor_contact VARCHAR(100),
  orientations TEXT,
  required_items JSONB,
  status emp_shift_status NOT NULL DEFAULT 'publicado',
  is_next_shift BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_shift_emp_idx ON emp_shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS emp_shift_date_idx ON emp_shift_assignments(shift_date);
CREATE INDEX IF NOT EXISTS emp_shift_status_idx ON emp_shift_assignments(status);
CREATE INDEX IF NOT EXISTS emp_shift_next_idx ON emp_shift_assignments(employee_id, shift_date) WHERE is_next_shift=true;
CREATE INDEX IF NOT EXISTS emp_shift_supervisor_idx ON emp_shift_assignments(supervisor_id);

-- EMP-03 calendário escala versões
CREATE TABLE IF NOT EXISTS emp_schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  status emp_schedule_version_status NOT NULL DEFAULT 'rascunho',
  published_at TIMESTAMPTZ,
  published_by UUID,
  published_by_id UUID,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_sched_ver_status_idx ON emp_schedule_versions(status);
CREATE INDEX IF NOT EXISTS emp_sched_ver_period_idx ON emp_schedule_versions(period_start, period_end);

CREATE TABLE IF NOT EXISTS emp_schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES emp_schedule_versions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  entry_date DATE NOT NULL,
  entry_type emp_schedule_entry_type NOT NULL DEFAULT 'trabalho',
  shift_assignment_id UUID REFERENCES emp_shift_assignments(id) ON DELETE SET NULL,
  is_day_off BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  location VARCHAR(200),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  change_reason TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, employee_id, entry_date)
);
CREATE INDEX IF NOT EXISTS emp_sched_entry_version_idx ON emp_schedule_entries(version_id);
CREATE INDEX IF NOT EXISTS emp_sched_entry_employee_idx ON emp_schedule_entries(employee_id);
CREATE INDEX IF NOT EXISTS emp_sched_entry_date_idx ON emp_schedule_entries(entry_date);
CREATE INDEX IF NOT EXISTS emp_sched_entry_type_idx ON emp_schedule_entries(entry_type);
CREATE INDEX IF NOT EXISTS emp_sched_entry_ack_idx ON emp_schedule_entries(acknowledged) WHERE acknowledged=false;

-- EMP-04 jornada individual comprovantes
CREATE TABLE IF NOT EXISTS emp_journey_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  entry_date DATE NOT NULL,
  file_name VARCHAR(300),
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  proof_type VARCHAR(50) NOT NULL DEFAULT 'comprovante' CHECK (proof_type IN ('comprovante','importacao_provedor','atestado','declaracao','outro')),
  status emp_journey_proof_status NOT NULL DEFAULT 'pendente',
  time_entry_id UUID REFERENCES hr_time_entries(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID,
  reviewed_by_id UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_journey_proofs_employee_idx ON emp_journey_proofs(employee_id);
CREATE INDEX IF NOT EXISTS emp_journey_proofs_date_idx ON emp_journey_proofs(entry_date);
CREATE INDEX IF NOT EXISTS emp_journey_proofs_status_idx ON emp_journey_proofs(status);
CREATE INDEX IF NOT EXISTS emp_journey_proofs_time_entry_idx ON emp_journey_proofs(time_entry_id);

CREATE TABLE IF NOT EXISTS emp_journey_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  time_entry_id UUID NOT NULL REFERENCES hr_time_entries(id),
  original_snapshot JSONB,
  requested_changes JSONB NOT NULL,
  reason TEXT NOT NULL CHECK (LENGTH(reason) >=10),
  status emp_journey_correction_status NOT NULL DEFAULT 'solicitado',
  reviewed_by UUID,
  reviewed_by_id UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  approved_changes JSONB,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_journey_corr_employee_idx ON emp_journey_corrections(employee_id);
CREATE INDEX IF NOT EXISTS emp_journey_corr_time_entry_idx ON emp_journey_corrections(time_entry_id);
CREATE INDEX IF NOT EXISTS emp_journey_corr_status_idx ON emp_journey_corrections(status);

-- EMP-05 aviso ausência/atraso
CREATE TABLE IF NOT EXISTS emp_absence_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  notice_type emp_absence_notice_type NOT NULL,
  shift_date DATE,
  notice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_delay_minutes INT CHECK (expected_delay_minutes IS NULL OR expected_delay_minutes >=0),
  reason_code emp_absence_reason NOT NULL,
  reason_details TEXT CHECK (reason_details IS NULL OR LENGTH(reason_details) >=10),
  responsible_id UUID,
  responsible_name VARCHAR(200),
  status emp_absence_notice_status NOT NULL DEFAULT 'aberto',
  coverage_triggered BOOLEAN NOT NULL DEFAULT false,
  coverage_request_id UUID,
  coverage_notes TEXT,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  closed_by_id UUID,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_absence_employee_idx ON emp_absence_notices(employee_id);
CREATE INDEX IF NOT EXISTS emp_absence_type_idx ON emp_absence_notices(notice_type);
CREATE INDEX IF NOT EXISTS emp_absence_reason_idx ON emp_absence_notices(reason_code);
CREATE INDEX IF NOT EXISTS emp_absence_status_idx ON emp_absence_notices(status);
CREATE INDEX IF NOT EXISTS emp_absence_protocol_idx ON emp_absence_notices(protocol);
CREATE INDEX IF NOT EXISTS emp_absence_coverage_idx ON emp_absence_notices(coverage_triggered) WHERE coverage_triggered=true;

CREATE TABLE IF NOT EXISTS emp_absence_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES emp_absence_notices(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (LENGTH(message) >=5),
  status emp_absence_notice_status,
  created_by UUID,
  created_by_id UUID,
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_absence_follow_notice_idx ON emp_absence_followups(notice_id);

-- triggers updated_at
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION set_updated_at_emp02_05() RETURNS TRIGGER AS $f$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_emp_shift_assignments_updated ON emp_shift_assignments;
CREATE TRIGGER trg_emp_shift_assignments_updated BEFORE UPDATE ON emp_shift_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp02_05();

DROP TRIGGER IF EXISTS trg_emp_schedule_versions_updated ON emp_schedule_versions;
CREATE TRIGGER trg_emp_schedule_versions_updated BEFORE UPDATE ON emp_schedule_versions FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp02_05();

DROP TRIGGER IF EXISTS trg_emp_schedule_entries_updated ON emp_schedule_entries;
CREATE TRIGGER trg_emp_schedule_entries_updated BEFORE UPDATE ON emp_schedule_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp02_05();

DROP TRIGGER IF EXISTS trg_emp_journey_proofs_updated ON emp_journey_proofs;
CREATE TRIGGER trg_emp_journey_proofs_updated BEFORE UPDATE ON emp_journey_proofs FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp02_05();

DROP TRIGGER IF EXISTS trg_emp_journey_corrections_updated ON emp_journey_corrections;
CREATE TRIGGER trg_emp_journey_corrections_updated BEFORE UPDATE ON emp_journey_corrections FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp02_05();

DROP TRIGGER IF EXISTS trg_emp_absence_notices_updated ON emp_absence_notices;
CREATE TRIGGER trg_emp_absence_notices_updated BEFORE UPDATE ON emp_absence_notices FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp02_05();

-- seeds for testing
INSERT INTO emp_schedule_versions (version, title, period_start, period_end, status, notes) VALUES
(1, 'Escala Janeiro 2026', '2026-01-01', '2026-01-31', 'publicado', 'Escala publicada inicial para testes')
ON CONFLICT (version) DO NOTHING;

-- audit_action additions
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_shift_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_schedule_publish';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_schedule_ack';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_journey_proof_upload';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_journey_correction_request';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_absence_notice_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_absence_coverage_trigger';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

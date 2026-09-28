-- EMP-06 troca plantão solicitação aceite outro profissional validações aprovação operacional
-- EMP-07 passagem serviço pendências chaves equipamentos ocorrências aceite não expor dados desnecessários terceiros
-- EMP-08 ocorrência categoria descrição horário local anexo pertinente restrição informações pessoais
-- EMP-09 procedimentos posto versionados ciência contatos apoio

DO $$ BEGIN
  CREATE TYPE emp_swap_status AS ENUM ('solicitado','pendente_aceite','aceito','rejeitado','em_analise','aprovado','rejeitado_operacional','cancelado','encerrado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_handover_status AS ENUM ('pendente','em_andamento','aceito','recusado','encerrado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_occurrence_category AS ENUM ('seguranca','operacional','manutencao','limpeza','comportamental','cliente','equipamento','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_occurrence_severity AS ENUM ('baixa','media','alta','critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_occurrence_status AS ENUM ('aberto','em_analise','em_tratamento','resolvido','encerrado','cancelado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_procedure_status AS ENUM ('rascunho','em_revisao','publicado','arquivado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EMP-06 troca plantão
CREATE TABLE IF NOT EXISTS emp_shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  requester_employee_id UUID NOT NULL REFERENCES hr_employees(id),
  target_employee_id UUID REFERENCES hr_employees(id),
  original_shift_id UUID REFERENCES emp_shift_assignments(id) ON DELETE SET NULL,
  requested_shift_id UUID REFERENCES emp_shift_assignments(id) ON DELETE SET NULL,
  swap_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (LENGTH(reason) >=10),
  status emp_swap_status NOT NULL DEFAULT 'solicitado',
  requester_ack BOOLEAN NOT NULL DEFAULT true,
  target_ack BOOLEAN NOT NULL DEFAULT false,
  target_ack_at TIMESTAMPTZ,
  target_rejection_reason TEXT,
  operational_approved_by UUID,
  operational_approved_by_id UUID,
  operational_approved_at TIMESTAMPTZ,
  operational_rejection_reason TEXT,
  is_overlapping_validated BOOLEAN NOT NULL DEFAULT false,
  is_qualification_validated BOOLEAN NOT NULL DEFAULT false,
  validation_notes TEXT,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_swap_requester_idx ON emp_shift_swap_requests(requester_employee_id);
CREATE INDEX IF NOT EXISTS emp_swap_target_idx ON emp_shift_swap_requests(target_employee_id);
CREATE INDEX IF NOT EXISTS emp_swap_date_idx ON emp_shift_swap_requests(swap_date);
CREATE INDEX IF NOT EXISTS emp_swap_status_idx ON emp_shift_swap_requests(status);
CREATE INDEX IF NOT EXISTS emp_swap_protocol_idx ON emp_shift_swap_requests(protocol);
CREATE INDEX IF NOT EXISTS emp_swap_original_shift_idx ON emp_shift_swap_requests(original_shift_id);

-- EMP-07 passagem serviço
CREATE TABLE IF NOT EXISTS emp_handover_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  from_employee_id UUID NOT NULL REFERENCES hr_employees(id),
  to_employee_id UUID NOT NULL REFERENCES hr_employees(id),
  shift_assignment_id UUID REFERENCES emp_shift_assignments(id) ON DELETE SET NULL,
  handover_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pending_tasks TEXT,
  keys_handover JSONB,
  equipment_handover JSONB,
  occurrences_summary TEXT,
  status emp_handover_status NOT NULL DEFAULT 'pendente',
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  accepted_by_id UUID,
  rejection_reason TEXT,
  is_private BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_handover_from_idx ON emp_handover_records(from_employee_id);
CREATE INDEX IF NOT EXISTS emp_handover_to_idx ON emp_handover_records(to_employee_id);
CREATE INDEX IF NOT EXISTS emp_handover_date_idx ON emp_handover_records(handover_date);
CREATE INDEX IF NOT EXISTS emp_handover_status_idx ON emp_handover_records(status);
CREATE INDEX IF NOT EXISTS emp_handover_protocol_idx ON emp_handover_records(protocol);
CREATE INDEX IF NOT EXISTS emp_handover_private_idx ON emp_handover_records(is_private) WHERE is_private=true;

-- EMP-08 ocorrência
CREATE TABLE IF NOT EXISTS emp_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  category emp_occurrence_category NOT NULL DEFAULT 'operacional',
  severity emp_occurrence_severity NOT NULL DEFAULT 'media',
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=5),
  description TEXT NOT NULL CHECK (LENGTH(description) >=10),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location VARCHAR(200),
  status emp_occurrence_status NOT NULL DEFAULT 'aberto',
  is_personal_data_restricted BOOLEAN NOT NULL DEFAULT true,
  reported_by UUID,
  reported_by_id UUID,
  reported_by_name VARCHAR(200),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_occ_employee_idx ON emp_occurrences(employee_id);
CREATE INDEX IF NOT EXISTS emp_occ_category_idx ON emp_occurrences(category);
CREATE INDEX IF NOT EXISTS emp_occ_severity_idx ON emp_occurrences(severity);
CREATE INDEX IF NOT EXISTS emp_occ_status_idx ON emp_occurrences(status);
CREATE INDEX IF NOT EXISTS emp_occ_protocol_idx ON emp_occurrences(protocol);
CREATE INDEX IF NOT EXISTS emp_occ_date_idx ON emp_occurrences(occurred_at);
CREATE INDEX IF NOT EXISTS emp_occ_restricted_idx ON emp_occurrences(is_personal_data_restricted) WHERE is_personal_data_restricted=true;

CREATE TABLE IF NOT EXISTS emp_occurrence_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id UUID NOT NULL REFERENCES emp_occurrences(id) ON DELETE CASCADE,
  file_name VARCHAR(300) NOT NULL,
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  is_personal_data_restricted BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  uploaded_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_occ_attach_occurrence_idx ON emp_occurrence_attachments(occurrence_id);
CREATE INDEX IF NOT EXISTS emp_occ_attach_restricted_idx ON emp_occurrence_attachments(is_personal_data_restricted) WHERE is_personal_data_restricted=true;

CREATE TABLE IF NOT EXISTS emp_occurrence_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id UUID NOT NULL REFERENCES emp_occurrences(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL CHECK (LENGTH(description) >=5),
  responsible_name VARCHAR(200),
  due_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'pendente',
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_occ_action_occurrence_idx ON emp_occurrence_actions(occurrence_id);
CREATE INDEX IF NOT EXISTS emp_occ_action_status_idx ON emp_occurrence_actions(status);

-- EMP-09 procedimentos posto versionados
CREATE TABLE IF NOT EXISTS emp_post_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_location VARCHAR(200) NOT NULL,
  title VARCHAR(200) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL CHECK (LENGTH(content) >=20),
  category VARCHAR(100),
  status emp_procedure_status NOT NULL DEFAULT 'rascunho',
  published_at TIMESTAMPTZ,
  published_by UUID,
  published_by_id UUID,
  approved_by UUID,
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(title, version)
);
CREATE INDEX IF NOT EXISTS emp_proc_location_idx ON emp_post_procedures(post_location);
CREATE INDEX IF NOT EXISTS emp_proc_status_idx ON emp_post_procedures(status);
CREATE INDEX IF NOT EXISTS emp_proc_active_idx ON emp_post_procedures(is_active) WHERE is_active=true;

CREATE TABLE IF NOT EXISTS emp_procedure_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES emp_post_procedures(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by UUID,
  notes TEXT,
  UNIQUE(procedure_id, employee_id)
);
CREATE INDEX IF NOT EXISTS emp_proc_ack_procedure_idx ON emp_procedure_acknowledgments(procedure_id);
CREATE INDEX IF NOT EXISTS emp_proc_ack_employee_idx ON emp_procedure_acknowledgments(employee_id);

CREATE TABLE IF NOT EXISTS emp_support_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  role VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(320),
  post_location VARCHAR(200),
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_support_contact_location_idx ON emp_support_contacts(post_location);
CREATE INDEX IF NOT EXISTS emp_support_contact_emergency_idx ON emp_support_contacts(is_emergency) WHERE is_emergency=true;
CREATE INDEX IF NOT EXISTS emp_support_contact_active_idx ON emp_support_contacts(is_active) WHERE is_active=true;

-- triggers
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION set_updated_at_emp06_09() RETURNS TRIGGER AS $f$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_emp_swap_updated ON emp_shift_swap_requests;
CREATE TRIGGER trg_emp_swap_updated BEFORE UPDATE ON emp_shift_swap_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp06_09();

DROP TRIGGER IF EXISTS trg_emp_handover_updated ON emp_handover_records;
CREATE TRIGGER trg_emp_handover_updated BEFORE UPDATE ON emp_handover_records FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp06_09();

DROP TRIGGER IF EXISTS trg_emp_occ_updated ON emp_occurrences;
CREATE TRIGGER trg_emp_occ_updated BEFORE UPDATE ON emp_occurrences FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp06_09();

DROP TRIGGER IF EXISTS trg_emp_post_proc_updated ON emp_post_procedures;
CREATE TRIGGER trg_emp_post_proc_updated BEFORE UPDATE ON emp_post_procedures FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp06_09();

DROP TRIGGER IF EXISTS trg_emp_support_contacts_updated ON emp_support_contacts;
CREATE TRIGGER trg_emp_support_contacts_updated BEFORE UPDATE ON emp_support_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp06_09();

-- seeds
INSERT INTO emp_post_procedures (post_location, title, version, content, category, status, is_active) VALUES
('Portaria Central', 'Procedimento Abertura Portaria', 1, '1. Verificar fechaduras 2. Ligar CFTV 3. Registrar ocorrências noturnas 4. Conferir chaves 5. Contato apoio supervisor', 'abertura', 'publicado', true),
('Ronda Noturna', 'Procedimento Ronda', 1, '1. Usar lanterna 2. Verificar pontos de verificação 3. Registrar horário 4. Não expor dados terceiros 5. Acionar apoio se necessário', 'ronda', 'publicado', true)
ON CONFLICT (title, version) DO NOTHING;

INSERT INTO emp_support_contacts (name, role, phone, post_location, is_emergency, is_active, notes) VALUES
('Supervisor Noturno', 'supervisor', '11 99999-0001', 'Portaria Central', true, true, 'Contato emergência noturna'),
('TI Suporte', 'ti', '11 99999-0002', 'Geral', false, true, 'Suporte sistema')
ON CONFLICT DO NOTHING;

-- audit_action
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_shift_swap_request';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_shift_swap_accept';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_shift_swap_approve';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_handover_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_handover_accept';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_occurrence_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_procedure_publish';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_procedure_ack';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

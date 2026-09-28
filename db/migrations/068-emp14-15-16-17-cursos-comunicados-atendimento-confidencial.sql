-- EMP-14 cursos reciclagens comprovantes alertas vencimento
-- EMP-15 comunicados direcionados confirmação leitura central notificações
-- EMP-16 atendimento RH protocolo categoria mensagens privadas acompanhamento
-- EMP-17 canal confidencial separado responsáveis política acesso anonimato somente se efetivamente suportado

DO $$ BEGIN
  CREATE TYPE emp_course_status AS ENUM ('inscrito','em_andamento','concluido','reprovado','pendente','vencido','cancelado','aprovado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_course_proof_status AS ENUM ('pendente','em_analise','aprovado','rejeitado','arquivado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_course_alert_status AS ENUM ('pendente','enviado','confirmado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_communication_category AS ENUM ('geral','treinamento','seguranca','rh','operacional','beneficio','comunicado','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_communication_status AS ENUM ('rascunho','publicado','arquivado','cancelado','em_revisao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_communication_target_type AS ENUM ('individual','grupo','todos','cargo','lotacao','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_hr_ticket_category AS ENUM ('folha','ponto','beneficios','ferias','afastamento','documentos','uniforme','treinamento','saude','ti','operacional','rh','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_hr_ticket_status AS ENUM ('aberto','em_atendimento','aguardando_colaborador','aguardando_rh','resolvido','encerrado','cancelado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_hr_priority AS ENUM ('baixa','media','alta','critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_confidential_category AS ENUM ('assedio','discriminacao','fraude','seguranca','etica','comportamento','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_confidential_status AS ENUM ('recebido','em_analise','em_investigacao','resolvido','arquivado','cancelado','pendente','encerrado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_confidential_access_role AS ENUM ('rh','compliance','diretoria','ti','admin','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EMP-14 cursos reciclagens comprovantes alertas vencimento
CREATE TABLE IF NOT EXISTS emp_course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  training_id UUID REFERENCES hr_training_catalog(id) ON DELETE SET NULL,
  session_id UUID REFERENCES hr_training_sessions(id) ON DELETE SET NULL,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completion_date DATE,
  status emp_course_status NOT NULL DEFAULT 'inscrito',
  presence_percent INT CHECK (presence_percent IS NULL OR (presence_percent >=0 AND presence_percent <=100)),
  score NUMERIC(5,2) CHECK (score IS NULL OR (score >=0 AND score <=100)),
  certificate_url TEXT,
  storage_key VARCHAR(500),
  is_certificate_valid BOOLEAN NOT NULL DEFAULT false,
  expiry_date DATE,
  alert_days_before INT NOT NULL DEFAULT 30 CHECK (alert_days_before >=1 AND alert_days_before <=365),
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, training_id, session_id)
);
CREATE INDEX IF NOT EXISTS emp_course_enroll_employee_idx ON emp_course_enrollments(employee_id);
CREATE INDEX IF NOT EXISTS emp_course_enroll_training_idx ON emp_course_enrollments(training_id);
CREATE INDEX IF NOT EXISTS emp_course_enroll_status_idx ON emp_course_enrollments(status);
CREATE INDEX IF NOT EXISTS emp_course_enroll_expiry_idx ON emp_course_enrollments(expiry_date);
CREATE INDEX IF NOT EXISTS emp_course_enroll_session_idx ON emp_course_enrollments(session_id);

CREATE TABLE IF NOT EXISTS emp_course_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES emp_course_enrollments(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  file_name VARCHAR(300),
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  proof_type VARCHAR(50) NOT NULL DEFAULT 'certificado' CHECK (proof_type IN ('certificado','comprovante','declaracao','outro')),
  status emp_course_proof_status NOT NULL DEFAULT 'pendente',
  expiry_date DATE,
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
CREATE INDEX IF NOT EXISTS emp_course_proofs_enrollment_idx ON emp_course_proofs(enrollment_id);
CREATE INDEX IF NOT EXISTS emp_course_proofs_employee_idx ON emp_course_proofs(employee_id);
CREATE INDEX IF NOT EXISTS emp_course_proofs_status_idx ON emp_course_proofs(status);
CREATE INDEX IF NOT EXISTS emp_course_proofs_expiry_idx ON emp_course_proofs(expiry_date);

CREATE TABLE IF NOT EXISTS emp_course_expiry_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES emp_course_enrollments(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  training_id UUID REFERENCES hr_training_catalog(id) ON DELETE SET NULL,
  expiry_date DATE NOT NULL,
  alert_date DATE NOT NULL,
  status emp_course_alert_status NOT NULL DEFAULT 'pendente',
  message TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_course_alert_employee_idx ON emp_course_expiry_alerts(employee_id);
CREATE INDEX IF NOT EXISTS emp_course_alert_expiry_idx ON emp_course_expiry_alerts(expiry_date);
CREATE INDEX IF NOT EXISTS emp_course_alert_date_idx ON emp_course_expiry_alerts(alert_date);
CREATE INDEX IF NOT EXISTS emp_course_alert_status_idx ON emp_course_expiry_alerts(status);

-- EMP-15 comunicados direcionados confirmação leitura central notificações
CREATE TABLE IF NOT EXISTS emp_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=5),
  content TEXT NOT NULL CHECK (LENGTH(content) >=20),
  category emp_communication_category NOT NULL DEFAULT 'geral',
  status emp_communication_status NOT NULL DEFAULT 'rascunho',
  target_type emp_communication_target_type NOT NULL DEFAULT 'todos',
  target_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  target_group VARCHAR(100),
  is_directed BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  published_by UUID,
  published_by_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_comm_category_idx ON emp_communications(category);
CREATE INDEX IF NOT EXISTS emp_comm_status_idx ON emp_communications(status);
CREATE INDEX IF NOT EXISTS emp_comm_target_type_idx ON emp_communications(target_type);
CREATE INDEX IF NOT EXISTS emp_comm_target_employee_idx ON emp_communications(target_employee_id);
CREATE INDEX IF NOT EXISTS emp_comm_directed_idx ON emp_communications(is_directed) WHERE is_directed=true;
CREATE INDEX IF NOT EXISTS emp_comm_active_idx ON emp_communications(is_active) WHERE is_active=true;

CREATE TABLE IF NOT EXISTS emp_communication_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES emp_communications(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  ip_hash VARCHAR(128),
  notes TEXT,
  UNIQUE(communication_id, employee_id)
);
CREATE INDEX IF NOT EXISTS emp_comm_read_comm_idx ON emp_communication_reads(communication_id);
CREATE INDEX IF NOT EXISTS emp_comm_read_employee_idx ON emp_communication_reads(employee_id);
CREATE INDEX IF NOT EXISTS emp_comm_read_confirmed_idx ON emp_communication_reads(confirmed) WHERE confirmed=true;

CREATE TABLE IF NOT EXISTS emp_notifications_center (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  communication_id UUID REFERENCES emp_communications(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'comunicado',
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=5),
  message TEXT NOT NULL CHECK (LENGTH(message) >=10),
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  is_directed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_notif_employee_idx ON emp_notifications_center(employee_id);
CREATE INDEX IF NOT EXISTS emp_notif_read_idx ON emp_notifications_center(is_read) WHERE is_read=false;
CREATE INDEX IF NOT EXISTS emp_notif_comm_idx ON emp_notifications_center(communication_id);
CREATE INDEX IF NOT EXISTS emp_notif_directed_idx ON emp_notifications_center(is_directed) WHERE is_directed=true;

-- EMP-16 atendimento RH protocolo categoria mensagens privadas acompanhamento
CREATE TABLE IF NOT EXISTS emp_hr_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  category emp_hr_ticket_category NOT NULL DEFAULT 'rh',
  priority emp_hr_priority NOT NULL DEFAULT 'media',
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=5),
  description TEXT NOT NULL CHECK (LENGTH(description) >=10),
  status emp_hr_ticket_status NOT NULL DEFAULT 'aberto',
  responsible_id UUID,
  responsible_name VARCHAR(200),
  due_date DATE,
  is_private BOOLEAN NOT NULL DEFAULT true,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  closed_by_id UUID,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_hr_ticket_employee_idx ON emp_hr_tickets(employee_id);
CREATE INDEX IF NOT EXISTS emp_hr_ticket_category_idx ON emp_hr_tickets(category);
CREATE INDEX IF NOT EXISTS emp_hr_ticket_status_idx ON emp_hr_tickets(status);
CREATE INDEX IF NOT EXISTS emp_hr_ticket_protocol_idx ON emp_hr_tickets(protocol);
CREATE INDEX IF NOT EXISTS emp_hr_ticket_private_idx ON emp_hr_tickets(is_private) WHERE is_private=true;

CREATE TABLE IF NOT EXISTS emp_hr_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES emp_hr_tickets(id) ON DELETE CASCADE,
  sender_id UUID,
  sender_name VARCHAR(200) NOT NULL,
  message TEXT NOT NULL CHECK (LENGTH(message) >=1),
  is_private BOOLEAN NOT NULL DEFAULT true,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_hr_msg_ticket_idx ON emp_hr_messages(ticket_id);
CREATE INDEX IF NOT EXISTS emp_hr_msg_private_idx ON emp_hr_messages(is_private) WHERE is_private=true;

CREATE TABLE IF NOT EXISTS emp_hr_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES emp_hr_tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES emp_hr_messages(id) ON DELETE SET NULL,
  file_name VARCHAR(300) NOT NULL,
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  uploaded_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_hr_attach_ticket_idx ON emp_hr_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS emp_hr_attach_restricted_idx ON emp_hr_attachments(is_restricted) WHERE is_restricted=true;

-- EMP-17 canal confidencial separado responsáveis política acesso anonimato somente se efetivamente suportado
CREATE TABLE IF NOT EXISTS emp_confidential_access_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role emp_confidential_access_role NOT NULL,
  access_level VARCHAR(50) NOT NULL DEFAULT 'leitura' CHECK (access_level IN ('leitura','escrita','admin')),
  allowed_employee_ids TEXT[],
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_conf_policy_role_idx ON emp_confidential_access_policies(role);
CREATE INDEX IF NOT EXISTS emp_conf_policy_active_idx ON emp_confidential_access_policies(is_active) WHERE is_active=true;

CREATE TABLE IF NOT EXISTS emp_confidential_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  reporter_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  anonymous_token_hash VARCHAR(128),
  category emp_confidential_category NOT NULL DEFAULT 'etica',
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=5),
  description TEXT NOT NULL CHECK (LENGTH(description) >=20),
  status emp_confidential_status NOT NULL DEFAULT 'recebido',
  responsible_id UUID,
  responsible_name VARCHAR(200),
  is_anonymous_supported BOOLEAN NOT NULL DEFAULT false,
  anonymous_supported_note TEXT,
  is_private BOOLEAN NOT NULL DEFAULT true,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  closed_by_id UUID,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_conf_report_employee_idx ON emp_confidential_reports(reporter_employee_id);
CREATE INDEX IF NOT EXISTS emp_conf_report_category_idx ON emp_confidential_reports(category);
CREATE INDEX IF NOT EXISTS emp_conf_report_status_idx ON emp_confidential_reports(status);
CREATE INDEX IF NOT EXISTS emp_conf_report_protocol_idx ON emp_confidential_reports(protocol);
CREATE INDEX IF NOT EXISTS emp_conf_report_anonymous_idx ON emp_confidential_reports(is_anonymous) WHERE is_anonymous=true;
CREATE INDEX IF NOT EXISTS emp_conf_report_private_idx ON emp_confidential_reports(is_private) WHERE is_private=true;

CREATE TABLE IF NOT EXISTS emp_confidential_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES emp_confidential_reports(id) ON DELETE CASCADE,
  sender_id UUID,
  sender_name VARCHAR(200) NOT NULL,
  message TEXT NOT NULL CHECK (LENGTH(message) >=5),
  is_private BOOLEAN NOT NULL DEFAULT true,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_conf_msg_report_idx ON emp_confidential_messages(report_id);
CREATE INDEX IF NOT EXISTS emp_conf_msg_private_idx ON emp_confidential_messages(is_private) WHERE is_private=true;

CREATE TABLE IF NOT EXISTS emp_confidential_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES emp_confidential_reports(id) ON DELETE CASCADE,
  file_name VARCHAR(300) NOT NULL,
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  uploaded_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_conf_attach_report_idx ON emp_confidential_attachments(report_id);
CREATE INDEX IF NOT EXISTS emp_conf_attach_restricted_idx ON emp_confidential_attachments(is_restricted) WHERE is_restricted=true;

-- triggers
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION set_updated_at_emp14_17() RETURNS TRIGGER AS $f$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_emp_course_enroll_updated ON emp_course_enrollments;
CREATE TRIGGER trg_emp_course_enroll_updated BEFORE UPDATE ON emp_course_enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

DROP TRIGGER IF EXISTS trg_emp_course_proofs_updated ON emp_course_proofs;
CREATE TRIGGER trg_emp_course_proofs_updated BEFORE UPDATE ON emp_course_proofs FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

DROP TRIGGER IF EXISTS trg_emp_course_alerts_updated ON emp_course_expiry_alerts;
CREATE TRIGGER trg_emp_course_alerts_updated BEFORE UPDATE ON emp_course_expiry_alerts FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

DROP TRIGGER IF EXISTS trg_emp_communications_updated ON emp_communications;
CREATE TRIGGER trg_emp_communications_updated BEFORE UPDATE ON emp_communications FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

DROP TRIGGER IF EXISTS trg_emp_notifications_updated ON emp_notifications_center;
CREATE TRIGGER trg_emp_notifications_updated BEFORE UPDATE ON emp_notifications_center FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

DROP TRIGGER IF EXISTS trg_emp_hr_tickets_updated ON emp_hr_tickets;
CREATE TRIGGER trg_emp_hr_tickets_updated BEFORE UPDATE ON emp_hr_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

DROP TRIGGER IF EXISTS trg_emp_conf_policies_updated ON emp_confidential_access_policies;
CREATE TRIGGER trg_emp_conf_policies_updated BEFORE UPDATE ON emp_confidential_access_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

DROP TRIGGER IF EXISTS trg_emp_conf_reports_updated ON emp_confidential_reports;
CREATE TRIGGER trg_emp_conf_reports_updated BEFORE UPDATE ON emp_confidential_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp14_17();

-- seeds
INSERT INTO emp_communications (title, content, category, status, target_type, is_directed, is_active) VALUES
('Comunicado Geral - Segurança', 'Lembramos todos sobre uso obrigatório de EPI e procedimentos de segurança. Conteúdo mínimo 20 caracteres para teste.', 'seguranca', 'publicado', 'todos', false, true),
('Treinamento NR-10 Obrigatório', 'Convocação para reciclagem NR-10 com validade 730 dias. Presença obrigatória 100%.', 'treinamento', 'publicado', 'cargo', true, true)
ON CONFLICT DO NOTHING;

INSERT INTO emp_confidential_access_policies (role, access_level, description, is_active) VALUES
('compliance', 'admin', 'Acesso total canal confidencial - compliance', true),
('rh', 'escrita', 'Acesso escrita canal confidencial - RH restrito', true),
('diretoria', 'leitura', 'Acesso leitura canal confidencial - diretoria', true)
ON CONFLICT DO NOTHING;

-- audit_action
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_course_enroll';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_course_proof_upload';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_communication_publish';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_communication_read';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_hr_ticket_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_confidential_report';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_confidential_access';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

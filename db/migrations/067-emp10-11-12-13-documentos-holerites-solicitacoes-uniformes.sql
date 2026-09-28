-- EMP-10 envio documentos solicitados status pendente/em análise/aprovado/rejeitado motivo nova versão
-- EMP-11 holerites/informes/documentos próprios acesso privado histórico disponibilização fonte autorizada
-- EMP-12 férias afastamentos benefícios reembolsos solicitação anexos restritos aprovação prazo resposta
-- EMP-13 uniformes/EPI/equipamentos entrega recibo solicitação troca devolução

DO $$ BEGIN
  CREATE TYPE emp_doc_submission_status AS ENUM ('pendente','em_analise','aprovado','rejeitado','arquivado','cancelado','solicitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_self_request_type AS ENUM ('ferias','afastamento','beneficio','reembolso','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_self_request_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','cancelado','concluido','pendente','encerrado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_uniform_self_request_type AS ENUM ('entrega','substituicao','devolucao','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE emp_uniform_self_request_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','entregue','cancelado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EMP-10 documentos solicitados envio
CREATE TABLE IF NOT EXISTS emp_document_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  doc_type VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=3),
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  version INT NOT NULL DEFAULT 1,
  status emp_doc_submission_status NOT NULL DEFAULT 'pendente',
  rejection_reason TEXT,
  requested_by UUID,
  requested_by_id UUID,
  requested_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_by_id UUID,
  reviewed_at TIMESTAMPTZ,
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, doc_type, version)
);
CREATE INDEX IF NOT EXISTS emp_doc_sub_employee_idx ON emp_document_submissions(employee_id);
CREATE INDEX IF NOT EXISTS emp_doc_sub_type_idx ON emp_document_submissions(doc_type);
CREATE INDEX IF NOT EXISTS emp_doc_sub_status_idx ON emp_document_submissions(status);
CREATE INDEX IF NOT EXISTS emp_doc_sub_restricted_idx ON emp_document_submissions(is_restricted) WHERE is_restricted=true;

-- EMP-11 histórico disponibilização fonte autorizada e acesso privado
CREATE TABLE IF NOT EXISTS emp_document_availability_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES hr_payroll_documents(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES emp_document_submissions(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  made_available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  made_available_by UUID,
  made_available_by_id UUID,
  source_id UUID REFERENCES hr_payroll_sources(id),
  is_from_authorized_source BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_doc_avail_employee_idx ON emp_document_availability_history(employee_id);
CREATE INDEX IF NOT EXISTS emp_doc_avail_document_idx ON emp_document_availability_history(document_id);
CREATE INDEX IF NOT EXISTS emp_doc_avail_submission_idx ON emp_document_availability_history(submission_id);
CREATE INDEX IF NOT EXISTS emp_doc_avail_source_idx ON emp_document_availability_history(source_id);
CREATE INDEX IF NOT EXISTS emp_doc_avail_authorized_idx ON emp_document_availability_history(is_from_authorized_source) WHERE is_from_authorized_source=true;

CREATE TABLE IF NOT EXISTS emp_own_document_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  document_id UUID REFERENCES hr_payroll_documents(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES emp_document_submissions(id) ON DELETE SET NULL,
  doc_type VARCHAR(100) NOT NULL,
  competence VARCHAR(7) CHECK (competence ~ '^\d{4}-\d{2}$'),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash VARCHAR(128),
  user_agent_hash VARCHAR(128),
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_own_access_employee_idx ON emp_own_document_access_logs(employee_id);
CREATE INDEX IF NOT EXISTS emp_own_access_document_idx ON emp_own_document_access_logs(document_id);
CREATE INDEX IF NOT EXISTS emp_own_access_private_idx ON emp_own_document_access_logs(is_private) WHERE is_private=true;
CREATE INDEX IF NOT EXISTS emp_own_access_date_idx ON emp_own_document_access_logs(accessed_at);

-- EMP-12 férias/afastamentos/benefícios/reembolsos solicitação anexos restritos aprovação prazo resposta
CREATE TABLE IF NOT EXISTS emp_self_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  request_type emp_self_request_type NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'outro' CHECK (category IN ('ferias','afastamento','beneficio','reembolso','documento','uniforme','outro')),
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=5),
  description TEXT NOT NULL CHECK (LENGTH(description) >=10),
  status emp_self_request_status NOT NULL DEFAULT 'solicitado',
  due_date DATE,
  responsible_id UUID,
  responsible_name VARCHAR(200),
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  attachment_url TEXT,
  attachment_storage_key VARCHAR(500),
  approved_by UUID,
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  response_deadline DATE,
  responded_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_self_req_employee_idx ON emp_self_requests(employee_id);
CREATE INDEX IF NOT EXISTS emp_self_req_type_idx ON emp_self_requests(request_type);
CREATE INDEX IF NOT EXISTS emp_self_req_category_idx ON emp_self_requests(category);
CREATE INDEX IF NOT EXISTS emp_self_req_status_idx ON emp_self_requests(status);
CREATE INDEX IF NOT EXISTS emp_self_req_protocol_idx ON emp_self_requests(protocol);
CREATE INDEX IF NOT EXISTS emp_self_req_due_idx ON emp_self_requests(due_date);
CREATE INDEX IF NOT EXISTS emp_self_req_restricted_idx ON emp_self_requests(is_restricted) WHERE is_restricted=true;

CREATE TABLE IF NOT EXISTS emp_self_request_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES emp_self_requests(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (LENGTH(message) >=5),
  status emp_self_request_status,
  created_by UUID,
  created_by_id UUID,
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_self_follow_request_idx ON emp_self_request_followups(request_id);

-- EMP-13 uniformes/EPI/equipamentos entrega recibo solicitação troca devolução
CREATE TABLE IF NOT EXISTS emp_uniform_self_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  uniform_id UUID REFERENCES hr_uniform_catalog(id) ON DELETE SET NULL,
  request_type emp_uniform_self_request_type NOT NULL,
  reason TEXT NOT NULL CHECK (LENGTH(reason) >=10),
  size VARCHAR(50),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >=1 AND quantity <=100),
  status emp_uniform_self_request_status NOT NULL DEFAULT 'solicitado',
  due_date DATE,
  approved_by UUID,
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  delivery_id UUID REFERENCES hr_uniform_deliveries(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emp_uniform_self_employee_idx ON emp_uniform_self_requests(employee_id);
CREATE INDEX IF NOT EXISTS emp_uniform_self_uniform_idx ON emp_uniform_self_requests(uniform_id);
CREATE INDEX IF NOT EXISTS emp_uniform_self_type_idx ON emp_uniform_self_requests(request_type);
CREATE INDEX IF NOT EXISTS emp_uniform_self_status_idx ON emp_uniform_self_requests(status);
CREATE INDEX IF NOT EXISTS emp_uniform_self_protocol_idx ON emp_uniform_self_requests(protocol);

CREATE TABLE IF NOT EXISTS emp_uniform_receipt_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES hr_uniform_deliveries(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  receipt_signed BOOLEAN NOT NULL DEFAULT false,
  receipt_url TEXT,
  storage_key VARCHAR(500),
  signed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(delivery_id, employee_id)
);
CREATE INDEX IF NOT EXISTS emp_uniform_receipt_delivery_idx ON emp_uniform_receipt_confirmations(delivery_id);
CREATE INDEX IF NOT EXISTS emp_uniform_receipt_employee_idx ON emp_uniform_receipt_confirmations(employee_id);
CREATE INDEX IF NOT EXISTS emp_uniform_receipt_signed_idx ON emp_uniform_receipt_confirmations(receipt_signed) WHERE receipt_signed=true;

-- triggers
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION set_updated_at_emp10_13() RETURNS TRIGGER AS $f$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_emp_doc_sub_updated ON emp_document_submissions;
CREATE TRIGGER trg_emp_doc_sub_updated BEFORE UPDATE ON emp_document_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp10_13();

DROP TRIGGER IF EXISTS trg_emp_self_req_updated ON emp_self_requests;
CREATE TRIGGER trg_emp_self_req_updated BEFORE UPDATE ON emp_self_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp10_13();

DROP TRIGGER IF EXISTS trg_emp_uniform_self_updated ON emp_uniform_self_requests;
CREATE TRIGGER trg_emp_uniform_self_updated BEFORE UPDATE ON emp_uniform_self_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp10_13();

DROP TRIGGER IF EXISTS trg_emp_uniform_receipt_updated ON emp_uniform_receipt_confirmations;
CREATE TRIGGER trg_emp_uniform_receipt_updated BEFORE UPDATE ON emp_uniform_receipt_confirmations FOR EACH ROW EXECUTE FUNCTION set_updated_at_emp10_13();

-- seeds
INSERT INTO emp_document_submissions (employee_id, doc_type, title, file_url, version, status, is_restricted, notes)
SELECT id, 'rg', 'RG - Documento solicitado', 'https://example.com/rg.pdf', 1, 'pendente', true, 'Seed pendente para testes'
FROM hr_employees LIMIT 1
ON CONFLICT DO NOTHING;

-- audit_action
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_document_submit';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_document_review';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_own_doc_access';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_self_request_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_self_request_approve';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_uniform_self_request';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'emp_uniform_receipt_confirm';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

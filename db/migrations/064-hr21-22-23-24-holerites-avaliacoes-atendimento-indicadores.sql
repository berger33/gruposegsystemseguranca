-- HR-21 holerites/informes importados fonte autorizada vinculação inequívoca colaborador revisão antes publicar correção rastreada
-- HR-22 avaliações planos desenvolvimento critérios definidos acesso privado participação humana feedback cliente não vira punição automática
-- HR-23 atendimento interno fila responsável categoria prazo mensagens anexos saúde fora tickets genéricos
-- HR-24 indicadores quadro admissão faltas rotatividade férias documentos atendimento fórmula período explícitos

DO $$ BEGIN
  CREATE TYPE hr_payroll_doc_type AS ENUM ('holerite','informe_rendimentos','informe_contribuicao','comprovante_pagamento','recibo_ferias','informe_13','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_payroll_doc_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado','corrigido','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_payroll_source_type AS ENUM ('folha','contabilidade','fiscal','banco','rh','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_payroll_import_status AS ENUM ('pendente','em_processamento','concluido','falha','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_evaluation_type AS ENUM ('desempenho','experiencia','comportamental','tecnica','cliente_feedback','periodica','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_evaluation_status AS ENUM ('rascunho','em_avaliacao','concluida','arquivada','cancelada','em_revisao','aprovada','rejeitada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_development_status AS ENUM ('rascunho','em_andamento','concluido','cancelado','pendente','arquivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_support_category AS ENUM ('folha','ponto','beneficios','ferias','afastamento','documentos','uniforme','treinamento','saude','ti','operacional','rh','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_support_status AS ENUM ('aberto','em_atendimento','aguardando_colaborador','aguardando_rh','resolvido','encerrado','cancelado','pendente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_support_priority AS ENUM ('baixa','media','alta','critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hr_indicator_type AS ENUM ('quadro','admissao','faltas','rotatividade','ferias','documentos','atendimento','cobertura','horas_extras','absenteismo','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HR-21 sources
CREATE TABLE IF NOT EXISTS hr_payroll_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  type hr_payroll_source_type NOT NULL DEFAULT 'folha',
  contact_name VARCHAR(200),
  contact_email VARCHAR(320),
  is_authorized BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_payroll_sources_type_idx ON hr_payroll_sources(type);
CREATE INDEX IF NOT EXISTS hr_payroll_sources_authorized_idx ON hr_payroll_sources(is_authorized) WHERE is_authorized=true;

-- HR-21 imports
CREATE TABLE IF NOT EXISTS hr_payroll_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES hr_payroll_sources(id),
  competence VARCHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  file_name VARCHAR(300),
  file_url TEXT,
  storage_key VARCHAR(500),
  status hr_payroll_import_status NOT NULL DEFAULT 'pendente',
  total_records INT NOT NULL DEFAULT 0,
  processed_records INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  errors JSONB,
  imported_by UUID,
  imported_by_id UUID,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_payroll_imports_source_idx ON hr_payroll_imports(source_id);
CREATE INDEX IF NOT EXISTS hr_payroll_imports_competence_idx ON hr_payroll_imports(competence);
CREATE INDEX IF NOT EXISTS hr_payroll_imports_status_idx ON hr_payroll_imports(status);

-- HR-21 documents holerites/informes
CREATE TABLE IF NOT EXISTS hr_payroll_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID REFERENCES hr_payroll_imports(id) ON DELETE SET NULL,
  source_id UUID NOT NULL REFERENCES hr_payroll_sources(id),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  competence VARCHAR(7) NOT NULL CHECK (competence ~ '^\d{4}-\d{2}$'),
  doc_type hr_payroll_doc_type NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  status hr_payroll_doc_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1,
  is_restricted BOOLEAN NOT NULL DEFAULT true,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_by_id UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  correction_of_id UUID REFERENCES hr_payroll_documents(id),
  is_correction BOOLEAN NOT NULL DEFAULT false,
  correction_reason TEXT,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, doc_type, competence, version)
);
CREATE INDEX IF NOT EXISTS hr_payroll_docs_employee_idx ON hr_payroll_documents(employee_id);
CREATE INDEX IF NOT EXISTS hr_payroll_docs_competence_idx ON hr_payroll_documents(competence);
CREATE INDEX IF NOT EXISTS hr_payroll_docs_type_idx ON hr_payroll_documents(doc_type);
CREATE INDEX IF NOT EXISTS hr_payroll_docs_status_idx ON hr_payroll_documents(status);
CREATE INDEX IF NOT EXISTS hr_payroll_docs_import_idx ON hr_payroll_documents(import_id);
CREATE INDEX IF NOT EXISTS hr_payroll_docs_source_idx ON hr_payroll_documents(source_id);
CREATE INDEX IF NOT EXISTS hr_payroll_docs_restricted_idx ON hr_payroll_documents(is_restricted) WHERE is_restricted=true;
CREATE INDEX IF NOT EXISTS hr_payroll_docs_correction_idx ON hr_payroll_documents(correction_of_id) WHERE correction_of_id IS NOT NULL;

-- HR-22 evaluation criteria catalog
CREATE TABLE IF NOT EXISTS hr_evaluation_criteria_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (weight >=0 AND weight <=100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HR-22 evaluations
CREATE TABLE IF NOT EXISTS hr_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  evaluator_id UUID,
  evaluator_name VARCHAR(200) NOT NULL,
  evaluation_type hr_evaluation_type NOT NULL DEFAULT 'desempenho',
  period_start DATE,
  period_end DATE CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  criteria JSONB,
  criteria_details TEXT,
  score NUMERIC(5,2) CHECK (score IS NULL OR (score >=0 AND score <=100)),
  feedback TEXT CHECK (feedback IS NULL OR LENGTH(feedback) >=10),
  client_feedback_original TEXT,
  client_feedback_treated TEXT,
  is_human_participation BOOLEAN NOT NULL DEFAULT true CHECK (is_human_participation = true),
  is_auto_punishment BOOLEAN NOT NULL DEFAULT false CHECK (is_auto_punishment = false),
  is_private BOOLEAN NOT NULL DEFAULT true,
  status hr_evaluation_status NOT NULL DEFAULT 'rascunho',
  evaluated_at TIMESTAMPTZ,
  approved_by UUID,
  approved_by_id UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_evaluations_employee_idx ON hr_evaluations(employee_id);
CREATE INDEX IF NOT EXISTS hr_evaluations_type_idx ON hr_evaluations(evaluation_type);
CREATE INDEX IF NOT EXISTS hr_evaluations_status_idx ON hr_evaluations(status);
CREATE INDEX IF NOT EXISTS hr_evaluations_evaluator_idx ON hr_evaluations(evaluator_id);
CREATE INDEX IF NOT EXISTS hr_evaluations_period_idx ON hr_evaluations(period_start, period_end);
CREATE INDEX IF NOT EXISTS hr_evaluations_private_idx ON hr_evaluations(is_private) WHERE is_private=true;

-- HR-22 development plans
CREATE TABLE IF NOT EXISTS hr_development_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  evaluation_id UUID REFERENCES hr_evaluations(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  goal TEXT,
  start_date DATE,
  end_date DATE CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  status hr_development_status NOT NULL DEFAULT 'rascunho',
  responsible_id UUID,
  responsible_name VARCHAR(200),
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_dev_plans_employee_idx ON hr_development_plans(employee_id);
CREATE INDEX IF NOT EXISTS hr_dev_plans_evaluation_idx ON hr_development_plans(evaluation_id);
CREATE INDEX IF NOT EXISTS hr_dev_plans_status_idx ON hr_development_plans(status);

CREATE TABLE IF NOT EXISTS hr_development_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES hr_development_plans(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date DATE,
  status hr_development_status NOT NULL DEFAULT 'pendente',
  evidence_url TEXT,
  storage_key VARCHAR(500),
  completed_at TIMESTAMPTZ,
  responsible_name VARCHAR(200),
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_dev_actions_plan_idx ON hr_development_actions(plan_id);
CREATE INDEX IF NOT EXISTS hr_dev_actions_status_idx ON hr_development_actions(status);
CREATE INDEX IF NOT EXISTS hr_dev_actions_due_idx ON hr_development_actions(due_date);

-- HR-23 support tickets
CREATE TABLE IF NOT EXISTS hr_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(20) NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  category hr_support_category NOT NULL DEFAULT 'rh',
  priority hr_support_priority NOT NULL DEFAULT 'media',
  title VARCHAR(200) NOT NULL CHECK (LENGTH(title) >=5),
  description TEXT NOT NULL CHECK (LENGTH(description) >=10),
  status hr_support_status NOT NULL DEFAULT 'aberto',
  responsible_id UUID,
  responsible_name VARCHAR(200),
  due_date DATE,
  is_health_related BOOLEAN NOT NULL DEFAULT false,
  is_health_attachment_blocked BOOLEAN NOT NULL DEFAULT true,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  closed_by_id UUID,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_support_tickets_employee_idx ON hr_support_tickets(employee_id);
CREATE INDEX IF NOT EXISTS hr_support_tickets_category_idx ON hr_support_tickets(category);
CREATE INDEX IF NOT EXISTS hr_support_tickets_status_idx ON hr_support_tickets(status);
CREATE INDEX IF NOT EXISTS hr_support_tickets_responsible_idx ON hr_support_tickets(responsible_id);
CREATE INDEX IF NOT EXISTS hr_support_tickets_protocol_idx ON hr_support_tickets(protocol);
CREATE INDEX IF NOT EXISTS hr_support_tickets_health_idx ON hr_support_tickets(is_health_related) WHERE is_health_related=true;

CREATE TABLE IF NOT EXISTS hr_support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES hr_support_tickets(id) ON DELETE CASCADE,
  sender_id UUID,
  sender_name VARCHAR(200) NOT NULL,
  message TEXT NOT NULL CHECK (LENGTH(message) >=1),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  is_health_restricted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_support_messages_ticket_idx ON hr_support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS hr_support_messages_sender_idx ON hr_support_messages(sender_id);
CREATE INDEX IF NOT EXISTS hr_support_messages_health_idx ON hr_support_messages(is_health_restricted) WHERE is_health_restricted=true;

CREATE TABLE IF NOT EXISTS hr_support_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES hr_support_tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES hr_support_messages(id) ON DELETE SET NULL,
  file_name VARCHAR(300) NOT NULL,
  file_url TEXT NOT NULL,
  storage_key VARCHAR(500),
  is_health_restricted BOOLEAN NOT NULL DEFAULT false,
  is_medical BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID,
  uploaded_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_support_attachments_ticket_idx ON hr_support_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS hr_support_attachments_message_idx ON hr_support_attachments(message_id);
CREATE INDEX IF NOT EXISTS hr_support_attachments_health_idx ON hr_support_attachments(is_health_restricted) WHERE is_health_restricted=true;

-- HR-24 indicators
CREATE TABLE IF NOT EXISTS hr_indicator_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type hr_indicator_type NOT NULL,
  name VARCHAR(200) NOT NULL UNIQUE,
  formula TEXT NOT NULL CHECK (LENGTH(formula) >=10),
  description TEXT,
  source VARCHAR(200),
  unit VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_indicator_defs_type_idx ON hr_indicator_definitions(type);
CREATE INDEX IF NOT EXISTS hr_indicator_defs_active_idx ON hr_indicator_definitions(is_active) WHERE is_active=true;

CREATE TABLE IF NOT EXISTS hr_indicator_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES hr_indicator_definitions(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  competence VARCHAR(7) CHECK (competence ~ '^\d{4}-\d{2}$'),
  value NUMERIC(14,4) NOT NULL,
  formula_used TEXT NOT NULL CHECK (LENGTH(formula_used) >=10),
  source VARCHAR(200),
  is_estimate BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(definition_id, competence)
);
CREATE INDEX IF NOT EXISTS hr_indicator_snapshots_definition_idx ON hr_indicator_snapshots(definition_id);
CREATE INDEX IF NOT EXISTS hr_indicator_snapshots_period_idx ON hr_indicator_snapshots(period_start, period_end);
CREATE INDEX IF NOT EXISTS hr_indicator_snapshots_competence_idx ON hr_indicator_snapshots(competence);

-- triggers updated_at
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION set_updated_at_hr21_24() RETURNS TRIGGER AS $f$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_hr_payroll_sources_updated ON hr_payroll_sources;
CREATE TRIGGER trg_hr_payroll_sources_updated BEFORE UPDATE ON hr_payroll_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_payroll_imports_updated ON hr_payroll_imports;
CREATE TRIGGER trg_hr_payroll_imports_updated BEFORE UPDATE ON hr_payroll_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_payroll_documents_updated ON hr_payroll_documents;
CREATE TRIGGER trg_hr_payroll_documents_updated BEFORE UPDATE ON hr_payroll_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_evaluation_criteria_updated ON hr_evaluation_criteria_catalog;
CREATE TRIGGER trg_hr_evaluation_criteria_updated BEFORE UPDATE ON hr_evaluation_criteria_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_evaluations_updated ON hr_evaluations;
CREATE TRIGGER trg_hr_evaluations_updated BEFORE UPDATE ON hr_evaluations FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_dev_plans_updated ON hr_development_plans;
CREATE TRIGGER trg_hr_dev_plans_updated BEFORE UPDATE ON hr_development_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_dev_actions_updated ON hr_development_actions;
CREATE TRIGGER trg_hr_dev_actions_updated BEFORE UPDATE ON hr_development_actions FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_support_tickets_updated ON hr_support_tickets;
CREATE TRIGGER trg_hr_support_tickets_updated BEFORE UPDATE ON hr_support_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_support_messages_updated ON hr_support_messages;
CREATE TRIGGER trg_hr_support_messages_updated BEFORE UPDATE ON hr_support_messages FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

DROP TRIGGER IF EXISTS trg_hr_indicator_defs_updated ON hr_indicator_definitions;
CREATE TRIGGER trg_hr_indicator_defs_updated BEFORE UPDATE ON hr_indicator_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at_hr21_24();

-- seeds
INSERT INTO hr_payroll_sources (name, type, is_authorized, description) VALUES
('Folha Protheus', 'folha', true, 'Fonte autorizada folha principal'),
('Contabilidade Externa Contabiliza', 'contabilidade', true, 'Escritório contábil autorizado'),
('Banco Pagamento', 'banco', true, 'Banco para comprovantes')
ON CONFLICT (name) DO NOTHING;

INSERT INTO hr_evaluation_criteria_catalog (name, description, weight, is_active) VALUES
('Assiduidade', 'Comparecimento e pontualidade', 20, true),
('Qualidade Técnica', 'Execução técnica das atividades', 25, true),
('Comportamento', 'Postura e relacionamento', 15, true),
('Atendimento Cliente', 'Feedback cliente tratado sem punição automática', 15, true),
('Segurança', 'Cumprimento normas segurança', 25, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO hr_indicator_definitions (type, name, formula, description, source, unit, is_active) VALUES
('quadro', 'Quadro Ativo', 'COUNT(hr_employees WHERE status=ativo AND admission_date <= period_end)', 'Total colaboradores ativos no período', 'hr_employees', 'colaboradores', true),
('admissao', 'Taxa Admissão', '(admissoes_periodo / quadro_medio) * 100', 'Admissões no período sobre quadro médio', 'hr_employees admission_date', '%', true),
('faltas', 'Índice Faltas', '(total_faltas / (quadro * dias_uteis)) * 100', 'Faltas sobre dias úteis trabalháveis', 'hr_dp_variables/hr_time_entries', '%', true),
('rotatividade', 'Turnover', '((admissoes + desligamentos)/2 / quadro_medio) *100', 'Rotatividade mensal', 'hr_employees + hr_terminations', '%', true),
('ferias', 'Férias Vencidas', 'COUNT(hr_vacation_periods WHERE status=vencido AND concessivo_end < period_end)', 'Períodos aquisitivos vencidos', 'hr_vacation_periods', 'períodos', true),
('documentos', 'Pendência Documental', 'COUNT(hr_employee_dossiers WHERE status=pendente OR status=vencido)', 'Documentos pendentes ou vencidos', 'hr_employee_dossiers', 'documentos', true),
('atendimento', 'SLA Atendimento RH', '(atendimentos_resolvidos_no_prazo / total_atendimentos) *100', 'Atendimentos RH dentro do prazo', 'hr_support_tickets', '%', true)
ON CONFLICT (name) DO NOTHING;

-- audit_action additions
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_payroll_source_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_payroll_import_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_payroll_doc_publish';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_payroll_doc_correct';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_evaluation_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_evaluation_complete';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_dev_plan_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_support_ticket_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_support_message_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF to_regtype('audit_action') IS NULL THEN RETURN; END IF;
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'hr_indicator_snapshot_create';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

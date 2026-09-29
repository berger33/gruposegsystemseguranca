-- 071-ops05-06-07-08-cobertura-passagem-ocorrencia-checklist
-- OPS-05 ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação.
-- OPS-06 passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite.
-- OPS-07 livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação.
-- OPS-08 checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais.

-- Enums
DO $$ BEGIN CREATE TYPE ops_coverage_request_status AS ENUM ('aberto','em_busca','candidato_encontrado','aprovado','resolvido','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_candidate_availability AS ENUM ('disponivel','indisponivel','em_validacao','em_descanso','em_outro_posto'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_handover_status AS ENUM ('pendente','em_andamento','aceito','recusado','encerrado','cancelado','escalonado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_occurrence_category AS ENUM ('seguranca','operacional','manutencao','limpeza','comportamental','cliente','equipamento','acesso','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_occurrence_severity AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_occurrence_status AS ENUM ('aberto','em_analise','em_tratamento','resolvido','encerrado','cancelado','retificado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_checklist_frequency AS ENUM ('diaria','semanal','quinzenal','mensal','trimestral','sob_demanda','por_visita','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_checklist_status AS ENUM ('rascunho','ativo','arquivado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_checklist_instance_status AS ENUM ('pendente','em_andamento','concluido','cancelado','nao_aplicavel'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OPS-05: cobertura requests
CREATE TABLE IF NOT EXISTS ops_coverage_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id UUID REFERENCES ops_coverage_gaps(id) ON DELETE SET NULL,
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  absence_id UUID REFERENCES hr_absences(id) ON DELETE SET NULL,
  absence_notice_id UUID REFERENCES emp_absence_notices(id) ON DELETE SET NULL,
  status ops_coverage_request_status NOT NULL DEFAULT 'aberto',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  responsible_id TEXT,
  responsible_name TEXT CHECK (char_length(responsible_name) <= 200),
  decision_by TEXT,
  decision_at TIMESTAMPTZ,
  decision_reason TEXT CHECK (char_length(decision_reason) <= 1000),
  is_human_decision BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_cov_req_post ON ops_coverage_requests(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_cov_req_gap ON ops_coverage_requests(gap_id);
CREATE INDEX IF NOT EXISTS idx_ops_cov_req_status ON ops_coverage_requests(status);
CREATE INDEX IF NOT EXISTS idx_ops_cov_req_requested ON ops_coverage_requests(requested_at);

-- OPS-05: candidatos substituição
CREATE TABLE IF NOT EXISTS ops_substitution_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coverage_request_id UUID NOT NULL REFERENCES ops_coverage_requests(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
  availability_status ops_candidate_availability NOT NULL DEFAULT 'em_validacao',
  qualification_match BOOLEAN NOT NULL DEFAULT false,
  distance_km NUMERIC(6,2) CHECK (distance_km >= 0),
  score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100),
  is_selected BOOLEAN NOT NULL DEFAULT false,
  selected_at TIMESTAMPTZ,
  selected_by TEXT,
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(coverage_request_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_sub_cand_req ON ops_substitution_candidates(coverage_request_id);
CREATE INDEX IF NOT EXISTS idx_ops_sub_cand_employee ON ops_substitution_candidates(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_sub_cand_avail ON ops_substitution_candidates(availability_status);
CREATE INDEX IF NOT EXISTS idx_ops_sub_cand_selected ON ops_substitution_candidates(is_selected) WHERE is_selected = true;

-- OPS-05: comunicação cobertura
CREATE TABLE IF NOT EXISTS ops_coverage_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coverage_request_id UUID NOT NULL REFERENCES ops_coverage_requests(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('employee','supervisor','rh','outro')),
  recipient_id TEXT,
  recipient_name TEXT CHECK (char_length(recipient_name) <= 200),
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','sistema','outro')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_cov_comm_req ON ops_coverage_communications(coverage_request_id);
CREATE INDEX IF NOT EXISTS idx_ops_cov_comm_type ON ops_coverage_communications(recipient_type);

-- OPS-06: passagem plantão operacional
CREATE TABLE IF NOT EXISTS ops_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (char_length(protocol) BETWEEN 8 AND 30),
  from_post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  from_employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
  to_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  shift_template_id UUID REFERENCES ops_shift_templates(id) ON DELETE SET NULL,
  handover_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pending_tasks TEXT CHECK (char_length(pending_tasks) <= 5000),
  keys_handover JSONB NOT NULL DEFAULT '[]'::jsonb,
  equipment_handover JSONB NOT NULL DEFAULT '[]'::jsonb,
  occurrences_summary TEXT CHECK (char_length(occurrences_summary) <= 2000),
  status ops_handover_status NOT NULL DEFAULT 'pendente',
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT,
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  escalation_level INT NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 5),
  escalated_at TIMESTAMPTZ,
  escalated_to TEXT,
  is_private BOOLEAN NOT NULL DEFAULT true,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_handover_post ON ops_handovers(from_post_id);
CREATE INDEX IF NOT EXISTS idx_ops_handover_from_emp ON ops_handovers(from_employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_handover_to_emp ON ops_handovers(to_employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_handover_status ON ops_handovers(status);
CREATE INDEX IF NOT EXISTS idx_ops_handover_date ON ops_handovers(handover_date);
CREATE INDEX IF NOT EXISTS idx_ops_handover_protocol ON ops_handovers(protocol);

-- OPS-06: escalonamento não aceite
CREATE TABLE IF NOT EXISTS ops_handover_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id UUID NOT NULL REFERENCES ops_handovers(id) ON DELETE CASCADE,
  from_level INT NOT NULL CHECK (from_level >= 0),
  to_level INT NOT NULL CHECK (to_level >= 0),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  escalated_by TEXT,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_to TEXT CHECK (char_length(notified_to) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_handover_esc_handover ON ops_handover_escalations(handover_id);
CREATE INDEX IF NOT EXISTS idx_ops_handover_esc_to_level ON ops_handover_escalations(to_level);

-- OPS-07: livro ocorrências operacional
CREATE TABLE IF NOT EXISTS ops_occurrence_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (char_length(protocol) BETWEEN 8 AND 30),
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  category ops_occurrence_category NOT NULL DEFAULT 'operacional',
  severity ops_occurrence_severity NOT NULL DEFAULT 'media',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location TEXT CHECK (char_length(location) <= 500),
  status ops_occurrence_status NOT NULL DEFAULT 'aberto',
  responsible_id TEXT,
  responsible_name TEXT CHECK (char_length(responsible_name) <= 200),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT CHECK (char_length(resolution_notes) <= 2000),
  is_private BOOLEAN NOT NULL DEFAULT true,
  is_personal_data_restricted BOOLEAN NOT NULL DEFAULT false,
  retification_count INT NOT NULL DEFAULT 0 CHECK (retification_count >= 0),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_post ON ops_occurrence_book(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_employee ON ops_occurrence_book(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_category ON ops_occurrence_book(category);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_severity ON ops_occurrence_book(severity);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_status ON ops_occurrence_book(status);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_occurred ON ops_occurrence_book(occurred_at);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_protocol ON ops_occurrence_book(protocol);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_private ON ops_occurrence_book(is_private) WHERE is_private = true;

-- OPS-07: evidências privadas
CREATE TABLE IF NOT EXISTS ops_occurrence_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id UUID NOT NULL REFERENCES ops_occurrence_book(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT CHECK (char_length(storage_key) <= 500),
  is_private BOOLEAN NOT NULL DEFAULT true,
  is_personal_data_restricted BOOLEAN NOT NULL DEFAULT false,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_occ_evid_occ ON ops_occurrence_evidences(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_ops_occ_evid_private ON ops_occurrence_evidences(is_private) WHERE is_private = true;

-- OPS-07: ações
CREATE TABLE IF NOT EXISTS ops_occurrence_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id UUID NOT NULL REFERENCES ops_occurrence_book(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (char_length(action_type) BETWEEN 3 AND 100),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  responsible_name TEXT CHECK (char_length(responsible_name) <= 200),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  completed_at TIMESTAMPTZ,
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_occ_action_occ ON ops_occurrence_actions(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_ops_occ_action_status ON ops_occurrence_actions(status);

-- OPS-07: histórico imutável retificação
CREATE TABLE IF NOT EXISTS ops_occurrence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id UUID NOT NULL REFERENCES ops_occurrence_book(id) ON DELETE CASCADE,
  previous_status ops_occurrence_status,
  next_status ops_occurrence_status NOT NULL,
  previous_description TEXT,
  next_description TEXT,
  changed_by TEXT,
  reason TEXT CHECK (char_length(reason) <= 1000),
  is_retification BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_occ_hist_occ ON ops_occurrence_history(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_ops_occ_hist_next ON ops_occurrence_history(next_status);
CREATE INDEX IF NOT EXISTS idx_ops_occ_hist_ret ON ops_occurrence_history(is_retification) WHERE is_retification = true;

-- OPS-08: checklist templates
CREATE TABLE IF NOT EXISTS ops_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  service_type TEXT CHECK (char_length(service_type) <= 100),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  description TEXT CHECK (char_length(description) <= 2000),
  frequency ops_checklist_frequency NOT NULL DEFAULT 'diaria',
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  required_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status ops_checklist_status NOT NULL DEFAULT 'ativo',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(title, version)
);
CREATE INDEX IF NOT EXISTS idx_ops_check_tpl_company ON ops_checklist_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_check_tpl_service ON ops_checklist_templates(service_type);
CREATE INDEX IF NOT EXISTS idx_ops_check_tpl_freq ON ops_checklist_templates(frequency);
CREATE INDEX IF NOT EXISTS idx_ops_check_tpl_active ON ops_checklist_templates(is_active) WHERE is_active = true;

-- OPS-08: checklist instances
CREATE TABLE IF NOT EXISTS ops_checklist_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES ops_checklist_templates(id) ON DELETE CASCADE,
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  executed_at TIMESTAMPTZ,
  status ops_checklist_instance_status NOT NULL DEFAULT 'pendente',
  score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100),
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_check_inst_tpl ON ops_checklist_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_ops_check_inst_post ON ops_checklist_instances(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_check_inst_employee ON ops_checklist_instances(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_check_inst_date ON ops_checklist_instances(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_ops_check_inst_status ON ops_checklist_instances(status);

-- OPS-08: checklist items
CREATE TABLE IF NOT EXISTS ops_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ops_checklist_instances(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL CHECK (char_length(item_description) BETWEEN 3 AND 500),
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  evidence_url TEXT CHECK (char_length(evidence_url) <= 1000),
  notes TEXT CHECK (char_length(notes) <= 1000),
  checked_at TIMESTAMPTZ,
  checked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_check_item_inst ON ops_checklist_items(instance_id);
CREATE INDEX IF NOT EXISTS idx_ops_check_item_required ON ops_checklist_items(is_required) WHERE is_required = true;

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ops_cov_req_updated ON ops_coverage_requests;
CREATE TRIGGER trg_ops_cov_req_updated BEFORE UPDATE ON ops_coverage_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_sub_cand_updated ON ops_substitution_candidates;
CREATE TRIGGER trg_ops_sub_cand_updated BEFORE UPDATE ON ops_substitution_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_handovers_updated ON ops_handovers;
CREATE TRIGGER trg_ops_handovers_updated BEFORE UPDATE ON ops_handovers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_occ_book_updated ON ops_occurrence_book;
CREATE TRIGGER trg_ops_occ_book_updated BEFORE UPDATE ON ops_occurrence_book FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_occ_action_updated ON ops_occurrence_actions;
CREATE TRIGGER trg_ops_occ_action_updated BEFORE UPDATE ON ops_occurrence_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_check_tpl_updated ON ops_checklist_templates;
CREATE TRIGGER trg_ops_check_tpl_updated BEFORE UPDATE ON ops_checklist_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ops_check_inst_updated ON ops_checklist_instances;
CREATE TRIGGER trg_ops_check_inst_updated BEFORE UPDATE ON ops_checklist_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed checklist templates
INSERT INTO ops_checklist_templates (title, version, service_type, description, frequency, is_mandatory, required_items, status, is_active)
VALUES
('Checklist Portaria - Abertura', 1, 'portaria', 'Verificação abertura portaria: chaves, rádio, livro ocorrência, limpeza área', 'diaria', true, '[{"desc":"Chaves conferidas","required":true},{"desc":"Rádio testado","required":true},{"desc":"Livro ocorrência lido","required":true},{"desc":"Área limpa","required":false}]'::jsonb, 'ativo', true),
('Checklist Vigilância - Ronda', 1, 'vigilancia', 'Ronda por pontos de verificação: iluminação, portas, janelas, equipamentos', 'diaria', true, '[{"desc":"Pontos verificados","required":true},{"desc":"Iluminação OK","required":true},{"desc":"Portas trancadas","required":true},{"desc":"Evidência foto","required":false}]'::jsonb, 'ativo', true),
('Checklist Limpeza - Rotina', 1, 'limpeza', 'Rotina limpeza por ambiente: banheiros, corredores, salas, coleta lixo', 'diaria', false, '[{"desc":"Banheiros limpos","required":true},{"desc":"Corredores limpos","required":true},{"desc":"Lixo coletado","required":true},{"desc":"Consumo registrado","required":false}]'::jsonb, 'ativo', true)
ON CONFLICT (title, version) DO NOTHING;

SELECT 'Migration 071 OPS-05/06/07/08 cobertura passagem ocorrencia checklist applied' AS result;

-- 072-ops09-10-11-12-supervisao-ronda-chaves-relatorio
-- OPS-09 visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação.
-- OPS-10 rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/QR isolado não prova execução.
-- OPS-11 chaves, rádios, materiais e equipamentos com guarda/transferência/devolução.
-- OPS-12 relatórios periódicos ao cliente com revisão de conteúdo e privacidade.

-- Enums
DO $$ BEGIN CREATE TYPE ops_supervision_visit_status AS ENUM ('agendada','em_andamento','realizada','cancelada','atrasada','pendente_verificacao'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_inspection_type AS ENUM ('rotina','extraordinaria','cliente','interna','qualidade','seguranca','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_inspection_status AS ENUM ('pendente','em_andamento','concluida','reprovada','aprovada_com_ressalva','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_action_plan_status AS ENUM ('aberto','em_andamento','concluido','verificado','cancelado','atrasado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_action_plan_priority AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_patrol_status AS ENUM ('planejada','em_andamento','concluida','interrompida','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_patrol_point_status AS ENUM ('pendente','visitado','nao_visitado','fora_prazo','invalido','localizacao_indisponivel'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_patrol_replay_type AS ENUM ('duplicate_qr','too_fast','gps_jump','same_location','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_key_type AS ENUM ('chave','radio','equipamento','material','ferramenta','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_key_status AS ENUM ('disponivel','emprestada','devolvida','extraviada','em_manutencao','bloqueada','reservada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_key_movement_type AS ENUM ('retirada','devolucao','transferencia','bloqueio','desbloqueio','extravio','reserva','liberacao'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_client_report_type AS ENUM ('diario','semanal','mensal','extraordinario','ocorrencias','cobertura','supervisao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_client_report_status AS ENUM ('rascunho','em_revisao','aprovado','enviado','arquivado','rejeitado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OPS-09: visitas de supervisão
CREATE TABLE IF NOT EXISTS ops_supervision_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT UNIQUE NOT NULL CHECK (char_length(protocol) >= 8 AND char_length(protocol) <= 50),
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  supervisor_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  executed_at TIMESTAMPTZ,
  status ops_supervision_visit_status NOT NULL DEFAULT 'agendada',
  checklist_template_id UUID REFERENCES ops_checklist_templates(id) ON DELETE SET NULL,
  score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100),
  findings TEXT CHECK (char_length(findings) <= 5000),
  responsible_name TEXT CHECK (char_length(responsible_name) <= 200),
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  verification_notes TEXT CHECK (char_length(verification_notes) <= 2000),
  is_private BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (char_length(notes) <= 5000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_sup_visits_post ON ops_supervision_visits(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_sup_visits_company ON ops_supervision_visits(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_sup_visits_status ON ops_supervision_visits(status);
CREATE INDEX IF NOT EXISTS idx_ops_sup_visits_scheduled ON ops_supervision_visits(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_ops_sup_visits_supervisor ON ops_supervision_visits(supervisor_employee_id);

-- OPS-09: inspeções
CREATE TABLE IF NOT EXISTS ops_supervision_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES ops_supervision_visits(id) ON DELETE CASCADE,
  inspection_type ops_inspection_type NOT NULL DEFAULT 'rotina',
  status ops_inspection_status NOT NULL DEFAULT 'pendente',
  title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) >= 10 AND char_length(description) <= 5000),
  inspected_at TIMESTAMPTZ,
  inspector_name TEXT CHECK (char_length(inspector_name) <= 200),
  result TEXT CHECK (char_length(result) <= 2000),
  score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100),
  is_private BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_sup_inspections_visit ON ops_supervision_inspections(visit_id);
CREATE INDEX IF NOT EXISTS idx_ops_sup_inspections_type ON ops_supervision_inspections(inspection_type);
CREATE INDEX IF NOT EXISTS idx_ops_sup_inspections_status ON ops_supervision_inspections(status);

-- OPS-09: planos de ação com prazo, responsável e verificação
CREATE TABLE IF NOT EXISTS ops_supervision_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES ops_supervision_visits(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES ops_supervision_inspections(id) ON DELETE SET NULL,
  occurrence_id UUID REFERENCES ops_occurrence_book(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 200),
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  responsible_name TEXT NOT NULL CHECK (char_length(responsible_name) >= 2 AND char_length(responsible_name) <= 200),
  due_date DATE NOT NULL,
  status ops_action_plan_status NOT NULL DEFAULT 'aberto',
  priority ops_action_plan_priority NOT NULL DEFAULT 'media',
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  verification_notes TEXT CHECK (char_length(verification_notes) <= 2000),
  is_private BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_action_plan_dates CHECK (due_date IS NOT NULL),
  CONSTRAINT chk_ops_action_plan_ref CHECK (visit_id IS NOT NULL OR inspection_id IS NOT NULL OR occurrence_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ops_action_plans_visit ON ops_supervision_action_plans(visit_id);
CREATE INDEX IF NOT EXISTS idx_ops_action_plans_inspection ON ops_supervision_action_plans(inspection_id);
CREATE INDEX IF NOT EXISTS idx_ops_action_plans_occurrence ON ops_supervision_action_plans(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_ops_action_plans_status ON ops_supervision_action_plans(status);
CREATE INDEX IF NOT EXISTS idx_ops_action_plans_due ON ops_supervision_action_plans(due_date);
CREATE INDEX IF NOT EXISTS idx_ops_action_plans_priority ON ops_supervision_action_plans(priority);

-- OPS-10: rondas
CREATE TABLE IF NOT EXISTS ops_patrols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT UNIQUE NOT NULL CHECK (char_length(protocol) >= 8 AND char_length(protocol) <= 50),
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  patrol_date DATE NOT NULL,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  status ops_patrol_status NOT NULL DEFAULT 'planejada',
  route_name TEXT CHECK (char_length(route_name) <= 200),
  is_private BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (char_length(notes) <= 5000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_patrol_planned CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end > planned_start),
  CONSTRAINT chk_ops_patrol_actual CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start)
);
CREATE INDEX IF NOT EXISTS idx_ops_patrols_post ON ops_patrols(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_patrols_employee ON ops_patrols(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_patrols_date ON ops_patrols(patrol_date);
CREATE INDEX IF NOT EXISTS idx_ops_patrols_status ON ops_patrols(status);

-- OPS-10: pontos de verificação com prevenção replay
CREATE TABLE IF NOT EXISTS ops_patrol_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patrol_id UUID NOT NULL REFERENCES ops_patrols(id) ON DELETE CASCADE,
  point_name TEXT NOT NULL CHECK (char_length(point_name) >= 3 AND char_length(point_name) <= 200),
  expected_time TIMESTAMPTZ,
  actual_time TIMESTAMPTZ,
  latitude NUMERIC(10,7) CHECK (latitude >= -90 AND latitude <= 90),
  longitude NUMERIC(10,7) CHECK (longitude >= -180 AND longitude <= 180),
  qr_code TEXT CHECK (char_length(qr_code) <= 500),
  status ops_patrol_point_status NOT NULL DEFAULT 'pendente',
  is_replay_detected BOOLEAN NOT NULL DEFAULT false,
  replay_reason TEXT CHECK (char_length(replay_reason) <= 1000),
  evidence_url TEXT CHECK (char_length(evidence_url) <= 1000),
  storage_key TEXT CHECK (char_length(storage_key) <= 500),
  location_unavailable BOOLEAN NOT NULL DEFAULT false,
  location_unavailable_reason TEXT CHECK (char_length(location_unavailable_reason) <= 1000),
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  verification_notes TEXT CHECK (char_length(verification_notes) <= 1000),
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_patrol_points_patrol ON ops_patrol_points(patrol_id);
CREATE INDEX IF NOT EXISTS idx_ops_patrol_points_status ON ops_patrol_points(status);
CREATE INDEX IF NOT EXISTS idx_ops_patrol_points_expected ON ops_patrol_points(expected_time);
CREATE INDEX IF NOT EXISTS idx_ops_patrol_points_qr ON ops_patrol_points(qr_code) WHERE qr_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_patrol_points_replay ON ops_patrol_points(is_replay_detected) WHERE is_replay_detected = true;

-- OPS-10: logs de replay para auditoria
CREATE TABLE IF NOT EXISTS ops_patrol_replay_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id UUID NOT NULL REFERENCES ops_patrol_points(id) ON DELETE CASCADE,
  patrol_id UUID NOT NULL REFERENCES ops_patrols(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  qr_code TEXT CHECK (char_length(qr_code) <= 500),
  is_replay BOOLEAN NOT NULL DEFAULT false,
  replay_type ops_patrol_replay_type,
  details TEXT CHECK (char_length(details) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_replay_logs_point ON ops_patrol_replay_logs(point_id);
CREATE INDEX IF NOT EXISTS idx_ops_replay_logs_patrol ON ops_patrol_replay_logs(patrol_id);
CREATE INDEX IF NOT EXISTS idx_ops_replay_logs_replay ON ops_patrol_replay_logs(is_replay) WHERE is_replay = true;

-- OPS-11: chaves, rádios, materiais e equipamentos
CREATE TABLE IF NOT EXISTS ops_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL CHECK (char_length(code) >= 3 AND char_length(code) <= 100),
  description TEXT NOT NULL CHECK (char_length(description) >= 5 AND char_length(description) <= 500),
  key_type ops_key_type NOT NULL DEFAULT 'chave',
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  current_holder_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  status ops_key_status NOT NULL DEFAULT 'disponivel',
  location TEXT CHECK (char_length(location) <= 200),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_keys_code ON ops_keys(code);
CREATE INDEX IF NOT EXISTS idx_ops_keys_post ON ops_keys(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_keys_holder ON ops_keys(current_holder_employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_keys_status ON ops_keys(status);
CREATE INDEX IF NOT EXISTS idx_ops_keys_type ON ops_keys(key_type);

-- OPS-11: movimentações guarda/transferência/devolução
CREATE TABLE IF NOT EXISTS ops_key_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES ops_keys(id) ON DELETE CASCADE,
  movement_type ops_key_movement_type NOT NULL,
  from_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  to_employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  from_post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  to_post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_date TIMESTAMPTZ,
  actual_return_date TIMESTAMPTZ,
  authorized_by TEXT CHECK (char_length(authorized_by) <= 200),
  reason TEXT NOT NULL CHECK (char_length(reason) >= 10 AND char_length(reason) <= 1000),
  is_private BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_key_mov_key ON ops_key_movements(key_id);
CREATE INDEX IF NOT EXISTS idx_ops_key_mov_type ON ops_key_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_ops_key_mov_date ON ops_key_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_ops_key_mov_from_emp ON ops_key_movements(from_employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_key_mov_to_emp ON ops_key_movements(to_employee_id);

-- OPS-12: relatórios periódicos ao cliente com revisão conteúdo e privacidade
CREATE TABLE IF NOT EXISTS ops_client_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT UNIQUE NOT NULL CHECK (char_length(protocol) >= 8 AND char_length(protocol) <= 50),
  company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  report_type ops_client_report_type NOT NULL DEFAULT 'mensal',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 200),
  content TEXT NOT NULL CHECK (char_length(content) >= 20 AND char_length(content) <= 10000),
  status ops_client_report_status NOT NULL DEFAULT 'rascunho',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT CHECK (char_length(review_notes) <= 2000),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  is_private BOOLEAN NOT NULL DEFAULT false,
  contains_personal_data BOOLEAN NOT NULL DEFAULT false,
  privacy_reviewed_by TEXT,
  privacy_reviewed_at TIMESTAMPTZ,
  privacy_review_notes TEXT CHECK (char_length(privacy_review_notes) <= 2000),
  is_approved_for_client BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_report_period CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_ops_client_reports_company ON ops_client_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_client_reports_contract ON ops_client_reports(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_client_reports_post ON ops_client_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_client_reports_type ON ops_client_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_ops_client_reports_status ON ops_client_reports(status);
CREATE INDEX IF NOT EXISTS idx_ops_client_reports_period ON ops_client_reports(period_start, period_end);

CREATE TABLE IF NOT EXISTS ops_client_report_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES ops_client_reports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) >= 1 AND char_length(file_name) <= 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) >= 5 AND char_length(file_url) <= 1000),
  storage_key TEXT CHECK (char_length(storage_key) <= 500),
  description TEXT CHECK (char_length(description) <= 1000),
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_personal_data_restricted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_report_attachments_report ON ops_client_report_attachments(report_id);

CREATE TABLE IF NOT EXISTS ops_client_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES ops_client_reports(id) ON DELETE CASCADE,
  previous_status ops_client_report_status,
  next_status ops_client_report_status NOT NULL,
  changed_by TEXT,
  reason TEXT CHECK (char_length(reason) <= 1000),
  is_privacy_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_report_history_report ON ops_client_report_history(report_id);
CREATE INDEX IF NOT EXISTS idx_ops_report_history_next ON ops_client_report_history(next_status);

-- Triggers updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_ops_supervision_updated_at') THEN
    CREATE OR REPLACE FUNCTION update_ops_supervision_updated_at() RETURNS TRIGGER AS $f$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_ops_sup_visits_updated ON ops_supervision_visits;
CREATE TRIGGER trg_ops_sup_visits_updated BEFORE UPDATE ON ops_supervision_visits FOR EACH ROW EXECUTE FUNCTION update_ops_supervision_updated_at();
DROP TRIGGER IF EXISTS trg_ops_sup_inspections_updated ON ops_supervision_inspections;
CREATE TRIGGER trg_ops_sup_inspections_updated BEFORE UPDATE ON ops_supervision_inspections FOR EACH ROW EXECUTE FUNCTION update_ops_supervision_updated_at();
DROP TRIGGER IF EXISTS trg_ops_action_plans_updated ON ops_supervision_action_plans;
CREATE TRIGGER trg_ops_action_plans_updated BEFORE UPDATE ON ops_supervision_action_plans FOR EACH ROW EXECUTE FUNCTION update_ops_supervision_updated_at();
DROP TRIGGER IF EXISTS trg_ops_patrols_updated ON ops_patrols;
CREATE TRIGGER trg_ops_patrols_updated BEFORE UPDATE ON ops_patrols FOR EACH ROW EXECUTE FUNCTION update_ops_supervision_updated_at();
DROP TRIGGER IF EXISTS trg_ops_patrol_points_updated ON ops_patrol_points;
CREATE TRIGGER trg_ops_patrol_points_updated BEFORE UPDATE ON ops_patrol_points FOR EACH ROW EXECUTE FUNCTION update_ops_supervision_updated_at();
DROP TRIGGER IF EXISTS trg_ops_keys_updated ON ops_keys;
CREATE TRIGGER trg_ops_keys_updated BEFORE UPDATE ON ops_keys FOR EACH ROW EXECUTE FUNCTION update_ops_supervision_updated_at();
DROP TRIGGER IF EXISTS trg_ops_client_reports_updated ON ops_client_reports;
CREATE TRIGGER trg_ops_client_reports_updated BEFORE UPDATE ON ops_client_reports FOR EACH ROW EXECUTE FUNCTION update_ops_supervision_updated_at();

-- Imutabilidade history
CREATE OR REPLACE FUNCTION prevent_ops_report_history_update_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ops_client_report_history is immutable';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ops_report_history_immutable ON ops_client_report_history;
CREATE TRIGGER trg_ops_report_history_immutable BEFORE UPDATE OR DELETE ON ops_client_report_history FOR EACH ROW EXECUTE FUNCTION prevent_ops_report_history_update_delete();

-- Seeds
INSERT INTO ops_keys (code, description, key_type, status, location)
VALUES
  ('CHV-001', 'Chave principal portaria bloco A', 'chave', 'disponivel', 'Portaria Bloco A'),
  ('RAD-001', 'Rádio comunicador supervisão', 'radio', 'disponivel', 'Base supervisão'),
  ('EQP-001', 'Lanterna tática', 'equipamento', 'disponivel', 'Almoxarifado')
ON CONFLICT (code) DO NOTHING;

-- Audit log entries types
-- ops_supervision_visit_create/update/verify, inspection_create/update, action_plan_create/update/verify, patrol_create/update, patrol_point_create/verify/replay_detected, key_create/movement, client_report_create/review/approve/send/privacy_review

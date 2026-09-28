-- 073-ops13-14-15-16-metricas-escalas-limpeza-monitoramento
-- OPS-13 métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela.
-- OPS-14 escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar.
-- OPS-15 supervisão de limpeza com rotinas por ambiente, consumo e não conformidades.
-- OPS-16 eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto específico.

-- Enums
DO $$ BEGIN CREATE TYPE ops_metric_type AS ENUM ('cobertura','tempo_descoberto','incidentes','visitas','reincidencia','sla','absenteismo','turnover','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_metric_window AS ENUM ('diario','semanal','mensal','trimestral','anual','personalizado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_metric_source AS ENUM ('escala','cobertura','ocorrencia','supervisao','ronda','checklist','manual','sistema','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_metric_status AS ENUM ('rascunho','calculado','validado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_assisted_schedule_status AS ENUM ('rascunho','em_analise','com_conflitos','aprovado','rejeitado','publicado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_assisted_entry_status AS ENUM ('proposto','em_conflito','aprovado','rejeitado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_cleaning_environment_type AS ENUM ('banheiro','escritorio','corredor','copa','recepcao','area_externa','estacionamento','deposito','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_cleaning_routine_frequency AS ENUM ('diaria','semanal','quinzenal','mensal','sob_demanda','por_turno','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_cleaning_routine_type AS ENUM ('limpeza','desinfeccao','reposicao','inspecao','manutencao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_cleaning_execution_status AS ENUM ('pendente','em_andamento','concluida','nao_realizada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_cleaning_nonconformity_status AS ENUM ('aberta','em_tratamento','resolvida','reincidente','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_cleaning_nonconformity_severity AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_monitoring_connector_type AS ENUM ('cftv','alarme','controle_acesso','sensor','botao_panico','api_externa','manual','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_monitoring_connector_status AS ENUM ('ativo','inativo','falha','configurando'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_monitoring_event_type AS ENUM ('intrusao','falha_equipamento','porta_aberta','movimento','panico','ronda_nao_realizada','ocorrencia_critica','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_monitoring_event_severity AS ENUM ('info','baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ops_monitoring_event_status AS ENUM ('pendente','reconhecido','em_tratamento','escalonado','resolvido','arquivado','falso_positivo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OPS-13 métricas definições fonte janela
CREATE TABLE IF NOT EXISTS ops_metrics_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 200),
  metric_type ops_metric_type NOT NULL,
  source ops_metric_source NOT NULL,
  window_type ops_metric_window NOT NULL,
  description TEXT CHECK (char_length(description) <= 2000),
  calculation_formula TEXT CHECK (char_length(calculation_formula) <= 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_def_type ON ops_metrics_definitions(metric_type);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_def_source ON ops_metrics_definitions(source);

CREATE TABLE IF NOT EXISTS ops_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES ops_metrics_definitions(id) ON DELETE SET NULL,
  metric_type ops_metric_type NOT NULL,
  source ops_metric_source NOT NULL,
  window_type ops_metric_window NOT NULL,
  status ops_metric_status NOT NULL DEFAULT 'calculado',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value NUMERIC(14,2) NOT NULL,
  unit TEXT CHECK (char_length(unit) <= 50),
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by TEXT,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_metrics_period CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_snap_def ON ops_metrics_snapshots(definition_id);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_snap_type ON ops_metrics_snapshots(metric_type);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_snap_period ON ops_metrics_snapshots(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_snap_post ON ops_metrics_snapshots(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_snap_company ON ops_metrics_snapshots(company_id);

CREATE TABLE IF NOT EXISTS ops_metrics_reincidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  metric_type ops_metric_type NOT NULL DEFAULT 'reincidencia',
  first_occurrence_id UUID REFERENCES ops_occurrence_book(id) ON DELETE SET NULL,
  last_occurrence_id UUID REFERENCES ops_occurrence_book(id) ON DELETE SET NULL,
  occurrence_count INT NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  first_date DATE NOT NULL,
  last_date DATE NOT NULL,
  days_between INT GENERATED ALWAYS AS (last_date - first_date) STORED,
  is_reincidence BOOLEAN NOT NULL DEFAULT false,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_reinc_dates CHECK (last_date >= first_date)
);
CREATE INDEX IF NOT EXISTS idx_ops_reinc_post ON ops_metrics_reincidence(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_reinc_type ON ops_metrics_reincidence(metric_type);
CREATE INDEX IF NOT EXISTS idx_ops_reinc_dates ON ops_metrics_reincidence(first_date, last_date);

-- OPS-14 escalas assistidas/automáticas com conflitos revisão humana antes publicar
CREATE TABLE IF NOT EXISTS ops_assisted_schedule_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT UNIQUE NOT NULL CHECK (char_length(protocol) >= 8 AND char_length(protocol) <= 50),
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  base_version_id UUID REFERENCES ops_schedule_versions(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status ops_assisted_schedule_status NOT NULL DEFAULT 'rascunho',
  generated_by TEXT,
  generation_rules JSONB,
  conflicts JSONB,
  motives TEXT CHECK (char_length(motives) <= 5000),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  is_human_reviewed BOOLEAN NOT NULL DEFAULT false,
  published_version_id UUID REFERENCES ops_schedule_versions(id) ON DELETE SET NULL,
  notes TEXT CHECK (char_length(notes) <= 5000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_assisted_period CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_company ON ops_assisted_schedule_proposals(company_id);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_status ON ops_assisted_schedule_proposals(status);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_period ON ops_assisted_schedule_proposals(period_start, period_end);

CREATE TABLE IF NOT EXISTS ops_assisted_schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES ops_assisted_schedule_proposals(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  shift_template_id UUID REFERENCES ops_shift_templates(id) ON DELETE SET NULL,
  role_id UUID REFERENCES ops_job_roles(id) ON DELETE SET NULL,
  status ops_assisted_entry_status NOT NULL DEFAULT 'proposto',
  conflict_type TEXT CHECK (char_length(conflict_type) <= 100),
  conflict_details JSONB,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_entries_proposal ON ops_assisted_schedule_entries(proposal_id);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_entries_post ON ops_assisted_schedule_entries(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_entries_employee ON ops_assisted_schedule_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_entries_date ON ops_assisted_schedule_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_entries_valid ON ops_assisted_schedule_entries(is_valid) WHERE is_valid = false;

CREATE TABLE IF NOT EXISTS ops_assisted_schedule_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES ops_assisted_schedule_proposals(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES ops_assisted_schedule_entries(id) ON DELETE SET NULL,
  conflict_type TEXT NOT NULL CHECK (char_length(conflict_type) >= 3 AND char_length(conflict_type) <= 100),
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  severity TEXT CHECK (char_length(severity) <= 20),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolution_notes TEXT CHECK (char_length(resolution_notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_conflicts_proposal ON ops_assisted_schedule_conflicts(proposal_id);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_conflicts_entry ON ops_assisted_schedule_conflicts(entry_id);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_conflicts_resolved ON ops_assisted_schedule_conflicts(resolved) WHERE resolved = false;

-- OPS-15 supervisão limpeza rotinas por ambiente consumo não conformidades
CREATE TABLE IF NOT EXISTS ops_cleaning_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES ops_posts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 200),
  environment_type ops_cleaning_environment_type NOT NULL DEFAULT 'outro',
  area_m2 NUMERIC(8,2) CHECK (area_m2 >= 0),
  description TEXT CHECK (char_length(description) <= 2000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_clean_env_post ON ops_cleaning_environments(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_env_type ON ops_cleaning_environments(environment_type);

CREATE TABLE IF NOT EXISTS ops_cleaning_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES ops_cleaning_environments(id) ON DELETE CASCADE,
  routine_type ops_cleaning_routine_type NOT NULL DEFAULT 'limpeza',
  frequency ops_cleaning_routine_frequency NOT NULL DEFAULT 'diaria',
  title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  mandatory_items JSONB,
  estimated_duration_minutes INT CHECK (estimated_duration_minutes >= 0 AND estimated_duration_minutes <= 1440),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_clean_rout_env ON ops_cleaning_routines(environment_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_rout_type ON ops_cleaning_routines(routine_type);
CREATE INDEX IF NOT EXISTS idx_ops_clean_rout_freq ON ops_cleaning_routines(frequency);

CREATE TABLE IF NOT EXISTS ops_cleaning_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES ops_cleaning_routines(id) ON DELETE CASCADE,
  environment_id UUID NOT NULL REFERENCES ops_cleaning_environments(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status ops_cleaning_execution_status NOT NULL DEFAULT 'pendente',
  score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100),
  consumption_description TEXT CHECK (char_length(consumption_description) <= 1000),
  consumption_quantity NUMERIC(10,2) CHECK (consumption_quantity >= 0),
  nonconformity_count INT NOT NULL DEFAULT 0 CHECK (nonconformity_count >= 0),
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_clean_exec_routine ON ops_cleaning_executions(routine_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_exec_env ON ops_cleaning_executions(environment_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_exec_employee ON ops_cleaning_executions(employee_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_exec_status ON ops_cleaning_executions(status);
CREATE INDEX IF NOT EXISTS idx_ops_clean_exec_executed ON ops_cleaning_executions(executed_at);

CREATE TABLE IF NOT EXISTS ops_cleaning_nonconformities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES ops_cleaning_executions(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES ops_cleaning_environments(id) ON DELETE SET NULL,
  routine_id UUID REFERENCES ops_cleaning_routines(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (char_length(type) >= 3 AND char_length(type) <= 100),
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  severity ops_cleaning_nonconformity_severity NOT NULL DEFAULT 'media',
  status ops_cleaning_nonconformity_status NOT NULL DEFAULT 'aberta',
  responsible_name TEXT CHECK (char_length(responsible_name) <= 200),
  due_date DATE,
  resolved_at TIMESTAMPTZ,
  is_reincidence BOOLEAN NOT NULL DEFAULT false,
  related_nonconformity_id UUID REFERENCES ops_cleaning_nonconformities(id) ON DELETE SET NULL,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_clean_nc_exec ON ops_cleaning_nonconformities(execution_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_nc_env ON ops_cleaning_nonconformities(environment_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_nc_status ON ops_cleaning_nonconformities(status);
CREATE INDEX IF NOT EXISTS idx_ops_clean_nc_severity ON ops_cleaning_nonconformities(severity);
CREATE INDEX IF NOT EXISTS idx_ops_clean_nc_reinc ON ops_cleaning_nonconformities(is_reincidence) WHERE is_reincidence = true;

-- OPS-16 eventos monitoramento via conector fila reconhecimento escalonamento; não construir substituto central 24h ou armazenar vídeo sem projeto específico
CREATE TABLE IF NOT EXISTS ops_monitoring_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 200),
  connector_type ops_monitoring_connector_type NOT NULL DEFAULT 'outro',
  status ops_monitoring_connector_status NOT NULL DEFAULT 'configurando',
  config_sanitized JSONB,
  last_event_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  error_sanitized TEXT CHECK (char_length(error_sanitized) <= 2000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_mon_conn_type ON ops_monitoring_connectors(connector_type);
CREATE INDEX IF NOT EXISTS idx_ops_mon_conn_status ON ops_monitoring_connectors(status);

CREATE TABLE IF NOT EXISTS ops_monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT UNIQUE NOT NULL CHECK (char_length(protocol) >= 8 AND char_length(protocol) <= 50),
  connector_id UUID REFERENCES ops_monitoring_connectors(id) ON DELETE SET NULL,
  event_type ops_monitoring_event_type NOT NULL,
  severity ops_monitoring_event_severity NOT NULL DEFAULT 'media',
  post_id UUID REFERENCES ops_posts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB,
  status ops_monitoring_event_status NOT NULL DEFAULT 'pendente',
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  is_escalated BOOLEAN NOT NULL DEFAULT false,
  escalation_level INT NOT NULL DEFAULT 0 CHECK (escalation_level >= 0 AND escalation_level <= 5),
  notes TEXT CHECK (char_length(notes) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_mon_event_no_video CHECK (payload IS NULL OR (payload::text NOT ILIKE '%video%' OR payload::text ILIKE '%video_sem_projeto_nao_armazenado%'))
);
CREATE INDEX IF NOT EXISTS idx_ops_mon_events_connector ON ops_monitoring_events(connector_id);
CREATE INDEX IF NOT EXISTS idx_ops_mon_events_type ON ops_monitoring_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ops_mon_events_severity ON ops_monitoring_events(severity);
CREATE INDEX IF NOT EXISTS idx_ops_mon_events_status ON ops_monitoring_events(status);
CREATE INDEX IF NOT EXISTS idx_ops_mon_events_post ON ops_monitoring_events(post_id);
CREATE INDEX IF NOT EXISTS idx_ops_mon_events_occurred ON ops_monitoring_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_ops_mon_events_received ON ops_monitoring_events(received_at);

CREATE TABLE IF NOT EXISTS ops_monitoring_event_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES ops_monitoring_events(id) ON DELETE CASCADE,
  previous_status ops_monitoring_event_status,
  next_status ops_monitoring_event_status NOT NULL,
  changed_by TEXT,
  reason TEXT CHECK (char_length(reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_mon_event_hist_event ON ops_monitoring_event_history(event_id);

CREATE TABLE IF NOT EXISTS ops_monitoring_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES ops_monitoring_events(id) ON DELETE CASCADE,
  from_level INT NOT NULL CHECK (from_level >= 0),
  to_level INT NOT NULL CHECK (to_level >= 0 AND to_level <= 5),
  reason TEXT NOT NULL CHECK (char_length(reason) >= 10 AND char_length(reason) <= 1000),
  escalated_by TEXT,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalated_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ops_mon_esc_level CHECK (to_level > from_level)
);
CREATE INDEX IF NOT EXISTS idx_ops_mon_esc_event ON ops_monitoring_escalations(event_id);
CREATE INDEX IF NOT EXISTS idx_ops_mon_esc_level ON ops_monitoring_escalations(to_level);

-- Triggers updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_ops_metrics_updated_at') THEN
    CREATE OR REPLACE FUNCTION update_ops_metrics_updated_at() RETURNS TRIGGER AS $f$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $f$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_ops_metrics_def_updated ON ops_metrics_definitions;
CREATE TRIGGER trg_ops_metrics_def_updated BEFORE UPDATE ON ops_metrics_definitions FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();
DROP TRIGGER IF EXISTS trg_ops_assisted_proposals_updated ON ops_assisted_schedule_proposals;
CREATE TRIGGER trg_ops_assisted_proposals_updated BEFORE UPDATE ON ops_assisted_schedule_proposals FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();
DROP TRIGGER IF EXISTS trg_ops_clean_env_updated ON ops_cleaning_environments;
CREATE TRIGGER trg_ops_clean_env_updated BEFORE UPDATE ON ops_cleaning_environments FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();
DROP TRIGGER IF EXISTS trg_ops_clean_rout_updated ON ops_cleaning_routines;
CREATE TRIGGER trg_ops_clean_rout_updated BEFORE UPDATE ON ops_cleaning_routines FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();
DROP TRIGGER IF EXISTS trg_ops_clean_exec_updated ON ops_cleaning_executions;
CREATE TRIGGER trg_ops_clean_exec_updated BEFORE UPDATE ON ops_cleaning_executions FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();
DROP TRIGGER IF EXISTS trg_ops_clean_nc_updated ON ops_cleaning_nonconformities;
CREATE TRIGGER trg_ops_clean_nc_updated BEFORE UPDATE ON ops_cleaning_nonconformities FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();
DROP TRIGGER IF EXISTS trg_ops_mon_conn_updated ON ops_monitoring_connectors;
CREATE TRIGGER trg_ops_mon_conn_updated BEFORE UPDATE ON ops_monitoring_connectors FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();
DROP TRIGGER IF EXISTS trg_ops_mon_events_updated ON ops_monitoring_events;
CREATE TRIGGER trg_ops_mon_events_updated BEFORE UPDATE ON ops_monitoring_events FOR EACH ROW EXECUTE FUNCTION update_ops_metrics_updated_at();

-- Imutabilidade history
CREATE OR REPLACE FUNCTION prevent_ops_mon_event_history_update_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ops_monitoring_event_history is immutable';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_ops_mon_event_hist_immutable ON ops_monitoring_event_history;
CREATE TRIGGER trg_ops_mon_event_hist_immutable BEFORE UPDATE OR DELETE ON ops_monitoring_event_history FOR EACH ROW EXECUTE FUNCTION prevent_ops_mon_event_history_update_delete();

-- Seeds métricas
INSERT INTO ops_metrics_definitions (name, metric_type, source, window_type, description, calculation_formula)
VALUES
  ('Cobertura por Posto Mensal', 'cobertura', 'escala', 'mensal', 'Horas cobertas / horas requeridas por posto no mês', 'cobertura = horas_cobertas / horas_requeridas * 100'),
  ('Tempo Descoberto Semanal', 'tempo_descoberto', 'cobertura', 'semanal', 'Minutos descoberto por posto na semana', 'sum(uncovered_minutes)'),
  ('Incidentes por Cliente Mensal', 'incidentes', 'ocorrencia', 'mensal', 'Total ocorrências por cliente no mês', 'count(ocorrencias)'),
  ('Visitas Supervisão Mensal', 'visitas', 'supervisao', 'mensal', 'Visitas supervisão realizadas por mês', 'count(visitas)'),
  ('Reincidência Ocorrências', 'reincidencia', 'ocorrencia', 'mensal', 'Ocorrências reincidentes mesmo posto/categoria', 'count where is_reincidence true')
ON CONFLICT (name) DO NOTHING;

INSERT INTO ops_monitoring_connectors (name, connector_type, status, config_sanitized)
VALUES
  ('Conector Manual Eventos', 'manual', 'ativo', '{"modo":"manual","video":"video_sem_projeto_nao_armazenado - não armazena vídeo"}'),
  ('Conector API Externa Simulado', 'api_externa', 'configurando', '{"endpoint":"https://example.com/events","video":"video_sem_projeto_nao_armazenado"}')
ON CONFLICT (name) DO NOTHING;

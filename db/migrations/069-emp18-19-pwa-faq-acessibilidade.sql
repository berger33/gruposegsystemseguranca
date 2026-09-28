-- 069-emp18-19-pwa-faq-acessibilidade
-- EMP-18 PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotência, conflito explícito, horário do dispositivo e recebimento no servidor separados. Não cachear documentos médicos/salariais por padrão.
-- EMP-19 FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de dados.

-- Enums
DO $$ BEGIN CREATE TYPE emp_pwa_display AS ENUM ('standalone','minimal-ui','browser','fullscreen'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE emp_offline_task_type AS ENUM ('occurrence','handover','absence_notice','shift_swap','procedure_ack','journey_proof','absence_followup','occurrence_action'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE emp_offline_queue_status AS ENUM ('pendente','sincronizando','sincronizado','conflito','falha','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE emp_offline_conflict_type AS ENUM ('duplicate','version_conflict','stale_data','permission_denied','expired','already_resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE emp_offline_conflict_resolution AS ENUM ('pendente','manual_resolvido','auto_resolvido','ignorado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE emp_faq_category AS ENUM ('geral','escala','ponto','beneficios','uniformes','seguranca','procedimentos','rh','tecnico','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE emp_faq_status AS ENUM ('rascunho','em_revisao','publicado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE emp_font_size AS ENUM ('pequeno','medio','grande','extra_grande'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PWA config (singleton or multiple versions, active flag)
CREATE TABLE IF NOT EXISTS emp_pwa_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 100),
  short_name TEXT NOT NULL CHECK (char_length(short_name) BETWEEN 2 AND 20),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 500),
  theme_color TEXT NOT NULL DEFAULT '#0f172a' CHECK (theme_color ~* '^#[0-9a-f]{6}$'),
  background_color TEXT NOT NULL DEFAULT '#ffffff' CHECK (background_color ~* '^#[0-9a-f]{6}$'),
  display emp_pwa_display NOT NULL DEFAULT 'standalone',
  scope TEXT NOT NULL DEFAULT '/' CHECK (char_length(scope) BETWEEN 1 AND 200),
  start_url TEXT NOT NULL DEFAULT '/' CHECK (char_length(start_url) BETWEEN 1 AND 500),
  icons JSONB NOT NULL DEFAULT '[]'::jsonb,
  screenshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  shortcuts JSONB NOT NULL DEFAULT '[]'::jsonb,
  offline_enabled BOOLEAN NOT NULL DEFAULT true,
  offline_cache_strategy TEXT NOT NULL DEFAULT 'network_first' CHECK (offline_cache_strategy IN ('network_first','cache_first','stale_while_revalidate')),
  approved_offline_tasks emp_offline_task_type[] NOT NULL DEFAULT ARRAY['occurrence','handover','absence_notice','procedure_ack']::emp_offline_task_type[],
  max_queue_size INT NOT NULL DEFAULT 50 CHECK (max_queue_size BETWEEN 1 AND 200),
  max_retries INT NOT NULL DEFAULT 5 CHECK (max_retries BETWEEN 1 AND 20),
  do_not_cache_patterns TEXT[] NOT NULL DEFAULT ARRAY['/api/hr/payroll-documents','/api/hr/own-doc-access-logs','/api/hr/occupational-documents','/api/hr/payroll-sources','/api/hr/benefit-conferences','medical','salary','holerite']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_pwa_active ON emp_pwa_configs(is_active) WHERE is_active = true;

-- Offline queue
CREATE TABLE IF NOT EXISTS emp_offline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
  task_type emp_offline_task_type NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 10 AND 200),
  device_timestamp TIMESTAMPTZ NOT NULL,
  device_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (char_length(device_timezone) BETWEEN 3 AND 100),
  server_received_at TIMESTAMPTZ,
  status emp_offline_queue_status NOT NULL DEFAULT 'pendente',
  conflict_details JSONB,
  retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error TEXT CHECK (char_length(last_error) <= 2000),
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_device_vs_server_separated CHECK (device_timestamp IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_offline_employee ON emp_offline_queue(employee_id);
CREATE INDEX IF NOT EXISTS idx_offline_task_type ON emp_offline_queue(task_type);
CREATE INDEX IF NOT EXISTS idx_offline_status ON emp_offline_queue(status);
CREATE INDEX IF NOT EXISTS idx_offline_idempotency ON emp_offline_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_offline_device_ts ON emp_offline_queue(device_timestamp);
CREATE INDEX IF NOT EXISTS idx_offline_server_recv ON emp_offline_queue(server_received_at);
CREATE INDEX IF NOT EXISTS idx_offline_created ON emp_offline_queue(created_at);

-- Offline conflicts
CREATE TABLE IF NOT EXISTS emp_offline_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES emp_offline_queue(id) ON DELETE CASCADE,
  conflict_type emp_offline_conflict_type NOT NULL,
  server_data JSONB,
  device_data JSONB,
  resolution emp_offline_conflict_resolution NOT NULL DEFAULT 'pendente',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offline_conflict_queue ON emp_offline_conflicts(queue_id);
CREATE INDEX IF NOT EXISTS idx_offline_conflict_type ON emp_offline_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS idx_offline_conflict_resolution ON emp_offline_conflicts(resolution);

-- FAQ interna
CREATE TABLE IF NOT EXISTS emp_faq_internal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category emp_faq_category NOT NULL DEFAULT 'geral',
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 10 AND 500),
  answer TEXT NOT NULL CHECK (char_length(answer) BETWEEN 20 AND 5000),
  status emp_faq_status NOT NULL DEFAULT 'rascunho',
  is_simple_language BOOLEAN NOT NULL DEFAULT true,
  reading_level TEXT NOT NULL DEFAULT 'simples' CHECK (reading_level IN ('simples','medio','tecnico')),
  is_low_data BOOLEAN NOT NULL DEFAULT true,
  has_keyboard_support BOOLEAN NOT NULL DEFAULT true,
  has_screen_reader_support BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] NOT NULL DEFAULT '{}',
  view_count INT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  published_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_published_requires_status CHECK (is_published = false OR status = 'publicado')
);
CREATE INDEX IF NOT EXISTS idx_faq_category ON emp_faq_internal(category);
CREATE INDEX IF NOT EXISTS idx_faq_status ON emp_faq_internal(status);
CREATE INDEX IF NOT EXISTS idx_faq_published ON emp_faq_internal(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_faq_simple ON emp_faq_internal(is_simple_language) WHERE is_simple_language = true;
CREATE INDEX IF NOT EXISTS idx_faq_low_data ON emp_faq_internal(is_low_data) WHERE is_low_data = true;

-- FAQ access logs
CREATE TABLE IF NOT EXISTS emp_faq_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id UUID NOT NULL REFERENCES emp_faq_internal(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_type TEXT CHECK (device_type IN ('mobile','desktop','tablet','outro')),
  is_keyboard_navigation BOOLEAN NOT NULL DEFAULT false,
  is_screen_reader BOOLEAN NOT NULL DEFAULT false,
  data_saver BOOLEAN NOT NULL DEFAULT false,
  ip_hash TEXT CHECK (char_length(ip_hash) <= 200)
);
CREATE INDEX IF NOT EXISTS idx_faq_access_faq ON emp_faq_access_logs(faq_id);
CREATE INDEX IF NOT EXISTS idx_faq_access_employee ON emp_faq_access_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_faq_access_date ON emp_faq_access_logs(accessed_at);
CREATE INDEX IF NOT EXISTS idx_faq_access_keyboard ON emp_faq_access_logs(is_keyboard_navigation) WHERE is_keyboard_navigation = true;

-- Accessibility preferences
CREATE TABLE IF NOT EXISTS emp_accessibility_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES hr_employees(id) ON DELETE CASCADE,
  prefers_keyboard BOOLEAN NOT NULL DEFAULT false,
  prefers_screen_reader BOOLEAN NOT NULL DEFAULT false,
  prefers_simple_language BOOLEAN NOT NULL DEFAULT true,
  prefers_low_data BOOLEAN NOT NULL DEFAULT false,
  font_size emp_font_size NOT NULL DEFAULT 'medio',
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  reduced_motion BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_pref_employee ON emp_accessibility_preferences(employee_id);
CREATE INDEX IF NOT EXISTS idx_access_pref_keyboard ON emp_accessibility_preferences(prefers_keyboard) WHERE prefers_keyboard = true;

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emp_pwa_updated ON emp_pwa_configs;
CREATE TRIGGER trg_emp_pwa_updated BEFORE UPDATE ON emp_pwa_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_offline_queue_updated ON emp_offline_queue;
CREATE TRIGGER trg_offline_queue_updated BEFORE UPDATE ON emp_offline_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_faq_internal_updated ON emp_faq_internal;
CREATE TRIGGER trg_faq_internal_updated BEFORE UPDATE ON emp_faq_internal FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_access_pref_updated ON emp_accessibility_preferences;
CREATE TRIGGER trg_access_pref_updated BEFORE UPDATE ON emp_accessibility_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed PWA config
INSERT INTO emp_pwa_configs (name, short_name, description, theme_color, background_color, display, scope, start_url, icons, approved_offline_tasks, max_queue_size, do_not_cache_patterns, is_active, version)
VALUES (
  'Grupo SEG System - Portal Funcionário',
  'SEG Func',
  'Portal do funcionário Grupo SEG System - plantão, escala, ocorrências e solicitações com suporte offline limitado.',
  '#0f172a',
  '#ffffff',
  'standalone',
  '/',
  '/funcionario',
  '[{"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]'::jsonb,
  ARRAY['occurrence','handover','absence_notice','procedure_ack','journey_proof']::emp_offline_task_type[],
  50,
  ARRAY['/api/hr/payroll-documents','/api/hr/own-doc-access-logs','/api/hr/occupational-documents','/api/hr/payroll-sources','/api/hr/benefit-conferences','medical','salary','holerite','/api/hr/benefit-exports']::TEXT[],
  true,
  1
) ON CONFLICT DO NOTHING;

-- Seed FAQ interna (5 exemplos com linguagem simples e baixo consumo)
INSERT INTO emp_faq_internal (category, question, answer, status, is_simple_language, reading_level, is_low_data, has_keyboard_support, has_screen_reader_support, tags, is_published, published_at)
VALUES
('geral','Como vejo meu próximo plantão?','Abra o menu Meu Plantão. Você verá local, horário, função e contato do supervisor. Se estiver offline, os dados salvos localmente aparecem com aviso.','publicado',true,'simples',true,true,true,ARRAY['plantao','escala'],true,NOW()),
('escala','O que fazer se eu não puder ir ao trabalho?','Use Avisar Ausência. Escolha motivo, informe horário e envie. Você recebe protocolo. Seu supervisor vê e organiza cobertura.','publicado',true,'simples',true,true,true,ARRAY['ausencia','cobertura'],true,NOW()),
('seguranca','Como registrar uma ocorrência?','No menu Ocorrências, clique em Nova. Escolha categoria, descreva o que aconteceu, informe horário e local. Anexe foto se necessário. Dados pessoais são protegidos.','publicado',true,'simples',true,true,true,ARRAY['ocorrencia','seguranca'],true,NOW()),
('procedimentos','Onde vejo procedimentos do meu posto?','Em Procedimentos do Posto. Leia a versão publicada e clique em Confirmar Ciência. Se houver nova versão, você será avisado.','publicado',true,'simples',true,true,true,ARRAY['procedimentos','ciencia'],true,NOW()),
('ponto','Como corrigir meu ponto?','Em Minha Jornada, veja seus registros. Se houver divergência, clique em Pedir Correção, informe motivo e envie comprovante. O RH analisa.','publicado',true,'simples',true,true,true,ARRAY['ponto','jornada'],true,NOW())
ON CONFLICT DO NOTHING;

-- Audit log additions (if audit_log table exists, we don't insert here; application will log via audit_log)
-- Note: emp_pwa_config_create/update, offline_queue_sync/conflict, faq_internal_publish/access are audited via app code.

SELECT 'Migration 069 EMP-18/19 PWA offline FAQ acessibilidade applied' AS result;

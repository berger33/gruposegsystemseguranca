-- AI RAG específico por perfil: cliente, RH, Marcelo admin + Ollama Qwen3 1.7B + modo atendimento bot sem IA / bot com IA / WhatsApp, padrão bot com IA para beta

DO $$ BEGIN CREATE TYPE ai_rag_scope AS ENUM ('cliente','rh','marcelo','publico'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_rag_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_bot_mode AS ENUM ('sem_ia','com_ia','whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_bot_session_status AS ENUM ('fila','em_processamento','respondido','erro','cancelado','redirecionado_whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_model_type AS ENUM ('ollama_qwen3_1_7b','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RAG indexes separados por área pertinente
CREATE TABLE IF NOT EXISTS ai_rag_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_key TEXT NOT NULL UNIQUE CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  scope ai_rag_scope NOT NULL,
  model_type ai_model_type NOT NULL DEFAULT 'ollama_qwen3_1_7b',
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b' CHECK (char_length(model_name) BETWEEN 3 AND 100),
  ollama_host TEXT NOT NULL DEFAULT 'http://localhost:11434' CHECK (char_length(ollama_host) BETWEEN 10 AND 500),
  max_queue_size INT NOT NULL DEFAULT 100 CHECK (max_queue_size BETWEEN 10 AND 1000),
  max_tokens INT NOT NULL DEFAULT 2048 CHECK (max_tokens BETWEEN 256 AND 8192),
  temperature NUMERIC NOT NULL DEFAULT 0.7 CHECK (temperature >=0 AND temperature <=2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  status ai_rag_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_by_name TEXT CHECK (approved_by_name IS NULL OR char_length(approved_by_name) BETWEEN 2 AND 200),
  approved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approved_requires_approver CHECK (is_approved = false OR approved_by_identity IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ai_rag_indexes_scope_idx ON ai_rag_indexes(scope);
CREATE INDEX IF NOT EXISTS ai_rag_indexes_active_idx ON ai_rag_indexes(is_active) WHERE is_active = true;

-- Documentos por RAG, apenas área pertinente
CREATE TABLE IF NOT EXISTS ai_rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_index_id UUID NOT NULL REFERENCES ai_rag_indexes(id) ON DELETE CASCADE,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 500),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 20 AND 20000),
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 3 AND 500),
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','faq','procedimento','contrato_template','politica','comunicado','outro')),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  is_price_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_coverage_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_license_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_deadline_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  status ai_rag_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  embedding_status TEXT NOT NULL DEFAULT 'pendente' CHECK (embedding_status IN ('pendente','processando','concluido','erro')),
  token_count INT CHECK (token_count IS NULL OR token_count BETWEEN 1 AND 10000),
  approved_by_identity UUID REFERENCES auth_identities(id),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rag_key_matches_index CHECK (true) -- lógica aplicativa valida rag_key = index rag_key
);
CREATE INDEX IF NOT EXISTS ai_rag_docs_index_idx ON ai_rag_documents(rag_index_id);
CREATE INDEX IF NOT EXISTS ai_rag_docs_rag_key_idx ON ai_rag_documents(rag_key);
CREATE INDEX IF NOT EXISTS ai_rag_docs_published_idx ON ai_rag_documents(is_published) WHERE is_published = true;

-- Chunks para RAG
CREATE TABLE IF NOT EXISTS ai_rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES ai_rag_documents(id) ON DELETE CASCADE,
  rag_index_id UUID NOT NULL REFERENCES ai_rag_indexes(id) ON DELETE CASCADE,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  chunk_index INT NOT NULL CHECK (chunk_index >=0),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 5000),
  token_count INT NOT NULL CHECK (token_count BETWEEN 1 AND 2000),
  embedding_vector JSONB, -- placeholder para vetor, Ollama embedding será via API externa, não armazenar segredo
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS ai_rag_chunks_doc_idx ON ai_rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS ai_rag_chunks_rag_idx ON ai_rag_chunks(rag_index_id, rag_key);

-- Queries RAG com controle fila Ollama Qwen3 1.7B
CREATE TABLE IF NOT EXISTS ai_rag_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^RAG-[A-Z]+-[0-9]{8}-[A-Z0-9]{4}$'),
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  rag_index_id UUID REFERENCES ai_rag_indexes(id) ON DELETE SET NULL,
  query TEXT NOT NULL CHECK (char_length(query) BETWEEN 5 AND 2000),
  response TEXT CHECK (response IS NULL OR char_length(response) BETWEEN 1 AND 10000),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  ollama_host TEXT NOT NULL DEFAULT 'http://localhost:11434',
  latency_ms INT CHECK (latency_ms IS NULL OR latency_ms >=0),
  queue_position INT CHECK (queue_position IS NULL OR queue_position >=0),
  queue_wait_ms INT CHECK (queue_wait_ms IS NULL OR queue_wait_ms >=0),
  is_invented_price BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_price = false),
  is_invented_coverage BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_coverage = false),
  is_invented_license BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_license = false),
  is_invented_deadline BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_deadline = false),
  is_human_handoff_suggested BOOLEAN NOT NULL DEFAULT false,
  user_kind TEXT CHECK (user_kind IS NULL OR char_length(user_kind) BETWEEN 2 AND 50),
  user_identity UUID REFERENCES auth_identities(id),
  visitor_name TEXT CHECK (visitor_name IS NULL OR char_length(visitor_name) BETWEEN 2 AND 100),
  origin TEXT CHECK (origin IS NULL OR char_length(origin) BETWEEN 3 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_rag_queries_rag_key_idx ON ai_rag_queries(rag_key, created_at);
CREATE INDEX IF NOT EXISTS ai_rag_queries_protocol_idx ON ai_rag_queries(protocol);

-- Configuração modos bot: sem IA / com IA / WhatsApp, padrão com IA para beta
CREATE TABLE IF NOT EXISTS ai_bot_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_key ai_bot_mode NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 100),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_id INT NOT NULL UNIQUE CHECK (singleton_id = 1),
  active_mode ai_bot_mode NOT NULL DEFAULT 'sem_ia',
  whatsapp_number TEXT CHECK (whatsapp_number IS NULL OR char_length(whatsapp_number) BETWEEN 10 AND 20),
  whatsapp_message_template TEXT CHECK (whatsapp_message_template IS NULL OR char_length(whatsapp_message_template) BETWEEN 10 AND 1000),
  is_dev_mode BOOLEAN NOT NULL DEFAULT true,
  is_beta_mode BOOLEAN NOT NULL DEFAULT true,
  default_rag_key TEXT NOT NULL DEFAULT 'publico' CHECK (default_rag_key IN ('cliente','rh','marcelo','publico')),
  ollama_host TEXT NOT NULL DEFAULT 'http://localhost:11434',
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  max_queue_size INT NOT NULL DEFAULT 100 CHECK (max_queue_size BETWEEN 10 AND 1000),
  queue_timeout_ms INT NOT NULL DEFAULT 30000 CHECK (queue_timeout_ms BETWEEN 5000 AND 120000),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id),
  updated_by_identity UUID REFERENCES auth_identities(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessões bot com fila Ollama
CREATE TABLE IF NOT EXISTS ai_bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^BOT-[A-Z0-9]{2}-[0-9]{8}-[A-Z0-9]{4}$'),
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  mode ai_bot_mode NOT NULL DEFAULT 'com_ia',
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  query TEXT NOT NULL CHECK (char_length(query) BETWEEN 5 AND 2000),
  response TEXT CHECK (response IS NULL OR char_length(response) BETWEEN 1 AND 10000),
  status ai_bot_session_status NOT NULL DEFAULT 'fila',
  queue_position INT CHECK (queue_position IS NULL OR queue_position >=0),
  queue_wait_ms INT CHECK (queue_wait_ms IS NULL OR queue_wait_ms >=0),
  is_queued BOOLEAN NOT NULL DEFAULT true,
  is_whatsapp_redirect BOOLEAN NOT NULL DEFAULT false,
  whatsapp_number TEXT CHECK (whatsapp_number IS NULL OR char_length(whatsapp_number) BETWEEN 10 AND 20),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_ms INT CHECK (latency_ms IS NULL OR latency_ms >=0),
  is_invented_price BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_price = false),
  is_invented_coverage BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_coverage = false),
  is_invented_license BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_license = false),
  is_invented_deadline BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_deadline = false),
  visitor_name TEXT CHECK (visitor_name IS NULL OR char_length(visitor_name) BETWEEN 2 AND 100),
  origin TEXT CHECK (origin IS NULL OR char_length(origin) BETWEEN 3 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_bot_sessions_status_idx ON ai_bot_sessions(status);
CREATE INDEX IF NOT EXISTS ai_bot_sessions_rag_idx ON ai_bot_sessions(rag_key);
CREATE INDEX IF NOT EXISTS ai_bot_sessions_protocol_idx ON ai_bot_sessions(protocol);

-- Histórico imutável bot config
CREATE TABLE IF NOT EXISTS ai_bot_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES ai_bot_config(id) ON DELETE CASCADE,
  previous_mode ai_bot_mode,
  next_mode ai_bot_mode NOT NULL,
  previous_rag_key TEXT,
  next_rag_key TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Histórico RAG
CREATE TABLE IF NOT EXISTS ai_rag_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_index_id UUID NOT NULL REFERENCES ai_rag_indexes(id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  previous_version INT,
  next_version INT NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_ai_rag_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_rag_indexes_updated ON ai_rag_indexes;
CREATE TRIGGER trg_ai_rag_indexes_updated BEFORE UPDATE ON ai_rag_indexes FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();

DROP TRIGGER IF EXISTS trg_ai_rag_docs_updated ON ai_rag_documents;
CREATE TRIGGER trg_ai_rag_docs_updated BEFORE UPDATE ON ai_rag_documents FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();

DROP TRIGGER IF EXISTS trg_ai_bot_config_updated ON ai_bot_config;
CREATE TRIGGER trg_ai_bot_config_updated BEFORE UPDATE ON ai_bot_config FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();

DROP TRIGGER IF EXISTS trg_ai_bot_sessions_updated ON ai_bot_sessions;
CREATE TRIGGER trg_ai_bot_sessions_updated BEFORE UPDATE ON ai_bot_sessions FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();

-- Seeds modos bot
INSERT INTO ai_bot_modes (mode_key, name, description, is_active)
VALUES
('sem_ia', 'Chatbot sem IA', 'Bot baseado em regras aprovadas, sem LLM, sem invenção preço/cobertura/licença/prazo, com transferência humana quando sensível. Usa pub_faq_assisted_rules.', true),
('com_ia', 'Chatbot com IA (Ollama Qwen3 1.7B)', 'Bot com IA RAG separado por perfil cliente/RH/Marcelo, modelo Ollama Qwen3 1.7B, fila para garantir atendimento, base aprovada apenas área pertinente, sem invenção preço/cobertura/licença/prazo.', false),
('whatsapp', 'Redirecionamento WhatsApp', 'Redireciona atendimento para WhatsApp com número configurado e mensagem template, sem bot, preserva protocolo e origem.', false)
ON CONFLICT (mode_key) DO NOTHING;

-- Configuração beta sintética; integração Ollama não aprovada/ativada automaticamente
INSERT INTO ai_bot_config (singleton_id, active_mode, whatsapp_number, whatsapp_message_template, is_dev_mode, is_beta_mode, default_rag_key, ollama_host, model_name, max_queue_size, queue_timeout_ms, is_approved)
VALUES
(1, 'sem_ia', '551134372217', 'Olá, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}. Gostaria de atendimento humano.', true, true, 'publico', 'http://localhost:11434', 'qwen3:1.7b', 100, 30000, false)
ON CONFLICT (singleton_id) DO NOTHING;

-- Índices por perfil apenas em rascunho; publicação exige revisão/identidade autorizada.
INSERT INTO ai_rag_indexes (rag_key, name, description, scope, model_type, model_name, ollama_host, max_queue_size, max_tokens, temperature, is_active, is_approved, is_published, status)
VALUES
('cliente', 'RAG Cliente — Portal Cliente', 'RAG específico para cliente no módulo de cliente, informações apenas das áreas pertinentes a cliente: contratos, documentos, chamados, agenda, financeiro quando habilitado, procedimentos posto, sem dados RH/saúde/salário. Modelo Ollama Qwen3 1.7B fila.', 'cliente', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, false, false, false, 'rascunho'),
('rh', 'RAG RH — Módulo RH Andreia', 'RAG específico para RH no módulo de RH, informações apenas áreas pertinentes RH: cadastro profissional, admissão, férias, benefícios, treinamentos, avaliações, sem expor salário detalhado fora escopo, sem dados cliente. Modelo Ollama Qwen3 1.7B fila.', 'rh', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, false, false, false, 'rascunho'),
('marcelo', 'RAG Marcelo — Administração', 'RAG específico para administrador Marcelo, visão gestão negócio, indicadores, aprovações, comercial, operacional, financeiro, sem segredos técnicos ou saúde irrestrita, sem dados pessoais sensíveis. Modelo Ollama Qwen3 1.7B fila.', 'marcelo', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, false, false, false, 'rascunho'),
('publico', 'RAG Público — Site', 'RAG público site, informações apenas áreas pertinentes públicas: serviços validados, segmentos, FAQ revisada, contato claro, sem preço fictício, sem cobertura/licença/prazo inventado, com transferência humana. Modelo Ollama Qwen3 1.7B fila, padrão beta com IA.', 'publico', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, false, false, false, 'rascunho')
ON CONFLICT (rag_key) DO NOTHING;

-- Não semear documentos descritivos como base aprovada: afirmações de métricas,
-- integração, papéis e homologação exigem fontes/evidências verificadas.

-- 175-ai-rag-hybrid-embeddings.sql
-- PR 1 — Recuperação híbrida (semântica + lexical) com embeddings reais.
-- Aditiva. Não altera migrações anteriores; respeita o escopo já decido
-- em 095/096/173/174 (grants ativos, is_approved + is_published, papel).
-- Vetor armazenado em real[] (portável). O caminho pgvector (ANN/HNSW)
-- só é exercitado quando a extensão está instalada — ver src/server/
-- ai-rag-retrieval.mjs (vector_backend declarado na resposta).

-- Função update_ai_rag_updated_at() foi criada por 095; aqui só recriamos
-- o gatilho para as novas tabelas, em SQL idempotente.
DROP TRIGGER IF EXISTS trg_ai_rag_chunk_embeddings_updated ON ai_rag_chunk_embeddings;
CREATE TABLE IF NOT EXISTS ai_rag_chunk_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES ai_rag_chunks(id) ON DELETE CASCADE,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('publico','cliente','rh','marcelo')),
  model_name TEXT NOT NULL CHECK (char_length(model_name) BETWEEN 3 AND 100),
  model_digest TEXT,
  dimensions INT NOT NULL CHECK (dimensions BETWEEN 16 AND 4096),
  content_checksum TEXT NOT NULL CHECK (content_checksum ~ '^[0-9a-f]{64}$'),
  embedding REAL[],
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','gerado','erro')),
  error_code TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_rag_chunk_embeddings_gerado_com_vetor
    CHECK (status <> 'gerado' OR (embedding IS NOT NULL AND generated_at IS NOT NULL)),
  CONSTRAINT ai_rag_chunk_embeddings_vetor_dim
    CHECK (embedding IS NULL OR array_length(embedding, 1) = dimensions)
);
CREATE TRIGGER trg_ai_rag_chunk_embeddings_updated
  BEFORE UPDATE ON ai_rag_chunk_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();
CREATE INDEX IF NOT EXISTS ai_rag_chunk_embeddings_rag_status_idx
  ON ai_rag_chunk_embeddings (rag_key, status);

-- Ledger de respostas. Protocolo canônico: ^RAG-[A-Z]{2,4}-[0-9]{8}-[A-Z0-9]{4}$
-- (mesmo formato aceito pelo CHECK legado de ai_rag_queries.protocol).
-- Persistido antes do modelo ser chamado — usado para feedback e métricas.
CREATE TABLE IF NOT EXISTS ai_rag_answer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^RAG-[A-Z]{2,4}-[0-9]{8}-[A-Z0-9]{4}$'),
  rag_key TEXT NOT NULL CHECK (rag_key IN ('publico','cliente','rh','marcelo')),
  client_account_id UUID REFERENCES client_accounts(id),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('visitor','client','staff')),
  actor_identity UUID REFERENCES auth_identities(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('answered','no_source','ai_unavailable','error')),
  retrieval_mode TEXT CHECK (retrieval_mode IN ('hybrid','lexical_only')),
  vector_backend TEXT CHECK (vector_backend IS NULL OR vector_backend IN ('pgvector','exact','none')),
  chunk_count INT NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  top_score NUMERIC(6,4) CHECK (top_score IS NULL OR (top_score >= 0 AND top_score <= 1)),
  latency_ms INT CHECK (latency_ms IS NULL OR latency_ms >= 0),
  model_name TEXT,
  ai_available BOOLEAN NOT NULL DEFAULT false,
  query TEXT CHECK (query IS NULL OR char_length(query) BETWEEN 5 AND 2000),
  response TEXT CHECK (response IS NULL OR char_length(response) BETWEEN 1 AND 10000),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_rag_created_idx
  ON ai_rag_answer_events (rag_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_client_account_idx
  ON ai_rag_answer_events (client_account_id) WHERE client_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_retention_idx
  ON ai_rag_answer_events (retention_expires_at);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_outcome_idx
  ON ai_rag_answer_events (rag_key, outcome, created_at DESC);

-- Configuração por escopo (limiares e políticas). Valores calibrados
-- no gate PG real (pós-unaccent nos dois lados) — ver
-- docs/RAG-PR1-FUNDACAO-SEMANTICA-2026-10-06.md.
CREATE TABLE IF NOT EXISTS ai_rag_retrieval_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_key TEXT NOT NULL UNIQUE CHECK (rag_key IN ('publico','cliente','rh','marcelo')),
  min_relevance NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (min_relevance >= 0 AND min_relevance <= 1),
  max_chunks INT NOT NULL DEFAULT 6 CHECK (max_chunks BETWEEN 1 AND 20),
  max_context_chars INT NOT NULL DEFAULT 6000 CHECK (max_context_chars BETWEEN 500 AND 20000),
  lexical_candidates INT NOT NULL DEFAULT 40 CHECK (lexical_candidates BETWEEN 1 AND 100),
  vector_candidates INT NOT NULL DEFAULT 40 CHECK (vector_candidates BETWEEN 1 AND 100),
  vector_scan_limit INT NOT NULL DEFAULT 800 CHECK (vector_scan_limit BETWEEN 50 AND 5000),
  retention_days INT NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 365),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_ai_rag_retrieval_config_updated ON ai_rag_retrieval_config;
CREATE TRIGGER trg_ai_rag_retrieval_config_updated
  BEFORE UPDATE ON ai_rag_retrieval_config
  FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();
INSERT INTO ai_rag_retrieval_config (rag_key) VALUES
  ('publico'), ('cliente'), ('rh'), ('marcelo')
  ON CONFLICT (rag_key) DO NOTHING;

-- published_at aditivo em ai_rag_documents: data real de publicação
-- (preenchida na transição para publicado, retroativamente a partir de
-- updated_at quando já estava publicado). Não é obrigatório retroativo:
-- o handler PATCH decide quando setar.
ALTER TABLE ai_rag_documents
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- answer_event_id no feedback: amarra a avaliação ao evento do ledger.
ALTER TABLE ai_rag_feedback
  ADD COLUMN IF NOT EXISTS answer_event_id UUID REFERENCES ai_rag_answer_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_rag_feedback_answer_event_idx
  ON ai_rag_feedback (answer_event_id) WHERE answer_event_id IS NOT NULL;

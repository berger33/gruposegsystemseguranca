-- RAG-01 / Fase 1 — fundação semântica híbrida.
--
-- Migração ADITIVA. Não altera nenhuma migração 001–174 e não remove nada:
--   1. ai_rag_chunk_embeddings  — vetor real por chunk, com modelo, dimensão,
--      checksum do conteúdo e estado explícito de indexação;
--   2. ai_rag_answer_events     — ledger de respostas com protocolo persistido,
--      resultado, modo de recuperação, latência e retenção;
--   3. ai_rag_retrieval_config  — limites e limiar por área (rag_key);
--   4. ai_rag_documents.published_at — data de publicação exigida pela resposta;
--   5. ai_rag_feedback.answer_event_id — liga o feedback ao protocolo canônico.
--
-- O vetor é guardado de forma portátil (REAL[]). Quando a extensão pgvector
-- estiver instalada e autorizada, a consulta faz o cast `embedding::vector`;
-- quando não estiver, a similaridade é calculada de forma exata sobre o
-- conjunto já filtrado por escopo. Nada aqui depende de pgvector para existir.
--
-- Rollback documentado em docs/RAG-PR1-FUNDACAO-SEMANTICA-2026-10-06.md (§Rollback).

-- 1. Embeddings por chunk -----------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_rag_chunk_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES ai_rag_chunks(id) ON DELETE CASCADE,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  model_name TEXT NOT NULL CHECK (char_length(model_name) BETWEEN 3 AND 100),
  model_digest TEXT CHECK (model_digest IS NULL OR char_length(model_digest) BETWEEN 4 AND 200),
  dimensions INT NOT NULL CHECK (dimensions BETWEEN 16 AND 4096),
  content_checksum TEXT NOT NULL CHECK (content_checksum ~ '^[0-9a-f]{64}$'),
  embedding REAL[],
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','gerado','erro')),
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 3 AND 120),
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Sem vetor => sem estado "gerado". Não existe embedding declarado por schema.
  CONSTRAINT ai_rag_chunk_embeddings_gerado_exige_vetor
    CHECK (status <> 'gerado' OR (embedding IS NOT NULL AND generated_at IS NOT NULL)),
  CONSTRAINT ai_rag_chunk_embeddings_erro_exige_codigo
    CHECK (status <> 'erro' OR error_code IS NOT NULL),
  CONSTRAINT ai_rag_chunk_embeddings_dimensao_confere
    CHECK (embedding IS NULL OR array_length(embedding, 1) = dimensions)
);
CREATE INDEX IF NOT EXISTS ai_rag_chunk_embeddings_rag_status_idx
  ON ai_rag_chunk_embeddings (rag_key, status);
CREATE INDEX IF NOT EXISTS ai_rag_chunk_embeddings_status_idx
  ON ai_rag_chunk_embeddings (status) WHERE status <> 'gerado';

DROP TRIGGER IF EXISTS trg_ai_rag_chunk_embeddings_updated ON ai_rag_chunk_embeddings;
CREATE TRIGGER trg_ai_rag_chunk_embeddings_updated BEFORE UPDATE ON ai_rag_chunk_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();

-- 2. Ledger de respostas (protocolo, resultado e retenção) --------------------
CREATE TABLE IF NOT EXISTS ai_rag_answer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^RAG-[A-Z]{2,4}-[0-9]{8}-[A-Z0-9]{4}$'),
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  client_account_id UUID REFERENCES client_accounts(id),
  actor_kind TEXT NOT NULL DEFAULT 'visitor' CHECK (actor_kind IN ('visitor','client','staff')),
  actor_identity UUID REFERENCES auth_identities(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('answered','no_source','ai_unavailable','scope_denied','error')),
  retrieval_mode TEXT CHECK (retrieval_mode IS NULL OR retrieval_mode IN ('hybrid','lexical_only')),
  vector_backend TEXT CHECK (vector_backend IS NULL OR vector_backend IN ('pgvector','exact','none')),
  chunk_count INT NOT NULL DEFAULT 0 CHECK (chunk_count >= 0 AND chunk_count <= 200),
  top_relevance NUMERIC(5,4) CHECK (top_relevance IS NULL OR (top_relevance >= 0 AND top_relevance <= 1)),
  latency_ms INT CHECK (latency_ms IS NULL OR (latency_ms >= 0 AND latency_ms <= 600000)),
  model_name TEXT CHECK (model_name IS NULL OR char_length(model_name) BETWEEN 3 AND 100),
  ai_available BOOLEAN NOT NULL DEFAULT false,
  query TEXT CHECK (query IS NULL OR char_length(query) BETWEEN 5 AND 2000),
  response TEXT CHECK (response IS NULL OR char_length(response) BETWEEN 1 AND 10000),
  -- Somente metadados humanos da fonte (título, origem, versão, datas).
  -- O trecho recuperado não é copiado para o ledger.
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_created_idx ON ai_rag_answer_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_rag_created_idx ON ai_rag_answer_events (rag_key, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_outcome_idx ON ai_rag_answer_events (rag_key, outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_retention_idx ON ai_rag_answer_events (retention_expires_at);
CREATE INDEX IF NOT EXISTS ai_rag_answer_events_client_idx ON ai_rag_answer_events (client_account_id, created_at DESC)
  WHERE client_account_id IS NOT NULL;

-- 3. Configuração de recuperação por área ------------------------------------
CREATE TABLE IF NOT EXISTS ai_rag_retrieval_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_key TEXT NOT NULL UNIQUE CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  min_relevance NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (min_relevance >= 0 AND min_relevance <= 1),
  max_chunks INT NOT NULL DEFAULT 6 CHECK (max_chunks BETWEEN 1 AND 20),
  max_context_chars INT NOT NULL DEFAULT 6000 CHECK (max_context_chars BETWEEN 500 AND 20000),
  lexical_candidates INT NOT NULL DEFAULT 40 CHECK (lexical_candidates BETWEEN 1 AND 200),
  vector_candidates INT NOT NULL DEFAULT 40 CHECK (vector_candidates BETWEEN 1 AND 200),
  vector_scan_limit INT NOT NULL DEFAULT 800 CHECK (vector_scan_limit BETWEEN 1 AND 5000),
  lexical_weight NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (lexical_weight >= 0 AND lexical_weight <= 1),
  vector_weight NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (vector_weight >= 0 AND vector_weight <= 1),
  retention_days INT NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 365),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_ai_rag_retrieval_config_updated ON ai_rag_retrieval_config;
CREATE TRIGGER trg_ai_rag_retrieval_config_updated BEFORE UPDATE ON ai_rag_retrieval_config
  FOR EACH ROW EXECUTE FUNCTION update_ai_rag_updated_at();

INSERT INTO ai_rag_retrieval_config (rag_key) VALUES ('publico'), ('cliente'), ('rh'), ('marcelo')
ON CONFLICT (rag_key) DO NOTHING;

-- 4. Data de publicação no documento -----------------------------------------
ALTER TABLE ai_rag_documents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Documentos já publicados antes desta migração: a única data honesta
-- disponível é a de atualização. Nada é inventado para os demais.
UPDATE ai_rag_documents
SET published_at = updated_at
WHERE is_published = true AND published_at IS NULL;

-- 5. Feedback ligado ao protocolo canônico -----------------------------------
ALTER TABLE ai_rag_feedback
  ADD COLUMN IF NOT EXISTS answer_event_id UUID REFERENCES ai_rag_answer_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_rag_feedback_answer_event_idx ON ai_rag_feedback (answer_event_id)
  WHERE answer_event_id IS NOT NULL;

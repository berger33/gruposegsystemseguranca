-- AI-09: Feedback RAG + custo/token tracking + rollback curadoria base, versão, publicação, avaliação
-- Requisito: curadoria base, versão, publicação, avaliação, custo/token e rollback (AI-09)
-- Tabelas já existem em beta-pglite-init.sql, aqui garante produção PG

CREATE TABLE IF NOT EXISTS ai_rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  query_id UUID REFERENCES ai_rag_queries(id) ON DELETE SET NULL,
  bot_session_id UUID REFERENCES ai_bot_sessions(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating >=1 AND rating <=5),
  feedback_text TEXT CHECK (feedback_text IS NULL OR char_length(feedback_text) BETWEEN 1 AND 1000),
  is_helpful BOOLEAN,
  visitor_name TEXT CHECK (visitor_name IS NULL OR char_length(visitor_name) BETWEEN 1 AND 100),
  origin TEXT CHECK (origin IS NULL OR char_length(origin) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_rag_feedback_protocol_idx ON ai_rag_feedback(protocol);
CREATE INDEX IF NOT EXISTS ai_rag_feedback_rag_key_idx ON ai_rag_feedback(rag_key);
CREATE INDEX IF NOT EXISTS ai_rag_feedback_rating_idx ON ai_rag_feedback(rating);
CREATE INDEX IF NOT EXISTS ai_rag_feedback_created_at_idx ON ai_rag_feedback(created_at DESC);

CREATE TABLE IF NOT EXISTS ai_rag_cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b' CHECK (char_length(model_name) BETWEEN 3 AND 100),
  prompt_tokens INT CHECK (prompt_tokens IS NULL OR prompt_tokens >=0),
  completion_tokens INT CHECK (completion_tokens IS NULL OR completion_tokens >=0),
  total_tokens INT CHECK (total_tokens IS NULL OR total_tokens >=0),
  cost_cents INT CHECK (cost_cents IS NULL OR cost_cents >=0),
  latency_ms INT CHECK (latency_ms IS NULL OR latency_ms >=0),
  queue_position INT CHECK (queue_position IS NULL OR queue_position >=0),
  ollama_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_rag_cost_tracking_protocol_idx ON ai_rag_cost_tracking(protocol);
CREATE INDEX IF NOT EXISTS ai_rag_cost_tracking_rag_key_idx ON ai_rag_cost_tracking(rag_key);
CREATE INDEX IF NOT EXISTS ai_rag_cost_tracking_created_at_idx ON ai_rag_cost_tracking(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_rag_cost_tracking_ollama_used_idx ON ai_rag_cost_tracking(ollama_used) WHERE ollama_used = true;

-- View agregada para curadoria: feedback médio por RAG + custo 24h
CREATE OR REPLACE VIEW ai_rag_curadoria_view AS
SELECT
  rag_key,
  COUNT(*)::int AS total_queries,
  AVG(rating)::numeric(3,2) AS avg_rating,
  COUNT(*) FILTER (WHERE is_helpful = true)::int AS helpful_count,
  COUNT(*) FILTER (WHERE is_helpful = false)::int AS not_helpful_count
FROM ai_rag_feedback
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY rag_key;

-- View custo/token 24h por RAG
CREATE OR REPLACE VIEW ai_rag_cost_24h_view AS
SELECT
  rag_key,
  COUNT(*)::int AS total_requests,
  AVG(total_tokens)::int AS avg_total_tokens,
  SUM(total_tokens)::int AS sum_total_tokens,
  AVG(cost_cents)::int AS avg_cost_cents,
  SUM(cost_cents)::int AS sum_cost_cents,
  AVG(latency_ms)::int AS avg_latency_ms,
  COUNT(*) FILTER (WHERE ollama_used = true)::int AS real_ollama_count
FROM ai_rag_cost_tracking
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY rag_key;

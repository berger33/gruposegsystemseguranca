-- PLT-15 importação/exportação, logs de integração, limites, webhooks autenticados, retries e reconciliação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_job_type') THEN
    CREATE TYPE integration_job_type AS ENUM ('import','export','webhook','sync','reconciliacao');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_job_status') THEN
    CREATE TYPE integration_job_status AS ENUM ('pendente','em_execucao','concluido','falha','parcial','cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_status') THEN
    CREATE TYPE webhook_status AS ENUM ('pendente','enviado','falha','rejeitado','retry');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS integration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type integration_job_type NOT NULL,
  status integration_job_status NOT NULL DEFAULT 'pendente',
  source VARCHAR(100) NOT NULL,
  target VARCHAR(100) NOT NULL,
  file_reference VARCHAR(500),
  file_size INTEGER CHECK (file_size IS NULL OR file_size >= 0),
  total_records INTEGER NOT NULL DEFAULT 0 CHECK (total_records >= 0),
  processed_records INTEGER NOT NULL DEFAULT 0 CHECK (processed_records >= 0),
  success_records INTEGER NOT NULL DEFAULT 0 CHECK (success_records >= 0),
  error_records INTEGER NOT NULL DEFAULT 0 CHECK (error_records >= 0),
  error_details JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries >= 0 AND max_retries <= 10),
  rate_limit_per_minute INTEGER CHECK (rate_limit_per_minute IS NULL OR (rate_limit_per_minute >= 1 AND rate_limit_per_minute <= 10000)),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_jobs_type ON integration_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_status ON integration_jobs(status);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_created ON integration_jobs(created_at DESC);

DROP TRIGGER IF EXISTS trg_integration_jobs_updated ON integration_jobs;
CREATE TRIGGER trg_integration_jobs_updated BEFORE UPDATE ON integration_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES integration_jobs(id) ON DELETE SET NULL,
  integration_name VARCHAR(100) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('in','out')),
  endpoint VARCHAR(500),
  method VARCHAR(10) CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
  request_headers JSONB,
  request_body JSONB,
  response_status INTEGER CHECK (response_status IS NULL OR (response_status >= 100 AND response_status <= 599)),
  response_headers JSONB,
  response_body JSONB,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  is_error BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT CHECK (char_length(error_message) <= 2000),
  retry_attempt INTEGER NOT NULL DEFAULT 0 CHECK (retry_attempt >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_job ON integration_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration_name);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_logs_error ON integration_logs(is_error);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 200),
  url VARCHAR(500) NOT NULL CHECK (char_length(url) >= 10 AND char_length(url) <= 500),
  secret_hash VARCHAR(200),
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute >= 1 AND rate_limit_per_minute <= 10000),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries >= 0 AND max_retries <= 10),
  timeout_ms INTEGER NOT NULL DEFAULT 10000 CHECK (timeout_ms >= 1000 AND timeout_ms <= 60000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
CREATE INDEX IF NOT EXISTS idx_webhooks_name ON webhooks(name);

DROP TRIGGER IF EXISTS trg_webhooks_updated ON webhooks;
CREATE TRIGGER trg_webhooks_updated BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status webhook_status NOT NULL DEFAULT 'pendente',
  request_signature VARCHAR(500),
  response_status INTEGER CHECK (response_status IS NULL OR (response_status >= 100 AND response_status <= 599)),
  response_body TEXT CHECK (char_length(response_body) <= 5000),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT CHECK (char_length(error_message) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status='retry';

CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES integration_jobs(id) ON DELETE SET NULL,
  source VARCHAR(100) NOT NULL,
  target VARCHAR(100) NOT NULL,
  total_source INTEGER NOT NULL DEFAULT 0 CHECK (total_source >= 0),
  total_target INTEGER NOT NULL DEFAULT 0 CHECK (total_target >= 0),
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched >= 0),
  mismatched INTEGER NOT NULL DEFAULT 0 CHECK (mismatched >= 0),
  missing_in_target INTEGER NOT NULL DEFAULT 0 CHECK (missing_in_target >= 0),
  missing_in_source INTEGER NOT NULL DEFAULT 0 CHECK (missing_in_source >= 0),
  details JSONB,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_created ON reconciliation_reports(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'integration_job_create') THEN
    ALTER TYPE audit_action ADD VALUE 'integration_job_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'integration_job_execute') THEN
    ALTER TYPE audit_action ADD VALUE 'integration_job_execute';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'webhook_create') THEN
    ALTER TYPE audit_action ADD VALUE 'webhook_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'webhook_update') THEN
    ALTER TYPE audit_action ADD VALUE 'webhook_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'webhook_deliver') THEN
    ALTER TYPE audit_action ADD VALUE 'webhook_deliver';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'reconciliation_create') THEN
    ALTER TYPE audit_action ADD VALUE 'reconciliation_create';
  END IF;
END $$;

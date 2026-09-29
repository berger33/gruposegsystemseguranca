-- PLT-16 orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraestrutura
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_category') THEN
    CREATE TYPE budget_category AS ENUM ('armazenamento','mensagens','ia','banco','infra','licencas','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usage_metric') THEN
    CREATE TYPE usage_metric AS ENUM ('storage_gb','messages_count','ia_tokens','db_gb','bandwidth_gb','cpu_hours','api_calls','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM ('info','warning','critical');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS operational_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 200),
  category budget_category NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  budgeted_amount DECIMAL(12,2) NOT NULL CHECK (budgeted_amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
  actual_amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (actual_amount >= 0),
  alert_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_percent >= 1 AND alert_threshold_percent <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_op_budgets_category ON operational_budgets(category);
CREATE INDEX IF NOT EXISTS idx_op_budgets_period ON operational_budgets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_op_budgets_active ON operational_budgets(is_active);

DROP TRIGGER IF EXISTS trg_op_budgets_updated ON operational_budgets;
CREATE TRIGGER trg_op_budgets_updated BEFORE UPDATE ON operational_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric usage_metric NOT NULL,
  category budget_category NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  value DECIMAL(12,4) NOT NULL CHECK (value >= 0),
  unit VARCHAR(20) NOT NULL DEFAULT 'count',
  source VARCHAR(100) NOT NULL DEFAULT 'system',
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_metric ON usage_metrics(metric);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_category ON usage_metrics(category);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_measured ON usage_metrics(measured_at DESC);

CREATE TABLE IF NOT EXISTS usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID REFERENCES operational_budgets(id) ON DELETE SET NULL,
  metric usage_metric NOT NULL,
  category budget_category NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'warning',
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 200),
  message TEXT NOT NULL CHECK (char_length(message) >= 10 AND char_length(message) <= 2000),
  threshold_value DECIMAL(12,4) NOT NULL,
  current_value DECIMAL(12,4) NOT NULL,
  is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by VARCHAR(80),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_alerts_budget ON usage_alerts(budget_id);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_metric ON usage_alerts(metric);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_severity ON usage_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_created ON usage_alerts(created_at DESC);

-- Seed budgets example R$200/mês hospedagem não cobre tudo conforme plano
INSERT INTO operational_budgets (name, category, period_start, period_end, budgeted_amount, actual_amount, alert_threshold_percent, notes, created_by)
VALUES
  ('Hospedagem base mensal','infra', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 200.00, 0, 80, 'Teto R$200/mês mencionado em planejamento anterior, não cobre todo ecossistema, apenas hospedagem base. Dimensionar banco, backups, storage, mensagens separadamente.', 'seed'),
  ('Armazenamento documentos','armazenamento', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 100.00, 0, 80, 'Storage privado documentos, backups, CFTV quando aplicável', 'seed'),
  ('Mensagens SMTP/WhatsApp','mensagens', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 150.00, 0, 80, 'Provedores SMTP, WhatsApp, SMS conforme canais configurados', 'seed'),
  ('IA tokens mensal','ia', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 300.00, 0, 80, 'Tokens IA para FAQ, RAG, classificação chamados, custo por uso', 'seed'),
  ('Banco PostgreSQL','banco', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 150.00, 0, 80, 'Instância PostgreSQL, backups, monitoramento', 'seed')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'budget_create') THEN
    ALTER TYPE audit_action ADD VALUE 'budget_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'budget_update') THEN
    ALTER TYPE audit_action ADD VALUE 'budget_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'usage_metric_create') THEN
    ALTER TYPE audit_action ADD VALUE 'usage_metric_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'usage_alert_ack') THEN
    ALTER TYPE audit_action ADD VALUE 'usage_alert_ack';
  END IF;
END $$;

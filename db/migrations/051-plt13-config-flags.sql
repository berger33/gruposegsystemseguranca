-- PLT-13 gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de infraestrutura
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_category') THEN
    CREATE TYPE config_category AS ENUM ('negocio','infra','seguranca','operacao','comercial','financeiro','rh','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'config_flag_status') THEN
    CREATE TYPE config_flag_status AS ENUM ('ativo','inativo','em_teste','depreciado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_status') THEN
    CREATE TYPE maintenance_status AS ENUM ('agendado','em_execucao','concluido','cancelado','falha');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rollout_status') THEN
    CREATE TYPE rollout_status AS ENUM ('rascunho','aprovado','em_rollout','concluido','revertido','falha');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS config_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(200) NOT NULL,
  category config_category NOT NULL DEFAULT 'negocio',
  status config_flag_status NOT NULL DEFAULT 'ativo',
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_value JSONB,
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  is_business BOOLEAN NOT NULL DEFAULT TRUE,
  environment VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (environment IN ('all','development','homologation','production')),
  rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  allowed_roles TEXT[] DEFAULT '{}',
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  updated_by VARCHAR(80),
  updated_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, environment)
);

CREATE INDEX IF NOT EXISTS idx_config_flags_key ON config_flags(key);
CREATE INDEX IF NOT EXISTS idx_config_flags_category ON config_flags(category);
CREATE INDEX IF NOT EXISTS idx_config_flags_status ON config_flags(status);
CREATE INDEX IF NOT EXISTS idx_config_flags_env ON config_flags(environment);

DROP TRIGGER IF EXISTS trg_config_flags_updated ON config_flags;
CREATE TRIGGER trg_config_flags_updated BEFORE UPDATE ON config_flags FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID NOT NULL REFERENCES config_flags(id) ON DELETE CASCADE,
  previous_value JSONB,
  next_value JSONB NOT NULL,
  previous_status config_flag_status,
  next_status config_flag_status,
  reason TEXT CHECK (char_length(reason) <= 1000),
  changed_by VARCHAR(80),
  changed_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_config_history_flag ON config_history(flag_id);
CREATE INDEX IF NOT EXISTS idx_config_history_created ON config_history(created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 10 AND char_length(title) <= 200),
  description TEXT NOT NULL CHECK (char_length(description) >= 20 AND char_length(description) <= 2000),
  status maintenance_status NOT NULL DEFAULT 'agendado',
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  affected_services TEXT[] DEFAULT '{}',
  is_business_impact BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  rollback_plan TEXT CHECK (char_length(rollback_plan) <= 2000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_windows(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled ON maintenance_windows(scheduled_start);

DROP TRIGGER IF EXISTS trg_maintenance_updated ON maintenance_windows;
CREATE TRIGGER trg_maintenance_updated BEFORE UPDATE ON maintenance_windows FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS rollout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID REFERENCES config_flags(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 10 AND char_length(title) <= 200),
  description TEXT NOT NULL CHECK (char_length(description) >= 20 AND char_length(description) <= 2000),
  status rollout_status NOT NULL DEFAULT 'rascunho',
  current_percentage INTEGER NOT NULL DEFAULT 0 CHECK (current_percentage >= 0 AND current_percentage <= 100),
  target_percentage INTEGER NOT NULL DEFAULT 100 CHECK (target_percentage >= 0 AND target_percentage <= 100),
  steps JSONB DEFAULT '[]'::jsonb,
  rollback_to JSONB,
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rollout_flag ON rollout_plans(flag_id);
CREATE INDEX IF NOT EXISTS idx_rollout_status ON rollout_plans(status);

DROP TRIGGER IF EXISTS trg_rollout_updated ON rollout_plans;
CREATE TRIGGER trg_rollout_updated BEFORE UPDATE ON rollout_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed some business vs infra flags
INSERT INTO config_flags (key, category, description, value, default_value, is_business, environment, created_by)
VALUES
  ('catalogo_publicacao_automatica','negocio','Controla se catálogo de serviços publica automaticamente após aprovação comercial', '{"enabled": false}'::jsonb, '{"enabled": false}'::jsonb, true, 'all', 'seed'),
  ('orcamento_aprovacao_desconto_alcada','negocio','Alçada de desconto que exige aprovação comercial', '{"limite_percentual": 15, "alçada_financeiro": 25}'::jsonb, '{"limite_percentual": 15}'::jsonb, true, 'all', 'seed'),
  ('retencao_logs_seguranca_meses','seguranca','Meses de retenção de logs de segurança conforme decisão histórica', '{"meses": 12}'::jsonb, '{"meses": 12}'::jsonb, false, 'all', 'seed'),
  ('manutencao_modo','infra','Flag de modo manutenção que afeta disponibilidade', '{"enabled": false, "mensagem": "Sistema em manutenção programada"}'::jsonb, '{"enabled": false}'::jsonb, false, 'all', 'seed'),
  ('feature_plantao_troca','negocio','Habilita troca de plantão entre funcionários', '{"enabled": true}'::jsonb, '{"enabled": true}'::jsonb, true, 'all', 'seed')
ON CONFLICT (key, environment) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'config_flag_create') THEN
    ALTER TYPE audit_action ADD VALUE 'config_flag_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'config_flag_update') THEN
    ALTER TYPE audit_action ADD VALUE 'config_flag_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'config_flag_rollback') THEN
    ALTER TYPE audit_action ADD VALUE 'config_flag_rollback';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'maintenance_create') THEN
    ALTER TYPE audit_action ADD VALUE 'maintenance_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'maintenance_update') THEN
    ALTER TYPE audit_action ADD VALUE 'maintenance_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'rollout_create') THEN
    ALTER TYPE audit_action ADD VALUE 'rollout_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'rollout_approve') THEN
    ALTER TYPE audit_action ADD VALUE 'rollout_approve';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'rollout_execute') THEN
    ALTER TYPE audit_action ADD VALUE 'rollout_execute';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'rollout_rollback') THEN
    ALTER TYPE audit_action ADD VALUE 'rollout_rollback';
  END IF;
END $$;

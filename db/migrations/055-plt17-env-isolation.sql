-- PLT-17 isolamento de desenvolvimento/homologação/produção com contas e dados próprios; previews sem dados reais
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'env_type') THEN
    CREATE TYPE env_type AS ENUM ('development','homologation','production','preview');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'env_isolation_status') THEN
    CREATE TYPE env_isolation_status AS ENUM ('isolado','compartilhado','em_verificacao','falha');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 100),
  env_type env_type NOT NULL,
  status env_isolation_status NOT NULL DEFAULT 'isolado',
  db_name VARCHAR(100) NOT NULL,
  db_user VARCHAR(100) NOT NULL,
  storage_bucket VARCHAR(200) NOT NULL,
  domain VARCHAR(200),
  is_production BOOLEAN NOT NULL DEFAULT FALSE,
  has_real_data BOOLEAN NOT NULL DEFAULT FALSE,
  isolation_verified_at TIMESTAMPTZ,
  isolation_verified_by VARCHAR(80),
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name),
  UNIQUE (db_name)
);

CREATE INDEX IF NOT EXISTS idx_env_type ON environments(env_type);
CREATE INDEX IF NOT EXISTS idx_env_status ON environments(status);
CREATE INDEX IF NOT EXISTS idx_env_production ON environments(is_production);

DROP TRIGGER IF EXISTS trg_env_updated ON environments;
CREATE TRIGGER trg_env_updated BEFORE UPDATE ON environments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS env_data_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL CHECK (check_type IN ('real_data_scan','preview_data_check','isolation_verify','account_separation')),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','passou','falhou','aviso')),
  details JSONB,
  checked_by VARCHAR(80),
  checked_by_id VARCHAR(80),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_env_checks_env ON env_data_checks(env_id);
CREATE INDEX IF NOT EXISTS idx_env_checks_type ON env_data_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_env_checks_status ON env_data_checks(status);

-- Seed environments with isolation
INSERT INTO environments (name, env_type, db_name, db_user, storage_bucket, domain, is_production, has_real_data, status, notes, created_by)
VALUES
  ('development-local','development','grupo_seg_dev','dev_user','seg-system-dev-bucket','dev.gruposegsystem.local', false, false, 'isolado', 'Desenvolvimento local com dados sintéticos, sem dados reais produção', 'seed'),
  ('homologation','homologation','grupo_seg_homolog','homolog_user','seg-system-homolog-bucket','homolog.gruposegsystem.com.br', false, false, 'isolado', 'Homologação sem dados reais, contas próprias, preview sem dados reais', 'seed'),
  ('production','production','grupo_seg_prod','prod_user','seg-system-prod-bucket','gruposegsystem.com.br', true, true, 'isolado', 'Produção com dados reais, usuário runtime restrito, usuário migração separado, backups criptografados', 'seed'),
  ('preview-vercel','preview','grupo_seg_preview','preview_user','seg-system-preview-bucket','preview.gruposegsystem.vercel.app', false, false, 'isolado', 'Previews sem dados reais, variáveis de ambiente próprias, noindex', 'seed')
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'env_create') THEN
    ALTER TYPE audit_action ADD VALUE 'env_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'env_verify') THEN
    ALTER TYPE audit_action ADD VALUE 'env_verify';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'env_check') THEN
    ALTER TYPE audit_action ADD VALUE 'env_check';
  END IF;
END $$;

-- PLT-11 retenção por categoria, descarte verificável, retenção excepcional
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'retention_exception_status') THEN
    CREATE TYPE retention_exception_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','expirado','revogado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disposal_method') THEN
    CREATE TYPE disposal_method AS ENUM ('exclusao_logica','exclusao_fisica','anonimizacao','arquivamento');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disposal_job_status') THEN
    CREATE TYPE disposal_job_status AS ENUM ('pendente','em_execucao','concluido','falha','parcial');
  END IF;
END $$;

-- 011 criou data_retention_policies com id TEXT/table_name/retention_months.
-- PLT-11 usa outro contrato (id UUID/categoria/dias). Preservar os registros
-- legados em tabela separada, sem DROP ou conversão silenciosa de prazo/bases.
DO $legacy$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'data_retention_policies'
      AND column_name = 'retention_months'
  ) THEN
    IF to_regclass('data_retention_policies_legacy') IS NOT NULL THEN
      RAISE EXCEPTION 'retention_legacy_table_already_exists: reconcile manually';
    END IF;
    ALTER TABLE data_retention_policies RENAME TO data_retention_policies_legacy;
  END IF;
END $legacy$;

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category crm_privacy_data_category NOT NULL,
  field_pattern VARCHAR(200) NOT NULL DEFAULT '*',
  retention_days INTEGER NOT NULL CHECK (retention_days >= 1 AND retention_days <= 36500),
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  legal_basis crm_privacy_legal_basis NOT NULL,
  legal_basis_detail TEXT CHECK (char_length(legal_basis_detail) <= 1000),
  exceptional_retention_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  max_exception_days INTEGER CHECK (max_exception_days IS NULL OR (max_exception_days >= 1 AND max_exception_days <= 36500)),
  disposal_method disposal_method NOT NULL DEFAULT 'exclusao_logica',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  updated_by VARCHAR(80),
  updated_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, field_pattern)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_category ON data_retention_policies(category);
CREATE INDEX IF NOT EXISTS idx_retention_policies_active ON data_retention_policies(is_active);

DROP TRIGGER IF EXISTS trg_retention_policies_updated ON data_retention_policies;
CREATE TRIGGER trg_retention_policies_updated BEFORE UPDATE ON data_retention_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS retention_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES data_retention_policies(id) ON DELETE SET NULL,
  category crm_privacy_data_category NOT NULL,
  field_reference VARCHAR(200) NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) >= 10 AND char_length(reason) <= 1000),
  justification TEXT NOT NULL CHECK (char_length(justification) >= 10 AND char_length(justification) <= 2000),
  status retention_exception_status NOT NULL DEFAULT 'solicitado',
  requested_retention_days INTEGER NOT NULL CHECK (requested_retention_days >= 1 AND requested_retention_days <= 36500),
  approved_retention_days INTEGER CHECK (approved_retention_days IS NULL OR (approved_retention_days >= 1 AND approved_retention_days <= 36500)),
  expires_at DATE NOT NULL,
  requested_by VARCHAR(80),
  requested_by_id VARCHAR(80),
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_exceptions_policy ON retention_exceptions(policy_id);
CREATE INDEX IF NOT EXISTS idx_retention_exceptions_status ON retention_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_retention_exceptions_category ON retention_exceptions(category);
CREATE INDEX IF NOT EXISTS idx_retention_exceptions_expires ON retention_exceptions(expires_at);

DROP TRIGGER IF EXISTS trg_retention_exceptions_updated ON retention_exceptions;
CREATE TRIGGER trg_retention_exceptions_updated BEFORE UPDATE ON retention_exceptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS disposal_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status disposal_job_status NOT NULL DEFAULT 'pendente',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_scanned INTEGER NOT NULL DEFAULT 0 CHECK (total_scanned >= 0),
  total_expired INTEGER NOT NULL DEFAULT 0 CHECK (total_expired >= 0),
  total_disposed INTEGER NOT NULL DEFAULT 0 CHECK (total_disposed >= 0),
  total_errors INTEGER NOT NULL DEFAULT 0 CHECK (total_errors >= 0),
  initiated_by VARCHAR(80),
  initiated_by_id VARCHAR(80),
  notes TEXT CHECK (char_length(notes) <= 2000),
  error_details TEXT CHECK (char_length(error_details) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disposal_jobs_status ON disposal_jobs(status);
CREATE INDEX IF NOT EXISTS idx_disposal_jobs_created ON disposal_jobs(created_at DESC);

DROP TRIGGER IF EXISTS trg_disposal_jobs_updated ON disposal_jobs;
CREATE TRIGGER trg_disposal_jobs_updated BEFORE UPDATE ON disposal_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS disposal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES disposal_jobs(id) ON DELETE CASCADE,
  category crm_privacy_data_category NOT NULL,
  field_reference VARCHAR(200) NOT NULL,
  record_reference_hash VARCHAR(200) NOT NULL,
  record_table VARCHAR(100),
  record_id VARCHAR(100),
  disposal_method disposal_method NOT NULL,
  disposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by VARCHAR(80),
  verified_by_id VARCHAR(80),
  retention_days_applied INTEGER CHECK (retention_days_applied IS NULL OR retention_days_applied >= 1),
  exception_id UUID REFERENCES retention_exceptions(id) ON DELETE SET NULL,
  details TEXT CHECK (char_length(details) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disposal_logs_job ON disposal_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_disposal_logs_category ON disposal_logs(category);
CREATE INDEX IF NOT EXISTS idx_disposal_logs_disposed ON disposal_logs(disposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_disposal_logs_hash ON disposal_logs(record_reference_hash);

-- Seed retention policies from privacy inventory defaults
INSERT INTO data_retention_policies (category, field_pattern, retention_days, description, legal_basis, disposal_method, exceptional_retention_allowed, max_exception_days, created_by)
SELECT data_category, data_field, retention_days, purpose, legal_basis, 'exclusao_logica', CASE WHEN is_sensitive THEN TRUE ELSE FALSE END, retention_days * 2, 'seed'
FROM privacy_data_inventory
WHERE retention_days IS NOT NULL
ON CONFLICT (category, field_pattern) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'retention_policy_create') THEN
    ALTER TYPE audit_action ADD VALUE 'retention_policy_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'retention_policy_update') THEN
    ALTER TYPE audit_action ADD VALUE 'retention_policy_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'retention_exception_create') THEN
    ALTER TYPE audit_action ADD VALUE 'retention_exception_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'retention_exception_approve') THEN
    ALTER TYPE audit_action ADD VALUE 'retention_exception_approve';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'retention_exception_reject') THEN
    ALTER TYPE audit_action ADD VALUE 'retention_exception_reject';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'retention_exception_revoke') THEN
    ALTER TYPE audit_action ADD VALUE 'retention_exception_revoke';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'disposal_job_create') THEN
    ALTER TYPE audit_action ADD VALUE 'disposal_job_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'disposal_job_execute') THEN
    ALTER TYPE audit_action ADD VALUE 'disposal_job_execute';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'disposal_log_create') THEN
    ALTER TYPE audit_action ADD VALUE 'disposal_log_create';
  END IF;
END $$;

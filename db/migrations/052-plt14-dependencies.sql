-- PLT-14 revisão de dependências, lockfile, vulnerabilidades, atualizações e CI
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dependency_audit_status') THEN
    CREATE TYPE dependency_audit_status AS ENUM ('pendente','em_analise','aprovado','rejeitado','corrigido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dependency_severity') THEN
    CREATE TYPE dependency_severity AS ENUM ('info','low','moderate','high','critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dependency_update_type') THEN
    CREATE TYPE dependency_update_type AS ENUM ('major','minor','patch','security');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dependency_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_dependencies INTEGER NOT NULL DEFAULT 0 CHECK (total_dependencies >= 0),
  prod_dependencies INTEGER NOT NULL DEFAULT 0 CHECK (prod_dependencies >= 0),
  dev_dependencies INTEGER NOT NULL DEFAULT 0 CHECK (dev_dependencies >= 0),
  vulnerabilities_info INTEGER NOT NULL DEFAULT 0 CHECK (vulnerabilities_info >= 0),
  vulnerabilities_low INTEGER NOT NULL DEFAULT 0 CHECK (vulnerabilities_low >= 0),
  vulnerabilities_moderate INTEGER NOT NULL DEFAULT 0 CHECK (vulnerabilities_moderate >= 0),
  vulnerabilities_high INTEGER NOT NULL DEFAULT 0 CHECK (vulnerabilities_high >= 0),
  vulnerabilities_critical INTEGER NOT NULL DEFAULT 0 CHECK (vulnerabilities_critical >= 0),
  outdated_count INTEGER NOT NULL DEFAULT 0 CHECK (outdated_count >= 0),
  audit_raw JSONB,
  status dependency_audit_status NOT NULL DEFAULT 'pendente',
  reviewed_by VARCHAR(80),
  reviewed_by_id VARCHAR(80),
  reviewed_at TIMESTAMPTZ,
  notes TEXT CHECK (char_length(notes) <= 2000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dependency_audits_date ON dependency_audits(audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_dependency_audits_status ON dependency_audits(status);

CREATE TABLE IF NOT EXISTS dependency_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES dependency_audits(id) ON DELETE CASCADE,
  package_name VARCHAR(200) NOT NULL,
  severity dependency_severity NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) >= 5 AND char_length(title) <= 500),
  url TEXT CHECK (char_length(url) <= 500),
  vulnerable_versions VARCHAR(200),
  patched_versions VARCHAR(200),
  recommendation TEXT CHECK (char_length(recommendation) <= 1000),
  status dependency_audit_status NOT NULL DEFAULT 'pendente',
  fixed_in_version VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dep_vuln_audit ON dependency_vulnerabilities(audit_id);
CREATE INDEX IF NOT EXISTS idx_dep_vuln_package ON dependency_vulnerabilities(package_name);
CREATE INDEX IF NOT EXISTS idx_dep_vuln_severity ON dependency_vulnerabilities(severity);

CREATE TABLE IF NOT EXISTS dependency_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name VARCHAR(200) NOT NULL,
  current_version VARCHAR(100) NOT NULL,
  latest_version VARCHAR(100) NOT NULL,
  update_type dependency_update_type NOT NULL,
  is_breaking BOOLEAN NOT NULL DEFAULT FALSE,
  changelog_url TEXT CHECK (char_length(changelog_url) <= 500),
  status dependency_audit_status NOT NULL DEFAULT 'pendente',
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dep_updates_package ON dependency_updates(package_name);
CREATE INDEX IF NOT EXISTS idx_dep_updates_status ON dependency_updates(status);
CREATE INDEX IF NOT EXISTS idx_dep_updates_type ON dependency_updates(update_type);

DROP TRIGGER IF EXISTS trg_dep_updates_updated ON dependency_updates;
CREATE TRIGGER trg_dep_updates_updated BEFORE UPDATE ON dependency_updates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'dependency_audit_create') THEN
    ALTER TYPE audit_action ADD VALUE 'dependency_audit_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'dependency_audit_review') THEN
    ALTER TYPE audit_action ADD VALUE 'dependency_audit_review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'dependency_update_approve') THEN
    ALTER TYPE audit_action ADD VALUE 'dependency_update_approve';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'dependency_update_apply') THEN
    ALTER TYPE audit_action ADD VALUE 'dependency_update_apply';
  END IF;
END $$;

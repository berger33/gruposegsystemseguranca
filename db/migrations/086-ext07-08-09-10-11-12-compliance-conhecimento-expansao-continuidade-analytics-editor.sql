-- EXT-07/08/09/10/11/12 compliance corporativo base conhecimento expansão/unidades continuidade operacional analytics/A-B editor visual avançado
-- EXT-07 Compliance corporativo licenças/certidões/seguros obrigações aplicáveis responsável validade
-- EXT-08 Base conhecimento procedimentos versionados busca acesso ciência
-- EXT-09 Expansão/unidades planejamento filial/contrato capacidade cenários financeiros
-- EXT-10 Continuidade operacional contingência posto/cliente contatos exercícios recuperação
-- EXT-11 Analytics/A-B hipótese variantes aprovadas métrica privacidade
-- EXT-12 Editor visual avançado tokens/layouts versionados preview publicação

DO $$ BEGIN CREATE TYPE ext_compliance_type AS ENUM ('licenca','certidao','seguro','alvara','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_compliance_status AS ENUM ('vigente','a_vencer','vencida','em_renovacao','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_kb_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_expansion_status AS ENUM ('rascunho','em_analise','aprovado','rejeitado','em_execucao','concluido','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_continuity_status AS ENUM ('rascunho','aprovado','em_teste','testado','desatualizado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_analytics_status AS ENUM ('rascunho','em_execucao','concluido','cancelado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_editor_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','revertido'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EXT-07 compliance
CREATE TABLE IF NOT EXISTS ext_compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^COMP-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  compliance_type ext_compliance_type NOT NULL DEFAULT 'outro',
  status ext_compliance_status NOT NULL DEFAULT 'vigente',
  document_number TEXT CHECK (document_number IS NULL OR char_length(document_number) BETWEEN 3 AND 200),
  issuer TEXT CHECK (issuer IS NULL OR char_length(issuer) BETWEEN 3 AND 200),
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  issue_date DATE,
  expiry_date DATE CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date),
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_compliance_documents_protocol_idx ON ext_compliance_documents(protocol);
CREATE INDEX IF NOT EXISTS ext_compliance_documents_type_idx ON ext_compliance_documents(compliance_type);
CREATE INDEX IF NOT EXISTS ext_compliance_documents_expiry_idx ON ext_compliance_documents(expiry_date);
CREATE INDEX IF NOT EXISTS ext_compliance_documents_status_idx ON ext_compliance_documents(status);

-- EXT-08 base conhecimento
CREATE TABLE IF NOT EXISTS ext_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL CHECK (char_length(slug) BETWEEN 3 AND 200),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 50 AND 20000),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 3 AND 100),
  status ext_kb_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >0),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  approved_by_identity UUID REFERENCES auth_identities(id),
  tags TEXT[] NOT NULL DEFAULT '{}',
  access_roles TEXT[] NOT NULL DEFAULT '{}',
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(slug, version)
);
CREATE INDEX IF NOT EXISTS ext_knowledge_base_slug_idx ON ext_knowledge_base(slug);
CREATE INDEX IF NOT EXISTS ext_knowledge_base_status_idx ON ext_knowledge_base(status);
CREATE INDEX IF NOT EXISTS ext_knowledge_base_published_idx ON ext_knowledge_base(is_published);

CREATE TABLE IF NOT EXISTS ext_knowledge_base_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES ext_knowledge_base(id) ON DELETE CASCADE,
  previous_version INT,
  next_version INT NOT NULL,
  change_summary TEXT NOT NULL CHECK (char_length(change_summary) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_kb_history_kb_idx ON ext_knowledge_base_history(kb_id);

CREATE TABLE IF NOT EXISTS ext_knowledge_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES ext_knowledge_base(id) ON DELETE CASCADE,
  user_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(kb_id, user_identity)
);

-- EXT-09 expansão/unidades
CREATE TABLE IF NOT EXISTS ext_expansion_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^EXP-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  premises TEXT NOT NULL CHECK (char_length(premises) BETWEEN 10 AND 2000),
  target_location TEXT NOT NULL CHECK (char_length(target_location) BETWEEN 3 AND 200),
  capacity INT CHECK (capacity IS NULL OR capacity >=0),
  estimated_cost_cents BIGINT CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents >=0),
  estimated_revenue_cents BIGINT CHECK (estimated_revenue_cents IS NULL OR estimated_revenue_cents >=0),
  status ext_expansion_status NOT NULL DEFAULT 'rascunho',
  is_estimate BOOLEAN NOT NULL DEFAULT true,
  estimate_note TEXT NOT NULL DEFAULT 'planejamento é estimativa identificada sem projeção vendida como certeza' CHECK (char_length(estimate_note) BETWEEN 10 AND 500),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_expansion_plans_protocol_idx ON ext_expansion_plans(protocol);
CREATE INDEX IF NOT EXISTS ext_expansion_plans_status_idx ON ext_expansion_plans(status);

CREATE TABLE IF NOT EXISTS ext_expansion_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES ext_expansion_plans(id) ON DELETE CASCADE,
  scenario_name TEXT NOT NULL CHECK (char_length(scenario_name) BETWEEN 3 AND 200),
  premises TEXT NOT NULL CHECK (char_length(premises) BETWEEN 10 AND 2000),
  projected_cost_cents BIGINT CHECK (projected_cost_cents IS NULL OR projected_cost_cents >=0),
  projected_revenue_cents BIGINT CHECK (projected_revenue_cents IS NULL OR projected_revenue_cents >=0),
  projected_margin_cents BIGINT GENERATED ALWAYS AS (
    CASE WHEN projected_revenue_cents IS NOT NULL AND projected_cost_cents IS NOT NULL THEN projected_revenue_cents - projected_cost_cents ELSE NULL END
  ) STORED,
  is_estimate BOOLEAN NOT NULL DEFAULT true,
  estimate_note TEXT NOT NULL DEFAULT 'cenário é estimativa identificada sem projeção vendida como certeza' CHECK (char_length(estimate_note) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, scenario_name)
);

-- EXT-10 continuidade operacional
CREATE TABLE IF NOT EXISTS ext_continuity_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^CONT-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  post_id TEXT CHECK (post_id IS NULL OR char_length(post_id) BETWEEN 3 AND 200),
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  contingency_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  recovery_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  status ext_continuity_status NOT NULL DEFAULT 'rascunho',
  last_tested_at DATE,
  next_test_due DATE,
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_continuity_plans_protocol_idx ON ext_continuity_plans(protocol);
CREATE INDEX IF NOT EXISTS ext_continuity_plans_client_idx ON ext_continuity_plans(client_account_id);

CREATE TABLE IF NOT EXISTS ext_continuity_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES ext_continuity_plans(id) ON DELETE CASCADE,
  exercise_date DATE NOT NULL,
  result TEXT NOT NULL CHECK (char_length(result) BETWEEN 10 AND 2000),
  responsible_name TEXT NOT NULL CHECK (char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id),
  next_due DATE,
  evidence_file_url TEXT CHECK (evidence_file_url IS NULL OR char_length(evidence_file_url) BETWEEN 5 AND 1000),
  evidence_storage_key TEXT UNIQUE CHECK (evidence_storage_key IS NULL OR char_length(evidence_storage_key) BETWEEN 5 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EXT-11 analytics/A-B
CREATE TABLE IF NOT EXISTS ext_analytics_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^AB-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  hypothesis TEXT NOT NULL CHECK (char_length(hypothesis) BETWEEN 20 AND 2000),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  variant_a TEXT NOT NULL CHECK (char_length(variant_a) BETWEEN 3 AND 200),
  variant_b TEXT NOT NULL CHECK (char_length(variant_b) BETWEEN 3 AND 200),
  metric_name TEXT NOT NULL CHECK (char_length(metric_name) BETWEEN 3 AND 100),
  status ext_analytics_status NOT NULL DEFAULT 'rascunho',
  is_privacy_compliant BOOLEAN NOT NULL DEFAULT true,
  privacy_note TEXT NOT NULL DEFAULT 'experimento reversível resultado sem dados inventados privacidade minimização' CHECK (char_length(privacy_note) BETWEEN 10 AND 500),
  result_a_value NUMERIC(12,4),
  result_b_value NUMERIC(12,4),
  winner TEXT CHECK (winner IS NULL OR winner IN ('A','B','empate','inconclusivo')),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_analytics_experiments_protocol_idx ON ext_analytics_experiments(protocol);
CREATE INDEX IF NOT EXISTS ext_analytics_experiments_status_idx ON ext_analytics_experiments(status);

-- EXT-12 editor visual avançado
CREATE TABLE IF NOT EXISTS ext_visual_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_key TEXT NOT NULL CHECK (char_length(token_key) BETWEEN 3 AND 200),
  token_value JSONB NOT NULL,
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 3 AND 100),
  status ext_editor_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >0),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(token_key, version)
);
CREATE INDEX IF NOT EXISTS ext_visual_tokens_key_idx ON ext_visual_tokens(token_key);
CREATE INDEX IF NOT EXISTS ext_visual_tokens_status_idx ON ext_visual_tokens(status);

CREATE TABLE IF NOT EXISTS ext_visual_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_key TEXT NOT NULL CHECK (char_length(layout_key) BETWEEN 3 AND 200),
  layout_data JSONB NOT NULL,
  status ext_editor_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >0),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  preview_url TEXT CHECK (preview_url IS NULL OR char_length(preview_url) BETWEEN 5 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(layout_key, version)
);
CREATE INDEX IF NOT EXISTS ext_visual_layouts_key_idx ON ext_visual_layouts(layout_key);

CREATE TABLE IF NOT EXISTS ext_editor_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES ext_visual_tokens(id) ON DELETE SET NULL,
  layout_id UUID REFERENCES ext_visual_layouts(id) ON DELETE SET NULL,
  previous_version INT,
  next_version INT NOT NULL,
  change_summary TEXT NOT NULL CHECK (char_length(change_summary) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers
CREATE OR REPLACE FUNCTION ext_touch_updated_at2() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_compliance_documents_touch ON ext_compliance_documents; CREATE TRIGGER ext_compliance_documents_touch BEFORE UPDATE ON ext_compliance_documents FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();
DROP TRIGGER IF EXISTS ext_knowledge_base_touch ON ext_knowledge_base; CREATE TRIGGER ext_knowledge_base_touch BEFORE UPDATE ON ext_knowledge_base FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();
DROP TRIGGER IF EXISTS ext_expansion_plans_touch ON ext_expansion_plans; CREATE TRIGGER ext_expansion_plans_touch BEFORE UPDATE ON ext_expansion_plans FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();
DROP TRIGGER IF EXISTS ext_continuity_plans_touch ON ext_continuity_plans; CREATE TRIGGER ext_continuity_plans_touch BEFORE UPDATE ON ext_continuity_plans FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();
DROP TRIGGER IF EXISTS ext_analytics_experiments_touch ON ext_analytics_experiments; CREATE TRIGGER ext_analytics_experiments_touch BEFORE UPDATE ON ext_analytics_experiments FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();
DROP TRIGGER IF EXISTS ext_visual_tokens_touch ON ext_visual_tokens; CREATE TRIGGER ext_visual_tokens_touch BEFORE UPDATE ON ext_visual_tokens FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();
DROP TRIGGER IF EXISTS ext_visual_layouts_touch ON ext_visual_layouts; CREATE TRIGGER ext_visual_layouts_touch BEFORE UPDATE ON ext_visual_layouts FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at2();

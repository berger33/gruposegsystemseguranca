-- ADM-07/08/09/10/11/12 busca autorizada favoritos filtros salvos atalhos relatórios exportáveis agendados configurações versionadas metas cenários trilha diário expansão qualidade oportunidades
-- ADM-07 busca autorizada favoritos filtros salvos atalhos com contexto
-- ADM-08 relatórios exportáveis e agendados para destinatários autorizados registrar geração/envio e limitar dados
-- ADM-09 configurações de negócio versionadas catálogo preços alçadas conteúdo SLA e preferências
-- ADM-10 metas e cenários com comparação prevista/realizada sem confundir estimativa com resultado
-- ADM-11 trilha e diário de decisões CON-11 acessíveis conforme permissão
-- ADM-12 análises de expansão qualidade e oportunidades adicionais alimentadas pelos módulos reais

DO $$ BEGIN CREATE TYPE adm_report_type AS ENUM ('meu_dia','comercial','operacional','financeiro','renovacao','aprovacao','expansao','qualidade','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_report_status AS ENUM ('pendente','gerando','gerado','enviado','falhou','expirado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_config_status AS ENUM ('rascunho','em_revisao','aprovado','rejeitado','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE adm_analysis_type AS ENUM ('expansao','qualidade','oportunidade','risco','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ADM-07 busca autorizada favoritos filtros salvos atalhos
CREATE TABLE IF NOT EXISTS adm_search_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identity UUID REFERENCES auth_identities(id),
  query TEXT NOT NULL CHECK (char_length(query) BETWEEN 2 AND 500),
  module TEXT NOT NULL CHECK (char_length(module) BETWEEN 2 AND 100),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_identity, query, module)
);
CREATE INDEX IF NOT EXISTS adm_search_favorites_user_idx ON adm_search_favorites(user_identity);
CREATE INDEX IF NOT EXISTS adm_search_favorites_module_idx ON adm_search_favorites(module);

CREATE TABLE IF NOT EXISTS adm_saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identity UUID REFERENCES auth_identities(id),
  filter_name TEXT NOT NULL CHECK (char_length(filter_name) BETWEEN 3 AND 200),
  module TEXT NOT NULL CHECK (char_length(module) BETWEEN 2 AND 100),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_identity, filter_name, module)
);
CREATE INDEX IF NOT EXISTS adm_saved_filters_user_idx ON adm_saved_filters(user_identity);
CREATE INDEX IF NOT EXISTS adm_saved_filters_module_idx ON adm_saved_filters(module);

CREATE TABLE IF NOT EXISTS adm_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identity UUID REFERENCES auth_identities(id),
  shortcut_name TEXT NOT NULL CHECK (char_length(shortcut_name) BETWEEN 3 AND 200),
  context TEXT NOT NULL CHECK (char_length(context) BETWEEN 3 AND 500),
  url TEXT NOT NULL CHECK (char_length(url) BETWEEN 5 AND 500),
  icon TEXT CHECK (icon IS NULL OR char_length(icon) BETWEEN 2 AND 100),
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_identity, shortcut_name)
);
CREATE INDEX IF NOT EXISTS adm_shortcuts_user_idx ON adm_shortcuts(user_identity);

-- ADM-08 relatórios exportáveis e agendados
CREATE TABLE IF NOT EXISTS adm_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^REL-ADM-[0-9]{8}-[A-Z0-9]{4}$'),
  report_type adm_report_type NOT NULL DEFAULT 'outro',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  period_start DATE,
  period_end DATE CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  status adm_report_status NOT NULL DEFAULT 'pendente',
  scheduled_at TIMESTAMPTZ,
  recipient_email TEXT CHECK (recipient_email IS NULL OR char_length(recipient_email) BETWEEN 5 AND 320),
  is_limited BOOLEAN NOT NULL DEFAULT true,
  limited_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
  generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_sanitized TEXT CHECK (error_sanitized IS NULL OR char_length(error_sanitized) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_reports_protocol_idx ON adm_reports(protocol);
CREATE INDEX IF NOT EXISTS adm_reports_type_idx ON adm_reports(report_type);
CREATE INDEX IF NOT EXISTS adm_reports_status_idx ON adm_reports(status);
CREATE INDEX IF NOT EXISTS adm_reports_scheduled_idx ON adm_reports(scheduled_at);

CREATE TABLE IF NOT EXISTS adm_report_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES adm_reports(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 3 AND 200),
  actor_identity UUID REFERENCES auth_identities(id),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_report_logs_report_idx ON adm_report_logs(report_id);

-- ADM-09 configurações de negócio versionadas
CREATE TABLE IF NOT EXISTS adm_business_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL CHECK (char_length(config_key) BETWEEN 3 AND 200),
  config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1 CHECK (version >0),
  status adm_config_status NOT NULL DEFAULT 'rascunho',
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 10 AND 1000),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 3 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(config_key, version)
);
CREATE INDEX IF NOT EXISTS adm_business_configs_key_idx ON adm_business_configs(config_key);
CREATE INDEX IF NOT EXISTS adm_business_configs_category_idx ON adm_business_configs(category);
CREATE INDEX IF NOT EXISTS adm_business_configs_status_idx ON adm_business_configs(status);

CREATE TABLE IF NOT EXISTS adm_business_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES adm_business_configs(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  previous_version INT,
  next_version INT NOT NULL,
  previous_value JSONB,
  next_value JSONB NOT NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_business_config_history_config_idx ON adm_business_config_history(config_id);

-- ADM-10 metas e cenários comparação prevista/realizada
CREATE TABLE IF NOT EXISTS adm_goals_comparison (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES crm_goals(id) ON DELETE SET NULL,
  scenario_id UUID REFERENCES fin_budget_scenarios(id) ON DELETE SET NULL,
  budget_id UUID REFERENCES fin_budgets(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  predicted_value NUMERIC(14,2) CHECK (predicted_value IS NULL OR predicted_value >=0),
  realized_value NUMERIC(14,2) CHECK (realized_value IS NULL OR realized_value >=0),
  variance_value NUMERIC(14,2) GENERATED ALWAYS AS (
    CASE WHEN predicted_value IS NOT NULL AND realized_value IS NOT NULL THEN realized_value - predicted_value ELSE NULL END
  ) STORED,
  variance_percent NUMERIC(5,2) CHECK (variance_percent IS NULL OR variance_percent BETWEEN -100 AND 100),
  is_estimate BOOLEAN NOT NULL DEFAULT true,
  estimate_note TEXT NOT NULL DEFAULT 'comparação prevista/realizada sem confundir estimativa com resultado' CHECK (char_length(estimate_note) BETWEEN 10 AND 500),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_goals_comparison_goal_idx ON adm_goals_comparison(goal_id);
CREATE INDEX IF NOT EXISTS adm_goals_comparison_period_idx ON adm_goals_comparison(period_start, period_end);

-- ADM-11 trilha e diário de decisões CON-11 já existe crm_management_diary, mas criar view autorizada adm_management_diary_access
CREATE TABLE IF NOT EXISTS adm_management_diary_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id UUID NOT NULL REFERENCES crm_management_diary(id) ON DELETE CASCADE,
  accessor_identity UUID REFERENCES auth_identities(id),
  access_type TEXT NOT NULL CHECK (char_length(access_type) BETWEEN 3 AND 100),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_management_diary_access_diary_idx ON adm_management_diary_access(diary_id);
CREATE INDEX IF NOT EXISTS adm_management_diary_access_accessor_idx ON adm_management_diary_access(accessor_identity);

-- ADM-12 análises expansão qualidade oportunidades
CREATE TABLE IF NOT EXISTS adm_expansion_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  premises TEXT NOT NULL CHECK (char_length(premises) BETWEEN 10 AND 2000),
  analysis_type adm_analysis_type NOT NULL DEFAULT 'expansao',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_module adm_source_module NOT NULL DEFAULT 'adm',
  is_estimate BOOLEAN NOT NULL DEFAULT true,
  estimate_note TEXT NOT NULL DEFAULT 'análise alimentada pelos módulos reais sem prometer resultado' CHECK (char_length(estimate_note) BETWEEN 10 AND 500),
  is_real_data BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_expansion_analyses_type_idx ON adm_expansion_analyses(analysis_type);
CREATE INDEX IF NOT EXISTS adm_expansion_analyses_source_idx ON adm_expansion_analyses(source_module);

-- Triggers
CREATE OR REPLACE FUNCTION update_adm2_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_adm_reports_updated ON adm_reports;
CREATE TRIGGER trg_adm_reports_updated BEFORE UPDATE ON adm_reports FOR EACH ROW EXECUTE FUNCTION update_adm2_updated_at();
DROP TRIGGER IF EXISTS trg_adm_business_configs_updated ON adm_business_configs;
CREATE TRIGGER trg_adm_business_configs_updated BEFORE UPDATE ON adm_business_configs FOR EACH ROW EXECUTE FUNCTION update_adm2_updated_at();
DROP TRIGGER IF EXISTS trg_adm_expansion_analyses_updated ON adm_expansion_analyses;
CREATE TRIGGER trg_adm_expansion_analyses_updated BEFORE UPDATE ON adm_expansion_analyses FOR EACH ROW EXECUTE FUNCTION update_adm2_updated_at();

CREATE OR REPLACE FUNCTION prevent_adm_config_history_update() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'adm_business_config_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_adm_config_history_immutable ON adm_business_config_history;
CREATE TRIGGER trg_adm_config_history_immutable BEFORE UPDATE OR DELETE ON adm_business_config_history FOR EACH ROW EXECUTE FUNCTION prevent_adm_config_history_update();

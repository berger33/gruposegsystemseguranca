-- EXT-13/14/15/16/17 relatório periódico inteligência comercial apoio emergencial central/vídeo biometria/reconhecimento AI-10 automações determinísticas vencimentos distribuição tarefas cobrança interna antes agentes autônomos
-- EXT-13 Relatório periódico consolidação métricas envio autorizado
-- EXT-14 Inteligência comercial indicações reativação recomendações baseadas histórico
-- EXT-15 Apoio emergencial canal destinatário disponibilidade escalonamento definidos teste recebimento/atendimento antes disponibilizar
-- EXT-16 Central/vídeo projeto separado eventos monitoramento vídeo disponibilidade escopo fornecedor custos privacidade aprovados antes ativação
-- EXT-17 Biometria/reconhecimento projeto separado necessidade avaliação impacto/base aplicável não implementar coleta por padrão decisão validação específicas
-- AI-10 automações determinísticas vencimentos distribuição tarefas cobrança interna antes agentes autônomos

DO $$ BEGIN CREATE TYPE ext_report_type AS ENUM ('comercial','operacional','financeiro','qualidade','satisfacao','frota','compliance','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_report_status AS ENUM ('rascunho','gerando','gerado','enviado','falhou','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_intel_type AS ENUM ('indicacao','reativacao','upsell','cross_sell','risco','oportunidade','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_intel_status AS ENUM ('sugerida','em_analise','aprovada','rejeitada','convertida','expirada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_emergency_channel AS ENUM ('telefone','whatsapp','app','botao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_emergency_status AS ENUM ('rascunho','ativo','em_teste','testado','desativado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_central_event_type AS ENUM ('alarme','acesso','ronda','ocorrencia','falha','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_central_status AS ENUM ('recebido','em_analise','escalonado','resolvido','falso_positivo','arquivado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_biometry_type AS ENUM ('facial','digital','iris','voz','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ext_biometry_status AS ENUM ('rascunho','em_avaliacao','aprovado','rejeitado','em_implementacao','ativo','desativado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_automation_type AS ENUM ('vencimento','distribuicao_tarefa','cobranca_interna','escalonamento','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_automation_status AS ENUM ('rascunho','ativa','pausada','desativada','falha'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EXT-13 relatório periódico
CREATE TABLE IF NOT EXISTS ext_periodic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^RELP-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  report_type ext_report_type NOT NULL DEFAULT 'outro',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_records INT NOT NULL DEFAULT 0 CHECK (total_records >=0),
  status ext_report_status NOT NULL DEFAULT 'rascunho',
  file_name TEXT CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT CHECK (file_url IS NULL OR char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT UNIQUE CHECK (storage_key IS NULL OR char_length(storage_key) BETWEEN 5 AND 500),
  recipient_emails TEXT[] NOT NULL DEFAULT '{}',
  is_privacy_compliant BOOLEAN NOT NULL DEFAULT true,
  generated_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_periodic_reports_protocol_idx ON ext_periodic_reports(protocol);
CREATE INDEX IF NOT EXISTS ext_periodic_reports_type_idx ON ext_periodic_reports(report_type);

CREATE TABLE IF NOT EXISTS ext_periodic_report_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES ext_periodic_reports(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 3 AND 200),
  actor TEXT NOT NULL CHECK (char_length(actor) BETWEEN 2 AND 200),
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EXT-14 inteligência comercial
CREATE TABLE IF NOT EXISTS ext_commercial_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^INTEL-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  intel_type ext_intel_type NOT NULL DEFAULT 'oportunidade',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  source_module TEXT NOT NULL CHECK (char_length(source_module) BETWEEN 3 AND 100),
  source_reference TEXT CHECK (source_reference IS NULL OR char_length(source_reference) BETWEEN 3 AND 200),
  related_client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  related_contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  score INT CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  status ext_intel_status NOT NULL DEFAULT 'sugerida',
  is_human_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  converted_to_opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_commercial_intelligence_protocol_idx ON ext_commercial_intelligence(protocol);
CREATE INDEX IF NOT EXISTS ext_commercial_intelligence_type_idx ON ext_commercial_intelligence(intel_type);
CREATE INDEX IF NOT EXISTS ext_commercial_intelligence_status_idx ON ext_commercial_intelligence(status);

-- EXT-15 apoio emergencial
CREATE TABLE IF NOT EXISTS ext_emergency_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  channel_type ext_emergency_channel NOT NULL DEFAULT 'telefone',
  recipient_name TEXT NOT NULL CHECK (char_length(recipient_name) BETWEEN 2 AND 200),
  recipient_contact TEXT NOT NULL CHECK (char_length(recipient_contact) BETWEEN 5 AND 320),
  availability TEXT NOT NULL CHECK (char_length(availability) BETWEEN 10 AND 1000),
  escalation_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  status ext_emergency_status NOT NULL DEFAULT 'rascunho',
  is_tested BOOLEAN NOT NULL DEFAULT false,
  last_tested_at TIMESTAMPTZ,
  test_result TEXT CHECK (test_result IS NULL OR char_length(test_result) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_emergency_tested_requires_test CHECK ((is_tested = false) OR (last_tested_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ext_emergency_channels_status_idx ON ext_emergency_channels(status);

CREATE TABLE IF NOT EXISTS ext_emergency_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES ext_emergency_channels(id) ON DELETE CASCADE,
  test_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result TEXT NOT NULL CHECK (char_length(result) BETWEEN 10 AND 2000),
  tested_by_name TEXT NOT NULL CHECK (char_length(tested_by_name) BETWEEN 2 AND 200),
  tested_by_identity UUID REFERENCES auth_identities(id),
  is_success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EXT-16 central/vídeo projeto separado
CREATE TABLE IF NOT EXISTS ext_central_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^CENT-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  scope TEXT NOT NULL CHECK (char_length(scope) BETWEEN 10 AND 2000),
  provider TEXT CHECK (provider IS NULL OR char_length(provider) BETWEEN 3 AND 200),
  estimated_cost_cents BIGINT CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents >=0),
  privacy_assessment TEXT NOT NULL CHECK (char_length(privacy_assessment) BETWEEN 20 AND 2000),
  is_privacy_approved BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_central_projects_protocol_idx ON ext_central_projects(protocol);

CREATE TABLE IF NOT EXISTS ext_central_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES ext_central_projects(id) ON DELETE CASCADE,
  event_type ext_central_event_type NOT NULL DEFAULT 'outro',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  client_account_id UUID REFERENCES client_accounts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  status ext_central_status NOT NULL DEFAULT 'recebido',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_central_events_project_idx ON ext_central_events(project_id);
CREATE INDEX IF NOT EXISTS ext_central_events_type_idx ON ext_central_events(event_type);

-- EXT-17 biometria/reconhecimento projeto separado
CREATE TABLE IF NOT EXISTS ext_biometry_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^BIO-EXT-[0-9]{8}-[A-Z0-9]{4}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  necessity TEXT NOT NULL CHECK (char_length(necessity) BETWEEN 20 AND 2000),
  impact_assessment TEXT NOT NULL CHECK (char_length(impact_assessment) BETWEEN 20 AND 2000),
  legal_basis TEXT NOT NULL CHECK (char_length(legal_basis) BETWEEN 10 AND 1000),
  biometry_type ext_biometry_type NOT NULL DEFAULT 'facial',
  status ext_biometry_status NOT NULL DEFAULT 'rascunho',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  is_collection_active BOOLEAN NOT NULL DEFAULT false,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ext_biometry_collection_requires_approval CHECK ((is_collection_active = false) OR (is_approved = true))
);
CREATE INDEX IF NOT EXISTS ext_biometry_projects_protocol_idx ON ext_biometry_projects(protocol);
CREATE INDEX IF NOT EXISTS ext_biometry_projects_status_idx ON ext_biometry_projects(status);

-- AI-10 automações determinísticas vencimentos distribuição tarefas cobrança interna antes agentes autônomos
CREATE TABLE IF NOT EXISTS ai_deterministic_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  automation_type ai_automation_type NOT NULL DEFAULT 'outro',
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status ai_automation_status NOT NULL DEFAULT 'rascunho',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INT NOT NULL DEFAULT 0 CHECK (run_count >=0),
  error_count INT NOT NULL DEFAULT 0 CHECK (error_count >=0),
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) BETWEEN 10 AND 1000),
  is_deterministic BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_automations_type_idx ON ai_deterministic_automations(automation_type);
CREATE INDEX IF NOT EXISTS ai_automations_status_idx ON ai_deterministic_automations(status);

CREATE TABLE IF NOT EXISTS ai_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES ai_deterministic_automations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 3 AND 200),
  target_type TEXT CHECK (target_type IS NULL OR char_length(target_type) BETWEEN 3 AND 100),
  target_id TEXT CHECK (target_id IS NULL OR char_length(target_id) BETWEEN 3 AND 200),
  result TEXT NOT NULL CHECK (char_length(result) BETWEEN 10 AND 1000),
  is_error BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_automation_logs_automation_idx ON ai_automation_logs(automation_id);

-- Triggers
CREATE OR REPLACE FUNCTION ext_touch_updated_at3() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_periodic_reports_touch ON ext_periodic_reports; CREATE TRIGGER ext_periodic_reports_touch BEFORE UPDATE ON ext_periodic_reports FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at3();
DROP TRIGGER IF EXISTS ext_commercial_intelligence_touch ON ext_commercial_intelligence; CREATE TRIGGER ext_commercial_intelligence_touch BEFORE UPDATE ON ext_commercial_intelligence FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at3();
DROP TRIGGER IF EXISTS ext_emergency_channels_touch ON ext_emergency_channels; CREATE TRIGGER ext_emergency_channels_touch BEFORE UPDATE ON ext_emergency_channels FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at3();
DROP TRIGGER IF EXISTS ext_central_projects_touch ON ext_central_projects; CREATE TRIGGER ext_central_projects_touch BEFORE UPDATE ON ext_central_projects FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at3();
DROP TRIGGER IF EXISTS ext_biometry_projects_touch ON ext_biometry_projects; CREATE TRIGGER ext_biometry_projects_touch BEFORE UPDATE ON ext_biometry_projects FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at3();
DROP TRIGGER IF EXISTS ai_deterministic_automations_touch ON ai_deterministic_automations; CREATE TRIGGER ai_deterministic_automations_touch BEFORE UPDATE ON ai_deterministic_automations FOR EACH ROW EXECUTE FUNCTION ext_touch_updated_at3();

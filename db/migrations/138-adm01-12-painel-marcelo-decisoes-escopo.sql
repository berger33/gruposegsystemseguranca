-- ADM-01..12 — painel funcional do Marcelo.
--
-- Migração ADITIVA: nenhuma migração 001–137 é reescrita, nenhuma linha é
-- apagada e nenhuma autoria histórica é inventada. As constraints novas são
-- NOT VALID: valem para toda escrita nova sem recusar retroativamente linhas
-- antigas que nasceram sem identidade registrada.
--
-- Nada externo é criado: sem PSP, banco, SMTP, emissão, pagamento ou dado de
-- cliente. Os indicadores do painel são calculados por leitura dos registros
-- canônicos existentes; esta migração só adiciona a trilha das decisões
-- unificadas (ADM-06), o escopo por identidade (ADM-07), a idempotência e os
-- destinatários autorizados dos relatórios (ADM-08) e os marcadores que
-- impedem confundir estimativa com resultado (ADM-10/ADM-12).

-- (1) ADM-06 — decisão unificada sobre o registro canônico.
-- A decisão nunca substitui o registro de origem: ela aponta para ele
-- (fin_expenses / crm_discount_requests), guarda o snapshot da alçada aplicada
-- e deriva a autoria da sessão. A segregação é exigida também no banco.
CREATE TABLE IF NOT EXISTS adm_panel_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('fin_expense','crm_discount_request')),
  source_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('aprovada','rejeitada')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  authority_limit_cents BIGINT CHECK (authority_limit_cents IS NULL OR authority_limit_cents >= 0),
  requester_identity UUID REFERENCES auth_identities(id),
  decided_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key),
  UNIQUE (source_kind, source_id),
  CONSTRAINT adm_panel_decision_segregation
    CHECK (requester_identity IS NULL OR requester_identity <> decided_by_identity),
  CONSTRAINT adm_panel_decision_authority_snapshot
    CHECK (decision <> 'aprovada' OR (authority_limit_cents IS NOT NULL AND authority_limit_cents >= amount_cents))
);
CREATE INDEX IF NOT EXISTS adm_panel_decisions_source_idx ON adm_panel_decisions(source_kind, source_id);
CREATE INDEX IF NOT EXISTS adm_panel_decisions_decider_idx ON adm_panel_decisions(decided_by_identity);

CREATE TABLE IF NOT EXISTS adm_panel_decision_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES adm_panel_decisions(id) ON DELETE RESTRICT,
  source_kind TEXT NOT NULL,
  source_id UUID NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  authority_limit_cents BIGINT,
  changed_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS adm_panel_decision_history_decision_idx ON adm_panel_decision_history(decision_id);

CREATE OR REPLACE FUNCTION adm_panel_decision_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'adm_panel_decision_history_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_adm_panel_decision_history_immutable ON adm_panel_decision_history;
CREATE TRIGGER trg_adm_panel_decision_history_immutable
  BEFORE UPDATE OR DELETE ON adm_panel_decision_history
  FOR EACH ROW EXECUTE FUNCTION adm_panel_decision_history_immutable();

CREATE OR REPLACE FUNCTION adm_panel_decision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'adm_panel_decision_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_adm_panel_decision_immutable ON adm_panel_decisions;
CREATE TRIGGER trg_adm_panel_decision_immutable
  BEFORE UPDATE OR DELETE ON adm_panel_decisions
  FOR EACH ROW EXECUTE FUNCTION adm_panel_decision_immutable();

-- (2) ADM-07 — o escopo do espaço de trabalho é por identidade. Linhas antigas
-- sem identidade continuam existindo; nenhuma escrita nova pode nascer órfã.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_search_favorites_owner_required') THEN
    ALTER TABLE adm_search_favorites ADD CONSTRAINT adm_search_favorites_owner_required
      CHECK (user_identity IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_saved_filters_owner_required') THEN
    ALTER TABLE adm_saved_filters ADD CONSTRAINT adm_saved_filters_owner_required
      CHECK (user_identity IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_shortcuts_owner_required') THEN
    ALTER TABLE adm_shortcuts ADD CONSTRAINT adm_shortcuts_owner_required
      CHECK (user_identity IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- (3) ADM-08 — relatório com retry idempotente, destinatário autorizado
-- interno e autoria obrigatória. Nenhum envio externo: `recipient_identity`
-- é sempre uma identidade do próprio sistema.
ALTER TABLE adm_reports
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS recipient_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS source_tables TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS as_of TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS adm_reports_idempotency_key_uq
  ON adm_reports(idempotency_key) WHERE idempotency_key IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_reports_idempotency_key_format') THEN
    ALTER TABLE adm_reports ADD CONSTRAINT adm_reports_idempotency_key_format
      CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 200) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_reports_fingerprint_format') THEN
    ALTER TABLE adm_reports ADD CONSTRAINT adm_reports_fingerprint_format
      CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_reports_author_required') THEN
    ALTER TABLE adm_reports ADD CONSTRAINT adm_reports_author_required
      CHECK (created_by_identity IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_report_logs_actor_required') THEN
    ALTER TABLE adm_report_logs ADD CONSTRAINT adm_report_logs_actor_required
      CHECK (actor_identity IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- (4) ADM-09 — configuração de negócio versionada com autoria obrigatória e
-- encadeamento explícito entre versões.
ALTER TABLE adm_business_configs
  ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES adm_business_configs(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_business_configs_author_required') THEN
    ALTER TABLE adm_business_configs ADD CONSTRAINT adm_business_configs_author_required
      CHECK (created_by_identity IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_business_config_history_author_required') THEN
    ALTER TABLE adm_business_config_history ADD CONSTRAINT adm_business_config_history_author_required
      CHECK (changed_by_identity IS NOT NULL) NOT VALID;
  END IF;
END $$;
-- Só existe uma versão ativa por chave: versões anteriores ficam preservadas.
CREATE UNIQUE INDEX IF NOT EXISTS adm_business_configs_active_key_uq
  ON adm_business_configs(config_key) WHERE is_active = true;

-- (5) ADM-10/ADM-12 — resultado realizado exige a fonte canônica que o
-- produziu; estimativa sem fonte nunca é apresentada como realizado.
ALTER TABLE adm_goals_comparison
  ADD COLUMN IF NOT EXISTS realized_source TEXT,
  ADD COLUMN IF NOT EXISTS realized_as_of TIMESTAMPTZ;
ALTER TABLE adm_expansion_analyses
  ADD COLUMN IF NOT EXISTS source_tables TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS computed_as_of TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_goals_realized_requires_source') THEN
    ALTER TABLE adm_goals_comparison ADD CONSTRAINT adm_goals_realized_requires_source
      CHECK (realized_value IS NULL OR (realized_source IS NOT NULL AND char_length(realized_source) BETWEEN 3 AND 200)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_expansion_real_requires_source') THEN
    ALTER TABLE adm_expansion_analyses ADD CONSTRAINT adm_expansion_real_requires_source
      CHECK (is_real_data = false OR array_length(source_tables, 1) IS NOT NULL OR computed_as_of IS NULL) NOT VALID;
  END IF;
END $$;

-- (6) ADM-11 — todo acesso novo ao diário de decisões CON-11 tem acessor
-- identificado; os acessos antigos permanecem como estão.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='adm_diary_access_accessor_required') THEN
    ALTER TABLE adm_management_diary_access ADD CONSTRAINT adm_diary_access_accessor_required
      CHECK (accessor_identity IS NOT NULL) NOT VALID;
  END IF;
END $$;

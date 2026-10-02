-- FIN-13 — fatia aditiva de correção do orçamento gerencial (2026-10-01).
--
-- Esta migração é ADITIVA. Ela não altera, não recria e não substitui nenhuma
-- migração 001–133; em particular, a 132 permanece exatamente como foi
-- aplicada. Aqui só entram colunas novas, índices novos, constraints novas
-- (NOT VALID, para não reprovar retroativamente linhas antigas) e a
-- substituição por CREATE OR REPLACE das funções de gatilho declaradas na 132.
--
-- Lacunas tratadas (docs/CONSOLIDACAO-L07-PRS-PENDENTES.md):
--   1. conteúdo de orçamento aprovado podia ser editado mantendo a aprovação;
--   2. percentual de margem do cenário vinha do navegador sem conferência;
--   3. criação de orçamento não tinha chave de idempotência própria;
--   4. histórico não permitia reconstruir a revisão (sem snapshot, sem autor
--      real, sem versão, sem motivo da edição).
--
-- Tratamento explícito de linhas antigas:
--   * fin_budgets pré-existentes recebem version=1 e idempotency_key NULL —
--     nenhuma revisão foi registrada para elas e nenhuma autoria é inventada;
--   * fin_budget_scenarios pré-existentes são marcados margin_source =
--     'legado_informado', preservando o percentual que já estava gravado. A
--     constraint de coerência entra como NOT VALID justamente para não
--     reescrever nem reprovar esses números históricos;
--   * fin_budget_history pré-existente fica com event_type/snapshot nulos,
--     indicando honestamente "histórico legado, sem snapshot disponível".

-- ---------------------------------------------------------------------------
-- 1. Orçamento: versão, revisão explícita, idempotência e margem calculada.
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS revision_reason TEXT;
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS revised_by_identity UUID REFERENCES auth_identities(id);
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ;

-- Margem percentual do orçamento: derivada SEMPRE de receita e custo, nunca
-- recebida pronta. Receita zero e base incompleta não viram 0% nem infinito —
-- o percentual fica ausente e margin_basis diz o motivo.
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS total_margin_percent NUMERIC(12,4)
  GENERATED ALWAYS AS (
    CASE
      WHEN total_revenue_cents IS NULL OR total_cost_cents IS NULL THEN NULL
      WHEN total_revenue_cents = 0 THEN NULL
      ELSE round(((total_revenue_cents - total_cost_cents)::numeric * 100) / total_revenue_cents::numeric, 4)
    END
  ) STORED;
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS margin_basis TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN total_revenue_cents IS NULL OR total_cost_cents IS NULL THEN 'dados_incompletos'
      WHEN total_revenue_cents = 0 THEN 'receita_zero_sem_percentual'
      ELSE 'calculada'
    END
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS fin_budgets_idempotency_key_uidx
  ON fin_budgets(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_budgets_title_idx ON fin_budgets(title);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_budget_version_positive') THEN
    ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_version_positive CHECK (version >= 1) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_budget_idempotency_key_shape') THEN
    ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_idempotency_key_shape
      CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 200) NOT VALID;
  END IF;
  -- Chave de idempotência sem impressão do conteúdo não permitiria recusar
  -- reuso com conteúdo diferente; as duas andam juntas.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_budget_idempotency_requires_fingerprint') THEN
    ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_idempotency_requires_fingerprint
      CHECK (idempotency_key IS NULL OR content_fingerprint IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_budget_revision_fields_coherent') THEN
    ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_revision_fields_coherent
      CHECK (
        (revision_reason IS NULL AND revised_by_identity IS NULL AND revised_at IS NULL)
        OR (char_length(revision_reason) BETWEEN 10 AND 1000 AND revised_by_identity IS NOT NULL AND revised_at IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Cenários: margem conferida no banco, com motivo quando não há base.
-- ---------------------------------------------------------------------------
-- A coluna legada projected_margin_percent é NUMERIC(5,2) e só aceita -100..100.
-- computed_margin_percent é a fonte autoritativa (sem truncar faixa); a legada
-- passa a ser um espelho do cálculo, nula quando a base é insuficiente ou
-- quando o percentual real não cabe na faixa histórica da coluna.
ALTER TABLE fin_budget_scenarios ADD COLUMN IF NOT EXISTS computed_margin_percent NUMERIC(12,4)
  GENERATED ALWAYS AS (
    CASE
      WHEN projected_revenue_cents IS NULL OR projected_cost_cents IS NULL THEN NULL
      WHEN projected_revenue_cents = 0 THEN NULL
      ELSE round(((projected_revenue_cents - projected_cost_cents)::numeric * 100) / projected_revenue_cents::numeric, 4)
    END
  ) STORED;
ALTER TABLE fin_budget_scenarios ADD COLUMN IF NOT EXISTS margin_basis TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN projected_revenue_cents IS NULL OR projected_cost_cents IS NULL THEN 'dados_incompletos'
      WHEN projected_revenue_cents = 0 THEN 'receita_zero_sem_percentual'
      ELSE 'calculada'
    END
  ) STORED;

-- Marcação explícita das linhas antigas: elas conservam o percentual que foi
-- informado no passado e ficam identificadas como tal, sem reescrita.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='fin_budget_scenarios' AND column_name='margin_source'
  ) THEN
    ALTER TABLE fin_budget_scenarios ADD COLUMN margin_source TEXT NOT NULL DEFAULT 'servidor_calculado';
    UPDATE fin_budget_scenarios SET margin_source='legado_informado';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_scenario_margin_source_valid') THEN
    ALTER TABLE fin_budget_scenarios ADD CONSTRAINT fin_scenario_margin_source_valid
      CHECK (margin_source IN ('servidor_calculado','legado_informado')) NOT VALID;
  END IF;
  -- Conferência de margem no banco: o percentual gravado tem de ser o cálculo
  -- de receita e custo, ou ausente quando não há base. NOT VALID preserva as
  -- linhas históricas sem apagá-las nem fingir que foram validadas.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_scenario_margin_percent_matches_base') THEN
    ALTER TABLE fin_budget_scenarios ADD CONSTRAINT fin_scenario_margin_percent_matches_base
      CHECK (
        projected_margin_percent IS NOT DISTINCT FROM (
          CASE
            WHEN projected_revenue_cents IS NULL OR projected_cost_cents IS NULL OR projected_revenue_cents = 0 THEN NULL
            WHEN round(((projected_revenue_cents - projected_cost_cents)::numeric * 100) / projected_revenue_cents::numeric, 2) BETWEEN -100 AND 100
              THEN round(((projected_revenue_cents - projected_cost_cents)::numeric * 100) / projected_revenue_cents::numeric, 2)
            ELSE NULL
          END
        )
      ) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Histórico: snapshots, versões, autoria real e classificação do evento.
-- ---------------------------------------------------------------------------
ALTER TABLE fin_budget_history ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE fin_budget_history ADD COLUMN IF NOT EXISTS snapshot_before JSONB;
ALTER TABLE fin_budget_history ADD COLUMN IF NOT EXISTS snapshot_after JSONB;
ALTER TABLE fin_budget_history ADD COLUMN IF NOT EXISTS version_before INTEGER;
ALTER TABLE fin_budget_history ADD COLUMN IF NOT EXISTS version_after INTEGER;

DO $$ BEGIN
  -- NULL continua permitido: é exatamente o histórico legado gravado pela 132,
  -- que não tem snapshot e não deve ser rotulado por suposição.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_budget_history_event_type_valid') THEN
    ALTER TABLE fin_budget_history ADD CONSTRAINT fin_budget_history_event_type_valid
      CHECK (event_type IS NULL OR event_type IN ('criacao','edicao','revisao','decisao')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Gatilhos: congelamento do aprovado, revisão disciplinada e captura real.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin_budget_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_content_changed BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_content_changed := (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.premises IS DISTINCT FROM OLD.premises
      OR NEW.period_start IS DISTINCT FROM OLD.period_start
      OR NEW.period_end IS DISTINCT FROM OLD.period_end
      OR NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents
      OR NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents
    );

    -- Arquivado é terminal.
    IF OLD.status = 'arquivado' THEN
      RAISE EXCEPTION 'fin_budget_archived_locked';
    END IF;

    -- Transições permitidas; aprovado -> em_revisao existe apenas como revisão
    -- explícita e disciplinada (abaixo).
    IF NEW.status <> OLD.status AND NOT (
      (OLD.status = 'rascunho' AND NEW.status = 'em_revisao')
      OR (OLD.status = 'em_revisao' AND NEW.status IN ('aprovado','rejeitado'))
      OR (OLD.status IN ('aprovado','rejeitado') AND NEW.status = 'arquivado')
      OR (OLD.status = 'aprovado' AND NEW.status = 'em_revisao')
    ) THEN
      RAISE EXCEPTION 'fin_budget_invalid_transition';
    END IF;

    -- Edição ordinária de orçamento aprovado é recusada pelo próprio banco.
    IF OLD.status = 'aprovado' AND v_content_changed AND NEW.status <> 'em_revisao' THEN
      RAISE EXCEPTION 'fin_budget_approved_content_locked';
    END IF;

    -- Revisão de orçamento aprovado: motivo, autor, data e nova versão, com a
    -- aprovação anterior necessariamente retirada.
    IF OLD.status = 'aprovado' AND NEW.status = 'em_revisao' THEN
      IF NEW.version <= OLD.version
         OR NEW.approved_by_identity IS NOT NULL
         OR NEW.approved_at IS NOT NULL
         OR NEW.revision_reason IS NULL
         OR char_length(btrim(NEW.revision_reason)) < 10
         OR NEW.revised_by_identity IS NULL
         OR NEW.revised_at IS NULL THEN
        RAISE EXCEPTION 'fin_budget_revision_requires_reason_author_and_version';
      END IF;
    END IF;

    -- Versão só se move em revisão: ninguém "renumera" um orçamento.
    IF NEW.version IS DISTINCT FROM OLD.version
       AND NOT (OLD.status = 'aprovado' AND NEW.status = 'em_revisao') THEN
      RAISE EXCEPTION 'fin_budget_version_only_changes_on_revision';
    END IF;
  END IF;

  -- Nenhum número ou premissa pode conviver com aprovação fora do estado
  -- aprovado: rascunho e revisão nunca carregam aprovação antiga.
  IF NEW.status IN ('rascunho','em_revisao') AND (NEW.approved_by_identity IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'fin_budget_approval_must_be_cleared';
  END IF;
  IF NEW.status = 'aprovado' AND (NEW.approved_by_identity IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'fin_budget_approval_requires_auditor';
  END IF;

  NEW.is_estimate := true;
  NEW.estimate_note := CASE
    WHEN NEW.estimate_note ILIKE '%não prometer%' THEN NEW.estimate_note
    ELSE 'estimativa com premissas explícitas; não prometer resultado'
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_budget_guard ON fin_budgets;
CREATE TRIGGER trg_fin_budget_guard BEFORE INSERT OR UPDATE ON fin_budgets
  FOR EACH ROW EXECUTE FUNCTION fin_budget_guard();

-- Captura de histórico: agora cobre também edição de conteúdo (a 132 só
-- disparava em mudança de status) e grava snapshot, versão, autor real e
-- motivo. O autor e o motivo chegam por GUC transacional definida pela API na
-- MESMA transação; sem isso, o registro diz explicitamente que a origem não
-- informou, em vez de atribuir autoria por suposição.
CREATE OR REPLACE FUNCTION fin_budget_history_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor UUID;
  v_event TEXT;
  v_reason TEXT;
  v_status_changed BOOLEAN := false;
  v_content_changed BOOLEAN := false;
BEGIN
  BEGIN
    v_actor := nullif(current_setting('seg.fin_budget_actor', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_actor := NULL;
  END;
  v_event := nullif(current_setting('seg.fin_budget_event', true), '');
  v_reason := nullif(current_setting('seg.fin_budget_reason', true), '');

  IF TG_OP = 'UPDATE' THEN
    v_status_changed := NEW.status IS DISTINCT FROM OLD.status;
    v_content_changed := (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.premises IS DISTINCT FROM OLD.premises
      OR NEW.period_start IS DISTINCT FROM OLD.period_start
      OR NEW.period_end IS DISTINCT FROM OLD.period_end
      OR NEW.total_revenue_cents IS DISTINCT FROM OLD.total_revenue_cents
      OR NEW.total_cost_cents IS DISTINCT FROM OLD.total_cost_cents
      OR NEW.version IS DISTINCT FROM OLD.version
    );
    IF NOT v_status_changed AND NOT v_content_changed THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_event IS NULL OR v_event NOT IN ('criacao','edicao','revisao','decisao') THEN
    v_event := CASE
      WHEN TG_OP = 'INSERT' THEN 'criacao'
      WHEN OLD.status = 'aprovado' AND NEW.status = 'em_revisao' THEN 'revisao'
      WHEN v_status_changed THEN 'decisao'
      ELSE 'edicao'
    END;
  END IF;

  IF v_reason IS NULL THEN
    v_reason := CASE
      WHEN TG_OP = 'INSERT' THEN 'Criação de orçamento registrada sem motivo informado pela origem'
      ELSE 'Alteração de orçamento registrada sem motivo informado pela origem'
    END;
  END IF;
  v_reason := left(v_reason, 1000);
  IF char_length(v_reason) < 10 THEN
    v_reason := v_reason || ' (motivo abaixo do mínimo registrável)';
  END IF;

  INSERT INTO fin_budget_history (
    budget_id, previous_status, next_status, changed_by_identity, reason, metadata,
    event_type, snapshot_before, snapshot_after, version_before, version_after
  ) VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    v_actor,
    v_reason,
    jsonb_build_object('estimate', true, 'operation', TG_OP, 'actor_informed', v_actor IS NOT NULL),
    v_event,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    to_jsonb(NEW),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.version END,
    NEW.version
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_budget_history_capture ON fin_budgets;
CREATE TRIGGER trg_fin_budget_history_capture AFTER INSERT OR UPDATE ON fin_budgets
  FOR EACH ROW EXECUTE FUNCTION fin_budget_history_capture();

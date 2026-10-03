-- EXT-06 — jornada canônica de satisfação/carteira.
--
-- Decisão de fonte: endurece e reaproveita cli_satisfaction_surveys /
-- cli_satisfaction_action_plans (CLI-09..14, migrações 076 e 142), que já
-- tinham destinatário autenticado, resposta idempotente por identidade e
-- plano derivado de responsável real. ext_satisfaction_surveys (085)
-- permanece LEGADO, somente leitura: não recebe autoridade nem autoria
-- retroativa nesta migração.
--
-- Critério de aceite imposto aqui e na API: "Resposta gera acompanhamento
-- sem expor funcionário". Metodologia/escala são declaradas por pesquisa;
-- nenhum limiar global fica embutido no código ou no banco.
BEGIN;

-- 1. Metodologia, escala e regra de acompanhamento declaradas na pesquisa.
ALTER TABLE cli_satisfaction_surveys
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'jornada_canonica',
  ADD COLUMN IF NOT EXISTS methodology TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS scale_min INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scale_max INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS methodology_source TEXT,
  ADD COLUMN IF NOT EXISTS classification_rule JSONB,
  ADD COLUMN IF NOT EXISTS recovery_rule JSONB NOT NULL DEFAULT '{"trigger":"none"}'::jsonb,
  ADD COLUMN IF NOT EXISTS score_classification TEXT,
  ADD COLUMN IF NOT EXISTS recovery_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS recovery_facts JSONB,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT,
  ADD COLUMN IF NOT EXISTS concluded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluded_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conclusion_result TEXT;

-- Registros anteriores a esta fatia (sem destinatário autenticado) ficam
-- marcados como legado; nenhuma autoria ou destinatário é inventado.
UPDATE cli_satisfaction_surveys SET origin='registro_legado' WHERE target_identity_id IS NULL;

-- `status` passava por ENUM fechado (pendente/respondida/em_acao/concluida).
-- Passa a TEXT com CHECK para acrescentar o estado terminal `cancelada` sem
-- depender de ALTER TYPE ... ADD VALUE dentro da transação da migração.
ALTER TABLE cli_satisfaction_surveys ALTER COLUMN status DROP DEFAULT;
ALTER TABLE cli_satisfaction_surveys ALTER COLUMN status TYPE TEXT USING status::text;
ALTER TABLE cli_satisfaction_surveys ALTER COLUMN status SET DEFAULT 'pendente';

DO $$
DECLARE c RECORD;
BEGIN
  -- A escala passa a ser declarada por pesquisa; a checagem fixa em 0..10
  -- criada em 076 é substituída por uma que referencia scale_min/scale_max.
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'cli_satisfaction_surveys'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%score%BETWEEN 0 AND 10%'
  LOOP
    EXECUTE format('ALTER TABLE cli_satisfaction_surveys DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_origin_check
  CHECK (origin IN ('jornada_canonica', 'registro_legado')) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_status_check
  CHECK (status IN ('pendente', 'respondida', 'em_acao', 'concluida', 'cancelada')) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_methodology_check
  CHECK (methodology IN ('none', 'csat', 'nps')) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_scale_check
  CHECK (scale_min >= 0 AND scale_max <= 10 AND scale_max > scale_min) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_score_scale_check
  CHECK (score IS NULL OR (score BETWEEN scale_min AND scale_max)) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_methodology_fields_check
  CHECK (
    methodology = 'none'
    OR (methodology_source IS NOT NULL AND char_length(methodology_source) BETWEEN 10 AND 300 AND classification_rule IS NOT NULL)
  ) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_nps_scale_check
  CHECK (methodology <> 'nps' OR (scale_min = 0 AND scale_max = 10)) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_classification_requires_methodology_check
  CHECK (score_classification IS NULL OR methodology IN ('csat', 'nps')) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_recovery_rule_shape_check
  CHECK (recovery_rule ? 'trigger') NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_recovery_requires_response_check
  CHECK (recovery_required IS NULL OR responded_at IS NOT NULL) NOT VALID;
-- Jornada canônica nova nunca fica sem destinatário: pesquisa sem identidade
-- cliente destinatária não é exposta no portal (requisito de fronteira).
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_canonical_target_check
  CHECK (origin <> 'jornada_canonica' OR target_identity_id IS NOT NULL) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_cancel_shape_check
  CHECK (
    (status <> 'cancelada' AND cancelled_at IS NULL AND cancelled_by_identity IS NULL AND cancellation_justification IS NULL)
    OR (status = 'cancelada' AND cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL AND char_length(cancellation_justification) BETWEEN 10 AND 1000)
  ) NOT VALID;
ALTER TABLE cli_satisfaction_surveys ADD CONSTRAINT cli_satisfaction_surveys_conclude_shape_check
  CHECK (
    (status <> 'concluida' AND concluded_at IS NULL AND concluded_by_identity IS NULL AND conclusion_result IS NULL)
    OR (status = 'concluida' AND concluded_at IS NOT NULL AND concluded_by_identity IS NOT NULL AND char_length(conclusion_result) BETWEEN 5 AND 1000)
  ) NOT VALID;

COMMENT ON COLUMN cli_satisfaction_surveys.origin IS
  'jornada_canonica = criada após EXT-06 com destinatário autenticado; registro_legado = dado histórico sem destinatário/metodologia, nunca reclassificado por presunção.';
COMMENT ON COLUMN cli_satisfaction_surveys.recovery_rule IS
  'Regra declarada no momento da criação da pesquisa que decide se a resposta exige acompanhamento; nunca um limiar global de código.';
COMMENT ON COLUMN cli_satisfaction_surveys.recovery_facts IS
  'Fatos e regra que dispararam (ou não) o acompanhamento no momento da resposta; nunca recalculado depois.';

-- 2. Plano de ação/recuperação: máquina de estados completa com conclusão e
-- cancelamento explícitos (aberta/em_andamento/concluida/cancelada já
-- existiam em 076; faltavam os campos que provam autor, data e resultado).
ALTER TABLE cli_satisfaction_action_plans
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_result TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_justification TEXT;

ALTER TABLE cli_satisfaction_action_plans ADD CONSTRAINT cli_satisfaction_action_plans_complete_shape_check
  CHECK (
    status <> 'concluida'
    OR (completed_at IS NOT NULL AND completed_by_identity IS NOT NULL AND responsible_identity_id IS NOT NULL
        AND char_length(completion_result) BETWEEN 5 AND 1000)
  ) NOT VALID;
ALTER TABLE cli_satisfaction_action_plans ADD CONSTRAINT cli_satisfaction_action_plans_cancel_shape_check
  CHECK (
    status <> 'cancelada'
    OR (cancelled_at IS NOT NULL AND cancelled_by_identity IS NOT NULL AND char_length(cancellation_justification) BETWEEN 10 AND 1000)
  ) NOT VALID;
ALTER TABLE cli_satisfaction_action_plans ADD CONSTRAINT cli_satisfaction_action_plans_start_shape_check
  CHECK ((started_at IS NULL) = (started_by_identity IS NULL)) NOT VALID;

COMMENT ON COLUMN cli_satisfaction_action_plans.completion_result IS
  'Resultado/nota de conclusão exigido pela API antes de fechar o plano; nunca vazio.';

-- 3. Histórico imutável de eventos (auditoria de negócio + idempotência das
-- mutações staff). A resposta do portal usa seu próprio índice (142); este
-- ledger cobre as mutações administrativas e também registra a resposta
-- para dar ao staff um histórico único e consolidado.
CREATE TABLE IF NOT EXISTS cli_satisfaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES cli_satisfaction_surveys(id) ON DELETE RESTRICT,
  action_plan_id UUID REFERENCES cli_satisfaction_action_plans(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 100),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 500),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('staff', 'client', 'system')),
  idempotency_key VARCHAR(200),
  request_fingerprint CHAR(64),
  created_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (survey_id IS NOT NULL OR action_plan_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS cli_satisfaction_events_identity_idem_key
  ON cli_satisfaction_events (created_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cli_satisfaction_events_survey_idx
  ON cli_satisfaction_events (survey_id, created_at);
CREATE INDEX IF NOT EXISTS cli_satisfaction_events_plan_idx
  ON cli_satisfaction_events (action_plan_id, created_at);

CREATE OR REPLACE FUNCTION cli_satisfaction_immutable_row() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'satisfaction historical record is immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cli_satisfaction_events_immutable
  BEFORE UPDATE OR DELETE ON cli_satisfaction_events
  FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_immutable_row();

-- 4. Máquina de estados imposta no banco, não só na API.
CREATE OR REPLACE FUNCTION cli_satisfaction_guard_survey_update() RETURNS TRIGGER AS $$
DECLARE plan_status TEXT;
BEGIN
  IF OLD.origin = 'jornada_canonica' AND (
       NEW.client_account_id IS DISTINCT FROM OLD.client_account_id
    OR NEW.target_identity_id IS DISTINCT FROM OLD.target_identity_id
    OR NEW.methodology IS DISTINCT FROM OLD.methodology
    OR NEW.scale_min IS DISTINCT FROM OLD.scale_min
    OR NEW.scale_max IS DISTINCT FROM OLD.scale_max
    OR NEW.classification_rule IS DISTINCT FROM OLD.classification_rule
    OR NEW.recovery_rule IS DISTINCT FROM OLD.recovery_rule
    OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
    OR NEW.origin IS DISTINCT FROM OLD.origin
  ) THEN
    RAISE EXCEPTION 'canonical satisfaction survey configuration is immutable';
  END IF;

  IF OLD.responded_at IS NOT NULL AND (
       NEW.score IS DISTINCT FROM OLD.score
    OR NEW.feedback IS DISTINCT FROM OLD.feedback
    OR NEW.responded_by_identity IS DISTINCT FROM OLD.responded_by_identity
    OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
    OR NEW.score_classification IS DISTINCT FROM OLD.score_classification
    OR NEW.recovery_required IS DISTINCT FROM OLD.recovery_required
    OR NEW.recovery_facts IS DISTINCT FROM OLD.recovery_facts
  ) THEN
    RAISE EXCEPTION 'satisfaction survey response is immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'terminal satisfaction survey is immutable';
    END IF;
    IF NOT (
         (OLD.status = 'pendente' AND NEW.status IN ('respondida', 'em_acao', 'cancelada'))
      OR (OLD.status = 'respondida' AND NEW.status = 'concluida')
      OR (OLD.status = 'em_acao' AND NEW.status = 'concluida')
    ) THEN
      RAISE EXCEPTION 'invalid satisfaction survey transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    IF NEW.concluded_at IS NULL OR NEW.concluded_by_identity IS NULL OR NEW.conclusion_result IS NULL THEN
      RAISE EXCEPTION 'satisfaction survey conclusion requires author, date and result';
    END IF;
    IF NEW.recovery_required THEN
      SELECT status INTO plan_status FROM cli_satisfaction_action_plans
       WHERE survey_id = NEW.id
       ORDER BY created_at DESC LIMIT 1;
      IF plan_status IS DISTINCT FROM 'concluida' THEN
        RAISE EXCEPTION 'satisfaction survey conclusion requires the recovery plan to be concluded first';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' AND (
       NEW.cancelled_at IS NULL OR NEW.cancelled_by_identity IS NULL OR NEW.cancellation_justification IS NULL
  ) THEN
    RAISE EXCEPTION 'satisfaction survey cancellation requires author, date and justification';
  END IF;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cli_satisfaction_guard_survey_update_trg
  BEFORE UPDATE ON cli_satisfaction_surveys
  FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_guard_survey_update();

-- Defesa em profundidade: contrato/chamado/visita só quando pertencem à
-- mesma conta, e destinatário só quando é identidade cliente ativa com
-- vínculo vigente naquela conta. A API já valida isso; o banco repete.
CREATE OR REPLACE FUNCTION cli_satisfaction_guard_survey_scope() RETURNS TRIGGER AS $$
DECLARE scoped INT;
BEGIN
  IF NEW.contract_id IS NOT NULL THEN
    SELECT count(*) INTO scoped FROM client_contracts WHERE id = NEW.contract_id AND client_account_id = NEW.client_account_id;
    IF scoped = 0 THEN RAISE EXCEPTION 'satisfaction survey contract must belong to the same client account'; END IF;
  END IF;
  IF NEW.ticket_id IS NOT NULL THEN
    SELECT count(*) INTO scoped FROM cli_tickets_v2 WHERE id = NEW.ticket_id AND client_account_id = NEW.client_account_id;
    IF scoped = 0 THEN RAISE EXCEPTION 'satisfaction survey ticket must belong to the same client account'; END IF;
  END IF;
  IF NEW.visit_id IS NOT NULL THEN
    SELECT count(*) INTO scoped FROM cli_visits WHERE id = NEW.visit_id AND client_account_id = NEW.client_account_id;
    IF scoped = 0 THEN RAISE EXCEPTION 'satisfaction survey visit must belong to the same client account'; END IF;
  END IF;
  IF NEW.target_identity_id IS NOT NULL THEN
    SELECT count(*) INTO scoped FROM auth_identities i
      JOIN client_access_grants g ON g.identity_id = i.id AND g.revoked_at IS NULL AND g.client_account_id = NEW.client_account_id
     WHERE i.id = NEW.target_identity_id AND i.kind = 'client' AND i.status = 'active';
    IF scoped = 0 THEN RAISE EXCEPTION 'satisfaction survey target must be an active client identity with a valid grant for the account'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cli_satisfaction_guard_survey_scope_trg
  BEFORE INSERT ON cli_satisfaction_surveys
  FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_guard_survey_scope();

CREATE OR REPLACE FUNCTION cli_satisfaction_guard_plan_update() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.survey_id IS DISTINCT FROM NEW.survey_id OR OLD.responsible_identity_id IS DISTINCT FROM NEW.responsible_identity_id THEN
    RAISE EXCEPTION 'canonical satisfaction plan link is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'terminal satisfaction action plan is immutable';
    END IF;
    IF NOT (
         (OLD.status = 'aberta' AND NEW.status IN ('em_andamento', 'concluida', 'cancelada'))
      OR (OLD.status = 'em_andamento' AND NEW.status IN ('concluida', 'cancelada'))
    ) THEN
      RAISE EXCEPTION 'invalid satisfaction action plan transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER cli_satisfaction_guard_plan_update_trg
  BEFORE UPDATE ON cli_satisfaction_action_plans
  FOR EACH ROW EXECUTE FUNCTION cli_satisfaction_guard_plan_update();

-- 5. ext_satisfaction_surveys (085) permanece legado: documentar, não migrar.
COMMENT ON TABLE ext_satisfaction_surveys IS
  'LEGADO EXT (085): substituído por cli_satisfaction_surveys/142/152 como fonte canônica de EXT-06. Mantido apenas para leitura histórica; src/server/ext-satisfaction-api.mjs não escreve aqui.';

COMMIT;

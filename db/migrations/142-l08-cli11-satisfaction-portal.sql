-- L08 / CLI-11: jornada autenticada de satisfação no portal do cliente.
-- A pesquisa passa a ter destinatário explícito, resposta idempotente por
-- identidade e plano de ação derivado de responsável real, nunca inventado.
-- O risco de renovação continua exigindo fatos registrados (076).

BEGIN;

ALTER TABLE cli_satisfaction_surveys
  ADD COLUMN IF NOT EXISTS target_identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responded_by_identity UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS response_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS action_plan_pending_reason TEXT;

-- Linhas históricas não recebem destinatário nem autoria inventados: ficam
-- NULL e, por isso, não aparecem na jornada autenticada do portal.
ALTER TABLE cli_satisfaction_surveys
  DROP CONSTRAINT IF EXISTS cli_satisfaction_surveys_response_idempotency_check;
ALTER TABLE cli_satisfaction_surveys
  ADD CONSTRAINT cli_satisfaction_surveys_response_idempotency_check
  CHECK (
    (response_idempotency_key IS NULL AND response_fingerprint IS NULL)
    OR
    (char_length(response_idempotency_key) BETWEEN 8 AND 200
      AND response_fingerprint ~ '^[0-9a-f]{64}$')
  ) NOT VALID;

ALTER TABLE cli_satisfaction_surveys
  DROP CONSTRAINT IF EXISTS cli_satisfaction_surveys_pending_reason_check;
ALTER TABLE cli_satisfaction_surveys
  ADD CONSTRAINT cli_satisfaction_surveys_pending_reason_check
  CHECK (action_plan_pending_reason IS NULL OR char_length(action_plan_pending_reason) BETWEEN 10 AND 500)
  NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS cli_satisfaction_surveys_identity_idempotency_key
  ON cli_satisfaction_surveys (responded_by_identity, response_idempotency_key)
  WHERE response_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS cli_satisfaction_surveys_target_idx
  ON cli_satisfaction_surveys (target_identity_id, client_account_id, created_at DESC)
  WHERE target_identity_id IS NOT NULL;

ALTER TABLE cli_satisfaction_action_plans
  ADD COLUMN IF NOT EXISTS responsible_identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_interno',
  ADD COLUMN IF NOT EXISTS facts_json JSONB;

ALTER TABLE cli_satisfaction_action_plans
  DROP CONSTRAINT IF EXISTS cli_satisfaction_action_plans_origin_check;
ALTER TABLE cli_satisfaction_action_plans
  ADD CONSTRAINT cli_satisfaction_action_plans_origin_check
  CHECK (origin IN ('registro_interno','portal_cliente'))
  NOT VALID;

-- Um plano automático por pesquisa: o retry da resposta nunca duplica o plano.
CREATE UNIQUE INDEX IF NOT EXISTS cli_satisfaction_action_plans_portal_unique
  ON cli_satisfaction_action_plans (survey_id)
  WHERE origin = 'portal_cliente';

COMMENT ON COLUMN cli_satisfaction_surveys.target_identity_id IS
  'Identidade cliente destinatária da pesquisa; sem ela a pesquisa não é exposta no portal.';
COMMENT ON COLUMN cli_satisfaction_surveys.responded_by_identity IS
  'Autoria da resposta derivada da sessão do portal, nunca do corpo da requisição.';
COMMENT ON COLUMN cli_satisfaction_surveys.action_plan_pending_reason IS
  'Motivo registrado quando o plano de ação não pôde ser aberto por falta de responsável real no CRM.';
COMMENT ON COLUMN cli_satisfaction_action_plans.facts_json IS
  'Fatos canônicos que justificaram o plano; nenhum número é estimado ou inventado.';

-- A auditoria canônica de acesso participa da mesma transação da resposta.
DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check'
     AND contype = 'c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L)) NOT VALID',
      previous_check, 'satisfaction_survey_list', 'satisfaction_survey_respond'
    );
  END IF;
END
$audit_actions$;

COMMIT;

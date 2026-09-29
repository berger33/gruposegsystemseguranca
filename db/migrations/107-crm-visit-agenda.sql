-- CRM-08: agenda de visitas/reuniões com responsável, participantes nomeados,
-- confirmação individual, reagendamento e cancelamento auditáveis.
-- Migrações 001–106 permanecem imutáveis.
--
-- Política de escopo desta fatia (decidida antes da rota e replicada na API):
--   * Responsável  = identidade que detém a oportunidade e agenda a visita.
--     Só ela cria, edita, reagenda, cancela, conclui e gerencia participantes.
--   * Participante = identidade de staff ativa explicitamente convidada.
--     Pode apenas visualizar a própria agenda e responder por si
--     (confirmado/recusado). Nunca reagenda, cancela nem convida terceiros.
--   * Papel administrativo não é bypass: admin/marcelo/ti seguem a mesma regra.

ALTER TABLE crm_visits
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0 CHECK (reschedule_count >= 0),
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ;

-- Um cancelamento sem motivo registrado não é auditável; o banco recusa.
ALTER TABLE crm_visits DROP CONSTRAINT IF EXISTS crm_visits_cancel_reason_check;
ALTER TABLE crm_visits ADD CONSTRAINT crm_visits_cancel_reason_check
  CHECK (status <> 'cancelada' OR (cancel_reason IS NOT NULL AND char_length(btrim(cancel_reason)) >= 3));

-- A coluna legada `participants` (JSONB, migração 014) nunca recebeu jornada e
-- fica congelada em '[]'. A lista autoritativa passa a ser esta tabela, com
-- identidade real, quem convidou e a resposta individual de cada participante.
CREATE TABLE IF NOT EXISTS crm_visit_participants (
  id UUID PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES crm_visits(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  response TEXT NOT NULL DEFAULT 'pendente' CHECK (response IN ('pendente','confirmado','recusado')),
  responded_at TIMESTAMPTZ,
  added_by_id UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visit_id, identity_id)
);

CREATE INDEX IF NOT EXISTS crm_visit_participants_identity_idx
  ON crm_visit_participants (identity_id, visit_id);

CREATE INDEX IF NOT EXISTS crm_visits_opportunity_idx
  ON crm_visits (opportunity_id, scheduled_at DESC)
  WHERE opportunity_id IS NOT NULL;

-- Preserva todas as ações já aceitas e autoriza explicitamente todos os
-- eventos desta fatia. A lista CRM-08 original de 014 foi substituída por
-- migrações posteriores, então os nomes são reafirmados aqui em vez de
-- assumidos. Se a constraint sumir, a migração falha em vez de enfraquecer
-- silenciosamente a auditoria.
DO $$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_definition
  FROM pg_constraint
  WHERE conrelid = 'auth_access_audit'::regclass
    AND conname = 'auth_access_audit_action_check'
    AND contype = 'c';
  IF current_definition IS NULL OR left(current_definition, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_action_constraint_missing';
  END IF;
  IF current_definition LIKE '%crm_visit_participant_add%' THEN
    RETURN;
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_visit_create'',''crm_visit_update'',''crm_visit_status'',''crm_visit_cancel'',''crm_visit_reschedule'',''crm_visit_participant_add'',''crm_visit_participant_remove'',''crm_visit_response''))',
    substring(current_definition FROM 7)
  );
END $$;

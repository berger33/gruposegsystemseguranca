-- CRM-08 (residual): detecção de conflito de horário do responsável e vínculo
-- PUB-04 (lead_visit_confirm / lead_visit_cancel).
-- Migrações 001–109 permanecem imutáveis. Esta migração é apenas aditiva.
--
-- Política desta fatia (decidida antes da rota — ver
-- docs/PROMPT-CONTINUACAO-CRM-VISITAS-CONFLITO-PUB04.md):
--   * Conflito é do RESPONSÁVEL pela visita, nunca da agenda de terceiros.
--     Só visitas vivas (solicitada/em_agendamento/confirmada) reservam faixa.
--     Duração nula vale 60 minutos para efeito de sobreposição.
--   * Conflito é fail-closed: 409 e reversão. Não há parâmetro de força nem
--     exceção por papel administrativo.
--   * Propagação CRM → lead é unidirecional, transacional e só existe quando a
--     oportunidade veio de um lead público (crm_opportunities.public_lead_id).

-- Registro do último estado propagado ao lead público por esta visita. Serve de
-- evidência e de guarda de idempotência: nada é propagado duas vezes.
ALTER TABLE crm_visits
  ADD COLUMN IF NOT EXISTS lead_sync_status TEXT
    CHECK (lead_sync_status IS NULL OR lead_sync_status IN ('em_agendamento','confirmada','realizada','cancelada')),
  ADD COLUMN IF NOT EXISTS lead_sync_at TIMESTAMPTZ;

-- Estado propagado sem carimbo (ou o contrário) não é auditável: o banco recusa.
ALTER TABLE crm_visits DROP CONSTRAINT IF EXISTS crm_visits_lead_sync_coherent_check;
ALTER TABLE crm_visits ADD CONSTRAINT crm_visits_lead_sync_coherent_check
  CHECK ((lead_sync_status IS NULL) = (lead_sync_at IS NULL));

-- Uma visita só pode declarar propagação se de fato estiver vinculada a um lead.
ALTER TABLE crm_visits DROP CONSTRAINT IF EXISTS crm_visits_lead_sync_requires_lead_check;
ALTER TABLE crm_visits ADD CONSTRAINT crm_visits_lead_sync_requires_lead_check
  CHECK (lead_sync_status IS NULL OR public_lead_id IS NOT NULL);

-- Índice parcial que sustenta a checagem de sobreposição do responsável.
CREATE INDEX IF NOT EXISTS crm_visits_active_responsible_idx
  ON crm_visits (responsible_id, scheduled_at)
  WHERE status IN ('solicitada','em_agendamento','confirmada');

CREATE INDEX IF NOT EXISTS crm_visits_public_lead_idx
  ON crm_visits (public_lead_id, status)
  WHERE public_lead_id IS NOT NULL;

-- Preserva todas as ações já aceitas e autoriza explicitamente a ação nova
-- desta fatia. As ações PUB-04 (lead_visit_confirm/lead_visit_cancel) e
-- lead_status_change já existem desde 013 e são reutilizadas como estão.
-- Se a constraint pai sumir, a migração falha em vez de afrouxar a auditoria.
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
  -- As ações PUB-04 reutilizadas precisam continuar existindo; se alguma
  -- migração futura as remover, esta falha em vez de gravar trilha inválida.
  IF current_definition NOT LIKE '%lead_visit_confirm%'
     OR current_definition NOT LIKE '%lead_visit_cancel%' THEN
    RAISE EXCEPTION 'pub04_audit_actions_missing';
  END IF;
  IF current_definition LIKE '%crm_visit_lead_sync%' THEN
    RETURN;
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_visit_lead_sync''))',
    substring(current_definition FROM 7)
  );
END $$;

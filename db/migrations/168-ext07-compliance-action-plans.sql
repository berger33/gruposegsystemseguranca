-- Migração aditiva 168: EXT-07 / F15 — Planos de Ação Corretivos e Preventivos de Compliance.
-- Preserva 001–167 imutáveis.
-- Introduz planos de ação formais para tratamento de obrigações vencidas e riscos de conformidade.
-- Fronteira: controle interno de staff auditado; não é parecer jurídico nem auditoria externa.

CREATE TABLE IF NOT EXISTS ext_compliance_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL REFERENCES ext_compliance_obligations(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES ext_compliance_documents(id) ON DELETE RESTRICT,
  task_id UUID REFERENCES ext_compliance_tasks(id) ON DELETE RESTRICT,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('corretivo', 'preventivo')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  root_cause TEXT CHECK (root_cause IS NULL OR char_length(root_cause) BETWEEN 5 AND 2000),
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'concluido', 'cancelado')),
  due_date DATE NOT NULL,
  responsible_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  completion_result TEXT CHECK (completion_result IS NULL OR char_length(completion_result) BETWEEN 10 AND 2000),
  cancellation_justification TEXT CHECK (cancellation_justification IS NULL OR char_length(cancellation_justification) BETWEEN 10 AND 1000),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ext_compliance_action_plans_obligation_idx
  ON ext_compliance_action_plans(obligation_id);

CREATE INDEX IF NOT EXISTS ext_compliance_action_plans_status_idx
  ON ext_compliance_action_plans(status, due_date);

-- Guarda de ciclo de vida e imutabilidade do plano de ação
CREATE OR REPLACE FUNCTION ext_compliance_action_plan_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'aberto' THEN
      RAISE EXCEPTION 'compliance action plan is born aberto';
    END IF;
    IF NEW.responsible_identity IS NULL THEN
      RAISE EXCEPTION 'compliance action plan requires a staff responsible (fail closed)';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('concluido', 'cancelado') THEN
      RAISE EXCEPTION 'terminal compliance action plan is immutable';
    END IF;
    IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity OR NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
      RAISE EXCEPTION 'canonical compliance action plan core fields are immutable';
    END IF;
    IF NEW.status = 'concluido' AND (NEW.responsible_identity IS NULL OR char_length(COALESCE(NEW.completion_result, '')) < 10) THEN
      RAISE EXCEPTION 'action plan completion requires responsible and result';
    END IF;
    IF NEW.status = 'cancelado' AND char_length(COALESCE(NEW.cancellation_justification, '')) < 10 THEN
      RAISE EXCEPTION 'action plan cancellation requires justification';
    END IF;
    IF OLD.status = 'aberto' AND NEW.status NOT IN ('aberto', 'em_andamento', 'concluido', 'cancelado') THEN
      RAISE EXCEPTION 'invalid compliance action plan transition';
    END IF;
    IF OLD.status = 'em_andamento' AND NEW.status NOT IN ('em_andamento', 'concluido', 'cancelado') THEN
      RAISE EXCEPTION 'invalid compliance action plan transition';
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'compliance action plans cannot be deleted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ext_compliance_action_plan_guard_insert ON ext_compliance_action_plans;
CREATE TRIGGER ext_compliance_action_plan_guard_insert BEFORE INSERT ON ext_compliance_action_plans
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_action_plan_guard();

DROP TRIGGER IF EXISTS ext_compliance_action_plan_guard_update ON ext_compliance_action_plans;
CREATE TRIGGER ext_compliance_action_plan_guard_update BEFORE UPDATE ON ext_compliance_action_plans
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_action_plan_guard();

DROP TRIGGER IF EXISTS ext_compliance_action_plan_guard_delete ON ext_compliance_action_plans;
CREATE TRIGGER ext_compliance_action_plan_guard_delete BEFORE DELETE ON ext_compliance_action_plans
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_action_plan_guard();

-- Vínculo em eventos imutáveis
ALTER TABLE ext_compliance_events
  ADD COLUMN IF NOT EXISTS action_plan_id UUID REFERENCES ext_compliance_action_plans(id) ON DELETE RESTRICT;

-- Ampliação das ações de auditoria
DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass AND conname = 'auth_access_audit_action_check' AND contype = 'c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format('ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L, %L, %L, %L)) NOT VALID',
      previous_check, 'ext07_action_plan_create', 'ext07_action_plan_start', 'ext07_action_plan_complete', 'ext07_action_plan_cancel');
  END IF;
END
$audit_actions$;

COMMENT ON TABLE ext_compliance_action_plans IS
  'Planos de ação corretivos e preventivos de compliance (EXT-07 / F15). Registro interno auditado para tratamento de obrigações vencidas e riscos de conformidade; não substitui consultoria ou parecer jurídico.';

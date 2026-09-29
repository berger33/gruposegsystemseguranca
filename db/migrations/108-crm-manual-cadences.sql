-- CRM-09: cadências de prospecção como tarefas manuais.
-- Migrações 001–107 permanecem imutáveis.
-- Não existe worker de mensagens nesta fatia: cada aplicação materializa tarefas
-- no CRM, com canal apenas sugerido e sem envio automático.

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS prospecting_opted_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS cadence_enrollment_id UUID,
  ADD COLUMN IF NOT EXISTS cadence_step_id UUID,
  ADD COLUMN IF NOT EXISTS suggested_channel TEXT,
  ADD COLUMN IF NOT EXISTS cadence_blocked_reason TEXT;

ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_suggested_channel_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_suggested_channel_check
  CHECK (suggested_channel IS NULL OR suggested_channel IN ('ligacao','email','whatsapp','reuniao','visita','outro'));
ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_cadence_blocked_reason_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_cadence_blocked_reason_check
  CHECK (cadence_blocked_reason IS NULL OR char_length(cadence_blocked_reason) BETWEEN 1 AND 500);

CREATE TABLE IF NOT EXISTS crm_cadence_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description VARCHAR(500),
  owner_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','arquivada')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_cadence_steps (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES crm_cadence_templates(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order >= 1 AND step_order <= 20),
  title VARCHAR(200) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  interval_days INTEGER NOT NULL CHECK (interval_days BETWEEN 0 AND 365),
  suggested_channel TEXT NOT NULL CHECK (suggested_channel IN ('ligacao','email','whatsapp','reuniao','visita','outro')),
  responsible_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, step_order)
);
CREATE INDEX IF NOT EXISTS crm_cadence_steps_template_idx
  ON crm_cadence_steps (template_id, step_order);
CREATE INDEX IF NOT EXISTS crm_cadence_templates_owner_idx
  ON crm_cadence_templates (owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_cadence_enrollments (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES crm_cadence_templates(id) ON DELETE RESTRICT,
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE RESTRICT,
  applied_by_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','bloqueada_opt_out','encerrada_ganha','encerrada_perdida','encerrada_contato_inativo')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  blocked_reason TEXT CHECK (blocked_reason IS NULL OR char_length(blocked_reason) BETWEEN 1 AND 500),
  UNIQUE (template_id, opportunity_id, contact_id)
);
CREATE INDEX IF NOT EXISTS crm_cadence_enrollments_opportunity_idx
  ON crm_cadence_enrollments (opportunity_id, status, applied_at DESC);
CREATE INDEX IF NOT EXISTS crm_cadence_enrollments_contact_idx
  ON crm_cadence_enrollments (contact_id, status, applied_at DESC);

ALTER TABLE crm_tasks
  DROP CONSTRAINT IF EXISTS crm_tasks_cadence_enrollment_fk,
  ADD CONSTRAINT crm_tasks_cadence_enrollment_fk
    FOREIGN KEY (cadence_enrollment_id) REFERENCES crm_cadence_enrollments(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS crm_tasks_cadence_step_fk,
  ADD CONSTRAINT crm_tasks_cadence_step_fk
    FOREIGN KEY (cadence_step_id) REFERENCES crm_cadence_steps(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS crm_tasks_cadence_idx
  ON crm_tasks (cadence_enrollment_id, status, due_date)
  WHERE cadence_enrollment_id IS NOT NULL;

DROP TRIGGER IF EXISTS crm_cadence_templates_updated_at_trg ON crm_cadence_templates;
CREATE TRIGGER crm_cadence_templates_updated_at_trg
  BEFORE UPDATE ON crm_cadence_templates FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Encerrar pendências é uma consequência persistida, não um contador na UI.
-- A função também registra o bloqueio sistêmico na auditoria para que a
-- alteração de escopo não pareça um cancelamento manual sem autor.
CREATE OR REPLACE FUNCTION crm_stop_pending_cadence_tasks(p_opportunity_id UUID, p_status TEXT, p_reason TEXT)
RETURNS VOID AS $$
DECLARE
  changed_count INTEGER;
BEGIN
  UPDATE crm_tasks
     SET status = 'cancelada', cadence_blocked_reason = p_reason, updated_at = NOW()
   WHERE opportunity_id = p_opportunity_id
     AND cadence_enrollment_id IS NOT NULL
     AND status IN ('aberta','em_andamento');
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  UPDATE crm_cadence_enrollments
     SET status = p_status, ended_at = NOW(), blocked_reason = p_reason
   WHERE opportunity_id = p_opportunity_id AND status = 'ativa';

  IF changed_count > 0 THEN
    INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
    VALUES ('system', NULL, 'crm_cadence_block', p_opportunity_id::text, 'allowed', 'none');
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION crm_opportunity_cadence_terminal_trg()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage IN ('ganho','perdido') AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    PERFORM crm_stop_pending_cadence_tasks(
      NEW.id,
      CASE WHEN NEW.stage = 'ganho' THEN 'encerrada_ganha' ELSE 'encerrada_perdida' END,
      CASE WHEN NEW.stage = 'ganho' THEN 'oportunidade_ganha' ELSE 'oportunidade_perdida' END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_opportunity_cadence_terminal_trg ON crm_opportunities;
CREATE TRIGGER crm_opportunity_cadence_terminal_trg
  AFTER UPDATE OF stage ON crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION crm_opportunity_cadence_terminal_trg();

CREATE OR REPLACE FUNCTION crm_contact_cadence_block_trg()
RETURNS TRIGGER AS $$
DECLARE
  changed_count INTEGER;
  reason TEXT;
BEGIN
  IF (NEW.prospecting_opted_out AND NOT OLD.prospecting_opted_out)
     OR (NEW.status = 'inactive' AND OLD.status IS DISTINCT FROM 'inactive') THEN
    reason := CASE WHEN NEW.prospecting_opted_out THEN 'contato_opted_out' ELSE 'contato_inativo' END;
    UPDATE crm_tasks t
       SET status = 'cancelada', cadence_blocked_reason = reason, updated_at = NOW()
      FROM crm_cadence_enrollments e
     WHERE t.cadence_enrollment_id = e.id
       AND e.contact_id = NEW.id
       AND t.status IN ('aberta','em_andamento');
    GET DIAGNOSTICS changed_count = ROW_COUNT;

    UPDATE crm_cadence_enrollments
       SET status = CASE WHEN NEW.prospecting_opted_out THEN 'bloqueada_opt_out' ELSE 'encerrada_contato_inativo' END,
           ended_at = NOW(), blocked_reason = reason
     WHERE contact_id = NEW.id AND status = 'ativa';

    IF changed_count > 0 THEN
      INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
      VALUES ('system', NULL, 'crm_cadence_block', NEW.id::text, 'allowed', 'none');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_contact_cadence_block_trg ON crm_contacts;
CREATE TRIGGER crm_contact_cadence_block_trg
  AFTER UPDATE OF status, prospecting_opted_out ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION crm_contact_cadence_block_trg();

-- Preserve the complete audit contract and add only the events introduced by
-- CRM-09. If a prior constraint disappeared, fail closed instead of allowing
-- unaudited cadence operations.
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
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_cadence_template_create'',''crm_cadence_template_update'',''crm_cadence_template_archive'',''crm_cadence_apply'',''crm_cadence_block'',''crm_contact_prospecting_opt_out''))',
    substring(current_definition FROM 7)
  );
END $$;

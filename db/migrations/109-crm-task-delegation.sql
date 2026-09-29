-- CRM-07 (conclusão da fatia de tarefas): versão otimista para edição de
-- prazo, paginação real e delegação explícita entre comerciais com aceite.
-- Migrações 001–108 permanecem imutáveis.
-- Não há visibilidade de equipe ampla: a única ponte entre comerciais é a
-- delegação explícita, tarefa a tarefa, registrada nestas colunas.

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delegated_to_id UUID,
  ADD COLUMN IF NOT EXISTS delegated_by_id UUID,
  ADD COLUMN IF NOT EXISTS delegation_status TEXT,
  ADD COLUMN IF NOT EXISTS delegated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delegation_responded_at TIMESTAMPTZ;

ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_version_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_version_check
  CHECK (version >= 1);

ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_delegated_to_fk;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_delegated_to_fk
  FOREIGN KEY (delegated_to_id) REFERENCES auth_identities(id) ON DELETE RESTRICT;
ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_delegated_by_fk;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_delegated_by_fk
  FOREIGN KEY (delegated_by_id) REFERENCES auth_identities(id) ON DELETE RESTRICT;

ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_delegation_status_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_delegation_status_check
  CHECK (delegation_status IS NULL OR delegation_status IN ('pendente','aceita','recusada'));

-- Autodelegação nunca é registrável, nem por SQL direto.
ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_delegation_not_self_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_delegation_not_self_check
  CHECK (delegated_to_id IS NULL OR delegated_by_id IS NULL OR delegated_to_id <> delegated_by_id);

-- Os campos de delegação existem juntos ou não existem: estado incoerente é
-- recusado pelo banco, não apenas pela API.
ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_delegation_coherent_check;
ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_delegation_coherent_check
  CHECK (
    (delegation_status IS NULL AND delegated_to_id IS NULL AND delegated_by_id IS NULL
      AND delegated_at IS NULL AND delegation_responded_at IS NULL)
    OR (delegation_status = 'pendente' AND delegated_to_id IS NOT NULL AND delegated_by_id IS NOT NULL
      AND delegated_at IS NOT NULL AND delegation_responded_at IS NULL)
    OR (delegation_status IN ('aceita','recusada') AND delegated_to_id IS NOT NULL
      AND delegated_by_id IS NOT NULL AND delegated_at IS NOT NULL
      AND delegation_responded_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS crm_tasks_delegated_to_idx
  ON crm_tasks (delegated_to_id, delegation_status, due_date)
  WHERE delegated_to_id IS NOT NULL;

-- Versão otimista incrementada pelo banco em toda atualização, para que
-- nenhum caminho de escrita (presente ou futuro) esqueça o incremento.
CREATE OR REPLACE FUNCTION crm_tasks_bump_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_tasks_version_trg ON crm_tasks;
CREATE TRIGGER crm_tasks_version_trg
  BEFORE UPDATE ON crm_tasks FOR EACH ROW EXECUTE FUNCTION crm_tasks_bump_version();

-- Preserva todos os valores de action já aceitos e autoriza somente os
-- eventos emitidos por esta fatia. Se a constraint pai desaparecer, a
-- migração falha em vez de afrouxar a regra de auditoria em silêncio.
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
  IF current_definition LIKE '%crm_task_delegated_status%' THEN
    RETURN;
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_task_update'',''crm_task_delegate'',''crm_task_delegation_revoke'',''crm_task_delegation_accept'',''crm_task_delegation_decline'',''crm_task_delegated_status''))',
    substring(current_definition FROM 7)
  );
END $$;

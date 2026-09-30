-- CRM-03: revisão dedicada de deduplicação da importação CSV.
-- Migrações 001–115 permanecem imutáveis; esta é apenas aditiva.

-- 1) Decisão revisável por linha duplicada. Tudo nulo por padrão: o passado
--    não é reescrito e nenhum lote antigo passa a parecer revisado.
ALTER TABLE crm_import_rows ADD COLUMN IF NOT EXISTS decision TEXT;
ALTER TABLE crm_import_rows ADD COLUMN IF NOT EXISTS decision_note TEXT;
ALTER TABLE crm_import_rows ADD COLUMN IF NOT EXISTS decided_by TEXT;
ALTER TABLE crm_import_rows ADD COLUMN IF NOT EXISTS decided_by_id UUID;
ALTER TABLE crm_import_rows ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'crm_import_rows'::regclass
      AND conname = 'crm_import_rows_decided_by_id_fkey'
  ) THEN
    ALTER TABLE crm_import_rows
      ADD CONSTRAINT crm_import_rows_decided_by_id_fkey
      FOREIGN KEY (decided_by_id) REFERENCES auth_identities(id);
  END IF;
END $$;

-- 2) Coerência da decisão: valor fechado e autoria/data obrigatórias quando
--    existe decisão. CHECK sobre tabela povoada entra NOT VALID — vale para
--    escrita nova sem reescrever o histórico.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'crm_import_rows'::regclass
      AND conname = 'crm_import_rows_decision_check'
  ) THEN
    ALTER TABLE crm_import_rows
      ADD CONSTRAINT crm_import_rows_decision_check CHECK (
        (decision IS NULL AND decided_by_id IS NULL AND decided_at IS NULL)
        OR (decision IN ('create','skip') AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_import_rows_decision_idx
  ON crm_import_rows (batch_id, status, decision);

-- 3) Reautorização DELIMITADA da ação de auditoria desta fatia. Mesmo padrão
--    das migrações 112/114/115: falha se a constraint pai sumir, amplia sem
--    redigitar a lista e nunca afrouxa.
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

  IF current_definition NOT LIKE '%crm_import_commit%' THEN
    RAISE EXCEPTION 'audit_action_crm_import_commit_missing';
  END IF;

  IF current_definition LIKE '%crm_import_row_decision%' THEN
    RETURN;
  END IF;

  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_import_row_decision''))',
    substring(current_definition FROM 7)
  );
END $$;

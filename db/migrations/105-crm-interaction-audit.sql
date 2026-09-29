-- CRM-07: histórico de interações (ligação/reunião/nota) por oportunidade.
-- Preserve every existing action already allowed by 104 and add the single
-- new event this slice introduces. Do not edit 103/104, already applied in
-- existing installations.
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
  IF current_definition LIKE '%crm_interaction_create%' THEN
    RETURN;
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_interaction_create''))',
    substring(current_definition FROM 7)
  );
END $$;

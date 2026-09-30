-- CRM-01..04: auditoria transacional de criação de empresa e contato.
-- Aditiva; migrações 001–112 são imutáveis.
DO $$
DECLARE
  current_definition text;
  actor_kind_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_definition
  FROM pg_constraint
  WHERE conrelid = 'auth_access_audit'::regclass
    AND conname = 'auth_access_audit_action_check' AND contype = 'c';
  IF current_definition IS NULL OR left(current_definition, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_action_constraint_missing';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO actor_kind_definition
  FROM pg_constraint
  WHERE conrelid = 'auth_access_audit'::regclass
    AND conname = 'auth_access_audit_actor_kind_check' AND contype = 'c';
  IF actor_kind_definition IS NULL OR actor_kind_definition NOT LIKE '%''comercial''%' THEN
    RAISE EXCEPTION 'audit_actor_kind_comercial_missing';
  END IF;
  IF current_definition LIKE '%crm_company_create%'
     AND current_definition LIKE '%crm_contact_create%' THEN
    RETURN;
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_company_create'',''crm_contact_create''))',
    substring(current_definition FROM 7)
  );
END $$;

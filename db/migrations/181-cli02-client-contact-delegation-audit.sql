-- CLI-02: cliente pode delegar somente os escopos autorizados do próprio contato.
-- Adiciona a ação à constraint sem apagar ações aceitas anteriormente.
DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check'
     AND contype = 'c';
  IF previous_check IS NOT NULL AND (
       position(quote_literal('contact_delegate') IN previous_check) = 0
       OR position(quote_literal('contact_list') IN previous_check) = 0
     ) THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L)) NOT VALID',
      previous_check,
      'contact_delegate',
      'contact_list'
    );
  END IF;
END $audit_actions$;

COMMENT ON CONSTRAINT auth_access_audit_action_check ON auth_access_audit IS
  'CLI-02 contact_delegate is appended compatibly; prior accepted actions remain valid.';

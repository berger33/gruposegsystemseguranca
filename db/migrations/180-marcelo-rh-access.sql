-- Marcelo receives operational access to the RH workspace. Sensitive health
-- records and compensation remain behind their separate permissions/gates.
CREATE OR REPLACE FUNCTION provision_marcelo_rh_permissions() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role = 'marcelo' AND NEW.role <> 'marcelo' THEN
    UPDATE auth_permissions
       SET revoked_at = NOW(), revoke_reason = 'Papel Marcelo removido; concessão padrão de RH revogada'
     WHERE identity_id = NEW.identity_id
       AND revoked_at IS NULL
       AND granted_by IS NULL
       AND reason = 'Acesso operacional de RH do papel Marcelo'
       AND permission IN ('employees.read', 'employees.write');
  END IF;

  IF NEW.role = 'marcelo' THEN
    INSERT INTO auth_permissions
      (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
    VALUES
      (gen_random_uuid(), NEW.identity_id, 'employees.read', 'organization', NULL, NULL, 'system', 'Acesso operacional de RH do papel Marcelo'),
      (gen_random_uuid(), NEW.identity_id, 'employees.write', 'organization', NULL, NULL, 'system', 'Acesso operacional de RH do papel Marcelo')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auth_staff_profiles_marcelo_rh_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_marcelo_rh_permissions
  AFTER INSERT OR UPDATE OF role ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_marcelo_rh_permissions();

INSERT INTO auth_permissions
  (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT gen_random_uuid(), p.identity_id, permission, 'organization', NULL, NULL, 'system', 'Acesso operacional de RH do papel Marcelo'
  FROM auth_staff_profiles p
 CROSS JOIN (VALUES ('employees.read'), ('employees.write')) AS perms(permission)
 WHERE p.role = 'marcelo'
ON CONFLICT DO NOTHING;

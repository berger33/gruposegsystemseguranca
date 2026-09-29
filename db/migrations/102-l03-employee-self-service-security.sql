-- L03 / EMP-01..19 / HR-01..24
-- Identidade própria do funcionário, sessão revogável, escopo de RH e arquivos
-- privados reais. Nenhum dado pessoal ou credencial de demonstração é criado.

-- Funcionário é uma identidade distinta de cliente e de staff privilegiado.
ALTER TABLE auth_identities DROP CONSTRAINT IF EXISTS auth_identities_kind_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_kind_check
  CHECK (kind IN ('client','staff','employee'));

-- Papéis de negócio deixam de depender de nomes pessoais. Funcionário usa a
-- identidade employee e NÃO recebe perfil de staff.
ALTER TABLE auth_staff_profiles DROP CONSTRAINT IF EXISTS auth_staff_profiles_role_check;
ALTER TABLE auth_staff_profiles ADD CONSTRAINT auth_staff_profiles_role_check
  CHECK (role IN ('admin','ti','rh','marcelo','supervisor','comercial','financeiro'));
ALTER TABLE auth_staff_sessions DROP CONSTRAINT IF EXISTS auth_staff_sessions_role_check;
ALTER TABLE auth_staff_sessions ADD CONSTRAINT auth_staff_sessions_role_check
  CHECK (role IN ('admin','ti','rh','marcelo','supervisor','comercial','financeiro'));
ALTER TABLE auth_invites DROP CONSTRAINT IF EXISTS auth_invites_role_check;
ALTER TABLE auth_invites ADD CONSTRAINT auth_invites_role_check
  CHECK (role IS NULL OR role IN ('admin','ti','rh','marcelo','supervisor','comercial','financeiro'));

-- Uma identidade de funcionário corresponde a no máximo um cadastro laboral.
CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_identity_unique_idx
  ON hr_employees(identity_id) WHERE identity_id IS NOT NULL;

-- Escopos reais do cadastro profissional. São opcionais porque o backfill deve
-- ser classificado por RH, nunca inferido para ampliar acesso.
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS hr_employees_unit_idx ON hr_employees(unit_id);
CREATE INDEX IF NOT EXISTS hr_employees_contract_idx ON hr_employees(contract_id);

CREATE TABLE IF NOT EXISTS auth_employee_sessions (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  epoch INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  last_seen_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS auth_employee_sessions_identity_idx
  ON auth_employee_sessions(identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_employee_sessions_employee_idx
  ON auth_employee_sessions(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_employee_sessions_live_idx
  ON auth_employee_sessions(identity_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_employee_sessions_expiry_idx
  ON auth_employee_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_employee_access (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL UNIQUE REFERENCES hr_employees(id) ON DELETE CASCADE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  provisioned_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  password_changed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
);

-- Documentos do L03 usam bytes no provider local, chave gerada pelo servidor e
-- hash verificado em todo download. Não há URL pública nem caminho do usuário.
CREATE TABLE IF NOT EXISTS employee_private_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('submission','payroll','income_report','course_proof','request_attachment','general')),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 2 AND 100),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  competence TEXT CHECK (competence IS NULL OR competence ~ '^\d{4}-\d{2}$'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','published','rejected','superseded')),
  source_label TEXT,
  source_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  storage_key CHAR(48) NOT NULL UNIQUE CHECK (storage_key ~ '^[0-9a-f]{48}$'),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  original_filename TEXT NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  content_type TEXT NOT NULL CHECK (char_length(content_type) BETWEEN 3 AND 120),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  uploaded_by_kind TEXT NOT NULL CHECK (uploaded_by_kind IN ('employee','staff')),
  uploaded_by_identity UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) BETWEEN 5 AND 1000),
  correction_of_id UUID REFERENCES employee_private_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, document_kind, category, competence, version),
  CHECK (status <> 'published' OR (source_authorized AND published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS employee_private_documents_employee_idx
  ON employee_private_documents(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employee_private_documents_status_idx
  ON employee_private_documents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS employee_private_documents_competence_idx
  ON employee_private_documents(competence) WHERE competence IS NOT NULL;
DROP TRIGGER IF EXISTS employee_private_documents_updated_at ON employee_private_documents;
CREATE TRIGGER employee_private_documents_updated_at
  BEFORE UPDATE ON employee_private_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS employee_private_document_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES employee_private_documents(id) ON DELETE RESTRICT,
  employee_id UUID REFERENCES hr_employees(id) ON DELETE SET NULL,
  actor_identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('employee','staff')),
  action TEXT NOT NULL CHECK (action IN ('upload','review','publish','download','integrity_denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS employee_private_document_access_doc_idx
  ON employee_private_document_access(document_id, created_at DESC);

-- As permissões continuam granulares. O papel RH recebe o conjunto operacional
-- mínimo da organização; remuneração permanece separada e exige concessão
-- explícita employees.compensation.*. TI/admin não recebem leitura de RH.
CREATE OR REPLACE FUNCTION provision_hr_role_permissions() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.role='rh' AND NEW.role<>'rh' THEN
    UPDATE auth_permissions SET revoked_at=NOW(), revoke_reason='Papel RH removido; concessão padrão revogada'
     WHERE identity_id=NEW.identity_id AND revoked_at IS NULL AND granted_by IS NULL
       AND permission IN ('employees.read','employees.write','employees.health.read','employees.health.write')
       AND reason IN ('Conjunto padrão do papel RH','Saúde ocupacional mínima do papel RH','Backfill seguro do papel RH no L03');
  END IF;
  IF TG_OP='UPDATE' AND OLD.role IN ('admin','ti','marcelo') AND NEW.role NOT IN ('admin','ti','marcelo') THEN
    UPDATE auth_permissions SET revoked_at=NOW(), revoke_reason='Papel administrativo removido; concessão padrão revogada'
     WHERE identity_id=NEW.identity_id AND revoked_at IS NULL AND granted_by IS NULL
       AND permission IN ('admin.permissions.grant','admin.permissions.revoke','admin.access_review')
       AND reason IN ('Administração explícita do diretório de acesso','Backfill da administração explícita de acessos no L03');
  END IF;
  IF NEW.role = 'rh' THEN
    INSERT INTO auth_permissions
      (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
    VALUES
      (gen_random_uuid(), NEW.identity_id, 'employees.read', 'organization', NULL, NULL, 'system', 'Conjunto padrão do papel RH'),
      (gen_random_uuid(), NEW.identity_id, 'employees.write', 'organization', NULL, NULL, 'system', 'Conjunto padrão do papel RH'),
      (gen_random_uuid(), NEW.identity_id, 'employees.health.read', 'organization', NULL, NULL, 'system', 'Saúde ocupacional mínima do papel RH'),
      (gen_random_uuid(), NEW.identity_id, 'employees.health.write', 'organization', NULL, NULL, 'system', 'Saúde ocupacional mínima do papel RH')
    ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.role IN ('admin','ti','marcelo') THEN
    INSERT INTO auth_permissions
      (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
    VALUES
      (gen_random_uuid(), NEW.identity_id, 'admin.permissions.grant', 'global', NULL, NULL, 'system', 'Administração explícita do diretório de acesso'),
      (gen_random_uuid(), NEW.identity_id, 'admin.permissions.revoke', 'global', NULL, NULL, 'system', 'Administração explícita do diretório de acesso'),
      (gen_random_uuid(), NEW.identity_id, 'admin.access_review', 'global', NULL, NULL, 'system', 'Revisão explícita do diretório de acesso')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auth_staff_profiles_hr_permissions ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profiles_hr_permissions
  AFTER INSERT OR UPDATE OF role ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION provision_hr_role_permissions();

INSERT INTO auth_permissions
  (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT gen_random_uuid(), p.identity_id, permission, 'organization', NULL, NULL, 'system', 'Backfill seguro do papel RH no L03'
FROM auth_staff_profiles p
CROSS JOIN (VALUES ('employees.read'),('employees.write'),('employees.health.read'),('employees.health.write')) AS perms(permission)
WHERE p.role = 'rh'
ON CONFLICT DO NOTHING;

INSERT INTO auth_permissions
  (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
SELECT gen_random_uuid(), p.identity_id, permission, 'global', NULL, NULL, 'system', 'Backfill da administração explícita de acessos no L03'
FROM auth_staff_profiles p
CROSS JOIN (VALUES ('admin.permissions.grant'),('admin.permissions.revoke'),('admin.access_review')) AS perms(permission)
WHERE p.role IN ('admin','ti','marcelo')
ON CONFLICT DO NOTHING;

-- Revogação material no próprio banco: cobre qualquer caminho de escrita,
-- inclusive ferramentas administrativas futuras que não passem pelo server.mjs.
CREATE OR REPLACE FUNCTION revoke_sessions_on_staff_role_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE auth_identities SET session_epoch=session_epoch+1, updated_at=NOW()
     WHERE id=NEW.identity_id AND kind='staff';
    UPDATE auth_staff_sessions SET revoked_at=NOW(), revoked_reason='role_changed'
     WHERE identity_id=NEW.identity_id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_staff_profile_role_session_revoke ON auth_staff_profiles;
CREATE TRIGGER auth_staff_profile_role_session_revoke
  AFTER UPDATE OF role ON auth_staff_profiles
  FOR EACH ROW EXECUTE FUNCTION revoke_sessions_on_staff_role_change();

CREATE OR REPLACE FUNCTION revoke_sessions_on_employee_status_change() RETURNS TRIGGER AS $$
DECLARE linked_identity UUID;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('afastado','suspenso','desligado','arquivado') THEN
    SELECT identity_id INTO linked_identity FROM auth_employee_access WHERE employee_id=NEW.id;
    IF linked_identity IS NOT NULL THEN
      UPDATE auth_identities SET session_epoch=session_epoch+1, updated_at=NOW()
       WHERE id=linked_identity AND kind='employee';
      UPDATE auth_employee_sessions SET revoked_at=NOW(), revoked_reason='employee_status_changed'
       WHERE employee_id=NEW.id AND revoked_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS hr_employee_status_session_revoke ON hr_employees;
CREATE TRIGGER hr_employee_status_session_revoke
  AFTER UPDATE OF status ON hr_employees
  FOR EACH ROW EXECUTE FUNCTION revoke_sessions_on_employee_status_change();

CREATE OR REPLACE FUNCTION revoke_sessions_on_credential_change() RETURNS TRIGGER AS $$
DECLARE identity_kind TEXT;
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    SELECT kind INTO identity_kind FROM auth_identities WHERE id=NEW.identity_id;
    UPDATE auth_identities SET session_epoch=session_epoch+1, updated_at=NOW()
     WHERE id=NEW.identity_id;
    IF identity_kind='staff' THEN
      UPDATE auth_staff_sessions SET revoked_at=NOW(), revoked_reason='password_changed'
       WHERE identity_id=NEW.identity_id AND revoked_at IS NULL;
    ELSIF identity_kind='employee' THEN
      UPDATE auth_employee_sessions SET revoked_at=NOW(), revoked_reason='password_changed'
       WHERE identity_id=NEW.identity_id AND revoked_at IS NULL;
    ELSE
      UPDATE auth_sessions SET revoked_at=NOW(), revoke_reason='password_reset'
       WHERE identity_id=NEW.identity_id AND revoked_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_credential_session_revoke ON auth_credentials;
CREATE TRIGGER auth_credential_session_revoke
  AFTER UPDATE OF password_hash ON auth_credentials
  FOR EACH ROW EXECUTE FUNCTION revoke_sessions_on_credential_change();

CREATE OR REPLACE FUNCTION revoke_sessions_on_identity_block() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'active' THEN
    UPDATE auth_staff_sessions SET revoked_at=NOW(), revoked_reason='identity_status_changed'
     WHERE identity_id=NEW.id AND revoked_at IS NULL;
    UPDATE auth_employee_sessions SET revoked_at=NOW(), revoked_reason='identity_status_changed'
     WHERE identity_id=NEW.id AND revoked_at IS NULL;
    UPDATE auth_sessions SET revoked_at=NOW(), revoke_reason='status_block'
     WHERE identity_id=NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS auth_identity_status_session_revoke ON auth_identities;
CREATE TRIGGER auth_identity_status_session_revoke
  AFTER UPDATE OF status ON auth_identities
  FOR EACH ROW EXECUTE FUNCTION revoke_sessions_on_identity_block();

-- Remuneração é sensível por padrão em cadastro e histórico.
UPDATE hr_profile_field_config
   SET sensitivity='sigiloso', is_masked_for_employee=TRUE,
       is_editable_by_employee=FALSE, mask_pattern='***'
 WHERE field_name='remuneracao_atual';

COMMENT ON TABLE auth_employee_sessions IS
  'Sessões próprias do portal do funcionário; status laboral/identity/epoch são conferidos a cada requisição.';
COMMENT ON TABLE employee_private_documents IS
  'Provider privado L03: bytes fora do banco, chave do servidor, hash obrigatório e escopo employee_id.';

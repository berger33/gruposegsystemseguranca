-- EMP-01 perfil próprio e solicitação de atualização cadastral; dados restritos mascarados
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_update_status') THEN
    CREATE TYPE profile_update_status AS ENUM ('pendente','em_analise','aprovado','rejeitado','cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_field_sensitivity') THEN
    CREATE TYPE profile_field_sensitivity AS ENUM ('publico','interno','restrito','sigiloso');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr_profile_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  status profile_update_status NOT NULL DEFAULT 'pendente',
  requested_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_snapshot JSONB,
  justification TEXT CHECK (char_length(justification) <= 1000),
  reviewed_by VARCHAR(80),
  reviewed_by_id VARCHAR(80),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_update_employee ON hr_profile_update_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_profile_update_status ON hr_profile_update_requests(status);
CREATE INDEX IF NOT EXISTS idx_profile_update_identity ON hr_profile_update_requests(identity_id);

DROP TRIGGER IF EXISTS trg_profile_update_updated ON hr_profile_update_requests;
CREATE TRIGGER trg_profile_update_updated BEFORE UPDATE ON hr_profile_update_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_profile_field_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name VARCHAR(100) NOT NULL UNIQUE,
  display_label VARCHAR(200) NOT NULL,
  sensitivity profile_field_sensitivity NOT NULL DEFAULT 'interno',
  is_masked_for_employee BOOLEAN NOT NULL DEFAULT FALSE,
  is_editable_by_employee BOOLEAN NOT NULL DEFAULT TRUE,
  mask_pattern VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO hr_profile_field_config (field_name, display_label, sensitivity, is_masked_for_employee, is_editable_by_employee, mask_pattern)
VALUES
  ('display_name','Nome completo','publico', false, false, NULL),
  ('matricula','Matrícula','interno', false, false, NULL),
  ('cargo','Cargo','interno', false, false, NULL),
  ('lotacao','Lotação','interno', false, false, NULL),
  ('empregador','Empregador','interno', false, false, NULL),
  ('filial','Filial','interno', false, false, NULL),
  ('contact_email','E-mail contato','interno', false, true, NULL),
  ('contact_phone','Telefone','interno', false, true, NULL),
  ('address_city','Cidade','interno', false, true, NULL),
  ('address_state','UF','interno', false, true, NULL),
  ('remuneracao_atual','Remuneração','sigiloso', true, false, '***'),
  ('cpf_hash','CPF hash','sigiloso', true, false, '***'),
  ('birth_date','Data nascimento','restrito', true, false, '**/**/****'),
  ('gestor_name','Gestor','interno', false, false, NULL)
ON CONFLICT (field_name) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'profile_update_request') THEN
    ALTER TYPE audit_action ADD VALUE 'profile_update_request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'profile_update_approve') THEN
    ALTER TYPE audit_action ADD VALUE 'profile_update_approve';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'profile_update_reject') THEN
    ALTER TYPE audit_action ADD VALUE 'profile_update_reject';
  END IF;
END $$;

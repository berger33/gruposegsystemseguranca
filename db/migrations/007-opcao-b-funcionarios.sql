-- Opção B — Fase 3 (operação em campo): modelo inicial de funcionários,
-- escalas, registro de ponto/ronda com geolocalização e passagem de plantão.
-- Não insere dados de demonstração. Nenhuma decisão final de escala/geo
-- está aplicada aqui; o esquema suporta as alternativas pendentes.

-- Posts / funções de equipe (ex: vigilante, supervisor, gerente operações)
CREATE TABLE IF NOT EXISTS staff_posts (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500),
  created_by TEXT NOT NULL CHECK (created_by IN ('admin','system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_posts_name_idx ON staff_posts (name);

-- Alocação de staff a cliente (diferente de grant: é vínculo de trabalho)
CREATE TABLE IF NOT EXISTS staff_assignments (
  id UUID PRIMARY KEY,
  staff_identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  post_id UUID REFERENCES staff_posts(id),
  started_on DATE,
  ended_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','suspended')),
  assigned_by UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_assignments_staff_idx ON staff_assignments (staff_identity_id, status);
CREATE INDEX IF NOT EXISTS staff_assignments_account_idx ON staff_assignments (client_account_id, status);

-- Regras de escala por posto (suporta 12x36, 6x1, diarista, other — decisão pendente)
CREATE TABLE IF NOT EXISTS staff_scale_rules (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES staff_posts(id),
  scale_type TEXT NOT NULL CHECK (scale_type IN ('12x36','6x1','diarista','other')),
  hours_per_week INT CHECK (hours_per_week > 0),
  rest_days VARCHAR(200),
  created_by TEXT NOT NULL CHECK (created_by IN ('admin','system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro de ponto / ronda / evidência (suporta geolocalização e foto/link)
CREATE TABLE IF NOT EXISTS staff_time_entries (
  id UUID PRIMARY KEY,
  staff_identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES staff_assignments(id),
  client_account_id UUID REFERENCES client_accounts(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('start','end','ronda','break','handover')),
  post_id UUID REFERENCES staff_posts(id),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geo_lat DECIMAL(10,8),
  geo_lng DECIMAL(11,8),
  evidence_storage_key VARCHAR(64),
  evidence_note VARCHAR(500),
  created_by UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_time_entries_staff_idx ON staff_time_entries (staff_identity_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS staff_time_entries_account_idx ON staff_time_entries (client_account_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS staff_time_entries_geo_idx ON staff_time_entries (geo_lat, geo_lng) WHERE geo_lat IS NOT NULL;

-- Passagem de plantão entre alocações (responsável + evidência)
CREATE TABLE IF NOT EXISTS staff_shift_handover (
  id UUID PRIMARY KEY,
  from_assignment_id UUID REFERENCES staff_assignments(id),
  to_assignment_id UUID REFERENCES staff_assignments(id),
  client_account_id UUID REFERENCES client_accounts(id),
  note VARCHAR(500),
  evidence_storage_key VARCHAR(64),
  handed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth_identities(id)
);
CREATE INDEX IF NOT EXISTS staff_shift_handover_account_idx ON staff_shift_handover (client_account_id, handed_at DESC);

-- Auditoria expandida para ações de equipe / ponto
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept',
  'login','logout','session_revoke_all',
  'email_confirm','email_confirm_resend',
  'password_reset_request','password_reset_complete',
  'account_create','account_status',
  'grant_issue','grant_revoke',
  'contract_create','contract_status','contract_list',
  'document_upload','document_download','document_list',
  'ticket_open','ticket_status','ticket_list',
  'mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use',
  'email_change_request','email_change_confirm','email_change_cancel','email_change_alert',
  'grant_contract_restrict','grant_unit_restrict',
  'staff_invite','staff_login','staff_role_change','staff_session_revoke',
  'assignment_create','assignment_end','assignment_suspend',
  'scale_create','scale_update',
  'time_entry_start','time_entry_end','time_entry_ronda',
  'handover_create','handover_accept'
));

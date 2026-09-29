-- CRM-03: importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação

CREATE TABLE IF NOT EXISTS crm_import_batches (
  id UUID PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  type TEXT NOT NULL DEFAULT 'companies' CHECK (type IN ('companies','contacts')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  total_rows INT NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows INT NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows INT NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  duplicate_rows INT NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
  created_rows INT NOT NULL DEFAULT 0 CHECK (created_rows >= 0),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_import_batches_status_idx ON crm_import_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_import_batches_created_by_idx ON crm_import_batches (created_by_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_import_rows (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES crm_import_batches(id) ON DELETE CASCADE,
  row_number INT NOT NULL CHECK (row_number >= 1),
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  mapped_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','invalid','duplicate','created','skipped','failed')),
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  dedup_match_id UUID,
  dedup_match_type TEXT CHECK (dedup_match_type IN ('company','contact') OR dedup_match_type IS NULL),
  dedup_match_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  action TEXT NOT NULL DEFAULT 'create' CHECK (action IN ('create','update','skip')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_import_rows_batch_idx ON crm_import_rows (batch_id, row_number);
CREATE INDEX IF NOT EXISTS crm_import_rows_status_idx ON crm_import_rows (batch_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS crm_import_rows_batch_row_unique ON crm_import_rows (batch_id, row_number);

DROP TRIGGER IF EXISTS crm_import_batches_updated_at_trg ON crm_import_batches;
CREATE TRIGGER crm_import_batches_updated_at_trg BEFORE UPDATE ON crm_import_batches FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Auditoria CRM import/export
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
  'mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify',
  'email_change_request','email_change_confirm','email_change_cancel','email_change_alert',
  'grant_contract_restrict','grant_unit_restrict',
  'staff_invite','staff_login','staff_role_change','staff_session_revoke',
  'permission_grant','permission_revoke','access_review',
  'assignment_create','assignment_end','assignment_suspend',
  'scale_create','scale_update',
  'time_entry_start','time_entry_end','time_entry_ronda',
  'handover_create','handover_accept',
  'audit_query','audit_export','invite_rate_limited',
  'notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry',
  'integration_check','integration_test','integration_update',
  'catalog_create','catalog_update','catalog_publish',
  'lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel',
  'crm_company_create','crm_company_update','crm_company_status',
  'crm_contact_create','crm_contact_update',
  'crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change',
  'crm_task_create','crm_task_update','crm_task_status',
  'crm_interaction_create',
  'crm_visit_create','crm_visit_update','crm_visit_status','crm_visit_confirm','crm_visit_cancel',
  'crm_lead_convert',
  'crm_import_create','crm_import_commit','crm_import_export'
));

-- PLT-02: auditoria consultável + exportação auditada
-- PLT-04: fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento
-- SEC-13/14/15: finalização

-- Ampliar auditoria para incluir audit_query e audit_export e invite_rate_limited
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
  'notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry'
));

-- Índice adicional para consulta por período e ação
CREATE INDEX IF NOT EXISTS auth_access_audit_action_time_idx ON auth_access_audit (action, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_access_audit_target_idx ON auth_access_audit (target, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_access_audit_result_idx ON auth_access_audit (result, created_at DESC);

-- PLT-04: fila durável de notificações
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY,
  dedup_key TEXT,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('client','staff','lead','system','marcelo','ti','admin','rh')),
  recipient_id TEXT,
  recipient_email VARCHAR(254),
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','sms','push','webhook','internal')),
  template TEXT NOT NULL CHECK (char_length(template) BETWEEN 1 AND 100),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','dead')),
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INT NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  created_by TEXT,
  created_by_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_dedup_key_unique ON notification_queue (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_queue_status_next_idx ON notification_queue (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS notification_queue_recipient_idx ON notification_queue (recipient_kind, recipient_id);
CREATE INDEX IF NOT EXISTS notification_queue_channel_idx ON notification_queue (channel, status);
CREATE INDEX IF NOT EXISTS notification_queue_created_idx ON notification_queue (created_at DESC);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION notification_queue_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notification_queue_updated_at_trg ON notification_queue;
CREATE TRIGGER notification_queue_updated_at_trg BEFORE UPDATE ON notification_queue FOR EACH ROW EXECUTE FUNCTION notification_queue_set_updated_at();

-- Tabela de auditoria de retenção (documentar retenção 12 meses prevista)
-- Não ativa exclusão automática ainda, apenas registra política
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  retention_months INT NOT NULL CHECK (retention_months > 0),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO data_retention_policies (id, table_name, retention_months, description)
VALUES
  ('audit_12m', 'auth_access_audit', 12, 'Trilha de auditoria de acesso — retenção 12 meses, sem segredos, conforme SEC-14 e LGPD'),
  ('mfa_challenge_1d', 'auth_mfa_challenges', 1, 'Desafios MFA — retenção curta, expiração em minutos/horas'),
  ('email_tokens_7d', 'auth_email_tokens', 1, 'Tokens de confirmação/recuperação — 7 dias ou 1h, uso único')
ON CONFLICT (id) DO NOTHING;

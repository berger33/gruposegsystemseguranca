-- L02 — Caixa de saída LOCAL, substituindo SMTP nesta entrega.
--
-- Contexto: SMTP e hospedagem externa estão fora do escopo (decisão do
-- proprietário). Sem um destino, o código atual apenas devolvia
-- "not_configured": convites, confirmações e recuperações de senha não
-- chegavam a lugar nenhum, e a fila de notificações acumulava tentativas até
-- marcar 'dead'. Nenhuma jornada que dependa de comunicação fechava.
--
-- Esta caixa é um SIMULADOR EXPLÍCITO, não um provedor de e-mail:
--   * nada sai do computador;
--   * o estado nunca é "enviado"/"entregue", e sim "disponível na caixa local";
--   * o conteúdo carrega tokens de convite/recuperação, portanto o acesso é
--     restrito e auditado como leitura de material sensível;
--   * não prova posse de e-mail e não vale como verificação em produção.
--
-- Idempotente. Nenhum dado de demonstração, nenhum segredo.

CREATE TABLE IF NOT EXISTS local_outbox_messages (
  id UUID PRIMARY KEY,
  -- Vínculo opcional com a fila durável; mensagens de autenticação entram
  -- direto, sem passar pela fila.
  notification_id UUID REFERENCES notification_queue(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','whatsapp','sms','push','webhook','internal')),
  recipient_kind TEXT NOT NULL
    CHECK (recipient_kind IN ('client','staff','lead','system','marcelo','ti','admin','rh')),
  recipient_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  recipient_address TEXT NOT NULL CHECK (char_length(recipient_address) BETWEEN 3 AND 320),
  template TEXT NOT NULL CHECK (char_length(template) BETWEEN 1 AND 100),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 300),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  -- Deixa explícito, na própria linha, que isto NÃO foi enviado.
  delivery_mode TEXT NOT NULL DEFAULT 'local_outbox'
    CHECK (delivery_mode IN ('local_outbox')),
  -- Conteúdo sensível (tokens de uso único). Tratar como material restrito.
  is_sensitive BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_read_at TIMESTAMPTZ,
  read_count INT NOT NULL DEFAULT 0 CHECK (read_count >= 0)
);

CREATE INDEX IF NOT EXISTS local_outbox_created_idx
  ON local_outbox_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS local_outbox_recipient_idx
  ON local_outbox_messages (recipient_address, created_at DESC);
CREATE INDEX IF NOT EXISTS local_outbox_notification_idx
  ON local_outbox_messages (notification_id);

COMMENT ON TABLE local_outbox_messages IS
  'Caixa de saída LOCAL (simulador sem SMTP). "disponível na caixa local" nunca significa e-mail entregue. Ver docs/EVIDENCIAS-ENTREGA-LOCAL.md (L02).';

-- A fila precisa de um estado próprio para "entregue à caixa local". Reusar
-- 'sent' mentiria sobre envio; deixar 'failed'/'dead' mentiria sobre erro.
ALTER TABLE notification_queue DROP CONSTRAINT IF EXISTS notification_queue_status_check;
ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_status_check
  CHECK (status IN ('queued','sending','sent','failed','dead','local_outbox'));

-- Reivindicação atômica da fila: sem isso, dois trabalhadores selecionavam a
-- mesma linha (o FOR UPDATE SKIP LOCKED era emitido fora de transação, então o
-- bloqueio caía ao fim do próprio SELECT) e a notificação era processada duas
-- vezes. Esta coluna permite reivindicar por UPDATE ... RETURNING.
ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS claim_token UUID;
CREATE INDEX IF NOT EXISTS notification_queue_claim_idx
  ON notification_queue (status, next_attempt_at, claimed_at);

-- Ações de auditoria do L02.
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
  'notification_preference_update','notification_template_create','notification_template_update','notification_template_approve','notification_template_reject',
  'integration_check','integration_test','integration_update',
  'catalog_create','catalog_update','catalog_publish',
  'lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel',
  'staff_login_denied','staff_profile_missing','staff_mfa_challenge_issue',
  'staff_mfa_challenge_verify','staff_mfa_challenge_denied',
  'staff_legacy_token_login','staff_legacy_token_refused',
  'staff_session_expired','staff_epoch_bump',
  -- L02
  'local_outbox_write','local_outbox_read','local_outbox_list','local_outbox_purge',
  'notification_local_outbox'
));

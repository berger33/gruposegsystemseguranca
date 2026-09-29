-- CLI-05/06/07/08 chamados agenda relatórios
-- CLI-05 protocolo categoria prioridade responsável mensagens anexos SLA histórico
-- CLI-06 estados aberto/em atendimento/aguardando cliente/resolvido/encerrado reabertura motivo pausas SLA explicitamente definidas
-- CLI-07 agenda visita/manutenção confirmação reagendamento histórico
-- CLI-08 relatórios execução medição/aceite revisão

DO $$ BEGIN CREATE TYPE cli_ticket_category AS ENUM ('acesso_portal','contratos_documentos','atendimento_servico','financeiro','reclamacao','sugestao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_ticket_priority AS ENUM ('baixa','media','alta','critica'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_ticket_status AS ENUM ('aberto','em_atendimento','aguardando_cliente','resolvido','encerrado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_ticket_message_type AS ENUM ('mensagem','nota_interna','mudanca_status','reabertura'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_sla_pause_reason AS ENUM ('aguardando_cliente','aguardando_terceiro','feriado','manutencao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_visit_type AS ENUM ('visita_tecnica','manutencao_preventiva','manutencao_corretiva','vistoria','reuniao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_visit_status AS ENUM ('agendada','confirmada','reagendada','realizada','cancelada','nao_compareceu'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_report_type AS ENUM ('execucao','medicao','aceite','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cli_report_status AS ENUM ('rascunho','em_revisao','aprovado','rejeitado','enviado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CLI-05/06 tickets v2
CREATE TABLE IF NOT EXISTS cli_tickets_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  category cli_ticket_category NOT NULL DEFAULT 'atendimento_servico',
  priority cli_ticket_priority NOT NULL DEFAULT 'media',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  status cli_ticket_status NOT NULL DEFAULT 'aberto',
  responsible_identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  sla_due_at TIMESTAMPTZ,
  sla_paused_at TIMESTAMPTZ,
  sla_pause_reason cli_sla_pause_reason,
  sla_total_paused_seconds BIGINT NOT NULL DEFAULT 0 CHECK (sla_total_paused_seconds >=0),
  reopen_count INT NOT NULL DEFAULT 0 CHECK (reopen_count >=0),
  last_reopen_reason TEXT CHECK (last_reopen_reason IS NULL OR char_length(last_reopen_reason) BETWEEN 10 AND 1000),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  CONSTRAINT chk_sla_pause_reason_required CHECK ((sla_paused_at IS NULL AND sla_pause_reason IS NULL) OR (sla_paused_at IS NOT NULL AND sla_pause_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cli_tickets_v2_account_idx ON cli_tickets_v2(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_tickets_v2_status_idx ON cli_tickets_v2(status, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_tickets_v2_protocol_idx ON cli_tickets_v2(protocol);
CREATE INDEX IF NOT EXISTS cli_tickets_v2_contract_idx ON cli_tickets_v2(contract_id);

CREATE TABLE IF NOT EXISTS cli_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES cli_tickets_v2(id) ON DELETE CASCADE,
  identity_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES cli_client_contacts(id) ON DELETE SET NULL,
  message_type cli_ticket_message_type NOT NULL DEFAULT 'mensagem',
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_ticket_messages_ticket_idx ON cli_ticket_messages(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cli_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES cli_tickets_v2(id) ON DELETE CASCADE,
  message_id UUID REFERENCES cli_ticket_messages(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 500),
  file_url TEXT NOT NULL CHECK (char_length(file_url) BETWEEN 5 AND 1000),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 5 AND 500),
  uploaded_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_ticket_attachments_ticket_idx ON cli_ticket_attachments(ticket_id);

CREATE TABLE IF NOT EXISTS cli_ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES cli_tickets_v2(id) ON DELETE CASCADE,
  previous_status cli_ticket_status,
  next_status cli_ticket_status NOT NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 1000),
  is_reopen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_ticket_history_ticket_idx ON cli_ticket_history(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cli_ticket_sla_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES cli_tickets_v2(id) ON DELETE CASCADE,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMPTZ,
  reason cli_sla_pause_reason NOT NULL,
  paused_by_identity UUID REFERENCES auth_identities(id),
  pause_duration_seconds BIGINT GENERATED ALWAYS AS (CASE WHEN resumed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (resumed_at - paused_at))::BIGINT ELSE 0 END) STORED,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) BETWEEN 10 AND 1000),
  CONSTRAINT chk_resumed_after_paused CHECK (resumed_at IS NULL OR resumed_at >= paused_at)
);
CREATE INDEX IF NOT EXISTS cli_ticket_sla_pauses_ticket_idx ON cli_ticket_sla_pauses(ticket_id, paused_at DESC);

-- CLI-07 visitas agenda
CREATE TABLE IF NOT EXISTS cli_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^VIS-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES cli_tickets_v2(id) ON DELETE SET NULL,
  visit_type cli_visit_type NOT NULL DEFAULT 'visita_tecnica',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) BETWEEN 10 AND 2000),
  scheduled_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  rescheduled_from TIMESTAMPTZ,
  rescheduled_to TIMESTAMPTZ,
  reschedule_reason TEXT CHECK (reschedule_reason IS NULL OR char_length(reschedule_reason) BETWEEN 10 AND 1000),
  status cli_visit_status NOT NULL DEFAULT 'agendada',
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  location TEXT CHECK (location IS NULL OR char_length(location) BETWEEN 3 AND 500),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rescheduled_reason_required CHECK ((rescheduled_from IS NULL AND reschedule_reason IS NULL) OR (rescheduled_from IS NOT NULL AND reschedule_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cli_visits_account_idx ON cli_visits(client_account_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS cli_visits_protocol_idx ON cli_visits(protocol);
CREATE INDEX IF NOT EXISTS cli_visits_status_idx ON cli_visits(status);

CREATE TABLE IF NOT EXISTS cli_visit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES cli_visits(id) ON DELETE CASCADE,
  previous_status cli_visit_status,
  next_status cli_visit_status NOT NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_visit_history_visit_idx ON cli_visit_history(visit_id, created_at DESC);

-- CLI-08 relatórios execução medição/aceite
CREATE TABLE IF NOT EXISTS cli_client_reports_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^REP-CLI-[0-9]{8}-[A-Z0-9]{4}$'),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES cli_visits(id) ON DELETE SET NULL,
  report_type cli_report_type NOT NULL DEFAULT 'execucao',
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 20 AND 10000),
  period_start DATE,
  period_end DATE,
  status cli_report_status NOT NULL DEFAULT 'rascunho',
  reviewed_by_identity UUID REFERENCES auth_identities(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT CHECK (review_notes IS NULL OR char_length(review_notes) BETWEEN 10 AND 2000),
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_period_end_ge_start CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS cli_client_reports_v2_account_idx ON cli_client_reports_v2(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cli_client_reports_v2_protocol_idx ON cli_client_reports_v2(protocol);

CREATE TABLE IF NOT EXISTS cli_client_report_history_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES cli_client_reports_v2(id) ON DELETE CASCADE,
  previous_status cli_report_status,
  next_status cli_report_status NOT NULL,
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 1000),
  is_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cli_client_report_history_v2_report_idx ON cli_client_report_history_v2(report_id, created_at DESC);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_cli_tickets_v2_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_tickets_v2_updated_at ON cli_tickets_v2;
CREATE TRIGGER trg_cli_tickets_v2_updated_at BEFORE UPDATE ON cli_tickets_v2 FOR EACH ROW EXECUTE FUNCTION update_cli_tickets_v2_updated_at();

CREATE OR REPLACE FUNCTION update_cli_visits_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_visits_updated_at ON cli_visits;
CREATE TRIGGER trg_cli_visits_updated_at BEFORE UPDATE ON cli_visits FOR EACH ROW EXECUTE FUNCTION update_cli_visits_updated_at();

CREATE OR REPLACE FUNCTION update_cli_reports_v2_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_reports_v2_updated_at ON cli_client_reports_v2;
CREATE TRIGGER trg_cli_reports_v2_updated_at BEFORE UPDATE ON cli_client_reports_v2 FOR EACH ROW EXECUTE FUNCTION update_cli_reports_v2_updated_at();

-- Immutable history triggers
CREATE OR REPLACE FUNCTION prevent_cli_ticket_history_update_delete() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'cli_ticket_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_ticket_history_immutable ON cli_ticket_history;
CREATE TRIGGER trg_cli_ticket_history_immutable BEFORE UPDATE OR DELETE ON cli_ticket_history FOR EACH ROW EXECUTE FUNCTION prevent_cli_ticket_history_update_delete();

CREATE OR REPLACE FUNCTION prevent_cli_visit_history_update_delete() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'cli_visit_history is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_visit_history_immutable ON cli_visit_history;
CREATE TRIGGER trg_cli_visit_history_immutable BEFORE UPDATE OR DELETE ON cli_visit_history FOR EACH ROW EXECUTE FUNCTION prevent_cli_visit_history_update_delete();

CREATE OR REPLACE FUNCTION prevent_cli_report_history_v2_update_delete() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'cli_client_report_history_v2 is immutable'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cli_report_history_v2_immutable ON cli_client_report_history_v2;
CREATE TRIGGER trg_cli_report_history_v2_immutable BEFORE UPDATE OR DELETE ON cli_client_report_history_v2 FOR EACH ROW EXECUTE FUNCTION prevent_cli_report_history_v2_update_delete();

-- Trilha operacional usada por auditLog({ action, actor, target, meta }) em server.mjs.
-- É distinta de auth_access_audit (acessos/negações), que permanece intocada.
-- O bootstrap PGlite já a criava; PostgreSQL novo ainda não a criava.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT,
  target TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Não apagar CHECK legado nem eventos de uma base existente por conveniência.
-- Um catálogo fechado parcial rejeitaria ações de 049–074 e posteriores, e
-- server.mjs absorve falhas de auditLog: aceitar apenas chaves estruturadas.
DO $audit_schema$
BEGIN
  IF (SELECT count(*) FROM pg_attribute a JOIN (VALUES
      ('id', 'bigint'::regtype), ('action', 'text'::regtype),
      ('actor', 'text'::regtype), ('target', 'text'::regtype),
      ('meta', 'jsonb'::regtype), ('created_at', 'timestamptz'::regtype)
    ) AS expected(column_name, column_type)
    ON a.attname = expected.column_name AND a.atttypid = expected.column_type
    WHERE a.attrelid = 'audit_log'::regclass AND NOT a.attisdropped) <> 6 THEN
    RAISE EXCEPTION 'audit_log_schema_mismatch: reconcile manually';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'audit_log'::regclass AND conname = 'audit_log_action_check') THEN
    RAISE EXCEPTION 'audit_log_legacy_action_check: reconcile manually';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'audit_log'::regclass AND conname = 'audit_log_action_format_check') THEN
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_format_check
      CHECK (action ~ '^[a-z][a-z0-9_]{1,99}$');
  END IF;
END $audit_schema$;
ALTER TABLE audit_log ALTER COLUMN action SET NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_action_created_at_idx ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

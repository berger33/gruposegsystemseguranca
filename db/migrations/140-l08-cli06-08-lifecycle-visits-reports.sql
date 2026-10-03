-- L08 / CLI-06..08: promoção canônica do ciclo de chamados, agenda de visitas
-- e relatórios de execução/medição/aceite no espaço real do cliente.
--
-- Aditiva sobre 001–139. Mantém `client_tickets` como fonte canônica dos
-- chamados promovidos em L08 e cria tabelas canônicas novas para agenda e
-- relatórios, com histórico imutável e escopo por conta/contrato.

BEGIN;

-- CLI-06 — ciclo do chamado: aberto/em atendimento/aguardando cliente/resolvido/encerrado,
-- reabertura com motivo e pausas de SLA explicitamente definidas.
ALTER TABLE client_tickets
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS sla_total_paused_seconds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reopen_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE client_tickets
  DROP CONSTRAINT IF EXISTS client_tickets_status_check;
ALTER TABLE client_tickets
  ADD CONSTRAINT client_tickets_status_check
  CHECK (status IN ('open','in_progress','waiting_client','resolved','closed')) NOT VALID;

ALTER TABLE client_tickets
  DROP CONSTRAINT IF EXISTS client_tickets_sla_pause_pair_check;
ALTER TABLE client_tickets
  ADD CONSTRAINT client_tickets_sla_pause_pair_check
  CHECK (
    (sla_paused_at IS NULL AND sla_pause_reason IS NULL)
    OR (sla_paused_at IS NOT NULL AND sla_pause_reason IN ('waiting_client','third_party','maintenance_window','other'))
  ) NOT VALID;

ALTER TABLE client_tickets
  DROP CONSTRAINT IF EXISTS client_tickets_reopen_reason_check;
ALTER TABLE client_tickets
  ADD CONSTRAINT client_tickets_reopen_reason_check
  CHECK (last_reopen_reason IS NULL OR char_length(last_reopen_reason) BETWEEN 10 AND 500) NOT VALID;

CREATE TABLE IF NOT EXISTS client_ticket_sla_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES client_tickets(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('waiting_client','third_party','maintenance_window','other')),
  notes VARCHAR(500),
  paused_by TEXT NOT NULL CHECK (paused_by IN ('client','marcelo','ti')),
  paused_by_identity UUID REFERENCES auth_identities(id),
  paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_by TEXT CHECK (resumed_by IS NULL OR resumed_by IN ('client','marcelo','ti')),
  resumed_by_identity UUID REFERENCES auth_identities(id),
  resumed_at TIMESTAMPTZ,
  CHECK (resumed_at IS NULL OR resumed_at >= paused_at)
);
CREATE INDEX IF NOT EXISTS client_ticket_sla_pauses_ticket_idx
  ON client_ticket_sla_pauses(ticket_id, paused_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS client_ticket_sla_pauses_open_idx
  ON client_ticket_sla_pauses(ticket_id) WHERE resumed_at IS NULL;

ALTER TABLE client_ticket_status_audit
  ADD COLUMN IF NOT EXISTS reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS is_reopen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sla_pause_id UUID REFERENCES client_ticket_sla_pauses(id) ON DELETE SET NULL;

ALTER TABLE client_ticket_status_audit
  DROP CONSTRAINT IF EXISTS client_ticket_status_audit_previous_status_check;
ALTER TABLE client_ticket_status_audit
  ADD CONSTRAINT client_ticket_status_audit_previous_status_check
  CHECK (previous_status IS NULL OR previous_status IN ('open','in_progress','waiting_client','resolved','closed')) NOT VALID;
ALTER TABLE client_ticket_status_audit
  DROP CONSTRAINT IF EXISTS client_ticket_status_audit_next_status_check;
ALTER TABLE client_ticket_status_audit
  ADD CONSTRAINT client_ticket_status_audit_next_status_check
  CHECK (next_status IN ('open','in_progress','waiting_client','resolved','closed')) NOT VALID;

-- CLI-07 — agenda canônica de visita/manutenção com confirmação,
-- reagendamento e histórico imutável.
CREATE TABLE IF NOT EXISTS client_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES client_tickets(id) ON DELETE SET NULL,
  visit_type TEXT NOT NULL DEFAULT 'technical' CHECK (visit_type IN ('technical','maintenance','inspection','meeting','other')),
  title VARCHAR(160) NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  details VARCHAR(1000),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','rescheduled','completed','cancelled','no_show')),
  confirmed_at TIMESTAMPTZ,
  rescheduled_from TIMESTAMPTZ,
  rescheduled_to TIMESTAMPTZ,
  reschedule_reason VARCHAR(500),
  responsible_name VARCHAR(160),
  location VARCHAR(200),
  created_by TEXT NOT NULL CHECK (created_by IN ('client','marcelo','ti')),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (rescheduled_from IS NULL AND rescheduled_to IS NULL AND reschedule_reason IS NULL)
    OR (rescheduled_from IS NOT NULL AND rescheduled_to IS NOT NULL AND char_length(reschedule_reason) BETWEEN 10 AND 500)
  )
);
CREATE INDEX IF NOT EXISTS client_visits_account_idx ON client_visits(client_account_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS client_visits_status_idx ON client_visits(status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS client_visits_contract_idx ON client_visits(contract_id, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS client_visit_status_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES client_visits(id) ON DELETE CASCADE,
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('scheduled','confirmed','rescheduled','completed','cancelled','no_show')),
  next_status TEXT NOT NULL CHECK (next_status IN ('scheduled','confirmed','rescheduled','completed','cancelled','no_show')),
  changed_by TEXT NOT NULL CHECK (changed_by IN ('client','marcelo','ti')),
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason VARCHAR(500),
  scheduled_from TIMESTAMPTZ,
  scheduled_to TIMESTAMPTZ,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_visit_status_audit_visit_idx
  ON client_visit_status_audit(visit_id, changed_at DESC);

-- CLI-08 — relatórios de execução, medição e aceite com revisão staff antes da
-- publicação no portal e aceite/ciência pelo cliente.
CREATE TABLE IF NOT EXISTS client_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES client_visits(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'execution' CHECK (report_type IN ('execution','measurement','acceptance','other')),
  title VARCHAR(160) NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  summary VARCHAR(1000) NOT NULL CHECK (char_length(summary) BETWEEN 20 AND 1000),
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected','sent','acknowledged')),
  review_notes VARCHAR(1000),
  reviewed_by_identity UUID REFERENCES auth_identities(id),
  reviewed_at TIMESTAMPTZ,
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  acknowledged_by_identity UUID REFERENCES auth_identities(id),
  acknowledged_at TIMESTAMPTZ,
  acknowledgement_note VARCHAR(500),
  created_by TEXT NOT NULL CHECK (created_by IN ('marcelo','ti')),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  CHECK (review_notes IS NULL OR char_length(review_notes) BETWEEN 10 AND 1000),
  CHECK (acknowledgement_note IS NULL OR char_length(acknowledgement_note) BETWEEN 3 AND 500)
);
CREATE INDEX IF NOT EXISTS client_reports_account_idx ON client_reports(client_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_reports_status_idx ON client_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS client_reports_contract_idx ON client_reports(contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS client_report_status_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('draft','in_review','approved','rejected','sent','acknowledged')),
  next_status TEXT NOT NULL CHECK (next_status IN ('draft','in_review','approved','rejected','sent','acknowledged')),
  changed_by TEXT NOT NULL CHECK (changed_by IN ('client','marcelo','ti')),
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason VARCHAR(1000),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_report_status_audit_report_idx
  ON client_report_status_audit(report_id, changed_at DESC);

CREATE OR REPLACE FUNCTION update_client_visits_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_client_visits_updated_at ON client_visits;
CREATE TRIGGER trg_client_visits_updated_at BEFORE UPDATE ON client_visits
FOR EACH ROW EXECUTE FUNCTION update_client_visits_updated_at();

CREATE OR REPLACE FUNCTION update_client_reports_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_client_reports_updated_at ON client_reports;
CREATE TRIGGER trg_client_reports_updated_at BEFORE UPDATE ON client_reports
FOR EACH ROW EXECUTE FUNCTION update_client_reports_updated_at();

CREATE OR REPLACE FUNCTION prevent_client_visit_status_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'client_visit_status_audit is immutable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_client_visit_status_audit_immutable ON client_visit_status_audit;
CREATE TRIGGER trg_client_visit_status_audit_immutable BEFORE UPDATE OR DELETE ON client_visit_status_audit
FOR EACH ROW EXECUTE FUNCTION prevent_client_visit_status_audit_mutation();

CREATE OR REPLACE FUNCTION prevent_client_report_status_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'client_report_status_audit is immutable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_client_report_status_audit_immutable ON client_report_status_audit;
CREATE TRIGGER trg_client_report_status_audit_immutable BEFORE UPDATE OR DELETE ON client_report_status_audit
FOR EACH ROW EXECUTE FUNCTION prevent_client_report_status_audit_mutation();

-- A tabela auth_access_audit tem CHECK fechado e precisa conhecer as novas ações.
DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check'
     AND contype = 'c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)) NOT VALID',
      previous_check,
      'ticket_reopen', 'ticket_sla_pause', 'ticket_sla_resume',
      'visit_list', 'visit_create', 'visit_status',
      'report_list', 'report_create', 'report_status', 'report_acknowledge',
      'visit_history', 'report_history'
    );
  END IF;
END
$audit_actions$;

COMMIT;

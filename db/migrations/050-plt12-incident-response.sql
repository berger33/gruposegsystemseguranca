-- PLT-12 resposta a incidente com responsáveis, contenção, evidências, análise e comunicação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
    CREATE TYPE incident_type AS ENUM ('vazamento_dados','acesso_nao_autorizado','perda_dados','indisponibilidade','malware','phishing','violacao_privacidade','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_severity') THEN
    CREATE TYPE incident_severity AS ENUM ('baixa','media','alta','critica');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
    CREATE TYPE incident_status AS ENUM ('aberto','em_contencao','em_analise','em_remediacao','aguardando_comunicacao','comunicado','encerrado','reaberto');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_evidence_type') THEN
    CREATE TYPE incident_evidence_type AS ENUM ('log','print','relatorio','depoimento','arquivo','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_action_type') THEN
    CREATE TYPE incident_action_type AS ENUM ('contencao','erradicacao','recuperacao','comunicacao','analise','prevencao','outro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS security_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type incident_type NOT NULL,
  severity incident_severity NOT NULL DEFAULT 'media',
  status incident_status NOT NULL DEFAULT 'aberto',
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 10 AND char_length(title) <= 200),
  description TEXT NOT NULL CHECK (char_length(description) >= 20 AND char_length(description) <= 5000),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contained_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  affected_data_categories crm_privacy_data_category[] DEFAULT '{}',
  affected_records_estimate INTEGER CHECK (affected_records_estimate IS NULL OR affected_records_estimate >= 0),
  affected_systems TEXT[] DEFAULT '{}',
  responsible_id VARCHAR(80),
  responsible_name VARCHAR(200),
  containment_lead_id VARCHAR(80),
  containment_lead_name VARCHAR(200),
  dpo_notified BOOLEAN NOT NULL DEFAULT FALSE,
  dpo_notified_at TIMESTAMPTZ,
  authority_notified BOOLEAN NOT NULL DEFAULT FALSE,
  authority_notified_at TIMESTAMPTZ,
  data_subjects_notified BOOLEAN NOT NULL DEFAULT FALSE,
  data_subjects_notified_at TIMESTAMPTZ,
  root_cause TEXT CHECK (char_length(root_cause) <= 2000),
  impact_assessment TEXT CHECK (char_length(impact_assessment) <= 2000),
  remediation_plan TEXT CHECK (char_length(remediation_plan) <= 2000),
  lessons_learned TEXT CHECK (char_length(lessons_learned) <= 2000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  updated_by VARCHAR(80),
  updated_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_type ON security_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_detected ON security_incidents(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_responsible ON security_incidents(responsible_id);

DROP TRIGGER IF EXISTS trg_incidents_updated ON security_incidents;
CREATE TRIGGER trg_incidents_updated BEFORE UPDATE ON security_incidents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS incident_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  evidence_type incident_evidence_type NOT NULL DEFAULT 'log',
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 2000),
  file_reference VARCHAR(500),
  checksum VARCHAR(128),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_by VARCHAR(80),
  collected_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidences_incident ON incident_evidences(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidences_type ON incident_evidences(evidence_type);

CREATE TABLE IF NOT EXISTS incident_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  action_type incident_action_type NOT NULL DEFAULT 'contencao',
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_execucao','concluida','cancelada')),
  assigned_to_id VARCHAR(80),
  assigned_to_name VARCHAR(200),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actions_incident ON incident_actions(incident_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON incident_actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_assigned ON incident_actions(assigned_to_id);

DROP TRIGGER IF EXISTS trg_actions_updated ON incident_actions;
CREATE TRIGGER trg_actions_updated BEFORE UPDATE ON incident_actions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS incident_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('dpo','autoridade','titular','interno','cliente','outro')),
  recipient_contact VARCHAR(320),
  subject VARCHAR(200) NOT NULL CHECK (char_length(subject) >= 5 AND char_length(subject) <= 200),
  content TEXT NOT NULL CHECK (char_length(content) >= 20 AND char_length(content) <= 5000),
  sent_at TIMESTAMPTZ,
  sent_by VARCHAR(80),
  sent_by_id VARCHAR(80),
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comms_incident ON incident_communications(incident_id);
CREATE INDEX IF NOT EXISTS idx_comms_type ON incident_communications(recipient_type);

CREATE TABLE IF NOT EXISTS incident_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  previous_status incident_status,
  next_status incident_status NOT NULL,
  reason TEXT CHECK (char_length(reason) <= 2000),
  changed_by VARCHAR(80),
  changed_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_history_incident ON incident_history(incident_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_create') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_update') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_contain') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_contain';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_evidence_add') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_evidence_add';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_action_create') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_action_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_action_complete') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_action_complete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_communicate') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_communicate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'incident_close') THEN
    ALTER TYPE audit_action ADD VALUE 'incident_close';
  END IF;
END $$;

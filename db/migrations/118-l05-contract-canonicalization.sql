-- L05: canonical commercial contracts and safe compatibility with the legacy client portal.
-- Existing migrations 001–117 are immutable.  crm_contracts remains the source
-- of truth for commercial/contractual work; client_contracts remains a portal
-- projection only when explicitly linked by an authorized operator.

-- Manual registration has no proposal by design.  Do not manufacture a proposal
-- just to satisfy the old NOT NULL column.
ALTER TABLE crm_contracts ALTER COLUMN proposal_id DROP NOT NULL;
-- Manual contracts also receive an implantation record for CON-07, but no
-- fictitious proposal may be created merely to fill its historical column.
ALTER TABLE crm_contract_implantations ALTER COLUMN proposal_id DROP NOT NULL;
-- An exceptional operational waiver is time-bound.  Legal requirements never
-- become waivable through this field (enforced by the API).
ALTER TABLE crm_implantation_exceptions
  ADD COLUMN IF NOT EXISTS valid_until DATE;

CREATE TABLE IF NOT EXISTS crm_contract_portal_links (
  contract_id UUID PRIMARY KEY REFERENCES crm_contracts(id) ON DELETE RESTRICT,
  client_contract_id UUID NOT NULL UNIQUE REFERENCES client_contracts(id) ON DELETE RESTRICT,
  linked_by_id UUID REFERENCES auth_identities(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT NOT NULL CHECK (char_length(trim(note)) BETWEEN 10 AND 500)
);

-- A contract document is always a document already held by the private L02
-- provider.  Metadata/URLs alone are not evidence bytes and are not linkable.
CREATE TABLE IF NOT EXISTS crm_contract_private_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE RESTRICT,
  client_document_id UUID NOT NULL REFERENCES client_documents(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (char_length(trim(category)) BETWEEN 1 AND 60),
  linked_by_id UUID REFERENCES auth_identities(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, client_document_id)
);
CREATE INDEX IF NOT EXISTS crm_contract_private_documents_contract_idx
  ON crm_contract_private_documents(contract_id, linked_at DESC);

-- Obligation proofs and quality evidence also point only to the L02 private
-- document record.  No URL or storage key is accepted as evidence by L05.
CREATE TABLE IF NOT EXISTS crm_document_obligation_private_documents (
  obligation_id UUID PRIMARY KEY REFERENCES crm_document_obligations(id) ON DELETE RESTRICT,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE RESTRICT,
  client_document_id UUID NOT NULL REFERENCES client_documents(id) ON DELETE RESTRICT,
  linked_by_id UUID REFERENCES auth_identities(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, client_document_id)
);
CREATE TABLE IF NOT EXISTS crm_quality_evidence_private_documents (
  evidence_id UUID PRIMARY KEY REFERENCES crm_contract_quality_evidences(id) ON DELETE RESTRICT,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE RESTRICT,
  client_document_id UUID NOT NULL REFERENCES client_documents(id) ON DELETE RESTRICT,
  linked_by_id UUID REFERENCES auth_identities(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, client_document_id)
);

-- Reprocessing a due alert may not create a second task/opportunity/outbox item.
CREATE TABLE IF NOT EXISTS crm_contract_alert_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_rule_id UUID NOT NULL REFERENCES crm_contract_alert_rules(id) ON DELETE RESTRICT,
  contract_id UUID NOT NULL REFERENCES crm_contracts(id) ON DELETE RESTRICT,
  due_date DATE NOT NULL,
  task_id UUID REFERENCES crm_tasks(id) ON DELETE RESTRICT,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  notification_id UUID REFERENCES notification_queue(id) ON DELETE RESTRICT,
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alert_rule_id, due_date)
);
CREATE INDEX IF NOT EXISTS crm_contract_alert_runs_contract_idx
  ON crm_contract_alert_runs(contract_id, due_date DESC);

-- Every implantation, including one created by the pre-L05 acceptance route,
-- receives the same explicit checklist.  Existing records are backfilled as
-- pending rather than inferred as complete.
CREATE OR REPLACE FUNCTION l05_seed_implantation_steps() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO crm_implantation_steps (id, implantation_id, contract_id, step_id, title, status)
  SELECT gen_random_uuid(), NEW.id, NEW.contract_id, definitions.step_id, definitions.title, 'pendente'
  FROM (VALUES
    ('contrato'::crm_implantation_step_id, 'Contrato e evidência de assinatura'),
    ('data_inicio'::crm_implantation_step_id, 'Data de início definida'),
    ('postos'::crm_implantation_step_id, 'Postos e turnos dimensionados'),
    ('dimensionamento'::crm_implantation_step_id, 'Dimensionamento validado'),
    ('contratacao_alocacao'::crm_implantation_step_id, 'Contratação ou alocação de equipe'),
    ('exames_treinamentos'::crm_implantation_step_id, 'Exames e treinamentos'),
    ('equipamentos'::crm_implantation_step_id, 'Equipamentos disponíveis'),
    ('instrucoes'::crm_implantation_step_id, 'Instruções operacionais'),
    ('faturamento'::crm_implantation_step_id, 'Configuração de faturamento'),
    ('convite_cliente'::crm_implantation_step_id, 'Convite do cliente para o portal')
  ) AS definitions(step_id, title)
  ON CONFLICT (implantation_id, step_id) DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_l05_seed_implantation_steps ON crm_contract_implantations;
CREATE TRIGGER trg_l05_seed_implantation_steps
AFTER INSERT ON crm_contract_implantations
FOR EACH ROW EXECUTE FUNCTION l05_seed_implantation_steps();
INSERT INTO crm_implantation_steps (id, implantation_id, contract_id, step_id, title, status)
SELECT gen_random_uuid(), i.id, i.contract_id, definitions.step_id, definitions.title, 'pendente'
FROM crm_contract_implantations i
CROSS JOIN (VALUES
  ('contrato'::crm_implantation_step_id, 'Contrato e evidência de assinatura'),
  ('data_inicio'::crm_implantation_step_id, 'Data de início definida'),
  ('postos'::crm_implantation_step_id, 'Postos e turnos dimensionados'),
  ('dimensionamento'::crm_implantation_step_id, 'Dimensionamento validado'),
  ('contratacao_alocacao'::crm_implantation_step_id, 'Contratação ou alocação de equipe'),
  ('exames_treinamentos'::crm_implantation_step_id, 'Exames e treinamentos'),
  ('equipamentos'::crm_implantation_step_id, 'Equipamentos disponíveis'),
  ('instrucoes'::crm_implantation_step_id, 'Instruções operacionais'),
  ('faturamento'::crm_implantation_step_id, 'Configuração de faturamento'),
  ('convite_cliente'::crm_implantation_step_id, 'Convite do cliente para o portal')
) AS definitions(step_id, title)
ON CONFLICT (implantation_id, step_id) DO NOTHING;

-- Keep the audit whitelist additive.  A missing parent constraint or roles used
-- by L05 is a migration failure, never a silent unaudited write.
DO $$
DECLARE
  current_definition TEXT;
  actor_kind_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_definition
    FROM pg_constraint
   WHERE conrelid='auth_access_audit'::regclass
     AND conname='auth_access_audit_action_check' AND contype='c';
  IF current_definition IS NULL OR left(current_definition, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_action_constraint_missing';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO actor_kind_definition
    FROM pg_constraint
   WHERE conrelid='auth_access_audit'::regclass
     AND conname='auth_access_audit_actor_kind_check' AND contype='c';
  IF actor_kind_definition IS NULL
     OR actor_kind_definition NOT LIKE '%''marcelo''%'
     OR actor_kind_definition NOT LIKE '%''admin''%'
     OR actor_kind_definition NOT LIKE '%''comercial''%' THEN
    RAISE EXCEPTION 'audit_actor_kind_l05_missing';
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''l05_contract_create'',''l05_contract_update'',''l05_contract_transition'',''l05_contract_amendment'',''l05_contract_alert_run'',''l05_contract_document_link'',''l05_implantation_update'',''l05_implantation_exception'',''l05_contract_closure'',''l05_fiscal_dossier'',''l05_management_diary''))',
    substring(current_definition FROM 7)
  );
END $$;

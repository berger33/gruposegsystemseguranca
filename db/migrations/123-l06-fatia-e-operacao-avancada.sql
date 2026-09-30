-- 123-l06-fatia-e-operacao-avancada.sql
-- L06 Fatia E (OPS-09..16): escopo canônico, idempotência e rotulagem sintética.
-- Migração estritamente aditiva; 001–122 permanecem imutáveis.

ALTER TYPE ops_monitoring_event_type ADD VALUE IF NOT EXISTS 'panico_simulado';

ALTER TABLE ops_supervision_visits
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
ALTER TABLE ops_patrols
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ops_patrol_points
  ADD COLUMN IF NOT EXISTS reading_key TEXT,
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ops_keys
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;
ALTER TABLE ops_key_movements
  ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE ops_client_reports
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_document_id UUID REFERENCES client_documents(id) ON DELETE SET NULL;
ALTER TABLE ops_metrics_snapshots
  ADD COLUMN IF NOT EXISTS completeness_status TEXT NOT NULL DEFAULT 'incompleto',
  ADD COLUMN IF NOT EXISTS incompleteness_reason TEXT;
-- Registros anteriores à Fatia E não podem ser interpretados como completos;
-- preservamos a incerteza explicitamente antes de validar a constraint.
UPDATE ops_metrics_snapshots
   SET incompleteness_reason='Registro anterior à coleta explícita de completude da Fatia E'
 WHERE completeness_status<>'completo' AND incompleteness_reason IS NULL;
ALTER TABLE ops_assisted_schedule_proposals
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;
ALTER TABLE ops_cleaning_environments
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;
ALTER TABLE ops_cleaning_executions
  ADD COLUMN IF NOT EXISTS inspected_by TEXT,
  ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quality_notes TEXT;
ALTER TABLE ops_monitoring_connectors
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ops_monitoring_events
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS treatment_notes TEXT,
  ADD COLUMN IF NOT EXISTS closed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_ops_sup_visits_contract ON ops_supervision_visits(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_patrols_contract ON ops_patrols(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_keys_contract ON ops_keys(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_reports_unit ON ops_client_reports(unit_id);
CREATE INDEX IF NOT EXISTS idx_ops_reports_client_doc ON ops_client_reports(client_document_id);
CREATE INDEX IF NOT EXISTS idx_ops_assisted_contract ON ops_assisted_schedule_proposals(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_clean_env_contract ON ops_cleaning_environments(contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_patrol_reading_key
  ON ops_patrol_points(patrol_id, reading_key) WHERE reading_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_key_active_custody
  ON ops_key_movements(key_id)
  WHERE movement_type IN ('retirada','transferencia') AND actual_return_date IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_ops_metric_completeness') THEN
    ALTER TABLE ops_metrics_snapshots ADD CONSTRAINT chk_ops_metric_completeness
      CHECK (completeness_status IN ('completo','parcial','incompleto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_ops_metric_incomplete_reason') THEN
    ALTER TABLE ops_metrics_snapshots ADD CONSTRAINT chk_ops_metric_incomplete_reason
      CHECK (completeness_status='completo' OR char_length(incompleteness_reason) >= 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_ops_monitoring_connector_synthetic') THEN
    ALTER TABLE ops_monitoring_connectors ADD CONSTRAINT chk_ops_monitoring_connector_synthetic CHECK (is_synthetic = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_ops_monitoring_event_synthetic') THEN
    ALTER TABLE ops_monitoring_events ADD CONSTRAINT chk_ops_monitoring_event_synthetic CHECK (is_synthetic = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_ops_patrol_synthetic') THEN
    ALTER TABLE ops_patrols ADD CONSTRAINT chk_ops_patrol_synthetic CHECK (is_synthetic = true);
  END IF;
END $$;

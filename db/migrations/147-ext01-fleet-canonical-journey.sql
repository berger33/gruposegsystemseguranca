-- EXT-01: frota ligada ao backend canônico real — veículo, responsável,
-- abastecimento, manutenção, documentos e custo, com histórico/custo por
-- veículo e alerta de manutenção derivado de regra explícita registrada.
-- Aditiva sobre a 085; migrações 001–146 permanecem imutáveis.
-- Nenhuma autoria retroativa é inventada: veículos legados ficam com origem
-- 'registro_legado' e fora da jornada canônica; histórico e custo nascem
-- somente de registros reais criados a partir desta jornada ou já existentes
-- nas tabelas canônicas da 085.

BEGIN;

-- ---------------------------------------------------------------------------
-- Veículo: origem da jornada. A jornada canônica deriva autoria da sessão
-- staff; linhas legadas não ganham autoria inventada.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_fleet_vehicles
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado';

ALTER TABLE ext_fleet_vehicles
  DROP CONSTRAINT IF EXISTS ext_fleet_vehicles_origin_check;
ALTER TABLE ext_fleet_vehicles
  ADD CONSTRAINT ext_fleet_vehicles_origin_check
  CHECK (origin IN ('registro_legado','jornada_frota'))
  NOT VALID;

-- Veículo criado pela jornada canônica nasce com autoria derivada da sessão.
ALTER TABLE ext_fleet_vehicles
  DROP CONSTRAINT IF EXISTS ext_fleet_vehicles_journey_binding_check;
ALTER TABLE ext_fleet_vehicles
  ADD CONSTRAINT ext_fleet_vehicles_journey_binding_check
  CHECK (origin <> 'jornada_frota' OR created_by_identity IS NOT NULL)
  NOT VALID;

COMMENT ON COLUMN ext_fleet_vehicles.origin IS
  'jornada_frota: criado pela jornada canônica EXT-01 com autoria derivada da sessão staff; registro_legado: linhas anteriores à 147, sem autoria inventada.';

-- ---------------------------------------------------------------------------
-- Histórico imutável de responsável pelo veículo. O responsável vigente fica
-- em ext_fleet_vehicles.responsible_name; cada troca é registrada aqui com o
-- autor derivado da sessão e o motivo declarado.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_fleet_responsible_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES ext_fleet_vehicles(id) ON DELETE RESTRICT,
  previous_responsible_name TEXT,
  responsible_name TEXT NOT NULL CHECK (char_length(responsible_name) BETWEEN 2 AND 200),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 500),
  assigned_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_fleet_responsible_history_vehicle_idx
  ON ext_fleet_responsible_history (vehicle_id, assigned_at DESC);

COMMENT ON TABLE ext_fleet_responsible_history IS
  'Histórico imutável de atribuição de responsável por veículo (EXT-01). Autor sempre derivado da sessão staff; nunca do corpo do navegador.';

-- ---------------------------------------------------------------------------
-- Regra explícita de alerta de manutenção. O alerta NUNCA é inferido: só
-- existe quando uma regra registrada (dias e/ou km) o sustenta, e a derivação
-- declara regra, base e data-base. Uma única regra ativa por veículo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_fleet_maintenance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES ext_fleet_vehicles(id) ON DELETE RESTRICT,
  interval_days INT CHECK (interval_days IS NULL OR interval_days BETWEEN 1 AND 3650),
  interval_km INT CHECK (interval_km IS NULL OR interval_km BETWEEN 1 AND 1000000),
  alert_before_days INT NOT NULL DEFAULT 15 CHECK (alert_before_days BETWEEN 0 AND 365),
  alert_before_km INT NOT NULL DEFAULT 500 CHECK (alert_before_km BETWEEN 0 AND 100000),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 5 AND 500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by_identity UUID REFERENCES auth_identities(id),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (interval_days IS NOT NULL OR interval_km IS NOT NULL),
  CHECK (is_active = true OR deactivated_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_fleet_maintenance_rules_active_one_per_vehicle
  ON ext_fleet_maintenance_rules (vehicle_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS ext_fleet_maintenance_rules_vehicle_idx
  ON ext_fleet_maintenance_rules (vehicle_id, created_at DESC);

COMMENT ON TABLE ext_fleet_maintenance_rules IS
  'Regra explícita de alerta de manutenção por veículo (EXT-01). Sem regra ativa, a jornada declara a ausência e nenhum alerta é inferido.';

-- ---------------------------------------------------------------------------
-- Eventos imutáveis por veículo: cada mutação da jornada canônica gera um
-- evento na MESMA transação do negócio e da auditoria. A chave de idempotência
-- vive aqui: retry idêntico não duplica e reuso divergente responde 409.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_fleet_vehicle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES ext_fleet_vehicles(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'veiculo_criado','situacao_atualizada','responsavel_atribuido',
    'abastecimento_registrado','manutencao_registrada','documento_registrado',
    'documento_desativado','regra_manutencao_registrada'
  )),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 5 AND 500),
  payload JSONB,
  idempotency_key VARCHAR(200),
  request_fingerprint CHAR(64),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR (
      char_length(idempotency_key) BETWEEN 8 AND 200
      AND request_fingerprint ~ '^[0-9a-f]{64}$'
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_fleet_vehicle_events_identity_idempotency_key
  ON ext_fleet_vehicle_events (created_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_fleet_vehicle_events_vehicle_idx
  ON ext_fleet_vehicle_events (vehicle_id, created_at DESC);

COMMENT ON TABLE ext_fleet_vehicle_events IS
  'Histórico imutável de eventos da jornada canônica de frota (EXT-01), gravado na mesma transação do negócio e da auditoria. Carrega a chave de idempotência por identidade staff.';
COMMENT ON COLUMN ext_fleet_vehicle_events.idempotency_key IS
  'Chave de idempotência enviada no header da mutação; única por identidade staff. Reuso com conteúdo divergente responde 409.';
COMMENT ON COLUMN ext_fleet_vehicle_events.request_fingerprint IS
  'SHA-256 do conteúdo normalizado da mutação; replay idêntico devolve o mesmo registro sem duplicar.';

-- ---------------------------------------------------------------------------
-- Documentos: desativação declarada (nunca apagar), com autor e motivo.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_fleet_documents
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS deactivate_reason TEXT;

ALTER TABLE ext_fleet_documents
  DROP CONSTRAINT IF EXISTS ext_fleet_documents_deactivation_check;
ALTER TABLE ext_fleet_documents
  ADD CONSTRAINT ext_fleet_documents_deactivation_check
  CHECK (
    (deactivated_at IS NULL AND deactivated_by_identity IS NULL AND deactivate_reason IS NULL)
    OR (
      deactivated_at IS NOT NULL
      AND deactivated_by_identity IS NOT NULL
      AND char_length(deactivate_reason) BETWEEN 5 AND 500
      AND is_active = false
    )
  )
  NOT VALID;

-- ---------------------------------------------------------------------------
-- Imutabilidade de histórico: abastecimentos, manutenções, histórico de
-- responsável e eventos não aceitam UPDATE/DELETE. A jornada só acrescenta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ext_fleet_history_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ext_fleet_history_immutable: % em % não é permitido; histórico de frota é apenas-acréscimo', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_fleet_fuel_logs_immutable ON ext_fleet_fuel_logs;
CREATE TRIGGER ext_fleet_fuel_logs_immutable
  BEFORE UPDATE OR DELETE ON ext_fleet_fuel_logs
  FOR EACH ROW EXECUTE FUNCTION ext_fleet_history_immutable();

DROP TRIGGER IF EXISTS ext_fleet_maintenance_logs_immutable ON ext_fleet_maintenance_logs;
CREATE TRIGGER ext_fleet_maintenance_logs_immutable
  BEFORE UPDATE OR DELETE ON ext_fleet_maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION ext_fleet_history_immutable();

DROP TRIGGER IF EXISTS ext_fleet_responsible_history_immutable ON ext_fleet_responsible_history;
CREATE TRIGGER ext_fleet_responsible_history_immutable
  BEFORE UPDATE OR DELETE ON ext_fleet_responsible_history
  FOR EACH ROW EXECUTE FUNCTION ext_fleet_history_immutable();

DROP TRIGGER IF EXISTS ext_fleet_vehicle_events_immutable ON ext_fleet_vehicle_events;
CREATE TRIGGER ext_fleet_vehicle_events_immutable
  BEFORE UPDATE OR DELETE ON ext_fleet_vehicle_events
  FOR EACH ROW EXECUTE FUNCTION ext_fleet_history_immutable();

COMMIT;

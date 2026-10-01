-- FIN-12: hardening aditivo de boletos/Pix/gateway.
--
-- Princípios aplicados (somente aditivo; nenhuma migração histórica é
-- alterada e nenhum tipo existente é modificado):
--   * cobrança só existe depois de seleção E teste em sandbox (status
--     'sandbox' no gateway), nunca por um booleano isolado confiável;
--   * assinatura de webhook NUNCA é aceita por afirmação do cliente: a API
--     recalcula o HMAC-SHA256 com o segredo sandbox do gateway e compara;
--   * replay é detectado por idempotência e o evento original é marcado;
--   * conciliação liga webhook validado -> cobrança, nunca um PATCH livre;
--   * nenhuma cobrança real é possível: ambiente é sempre sandbox, o status
--     'producao' do enum histórico é permanentemente recusado, e
--     'is_real_payment' é travado em falso;
--   * estados e transições são explícitos e validados no banco;
--   * histórico imutável em fin_gateway_history.

-- ---------------------------------------------------------------------------
-- Histórico imutável compartilhado das entidades de gateway
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_gateway_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('gateway','webhook','charge')),
  entity_id UUID NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL CHECK (char_length(next_status) BETWEEN 3 AND 50),
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_gateway_history_entity_idx ON fin_gateway_history(entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION fin_gateway_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_gateway_history_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_gateway_history_immutable ON fin_gateway_history;
CREATE TRIGGER trg_fin_gateway_history_immutable
  BEFORE UPDATE OR DELETE ON fin_gateway_history
  FOR EACH ROW EXECUTE FUNCTION fin_gateway_history_immutable();

-- ---------------------------------------------------------------------------
-- Gateway: seleção e sandbox obrigatórios, 'producao' permanentemente recusado
-- ---------------------------------------------------------------------------
ALTER TABLE fin_payment_gateways
  ADD COLUMN IF NOT EXISTS gateway_code TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_payment_gateways_code_key
  ON fin_payment_gateways(gateway_code) WHERE gateway_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_payment_gateways_idempotency_key
  ON fin_payment_gateways(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserva linhas do rascunho 079, mas as regras valem para toda
-- escrita nova e para toda alteração.
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_sandbox_environment_only
  CHECK (environment = 'sandbox') NOT VALID;
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_code_required
  CHECK (gateway_code IS NOT NULL AND gateway_code ~ '^[a-z][a-z0-9_-]{2,59}$') NOT VALID;
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_webhook_secret_sandbox_only
  CHECK (webhook_secret IS NOT NULL AND webhook_secret ~ '^sandbox_[A-Za-z0-9]{16,64}$') NOT VALID;
-- 'producao' nunca é alcançável: nenhuma cobrança real em testes, nenhuma
-- emissão/transmissão real é implementada neste simulador.
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_production_refused
  CHECK (status <> 'producao') NOT VALID;

CREATE OR REPLACE FUNCTION fin12_guard_gateway_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'producao' THEN
    RAISE EXCEPTION 'fin_gateway_production_refused' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'nao_selecionado' THEN
      RAISE EXCEPTION 'fin_gateway_initial_status_must_be_nao_selecionado' USING ERRCODE = '23514';
    END IF;
    IF NEW.is_selected <> false OR NEW.last_test_at IS NOT NULL OR NEW.error_sanitized IS NOT NULL THEN
      RAISE EXCEPTION 'fin_gateway_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW.name <> OLD.name OR NEW.gateway_code <> OLD.gateway_code
       OR NEW.environment <> OLD.environment OR NEW.webhook_secret <> OLD.webhook_secret
       OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.created_by_identity <> OLD.created_by_identity THEN
      RAISE EXCEPTION 'fin_gateway_identity_fields_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'fin_gateway_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD.status = 'nao_selecionado' AND NEW.status IN ('selecionado','desativado'))
      OR (OLD.status = 'selecionado' AND NEW.status IN ('sandbox','desativado'))
      OR (OLD.status = 'sandbox' AND NEW.status = 'desativado')
    ) THEN
      RAISE EXCEPTION 'fin_gateway_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Seleção exige sandbox: nunca uma cobrança real em testes.
  IF NEW.status IN ('selecionado','sandbox') AND (NEW.is_selected <> true OR NEW.is_sandbox <> true) THEN
    RAISE EXCEPTION 'fin_gateway_sandbox_required_when_selected' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'desativado' AND NEW.is_selected <> false THEN
    RAISE EXCEPTION 'fin_gateway_sandbox_required_when_selected' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'sandbox' AND NEW.last_test_at IS NULL THEN
    RAISE EXCEPTION 'fin_gateway_sandbox_requires_timestamp' USING ERRCODE = '23514';
  END IF;
  -- Nenhuma credencial real pode ser persistida; a configuração é sintética.
  IF NEW.config ?| array['token','secret','password','senha','certificate','certificado','private_key'] THEN
    RAISE EXCEPTION 'fin_gateway_credentials_refused' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin12_guard_gateway_write ON fin_payment_gateways;
CREATE TRIGGER trg_fin12_guard_gateway_write
  BEFORE INSERT OR UPDATE ON fin_payment_gateways
  FOR EACH ROW EXECUTE FUNCTION fin12_guard_gateway_write();

-- ---------------------------------------------------------------------------
-- Webhook: assinatura é recomputada pela API (nunca afirmada pelo cliente)
-- ---------------------------------------------------------------------------
ALTER TABLE fin_gateway_webhooks
  ADD COLUMN IF NOT EXISTS charge_id UUID REFERENCES fin_gateway_charges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_method TEXT;

ALTER TABLE fin_gateway_webhooks
  ADD CONSTRAINT fin_gateway_webhook_event_type_known
  CHECK (event_type IN ('gateway.ping','payment.confirmed','payment.failed','payment.refunded')) NOT VALID;
ALTER TABLE fin_gateway_webhooks
  ADD CONSTRAINT fin_gateway_webhook_verification_method_required
  CHECK (verification_method = 'hmac_sha256_sandbox') NOT VALID;
ALTER TABLE fin_gateway_webhooks
  ADD CONSTRAINT fin_gateway_webhook_charge_required_for_payment_events
  CHECK (
    (event_type = 'gateway.ping' AND charge_id IS NULL)
    OR (event_type <> 'gateway.ping' AND charge_id IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin12_guard_webhook_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  gateway_row fin_payment_gateways%ROWTYPE;
  charge_row fin_gateway_charges%ROWTYPE;
BEGIN
  SELECT * INTO gateway_row FROM fin_payment_gateways WHERE id = NEW.gateway_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_gateway_webhook_gateway_required' USING ERRCODE = '23514';
  END IF;

  IF NEW.charge_id IS NOT NULL THEN
    SELECT * INTO charge_row FROM fin_gateway_charges WHERE id = NEW.charge_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'fin_gateway_webhook_charge_required_for_event' USING ERRCODE = '23514';
    END IF;
    IF charge_row.gateway_id <> NEW.gateway_id THEN
      RAISE EXCEPTION 'fin_gateway_webhook_charge_gateway_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('validado','rejeitado') THEN
      RAISE EXCEPTION 'fin_gateway_webhook_initial_status_invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW.is_replay <> false OR NEW.processed_at IS NOT NULL OR NEW.conciliated_at IS NOT NULL THEN
      RAISE EXCEPTION 'fin_gateway_webhook_fields_immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW.gateway_id <> OLD.gateway_id OR NEW.event_type <> OLD.event_type
       OR NEW.signature <> OLD.signature OR NEW.payload::text <> OLD.payload::text
       OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
       OR NEW.is_valid_signature <> OLD.is_valid_signature OR NEW.verification_method IS DISTINCT FROM OLD.verification_method THEN
      RAISE EXCEPTION 'fin_gateway_webhook_fields_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'fin_gateway_webhook_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD.status = 'validado' AND NEW.status IN ('replay','conciliado'))
      OR (OLD.status = 'rejeitado' AND NEW.status = 'replay')
    ) THEN
      RAISE EXCEPTION 'fin_gateway_webhook_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- A assinatura só pode ser considerada válida quando a API registrou o
  -- método de verificação sintético (recomputado no servidor); nenhum
  -- cliente pode afirmar validade diretamente.
  IF NEW.is_valid_signature = true AND NEW.verification_method IS DISTINCT FROM 'hmac_sha256_sandbox' THEN
    RAISE EXCEPTION 'fin_gateway_webhook_signature_verification_metadata_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.is_valid_signature = false AND NEW.status NOT IN ('rejeitado','replay') THEN
    RAISE EXCEPTION 'fin_gateway_webhook_signature_verification_metadata_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'conciliado' AND (NEW.charge_id IS NULL OR NEW.is_valid_signature = false) THEN
    RAISE EXCEPTION 'fin_gateway_webhook_charge_required_for_event' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin12_guard_webhook_write ON fin_gateway_webhooks;
CREATE TRIGGER trg_fin12_guard_webhook_write
  BEFORE INSERT OR UPDATE ON fin_gateway_webhooks
  FOR EACH ROW EXECUTE FUNCTION fin12_guard_webhook_write();

-- ---------------------------------------------------------------------------
-- Cobrança: nasce pendente, só muda de estado por webhook validado e
-- conciliado; cancelamento manual só antes de qualquer desfecho.
-- ---------------------------------------------------------------------------
ALTER TABLE fin_gateway_charges
  ADD COLUMN IF NOT EXISTS is_real_payment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_webhook_id UUID REFERENCES fin_gateway_webhooks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_webhook_id UUID REFERENCES fin_gateway_webhooks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_gateway_charges_confirmation_webhook_key
  ON fin_gateway_charges(confirmation_webhook_id) WHERE confirmation_webhook_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_gateway_charges_refund_webhook_key
  ON fin_gateway_charges(refund_webhook_id) WHERE refund_webhook_id IS NOT NULL;

ALTER TABLE fin_gateway_charges
  ADD CONSTRAINT fin_gateway_charge_real_payment_refused
  CHECK (is_real_payment = false) NOT VALID;

CREATE OR REPLACE FUNCTION fin12_guard_charge_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  gateway_row fin_payment_gateways%ROWTYPE;
  confirmation_row fin_gateway_webhooks%ROWTYPE;
  refund_row fin_gateway_webhooks%ROWTYPE;
BEGIN
  SELECT * INTO gateway_row FROM fin_payment_gateways WHERE id = NEW.gateway_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_gateway_charge_gateway_required' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_gateway_charge_initial_status_must_be_pendente' USING ERRCODE = '23514';
    END IF;
    IF NEW.confirmation_webhook_id IS NOT NULL OR NEW.refund_webhook_id IS NOT NULL
       OR NEW.is_conciliated <> false OR NEW.conciliated_at IS NOT NULL THEN
      RAISE EXCEPTION 'fin_gateway_charge_fields_immutable' USING ERRCODE = '23514';
    END IF;
    -- Somente após seleção E teste em sandbox: nunca uma cobrança real em testes.
    IF gateway_row.status <> 'sandbox' OR gateway_row.is_selected <> true OR gateway_row.is_sandbox <> true
       OR gateway_row.environment <> 'sandbox' THEN
      RAISE EXCEPTION 'fin_gateway_charge_gateway_not_ready' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW.protocol <> OLD.protocol OR NEW.gateway_id <> OLD.gateway_id
       OR NEW.receivable_id IS DISTINCT FROM OLD.receivable_id OR NEW.amount_cents <> OLD.amount_cents
       OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.created_by_identity <> OLD.created_by_identity THEN
      RAISE EXCEPTION 'fin_gateway_charge_fields_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'fin_gateway_charge_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD.status = 'pendente' AND NEW.status IN ('pago','falhou','cancelado'))
      OR (OLD.status = 'pago' AND NEW.status = 'estornado')
    ) THEN
      RAISE EXCEPTION 'fin_gateway_charge_invalid_status_transition' USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'cancelado' THEN
      IF NEW.confirmation_webhook_id IS NOT NULL OR NEW.refund_webhook_id IS NOT NULL
         OR OLD.confirmation_webhook_id IS NOT NULL THEN
        RAISE EXCEPTION 'fin_gateway_charge_cancel_requires_no_outcome' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NEW.status IN ('pago','falhou') THEN
      IF NEW.confirmation_webhook_id IS NULL THEN
        RAISE EXCEPTION 'fin_gateway_charge_confirmation_requires_validated_webhook' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO confirmation_row FROM fin_gateway_webhooks WHERE id = NEW.confirmation_webhook_id;
      IF NOT FOUND OR confirmation_row.status <> 'conciliado' OR confirmation_row.is_valid_signature <> true
         OR confirmation_row.gateway_id <> NEW.gateway_id OR confirmation_row.charge_id <> NEW.id
         OR confirmation_row.event_type <> (CASE WHEN NEW.status = 'pago' THEN 'payment.confirmed' ELSE 'payment.failed' END) THEN
        RAISE EXCEPTION 'fin_gateway_charge_confirmation_requires_validated_webhook' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NEW.status = 'estornado' THEN
      IF NEW.refund_webhook_id IS NULL THEN
        RAISE EXCEPTION 'fin_gateway_charge_refund_requires_paid_status' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO refund_row FROM fin_gateway_webhooks WHERE id = NEW.refund_webhook_id;
      IF NOT FOUND OR refund_row.status <> 'conciliado' OR refund_row.is_valid_signature <> true
         OR refund_row.gateway_id <> NEW.gateway_id OR refund_row.charge_id <> NEW.id
         OR refund_row.event_type <> 'payment.refunded' THEN
        RAISE EXCEPTION 'fin_gateway_charge_refund_requires_paid_status' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin12_guard_charge_write ON fin_gateway_charges;
CREATE TRIGGER trg_fin12_guard_charge_write
  BEFORE INSERT OR UPDATE ON fin_gateway_charges
  FOR EACH ROW EXECUTE FUNCTION fin12_guard_charge_write();

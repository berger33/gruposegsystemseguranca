-- FIN-12: hardening aditivo de boletos/Pix/gateway.
--
-- Princípios aplicados nesta migração (somente aditiva; nenhuma migração
-- histórica é alterada e nenhum tipo existente é modificado):
--   * cobrança só existe depois de SELEÇÃO explícita e homologação em SANDBOX:
--     o gateway percorre nao_selecionado -> selecionado -> sandbox;
--   * 'producao' é recusado pelo banco: não existe cobrança real;
--   * a assinatura do webhook é verificada de verdade (HMAC-SHA256 sobre
--     mensagem canônica), com segredo sintético gerado localmente;
--   * replay é detectado por chave de idempotência e contabilizado sem
--     alterar o registro original;
--   * conciliação liga webhook validado -> cobrança, e 'pago' só acontece
--     através de webhook conciliado (nunca por edição direta de status);
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
-- Gateway: seleção explícita, homologação sandbox, produção recusada
-- ---------------------------------------------------------------------------
ALTER TABLE fin_payment_gateways
  ADD COLUMN IF NOT EXISTS gateway_code TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS webhook_secret_sandbox TEXT,
  ADD COLUMN IF NOT EXISTS selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sandbox_validated_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS fin_payment_gateways_code_key
  ON fin_payment_gateways(gateway_code) WHERE gateway_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_payment_gateways_idempotency_key
  ON fin_payment_gateways(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserva linhas do rascunho 079, mas as regras valem integralmente
-- para toda escrita nova e para toda alteração.
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_sandbox_environment_only
  CHECK (environment = 'sandbox' AND is_sandbox = true AND status <> 'producao') NOT VALID;
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_code_required
  CHECK (gateway_code IS NOT NULL AND gateway_code ~ '^[a-z][a-z0-9_-]{2,59}$') NOT VALID;
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
-- O segredo é gerado localmente pelo simulador; nunca é credencial de provedor.
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_synthetic_secret_required
  CHECK (webhook_secret_sandbox IS NOT NULL AND webhook_secret_sandbox ~ '^sandbox-whsec-[0-9a-f]{32}$') NOT VALID;
ALTER TABLE fin_payment_gateways
  ADD CONSTRAINT fin_gateway_state_fields
  CHECK (
    (status = 'nao_selecionado' AND is_selected = false AND selected_at IS NULL AND sandbox_validated_at IS NULL AND error_sanitized IS NULL)
    OR (status = 'selecionado' AND is_selected = true AND selected_at IS NOT NULL AND sandbox_validated_at IS NULL AND error_sanitized IS NULL)
    OR (status = 'sandbox' AND is_selected = true AND selected_at IS NOT NULL AND sandbox_validated_at IS NOT NULL AND error_sanitized IS NULL)
    OR (status = 'desativado' AND error_sanitized IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin12_guard_gateway_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'producao' OR NEW.environment <> 'sandbox' OR NEW.is_sandbox = false THEN
    RAISE EXCEPTION 'fin_gateway_production_refused_sem_cobranca_real' USING ERRCODE = '23514';
  END IF;
  -- Nenhuma credencial real pode ser persistida; a configuração é sintética.
  IF NEW.config ?| array['token','secret','password','senha','api_key','apikey','certificate','certificado','private_key','client_secret'] THEN
    RAISE EXCEPTION 'fin_gateway_credentials_refused' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'nao_selecionado' THEN
      RAISE EXCEPTION 'fin_gateway_initial_status_must_be_nao_selecionado' USING ERRCODE = '23514';
    END IF;
    IF NEW.is_selected = true OR NEW.selected_at IS NOT NULL OR NEW.sandbox_validated_at IS NOT NULL OR NEW.error_sanitized IS NOT NULL THEN
      RAISE EXCEPTION 'fin_gateway_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.name <> OLD.name OR NEW.gateway_code <> OLD.gateway_code
     OR NEW.gateway_type <> OLD.gateway_type OR NEW.environment <> OLD.environment
     OR NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.webhook_secret_sandbox <> OLD.webhook_secret_sandbox
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity THEN
    RAISE EXCEPTION 'fin_gateway_identity_fields_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'fin_gateway_status_transition_required' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD.status = 'nao_selecionado' AND NEW.status IN ('selecionado','desativado'))
    OR (OLD.status = 'selecionado' AND NEW.status IN ('sandbox','nao_selecionado','desativado'))
    OR (OLD.status = 'sandbox' AND NEW.status = 'desativado')
    OR (OLD.status = 'desativado' AND NEW.status = 'nao_selecionado')
  ) THEN
    RAISE EXCEPTION 'fin_gateway_invalid_status_transition' USING ERRCODE = '23514';
  END IF;
  -- A homologação sandbox precisa ser registrada, não presumida.
  IF NEW.status = 'sandbox' AND NEW.sandbox_validated_at IS NULL THEN
    RAISE EXCEPTION 'fin_gateway_sandbox_validation_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin12_guard_gateway_write ON fin_payment_gateways;
CREATE TRIGGER trg_fin12_guard_gateway_write
  BEFORE INSERT OR UPDATE ON fin_payment_gateways
  FOR EACH ROW EXECUTE FUNCTION fin12_guard_gateway_write();

-- ---------------------------------------------------------------------------
-- Cobrança sintética: só depois de seleção + sandbox, nunca paga por edição
-- ---------------------------------------------------------------------------
ALTER TABLE fin_gateway_charges
  ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conciliated_webhook_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS fin_gateway_charges_receivable_open_key
  ON fin_gateway_charges(receivable_id)
  WHERE receivable_id IS NOT NULL AND status IN ('pendente','pago');

ALTER TABLE fin_gateway_charges
  ADD CONSTRAINT fin_gateway_charge_simulation_only
  CHECK (simulated = true AND is_sandbox = true) NOT VALID;
ALTER TABLE fin_gateway_charges
  ADD CONSTRAINT fin_gateway_charge_receivable_required
  CHECK (receivable_id IS NOT NULL) NOT VALID;
ALTER TABLE fin_gateway_charges
  ADD CONSTRAINT fin_gateway_charge_synthetic_provider_reference
  CHECK (provider_charge_id IS NOT NULL AND provider_charge_id ~ '^synthetic-chg-[0-9a-f]{12}$') NOT VALID;
ALTER TABLE fin_gateway_charges
  ADD CONSTRAINT fin_gateway_charge_state_fields
  CHECK (
    (status = 'pendente' AND is_conciliated = false AND conciliated_at IS NULL AND conciliated_webhook_id IS NULL AND settled_at IS NULL AND error_sanitized IS NULL AND cancel_reason IS NULL)
    OR (status = 'pago' AND is_conciliated = true AND conciliated_at IS NOT NULL AND conciliated_webhook_id IS NOT NULL AND settled_at IS NOT NULL AND error_sanitized IS NULL AND cancel_reason IS NULL)
    OR (status = 'falhou' AND is_conciliated = false AND conciliated_webhook_id IS NULL AND error_sanitized IS NOT NULL AND cancel_reason IS NULL)
    OR (status = 'cancelado' AND is_conciliated = false AND conciliated_webhook_id IS NULL AND cancel_reason IS NOT NULL)
    OR (status = 'estornado' AND is_conciliated = true AND conciliated_webhook_id IS NOT NULL AND cancel_reason IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin12_guard_charge_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  gateway_row fin_payment_gateways%ROWTYPE;
  webhook_row fin_gateway_webhooks%ROWTYPE;
BEGIN
  SELECT * INTO gateway_row FROM fin_payment_gateways WHERE id = NEW.gateway_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_gateway_charge_gateway_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.simulated = false OR NEW.is_sandbox = false OR gateway_row.environment <> 'sandbox' THEN
    RAISE EXCEPTION 'fin_gateway_charge_real_payment_refused' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_gateway_charge_initial_status_must_be_pendente' USING ERRCODE = '23514';
    END IF;
    -- Boleto/Pix/gateway somente após seleção e homologação em sandbox.
    IF gateway_row.status <> 'sandbox' OR gateway_row.is_selected = false OR gateway_row.is_active = false THEN
      RAISE EXCEPTION 'fin_gateway_charge_requires_selected_sandbox_gateway' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.protocol <> OLD.protocol OR NEW.gateway_id <> OLD.gateway_id
     OR NEW.receivable_id IS DISTINCT FROM OLD.receivable_id OR NEW.amount_cents <> OLD.amount_cents
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.simulated <> OLD.simulated
     OR NEW.is_sandbox <> OLD.is_sandbox OR NEW.provider_charge_id <> OLD.provider_charge_id
     OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity THEN
    RAISE EXCEPTION 'fin_gateway_charge_request_fields_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = OLD.status THEN
    RAISE EXCEPTION 'fin_gateway_charge_status_transition_required' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD.status = 'pendente' AND NEW.status IN ('pago','falhou','cancelado'))
    OR (OLD.status = 'falhou' AND NEW.status = 'cancelado')
    OR (OLD.status = 'pago' AND NEW.status = 'estornado')
  ) THEN
    RAISE EXCEPTION 'fin_gateway_charge_invalid_status_transition' USING ERRCODE = '23514';
  END IF;

  -- 'pago' nunca vem de edição de status: exige webhook conciliado do MESMO
  -- gateway apontando para esta cobrança.
  IF NEW.status = 'pago' THEN
    SELECT * INTO webhook_row FROM fin_gateway_webhooks WHERE id = NEW.conciliated_webhook_id;
    IF NOT FOUND OR webhook_row.status <> 'conciliado' OR webhook_row.charge_id IS DISTINCT FROM NEW.id
       OR webhook_row.gateway_id <> NEW.gateway_id OR webhook_row.is_valid_signature = false THEN
      RAISE EXCEPTION 'fin_gateway_charge_paid_requires_conciliated_webhook' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Webhook: assinatura verificada, replay contabilizado, conciliação explícita
-- ---------------------------------------------------------------------------
ALTER TABLE fin_gateway_webhooks
  ADD COLUMN IF NOT EXISTS signature_algorithm TEXT NOT NULL DEFAULT 'hmac-sha256',
  ADD COLUMN IF NOT EXISTS payload_digest TEXT,
  ADD COLUMN IF NOT EXISTS replay_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_id UUID REFERENCES fin_gateway_charges(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS fin_gateway_webhooks_charge_idx ON fin_gateway_webhooks(charge_id);

ALTER TABLE fin_gateway_charges
  ADD CONSTRAINT fin_gateway_charges_conciliated_webhook_fk
  FOREIGN KEY (conciliated_webhook_id) REFERENCES fin_gateway_webhooks(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE fin_gateway_webhooks
  ADD CONSTRAINT fin_gateway_webhook_signature_format
  CHECK (signature_algorithm = 'hmac-sha256' AND signature ~ '^[0-9a-f]{64}$') NOT VALID;
ALTER TABLE fin_gateway_webhooks
  ADD CONSTRAINT fin_gateway_webhook_payload_digest_required
  CHECK (payload_digest IS NOT NULL AND payload_digest ~ '^[0-9a-f]{64}$') NOT VALID;
ALTER TABLE fin_gateway_webhooks
  ADD CONSTRAINT fin_gateway_webhook_replay_attempts_positive
  CHECK (replay_attempts >= 0) NOT VALID;
ALTER TABLE fin_gateway_webhooks
  ADD CONSTRAINT fin_gateway_webhook_state_fields
  CHECK (
    (status = 'validado' AND is_valid_signature = true AND error_sanitized IS NULL AND conciliated_at IS NULL AND charge_id IS NULL)
    OR (status = 'rejeitado' AND is_valid_signature = false AND error_sanitized IS NOT NULL AND conciliated_at IS NULL AND charge_id IS NULL)
    OR (status = 'conciliado' AND is_valid_signature = true AND conciliated_at IS NOT NULL AND charge_id IS NOT NULL AND error_sanitized IS NULL)
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

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('validado','rejeitado') THEN
      RAISE EXCEPTION 'fin_gateway_webhook_initial_status_must_be_validado_or_rejeitado' USING ERRCODE = '23514';
    END IF;
    IF NEW.replay_attempts <> 0 OR NEW.is_replay = true OR NEW.charge_id IS NOT NULL OR NEW.conciliated_at IS NOT NULL THEN
      RAISE EXCEPTION 'fin_gateway_webhook_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
    IF gateway_row.status NOT IN ('selecionado','sandbox') OR gateway_row.is_active = false THEN
      RAISE EXCEPTION 'fin_gateway_webhook_requires_selected_gateway' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- O recebimento é imutável: payload, assinatura e veredito não mudam.
  IF NEW.id <> OLD.id OR NEW.gateway_id <> OLD.gateway_id OR NEW.event_type <> OLD.event_type
     OR NEW.signature <> OLD.signature OR NEW.signature_algorithm <> OLD.signature_algorithm
     OR NEW.payload::text <> OLD.payload::text OR NEW.payload_digest <> OLD.payload_digest
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.is_valid_signature <> OLD.is_valid_signature THEN
    RAISE EXCEPTION 'fin_gateway_webhook_receipt_fields_immutable' USING ERRCODE = '23514';
  END IF;

  -- Alteração 1: contabilizar tentativa de replay sem mudar o veredito.
  IF NEW.status = OLD.status THEN
    IF NEW.replay_attempts <> OLD.replay_attempts + 1 OR NEW.is_replay <> true
       OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
       OR NEW.conciliated_at IS DISTINCT FROM OLD.conciliated_at THEN
      RAISE EXCEPTION 'fin_gateway_webhook_only_replay_counter_may_change' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Alteração 2: conciliação de webhook validado contra cobrança do gateway.
  IF NOT (OLD.status = 'validado' AND NEW.status = 'conciliado') THEN
    RAISE EXCEPTION 'fin_gateway_webhook_invalid_status_transition' USING ERRCODE = '23514';
  END IF;
  IF NEW.replay_attempts <> OLD.replay_attempts THEN
    RAISE EXCEPTION 'fin_gateway_webhook_only_replay_counter_may_change' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO charge_row FROM fin_gateway_charges WHERE id = NEW.charge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_gateway_webhook_conciliation_requires_charge' USING ERRCODE = '23514';
  END IF;
  IF charge_row.gateway_id <> NEW.gateway_id THEN
    RAISE EXCEPTION 'fin_gateway_webhook_charge_gateway_mismatch' USING ERRCODE = '23514';
  END IF;
  IF charge_row.status <> 'pendente' THEN
    RAISE EXCEPTION 'fin_gateway_webhook_charge_not_pending' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_gateway_webhooks WHERE charge_id = NEW.charge_id AND id <> NEW.id) THEN
    RAISE EXCEPTION 'fin_gateway_webhook_charge_already_conciliated' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin12_guard_webhook_write ON fin_gateway_webhooks;
CREATE TRIGGER trg_fin12_guard_webhook_write
  BEFORE INSERT OR UPDATE ON fin_gateway_webhooks
  FOR EACH ROW EXECUTE FUNCTION fin12_guard_webhook_write();

DROP TRIGGER IF EXISTS trg_fin12_guard_charge_write ON fin_gateway_charges;
CREATE TRIGGER trg_fin12_guard_charge_write
  BEFORE INSERT OR UPDATE ON fin_gateway_charges
  FOR EACH ROW EXECUTE FUNCTION fin12_guard_charge_write();

-- L07 Fatia 1: revalidação aditiva de FIN-09 e FIN-12.
--
-- FIN-09 declara a base da margem em vez de transformar falta de dado em zero
-- ou em percentual informado pelo navegador. FIN-12 fecha a ponte entre o
-- webhook sandbox validado e a baixa canônica de FIN-04: uma conciliação cria
-- exatamente uma baixa ligada à cobrança, no mesmo BEGIN/COMMIT.
--
-- Nenhuma migração histórica é alterada. Linhas anteriores permanecem
-- legíveis: a base de margem é derivada do estado existente e o novo vínculo
-- de pagamento começa nulo para pagamentos legados.

-- ---------------------------------------------------------------------------
-- FIN-09: margem calculada e base explícita
-- ---------------------------------------------------------------------------
ALTER TABLE fin_management_results
  ADD COLUMN IF NOT EXISTS computed_margin_percent NUMERIC(12,4)
    GENERATED ALWAYS AS (
      CASE
        WHEN is_complete = true
          AND revenue_received_cents IS NOT NULL
          AND costs_cents IS NOT NULL
          AND revenue_received_cents > 0
        THEN ROUND(((revenue_received_cents - costs_cents)::NUMERIC * 100) / revenue_received_cents::NUMERIC, 4)
        ELSE NULL
      END
    ) STORED,
  ADD COLUMN IF NOT EXISTS margin_basis TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN is_complete = false THEN 'dados_incompletos'
        WHEN revenue_received_cents IS NULL OR costs_cents IS NULL THEN 'dados_incompletos'
        WHEN revenue_received_cents = 0 THEN 'receita_zero_sem_percentual'
        ELSE 'calculada_de_receita_recebida_e_custos'
      END
    ) STORED;

-- A coluna legada margin_percent não é mais uma entrada livre: se for usada
-- por uma integração antiga, tem de coincidir exatamente com o cálculo do
-- banco. A constraint é NOT VALID para não reescrever o passado.
ALTER TABLE fin_management_results
  ADD CONSTRAINT fin_result_margin_percent_matches_calculation
  CHECK (margin_percent IS NULL OR (computed_margin_percent IS NOT NULL AND margin_percent = computed_margin_percent)) NOT VALID;
ALTER TABLE fin_management_results
  ADD CONSTRAINT fin_result_margin_basis_valid
  CHECK (margin_basis IN ('dados_incompletos','receita_zero_sem_percentual','calculada_de_receita_recebida_e_custos')) NOT VALID;

-- ---------------------------------------------------------------------------
-- FIN-12 -> FIN-04: pagamento canônico vinculado à cobrança sandbox
-- ---------------------------------------------------------------------------
ALTER TABLE fin_payments
  ADD COLUMN IF NOT EXISTS gateway_charge_id UUID REFERENCES fin_gateway_charges(id) ON DELETE RESTRICT;

-- Um webhook conciliado pode criar somente uma baixa positiva para a cobrança.
-- Estornos continuam vinculáveis e são diferenciados por is_estorno.
CREATE UNIQUE INDEX IF NOT EXISTS fin_payments_gateway_charge_settlement_uidx
  ON fin_payments(gateway_charge_id)
  WHERE gateway_charge_id IS NOT NULL AND is_estorno = false;

CREATE OR REPLACE FUNCTION fin135_guard_gateway_payment_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  charge_row fin_gateway_charges%ROWTYPE;
  original_payment fin_payments%ROWTYPE;
BEGIN
  IF NEW.gateway_charge_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO charge_row FROM fin_gateway_charges WHERE id = NEW.gateway_charge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_gateway_payment_charge_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.account_type <> 'receber' OR NEW.receivable_id IS DISTINCT FROM charge_row.receivable_id
     OR NEW.payable_id IS NOT NULL OR NEW.amount_cents <> charge_row.amount_cents
     OR NEW.is_renegotiation = true THEN
    RAISE EXCEPTION 'fin_gateway_payment_must_match_receivable_and_charge_amount' USING ERRCODE = '23514';
  END IF;

  IF NEW.is_estorno = false THEN
    IF NEW.previous_payment_id IS NOT NULL OR charge_row.status NOT IN ('pendente','pago') THEN
      RAISE EXCEPTION 'fin_gateway_payment_invalid_settlement_state' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO original_payment
      FROM fin_payments
      WHERE gateway_charge_id = NEW.gateway_charge_id AND is_estorno = false;
    IF NOT FOUND OR NEW.previous_payment_id IS DISTINCT FROM original_payment.id
       OR charge_row.status <> 'pago' THEN
      RAISE EXCEPTION 'fin_gateway_payment_estorno_requires_original_settlement' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin135_guard_gateway_payment_link ON fin_payments;
CREATE TRIGGER trg_fin135_guard_gateway_payment_link
  BEFORE INSERT OR UPDATE ON fin_payments
  FOR EACH ROW EXECUTE FUNCTION fin135_guard_gateway_payment_link();

-- A conciliação só aceita o evento canônico do simulador e confere protocolo e
-- valor assinados antes de ligar o webhook à cobrança. Isso impede que um
-- webhook válido de uma cobrança seja aplicado em outra cobrança do gateway.
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

  IF NEW.id <> OLD.id OR NEW.gateway_id <> OLD.gateway_id OR NEW.event_type <> OLD.event_type
     OR NEW.signature <> OLD.signature OR NEW.signature_algorithm <> OLD.signature_algorithm
     OR NEW.payload::text <> OLD.payload::text OR NEW.payload_digest <> OLD.payload_digest
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.is_valid_signature <> OLD.is_valid_signature THEN
    RAISE EXCEPTION 'fin_gateway_webhook_receipt_fields_immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = OLD.status THEN
    IF NEW.replay_attempts <> OLD.replay_attempts + 1 OR NEW.is_replay <> true
       OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
       OR NEW.conciliated_at IS DISTINCT FROM OLD.conciliated_at THEN
      RAISE EXCEPTION 'fin_gateway_webhook_only_replay_counter_may_change' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

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
  IF NEW.event_type <> 'charge.paid'
     OR NEW.payload->>'protocol' IS DISTINCT FROM charge_row.protocol
     OR COALESCE(NEW.payload->>'amount_cents','') !~ '^[1-9][0-9]*$'
     OR (NEW.payload->>'amount_cents')::BIGINT <> charge_row.amount_cents
     OR NEW.payload->>'settlement' IS DISTINCT FROM 'synthetic' THEN
    RAISE EXCEPTION 'fin_gateway_webhook_payload_does_not_match_charge' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_gateway_webhooks WHERE charge_id = NEW.charge_id AND id <> NEW.id) THEN
    RAISE EXCEPTION 'fin_gateway_webhook_charge_already_conciliated' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- A cobrança só pode ficar paga quando a baixa FIN-04 correspondente já
-- estiver persistida; a ordem do handler é webhook -> pagamento -> cobrança.
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
  IF NEW.status = 'pago' THEN
    SELECT * INTO webhook_row FROM fin_gateway_webhooks WHERE id = NEW.conciliated_webhook_id;
    IF NOT FOUND OR webhook_row.status <> 'conciliado' OR webhook_row.charge_id IS DISTINCT FROM NEW.id
       OR webhook_row.gateway_id <> NEW.gateway_id OR webhook_row.is_valid_signature = false THEN
      RAISE EXCEPTION 'fin_gateway_charge_paid_requires_conciliated_webhook' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM fin_payments
      WHERE gateway_charge_id = NEW.id
        AND is_estorno = false
        AND account_type = 'receber'
        AND receivable_id = NEW.receivable_id
        AND amount_cents = NEW.amount_cents
    ) THEN
      RAISE EXCEPTION 'fin_gateway_charge_paid_requires_receivable_payment' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

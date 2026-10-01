-- FIN-11: hardening aditivo da integração contábil/fiscal mediante provedor.
--
-- Princípios aplicados nesta migração (somente aditiva; nenhuma migração
-- histórica é alterada e nenhum tipo existente é modificado):
--   * provedor e obrigação fiscal permanecem entidades separadas;
--   * a obrigação é determinada pela ATIVIDADE através de uma regra explícita
--     e canônica (fin_fiscal_activity_rules). Não existe nota única assumida:
--     o catálogo cobre NFS-e, NF-e, NFC-e, CT-e e "outra obrigação";
--   * nenhuma emissão fiscal real é possível: ambiente é sempre sandbox,
--     o documento é sempre simulado e as referências de arquivo são sintéticas;
--   * estados e transições são explícitos e validados no banco;
--   * idempotência por chave única;
--   * referências canônicas obrigatórias (contrato, conta, regra, provedor);
--   * histórico imutável em fin_fiscal_history.

-- ---------------------------------------------------------------------------
-- Catálogo canônico de regras atividade -> obrigação fiscal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_fiscal_activity_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_code TEXT NOT NULL UNIQUE CHECK (activity_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  activity_label TEXT NOT NULL CHECK (char_length(activity_label) BETWEEN 3 AND 200),
  obligation_type fin_fiscal_doc_type NOT NULL,
  jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('municipal','estadual','federal','nao_aplicavel')),
  rule_reference TEXT NOT NULL CHECK (char_length(rule_reference) BETWEEN 10 AND 300),
  rule_description TEXT NOT NULL CHECK (char_length(rule_description) BETWEEN 10 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_fiscal_activity_rules_type_idx ON fin_fiscal_activity_rules(obligation_type);

-- O conteúdo da regra é imutável; somente a vigência (is_active) muda.
CREATE OR REPLACE FUNCTION fin11_guard_activity_rule_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fin_fiscal_activity_rule_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.activity_code <> OLD.activity_code
     OR NEW.activity_label <> OLD.activity_label OR NEW.obligation_type <> OLD.obligation_type
     OR NEW.jurisdiction <> OLD.jurisdiction OR NEW.rule_reference <> OLD.rule_reference
     OR NEW.rule_description <> OLD.rule_description THEN
    RAISE EXCEPTION 'fin_fiscal_activity_rule_immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin11_guard_activity_rule_write ON fin_fiscal_activity_rules;
CREATE TRIGGER trg_fin11_guard_activity_rule_write
  BEFORE UPDATE OR DELETE ON fin_fiscal_activity_rules
  FOR EACH ROW EXECUTE FUNCTION fin11_guard_activity_rule_write();

-- Catálogo inicial: atividades distintas produzem obrigações distintas.
INSERT INTO fin_fiscal_activity_rules (activity_code, activity_label, obligation_type, jurisdiction, rule_reference, rule_description) VALUES
  ('vigilancia_patrimonial','Vigilância patrimonial armada ou desarmada','nfse','municipal','LC 116/2003, lista anexa, item 11.02','Serviço de vigilância e segurança de pessoas e bens: a obrigação é nota fiscal de serviço eletrônica no município da prestação.'),
  ('portaria_e_recepcao','Portaria, controle de acesso e recepção','nfse','municipal','LC 116/2003, lista anexa, item 11.02','Serviço de portaria e controle de acesso: a obrigação é nota fiscal de serviço eletrônica no município da prestação.'),
  ('monitoramento_eletronico','Monitoramento eletrônico de alarmes e imagens','nfse','municipal','LC 116/2003, lista anexa, item 11.02','Monitoramento eletrônico contratado como serviço continuado: a obrigação é nota fiscal de serviço eletrônica.'),
  ('venda_equipamento_seguranca','Venda de equipamento de segurança para empresa','nfe','estadual','Ajuste SINIEF 07/2005 e RICMS estadual','Circulação de mercadoria entre contribuintes: a obrigação é nota fiscal eletrônica modelo 55, não nota de serviço.'),
  ('venda_consumidor_final_presencial','Venda presencial a consumidor final','nfce','estadual','Ajuste SINIEF 19/2016 e RICMS estadual','Venda presencial a consumidor final não contribuinte: a obrigação é nota fiscal de consumidor eletrônica modelo 65.'),
  ('transporte_valores_interestadual','Transporte de valores interestadual','cte','estadual','Ajuste SINIEF 09/2007','Prestação de serviço de transporte intermunicipal ou interestadual: a obrigação é conhecimento de transporte eletrônico, não NFS-e.'),
  ('locacao_equipamento_seguranca','Locação de equipamento de segurança sem operador','outro','nao_aplicavel','Súmula Vinculante 31 do STF','Locação de bem móvel sem prestação de serviço: não incide ISS nem ICMS; a obrigação é acessória e deve ser tratada caso a caso, nunca como NFS-e automática.')
ON CONFLICT (activity_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Histórico imutável compartilhado das entidades fiscais
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_fiscal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('provider','obligation','document')),
  entity_id UUID NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL CHECK (char_length(next_status) BETWEEN 3 AND 50),
  changed_by_identity UUID REFERENCES auth_identities(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fin_fiscal_history_entity_idx ON fin_fiscal_history(entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION fin_fiscal_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_fiscal_history_immutable'; END;
$$;
DROP TRIGGER IF EXISTS trg_fin_fiscal_history_immutable ON fin_fiscal_history;
CREATE TRIGGER trg_fin_fiscal_history_immutable
  BEFORE UPDATE OR DELETE ON fin_fiscal_history
  FOR EACH ROW EXECUTE FUNCTION fin_fiscal_history_immutable();

-- ---------------------------------------------------------------------------
-- Provedor fiscal: sandbox obrigatório, obrigações suportadas declaradas
-- ---------------------------------------------------------------------------
ALTER TABLE fin_fiscal_providers
  ADD COLUMN IF NOT EXISTS provider_code TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS supported_obligations fin_fiscal_doc_type[] NOT NULL DEFAULT '{}'::fin_fiscal_doc_type[],
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_fiscal_providers_code_key
  ON fin_fiscal_providers(provider_code) WHERE provider_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_fiscal_providers_idempotency_key
  ON fin_fiscal_providers(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- NOT VALID preserva linhas do rascunho 079, mas as regras valem para toda
-- escrita nova e para toda alteração.
ALTER TABLE fin_fiscal_providers
  ADD CONSTRAINT fin_fiscal_provider_sandbox_only
  CHECK (environment = 'sandbox') NOT VALID;
ALTER TABLE fin_fiscal_providers
  ADD CONSTRAINT fin_fiscal_provider_code_required
  CHECK (provider_code IS NOT NULL AND provider_code ~ '^[a-z][a-z0-9_-]{2,59}$') NOT VALID;
ALTER TABLE fin_fiscal_providers
  ADD CONSTRAINT fin_fiscal_provider_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_fiscal_providers
  ADD CONSTRAINT fin_fiscal_provider_supported_obligations_required
  CHECK (array_length(supported_obligations, 1) >= 1) NOT VALID;

CREATE OR REPLACE FUNCTION fin11_guard_provider_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'nao_configurado' THEN
      RAISE EXCEPTION 'fin_fiscal_provider_initial_status_must_be_nao_configurado' USING ERRCODE = '23514';
    END IF;
    IF NEW.last_processed_at IS NOT NULL OR NEW.error_sanitized IS NOT NULL THEN
      RAISE EXCEPTION 'fin_fiscal_provider_initial_fields_invalid' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW.name <> OLD.name OR NEW.provider_code <> OLD.provider_code
       OR NEW.environment <> OLD.environment OR NEW.supported_obligations <> OLD.supported_obligations
       OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.created_by_identity <> OLD.created_by_identity THEN
      RAISE EXCEPTION 'fin_fiscal_provider_identity_fields_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'fin_fiscal_provider_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD.status = 'nao_configurado' AND NEW.status IN ('configurado','falha'))
      OR (OLD.status = 'configurado' AND NEW.status IN ('falha','nao_configurado'))
      OR (OLD.status = 'falha' AND NEW.status IN ('configurado','nao_configurado'))
    ) THEN
      RAISE EXCEPTION 'fin_fiscal_provider_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'falha' AND (NEW.error_sanitized IS NULL OR char_length(trim(NEW.error_sanitized)) < 10) THEN
    RAISE EXCEPTION 'fin_fiscal_provider_error_sanitized_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> 'falha' AND NEW.error_sanitized IS NOT NULL THEN
    RAISE EXCEPTION 'fin_fiscal_provider_error_only_on_failure' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'configurado' AND NEW.last_processed_at IS NULL THEN
    RAISE EXCEPTION 'fin_fiscal_provider_configured_requires_timestamp' USING ERRCODE = '23514';
  END IF;
  -- Nenhuma credencial real pode ser persistida; a configuração é sintética.
  IF NEW.config ?| array['token','secret','password','senha','certificate','certificado','private_key'] THEN
    RAISE EXCEPTION 'fin_fiscal_provider_credentials_refused' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin11_guard_provider_write ON fin_fiscal_providers;
CREATE TRIGGER trg_fin11_guard_provider_write
  BEFORE INSERT OR UPDATE ON fin_fiscal_providers
  FOR EACH ROW EXECUTE FUNCTION fin11_guard_provider_write();

-- ---------------------------------------------------------------------------
-- Obrigação fiscal: determinada pela atividade através de regra explícita
-- ---------------------------------------------------------------------------
ALTER TABLE fin_fiscal_obligations
  ADD COLUMN IF NOT EXISTS activity_rule_id UUID REFERENCES fin_fiscal_activity_rules(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS determination_rule_reference TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_fiscal_obligations_idempotency_key
  ON fin_fiscal_obligations(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_fiscal_obligations_contract_activity_key
  ON fin_fiscal_obligations(contract_id, activity_rule_id)
  WHERE contract_id IS NOT NULL AND activity_rule_id IS NOT NULL AND status <> 'cancelada';

ALTER TABLE fin_fiscal_obligations
  ADD CONSTRAINT fin_fiscal_obligation_canonical_references_required
  CHECK (contract_id IS NOT NULL AND client_account_id IS NOT NULL AND activity_rule_id IS NOT NULL) NOT VALID;
ALTER TABLE fin_fiscal_obligations
  ADD CONSTRAINT fin_fiscal_obligation_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_fiscal_obligations
  ADD CONSTRAINT fin_fiscal_obligation_state_fields
  CHECK (
    (status = 'pendente' AND is_determined = false AND determined_at IS NULL AND determined_by_identity IS NULL AND determination_rule_reference IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL)
    OR (status = 'determinada' AND is_determined = true AND determined_at IS NOT NULL AND determined_by_identity IS NOT NULL AND determination_rule_reference IS NOT NULL AND cancelled_at IS NULL AND cancel_reason IS NULL)
    OR (status = 'cancelada' AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin11_guard_obligation_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rule_row fin_fiscal_activity_rules%ROWTYPE;
BEGIN
  SELECT * INTO rule_row FROM fin_fiscal_activity_rules WHERE id = NEW.activity_rule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_fiscal_obligation_activity_rule_required' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'fin_fiscal_obligation_initial_status_must_be_pendente' USING ERRCODE = '23514';
    END IF;
    IF rule_row.is_active = false THEN
      RAISE EXCEPTION 'fin_fiscal_obligation_activity_rule_inactive' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW.contract_id <> OLD.contract_id
       OR NEW.client_account_id <> OLD.client_account_id OR NEW.obligation_type <> OLD.obligation_type
       OR NEW.activity_type <> OLD.activity_type OR NEW.activity_rule_id <> OLD.activity_rule_id
       OR NEW.rule <> OLD.rule OR NEW.description <> OLD.description
       OR NEW.created_by_identity <> OLD.created_by_identity OR NEW.idempotency_key <> OLD.idempotency_key THEN
      RAISE EXCEPTION 'fin_fiscal_obligation_determination_fields_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'fin_fiscal_obligation_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD.status = 'pendente' AND NEW.status IN ('determinada','cancelada'))
      OR (OLD.status = 'determinada' AND NEW.status = 'cancelada')
    ) THEN
      RAISE EXCEPTION 'fin_fiscal_obligation_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'determinada' AND rule_row.is_active = false THEN
      RAISE EXCEPTION 'fin_fiscal_obligation_activity_rule_inactive' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- A obrigação nunca é assumida: tipo e atividade vêm da regra canônica.
  IF NEW.activity_type <> rule_row.activity_code THEN
    RAISE EXCEPTION 'fin_fiscal_obligation_activity_must_match_rule' USING ERRCODE = '23514';
  END IF;
  IF NEW.obligation_type <> rule_row.obligation_type THEN
    RAISE EXCEPTION 'fin_fiscal_obligation_type_must_follow_activity_rule' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'determinada' AND NEW.determination_rule_reference IS DISTINCT FROM rule_row.rule_reference THEN
    RAISE EXCEPTION 'fin_fiscal_obligation_determination_reference_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin11_guard_obligation_write ON fin_fiscal_obligations;
CREATE TRIGGER trg_fin11_guard_obligation_write
  BEFORE INSERT OR UPDATE ON fin_fiscal_obligations
  FOR EACH ROW EXECUTE FUNCTION fin11_guard_obligation_write();

-- ---------------------------------------------------------------------------
-- Documento fiscal: somente registro sintético, nunca emissão real
-- ---------------------------------------------------------------------------
ALTER TABLE fin_fiscal_documents
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS fin_fiscal_documents_idempotency_key
  ON fin_fiscal_documents(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE fin_fiscal_documents
  ADD CONSTRAINT fin_fiscal_document_canonical_references_required
  CHECK (obligation_id IS NOT NULL AND provider_id IS NOT NULL) NOT VALID;
ALTER TABLE fin_fiscal_documents
  ADD CONSTRAINT fin_fiscal_document_idempotency_required
  CHECK (idempotency_key IS NOT NULL AND char_length(trim(idempotency_key)) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE fin_fiscal_documents
  ADD CONSTRAINT fin_fiscal_document_simulation_only
  CHECK (simulated = true AND is_sandbox = true) NOT VALID;
ALTER TABLE fin_fiscal_documents
  ADD CONSTRAINT fin_fiscal_document_synthetic_references_required
  CHECK (
    file_name IS NOT NULL
    AND char_length(trim(file_name)) BETWEEN 1 AND 500
    AND file_url IS NOT NULL
    AND file_url ~ '^synthetic://[A-Za-z0-9][A-Za-z0-9._/-]+$'
    AND storage_key IS NOT NULL
    AND storage_key ~ '^synthetic/[A-Za-z0-9][A-Za-z0-9._/-]+$'
  ) NOT VALID;
ALTER TABLE fin_fiscal_documents
  ADD CONSTRAINT fin_fiscal_document_amount_positive
  CHECK (amount_cents > 0) NOT VALID;
ALTER TABLE fin_fiscal_documents
  ADD CONSTRAINT fin_fiscal_document_state_fields
  CHECK (
    (status = 'rascunho' AND error_sanitized IS NULL AND cancel_reason IS NULL)
    OR (status = 'emitido' AND error_sanitized IS NULL AND cancel_reason IS NULL)
    OR (status = 'erro' AND error_sanitized IS NOT NULL AND cancel_reason IS NULL)
    OR (status = 'cancelado' AND cancel_reason IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION fin11_guard_document_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  obligation_row fin_fiscal_obligations%ROWTYPE;
  provider_row fin_fiscal_providers%ROWTYPE;
BEGIN
  SELECT * INTO obligation_row FROM fin_fiscal_obligations WHERE id = NEW.obligation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_fiscal_document_obligation_required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO provider_row FROM fin_fiscal_providers WHERE id = NEW.provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fin_fiscal_document_provider_required' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'fin_fiscal_document_initial_status_must_be_rascunho' USING ERRCODE = '23514';
    END IF;
    IF obligation_row.status <> 'determinada' OR obligation_row.is_determined = false THEN
      RAISE EXCEPTION 'fin_fiscal_document_requires_determined_obligation' USING ERRCODE = '23514';
    END IF;
    IF provider_row.status <> 'configurado' OR provider_row.is_active = false THEN
      RAISE EXCEPTION 'fin_fiscal_document_requires_configured_provider' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id <> OLD.id OR NEW.protocol <> OLD.protocol OR NEW.obligation_id <> OLD.obligation_id
       OR NEW.provider_id <> OLD.provider_id OR NEW.document_type <> OLD.document_type
       OR NEW.amount_cents <> OLD.amount_cents OR NEW.issue_date <> OLD.issue_date
       OR NEW.file_name <> OLD.file_name OR NEW.file_url <> OLD.file_url
       OR NEW.storage_key <> OLD.storage_key OR NEW.idempotency_key <> OLD.idempotency_key
       OR NEW.created_by_identity <> OLD.created_by_identity THEN
      RAISE EXCEPTION 'fin_fiscal_document_request_fields_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'fin_fiscal_document_status_transition_required' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD.status = 'rascunho' AND NEW.status IN ('emitido','erro','cancelado'))
      OR (OLD.status = 'erro' AND NEW.status IN ('emitido','cancelado'))
      OR (OLD.status = 'emitido' AND NEW.status = 'cancelado')
    ) THEN
      RAISE EXCEPTION 'fin_fiscal_document_invalid_status_transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Sem nota única: o documento segue exatamente a obrigação determinada.
  IF NEW.document_type <> obligation_row.obligation_type THEN
    RAISE EXCEPTION 'fin_fiscal_document_type_must_match_obligation' USING ERRCODE = '23514';
  END IF;
  IF NOT (NEW.document_type = ANY (provider_row.supported_obligations)) THEN
    RAISE EXCEPTION 'fin_fiscal_document_provider_does_not_support_obligation' USING ERRCODE = '23514';
  END IF;
  IF provider_row.environment <> 'sandbox' OR NEW.is_sandbox = false OR NEW.simulated = false THEN
    RAISE EXCEPTION 'fin_fiscal_document_real_emission_refused' USING ERRCODE = '23514';
  END IF;
  -- O registro "emitido" é uma resposta sintética do simulador, nunca do fisco.
  IF NEW.status = 'emitido' AND (
      NEW.provider_response->>'mode' IS DISTINCT FROM 'synthetic'
      OR NEW.provider_response->>'synthetic_reference' IS NULL
    ) THEN
    RAISE EXCEPTION 'fin_fiscal_document_synthetic_response_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin11_guard_document_write ON fin_fiscal_documents;
CREATE TRIGGER trg_fin11_guard_document_write
  BEFORE INSERT OR UPDATE ON fin_fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION fin11_guard_document_write();

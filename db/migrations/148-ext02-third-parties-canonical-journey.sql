-- EXT-02: terceiros ligados ao backend canônico real — cadastro, contrato,
-- documentos, vencimentos, acesso temporário e avaliação.
-- Aditiva sobre a 085; migrações 001–147 permanecem imutáveis.
--
-- Critério do plano: "terceiro acessa só OS/contrato autorizado e perde acesso
-- ao término". Esta migração cria os registros canônicos que IMPÕEM esse
-- critério:
--   * a janela de acesso deixa de ser campo livre em ext_third_parties e passa
--     a viver em ext_third_party_access_grants, sempre vinculada a UM escopo
--     autorizado (contrato crm_contracts OU ordem de serviço
--     ast_service_orders), com início/fim obrigatórios e revogação declarada;
--   * a avaliação deixa de ser uma nota solta e passa a exigir autor, data e
--     justificativa em ext_third_party_evaluations; a nota exibida no cadastro
--     só pode apontar para uma avaliação canônica;
--   * o vínculo com crm_contracts só é aceito com verificação canônica
--     registrada (quem verificou e quando);
--   * o alerta de vencimento de documento só existe com regra explícita
--     registrada — nada é inferido.
--
-- FRONTEIRA DECLARADA: não existe hoje ator externo "terceiro" autenticado.
-- Nenhuma tabela aqui cria sessão, login ou canal externo para o terceiro. As
-- janelas são impostas nos registros canônicos e em toda consulta derivada do
-- lado staff; o acesso do próprio terceiro permanece PENDENTE e é declarado
-- como tal pela API e pela tela.
--
-- Nenhuma autoria retroativa é inventada: linhas anteriores ficam com origem
-- 'registro_legado' e fora da jornada canônica.

BEGIN;

-- ---------------------------------------------------------------------------
-- Cadastro do terceiro: origem da jornada e verificação canônica do contrato.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_third_parties
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'registro_legado';

ALTER TABLE ext_third_parties
  DROP CONSTRAINT IF EXISTS ext_third_parties_origin_check;
ALTER TABLE ext_third_parties
  ADD CONSTRAINT ext_third_parties_origin_check
  CHECK (origin IN ('registro_legado','jornada_terceiros'))
  NOT VALID;

-- Terceiro criado pela jornada canônica nasce com autoria derivada da sessão.
ALTER TABLE ext_third_parties
  DROP CONSTRAINT IF EXISTS ext_third_parties_journey_binding_check;
ALTER TABLE ext_third_parties
  ADD CONSTRAINT ext_third_parties_journey_binding_check
  CHECK (origin <> 'jornada_terceiros' OR created_by_identity IS NOT NULL)
  NOT VALID;

-- O vínculo com crm_contracts só vale com validação canônica registrada:
-- quem verificou (identidade staff) e quando. O corpo do navegador nunca
-- vincula contrato sozinho.
ALTER TABLE ext_third_parties
  ADD COLUMN IF NOT EXISTS contract_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contract_verified_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS contract_verified_status TEXT;

ALTER TABLE ext_third_parties
  DROP CONSTRAINT IF EXISTS ext_third_parties_contract_verification_check;
ALTER TABLE ext_third_parties
  ADD CONSTRAINT ext_third_parties_contract_verification_check
  CHECK (
    origin <> 'jornada_terceiros'
    OR contract_id IS NULL
    OR (contract_verified_at IS NOT NULL AND contract_verified_by_identity IS NOT NULL)
  )
  NOT VALID;

-- Verificação sem contrato vinculado é incoerente: não registrar prova solta.
ALTER TABLE ext_third_parties
  DROP CONSTRAINT IF EXISTS ext_third_parties_contract_verification_pairing_check;
ALTER TABLE ext_third_parties
  ADD CONSTRAINT ext_third_parties_contract_verification_pairing_check
  CHECK (
    (contract_verified_at IS NULL AND contract_verified_by_identity IS NULL)
    OR contract_id IS NOT NULL
  )
  NOT VALID;

COMMENT ON COLUMN ext_third_parties.origin IS
  'jornada_terceiros: criado pela jornada canônica EXT-02 com autoria derivada da sessão staff; registro_legado: linhas anteriores à 148, sem autoria inventada.';
COMMENT ON COLUMN ext_third_parties.contract_verified_at IS
  'Momento da validação canônica do contrato em crm_contracts. Sem esta prova, a jornada EXT-02 não aceita contract_id.';
COMMENT ON COLUMN ext_third_parties.contract_verified_status IS
  'Situação observada em crm_contracts no instante da verificação, registrada como fato — nunca estimada depois.';
COMMENT ON COLUMN ext_third_parties.access_start IS
  'LEGADO (085): campo livre preservado para histórico. A janela que decide acesso é ext_third_party_access_grants (148); nenhuma derivação da jornada EXT-02 lê esta coluna.';
COMMENT ON COLUMN ext_third_parties.access_end IS
  'LEGADO (085): campo livre preservado para histórico. "Perde acesso ao término" é derivado de ext_third_party_access_grants (148), não daqui.';

-- ---------------------------------------------------------------------------
-- Avaliação do terceiro: autor, data e justificativa obrigatórios. Sem nota
-- inventada — a nota exibida no cadastro só pode apontar para uma avaliação
-- canônica registrada aqui.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_third_party_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  third_party_id UUID NOT NULL REFERENCES ext_third_parties(id) ON DELETE RESTRICT,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  evaluated_on DATE NOT NULL,
  evaluated_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ext_third_party_evaluations_third_idx
  ON ext_third_party_evaluations (third_party_id, evaluated_on DESC, created_at DESC);

COMMENT ON TABLE ext_third_party_evaluations IS
  'Avaliação canônica de terceiro (EXT-02): autor derivado da sessão staff, data e justificativa obrigatórias. Apenas-acréscimo; nenhuma nota é inventada ou estimada.';

ALTER TABLE ext_third_parties
  ADD COLUMN IF NOT EXISTS evaluation_source_id UUID REFERENCES ext_third_party_evaluations(id);

-- Na jornada canônica, a nota do cadastro só existe apontando para a avaliação
-- que a originou. Linhas legadas não são alteradas nem recebem autoria falsa.
ALTER TABLE ext_third_parties
  DROP CONSTRAINT IF EXISTS ext_third_parties_evaluation_source_check;
ALTER TABLE ext_third_parties
  ADD CONSTRAINT ext_third_parties_evaluation_source_check
  CHECK (
    origin <> 'jornada_terceiros'
    OR evaluation_score IS NULL
    OR evaluation_source_id IS NOT NULL
  )
  NOT VALID;

COMMENT ON COLUMN ext_third_parties.evaluation_source_id IS
  'Avaliação canônica que originou evaluation_score. Na jornada EXT-02 a nota nunca é escrita direto pelo corpo do navegador.';

-- ---------------------------------------------------------------------------
-- Acesso temporário: a janela que DECIDE o acesso. Sempre vinculada a um único
-- escopo autorizado (contrato OU ordem de serviço), com início e fim
-- obrigatórios. "Perde acesso ao término" é consequência determinística de
-- access_end — não existe campo livre de "liberado/bloqueado".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_third_party_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  third_party_id UUID NOT NULL REFERENCES ext_third_parties(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('contrato','ordem_servico')),
  contract_id UUID REFERENCES crm_contracts(id) ON DELETE RESTRICT,
  service_order_id UUID REFERENCES ast_service_orders(id) ON DELETE RESTRICT,
  access_start DATE NOT NULL,
  access_end DATE NOT NULL,
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  granted_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by_identity UUID REFERENCES auth_identities(id),
  revoke_reason TEXT,
  -- Exatamente um escopo, coerente com scope_kind: sem acesso "genérico".
  CONSTRAINT ext_third_party_access_grants_scope_check CHECK (
    (scope_kind = 'contrato' AND contract_id IS NOT NULL AND service_order_id IS NULL)
    OR (scope_kind = 'ordem_servico' AND service_order_id IS NOT NULL AND contract_id IS NULL)
  ),
  -- Janela com término obrigatório e não anterior ao início.
  CONSTRAINT ext_third_party_access_grants_window_check CHECK (access_end >= access_start),
  -- Revogação é declarada: autor e motivo juntos, nunca silenciosa.
  CONSTRAINT ext_third_party_access_grants_revocation_check CHECK (
    (revoked_at IS NULL AND revoked_by_identity IS NULL AND revoke_reason IS NULL)
    OR (
      revoked_at IS NOT NULL
      AND revoked_by_identity IS NOT NULL
      AND char_length(revoke_reason) BETWEEN 5 AND 500
    )
  )
);
CREATE INDEX IF NOT EXISTS ext_third_party_access_grants_third_idx
  ON ext_third_party_access_grants (third_party_id, access_end DESC, granted_at DESC);
CREATE INDEX IF NOT EXISTS ext_third_party_access_grants_contract_idx
  ON ext_third_party_access_grants (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_third_party_access_grants_service_order_idx
  ON ext_third_party_access_grants (service_order_id) WHERE service_order_id IS NOT NULL;

COMMENT ON TABLE ext_third_party_access_grants IS
  'Janela canônica de acesso temporário de terceiro (EXT-02), sempre presa a UM escopo autorizado (contrato crm_contracts ou OS ast_service_orders). A vigência é derivada de access_start/access_end e da revogação declarada; não existe campo livre de liberação.';
COMMENT ON COLUMN ext_third_party_access_grants.access_end IS
  'Término da janela. "Perde acesso ao término" é imposto por derivação determinística desta data, nunca por marcação manual.';

-- ---------------------------------------------------------------------------
-- Regra explícita de antecedência de vencimento de documento. Sem regra ativa,
-- a jornada declara a ausência e NÃO produz alerta "a vencer" — vigente e
-- vencido continuam derivados apenas da data registrada.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_third_party_document_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  third_party_id UUID NOT NULL REFERENCES ext_third_parties(id) ON DELETE RESTRICT,
  alert_before_days INT NOT NULL CHECK (alert_before_days BETWEEN 1 AND 365),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 5 AND 500),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by_identity UUID REFERENCES auth_identities(id),
  created_by_identity UUID NOT NULL REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (is_active = true OR deactivated_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ext_third_party_document_rules_active_one_per_third
  ON ext_third_party_document_rules (third_party_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS ext_third_party_document_rules_third_idx
  ON ext_third_party_document_rules (third_party_id, created_at DESC);

COMMENT ON TABLE ext_third_party_document_rules IS
  'Regra explícita de antecedência do alerta de vencimento de documento de terceiro (EXT-02). Sem regra ativa nenhum "a vencer" é inferido: a jornada declara sem_regra_de_antecedencia.';

-- ---------------------------------------------------------------------------
-- Documentos: desativação declarada (nunca apagar), com autor e motivo.
-- ---------------------------------------------------------------------------
ALTER TABLE ext_third_party_documents
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by_identity UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS deactivate_reason TEXT;

ALTER TABLE ext_third_party_documents
  DROP CONSTRAINT IF EXISTS ext_third_party_documents_deactivation_check;
ALTER TABLE ext_third_party_documents
  ADD CONSTRAINT ext_third_party_documents_deactivation_check
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
-- Eventos imutáveis por terceiro: cada mutação da jornada canônica grava um
-- evento na MESMA transação do negócio e da auditoria. A chave de idempotência
-- vive aqui: retry idêntico não duplica e reuso divergente responde 409.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ext_third_party_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  third_party_id UUID NOT NULL REFERENCES ext_third_parties(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'terceiro_criado','situacao_atualizada','contrato_vinculado',
    'acesso_concedido','acesso_revogado','documento_registrado',
    'documento_desativado','regra_documento_registrada','avaliacao_registrada'
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
CREATE UNIQUE INDEX IF NOT EXISTS ext_third_party_events_identity_idempotency_key
  ON ext_third_party_events (created_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ext_third_party_events_third_idx
  ON ext_third_party_events (third_party_id, created_at DESC);

COMMENT ON TABLE ext_third_party_events IS
  'Histórico imutável de eventos da jornada canônica de terceiros (EXT-02), gravado na mesma transação do negócio e da auditoria. Carrega a chave de idempotência por identidade staff.';
COMMENT ON COLUMN ext_third_party_events.idempotency_key IS
  'Chave de idempotência enviada no header da mutação; única por identidade staff. Reuso com conteúdo divergente responde 409.';
COMMENT ON COLUMN ext_third_party_events.request_fingerprint IS
  'SHA-256 do conteúdo normalizado da mutação; replay idêntico devolve o mesmo registro sem duplicar.';

COMMENT ON TABLE ext_third_party_access_logs IS
  'LEGADO (085): registro solto de acesso, sem janela, sem escopo autorizado e sem autor obrigatório. Superado por ext_third_party_access_grants (148); a jornada canônica EXT-02 não escreve aqui e não deriva acesso desta tabela.';

-- ---------------------------------------------------------------------------
-- Imutabilidade: avaliações e eventos não aceitam UPDATE/DELETE. As janelas de
-- acesso aceitam exatamente uma transição declarada — a revogação — e nada
-- mais: nem reabertura, nem mudança de escopo, nem esticar o término.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ext_third_party_history_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ext_third_party_history_immutable: % em % não é permitido; histórico de terceiros é apenas-acréscimo', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_third_party_evaluations_immutable ON ext_third_party_evaluations;
CREATE TRIGGER ext_third_party_evaluations_immutable
  BEFORE UPDATE OR DELETE ON ext_third_party_evaluations
  FOR EACH ROW EXECUTE FUNCTION ext_third_party_history_immutable();

DROP TRIGGER IF EXISTS ext_third_party_events_immutable ON ext_third_party_events;
CREATE TRIGGER ext_third_party_events_immutable
  BEFORE UPDATE OR DELETE ON ext_third_party_events
  FOR EACH ROW EXECUTE FUNCTION ext_third_party_history_immutable();

CREATE OR REPLACE FUNCTION ext_third_party_access_grant_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ext_third_party_access_grant_guard: DELETE não é permitido; a janela de acesso é apenas-acréscimo com revogação declarada';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'ext_third_party_access_grant_guard: janela já revogada não pode ser alterada';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.third_party_id IS DISTINCT FROM OLD.third_party_id
     OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
     OR NEW.access_start IS DISTINCT FROM OLD.access_start
     OR NEW.access_end IS DISTINCT FROM OLD.access_end
     OR NEW.justification IS DISTINCT FROM OLD.justification
     OR NEW.granted_by_identity IS DISTINCT FROM OLD.granted_by_identity
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at THEN
    RAISE EXCEPTION 'ext_third_party_access_grant_guard: escopo, janela e autoria são imutáveis; só a revogação declarada pode ser gravada';
  END IF;
  IF NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'ext_third_party_access_grant_guard: a única atualização aceita é a revogação declarada';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ext_third_party_access_grants_guard ON ext_third_party_access_grants;
CREATE TRIGGER ext_third_party_access_grants_guard
  BEFORE UPDATE OR DELETE ON ext_third_party_access_grants
  FOR EACH ROW EXECUTE FUNCTION ext_third_party_access_grant_guard();

COMMIT;

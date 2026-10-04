-- 154-ext07-compliance-hardening: EXT-07 — endurecimento aditivo sobre 001–153.
-- Não altera 001–153. Não insere dados, não atribui retroativamente obrigação,
-- responsável ou privacidade a registros legados (086, origin='registro_legado').
-- Corrige incompatibilidades reais encontradas na 153 (ver relatório de entrega):
--   (a) a checagem de "versão atual" baseada em replacement_of IS NULL sempre
--       elegia o PRIMEIRO documento da obrigação, não o mais recente — é
--       substituída por um marcador explícito de supersessão (superseded_at);
--   (b) ext_compliance_tasks.responsible_identity era opcional, contrariando a
--       exigência de falha fechada sem responsável;
--   (c) faltava checagem de vencimento anterior à emissão (só havia a checagem
--       contra o início de vigência) e de regra de validade declarada;
--   (d) faltava um guarda de consistência entre status e data de vencimento
--       (estado "vigente"/"vencida" arbitrário, incompatível com o relógio do
--       servidor).

-- 1) Falha fechada: tarefa de compliance exige responsável staff canônico.
--    Condicional porque a tabela deve estar vazia (sem seed); não força dados.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ext_compliance_tasks WHERE responsible_identity IS NULL) THEN
    ALTER TABLE ext_compliance_tasks ALTER COLUMN responsible_identity SET NOT NULL;
  END IF;
END $$;

-- 2) Validade: vencimento não pode ser anterior à emissão (adicional ao check
--    de início de vigência já existente na 153). NOT VALID preserva legado 086
--    não examinado sem bloquear a migração; novas escritas são sempre checadas.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_expiry_after_issue_check
  CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date) NOT VALID;

-- 3) Validade com vencimento exige regra declarada para registros canônicos.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_validity_rule_required_check
  CHECK (origin <> 'ext07_canonica' OR expiry_date IS NULL OR validity_rule IS NOT NULL) NOT VALID;

-- 4) Versionamento/renovação: coluna explícita de supersessão em vez de inferir
--    "versão atual" por replacement_of IS NULL (bug da 153: isso sempre aponta
--    para o documento ORIGINAL, não para o mais recente da cadeia).
ALTER TABLE ext_compliance_documents
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS renewal_justification TEXT;

ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_renewal_justification_check
  CHECK (replacement_of IS NULL OR char_length(COALESCE(renewal_justification,'')) BETWEEN 10 AND 2000) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_no_self_replacement_check
  CHECK (replacement_of IS NULL OR replacement_of <> id) NOT VALID;

-- Substitui o índice de "versão atual" da 153 (mantém o mesmo nome, mesma
-- finalidade declarada, critério corrigido): no máximo uma versão corrente
-- (não substituída, não cancelada) por obrigação canônica.
DROP INDEX IF EXISTS ext_compliance_current_version_unique;
-- Comparação direta contra o literal (sem cast ::text): o cast enum->text usa
-- enum_out, que o PostgreSQL marca STABLE, não IMMUTABLE, e é rejeitado em
-- predicado de índice. Comparar a coluna enum contra o literal evita o cast
-- (o literal é convertido para o enum uma única vez, em tempo de planejamento).
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_current_version_unique
  ON ext_compliance_documents(obligation_id)
  WHERE origin = 'ext07_canonica' AND superseded_at IS NULL AND status <> 'cancelada';

-- Cada documento só pode ser sucedido por, no máximo, uma renovação. Combinado
-- com a FK (replacement_of só pode apontar para uma linha já existente) e a
-- ordem de inserção, isto impede ciclos: um ciclo exigiria que um documento
-- criado depois fosse referenciado por um documento criado antes dele.
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_replacement_of_unique
  ON ext_compliance_documents(replacement_of) WHERE replacement_of IS NOT NULL;

-- 5) Estado do documento consistente com a data do servidor — nunca com o
--    relógio do cliente. "vigente" com vencimento já passado, ou "vencida" sem
--    vencimento passado, são rejeitados estruturalmente para registros
--    canônicos. Legado (registro_legado) não é tocado.
CREATE OR REPLACE FUNCTION ext_compliance_document_state_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin = 'ext07_canonica' THEN
    IF NEW.status::text = 'vigente' AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'vigente status incompatible with past expiry_date; run expiry evaluation first';
    END IF;
    IF NEW.status::text = 'vencida' AND (NEW.expiry_date IS NULL OR NEW.expiry_date >= CURRENT_DATE) THEN
      RAISE EXCEPTION 'vencida status requires a past expiry_date confirmed by the server clock';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ext_compliance_document_state_guard ON ext_compliance_documents;
CREATE TRIGGER ext_compliance_document_state_guard
  BEFORE INSERT OR UPDATE ON ext_compliance_documents
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_document_state_guard();

-- 6) Guarda de imutabilidade/renovação corrigida: cobre effective_start_date e
--    declared_reference (ausentes na 153), impede reatribuição de autoria, e
--    permite exatamente UMA transição de superseded_at (NULL -> timestamp),
--    nunca uma reversão. CREATE OR REPLACE preserva o trigger já criado na 153
--    (mesmo nome de função, mesma assinatura); não recria o trigger.
CREATE OR REPLACE FUNCTION ext_compliance_document_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origin = 'ext07_canonica' THEN
    IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
      OR NEW.responsible_identity IS DISTINCT FROM OLD.responsible_identity
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
      OR NEW.effective_start_date IS DISTINCT FROM OLD.effective_start_date
      OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
      OR NEW.file_url IS DISTINCT FROM OLD.file_url
      OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
      OR NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.declared_reference IS DISTINCT FROM OLD.declared_reference
      OR NEW.created_by_identity IS DISTINCT FROM OLD.created_by_identity
    THEN
      RAISE EXCEPTION 'canonical compliance document is immutable; create a renewal';
    END IF;
    IF OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
      RAISE EXCEPTION 'superseded compliance document cannot change version state';
    END IF;
  END IF;
  IF OLD.status::text = 'cancelada' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal compliance document cannot reopen';
  END IF;
  RETURN NEW;
END $$;

-- 7) Índices de apoio a replay de idempotência e consulta de tarefas por
--    período/regra (sem alterar a unicidade já declarada na 153).
CREATE INDEX IF NOT EXISTS ext_compliance_events_idem_idx ON ext_compliance_events(created_by_identity, idempotency_key);
CREATE INDEX IF NOT EXISTS ext_compliance_tasks_document_period_idx ON ext_compliance_tasks(document_id, validity_period, rule);
CREATE INDEX IF NOT EXISTS ext_compliance_documents_current_idx ON ext_compliance_documents(obligation_id) WHERE origin = 'ext07_canonica' AND superseded_at IS NULL;

COMMENT ON COLUMN ext_compliance_documents.superseded_at IS 'Marca definitiva e única de substituição (renovação). Não é revertida; corrige o critério de "versão atual" da 153.';
COMMENT ON COLUMN ext_compliance_documents.replacement_of IS 'Aponta para a versão imediatamente anterior desta obrigação; cadeia linear sem ramificação (índice único por alvo) e sem ciclo (FK + ordem de inserção).';
COMMENT ON COLUMN ext_compliance_documents.renewal_justification IS 'Obrigatória quando o documento é uma renovação (replacement_of preenchido).';
COMMENT ON TABLE ext_compliance_tasks IS 'Fonte dedicada de tarefa de compliance; responsável staff canônico obrigatório (falha fechada); única por documento/período/regra declarada.';

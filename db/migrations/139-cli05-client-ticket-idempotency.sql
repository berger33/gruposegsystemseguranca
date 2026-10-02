-- L08/CLI-05 (hardening, 2026-10-02): criação de chamado pelo cliente passa a ser
-- idempotente e auditável na mesma transação.
--
-- Contexto: a revisão da primeira fatia (PR #78/#80) encontrou INSERT do
-- chamado seguido de auditoria fora de transação e sem chave de idempotência;
-- retry concorrente do próprio cliente podia duplicar protocolo. Esta migração
-- é estritamente aditiva: nenhuma tabela/coluna existente é alterada de forma
-- destrutiva, 001–138 permanecem imutáveis e linhas antigas continuam válidas
-- (chave nula = contrato anterior, cada POST cria um chamado novo).
--
-- Decisões:
-- 1. idempotency_key é opcional e vem do cliente da API (8..200 caracteres);
-- 2. content_fingerprint anda junto com a chave para recusar reuso com
--    conteúdo diferente (conflito explícito, nunca reescrita silenciosa);
-- 3. unicidade por (client_account_id, opened_by_identity, idempotency_key):
--    a chave pertence ao autor dentro da própria conta — nunca vaza existência
--    de chave para outra conta ou outra identidade;
-- 4. constraints entram como NOT VALID (não reprovam retroativamente linhas
--    antigas) e são validadas explicitamente em seguida, no padrão da 134.

ALTER TABLE client_tickets ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200);
ALTER TABLE client_tickets ADD COLUMN IF NOT EXISTS content_fingerprint VARCHAR(64);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='client_tickets_idempotency_key_shape') THEN
    ALTER TABLE client_tickets ADD CONSTRAINT client_tickets_idempotency_key_shape
      CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 200) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='client_tickets_idempotency_requires_fingerprint') THEN
    ALTER TABLE client_tickets ADD CONSTRAINT client_tickets_idempotency_requires_fingerprint
      CHECK (idempotency_key IS NULL OR content_fingerprint IS NOT NULL) NOT VALID;
  END IF;
END $$;

ALTER TABLE client_tickets VALIDATE CONSTRAINT client_tickets_idempotency_key_shape;
ALTER TABLE client_tickets VALIDATE CONSTRAINT client_tickets_idempotency_requires_fingerprint;

CREATE UNIQUE INDEX IF NOT EXISTS client_tickets_idempotency_uidx
  ON client_tickets(client_account_id, opened_by_identity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- L08 CLI-05 hardening — abertura de chamado idempotente e auditoria atômica.
--
-- Migração ADITIVA: 001–138 não são reescritas, nenhuma linha é apagada e
-- nenhuma autoria histórica é inventada. As constraints novas são aplicadas
-- com NOT VALID e validadas na sequência: linhas existentes já nasceram sem
-- chave de idempotência (coluna NULL) e continuam válidas sem reinterpretar
-- o passado.
--
-- Motivo (docs/AUDITORIA-TERRENO-L08.md, risco transversal CLI): a abertura
-- de chamado do cliente não tinha proteção contra retry de rede (duas
-- submissões do mesmo clique podiam abrir dois chamados) e a auditoria em
-- auth_access_audit era melhor esforço — uma falha ao gravar a auditoria não
-- impedia a escrita de negócio. Esta migração só adiciona as colunas; o
-- comportamento transacional/fail-closed é aplicado em
-- src/server/client-space-api.mjs.

ALTER TABLE client_tickets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;

ALTER TABLE client_tickets
  ADD CONSTRAINT client_tickets_idempotency_key_len
    CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 200) NOT VALID;
ALTER TABLE client_tickets VALIDATE CONSTRAINT client_tickets_idempotency_key_len;

ALTER TABLE client_tickets
  ADD CONSTRAINT client_tickets_content_fingerprint_shape
    CHECK (content_fingerprint IS NULL OR content_fingerprint ~ '^[a-f0-9]{64}$') NOT VALID;
ALTER TABLE client_tickets VALIDATE CONSTRAINT client_tickets_content_fingerprint_shape;

-- Uma chave de idempotência só precisa ser única dentro da mesma conta
-- cliente; duas contas distintas podem usar o mesmo valor de chave sem
-- colidir (cada uma gera a sua no navegador, sem coordenação entre contas).
CREATE UNIQUE INDEX IF NOT EXISTS client_tickets_account_idempotency_key
  ON client_tickets (client_account_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

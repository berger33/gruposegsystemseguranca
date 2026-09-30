-- 119-l06-operacao-hardening
-- L06 (fatia A): operação — endurecimento de alocação e ponte posto → contrato canônico.
--
-- Migrações 001–118 são imutáveis. Esta migração é ADITIVA:
--   * cria um vínculo explícito, opcional, entre um posto físico (ops_posts) e o
--     contrato comercial canônico L05 (crm_contracts). O posto continua ligado a
--     empresa/unidade; o contrato passa a permitir bloquear nova alocação quando
--     estiver encerrado/cancelado/suspenso, sem apagar o histórico já registrado.
--   * NÃO cria contrato, proposta, conta de cliente ou contrato de portal.
--   * NÃO altera colunas existentes nem reconstrói tabelas.

ALTER TABLE ops_posts
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_posts_contract ON ops_posts(contract_id);

SELECT 'Migration 119 L06 operacao hardening (ops_posts.contract_id) applied' AS result;

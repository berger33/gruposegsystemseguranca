-- SEC-03: Associar documentos a contrato e classificação, com autorização uniforme.
-- Idempotente, sem dados de demonstração.

-- Documentos podem estar ligados a um contrato específico (opcional).
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'geral' CHECK (classification IN ('geral','contratual','fiscal','tecnico','rh','operacional'));

CREATE INDEX IF NOT EXISTS client_documents_contract_idx
  ON client_documents (contract_id);
CREATE INDEX IF NOT EXISTS client_documents_classification_idx
  ON client_documents (classification);

-- Tickets também podem estar ligados a contrato para escopo mais fino.
ALTER TABLE client_tickets
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES client_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_tickets_contract_idx
  ON client_tickets (contract_id);

-- Auditoria: garantir que novas ações de documento com contrato sejam registradas (já cobertas por document_list etc., mas adicionamos categoria específica se faltar).
-- A constraint de auditoria já foi ampliada em migrações anteriores; não recriamos aqui para evitar conflito.

-- Validação: se grant está restrito a contratos selecionados, documentos sem contrato ou com contrato fora da allowlist não devem ser listados.
-- A lógica é implementada no servidor (client-space-api), não via constraint.

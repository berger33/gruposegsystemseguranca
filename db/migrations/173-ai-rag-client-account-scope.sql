-- A base do cliente só pode ser publicada para uma conta identificada.
ALTER TABLE ai_rag_documents
  ADD COLUMN IF NOT EXISTS client_account_id UUID REFERENCES client_accounts(id);

UPDATE ai_rag_documents
SET is_published = false, status = 'rascunho'
WHERE rag_key = 'cliente' AND client_account_id IS NULL AND is_published = true;

ALTER TABLE ai_rag_documents
  ADD CONSTRAINT ai_rag_client_account_scope
  CHECK ((rag_key = 'cliente' AND (client_account_id IS NOT NULL OR is_published = false))
      OR (rag_key <> 'cliente' AND client_account_id IS NULL));

CREATE INDEX ai_rag_documents_client_scope_idx
  ON ai_rag_documents (client_account_id, is_published, is_approved)
  WHERE rag_key = 'cliente';

ALTER TABLE ai_rag_documents ADD COLUMN IF NOT EXISTS supersedes_document_id uuid REFERENCES ai_rag_documents(id);
CREATE TABLE IF NOT EXISTS ai_rag_directory_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(name) BETWEEN 3 AND 120),
 rag_key text NOT NULL CHECK (rag_key IN ('publico','cliente','rh','marcelo')),
 client_account_id uuid REFERENCES client_accounts(id),
 root_key text NOT NULL,
 relative_path text NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 last_synced_at timestamptz,
 last_report jsonb,
 created_by_identity uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((rag_key='cliente') = (client_account_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS ai_rag_directory_files (
 source_id uuid NOT NULL REFERENCES ai_rag_directory_sources(id),
 relative_file text NOT NULL,
 content_hash text NOT NULL,
 document_id uuid NOT NULL REFERENCES ai_rag_documents(id),
 PRIMARY KEY (source_id, relative_file)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_rag_directory_source_scope_unique
 ON ai_rag_directory_sources (rag_key, (COALESCE(client_account_id::text,'')), root_key, relative_path);

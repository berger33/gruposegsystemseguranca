-- L02: integridade e autoria verificável dos documentos privados.
--
-- Motivação verificada lendo src/server/client-space-api.mjs e a migração 004:
--   1. O arquivo era gravado em disco (ctx.docsDir) sem NENHUM hash registrado.
--      Sem isso não há como distinguir "arquivo íntegro" de "arquivo corrompido
--      ou trocado por fora do sistema", e o gate do L02 exige hash.
--   2. client_documents.uploaded_by tinha CHECK (uploaded_by IN ('marcelo','ti')).
--      O L01 unificou os papéis de staff em ('admin','ti','rh','marcelo'), então
--      um upload feito por um staff 'admin' ou 'rh' violava o CHECK e derrubava
--      a requisição. É uma regressão latente introduzida pelo L01.
--   3. O autor gravado era a STRING do papel, não a identidade. O L01 estabeleceu
--      que o ator auditável é o identityId; o documento precisa seguir a mesma
--      regra para que "quem subiu isto" tenha resposta individual.

BEGIN;

-- 1. Hash do conteúdo. Nulo é permitido porque documentos anteriores a esta
--    migração existem e não podem ser re-hasheados sem ler o disco; o código
--    calcula na gravação e verifica na leitura quando o valor está presente.
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64);

ALTER TABLE client_documents
  DROP CONSTRAINT IF EXISTS client_documents_content_sha256_format;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_content_sha256_format
  CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');

-- 2. Identidade do autor do upload, alinhada ao ator auditável do L01.
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_identity UUID REFERENCES auth_identities(id);

CREATE INDEX IF NOT EXISTS client_documents_uploader_idx
  ON client_documents (uploaded_by_identity, created_at DESC);

-- 3. Papéis de staff unificados. Mantém os dois valores antigos para não
--    invalidar linhas já gravadas.
ALTER TABLE client_documents
  DROP CONSTRAINT IF EXISTS client_documents_uploaded_by_check;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_uploaded_by_check
  CHECK (uploaded_by IN ('admin', 'ti', 'rh', 'marcelo'));

COMMENT ON COLUMN client_documents.content_sha256 IS
  'SHA-256 do conteúdo gravado em disco. Verificado no download; divergência derruba a entrega.';
COMMENT ON COLUMN client_documents.uploaded_by_identity IS
  'Identidade individual que enviou o arquivo (L01: ator auditável nunca é o papel).';

COMMIT;

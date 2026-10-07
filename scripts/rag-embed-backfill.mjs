#!/usr/bin/env node
// RAG-01 — indexação semântica manual, idempotente e auditável.
//
// Regras:
//   - NÃO baixa modelo: se o modelo não estiver instalado no Ollama local, o
//     script informa e sai sem marcar nada como indexado;
//   - o destino é sempre loopback (127.0.0.1/localhost/[::1]);
//   - reexecutar não duplica vetor: o checksum do conteúdo decide o trabalho;
//   - nenhum texto de chunk, prompt ou segredo aparece na saída.
//
// Uso:
//   OLLAMA_ENABLED=true OLLAMA_EMBED_MODEL=nomic-embed-text DATABASE_URL=... \
//     node scripts/rag-embed-backfill.mjs [--rag-key publico] [--limit 50]

import { Pool } from 'pg';
import { createEmbeddingService } from '../src/server/ai-rag-embeddings.mjs';
import { createRagRetrieval } from '../src/server/ai-rag-retrieval.mjs';

const args = process.argv.slice(2);
const readFlag = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const ragKey = readFlag('--rag-key');
const limit = Math.min(500, Math.max(1, Number(readFlag('--limit')) || 50));

if (ragKey && !['publico', 'cliente', 'rh', 'marcelo'].includes(ragKey)) {
  console.error('RAG_BACKFILL_INVALID_RAG_KEY: use publico, cliente, rh ou marcelo.');
  process.exit(2);
}

const urlText = process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || '';
if (!urlText) {
  console.error('RAG_BACKFILL_NO_DATABASE: defina DATABASE_URL para o PostgreSQL local.');
  process.exit(2);
}
let host;
try { host = new URL(urlText).hostname; } catch { console.error('RAG_BACKFILL_INVALID_DATABASE_URL'); process.exit(2); }
if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && process.env.ALLOW_REMOTE_RAG_AUTOMATION !== 'true') {
  console.error('RAG_BACKFILL_REMOTE_REFUSED: host não é loopback; exige ALLOW_REMOTE_RAG_AUTOMATION=true explícito.');
  process.exit(2);
}

const embeddings = createEmbeddingService({});
const pool = new Pool({ connectionString: urlText, max: 2, application_name: 'seg-rag-backfill' });
let exitCode = 0;
try {
  const state = await embeddings.status();
  console.log(`RAG_BACKFILL_EMBEDDING: model=${state.model} dimensions=${state.dimensions} enabled=${state.enabled} ok=${state.ok} error=${state.error_code || '-'}`);
  if (!state.ok) {
    console.error(`RAG_BACKFILL_REFUSED: ${state.error_code}. Instale o modelo manualmente (ex.: ollama pull ${state.model}) e reexecute. Nenhum chunk foi marcado como indexado.`);
    process.exitCode = 3;
  } else {
    const retrieval = createRagRetrieval({ pool, embeddings });
    const cleaned = await retrieval.purgeUnpublishedEmbeddings();
    console.log(`RAG_BACKFILL_PURGED: ${cleaned.removed} embedding(s) de conteúdo fora de circulação.`);
    const summary = await retrieval.indexPending({ ragKey, limit });
    console.log(`RAG_BACKFILL_SUMMARY: documentos=${summary.documents} chunks=${summary.chunks} gerados=${summary.generated} pulados=${summary.skipped} erros=${summary.errored} erro=${summary.error_code || '-'}`);
    const status = await retrieval.indexStatus({ ragKey });
    for (const row of status) {
      console.log(`RAG_INDEX_STATUS: rag_key=${row.rag_key} documentos=${row.documents} chunks=${row.chunks} indexados=${row.indexed} pendentes=${row.pending} erros=${row.errored} modelo=${row.model_name || '-'} dimensoes=${row.dimensions || '-'} ultimo=${row.last_generated_at ? new Date(row.last_generated_at).toISOString() : '-'}`);
    }
    if (summary.errored > 0) exitCode = 1;
  }
} catch (error) {
  console.error('RAG_BACKFILL_FAILED:', String(error?.message || error).slice(0, 300));
  exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
process.exit(exitCode);

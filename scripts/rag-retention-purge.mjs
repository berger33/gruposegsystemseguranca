#!/usr/bin/env node
// RAG-01 — eliminação explícita do texto de perguntas/respostas vencido.
//
// Política aprovada pelo proprietário em 2026-10-06: o ledger guarda pergunta,
// resposta e metadados das fontes por 90 dias (configurável por área em
// ai_rag_retrieval_config.retention_days). Passado o prazo, o TEXTO é apagado;
// a linha permanece com resultado, modo de recuperação, latência e contagens
// para que as métricas continuem honestas (a métrica não depende do texto).
//
//   - destino sempre loopback (salvo ALLOW_REMOTE_RAG_AUTOMATION=true);
//   - não apaga nada dentro do prazo;
//   - relata apenas contagens, nunca conteúdo;
//   - reexecutar é seguro (idempotente: só apaga texto ainda presente).

import { Pool } from 'pg';

const urlText = process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || '';
if (!urlText) { console.error('RAG_RETENTION_NO_DATABASE'); process.exit(2); }
let host;
try { host = new URL(urlText).hostname; } catch { console.error('RAG_RETENTION_INVALID_DATABASE_URL'); process.exit(2); }
if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && process.env.ALLOW_REMOTE_RAG_AUTOMATION !== 'true') {
  console.error('RAG_RETENTION_REMOTE_REFUSED: host não é loopback.');
  process.exit(2);
}

const pool = new Pool({ connectionString: urlText, max: 2, application_name: 'seg-rag-retention' });
try {
  const preview = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE query IS NOT NULL OR response IS NOT NULL)::int AS com_texto
       FROM ai_rag_answer_events WHERE retention_expires_at <= NOW()`,
  );
  const { total, com_texto } = preview.rows[0];
  console.log(`RAG_RETENTION_DUE: eventos=${total} com_texto=${com_texto}`);
  if (com_texto > 0) {
    const { rowCount } = await pool.query(
      `UPDATE ai_rag_answer_events
          SET query=NULL, response=NULL, sources='[]'::jsonb
        WHERE retention_expires_at <= NOW() AND (query IS NOT NULL OR response IS NOT NULL)`,
    );
    console.log(`RAG_RETENTION_PURGED: ${rowCount} evento(s) tiveram o texto removido; metadados preservados para métrica.`);
    await pool.query(
      `INSERT INTO audit_log (action, actor, target, meta) VALUES ('ai_rag_retention_purge', 'script', 'ai_rag_answer_events', $1::jsonb)`,
      [JSON.stringify({ removidos: rowCount })],
    ).catch(() => {});
  } else {
    console.log('RAG_RETENTION_NOTHING_TO_DO: nenhum texto vencido.');
  }
} catch (error) {
  console.error('RAG_RETENTION_FAILED:', String(error?.message || error).slice(0, 300));
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

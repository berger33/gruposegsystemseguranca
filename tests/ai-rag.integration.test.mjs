#!/usr/bin/env node
// Smoke HTTP isolado: rota canônica, autorização e ausência honesta de fonte.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3002';
const port = process.env.TEST_PORT || '3002';
let server;
let serverError = '';
const adminToken = 'qa-local-ti-token-2026-09-28-only-000000';

async function post(url, body, cookie) {
  const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/api/health/live', { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw Error(`Servidor QA não iniciou: ${serverError.slice(-1000)}`);
}
async function run() {
  if (!process.env.TEST_BASE_URL) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seg-rag-qa-'));
    server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: port, BIND_HOST: '127.0.0.1', QA_PGLITE_ONLY: 'true', PGLITE_DATA_DIR: dataDir, DATABASE_URL: '', DATABASE_MIGRATION_URL: '', OLLAMA_ENABLED: 'false', SITE_ADMIN_TOKEN_TI: adminToken, SITE_ADMIN_SESSION_SECRET: 'qa-local-session-secret-2026-09-28-only-000000000000', SITE_ADMIN_LEGACY_TOKENS: 'true' }, stdio: ['ignore','pipe','pipe'] });
    server.stderr.on('data', chunk => { serverError += chunk.toString(); });
    server.stdout.on('data', chunk => { serverError += chunk.toString(); });
    await waitForServer();
  }
  try {
    const old = await post('/api/ai/rag', { rag_key: 'publico', query: 'Quais serviços?' });
    assert.equal(old.status, 410, 'rota beta simulada deve permanecer aposentada');
    const empty = await post('/api/ai/answer', { rag_key: 'publico', query: 'zxqvkj oculto inexistente?' });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.reason, 'no_relevant_source');
    assert.deepEqual(empty.body.sources, []);
    assert.equal(empty.body.ollama_used, false);
    for (const rag_key of ['cliente', 'rh', 'marcelo']) {
      const privateResult = await post('/api/ai/answer', { rag_key, query: 'Quais documentos existem?' });
      assert.equal(privateResult.status, 401, `${rag_key} exige identidade própria`);
    }
    if (!process.env.TEST_BASE_URL) {
      const login = await fetch(base + '/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ token: adminToken }) });
      assert.equal(login.status, 200);
      const cookie = login.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);
      const draft = await post('/api/admin/ai-rag-documents', { rag_key: 'publico', title: 'QA rascunho oculto', content: 'qa_draft_never_expose_2843 é um texto sintético que não deve aparecer em respostas públicas.', source: 'qa_local', keywords: ['qa_draft_never_expose_2843'] }, cookie);
      assert.equal(draft.status, 201);
      const probe = await post('/api/ai/answer', { rag_key: 'publico', query: 'Existe qa_draft_never_expose_2843?' });
      assert.equal(probe.status, 200);
      assert.deepEqual(probe.body.sources, []);
      const published = await fetch(base + '/api/admin/ai-rag-documents', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: JSON.stringify({ id: draft.body.id, status: 'publicado', is_approved: true, is_published: true }) });
      assert.equal(published.status, 200);
      const withSource = await post('/api/ai/answer', { rag_key: 'publico', query: 'Existe qa_draft_never_expose_2843?' });
      assert.equal(withSource.status, 503);
      assert.equal(withSource.body.reason, 'ollama_disabled');
      const archive = await fetch(base + '/api/admin/ai-rag-documents', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: JSON.stringify({ id: draft.body.id, status: 'arquivado', is_approved: false, is_published: false }) });
      assert.equal(archive.status, 200);
      const afterArchive = await post('/api/ai/answer', { rag_key: 'publico', query: 'Existe qa_draft_never_expose_2843?' });
      assert.equal(afterArchive.status, 200);
      assert.deepEqual(afterArchive.body.sources, []);
    }
    console.log('RAG HTTP smoke: rota canônica, escopo privado e rascunho oculto OK');
  } finally { if (server) server.kill(); }
}
if (process.env.RUN_DATABASE_INTEGRATION === '1' || process.env.TEST_BASE_URL) run().catch(error => { console.error(error); if (server) server.kill(); process.exitCode = 1; });

#!/usr/bin/env node
// tests/ai-rag.integration.test.mjs — segurança do acesso público + diagnóstico TI beta em PGlite isolado.
// Uso: npm run test:rag (servidor local na porta 3002; QA_PGLITE_ONLY=true, sem PostgreSQL externo).
// TEST_BASE_URL só deve apontar a servidor QA previamente autorizado; sem conta TI, verificações privadas ficam BLOQUEADAS.
// Não usar este roteiro como teste de PostgreSQL completo, Ollama real ou RBAC de usuários finais.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3002';
const PORT = process.env.TEST_PORT || '3002';
let serverProcess = null;
let serverLogs = [];
const QA_ADMIN_TOKEN = 'qa-local-ti-token-2026-09-28-only-000000';
const QA_SESSION_SECRET = 'qa-local-session-secret-2026-09-28-only-000000000000';

function log(...args) { console.log(...args); }

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health/live`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function startTestServer() {
  if (process.env.TEST_BASE_URL) return null;
  log(`[test] Iniciando servidor PGlite lite na porta ${PORT}...`);
  // Nunca apagar o PGlite do usuário: cada execução usa um diretório temporário próprio.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seg-rag-qa-'));
  process.env.PGLITE_DATA_DIR = dataDir; // apenas servidor filho usa este banco sintético; teste consulta via API
  serverProcess = spawn('node', ['server.mjs'], {
    env: {
      ...process.env, PORT, BIND_HOST: '127.0.0.1', PGLITE_DEBUG: 'false', LOG_LEVEL: 'info',
      QA_PGLITE_ONLY: 'true', DATABASE_URL: '', DATABASE_MIGRATION_URL: '',
      MAIL_HOST: '', OLLAMA_ENABLED: 'false', PGLITE_DATA_DIR: dataDir,
      SITE_ADMIN_TOKEN_TI: QA_ADMIN_TOKEN, SITE_ADMIN_SESSION_SECRET: QA_SESSION_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => {
    const s = d.toString();
    serverLogs.push(s);
    if (process.env.TEST_VERBOSE) process.stdout.write(`[server] ${s}`);
  });
  serverProcess.stderr.on('data', (d) => {
    const s = d.toString();
    serverLogs.push(s);
    if (process.env.TEST_VERBOSE) process.stderr.write(`[server-err] ${s}`);
  });
  const ok = await waitForServer(BASE, 25000);
  if (!ok) {
    log('[test] Falha ao iniciar servidor, logs:', serverLogs.slice(-20).join('\n'));
    try { serverProcess.kill(); } catch {}
    throw new Error('Server did not start in time');
  }
  log(`[test] Servidor iniciado em ${BASE}`);
  return serverProcess;
}

function stopTestServer() {
  if (serverProcess) {
    try { serverProcess.kill('SIGTERM'); } catch {}
    serverProcess = null;
  }
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE, ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json, text, headers: res.headers };
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

async function run() {
  log('=== AI RAG Integration Test — escopos públicos bloqueados para RAG privado + diagnóstico TI + fallback ===');
  log(`BASE=${BASE} PORT=${PORT} RUN_DATABASE_INTEGRATION=${process.env.RUN_DATABASE_INTEGRATION}`);

  await startTestServer();

  try {
    let adminCookie = null;
    let rhProtocol = null;
    // Teste 0: Healthcheck e PGlite silent logs
    log('\n[0] Healthcheck + PGlite silent logs');
    let h = await get('/api/health/live');
    assert.equal(h.status, 200, 'health/live deve ser 200');
    const logsJoined = serverLogs.join('\n');
    // Após lote55, não deve conter ERROR audit_log
    assert.ok(!logsJoined.includes('relation "audit_log" does not exist'), 'logs não devem conter ERROR audit_log após fix lote55');
    assert.ok(!logsJoined.includes('PGlite Q] ERROR'), 'logs PGlite Q ERROR devem estar silenciados por padrão (PGLITE_DEBUG=false)');
    log('✓ healthcheck + silent logs ok — sem PGlite Q ERROR');

    // Teste 1: RAG público — serviços
    log('\n[1] RAG publico — Quais servicos?');
    let r = await post('/api/ai/rag', { rag_key: 'publico', query: 'Quais servicos voces oferecem?' });
    log(`status=${r.status} protocol=${r.json?.query?.protocol || r.json?.protocol} queue=${r.json?.queue_position} ollama_used=${r.json?.ollama_used}`);
    assert.equal(r.status, 201, 'publico RAG deve retornar 201');
    assert.ok(r.json.response?.includes('servicos validados') || r.json.response?.includes('seguranca desarmada'), 'resposta deve conter serviços validados');
    assert.equal(r.json.query?.is_invented_price, false, 'is_invented_price false');
    assert.equal(r.json.query?.is_invented_coverage, false);
    assert.equal(r.json.query?.is_invented_license, false);
    assert.equal(r.json.query?.is_invented_deadline, false);
    assert.ok(r.json.queue_position >= 0, 'queue_position deve existir');
    assert.ok(r.json.queue_wait_ms >= 0, 'queue_wait_ms deve existir');
    assert.equal(r.json.model, 'qwen3:1.7b');
    assert.ok(r.json.protocol?.startsWith('RAG-PUB-'), 'protocolo deve começar RAG-PUB-');
    assert.ok(typeof r.json.ollama_used === 'boolean', 'ollama_used boolean deve existir');
    // Beta fallback por padrão
    assert.equal(r.json.ollama_used, false, 'beta sem OLLAMA_ENABLED deve ter ollama_used false');
    assert.ok(r.json.ollama_error?.includes('ollama_disabled_beta_fallback'), 'deve ter ollama_error ollama_disabled_beta_fallback');
    log('✓ publico ok — guardrails + protocolo + ollama_used false beta');

    // Teste 2: escopo privado nunca acessível nos endpoints públicos, mesmo com cookie TI.
    log('\n[2] RAG-SEG-001 — negação cliente/RH/Marcelo nos endpoints públicos');
    for (const rag_key of ['cliente', 'rh', 'marcelo']) {
      for (const endpoint of ['/api/ai/rag', '/api/ai/bot']) {
        const denied = await post(endpoint, { rag_key, query: 'Dados do escopo privado?' });
        assert.equal(denied.status, 403, `${endpoint} anonimo deve negar ${rag_key}`);
        assert.equal(denied.json?.error, 'scope_forbidden');
      }
    }
    for (const endpoint of ['/api/ai/rag', '/api/ai/bot', '/api/ai/bot-sessions']) {
      const denied = await get(endpoint, { Origin: BASE });
      assert.ok([401, 403].includes(denied.status), `${endpoint} não pode listar históricos anonimamente`);
    }
    if (!process.env.TEST_BASE_URL) {
      const login = await post('/api/admin/session', { token: QA_ADMIN_TOKEN });
      assert.equal(login.status, 200, 'sessão QA local deve autenticar');
      adminCookie = login.headers.get('set-cookie')?.split(';')[0];
      assert.ok(adminCookie, 'sessão deve emitir cookie HttpOnly');
      for (const endpoint of ['/api/admin/ai-rag-queries', '/api/admin/ai-bot-sessions']) {
        const denied = await post(endpoint, { rag_key: 'cliente', query: 'Dados do escopo cliente?' }, { Cookie: adminCookie });
        assert.equal(denied.status, 403, 'sem vínculo de tenant nem TI pode consultar cliente via RAG');
      }
    }
    log('✓ escopos privados negados antes da consulta ao banco; cliente bloqueado sem vínculo tenant');

    if (adminCookie) {
      // RAG-SEG-001: chunk de rascunho existe mas nunca pode entrar no prompt ou nas fontes.
      const marker = 'qa_draft_never_expose_2843';
      const draft = await post('/api/admin/ai-rag-documents', {
        rag_key: 'publico', title: 'QA draft visibility check',
        content: `Documento sintético confidencial não publicado: ${marker}. Não citar em resposta pública.`,
        source: 'qa_local', keywords: [marker],
      }, { Cookie: adminCookie });
      assert.equal(draft.status, 201, 'TI QA cria rascunho sintético');
      assert.equal(draft.json?.is_approved, false);
      assert.equal(draft.json?.is_published, false);
      for (const endpoint of ['/api/ai/rag', '/api/ai/bot']) {
        const probe = await post(endpoint, { rag_key: 'publico', query: `Existe ${marker} na base aprovada?` });
        assert.equal(probe.status, 201);
        assert.ok(!probe.json?.response?.includes(marker), `${endpoint} não pode citar rascunho`);
        assert.ok(!JSON.stringify(probe.json?.sources).includes(marker), `${endpoint} não pode retornar fonte rascunho`);
      }
      log('✓ chunk de rascunho não entra nas respostas/fontes públicas (2 endpoints)');
    }

    // Teste 3: somente TI QA consulta RH pela rota administrativa (não prova RBAC de RH).
    log('\n[3] RAG rh — diagnóstico TI em rota administrativa');
    if (adminCookie) {
      r = await post('/api/admin/ai-rag-queries', { rag_key: 'rh', query: 'Como funciona admissao e ferias?' }, { Cookie: adminCookie });
      assert.equal(r.status, 201);
      assert.ok(r.json.response?.includes('RH') || r.json.response?.includes('admissao') || r.json.response?.includes('férias'));
      assert.equal(r.json.rag_key, 'rh');
      rhProtocol = r.json.protocol;
      log('✓ RH diagnóstico TI; usuário RH ainda não homologado');
    } else log('BLOQUEADO: diagnóstico TI de RH sem conta QA externa');

    // Teste 4: somente TI QA consulta Marcelo pela rota administrativa.
    log('\n[4] RAG marcelo — diagnóstico TI em rota administrativa');
    if (adminCookie) {
      r = await post('/api/admin/ai-rag-queries', { rag_key: 'marcelo', query: 'Quais pendencias comerciais e operacionais?' }, { Cookie: adminCookie });
      assert.equal(r.status, 201);
      assert.ok(r.json.response?.includes('Administracao') || r.json.response?.includes('comercial') || r.json.response?.includes('operacional'));
      assert.equal(r.json.rag_key, 'marcelo');
      log('✓ Marcelo diagnóstico TI; usuário Marcelo ainda não homologado');
    } else log('BLOQUEADO: diagnóstico TI de Marcelo sem conta QA externa');

    // Teste 5: Bot com IA — modo com_ia padrão beta
    log('\n[5] Bot com_ia — default rag_key publico');
    r = await post('/api/ai/bot', { rag_key: 'publico', query: 'Como solicitar orcamento?' });
    log(`status=${r.status} protocol=${r.json?.protocol} mode=${r.json?.mode} ollama_used=${r.json?.ollama_used}`);
    assert.equal(r.status, 201);
    assert.equal(r.json.mode, 'com_ia', 'modo padrão deve ser com_ia beta');
    assert.ok(r.json.response?.includes('Ollama') || r.json.response?.includes('qwen3:1.7b'), 'resposta deve mencionar Ollama Qwen3 1.7B');
    assert.ok(r.json.queue_position >= 0);
    assert.equal(r.json.is_whatsapp_redirect, false);
    assert.ok(r.json.protocol?.startsWith('BOT-'));
    assert.ok(typeof r.json.ollama_used === 'boolean');
    log('✓ bot público com_ia ok — protocolo BOT- + queue + ollama_used');
    if (adminCookie) {
      const botTi = await post('/api/admin/ai-bot-sessions', { rag_key: 'rh', query: 'Como funciona admissao?' }, { Cookie: adminCookie });
      assert.equal(botTi.status, 201, 'TI QA pode diagnosticar bot RH em rota administrativa');
      assert.equal(botTi.json.rag_key, 'rh');
    }

    // Teste 6: autorização real em API do processo testado; nunca inferir seed de 403.
    log('\n[6] Bot modes — sem_ia/com_ia/whatsapp existem');
    const cfgDenied = await get('/api/ai-bot-config', { Origin: BASE });
    assert.equal(cfgDenied.status, 401, 'configuração sem sessão deve ser restrita');
    if (adminCookie) {
      const cfg = await get('/api/ai-bot-config', { Origin: BASE, Cookie: adminCookie });
      assert.equal(cfg.status, 200, 'TI QA pode consultar configuração');
      const payload = JSON.parse(cfg.text);
      assert.deepEqual(payload.modes.map(m => m.mode_key).sort(), ['com_ia', 'sem_ia', 'whatsapp']);
      assert.equal(payload.config?.singleton_id, 1);
      assert.equal(payload.config?.active_mode, 'com_ia');
      log('✓ bot modes seed, singleton e autorização confirmados via API local');
    } else {
      log('BLOQUEADO: seed de modos não verificada no servidor externo sem conta QA');
    }

    // Teste 7: Guardrails — sem R$ inventado
    log('\n[7] Guardrails — sem R$ inventado');
    r = await post('/api/ai/rag', { rag_key: 'publico', query: 'Quanto custa seguranca desarmada?' });
    assert.equal(r.status, 201);
    assert.ok(!r.json.response?.match(/R\$\s*\d+/) || r.json.response?.includes('[preço sob consulta]'), 'não deve conter R$ inventado');
    assert.equal(r.json.query?.is_invented_price, false);
    log('✓ guardrails ok — R$ removido, is_invented_* false');

    // Teste 8: Performance 5 req sequenciais <10s (valida serial queue fix)
    log('\n[8] Performance — 5 requisições sequenciais autorizadas (<15s em QA)');
    const startPerf = Date.now();
    const queries = [
      { rag_key: 'publico', query: 'Como solicitar contato?' },
      { rag_key: adminCookie ? 'rh' : 'publico', query: 'Como funciona admissao?' },
      { rag_key: 'publico', query: 'Quais servicos?' },
      { rag_key: adminCookie ? 'marcelo' : 'publico', query: 'Pendencias?' },
      { rag_key: 'publico', query: 'Teste bot?', path: '/api/ai/bot' },
    ];
    for (const q of queries) {
      const path = q.path || (q.rag_key === 'publico' ? '/api/ai/rag' : '/api/admin/ai-rag-queries');
      const body = { rag_key: q.rag_key, query: q.query };
      const res = await post(path, body, path.startsWith('/api/admin/') ? { Cookie: adminCookie } : {});
      assert.equal(res.status, 201, `${q.rag_key} deve ser 201 apenas na rota autorizada`);
    }
    const elapsed = Date.now() - startPerf;
    log(`5 req sequenciais em ${elapsed}ms`);
    assert.ok(elapsed < 15000, `5 req sequenciais devem ser <15s, foi ${elapsed}ms (antes lote53 era 82s)`);
    log('✓ performance ok — serial queue fix + silent logs');

    // Teste 9: Widgets RAG — páginas devem conter widget markers
    log('\n[9] Widgets RAG — páginas públicas contêm AiBotWidget e RagWidget markers');
    const pages = [
      { path: '/faq', marker: 'FAQ assistida' },
      { path: '/contato', marker: 'Assistente SEG System' },
      { path: '/servicos', marker: 'serviços' },
    ];
    for (const p of pages) {
      const res = await get(p.path);
      log(`${p.path} status=${res.status} contains marker? ${res.text.toLowerCase().includes(p.marker.toLowerCase())}`);
      assert.equal(res.status, 200, `${p.path} deve renderizar com status 200`);
      assert.ok(res.text.toLowerCase().includes(p.marker.toLowerCase()), `${p.path} deve conter ${p.marker}`);
    }
    log('✓ páginas públicas verificadas (FAQ/contato widgets; serviços título)');

    // Teste 10: Contato claro Av Armando Bei 305 presente em RAG publico
    log('\n[10] Contato claro — Av Armando Bei 305 em RAG publico');
    r = await post('/api/ai/rag', { rag_key: 'publico', query: 'Qual endereco e contato?' });
    assert.equal(r.status, 201);
    assert.ok(r.json.response?.includes('Armando Bei') || r.json.response?.includes('305') || r.json.response?.includes('3437-2217'), 'RAG publico deve conter contato claro');
    log('✓ contato claro ok');

    // Teste 11: Feedback RAG — curadoria base, avaliação, rollback (AI-09)
    log('\n[11] Feedback RAG — rating 1..5 + is_helpful');
    const protocolForFeedback = r.json.protocol || r.json.query?.protocol;
    let fb = await post('/api/ai/rag/feedback', { protocol: protocolForFeedback, rag_key: 'publico', rating: 5, feedback_text: 'Resposta útil com contato claro e serviços validados', is_helpful: true, origin: 'test_feedback' });
    log(`feedback status=${fb.status} protocol=${protocolForFeedback}`);
    assert.equal(fb.status, 201, 'feedback deve retornar 201');
    assert.ok(fb.json.feedback?.protocol === protocolForFeedback, 'feedback protocolo deve bater');
    assert.equal(fb.json.feedback?.rating, 5);
    assert.equal(fb.json.feedback?.is_helpful, true);
    const invented = await post('/api/ai/rag/feedback', { protocol: 'RAG-PUB-QA-NOT-FOUND', rag_key: 'publico', rating: 5 });
    assert.equal(invented.status, 404, 'feedback não pode criar protocolo órfão');
    if (rhProtocol) {
      const mismatch = await post('/api/ai/rag/feedback', { protocol: rhProtocol, rag_key: 'publico', rating: 5 });
      assert.equal(mismatch.status, 404, 'protocolo RH não pode receber feedback como público');
      const scoped = await post('/api/ai/rag/feedback', { protocol: rhProtocol, rag_key: 'rh', rating: 5 });
      assert.equal(scoped.status, 403, 'feedback RH não pode ser enviado por endpoint público');
    }
    log('✓ feedback válido; protocolo inventado e protocolo RH em rota pública negados');

    // Teste 12: custo/token via API autenticada no mesmo processo, sem abrir segundo PGlite.
    log('\n[12] Custo/token tracking — endpoint restrito e agregado via TI QA');
    const costDenied = await get('/api/ai/rag/cost', { Origin: BASE });
    assert.equal(costDenied.status, 401, 'custo sem sessão deve ser restrito');
    if (adminCookie) {
      const costRes = await get('/api/ai/rag/cost', { Origin: BASE, Cookie: adminCookie });
      assert.equal(costRes.status, 200, 'TI QA pode consultar custo');
      const cost = JSON.parse(costRes.text);
      log(`cost_tracking cnt=${cost.aggregates_24h?.total} avg_tokens=${cost.aggregates_24h?.avg_tokens}`);
      assert.equal(cost.aggregates_24h?.total, 14, '14 respostas RAG/bot devem produzir 14 registros de custo');
      assert.equal(cost.aggregates_24h?.real_count, 0, 'fallback beta não usa Ollama real');
      assert.ok(cost.items.length >= 14, 'listagem deve conter os registros da execução QA');
      log('✓ custo/token tracking 14/14 via API protegida');
    } else {
      log('BLOQUEADO: agregado de custo/token não validado no servidor externo sem conta QA');
    }

    log(process.env.TEST_BASE_URL
      ? '\n=== Testes HTTP RAG passaram; verificações diretas do banco externo BLOQUEADAS ==='
      : '\n=== Testes RAG locais passaram no PGlite isolado ===');
    log('Evidências: público permitido, cliente bloqueado sem tenant, RH/Marcelo somente TI QA, histórico público negado, widgets, feedback/custo; não comprova RBAC dos usuários finais, Ollama real, PostgreSQL ou homologação humana.');
  } finally {
    stopTestServer();
  }
}

if (process.env.RUN_DATABASE_INTEGRATION !== '1' && !process.env.TEST_BASE_URL) {
  log('Skip: defina RUN_DATABASE_INTEGRATION=1 e BASE URL ou rode com server em 3002');
  log('Exemplo: PORT=3002 node server.mjs & RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs');
  log('Ou: RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs (auto-start PGlite lite)');
  process.exit(0);
}

run().catch(e => {
  console.error('FAIL', e);
  stopTestServer();
  process.exit(1);
});

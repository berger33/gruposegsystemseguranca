import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E3/E4 — canonicalização da frente de IA legada (27/10/2026).
//
// E3: `AiBotWidget` (órfão) chamava POST /api/ai/bot, que o server.mjs já
// responde 410 `legacy_ai_retired` desde a migração para /api/ai/answer.
// E4: a API RAG legada ainda respondia `tenant_scope_not_implemented` (403)
// para rag_key='cliente' em três handlers, porque ALIASES de escrita como
// /api/ai/rag/feedback, /api/ai/bot-sessions e /api/ai-rag-queries não estavam
// na lista do bloqueio 410 — comportamento contraditório com a canônica, que
// isola por client_account_id/grants.
//
// Esta guarda lê o código diretamente (sem depender de geradores) e impede que
// um alias legado volte a ser alcançável ou que um componente volte a chamar
// um contrato retirado.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await readFile(path.join(root, 'server.mjs'), 'utf8');
const legacyApi = await readFile(path.join(root, 'src/server/ai-rag-api.mjs'), 'utf8');
const realApi = await readFile(path.join(root, 'src/server/ai-rag-real-api.mjs'), 'utf8');
const botWidget = await readFile(path.join(root, 'src/components/AiBotWidget.tsx'), 'utf8');
const ragWidget = await readFile(path.join(root, 'src/components/RagWidget.tsx'), 'utf8');

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(absolute));
    else if (/\.(tsx|ts|mjs|jsx|js)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}
// Comentários históricos citam os contratos retirados para explicar a
// migração; só o CÓDIGO executável pode ser considerado uma chamada real.
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const clientSources = await Promise.all(
  (await sourceFiles(path.join(root, 'src')))
    .filter(file => !file.includes(`${path.sep}server${path.sep}`))
    .map(async file => [path.relative(root, file), await readFile(file, 'utf8')]),
);

// Extrai o array literal do bloqueio 410 e as listas de paths despachados
// para os três handlers legados que possuem a negativa de escopo.
const retiredBlock = server.match(/if \(req\.method === "POST" && (\[[^\]]*\]\.includes\(url\.pathname\)\))/s)?.[1] ?? '';
const retired = [...retiredBlock.matchAll(/"(\/api\/[^"]+)"/g)].map(match => match[1]);
function dispatchedFor(handler) {
  const line = server.split('\n').find(text => text.includes(`aiRagApi.${handler}(req, res)`)) ?? '';
  return [...line.matchAll(/"(\/api\/[^"]+)"/g)].map(match => match[1]);
}
const handlers = ['handleQueries', 'handleFeedback', 'handleBotSessions'];
const legacyPaths = [...new Set(handlers.flatMap(dispatchedFor))];

// Contratos retirados que nenhum componente/cliente pode chamar.
const RETIRED_LITERALS = [
  '/api/ai/bot', '/api/public/ai/bot', '/api/bot', '/api/ai/bot-sessions',
  '/api/ai/rag', '/api/public/ai/rag', '/api/ai/rag/queries', '/api/ai/rag/feedback',
  '/api/public/ai/rag/feedback', '/api/admin/ai-rag-queries', '/api/ai-rag-queries',
  '/api/admin/ai-rag-feedback', '/api/admin/ai-bot-sessions',
];

test('E4: o bloqueio 410 cobre TODOS os aliases de escrita dos handlers legados', () => {
  assert.ok(retired.length >= 8, 'a lista de retirados precisa estar completa');
  const missing = legacyPaths.filter(item => !retired.includes(item));
  assert.deepEqual(missing, [],
    `aliases legados de escrita ainda alcançáveis (responderiam tenant_scope_not_implemented): ${missing.join(', ')}`);
  for (const alias of ['/api/ai/rag/feedback', '/api/public/ai/rag/feedback', '/api/admin/ai-rag-feedback',
    '/api/ai/bot-sessions', '/api/ai-rag-queries']) {
    assert.ok(retired.includes(alias), `${alias} precisa estar no bloqueio 410`);
  }
});

test('E4: o bloqueio é só para POST e a curadoria GET continua despachada', () => {
  assert.match(server, /if \(req\.method === "POST" && \[[\s\S]*?\]\.includes\(url\.pathname\)\)\s*\{\s*return json\(res, 410, \{ error: "legacy_ai_retired", canonical: "\/api\/ai\/answer" \}\);/);
  for (const handler of ['handleIndexes', 'handleDocuments', 'handleCostTracking', 'handleChunks']) {
    assert.ok(server.includes(`aiRagApi.${handler}(req, res)`), `curadoria ${handler} precisa continuar despachada`);
  }
  assert.ok(server.includes('aiRagDirectoryApi(req,res)'), 'fontes em pastas continuam despachadas');
  // Defesa em profundidade: os handlers legados mantêm a negativa, mas ela
  // deixou de ser alcançável pelo dispatch.
  const negations = legacyApi.match(/tenant_scope_not_implemented/g) || [];
  assert.ok(negations.length >= 3, 'os handlers legados precisam manter a negativa interna');
});

test('E4: a canônica continua despachada antes do bloqueio e isola por papel', () => {
  const canonical = server.indexOf('if (url.pathname === "/api/ai/answer") return aiRagRealApi.ask');
  const blockAt = server.indexOf('legacy_ai_retired');
  assert.ok(canonical >= 0 && blockAt > canonical, '/api/ai/answer precisa vir antes do bloqueio 410');
  assert.match(realApi, /client_session_required/);
  assert.match(realApi, /staff_session_required/);
  assert.match(realApi, /client_access_grants/);
  assert.match(realApi, /ollama_disabled/);
  assert.match(ragWidget, /\/api\/ai\/answer/);
});

test('E3: AiBotWidget virou alias de compatibilidade do RagWidget canônico', () => {
  assert.match(botWidget, /@deprecated/);
  assert.match(botWidget, /import RagWidget/);
  assert.match(botWidget, /<RagWidget/);
  assert.match(botWidget, /defaultRagKey/);
  const widgetCode = codeOnly(botWidget);
  for (const dead of ['/api/ai/bot', '/api/ai/rag/feedback', '/api/ai-bot-config', 'queue_position', 'whatsapp_number']) {
    assert.ok(!widgetCode.includes(dead), `o alias não pode manter o contrato morto ${dead}`);
  }
  assert.doesNotMatch(widgetCode, /:\s*any\b/);
  assert.match(botWidget, /indisponível nesta versão|indisponivel nesta versao/i,
    'escopo privado no widget legado continua sem ampliação');
});

test('E3/E4: nenhum código de cliente chama um endpoint de IA retirado', () => {
  const offenders = [];
  for (const [file, raw] of clientSources) {
    const source = codeOnly(raw);
    for (const literal of RETIRED_LITERALS) {
      if (source.includes(`"${literal}"`) || source.includes(`'${literal}'`) || source.includes(`\`${literal}\``)) {
        offenders.push(`${file} → ${literal}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `chamadas a contratos retirados: ${offenders.join(', ')}`);
});

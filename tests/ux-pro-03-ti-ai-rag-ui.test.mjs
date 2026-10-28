import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// UX-PRO-03 — prova focal da aba "Bases dos assistentes". Era a única aba do
// TiConsole (junto de "Aparência do site") sem nenhum teste que nomeasse o
// componente montado. Nenhuma funcionalidade é alterada aqui: o teste registra
// o contrato que já existe e passa a ser exigido pela guarda de reauditoria.
const component = await readFile(new URL('../src/app/admin/ti/AiRagClient.tsx', import.meta.url), 'utf8');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\\\//g, '/');

test('UX-PRO-03 bases RAG: aba real montada sob o gate ti/admin', () => {
  assert.match(consoleClient, /\['bases','Bases dos assistentes'\]/);
  assert.match(consoleClient, /active==='bases'&&<AiRagClient\/>/);
  assert.match(consoleClient, /const AiRagClient=dynamic\(\(\)=>import\('\.\/AiRagClient'\)\)/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(component, /<UiTaskWorkspace/);
});

test('UX-PRO-03 bases RAG: contratos vivos despachados e legados retirados (E3)', () => {
  const live = [
    '/api/admin/ai-rag-indexes',
    '/api/admin/ai-rag-documents',
    '/api/admin/session',
    '/api/admin/ai-bot-config',
    '/api/ai/answer',
  ];
  for (const endpoint of live) {
    assert.ok(component.includes(endpoint), `o componente precisa chamar ${endpoint}`);
    assert.ok(server.includes(endpoint), `server.mjs precisa despachar ${endpoint}`);
  }
  // E3: estes dois eram chamados por `testBot` e hoje respondem 410. O
  // componente NÃO pode mais chamá-los; o servidor continua citando-os apenas
  // na lista de retirados do bloqueio.
  for (const retired of ['/api/ai/bot', '/api/admin/ai-bot-sessions']) {
    assert.ok(!component.includes(`"${retired}"`), `o componente não pode chamar ${retired}`);
    assert.ok(server.includes(retired), `server.mjs precisa manter ${retired} no bloqueio 410`);
  }
  assert.match(component, /fontes \$\{fontes\}/);
  assert.match(component, /modelo \$\{data\.ollama_used/);
  assert.match(component, /motivo: /);
});

test('UX-PRO-03 bases RAG: escopos separados, publicação revisada e limites declarados', () => {
  for (const scope of ['publico', 'cliente', 'rh', 'marcelo']) {
    assert.ok(component.includes(`"${scope}"`) || component.includes(`'${scope}'`),
      `a área ${scope} precisa continuar declarada`);
  }
  // A base de cliente exige conta existente; a decisão de papel é lida da sessão.
  assert.match(component, /docForm\.rag_key==="cliente" &&/);
  assert.match(component, /aria-label="Conta do cliente"/);
  assert.match(component, /sessionRes\.role/);
  // Nada é publicado sem revisão explícita e o estado é anunciado.
  assert.match(component, /disabled=\{!reviewed\.includes\(doc\.id\)\}/);
  assert.match(component, /Revisei o conteúdo e a área de publicação\./);
  assert.match(component, /criado em rascunho\. Revise e publique antes de consultar/);
  assert.match(component, /role="status"/);
  assert.match(component, /fieldset disabled=\{operationBusy\}/);
  // Limite honesto: sem embedding, fila persistida ou custo/token calculado.
  assert.match(component, /não há embedding, fila persistida, custo\/token calculado/);
  assert.match(component, /Quando não há fonte, a resposta informa isso/);
  assert.match(consoleClient, /Configuração do Ollama e raízes físicas fica no ambiente do servidor/);
});

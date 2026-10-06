// UX-07 / EXT-08 — contrato anti-deriva entre o vocabulário e o servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ABSENT,
  KNOWLEDGE_ACCESS_ROLES,
  KNOWLEDGE_ERROR_MESSAGES,
  KNOWLEDGE_LIFECYCLE,
  describeKnowledgeError,
  honestCount,
  honestDate,
  knowledgeAccessRolesLabel,
  knowledgeCategoryLabel,
  knowledgeRoleLabel,
  knowledgeStatusLabel,
  knowledgeTagLabel,
} from '../src/lib/knowledge-vocabulary.mjs';

const server = await readFile(new URL('../src/server/ext-knowledge-api.mjs', import.meta.url), 'utf8');
const migration = await readFile(new URL('../db/migrations/086-ext07-08-09-10-11-12-compliance-conhecimento-expansao-continuidade-analytics-editor.sql', import.meta.url), 'utf8');

function serverErrorCodes(text) {
  const found = new Set();
  for (const match of text.matchAll(/error\s*:\s*([^}\n;]{1,240})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/gi)) found.add(literal[1]);
  }
  return found;
}

const errorCodes = serverErrorCodes(server);

test('UX-07 conhecimento: todos os códigos literais do servidor têm tradução', () => {
  assert.ok(errorCodes.size >= 25, `esperava ao menos 25 códigos, recebi ${errorCodes.size}`);
  for (const code of errorCodes) {
    assert.ok(KNOWLEDGE_ERROR_MESSAGES[code], `faltou descrever ${code}`);
    const description = describeKnowledgeError(code, 500);
    assert.notEqual(description.title, code);
    assert.equal(description.code, code);
  }
});

test('UX-07 conhecimento: ciclo e papéis canônicos seguem o contrato EXT-08', () => {
  assert.deepEqual(KNOWLEDGE_LIFECYCLE, ['rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado']);
  assert.deepEqual(KNOWLEDGE_ACCESS_ROLES, ['admin', 'ti', 'marcelo', 'rh', 'operacao', 'supervisor', 'comercial', 'financeiro']);
  for (const code of KNOWLEDGE_LIFECYCLE) assert.notEqual(knowledgeStatusLabel(code), code);
  for (const code of KNOWLEDGE_ACCESS_ROLES) assert.notEqual(knowledgeRoleLabel(code), code);
  assert.match(server, /const STAFF_ROLES = \["admin", "ti", "marcelo", "rh", "operacao", "supervisor", "comercial", "financeiro"\]/);
  assert.match(server, /rascunho: \["em_revisao"\]/);
  assert.match(server, /arquivado: \["rascunho"\]/);
});

test('UX-07 conhecimento: categoria e tag respeitam os campos TEXT abertos reais', () => {
  assert.match(migration, /category TEXT NOT NULL CHECK \(char_length\(category\) BETWEEN 3 AND 100\)/);
  assert.match(migration, /tags TEXT\[\] NOT NULL DEFAULT '\{\}'/);
  assert.equal(knowledgeCategoryLabel('seguranca'), 'Segurança');
  assert.equal(knowledgeCategoryLabel('categoria_nova'), 'categoria_nova', 'categoria não-enumerada passa crua');
  assert.equal(knowledgeTagLabel('etiqueta-nova'), 'etiqueta-nova', 'tag é dado livre e passa crua');
  assert.equal(knowledgeAccessRolesLabel([]), 'Todos os papéis de equipe');
});

test('UX-07 conhecimento: desconhecido passa cru e ausência nunca vira zero ou data inicial', () => {
  const unknown = describeKnowledgeError('codigo_novo_do_servidor', 422);
  assert.equal(unknown.code, 'codigo_novo_do_servidor');
  assert.equal(knowledgeStatusLabel('estado_novo'), 'estado_novo');
  assert.equal(knowledgeRoleLabel('papel_novo'), 'papel_novo');
  assert.equal(knowledgeCategoryLabel(null), ABSENT);
  assert.equal(honestCount(null), ABSENT);
  assert.equal(honestDate(null), ABSENT);
  assert.notEqual(honestDate(null), '01/01/1970');
});

test('UX-07 conhecimento: a superfície não usa style inline e declara tabs e UiState', async () => {
  const workspace = await readFile(new URL('../src/app/admin/conhecimento/KnowledgeWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(workspace, /style\s*=\s*\{/);
  assert.match(workspace, /UiState/);
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /ArrowRight/);
  assert.match(workspace, /ArrowLeft/);
  assert.match(workspace, /Menu não é autorização/);
});

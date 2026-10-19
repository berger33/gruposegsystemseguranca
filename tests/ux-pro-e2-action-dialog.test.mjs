// UX-PRO-E2 — contrato focal dos formulários de decisão humana no legado operacional.
// Prova estática: os dois consumidores não voltam a usar prompt/confirm; as onze ações
// montam o diálogo compartilhado; o componente preserva nome, descrição, validação,
// anúncio de erro, estado ocupado, cancelamento e foco inicial.
// Não prova leitor de tela, UAT, funcionamento do servidor ou conformidade WCAG.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const advanced2Path = path.join(root, 'src/app/admin/ti/OpsAdvanced2Client.tsx');
const advanced3Path = path.join(root, 'src/app/admin/ti/OpsAdvanced3Client.tsx');
const dialogPath = path.join(root, 'src/components/ui/UiActionDialog.tsx');

const read = file => readFile(file, 'utf8');

function calls(source, expression) {
  return [...source.matchAll(expression)].length;
}

test('UX-PRO-E2: onze decisões operacionais usam o diálogo controlado sem prompt/confirm', async () => {
  const [advanced2, advanced3] = await Promise.all([read(advanced2Path), read(advanced3Path)]);
  const consumers = `${advanced2}\n${advanced3}`;

  assert.doesNotMatch(consumers, /\b(?:window\.)?(?:prompt|confirm)\s*\(/, 'prompt/confirm não pode voltar aos consumidores E2');
  assert.equal(calls(advanced2, /setActionDialog\s*\(\s*\{/g), 6, 'OPS-09/10/12 mantém seis ações migradas');
  assert.equal(calls(advanced3, /setActionDialog\s*\(\s*\{/g), 5, 'OPS-14/16 mantém cinco ações migradas');
  assert.equal(calls(consumers, /<UiActionDialog\b/g), 2, 'cada consumidor monta uma instância compartilhada');

  for (const payloadField of [
    'verified_by', 'verification_notes', 'reviewed_by', 'privacy_reviewed_by',
    'privacy_review_notes', 'approved_by', 'acknowledged_by', 'treatment_notes', 'closed_by',
  ]) {
    assert.match(consumers, new RegExp(`name:\\"${payloadField}\\"`), `campo ${payloadField} permanece rotulado no formulário`);
  }
  assert.match(consumers, /motives:\"Publicação confirmada após revisão humana dos conflitos\"/, 'motivo canônico de publicação foi preservado');
  assert.match(consumers, /treatment_notes:\"Tratamento sintético concluído sem despacho externo\"/, 'nota canônica de encerramento foi preservada');
});

test('UX-PRO-E2: diálogo compartilhado expõe nome, ajuda, foco, validação e estados', async () => {
  const dialog = await read(dialogPath);

  assert.match(dialog, /<dialog\b/, 'usa semântica nativa de diálogo modal');
  assert.match(dialog, /aria-labelledby=\{titleId\}/, 'diálogo recebe nome acessível');
  assert.match(dialog, /aria-describedby=/, 'descrição e erro são associados ao diálogo');
  assert.match(dialog, /querySelector<HTMLElement>\(\"input, textarea\"\)\?\.focus\(\)/, 'foco inicial é dirigido ao primeiro campo');
  assert.match(dialog, /onCancel=/, 'Escape possui tratamento explícito');
  assert.match(dialog, /role=\"alert\"/, 'falha de validação ou API é anunciada');
  assert.match(dialog, /aria-busy=\{busy\}/, 'envio comunica estado ocupado');
  assert.match(dialog, /field\.required && !normalized\[field\.name\]/, 'campos obrigatórios são validados após normalização');
  assert.match(dialog, /type=\"button\" onClick=\{cancel\}/, 'cancelamento não submete o formulário');
  assert.match(dialog, /type=\"submit\" disabled=\{busy\}/, 'submissão duplicada é bloqueada');
});

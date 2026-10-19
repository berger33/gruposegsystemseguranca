// UX-PRO-E2-C1 — contrato focal dos rótulos persistentes nas seis abas legadas
// de /admin/operacao (OpsAdvanced2Client e OpsAdvanced3Client).
//
// Prova estática: todo input/select/textarea dos formulários de cadastro tem
// id único, <label for> associado e legenda visível — nenhum campo depende
// apenas de placeholder. As guardas preservam o contrato da E2 (sem
// prompt/confirm, onze decisões no UiActionDialog) e os endpoints consumidos
// pelos formulários.
// Não prova leitor de tela, renderização em navegador, servidor, UAT ou
// conformidade WCAG.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const abs = file => path.join(root, file);
const sources = {
  advanced2: abs('src/app/admin/ti/OpsAdvanced2Client.tsx'),
  advanced3: abs('src/app/admin/ti/OpsAdvanced3Client.tsx'),
};
const workspacePath = abs('src/app/admin/operacao/OperacaoWorkspace.tsx');

const read = file => readFile(file, 'utf8');

// Uma tag de controle pode conter `=>` dentro de expressões de atributo
// (onChange={e=>…}); o fim da tag é o único `>` que não fecha uma seta.
const CONTROL_TAG = /<(input|select|textarea)\b((?:=>|[^>])*)>/g;
const ID_ATTR = /(?:^|\s)id="([^"]+)"/;
const PLACEHOLDER_ATTR = /\bplaceholder=/;

function controlsOf(source) {
  const found = [];
  for (const match of source.matchAll(CONTROL_TAG)) {
    const line = source.slice(0, match.index).split('\n').length;
    const attrs = match[2];
    const id = attrs.match(ID_ATTR)?.[1] ?? null;
    found.push({
      tag: match[1],
      line,
      id,
      hasPlaceholder: PLACEHOLDER_ATTR.test(attrs),
    });
  }
  return found;
}

function labelAssociationFailures(source, controls) {
  const failures = [];
  for (const control of controls) {
    if (!control.id) {
      failures.push(`${control.tag} sem id (linha ${control.line}) — o campo depende apenas de placeholder ou do valor da opção`);
      continue;
    }
    if (!source.includes(`htmlFor="${control.id}"`)) {
      failures.push(`${control.tag}#${control.id} (linha ${control.line}) sem <label htmlFor="${control.id}">`);
    }
  }
  return failures;
}

test('UX-PRO-E2-C1: todo campo das abas legadas tem rótulo associado, nunca só placeholder', async () => {
  const allFailures = [];
  for (const [name, file] of Object.entries(sources)) {
    const source = await read(file);
    const controls = controlsOf(source);
    assert.ok(controls.length >= 40, `${file}: a varredura precisa encontrar os controles legados (encontrou ${controls.length})`);

    allFailures.push(...labelAssociationFailures(source, controls).map(text => `${file}: ${text}`));

    const ids = controls.map(control => control.id).filter(Boolean);
    const duplicated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicated, [], `ids duplicados em ${file}: ${duplicated.join(', ')}`);

    // Legenda visível: um <span className={styles.caption}> por controle,
    // com texto não vazio (rótulo persistente para quem enxerga).
    const captions = [...source.matchAll(/<span className=\{styles\.caption\}>([^<]+)<\/span>/g)].map(match => match[1].trim());
    if (captions.length !== controls.length) {
      allFailures.push(`${file}: legendas visíveis (styles.caption) — ${captions.length} legendas para ${controls.length} controles`);
    }
    if (!captions.every(text => text.length > 0)) {
      allFailures.push(`${file}: legenda visível vazia`);
    }
  }

  if (allFailures.length > 0) {
    assert.fail(`UX-PRO-E2-C1: ${allFailures.length} campo(s) sem rótulo associado nas abas legadas:\n${allFailures.join('\n')}`);
  }

  // Amostra canônica de rótulos: nome em português persistente, sem jargão de coluna.
  const advanced2 = await read(sources.advanced2);
  const advanced3 = await read(sources.advanced3);
  for (const [label, file] of [
    ['Data agendada', advanced2], ['Tipo de inspeção', advanced2],
    ['Prioridade', advanced2], ['Latitude', advanced2], ['Tipo de movimento', advanced2],
    ['Conteúdo do relatório', advanced2],
    ['Fórmula de cálculo', advanced3], ['Janela de apuração', advanced3],
    ['Motivo da incompletude', advanced3], ['Data e hora da ocorrência', advanced3],
    ['Tipo de conector', advanced3],
  ]) {
    assert.ok(file.includes(`>${label}</span>`), `rótulo canônico ausente: “${label}”`);
  }
});

test('UX-PRO-E2-C1: a legenda do aviso legado de /admin/operacao continua honesta', async () => {
  const workspace = await read(workspacePath);
  assert.doesNotMatch(workspace, /sem rótulo associado em todo campo/,
    'o aviso não pode continuar afirmando ausência de rótulos depois da correção');
  assert.match(workspace, /rótulo associado em cada campo/,
    'o aviso precisa declarar o estado real: rótulo associado em cada campo');
});

test('UX-PRO-E2-C1: a correção preservou os contratos da E2 e os endpoints dos formulários', async () => {
  const [advanced2, advanced3] = await Promise.all([read(sources.advanced2), read(sources.advanced3)]);
  const consumers = `${advanced2}\n${advanced3}`;

  assert.doesNotMatch(consumers, /\b(?:window\.)?(?:prompt|confirm)\s*\(/,
    'prompt/confirm não pode voltar aos consumidores das abas legadas');
  const actions = (advanced2.match(/setActionDialog\s*\(\s*\{/g) || []).length;
  const actions3 = (advanced3.match(/setActionDialog\s*\(\s*\{/g) || []).length;
  assert.equal(actions, 6, 'OPS-09/10/12 mantém seis ações migradas na E2');
  assert.equal(actions3, 5, 'OPS-14/16 mantém cinco ações migradas na E2');

  const endpoints = source => [...new Set([...source.matchAll(/\/api\/hr\/ops-[a-z0-9-]+(?:\?[a-z0-9_=]+)?/g)].map(match => match[0]))].sort();
  assert.deepEqual(endpoints(advanced2), [
    '/api/hr/ops-client-reports',
    '/api/hr/ops-key-movements',
    '/api/hr/ops-key-movements?key_id=',
    '/api/hr/ops-keys',
    '/api/hr/ops-patrol-points',
    '/api/hr/ops-patrol-points?patrol_id=',
    '/api/hr/ops-patrols',
    '/api/hr/ops-supervision-action-plans',
    '/api/hr/ops-supervision-inspections',
    '/api/hr/ops-supervision-inspections?visit_id=',
    '/api/hr/ops-supervision-visits',
  ], 'endpoints de OPS-09/10/11/12 permanecem exatamente os mesmos');
  assert.deepEqual(endpoints(advanced3), [
    '/api/hr/ops-assisted-conflicts?proposal_id=',
    '/api/hr/ops-assisted-entries',
    '/api/hr/ops-assisted-entries?proposal_id=',
    '/api/hr/ops-assisted-proposals',
    '/api/hr/ops-cleaning-environments',
    '/api/hr/ops-cleaning-executions',
    '/api/hr/ops-cleaning-executions?routine_id=',
    '/api/hr/ops-cleaning-nonconformities',
    '/api/hr/ops-cleaning-nonconformities?execution_id=',
    '/api/hr/ops-cleaning-routines',
    '/api/hr/ops-cleaning-routines?environment_id=',
    '/api/hr/ops-metrics-definitions',
    '/api/hr/ops-metrics-reincidence',
    '/api/hr/ops-metrics-snapshots',
    '/api/hr/ops-monitoring-connectors',
    '/api/hr/ops-monitoring-events',
  ], 'endpoints de OPS-13/14/15/16 permanecem exatamente os mesmos');
});

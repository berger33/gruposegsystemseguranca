// UX-PRO-E2-C1 — contrato focal dos rótulos persistentes no legado operacional.
// Prova estática: todo controle de formulário (input/select/textarea) dos
// formulários de OpsAdvanced2Client.tsx e OpsAdvanced3Client.tsx possui id único
// e <label htmlFor> com texto visível; nenhuma associação órfã; os controles
// preservam vínculos controlados, contagens e dicas de placeholder (a fatia não
// apaga campos nem dicas para passar no teste).
// Não prova leitor de tela, UAT, funcionamento do servidor ou conformidade WCAG.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  { path: path.join(root, 'src/app/admin/ti/OpsAdvanced2Client.tsx'), name: 'OpsAdvanced2Client.tsx', controls: 47, placeholders: 36 },
  { path: path.join(root, 'src/app/admin/ti/OpsAdvanced3Client.tsx'), name: 'OpsAdvanced3Client.tsx', controls: 61, placeholders: 38 },
];

const read = file => readFile(file, 'utf8');

// Cada controle destes arquivos ocupa uma linha própria (padrão do legado).
function scanControls(source) {
  const found = [];
  source.split('\n').forEach((line, index) => {
    const tag = line.match(/<(input|select|textarea)\b/);
    if (!tag) return;
    const id = line.match(/\bid="([^"]+)"/);
    const placeholder = line.match(/\bplaceholder="([^"]*)"/);
    found.push({
      line: index + 1,
      kind: tag[1],
      snippet: line.trim().replace(/\s+/g, ' ').slice(0, 120),
      id: id ? id[1] : null,
      placeholder: placeholder ? placeholder[1] : null,
      controlled: /value=\{/.test(line) && /onChange=\{/.test(line),
    });
  });
  return found;
}

function scanLabels(source) {
  const map = new Map();
  for (const match of source.matchAll(/<label htmlFor="([^"]+)">([^<]*)<\/label>/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

test('UX-PRO-E2-C1: todo controle do legado operacional tem rótulo persistente', async () => {
  const offenders = [];
  for (const file of files) {
    const source = await read(file.path);
    const controls = scanControls(source);
    const labels = scanLabels(source);
    for (const control of controls) {
      const texto = control.id ? labels.get(control.id) : undefined;
      if (!control.id || texto === undefined || texto === '') {
        offenders.push(
          `${file.name}:${control.line} — <${control.kind}${control.placeholder ? ` placeholder="${control.placeholder}"` : ''}>` +
          ` sem <label htmlFor> associado — o controle deve ter id único e rótulo persistente com texto visível`
        );
      }
    }
  }
  assert.equal(
    offenders.length,
    0,
    `UX-PRO-E2-C1: ${offenders.length} controle(s) sem <label htmlFor> associado:\n${offenders.join('\n')}`
  );
});

test('UX-PRO-E2-C1: associações sem órfãos, ids únicos e contratos de campo preservados', async () => {
  for (const file of files) {
    const source = await read(file.path);
    const controls = scanControls(source);
    const labels = scanLabels(source);

    assert.equal(controls.length, file.controls, `${file.name}: a fatia não pode apagar nem inventar controles (${controls.length}/${file.controls})`);

    // A varredura acima é por linha (padrão do legado): cada linha pode declarar
    // no máximo um controle. Se dois controles forem escritos na mesma linha, um
    // deles escaparia da checagem de rótulo; esta contagem global garante que
    // todo <input>/<select>/<textarea> do arquivo foi efetivamente verificado.
    const tagsNoArquivo = (source.match(/<(input|select|textarea)\b/g) || []).length;
    assert.equal(
      tagsNoArquivo,
      controls.length,
      `${file.name}: ${tagsNoArquivo - controls.length} controle(s) fora da varredura por linha (tag multilinha?) — mantenha um controle por linha para que a checagem de rótulo o alcance`
    );

    const ids = controls.map(control => control.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${file.name}: ids de controle duplicados`);
    for (const control of controls) {
      assert.ok(control.controlled, `${file.name}:${control.line} — controle deixou de ser controlado (value/onChange)`);
    }

    const orfaos = [...labels.keys()].filter(id => !ids.includes(id));
    assert.deepEqual(orfaos, [], `${file.name}: <label htmlFor> órfão(s): ${orfaos.join(', ')}`);

    // Um único rótulo por controle: o Map acima colapsaria dois <label> para o
    // mesmo id, então a contagem bruta confirma que não há rótulo duplicado
    // criando ambiguidade de nome acessível.
    const labelsNoArquivo = (source.match(/<label htmlFor=/g) || []).length;
    assert.equal(
      labelsNoArquivo,
      controls.length,
      `${file.name}: ${labelsNoArquivo} <label htmlFor> para ${controls.length} controle(s) — cada controle deve ter exatamente um rótulo`
    );

    const placeholders = source.match(/placeholder=/g) || [];
    assert.equal(placeholders.length, file.placeholders, `${file.name}: dicas de placeholder devem ser preservadas (${placeholders.length}/${file.placeholders})`);
  }
});

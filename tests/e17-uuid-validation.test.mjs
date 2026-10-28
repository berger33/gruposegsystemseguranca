import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E17 — validação de UUID quebrada em vários módulos do servidor.
//
// Em 27/10 a promoção de PLT-18 descobriu que `maintenance-doc-api.mjs` usava
// `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (8-4-4-12, sem o
// 4º grupo) e recusava TODO uuid real com 400 invalid_id. A correção foi
// pontual; a auditoria completa encontrou o MESMO erro em 8 linhas de 7
// módulos. Esta guarda varre src/ e scripts/ inteiros e impede que a classe
// inteira de defeito reapareça — inclusive em arquivos novos.
//
// Formatos aceitos:
//   8-4-4-4-12            → 3 grupos de 4  (UUID canônico)
//   8-4-[1-5]...[89ab]... → 1 grupo de 4  (RFC 4122, intencionalmente estrito)
// Formato proibido:
//   8-4-4-12              → 2 grupos de 4  (aceita lixo, recusa UUID real)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CANONICAL = '545b403b-5838-43c3-9cb1-12f67117cc11';
const CANONICAL_UPPER = CANONICAL.toUpperCase();
const BROKEN_SHAPE = '545b403b-5838-43c3-12f67117cc11'; // 8-4-4-12: só a regex quebrada aceita
const REJECT = [
  BROKEN_SHAPE,
  'not-a-uuid',
  '545b403b583843c39cb112f67117cc11',
  '545b403b-5838-43c3-9cb1',
  'zzzzzzzz-5838-43c3-9cb1-12f67117cc11',
  '',
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
      out.push(...await walk(path.join(dir, entry.name)));
    } else if (/\.(mjs|ts|tsx|js)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = [...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'scripts'))];
const found = [];
for (const absolute of files) {
  const file = path.relative(root, absolute).replaceAll('\\', '/');
  const source = await readFile(absolute, 'utf8');
  source.split('\n').forEach((line, index) => {
    if (!/\[0-9a-f\]\{8\}-/.test(line)) return;
    const literal = line.match(/\/(\^\[0-9a-f]\{8\}[^/]*)\/([a-z]*)/);
    if (!literal) {
      found.push({ file, line: index + 1, shape: 'unparsed', source: line.trim(), regex: null });
      return;
    }
    const groups = (literal[1].match(/\[0-9a-f]\{4\}/g) || []).length;
    const rfc = /\[1-5\]/.test(literal[1]) && /\[89ab\]/.test(literal[1]);
    const shape = !literal[1].includes('[0-9a-f]{12}') ? 'unknown'
      : groups === 3 ? 'canonical'
        : groups === 2 ? 'broken'
          : rfc ? 'rfc4122' : 'unknown';
    let regex = null;
    try { regex = new RegExp(literal[1], literal[2]); } catch { /* shape fica unknown */ }
    found.push({ file, line: index + 1, shape, source: line.trim(), regex });
  });
}

const broken = found.filter(item => item.shape === 'broken');
const unknown = found.filter(item => item.shape === 'unknown' || item.shape === 'unparsed');

test('E17: nenhum arquivo de src/ ou scripts/ usa a regex de UUID 8-4-4-12', () => {
  assert.deepEqual(broken.map(item => `${item.file}:${item.line}`), [],
    `regex(es) quebrada(s):\n${broken.map(item => `  ${item.file}:${item.line}  ${item.source}`).join('\n')}`);
  assert.deepEqual(unknown.map(item => `${item.file}:${item.line}`), [],
    'toda validação de UUID precisa estar em formato reconhecido');
});

test('E17: toda regex auditada aceita UUID real e rejeita formatos inválidos', () => {
  assert.ok(found.length > 0, 'a varredura precisa encontrar validações de UUID');
  for (const item of found) {
    assert.ok(item.regex, `${item.file}:${item.line} não produziu RegExp válida`);
    assert.ok(item.regex.test(CANONICAL), `${item.file}:${item.line} recusa um UUID canônico válido`);
    assert.ok(item.regex.test(CANONICAL_UPPER), `${item.file}:${item.line} não aceita maiúsculas (flag i)`);
    for (const invalid of REJECT) {
      assert.ok(!item.regex.test(invalid),
        `${item.file}:${item.line} aceita indevidamente "${invalid}"`);
    }
  }
});

test('E17: os sete módulos corrigidos mantêm validação canônica (não foi apagada)', () => {
  const expected = [
    'src/server/budget-api.mjs', 'src/server/contract-details-api.mjs',
    'src/server/env-api.mjs', 'src/server/hr-advanced-api.mjs',
    'src/server/lgpd-request-api.mjs', 'src/server/observability-api.mjs',
    'src/server/privacy-api.mjs',
  ];
  for (const file of expected) {
    const entries = found.filter(item => item.file === file);
    assert.ok(entries.length > 0, `${file} precisa continuar validando UUID`);
    assert.ok(entries.every(item => item.shape === 'canonical'),
      `${file} ainda tem validação não canônica: ${entries.map(item => `${item.line}:${item.shape}`).join(', ')}`);
  }
});

test('E17: a varredura cobre src/ e scripts/ e congela a contagem mínima', () => {
  assert.ok(files.length >= 500, `esperados ao menos 500 arquivos varridos, vieram ${files.length}`);
  assert.ok(found.length >= 100,
    `esperadas ao menos 100 validações de UUID, encontradas ${found.length}`);
  assert.ok(found.every(item => ['canonical', 'rfc4122'].includes(item.shape)),
    'nenhuma entrada pode ficar sem classificação');
});

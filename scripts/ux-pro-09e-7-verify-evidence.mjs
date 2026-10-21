import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const evidenceRoot = path.join(root, 'docs/UX-PRO-09E-7-evidencias-2026-10-21');
const baseMain = '0637cd63e25b0a92ec1d05d4f69b76a7574138ce';
const routes = [
  ['/', 'home'], ['/contato', 'contato'], ['/conteudos', 'conteudos'],
  ['/conteudos/diagnostico-sem-conteudo', 'conteudo-dinamico'], ['/faq', 'faq'],
  ['/orcamento', 'orcamento'], ['/pacotes', 'pacotes'], ['/privacidade', 'privacidade'],
  ['/proposta/aceite/diagnostico-token-invalido', 'aceite-token-sintetico-invalido'],
  ['/segmentos', 'segmentos'], ['/segmentos/condominio', 'segmento-condominio'],
  ['/servicos', 'servicos'], ['/servicos/Segurança%20Desarmada', 'servico-seguranca-desarmada'],
  ['/simulador', 'simulador'],
];
const viewportNames = ['w320-day', 'w320-night', 'w390-day', 'w390-night', 'w768-day', 'w768-night', 'w1440-day', 'w1440-night'];
const entries = [];
for (const [route, slug] of routes) {
  const file = path.join(evidenceRoot, slug, 'resumo.json');
  assert.ok(existsSync(file), `resumo ausente: ${path.relative(root, file)}`);
  const summary = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(summary.stage, 'ux-pro-09e-7', `stage inesperado em ${slug}`);
  assert.equal(summary.route, route, `rota inesperada em ${slug}`);
  assert.equal(summary.entries.length, 8, `contagem de viewports em ${slug}`);
  for (const entry of summary.entries) {
    assert.equal(entry.textOverflowProbed, true, `probe ausente em ${entry.route} ${entry.viewport}`);
    assert.ok(Array.isArray(entry.textOverflowCandidates), `resultado ausente em ${entry.route} ${entry.viewport}`);
    assert.equal(entry.navigationStatus, 200, `status HTTP inesperado em ${entry.route} ${entry.viewport}`);
    entries.push(entry);
  }
}
assert.equal(entries.length, 112, 'a cobertura precisa conter 14 rotas × 8 viewports');
assert.equal(new Set(entries.map(entry => `${entry.route}:${entry.viewport}:${entry.requestedTheme}`)).size, 112,
  'não pode haver captura repetida ou viewport ausente');
assert.deepEqual([...new Set(entries.map(entry => entry.requestedTheme))].sort(), ['day', 'night'],
  'as duas preferências de cor precisam estar representadas');
assert.deepEqual([...new Set(entries.map(entry => entry.viewport))].sort(),
  ['1440x900', '320x780', '390x844', '768x1024'], 'viewports medidos inesperados');

const files = [];
for (const entry of entries) {
  const absolute = path.resolve(root, entry.screenshot);
  assert.ok(absolute.startsWith(`${evidenceRoot}${path.sep}`), `screenshot fora da pasta isolada: ${entry.screenshot}`);
  const bytes = readFileSync(absolute);
  assert.ok(bytes.length >= 24 && bytes.subarray(1, 4).toString('ascii') === 'PNG', `PNG inválido: ${entry.screenshot}`);
  files.push({
    file: path.relative(root, absolute).replaceAll(path.sep, '/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });
}
assert.equal(files.length, 112);
const manifest = { stage: 'ux-pro-09e-7', baseMain, screenshots: files };
const manifestFile = path.join(evidenceRoot, 'integridade.json');
if (process.argv.includes('--write')) {
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
} else {
  assert.ok(existsSync(manifestFile), 'manifesto integridade.json ausente');
  const existing = JSON.parse(readFileSync(manifestFile, 'utf8'));
  assert.deepEqual(existing, manifest, 'hash, dimensões ou conjunto de screenshots não confere');
}

const textCandidates = entries.reduce((sum, entry) => sum + entry.textOverflowCandidates.length, 0);
const documentOverflows = entries.filter(entry => entry.problems.some(problem => problem.startsWith('rolagem horizontal do documento'))).length;
console.log(JSON.stringify({ stage: manifest.stage, baseMain, routes: routes.length, captures: entries.length, screenshots: files.length, probes: entries.filter(entry => entry.textOverflowProbed).length, textCandidates, documentOverflows, manifest: path.relative(root, manifestFile) }, null, 2));

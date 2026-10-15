// Consistência da medição versionada, não substitui os gates de negócio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { measurementPlan } from '../scripts/ux-pro-08d-measurements.mjs';
import { hasKeyboardTraversal } from '../scripts/ux-pro-00-keyboard-evidence.mjs';

const root = new URL('../', import.meta.url);
const json = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));

test('08D: plano limitado a quatro rotas staff × três larguras noturnas faltantes', () => {
  assert.equal(measurementPlan.targets.length, 4);
  assert.equal(measurementPlan.viewports.length, 3);
  assert.deepEqual([...new Set(measurementPlan.viewports.map(v => v.width))], [320, 390, 1440]);
  assert.deepEqual([...new Set(measurementPlan.viewports.map(v => v.theme))], ['escuro']);
  assert.ok(measurementPlan.targets.every(t => !t.route.startsWith('/api/') && t.route !== '/'));
});

for (const directory of [...new Set(measurementPlan.targets.map(t => t.outputDir))]) {
  test(`08D: matriz, PNGs e teclado honestos em ${directory}`, async () => {
    const summary = await json(`${directory}/resumo.json`);
    assert.ok(['8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5', '3d807a420db6c63c3f754ae02144053e29da1469'].includes(summary.measurements08d.baseMain));
    const entries = summary.entries.filter(e => e.stage === 'ux-pro-08d');
    const targets = measurementPlan.targets.filter(t => t.outputDir === directory);
    assert.equal(entries.length, targets.length * 3);
    assert.equal(new Set(entries.map(e => e.screenshot)).size, entries.length);
    for (const target of targets) for (const viewport of measurementPlan.viewports) {
      const matching = entries.filter(e => e.route === target.route && e.viewport === `${viewport.width}x${viewport.height}` && e.theme.requested === viewport.theme);
      assert.equal(matching.length, 1, `${target.route}/${viewport.name}`);
      const entry = matching[0];
      assert.equal(entry.theme.actual, viewport.theme);
      if (target.route.startsWith('/admin/')) assert.equal(entry.theme.adminTheme, viewport.theme === 'escuro' ? 'night' : 'day');
      const png = await readFile(new URL(entry.screenshot, root));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), viewport.width);
      assert.equal(png.readUInt32BE(20), viewport.height);
      assert.ok(entry.keyboardSteps.length >= 3);
      assert.ok(entry.keyboardActions.length > 0);
      assert.equal(hasKeyboardTraversal(entry), entry.keyboardProblems.length === 0, 'não creditar foco falho como percurso validado');
      if (hasKeyboardTraversal(entry)) assert.ok(entry.keyboardSteps.every(s => s.fullyVisible && s.focusVisible));
      // Resíduos não somem nem se tornam sucesso por contagem de PNGs.
      assert.ok(Array.isArray(entry.problems));
      assert.ok(Array.isArray(entry.externalBlocked));
    }
  });
}

test('08D: complemento preserva a contagem histórica reconciliada pela #247', async () => {
  const directory = 'docs/ux-pro-08-assistentes-evidencias';
  const summary = await json(`${directory}/resumo.json`);
  const previous = (await readdir(new URL(`${directory}/`, root))).filter(f => f.endsWith('.png') && !f.startsWith('08d-'));
  assert.equal(previous.length, 29);
  assert.match(summary.reconciliacaoContagem08b, /12 arquivos/);
  assert.match(summary.reconciliacaoContagem08b, /13 arquivos/);
});

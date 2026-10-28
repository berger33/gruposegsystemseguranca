import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// E9 — flakiness. Em 27/10/2026 o cenário "ID3: reclamações restritas" falhou
// 1× no gate completo com "o protocolo precisa estar visível", passou isolado
// e voltou a passar na repetição. Causa: `useClientSpace` pode atualizar a
// conta ativa depois da primeira leitura; o `useEffect` dispara um segundo
// load(), que troca a lista pelo spinner. O `waitFor` do título passa nesse
// intervalo e a asserção seguinte lê um `body.innerText()` sem o protocolo.
//
// Esta guarda impede a regressão: medir texto do corpo exige esperar o ESTADO
// ESTÁVEL (textos obrigatórios presentes, spinner ausente), não apenas um
// elemento que pode pertencer a uma renderização anterior.

const helperPath = new URL('./helpers/portal-stable-read.mjs', import.meta.url);
const gatePath = new URL('./ux-portal-workspace.integration.test.mjs', import.meta.url);

const helper = await readFile(helperPath, 'utf8').catch(() => '');
const gate = await readFile(gatePath, 'utf8');

// Recorta apenas o cenário das reclamações para não confundir com os demais.
const complaintStart = gate.indexOf("test('browser ID3: reclamações restritas");
const complaintEnd = gate.indexOf("\ntest('browser ID3: documentos", complaintStart);
const complaint = complaintStart >= 0 ? gate.slice(complaintStart, complaintEnd > 0 ? complaintEnd : undefined) : '';

test('E9: existe helper de leitura estável e ele espera pelo próprio estado do corpo', () => {
  assert.ok(helper.length > 0, 'tests/helpers/portal-stable-read.mjs precisa existir');
  assert.match(helper, /export async function waitForStableBodyText/);
  assert.match(helper, /page\.waitForFunction/);
  assert.match(helper, /document\.body\?\.innerText|document\.body\.innerText/);
  assert.match(helper, /required\.every/);
  assert.match(helper, /forbidden\.every/);
  assert.match(helper, /timeout/);
});

test('E9: o helper recusa medição sem textos obrigatórios e devolve o corpo estável', () => {
  assert.match(helper, /required\.length === 0|required\.length < 1|!required\.length/);
  assert.match(helper, /throw new Error/);
  assert.match(helper, /return page\.locator\('body'\)\.innerText\(\)/);
});

test('E9: o gate do portal importa e usa o helper antes de medir o corpo das reclamações', () => {
  assert.ok(complaint.length > 0, 'o cenário ID3 de reclamações precisa existir');
  assert.match(gate, /import \{ waitForStableBodyText \} from '\.\/helpers\/portal-stable-read\.mjs'/);
  assert.match(complaint, /waitForStableBodyText\(page,/);
  const measure = complaint.indexOf("const bodyText = await page.locator('body').innerText()");
  const stable = complaint.indexOf('waitForStableBodyText(page,');
  assert.equal(measure, -1, 'a medição direta do corpo precisa ser substituída pelo helper');
  assert.ok(stable >= 0, 'o cenário precisa chamar o helper');
});

test('E9: a espera exige protocolo e envelope do RH, e proíbe o spinner', () => {
  const call = complaint.match(/waitForStableBodyText\(page, \{[\s\S]*?\}\)/)?.[0] ?? '';
  assert.ok(call.length > 0, 'a chamada do helper precisa estar completa no cenário');
  assert.match(call, /required:/);
  assert.match(call, /protocolA/);
  assert.match(call, /'Protocolo'/);
  assert.match(call, /'Severidade'/);
  assert.match(call, /titleA/);
  assert.match(call, /forbidden:/);
  assert.match(call, /Carregando reclamações/);
});

test('E9: nenhuma asserção de presença no corpo pode dispensar a espera estável', () => {
  // Regra geral de regressão: se uma asserção exige texto no corpo, o helper
  // precisa ser citado no mesmo cenário. Cenários novos que medirem o corpo
  // sem estabilidade quebram aqui, em vez de falhar intermitentemente em CI.
  const scenarios = gate.split(/\ntest\('/);
  const offenders = scenarios.filter(block =>
    /assert\.(?:equal|ok)\([^)]*body\w*\.includes\([^)]*\), true|assert\.match\(bodyText/.test(block)
    && !block.includes('waitForStableBodyText'));
  assert.deepEqual(offenders.map(block => block.slice(0, 90).split('\n')[0]), [],
    'todo cenário que afirma presença no corpo precisa usar waitForStableBodyText');
});

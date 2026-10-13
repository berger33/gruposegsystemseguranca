import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../src/app/admin/ti/DirectorySourcesClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/DirectorySourcesClient.module.css', import.meta.url), 'utf8');

test('UX-PRO-03 RAG sources: operational cards do not expose server root paths', () => {
  const operationalCard = component.split('<div className={styles.sourceHeader}')[1]?.split('</dl>')[0] || '';
  assert.doesNotMatch(operationalCard, /source\.root_key|source\.relative_path/);
  assert.match(component, /Configuração da pasta/);
  assert.match(component, /o caminho físico do servidor não é exposto/);
  assert.match(component, /Detalhes técnicos da sincronização \(JSON\)/);
  assert.match(component, /Estado operacional e última sincronização/);
});

test('UX-PRO-03 RAG sources: existing sync and pause actions stay wired to the same endpoint', () => {
  assert.match(component, /fetch\("\/api\/admin\/ai-rag-directory-sources"/);
  assert.match(component, /action: "sync", id: source\.id/);
  assert.match(component, /action: "toggle", id: source\.id, is_active: !source\.is_active/);
  assert.match(component, /action: "create", \.\.\.form/);
});

test('UX-PRO-03 RAG sources: controls are keyboard-visible and adapt to narrow screens', () => {
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(component, /role=\{error \? "alert" : "status"\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/app/admin/funcionarios/RhWorkspace.tsx', import.meta.url),
  'utf8',
);
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('UX-PRO-05 documentos RH: contratos e ações existentes permanecem montados', () => {
  assert.match(code, /hrRequest<\{ documents\?: Doc\[\] \}>\('\/api\/admin\/hr\/l03\/documents'\)/);
  assert.match(code, /tab === 'documentos' \?\s*(?:\(\s*)?<Documents/);
  assert.match(code, /method: 'PATCH'/);
  assert.match(code, /status: 'approved'/);
  assert.match(code, /status: 'rejected', rejectionReason/);
  assert.match(code, /method: 'POST'/);
  assert.match(code, /sourceAuthorized: true/);
  assert.match(code, /\/api\/admin\/hr\/l03\/documents\/\$\{doc\.id\}\/download/);
});

test('UX-PRO-05 documentos RH: falha transitória preserva a coleção e negativa permanece fail-closed', () => {
  assert.match(code, /const \[docsLoaded, setDocsLoaded\]/);
  assert.match(code, /const \[docsLoading, setDocsLoading\]/);
  assert.match(code, /const \[docsError, setDocsError\]/);
  assert.doesNotMatch(
    code,
    /setDocs\(d\.ok \? d\.data\.documents \|\| \[\] : \[\]\)/,
    'uma falha de leitura não pode ser convertida em coleção vazia',
  );
  assert.match(code, /if \(d\.ok\)/);
  assert.match(code, /setDocs\(d\.data\.documents \|\| \[\]\)/);
  assert.match(code, /setDocsError\(d\.error\)/);
  assert.match(code, /d\.error\.kind === 'denied'/);
  assert.match(code, /d\.error\.kind === 'auth'/);
  assert.match(code, /loaded=\{docsLoaded\}/);
  assert.match(code, /loading=\{docsLoading\}/);
  assert.match(code, /error=\{docsError\}/);
});

test('UX-PRO-05 documentos RH: loading, vazio, erro e negativa são estados honestos e distintos', () => {
  assert.match(code, /loading \|\| !loaded/);
  assert.match(code, /variant="loading"/);
  assert.match(code, /loaded && !loading && !readError && !docs\.length/);
  assert.match(code, /variant="empty"/);
  assert.match(code, /variant=\{hrErrorVariant\(readError\)\}/);
  assert.match(code, /hrErrorFootnote\(readError\)/);
  assert.match(code, /A lista anterior foi preservada/);
  assert.match(code, /retryLabel=\{readError\.canRetry \? 'Tentar carregar novamente' : undefined\}/);
  assert.match(code, /onRetry=\{readError\.canRetry \? onRetry : undefined\}/);
});

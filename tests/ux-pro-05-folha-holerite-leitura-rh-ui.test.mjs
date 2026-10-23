import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rhWorkspaceSource = await readFile(
  new URL('../src/app/admin/funcionarios/RhWorkspace.tsx', import.meta.url),
  'utf8',
);

test('UX-PRO-05: RhWorkspace passa estado de leitura e repetição para a aba Fechamento e holerite (Payroll)', () => {
  const payrollTabMatch = rhWorkspaceSource.match(
    /\{tab === 'folha' \? \([\s\S]*?<Payroll[\s\S]*?\/>[\s\S]*?\) : null\}/,
  );
  assert.ok(payrollTabMatch, 'RhWorkspace deve renderizar <Payroll ... /> quando tab === "folha"');
  const payrollTabBlock = payrollTabMatch[0];
  assert.match(payrollTabBlock, /loaded=\{docsLoaded\}/);
  assert.match(payrollTabBlock, /loading=\{docsLoading\}/);
  assert.match(payrollTabBlock, /error=\{docsError\}/);
  assert.match(payrollTabBlock, /onRetry=\{\(\) => \{ void refresh\('silent'\); \}\}/);
});

test('UX-PRO-05: Payroll distingue carregamento, erro transitório, negativa e vazio confirmado em Publicações de folha já registradas', () => {
  const payrollFnStart = rhWorkspaceSource.indexOf('function Payroll(');
  const terminationFnStart = rhWorkspaceSource.indexOf('function Termination(');
  assert.ok(payrollFnStart > 0 && terminationFnStart > payrollFnStart, 'bloco Payroll deve existir em RhWorkspace.tsx');
  const payrollBlock = rhWorkspaceSource.slice(payrollFnStart, terminationFnStart);

  assert.match(
    payrollBlock,
    /aria-labelledby="rh-publicacoes-titulo"\s+aria-busy=\{loading\}/,
    'seção Publicações de folha já registradas deve refletir aria-busy={loading}',
  );
  assert.match(
    payrollBlock,
    /const readErrorDetail = readError\?\.kind === 'retry'\s*\?\s*'O servidor não concluiu esta consulta das publicações de folha\. Isto não é a mesma coisa que não haver registros\.'\s*:\s*readError\?\.detail;/,
    'erro transitório de leitura em Payroll não pode afirmar que nada foi gravado após fechamento ou publicação confirmada',
  );
  assert.match(
    payrollBlock,
    /A lista anterior foi preservada e pode estar desatualizada; a falha nesta releitura não desfaz uma ação já confirmada\./,
    'releitura falha com holerites preservados deve avisar sobre possível desatualização e preservar validade de ações confirmadas',
  );
  assert.match(
    payrollBlock,
    /Nenhuma lista de publicações foi confirmada; a falha nesta consulta não significa ausência de holerites e não desfaz uma ação já confirmada\./,
    'leitura falha sem lista prévia não pode simular ausência nem contradizer ação confirmada',
  );
  assert.match(
    payrollBlock,
    /retryLabel=\{readError\.canRetry \? 'Tentar carregar novamente' : undefined\}/,
    'repetição em Payroll deve respeitar readError.canRetry',
  );
  assert.match(
    payrollBlock,
    /\{loading \|\| !loaded \? \(\s*<UiState\s+variant="loading"/,
    'Payroll deve expor UiState de loading na leitura inicial e na releitura',
  );
  assert.match(
    payrollBlock,
    /\{loaded && !loading && !readError && !payrollDocs\.length \? \(\s*<UiState\s+variant="empty"/,
    'Payroll só deve declarar ausência de publicações quando a consulta concluir sem erro e sem holerites',
  );
  assert.match(
    payrollBlock,
    /<ul className=\{styles\.knowledgeList\}>[\s\S]*?<UiBadge tone=\{documentStatusTone\(doc\.status\)\} srPrefix="Publicação">/,
    'Payroll deve listar publicações com quebra responsiva em 320px e manter UiBadge apenas para a situação traduzida',
  );
});

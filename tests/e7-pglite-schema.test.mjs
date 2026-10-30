import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { listMigrationFiles } from '../src/server/pglite-pool.mjs';

// E7 — a demo padrão (PGlite, sem DATABASE_URL) usava `db/beta-pglite-init.sql`
// com 27 tabelas contra 581 do PostgreSQL. O schema passou a vir das MESMAS
// migrações 001–181: esta guarda impede que a demo volte a ter lista de
// migrações escrita à mão, dicionário de schema paralelo ou falha silenciosa.
// A prova de execução fica no gate `npm run test:pglite-schema` (PGlite real).
const root = path.resolve(import.meta.dirname, '..');
const POOL = 'src/server/pglite-pool.mjs';
const SEED = 'db/pglite-demo-seed.sql';
const LEGACY = 'db/beta-pglite-init.sql';

const read = (relative) => readFile(path.join(root, relative), 'utf8');

test('E7: a lista de migrações da demo vem do diretório, nunca de array manual', async () => {
  const directory = (await readdir(path.join(root, 'db/migrations'))).filter((name) => /^\d{3}-.+\.sql$/.test(name)).sort();
  assert.equal(directory.length > 150, true, `ledger de migrações inesperadamente curto (${directory.length})`);
  assert.deepEqual(listMigrationFiles(), directory, 'a demo precisa aplicar exatamente o ledger do PostgreSQL');
  assert.equal(new Set(directory).size, directory.length, 'migração duplicada no diretório');
  for (const name of directory) assert.match(name, /^\d{3}-/, `migração fora do padrão de nome: ${name}`);

  const source = await read(POOL);
  assert.match(source, /readdirSync\(directory\)/, 'a lista precisa ser lida do diretório');
  assert.doesNotMatch(source, /'0\d\d-[a-z0-9-]+\.sql'/, 'a demo não pode voltar a ter uma lista de arquivos escrita à mão');
});

test('E7: a demo e o migrador PostgreSQL listam as mesmas migrações', async () => {
  const directory = listMigrationFiles();
  const migrator = await read('scripts/migrate-site-visual.mjs');
  const scheduled = new Set([...migrator.matchAll(/['"](\d{3}-[^'"]+\.sql)['"]/g)].map((match) => match[1]));
  for (const name of directory) {
    assert.ok(scheduled.has(name), `${name} existe no ledger mas não está no migrador PostgreSQL`);
  }
  assert.equal(scheduled.size, directory.length, 'o migrador PostgreSQL lista arquivo que não existe em db/migrations');
});

test('E7: nenhum código carrega o schema mínimo beta como fonte de schema', async () => {
  const source = await read(POOL);
  assert.doesNotMatch(source, /betaInitPath/, 'o caminho do beta init não pode voltar ao bootstrap');
  assert.doesNotMatch(source, /readFileSync\([^)]*beta-pglite-init/, 'o beta init não pode ser executado pela demo');
  assert.match(source, /pglite_legacy_beta_schema/, 'diretório legado precisa ser recusado com motivo explícito');
  assert.match(source, /pglite_migration_failed/, 'falha de migração precisa ser fail-closed, não "marcar como aplicada"');
});

test('E7: o bootstrap é fail-closed — só marca migrado depois do sucesso', async () => {
  const source = await read(POOL);
  const boot = /export async function getPGlitePool\(\)([\s\S]*?)\n}/.exec(source);
  assert.ok(boot, 'getPGlitePool precisa continuar existindo');
  const body = boot[1];
  const call = body.indexOf('await runMigrationsIfNeeded()');
  const mark = body.indexOf('__pgliteMigrated = true');
  assert.ok(call >= 0 && mark > call, 'o marcador só pode ser gravado depois de aplicar o schema');
});

test('E7: o conteúdo da demo é só DML e não cria schema paralelo', async () => {
  const seed = await read(SEED);
  assert.doesNotMatch(seed, /\b(CREATE|ALTER|DROP)\s+(TABLE|TYPE|INDEX|FUNCTION|TRIGGER|VIEW)\b/i,
    'seeds de demonstração não podem criar ou alterar schema');
  assert.match(seed, /ON CONFLICT DO NOTHING/, 'o seed precisa ser idempotente');
  const source = await read(POOL);
  const marker = /const DEMO_SEED_MARKER = '([^']+)'/.exec(source);
  assert.ok(marker, 'o marcador do seed precisa estar explícito no bootstrap');
  assert.match(source, /applyDemoSeed/, 'o seed de demonstração precisa ser aplicado pelo bootstrap');

  const legacy = await read(LEGACY);
  assert.match(legacy, /^-- HISTÓRICO — NÃO É APLICADO/m, 'o beta init precisa se declarar histórico na primeira linha');
});

test('E7: server.mjs e o ledger descrevem o schema que a demo realmente usa', async () => {
  const server = await read('server.mjs');
  assert.doesNotMatch(server, /schema mínimo; não equivale/, 'o log de boot não pode afirmar o schema mínimo antigo');
  assert.match(server, /schema real por \$\{info\?\.migrationFiles/, 'o log precisa reportar a medição do bootstrap');

  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts['test:pglite-schema'], 'node scripts/qa-pglite-schema.mjs');
  assert.match(pkg.scripts['test:unit'], /tests\/e7-pglite-schema\.test\.mjs/,
    'a guarda precisa rodar no test:unit');

  const workflow = await read('.github/workflows/ci.yml');
  assert.match(workflow, /npm run test:pglite-schema/, 'o gate precisa rodar no CI');
});

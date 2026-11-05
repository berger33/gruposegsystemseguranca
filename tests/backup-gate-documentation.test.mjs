import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gate = new URL('../docs/PRODUCAO-GATE.md', import.meta.url);

test('PLT-BAK-001: gate não ensina criar/restaurar backup fictício via API', async () => {
  const content = await readFile(gate, 'utf8');
  const backupSection = content.split('### 8. Backup e restauração')[1]?.split('### 9. ')[0];
  assert.ok(backupSection, 'backup gate section missing');
  assert.match(backupSection, /POST retorna \*\*503\*\*/);
  assert.match(backupSection, /não verificados/);
  assert.match(backupSection, /politica-tecnica-backup-recuperacao\.md/);
  assert.doesNotMatch(backupSection, /curl\s+-X\s+POST/);
  assert.doesNotMatch(backupSection, /# Verificar: backup_jobs is_restore_tested true/);
});

// Regressão do runbook operacional: fica no arquivo já executado pelo test:unit.
// Não inicia servidor, envia mensagem, lê .env real nem conecta a banco externo.
const repo = new URL('../', import.meta.url);
const source = name => readFile(new URL(name, repo), 'utf8');

test('runbook: nomes de ambiente documentados existem nos consumidores e no exemplo', async () => {
  const content = await readFile(gate, 'utf8');
  const example = await source('.env.example');
  const runtime = (await Promise.all([
    'server.mjs', 'src/lib/client-mfa.mjs', 'src/server/client-access-api.mjs',
    'src/server/ai-rag-real-api.mjs', 'src/lib/seo-technical.mjs',
  ].map(source))).join('\n');
  const keys = ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'SITE_ADMIN_SESSION_SECRET',
    'EMPLOYEE_SESSION_SECRET', 'CLIENT_MFA_ENCRYPTION_KEY', 'PUBLIC_BASE_URL',
    'CLIENT_DOCS_DIR', 'EMPLOYEE_DOCS_DIR', 'BIND_HOST', 'TRUST_PROXY',
    'MAIL_HOST', 'MAIL_PORT', 'MAIL_SECURE', 'MAIL_USER', 'MAIL_PASSWORD',
    'MAIL_FROM', 'LEADS_NOTIFY_EMAIL', 'OLLAMA_ENABLED', 'OLLAMA_BASE_URL',
    'OLLAMA_MODEL', 'NEXT_PUBLIC_ENV', 'NEXT_PUBLIC_ALLOW_INDEX'];
  const migration = await source('scripts/migrate-site-visual.mjs');
  for (const key of keys) {
    assert.ok(content.includes(`\`${key}\``), `${key}: ausente do contrato`);
    assert.match(example, new RegExp(`^${key}=`, 'm'), `${key}: ausente do exemplo`);
    assert.ok((runtime + migration).includes(key), `${key}: sem consumidor conferido`);
  }
  // Não permitir voltar aos nomes antigos como atribuições copiáveis.
  assert.doesNotMatch(content, /^(?:NEXTAUTH_SECRET|ENCRYPTION_KEY|ADMIN_BOOTSTRAP_TOKEN|SMTP_\w+|OLLAMA_HOST)=/m);
  for (const key of ['SITE_ADMIN_SESSION_SECRET', 'EMPLOYEE_SESSION_SECRET', 'CLIENT_MFA_ENCRYPTION_KEY', 'MAIL_PASSWORD', 'POSTGRES_PASSWORD']) {
    assert.match(example, new RegExp(`^${key}=\s*$`, 'm'), `${key}: exemplo precisa continuar vazio`);
  }
});

test('runbook: indexação exige as duas condições, sem ativação no exemplo', async () => {
  const content = await readFile(gate, 'utf8');
  const example = await source('.env.example');
  const { isIndexingReleased } = await import('../src/lib/seo-technical.mjs');
  assert.match(content, /NEXT_PUBLIC_ENV=production/);
  assert.match(content, /NEXT_PUBLIC_ALLOW_INDEX=true/);
  assert.match(content, /Rebuild é necessário/);
  assert.match(example, /^NEXT_PUBLIC_ENV=beta$/m);
  assert.match(example, /^NEXT_PUBLIC_ALLOW_INDEX=false$/m);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ENV: 'production' }), false);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ALLOW_INDEX: 'true' }), false);
  assert.equal(isIndexingReleased({ NEXT_PUBLIC_ENV: 'production', NEXT_PUBLIC_ALLOW_INDEX: 'true' }), true);
});

test('runbook: documenta SMTP verify sem prometer envio da fila ainda desconectada', async () => {
  const content = await readFile(gate, 'utf8');
  const integration = await source('src/server/integrations-api.mjs');
  const server = await source('server.mjs');
  assert.match(integration, /await transporter\.verify\(\)/);
  assert.match(content, /não envia mensagem/);
  assert.match(content, /entrega separadamente/);
  // Gate transitório: a fatia de conexão da fila deverá reconciliar este contrato.
  assert.match(server, /mailer: null/);
  assert.match(content, /mailer: null/);
  assert.match(content, /configurar `MAIL_HOST` não conecta/);
});

test('runbook: migrador, compose existente e checklist não usam procedimento obsoleto', async () => {
  const content = await readFile(gate, 'utf8');
  const bank = await source('docs/APLICACAO-BANCO-DESTINO.md');
  const migration = await source('scripts/migrate-site-visual.mjs');
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(new URL('db/migrations/', repo))).filter(f => /^\d{3}-.+\.sql$/.test(f)).sort();
  const range = `001–${String(files.length).padStart(3, '0')}`;
  assert.ok(bank.includes(`## Etapa 2 — Aplicar as migrações ${range}`));
  assert.ok(bank.includes(`Migration ledger verified: ${range} (PostgreSQL only)`));
  assert.ok(migration.includes(`Migration ledger verified: ${range} (PostgreSQL only)`));
  assert.ok(bank.includes(files.at(-1)));
  assert.match(bank, /não reaplica nada; checksum divergente aborta/);
  assert.match(bank, /EMPLOYEE_SESSION_SECRET/);
  assert.match(await source('infra/postgres/compose.yaml'), /image: postgres:17-alpine/);
  assert.match(content, /sobe \*\*somente PostgreSQL 17\*\*/);
  assert.doesNotMatch(content, /^docker compose -f docker-compose\.beta\.yaml/m);
  assert.doesNotMatch(bank, /git switch main|git pull/);
  assert.equal((content.match(/^- \[ \]/gm) || []).length, 12);
  assert.match(content, /NO-GO/);
  assert.match(content, /Autorização explícita por escrito/);
});

test('runbook: chave MFA é de 32 bytes base64url, não hexadecimal nem segredo de sessão', async () => {
  const content = await readFile(gate, 'utf8');
  const mfa = await source('src/lib/client-mfa.mjs');
  assert.match(content, /randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(content, /randomBytes\(48\)\.toString\('base64url'\)/);
  assert.match(content, /independente do segredo staff/);
  assert.match(mfa, /key\.length !== 32/);
  assert.match(mfa, /key\.toString\('base64url'\) !== text/);
  assert.match(content, /Não colar saídas em chat, relatório, CI ou commit/);
});

test('runbook: carregamento inicial de env preserva precedência e não trata --dev como dev=true', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(), 'seg-env-contract-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, value] of [
    ['.env', 'base'], ['.env.production', 'production'], ['.env.local', 'local'],
    ['.env.production.local', 'production-local'], ['.env.development', 'development'],
  ]) await writeFile(join(directory, name), `SEG_ENV_CONTRACT_QA=${value}\n`);
  const envModule = import.meta.resolve('@next/env');
  const script = `import nextEnv from ${JSON.stringify(envModule)};
    nextEnv.loadEnvConfig(process.argv[1], undefined, {info(){},error(){}});
    process.stdout.write(process.env.SEG_ENV_CONTRACT_QA);`;
  const env = { ...process.env, NODE_ENV: 'development' };
  delete env.SEG_ENV_CONTRACT_QA;
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', script, directory], { env, encoding: 'utf8' }), 'production-local');
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', script, directory], { env: { ...env, SEG_ENV_CONTRACT_QA: 'process' }, encoding: 'utf8' }), 'process');
  assert.match(await source('server.mjs'), /loadEnvConfig\(process\.cwd\(\)\)/);
  assert.match(await source('scripts/migrate-site-visual.mjs'), /loadEnvConfig\(root\)/);
  assert.match(await readFile(gate, 'utf8'), /não passam `dev=true`/);
});

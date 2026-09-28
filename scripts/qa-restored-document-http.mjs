// PLT-BAK-001 / CLIENTE-SEG-001: rota HTTP real apenas no destino QA descartável.
// Chamado exclusivamente pelo runner com banco, cookies e arquivo criados nesta execução.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}

export async function verifyRestoredDocumentHttp({ databaseUrl, docsDir, pool, sourcePool, documentId,
  accountA, accountB, identityA, identityB, tokenA, tokenB, expectedBytes }) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  // Next --dev may rewrite tracked files; restore exact contents even after a failed check.
  const generated = new Map();
  for (const name of ['next-env.d.ts', 'tsconfig.json']) {
    generated.set(name, await readFile(path.join(projectRoot, name), 'utf8').catch(() => null));
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^PG/i.test(key) && !['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'CLIENT_DOCS_DIR'].includes(key)));
  const child = spawn(process.execPath, ['server.mjs', '--dev'], { cwd: projectRoot,
    env: { ...env, DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: '',
      NODE_ENV: 'development', PORT: String(port), BIND_HOST: '127.0.0.1',
      NEXT_DIST_DIR: '.next/integration-restore-document', PUBLIC_BASE_URL: origin,
      TRUST_PROXY: 'false', CLIENT_DOCS_DIR: docsDir, MAIL_HOST: '', OLLAMA_ENABLED: 'false',
      SITE_ADMIN_TOKEN_MARCELO: '', SITE_ADMIN_TOKEN_TI: '', SITE_ADMIN_SESSION_SECRET: 'qa-restored-file-http-secret-only' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let listening = false;
  let spawnError = false;
  let log = '';
  const collect = bytes => { const text = String(bytes); if (text.includes('listening on')) listening = true; log = (log + text).slice(-1400); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', () => { spawnError = true; });
  const route = `/api/client/documents/${documentId}/download`;
  const request = cookie => fetch(origin + route, {
    headers: { Origin: origin, ...(cookie ? { Cookie: `seg_client_session=${cookie}` } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const denied = async (cookie, expected) => {
    const response = await request(cookie);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status !== expected || bytes.includes(expectedBytes)) {
      throw new Error(`qa_http_document_denial_failed_${response.status}_expected_${expected}`);
    }
  };
  try {
    const deadline = Date.now() + 90_000;
    while (!listening) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null || Date.now() >= deadline) throw new Error('qa_http_server_unavailable');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await denied(null, 401);
    await denied(tokenB, 403);
    const own = await request(tokenA);
    const bytes = Buffer.from(await own.arrayBuffer());
    if (own.status !== 200 || !bytes.equals(expectedBytes) ||
        own.headers.get('content-type') !== 'text/plain' ||
        own.headers.get('content-length') !== String(expectedBytes.length) ||
        own.headers.get('cache-control') !== 'private, no-store' ||
        own.headers.get('x-content-type-options') !== 'nosniff' ||
        !own.headers.get('content-disposition')?.includes('qa-sintetico.txt')) {
      throw new Error(`qa_http_restored_bytes_mismatch_${own.status}`);
    }
    // Streaming starts before the handler's asynchronous allowed audit completes.
    // Give that write a bounded interval; the denied audit precedes its response.
    const auditDeadline = Date.now() + 5_000;
    let audits;
    do {
      ({ rows: audits } = await pool.query(`SELECT actor_id, result, target FROM auth_access_audit
        WHERE action='document_download' AND actor_id IN ($1,$2) ORDER BY id`, [identityA, identityB]));
      if (audits.some(row => row.actor_id === identityA && row.result === 'allowed' && row.target === documentId) &&
          audits.some(row => row.actor_id === identityB && row.result === 'denied' && row.target === accountA)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < auditDeadline);
    if (!audits.some(row => row.actor_id === identityA && row.result === 'allowed' && row.target === documentId) ||
        !audits.some(row => row.actor_id === identityB && row.result === 'denied' && row.target === accountA)) {
      throw new Error('qa_http_document_audit_missing');
    }
    const revoked = await pool.query("UPDATE client_access_grants SET revoked_at=NOW(), revoked_by='ti', revoke_reason='QA after restore' WHERE identity_id=$1 AND client_account_id=$2 AND revoked_at IS NULL", [identityA, accountA]);
    if (revoked.rowCount !== 1) throw new Error('qa_http_revocation_not_applied');
    await denied(tokenA, 403);
    await denied(tokenB, 403); // A revogação não pode criar acesso cruzado para B.
    const { rows: [revocationAudit] } = await pool.query(`SELECT count(*)::int AS n FROM auth_access_audit
      WHERE action='document_download' AND actor_id=$1 AND target=$2 AND result='denied'`, [identityA, accountA]);
    if (revocationAudit.n !== 1) throw new Error('qa_http_revocation_audit_missing');
    const bAccounts = await fetch(origin + '/api/client/accounts', {
      headers: { Origin: origin, Cookie: `seg_client_session=${tokenB}` }, signal: AbortSignal.timeout(15_000),
    });
    const bBody = await bAccounts.json();
    if (bAccounts.status !== 200 || bBody.accounts?.length !== 1 || bBody.accounts[0].id !== accountB) throw new Error('qa_http_account_b_isolation_failed');
    const { rows: [sourceGrant] } = await sourcePool.query('SELECT revoked_at FROM client_access_grants WHERE identity_id=$1 AND client_account_id=$2', [identityA, accountA]);
    if (!sourceGrant || sourceGrant.revoked_at !== null) throw new Error('qa_http_source_grant_mutated');
    console.log(`QA_RESTORE_HTTP_VERIFIED: A 200 exact ${bytes.length} bytes/headers; B 403; anonymous 401; revoked A 403; B only its account; access audit; source grant unchanged`);
  } catch (error) {
    console.error('QA_RESTORE_HTTP_FAILED', String(error?.message || error).slice(0, 200), log.replaceAll(databaseUrl, '[QA database redacted]').slice(-350));
    throw error;
  } finally {
    // Wait for the server to stop before closing pools/clusters and deleting the QA file.
    if (child.exitCode === null && child.signalCode === null && !spawnError) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      let timeout;
      await Promise.race([stopped, new Promise(resolve => { timeout = setTimeout(resolve, 10_000); })]);
      clearTimeout(timeout);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await stopped; }
    }
    for (const [name, content] of generated) {
      if (content !== null) await writeFile(path.join(projectRoot, name), content);
    }
  }
}

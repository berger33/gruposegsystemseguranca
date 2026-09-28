// PLT-BAK-001 / CLI-04: banco PG + objetos QA locais, sem servidor HTTP.
// Executar SOMENTE via scripts/qa-cli-v2-postgres.mjs em cluster recém-criado.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createQaCliV2LocalProvider } from '../scripts/qa-cli-v2-local-provider.mjs';
import { signQaManifest, verifyQaManifest, publicKeyFingerprint } from '../scripts/qa-detached-manifest-signature.mjs';

const enabled = process.env.RUN_CLI_V2_OBJECT_QA === '1';
test('PLT-BAK-001 / CLI-04: schema PG de conta/documento/versão e objeto QA independente',
  { skip: !enabled }, async t => {
    const url = new URL(process.env.DATABASE_MIGRATION_URL || 'http://invalid');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.pathname, '/seg_qa_cli_v2');
    const pool = new pg.Pool({ connectionString: url.href, max: 2 });
    let poolHadError = false;
    pool.on('error', () => { poolHadError = true; });
    t.after(() => pool.end());
    const rootSource = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-contract-'));
    const rootTarget = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-contract-'));
    t.after(async () => { await rm(rootSource, { recursive: true, force: true }); await rm(rootTarget, { recursive: true, force: true }); });
    const source = await createQaCliV2LocalProvider(rootSource);
    const target = await createQaCliV2LocalProvider(rootTarget);
    const [accountA, accountB, identityA, identityB, docA, docB] =
      Array.from({ length: 6 }, () => randomUUID());
    const a1 = Buffer.from('QA PG CLI A document version one');
    const a2 = Buffer.from('QA PG CLI A document version two');
    const b1 = Buffer.from('QA PG CLI B own object');
    const [rA1, rA2, rB1] = await Promise.all([
      source.put({ documentId: docA, accountId: accountA, version: 1, bytes: a1 }),
      source.put({ documentId: docA, accountId: accountA, version: 2, bytes: a2 }),
      source.put({ documentId: docB, accountId: accountB, version: 1, bytes: b1 }),
    ]);
    const bytes = Buffer.from(JSON.stringify({ format: 'qa-cli-v2-receipts-v1', entries: [rA1, rA2, rB1] }));
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const envelope = signQaManifest({ bytes, privateKey, signerPublicKey: publicKey });
    const fingerprint = publicKeyFingerprint(publicKey);
    assert.equal(verifyQaManifest({ bytes, envelope, trustedPublicKey: publicKey, pinnedFingerprint: fingerprint }), true);
    const changed = Buffer.from(bytes); changed[20] ^= 1;
    assert.throws(() => verifyQaManifest({ bytes: changed, envelope, trustedPublicKey: publicKey,
      pinnedFingerprint: fingerprint }), /qa_signature_invalid/);

    const { rows: [ledger] } = await pool.query('SELECT count(*)::int AS n FROM __migrations');
    assert.equal(ledger.n, 96);
    await pool.query("INSERT INTO client_accounts(id,display_name,created_by) VALUES ($1,'QA Contract A','ti'),($2,'QA Contract B','ti')", [accountA, accountB]);
    await pool.query("INSERT INTO auth_identities(id,kind,email,status) VALUES ($1,'client','qa-object-a@exemplo.invalid','active'),($2,'client','qa-object-b@exemplo.invalid','active')", [identityA, identityB]);
    await pool.query("INSERT INTO client_access_grants(id,identity_id,client_account_id,reason,granted_by) VALUES ($1,$2,$3,'QA A','ti'),($4,$5,$6,'QA B','ti')", [randomUUID(), identityA, accountA, randomUUID(), identityB, accountB]);
    // Atomicidade só das linhas documento/versão no PostgreSQL QA; arquivos
    // já foram escritos ANTES. Não existe transação distribuída DB+filesystem.
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query(`INSERT INTO cli_client_documents_v2
        (id,client_account_id,title,file_name,file_url,storage_key,version,status)
        VALUES ($1,$2,'QA contract A','qa-a.txt','/qa/object-a',$3,2,'publicado'),
               ($4,$5,'QA contract B','qa-b.txt','/qa/object-b',$6,1,'publicado')`,
      [docA, accountA, rA2.storage_key, docB, accountB, rB1.storage_key]);
      for (const [receipt, name] of [[rA1, 'qa-a1.txt'], [rA2, 'qa-a2.txt'], [rB1, 'qa-b1.txt']]) {
        await tx.query(`INSERT INTO cli_document_versions(document_id,version,file_name,file_url,storage_key)
          VALUES ($1,$2,$3,'/qa/metadata-only',$4)`,
        [receipt.document_id, receipt.version, name, receipt.storage_key]);
      }
      await tx.query('COMMIT');
    } catch (error) {
      await tx.query('ROLLBACK');
      throw error;
    } finally { tx.release(); }
    const { rows: [rowsCount] } = await pool.query(`SELECT
      (SELECT count(*)::int FROM cli_client_documents_v2 WHERE id IN ($1,$2)) AS docs,
      (SELECT count(*)::int FROM cli_document_versions WHERE document_id IN ($1,$2)) AS versions`, [docA, docB]);
    assert.deepEqual(rowsCount, { docs: 2, versions: 3 });
    // Falha negativa: DB desfaz a versão duplicada, mas o objeto pré-gravado
    // continua órfão no QA. Este teste NÃO resolve atomicidade DB+FS.
    const orphan = await source.put({ documentId: docA, accountId: accountA,
      version: 2, bytes: Buffer.from('QA orphan after failed DB transaction') });
    const failedTx = await pool.connect();
    try {
      await failedTx.query('BEGIN');
      await assert.rejects(failedTx.query(`INSERT INTO cli_document_versions
        (document_id,version,file_name,file_url,storage_key)
        VALUES ($1,2,'duplicate.txt','/qa/duplicate',$2)`, [docA, orphan.storage_key]),
      { code: '23505' });
      await failedTx.query('ROLLBACK');
    } finally { failedTx.release(); }
    const { rows: [actualV2] } = await pool.query('SELECT document_id,version,storage_key FROM cli_document_versions WHERE document_id=$1 AND version=2', [docA]);
    assert.equal(actualV2.storage_key, rA2.storage_key);
    await assert.rejects(source.read({ authorizedAccountId: accountA,
      document: { id: docA, client_account_id: accountA }, version: actualV2, receipt: orphan }),
    /qa_object_db_binding_invalid/);
    // Consulta de ESCOPO APENAS NO TESTE, não handler CLI produtivo: vínculo
    // ativo e conta ativa devem vir do DB, nunca de accountId escolhido no cookie.
    async function scoped(actorId, documentId, versionNumber) {
      const { rows } = await pool.query(`SELECT d.id, d.client_account_id, v.document_id, v.version, v.storage_key, v.file_url
        FROM cli_client_documents_v2 d
        JOIN cli_document_versions v ON v.document_id=d.id
        JOIN client_accounts a ON a.id=d.client_account_id AND a.status='active'
        JOIN client_access_grants g ON g.client_account_id=a.id AND g.identity_id=$1 AND g.revoked_at IS NULL
        WHERE d.id=$2 AND v.version=$3`, [actorId, documentId, versionNumber]);
      if (rows.length !== 1) return null;
      const row = rows[0];
      return { authorizedAccountId: row.client_account_id,
        document: { id: row.id, client_account_id: row.client_account_id },
        version: { document_id: row.document_id, version: row.version,
          storage_key: row.storage_key, file_url: row.file_url } };
    }
    assert.equal(await scoped(identityB, docA, 1), null);
    assert.equal(await scoped(identityA, docB, 1), null);
    for (const [number, receipt, expected] of [[1, rA1, a1], [2, rA2, a2]]) {
      const scope = await scoped(identityA, docA, number);
      assert.deepEqual(await source.read({ ...scope, receipt }), expected);
      await assert.rejects(target.read({ ...scope, receipt }), /qa_object_missing/);
      await target.importVerified({ receipt, bytes: expected });
      assert.deepEqual(await target.read({ ...scope, receipt }), expected);
    }
    assert.deepEqual(await source.read({ ...(await scoped(identityB, docB, 1)), receipt: rB1 }), b1);
    // Nem DB populado nem URL preenchida tornam objeto de B legível por A.
    assert.equal(await scoped(identityA, docB, 1), null);
    await pool.query('UPDATE cli_document_versions SET storage_key=$1 WHERE document_id=$2 AND version=2', ['f'.repeat(48), docA]);
    await assert.rejects(target.read({ ...(await scoped(identityA, docA, 2)), receipt: rA2 }), /qa_object_db_binding_invalid/);
    await pool.query('UPDATE cli_document_versions SET storage_key=$1 WHERE document_id=$2 AND version=2', [rA2.storage_key, docA]);
    await pool.query("UPDATE client_access_grants SET revoked_at=NOW(), revoked_by='ti', revoke_reason='QA revoke A' WHERE identity_id=$1 AND client_account_id=$2", [identityA, accountA]);
    assert.equal(await scoped(identityA, docA, 2), null);
    assert.deepEqual(await source.read({ ...(await scoped(identityB, docB, 1)), receipt: rB1 }), b1);
    const tampered = Buffer.from(a2); tampered[0] ^= 0xff;
    await writeFile(path.join(rootTarget, 'objects', rA2.storage_key), tampered); // somente QA descartável
    // Leitura com metadados DB ainda válidos falha pela comparação de hash.
    // A checagem de arquivo é separada do grant (A está revogada nesse momento).
    const { rows: [dbVersion] } = await pool.query('SELECT document_id,version,storage_key FROM cli_document_versions WHERE document_id=$1 AND version=2', [docA]);
    await assert.rejects(target.read({ authorizedAccountId: accountA,
      document: { id: docA, client_account_id: accountA }, version: dbVersion, receipt: rA2 }), /qa_object_sha256_mismatch/);
    assert.equal(poolHadError, false);
    console.log('QA_CLI_V2_OBJECT_VERIFIED: PG 96/96; A v1/v2 bytes exact; B cross-account denied; A revoke denied; B own preserved; DB key mismatch/missing/corrupt bytes denied; signed QA receipts (ephemeral key)');
  });

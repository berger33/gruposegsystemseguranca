import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

let pgliteInstance = null;
let poolWrapper = null;

const MIGRATIONS_DIR = path.join(process.cwd(), 'db/migrations');
const DEMO_SEED_PATH = path.join(process.cwd(), 'db/pglite-demo-seed.sql');

// E7: o modo "beta lite" (`db/beta-pglite-init.sql`, 27 tabelas) saiu do caminho
// padrão. A demo carrega o schema real aplicando as MESMAS migrações 001–181 do
// PostgreSQL. Diretórios criados antes disso são RECUSADOS com mensagem
// explícita: aplicar o ledger por cima do schema mínimo deixa o banco
// inconsistente (medido: 14/181 migrações falham e sobra um híbrido de 560
// tabelas). Demo "meio funcionando" é pior que demo que pede reset.
const LEGACY_BETA_MARKER_LIKE = 'beta-pglite-init%';
const DEMO_SEED_MARKER = 'pglite-demo-seed-v1.sql';
const MIGRATION_FILE_PATTERN = /^\d{3}-.+\.sql$/;

let schemaInfo = null;

/**
 * Arquivos de migração na ordem canônica (001…N). A lista vem do diretório, não
 * de um array escrito à mão: qualquer migração nova entra na demo sem edição
 * (o array antigo parou em 095 e nunca mais acompanhou o ledger).
 */
export function listMigrationFiles(directory = MIGRATIONS_DIR) {
  return fs.readdirSync(directory).filter((name) => MIGRATION_FILE_PATTERN.test(name)).sort();
}

function migrationChecksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

export function getPGliteSchemaInfo() {
  return schemaInfo;
}

function getPGliteInstance() {
  if (pgliteInstance) return pgliteInstance;
  // Testes e gates podem apontar para um diretório exclusivo sem limpar o PGlite do usuário.
  const dataDir = process.env.PGLITE_DATA_DIR
    ? path.resolve(process.env.PGLITE_DATA_DIR)
    : path.join(process.cwd(), '.data', 'pglite');
  fs.mkdirSync(dataDir, { recursive: true });
  pgliteInstance = new PGlite(dataDir);
  return pgliteInstance;
}

function isPgliteDebug() {
  return process.env.PGLITE_DEBUG === 'true' || process.env.LOG_LEVEL === 'debug';
}

function pgliteLog(...args) {
  if (isPgliteDebug()) console.log(...args);
}

async function ensureLedger(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS __migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query('ALTER TABLE __migrations ADD COLUMN IF NOT EXISTS checksum TEXT');
}

async function publicTableCount(db) {
  const { rows } = await db.query(`
    SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__migrations'
  `);
  return rows[0]?.count ?? 0;
}

/**
 * Recusa diretórios de demo criados pelo modo beta antigo. Sem isso, o mesmo
 * `.data/pglite` continuaria abrindo com 27 tabelas (ou com um híbrido
 * inconsistente se as migrações falhassem no meio) e a demo se confundiria com
 * o produto — o defeito E7.
 */
async function refuseLegacyOrUnknownSchema(db) {
  const legacy = await db.query('SELECT filename FROM __migrations WHERE filename LIKE $1', [LEGACY_BETA_MARKER_LIKE]);
  const known = await db.query("SELECT count(*)::int AS count FROM __migrations WHERE filename LIKE '___-%'");
  const tables = await publicTableCount(db);
  const hasLegacyMarker = legacy.rows.length > 0;
  const hasRealMigrations = (known.rows[0]?.count ?? 0) > 0;
  if (hasLegacyMarker) {
    throw new Error(
      'pglite_legacy_beta_schema: este diretório foi criado pelo modo beta antigo (db/beta-pglite-init.sql, 27 tabelas). ' +
      'A demo usa o schema real pelas migrações e não atualiza o schema mínimo in-place. ' +
      'Apague o diretório do PGlite (padrão: .data/pglite) ou use o reset do lançador (ex.: npm run demo:reset) e suba de novo.',
    );
  }
  if (tables > 0 && !hasRealMigrations) {
    throw new Error(
      'pglite_unknown_schema: o diretório do PGlite tem tabelas mas nenhuma migração registrada. ' +
      'Não é possível provar de onde veio esse schema; apague o diretório (padrão: .data/pglite) e suba de novo.',
    );
  }
}

async function applyMigrations(db) {
  const files = listMigrationFiles();
  if (files.length === 0) {
    throw new Error(`pglite_migrations_missing: nenhum arquivo de migração em ${MIGRATIONS_DIR}`);
  }
  const recorded = new Map();
  const { rows } = await db.query("SELECT filename, checksum FROM __migrations WHERE filename LIKE '___-%'");
  for (const row of rows) recorded.set(row.filename, row.checksum);
  const mismatched = [];
  let appliedNow = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = migrationChecksum(sql);
    if (recorded.has(file)) {
      const previous = recorded.get(file);
      // Sem checksum gravado (ledger antigo) não há como provar deriva; com
      // checksum, arquivo editado depois de aplicado é recusa explícita — a
      // mesma regra do migrador PostgreSQL (001–181 imutáveis).
      if (previous && previous !== checksum) mismatched.push(file);
      continue;
    }
    try {
      await db.exec(sql);
    } catch (error) {
      try { await db.exec('ROLLBACK'); } catch {}
      throw new Error(`pglite_migration_failed ${file}: ${String(error.message).slice(0, 240)}`);
    }
    await db.query(
      'INSERT INTO __migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum',
      [file, checksum],
    );
    appliedNow += 1;
    pgliteLog(`[PGlite] applied ${file}`);
  }
  if (mismatched.length > 0) {
    throw new Error(
      `pglite_migration_checksum_mismatch: ${mismatched.join(', ')} — migração já aplicada mudou de conteúdo. ` +
      'Restaure o arquivo ou recrie o diretório do PGlite; não reescreva migração aplicada.',
    );
  }
  return { files: files.length, appliedNow };
}

/**
 * Conteúdo de demonstração (identidade staff sintética), nunca schema. O schema
 * é 100% migração; isso só preserva o estado que a demo beta já tinha.
 */
async function applyDemoSeed(db) {
  if (!fs.existsSync(DEMO_SEED_PATH)) return false;
  const marker = await db.query('SELECT filename FROM __migrations WHERE filename = $1', [DEMO_SEED_MARKER]);
  if (marker.rows.length > 0) return false;
  await db.exec(fs.readFileSync(DEMO_SEED_PATH, 'utf8'));
  await db.query('INSERT INTO __migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [DEMO_SEED_MARKER]);
  return true;
}

async function runMigrationsIfNeeded() {
  const db = getPGliteInstance();
  await ensureLedger(db);
  await refuseLegacyOrUnknownSchema(db);
  const { files, appliedNow } = await applyMigrations(db);
  const seeded = await applyDemoSeed(db);
  const tables = await publicTableCount(db);
  schemaInfo = { migrationFiles: files, appliedNow, demoSeedApplied: seeded, tables };
  pgliteLog(`[PGlite] schema pronto: ${files} migrações, ${tables} tabelas (${appliedNow} aplicadas agora)`);
  return schemaInfo;
}

let queryQueue = Promise.resolve();

function createPoolWrapper() {
  if (poolWrapper) return poolWrapper;
  const db = getPGliteInstance();

  // Wrapper mimics pg.Pool minimal API used in project — serializa queries para evitar deadlock PGlite single-thread
  // Logs silenciados por padrão, só aparecem com PGLITE_DEBUG=true ou LOG_LEVEL=debug
  const wrapper = {
    __isPGlite: true,
    async query(text, params) {
      const shortText = text.slice(0, 80).replace(/\s+/g, ' ');
      // Serializa via chain para PGlite não receber queries concorrentes
      const task = async () => {
        const start = Date.now();
        try {
          const result = await db.query(text, params);
          if (result && typeof result.affectedRows === 'number' && !('rowCount' in result)) {
            result.rowCount = result.affectedRows;
          }
          if (!result.rows) result.rows = [];
          if (isPgliteDebug()) {
            // console.log(`[PGlite Q] ${shortText} ${Date.now()-start}ms rows=${result.rows.length}`);
          }
          return result;
        } catch (err) {
          if (isPgliteDebug()) {
            console.warn(`[PGlite Q] ERROR ${shortText} ${Date.now()-start}ms`, err.message?.slice(0, 200));
          }
          err.code = err.code || 'PGLITE_ERROR';
          throw err;
        }
      };
      // Encadeia
      const run = queryQueue.then(task, task);
      // Mantém chain mesmo se falhar, para não quebrar próximos
      queryQueue = run.catch(() => {});
      return run;
    },
    async connect() {
      // Return client that uses same db, with release no-op
      const client = {
        __isPGliteClient: true,
        query: (t, p) => wrapper.query(t, p),
        release: () => {},
      };
      // Add support for BEGIN/COMMIT/ROLLBACK via query
      return client;
    },
    // For observability wrapPool compatibility
    async end() {
      await db.close();
    }
  };
  poolWrapper = wrapper;
  return wrapper;
}

export async function getPGlitePool() {
  // Fail-closed: o marcador só é gravado DEPOIS do sucesso. Antes, uma falha no
  // meio do bootstrap deixava o processo "migrado" e servindo um schema parcial.
  if (!globalThis.__pgliteMigrated) {
    await runMigrationsIfNeeded();
    globalThis.__pgliteMigrated = true;
  }
  const wrapper = createPoolWrapper();
  wrapper.schema = schemaInfo;
  return wrapper;
}

export function getPGliteInstanceRaw() {
  return getPGliteInstance();
}

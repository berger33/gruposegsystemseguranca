import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

let pgliteInstance = null;
let poolWrapper = null;

const MIGRATIONS_DIR = path.join(process.cwd(), 'db/migrations');
const MIGRATIONS_LIST = [
  '001-site-visual.sql',
  '002-public-leads.sql',
  '003-client-access.sql',
  '004-client-space.sql',
  '005-client-security.sql',
  '006-admin-identities.sql',
  '007-opcao-b-funcionarios.sql',
  '008-document-contract-link.sql',
  '009-mfa-challenge.sql',
  '010-rbac-permissions.sql',
  '011-audit-and-notifications.sql',
  '012-integrations-and-catalog.sql',
  '013-pub03-pub04-lead-enhancements.sql',
  '014-crm-core.sql',
  '015-crm-import.sql',
  '016-crm11-catalog-enrichment.sql',
  '017-crm12-equipment.sql',
  '018-crm13-inspection.sql',
  '019-crm14-labor-budget.sql',
  '020-crm15-technical-budget.sql',
  '021-crm16-cost-parameters.sql',
  '022-crm17-price-scenarios.sql',
  '023-crm18-discount-tiers.sql',
  '024-crm19-proposals.sql',
  '025-crm21-proposal-delivery.sql',
  '026-crm22-acceptance-link.sql',
  '027-crm23-contract-idempotent.sql',
  '028-crm24-reports.sql',
  '029-crm25-goals-commissions.sql',
  '030-crm26-commercial-library.sql',
  '031-crm27-partnerships-renewals.sql',
  '032-con01-contract-units-docs.sql',
  '033-con02-contract-posts-sla.sql',
  '034-con03-contract-status-transitions.sql',
  '035-con04-contract-amendments.sql',
  '036-con05-contract-alerts.sql',
  '037-con06-document-obligations.sql',
  '038-con07-implantation-checklist.sql',
  '039-con08-implantation-blocks.sql',
  '040-con09-contract-closure.sql',
  '041-con10-fiscal-dossier.sql',
  '042-con11-management-diary.sql',
  '043-plt05-notifications.sql',
  '044-plt06-observability.sql',
  '045-plt07-healthcheck.sql',
  '046-plt08-backup.sql',
  '047-plt09-privacy.sql',
  '048-plt10-lgpd-requests.sql',
  '049-plt11-retention.sql',
  '050-plt12-incident-response.sql',
  '051-plt13-config-flags.sql',
  '052-plt14-dependencies.sql',
  '053-plt15-integration-logs.sql',
  '054-plt16-operational-budget.sql',
  '055-plt17-env-isolation.sql',
  '056-plt18-maintenance-docs.sql',
  '057-hr01-cadastro-profissional.sql',
  '058-emp01-perfil-proprio.sql',
  '059-hr03-04-06-recrutamento-talentos-dossie.sql',
  '060-hr07-08-09-desligamento-status-ferias.sql',
  '061-hr10-11-12-afastamentos-ponto-banco-horas.sql',
  '062-hr13-14-15-16-beneficios-adiantamentos-saude-integracao.sql',
  '063-hr17-18-19-20-treinamento-competencias-uniformes-fechamento-dp.sql',
  '064-hr21-22-23-24-holerites-avaliacoes-atendimento-indicadores.sql',
  '065-emp02-03-04-05-plantao-escala-jornada-ausencia.sql',
  '066-emp06-07-08-09-troca-passagem-ocorrencia-procedimentos.sql',
  '067-emp10-11-12-13-documentos-holerites-solicitacoes-uniformes.sql',
  '068-emp14-15-16-17-cursos-comunicados-atendimento-confidencial.sql',
  '069-emp18-19-pwa-faq-acessibilidade.sql',
  '070-ops01-02-03-04-estrutura-dimensionamento-escala-validacao.sql',
  '071-ops05-06-07-08-cobertura-passagem-ocorrencia-checklist.sql',
  '072-ops09-10-11-12-supervisao-ronda-chaves-relatorio.sql',
  '073-ops13-14-15-16-metricas-escalas-limpeza-monitoramento.sql',
  '074-cli01-02-03-04-portal-identidade-contatos-contratos-documentos.sql',
  '075-cli05-06-07-08-chamados-visitas-relatorios.sql',
  '076-cli09-10-11-12-13-14-cobrancas-oportunidade-satisfacao-renovacao-modos-seguranca.sql',
  '077-fin01-02-03-04-contas-receber-pagar-recorrencia-pagamento.sql',
  '078-fin05-06-07-08-conciliacao-cobranca-fluxo-custo.sql',
  '079-fin09-10-11-12-resultado-despesa-fiscal-gateway.sql',
  '080-fin13-14-15-16-orcamento-export-fechamento-comissao.sql',
  '081-adm01-02-03-04-05-06-painel-aprovacao.sql',
  '082-adm07-08-09-10-11-12-busca-relatorios-config-metas-diario-expansao.sql',
  '083-ast01-02-03-04-05-06-estoque-reserva-ativo-entrega-requisicao.sql',
  '084-ast07-08-09-10-11-12-inventario-os-manutencao-cftv-limpeza.sql',
  '085-ext01-02-03-04-05-06-frota-terceiros-licitacoes-fornecedores-qualidade-satisfacao.sql',
  '086-ext07-08-09-10-11-12-compliance-conhecimento-expansao-continuidade-analytics-editor.sql',
  '087-ext13-14-15-16-17-relatorio-inteligencia-emergencial-central-biometria-ai10-automacoes.sql',
  '088-pub06-cms-paginas-faq-cases-blog-vagas.sql',
  '089-pub07-temas-preview-publicacao-rollback-preferencia.sql',
  '090-pub08-seo-sitemap-redirects-dominio-noindex.sql',
  '091-pub09-montador-pacote-comparador-servicos-planos.sql',
  '092-pub10-origem-conversao-ab-test-minimizacao.sql',
  '093-cli15-reclamacao-colaborador-canal-restrito-rh-minimo.sql',
  '094-pub02-pub05-paginas-segmento-faq-assistida-handoff.sql',
  '095-ai-rag-cliente-rh-marcelo-ollama-qwen3-bot-modes.sql',
];

function getPGliteInstance() {
  if (pgliteInstance) return pgliteInstance;
  // Testes podem apontar para um diretório exclusivo sem limpar o PGlite do usuário.
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
function pgliteWarn(...args) {
  if (isPgliteDebug()) console.warn(...args);
}

async function ensureHelpers(db) {
  try {
    await db.exec(`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION crm_set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION notification_queue_set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION integrations_set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION service_catalog_set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION faq_set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  } catch (e) {
    pgliteWarn('[PGlite] helpers creation warning', e.message);
  }
}

async function ensureMigrationsTable(db) {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (e) {
    pgliteWarn('[PGlite] could not create __migrations', e.message);
  }
}

async function runMigrationsIfNeeded() {
  const db = getPGliteInstance();
  await ensureHelpers(db);
  await ensureMigrationsTable(db);

  // BETA mode: usar init simplificado para garantir 1-clique sem Docker
  const betaInitPath = path.join(MIGRATIONS_DIR, '..', 'beta-pglite-init.sql');
  // v2 acrescenta o mínimo de identidade/sessão de staff exigido pelo login
  // endurecido. O marcador novo força uma única reaplicação idempotente em
  // diretórios PGlite beta que já carregaram o init antigo.
  const betaInitMarker = 'beta-pglite-init-v3.sql';
  if (fs.existsSync(betaInitPath)) {
    try {
      const { rows } = await db.query('SELECT filename FROM __migrations WHERE filename=$1', [betaInitMarker]);
      if (rows.length === 0) {
        pgliteLog(`[PGlite] Running ${betaInitMarker} (schema mínimo RAG + sessão staff)`);
        const sql = fs.readFileSync(betaInitPath, 'utf8');
        await db.exec(sql);
        await db.query('INSERT INTO __migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [betaInitMarker]);
        pgliteLog(`[PGlite] ${betaInitMarker} applied — RAG cliente/rh/marcelo/publico + bot modes + sessão staff`);
      } else {
        pgliteLog(`[PGlite] ${betaInitMarker} already applied`);
      }
      pgliteLog('[PGlite] migrations check complete (beta mode — lite)');
      return;
    } catch (e) {
      pgliteWarn('[PGlite] beta init failed, falling back to full migrations', e.message);
    }
  }

  let applied = new Set();
  try {
    const res = await db.query('SELECT filename FROM __migrations');
    applied = new Set(res.rows.map(r => r.filename));
  } catch {}

  for (const file of MIGRATIONS_LIST) {
    if (applied.has(file)) continue;
    const fullPath = path.join(MIGRATIONS_DIR, file);
    if (!fs.existsSync(fullPath)) {
      pgliteWarn(`[PGlite] migration missing ${file}`);
      continue;
    }
    const sql = fs.readFileSync(fullPath, 'utf8');
    try {
      await db.exec(sql);
      await db.query('INSERT INTO __migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [file]);
      pgliteLog(`[PGlite] applied ${file}`);
    } catch (err) {
      pgliteWarn(`[PGlite] bulk exec failed for ${file}: ${err.message}, marking as applied for beta`);
      try { await db.query('INSERT INTO __migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]); } catch {}
    }
  }
  pgliteLog('[PGlite] migrations check complete');
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
  const db = getPGliteInstance();
  // Ensure migrations on first call
  if (!globalThis.__pgliteMigrated) {
    globalThis.__pgliteMigrated = true;
    await runMigrationsIfNeeded();
  }
  return createPoolWrapper();
}

export function getPGliteInstanceRaw() {
  return getPGliteInstance();
}

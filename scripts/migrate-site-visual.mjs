// Migrações completas PostgreSQL. Nunca conecta a um banco remoto sem opt-in explícito.
// Para ensaio QA: QA_MIGRATION_ONLY=true DATABASE_MIGRATION_URL=postgres://.../seg_qa_... npm run db:migrate
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root);
const dir = path.join(root, 'db/migrations');
const files = [
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
  '096-ai-rag-feedback-custo-token-rollback.sql',
  '097-client-mfa-session.sql',
  '098-client-manual-verification.sql',
  '099-sec-staff-session-hardening.sql',
  '100-l02-local-outbox.sql',
  '101-l02-document-integrity.sql',
  '102-l03-employee-self-service-security.sql',
  '103-l04-comercial-role-widening.sql',
  '104-crm-task-audit.sql',
  '105-crm-interaction-audit.sql',
  '106-crm-interaction-follow-up.sql',
  '107-crm-visit-agenda.sql',
  '108-crm-manual-cadences.sql',
  '109-crm-task-delegation.sql',
  '110-crm-visit-conflict-lead-link.sql',
  '111-crm-opportunity-notes-reopen.sql',
  '112-pub08-seo-redirect-audit-action.sql',
  '113-crm-01-04-audit-actions.sql',
  '114-crm-02-contact-update-audit.sql',
  '115-crm-01-unit-audit.sql',
  '116-crm-03-dedup-review.sql',
  '117-l04-publication-portfolio.sql',
  '118-l05-contract-canonicalization.sql',
  '119-l06-operacao-hardening.sql',
  '120-l06-fatia-b-operacao.sql',
  '121-l06-fatia-c-patrimonio.sql',
  '122-l06-fatia-d-manutencao.sql',
  '123-l06-fatia-e-operacao-avancada.sql',
  '124-fin05-conciliation-hardening.sql',
  '125-fin06-collection-hardening.sql',
  '126-fin07-cashflow-aging-hardening.sql',
  '127-fin08-cost-allocation-hardening.sql',
  '128-fin09-management-result-hardening.sql',
  '129-fin10-expense-hardening.sql',
  '130-fin11-fiscal-hardening.sql',
  '131-fin12-gateway-hardening.sql',
  '132-fin13-budget-hardening.sql'
];

async function main() {
  const actual = (await readdir(dir)).filter(f => /^\d{3}-.*\.sql$/.test(f)).sort();
  if (files.length !== 132 || files.some((file, i) => actual[i] !== file) || actual.length !== files.length) {
    throw new Error('migration_manifest_mismatch: compare 001–132 with db/migrations before connecting');
  }
  const urlText = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!urlText) throw new Error('DATABASE_MIGRATION_URL or DATABASE_URL is required');
  const url = new URL(urlText);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('postgres_url_required');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && process.env.ALLOW_REMOTE_MIGRATIONS !== 'true') {
    throw new Error('remote_database_refused: requires separately authorized ALLOW_REMOTE_MIGRATIONS=true');
  }
  if (process.env.QA_MIGRATION_ONLY === 'true' && !decodeURIComponent(url.pathname.slice(1)).startsWith('seg_qa_')) {
    throw new Error('qa_database_name_required: seg_qa_ prefix');
  }
  const pool = new pg.Pool({ connectionString: urlText, max: 1 });
  let client;
  try {
    client = await pool.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS __migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('ALTER TABLE __migrations ADD COLUMN IF NOT EXISTS checksum TEXT');
    for (const filename of files) {
      const sql = await readFile(path.join(dir, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(71426928)');
        const existing = await client.query('SELECT checksum FROM __migrations WHERE filename=$1', [filename]);
        if (existing.rows.length) {
          if (existing.rows[0].checksum !== checksum) throw new Error(`migration_checksum_mismatch: ${filename}`);
          await client.query('COMMIT');
          console.log(`Already applied: ${filename}`);
          continue;
        }
        await client.query(sql);
        await client.query('INSERT INTO __migrations (filename, checksum) VALUES ($1,$2)', [filename, checksum]);
        await client.query('COMMIT');
        console.log(`Applied: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        if (process.env.QA_MIGRATION_ONLY === 'true' && error.position) {
          const line = sql.slice(0, Number(error.position) - 1).split('\n').length;
          console.error(`QA_SQL_LOCATION: ${filename}:${line} (posição ${error.position})`);
        }
        throw error;
      }
    }
    console.log('Migration ledger verified: 001–132 (PostgreSQL only)');
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});

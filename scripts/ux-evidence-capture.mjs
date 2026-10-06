#!/usr/bin/env node
// UX — captura de evidência visual e de acessibilidade básica.
//
// O que este script PROVA: que a rota renderiza no Chromium real, autenticada
// por uma sessão de staff criada pelo fluxo real de login, com o servidor e o
// PostgreSQL descartáveis deste gate; que não há rolagem horizontal do
// documento nas larguras testadas; que o primeiro elemento focável recebe foco
// visível por teclado; e que nenhum erro de console ou resposta 5xx apareceu.
//
// O que este script NÃO prova: jornada de negócio completa, homologação
// humana, conformidade WCAG integral ou comportamento em produção. Dados são
// fictícios e o banco é destruído ao final.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from '../tests/helpers/staff-login.mjs';

const root = path.resolve(import.meta.dirname, '..');

if (!process.env.DATABASE_URL) {
  console.error('UX_EVIDENCE_REFUSED: rode por `npm run ux:evidence`, que cria um PostgreSQL descartável.');
  process.exit(2);
}

const stage = (process.argv.find(arg => arg.startsWith('--stage='))?.split('=')[1] || 'ux-03b').trim();

/** Cada etapa declara as rotas, o papel usado e o que será observado. */
const STAGES = {
  'ux-03b': {
    outputDir: 'docs/ux-03b-evidencias',
    targets: [
      { route: '/admin/crm', role: 'comercial', slug: 'crm', waitFor: 'Empresas e oportunidades' },
      { route: '/admin/carteira', role: 'comercial', slug: 'carteira', waitFor: 'Carteira e próximos contatos' },
      { route: '/admin/comercial', role: 'comercial', slug: 'comercial', waitFor: 'Vistoria, orçamento, proposta e contrato' },
    ],
  },
  'ux-04': {
    outputDir: 'docs/ux-04-evidencias',
    targets: [
      { route: '/admin/funcionarios', role: 'rh', slug: 'rh', waitFor: 'Pessoas e jornada do funcionário' },
    ],
  },
  'ux-05': {
    outputDir: 'docs/ux-05-evidencias',
    targets: [
      // O texto precisa ser exclusivo do corpo da página: em 390px o menu
      // lateral fica no DOM porém oculto, e "Painel" casaria primeiro com um
      // item invisível do menu, fazendo a espera por visibilidade estourar.
      { route: '/admin/marcelo', role: 'marcelo', slug: 'marcelo', waitFor: 'Que período você quer apurar?' },
    ],
  },
  'ux-08': {
    outputDir: 'docs/ux-08-evidencias',
    targets: [
      { route: '/admin/ti', role: 'ti', slug: 'ti', waitFor: 'Console de TI' },
    ],
  },
  'ux-07-operacao': {
    outputDir: 'docs/ux-07-operacao-evidencias',
    targets: [
      { route: '/admin/operacao', role: 'ti', slug: 'operacao', waitFor: 'Operação — controle e gestão operacional' },
    ],
  },
  'ux-07-financeiro': {
    outputDir: 'docs/ux-07-financeiro-evidencias',
    targets: [
      { route: '/admin/financeiro', role: 'financeiro', slug: 'financeiro', waitFor: 'Financeiro — contas, recorrência e baixas' },
    ],
  },
  // Só a lista entra aqui: o detalhe depende de um contrato existente, e esta
  // captura não inventa massa. A evidência do detalhe vem do gate
  // tests/ux-contract-workspace.integration.test.mjs (UX_CONTRACT_EVIDENCE_DIR).
  'ux-07-contratos': {
    outputDir: 'docs/ux-07-contratos-evidencias',
    targets: [
      { route: '/admin/contratos', role: 'admin', slug: 'contratos', waitFor: 'Contratos e implantação' },
    ],
  },
  'ux-07-inteligencia-comercial': {
    outputDir: 'docs/ux-07-inteligencia-comercial-evidencias',
    targets: [
      { route: '/admin/inteligencia', role: 'admin', slug: 'inteligencia-comercial', waitFor: 'Inteligência comercial', waitForRole: 'heading' },
    ],
  },
  // UX-07 / EXT-11 / F07. A captura usa o h1 real da tela de produto como
  // marca de montagem; o banco desta etapa é limpo, então o estado observado é
  // o VAZIO HONESTO ("a leitura funcionou e nenhum experimento está
  // registrado"). A jornada com massa real é coberta pelo gate
  // tests/ux-analytics-workspace.integration.test.mjs
  // (UX_ANALYTICS_EVIDENCE_DIR). Cobertura parcial declarada no documento.
  'ux-07-analytics': {
    outputDir: 'docs/ux-07-analytics-evidencias',
    targets: [
      { route: '/admin/analytics', role: 'admin', slug: 'analytics', waitFor: 'Analytics e experimentos A/B controlados', waitForRole: 'heading' },
    ],
  },
  // UX-07 / EXT-05. Mesma convenção da etapa de analytics: o h1 real da tela
  // de produto é a marca de montagem; o banco desta etapa é limpo, então o
  // estado observado é o VAZIO HONESTO ("a leitura funcionou e nenhuma não
  // conformidade está registrada"). A jornada com massa real é coberta pelo
  // gate tests/ux-quality-workspace.integration.test.mjs
  // (UX_QUALITY_EVIDENCE_DIR). Cobertura parcial declarada no documento.
  // EXT-05 não tem gatilho de provisionamento por papel (a migração 172 só
  // preservou operadores existentes): o grant explícito abaixo reproduz o
  // provisionamento administrativo real, igual ao da suíte herdada
  // tests/ext05-quality.integration.test.mjs. Sem ele a captura mostraria a
  // recusa 403 — estado honesto, mas não o objetivo desta evidência.
  'ux-07-qualidade': {
    outputDir: 'docs/ux-07-qualidade-evidencias',
    targets: [
      { route: '/admin/qualidade', role: 'admin', slug: 'qualidade', waitFor: 'Qualidade e não conformidades internas', waitForRole: 'heading', grants: ['quality.read', 'quality.write'] },
    ],
  },
  // UX-07 / EXT-07. Mesma convenção das etapas de analytics e qualidade: o h1
  // real da tela de produto é a marca de montagem; o banco desta etapa é
  // limpo, então o estado observado é o VAZIO HONESTO ("a leitura funcionou e
  // nenhuma obrigação está declarada"). A jornada com massa real é coberta
  // pelo gate tests/ux-compliance-workspace.integration.test.mjs
  // (UX_COMPLIANCE_EVIDENCE_DIR). Cobertura parcial declarada no documento.
  // EXT-07 NÃO usa permissão granular por grant: o servidor canônico decide
  // por sessão de equipe e papel (admin/ti). Por isso esta etapa não declara
  // o gancho opcional `grants` — ele seria no-op aqui.
  'ux-07-compliance': {
    outputDir: 'docs/ux-07-compliance-evidencias',
    targets: [
      { route: '/admin/compliance', role: 'admin', slug: 'compliance', waitFor: 'Compliance corporativo e obrigações internas', waitForRole: 'heading' },
    ],
  },
};

const plan = STAGES[stage];
if (!plan) {
  console.error(`UX_EVIDENCE_UNKNOWN_STAGE: ${stage}. Disponíveis: ${Object.keys(STAGES).join(', ')}`);
  process.exit(2);
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: chosen } = probe.address();
      probe.close(() => resolve(chosen));
    });
  });
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const workDir = await mkdtemp(path.join(tmpdir(), 'seg-ux-evidence-'));
const outputDir = path.join(root, plan.outputDir);
await mkdir(outputDir, { recursive: true });

const server = spawn(process.execPath, ['server.mjs', '--dev'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    BIND_HOST: '127.0.0.1',
    NODE_ENV: 'development',
    NEXT_DIST_DIR: '.next/ux-evidence',
    SITE_ADMIN_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
    EMPLOYEE_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
    ADMIN_LOGIN_MAX_ATTEMPTS: '200',
    OLLAMA_ENABLED: 'false',
    MAIL_HOST: '',
    SITE_ADMIN_LEGACY_TOKENS: '',
    NEXT_TELEMETRY_DISABLED: '1',
    CLIENT_DOCS_DIR: path.join(workDir, 'private-documents'),
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
server.stderr.on('data', chunk => { if (process.env.UX_VERBOSE === '1') process.stderr.write(chunk); });

async function waitForServer(timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/session`);
      if ([200, 401].includes(response.status)) return;
    } catch { /* ainda subindo */ }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('server_did_not_start');
}

async function loginCookie(email) {
  const response = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: baseUrl },
    body: JSON.stringify({ email, password: STAFF_TEST_PASSWORD }),
  });
  if (response.status !== 200) throw new Error(`staff_login_failed_${response.status}`);
  const cookies = response.headers.getSetCookie?.() || [];
  return cookies.map(value => value.split(';')[0]).join('; ');
}

const report = [];
let exitCode = 0;
let pool;

try {
  await waitForServer();
  console.log(`UX_EVIDENCE_SERVER_READY ${baseUrl}`);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

  const cookieByRole = new Map();
  for (const target of plan.targets) {
    if (cookieByRole.has(target.role)) continue;
    const staff = await provisionStaff(pool, { role: target.role });
    // Famílias sem gatilho de provisionamento por papel declaram `grants` no
    // alvo; o insert reproduz o provisionamento administrativo real e fica
    // registrado em auth_permissions como qualquer grant auditável.
    const grants = [...new Set(plan.targets.filter(t => t.role === target.role).flatMap(t => t.grants || []))];
    for (const permission of grants) {
      await pool.query(
        `INSERT INTO auth_permissions(id,identity_id,permission,scope_type,granted_by,granted_by_role,reason)
         VALUES($1,$2,$3,'global',$2,$4,'Evidência UX: provisionamento administrativo da etapa')`,
        [randomUUID(), staff.id, permission, target.role],
      );
    }
    cookieByRole.set(target.role, await loginCookie(staff.email));
  }

  // O Chromium empacotado roda com --single-process: reaproveitar o mesmo
  // browser para vários contextos derruba o alvo. Cada captura ganha o seu,
  // seguindo a convenção já adotada pelos testes f03 deste repositório.
  const launchBrowser = async () => playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });

  for (const target of plan.targets) {
    for (const viewport of VIEWPORTS) {
      const browser = await launchBrowser();
      try {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          locale: 'pt-BR',
        });
        const cookie = cookieByRole.get(target.role);
        const pair = cookie.split('; ')[0];
        const separator = pair.indexOf('=');
        await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
        const page = await context.newPage();
        const startedAt = Date.now();
        console.log(`UX_EVIDENCE_CAPTURING ${target.route} ${viewport.name}`);
        page.setDefaultTimeout(45_000);
        page.setDefaultNavigationTimeout(90_000);
        const problems = [];
        // Recursos de terceiros (ex.: Google Fonts) não têm saída de rede neste
        // ambiente. Isso é limitação do sandbox, não defeito da página: fica
        // registrado em campo separado em vez de contaminar os problemas reais.
        const externalBlocked = [];
        page.on('console', message => {
          if (message.type() !== 'error') return;
          const text = message.text().slice(0, 180);
          const origin = message.location()?.url || '';
          if (origin && !origin.startsWith(baseUrl)) {
            externalBlocked.push(`console (${origin.slice(0, 80)}): ${text}`);
            return;
          }
          problems.push(`console: ${text}`);
        });
        page.on('response', response => { if (response.status() >= 500) problems.push(`http ${response.status()} ${response.url()}`); });
        page.on('requestfailed', request => {
          const url = request.url();
          const entry = `${url.replace(baseUrl, '')} (${request.failure()?.errorText || 'sem detalhe'})`;
          if (url.startsWith(baseUrl)) problems.push(`requisição falhou: ${entry}`);
          else externalBlocked.push(`recurso externo bloqueado: ${entry}`);
        });

        try {
          await page.goto(`${baseUrl}${target.route}`, { waitUntil: 'domcontentloaded' });
        } catch (cause) {
          problems.push(`navegação falhou: ${String(cause?.message || cause).slice(0, 120)}`);
        }
        if (target.waitFor) {
          const expected = target.waitForRole === 'heading'
            ? page.getByRole('heading', { name: target.waitFor, exact: true })
            : page.getByText(target.waitFor, { exact: false }).first();
          await expected.waitFor({ timeout: 60_000 }).catch(() => {
            problems.push(`texto esperado ausente: ${target.waitFor}`);
          });
        }
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(600);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        if (overflow.scrollWidth > overflow.clientWidth + 1) {
          // Nomear o culpado: sem isto a evidência diz "transborda" e não ajuda a corrigir.
          const culprits = await page.evaluate(limit => {
            const found = [];
            for (const element of document.querySelectorAll('body *')) {
              const rect = element.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) continue;
              if (rect.right <= limit + 1) continue;
              found.push({
                selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`,
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                text: (element.textContent || '').trim().slice(0, 40),
              });
            }
            return found.slice(0, 6);
          }, overflow.clientWidth);
          const detail = culprits.map(item => `${item.selector}@${item.right}px`).join(' , ') || 'elemento não identificado';
          problems.push(`rolagem horizontal do documento: ${overflow.scrollWidth} > ${overflow.clientWidth} (${detail})`);
        }

        // Teclado: Tab precisa mover o foco para um elemento real e visível.
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) return null;
          const style = window.getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            text: (element.textContent || '').trim().slice(0, 60),
            outline: style.outlineStyle,
          };
        });
        if (!focus) problems.push('Tab não moveu o foco para nenhum elemento');

        const file = path.join(outputDir, `${viewport.name}-${target.slug}.png`);
        await page.screenshot({ path: file, fullPage: false });

        report.push({
          stage,
          route: target.route,
          role: target.role,
          viewport: `${viewport.width}x${viewport.height}`,
          screenshot: path.relative(root, file),
          firstFocus: focus,
          problems,
          externalBlocked,
        });
        console.log(`UX_EVIDENCE_CAPTURED ${target.route} ${viewport.name} em ${Math.round((Date.now() - startedAt) / 1000)}s`);
        if (problems.length) exitCode = 1;
        await context.close();
      } finally {
        await browser.close();
      }
    }
  }

  const summaryPath = path.join(outputDir, 'resumo.json');
  await writeFile(summaryPath, `${JSON.stringify({ stage, generatedBy: 'scripts/ux-evidence-capture.mjs', entries: report }, null, 2)}\n`, 'utf8');
  for (const entry of report) {
    const external = entry.externalBlocked.length ? ` [externos ignorados: ${entry.externalBlocked.length}]` : '';
    console.log(`UX_EVIDENCE ${entry.route} ${entry.viewport} ${entry.problems.length ? `PROBLEMAS: ${entry.problems.join(' | ')}` : 'OK'}${external}`);
  }
  console.log(`UX_EVIDENCE_SUMMARY: ${path.relative(root, summaryPath)}`);
} catch (error) {
  console.error('UX_EVIDENCE_FAILED', String(error?.message || error).slice(0, 400));
  exitCode = 1;
} finally {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 400));
    server.kill('SIGKILL');
  }
  await rm(workDir, { recursive: true, force: true });
}

process.exit(exitCode);

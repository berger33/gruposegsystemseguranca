// L03 — EMP-01..19 / HR-01..24: HTTP real + PostgreSQL descartável.
// SQL é usado somente para fixture sintética ou conferência de efeito interno;
// identidade, escopo, documentos e revogação são exercitados pelo servidor real.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionAndLoginStaff } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
let server, baseUrl, pool, workDir;

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/admin/session`);
      if ([200, 401].includes(response.status)) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('server_did_not_start');
}

async function api(pathname, { method = 'GET', body, cookie, raw = false } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      // Os módulos HR legados exigem origem inclusive em GET; o browser real a envia.
      origin: baseUrl,
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  const setCookie = response.headers.getSetCookie?.()
    || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  if (raw) return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers, setCookie };
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: response.headers, setCookie };
}

function cookieOf(response) {
  return response.setCookie.map(value => value.split(';')[0]).join('; ');
}

before(async () => {
  if (!RUN) return;
  workDir = await mkdtemp(path.join(tmpdir(), 'seg-l03-'));
  const port = 3400 + Math.floor(Math.random() * 1500);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-l03',
      SITE_ADMIN_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
      EMPLOYEE_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
      EMPLOYEE_DOCS_DIR: path.join(workDir, 'employee-private-documents'),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      SITE_ADMIN_LEGACY_TOKENS: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', chunk => {
    if (process.env.QA_VERBOSE === '1') process.stderr.write(chunk);
  });
  await waitForServer(baseUrl);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 300));
    server.kill('SIGKILL');
  }
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

async function createEmployee(cookie, suffix, remuneration) {
  const response = await api('/api/hr/employees', {
    method: 'POST', cookie,
    body: {
      matricula: `QA-L03-${suffix}-${randomUUID().slice(0, 6)}`,
      display_name: `Funcionário Sintético ${suffix}`,
      cargo: 'Vigilante', employment_type: 'clt', status: 'ativo',
      empregador: 'Empresa sintética local', lotacao: 'Unidade QA',
      contact_email: `func-${suffix.toLowerCase()}-${randomUUID().slice(0, 6)}@exemplo.invalid`,
      remuneracao_atual: remuneration,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.employee;
}

async function provisionEmployee(cookie, employee, suffix) {
  const email = `portal-${suffix.toLowerCase()}-${randomUUID().slice(0, 6)}@exemplo.invalid`;
  const provisioned = await api(`/api/admin/hr/employees/${employee.id}/access`, {
    method: 'POST', cookie, body: { email },
  });
  assert.equal(provisioned.status, 201, JSON.stringify(provisioned.body));
  const login = await api('/api/employee/session', {
    method: 'POST', body: { email, password: provisioned.body.temporaryPassword },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { ...provisioned.body, cookie: cookieOf(login) };
}

async function exerciseInterfaces({ staffCookie }) {
  const browser = await playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    // O pacote serverless inclui --disable-web-security, que removeria Origin
    // dos POSTs e mascararia a proteção CSRF exercitada neste percurso.
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const page = await context.newPage();
    const interfaceFailures = [];
    let expectingMissingEmployee = false;
    let expectingRevokedEmployee = false;
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      const expectedMissingEmployeeSession = pathname === '/api/employee/session' && response.status() === 401;
      const expectedRevokedHome = (expectingMissingEmployee || expectingRevokedEmployee) && pathname === '/api/employee/home' && response.status() === 401;
      if (pathname.startsWith('/api/') && response.status() >= 400 && !expectedMissingEmployeeSession && !expectedRevokedHome) {
        interfaceFailures.push(`${response.status()} ${pathname}`);
      }
    });
    const staffPair = staffCookie.split(';')[0];
    const separator = staffPair.indexOf('=');
    await context.addCookies([{ name: staffPair.slice(0, separator), value: staffPair.slice(separator + 1), url: baseUrl }]);

    async function openAdmin() {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Pessoas e jornada do funcionário' }).waitFor();
      await page.waitForTimeout(800); // cabeçalho é SSR; aguarda hidratação
    }
    // UX-04 transformou as frentes do RH num tablist de verdade: os destinos
    // deixaram de ser `button` e passaram a ser `tab`. O rótulo visível também
    // mudou ("&" virou "e", e os códigos HR-xx saíram do título). Este gate
    // acompanha a cópia nova sem abrir mão de nenhuma asserção de negócio.
    // O título do painel ativo é sempre um h3; o h2 de mesmo texto existe só
    // para leitor de tela (nomeia o tabpanel) e não é visível.
    async function adminTab(name, heading) {
      await page.getByRole('tab', { name, exact: true }).click();
      await page.getByRole('heading', { name: heading, level: 3 }).waitFor();
    }

    // Jornada RH realmente acionada pela interface: cadastro + admissão + acesso.
    await openAdmin();
    await adminTab('Admissão e acesso', 'Novo cadastro profissional');
    const suffix = randomUUID().slice(0, 8);
    const matricula = `UI-L03-${suffix}`;
    const employeeName = `Funcionário Interface ${suffix}`;
    const employeeEmail = `interface-${suffix}@exemplo.invalid`;
    const admissionForm = page.getByRole('heading', { name: 'Novo cadastro profissional' }).locator('..').locator('form');
    await admissionForm.locator('[name="matricula"]').fill(matricula);
    await admissionForm.locator('[name="display_name"]').fill(employeeName);
    await admissionForm.locator('[name="cargo"]').fill('Vigilante');
    await admissionForm.locator('[name="lotacao"]').fill('Unidade Interface');
    await admissionForm.locator('[name="empregador"]').fill('Empresa sintética local');
    await admissionForm.locator('[name="admission_date"]').fill('2026-10-01');
    const admissionCreated = page.waitForResponse(r => new URL(r.url()).pathname === '/api/hr/admissions' && r.request().method() === 'POST' && r.status() === 201);
    await admissionForm.getByRole('button', { name: 'Criar cadastro e abrir admissão' }).click();
    await admissionCreated;
    const { rows: uiEmployees } = await pool.query('SELECT id FROM hr_employees WHERE matricula=$1', [matricula]);
    assert.equal(uiEmployees.length, 1, 'a admissão feita na tela deve persistir um cadastro profissional');
    const uiEmployeeId = uiEmployees[0].id;

    const accessForm = page.getByRole('heading', { name: 'Criar acesso do funcionário' }).locator('..').locator('form');
    await accessForm.locator('[name="employeeId"]').selectOption(uiEmployeeId);
    await accessForm.locator('[name="email"]').fill(employeeEmail);
    const accessCreated = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(`/employees/${uiEmployeeId}/access`) && r.status() === 201);
    await accessForm.getByRole('button', { name: 'Gerar credencial temporária' }).click();
    await accessCreated;
    await page.getByText('Credencial temporária — exibida uma única vez').waitFor();
    const temporaryPassword = (await page.locator('code').innerText()).trim();
    assert.ok(temporaryPassword.length >= 12);

    await adminTab('Escala', 'Publicar escala versionada');
    const scheduleForm = page.getByRole('heading', { name: 'Publicar escala versionada' }).locator('..').locator('form');
    await scheduleForm.locator('[name="employeeId"]').selectOption(uiEmployeeId);
    await scheduleForm.locator('[name="title"]').fill(`Escala Interface ${suffix}`);
    await scheduleForm.locator('[name="location"]').fill('Portaria Central');
    await scheduleForm.locator('[name="periodStart"]').fill('2026-10-01');
    await scheduleForm.locator('[name="periodEnd"]').fill('2026-10-31');
    await scheduleForm.locator('[name="entryDate"]').fill('2026-10-15');
    await scheduleForm.locator('[name="startTime"]').fill('08:00');
    await scheduleForm.locator('[name="endTime"]').fill('20:00');
    const schedulePublished = page.waitForResponse(r => new URL(r.url()).pathname === '/api/hr/schedule-versions' && r.request().method() === 'PATCH' && r.status() === 200);
    await scheduleForm.getByRole('button', { name: 'Criar versão, incluir turno e publicar' }).click();
    await schedulePublished;
    const timeEntryId = randomUUID();
    await pool.query(`INSERT INTO hr_time_entries(id,employee_id,entry_date,clock_in,clock_out,hours_worked,source,status,competence) VALUES($1,$2,'2026-10-15','08:10','20:00',11.83,'manual','aprovado','2026-10')`, [timeEntryId, uiEmployeeId]);

    // Acesso móvel próprio, incluindo troca obrigatória da senha temporária.
    expectingMissingEmployee = true;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/funcionario`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
    await page.waitForTimeout(500);
    await page.getByLabel('E-mail').fill(employeeEmail);
    await page.getByLabel('Senha').fill(temporaryPassword);
    const temporaryLogin = page.waitForResponse(r => new URL(r.url()).pathname === '/api/employee/session' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Entrar com segurança' }).click();
    const temporaryLoginResponse = await temporaryLogin;
    assert.equal(temporaryLoginResponse.status(), 200, await temporaryLoginResponse.text());
    await page.getByRole('heading', { name: 'Troque a senha temporária' }).waitFor();
    const newPassword = `Interface-${randomUUID()}!`;
    await page.locator('[name="current"]').fill(temporaryPassword);
    await page.locator('[name="next"]').fill(newPassword);
    const passwordChanged = page.waitForResponse(r => new URL(r.url()).pathname === '/api/employee/session/password' && r.status() === 200);
    await page.getByRole('button', { name: 'Trocar senha' }).click();
    await passwordChanged;
    await page.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
    await page.getByLabel('E-mail').fill(employeeEmail);
    await page.getByLabel('Senha').fill(newPassword);
    await page.getByRole('button', { name: 'Entrar com segurança' }).click();
    await page.getByText(new RegExp(`Olá, ${employeeName.split(' ')[0]}`)).waitFor();
    expectingMissingEmployee = false;

    // Documento enviado pelo titular.
    await page.getByRole('tab', { name: /Docs$/ }).click();
    const documentTitle = `Documento interface ${suffix}`;
    const uploadForm = page.getByRole('heading', { name: 'Enviar documento' }).locator('..').locator('form');
    await uploadForm.locator('[name="title"]').fill(documentTitle);
    await uploadForm.locator('[name="category"]').selectOption('admissao');
    await uploadForm.locator('[name="file"]').setInputFiles({ name: 'documento-interface.txt', mimeType: 'text/plain', buffer: Buffer.from(`documento privado ${suffix}`) });
    const documentUploaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/employee/documents' && r.request().method() === 'POST' && r.status() === 201);
    await uploadForm.getByRole('button', { name: 'Enviar para revisão' }).click();
    await documentUploaded;

    // Revisão acontece na tela RH, não por chamada auxiliar do teste.
    await openAdmin();
    await adminTab('Documentos', /^Documentos privados/);
    const documentRow = page.locator('tr').filter({ hasText: documentTitle });
    await documentRow.waitFor();
    const documentReviewed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/hr/l03/documents' && r.request().method() === 'PATCH' && r.status() === 200);
    await documentRow.getByRole('button', { name: 'Aprovar' }).click();
    await documentReviewed;

    // Ciência de escala, correção de jornada, ausência e fila offline pela UI móvel.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/funcionario`, { waitUntil: 'domcontentloaded' });
    await page.getByText(new RegExp(`Olá, ${employeeName.split(' ')[0]}`)).waitFor();
    await page.getByRole('tab', { name: /Jornada$/ }).click();
    const scheduleAck = page.waitForResponse(r => /\/api\/employee\/schedule\/.+\/ack$/.test(new URL(r.url()).pathname) && r.status() === 200);
    await page.getByRole('button', { name: 'Dar ciência' }).click();
    await scheduleAck;
    await page.getByRole('button', { name: 'Solicitar correção' }).click();
    await page.locator('[name="clockIn"]').fill('08:00');
    await page.locator('[name="clockOut"]').fill('20:00');
    await page.locator('[name="reason"]').fill('Relógio registrou horário diferente durante o teste de interface');
    const correctionCreated = page.waitForResponse(r => new URL(r.url()).pathname === '/api/employee/actions/time-correction' && r.status() === 201);
    await page.getByRole('button', { name: 'Enviar correção' }).click();
    await correctionCreated;
    await page.getByRole('tab', { name: /Pedidos$/ }).click();
    const absenceForm = page.getByRole('heading', { name: 'Novo registro' }).locator('..').locator('form');
    await absenceForm.locator('[name="shiftDate"]').fill('2026-10-20');
    await absenceForm.locator('[name="reasonCode"]').selectOption('transporte');
    await absenceForm.locator('[name="details"]').fill('Interrupção sintética do transporte para validar a interface');
    const absenceCreated = page.waitForResponse(r => new URL(r.url()).pathname === '/api/employee/actions/absence' && r.status() === 201);
    await absenceForm.getByRole('button', { name: 'Enviar' }).click();
    await absenceCreated;

    await page.getByRole('tab', { name: /Mais$/ }).click();
    await page.getByRole('heading', { name: 'Uniforme, EPI e equipamento' }).waitFor();
    await page.getByRole('heading', { name: 'FAQ interno' }).waitFor();
    const procedureAck = page.getByRole('button', { name: 'Confirmar ciência' }).first();
    await procedureAck.waitFor();
    await context.setOffline(true);
    await procedureAck.click();
    await page.getByText(/Ciência guardada neste dispositivo/).waitFor();
    assert.equal(await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => JSON.parse(localStorage.getItem(key)||'[]')).flat().length, 'seg.employee.approved-offline.v1.'), 1);
    const receivedOffline = page.waitForResponse(r => new URL(r.url()).pathname === '/api/employee/offline' && r.status() === 201);
    await context.setOffline(false);
    // O protocolo de automação restaura a rede, mas não emite o evento DOM.
    // Aguarde a mudança assentar e dispare exatamente um sincronizador.
    await page.waitForTimeout(250);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await receivedOffline;
    await page.getByText(/tarefa offline recebida pelo servidor/).waitFor();
    await page.waitForFunction(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => JSON.parse(localStorage.getItem(key)||'[]')).flat().length === 0, 'seg.employee.approved-offline.v1.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'portal móvel não deve criar rolagem horizontal');

    // Fechamento demonstrativo e holerite publicados pela interface RH.
    await openAdmin();
    await adminTab('Fechamento e holerite', 'Fechar período demonstrativo');
    const closureForm = page.getByRole('heading', { name: 'Fechar período demonstrativo' }).locator('..').locator('form');
    await closureForm.locator('[name="competence"]').fill('2026-10');
    const closureCreated = page.waitForResponse(r => new URL(r.url()).pathname === '/api/hr/dp-closures' && r.status() === 201);
    await closureForm.getByRole('button', { name: 'Validar divergências e fechar' }).click();
    await closureCreated;
    const payrollForm = page.getByRole('heading', { name: 'Publicar holerite', exact: true }).locator('..').locator('form');
    await payrollForm.locator('[name="employeeId"]').selectOption(uiEmployeeId);
    await payrollForm.locator('[name="competence"]').fill('2026-10');
    await payrollForm.locator('[name="file"]').setInputFiles({ name: 'holerite-interface.txt', mimeType: 'text/plain', buffer: Buffer.from(`holerite privado ${suffix}`) });
    const payrollPublished = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/hr/l03/documents' && r.request().method() === 'PATCH' && r.status() === 200);
    await payrollForm.getByRole('button', { name: 'Enviar de fonte autorizada e publicar' }).click();
    await payrollPublished;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/funcionario`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /Docs$/ }).click();
    const payslipCard = page.locator('article').filter({ hasText: 'Holerite 2026-10' });
    await payslipCard.waitFor();
    const download = page.waitForEvent('download');
    await payslipCard.getByRole('link', { name: 'Baixar' }).click();
    await download;

    // Todos os grupos HR-01..24 permanecem navegáveis e carregam suas APIs.
    await openAdmin();
    await adminTab('Demais processos de RH', 'Demais processos de RH');
    // O código HR-xx saiu do rótulo visível e virou texto só para leitor de
    // tela; o destino continua sendo o mesmo componente legado, e cada um
    // precisa continuar carregando a sua própria API.
    const processGroups = [
      [/^Cadastro, histórico e admissão/, /HR-01 Cadastro profissional/],
      [/^Recrutamento, talentos e dossiê/, /HR-03 Recrutamento/],
      [/^Desligamento, situação e férias/, /HR-07 Desligamento/],
      [/^Afastamento, ponto e banco de horas/, /HR-10 Afastamentos/],
      [/^Benefícios, reembolsos e saúde/, /HR-13 Benefícios/],
      [/^Treinamento, competências e uniformes/, /HR-17 Treinamento/],
      [/^Folha, avaliações e indicadores/, /HR-21\.\.24 holerites/],
    ];
    for (const [tabName, heading] of processGroups) {
      await page.getByRole('tab', { name: tabName }).click();
      await page.getByRole('heading', { name: heading }).waitFor();
    }
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'painel RH não deve criar rolagem horizontal');

    // Desligamento pela tela encerra a sessão employee já emitida.
    await adminTab('Desligamento', /^Desligamento com revogação/);
    const terminationForm = page.getByRole('heading', { name: /^Desligamento com revogação/ }).locator('..').locator('form');
    await terminationForm.locator('[name="employeeId"]').selectOption(uiEmployeeId);
    await terminationForm.locator('[name="date"]').fill('2026-10-31');
    await terminationForm.locator('[name="reason"]').fill('Encerramento sintético realizado integralmente pela interface');
    // UX-04 trocou o window.confirm por uma confirmação da própria página, com
    // o resumo do efeito. O desligamento agora é um passo em dois tempos.
    let nativeDialog = false;
    page.once('dialog', async dialog => { nativeDialog = true; await dialog.dismiss(); });
    await terminationForm.getByRole('button', { name: 'Revisar antes de concluir' }).click();
    const terminationSummary = page.locator('[role="alertdialog"]');
    await terminationSummary.waitFor();
    assert.equal(nativeDialog, false, 'a confirmação precisa ser da página, não um window.confirm');
    assert.match(await terminationSummary.innerText(), /revogar imediatamente/i, 'o resumo precisa declarar a revogação');
    const terminationCompleted = page.waitForResponse(r => new URL(r.url()).pathname === '/api/hr/terminations' && r.request().method() === 'PATCH' && r.status() === 200);
    await terminationSummary.getByRole('button', { name: 'Concluir desligamento e revogar acesso' }).click();
    await terminationCompleted;
    expectingRevokedEmployee = true;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/funcionario`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
    const { rows: revokedUiSessions } = await pool.query(`SELECT COUNT(*)::int AS count FROM auth_employee_sessions WHERE employee_id=$1 AND revoked_at IS NOT NULL`, [uiEmployeeId]);
    assert.ok(revokedUiSessions[0].count >= 1, 'o desligamento pela tela deve revogar a sessão existente');

    assert.deepEqual(interfaceFailures, [], `a jornada real encontrou respostas inesperadas: ${interfaceFailures.join(', ')}`);
    await context.close();
  } finally {
    await browser.close();
  }
}

test('L03: jornada integral com duas identidades, isolamento, documentos, escala, folha e revogação', { skip: !RUN, timeout: 180_000 }, async () => {
  const rh = await provisionAndLoginStaff(pool, api, { role: 'rh' });
  const roleProbe = await provisionAndLoginStaff(pool, api, { role: 'rh' });
  await pool.query(`UPDATE auth_staff_profiles SET role='supervisor' WHERE identity_id=$1`, [roleProbe.id]);
  const staleRoleSession = await api('/api/hr/employees', { cookie: roleProbe.cookie });
  assert.equal(staleRoleSession.status, 401, 'mudança de papel precisa revogar a sessão de staff existente');
  const unprivilegedStaff = await provisionAndLoginStaff(pool, api, { role: 'supervisor' });
  const deniedAdminAlias = await api('/api/admin/hr/employees', { cookie: unprivilegedStaff.cookie });
  assert.equal(deniedAdminAlias.status, 403, 'aliases administrativos de RH também precisam da permissão granular');

  // Sem permissão salarial explícita, RH vê o cadastro mas não a remuneração.
  const employeeA = await createEmployee(rh.cookie, 'A', 4321.09);
  const employeeB = await createEmployee(rh.cookie, 'B', 3210.98);
  const masked = await api(`/api/hr/employees/${employeeA.id}`, { cookie: rh.cookie });
  assert.equal(masked.status, 200, JSON.stringify(masked.body));
  assert.equal(masked.body.employee.remuneracao_atual, null, 'remuneração sensível deve ficar mascarada sem concessão específica');

  // Admissão sintética pelo contrato HTTP de RH.
  const admission = await api('/api/hr/admissions', {
    method: 'POST', cookie: rh.cookie,
    body: { employee_id: employeeA.id, cargo: 'vigilante', responsible_name: 'RH QA', notes: 'Admissão sintética do gate L03' },
  });
  assert.equal(admission.status, 201, JSON.stringify(admission.body));

  const accessA = await provisionEmployee(rh.cookie, employeeA, 'A');
  const accessB = await provisionEmployee(rh.cookie, employeeB, 'B');

  const meA = await api(`/api/employee/me?employee_id=${employeeB.id}`, { cookie: accessA.cookie });
  const meB = await api(`/api/employee/me?employee_id=${employeeA.id}`, { cookie: accessB.cookie });
  assert.equal(meA.status, 200, JSON.stringify(meA.body));
  assert.equal(meB.status, 200, JSON.stringify(meB.body));
  assert.equal(meA.body.employee.id, employeeA.id, 'A deve ser derivado da sessão, não do query param B');
  assert.equal(meB.body.employee.id, employeeB.id, 'B deve ser derivado da sessão, não do query param A');

  // Solicitação de alteração também ignora employeeId malicioso.
  const profileB = await api('/api/employee/profile-updates', {
    method: 'POST', cookie: accessB.cookie,
    body: { employeeId: employeeA.id, changes: { contact_phone: '+55 11 90000-0002' }, justification: 'Atualização sintética do contato próprio' },
  });
  assert.equal(profileB.status, 201, JSON.stringify(profileB.body));
  const { rows: profileRows } = await pool.query('SELECT employee_id FROM hr_profile_update_requests WHERE id=$1', [profileB.body.request.id]);
  assert.equal(profileRows[0].employee_id, employeeB.id);

  const nextPasswordB = `Senha-Nova-${randomUUID()}!`;
  const passwordChange = await api('/api/employee/session/password', {
    method: 'PUT', cookie: accessB.cookie,
    body: { currentPassword: accessB.temporaryPassword, newPassword: nextPasswordB },
  });
  assert.equal(passwordChange.status, 200, JSON.stringify(passwordChange.body));
  const stalePasswordSession = await api('/api/employee/me', { cookie: accessB.cookie });
  assert.equal(stalePasswordSession.status, 401, 'troca de senha deve revogar a sessão que efetuou a troca');
  const reloginB = await api('/api/employee/session', {
    method: 'POST', body: { email: accessB.email, password: nextPasswordB },
  });
  assert.equal(reloginB.status, 200, JSON.stringify(reloginB.body));
  accessB.cookie = cookieOf(reloginB);

  // Documento privado: envio, negação cruzada, revisão de RH e download próprio.
  const submissionBytes = Buffer.from(`documento sintético A ${randomUUID()}`, 'utf8');
  const submitted = await api('/api/employee/documents', {
    method: 'POST', cookie: accessA.cookie,
    body: { employeeId: employeeB.id, title: 'Comprovante sintético', category: 'admissao', filename: 'comprovante.txt', contentType: 'text/plain', contentBase64: submissionBytes.toString('base64') },
  });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.equal(submitted.body.document.employee_id, employeeA.id);
  const crossDownload = await api(`/api/employee/documents/${submitted.body.document.id}/download`, { cookie: accessB.cookie, raw: true });
  assert.equal(crossDownload.status, 404, 'B não pode baixar documento privado de A');
  const reviewed = await api('/api/admin/hr/l03/documents', {
    method: 'PATCH', cookie: rh.cookie,
    body: { id: submitted.body.document.id, status: 'approved' },
  });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  const ownDownload = await api(`/api/employee/documents/${submitted.body.document.id}/download`, { cookie: accessA.cookie, raw: true });
  assert.equal(ownDownload.status, 200);
  assert.ok(ownDownload.buffer.equals(submissionBytes));
  assert.match(ownDownload.headers.get('cache-control') || '', /no-store/);

  // Publicação de escala por RH; cada funcionário recebe somente suas linhas.
  const version = await api('/api/hr/schedule-versions', {
    method: 'POST', cookie: rh.cookie,
    body: { title: 'Escala sintética L03', period_start: '2026-10-01', period_end: '2026-10-31' },
  });
  assert.equal(version.status, 201, JSON.stringify(version.body));
  const entryA = await api('/api/hr/schedule-entries', {
    method: 'POST', cookie: rh.cookie,
    body: { version_id: version.body.version.id, employee_id: employeeA.id, entry_date: '2026-10-02', start_time: '08:00', end_time: '20:00', location: 'Posto A' },
  });
  const entryB = await api('/api/hr/schedule-entries', {
    method: 'POST', cookie: rh.cookie,
    body: { version_id: version.body.version.id, employee_id: employeeB.id, entry_date: '2026-10-03', start_time: '08:00', end_time: '20:00', location: 'Posto B' },
  });
  assert.equal(entryA.status, 201, JSON.stringify(entryA.body));
  assert.equal(entryB.status, 201, JSON.stringify(entryB.body));
  const publishedSchedule = await api('/api/hr/schedule-versions', {
    method: 'PATCH', cookie: rh.cookie, body: { id: version.body.version.id, status: 'publicado' },
  });
  assert.equal(publishedSchedule.status, 200, JSON.stringify(publishedSchedule.body));
  const homeA = await api('/api/employee/home', { cookie: accessA.cookie });
  assert.equal(homeA.status, 200, JSON.stringify(homeA.body));
  assert.ok(homeA.body.schedule.some(item => item.id === entryA.body.entry.id));
  assert.ok(!homeA.body.schedule.some(item => item.id === entryB.body.entry.id), 'home de A não pode conter escala de B');
  const crossAck = await api(`/api/employee/schedule/${entryA.body.entry.id}/ack`, { method: 'POST', cookie: accessB.cookie, body: {} });
  assert.equal(crossAck.status, 404);
  const ack = await api(`/api/employee/schedule/${entryA.body.entry.id}/ack`, { method: 'POST', cookie: accessA.cookie, body: {} });
  assert.equal(ack.status, 200, JSON.stringify(ack.body));

  // Correção de ponto e aviso de ausência são sempre do empregado autenticado.
  const timeId = randomUUID();
  await pool.query(`INSERT INTO hr_time_entries(id,employee_id,entry_date,clock_in,clock_out,hours_worked,source,status,competence) VALUES ($1,$2,'2026-09-20','08:10','17:00',8.83,'manual','aprovado','2026-09')`, [timeId, employeeA.id]);
  const crossCorrection = await api('/api/employee/actions/time-correction', {
    method: 'POST', cookie: accessB.cookie,
    body: { timeEntryId: timeId, reason: 'Correção maliciosa sobre registro de outro funcionário', requestedChanges: { clock_in: '08:00' } },
  });
  assert.equal(crossCorrection.status, 404);
  const correction = await api('/api/employee/actions/time-correction', {
    method: 'POST', cookie: accessA.cookie,
    body: { employeeId: employeeB.id, timeEntryId: timeId, reason: 'Relógio registrou dez minutos depois do horário correto', requestedChanges: { clock_in: '08:00' } },
  });
  assert.equal(correction.status, 201, JSON.stringify(correction.body));
  assert.equal(correction.body.correction.employee_id, employeeA.id);
  const absence = await api('/api/employee/actions/absence', {
    method: 'POST', cookie: accessA.cookie,
    body: { employeeId: employeeB.id, noticeType: 'ausencia', shiftDate: '2026-10-04', reasonCode: 'transporte', details: 'Interrupção sintética de transporte para o teste' },
  });
  assert.equal(absence.status, 201, JSON.stringify(absence.body));
  assert.equal(absence.body.notice.employee_id, employeeA.id);

  // Uniforme/EPI: solicitação e recibo também derivam o titular da sessão.
  const uniformRequest = await api('/api/employee/actions/uniform', {
    method: 'POST', cookie: accessA.cookie,
    body: { employeeId: employeeB.id, requestType: 'substituicao', size: 'M', quantity: 1, reason: 'Colete sintético precisa de substituição para o teste integral' },
  });
  assert.equal(uniformRequest.status, 201, JSON.stringify(uniformRequest.body));
  const { rows: uniformRequestRows } = await pool.query('SELECT employee_id FROM emp_uniform_self_requests WHERE id=$1', [uniformRequest.body.request.id]);
  assert.equal(uniformRequestRows[0].employee_id, employeeA.id);
  const uniformId = randomUUID(), deliveryId = randomUUID();
  await pool.query(`INSERT INTO hr_uniform_catalog(id,name,type,is_epi,version,approval_status) VALUES($1,$2,'epi',TRUE,1,'aprovado')`, [uniformId, `Colete QA ${uniformId.slice(0, 6)}`]);
  await pool.query(`INSERT INTO hr_uniform_deliveries(id,employee_id,uniform_id,delivery_date,quantity,size,status) VALUES($1,$2,$3,CURRENT_DATE,1,'M','entregue')`, [deliveryId, employeeA.id, uniformId]);
  const crossUniformReceipt = await api('/api/employee/actions/uniform-receipt', { method: 'POST', cookie: accessB.cookie, body: { deliveryId } });
  assert.equal(crossUniformReceipt.status, 404, 'B não pode confirmar item entregue a A');
  const ownUniformReceipt = await api('/api/employee/actions/uniform-receipt', { method: 'POST', cookie: accessA.cookie, body: { deliveryId } });
  assert.equal(ownUniformReceipt.status, 200, JSON.stringify(ownUniformReceipt.body));
  assert.equal(ownUniformReceipt.body.confirmation.employee_id, employeeA.id);
  assert.match(ownUniformReceipt.body.legalNotice, /não é assinatura qualificada/);

  // Troca de plantão e passagem de serviço: A abre, somente B (destinatário) aceita.
  const swap = await api('/api/employee/actions/shift-swap', {
    method: 'POST', cookie: accessA.cookie,
    body: { targetEmployeeId: employeeB.id, swapDate: '2026-10-08', reason: 'Troca sintética combinada para cobertura operacional' },
  });
  assert.equal(swap.status, 201, JSON.stringify(swap.body));
  const swapAccept = await api('/api/employee/actions/shift-swap', {
    method: 'POST', cookie: accessB.cookie,
    body: { requestId: swap.body.swap.id, decision: 'accept' },
  });
  assert.equal(swapAccept.status, 200, JSON.stringify(swapAccept.body));
  assert.equal(swapAccept.body.swap.status, 'aceito');
  const handover = await api('/api/employee/actions/handover', {
    method: 'POST', cookie: accessA.cookie,
    body: { toEmployeeId: employeeB.id, pendingTasks: 'Conferir chaves do portão lateral', keys: ['portão lateral'], equipment: ['rádio 02'], occurrencesSummary: 'Sem ocorrência com dado pessoal' },
  });
  assert.equal(handover.status, 201, JSON.stringify(handover.body));
  const handoverAccept = await api('/api/employee/actions/handover', {
    method: 'POST', cookie: accessB.cookie,
    body: { handoverId: handover.body.handover.id, decision: 'accept' },
  });
  assert.equal(handoverAccept.status, 200, JSON.stringify(handoverAccept.body));
  assert.equal(handoverAccept.body.handover.status, 'aceito');

  // Comprovante de curso usa o mesmo provider privado e inscrição própria.
  const trainingId = randomUUID();
  const enrollmentId = randomUUID();
  await pool.query(`INSERT INTO hr_training_catalog(id,name,type,approval_status) VALUES ($1,'Curso sintético L03','capacitacao','aprovado')`, [trainingId]);
  await pool.query(`INSERT INTO emp_course_enrollments(id,employee_id,training_id,status) VALUES ($1,$2,$3,'em_andamento')`, [enrollmentId, employeeA.id, trainingId]);
  const proofBytes = Buffer.from(`certificado sintético ${randomUUID()}`);
  const proof = await api('/api/employee/actions/course-proof', {
    method: 'POST', cookie: accessA.cookie,
    body: { enrollmentId, proofType: 'certificado', title: 'Certificado sintético', filename: 'certificado.txt', contentType: 'text/plain', contentBase64: proofBytes.toString('base64') },
  });
  assert.equal(proof.status, 201, JSON.stringify(proof.body));
  assert.equal(proof.body.proof.employee_id, employeeA.id);
  const crossProof = await api('/api/employee/actions/course-proof', {
    method: 'POST', cookie: accessB.cookie,
    body: { enrollmentId, proofType: 'certificado', title: 'Tentativa cruzada', filename: 'x.txt', contentType: 'text/plain', contentBase64: proofBytes.toString('base64') },
  });
  assert.equal(crossProof.status, 404);

  // Fila offline limitada: idempotência por funcionário, conflito explícito e
  // timestamps de dispositivo/servidor separados.
  const offlineKey = `l03-${randomUUID()}`;
  const offlinePayload = { title: 'Ocorrência recebida offline', description: 'Registro sintético para validar sincronização idempotente', occurredAt: '2026-09-29T10:00:00-03:00', location: 'Posto A' };
  const offline = await api('/api/employee/offline', {
    method: 'POST', cookie: accessA.cookie,
    body: { taskType: 'occurrence', idempotencyKey: offlineKey, deviceTimestamp: '2026-09-29T10:01:00-03:00', deviceTimezone: 'America/Sao_Paulo', payload: offlinePayload },
  });
  assert.equal(offline.status, 201, JSON.stringify(offline.body));
  assert.ok(offline.body.queue.server_received_at);
  assert.notEqual(String(offline.body.queue.server_received_at), String(offline.body.queue.device_timestamp));
  const offlineRetry = await api('/api/employee/offline', {
    method: 'POST', cookie: accessA.cookie,
    body: { taskType: 'occurrence', idempotencyKey: offlineKey, deviceTimestamp: '2026-09-29T10:01:00-03:00', deviceTimezone: 'America/Sao_Paulo', payload: offlinePayload },
  });
  assert.equal(offlineRetry.status, 200, JSON.stringify(offlineRetry.body));
  assert.equal(offlineRetry.body.deduplicated, true);
  const crossOfflineKey = await api('/api/employee/offline', {
    method: 'POST', cookie: accessB.cookie,
    body: { taskType: 'occurrence', idempotencyKey: offlineKey, deviceTimestamp: '2026-09-29T10:01:00-03:00', deviceTimezone: 'America/Sao_Paulo', payload: offlinePayload },
  });
  assert.equal(crossOfflineKey.status, 409);
  const serviceWorker = await api('/api/pwa/sw.js', { raw: true });
  assert.equal(serviceWorker.status, 200);
  const workerText = serviceWorker.buffer.toString('utf8');
  for (const privatePattern of ['/api/employee/', '/api/hr/', '/funcionario', 'payroll', 'medical']) {
    assert.ok(workerText.includes(privatePattern), `service worker deve excluir ${privatePattern}`);
  }

  // Fechamento demonstrativo de período pelo contrato HTTP de RH.
  const closure = await api('/api/hr/dp-closures', {
    method: 'POST', cookie: rh.cookie,
    body: { competence: '2026-09', action: 'fechar', total_employees: 2, total_variables: 0, documents_conferidos: 1, notes: 'Fechamento demonstrativo sintético' },
  });
  assert.equal(closure.status, 201, JSON.stringify(closure.body));
  assert.equal(closure.body.closure.status, 'fechado');

  // Remuneração/holerite exige concessão independente do papel RH.
  const deniedPayslip = await api('/api/admin/hr/l03/documents', {
    method: 'POST', cookie: rh.cookie,
    body: { employeeId: employeeA.id, documentKind: 'payroll', title: 'Holerite 2026-09', category: 'folha', competence: '2026-09', filename: 'holerite.txt', contentType: 'text/plain', contentBase64: Buffer.from('holerite sintético').toString('base64'), sourceAuthorized: true, sourceLabel: 'Fonte sintética autorizada para QA' },
  });
  assert.equal(deniedPayslip.status, 403, JSON.stringify(deniedPayslip.body));
  const deniedLegacyPayroll = await api('/api/admin/hr/payroll-documents', { cookie: rh.cookie });
  assert.equal(deniedLegacyPayroll.status, 403, 'alias legado salarial não pode contornar a concessão separada');
  const healthWithDedicatedGrant = await api('/api/admin/hr/occupational-agenda', { cookie: rh.cookie });
  assert.equal(healthWithDedicatedGrant.status, 200, JSON.stringify(healthWithDedicatedGrant.body));
  for (const permission of ['employees.compensation.read', 'employees.compensation.write']) {
    await pool.query(`INSERT INTO auth_permissions(id,identity_id,permission,scope_type,reason,granted_by_role) VALUES ($1,$2,$3,'organization','Gate sintético L03','system')`, [randomUUID(), rh.id, permission]);
  }
  const allowedLegacyPayroll = await api('/api/admin/hr/payroll-documents', { cookie: rh.cookie });
  assert.equal(allowedLegacyPayroll.status, 200, JSON.stringify(allowedLegacyPayroll.body));
  const payslipBytes = Buffer.from(`holerite sintético privado ${randomUUID()}`, 'utf8');
  const payslip = await api('/api/admin/hr/l03/documents', {
    method: 'POST', cookie: rh.cookie,
    body: { employeeId: employeeA.id, documentKind: 'payroll', title: 'Holerite 2026-09', category: 'folha', competence: '2026-09', filename: 'holerite-2026-09.txt', contentType: 'text/plain', contentBase64: payslipBytes.toString('base64'), sourceAuthorized: true, sourceLabel: 'Fonte sintética autorizada para QA' },
  });
  assert.equal(payslip.status, 201, JSON.stringify(payslip.body));
  const publishPayslip = await api('/api/admin/hr/l03/documents', {
    method: 'PATCH', cookie: rh.cookie,
    body: { id: payslip.body.document.id, status: 'published' },
  });
  assert.equal(publishPayslip.status, 200, JSON.stringify(publishPayslip.body));
  const payslipA = await api(`/api/employee/documents/${payslip.body.document.id}/download`, { cookie: accessA.cookie, raw: true });
  const payslipB = await api(`/api/employee/documents/${payslip.body.document.id}/download`, { cookie: accessB.cookie, raw: true });
  assert.equal(payslipA.status, 200);
  assert.ok(payslipA.buffer.equals(payslipBytes));
  assert.equal(payslipB.status, 404, 'B não pode acessar holerite de A');
  await pool.query(`INSERT INTO emp_post_procedures(post_location,title,version,content,category,status,is_active) VALUES('Geral',$1,1,'Procedimento sintético aprovado para a fila offline do navegador','geral','publicado',TRUE)`, [`Procedimento offline ${randomUUID()}`]);

  // As duas interfaces reais também precisam completar sua navegação responsiva,
  // não apenas os contratos HTTP usados acima.
  await exerciseInterfaces({ staffCookie: rh.cookie });

  // Conclusão de desligamento invalida e revoga a sessão já emitida.
  const termination = await api('/api/hr/terminations', {
    method: 'POST', cookie: rh.cookie,
    body: { employee_id: employeeA.id, type: 'termino_contrato', termination_date: '2026-09-29', reason: 'Encerramento sintético para provar revogação imediata', responsible_name: 'RH QA' },
  });
  assert.equal(termination.status, 201, JSON.stringify(termination.body));
  const completed = await api('/api/hr/terminations', {
    method: 'PATCH', cookie: rh.cookie,
    body: { id: termination.body.termination.id, status: 'concluido' },
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  const revoked = await api('/api/employee/me', { cookie: accessA.cookie });
  assert.equal(revoked.status, 401, JSON.stringify(revoked.body));
  const { rows: revokedRows } = await pool.query(`SELECT COUNT(*)::int AS count FROM auth_employee_sessions WHERE employee_id=$1 AND revoked_at IS NOT NULL`, [employeeA.id]);
  assert.ok(revokedRows[0].count >= 1, 'a sessão existente deve estar materialmente revogada');

  // B continua ativo: revogação não pode atingir outra identidade.
  const stillB = await api('/api/employee/me', { cookie: accessB.cookie });
  assert.equal(stillB.status, 200, JSON.stringify(stillB.body));
  assert.equal(stillB.body.employee.id, employeeB.id);
});

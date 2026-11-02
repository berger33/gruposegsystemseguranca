// PROBER TEMPORÁRIO PLT-12 — não será commitado. Mede estado real em HTTP + PG17.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

const root = path.resolve('.');
const freeLoopbackPort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const run = (cmd, args, env, capture = false) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let output = '';
    if (capture) {
      child.stdout.on('data', c => { output += c; process.stdout.write(c); });
      child.stderr.on('data', c => { output += c; process.stderr.write(c); });
    }
    child.once('error', reject);
    child.once('exit', code => resolve({ code: code ?? 1, output }));
  });

const SESSION_SECRET = randomUUID().repeat(2);
const database = 'seg_qa_probe12';
const pgPort = await freeLoopbackPort();
const serverPort = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-probe-plt12-'));
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port: pgPort,
  user: 'seg_qa',
  password,
  persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: e => console.error('PG_ENGINE_ERROR', String(e).slice(0, 300)),
});
let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`OK: ${msg}`);
  else {
    failures += 1;
    console.error(`FALHA: ${msg}`);
  }
}

let probeError = null;
let pool;
let child;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${pgPort}/${database}`;
  console.log(`PG ${url}`);

  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
  });
  check(migrated.code === 0, `migrações aplicadas exit=${migrated.code}`);
  pool = new pg.Pool({ connectionString: url, max: 8 });
  pool.on('error', () => {});
  const ledger = (await pool.query(
    `SELECT count(*)::int n FROM __migrations WHERE filename LIKE '___-%'`,
  )).rows[0];
  check(ledger.n === 181, `ledger migrações n=${ledger.n}`);

  const distDir = `.next/probe-plt12-${randomUUID().slice(0, 8)}`;
  child = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(serverPort), BIND_HOST: '127.0.0.1', NODE_ENV: 'development',
      NEXT_DIST_DIR: distDir, DATABASE_URL: url, DATABASE_MIGRATION_URL: '',
      SITE_ADMIN_SESSION_SECRET: SESSION_SECRET, OLLAMA_ENABLED: 'false',
      MAIL_HOST: '', NEXT_TELEMETRY_DISABLED: '1', SITE_ADMIN_LEGACY_TOKENS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', c => { logs += c; });
  child.stderr.on('data', c => { logs += c; });
  const origin = `http://127.0.0.1:${serverPort}`;
  let started = false;
  for (let i = 0; i < 300; i += 1) {
    try {
      const r = await fetch(`${origin}/api/admin/session`);
      if ([200, 401].includes(r.status)) { started = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  check(started, 'server.mjs --dev subiu');

  const hashPassword = (await import('./src/lib/client-auth-core.mjs')).hashPassword;
  const pwd = 'Probe-Sintetico-12!';
  async function provision(role) {
    const id = randomUUID();
    const email = `probe12-${role}-${id.slice(0, 8)}@exemplo.invalid`;
    await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `Probe ${role}`]);
    await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(pwd)]);
    await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
    return { id, email };
  }
  async function login(person) {
    const r = await fetch(`${origin}/api/admin/session`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email: person.email, password: pwd }),
    });
    check(r.status === 200, `login ${person.email} status=${r.status}`);
    const cookie = r.headers.getSetCookie().find(v => v.startsWith('seg_admin_session='));
    check(!!cookie, `cookie sessão real ${person.email}`);
    return cookie.split(';')[0];
  }
  async function call(pathname, opts = {}) {
    const { method = 'GET', cookie = cookieTi, body, headers = {}, originHeader = null } = opts;
    const h = { accept: 'application/json', ...headers };
    if (cookie) h.cookie = cookie;
    if (method !== 'GET' || originHeader) h.origin = originHeader || origin;
    if (body !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(`${origin}${pathname}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let parsed;
    try { parsed = JSON.parse(await r.text()); } catch { parsed = null; }
    return { response: r, body: parsed };
  }
  const [ti, rh, admin] = await Promise.all([provision('ti'), provision('rh'), provision('admin')]);
  const [cookieTi, cookieRh, cookieAdmin] = await Promise.all([login(ti), login(rh), login(admin)]);

  // RBAC leitura
  for (const type of [null, 'ti', 'rh', 'admin']) {
    const cookie = type === null ? null : type === 'ti' ? cookieTi : type === 'rh' ? cookieRh : cookieAdmin;
    const c = await call('/api/admin/incidents', { cookie });
    const want = type === null ? 401 : type === 'rh' ? 403 : 200;
    check(c.response.status === want, `GET incidents ${type === null ? 'anon' : type} -> ${c.response.status} ${JSON.stringify(c.body?.error)}`);
  }
  // RBAC escrita
  const cPost = await call('/api/admin/incidents', { method: 'POST', cookie: null, body: {} });
  check(cPost.response.status === 401, `POST anon -> 401 (obtido ${cPost.response.status} ${JSON.stringify(cPost.body?.error)})`);
  const rPost = await call('/api/admin/incidents', { method: 'POST', cookie: cookieRh, body: {} });
  check(rPost.response.status === 403, `POST rh -> 403 (obtido ${rPost.response.status})`);
  // same_origin_required em escrita
  const xo = await call('/api/admin/incidents', { method: 'POST', cookie: cookieTi, body: {}, originHeader: 'https://example.invalid' });
  check(xo.response.status === 403, `POST cross-origin -> 403 same_origin_required (obtido ${xo.response.status} ${JSON.stringify(xo.body?.error)})`);
  // GET seguro ignora Origin divergente (sessão/RBAC bastam)
  const go = await call('/api/admin/incidents', { cookie: cookieTi, originHeader: 'https://example.invalid' });
  check(go.response.status === 200, `GET cross-origin com sessão -> 200 (obtido ${go.response.status})`);

  // Cria incidente válido
  const c201 = await call('/api/admin/incidents', {
    method: 'POST', cookie: cookieTi,
    body: { incident_type: 'vazamento_dados', severity: 'alta', title: 'Incidente de prober PLT-12', description: 'Descrição sintética de prober com mais de vinte caracteres.', affected_data_categories: ['identificacao', 'contato'], affected_records_estimate: 3, affected_systems: ['sistema-a'], responsible_name: 'QA', responsible_id: 'resp-1' },
  });
  check(c201.response.status === 201, `POST criar incidente -> 201 (obtido ${c201.response.status} ${JSON.stringify(c201.body?.error)})`);
  check(c201.body && !!c201.body.incident && !!c201.body.incident.id, 'resposta cria incident com id');
  const incidentId = c201.body && c201.body.incident.id;
  check(/^[0-9a-f-]{36}$/i.test(incidentId || ''), 'id UUID canônico');
  const row = (await pool.query('SELECT status,incident_type,severity FROM security_incidents WHERE id=$1', [incidentId])).rows[0];
  check(row && row.status === 'aberto', `linha gravada status=aberto (obtido ${row ? row.status : 'ausente'})`);
  const hist = (await pool.query('SELECT * FROM incident_history WHERE incident_id=$1 ORDER BY created_at', [incidentId])).rows;
  check(hist.length === 1 && hist[0].next_status === 'aberto', 'histórico de abertura gravado');
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_create' AND target=$1", [incidentId])).rows[0].n;
  check(audit === 1, 'audit_log incident_create gravado');

  // Detalhe com sub-recursos
  const d = await call(`/api/admin/incidents/${incidentId}`);
  check(d.response.status === 200, `GET detalhe -> 200 (obtido ${d.response.status})`);
  check(Array.isArray(d.body.evidences) && Array.isArray(d.body.actions) && Array.isArray(d.body.communications) && Array.isArray(d.body.history), 'detalhe traz evidences/actions/communications/history');

  // Filtros de listagem
  const l = await call('/api/admin/incidents?type=vazamento_dados&severity=alta&status=aberto');
  check(l.body && l.body.incidents.some(i => i.id === incidentId), 'filtros type/severity/status funcionam');

  // PATCH: transição inválida (aberto -> comunicado não é direto)
  const tiR = await call(`/api/admin/incidents/${incidentId}`, { method: 'PATCH', cookie: cookieTi, body: { next_status: 'comunicado', reason: 'x' } });
  check(tiR.response.status === 400 && tiR.body.error === 'invalid_transition', `transição inválida -> 400 invalid_transition (obtido ${tiR.response.status} ${JSON.stringify(tiR.body?.error)})`);
  // encerrado sem root_cause
  const rc = await call(`/api/admin/incidents/${incidentId}`, { method: 'PATCH', cookie: cookieTi, body: { next_status: 'encerrado', reason: 'x' } });
  check(rc.response.status === 400 && rc.body.error === 'root_cause_required_for_close', `encerrado sem causa -> 400 root_cause_required_for_close (obtido ${rc.response.status} ${JSON.stringify(rc.body?.error)})`);
  // em_contencao sem containment lead
  const ec = await call(`/api/admin/incidents/${incidentId}`, { method: 'PATCH', cookie: cookieTi, body: { next_status: 'em_contencao', reason: 'contendo' } });
  check(ec.response.status === 400 && ec.body.error === 'containment_lead_required', `contenção sem lead -> 400 containment_lead_required (obtido ${ec.response.status} ${JSON.stringify(ec.body?.error)})`);
  // válida: aberto -> em_contencao com lead
  const okC = await call(`/api/admin/incidents/${incidentId}`, { method: 'PATCH', cookie: cookieTi, body: { next_status: 'em_contencao', reason: 'contendo', containment_lead_name: 'Líder QA', containment_lead_id: 'lead-1' } });
  check(okC.response.status === 200 && okC.body.incident.status === 'em_contencao', `aberta->em_contencao -> 200 (obtido ${okC.response.status} ${JSON.stringify(okC.body?.error)})`);
  // id inválido
  const bid = await call('/api/admin/incidents/nao-e-uuid', { method: 'PATCH', cookie: cookieTi, body: { next_status: 'encerrado' } });
  check(bid.response.status === 400 && bid.body.error === 'invalid_id', `id inválido -> 400 invalid_id (obtido ${bid.response.status} ${JSON.stringify(bid.body?.error)})`);
  // id inexistente
  const nf = await call(`/api/admin/incidents/${randomUUID()}`, { method: 'PATCH', cookie: cookieTi, body: { next_status: 'encerrado', root_cause: 'qualquer' } });
  check(nf.response.status === 404 && nf.body.error === 'not_found', `id inexistente -> 404 not_found (obtido ${nf.response.status})`);
  // encerrado com causa
  const cl = await call(`/api/admin/incidents/${incidentId}`, { method: 'PATCH', cookie: cookieTi, body: { next_status: 'encerrado', root_cause: 'causa raiz sintetica do prober', reason: 'encerrando' } });
  check(cl.response.status === 200 && cl.body.incident.status === 'encerrado', `encerrado com causa -> 200 (obtido ${cl.response.status})`);
  const row2 = (await pool.query('SELECT resolved_at,root_cause FROM security_incidents WHERE id=$1', [incidentId])).rows[0];
  check(!!row2.resolved_at && row2.root_cause === 'causa raiz sintetica do prober', 'resolved_at e root_cause gravados');
  const histClose = (await pool.query("SELECT * FROM incident_history WHERE incident_id=$1 AND next_status='encerrado' ORDER BY created_at DESC LIMIT 1", [incidentId])).rows[0];
  check(!!histClose, 'histórico de encerramento gravado');

  // Evidência (referência, checksum, sem upload)
  const evR = await call('/api/admin/incidents/evidences', { method: 'POST', cookie: cookieTi, body: { incident_id: incidentId, evidence_type: 'log', title: 'Log do prober', description: 'd', file_reference: '/sintetico/log.txt' } });
  check(evR.response.status === 201 && evR.body.evidence.checksum, `evidência -> 201 com checksum (obtido ${evR.response.status})`);
  const expectChecksum = require('crypto').createHash('sha256').update('/sintetico/log.txt').digest('hex').slice(0, 32);
  check(evR.body.evidence.checksum === expectChecksum, `checksum = sha256(ref).slice(0,32) (obtido ${evR.body.evidence.checksum} esperado ${expectChecksum})`);
  const evAudit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_evidence_add' AND target=$1", [incidentId])).rows[0].n;
  check(evAudit === 1, 'audit_log incident_evidence_add');

  // Ação
  const acR = await call('/api/admin/incidents/actions', { method: 'POST', cookie: cookieTi, body: { incident_id: incidentId, action_type: 'contencao', title: 'Ação prober', description: 'desc da ação com mais de dez', assigned_to_name: 'A', due_at: '2027-01-01T00:00:00Z' } });
  check(acR.response.status === 201, `ação -> 201 (obtido ${acR.response.status})`);
  const actionId = (acR.body && acR.body.action && acR.body.action.id) || null;
  const acP = await call('/api/admin/incidents/actions', { method: 'PATCH', cookie: cookieTi, body: { id: actionId, status: 'concluida' } });
  check(acP.response.status === 200, `ação concluída -> 200 (obtido ${acP.response.status} ${JSON.stringify(acP.body?.error)})`);
  const actRow = (await pool.query('SELECT completed_at FROM incident_actions WHERE id=$1', [actionId])).rows[0];
  check(!!actRow.completed_at, 'completed_at preenchido na conclusão');
  const actAudit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_action_complete' AND target=$1", [incidentId])).rows[0].n;
  check(actAudit === 1, 'audit_log incident_action_complete');

  // Comunicação (registro interno, sem envio externo)
  const cmR = await call('/api/admin/incidents/communications', { method: 'POST', cookie: cookieTi, body: { incident_id: incidentId, recipient_type: 'dpo', recipient_contact: 'dpo@exemplo.invalid', subject: 'Comunicação prober', content: 'Conteúdo da comunicação sintética com mais de vinte caracteres.' } });
  check(cmR.response.status === 201, `comunicação -> 201 (obtido ${cmR.response.status})`);
  const dpoFlag = (await pool.query('SELECT dpo_notified FROM security_incidents WHERE id=$1', [incidentId])).rows[0].dpo_notified;
  check(dpoFlag === true, 'flag dpo_notified=true após comunicação para dpo');
  const cmAudit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_communicate' AND target=$1", [incidentId])).rows[0].n;
  check(cmAudit === 1, 'audit_log incident_communicate');

  // Leitura não escreve auditoria nem altera incidente
  const auditBefore = (await pool.query('SELECT count(*)::int n FROM audit_log')).rows[0].n;
  await call('/api/admin/incidents?type=vazamento_dados');
  await call(`/api/admin/incidents/${incidentId}`);
  const auditAfter = (await pool.query('SELECT count(*)::int n FROM audit_log')).rows[0].n;
  check(auditAfter === auditBefore, `leitura não grava audit_log (antes=${auditBefore} depois=${auditAfter})`);

  // Correlação: cabeçalhos x-request-id/x-correlation-id
  const hd = await call('/api/admin/incidents?type=summary');
  const rid = hd.response.headers.get('x-request-id');
  const cid = hd.response.headers.get('x-correlation-id');
  check(!!rid && !!cid, `correlação: x-request-id=${!!rid} x-correlation-id=${!!cid}`);
  const tel = (await pool.query('SELECT request_id,correlation_id FROM observability_http_requests WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1', [rid])).rows[0];
  check(tel && tel.correlation_id === cid, 'telemetria persiste request_id/correlation_id iguais ao cabeçalho');

  // 405 em métodos não suportados
  const m405 = await call('/api/admin/incidents', { method: 'PUT', cookie: cookieTi, body: {} });
  check(m405.response.status === 405 && m405.body.error === 'method_not_allowed', `PUT collection -> 405 (obtido ${m405.response.status})`);
  const gEv = await call('/api/admin/incidents/evidences', { method: 'GET', cookie: cookieTi });
  check(gEv.response.status === 405, `GET evidences -> 405 (obtido ${gEv.response.status})`);

  // Aliases preservados
  const crm = await call('/api/crm/incidents', { cookie: cookieTi });
  const sec = await call('/api/security/incidents', { cookie: cookieTi });
  check(crm.response.status === 200 && sec.response.status === 200, `aliases /api/crm/incidents e /api/security/incidents -> 200 (${crm.response.status}/${sec.response.status})`);

  // affected_records_estimate não numérico não explode 500
  const nan = await call('/api/admin/incidents', { method: 'POST', cookie: cookieTi, body: { incident_type: 'phishing', severity: 'baixa', title: 'Prober NaN estimativa', description: 'Descricao sintetica valida para o prober de estimativa.', affected_records_estimate: 'abc' } });
  check(nan.response.status === 400 || nan.response.status === 201, `estimativa não numérica não explode 500 (obtido ${nan.response.status} ${JSON.stringify(nan.body?.error)})`);

  await pool.end();
  pool = null;
  child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 300));
  child.kill('SIGKILL');
  child = null;
} catch (error) {
  probeError = error;
  console.error('PROBE_ERRO_NA_JORNADA', error?.stack ? String(error).slice(0, 300) + '\n' + String(error.stack).slice(0, 1500) : String(error).slice(0, 2000));
} finally {
  if (pool) await pool.end().catch(() => {});
  if (child) { child.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); child.kill('SIGKILL'); }
  await postgres.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true }).catch(() => {});
}
if (probeError) process.exit(1);
console.log(failures === 0 ? 'PROBE_PLT12: TUDO ESPERADO' : `PROBE_PLT12: ${failures} FALHA(S)`);
process.exit(failures === 0 ? 0 : 1);

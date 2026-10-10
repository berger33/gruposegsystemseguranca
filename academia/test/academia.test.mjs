// Testes da Academia: alçada no servidor, pontuação, níveis, selos, ranking e segurança básica.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/app.mjs';
import { createSessions } from '../src/auth.mjs';
import { createStore } from '../src/store.mjs';
import { buildSeedState, DEMO_USERS, userIdFor, DEFAULT_DEMO_PASSWORD, demoPassword } from '../src/seed.mjs';
import { TRACKS, lessonCount, publishedCount, isPending } from '../src/content.mjs';
import { levelFor, POINTS } from '../src/gamification.mjs';
import { verifyPassword, hashPassword } from '../src/auth.mjs';

let server;
let base;
let dir;
const PASSWORD = 'Teste#2026';

function request(method, url, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (cookie) headers.Cookie = cookie;
    const req = http.request(base + url, { method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* não é JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(email) {
  const res = await request('POST', '/api/login', { body: { email, password: PASSWORD } });
  assert.equal(res.status, 200, `login de ${email} deveria funcionar`);
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  return { cookie, user: res.json.user };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'academia-test-'));
  const store = createStore({ file: path.join(dir, 'academia.json'), seed: () => buildSeedState({ password: PASSWORD }) });
  const app = createApp({ store, sessions: createSessions() });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('login recusa senha errada com mensagem genérica', async () => {
  const res = await request('POST', '/api/login', { body: { email: 'carla.mendes@academia.exemplo', password: 'errada' } });
  assert.equal(res.status, 401);
  assert.equal(res.json.error, 'credenciais_invalidas');
});

test('rotas da API exigem sessão', async () => {
  for (const url of ['/api/home', '/api/me', '/api/tracks/fundamentos', '/api/lessons/fund-acesso']) {
    const res = await request('GET', url);
    assert.equal(res.status, 401, url);
  }
});

test('cookie de sessão é HttpOnly e SameSite=Lax', async () => {
  const res = await request('POST', '/api/login', { body: { email: 'carla.mendes@academia.exemplo', password: PASSWORD } });
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test('funcionário vê só as trilhas do seu setor na página inicial', async () => {
  const { cookie, user } = await login('carla.mendes@academia.exemplo');
  assert.equal(user.sectorLabel, 'Funcionário');
  const home = await request('GET', '/api/home', { cookie });
  const titles = home.json.tracks.map(t => t.id);
  assert.ok(titles.includes('fundamentos'));
  assert.ok(titles.includes('funcionario-ponto'));
  assert.ok(!titles.includes('rh-processos'));
  assert.ok(!titles.includes('financeiro-receber'));
});

test('trilha de outro setor responde 404, mesmo com o identificador certo', async () => {
  const { cookie } = await login('carla.mendes@academia.exemplo');
  const track = await request('GET', '/api/tracks/rh-processos', { cookie });
  assert.equal(track.status, 404);
  const lesson = await request('GET', '/api/lessons/rh-desligamento', { cookie });
  assert.equal(lesson.status, 404);
  const attempt = await request('POST', '/api/lessons/rh-desligamento/complete', { cookie, body: { choice: 0 } });
  assert.equal(attempt.status, 404);
});

test('administração vê todas as trilhas', async () => {
  const { cookie } = await login('camila.nogueira@academia.exemplo');
  const home = await request('GET', '/api/home', { cookie });
  assert.equal(home.json.tracks.length, TRACKS.length);
});

test('resposta da aula não vaza o gabarito antes da conclusão', async () => {
  const { cookie } = await login('paulo.teixeira@academia.exemplo');
  const lesson = await request('GET', '/api/lessons/cli-convite', { cookie });
  assert.equal(lesson.status, 200);
  assert.equal(lesson.json.done, false);
  assert.equal(lesson.json.result, null);
  assert.equal(lesson.json.answer, undefined);
  assert.equal(lesson.json.quiz, undefined);
  assert.ok(!lesson.text.includes('"explanation"'));
});

test('pontos são creditados uma única vez; resposta certa soma o bônus', async () => {
  const { cookie } = await login('paulo.teixeira@academia.exemplo');
  const lesson = TRACKS.find(t => t.id === 'cliente-portal').lessons[0];
  const wrong = (lesson.quiz.answer + 1) % lesson.quiz.options.length;

  const first = await request('POST', `/api/lessons/${lesson.id}/complete`, { cookie, body: { choice: wrong } });
  assert.equal(first.status, 200);
  assert.equal(first.json.alreadyCompleted, false);
  assert.equal(first.json.correct, false);
  assert.equal(first.json.pointsEarned, POINTS.lesson);
  assert.equal(first.json.points, POINTS.lesson);

  const again = await request('POST', `/api/lessons/${lesson.id}/complete`, { cookie, body: { choice: lesson.quiz.answer } });
  assert.equal(again.json.alreadyCompleted, true);
  assert.equal(again.json.pointsEarned, POINTS.lesson);

  const home = await request('GET', '/api/home', { cookie });
  assert.equal(home.json.points, POINTS.lesson);
  assert.equal(home.json.lessonsDone, 1);
});

test('resposta certa na primeira tentativa soma pontos de quiz', async () => {
  const { cookie } = await login('juliana.prado@academia.exemplo');
  const lesson = TRACKS.find(t => t.id === 'rh-processos').lessons[0];
  const res = await request('POST', `/api/lessons/${lesson.id}/complete`, { cookie, body: { choice: lesson.quiz.answer } });
  assert.equal(res.json.correct, true);
  assert.equal(res.json.pointsEarned, POINTS.lesson + POINTS.quiz);
  assert.equal(res.json.explanation, lesson.quiz.explanation);
});

test('escolha inválida é rejeitada', async () => {
  const { cookie } = await login('renata.costa@academia.exemplo');
  const bad = await request('POST', '/api/lessons/com-pedido/complete', { cookie, body: { choice: 99 } });
  assert.equal(bad.status, 400);
  const text = await request('POST', '/api/lessons/com-pedido/complete', { cookie, body: { choice: 'a' } });
  assert.equal(text.status, 400);
});

test('concluir todas as aulas da trilha dá bônus, selo e aviso de trilha concluída', async () => {
  const { cookie } = await login('sergio.faria@academia.exemplo');
  // Sérgio já concluiu as aulas publicadas da trilha de gestão (semente); outro usuário faz o caminho completo.
  const { cookie: c2 } = await login('helena.duarte@academia.exemplo');
  const track = TRACKS.find(t => t.id === 'gestao-painel');
  const publicadas = track.lessons.filter(l => !isPending(l));
  let last;
  for (const lesson of publicadas) {
    last = await request('POST', `/api/lessons/${lesson.id}/complete`, { cookie: c2, body: { choice: lesson.quiz.answer } });
  }
  assert.equal(last.json.trackCompleted, true);
  assert.ok(last.json.newBadges.some(b => b.id === 'trilha-gestao-painel'));
  assert.ok(last.json.newBadges.some(b => b.id === 'acerto-gestao-painel'));
  const expected = publicadas.length * (POINTS.lesson + POINTS.quiz) + POINTS.track;
  assert.equal(last.json.points, expected);

  const home = await request('GET', '/api/home', { cookie: c2 });
  const row = home.json.tracks.find(t => t.id === 'gestao-painel');
  assert.equal(row.complete, true);
  assert.equal(row.percent, 100);
  // Sérgio já tinha a trilha concluída pela semente e não recebe o bônus de novo ao ler a página.
  const sergio = await request('GET', '/api/home', { cookie });
  assert.ok(sergio.json.badges.earned.some(b => b.id === 'trilha-gestao-painel'));
});

test('níveis sobem conforme a pontuação (0 / 300 / 900 / 1.800)', () => {
  assert.equal(levelFor(0).name, 'Inicial');
  assert.equal(levelFor(300).name, 'Em desenvolvimento');
  assert.equal(levelFor(899).name, 'Em desenvolvimento');
  assert.equal(levelFor(900).name, 'Proficiente');
  assert.equal(levelFor(1800).name, 'Referência');
  assert.equal(levelFor(1800).next, null);
  assert.equal(levelFor(1800).percent, 100);
});

test('ranking mostra apenas colegas do mesmo setor e destaca quem consulta', async () => {
  const { cookie } = await login('carla.mendes@academia.exemplo');
  const lb = await request('GET', '/api/leaderboard', { cookie });
  assert.equal(lb.status, 200);
  assert.equal(lb.json.size, DEMO_USERS.filter(u => u.sector === 'funcionario').length);
  assert.ok(lb.json.top.every(row => row.name !== 'Paulo Teixeira'));
  // Rafael tem progresso de semente; Carla começa do zero e fica no fim.
  assert.equal(lb.json.top[0].name, 'Rafael Nunes');
  assert.equal(lb.json.me.name, 'Carla Mendes');
  assert.equal(lb.json.me.rank, 2);
  assert.equal(lb.json.top.length, 2);
});

test('busca respeita a alçada', async () => {
  const { cookie } = await login('paulo.teixeira@academia.exemplo');
  const own = await request('GET', '/api/search?q=sessoes', { cookie });
  assert.ok(own.json.results.some(r => r.id === 'cli-seguranca'));
  const other = await request('GET', '/api/search?q=desligamento', { cookie });
  assert.equal(other.json.results.length, 0);
});

test('logout invalida a sessão no servidor', async () => {
  const { cookie } = await login('tiago.ramos@academia.exemplo');
  const out = await request('POST', '/api/logout', { cookie });
  assert.equal(out.status, 200);
  const after = await request('GET', '/api/me', { cookie });
  assert.equal(after.status, 401);
});

test('arquivos fora de public/ não são servidos', async () => {
  for (const url of ['/../package.json', '/..%2fpackage.json', '/src/app.mjs', '/data/academia.json']) {
    const res = await request('GET', url);
    assert.notEqual(res.status, 200, url);
  }
});

test('página e ativos estáticos têm cabeçalhos de segurança e permitem preview em iframe', async () => {
  const res = await request('GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /script-src 'self'/);
  assert.ok(!/frame-ancestors/.test(res.headers['content-security-policy']));
  assert.ok(!res.headers['x-frame-options']);
  assert.match(res.text, /Em construção/);
});

test('senhas são guardadas com scrypt e verificadas com segurança', () => {
  const record = hashPassword('segredo-1');
  assert.notEqual(record.hash, 'segredo-1');
  assert.equal(verifyPassword('segredo-1', record), true);
  assert.equal(verifyPassword('segredo-2', record), false);
  assert.equal(verifyPassword('x', null), false);
});

test('semente: todos os usuários de demonstração existem e não há e-mail duplicado', () => {
  const seed = buildSeedState({ password: PASSWORD });
  assert.equal(seed.users.length, DEMO_USERS.length);
  assert.equal(new Set(seed.users.map(u => u.email)).size, seed.users.length);
  assert.ok(seed.users.every(u => u.hash && u.salt && !('password' in u)));
  assert.equal(seed.users[0].id, userIdFor('carla.mendes@academia.exemplo'));
});

test('senha de demonstração é obrigatória em produção', () => {
  assert.equal(demoPassword({}), DEFAULT_DEMO_PASSWORD);
  assert.equal(demoPassword({ ACADEMIA_DEMO_PASSWORD: 'abc' }), 'abc');
  assert.throws(() => demoPassword({ NODE_ENV: 'production' }));
});

test('conteúdo: estrutura do plano, ids únicos e quiz consistente', () => {
  const ids = TRACKS.flatMap(t => t.lessons.map(l => l.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(lessonCount(), ids.length);
  // Estrutura do plano de expansão: 24 trilhas (T25 fica de fora) e 165 aulas,
  // sendo 28 publicadas com quiz e o restante em construção.
  assert.equal(TRACKS.length, 24);
  assert.equal(lessonCount(), 165);
  assert.equal(publishedCount(), 28);
  for (const track of TRACKS) {
    assert.ok(track.audiences.length > 0, track.id);
    assert.ok(track.group, track.id);
    for (const lesson of track.lessons) {
      if (isPending(lesson)) {
        assert.ok(['S', 'P', 'T', 'D'].includes(lesson.tag), lesson.id);
        assert.equal(lesson.quiz, undefined, lesson.id);
        continue;
      }
      assert.ok(lesson.quiz.options.length >= 2, lesson.id);
      assert.ok(Number.isInteger(lesson.quiz.answer) && lesson.quiz.answer < lesson.quiz.options.length, lesson.id);
      assert.ok(lesson.steps.length >= 2, lesson.id);
    }
  }
});

test('persistência: progresso sobrevive a reinício do armazenamento', async () => {
  const file = path.join(dir, 'reinicio.json');
  const store1 = createStore({ file, seed: () => buildSeedState({ password: PASSWORD }) });
  const id = userIdFor('renata.costa@academia.exemplo');
  store1.state.progress[id] = { 'com-pedido': { completedAt: 'x', firstChoice: 0, firstCorrect: true, pointsEarned: 15 } };
  store1.save();
  const store2 = createStore({ file });
  assert.equal(store2.state.progress[id]['com-pedido'].pointsEarned, 15);
});

test('cookie de sessão: SameSite=Lax em localhost e SameSite=None; Secure atrás de HTTPS (preview)', async () => {
  const body = JSON.stringify({ email: 'carla.mendes@academia.exemplo', password: PASSWORD });
  const post = (headers) => new Promise((resolve, reject) => {
    const req = http.request(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } }, res => {
      res.resume();
      res.on('end', () => resolve(res.headers['set-cookie'][0]));
    });
    req.on('error', reject);
    req.end(body);
  });
  const local = await post({});
  assert.match(local, /SameSite=Lax/);
  assert.ok(!/Secure/.test(local));
  const preview = await post({ 'x-forwarded-proto': 'https', Host: 'academia-3100.example.app' });
  assert.match(preview, /SameSite=None; Secure/);
  assert.match(preview, /HttpOnly/);
  const remote = await post({ Host: 'academia-3100.example.app' });
  assert.match(remote, /SameSite=None; Secure/);
});

test('sessão por token no cabeçalho Authorization (sem depender do cookie)', async () => {
  const res = await request('POST', '/api/login', { body: { email: 'carla.mendes@academia.exemplo', password: PASSWORD } });
  const token = res.json.token;
  assert.match(token, /^[0-9a-f]{64}$/);
  const headers = { Authorization: `Bearer ${token}` };
  const me = await new Promise((resolve, reject) => {
    http.get(base + '/api/me', { headers }, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(d) })); }).on('error', reject);
  });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'carla.mendes@academia.exemplo');
  const out = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/logout', { method: 'POST', headers }, r => { r.resume(); r.on('end', () => resolve(r.statusCode)); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(out, 200);
  const gone = await new Promise((resolve, reject) => {
    http.get(base + '/api/me', { headers }, r => { r.resume(); r.on('end', () => resolve(r.statusCode)); }).on('error', reject);
  });
  assert.equal(gone, 401);
});

// ---------- Área de acessos às trilhas e aulas em construção ----------

test('área de acessos: só Marcelo, RH e admin entram; os demais recebem 403', async () => {
  const { cookie: func } = await login('carla.mendes@academia.exemplo');
  assert.equal((await request('GET', '/api/accesses', { cookie: func })).status, 403);
  const { cookie: ti } = await login('tiago.ramos@academia.exemplo');
  assert.equal((await request('GET', '/api/accesses', { cookie: ti })).status, 403);
  const { cookie: rh } = await login('juliana.prado@academia.exemplo');
  assert.equal((await request('GET', '/api/accesses', { cookie: rh })).status, 200);
  const { cookie: gestao } = await login('helena.duarte@academia.exemplo');
  const matrix = await request('GET', '/api/accesses', { cookie: gestao });
  assert.equal(matrix.status, 200);
  assert.equal(matrix.json.people.length, DEMO_USERS.length);
  assert.equal(matrix.json.tracks.length, TRACKS.length);
  assert.ok(matrix.json.labels.padrao);
  const carlaId = userIdFor('carla.mendes@academia.exemplo');
  assert.equal(matrix.json.states[carlaId]['fundamentos'], 'padrao');
  assert.equal(matrix.json.states[carlaId]['compliance-gestao'], 'sem');
  const helenaId = userIdFor('helena.duarte@academia.exemplo');
  assert.equal(matrix.json.states[helenaId]['compliance-gestao'], 'gestao');
});

test('liberação individual dá acesso a trilha de outro setor e fica na auditoria', async () => {
  const { cookie: func } = await login('carla.mendes@academia.exemplo');
  assert.equal((await request('GET', '/api/tracks/compliance-gestao', { cookie: func })).status, 404);
  const { cookie: gestao } = await login('helena.duarte@academia.exemplo');
  const res = await request('POST', '/api/accesses/user', {
    cookie: gestao,
    body: { userId: userIdFor('carla.mendes@academia.exemplo'), trackId: 'compliance-gestao', action: 'grant', reason: 'Apoio ao projeto de compliance do período' },
  });
  assert.equal(res.status, 200);
  const after = await request('GET', '/api/tracks/compliance-gestao', { cookie: func });
  assert.equal(after.status, 200);
  const matrix = await request('GET', '/api/accesses', { cookie: gestao });
  assert.equal(matrix.json.states[userIdFor('carla.mendes@academia.exemplo')]['compliance-gestao'], 'liberada');
  assert.ok(matrix.json.audit.some(e => e.action === 'grant' && e.trackId === 'compliance-gestao' && e.reason.includes('compliance')));
});

test('bloqueio individual tira trilha do próprio setor', async () => {
  const { cookie: func } = await login('rafael.nunes@academia.exemplo');
  assert.equal((await request('GET', '/api/tracks/funcionario-pedidos', { cookie: func })).status, 200);
  const { cookie: gestao } = await login('helena.duarte@academia.exemplo');
  const res = await request('POST', '/api/accesses/user', {
    cookie: gestao,
    body: { userId: userIdFor('rafael.nunes@academia.exemplo'), trackId: 'funcionario-pedidos', action: 'block', reason: 'Trilha reservada à próxima turma' },
  });
  assert.equal(res.status, 200);
  assert.equal((await request('GET', '/api/tracks/funcionario-pedidos', { cookie: func })).status, 404);
  const matrix = await request('GET', '/api/accesses', { cookie: gestao });
  assert.equal(matrix.json.states[userIdFor('rafael.nunes@academia.exemplo')]['funcionario-pedidos'], 'bloqueada');
});

test('aulas em construção aparecem marcadas, não contam no progresso e não são concluíveis', async () => {
  const { cookie } = await login('diego.moraes@academia.exemplo');
  const home = await request('GET', '/api/home', { cookie });
  assert.equal(home.status, 200);
  // Público do controlador de acesso: T01 (3) + T03 (2) + T04 (1) aulas publicadas.
  assert.equal(home.json.lessonsTotal, 6);
  const row = home.json.tracks.find(t => t.id === 'controle-acesso');
  assert.ok(row.pendingCount > 0);
  const track = await request('GET', '/api/tracks/controle-acesso', { cookie });
  assert.equal(track.status, 200);
  assert.equal(track.json.total, 0);
  assert.ok(track.json.lessons.every(l => l.pending === true && l.tag));
  const lesson = await request('GET', '/api/lessons/t22-credenciais', { cookie });
  assert.equal(lesson.status, 404);
  assert.equal(lesson.json.error, 'aula_em_construcao');
  const attempt = await request('POST', '/api/lessons/t22-credenciais/complete', { cookie, body: { choice: 0 } });
  assert.equal(attempt.status, 404);
  assert.equal(attempt.json.error, 'aula_em_construcao');
});

test('padrão do setor libera e retira trilhas para o setor inteiro', async () => {
  const { cookie: gestao } = await login('helena.duarte@academia.exemplo');
  const { cookie: diego } = await login('diego.moraes@academia.exemplo');
  assert.equal((await request('GET', '/api/tracks/portaria-rotina', { cookie: diego })).status, 404);
  const on = await request('POST', '/api/accesses/sector', {
    cookie: gestao,
    body: { sector: 'controlador_acesso', trackId: 'portaria-rotina', on: true, reason: 'Equipe fará apoio à portaria no período' },
  });
  assert.equal(on.status, 200);
  assert.equal((await request('GET', '/api/tracks/portaria-rotina', { cookie: diego })).status, 200);

  const { cookie: carla } = await login('carla.mendes@academia.exemplo');
  assert.equal((await request('GET', '/api/tracks/funcionario-pedidos', { cookie: carla })).status, 200);
  const off = await request('POST', '/api/accesses/sector', {
    cookie: gestao,
    body: { sector: 'funcionario', trackId: 'funcionario-pedidos', on: false, reason: 'Trilha suspensa para revisão do conteúdo' },
  });
  assert.equal(off.status, 200);
  assert.equal((await request('GET', '/api/tracks/funcionario-pedidos', { cookie: carla })).status, 404);
});

test('toda alteração de acesso exige motivo e fica registrada na auditoria', async () => {
  const { cookie: gestao } = await login('helena.duarte@academia.exemplo');
  const semMotivo = await request('POST', '/api/accesses/user', {
    cookie: gestao,
    body: { userId: userIdFor('diego.moraes@academia.exemplo'), trackId: 'gestao-painel', action: 'grant' },
  });
  assert.equal(semMotivo.status, 400);
  assert.equal(semMotivo.json.error, 'motivo_obrigatorio');
  const { cookie: func } = await login('carla.mendes@academia.exemplo');
  const semPermissao = await request('POST', '/api/accesses/user', {
    cookie: func,
    body: { userId: userIdFor('diego.moraes@academia.exemplo'), trackId: 'gestao-painel', action: 'grant', reason: 'Tentativa sem alçada' },
  });
  assert.equal(semPermissao.status, 403);
  const matrix = await request('GET', '/api/accesses', { cookie: gestao });
  assert.ok(matrix.json.audit.length >= 4);
  for (const entry of matrix.json.audit.slice(0, 5)) {
    assert.ok(entry.at && entry.byId && entry.byName && entry.reason, entry.trackId);
    assert.ok(entry.trackId);
  }
});

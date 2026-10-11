// Testa a versão estática (GitHub Pages) com o mesmo conteúdo e as mesmas regras do servidor.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, isPending } from '../src/content.mjs';

const store = new Map();
let fetchApi;

before(async () => {
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  globalThis.location = { href: 'https://berger33.github.io/gruposegsystemseguranca/academia-demo/' };
  globalThis.window = globalThis;
  await import('../src/demo-shim.mjs');
  fetchApi = globalThis.fetch;
});

const call = async (method, path, { body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchApi(`/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};

test('versão estática: login recusa senha errada e aceita a de demonstração', async () => {
  const bad = await call('POST', 'login', { body: { email: 'carla.mendes@academia.exemplo', password: 'x' } });
  assert.equal(bad.status, 401);
  const ok = await call('POST', 'login', { body: { email: 'carla.mendes@academia.exemplo', password: 'Academia#2026' } });
  assert.equal(ok.status, 200);
  assert.match(ok.json.token, /^[0-9a-f]{64}$/);
});

test('versão estática: sem token, a API responde 401', async () => {
  const res = await call('GET', 'home');
  assert.equal(res.status, 401);
});

test('versão estática: alçada e aulas seguem as regras do servidor', async () => {
  const { json: login } = await call('POST', 'login', { body: { email: 'paulo.teixeira@academia.exemplo', password: 'Academia#2026' } });
  const token = login.token;
  const home = await call('GET', 'home', { token });
  assert.equal(home.status, 200);
  assert.ok(home.json.tracks.every(t => t.id !== 'rh-processos'));
  const forbidden = await call('GET', 'tracks/rh-processos', { token });
  assert.equal(forbidden.status, 404);
  const lesson = await call('POST', 'lessons/cli-convite/complete', { token, body: { choice: 0 } });
  assert.equal(lesson.status, 200);
  assert.equal(lesson.json.alreadyCompleted, false);
  assert.equal(lesson.json.pointsEarned, lesson.json.correct ? 15 : 10);
  const again = await call('POST', 'lessons/cli-convite/complete', { token, body: { choice: 0 } });
  assert.equal(again.json.alreadyCompleted, true);
  const out = await call('POST', 'logout', { token });
  assert.equal(out.status, 200);
  assert.equal((await call('GET', 'me', { token })).status, 401);
});

test('versão estática: ranking e busca respeitam o setor', async () => {
  const { json: login } = await call('POST', 'login', { body: { email: 'marcos.alves@academia.exemplo', password: 'Academia#2026' } });
  const lb = await call('GET', 'leaderboard', { token: login.token });
  assert.ok(lb.json.top.every(r => r.name !== 'Paulo Teixeira'));
  assert.equal(lb.json.me.isMe, true);
  const search = await call('GET', 'search?q=desligamento', { token: login.token });
  assert.ok(search.json.results.some(r => r.id === 'rh-desligamento'));
});


test('versão estática: emite certificado após conclusão e valida código sem login', async () => {
  const { json: login } = await call('POST', 'login', { body: { email: 'camila.nogueira@academia.exemplo', password: 'Academia#2026' } });
  const token = login.token;
  const track = TRACKS.find(item => item.id === 'admin-sistema');
  const before = await call('POST', 'certificates', { token, body: { trackId: track.id } });
  assert.equal(before.status, 409);

  for (const lesson of track.lessons.filter(item => !isPending(item))) {
    const completed = await call('POST', `lessons/${lesson.id}/complete`, { token, body: { choice: lesson.quiz.answer } });
    assert.equal(completed.status, 200);
  }
  const issued = await call('POST', 'certificates', { token, body: { trackId: track.id } });
  assert.equal(issued.status, 200);
  assert.match(issued.json.certificate.code, /^SGS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  const verified = await call('GET', `certificates/${issued.json.certificate.code}`);
  assert.equal(verified.status, 200);
  assert.equal(verified.json.certificate.recipientName, 'Camila Nogueira');
  assert.equal((await call('GET', `certificates/${issued.json.certificate.code}`)).status, 200);
});

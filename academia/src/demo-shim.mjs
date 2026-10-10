// Versão estática de demonstração (GitHub Pages). Sem servidor:
// intercepta as chamadas /api/* do front-end e responde com a mesma lógica do servidor
// (conteúdo, pontuação, níveis, selos e ranking). Progresso e sessões ficam no navegador.
// ATENÇÃO: aqui a alçada NÃO é verificada em servidor. Serve só para demonstrar a interface.
import { TRACKS } from './content.mjs';
import { SECTORS } from './sectors.mjs';
import { POINTS, summarize, leaderboard } from './gamification.mjs';
import { isPending } from './content.mjs';
import { accessOf, visibleTracks, isManager } from './access.mjs';
import { accessPanel, changeGrant, changeDefault } from './acessos-api.mjs';
import { DEMO_USERS, userIdFor } from './demo-users.mjs';

const DEMO_PASSWORD = 'Academia#2026';
const STATE_KEY = 'academia-demo-estado-v2';
const SESSION_KEY = 'academia-demo-sessoes-v1';
const SESSION_TTL = 8 * 60 * 60 * 1000;

const lessonIndex = new Map();
for (const track of TRACKS) track.lessons.forEach((lesson, index) => lessonIndex.set(lesson.id, { track, lesson, index }));

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento indisponível: a demonstração segue só na memória da aba */
  }
}

function freshState() {
  const users = DEMO_USERS.map(u => ({ id: userIdFor(u.email), name: u.name, email: u.email, sector: u.sector }));
  const progress = {};
  const now = new Date().toISOString();
  for (const user of DEMO_USERS) {
    const mine = {};
    for (const lessonId of user.seeded) {
      const found = lessonIndex.get(lessonId);
      if (found) mine[lessonId] = { completedAt: now, firstChoice: found.lesson.quiz.answer, firstCorrect: true, pointsEarned: POINTS.lesson + POINTS.quiz };
    }
    if (Object.keys(mine).length) progress[userIdFor(user.email)] = mine;
  }
  return { users, progress, grants: {}, grantLog: [], sectorDefaults: {} };
}

function loadState() {
  const saved = readJson(STATE_KEY, null);
  if (saved && saved.users && saved.progress) return saved;
  const fresh = freshState();
  writeJson(STATE_KEY, fresh);
  return fresh;
}

function sessionUser(token) {
  if (!token) return null;
  const sessions = readJson(SESSION_KEY, {});
  const entry = sessions[token];
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    delete sessions[token];
    writeJson(SESSION_KEY, sessions);
    return null;
  }
  return entry.userId;
}

function publicUser(user) {
  return { id: user.id, name: user.name, firstName: user.name.split(' ')[0], email: user.email, sector: user.sector, sectorLabel: SECTORS[user.sector], isManager: isManager(user.sector) };
}

const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function resultOf(lesson, entry) {
  return { correct: entry.firstCorrect, chosen: entry.firstChoice, answer: lesson.quiz.answer, explanation: lesson.quiz.explanation, pointsEarned: entry.pointsEarned };
}

function handle(method, path, params, body, token) {
  const state = loadState();

  if (method === 'POST' && path === '/login') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = state.users.find(u => u.email === email);
    if (!user || String(body.password || '') !== DEMO_PASSWORD) return { status: 401, data: { error: 'credenciais_invalidas' } };
    const newToken = randomToken();
    const sessions = readJson(SESSION_KEY, {});
    sessions[newToken] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL };
    writeJson(SESSION_KEY, sessions);
    return { status: 200, data: { user: publicUser(user), token: newToken } };
  }

  if (method === 'POST' && path === '/logout') {
    const sessions = readJson(SESSION_KEY, {});
    delete sessions[token];
    writeJson(SESSION_KEY, sessions);
    return { status: 200, data: { ok: true } };
  }

  const user = state.users.find(u => u.id === sessionUser(token));
  if (!user) return { status: 401, data: { error: 'nao_autenticado' } };

  if (method === 'GET' && path === '/me') return { status: 200, data: { user: publicUser(user) } };

  if (method === 'GET' && path === '/home') {
    const s = summarize(state, user, TRACKS);
    return {
      status: 200,
      data: {
        user: publicUser(user),
        sector: { id: user.sector, label: SECTORS[user.sector] },
        points: s.points,
        level: s.level,
        lessonsDone: s.lessonsDone,
        lessonsTotal: s.lessonsTotal,
        tracks: s.tracks.map(({ lessons, ...rest }) => rest),
        next: s.next,
        badges: s.badges,
        leaderboard: leaderboard(state, user, TRACKS),
      },
    };
  }

  if (method === 'GET' && path === '/leaderboard') return { status: 200, data: leaderboard(state, user, TRACKS) };

  if (path.startsWith('/acessos')) {
    if (!isManager(user.sector)) return { status: 403, data: { error: 'sem_permissao' } };
    if (method === 'GET' && path === '/acessos') return { status: 200, data: accessPanel(state, TRACKS) };
    if (method === 'POST' && path === '/acessos/alterar') {
      const result = changeGrant(state, TRACKS, user, body);
      if (result.error) return { status: result.status, data: { error: result.error } };
      writeJson(STATE_KEY, state);
      return { status: 200, data: result };
    }
    if (method === 'POST' && path === '/acessos/padrao') {
      const result = changeDefault(state, TRACKS, user, body);
      if (result.error) return { status: result.status, data: { error: result.error } };
      writeJson(STATE_KEY, state);
      return { status: 200, data: result };
    }
  }

  if (method === 'GET' && path === '/search') {
    const q = normalize(params.get('q')).trim();
    if (q.length < 2) return { status: 200, data: { results: [] } };
    const results = [];
    for (const track of visibleTracks(user, state, TRACKS)) {
      for (const lesson of track.lessons.filter(l => !isPending(l))) {
        const haystack = normalize([lesson.title, lesson.objective, ...lesson.steps].join(' '));
        if (haystack.includes(q)) results.push({ id: lesson.id, title: lesson.title, minutes: lesson.minutes, trackId: track.id, trackTitle: track.title });
      }
    }
    return { status: 200, data: { results: results.slice(0, 20) } };
  }

  let match = path.match(/^\/tracks\/([a-z0-9-]+)$/);
  if (match && method === 'GET') {
    const s = summarize(state, user, TRACKS);
    const track = s.tracks.find(t => t.id === match[1]);
    if (!track) return { status: 404, data: { error: 'trilha_nao_encontrada' } };
    return { status: 200, data: { ...track, sectorLabel: SECTORS[user.sector] } };
  }

  match = path.match(/^\/lessons\/([a-z0-9-]+)$/);
  if (match && method === 'GET') {
    const found = lessonIndex.get(match[1]);
    if (!found || !accessOf(found.track, user, state).visible) return { status: 404, data: { error: 'aula_nao_encontrada' } };
    const { track, lesson, index } = found;
    if (isPending(lesson)) {
      return {
        status: 200,
        data: { id: lesson.id, title: lesson.title, minutes: lesson.minutes, objective: lesson.objective, steps: [], trackId: track.id, trackTitle: track.title, position: index + 1, total: track.lessons.length, pending: true, rotulo: lesson.rotulo || null, question: null, options: [], done: false, result: null, nextLessonId: null },
      };
    }
    const entry = (state.progress[user.id] || {})[lesson.id] || null;
    return {
      status: 200,
      data: {
        id: lesson.id,
        title: lesson.title,
        minutes: lesson.minutes,
        objective: lesson.objective,
        steps: lesson.steps,
        trackId: track.id,
        trackTitle: track.title,
        position: index + 1,
        total: track.lessons.length,
        question: lesson.quiz.question,
        options: lesson.quiz.options,
        done: Boolean(entry),
        result: entry ? resultOf(lesson, entry) : null,
        nextLessonId: track.lessons[index + 1]?.id || null,
      },
    };
  }

  match = path.match(/^\/lessons\/([a-z0-9-]+)\/complete$/);
  if (match && method === 'POST') {
    const found = lessonIndex.get(match[1]);
    if (!found || !accessOf(found.track, user, state).visible) return { status: 404, data: { error: 'aula_nao_encontrada' } };
    const { track, lesson, index } = found;
    if (isPending(lesson)) return { status: 409, data: { error: 'aula_em_construcao' } };
    const mine = state.progress[user.id] || (state.progress[user.id] = {});
    if (mine[lesson.id]) return { status: 200, data: { alreadyCompleted: true, ...resultOf(lesson, mine[lesson.id]) } };
    const choice = body.choice;
    if (!Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.options.length) return { status: 400, data: { error: 'resposta_invalida' } };

    const before = summarize(state, user, TRACKS);
    const correct = choice === lesson.quiz.answer;
    const pointsEarned = POINTS.lesson + (correct ? POINTS.quiz : 0);
    mine[lesson.id] = { completedAt: new Date().toISOString(), firstChoice: choice, firstCorrect: correct, pointsEarned };
    writeJson(STATE_KEY, state);
    const after = summarize(state, user, TRACKS);

    const trackBefore = before.tracks.find(t => t.id === track.id);
    const trackAfter = after.tracks.find(t => t.id === track.id);
    const newBadges = after.badges.earned.filter(b => !before.badges.earned.some(old => old.id === b.id));
    return {
      status: 200,
      data: {
        alreadyCompleted: false,
        correct,
        answer: lesson.quiz.answer,
        explanation: lesson.quiz.explanation,
        pointsEarned,
        points: after.points,
        level: after.level,
        levelUp: after.level.index > before.level.index,
        trackCompleted: Boolean(trackAfter?.complete && !trackBefore?.complete),
        newBadges,
        nextLessonId: track.lessons[index + 1]?.id || null,
      },
    };
  }

  return { status: 404, data: { error: 'nao_encontrado' } };
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

const host = typeof window !== 'undefined' ? window : globalThis;
const realFetch = host.fetch ? host.fetch.bind(host) : null;

host.fetch = async function demoFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, host.location ? host.location.href : 'http://localhost/');
  const at = url.pathname.indexOf('/api/');
  if (at === -1) return realFetch(input, init);
  const path = url.pathname.slice(at + '/api/'.length);
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  const auth = headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  let body = {};
  if (init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      return jsonResponse(400, { error: 'json_invalido' });
    }
  }
  const result = handle(method, '/' + path, url.searchParams, body, token);
  return jsonResponse(result.status, result.data);
};

// Carrega a interface depois de instalar o interceptador.
if (typeof document !== 'undefined') {
  const banner = document.createElement('div');
  banner.setAttribute('role', 'note');
  banner.style.cssText = 'background:#172b68;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center';
  banner.textContent = 'Demonstração estática publicada no GitHub Pages. Progresso e contas ficam neste navegador; a alçada não é verificada em servidor.';
  document.body.insertBefore(banner, document.body.firstChild);
  // Sinaliza ao app.js que está na demonstração (mostra a caixa de conta de demonstração no acesso).
  document.documentElement.dataset.demo = 'true';
  const script = document.createElement('script');
  script.src = 'app.js?v=8';
  document.body.appendChild(script);
}

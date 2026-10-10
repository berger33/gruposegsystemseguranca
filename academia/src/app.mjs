// Roteador HTTP da Academia (node:http, sem dependências).
// A alçada é aplicada no servidor: trilhas de outros setores respondem 404.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPassword, SESSION_TTL_MS } from './auth.mjs';
import { TRACKS } from './content.mjs';
import { SECTORS, canSeeTrack } from './sectors.mjs';
import { POINTS, summarize, leaderboard } from './gamification.mjs';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const COOKIE = 'academia_sessao';
const MAX_BODY = 8 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Sem "frame-ancestors 'none'": o preview do ambiente precisa embutir a página.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'",
};

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      reject(new HttpError(415, 'content_type_invalido'));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'corpo_grande_demais'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'json_invalido'));
      }
    });
    req.on('error', reject);
  });
}

// Aceita o cookie de sessão ou o token no cabeçalho Authorization.
// O cabeçalho existe porque alguns navegadores bloqueiam cookies de terceiros
// dentro do preview (iframe). O token fica na sessionStorage da aba.
function tokenOf(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// O preview do ambiente abre a página dentro de um iframe em outro site (HTTPS).
// Nesse contexto o navegador só guarda e envia cookies com SameSite=None; Secure.
// Em localhost (HTTP) continua SameSite=Lax.
function isLocalRequest(req) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '';
}

function cookieAttributes(req) {
  const forwardedHttps = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const https = forwardedHttps || Boolean(req.socket && req.socket.encrypted) || !isLocalRequest(req);
  return https ? 'SameSite=None; Secure' : 'SameSite=Lax';
}

const sessionCookie = (req, token) => `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${cookieAttributes(req)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
const clearCookie = req => `${COOKIE}=; Path=/; HttpOnly; ${cookieAttributes(req)}; Max-Age=0`;

const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function publicUser(user) {
  return { id: user.id, name: user.name, firstName: user.name.split(' ')[0], email: user.email, sector: user.sector, sectorLabel: SECTORS[user.sector] };
}

export function createApp({ store, sessions, content = TRACKS }) {
  const lessonIndex = new Map();
  for (const track of content) {
    track.lessons.forEach((lesson, index) => lessonIndex.set(lesson.id, { track, lesson, index }));
  }

  const currentUser = req => {
    const userId = sessions.get(tokenOf(req));
    return userId ? store.state.users.find(u => u.id === userId) || null : null;
  };

  function visibleLesson(user, lessonId) {
    const found = lessonIndex.get(lessonId);
    if (!found || !canSeeTrack(found.track, user.sector)) return null;
    return found;
  }

  function resultOf(lesson, entry) {
    return {
      correct: entry.firstCorrect,
      chosen: entry.firstChoice,
      answer: lesson.quiz.answer,
      explanation: lesson.quiz.explanation,
      pointsEarned: entry.pointsEarned,
    };
  }

  async function login(req, res) {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = store.state.users.find(u => u.email === email);
    if (!user || !verifyPassword(password, user)) {
      sendJson(res, 401, { error: 'credenciais_invalidas' });
      return;
    }
    const token = sessions.create(user.id);
    sendJson(res, 200, { user: publicUser(user), token }, { 'Set-Cookie': sessionCookie(req, token) });
  }

  async function complete(req, res, user, lessonId) {
    const found = visibleLesson(user, lessonId);
    if (!found) return sendJson(res, 404, { error: 'aula_nao_encontrada' });
    const { track, lesson, index } = found;
    const body = await readJson(req);
    const mine = store.state.progress[user.id] || (store.state.progress[user.id] = {});

    if (mine[lesson.id]) {
      return sendJson(res, 200, { alreadyCompleted: true, ...resultOf(lesson, mine[lesson.id]) });
    }

    const choice = body.choice;
    if (!Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.options.length) {
      return sendJson(res, 400, { error: 'resposta_invalida' });
    }

    const before = summarize(store.state, user, content);
    const correct = choice === lesson.quiz.answer;
    const pointsEarned = POINTS.lesson + (correct ? POINTS.quiz : 0);
    mine[lesson.id] = { completedAt: new Date().toISOString(), firstChoice: choice, firstCorrect: correct, pointsEarned };
    store.save();
    const after = summarize(store.state, user, content);

    const trackBefore = before.tracks.find(t => t.id === track.id);
    const trackAfter = after.tracks.find(t => t.id === track.id);
    const newBadges = after.badges.earned.filter(b => !before.badges.earned.some(old => old.id === b.id));
    const nextId = track.lessons[index + 1]?.id || null;

    return sendJson(res, 200, {
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
      nextLessonId: nextId,
    });
  }

  async function api(req, res, url) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/login' && m === 'POST') return login(req, res);
    if (p === '/api/logout' && m === 'POST') {
      sessions.drop(tokenOf(req));
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(req) });
    }

    const user = currentUser(req);
    if (!user) return sendJson(res, 401, { error: 'nao_autenticado' });

    if (p === '/api/me' && m === 'GET') return sendJson(res, 200, { user: publicUser(user) });

    if (p === '/api/home' && m === 'GET') {
      const s = summarize(store.state, user, content);
      return sendJson(res, 200, {
        user: publicUser(user),
        sector: { id: user.sector, label: SECTORS[user.sector] },
        points: s.points,
        level: s.level,
        lessonsDone: s.lessonsDone,
        lessonsTotal: s.lessonsTotal,
        tracks: s.tracks.map(({ lessons, ...rest }) => rest),
        next: s.next,
        badges: s.badges,
        leaderboard: leaderboard(store.state, user, content),
      });
    }

    if (p === '/api/leaderboard' && m === 'GET') return sendJson(res, 200, leaderboard(store.state, user, content));

    if (p === '/api/search' && m === 'GET') {
      const q = normalize(url.searchParams.get('q')).trim();
      if (q.length < 2) return sendJson(res, 200, { results: [] });
      const results = [];
      for (const track of content.filter(t => canSeeTrack(t, user.sector))) {
        for (const lesson of track.lessons) {
          const haystack = normalize([lesson.title, lesson.objective, ...lesson.steps].join(' '));
          if (haystack.includes(q)) results.push({ id: lesson.id, title: lesson.title, minutes: lesson.minutes, trackId: track.id, trackTitle: track.title });
        }
      }
      return sendJson(res, 200, { results: results.slice(0, 20) });
    }

    let match = p.match(/^\/api\/tracks\/([a-z0-9-]+)$/);
    if (match && m === 'GET') {
      const s = summarize(store.state, user, content);
      const track = s.tracks.find(t => t.id === match[1]);
      if (!track) return sendJson(res, 404, { error: 'trilha_nao_encontrada' });
      return sendJson(res, 200, { ...track, sectorLabel: SECTORS[user.sector] });
    }

    match = p.match(/^\/api\/lessons\/([a-z0-9-]+)$/);
    if (match && m === 'GET') {
      const found = visibleLesson(user, match[1]);
      if (!found) return sendJson(res, 404, { error: 'aula_nao_encontrada' });
      const { track, lesson, index } = found;
      const entry = (store.state.progress[user.id] || {})[lesson.id] || null;
      return sendJson(res, 200, {
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
      });
    }

    match = p.match(/^\/api\/lessons\/([a-z0-9-]+)\/complete$/);
    if (match && m === 'POST') return complete(req, res, user, match[1]);

    return sendJson(res, 404, { error: 'nao_encontrado' });
  }

  function serveStatic(res, url) {
    let decoded;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      return res.end();
    }
    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, relative);
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      return res.end('Não encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    fs.createReadStream(file).pipe(res);
    return undefined;
  }

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, SECURITY_HEADERS);
        return res.end();
      }
      return serveStatic(res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) sendJson(res, err.status, { error: err.code });
        return undefined;
      }
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'erro_interno' });
      return undefined;
    }
  };
}

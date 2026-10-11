// Usuários e progresso de DEMONSTRAÇÃO para a fase em construção.
// Não são pessoas reais. A senha vem de ACADEMIA_DEMO_PASSWORD; sem ela, usa-se
// a senha padrão de demonstração (proibida em produção).
import { hashPassword } from './auth.mjs';
import { POINTS } from './gamification.mjs';
import { TRACKS } from './content.mjs';

export const DEFAULT_DEMO_PASSWORD = 'Academia#2026';

export function demoPassword(env = process.env) {
  if (env.ACADEMIA_DEMO_PASSWORD) return env.ACADEMIA_DEMO_PASSWORD;
  if (env.NODE_ENV === 'production') {
    throw new Error('Defina ACADEMIA_DEMO_PASSWORD antes de criar usuários em produção.');
  }
  return DEFAULT_DEMO_PASSWORD;
}

export { DEMO_USERS, userIdFor } from './demo-users.mjs';
import { DEMO_USERS, userIdFor } from './demo-users.mjs';

// Completa um estado já existente: acrescenta usuários de demonstração que ainda não estão
// gravados (sem apagar progresso), e garante as estruturas de liberações e padrões.
export function completeState(state, { password = demoPassword(), content = TRACKS, now = new Date().toISOString() } = {}) {
  state.version = state.version || 1;
  state.demo = state.demo ?? true;
  state.users = state.users || [];
  state.progress = state.progress || {};
  state.grants = state.grants || {};
  state.grantLog = state.grantLog || [];
  state.sectorDefaults = state.sectorDefaults || {};
  state.certificates = state.certificates || {};
  const lessons = new Map();
  content.forEach(track => track.lessons.forEach(lesson => lessons.set(lesson.id, lesson)));
  const have = new Set(state.users.map(user => user.id));
  for (const user of DEMO_USERS) {
    const id = userIdFor(user.email);
    if (have.has(id)) continue;
    state.users.push({ id, name: user.name, email: user.email, sector: user.sector, ...hashPassword(password) });
    const mine = {};
    user.seeded.forEach(lessonId => {
      const lesson = lessons.get(lessonId);
      if (!lesson) return;
      mine[lessonId] = { completedAt: now, firstChoice: lesson.quiz.answer, firstCorrect: true, pointsEarned: POINTS.lesson + POINTS.quiz };
    });
    if (Object.keys(mine).length) state.progress[id] = mine;
  }
  return state;
}

export function buildSeedState(options = {}) {
  return completeState({ version: 1, demo: true, users: [], progress: {} }, options);
}

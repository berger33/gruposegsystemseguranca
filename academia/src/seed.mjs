// Usuários e progresso de DEMONSTRAÇÃO para a fase em construção.
// Não são pessoas reais. A senha vem de ACADEMIA_DEMO_PASSWORD; sem ela, usa-se
// a senha padrão de demonstração (proibida em produção).
import { hashPassword } from './auth.mjs';
import { POINTS } from './gamification.mjs';
import { TRACKS, isPending } from './content.mjs';

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

export function buildSeedState({ password = demoPassword(), content = TRACKS, now = new Date().toISOString() } = {}) {
  const lessons = new Map();
  content.forEach(track => track.lessons.forEach(lesson => lessons.set(lesson.id, lesson)));
  const users = DEMO_USERS.map(user => ({
    id: userIdFor(user.email),
    name: user.name,
    email: user.email,
    sector: user.sector,
    ...hashPassword(password),
  }));
  const progress = {};
  DEMO_USERS.forEach((user, i) => {
    const mine = {};
    user.seeded.forEach(lessonId => {
      const lesson = lessons.get(lessonId);
      if (!lesson || isPending(lesson)) return;
      mine[lessonId] = { completedAt: now, firstChoice: lesson.quiz.answer, firstCorrect: true, pointsEarned: POINTS.lesson + POINTS.quiz };
    });
    if (Object.keys(mine).length) progress[users[i].id] = mine;
  });
  return { version: 2, demo: true, users, progress, access: {}, sectorDefaults: {}, audit: [] };
}

// Migração dos dados já gravados: acrescenta usuários de demonstração novos e
// as estruturas da área de acessos sem apagar o progresso existente.
export function migrateState(state, { password = demoPassword(), now = new Date().toISOString() } = {}) {
  if (!state.users) state.users = [];
  if (!state.progress) state.progress = {};
  if (!state.access) state.access = {};
  if (!state.sectorDefaults) state.sectorDefaults = {};
  if (!state.audit) state.audit = [];
  const known = new Set(state.users.map(user => user.email));
  for (const user of DEMO_USERS) {
    if (known.has(user.email)) continue;
    state.users.push({ id: userIdFor(user.email), name: user.name, email: user.email, sector: user.sector, ...hashPassword(password), createdAt: now });
  }
  if (state.version !== 2) state.version = 2;
  return state;
}

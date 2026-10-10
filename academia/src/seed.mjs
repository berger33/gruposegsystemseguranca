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

// Dois usuários por setor: o primeiro começa do zero; o segundo tem progresso de exemplo.
export const DEMO_USERS = Object.freeze([
  { name: 'Carla Mendes', email: 'carla.mendes@academia.exemplo', sector: 'funcionario', seeded: [] },
  { name: 'Rafael Nunes', email: 'rafael.nunes@academia.exemplo', sector: 'funcionario', seeded: ['fund-acesso', 'fund-progresso', 'func-ponto'] },
  { name: 'Paulo Teixeira', email: 'paulo.teixeira@academia.exemplo', sector: 'cliente', seeded: [] },
  { name: 'Lúcia Andrade', email: 'lucia.andrade@academia.exemplo', sector: 'cliente', seeded: ['cli-convite', 'cli-seguranca'] },
  { name: 'Juliana Prado', email: 'juliana.prado@academia.exemplo', sector: 'rh', seeded: [] },
  { name: 'Marcos Alves', email: 'marcos.alves@academia.exemplo', sector: 'rh', seeded: ['rh-admissao', 'rh-credencial', 'rh-holerite'] },
  { name: 'Renata Costa', email: 'renata.costa@academia.exemplo', sector: 'comercial', seeded: [] },
  { name: 'Bruno Lima', email: 'bruno.lima@academia.exemplo', sector: 'comercial', seeded: ['fund-acesso', 'com-pedido', 'com-funil', 'com-proposta'] },
  { name: 'Fernando Gomes', email: 'fernando.gomes@academia.exemplo', sector: 'financeiro', seeded: [] },
  { name: 'Patrícia Souza', email: 'patricia.souza@academia.exemplo', sector: 'financeiro', seeded: ['fin-receber', 'fin-conciliacao'] },
  { name: 'Eduardo Martins', email: 'eduardo.martins@academia.exemplo', sector: 'supervisor', seeded: [] },
  { name: 'Sandra Pires', email: 'sandra.pires@academia.exemplo', sector: 'supervisor', seeded: ['op-escala', 'op-ocorrencias'] },
  { name: 'Helena Duarte', email: 'helena.duarte@academia.exemplo', sector: 'marcelo', seeded: [] },
  { name: 'Sérgio Faria', email: 'sergio.faria@academia.exemplo', sector: 'marcelo', seeded: ['ges-pendencias', 'ges-aprovacoes', 'ges-relatorios'] },
  { name: 'Tiago Ramos', email: 'tiago.ramos@academia.exemplo', sector: 'ti', seeded: [] },
  { name: 'Vanessa Lopes', email: 'vanessa.lopes@academia.exemplo', sector: 'ti', seeded: ['ti-papeis', 'ti-auditoria'] },
  { name: 'Camila Nogueira', email: 'camila.nogueira@academia.exemplo', sector: 'admin', seeded: [] },
  { name: 'Henrique Brito', email: 'henrique.brito@academia.exemplo', sector: 'admin', seeded: ['fund-acesso'] },
]);

export function userIdFor(email) {
  return `u-${email.split('@')[0].replace(/\./g, '-')}`;
}

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
      if (!lesson) return;
      mine[lessonId] = { completedAt: now, firstChoice: lesson.quiz.answer, firstCorrect: true, pointsEarned: POINTS.lesson + POINTS.quiz };
    });
    if (Object.keys(mine).length) progress[users[i].id] = mine;
  });
  return { version: 1, demo: true, users, progress };
}

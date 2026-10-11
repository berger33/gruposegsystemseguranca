// Regras de progresso: pontos, níveis, selos e ranking por setor.
// Pontos de aula são gravados na primeira conclusão. Bônus de trilha e selos
// são derivados do progresso, então não podem ficar fora de sincronia.
import { visibleTracks } from './access.mjs';
import { isPending } from './content.mjs';

export const POINTS = Object.freeze({ lesson: 10, quiz: 5, track: 30 });

export const LEVELS = Object.freeze([
  { name: 'Inicial', min: 0 },
  { name: 'Em desenvolvimento', min: 80 },
  { name: 'Proficiente', min: 200 },
  { name: 'Referência', min: 400 },
]);

const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);

export function levelFor(points) {
  let index = 0;
  LEVELS.forEach((level, i) => {
    if (points >= level.min) index = i;
  });
  const current = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  return {
    index,
    name: current.name,
    next: next ? { name: next.name, min: next.min, remaining: next.min - points } : null,
    percent: next ? Math.min(100, pct(points - current.min, next.min - current.min)) : 100,
  };
}

export function summarize(state, user, content) {
  const mine = state.progress[user.id] || {};
  const tracks = visibleTracks(user, state, content);
  let points = 0;
  let bonus = 0;
  let lessonsDone = 0;
  let lessonsTotal = 0;
  const earned = [];
  let next = null;

  const trackViews = tracks.map(track => {
    // Aulas em construção aparecem na trilha, mas não contam no progresso.
    const lessons = track.lessons.map(lesson => {
      const pending = isPending(lesson);
      const entry = pending ? null : mine[lesson.id] || null;
      if (!pending) {
        lessonsTotal += 1;
        if (entry) {
          points += entry.pointsEarned;
          lessonsDone += 1;
        } else if (!next) {
          next = { id: lesson.id, title: lesson.title, minutes: lesson.minutes, trackId: track.id, trackTitle: track.title };
        }
      }
      return {
        id: lesson.id,
        title: lesson.title,
        minutes: lesson.minutes,
        objective: lesson.objective,
        pending,
        rotulo: lesson.rotulo || null,
        done: Boolean(entry),
        firstCorrect: Boolean(entry && entry.firstCorrect),
      };
    });
    const published = lessons.filter(l => !l.pending);
    const done = published.filter(l => l.done).length;
    const complete = published.length > 0 && done === published.length;
    if (complete) {
      bonus += POINTS.track;
      earned.push({ id: `trilha-${track.id}`, title: 'Trilha concluída', detail: track.title });
      if (published.every(l => l.firstCorrect)) {
        earned.push({ id: `acerto-${track.id}`, title: 'Acerto integral', detail: track.title });
      }
    }
    return {
      id: track.id,
      group: track.group,
      title: track.title,
      summary: track.summary,
      total: published.length,
      pendingCount: lessons.length - published.length,
      done,
      percent: pct(done, published.length),
      complete,
      lessons,
    };
  });

  if (lessonsDone > 0) earned.unshift({ id: 'primeiro-passo', title: 'Primeiro passo', detail: 'Primeira aula concluída' });

  // Catálogo de selos: primeiro passo e, por trilha publicada, conclusão e acerto integral.
  const publishedTracks = trackViews.filter(t => t.total > 0).length;
  const catalogSize = 1 + publishedTracks * 2;
  const total = points + bonus;
  return {
    points: total,
    level: levelFor(total),
    lessonsDone,
    lessonsTotal,
    tracks: trackViews,
    next,
    badges: { earned, available: Math.max(0, catalogSize - earned.length) },
  };
}

export function leaderboard(state, user, content) {
  const members = state.users
    .filter(member => member.sector === user.sector)
    .map(member => {
      const s = summarize(state, member, content);
      return { id: member.id, name: member.name, points: s.points, lessonsDone: s.lessonsDone };
    });
  members.sort((a, b) => b.points - a.points || b.lessonsDone - a.lessonsDone || a.name.localeCompare(b.name, 'pt-BR'));
  // Classificação por competição: empates recebem a mesma posição.
  const ranked = members.map(member => ({
    rank: 1 + members.filter(other => other.points > member.points).length,
    name: member.name,
    points: member.points,
    isMe: member.id === user.id,
  }));
  return { top: ranked.slice(0, 5), me: ranked.find(row => row.isMe) || null, size: ranked.length };
}

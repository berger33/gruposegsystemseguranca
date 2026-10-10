// Área "Acessos às trilhas": matriz de pessoas por trilha, liberação e
// bloqueio individual, padrão do setor e auditoria. Compartilhado entre o
// servidor (app.mjs) e a versão estática de demonstração (demo-shim.mjs),
// para que as duas versões apliquem exatamente as mesmas regras.
//
// ATENÇÃO: na versão de demonstração não há servidor para garantir a alçada;
// a regra é aplicada só no navegador. A garantia existe apenas no servidor.
import { SECTORS } from './sectors.mjs';
import { canManageAccess, isManager, accessStateOf, sectorDefaultOf, ACCESS_STATE_LABELS } from './access.mjs';
import { isPending } from './content.mjs';
import { summarize } from './gamification.mjs';

const ACTIONS = Object.freeze({ grant: 'granted', block: 'blocked', reset: null });

function error(status, code) {
  return { ok: false, status, error: code };
}

function actorCanManage(actor) {
  return Boolean(actor && canManageAccess(actor.sector));
}

function trackIndex(content, trackId) {
  return content.find(track => track.id === trackId) || null;
}

function userIndex(state, userId) {
  return state.users.find(user => user.id === userId) || null;
}

function ensureShapes(state) {
  if (!state.access) state.access = {};
  if (!state.sectorDefaults) state.sectorDefaults = {};
  if (!state.audit) state.audit = [];
}

function pushAudit(state, entry) {
  state.audit.unshift(entry);
  if (state.audit.length > 500) state.audit.length = 500;
}

// Visão completa da área de acessos para quem pode gerenciar.
export function accessMatrix(state, content, actor) {
  if (!actorCanManage(actor)) return error(403, 'sem_permissao');
  ensureShapes(state);

  const people = state.users.map(user => {
    const s = summarize(state, user, content);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      sector: user.sector,
      sectorLabel: SECTORS[user.sector] || user.sector,
      manager: isManager(user.sector),
      points: s.points,
      lessonsDone: s.lessonsDone,
      lessonsTotal: s.lessonsTotal,
      progress: s.tracks.map(t => ({ id: t.id, done: t.done, total: t.total, pendingCount: t.pendingCount })),
    };
  });

  const tracks = content.map(track => ({
    id: track.id,
    title: track.title,
    group: track.group,
    pendingCount: track.lessons.filter(isPending).length,
  }));

  const states = {};
  for (const user of state.users) {
    states[user.id] = {};
    for (const track of content) states[user.id][track.id] = accessStateOf(track, user, state);
  }

  return {
    ok: true,
    data: {
      canManage: true,
      labels: ACCESS_STATE_LABELS,
      people,
      tracks,
      states,
      sectorDefaults: state.sectorDefaults,
      sectors: SECTORS,
      audit: state.audit.slice(0, 100),
    },
  };
}

// Liberação ('grant'), bloqueio ('block') ou volta ao padrão ('reset').
export function changeUserAccess(state, content, actor, body, now = new Date().toISOString()) {
  if (!actorCanManage(actor)) return error(403, 'sem_permissao');
  ensureShapes(state);

  const action = String(body.action || '');
  if (!(action in ACTIONS)) return error(400, 'acao_invalida');
  const target = userIndex(state, String(body.userId || ''));
  if (!target) return error(404, 'usuario_nao_encontrado');
  const track = trackIndex(content, String(body.trackId || ''));
  if (!track) return error(404, 'trilha_nao_encontrada');
  const reason = String(body.reason || '').trim();
  if (reason.length < 3) return error(400, 'motivo_obrigatorio');

  const mine = state.access[target.id] || (state.access[target.id] = { granted: [], blocked: [] });
  if (!Array.isArray(mine.granted)) mine.granted = [];
  if (!Array.isArray(mine.blocked)) mine.blocked = [];
  const listName = ACTIONS[action];
  const other = listName === 'granted' ? mine.blocked : mine.granted;

  // Uma pessoa não pode estar liberada e bloqueada ao mesmo tempo: o novo
  // estado vence e o anterior é removido.
  if (listName) {
    if (!mine[listName].includes(track.id)) mine[listName].push(track.id);
    const i = other.indexOf(track.id);
    if (i !== -1) other.splice(i, 1);
  } else {
    for (const key of ['granted', 'blocked']) {
      const i = mine[key].indexOf(track.id);
      if (i !== -1) mine[key].splice(i, 1);
    }
  }

  const entry = {
    at: now,
    action,
    byId: actor.id,
    byName: actor.name,
    userId: target.id,
    userName: target.name,
    trackId: track.id,
    trackTitle: track.title,
    reason,
  };
  pushAudit(state, entry);
  return { ok: true, data: { entry } };
}

// Padrão do setor: afeta todas as pessoas do setor que não tenham
// liberação ou bloqueio individual. Exige motivo (auditoria).
export function changeSectorDefault(state, content, actor, body, now = new Date().toISOString()) {
  if (!actorCanManage(actor)) return error(403, 'sem_permissao');
  ensureShapes(state);

  const sector = String(body.sector || '');
  if (!Object.prototype.hasOwnProperty.call(SECTORS, sector)) return error(400, 'setor_invalido');
  const track = trackIndex(content, String(body.trackId || ''));
  if (!track) return error(404, 'trilha_nao_encontrada');
  if (typeof body.on !== 'boolean') return error(400, 'padrao_invalido');
  const reason = String(body.reason || '').trim();
  if (reason.length < 3) return error(400, 'motivo_obrigatorio');

  const bySector = state.sectorDefaults[sector] || (state.sectorDefaults[sector] = {});
  // Volta ao padrão declarado pela trilha quando o valor coincide com ele.
  const declared = sectorDefaultOf(track, sector, { sectorDefaults: {} });
  if (body.on === declared) delete bySector[track.id];
  else bySector[track.id] = body.on;

  const entry = {
    at: now,
    action: body.on ? 'sector-on' : 'sector-off',
    byId: actor.id,
    byName: actor.name,
    sector,
    sectorLabel: SECTORS[sector],
    trackId: track.id,
    trackTitle: track.title,
    reason,
  };
  pushAudit(state, entry);
  return { ok: true, data: { entry } };
}

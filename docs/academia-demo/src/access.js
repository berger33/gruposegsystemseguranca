// Regra única de visibilidade das trilhas. Usada pelo servidor e pela versão de demonstração,
// para que as duas nunca divirjam.
//
// Ordem de decisão para uma pessoa e uma trilha:
//   1. Perfil de gestão total (admin, Marcelo): vê tudo, e não pode ser restringido.
//   2. Bloqueio individual: retira a trilha, mesmo dentro do setor.
//   3. Liberação individual: adiciona a trilha, mesmo fora do setor.
//   4. Padrão do setor: a lista de públicos da trilha (ou o padrão alterado pela gestão).
//
// Quem altera liberações e padrões: MANAGER_SECTORS (Marcelo, RH e admin).
import { SECTORS, isKnownSector } from './sectors.js';

export const FULL_ACCESS_SECTORS = Object.freeze(['admin', 'marcelo']);
export const MANAGER_SECTORS = Object.freeze(['admin', 'marcelo', 'rh']);

export const isManager = sector => MANAGER_SECTORS.includes(sector);

export function defaultAudiences(track, state) {
  const override = state && state.sectorDefaults && state.sectorDefaults[track.id];
  return Array.isArray(override) ? override : track.audiences;
}

export function accessOf(track, user, state) {
  if (!user || !isKnownSector(user.sector)) return { visible: false, source: 'nenhum' };
  if (FULL_ACCESS_SECTORS.includes(user.sector)) return { visible: true, source: 'gestao' };
  const grants = (state && state.grants && state.grants[user.id]) || {};
  if ((grants.remove || []).includes(track.id)) return { visible: false, source: 'bloqueada' };
  if ((grants.add || []).includes(track.id)) return { visible: true, source: 'liberada' };
  const audiences = defaultAudiences(track, state);
  if (audiences.includes('todos') || audiences.includes(user.sector)) return { visible: true, source: 'padrao' };
  return { visible: false, source: 'nenhum' };
}

export function visibleTracks(user, state, content) {
  return content.filter(track => accessOf(track, user, state).visible);
}

// Altera a liberação individual. 'padrao' remove qualquer liberação ou bloqueio.
export function applyGrant(state, { userId, trackId, action }) {
  state.grants = state.grants || {};
  const current = state.grants[userId] || { add: [], remove: [] };
  current.add = current.add.filter(id => id !== trackId);
  current.remove = current.remove.filter(id => id !== trackId);
  if (action === 'liberar') current.add.push(trackId);
  if (action === 'bloquear') current.remove.push(trackId);
  state.grants[userId] = current;
  return current;
}

// Altera o padrão de um setor para uma trilha. null restaura o padrão original da trilha.
export function applySectorDefault(state, { trackId, sectors }) {
  state.sectorDefaults = state.sectorDefaults || {};
  if (sectors === null) {
    delete state.sectorDefaults[trackId];
  } else {
    state.sectorDefaults[trackId] = sectors.filter(s => s === 'todos' || isKnownSector(s));
  }
  return state.sectorDefaults[trackId] || null;
}

export function appendLog(state, entry) {
  state.grantLog = state.grantLog || [];
  state.grantLog.push(entry);
  if (state.grantLog.length > 500) state.grantLog.splice(0, state.grantLog.length - 500);
}

export const ACTION_LABEL = Object.freeze({
  liberar: 'Liberou a trilha',
  bloquear: 'Bloqueou a trilha',
  padrao: 'Voltou ao padrão do setor',
  'padrao-setor': 'Alterou o padrão do setor',
});

export const SOURCE_LABEL = Object.freeze({
  gestao: 'Gestão total',
  padrao: 'Padrão do setor',
  liberada: 'Liberada',
  bloqueada: 'Bloqueada',
  nenhum: 'Sem acesso',
});

export { SECTORS };

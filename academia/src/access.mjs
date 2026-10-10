// Regra efetiva de acesso às trilhas, compartilhada pelo servidor (app.mjs),
// pelo resumo de progresso (gamification.mjs) e pela versão estática de
// demonstração (demo-shim.mjs). Assim existe uma única fonte da verdade.
//
// Modelo (plano de expansão, seção 5), em ordem:
//   1. Papel de gestão (Marcelo, admin): vê todas as trilhas.
//   2. Padrão do setor: as trilhas da matriz de audiências de cada trilha.
//   3. Liberação individual: trilha adicionada para uma pessoa.
//   4. Bloqueio individual: trilha retirada de uma pessoa.
//   Efetivo = (padrão do setor + liberações) − bloqueios.
//
// Quem altera permissões: Marcelo, RH e admin (decisão 3 confirmada).
// Detalhe ainda a definir com o usuário: se o RH altera qualquer trilha ou
// só as trilhas de RH. Por ora o RH altera qualquer trilha, como decidido.
import { SECTORS } from './sectors.mjs';

export const MANAGER_SECTORS = Object.freeze(['marcelo', 'admin']);
export const ACCESS_MANAGER_SECTORS = Object.freeze(['marcelo', 'admin', 'rh']);

export function isManager(sector) {
  return MANAGER_SECTORS.includes(sector);
}

export function canManageAccess(sector) {
  return ACCESS_MANAGER_SECTORS.includes(sector);
}

// Estado da célula de uma pessoa em uma trilha:
// 'gestao' | 'padrao' | 'liberada' | 'bloqueada' | 'sem'
export function accessStateOf(track, user, state = {}) {
  if (!user || !Object.prototype.hasOwnProperty.call(SECTORS, user.sector)) return 'sem';
  if (isManager(user.sector)) return 'gestao';
  const mine = (state.access && state.access[user.id]) || {};
  if (Array.isArray(mine.blocked) && mine.blocked.includes(track.id)) return 'bloqueada';
  if (Array.isArray(mine.granted) && mine.granted.includes(track.id)) return 'liberada';
  return sectorDefaultOf(track, user.sector, state) ? 'padrao' : 'sem';
}

export function canSeeTrack(track, user, state = {}) {
  const s = accessStateOf(track, user, state);
  return s === 'gestao' || s === 'padrao' || s === 'liberada';
}

// Padrão do setor: pode ser sobrescrito por setorDefaults; sem sobrescrita,
// vale a audiência declarada pela trilha.
export function sectorDefaultOf(track, sector, state = {}) {
  const custom = state.sectorDefaults && state.sectorDefaults[sector] && state.sectorDefaults[sector][track.id];
  if (typeof custom === 'boolean') return custom;
  return track.audiences.includes('todos') || track.audiences.includes(sector);
}

// Descrição do estado para a tela de acessos.
export const ACCESS_STATE_LABELS = Object.freeze({
  gestao: 'Papel de gestão',
  padrao: 'Padrão do setor',
  liberada: 'Liberada',
  bloqueada: 'Bloqueada',
  sem: 'Sem acesso',
});

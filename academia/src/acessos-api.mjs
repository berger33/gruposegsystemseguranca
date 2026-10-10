// Operações da área "Acessos às trilhas". Funções puras sobre o estado: o servidor e a
// versão de demonstração chamam as mesmas funções. Quem chama confirma as permissões
// (isManager) antes, e grava o estado depois de um resultado sem erro.
import { SECTORS } from './sectors.mjs';
import { accessOf, defaultAudiences, applyGrant, applySectorDefault, appendLog, FULL_ACCESS_SECTORS } from './access.mjs';
import { isPending } from './content.mjs';

export function personView(person, state, content) {
  const access = {};
  content.forEach(track => { access[track.id] = accessOf(track, person, state).source; });
  const grants = (state.grants || {})[person.id] || { add: [], remove: [] };
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    sector: person.sector,
    sectorLabel: SECTORS[person.sector],
    fullAccess: FULL_ACCESS_SECTORS.includes(person.sector),
    access,
    grants: { add: [...grants.add], remove: [...grants.remove] },
  };
}

export function accessPanel(state, content) {
  return {
    sectors: Object.entries(SECTORS).map(([id, label]) => ({ id, label })),
    tracks: content.map(track => ({
      id: track.id,
      group: track.group,
      title: track.title,
      audiences: defaultAudiences(track, state),
      customDefault: Array.isArray((state.sectorDefaults || {})[track.id]),
      published: track.lessons.filter(l => !isPending(l)).length,
      pending: track.lessons.filter(l => isPending(l)).length,
    })),
    people: state.users.map(person => personView(person, state, content)),
    log: (state.grantLog || []).slice(-60).reverse(),
  };
}

function checkMotive(body) {
  const motivo = String(body.motivo || '').trim();
  return motivo.length >= 5 ? { motivo: motivo.slice(0, 240) } : { error: 'motivo_obrigatorio', status: 400 };
}

export function changeGrant(state, content, actor, body, now = new Date().toISOString()) {
  const userId = String(body.userId || '');
  const trackId = String(body.trackId || '');
  const acao = String(body.acao || '');
  const target = state.users.find(u => u.id === userId);
  if (!target) return { error: 'pessoa_nao_encontrada', status: 404 };
  const track = content.find(t => t.id === trackId);
  if (!track) return { error: 'trilha_nao_encontrada', status: 404 };
  if (!['liberar', 'bloquear', 'padrao'].includes(acao)) return { error: 'acao_invalida', status: 400 };
  if (FULL_ACCESS_SECTORS.includes(target.sector)) return { error: 'perfil_de_gestao', status: 409 };
  const check = checkMotive(body);
  if (check.error) return check;
  const antes = accessOf(track, target, state).source;
  applyGrant(state, { userId, trackId, action: acao });
  const depois = accessOf(track, target, state).source;
  appendLog(state, {
    at: now, porId: actor.id, porNome: actor.name,
    pessoaId: userId, pessoaNome: target.name, trackId, trackTitle: track.title,
    acao, antes, depois, motivo: check.motivo,
  });
  return { person: personView(target, state, content) };
}

export function changeDefault(state, content, actor, body, now = new Date().toISOString()) {
  const trackId = String(body.trackId || '');
  const track = content.find(t => t.id === trackId);
  if (!track) return { error: 'trilha_nao_encontrada', status: 404 };
  let setores = null;
  if (body.setores !== null) {
    if (!Array.isArray(body.setores)) return { error: 'setores_invalidos', status: 400 };
    setores = body.setores.map(String);
    if (setores.some(s => s !== 'todos' && !Object.prototype.hasOwnProperty.call(SECTORS, s))) return { error: 'setor_invalido', status: 400 };
    if (setores.length === 0) return { error: 'setores_invalidos', status: 400 };
  }
  const check = checkMotive(body);
  if (check.error) return check;
  const antes = defaultAudiences(track, state);
  const depois = applySectorDefault(state, { trackId, sectors: setores });
  const shown = depois || track.audiences;
  appendLog(state, {
    at: now, porId: actor.id, porNome: actor.name,
    pessoaId: null, pessoaNome: null, trackId, trackTitle: track.title,
    acao: 'padrao-setor', antes: antes.join(', ') || 'nenhum', depois: shown.join(', ') || 'nenhum', motivo: check.motivo,
  });
  return { ok: true, trackId, audiences: defaultAudiences(track, state) };
}

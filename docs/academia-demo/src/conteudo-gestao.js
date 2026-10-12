// Área "Conteúdo" da gestão (Marcelo e admin): árvore por setor com trilhas (cursos) e
// aulas/vídeos, onde é possível alterar, remover (arquivar) e adicionar itens.
//
// Princípio: nada é destruído e o conteúdo original continua sendo a fonte das aulas.
// Em vez de copiar o conteúdo base, guardamos em `state.conteudo` apenas uma CAMADA de
// alterações (patches). Sem alterações, `resolveContent` devolve exatamente o conteúdo
// base — o comportamento anterior é preservado.
//
// Funções puras sobre o estado: o servidor e a versão de demonstração chamam as mesmas
// funções. Quem chama confirma a permissão (canManageContent) antes, e grava depois.
import { SECTORS, isKnownSector } from './sectors.js';
import { TRACKS } from './content.js';
import { defaultAudiences } from './access.js';

export const TIPOS = Object.freeze(['aula', 'video']);
export const TIPO_LABEL = Object.freeze({ aula: 'Aula', video: 'Vídeo' });
export const ORIGEM_LABEL = Object.freeze({ base: 'Original', novo: 'Adicionado' });

const LOG_LIMIT = 500;

// ---------- estado ----------

export function ensureConteudo(state) {
  state.conteudo = state.conteudo || {};
  const doc = state.conteudo;
  doc.rev = doc.rev || 1;
  doc.trilhas = doc.trilhas || {};
  doc.aulas = doc.aulas || {};
  doc.novasTrilhas = Array.isArray(doc.novasTrilhas) ? doc.novasTrilhas : [];
  doc.novasAulas = doc.novasAulas || {};
  state.contentLog = state.contentLog || [];
  return doc;
}

function patchTrilha(doc, id) {
  return (doc.trilhas && doc.trilhas[id]) || {};
}
function patchAula(doc, id) {
  return (doc.aulas && doc.aulas[id]) || {};
}
function novaTrilha(doc, id) {
  return (doc.novasTrilhas || []).find(t => t.id === id) || null;
}

// ---------- resolução do conteúdo efetivo ----------

function aulaDeBase(doc, lesson, trilhaId) {
  const patch = patchAula(doc, lesson.id);
  if (patch.archived) return null;
  const aula = { ...lesson };
  if (patch.title !== undefined) aula.title = patch.title;
  if (patch.minutes !== undefined) aula.minutes = patch.minutes;
  aula.kind = patch.kind || lesson.kind || 'aula';
  aula.videoUrl = patch.videoUrl || null;
  aula.origem = 'base';
  return aula;
}

function aulaNova(doc, registro) {
  if (!registro || registro.archived) return null;
  return {
    id: registro.id,
    title: registro.title,
    minutes: registro.minutes || 3,
    kind: registro.kind || 'aula',
    videoUrl: registro.videoUrl || null,
    status: 'em-construcao',
    objective: 'Conteúdo em construção.',
    steps: [],
    quiz: null,
    rotulo: 'Em construção',
    origem: 'novo',
  };
}

// Camada sem nenhuma alteração? Então nada precisa ser reconstruído.
function camadaVazia(doc) {
  if (!doc) return true;
  const vazio = valor => !valor || Object.keys(valor).length === 0;
  return vazio(doc.trilhas) && vazio(doc.aulas)
    && (!Array.isArray(doc.novasTrilhas) || doc.novasTrilhas.length === 0)
    && vazio(doc.novasAulas);
}

// Conteúdo efetivo: trilhas e aulas após aplicar a camada de alterações.
// Sem alterações registradas, devolve o próprio conteúdo base — mesma identidade,
// nenhuma cópia, nenhum campo extra: o comportamento anterior é preservado.
export function resolveContent(state, base = TRACKS) {
  const doc = state && state.conteudo;
  if (camadaVazia(doc)) return base;

  // Onde cada aula de base deve aparecer (permite mover entre trilhas).
  const destino = new Map();
  for (const track of base) {
    for (const lesson of track.lessons) {
      const alvo = patchAula(doc, lesson.id).trilhaId || track.id;
      if (!destino.has(alvo)) destino.set(alvo, []);
      destino.get(alvo).push(lesson);
    }
  }

  const montar = (id, grupo, titulo, resumo, audiences, arquivada) => {
    if (arquivada) return null;
    const aulas = [];
    for (const lesson of destino.get(id) || []) {
      const aula = aulaDeBase(doc, lesson, id);
      if (aula) aulas.push(aula);
    }
    for (const registro of Object.values(doc.novasAulas || {})) {
      if ((registro.trilhaId || null) !== id) continue;
      const aula = aulaNova(doc, registro);
      if (aula) aulas.push(aula);
    }
    return { id, group: grupo, title: titulo, summary: resumo, audiences, lessons: aulas };
  };

  const trilhas = [];
  for (const track of base) {
    const patch = patchTrilha(doc, track.id);
    const montada = montar(
      track.id,
      patch.group !== undefined ? patch.group : track.group,
      patch.title !== undefined ? patch.title : track.title,
      patch.summary !== undefined ? patch.summary : track.summary,
      track.audiences,
      patch.archived,
    );
    if (montada) trilhas.push(montada);
  }
  for (const nova of doc.novasTrilhas || []) {
    const montada = montar(nova.id, nova.group, nova.title, nova.summary, nova.audiences || [], nova.archived);
    if (montada) trilhas.push(montada);
  }
  return trilhas;
}

// ---------- árvore para a interface ----------

function setoresDaTrilha(track, state) {
  const efetivos = defaultAudiences(track, state);
  return efetivos.includes('todos') ? ['todos'] : efetivos.filter(isKnownSector);
}

export function conteudoTree(state, base = TRACKS) {
  const doc = ensureConteudo(state);
  const conteudo = resolveContent(state, base);

  const trilhas = conteudo.map(track => {
    const patch = patchTrilha(doc, track.id);
    const nova = novaTrilha(doc, track.id);
    const setores = setoresDaTrilha(track, state);
    const publicadas = track.lessons.filter(a => a.status !== 'em-construcao').length;
    return {
      id: track.id,
      group: track.group,
      title: track.title,
      summary: track.summary,
      origem: nova ? 'novo' : 'base',
      archived: false,
      setores,
      todosOsSetores: setores.includes('todos'),
      ajustePorSetor: Array.isArray((state.sectorDefaults || {})[track.id]),
      publicadas,
      emConstrucao: track.lessons.length - publicadas,
      videos: track.lessons.filter(a => a.kind === 'video').length,
      aulas: track.lessons.map(aula => ({
        id: aula.id,
        title: aula.title,
        minutes: aula.minutes,
        kind: aula.kind || 'aula',
        videoUrl: aula.videoUrl || null,
        origem: aula.origem || 'base',
        pendente: aula.status === 'em-construcao',
        archived: false,
      })),
      aulasArquivadas: aulasArquivadas(doc, base, track.id),
    };
  });

  const arquivadas = [];
  for (const track of base) {
    if (patchTrilha(doc, track.id).archived) {
      arquivadas.push({ id: track.id, title: nomeDaTrilha(doc, base, track.id), origem: 'base', aulas: track.lessons.length });
    }
  }
  for (const nova of doc.novasTrilhas || []) {
    if (nova.archived) arquivadas.push({ id: nova.id, title: nova.title, origem: 'novo', aulas: (nova.aulas || []).length });
  }

  const aulasArquivadasTotal = Object.entries(doc.aulas || {}).filter(([, p]) => p.archived).length +
    Object.values(doc.novasAulas || {}).filter(registro => registro.archived).length;

  return {
    setores: Object.entries(SECTORS).map(([id, label]) => ({ id, label })),
    trilhas,
    arquivadas,
    resumo: {
      trilhas: trilhas.length,
      aulas: trilhas.reduce((total, t) => total + t.aulas.length, 0),
      videos: trilhas.reduce((total, t) => total + t.videos, 0),
      arquivadas: arquivadas.length + aulasArquivadasTotal,
    },
    log: (state.contentLog || []).slice(-40).reverse(),
  };
}

function nomeDaTrilha(doc, base, id) {
  const patch = patchTrilha(doc, id);
  if (patch.title) return patch.title;
  const found = base.find(t => t.id === id);
  return found ? found.title : id;
}

function aulasArquivadas(doc, base, trilhaId) {
  const lista = [];
  for (const [id, patch] of Object.entries(doc.aulas || {})) {
    if (!patch.archived) continue;
    const origem = base.find(t => t.lessons.some(l => l.id === id));
    if (!origem || origem.id !== trilhaId) continue;
    const lesson = origem.lessons.find(l => l.id === id);
    lista.push({ id, title: patch.title || lesson.title, origem: 'base' });
  }
  for (const registro of Object.values(doc.novasAulas || {})) {
    if (registro.archived && registro.trilhaId === trilhaId) {
      lista.push({ id: registro.id, title: registro.title, origem: 'novo' });
    }
  }
  return lista;
}

// ---------- validação ----------

function texto(valor) {
  return String(valor === undefined || valor === null ? '' : valor).trim();
}

function limitar(valor, max) {
  return valor.slice(0, max);
}

function checkTitulo(body) {
  const titulo = texto(body.titulo);
  if (titulo.length < 3) return { error: 'titulo_curto', status: 400 };
  if (titulo.length > 120) return { error: 'titulo_longo', status: 400 };
  return { titulo: limitar(titulo, 120) };
}

function checkMinutos(body, padrao = 3) {
  if (body.minutos === undefined || body.minutos === null || body.minutos === '') return { minutos: padrao };
  const minutos = Number(body.minutos);
  if (!Number.isFinite(minutos) || minutos < 1 || minutos > 600) return { error: 'minutos_invalidos', status: 400 };
  return { minutos: Math.round(minutos) };
}

function checkTipo(body) {
  const tipo = texto(body.tipo) || 'aula';
  if (!TIPOS.includes(tipo)) return { error: 'tipo_invalido', status: 400 };
  return { tipo };
}

function checkVideoUrl(body, tipo) {
  const url = texto(body.videoUrl);
  if (!url) return { videoUrl: null };
  if (url.length > 500) return { error: 'video_url_longa', status: 400 };
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return { error: 'video_url_invalida', status: 400 };
  if (tipo !== 'video') return { error: 'video_url_sem_tipo', status: 400 };
  return { videoUrl: url };
}

function checkSetores(body) {
  if (body.setores === undefined) return null;
  if (!Array.isArray(body.setores) || body.setores.length === 0) return { error: 'setores_invalidos', status: 400 };
  const setores = body.setores.map(String);
  if (setores.some(s => s !== 'todos' && !isKnownSector(s))) return { error: 'setor_invalido', status: 400 };
  return { setores };
}

export function checkMotivo(body) {
  const motivo = texto(body.motivo);
  return motivo.length >= 5 ? { motivo: limitar(motivo, 240) } : { error: 'motivo_obrigatorio', status: 400 };
}

// id livre: deriva do título e desempata com sufixo numérico.
export function idLivre(texto, ocupados) {
  const base = String(texto)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'conteudo';
  if (!ocupados.has(base)) return base;
  for (let n = 2; n < 200; n += 1) {
    const candidato = `${base}-${n}`;
    if (!ocupados.has(candidato)) return candidato;
  }
  return `${base}-${Date.now()}`;
}

export function idsOcupados(state, base = TRACKS) {
  const doc = ensureConteudo(state);
  const ids = new Set();
  for (const track of base) {
    ids.add(track.id);
    track.lessons.forEach(lesson => ids.add(lesson.id));
  }
  for (const track of doc.novasTrilhas || []) {
    ids.add(track.id);
    (track.aulas || []).forEach(id => ids.add(id));
  }
  Object.keys(doc.novasAulas || {}).forEach(id => ids.add(id));
  return ids;
}

// ---------- alterações ----------

function log(state, entry) {
  state.contentLog = state.contentLog || [];
  state.contentLog.push(entry);
  if (state.contentLog.length > LOG_LIMIT) state.contentLog.splice(0, state.contentLog.length - LOG_LIMIT);
}

function actorRef(actor) {
  return { porId: actor.id, porNome: actor.name };
}

export function salvarTrilha(state, base, actor, body, now = new Date().toISOString()) {
  const doc = ensureConteudo(state);
  const acao = texto(body.acao) || 'editar';
  if (!['criar', 'editar', 'arquivar', 'restaurar'].includes(acao)) return { error: 'acao_invalida', status: 400 };
  const check = checkMotivo(body);
  if (check.error) return check;

  const id = texto(body.trilhaId);
  const nova = id ? novaTrilha(doc, id) : null;
  const naBase = base.find(t => t.id === id) || null;
  if (acao !== 'criar' && id && !nova && !naBase) return { error: 'trilha_nao_encontrada', status: 404 };

  if (acao === 'criar') {
    const titulo = checkTitulo(body);
    if (titulo.error) return titulo;
    const grupo = limitar(texto(body.grupo) || 'Adicionadas', 60);
    const resumo = limitar(texto(body.resumo), 240);
    const setores = checkSetores(body);
    if (setores && setores.error) return setores;
    const novoId = idLivre(titulo.titulo, idsOcupados(state, base));
    doc.novasTrilhas.push({
      id: novoId,
      group: grupo,
      title: titulo.titulo,
      summary: resumo || 'Trilha adicionada pela gestão.',
      audiences: setores ? setores.setores : ['todos'],
      archived: false,
      aulas: [],
    });
    doc.rev += 1;
    log(state, { at: now, ...actorRef(actor), acao: 'trilha-criada', alvoId: novoId, alvoTitulo: titulo.titulo, antes: '—', depois: grupo, motivo: check.motivo });
    return { ok: true, trilhaId: novoId };
  }

  if (acao === 'arquivar' || acao === 'restaurar') {
    const arquivar = acao === 'arquivar';
    const titulo = nomeDaTrilha(doc, base, id);
    if (nova) nova.archived = arquivar;
    else {
      doc.trilhas[id] = { ...patchTrilha(doc, id), archived: arquivar };
      if (arquivar === false) delete doc.trilhas[id].archived;
    }
    doc.rev += 1;
    log(state, {
      at: now, ...actorRef(actor), acao: arquivar ? 'trilha-arquivada' : 'trilha-restaurada',
      alvoId: id, alvoTitulo: titulo, antes: arquivar ? 'ativa' : 'arquivada', depois: arquivar ? 'arquivada' : 'ativa', motivo: check.motivo,
    });
    return { ok: true, trilhaId: id, archived: arquivar };
  }

  // editar
  const titulo = body.titulo === undefined ? null : checkTitulo(body);
  if (titulo && titulo.error) return titulo;
  const setores = checkSetores(body);
  if (setores && setores.error) return setores;
  const antes = {
    titulo: nomeDaTrilha(doc, base, id),
    grupo: (nova ? nova.group : (patchTrilha(doc, id).group !== undefined ? patchTrilha(doc, id).group : (naBase ? naBase.group : ''))),
  };
  const alvo = nova || (doc.trilhas[id] = patchTrilha(doc, id));
  if (titulo) alvo.title = titulo.titulo;
  if (body.grupo !== undefined) alvo.group = limitar(texto(body.grupo), 60) || antes.grupo;
  if (body.resumo !== undefined) alvo.summary = limitar(texto(body.resumo), 240);
  if (setores) alvo.audiences = setores.setores;
  doc.rev += 1;
  log(state, {
    at: now, ...actorRef(actor), acao: 'trilha-editada', alvoId: id, alvoTitulo: titulo ? titulo.titulo : antes.titulo,
    antes: antes.grupo, depois: (alvo.group !== undefined ? alvo.group : antes.grupo), motivo: check.motivo,
  });
  return { ok: true, trilhaId: id };
}

export function salvarAula(state, base, actor, body, now = new Date().toISOString()) {
  const doc = ensureConteudo(state);
  const acao = texto(body.acao) || 'editar';
  if (!['criar', 'editar', 'arquivar', 'restaurar', 'mover'].includes(acao)) return { error: 'acao_invalida', status: 400 };
  const check = checkMotivo(body);
  if (check.error) return check;

  const trilhaId = texto(body.trilhaId);
  const destinoId = texto(body.destinoTrilhaId);
  const aulaId = texto(body.aulaId);
  const ehNovaTrilha = id => Boolean(novaTrilha(doc, id));
  const trilhaExiste = id => Boolean(base.find(t => t.id === id)) || ehNovaTrilha(id);
  if (!trilhaExiste(trilhaId)) return { error: 'trilha_nao_encontrada', status: 404 };

  const aulaDaBase = base.flatMap(t => t.lessons).find(l => l.id === aulaId) || null;
  const aulaNovaReg = (doc.novasAulas || {})[aulaId] || null;

  if (acao === 'criar') {
    const titulo = checkTitulo(body);
    if (titulo.error) return titulo;
    const tipo = checkTipo(body);
    if (tipo.error) return tipo;
    const video = checkVideoUrl(body, tipo.tipo);
    if (video.error) return video;
    const minutos = checkMinutos(body, tipo.tipo === 'video' ? 5 : 3);
    if (minutos.error) return minutos;
    const novoId = idLivre(`${trilhaId}-${titulo.titulo}`, idsOcupados(state, base));
    doc.novasAulas[novoId] = {
      id: novoId,
      trilhaId,
      title: titulo.titulo,
      minutes: minutos.minutos,
      kind: tipo.tipo,
      videoUrl: video.videoUrl,
      archived: false,
    };
    doc.rev += 1;
    log(state, {
      at: now, ...actorRef(actor), acao: 'aula-criada', alvoId: novoId, alvoTitulo: titulo.titulo,
      antes: '—', depois: `${TIPO_LABEL[tipo.tipo]} em ${nomeDaTrilha(doc, base, trilhaId)}`, motivo: check.motivo,
    });
    return { ok: true, aulaId: novoId };
  }

  if (!aulaDaBase && !aulaNovaReg) return { error: 'aula_nao_encontrada', status: 404 };

  if (acao === 'arquivar' || acao === 'restaurar') {
    const arquivar = acao === 'arquivar';
    const titulo = aulaNovaReg ? aulaNovaReg.title : patchAula(doc, aulaId).title || aulaDaBase.title;
    if (aulaNovaReg) aulaNovaReg.archived = arquivar;
    else {
      doc.aulas[aulaId] = { ...patchAula(doc, aulaId), archived: arquivar };
      if (!arquivar) delete doc.aulas[aulaId].archived;
    }
    doc.rev += 1;
    log(state, {
      at: now, ...actorRef(actor), acao: arquivar ? 'aula-arquivada' : 'aula-restaurada',
      alvoId: aulaId, alvoTitulo: titulo, antes: arquivar ? 'ativa' : 'arquivada', depois: arquivar ? 'arquivada' : 'ativa', motivo: check.motivo,
    });
    return { ok: true, aulaId, archived: arquivar };
  }

  if (acao === 'mover') {
    if (!trilhaExiste(destinoId)) return { error: 'trilha_destino_nao_encontrada', status: 404 };
    if (destinoId === trilhaId) return { error: 'destino_igual', status: 400 };
    if (aulaNovaReg) aulaNovaReg.trilhaId = destinoId;
    else doc.aulas[aulaId] = { ...patchAula(doc, aulaId), trilhaId: destinoId };
    doc.rev += 1;
    log(state, {
      at: now, ...actorRef(actor), acao: 'aula-movida', alvoId: aulaId,
      alvoTitulo: aulaNovaReg ? aulaNovaReg.title : patchAula(doc, aulaId).title || aulaDaBase.title,
      antes: nomeDaTrilha(doc, base, trilhaId), depois: nomeDaTrilha(doc, base, destinoId), motivo: check.motivo,
    });
    return { ok: true, aulaId, trilhaId: destinoId };
  }

  // editar
  const titulo = body.titulo === undefined ? null : checkTitulo(body);
  if (titulo && titulo.error) return titulo;
  const tipo = body.tipo === undefined ? null : checkTipo(body);
  if (tipo && tipo.error) return tipo;
  const tipoFinal = (tipo ? tipo.tipo : null) || (aulaNovaReg ? aulaNovaReg.kind : patchAula(doc, aulaId).kind) || aulaDaBase.kind || 'aula';
  const video = checkVideoUrl(body, tipoFinal);
  if (video.error) return video;
  const minutos = checkMinutos(body, aulaNovaReg ? aulaNovaReg.minutes : patchAula(doc, aulaId).minutes || aulaDaBase.minutes);
  if (minutos.error) return minutos;

  const alvo = aulaNovaReg || (doc.aulas[aulaId] = patchAula(doc, aulaId));
  if (titulo) alvo.title = titulo.titulo;
  if (tipo) alvo.kind = tipo.tipo;
  if (body.videoUrl !== undefined) alvo.videoUrl = video.videoUrl;
  if (body.minutos !== undefined) alvo.minutes = minutos.minutos;
  if (alvo.kind !== 'video') alvo.videoUrl = null;
  doc.rev += 1;
  log(state, {
    at: now, ...actorRef(actor), acao: 'aula-editada', alvoId: aulaId,
    alvoTitulo: titulo ? titulo.titulo : (aulaNovaReg ? aulaNovaReg.title : aulaDaBase.title),
    antes: TIPO_LABEL[aulaNovaReg ? aulaNovaReg.kind : (patchAula(doc, aulaId).kind || aulaDaBase.kind || 'aula')],
    depois: TIPO_LABEL[alvo.kind || aulaDaBase.kind || 'aula'], motivo: check.motivo,
  });
  return { ok: true, aulaId };
}

export const CONTENT_ACTION_LABEL = Object.freeze({
  'trilha-criada': 'Criou a trilha',
  'trilha-editada': 'Alterou a trilha',
  'trilha-arquivada': 'Removeu a trilha',
  'trilha-restaurada': 'Restaurou a trilha',
  'aula-criada': 'Adicionou conteúdo',
  'aula-editada': 'Alterou o conteúdo',
  'aula-arquivada': 'Removeu o conteúdo',
  'aula-restaurada': 'Restaurou o conteúdo',
  'aula-movida': 'Moveu o conteúdo de trilha',
});

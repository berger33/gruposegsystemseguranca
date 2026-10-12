// Área "Conteúdo" (gestão) e conta de administrador da Academia.
// Cobre a preservação do conteúdo original, as alterações permitidas e as permissões.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TRACKS, lessonCount, publishedLessonCount } from '../src/content.mjs';
import { resolveContent, conteudoTree, salvarTrilha, salvarAula, ensureConteudo, idLivre } from '../src/conteudo-gestao.mjs';
import { canManageContent, isManager, accessOf } from '../src/access.mjs';
import { buildSeedState } from '../src/seed.mjs';
import { ensureAdminAccount, setAdminPassword, adminEmail, adminPassword, ADMIN_EMAIL } from '../src/admin-users.mjs';
import { hashPassword, verifyPassword } from '../src/auth.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));

function estado() {
  return buildSeedState({ now: '2026-01-01T00:00:00.000Z' });
}

const gestor = { id: 'u-gestor', name: 'Marcelo', sector: 'marcelo' };
const motivo = 'ajuste de conteúdo da trilha';

// ---------- preservação do conteúdo existente ----------

test('sem alterações registradas, o conteúdo efetivo é exatamente o conteúdo base', () => {
  const state = estado();
  assert.equal(resolveContent(state, TRACKS), TRACKS, 'nenhuma cópia nem reescrita do conteúdo');
  assert.equal(lessonCount(resolveContent(state, TRACKS)), lessonCount(TRACKS));
  assert.equal(publishedLessonCount(resolveContent(state, TRACKS)), publishedLessonCount(TRACKS));
});

test('a árvore lista todos os setores e todas as trilhas com suas aulas', () => {
  const state = estado();
  const arvore = conteudoTree(state, TRACKS);
  assert.equal(arvore.setores.length, 13);
  assert.equal(arvore.trilhas.length, TRACKS.length);
  assert.equal(arvore.resumo.trilhas, TRACKS.length);
  assert.equal(arvore.resumo.aulas, lessonCount(TRACKS));
  const fundamentos = arvore.trilhas.find(t => t.id === 'fundamentos');
  assert.deepEqual(fundamentos.setores, ['todos']);
  assert.equal(fundamentos.aulas.length, 3);
  assert.equal(fundamentos.aulas[0].kind, 'aula', 'aulas originais continuam sendo aulas');
});

// ---------- trilhas ----------

test('cria trilha nova e ela entra no conteúdo efetivo como aula em construção', () => {
  const state = estado();
  const antes = lessonCount(resolveContent(state, TRACKS));
  const r = salvarTrilha(state, TRACKS, gestor, { acao: 'criar', titulo: 'Reciclagem anual', grupo: 'RH', resumo: 'Turma de 2027', setores: ['rh'], motivo });
  assert.equal(r.ok, true);
  assert.equal(r.trilhaId, 'reciclagem-anual');

  const conteudo = resolveContent(state, TRACKS);
  assert.equal(conteudo.length, TRACKS.length + 1);
  assert.equal(lessonCount(conteudo), antes, 'trilha nova nasce sem aulas');

  const nova = conteudo.find(t => t.id === 'reciclagem-anual');
  assert.deepEqual([...nova.audiences], ['rh']);
  assert.equal(accessOf(nova, { id: 'x', sector: 'rh' }, state).visible, true);
  assert.equal(accessOf(nova, { id: 'y', sector: 'ti' }, state).visible, false);
});

test('edita título e resumo de uma trilha original sem tocar nas aulas', () => {
  const state = estado();
  const original = TRACKS.find(t => t.id === 'fundamentos');
  const r = salvarTrilha(state, TRACKS, gestor, { acao: 'editar', trilhaId: 'fundamentos', titulo: 'Fundamentos (revisado)', resumo: 'Novo resumo', motivo });
  assert.equal(r.ok, true);
  const trilha = resolveContent(state, TRACKS).find(t => t.id === 'fundamentos');
  assert.equal(trilha.title, 'Fundamentos (revisado)');
  assert.equal(trilha.summary, 'Novo resumo');
  assert.equal(trilha.lessons.length, original.lessons.length);
  assert.equal(trilha.lessons[0].id, original.lessons[0].id);
  assert.equal(trilha.lessons[0].quiz.answer, original.lessons[0].quiz.answer, 'quiz original intacto');
  assert.equal(TRACKS.find(t => t.id === 'fundamentos').title, original.title, 'conteúdo base não é mutado');
});

test('arquivar trilha a remove da visão sem apagar aulas e permite restaurar', () => {
  const state = estado();
  const total = lessonCount(resolveContent(state, TRACKS));
  salvarTrilha(state, TRACKS, gestor, { acao: 'arquivar', trilhaId: 'porteiros', motivo });
  const conteudo = resolveContent(state, TRACKS);
  assert.equal(conteudo.some(t => t.id === 'porteiros'), false);
  assert.equal(lessonCount(conteudo), total - TRACKS.find(t => t.id === 'porteiros').lessons.length);

  const arvore = conteudoTree(state, TRACKS);
  assert.ok(arvore.arquivadas.some(a => a.id === 'porteiros'), 'trilha arquivada continua listada para restauração');

  salvarTrilha(state, TRACKS, gestor, { acao: 'restaurar', trilhaId: 'porteiros', motivo: 'volta a valer' });
  assert.equal(resolveContent(state, TRACKS).some(t => t.id === 'porteiros'), true);
});

// ---------- aulas e vídeos ----------

test('adiciona aula e vídeo na trilha, com URL validada', () => {
  const state = estado();
  const aula = salvarAula(state, TRACKS, gestor, { acao: 'criar', trilhaId: 'fundamentos', titulo: 'Novo módulo prático', minutos: '7', motivo });
  assert.equal(aula.ok, true);
  const video = salvarAula(state, TRACKS, gestor, { acao: 'criar', trilhaId: 'fundamentos', titulo: 'Vídeo de abertura', tipo: 'video', videoUrl: 'https://exemplo.invalid/video', motivo });
  assert.equal(video.ok, true);

  const trilha = resolveContent(state, TRACKS).find(t => t.id === 'fundamentos');
  const novaAula = trilha.lessons.find(l => l.id === aula.aulaId);
  const novoVideo = trilha.lessons.find(l => l.id === video.aulaId);
  assert.equal(novaAula.kind, 'aula');
  assert.equal(novaAula.status, 'em-construcao', 'conteúdo novo entra como em construção');
  assert.equal(novoVideo.kind, 'video');
  assert.equal(novoVideo.videoUrl, 'https://exemplo.invalid/video');
  assert.equal(conteudoTree(state, TRACKS).resumo.videos, 1);
});

test('recusa vídeo com URL inválida ou URL sem o tipo vídeo', () => {
  const state = estado();
  const url = salvarAula(state, TRACKS, gestor, { acao: 'criar', trilhaId: 'fundamentos', titulo: 'Vídeo quebrado', tipo: 'video', videoUrl: 'javascript:alert(1)', motivo });
  assert.equal(url.error, 'video_url_invalida');
  const semTipo = salvarAula(state, TRACKS, gestor, { acao: 'criar', trilhaId: 'fundamentos', titulo: 'Aula com URL', tipo: 'aula', videoUrl: 'https://exemplo.invalid/v', motivo });
  assert.equal(semTipo.error, 'video_url_sem_tipo');
});

test('arquiva e restaura uma aula original mantendo o quiz disponível ao restaurar', () => {
  const state = estado();
  const alvo = 'fund-progresso';
  salvarAula(state, TRACKS, gestor, { acao: 'arquivar', trilhaId: 'fundamentos', aulaId: alvo, motivo });
  let trilha = resolveContent(state, TRACKS).find(t => t.id === 'fundamentos');
  assert.equal(trilha.lessons.some(l => l.id === alvo), false);

  salvarAula(state, TRACKS, gestor, { acao: 'restaurar', trilhaId: 'fundamentos', aulaId: alvo, motivo: 'volta' });
  trilha = resolveContent(state, TRACKS).find(t => t.id === 'fundamentos');
  const aula = trilha.lessons.find(l => l.id === alvo);
  assert.ok(aula, 'aula restaurada volta com o conteúdo original');
  assert.ok(aula.quiz && typeof aula.quiz.answer === 'number');
});

test('move uma aula para outra trilha sem duplicar', () => {
  const state = estado();
  const r = salvarAula(state, TRACKS, gestor, { acao: 'mover', trilhaId: 'fundamentos', aulaId: 'fund-base', destinoTrilhaId: 'rh-processos', motivo });
  assert.equal(r.ok, true);
  const conteudo = resolveContent(state, TRACKS);
  assert.equal(conteudo.find(t => t.id === 'fundamentos').lessons.some(l => l.id === 'fund-base'), false);
  assert.equal(conteudo.find(t => t.id === 'rh-processos').lessons.some(l => l.id === 'fund-base'), true);
  const ocorrencias = conteudo.reduce((total, t) => total + t.lessons.filter(l => l.id === 'fund-base').length, 0);
  assert.equal(ocorrencias, 1, 'aula aparece em uma única trilha');
});

test('edita tipo e duração de uma aula original', () => {
  const state = estado();
  salvarAula(state, TRACKS, gestor, { acao: 'editar', trilhaId: 'fundamentos', aulaId: 'fund-acesso', titulo: 'Primeiro acesso (atualizado)', minutos: 9, motivo });
  const aula = resolveContent(state, TRACKS).find(t => t.id === 'fundamentos').lessons.find(l => l.id === 'fund-acesso');
  assert.equal(aula.title, 'Primeiro acesso (atualizado)');
  assert.equal(aula.minutes, 9);
  assert.equal(aula.quiz.question, TRACKS[0].lessons[0].quiz.question);
});

// ---------- validação e registro ----------

test('exige motivo com pelo menos 5 caracteres em toda alteração', () => {
  const state = estado();
  for (const chamada of [
    () => salvarTrilha(state, TRACKS, gestor, { acao: 'criar', titulo: 'Trilha sem motivo' }),
    () => salvarTrilha(state, TRACKS, gestor, { acao: 'arquivar', trilhaId: 'fundamentos', motivo: 'curt' }),
    () => salvarAula(state, TRACKS, gestor, { acao: 'criar', trilhaId: 'fundamentos', titulo: 'Aula sem motivo' }),
    () => salvarAula(state, TRACKS, gestor, { acao: 'arquivar', trilhaId: 'fundamentos', aulaId: 'fund-base' }),
  ]) {
    assert.equal(chamada().error, 'motivo_obrigatorio');
  }
});

test('valida título, minutos e ids inexistentes', () => {
  const state = estado();
  assert.equal(salvarTrilha(state, TRACKS, gestor, { acao: 'criar', titulo: 'ab', motivo }).error, 'titulo_curto');
  assert.equal(salvarAula(state, TRACKS, gestor, { acao: 'criar', trilhaId: 'fundamentos', titulo: 'Aula com tempo zerado', minutos: 0, motivo }).error, 'minutos_invalidos');
  assert.equal(salvarAula(state, TRACKS, gestor, { acao: 'criar', trilhaId: 'inexistente', titulo: 'Aula em trilha inexistente', motivo }).error, 'trilha_nao_encontrada');
  assert.equal(salvarAula(state, TRACKS, gestor, { acao: 'arquivar', trilhaId: 'fundamentos', aulaId: 'nao-existe', motivo }).error, 'aula_nao_encontrada');
  assert.equal(salvarTrilha(state, TRACKS, gestor, { acao: 'arquivar', trilhaId: 'nao-existe', motivo }).error, 'trilha_nao_encontrada');
});

test('registra cada alteração no histórico com autor e motivo', () => {
  const state = estado();
  salvarTrilha(state, TRACKS, gestor, { acao: 'editar', trilhaId: 'fundamentos', titulo: 'Fundamentos II', motivo });
  salvarAula(state, TRACKS, gestor, { acao: 'arquivar', trilhaId: 'fundamentos', aulaId: 'fund-base', motivo });
  const arvore = conteudoTree(state, TRACKS);
  assert.equal(arvore.log.length, 2);
  assert.equal(arvore.log[0].acao, 'aula-arquivada');
  assert.equal(arvore.log[0].porNome, 'Marcelo');
  assert.equal(arvore.log[0].motivo, motivo);
  assert.equal(arvore.log[1].acao, 'trilha-editada');
});

test('ids são derivados do título e desempatados sem colidir com o conteúdo existente', () => {
  const ocupados = new Set(['aula-de-teste']);
  assert.equal(idLivre('Aula de teste', ocupados), 'aula-de-teste-2');
  assert.equal(idLivre('  Atenção: acesso & ponto  ', ocupados), 'atencao-acesso-ponto');
});

// ---------- conta de administrador (Marcelo) ----------

test('conta de gestão é criada uma vez, com setor de gestão e senha só em hash', () => {
  const state = estado();
  const senha = 'senha-de-teste-123';
  const primeira = ensureAdminAccount(state, { password: senha });
  assert.equal(primeira.created, true);
  assert.equal(primeira.user.email, ADMIN_EMAIL);
  assert.equal(primeira.user.sector, 'marcelo');
  assert.equal(primeira.user.kind, 'gestao');
  assert.equal(JSON.stringify(state).includes(senha), false, 'a senha não pode aparecer no estado');
  assert.equal(verifyPassword(senha, primeira.user), true);
  assert.equal(verifyPassword('outra-senha', primeira.user), false);

  const segunda = ensureAdminAccount(state, { password: 'outra-senha' });
  assert.equal(segunda.created, false);
  assert.equal(verifyPassword(senha, segunda.user), true, 'não sobrescreve a senha existente');
  assert.equal(state.users.filter(u => u.email === ADMIN_EMAIL).length, 1);
});

test('a conta de gestão tem acesso total e pode gerir o conteúdo', () => {
  assert.equal(canManageContent('marcelo'), true);
  assert.equal(canManageContent('admin'), true);
  assert.equal(canManageContent('rh'), false, 'RH continua gestor de acessos, mas não de conteúdo');
  assert.equal(isManager('rh'), true);
  assert.equal(canManageContent('funcionario'), false);
});

test('a senha da conta de gestão vem do ambiente e é obrigatória em produção', () => {
  assert.deepEqual(adminPassword({ ACADEMIA_ADMIN_PASSWORD: 'definida-pelo-ambiente' }), { password: 'definida-pelo-ambiente', gerada: false });
  const sorteada = adminPassword({}, { generate: () => 'sorteada' });
  assert.deepEqual(sorteada, { password: 'sorteada', gerada: true });
  assert.throws(() => adminPassword({ NODE_ENV: 'production' }), /ACADEMIA_ADMIN_PASSWORD/);
  assert.equal(adminEmail({ ACADEMIA_ADMIN_EMAIL: 'Outro@Exemplo.com' }), 'outro@exemplo.com');
});

test('redefinir a senha troca apenas a credencial da conta de gestão', () => {
  const state = estado();
  ensureAdminAccount(state, { password: 'primeira-senha' });
  const r = setAdminPassword(state, 'segunda-senha');
  assert.equal(r.ok, true);
  const conta = state.users.find(u => u.email === ADMIN_EMAIL);
  assert.equal(verifyPassword('segunda-senha', conta), true);
  assert.equal(verifyPassword('primeira-senha', conta), false);
  assert.equal(setAdminPassword(state, 'x', { email: 'nao.existe@exemplo.com' }).ok, false);
});

// ---------- integração com o servidor ----------

test('o servidor entrega a árvore para a gestão e bloqueia os demais setores', async () => {
  const { createApp } = await import('../src/app.mjs');
  const { createSessions } = await import('../src/auth.mjs');
  const state = buildSeedState();
  const store = { state, save() {} };
  const senha = 'senha-do-gestor';
  const conta = state.users.find(u => u.sector === 'marcelo');
  Object.assign(conta, hashPassword(senha));
  const sessions = createSessions();
  const app = createApp({ store, sessions });

  const chamar = async (method, url, body, token) => {
    const req = {
      method,
      url,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      on(event, cb) {
        if (event === 'data' && body) cb(Buffer.from(JSON.stringify(body)));
        if (event === 'end') cb();
        if (event === 'error') return undefined;
        return undefined;
      },
    };
    const res = {
      statusCode: 0,
      payload: null,
      headers: {},
      writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers || {}); },
      setHeader() {},
      on() {},
      end(payload) { this.payload = payload ? JSON.parse(payload) : null; },
    };
    await app(req, res);
    return res;
  };

  const tokenGestor = sessions.create(conta.id);
  const arvore = await chamar('GET', '/api/conteudo', null, tokenGestor);
  assert.equal(arvore.statusCode, 200);
  assert.equal(arvore.payload.trilhas.length, TRACKS.length);

  const criada = await chamar('POST', '/api/conteudo/trilha', { acao: 'criar', titulo: 'Trilha do gestor', setores: ['marcelo'], motivo }, tokenGestor);
  assert.equal(criada.statusCode, 200);

  const home = await chamar('GET', '/api/home', null, tokenGestor);
  assert.equal(home.payload.tracks.length, TRACKS.length + 1, 'a trilha nova aparece na página inicial');

  // Setor sem permissão de conteúdo (RH é gestor de acessos, não de conteúdo).
  const rh = state.users.find(u => u.sector === 'rh');
  const tokenRh = sessions.create(rh.id);
  assert.equal((await chamar('GET', '/api/conteudo', null, tokenRh)).statusCode, 403);
  assert.equal((await chamar('POST', '/api/conteudo/trilha', { acao: 'criar', titulo: 'Tentativa', motivo }, tokenRh)).statusCode, 403);
  assert.equal((await chamar('GET', '/api/conteudo', null, null)).statusCode, 401);

  // O conteúdo base continua intacto e visível para quem não foi afetado.
  const outro = state.users.find(u => u.sector === 'funcionario');
  const tokenOutro = sessions.create(outro.id);
  const homeOutro = await chamar('GET', '/api/home', null, tokenOutro);
  const esperadas = TRACKS.filter(t => t.audiences.includes('todos') || t.audiences.includes('funcionario')).length;
  assert.equal(homeOutro.payload.tracks.length, esperadas, 'setor sem mudanças mantém exatamente as suas trilhas');
  assert.equal(homeOutro.payload.tracks.some(t => t.id === criada.payload.trilhaId), false, 'a trilha da gestão não vaza para o setor');
});

test('a camada de conteúdo é gravada no estado e sobrevive à releitura', () => {
  const state = estado();
  salvarTrilha(state, TRACKS, gestor, { acao: 'criar', titulo: 'Persistida', setores: ['todos'], motivo });
  const copia = JSON.parse(JSON.stringify(state));
  ensureConteudo(copia);
  const arvore = conteudoTree(copia, TRACKS);
  assert.ok(arvore.trilhas.some(t => t.title === 'Persistida'));
});

test('a demonstração estática usa as mesmas regras de conteúdo', async () => {
  const fs = await import('node:fs');
  const shim = fs.readFileSync(path.join(aqui, '../src/demo-shim.mjs'), 'utf8');
  for (const trecho of ['resolveContent', 'conteudoTree', 'salvarTrilha', 'salvarAula', 'canManageContent', "'/conteudo'"]) {
    assert.ok(shim.includes(trecho), `demo-shim deve espelhar o servidor (${trecho})`);
  }
  assert.ok(!/summarize\(state, user, TRACKS\)/.test(shim), 'a demonstração não pode ignorar a camada de conteúdo');
});

test('interface: a área Conteúdo existe no menu só para quem gere, com rota e ações ligadas', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="nav-conteudo"[^>]*hidden[^>]*>Conteúdo<\/a>/, 'link Conteúdo no menu, oculto por padrão');
  assert.match(js, /navConteudo\.hidden = !me\.canManageContent/, 'o link aparece só para quem pode gerir conteúdo');
  assert.match(js, /segments\[0\] === 'conteudo'\) page = me\.canManageContent \? renderConteudo\(\)/, 'rota #/conteudo protegida no front');
  assert.match(js, /api\('\/api\/conteudo'\)/, 'a página carrega a árvore pela API');
  assert.match(js, /'\/api\/conteudo\/trilha'/, 'salvar trilha pela API');
  assert.match(js, /'\/api\/conteudo\/aula'/, 'salvar aula/vídeo pela API');
  assert.match(js, /'\/api\/conteudo\/publico'/, 'trocar setores pela API');
  const estaticos = [...new Set([...js.matchAll(/data-content="([a-z-]+)"/g)].map((m) => m[1]))];
  assert.deepEqual(estaticos.filter((k) => !new RegExp(`kind === '${k}'`).test(js)), [], 'toda ação da árvore tem um tratador de clique');
  assert.match(js, /trilha-criada[\s\S]*aula-movida/, 'o histórico traduz cada tipo de alteração');
  assert.match(js, /closest\('\[data-content\]'\)[\s\S]{0,80}onContentClick\(contentEl\)/, 'o clique da árvore chega ao tratador antes da alçada de acessos');
  const shim = readFileSync(new URL('../src/demo-shim.mjs', import.meta.url), 'utf8');
  assert.match(shim, /app\.js\?v=(\d+)/, 'a demonstração injeta o app com versão de cache');
  const versaoHtml = html.match(/app\.js\?v=(\d+)/)[1];
  assert.equal(shim.match(/app\.js\?v=(\d+)/)[1], versaoHtml, 'as duas versões de app.js andam juntas');
  assert.match(html, /styles\.css\?v=\d+/, 'o CSS continua versionado para não servir cache antigo');
});

// E15 — tabela canônica de rotas de `server.mjs`.
//
// PROBLEMA QUE ESTE MÓDULO RESOLVE (e que ele NÃO resolve)
// ------------------------------------------------------
// `server.mjs` resolve o caminho de uma requisição em DOIS lugares distintos e
// independentes:
//
//   1. a BORDA (`API_PATH_MATCH`): decide se o caminho é API (vai para
//      `routeApi`) ou página (vai para o Next);
//   2. o DESPACHO (a cadeia de `if` dentro de `routeApi`): decide QUAL handler
//      trata o caminho.
//
// Nada garante que os dois conjuntos coincidam. Um caminho que existe no
// despacho mas não na borda é código inalcançável (o Next responde a rota, não
// o handler); um caminho que passa a borda mas não casa o despacho cai no 404
// interno. O defeito é invisível em revisão de diff: cada linha parece correta
// isoladamente.
//
// Este módulo lê `server.mjs` como TEXTO e produz uma tabela canônica —
// verificável, versionada e comparável. É deliberadamente ADITIVO: não importa
// `server.mjs`, não executa rota, não altera despacho, não tem dependência de
// banco, rede ou Next. Trocar o despacho por busca em tabela é uma fatia
// separada, que exige decisão do dono; aqui só se mede e se congela o retrato.
//
// LIMITES DECLARADOS
// ------------------
// - É análise textual, não AST: o parser cobre as formas que `server.mjs`
//   realmente usa (comparação literal, `startsWith`, `.includes` em array
//   literal, `.match(regex)` e `regex.test(pathname)`). Forma nova não
//   reconhecida aparece como `desconhecida` e FALHA o teste de consistência —
//   nunca é ignorada em silêncio.
// - O MÉTODO HTTP não é decidido pela cadeia de `if` (ela casa só o caminho).
//   Por isso nenhuma linha do catálogo declara `GET`/`POST`: isso seria
//   inferência, e inferência aqui viraria aceite falso.
// - Alcance é calculado por SOBREPOSIÇÃO de padrões, não por requisição real.
//   Um caminho concreto só é provado alcançável por teste de integração; o
//   catálogo prova a existência (ou ausência) da REGRA na borda.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'e15-route-catalog/1';

/** Nomes das funções/constantes que resolvem caminho em `server.mjs`. */
export const FONTES = {
  borda: 'API_PATH_MATCH',
  despacho: 'routeApi',
  legado: 'legacyHrPermission',
};

const IDENTIFICADOR = '[A-Za-z_$][\\w$]*';
const CHAMADA_HANDLER = new RegExp(
  `\\b(${IDENTIFICADOR}(?:\\.${IDENTIFICADOR})*)\\s*\\(`,
  'g',
);

// ---------------------------------------------------------------------------
// Recorte de funções
// ---------------------------------------------------------------------------

/**
 * Extrai o texto de `function <nome>(` / `async function <nome>(` por contagem
 * de chaves, devolvendo também as linhas de início e fim (1-based).
 * Devolve `null` quando a declaração não existe.
 */
export function recortarFuncao(source, declaracao) {
  const inicio = source.indexOf(declaracao);
  if (inicio === -1) return null;
  let profundidade = 0;
  let viuAbertura = false;
  for (let i = inicio; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') {
      profundidade += 1;
      viuAbertura = true;
    } else if (c === '}') {
      profundidade -= 1;
      if (viuAbertura && profundidade === 0) {
        const text = source.slice(inicio, i + 1);
        return {
          text,
          primeiraLinha: contarLinhas(source, inicio),
          ultimaLinha: contarLinhas(source, i),
        };
      }
    }
  }
  return null;
}

/**
 * Extrai uma arrow function terminada por `;` fora de parênteses (a forma de
 * `API_PATH_MATCH`, que é uma cadeia `pathname === … || … ;`).
 */
export function recortarArrow(source, declaracao) {
  const inicio = source.indexOf(declaracao);
  if (inicio === -1) return null;
  const linhas = source.slice(inicio).split('\n');
  // A borda é uma cadeia de UMA expressão: a declaração seguida somente por
  // linhas `…pathname…` (com `||`). A primeira linha que não casa a forma
  // encerra o recorte. Cortar pelo `;` incluiria as rotas internas por engano.
  // Comentários e linhas vazias fazem parte da cadeia (há comentário explicando
  // um alias que faltou e derrubava tudo no Next) e não a encerram.
  const forma = /^\s*(?:\|\||const\s+API_PATH_MATCH\b|pathname\b|\/\/|$)/;
  let consumidas = 1;
  for (let i = 1; i < linhas.length; i += 1) {
    if (!forma.test(linhas[i])) break;
    consumidas += 1;
    if (/;\s*$/.test(linhas[i])) break;
  }
  const text = linhas.slice(0, consumidas).join('\n');
  return {
    text,
    primeiraLinha: contarLinhas(source, inicio),
    ultimaLinha: contarLinhas(source, inicio) + consumidas - 1,
  };
}

function contarLinhas(source, indice) {
  let n = 1;
  for (let i = 0; i < indice; i += 1) if (source[i] === '\n') n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Extração das regras
// ---------------------------------------------------------------------------

/** Converte `/^…/i` (texto) em `{ pattern, flags }`. */
function lerRegex(literal) {
  const fim = literal.lastIndexOf('/');
  if (fim <= 0) return null;
  return { pattern: literal.slice(1, fim), flags: literal.slice(fim + 1) };
}

/** Módulo dono da regra: primeiro identificador da chamada que trata a rota. */
function moduloDoProvider(provider) {
  if (!provider) return 'desconhecido';
  const m = provider.match(new RegExp(`^${IDENTIFICADOR}`));
  return m ? m[0] : 'desconhecido';
}

/**
 * Extrai o provedor (a chamada que trata a rota) da região que começa na
 * condição. Cobre `if (cond) return X(req,res)` e `if (cond) {\n return X…`.
 */
function provedorDaRegiao(linhas, indiceCondicao) {
  const linha = linhas[indiceCondicao] || "";
  const retorno = linha.match(/\breturn\s+([^;]+);?\s*$/);
  if (retorno) return primeiroHandler(retorno[1]);

  // `const x = pathname.match(/…/)` + `if (x) return handler(...)`.
  const binding = linha.match(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:url\.)?pathname\.match\(/);
  if (binding) {
    const teste = new RegExp(`\\bif\\s*\\(\\s*${binding[1]}\\b`);
    for (let i = indiceCondicao + 1; i < Math.min(linhas.length, indiceCondicao + 8); i += 1) {
      if (!teste.test(linhas[i])) continue;
      const handler = handlerDoCorpo(linhas, i);
      if (handler) return handler;
    }
  }

  // Condição quebrada em várias linhas (a continuação começa com "||") e
  // bloco `{ … return handler … }`: o corpo só começa quando a condição fecha.
  // `{ … return handler … }`: o corpo só começa depois que a condição fecha.
  return handlerDoCorpo(linhas, indiceCondicao);
}

/**
 * Acha o handler do corpo. `i` pode ser (a) a própria linha do `if` já com
 * `return` na mesma linha, (b) uma condição quebrada em `||` cujo `) {` fecha
 * adiante, ou (c) um bloco de várias linhas. Devolve o primeiro `return X(…)`.
 */
function handlerDoCorpo(linhas, i) {
  let fimCondicao = i;
  while (fimCondicao < Math.min(linhas.length, i + 6)) {
    const l = linhas[fimCondicao];
    const temReturn = /\breturn\b/.test(l);
    const fechaCorpo = /\)\s*\{\s*$/.test(l) || /\{\s*$/.test(l);
    if (fimCondicao > i && !/^\s*\|\|/.test(l) && temReturn) break;
    if (temReturn || fechaCorpo) break;
    fimCondicao += 1;
  }
  for (let j = i; j <= Math.min(linhas.length - 1, fimCondicao); j += 1) {
    if (j > i && /^\s*\|\|/.test(linhas[j])) continue;
    const r = linhas[j].match(/\breturn\s+([^;]+);?\s*$/);
    if (r) {
      const handler = primeiroHandler(r[1]);
      if (handler) return handler;
    }
  }
  // Bloco: procurar o primeiro `return X(…)` antes de fechar as chaves.
  if (fimCondicao < linhas.length && /\{\s*$/.test(linhas[fimCondicao])) {
    let profundidade = 0;
    for (let j = fimCondicao; j < Math.min(linhas.length, fimCondicao + 25); j += 1) {
      for (const c of linhas[j]) {
        if (c === '{') profundidade += 1;
        else if (c === '}') profundidade -= 1;
      }
      if (j === fimCondicao) continue;
      const r = linhas[j].match(/\breturn\s+([^;]+);?\s*$/);
      if (r) {
        const handler = primeiroHandler(r[1]);
        if (handler) return handler;
      }
      if (profundidade <= 0) break;
    }
  }
  return null;
}

function primeiroHandler(trecho) {
  CHAMADA_HANDLER.lastIndex = 0;
  let m;
  while ((m = CHAMADA_HANDLER.exec(trecho)) !== null) {
    const nome = m[1];
    if (METODOS_NAO_HANDLER.has(nome)) continue;
    if (nome.startsWith("url.")) continue;
    return nome;
  }
  return null;
}

const METODOS_NAO_HANDLER = new Set([
  "if", "for", "while", "switch", "catch", "return", "json", "await", "new",
  "includes", "indexOf", "some", "every", "map", "filter", "find", "join",
  "test", "match", "startsWith", "endsWith", "push", "slice", "split",
]);


/**
 * Extrai todas as regras de caminho de um trecho de código.
 *
 * `modo`:
 *   - `edge`   → borda (`API_PATH_MATCH`), decide se é API;
 *   - `guarded`→ despacho dentro de `if (...)`, com prova de handler;
 *   - `legacy` → resolução legada (permissão de RH), fora do despacho.
 */
export function extrairRegras(source, opcoes = {}) {
  const {
    fonte = 'desconhecido',
    modo = 'guarded',
    limiteLinhas = null,
    comProvedor = modo === 'guarded',
  } = opcoes;
  const linhas = source.split('\n');
  const regras = [];
  const avisos = [];
  const vistos = new Set();

  const push = (regra) => {
    const chave = `${regra.tipo}|${regra.caminho ?? regra.pattern}|${regra.linha}|${regra.provedor ?? ''}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    regras.push(regra);
  };

  // Base absoluta: `limiteLinhas` é o número de linhas já consumidas antes
  // deste trecho (aceita-se também a forma `[inicio, fim]`, por robustez).
  const base = Array.isArray(limiteLinhas) ? (limiteLinhas[0] - 1) : (limiteLinhas ?? 0);
  for (let i = 0; i < linhas.length; i += 1) {
    const numeroLinha = base + i + 1;
    const linha = linhas[i];
    if (/^\s*\/\//.test(linha)) continue;
    // Comparações literais: `pathname === "/api/x"`.
    for (const m of linha.matchAll(/\bpathname\s*===\s*"([^"]*)"/g)) {
      push({
        tipo: 'exato',
        caminho: m[1],
        fonte,
        modo,
        linha: numeroLinha,
        provedor: comProvedor ? provedorDaRegiao(linhas, i) : null,
      });
    }
    // `["/a","/b"].includes(pathname)`
    for (const m of linha.matchAll(/\[([^\]]{1,4000}?)\]\.includes\(\s*(?:url\.)?pathname\s*\)/g)) {
      for (const q of m[1].matchAll(/"([^"]*)"/g)) {
        push({
          tipo: 'exato',
          caminho: q[1],
          fonte,
          modo,
          linha: numeroLinha,
          provedor: comProvedor ? provedorDaRegiao(linhas, i) : null,
        });
      }
    }
    // Prefixos: `pathname.startsWith("/api/x/")`
    for (const m of linha.matchAll(/\bpathname\.startsWith\(\s*"([^"]*)"\s*\)/g)) {
      push({
        tipo: 'prefixo',
        caminho: m[1],
        fonte,
        modo,
        linha: numeroLinha,
        provedor: comProvedor ? provedorDaRegiao(linhas, i) : null,
      });
    }
    // Regex aplicada ao caminho: `pathname.match(/…/)` ou `/….test(pathname)`
    for (const m of linha.matchAll(/\bpathname\.match\(\s*(\/\^[^\n]{0,500}?\/[a-z]*)\s*\)/g)) {
      const regex = lerRegex(m[1]);
      if (!regex) {
        avisos.push({ linha: numeroLinha, texto: m[1], motivo: 'regex ilegível' });
        continue;
      }
      push({
        tipo: 'regex',
        pattern: regex.pattern,
        flags: regex.flags,
        fonte,
        modo,
        linha: numeroLinha,
        provedor: comProvedor ? provedorDaRegiao(linhas, i) : null,
      });
    }
    for (const m of linha.matchAll(/(\/\^[^\n]{0,500}?\/[a-z]*)\.test\(\s*(?:url\.)?pathname\s*\)/g)) {
      const regex = lerRegex(m[1]);
      if (!regex) {
        avisos.push({ linha: numeroLinha, texto: m[1], motivo: 'regex ilegível' });
        continue;
      }
      push({
        tipo: 'regex',
        pattern: regex.pattern,
        flags: regex.flags,
        fonte,
        modo,
        linha: numeroLinha,
        provedor: comProvedor ? provedorDaRegiao(linhas, i) : null,
      });
    }
    // Uso de caminho que NÃO foi reconhecido por nenhuma forma acima.
    if (/\bpathname\b/.test(linha)
      && !/pathname\s*===/.test(linha)
      && !/pathname\.startsWith\(/.test(linha)
      && !/pathname\.match\(/.test(linha)
      && !/\.includes\(\s*(?:url\.)?pathname\s*\)/.test(linha)
      && !/\.test\(\s*(?:url\.)?pathname\s*\)/.test(linha)
      && !/^\s*(const|function|async function|\/\/|\*)/.test(linha)
      && !/\bpathname\s*(?:=|\)|,|;)/.test(linha.replace(/new URL\([^)]*\)/, ''))
      && !/pathname\s*\?/.test(linha)
      && !pathnameEhParametro(linha)) {
      avisos.push({ linha: numeroLinha, texto: linha.trim().slice(0, 160), motivo: 'forma de comparação desconhecida' });
    }
    // `pathname` recebido como parâmetro (a borda e os helpers) é declaração,
    // não comparação: não entra no aviso.
    if (/\bpathname\b/.test(linha) && /=>|\bfunction\b/.test(linha) && /pathname\s*(?:,|\)|=>)/.test(linha)) {
      const idx = avisos.findIndex((a) => a.linha === numeroLinha);
      if (idx !== -1) avisos.splice(idx, 1);
    }
  }
  return { regras, avisos };
}

function pathnameEhParametro(linha) {
  return /(?:const|function|=>).{0,40}\bpathname\b/.test(linha) || /\([^)]*\bpathname\b[^)]*\)\s*=>/.test(linha);
}

// ---------------------------------------------------------------------------
// Casamento regra ↔ caminho
// ---------------------------------------------------------------------------

export function regexDaRegra(regra) {
  return new RegExp(regra.pattern, regra.flags || '');
}

/** A regra aceita este caminho concreto? */
export function regraCasa(regra, caminho) {
  if (regra.tipo === 'exato') return regra.caminho === caminho;
  if (regra.tipo === 'prefixo') return caminho.startsWith(regra.caminho);
  if (regra.tipo === 'regex') {
    try {
      return regexDaRegra(regra).test(caminho);
    } catch {
      return false;
    }
  }
  return false;
}

/** A regra `externa` cobre TODOS os caminhos que `interna` aceita? */
export function regraCobre(externa, interna) {
  if (externa.tipo === 'exato') {
    return interna.tipo === 'exato' && externa.caminho === interna.caminho;
  }
  if (externa.tipo === 'prefixo') {
    if (interna.tipo === 'exato') return interna.caminho.startsWith(externa.caminho);
    if (interna.tipo === 'prefixo') return interna.caminho.startsWith(externa.caminho);
    // Uma regex pode aceitar caminhos fora do prefixo; não se afirma cobertura.
    return false;
  }
  if (externa.tipo === 'regex') {
    if (interna.tipo === 'exato') return regraCasa(externa, interna.caminho);
    return false;
  }
  return false;
}

/**
 * Prefixo LITERAL fixo de uma regex ancorada (`^\/api\/x\/([0-9a-f-]+)$` →
 * `/api/x/`). Toda string que casa a regex começa por esse prefixo: é o que
 * permite decidir alcance pela borda sem executar o roteador.
 */
export function prefixoLiteral(regra) {
  if (regra.tipo === 'exato') return regra.caminho;
  if (regra.tipo === 'prefixo') return regra.caminho;
  const pattern = regra.pattern || '';
  if (!pattern.startsWith('^')) return '';
  let saida = '';
  for (let i = 1; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '\\') {
      const prox = pattern[i + 1];
      if (prox === undefined) break;
      // `\/` e `\.` são literais; `\d`, `\w`, `\s` abrem classe.
      if ('/.-_'.includes(prox)) { saida += prox; i += 1; continue; }
      break;
    }
    if ('()[]{}.*+?|$'.includes(c)) break;
    saida += c;
  }
  return saida;
}

/**
 * A regra do despacho é alcançável pela borda? A pergunta é de SOBREPOSIÇÃO
 * (existe ao menos um caminho que passa a borda e chega ao handler), não de
 * cobertura total — por isso não se usa `regraCobre` aqui.
 */
export function regraAlcancavel(regra, bordaRegras) {
  const prefixo = prefixoLiteral(regra);
  return bordaRegras.some((b) => {
    if (b.tipo === 'exato') {
      if (regra.tipo === 'exato') return b.caminho === regra.caminho;
      if (regra.tipo === 'prefixo') return b.caminho.startsWith(regra.caminho);
      return b.caminho.startsWith(prefixo);
    }
    if (b.tipo === 'prefixo') {
      if (!prefixo) return true; // regex sem prefixo fixo: não se afirma o contrário
      return prefixo.startsWith(b.caminho) || b.caminho.startsWith(prefixo);
    }
    return false; // a borda não usa regex hoje; se usar, exige revisão do parser
  });
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/**
 * Lê o texto de `server.mjs` e devolve o catálogo canônico completo.
 * Lança erro explícito quando a estrutura esperada desaparece — silêncio aqui
 * viraria "zero rotas" e um gate verde sobre o vazio.
 */
export function construirCatalogo(source) {
  const despacho = recortarFuncao(source, `async function ${FONTES.despacho}(req, res) {`);
  if (!despacho) throw new Error(`E15: função de despacho não encontrada: ${FONTES.despacho}`);
  const borda = recortarArrow(source, `const ${FONTES.borda} = pathname =>`);
  if (!borda) throw new Error(`E15: borda de API não encontrada: ${FONTES.borda}`);
  const legado = recortarFuncao(source, `async function authorizeLegacyHrRequest(`);

  const despachoRegras = extrairRegras(despacho.text, {
    fonte: FONTES.despacho,
    modo: 'guarded',
    limiteLinhas: despacho.primeiraLinha - 1,
  });
  const bordaRegras = extrairRegras(borda.text, {
    fonte: FONTES.borda,
    modo: 'edge',
    limiteLinhas: borda.primeiraLinha - 1,
  });
  const legadoRegras = legado
    ? extrairRegras(legado.text, {
      fonte: 'authorizeLegacyHrRequest',
      modo: 'legacy',
      limiteLinhas: legado.primeiraLinha - 1,
    })
    : { regras: [], avisos: [] };

  // `API_PATH_MATCH` recebe o parâmetro `pathname`; as regras de borda não têm
  // provedor por definição (a borda não escolhe handler).
  // Alcançável = existe regra de BORDA que cobre integralmente a regra de
  // despacho. Comparar por caminho concreto daria falso negativo em regex.
  // Classificação: só `handler` despacha. `pre-auth` é guarda de autorização
  // (bloco de `startsWith` que chama `authorizeLegacyHrRequest`); `indefinida`
  // é forma não reconhecida e entra nas divergências para não passar despercebida.
  const despachoLinhas = despachoRegras.regras.map((r) => {
    const classe = r.provedor ? 'handler' : 'pre-auth';
    return {
      ...r,
      classe,
      modulo: r.provedor ? moduloDoProvider(r.provedor) : (classe === 'pre-auth' ? 'pre-autorizacao' : 'desconhecido'),
      alcancavel: regraAlcancavel(r, bordaRegras.regras),
    };
  });
  const handlers = despachoLinhas.filter((r) => r.classe === 'handler');
  const preAuth = despachoLinhas.filter((r) => r.classe === 'pre-auth');

  const regrasDespacho = despachoLinhas;
  const inalcancaveis = handlers.filter((r) => !r.alcancavel);

  // Regra de despacho inteiramente coberta por uma regra ANTERIOR de outro
  // módulo: código morto. Mesmo módulo e mesma cobertura = redundância inócua.
  const sombreadas = [];
  const redundantes = [];
  for (let i = 0; i < handlers.length; i += 1) {
    const atual = handlers[i];
    for (let j = 0; j < i; j += 1) {
      const anterior = handlers[j];
      if (anterior.linha === atual.linha) continue;
      if (!regraCobre(anterior, atual)) continue;
      const registro = {
        linha: atual.linha,
        caminho: caminhoDaRegra(atual),
        tipo: atual.tipo,
        modulo: atual.modulo,
        cobertaPorLinha: anterior.linha,
        cobertaPorModulo: anterior.modulo,
      };
      registro.nota = notaAcima(despacho.text, atual.linha - despacho.primeiraLinha + 1);
      registro.notaCobertura = notaAcima(despacho.text, anterior.linha - despacho.primeiraLinha + 1);
      // `intencional` só quando a própria nota do código declara a
      // inalcancabilidade/historicidade. É a única classificação que dispensa
      // revisão humana; todo o resto fica explícito como pendência.
      registro.intencional = /n(?:ot|ã)o?\s+(?:reache?a?ble|alcan)|inalcan[cç]|legacy|hist[oó]ric/i
        .test(`${registro.nota || ''} ${registro.notaCobertura || ''}`);
      if (anterior.modulo === atual.modulo) redundantes.push(registro);
      else sombreadas.push(registro);
      break;
    }
  }

  // Borda que declara caminho exato sem nenhuma regra de despacho: o caminho
  // passa a borda e termina em 404 interno.
  const bordaSemDespacho = bordaRegras.regras
    .filter((r) => r.tipo === 'exato')
    .filter((r) => !handlers.some((d) => regraCasa(d, r.caminho)));

  const avisos = [
    ...despachoRegras.avisos.map((a) => ({ ...a, fonte: FONTES.despacho })),
    ...bordaRegras.avisos.map((a) => ({ ...a, fonte: FONTES.borda })),
    ...legadoRegras.avisos.map((a) => ({ ...a, fonte: 'authorizeLegacyHrRequest' })),
  ];

  return {
    schema: SCHEMA,
    fonte: 'server.mjs',
    sha256: hashSha256(source),
    // Igual a `wc -l`: conta quebras de linha, não o último elemento vazio.
    linhasServer: source.split('\n').length - (source.endsWith('\n') ? 1 : 0),
    borda: {
      funcao: FONTES.borda,
      linhas: [borda.primeiraLinha, borda.ultimaLinha],
      regras: bordaRegras.regras,
    },
    despacho: {
      funcao: FONTES.despacho,
      linhas: [despacho.primeiraLinha, despacho.ultimaLinha],
      regras: regrasDespacho,
    },
    legado: {
      funcao: 'authorizeLegacyHrRequest',
      linhas: legado ? [legado.primeiraLinha, legado.ultimaLinha] : null,
      regras: legadoRegras.regras,
    },
    divergencias: {
      inalcancaveis,
      sombreadas,
      redundantes,
      bordaSemDespacho,
    },
    avisos,
    resumo: resumir({
      bordaRegras: bordaRegras.regras,
      despachoRegras: despachoLinhas,
      handlers,
      preAuth,
      legadoRegras: legadoRegras.regras,
      inalcancaveis,
      sombreadas,
      redundantes,
      bordaSemDespacho,
      avisos,
    }),
  };
}

/** Comentário `//` imediatamente acima de uma linha do despacho (contexto). */
function notaAcima(trecho, linhaRelativa) {
  const linhas = trecho.split('\n');
  const notas = [];
  for (let i = linhaRelativa - 2; i >= 0 && notas.length < 3; i -= 1) {
    const l = (linhas[i] || '').trim();
    if (!l.startsWith('//')) break;
    notas.unshift(l.replace(/^\/\/\s?/, ''));
  }
  return notas.length ? notas.join(' ').slice(0, 300) : null;
}

function caminhoDaRegra(regra) {
  return regra.tipo === 'regex' ? `/${regra.pattern}/${regra.flags || ''}` : regra.caminho;
}

function resumir(dados) {
  const { bordaRegras, despachoRegras, handlers, preAuth, legadoRegras, inalcancaveis, sombreadas, redundantes, bordaSemDespacho, avisos } = dados;
  const porModulo = new Map();
  for (const r of handlers) porModulo.set(r.modulo, (porModulo.get(r.modulo) || 0) + 1);
  const contagem = (regras, tipo) => regras.filter((r) => r.tipo === tipo).length;
  return {
    borda: {
      regras: bordaRegras.length,
      exatos: contagem(bordaRegras, 'exato'),
      prefixos: contagem(bordaRegras, 'prefixo'),
      regexes: contagem(bordaRegras, 'regex'),
    },
    despacho: {
      regras: despachoRegras.length,
      handlers: handlers.length,
      preAutorizacao: preAuth.length,
      exatos: contagem(despachoRegras, 'exato'),
      prefixos: contagem(despachoRegras, 'prefixo'),
      regexes: contagem(despachoRegras, 'regex'),
      modulos: porModulo.size,
    },
    legado: { regras: legadoRegras.length },
    inalcancaveis: inalcancaveis.length,
    sombreadas: sombreadas.length,
    redundantes: redundantes.length,
    bordaSemDespacho: bordaSemDespacho.length,
    avisos: avisos.length,
    modulosMaisUsados: [...porModulo.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([modulo, regras]) => ({ modulo, regras })),
  };
}

export function hashSha256(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Serialização estável (o que o `--check` compara)
// ---------------------------------------------------------------------------

/** Colunas das linhas de regra no JSON versionado (matriz, não objeto: é menor e estável). */
export const COLUNAS_REGRA = ['tipo', 'caminho', 'modulo', 'linha', 'provedor'];

function linhaSerializada(regra) {
  return [
    regra.tipo,
    caminhoDaRegra(regra),
    regra.modulo ?? (regra.modo === 'edge' ? 'borda' : regra.modo === 'legacy' ? 'legado' : 'desconhecido'),
    regra.linha,
    regra.provedor ?? null,
  ];
}

/**
 * Objeto versionado: sem SHA e sem contagem de linhas do próprio `server.mjs`
 * como identidade (o SHA muda com qualquer edição e faria o `--check` falhar
 * por motivo alheio ao catálogo). O SHA fica na saída do relatório, não no lock.
 */
export function serializarCatalogo(catalogo) {
  const ordenar = (regras) => regras
    .map(linhaSerializada)
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]))
      || String(a[0]).localeCompare(String(b[0]))
      || a[3] - b[3]
      || String(a[2]).localeCompare(String(b[2])));

  const divergencias = (lista) => lista
    .map((d) => [d.linha, d.caminho ?? d.pattern, d.modulo ?? null, d.cobertaPorLinha ?? null, d.cobertaPorModulo ?? null, d.nota ?? null, d.intencional ?? null])
    .sort((a, b) => a[0] - b[0]);

  return {
    schema: catalogo.schema,
    colunas_regra: COLUNAS_REGRA,
    borda: {
      funcao: catalogo.borda.funcao,
      regras: ordenar(catalogo.borda.regras),
    },
    despacho: {
      funcao: catalogo.despacho.funcao,
      regras: ordenar(catalogo.despacho.regras),
    },
    legado: {
      funcao: catalogo.legado.funcao,
      regras: ordenar(catalogo.legado.regras),
    },
    divergencias: {
      inalcancaveis: divergencias(catalogo.divergencias.inalcancaveis),
      sombreadas: divergencias(catalogo.divergencias.sombreadas),
      borda_sem_despacho: catalogo.divergencias.bordaSemDespacho
        .map((r) => [r.linha, r.caminho])
        .sort((a, b) => a[0] - b[0]),
    },
    resumo: catalogo.resumo,
  };
}

export function catalogoParaJson(catalogo) {
  return `${JSON.stringify(serializarCatalogo(catalogo), null, 1)}\n`;
}

export function lerServidor(raiz) {
  const arquivo = path.join(raiz, 'server.mjs');
  return readFileSync(arquivo, 'utf8');
}

export const RAIZ_PADRAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

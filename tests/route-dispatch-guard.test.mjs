// PLAT-01 — guarda estática contra o retorno do despacho não aguardado.
//
// Mesmo espírito de tests/staff-session-await-guard.test.mjs: o defeito é
// invisível em revisão (`return handler(req,res)` parece correto) e só aparece
// em produção, como queda do processo. Este teste falha o build se o padrão
// for reintroduzido em server.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lerServidor = () => readFile(path.join(root, "server.mjs"), "utf8");

/** Remove comentários para que o scanner não acuse o antipadrão citado em texto. */
function semComentarios(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Recorta o texto de uma função a partir da sua declaração, por contagem de chaves. */
function recortarFuncao(source, declaracao) {
  const inicio = source.indexOf(declaracao);
  assert.notEqual(inicio, -1, `declaração não encontrada: ${declaracao}`);
  let profundidade = 0;
  let viuAbertura = false;
  for (let i = inicio; i < source.length; i += 1) {
    const c = source[i];
    if (c === "{") { profundidade += 1; viuAbertura = true; }
    else if (c === "}") {
      profundidade -= 1;
      if (viuAbertura && profundidade === 0) return source.slice(inicio, i + 1);
    }
  }
  throw new Error(`função não fechada: ${declaracao}`);
}

test("PLAT-01 server.mjs importa o despacho endurecido", async () => {
  const source = await lerServidor();
  assert.match(source, /import \{[^}]*dispatchGuarded[^}]*\} from "\.\/src\/server\/route-dispatch\.mjs";/,
    "server.mjs precisa importar o guard de despacho");
  for (const nome of ["dispatchGuarded", "guardedRequestHandler", "installProcessSafetyNet", "DISPATCH_OUTCOME"]) {
    assert.ok(source.includes(nome), `import ausente: ${nome}`);
  }
});

test("PLAT-01 routeApi aguarda o despacho antes de qualquer outra instrução", async () => {
  const source = await lerServidor();
  const fn = recortarFuncao(source, "async function routeApi(req, res) {");

  assert.match(fn, /const dispatch = await dispatchGuarded\(\{/,
    "o corpo de rotas precisa ser executado por dispatchGuarded com await");

  // Entre a abertura do try principal e a chamada do guard não pode haver
  // instrução executável: o despacho é a primeira coisa do bloco protegido.
  const posTry = fn.indexOf("\n  try {\n");
  assert.notEqual(posTry, -1, "try principal de routeApi não encontrado");
  const posDispatch = fn.indexOf("const dispatch = await dispatchGuarded({");
  assert.ok(posDispatch > posTry, "o despacho precisa estar dentro do try principal");
  const miolo = fn.slice(posTry + "\n  try {\n".length, posDispatch)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
  assert.deepEqual(miolo, [], `instrução fora do despacho guardado: ${miolo.join(" | ")}`);

  assert.match(fn, /run: async \(\) => \{/, "o corpo de rotas precisa ser passado como run assíncrono");
  assert.match(fn, /label: "routeApi"/);
  assert.match(fn, /onError: /, "a falha precisa continuar sendo registrada no log do servidor");
});

test("PLAT-01 nenhum handler de rota é devolvido sem passar pelo guard", async () => {
  const source = await lerServidor();
  const fn = semComentarios(recortarFuncao(source, "async function routeApi(req, res) {"));
  const inicioRun = fn.indexOf("run: async () => {");
  const fimRun = fn.indexOf('return json(res, 404, { error: "not_found" });');
  assert.ok(inicioRun > 0 && fimRun > inicioRun, "região de despacho não localizada");

  // Todo `return <algo>(req, res)` tem de estar dentro da região aguardada.
  const padrao = /return\s+[A-Za-z_$][\w$.]*\s*\(\s*req\s*,/g;
  const foraDaRegiao = [];
  let m;
  while ((m = padrao.exec(fn)) !== null) {
    if (m.index < inicioRun || m.index > fimRun) {
      foraDaRegiao.push(fn.slice(m.index, m.index + 90).split("\n")[0]);
    }
  }
  assert.deepEqual(foraDaRegiao, [],
    `despacho fora da região aguardada (rejeição escaparia do catch):\n${foraDaRegiao.join("\n")}`);

  const dentro = (fn.slice(inicioRun, fimRun).match(padrao) || []).length;
  assert.ok(dentro > 100, `esperado o conjunto completo de rotas sob o guard, encontrado ${dentro}`);
});

test("PLAT-01 routeApi ainda registra observabilidade com erro e duração reais", async () => {
  const source = await lerServidor();
  const fn = recortarFuncao(source, "async function routeApi(req, res) {");
  assert.match(fn, /if \(dispatch\.error\) \{/, "o erro do despacho precisa alimentar o ledger");
  assert.match(fn, /routeError = dispatch\.error;/);
  assert.match(fn, /DISPATCH_OUTCOME\.FAILED_CLOSED\) statusForObs = 500;/,
    "falha fechada precisa ser registrada como 500, não como 200");
  assert.match(fn, /\} finally \{[\s\S]*obs\.recordHttp\(\{/, "o finally de observabilidade foi preservado");
  assert.match(fn, /duration_ms: duration/);
  assert.match(fn, /error: routeError,/);
});

test("PLAT-01 o callback do servidor HTTP está protegido e não é async solto", async () => {
  const source = await lerServidor();
  assert.match(source, /createServer\(guardedRequestHandler\(async \(req, res\) => \{/,
    "o callback de createServer precisa ser embrulhado por guardedRequestHandler");
  assert.doesNotMatch(source, /createServer\(async \(req, res\) => \{/,
    "callback async sem guard: uma rejeição do Next ou do redirect mata o processo");
  assert.match(source, /label: "httpServer"/);
});

test("PLAT-01 a rede de segurança de processo é instalada antes de servir", async () => {
  const source = await lerServidor();
  const posSafety = source.indexOf("installProcessSafetyNet();");
  const posCreate = source.indexOf("const server = createServer(");
  assert.ok(posSafety > 0, "installProcessSafetyNet() precisa ser chamado em server.mjs");
  assert.ok(posSafety < posCreate, "a rede de segurança precisa ser instalada antes do servidor subir");
});

test("PLAT-01 o módulo de despacho não depende de banco, rede ou Next", async () => {
  const source = await readFile(path.join(root, "src/server/route-dispatch.mjs"), "utf8");
  const imports = [...source.matchAll(/^import .*$/gm)].map((m) => m[0]);
  assert.deepEqual(imports, [], "o guard precisa ser autocontido e determinístico");
  for (const proibido of ["pg", "next", "fetch(", "require("]) {
    assert.equal(source.includes(proibido), false, `dependência indevida no guard: ${proibido}`);
  }
  assert.match(source, /export async function dispatchGuarded/);
  assert.match(source, /export function guardedRequestHandler/);
  assert.match(source, /export function installProcessSafetyNet/);
});

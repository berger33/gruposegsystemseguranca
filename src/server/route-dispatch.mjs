// PLAT-01 — Despacho HTTP à prova de rejeição assíncrona.
//
// Achado de plataforma documentado na entrega do EXT-07: o despacho de
// `routeApi` (server.mjs) executava `try { return handler(req, res) } catch`.
// `return <promise>` dentro de `try` NÃO é aguardado, portanto:
//
//   1. a rejeição do handler escapa do `catch` — nenhum 500 fail-closed é
//      emitido e a requisição fica sem resposta até o timeout do cliente;
//   2. a rejeição sobe até o callback `async` de `createServer`, que ninguém
//      aguarda — vira `unhandledRejection`. Como o processo não registra
//      listener, o default do Node (>=15) derruba o servidor inteiro: uma
//      única requisição com falha assíncrona causa indisponibilidade total;
//   3. o bloco `finally` de observabilidade roda ANTES do handler terminar,
//      registrando status 200, `duration_ms` ~0 e `error: null` para
//      requisições que de fato falharam — o erro some do ledger.
//
// Este módulo centraliza o despacho endurecido. Regras:
//
//   - o trabalho é sempre AGUARDADO, então falha síncrona e rejeição
//     assíncrona são tratadas pelo mesmo caminho;
//   - fail-closed: se nada foi escrito ainda, responde 500 com corpo mínimo
//     (`error: internal_error` + `request_id`), sem vazar mensagem, stack,
//     SQL ou nome de tabela;
//   - se a resposta já começou (headers enviados), não há como corrigir o
//     status: a conexão é encerrada imediatamente para o cliente não pendurar,
//     e o desfecho é marcado como `failed_after_headers`;
//   - nunca relança: o chamador recebe um desfecho estruturado;
//   - o erro original é entregue ao chamador para registro em observabilidade.
//
// Nada aqui depende de banco, rede ou estado global: é determinístico e
// testável com objetos sintéticos e com servidor HTTP real.

/** Desfechos possíveis de um despacho guardado. */
export const DISPATCH_OUTCOME = Object.freeze({
  OK: "ok",
  FAILED_CLOSED: "failed_closed",
  FAILED_AFTER_HEADERS: "failed_after_headers",
  FAILED_UNREPORTED: "failed_unreported",
});

/** Corpo devolvido em falha. Mínimo por contrato: nunca descreve o erro. */
export function buildFailureBody(requestId) {
  const body = { error: "internal_error" };
  if (requestId) body.request_id = String(requestId).slice(0, 100);
  return body;
}

/**
 * Descrição curta e segura do erro, só para log do servidor.
 * Aceita rejeição com qualquer valor (string, undefined, objeto solto).
 */
export function describeError(error) {
  if (error instanceof Error) return error.message || error.name || "Error";
  if (error === undefined) return "rejeição sem valor (undefined)";
  if (error === null) return "rejeição sem valor (null)";
  if (typeof error === "string") return error.slice(0, 300);
  try {
    return JSON.stringify(error).slice(0, 300);
  } catch {
    return Object.prototype.toString.call(error);
  }
}

function canStillRespond(res) {
  if (!res) return false;
  if (res.headersSent) return false;
  if (res.writableEnded || res.finished) return false;
  if (res.destroyed) return false;
  if (res.writable === false) return false;
  return typeof res.writeHead === "function" && typeof res.end === "function";
}

/**
 * Encerra uma resposta PARCIAL sem deixar o cliente pendurado.
 *
 * Cuidado deliberado: quando o handler já concluiu a resposta (`end` chamado)
 * e só então falhou, destruir o socket truncaria bytes ainda em buffer e
 * transformaria uma resposta íntegra em resposta corrompida. Nesse caso nada
 * é feito no socket — apenas o erro é registrado. A destruição só acontece
 * quando a resposta ficou pela metade, e via `destroySoon`, que esvazia o
 * buffer antes de fechar.
 */
function terminate(res) {
  const jaEncerrada = Boolean(res.writableEnded || res.finished);
  if (jaEncerrada || res.destroyed) return;
  try {
    res.end();
  } catch {}
  try {
    if (typeof res.socket?.destroySoon === "function") res.socket.destroySoon();
    else if (typeof res.destroy === "function") res.destroy();
  } catch {}
}

/**
 * Executa `run` com rede de segurança.
 *
 * @param {object} options
 * @param {() => any} options.run      Trabalho a executar (sync ou async).
 * @param {object}   [options.res]     Resposta HTTP, quando houver.
 * @param {string}   [options.requestId]
 * @param {string}   [options.label]   Rótulo usado no log.
 * @param {(error: unknown, context: object) => void} [options.onError]
 * @returns {Promise<{outcome:string,status:number|null,error:unknown,value:any}>}
 */
export async function dispatchGuarded({ run, res = null, requestId = null, label = "route", onError = null } = {}) {
  if (typeof run !== "function") {
    // Erro de programação, não de requisição: falha imediatamente e alto.
    throw new TypeError("dispatchGuarded requer run como função");
  }
  try {
    const value = await run();
    return { outcome: DISPATCH_OUTCOME.OK, status: res ? res.statusCode ?? null : null, error: null, value };
  } catch (error) {
    if (typeof onError === "function") {
      try {
        onError(error, { requestId, label, message: describeError(error) });
      } catch {
        // Falha ao registrar não pode transformar erro de rota em queda.
      }
    }
    if (!res) {
      return { outcome: DISPATCH_OUTCOME.FAILED_UNREPORTED, status: null, error, value: undefined };
    }
    if (canStillRespond(res)) {
      const body = JSON.stringify(buildFailureBody(requestId));
      try {
        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          "Cache-Control": "no-store, max-age=0",
        });
        res.end(body);
        return { outcome: DISPATCH_OUTCOME.FAILED_CLOSED, status: 500, error, value: undefined };
      } catch {
        // Corrida rara: a resposta foi iniciada entre a checagem e a escrita.
        terminate(res);
        return { outcome: DISPATCH_OUTCOME.FAILED_AFTER_HEADERS, status: res.statusCode ?? null, error, value: undefined };
      }
    }
    terminate(res);
    return { outcome: DISPATCH_OUTCOME.FAILED_AFTER_HEADERS, status: res.statusCode ?? null, error, value: undefined };
  }
}

/**
 * Embrulha um handler `(req, res)` para que nenhuma rejeição escape.
 * Usado no callback de `createServer`, onde uma rejeição mata o processo.
 */
export function guardedRequestHandler(handler, { label = "server", onError = null, requestId = null } = {}) {
  if (typeof handler !== "function") {
    throw new TypeError("guardedRequestHandler requer handler como função");
  }
  return async function guarded(req, res) {
    return dispatchGuarded({
      run: () => handler(req, res),
      res,
      label,
      requestId: typeof requestId === "function" ? requestId(req) : requestId,
      onError,
    });
  };
}

const SAFETY_NET_FLAG = Symbol.for("seg.routeDispatch.safetyNet");

/**
 * Segunda camada: rejeições e exceções que ainda assim escaparem.
 *
 * - `unhandledRejection`: registra e MANTÉM o processo vivo. Uma promise solta
 *   em caminho secundário não pode derrubar o site inteiro.
 * - `uncaughtException`: registra de forma estruturada e preserva o
 *   comportamento de falhar rápido (`exit 1`), porque o estado do processo
 *   passa a ser desconhecido. A diferença em relação ao default é a evidência.
 *
 * Idempotente: chamar duas vezes não duplica listeners.
 * Devolve uma função de remoção (usada pelos testes).
 */
export function installProcessSafetyNet({ logger = console, exit = null, proc = process } = {}) {
  if (proc[SAFETY_NET_FLAG]) return proc[SAFETY_NET_FLAG];

  const onUnhandledRejection = (reason) => {
    try {
      logger.error?.(`[safety-net] unhandled_rejection: ${describeError(reason)}`);
      if (reason instanceof Error && reason.stack) logger.error?.(reason.stack);
    } catch {}
  };
  const onUncaughtException = (error) => {
    try {
      logger.error?.(`[safety-net] uncaught_exception: ${describeError(error)}`);
      if (error instanceof Error && error.stack) logger.error?.(error.stack);
    } catch {}
    if (typeof exit === "function") exit(1);
    else proc.exit(1);
  };

  proc.on("unhandledRejection", onUnhandledRejection);
  proc.on("uncaughtException", onUncaughtException);

  const dispose = () => {
    proc.off("unhandledRejection", onUnhandledRejection);
    proc.off("uncaughtException", onUncaughtException);
    delete proc[SAFETY_NET_FLAG];
  };
  Object.defineProperty(proc, SAFETY_NET_FLAG, { value: dispose, configurable: true, enumerable: false });
  return dispose;
}

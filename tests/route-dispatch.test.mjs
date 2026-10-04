// PLAT-01 — despacho HTTP à prova de rejeição assíncrona.
//
// Regressão coberta: `try { return handler(req,res) } catch` não aguarda a
// promise do handler. A rejeição escapava do catch, ficava sem resposta,
// virava `unhandledRejection` (que sem listener derruba o processo inteiro) e
// o ledger de observabilidade registrava 200/0ms/erro nulo.
//
// Sem banco, sem rede externa, sem fixture real: objetos sintéticos e um
// servidor HTTP real em porta efêmera de loopback.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import {
  dispatchGuarded,
  guardedRequestHandler,
  installProcessSafetyNet,
  buildFailureBody,
  describeError,
  DISPATCH_OUTCOME,
} from "../src/server/route-dispatch.mjs";

/** Resposta sintética com a superfície de ServerResponse que o guard usa. */
function fakeRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writable: true,
    headers: null,
    body: "",
    endCalls: 0,
    destroyCalls: 0,
    writeHead(status, headers) {
      if (this.headersSent) throw new Error("ERR_HTTP_HEADERS_SENT");
      this.statusCode = status;
      this.headers = headers || null;
      this.headersSent = true;
      return this;
    },
    write(chunk) {
      this.headersSent = true;
      this.body += String(chunk);
      return true;
    },
    end(chunk) {
      this.endCalls += 1;
      if (chunk !== undefined) this.body += String(chunk);
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    destroy() {
      this.destroyCalls += 1;
      this.destroyed = true;
      return this;
    },
    socket: {
      destroySoonCalls: 0,
      destroySoon() { this.destroySoonCalls += 1; },
    },
  };
  return res;
}

const parse = (res) => JSON.parse(res.body);

// ---------------------------------------------------------------- unitários

test("PLAT-01 caminho feliz: valor devolvido e desfecho ok", async () => {
  const res = fakeRes();
  const out = await dispatchGuarded({ run: async () => { res.writeHead(201, {}); res.end("{}"); return "pronto"; }, res, requestId: "req-1" });
  assert.equal(out.outcome, DISPATCH_OUTCOME.OK);
  assert.equal(out.error, null);
  assert.equal(out.value, "pronto");
  assert.equal(res.statusCode, 201);
});

test("PLAT-01 exceção síncrona vira 500 fail-closed", async () => {
  const res = fakeRes();
  const out = await dispatchGuarded({ run: () => { throw new Error("boom_sincrono"); }, res, requestId: "req-2" });
  assert.equal(out.outcome, DISPATCH_OUTCOME.FAILED_CLOSED);
  assert.equal(out.status, 500);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(parse(res), { error: "internal_error", request_id: "req-2" });
});

test("PLAT-01 rejeição assíncrona vira 500 fail-closed (o defeito original)", async () => {
  const res = fakeRes();
  const out = await dispatchGuarded({
    run: async () => { await new Promise((r) => setTimeout(r, 5)); throw new Error("boom_assincrono"); },
    res,
    requestId: "req-3",
  });
  assert.equal(out.outcome, DISPATCH_OUTCOME.FAILED_CLOSED);
  assert.equal(res.statusCode, 500);
  assert.equal(out.error instanceof Error, true);
  assert.equal(out.error.message, "boom_assincrono");
  assert.deepEqual(parse(res), { error: "internal_error", request_id: "req-3" });
});

test("PLAT-01 o corpo de falha não vaza mensagem, stack, SQL nem tabela", async () => {
  const res = fakeRes();
  const vazamento = new Error('relation "ext_compliance_documents" does not exist: SELECT storage_key FROM x');
  await dispatchGuarded({ run: async () => { throw vazamento; }, res, requestId: "req-4" });
  const texto = res.body;
  assert.deepEqual(Object.keys(parse(res)).sort(), ["error", "request_id"]);
  for (const proibido of ["ext_compliance_documents", "SELECT", "storage_key", "does not exist", "at Object"]) {
    assert.equal(texto.includes(proibido), false, `corpo de falha vazou "${proibido}"`);
  }
});

test("PLAT-01 falha não relança: o chamador nunca recebe exceção", async () => {
  const res = fakeRes();
  await assert.doesNotReject(() => dispatchGuarded({ run: async () => { throw new Error("x"); }, res }));
  await assert.doesNotReject(() => dispatchGuarded({ run: () => { throw new Error("y"); }, res: null }));
});

test("PLAT-01 rejeição depois dos headers encerra a conexão em vez de pendurar", async () => {
  const res = fakeRes();
  const out = await dispatchGuarded({
    run: async () => { res.writeHead(200, {}); res.write('{"parcial":'); throw new Error("boom_pos_header"); },
    res,
    requestId: "req-5",
  });
  assert.equal(out.outcome, DISPATCH_OUTCOME.FAILED_AFTER_HEADERS);
  assert.equal(res.writableEnded, true, "a resposta precisa ser encerrada");
  assert.equal(res.socket.destroySoonCalls, 1, "conexão parcial precisa fechar esvaziando o buffer");
  assert.equal(res.statusCode, 200, "status já enviado não é reescrito");
  assert.equal(res.body.includes("internal_error"), false, "não injeta JSON no meio de corpo parcial");
});

test("PLAT-01 resposta já encerrada pelo handler não gera escrita dupla", async () => {
  const res = fakeRes();
  const out = await dispatchGuarded({
    run: async () => { res.writeHead(204, {}); res.end(); throw new Error("falha_pos_resposta"); },
    res,
  });
  assert.equal(out.outcome, DISPATCH_OUTCOME.FAILED_AFTER_HEADERS);
  assert.equal(res.endCalls, 1, "end não pode ser chamado de novo");
  assert.equal(res.destroyCalls, 0, "resposta íntegra não pode ter o socket destruído");
  assert.equal(res.socket.destroySoonCalls, 0, "resposta íntegra não pode ser truncada pelo guard");
  assert.equal(res.statusCode, 204);
});

test("PLAT-01 sem objeto de resposta o desfecho é failed_unreported", async () => {
  const out = await dispatchGuarded({ run: async () => { throw new Error("sem_res"); } });
  assert.equal(out.outcome, DISPATCH_OUTCOME.FAILED_UNREPORTED);
  assert.equal(out.status, null);
});

test("PLAT-01 onError recebe o erro original e falha de log não derruba a rota", async () => {
  const res = fakeRes();
  const vistos = [];
  const erro = new Error("erro_observado");
  const out = await dispatchGuarded({
    run: async () => { throw erro; },
    res,
    requestId: "req-6",
    label: "routeApi",
    onError: (e, ctx) => { vistos.push([e, ctx]); },
  });
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0][0], erro);
  assert.deepEqual(vistos[0][1], { requestId: "req-6", label: "routeApi", message: "erro_observado" });
  assert.equal(out.outcome, DISPATCH_OUTCOME.FAILED_CLOSED);

  const res2 = fakeRes();
  const out2 = await dispatchGuarded({
    run: async () => { throw new Error("z"); },
    res: res2,
    onError: () => { throw new Error("logger_quebrado"); },
  });
  assert.equal(out2.outcome, DISPATCH_OUTCOME.FAILED_CLOSED, "logger quebrado não pode impedir o 500");
  assert.equal(res2.statusCode, 500);
});

test("PLAT-01 rejeição com valor não-Error é tratada", async () => {
  for (const valor of ["string solta", undefined, null, 42, { a: 1 }]) {
    const res = fakeRes();
    const out = await dispatchGuarded({ run: async () => { throw valor; }, res, requestId: "req-7" });
    assert.equal(out.outcome, DISPATCH_OUTCOME.FAILED_CLOSED, `valor ${String(valor)}`);
    assert.equal(res.statusCode, 500);
    assert.equal(typeof describeError(valor), "string");
    assert.ok(describeError(valor).length > 0);
  }
});

test("PLAT-01 run inválido é erro de programação e falha alto", async () => {
  await assert.rejects(() => dispatchGuarded({ run: null, res: fakeRes() }), /run como função/);
  assert.throws(() => guardedRequestHandler("não é função"), /handler como função/);
});

test("PLAT-01 corpo de falha omite request_id quando não há identificador", () => {
  assert.deepEqual(buildFailureBody(null), { error: "internal_error" });
  assert.deepEqual(buildFailureBody("abc"), { error: "internal_error", request_id: "abc" });
  assert.equal(buildFailureBody("x".repeat(300)).request_id.length, 100, "request_id é truncado");
});

// -------------------------------------------------------------- HTTP real

test("PLAT-01 servidor HTTP real: falha assíncrona responde 500 sem pendurar e sem matar o processo", async (t) => {
  const naoTratadas = [];
  const capturador = (reason) => naoTratadas.push(describeError(reason));
  process.on("unhandledRejection", capturador);
  t.after(() => process.off("unhandledRejection", capturador));

  const registrados = [];
  const rotas = {
    "/ok": async (req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}'); },
    "/sync-throw": () => { throw new Error("boom_sincrono"); },
    "/async-reject": async () => { await new Promise((r) => setTimeout(r, 10)); throw new Error("boom_assincrono"); },
    "/reject-apos-headers": async (req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"parcial":');
      await new Promise((r) => setTimeout(r, 10));
      throw new Error("boom_pos_header");
    },
    "/lento-ok": async (req, res) => { await new Promise((r) => setTimeout(r, 120)); res.writeHead(200, {}); res.end('{"lento":true}'); },
  };

  const handler = guardedRequestHandler(async (req, res) => {
    const rota = rotas[new URL(req.url, "http://local.invalid").pathname];
    if (!rota) { res.writeHead(404, { "content-type": "application/json" }); res.end('{"error":"not_found"}'); return; }
    return rota(req, res);
  }, {
    label: "testServer",
    requestId: () => "req-http",
    onError: (error, ctx) => registrados.push({ message: ctx.message, label: ctx.label }),
  });

  const server = createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const chamar = async (rota) => {
    const inicio = Date.now();
    const r = await fetch(base + rota, { signal: AbortSignal.timeout(5000) });
    const texto = await r.text().catch(() => "<corpo truncado>");
    return { status: r.status, texto, ms: Date.now() - inicio };
  };

  const ok = await chamar("/ok");
  assert.equal(ok.status, 200);
  assert.equal(ok.texto, '{"ok":true}');

  const sincrono = await chamar("/sync-throw");
  assert.equal(sincrono.status, 500);
  assert.deepEqual(JSON.parse(sincrono.texto), { error: "internal_error", request_id: "req-http" });

  const assincrono = await chamar("/async-reject");
  assert.equal(assincrono.status, 500, "o defeito original devolvia nada e o cliente pendurava");
  assert.deepEqual(JSON.parse(assincrono.texto), { error: "internal_error", request_id: "req-http" });
  assert.ok(assincrono.ms < 2000, `respondeu em ${assincrono.ms}ms — não pode esperar timeout do cliente`);

  const posHeader = await chamar("/reject-apos-headers").catch((e) => ({ status: null, texto: `<${e.name}>`, ms: 0 }));
  assert.ok(posHeader.ms < 2000, "conexão precisa ser encerrada, não pendurada");

  const lento = await chamar("/lento-ok");
  assert.equal(lento.status, 200);
  assert.ok(lento.ms >= 100, "requisição lenta legítima não pode ser abortada pelo guard");

  const ausente = await chamar("/rota-inexistente");
  assert.equal(ausente.status, 404);

  assert.equal(server.listening, true, "o servidor precisa continuar vivo após as falhas");
  assert.deepEqual(naoTratadas, [], `nenhuma rejeição pode escapar: ${naoTratadas.join(", ")}`);
  assert.deepEqual(
    registrados.map((r) => r.message).sort(),
    ["boom_assincrono", "boom_pos_header", "boom_sincrono"],
    "toda falha precisa chegar ao log com o erro real",
  );
  assert.deepEqual([...new Set(registrados.map((r) => r.label))], ["testServer"]);
});

test("PLAT-01 servidor HTTP real: resposta íntegra não é truncada quando o handler falha depois do end", async (t) => {
  // Risco oposto ao defeito original: ao fechar a conexão de forma agressiva,
  // o guard poderia cortar bytes ainda em buffer de uma resposta já completa.
  const corpo = JSON.stringify({ itens: Array.from({ length: 9000 }, (_, i) => ({ i, nome: `registro sintético ${i}` })) });
  assert.ok(corpo.length > 180_000, "o corpo precisa ser grande o bastante para não caber em um único buffer");

  const server = createServer(guardedRequestHandler(async (req, res) => {
    res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(corpo) });
    res.end(corpo);
    throw new Error("falha_depois_da_resposta_completa");
  }, { label: "pos-end", requestId: () => "req-pos-end" }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));

  const r = await fetch(`http://127.0.0.1:${server.address().port}/`, { signal: AbortSignal.timeout(5000) });
  const recebido = await r.text();
  assert.equal(r.status, 200);
  assert.equal(recebido.length, corpo.length, "a resposta íntegra não pode perder bytes");
  assert.equal(JSON.parse(recebido).itens.length, 9000);
});

test("PLAT-01 servidor HTTP real: rajada de falhas não degrada nem derruba", async (t) => {
  const server = createServer(guardedRequestHandler(async (req, res) => {
    if (req.url === "/saude") { res.writeHead(200, {}); res.end("vivo"); return; }
    throw new Error("falha_repetida");
  }, { label: "rajada", requestId: () => "req-rajada" }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const respostas = await Promise.all(
    Array.from({ length: 25 }, () => fetch(`${base}/falha`, { signal: AbortSignal.timeout(5000) })),
  );
  assert.deepEqual([...new Set(respostas.map((r) => r.status))], [500]);
  await Promise.all(respostas.map((r) => r.text()));

  const saude = await fetch(`${base}/saude`, { signal: AbortSignal.timeout(5000) });
  assert.equal(saude.status, 200);
  assert.equal(await saude.text(), "vivo", "o servidor segue atendendo após 25 falhas seguidas");
});

// ------------------------------------------------------- rede de segurança

test("PLAT-01 rede de segurança: unhandledRejection registra e mantém o processo vivo", () => {
  const proc = new EventEmitter();
  proc.exit = () => { throw new Error("não deveria encerrar"); };
  const logs = [];
  const dispose = installProcessSafetyNet({ proc, logger: { error: (m) => logs.push(String(m)) } });
  proc.emit("unhandledRejection", new Error("promessa_solta"));
  assert.equal(logs.some((l) => l.includes("unhandled_rejection") && l.includes("promessa_solta")), true);
  dispose();
  assert.equal(proc.listenerCount("unhandledRejection"), 0);
});

test("PLAT-01 rede de segurança: uncaughtException registra e preserva falha rápida", () => {
  const proc = new EventEmitter();
  const saidas = [];
  const logs = [];
  const dispose = installProcessSafetyNet({ proc, logger: { error: (m) => logs.push(String(m)) }, exit: (c) => saidas.push(c) });
  proc.emit("uncaughtException", new Error("estado_desconhecido"));
  assert.deepEqual(saidas, [1], "estado desconhecido continua encerrando o processo, agora com evidência");
  assert.equal(logs.some((l) => l.includes("uncaught_exception") && l.includes("estado_desconhecido")), true);
  dispose();
});

test("PLAT-01 rede de segurança é idempotente", () => {
  const proc = new EventEmitter();
  proc.exit = () => {};
  const dispose = installProcessSafetyNet({ proc, logger: { error: () => {} } });
  const segunda = installProcessSafetyNet({ proc, logger: { error: () => {} } });
  assert.equal(proc.listenerCount("unhandledRejection"), 1, "instalar duas vezes não duplica listener");
  assert.equal(proc.listenerCount("uncaughtException"), 1);
  assert.equal(segunda, dispose);
  dispose();
  assert.equal(proc.listenerCount("uncaughtException"), 0);
});

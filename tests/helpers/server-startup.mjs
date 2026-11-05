// Diagnóstico de QA: nunca publica texto bruto do filho, URLs, env ou cookies.
// A cauda contém apenas categorias de uma allowlist; chunks são descartados.

const CATEGORIES = [
  ['address-in-use', /EADDRINUSE/i],
  ['next-lock', /Unable to acquire lock|another instance of next dev|server is already running|process is already running/i],
  ['module-missing', /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/],
  ['permission-denied', /EACCES|EPERM/],
  ['file-missing', /ENOENT/],
  ['server-listening', /Grupo SEG System (?:dev|server) listening on/i],
];

export function observeServerStartup(child) {
  const started = performance.now();
  const tail = [];
  const windows = { stdout: '', stderr: '' };
  let ended = false;
  let spawnFailed = false;
  let exitCode = null;
  let signal = null;
  let bytes = 0;
  let resolveStopped;
  const stopped = new Promise(resolve => { resolveStopped = resolve; });
  function add(source, category) {
    if (tail.at(-1)?.category === category && tail.at(-1)?.source === source) return;
    tail.push({ source, category });
    if (tail.length > 16) tail.shift();
  }
  function consume(source, chunk) {
    bytes += Buffer.byteLength(chunk);
    // Somente a janela necessária para detectar categorias entre chunks.
    // Nenhuma parte dessa janela é retornada nem anexada a exceções.
    const text = (windows[source] + String(chunk)).replace(/\x1b\[[0-9;]*m/g, '');
    for (const [category, pattern] of CATEGORIES) if (pattern.test(text)) add(source, category);
    windows[source] = text.slice(-256);
  }
  const stdout = chunk => consume('stdout', chunk);
  const stderr = chunk => consume('stderr', chunk);
  function onExit(code, reason) {
    ended = true;
    exitCode = Number.isInteger(code) ? code : null;
    signal = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV'].includes(reason) ? reason : null;
    resolveStopped();
  }
  function onError() { spawnFailed = true; ended = true; resolveStopped(); }
  child.stdout?.on('data', stdout);
  child.stderr?.on('data', stderr);
  child.once('exit', onExit);
  child.once('error', onError);
  if (child.exitCode !== null || child.signalCode !== null) onExit(child.exitCode, child.signalCode);
  return {
    stopped,
    get ended() { return ended; },
    snapshot() {
      return { elapsed_ms: Math.round(performance.now() - started), ended, spawn_failed: spawnFailed,
        exit_code: exitCode, signal, output_bytes: bytes, tail: tail.map(item => ({ ...item })) };
    },
    dispose() {
      child.stdout?.off('data', stdout); child.stderr?.off('data', stderr);
      child.off('exit', onExit); child.off('error', onError);
      windows.stdout = ''; windows.stderr = '';
    },
  };
}

export async function waitForTestServer(url, monitor, { timeoutMs = 60_000, requestMs = 1_000, intervalMs = 400 } = {}) {
  const deadline = performance.now() + timeoutMs;
  function failure(reason) {
    const error = new Error(`server_startup_${reason}: ${JSON.stringify(monitor.snapshot())}`);
    error.code = `server_startup_${reason}`;
    return error;
  }
  while (performance.now() < deadline) {
    if (monitor.ended) throw failure('exited');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(requestMs, deadline - performance.now())));
    let response;
    try {
      response = await Promise.race([
        fetch(`${url}/api/admin/session`, { headers: { accept: 'application/json' }, signal: controller.signal }).catch(() => null),
        monitor.stopped.then(() => null),
      ]);
      if (monitor.ended) throw failure('exited');
      if (response?.status === 401 || response?.status === 200) return;
    } finally {
      clearTimeout(timer);
      controller.abort();
      await response?.body?.cancel().catch(() => {});
    }
    await waitForStop(monitor, Math.max(0, Math.min(intervalMs, deadline - performance.now())));
  }
  throw failure('timeout');
}

async function waitForStop(monitor, milliseconds) {
  let timer;
  try {
    await Promise.race([monitor.stopped, new Promise(resolve => { timer = setTimeout(resolve, milliseconds); })]);
  } finally { clearTimeout(timer); }
}

export async function stopTestServer(child, monitor, { graceMs = 2_000 } = {}) {
  if (!child || !monitor) return;
  try {
    if (!monitor.ended) {
      child.kill('SIGTERM');
      await waitForStop(monitor, graceMs);
    }
    // child.killed só informa envio de sinal, não saída do processo.
    if (!monitor.ended) {
      child.kill('SIGKILL');
      await waitForStop(monitor, graceMs);
    }
    if (!monitor.ended) throw new Error('server_cleanup_timeout');
  } finally { monitor.dispose(); }
}

// EXT-07 — execução agendada da avaliação temporal de compliance.
//
// Resolve a pendência documentada: a avaliação temporal era somente operação
// administrativa explícita (POST /api/ext/compliance/evaluate). Este módulo
// executa o MESMO núcleo (runExpiryEvaluation) de forma contínua, no próprio
// processo do servidor, como opt-in por ambiente:
//
//   EXT07_EVALUATE_INTERVAL_SECONDS  inteiro >= 1; ausente/inválido = desligado
//   EXT07_EVALUATE_IDENTITY          UUID de identidade staff ativa (admin/ti)
//                                    em cujo nome a automação age
//   EXT07_SCHEDULER_MODE             'in-process' (padrão) | 'durable' (E16)
//
// Dois executores, o mesmo núcleo:
//   * `in-process` — timer do processo. Simples, sem estado além do ledger de
//     execuções (156): se o processo cair no meio do intervalo, a execução que
//     deveria ter acontecido não acontece e nada a retoma.
//   * `durable` (E16) — a intenção é gravada em `durable_jobs` (migração 182)
//     ANTES de executar; cada execução é reivindicada com lease
//     (`FOR UPDATE SKIP LOCKED`) e concluída na mesma transação do trabalho.
//     Restart no meio do lease ⇒ outro processo retoma o mesmo intervalo, e o
//     intervalo só é executado uma vez (`last_completed_slot`). Falha ⇒ retry
//     com backoff exponencial. O timer vira só um "olheiro" da fila: a cadência
//     vive no banco, não no relógio do processo.
//
// Fronteiras deliberadas:
//   - não é ator externo, integração regulatória nem SMTP: é um timer local;
//   - exige `DATABASE_URL` (PostgreSQL real). Depois do E7 o modo PGlite da
//     demo TEM o schema EXT-07 (migrações 001–182): o que falta lá não é
//     schema, é o executor — o PGlite é um banco embutido de escritor único por
//     diretório, de modo que não há segundo processo para reivindicar o lease,
//     e a demo não tem supervisor de processo para reiniciar o worker. Ligar o
//     worker durável ali seria teatro de disponibilidade, não retomada;
//   - a identidade declarada é revalidada A CADA execução: suspensa/desativada,
//     a execução falha fechado (run 'falha', zero mutação de compliance). No
//     modo durável isso é uma falha PERMANENTE (retry apenas no teto do
//     backoff, sem tocar o banco de compliance) e o job retoma sozinho quando a
//     identidade é reativada;
//   - cada execução que roda grava UMA linha em ext_compliance_evaluation_runs
//     ('concluida' — inclusive sem efeito — ou 'falha'); execução pulada por
//     lock concorrente não grava; o ledger é append-only (migração 156);
//   - o evento 'expiry_evaluated' em ext_compliance_events é gravado uma vez
//     por dia/ator com chave determinística 'agendada:YYYY-MM-DD' (execuções
//     seguintes no mesmo dia não duplicam o evento);
//   - nenhuma rejeição escapa do tick: dispatchGuarded (PLAT-01) + catch
//     estruturado; o processo nunca cai por causa do agendador.
import { createHash } from "node:crypto";
import { dispatchGuarded, describeError } from "./route-dispatch.mjs";
import { isActiveStaffIdentity, runExpiryEvaluation } from "./ext-compliance-api.mjs";
import {
  DURABLE_SCHEDULER_DEFAULTS,
  backoffDelaySeconds,
  claimJob,
  completeJobOrThrow,
  DURABLE_NON_RUN_REASONS,
  enqueue,
  failJob,
  hasDurableJobsSchema,
  inspectJob,
  parseDurableSchedulerConfig,
  runDueJobs,
} from "./durable-scheduler.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADVISORY_LOCK_KEY = "ext07:scheduler";
const ERROR_MAX_LENGTH = 500;
// Um único job recorrente por banco: a cadência é o `due_at` da fila, e a
// unicidade de `job_key` é o que impede dois boot simultâneos criarem duas
// filas paralelas para o mesmo trabalho.
export const EXT07_EVALUATION_JOB_KEY = "ext07:expiry-evaluation";
export const EXT07_EVALUATION_JOB_TYPE = "ext07_expiry_evaluation";

/**
 * Configuração a partir de variáveis de ambiente. Sem intervalo válido, o
 * agendador permanece desligado (padrão); valores inválidos NÃO ligam nada.
 */
export function parseSchedulerConfig(env = process.env) {
  const rawInterval = String(env.EXT07_EVALUATE_INTERVAL_SECONDS ?? "").trim();
  const parsedInterval = Number(rawInterval);
  const intervalSeconds =
    rawInterval !== "" && Number.isSafeInteger(parsedInterval) && parsedInterval >= 1 ? parsedInterval : null;
  const rawIdentity = String(env.EXT07_EVALUATE_IDENTITY ?? "").trim();
  const actorIdentity = UUID.test(rawIdentity) ? rawIdentity : null;
  const durable = parseDurableSchedulerConfig(env);
  return { intervalSeconds, actorIdentity, mode: durable.mode, durable };
}

const dayKeyFor = (today) => `agendada:${today}`;

/** Slot de idempotência do intervalo (a segunda resolução é o menor que importa). */
export function evaluationSlotFor(dueAt) {
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) throw new TypeError("evaluationSlotFor: data inválida");
  return `agendada:${date.toISOString().slice(0, 16)}`;
}

/**
 * Próximo disparo de um job recorrente. Se o intervalo atrasou mais do que
 * uma cadência (processo fora do ar), NÃO se persegue o passado: uma única
 * execução de atraso e a cadência volta a contar de agora.
 * Pura e determinística — o relógio entra por parâmetro.
 */
export function computeNextDueAt({ currentDueAt, intervalSeconds, now = new Date() }) {
  const fallback = new Date(now.getTime() + intervalSeconds * 1000);
  const current = currentDueAt instanceof Date ? currentDueAt : new Date(currentDueAt ?? NaN);
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1 || Number.isNaN(current.getTime())) return fallback;
  const step = intervalSeconds * 1000;
  if (current.getTime() <= now.getTime() - step) return fallback;
  return new Date(current.getTime() + step);
}

/** Registro best-effort da execução falha (a transação principal rolou back). */
async function recordFailedRun({ client, startedAt, actorIdentity, intervalSeconds, dayKey, reason, error, logger, durableSlot = null }) {
  const message = String(error?.message || error || reason).slice(0, ERROR_MAX_LENGTH);
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ext_compliance_evaluation_runs
         (origem, evaluation_date, started_at, finished_at, status, actor_identity,
          interval_seconds, idempotency_key, facts, error)
       VALUES ('agendada', CURRENT_DATE, $1, NOW(), 'falha', $2, $3, $4, $5, $6)`,
      [
        startedAt,
        actorIdentity,
        intervalSeconds,
        dayKey || "agendada:sem-data",
        JSON.stringify({
          trigger: "agendada",
          reason,
          // Qual intervalo da fila falhou: sem isso o operador vê a falha mas
          // não consegue dizer se era o retry do mesmo intervalo ou um novo.
          ...(durableSlot ? { durable_slot: String(durableSlot).slice(0, 200) } : {}),
        }),
        message,
      ],
    );
    await client.query("COMMIT");
  } catch (recordError) {
    // Sem banco não há ledger: a evidência da falha fica no log do processo.
    logger.error?.(`[ext07-scheduler] falha ao registrar execução falha: ${describeError(recordError)}`);
    await client.query("ROLLBACK").catch(() => {});
  }
}

/**
 * Uma execução completa do núcleo. Nunca lança: devolve desfecho estruturado.
 *
 * @param {object} options
 * @param {object} options.pool            Pool pg (ou forneça getPool).
 * @param {() => object} [options.getPool] Função que devolve o pool vigente.
 * @param {string} options.actorIdentity   Identidade staff declarada (ambiente).
 * @param {number} [options.intervalSeconds]
 * @param {object} [options.logger]
 * @param {object} [options.client]        Client já conectado (modo durável).
 * @param {boolean} [options.beginTransaction=true] Falso quando o chamador já
 *        abriu a transação e vai COMMITAR — é o que faz a conclusão do slot ser
 *        atômica com o efeito.
 */
export async function runScheduledEvaluationOnce({
  pool = null,
  getPool = null,
  actorIdentity,
  intervalSeconds = null,
  logger = console,
  client: providedClient = null,
  beginTransaction = true,
  onBeforeCommit = null,
  durableSlot = null,
} = {}) {
  const startedAt = new Date();
  const resolvePool = () => (typeof getPool === "function" ? getPool() : pool);
  if (typeof actorIdentity !== "string" || !UUID.test(actorIdentity)) {
    // Configuração malformada não chega aqui em produção (o boot recusa), mas
    // o caminho continua fail-closed para chamadas diretas.
    return { outcome: "falha", reason: "scheduler_identity_malformed" };
  }
  // Quem fornece o client com `beginTransaction: false` é o dono da
  // transação: este núcleo escreve nela e nada faz de fora dela — é assim que
  // a conclusão do slot da fila (E16) fica atômica com o efeito.
  const ownsTransaction = !providedClient;
  let client = providedClient || null;
  const rollback = async () => {
    if (client && beginTransaction) await client.query("ROLLBACK").catch(() => {});
  };
  try {
    if (!client) client = await resolvePool().connect();
    if (beginTransaction) await client.query("BEGIN");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired", [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0]?.acquired) {
      // Defesa em profundidade para bancos compartilhados por mais de uma
      // instalação: mesmo com a fila, dois processos podem servir o mesmo
      // job_key em bancos diferentes do mesmo servidor.
      if (beginTransaction) await client.query("ROLLBACK");
      return { outcome: "pulado", reason: "concurrent_tick" };
    }
    // A identidade declarada é revalidada a cada execução.
    if (!(await isActiveStaffIdentity(client, actorIdentity))) {
      if (beginTransaction) await client.query("ROLLBACK");
      if (beginTransaction) {
        await recordFailedRun({
          client, startedAt, actorIdentity, intervalSeconds, dayKey: null,
          reason: "scheduler_identity_invalid",
          error: new Error("identidade declarada não é staff admin/ti ativa"),
          logger,
        });
      }
      // `error` é a mensagem que a fila guarda em `last_error`: o operador
      // precisa ler POR QUE parou, não só o código interno.
      return {
        outcome: "falha",
        reason: "scheduler_identity_invalid",
        error: "identidade declarada não é staff admin/ti ativa",
        permanent: true,
      };
    }
    const today = (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
    const dayKey = dayKeyFor(today);
    const evaluation = await runExpiryEvaluation(client, { actorIdentityId: actorIdentity });
    // Evento do dia: uma vez por dia/ator; execuções seguintes apenas executam
    // o trabalho (idempotente) sem duplicar o ledger imutável de eventos.
    const fingerprint = createHash("sha256").update(`${dayKey}:${actorIdentity}`).digest("hex");
    const event = await client.query(
      `INSERT INTO ext_compliance_events
         (obligation_id, document_id, task_id, event_type, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES (NULL, NULL, NULL, 'expiry_evaluated', $1, $2, $3, $4)
       ON CONFLICT (created_by_identity, idempotency_key) DO NOTHING`,
      [
        JSON.stringify({ ...evaluation.body, trigger: "agendada", interval_seconds: intervalSeconds }),
        dayKey,
        fingerprint,
        actorIdentity,
      ],
    );
    // Falha de auditoria reverte a execução inteira (mesma disciplina do HTTP).
    try {
      await client.query("INSERT INTO audit_log(action,actor,target,meta) VALUES ($1,$2,$3,$4)", [
        "ext07_expiry_evaluate",
        actorIdentity,
        actorIdentity,
        JSON.stringify({ trigger: "agendada", interval_seconds: intervalSeconds, idempotency_key: dayKey }),
      ]);
    } catch (error) {
      if (beginTransaction) await client.query("ROLLBACK");
      if (beginTransaction) {
        await recordFailedRun({ client, startedAt, actorIdentity, intervalSeconds, dayKey, reason: "audit_unavailable", error, logger });
      }
      return { outcome: "falha", reason: "audit_unavailable", error: describeError(error) };
    }
    const facts = {
      ...evaluation.body.facts,
      trigger: "agendada",
      event_written: event.rowCount === 1,
      // Qual intervalo da fila produziu esta linha. O `idempotency_key` é a
      // chave do DIA (várias execuções no mesmo dia a compartilham, por
      // desenho); sem o slot não haveria como provar no ledger que dois ticks
      // distintos executaram dois intervalos distintos — é o que o gate E16
      // verifica (`GROUP BY facts->>'durable_slot' HAVING count(*) > 1` = 0).
      ...(durableSlot ? { durable_slot: String(durableSlot).slice(0, 200) } : {}),
    };
    await client.query(
      `INSERT INTO ext_compliance_evaluation_runs
         (origem, evaluation_date, started_at, finished_at, status, actor_identity,
          interval_seconds, idempotency_key, facts, error)
       VALUES ('agendada', CURRENT_DATE, $1, NOW(), 'concluida', $2, $3, $4, $5, NULL)`,
      [startedAt, actorIdentity, intervalSeconds, dayKey, JSON.stringify(facts)],
    );
    // Última escrita antes do COMMIT: conclui o intervalo na fila DENTRO da
    // mesma transação do efeito. Se a guarda falhar (lease perdido), ela lança,
    // o COMMIT não acontece e o efeito inteiro rolou back.
    if (typeof onBeforeCommit === "function") await onBeforeCommit(client);
    if (beginTransaction) await client.query("COMMIT");
    logger.log?.(
      `[ext07-scheduler] execução concluida: vencidos=${evaluation.body.facts.documents_expired} ` +
        `tarefas_criadas=${evaluation.body.facts.tasks_created} evento=${event.rowCount === 1 ? "novo" : "já_registrado"}`,
    );
    return { outcome: "concluida", facts, dayKey };
  } catch (error) {
    await rollback();
    if (client && beginTransaction) {
      await recordFailedRun({
        client, startedAt, actorIdentity, intervalSeconds, dayKey: null,
        reason: "evaluation_failed", error, logger,
      });
    } else if (!client) {
      logger.error?.(`[ext07-scheduler] execução falhou sem conexão: ${describeError(error)}`);
    }
    // `error.reason` é preservado: é assim que o chamador distingue "o núcleo
    // falhou" de "outro processo ficou com o slot" (claim perdido) — e decide
    // se o ledger 156 ganha ou não uma linha 'falha'.
    return { outcome: "falha", reason: error?.reason || "evaluation_failed", error: describeError(error) };
  } finally {
    if (ownsTransaction) client?.release?.();
  }
}

/**
 * Liga o timer in-process. Devolve um handle para observação/parada.
 * O primeiro tick roda imediatamente; os seguintes a cada intervalSeconds.
 */
export function startExtComplianceScheduler({
  pool = null,
  getPool = null,
  intervalSeconds,
  actorIdentity,
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1) {
    throw new TypeError("startExtComplianceScheduler requer intervalSeconds inteiro >= 1");
  }
  if (typeof actorIdentity !== "string" || !UUID.test(actorIdentity)) {
    throw new TypeError("startExtComplianceScheduler requer actorIdentity UUID válida");
  }
  let running = false;
  let lastTickAt = null;
  let lastOutcome = null;

  async function tick() {
    if (running) {
      // Sobreposição no processo: o tick anterior ainda está em execução.
      logger.log?.("[ext07-scheduler] tick ignorado: execução anterior em andamento");
      return { outcome: "pulado", reason: "tick_in_progress" };
    }
    running = true;
    try {
      const result = await runScheduledEvaluationOnce({ pool, getPool, actorIdentity, intervalSeconds, logger });
      lastTickAt = new Date();
      lastOutcome = result.outcome;
      return result;
    } finally {
      running = false;
    }
  }

  // Nenhuma rejeição do tick pode escapar para o timer (PLAT-01).
  const guardedTick = () =>
    dispatchGuarded({
      run: () => tick(),
      label: "ext07-scheduler",
      onError: (error, context) => logger.error?.(`[ext07-scheduler] tick_failed: ${context.message}`),
    });

  const timer = setIntervalFn(guardedTick, intervalSeconds * 1000);
  timer.unref?.();
  guardedTick(); // primeira execução imediata: estado fresco logo após o boot.

  return {
    stop() {
      clearIntervalFn(timer);
    },
    runOnce: guardedTick,
    state() {
      return {
        enabled: true,
        mode: "in-process",
        running,
        intervalSeconds,
        actorIdentity,
        lastTickAt,
        lastOutcome,
      };
    },
  };
}

/**
 * E16 — worker DURÁVEL do EXT-07: a intenção é persistida antes de executar e a
 * execução é reivindicada com lease. O timer deixa de ser a fonte da cadência
 * (vira o olheiro da fila), então um restart não perde execução nem repete.
 *
 * Exige a migração 182 aplicada: sem ela o boot recusa com motivo explícito em
 * vez de cair no modo antigo silenciosamente (modo silencioso foi a causa do
 * `/api/health/ready` degradado que o E7 acabou de corrigir na demo).
 *
 * @param {object} options
 * @param {() => object} [options.getPool] provider do pool vigente
 * @param {number} options.intervalSeconds cadência do job recorrente
 * @param {string} options.actorIdentity   identidade staff declarada
 * @param {object} [options.durable]       parseDurableSchedulerConfig()
 * @param {object} [options.logger]
 * @param {function} [options.setIntervalFn]
 * @param {function} [options.clearIntervalFn]
 */
export function startExt07DurableWorker({
  pool = null,
  getPool = null,
  intervalSeconds,
  actorIdentity,
  durable = parseDurableSchedulerConfig(process.env),
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1) {
    throw new TypeError("startExt07DurableWorker requer intervalSeconds inteiro >= 1");
  }
  if (typeof actorIdentity !== "string" || !UUID.test(actorIdentity)) {
    throw new TypeError("startExt07DurableWorker requer actorIdentity UUID válida");
  }
  if (durable.configError) {
    throw new TypeError(`startExt07DurableWorker: configuração de fila inválida (${durable.configError})`);
  }
  const resolveDb = () => (typeof getPool === "function" ? getPool() : pool);
  const queueOptions = {
    leaseSeconds: durable.leaseSeconds,
    backoffSeconds: durable.backoffSeconds,
    backoffMaxSeconds: durable.backoffMaxSeconds,
    batchSize: durable.batchSize,
  };

  let running = false;
  let lastTickAt = null;
  let lastOutcome = null;
  let lastError = null;
  let enqueuedAtBoot = false;
  let schemaPresent = null;

  // Persistir a intenção ANTES de qualquer execução: é o que sobrevive ao
  // restart. `refresh` só ajusta o que ainda não começou; nunca atropela uma
  // execução em andamento nem reabre um intervalo concluído.
  async function ensureEnqueued() {
    await enqueue(resolveDb(), {
      jobKey: EXT07_EVALUATION_JOB_KEY,
      jobType: EXT07_EVALUATION_JOB_TYPE,
      slot: evaluationSlotFor(new Date()),
      dueAt: new Date(),
      payload: { interval_seconds: intervalSeconds, cadence: "recorrente" },
      leaseSeconds: durable.leaseSeconds,
      maxBackoffSeconds: durable.backoffMaxSeconds,
      refresh: true,
    });
    enqueuedAtBoot = true;
  }

  async function tick() {
    if (running) {
      logger.log?.("[ext07-scheduler] tick ignorado: execução anterior em andamento");
      return { outcome: "pulado", reason: "tick_in_progress" };
    }
    running = true;
    try {
      if (schemaPresent !== true) {
        schemaPresent = await hasDurableJobsSchema(resolveDb());
        if (!schemaPresent) {
          lastError = "durable_jobs_schema_missing";
          throw Object.assign(new Error(
            "durable_jobs_schema_missing: aplique a migração 182 (npm run db:migrate) antes de usar EXT07_SCHEDULER_MODE=durable",
          ), { retryable: false });
        }
      }
      if (!enqueuedAtBoot) await ensureEnqueued();
      const summary = await runDueJobs({
        getDb: resolveDb,
        jobKey: EXT07_EVALUATION_JOB_KEY,
        logger,
        ...queueOptions,
        handle: async (job) => {
          const client = await resolveDb().connect();
          try {
            await client.query("BEGIN");
            const result = await runScheduledEvaluationOnce({
              client,
              beginTransaction: false,
              actorIdentity,
              intervalSeconds,
              logger,
              durableSlot: job.slot,
              // Conclusão do intervalo NA MESMA TRANSAÇÃO do efeito: ou os dois
              // commitem, ou nenhum dos dois existiu. Retomar depois de uma queda
              // é refazer um trabalho idempotente, nunca duplicar um efeito.
              onBeforeCommit: async (innerClient) => {
                const nextDueAt = computeNextDueAt({ currentDueAt: job.due_at, intervalSeconds, now: new Date() });
                await completeJobOrThrow(innerClient, {
                  jobKey: EXT07_EVALUATION_JOB_KEY,
                  token: job.token,
                  slot: job.slot,
                  nextSlot: evaluationSlotFor(nextDueAt),
                  nextDueAt,
                });
              },
            });
            if (result.outcome === "pulado") {
              throw Object.assign(new Error("concurrent_tick"), { retryable: true, reason: "concurrent_tick" });
            }
            if (result.outcome !== "concluida") {
              throw Object.assign(new Error(result.error || result.reason || "execucao agendada falhou"), {
                retryable: result.permanent !== true,
                reason: result.reason,
              });
            }
            await client.query("COMMIT");
            return { completed: true, facts: result.facts, dayKey: result.dayKey };
          } catch (error) {
            // O dono da transação é este worker: sem ROLLBACK aqui o client
            // voltaria ao pool "idle in transaction" — travando locks e a
            // própria fila. O núcleo não desfaz o que não abriu.
            await client.query("ROLLBACK").catch(() => {});
            // Mesmo registro de 'falha' do modo in-process (ledger 156), em
            // transação PRÓPRIA, depois de desfeita a do trabalho. Exceção
            // declarada: quando outro processo é/foi o dono do slot (lease
            // perdido ou lock concorrente) esta execução não aconteceu até o
            // fim — e a regra do 156 é "quem não executou não grava linha".
            if (!DURABLE_NON_RUN_REASONS.includes(error?.reason)) {
              await recordFailedRun({
                client,
                startedAt: new Date(),
                actorIdentity,
                intervalSeconds,
                dayKey: null,
                reason: error?.reason || "evaluation_failed",
                error,
                logger,
                durableSlot: job.slot,
              });
            }
            throw error;
          } finally {
            client?.release?.();
          }
        },
      });
      lastTickAt = new Date();
      lastOutcome = summary.results[0]?.status ?? (summary.claimed ? "falha" : "ocioso");
      lastError = summary.error ?? null;
      return summary;
    } finally {
      running = false;
    }
  }

  const guardedTick = () =>
    dispatchGuarded({
      run: () => tick(),
      label: "ext07-scheduler-durable",
      onError: (error, context) => logger.error?.(`[ext07-scheduler] tick_failed: ${context.message}`),
    });

  const timer = setIntervalFn(guardedTick, intervalSeconds * 1000);
  timer.unref?.();
  guardedTick(); // primeiro tick imediato: retoma imediatamente o que ficou pendente.

  return {
    stop() {
      clearIntervalFn(timer);
    },
    runOnce: guardedTick,
    ensureEnqueued,
    async queueState() {
      if (!(await hasDurableJobsSchema(resolveDb()))) return null;
      return inspectJob(resolveDb(), EXT07_EVALUATION_JOB_KEY);
    },
    state() {
      return {
        enabled: true,
        mode: "durable",
        running,
        intervalSeconds,
        actorIdentity,
        lastTickAt,
        lastOutcome,
        lastError,
        enqueuedAtBoot,
        schemaPresent,
        queue: { ...queueOptions },
      };
    },
  };
}

/** Descreve o próximo atraso provável do retry (para observação/logs). */
export function describeRetryBackoff({ failures, durable = parseDurableSchedulerConfig(process.env) } = {}) {
  return backoffDelaySeconds({
    failures,
    baseSeconds: durable.backoffSeconds ?? DURABLE_SCHEDULER_DEFAULTS.backoffSeconds,
    maxSeconds: durable.backoffMaxSeconds ?? DURABLE_SCHEDULER_DEFAULTS.backoffMaxSeconds,
  });
}

export { claimJob, enqueue as enqueueDurableJob, failJob };

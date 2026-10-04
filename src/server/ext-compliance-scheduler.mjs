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
//
// Fronteiras deliberadas:
//   - não é ator externo, integração regulatória nem SMTP: é um timer local;
//   - exige PostgreSQL real (DATABASE_URL); PGlite beta não possui o schema;
//   - a identidade declarada é revalidada A CADA tick: suspensa/desativada, a
//     execução falha fechado (run 'falha', zero mutação de compliance);
//   - cada tick que executa grava UMA linha em ext_compliance_evaluation_runs
//     ('concluida' — inclusive sem efeito — ou 'falha'); tick pulado por lock
//     concorrente não grava; o ledger é append-only (migração 156);
//   - o evento 'expiry_evaluated' em ext_compliance_events é gravado uma vez
//     por dia/ator com chave determinística 'agendada:YYYY-MM-DD' (ticks
//     seguintes no mesmo dia não duplicam o evento);
//   - nenhuma rejeição escapa do tick: dispatchGuarded (PLAT-01) + catch
//     estruturado; o processo nunca cai por causa do agendador.
import { createHash, randomUUID } from "node:crypto";
import { dispatchGuarded, describeError } from "./route-dispatch.mjs";
import { isActiveStaffIdentity, runExpiryEvaluation } from "./ext-compliance-api.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADVISORY_LOCK_KEY = "ext07:scheduler";
const ERROR_MAX_LENGTH = 500;

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
  return { intervalSeconds, actorIdentity };
}

const dayKeyFor = (today) => `agendada:${today}`;

/** Registro best-effort da execução falha (a transação principal rolou back). */
async function recordFailedRun({ client, startedAt, actorIdentity, intervalSeconds, dayKey, reason, error, logger }) {
  const message = String(error?.message || error || reason).slice(0, ERROR_MAX_LENGTH);
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ext_compliance_evaluation_runs
         (origem, evaluation_date, started_at, finished_at, status, actor_identity,
          interval_seconds, idempotency_key, facts, error)
       VALUES ('agendada', CURRENT_DATE, $1, NOW(), 'falha', $2, $3, $4, $5, $6)`,
      [startedAt, actorIdentity, intervalSeconds, dayKey || "agendada:sem-data", JSON.stringify({ trigger: "agendada", reason }), message],
    );
    await client.query("COMMIT");
  } catch (recordError) {
    // Sem banco não há ledger: a evidência da falha fica no log do processo.
    logger.error?.(`[ext07-scheduler] falha ao registrar execução falha: ${describeError(recordError)}`);
    await client.query("ROLLBACK").catch(() => {});
  }
}

/**
 * Uma execução agendada completa. Nunca lança: devolve desfecho estruturado.
 *
 * @param {object} options
 * @param {object} options.pool            Pool pg (ou forneça getPool).
 * @param {() => object} [options.getPool] Função que devolve o pool vigente.
 * @param {string} options.actorIdentity   Identidade staff declarada (ambiente).
 * @param {number} [options.intervalSeconds]
 * @param {object} [options.logger]
 */
export async function runScheduledEvaluationOnce({
  pool = null,
  getPool = null,
  actorIdentity,
  intervalSeconds = null,
  logger = console,
} = {}) {
  const startedAt = new Date();
  const resolvePool = () => (typeof getPool === "function" ? getPool() : pool);
  if (typeof actorIdentity !== "string" || !UUID.test(actorIdentity)) {
    // Configuração malformada não chega aqui em produção (o boot recusa), mas
    // o caminho continua fail-closed para chamadas diretas.
    return { outcome: "falha", reason: "scheduler_identity_malformed" };
  }
  let client;
  try {
    client = await resolvePool().connect();
    await client.query("BEGIN");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired", [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0]?.acquired) {
      await client.query("ROLLBACK");
      return { outcome: "pulado", reason: "concurrent_tick" };
    }
    // A identidade declarada é revalidada a cada execução.
    if (!(await isActiveStaffIdentity(client, actorIdentity))) {
      await client.query("ROLLBACK");
      await recordFailedRun({
        client, startedAt, actorIdentity, intervalSeconds, dayKey: null,
        reason: "scheduler_identity_invalid",
        error: new Error("identidade declarada não é staff admin/ti ativa"),
        logger,
      });
      return { outcome: "falha", reason: "scheduler_identity_invalid" };
    }
    const today = (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
    const dayKey = dayKeyFor(today);
    const evaluation = await runExpiryEvaluation(client, { actorIdentityId: actorIdentity });
    // Evento do dia: uma vez por dia/ator; ticks seguintes apenas executam o
    // trabalho (idempotente) sem duplicar o ledger imutável de eventos.
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
      await client.query("ROLLBACK");
      await recordFailedRun({
        client, startedAt, actorIdentity, intervalSeconds, dayKey,
        reason: "audit_unavailable", error, logger,
      });
      return { outcome: "falha", reason: "audit_unavailable", error: describeError(error) };
    }
    const facts = { ...evaluation.body.facts, trigger: "agendada", event_written: event.rowCount === 1 };
    await client.query(
      `INSERT INTO ext_compliance_evaluation_runs
         (origem, evaluation_date, started_at, finished_at, status, actor_identity,
          interval_seconds, idempotency_key, facts, error)
       VALUES ('agendada', CURRENT_DATE, $1, NOW(), 'concluida', $2, $3, $4, $5, NULL)`,
      [startedAt, actorIdentity, intervalSeconds, dayKey, JSON.stringify(facts)],
    );
    await client.query("COMMIT");
    logger.log?.(
      `[ext07-scheduler] execução concluida: vencidos=${evaluation.body.facts.documents_expired} ` +
        `tarefas_criadas=${evaluation.body.facts.tasks_created} evento=${event.rowCount === 1 ? "novo" : "já_registrado"}`,
    );
    return { outcome: "concluida", facts };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    if (client) {
      await recordFailedRun({
        client, startedAt, actorIdentity, intervalSeconds, dayKey: null,
        reason: "evaluation_failed", error, logger,
      });
    } else {
      logger.error?.(`[ext07-scheduler] execução falhou sem conexão: ${describeError(error)}`);
    }
    return { outcome: "falha", reason: "evaluation_failed", error: describeError(error) };
  } finally {
    client?.release?.();
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
      return { enabled: true, running, intervalSeconds, actorIdentity, lastTickAt, lastOutcome };
    },
  };
}

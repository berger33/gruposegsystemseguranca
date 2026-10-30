// E16 — primitivas do scheduler DURÁVEL (intenção de execução persistida).
//
// O que isto resolve, na ordem do defeito medido em `ext-compliance-scheduler`:
//   (1) a intenção de executar NÃO era persistida antes de executar → aqui o
//       `enqueue` grava o job (chave única + `due_at`) ANTES de qualquer efeito;
//   (2) não havia retomada após restart → o estado vive no banco; o dono de um
//       lease vencido é recuperado por outro processo no próximo tick;
//   (3) não havia claim entre processos além do lock consultivo por tick →
//       reivindicar é UM `UPDATE ... FOR UPDATE SKIP LOCKED` com lease e token
//       de cercamento (fencing); a exclusão mútua é decidida pelo PostgreSQL,
//       não pela boa vontade do processo;
//   (4) não havia backoff depois de 'falha' → `failJob` calcula
//       `min(base * 2^(falhas-1), teto)` e atrasa o `due_at` do retry.
//
// "Exatamente uma vez por intervalo" tem duas pernas, e ambas são de banco:
//   * atômica — o trabalho transacional roda na MESMA transação que conclui o
//     slot (`completeJobOrThrow`). Caiu antes do COMMIT, o trabalho não
//     aconteceu E o slot não foi marcado: a retomada refaz um trabalho
//     idempotente, não repete um efeito. Quem conclui é o processo que ganhou
//     o COMMIT;
//   * única — a conclusão só se aplica com `status='executando' AND
//     claim_token=$token AND lease_until>NOW() AND slot=$slot`, e a
//     reivindicação só aceita linhas com `last_completed_slot IS DISTINCT FROM
//     slot`. Dono atrasado (lease vencido) não escreve; concorrente que chegou
//     depois de concluir não reivindica.
//
// Nada aqui conhece EXT-07, SMTP ou cron do sistema: é uma fila local com
// ledger. Fronteiras declaradas — não é fila externa, não é `crontab`, não
// dispara nada com o processo morto (a retomada ocorre no primeiro tick depois
// de subir) e não promete exactly-once de side-effect externo: o efeito do
// handler precisa ser idempotente por slot, como já é o evento do dia do EXT-07.
// O relógio canônico é o do banco (`NOW()`): não há parâmetro de "agora" para
// o chamador enganar.
import { randomUUID } from "node:crypto";

const ERROR_MAX_LENGTH = 500;
const BACKOFF_MAX_EXPONENT = 20; // acima disso o expoente trava (sem overflow)

export const DURABLE_SCHEDULER_DEFAULTS = Object.freeze({
  leaseSeconds: 120,
  backoffSeconds: 60,
  backoffMaxSeconds: 3600,
  batchSize: 5,
  errorMaxLength: ERROR_MAX_LENGTH,
});

/** Ler o ambiente sem aceitar lixo: valor inválido cai no padrão declarado. */
function positiveInt(raw, fallback, { min, max }) {
  const value = Number(String(raw ?? "").trim());
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

const truncateError = (error) => String(error?.message || error || "erro desconhecido").slice(0, ERROR_MAX_LENGTH);

/** A tabela existe? banco de destino ainda não migrado ≠ fila silenciosamente quebrada */
export async function hasDurableJobsSchema(db) {
  try {
    const found = await db.query(
      `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'durable_jobs' LIMIT 1`,
    );
    return (found.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Configuração do modo durável a partir do ambiente. Valores inválidos NÃO
 * ligam nada (mesma disciplina do `EXT07_EVALUATE_INTERVAL_SECONDS`). O padrão
 * continua `in-process`: o modo durável é opt-in explícito do operador.
 */
export function parseDurableSchedulerConfig(env = process.env) {
  const rawMode = String(env.EXT07_SCHEDULER_MODE ?? "").trim().toLowerCase();
  const mode = rawMode === "durable" ? "durable" : "in-process";
  const leaseSeconds = positiveInt(env.EXT07_SCHEDULER_LEASE_SECONDS, 120, { min: 5, max: 3600 });
  const backoffMaxSeconds = positiveInt(env.EXT07_SCHEDULER_BACKOFF_MAX_SECONDS, 3600, { min: 1, max: 86400 });
  return {
    mode,
    durableEnabled: mode === "durable",
    leaseSeconds,
    backoffSeconds: positiveInt(env.EXT07_SCHEDULER_BACKOFF_SECONDS, 60, { min: 1, max: 86400 }),
    backoffMaxSeconds,
    batchSize: positiveInt(env.EXT07_SCHEDULER_BATCH_SIZE, 5, { min: 1, max: 50 }),
    // O CHECK da migração 182 exige teto de backoff >= lease: configuração
    // incompatível é recusada no boot, não descoberta no primeiro tick.
    configError: backoffMaxSeconds < leaseSeconds ? "backoff_menor_que_lease" : null,
  };
}

/**
 * Backoff exponencial com teto: base·2^(falhas-consecutivas-1). Função pura —
 * é a parte do desenho que dá para provar sem banco.
 */
export function backoffDelaySeconds({ failures, baseSeconds, maxSeconds } = {}) {
  const base = positiveInt(baseSeconds, 60, { min: 1, max: 86400 });
  const max = positiveInt(maxSeconds, 3600, { min: 1, max: 86400 });
  const attempts = Number.isFinite(failures) && failures >= 1 ? Math.floor(failures) : 1;
  const exponent = Math.min(BACKOFF_MAX_EXPONENT, attempts - 1);
  const raw = base * 2 ** exponent;
  return { seconds: Math.min(max, raw), exponent, capped: raw > max, baseSeconds: base, maxSeconds: max };
}

/**
 * Persiste a intenção de executar. Idempotente por `job_key`: re-enfileirar o
 * mesmo job não duplica linha, não rouba uma execução em andamento e não reabre
 * um intervalo já concluído.
 *
 * @param {object} db  pool ou client (query(text, params))
 * @param {object} job { jobKey, jobType, slot, dueAt, payload, leaseSeconds,
 *                       maxBackoffSeconds, refresh, force }
 *   `refresh` — atualiza payload/due_at de um job que ainda não começou;
 *   `force`   — o operador quer o intervalo de novo: reabre o slot e zera o
 *               histórico de falha.
 * @returns {Promise<{status:'inserido'|'reatualizado'|'existente'|'em_execucao', id:string|null}>}
 */
/**
 * Grava (ou reabre, com `force`) a intenção de executar um intervalo.
 *
 * `refresh` é o caminho do boot: atualiza metadados (`payload`) de um job que
 * ainda não começou, sem tocar no tempo. `due_at` é a PROMESSA de quando o
 * intervalo vence — quem a move é a conclusão (próximo intervalo) ou `force`
 * (operador rearmou de propósito). Medido no gate E16: quando o boot também
 * rearmava `due_at = NOW()`, cada reinício produzia uma execução extra (dois
 * boots, duas execuções no mesmo intervalo), o que contradiz "um intervalo, uma
 * execução". O primeiro boot continua executivo: o INSERT nasce com
 * `due_at = NOW()`, e um intervalo que VENCEU enquanto o processo estava caído
 * já está com `due_at` no passado — o tick o pega na hora.
 */
// Razões em que a execução NÃO aconteceu até o fim por culpa de concorrência:
// quem perde a disputa não escreve no ledger EXT-07 (regra 156: "quem não
// executou não grava linha"). Compartilhada com o scheduler para que a decisão
// de "gravar falha ou não" tenha uma única fonte.
export const DURABLE_NON_RUN_REASONS = Object.freeze([
  "concurrent_tick",
  "claim_ou_lease_perdido",
  "tick_in_progress",
]);

export async function enqueue(db, job = {}) {
  const {
    jobKey, jobType, slot,
    dueAt = new Date(),
    payload = {},
    leaseSeconds = DURABLE_SCHEDULER_DEFAULTS.leaseSeconds,
    maxBackoffSeconds = DURABLE_SCHEDULER_DEFAULTS.backoffMaxSeconds,
    refresh = false,
    force = false,
  } = job;
  if (typeof jobKey !== "string" || jobKey.length < 3 || jobKey.length > 200) {
    throw new TypeError("enqueue: job_key inválido (3..200 caracteres)");
  }
  if (typeof jobType !== "string" || jobType.length < 1 || jobType.length > 100) {
    throw new TypeError("enqueue: job_type inválido (1..100 caracteres)");
  }
  if (typeof slot !== "string" || slot.length < 3 || slot.length > 200) {
    throw new TypeError("enqueue: slot de idempotência inválido (3..200 caracteres)");
  }
  if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime())) {
    throw new TypeError("enqueue: dueAt precisa ser uma data válida");
  }
  const { rows } = await db.query(
    `INSERT INTO durable_jobs
       (job_key, job_type, status, slot, due_at, payload, lease_seconds, max_backoff_seconds)
     VALUES ($1, $2, 'aguardando', $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (job_key) DO UPDATE
        SET payload             = CASE WHEN $8 THEN EXCLUDED.payload ELSE durable_jobs.payload END,
            due_at              = CASE WHEN $9 THEN EXCLUDED.due_at  ELSE durable_jobs.due_at  END,
            slot                = CASE WHEN $9 THEN EXCLUDED.slot    ELSE durable_jobs.slot    END,
            last_completed_slot = CASE WHEN $9 THEN NULL             ELSE durable_jobs.last_completed_slot END,
            status              = CASE WHEN $9 THEN 'aguardando'    ELSE durable_jobs.status  END,
            consecutive_failures= CASE WHEN $9 THEN 0               ELSE durable_jobs.consecutive_failures END,
            last_error          = CASE WHEN $9 THEN NULL            ELSE durable_jobs.last_error END
      WHERE $9 OR durable_jobs.status <> 'executando'
     RETURNING id, (xmax = 0) AS inserted`,
    [
      jobKey, jobType, slot, dueAt, JSON.stringify(payload), leaseSeconds, maxBackoffSeconds,
      Boolean(refresh), Boolean(force),
    ],
  );
  const row = rows?.[0];
  if (!row) return { status: "em_execucao", id: null };
  if (row.inserted) return { status: "inserido", id: row.id };
  return { status: refresh ? "reatualizado" : "existente", id: row.id };
}

/**
 * Reivindica com lease os intervalos prontos — e os de dono com lease vencido.
 * UMA instrução: `SKIP LOCKED` faz o concorrente voltar sem a linha em vez de
 * bloquear, e `last_completed_slot IS DISTINCT FROM slot` impede rodar de novo
 * o que já foi concluído. O `UPDATE` é autocommit: a reivindicação fica
 * durável ANTES de qualquer trabalho, que é justamente o que faltava.
 */
export async function claimJob(db, { jobKey, claimant = randomUUID(), leaseSeconds = DURABLE_SCHEDULER_DEFAULTS.leaseSeconds, batchSize = 1 } = {}) {
  if (typeof jobKey !== "string" || !jobKey) throw new TypeError("claimJob: job_key obrigatório");
  const { rows } = await db.query(
    `UPDATE durable_jobs
        SET status = 'executando',
            attempts = attempts + 1,
            lease_until = NOW() + make_interval(secs => $3::int),
            claim_token = $4::uuid,
            last_started_at = NOW()
      WHERE id IN (
        SELECT id FROM durable_jobs
         WHERE job_key = $1
           AND (
                (status = 'executando' AND lease_until < NOW())
             OR (status IN ('aguardando', 'falha') AND due_at <= NOW())
           )
           AND last_completed_slot IS DISTINCT FROM slot
         ORDER BY due_at
         LIMIT $2
           FOR UPDATE SKIP LOCKED
      )
      RETURNING id, job_key, job_type, slot, due_at, payload, attempts, consecutive_failures,
                claim_token, lease_until`,
    [jobKey, batchSize, leaseSeconds, claimant],
  );
  return (rows || []).map((row) => ({ ...row, token: row.claim_token }));
}

/**
 * Conclusão do intervalo. Um handler transacional DEVE chamá-la dentro da
 * própria transação (via `completeJobOrThrow`), para que "efeito" e "slot
 * concluído" commitem juntos.
 *
 * @returns {Promise<{applied:boolean, reason?:string}>}
 *   `applied:false` = lease vencido ou outro dono; quem perde não escreve.
 */
export async function completeJob(db, { jobKey, token, slot, nextSlot = null, nextDueAt = null } = {}) {
  const { rows } = await db.query(
    `UPDATE durable_jobs
        SET status = 'aguardando',
            last_completed_slot = $3,
            slot = COALESCE($4, $3),
            due_at = COALESCE($5::timestamptz, NOW()),
            consecutive_failures = 0,
            last_error = NULL,
            last_finished_at = NOW(),
            lease_until = NULL,
            claim_token = NULL
      WHERE job_key = $1
        AND status = 'executando'
        AND claim_token = $2::uuid
        AND lease_until > NOW()
        AND slot = $3
      RETURNING id`,
    [jobKey, token, slot, nextSlot, nextDueAt],
  );
  if ((rows?.length ?? 0) === 1) return { applied: true };
  return { applied: false, reason: "claim_ou_lease_perdido" };
}

/**
 * Guarda de conclusão para uso DENTRO da transação do trabalho: zero linhas
 * atualizadas = este processo não é mais o dono. A exceção sobe, o COMMIT não
 * acontece e nenhum efeito é publicado — é isso que torna o retry seguro.
 */
export async function completeJobOrThrow(db, args) {
  const applied = await completeJob(db, args);
  if (!applied.applied) {
    throw Object.assign(new Error("durable_claim_lost"), { retryable: true, reason: applied.reason });
  }
  return applied;
}

/**
 * Registro de falha com backoff (melhor esforço, FORA da transação do trabalho,
 * que já rolou back). `retryable=false` é o caso permanente (identidade
 * suspensa, configuração quebrada): o job continua na fila, visível como
 * 'falha', com retry no teto do backoff — sem loop de erro e sem efeito.
 *
 * O atraso usa o contador que está NO banco, não o que o processo lembrava:
 * quem chama passa `consecutive_failures + 1` (o valor que a linha vai ter).
 */
export async function failJob(db, {
  jobKey, token, error, retryable = true, failures = null,
  backoffSeconds = DURABLE_SCHEDULER_DEFAULTS.backoffSeconds,
  backoffMaxSeconds = DURABLE_SCHEDULER_DEFAULTS.backoffMaxSeconds,
} = {}) {
  // `failures` é a contagem JÁ COM o incremento que a própria instrução aplica
  // (o UPDATE faz `consecutive_failures + 1`): o atraso é lido do contador do
  // banco, não do que o processo lembrava.
  const knownFailures = Number.isSafeInteger(failures) && failures >= 1 ? failures : 1;
  const backoff = backoffDelaySeconds({ failures: knownFailures, baseSeconds: backoffSeconds, maxSeconds: backoffMaxSeconds });
  const delaySeconds = retryable
    ? backoff.seconds
    : Math.max(1, Math.min(86400, backoffMaxSeconds));
  let rows;
  try {
    ({ rows } = await db.query(
      `UPDATE durable_jobs
          SET status = 'falha',
              consecutive_failures = consecutive_failures + 1,
              last_error = $3,
              last_finished_at = NOW(),
              due_at = NOW() + make_interval(secs => $4::int),
              lease_until = NULL,
              claim_token = NULL
        WHERE job_key = $1
          AND claim_token = $2::uuid
        RETURNING id, consecutive_failures, attempts`,
      [jobKey, token, truncateError(error), Math.max(1, Math.min(86400, delaySeconds))],
    ));
  } catch (registerError) {
    // Sem banco não há fila: a evidência da falha fica no log do processo.
    return { applied: false, reason: "registro_indisponivel", error: truncateError(registerError) };
  }
  if ((rows?.length ?? 0) !== 1) return { applied: false, reason: "claim_ou_lease_perdido" };
  return { applied: true, retryInSeconds: delaySeconds, backoff, ...rows[0] };
}

/** Estado observável do job (leitura; não reivindica nada). */
export async function inspectJob(db, jobKey) {
  const { rows } = await db.query(
    `SELECT job_key, job_type, status, slot, last_completed_slot, due_at, lease_until,
            lease_seconds, attempts, consecutive_failures, max_backoff_seconds,
            last_error, last_started_at, last_finished_at, payload
       FROM durable_jobs WHERE job_key = $1`,
    [jobKey],
  );
  return rows?.[0] || null;
}

/**
 * Um tick do worker: reivindica, executa e (se o handler não concluiu dentro
 * da transação) arma o próximo intervalo. Nenhuma rejeição escapa para o
 * timer — mesma disciplina do dispatcher HTTP (PLAT-01).
 *
 * Contrato do handler: `handle(job)` recebe o job reivindicado. Se ele concluir
 * o trabalho em transação, chama `completeJobOrThrow` dentro dela; se não, o
 * worker conclui aqui (fallback — mantém a cadência viva para trabalho não
 * transacional).
 *
 * @param {object} options
 * @param {object} [options.db]            pool/client
 * @param {() => object} [options.getDb]   provider do pool vigente
 * @param {string} options.jobKey          job atendido por este worker
 * @param {(job:object) => Promise<object|void>} options.handle
 * @param {(context:{job:object,value:any}) => Promise<{slot?:string,dueAt?:Date}|null>}
 *        [options.nextInterval] arma o próximo intervalo (recorrente)
 * @param {object} [options.logger]
 */
export async function runDueJobs({
  db, getDb = null, jobKey, handle, nextInterval = null, logger = console,
  batchSize = DURABLE_SCHEDULER_DEFAULTS.batchSize,
  leaseSeconds = DURABLE_SCHEDULER_DEFAULTS.leaseSeconds,
  backoffSeconds = DURABLE_SCHEDULER_DEFAULTS.backoffSeconds,
  backoffMaxSeconds = DURABLE_SCHEDULER_DEFAULTS.backoffMaxSeconds,
} = {}) {
  if (typeof handle !== "function") throw new TypeError("runDueJobs requer handle como função");
  const resolveDb = () => (typeof getDb === "function" ? getDb() : db);
  let claimed;
  try {
    claimed = await claimJob(resolveDb(), { jobKey, leaseSeconds, batchSize });
  } catch (error) {
    logger.error?.(`[durable-scheduler] claim_falhou: ${truncateError(error)}`);
    return { claimed: 0, results: [], error: truncateError(error) };
  }
  const results = [];
  for (const job of claimed) {
    const outcome = { jobKey, slot: job.slot, status: "concluida" };
    try {
      const value = await handle(job);
      outcome.value = value;
      const completedInTransaction = value?.completed === true;
      if (!completedInTransaction) {
        const next = typeof nextInterval === "function" ? await nextInterval({ job, value }) : null;
        const applied = await completeJob(resolveDb(), {
          jobKey, token: job.token, slot: job.slot, nextSlot: next?.slot ?? null, nextDueAt: next?.dueAt ?? null,
        });
        outcome.status = applied.applied ? "concluida" : "reivindicacao_perdida";
        if (!applied.applied) {
          logger.error?.(`[durable-scheduler] lease vencido durante a execucao: slot ${job.slot} nao concluido por este processo`);
        }
      }
    } catch (error) {
      outcome.status = "falha";
      const failure = await failJob(resolveDb(), {
        jobKey, token: job.token, error,
        retryable: error?.retryable !== false,
        failures: Number(job.consecutive_failures ?? 0) + 1,
        backoffSeconds, backoffMaxSeconds,
      });
      outcome.error = truncateError(error);
      outcome.retryInSeconds = failure.retryInSeconds ?? null;
      if (error?.retryable === false) outcome.permanent = true;
      logger.error?.(
        `[durable-scheduler] execucao falhou (slot ${job.slot}): ${outcome.error}` +
        (outcome.retryInSeconds ? `; nova tentativa em ${outcome.retryInSeconds}s` : ""),
      );
    }
    results.push(outcome);
  }
  return { claimed: claimed.length, results };
}

export { truncateError };

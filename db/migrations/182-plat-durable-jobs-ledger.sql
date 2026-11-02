-- E16 — ledger DURÁVEL de jobs agendados (fila de intenção persistida).
--
-- Causa raiz que esta tabela fecha: o agendador do EXT-07 (migração 156) era
-- um `setInterval` in-process. A intenção de executar NÃO era persistida antes
-- de executar, então (a) um restart dentro do intervalo perdia a execução que
-- deveria ter acontecido; (b) não havia retomada — o boot apenas disparava um
-- tick novo; (c) a única exclusão entre processos era um lock consultivo POR
-- TICK, que não sobrevive à queda do dono; (d) uma linha 'falha' no ledger de
-- execuções não gerava nova tentativa (sem backoff).
--
-- Este ledger é o avesso do de 156: 156 é o registro de AUDITORIA append-only
-- do que aconteceu; aqui mora o ESTADO MUTÁVEL da fila (o que ainda precisa
-- acontecer). As duas naturezas não podem dividir a mesma tabela — um ledger
-- imutável não consegue carregar `lease_until`.
--
-- Semântica de colunas:
--   * `job_key` é a identidade do job recorrente (único). Um nome por trabalho,
--     não um nome por execução: a cadência vive em `due_at`, não na chave;
--   * `slot` é a chave de idempotência do intervalo a executar; a conclusão
--     grava `last_completed_slot` e avança `due_at`/`slot` na MESMA instrução
--     da transação do trabalho — por isso um intervalo não roda duas vezes,
--     mesmo com dois reivindicadores concorrentes;
--   * `lease_until` é a reivindicação com prazo. Reivindicar é um único
--     `UPDATE ... FOR UPDATE SKIP LOCKED`: duas reivindicações concorrentes
--     decidem no PostgreSQL, não no processo. Dono morto é retomado quando o
--     prazo vence — não existe "destravar" manual nem job órfão em 'executando';
--   * `claim_token` é o número de cercamento (fencing token): só o dono atual
--     conclui; um dono cujo lease venceu no meio do trabalho não escreve;
--   * `attempts` é o total de reivindicações (não reseta) e
--     `consecutive_failures` alimenta o backoff exponencial do retry.
--
-- Aditiva: nenhum seed, nenhum UPDATE retroativo, nada de 001–181 é alterado.
-- Fronteira: isto é uma fila de execução local. Não é cron do sistema, não é
-- fila externa (SQS/BullMQ/Redis), não envia nada a provedor algum e não
-- dispara nada com o processo morto: a retomada ocorre no primeiro tick depois
-- de subir. Entrega "pelo menos uma vez no banco / efeito idempotente por
-- slot", que é exatamente o contrato que a migração 156 já tinha para o evento
-- do dia ('agendada:YYYY-MM-DD').

CREATE TABLE IF NOT EXISTS durable_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL UNIQUE CHECK (char_length(job_key) BETWEEN 3 AND 200),
  job_type TEXT NOT NULL CHECK (char_length(job_type) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'executando', 'falha')),
  slot TEXT NOT NULL CHECK (char_length(slot) BETWEEN 3 AND 200),
  last_completed_slot TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  lease_until TIMESTAMPTZ,
  lease_seconds INTEGER NOT NULL DEFAULT 120 CHECK (lease_seconds BETWEEN 5 AND 3600),
  claim_token UUID,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  max_backoff_seconds INTEGER NOT NULL DEFAULT 3600
    CHECK (max_backoff_seconds BETWEEN 1 AND 86400),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 500),
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- O teto do backoff precisa cobrir pelo menos um ciclo de retomada: se o
  -- retry atrasasse menos do que o prazo do lease, o dono atrasado e o novo
  -- dono estariam vivos ao mesmo tempo.
  CHECK (max_backoff_seconds >= lease_seconds),
  -- Slot concluído e slot pendente nunca coincidem: se `last_completed_slot`
  -- existe, ele é o slot ANTERIOR ao que está na fila.
  CHECK (last_completed_slot IS NULL OR last_completed_slot IS DISTINCT FROM slot)
);

-- Índices parciais: "o que está pronto para rodar AGORA" é a consulta do worker
-- a cada tick; varrer a tabela inteira (jobs adiados para o próximo intervalo)
-- seria trabalho desnecessário — e é o motivo de `due_at`/`lease_until` serem as
-- colunas dos índices. Dois índices, e nenhum deles compara com `NOW()`:
-- predicado de índice parcial exige expressão IMMUTABLE (medido: com `NOW()` o
-- PostgreSQL recusa a migração com `functions in index predicate must be marked
-- IMMUTABLE`). A janela de vencimento é decidida no `WHERE` da reivindicação,
-- que é exatamente onde o relógio do banco deve ser lido.
CREATE INDEX IF NOT EXISTS durable_jobs_due_idx
  ON durable_jobs(due_at)
  WHERE status IN ('aguardando', 'falha');

CREATE INDEX IF NOT EXISTS durable_jobs_lease_idx
  ON durable_jobs(lease_until)
  WHERE status = 'executando';

CREATE OR REPLACE FUNCTION durable_jobs_touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS durable_jobs_touch_updated_at ON durable_jobs;
CREATE TRIGGER durable_jobs_touch_updated_at
  BEFORE UPDATE ON durable_jobs
  FOR EACH ROW EXECUTE FUNCTION durable_jobs_touch_updated_at();

COMMENT ON TABLE durable_jobs IS
  'E16 durable job ledger: persisted scheduling intent (due_at), lease-based claim with FOR UPDATE SKIP LOCKED, exponential backoff, and last_completed_slot as the per-interval exactly-once guard. Mutable queue state on purpose — the append-only audit record stays in ext_compliance_evaluation_runs (156).';

COMMENT ON COLUMN durable_jobs.slot IS
  'Idempotency key of the interval to be executed next (for EXT-07 it is agendada:<due_at>, matching the daily event key agendada:YYYY-MM-DD).';

COMMENT ON COLUMN durable_jobs.claim_token IS
  'Fencing token: completion and failure writes apply only while the token still matches the current claim.';

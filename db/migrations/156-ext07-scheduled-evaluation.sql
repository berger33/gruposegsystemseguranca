-- EXT-07 — execução agendada da avaliação temporal (ledger de execuções).
-- Aditiva sobre 001–155. Sem seed, sem UPDATE retroativo, sem alteração de
-- contrato HTTP e sem ator externo: a execução agendada roda no próprio
-- processo do servidor (opt-in por ambiente) e age em nome de uma identidade
-- staff real declarada pelo operador (EXT07_EVALUATE_IDENTITY).
--
-- Cada linha registra UMA execução agendada que de fato rodou, com desfecho
-- final: 'concluida' (inclusive quando não havia nada a fazer — ausência de
-- efeito não é ausência de execução) ou 'falha' (execução tentada e
-- interrompida, com o erro registrado). Tick pulado por lock concorrente não
-- grava linha; execução interrompida antes do registro não grava linha — o
-- vão no ledger mais o log do processo são a evidência. O ledger é
-- append-only: nada é atualizado ou apagado depois de gravado.
--
-- A chave idempotency_key documenta a chave determinística do dia
-- ('agendada:YYYY-MM-DD') usada para gravar o evento 'expiry_evaluated' em
-- ext_compliance_events uma única vez por dia/ator; ticks seguintes no mesmo
-- dia não duplicam o evento, mas continuam gravando a própria linha aqui.

CREATE TABLE IF NOT EXISTS ext_compliance_evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL CHECK (origem = 'agendada'),
  evaluation_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('concluida','falha')),
  actor_identity UUID REFERENCES auth_identities(id) ON DELETE RESTRICT,
  interval_seconds INTEGER CHECK (interval_seconds IS NULL OR interval_seconds >= 1),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT CHECK (error IS NULL OR char_length(error) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ext_compliance_evaluation_runs_started_idx
  ON ext_compliance_evaluation_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS ext_compliance_evaluation_runs_date_idx
  ON ext_compliance_evaluation_runs(evaluation_date, started_at DESC);

-- Ledger append-only: atualização e exclusão são sempre bloqueadas (mesma
-- disciplina de ext_compliance_events). O registro de falha/finalização é
-- gravado em INSERT único, sem reescrita posterior.
CREATE OR REPLACE FUNCTION ext_compliance_evaluation_run_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'compliance evaluation run is immutable';
END $$;
DROP TRIGGER IF EXISTS ext_compliance_evaluation_run_immutable ON ext_compliance_evaluation_runs;
CREATE TRIGGER ext_compliance_evaluation_run_immutable
  BEFORE UPDATE OR DELETE ON ext_compliance_evaluation_runs
  FOR EACH ROW EXECUTE FUNCTION ext_compliance_evaluation_run_immutable();

COMMENT ON TABLE ext_compliance_evaluation_runs IS
  'EXT-07 scheduled temporal evaluation ledger: one row per executed tick (in-process, environment opt-in, acting as a declared staff identity). Rows are append-only; a gap means a tick that never completed.';

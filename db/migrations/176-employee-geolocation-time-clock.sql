-- Marcações originais são imutáveis; ajustes alteram apenas o resumo da jornada.
CREATE TABLE emp_time_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id uuid NOT NULL REFERENCES hr_employees(id),
 time_entry_id uuid NOT NULL UNIQUE REFERENCES hr_time_entries(id),
 started_at timestamptz NOT NULL,
 ended_at timestamptz,
 closed_by_correction_id uuid REFERENCES emp_journey_corrections(id),
 CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX emp_time_session_open ON emp_time_sessions(employee_id) WHERE ended_at IS NULL;
CREATE TABLE emp_time_punches (
 ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES emp_time_sessions(id),
 employee_id uuid NOT NULL REFERENCES hr_employees(id),
 kind text NOT NULL CHECK (kind IN ('entrada','saida_intervalo','retorno_intervalo','saida')),
 recorded_at timestamptz NOT NULL,
 position_at timestamptz NOT NULL,
 latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
 accuracy_m double precision NOT NULL CHECK (accuracy_m BETWEEN 0 AND 100000),
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 actor_id uuid NOT NULL,
 UNIQUE(employee_id, request_id)
);
CREATE INDEX emp_time_punch_history ON emp_time_punches(employee_id, recorded_at DESC);
CREATE FUNCTION emp_time_punch_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Original time punch cannot be changed or deleted'; END;
$$;
CREATE TRIGGER emp_time_punch_no_change BEFORE UPDATE OR DELETE ON emp_time_punches
 FOR EACH ROW EXECUTE FUNCTION emp_time_punch_immutable();

-- Fechamento não pode impedir a saída de uma jornada ainda aberta ou ocultar pedidos pendentes.
CREATE FUNCTION emp_time_closure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='fechado' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-time:' || NEW.competence,0));
  IF EXISTS (SELECT 1 FROM emp_time_sessions s JOIN hr_time_entries e ON e.id=s.time_entry_id WHERE e.competence=NEW.competence AND s.ended_at IS NULL) THEN
   RAISE EXCEPTION 'competence_has_open_journeys' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM emp_journey_corrections c JOIN hr_time_entries e ON e.id=c.time_entry_id WHERE e.competence=NEW.competence AND c.status IN ('solicitado','em_analise')) THEN
   RAISE EXCEPTION 'competence_has_pending_corrections' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER emp_time_closure_check BEFORE INSERT OR UPDATE ON hr_time_competence_closures
 FOR EACH ROW EXECUTE FUNCTION emp_time_closure_guard();

-- Cada funcionário decide separadamente se as coordenadas do ponto podem ser
-- enviadas ao HERE. Eventos são append-only para preservar prova de aceite/revogação.
CREATE TABLE emp_time_external_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES hr_employees(id),
  identity_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'HERE'),
  terms_version text NOT NULL,
  accepted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX emp_time_external_consent_latest
  ON emp_time_external_consent_events(employee_id, provider, recorded_at DESC, id DESC);

CREATE FUNCTION emp_time_external_consent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'External service consent history cannot be changed or deleted'; END;
$$;

CREATE TRIGGER emp_time_external_consent_no_change
  BEFORE UPDATE OR DELETE ON emp_time_external_consent_events
  FOR EACH ROW EXECUTE FUNCTION emp_time_external_consent_immutable();

-- Endereço reverso opcional do comprovante. Falha do geocoder nunca invalida o ponto.
ALTER TABLE emp_time_punches
  ADD COLUMN address_label text,
  ADD COLUMN address_provider text,
  ADD COLUMN address_status text NOT NULL DEFAULT 'not_requested'
    CHECK (address_status IN ('not_requested','not_configured','resolved','not_found','unavailable')),
  ADD COLUMN address_resolved_at timestamptz;

ALTER TABLE emp_time_punches
  ADD CONSTRAINT emp_time_punch_address_state_check CHECK (
    (address_status = 'resolved' AND address_label IS NOT NULL AND address_provider = 'HERE' AND address_resolved_at IS NOT NULL)
    OR
    (address_status <> 'resolved' AND address_label IS NULL AND address_resolved_at IS NULL)
  );

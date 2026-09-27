CREATE TABLE IF NOT EXISTS site_visual_config (
  singleton_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  active_visual CHAR(2) NOT NULL DEFAULT '06'
    CHECK (active_visual IN ('01','02','03','04','05','06','07','08','09','10')),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_visual_config (singleton_id, active_visual)
VALUES (1, '06')
ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS site_visual_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  previous_visual CHAR(2) NOT NULL
    CHECK (previous_visual IN ('01','02','03','04','05','06','07','08','09','10')),
  next_visual CHAR(2) NOT NULL
    CHECK (next_visual IN ('01','02','03','04','05','06','07','08','09','10')),
  changed_by TEXT NOT NULL CHECK (changed_by IN ('marcelo','ti')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS site_visual_audit_changed_at_idx
  ON site_visual_audit (changed_at DESC);

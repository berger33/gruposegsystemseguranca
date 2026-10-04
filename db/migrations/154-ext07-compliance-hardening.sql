-- EXT-07 hardening, additive only. Historical rows remain untouched.
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_private_canonical CHECK (origin <> 'ext07_canonica' OR is_private) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_issue_start CHECK (issue_date IS NULL OR effective_start_date IS NULL OR effective_start_date >= issue_date) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_expiry_rule CHECK (origin <> 'ext07_canonica' OR (validity_rule IS NOT NULL AND expiry_date IS NOT NULL)) NOT VALID;
ALTER TABLE ext_compliance_tasks
  ADD CONSTRAINT ext_compliance_task_owner CHECK (status NOT IN ('concluida','em_andamento') OR responsible_identity IS NOT NULL) NOT VALID;
ALTER TABLE ext_compliance_tasks
  ADD CONSTRAINT ext_compliance_task_dates CHECK (due_date >= evaluation_date) NOT VALID;
ALTER TABLE ext_compliance_documents
  ADD CONSTRAINT ext_compliance_version_positive CHECK (version_no > 0) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS ext_compliance_one_current_version
  ON ext_compliance_documents(obligation_id)
  WHERE origin='ext07_canonica' AND replacement_of IS NULL AND status <> 'cancelada';
CREATE INDEX IF NOT EXISTS ext_compliance_events_entity_idx ON ext_compliance_events(obligation_id,document_id,created_at);
COMMENT ON CONSTRAINT ext_compliance_private_canonical ON ext_compliance_documents IS 'Canonical EXT-07 documents are always private; references are not files.';
COMMENT ON CONSTRAINT ext_compliance_task_owner ON ext_compliance_tasks IS 'Completion and in-progress work require a canonical staff owner.';

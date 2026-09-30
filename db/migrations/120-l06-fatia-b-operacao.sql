-- 120-l06-fatia-b-operacao.sql
-- L06 Fatia B: Endurecimento de Cobertura, Passagem de Turno, Ocorrências e Checklists (OPS-05..08)
-- Integração com contratos canônicos crm_contracts, unidades crm_company_units e documentos client_documents.

-- OPS-05: Cobertura
ALTER TABLE ops_coverage_requests
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_template_id UUID REFERENCES ops_shift_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coverage_date DATE,
  ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ops_cov_req_contract ON ops_coverage_requests(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_cov_req_unit ON ops_coverage_requests(unit_id);
CREATE INDEX IF NOT EXISTS idx_ops_cov_req_date ON ops_coverage_requests(coverage_date);
CREATE INDEX IF NOT EXISTS idx_ops_cov_req_shift ON ops_coverage_requests(shift_template_id);

-- OPS-06: Passagem de turno
ALTER TABLE ops_handovers
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_handover_contract ON ops_handovers(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_handover_unit ON ops_handovers(unit_id);

-- OPS-07: Livro de ocorrências e evidências privadas
ALTER TABLE ops_occurrence_book
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_occ_book_contract ON ops_occurrence_book(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_unit ON ops_occurrence_book(unit_id);
CREATE INDEX IF NOT EXISTS idx_ops_occ_book_company ON ops_occurrence_book(company_id);

ALTER TABLE ops_occurrence_evidences
  ADD COLUMN IF NOT EXISTS client_document_id UUID REFERENCES client_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_occ_evid_client_doc ON ops_occurrence_evidences(client_document_id);

-- OPS-08: Checklists
ALTER TABLE ops_checklist_instances
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES crm_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_check_inst_contract ON ops_checklist_instances(contract_id);
CREATE INDEX IF NOT EXISTS idx_ops_check_inst_unit ON ops_checklist_instances(unit_id);

ALTER TABLE ops_checklist_items
  ADD COLUMN IF NOT EXISTS client_document_id UUID REFERENCES client_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ops_check_item_client_doc ON ops_checklist_items(client_document_id);

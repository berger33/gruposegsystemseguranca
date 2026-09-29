-- CRM-12: equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico.

CREATE TABLE IF NOT EXISTS crm_equipment (
  id TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 100),
  manufacturer VARCHAR(100) NOT NULL CHECK (char_length(manufacturer) BETWEEN 1 AND 100),
  model VARCHAR(100) NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
  name VARCHAR(200) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  compatibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  category TEXT CHECK (category IS NULL OR char_length(category) <= 100),
  supplier_name VARCHAR(200),
  supplier_contact VARCHAR(200),
  warranty_months INT CHECK (warranty_months IS NULL OR warranty_months BETWEEN 1 AND 120),
  stock_sku TEXT CHECK (stock_sku IS NULL OR char_length(stock_sku) <= 100),
  stock_location TEXT CHECK (stock_location IS NULL OR char_length(stock_location) <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_validated BOOLEAN NOT NULL DEFAULT false,
  validation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_equipment_manufacturer_idx ON crm_equipment (manufacturer, model);
CREATE INDEX IF NOT EXISTS crm_equipment_category_idx ON crm_equipment (category, is_active);
CREATE INDEX IF NOT EXISTS crm_equipment_active_idx ON crm_equipment (is_active, is_validated);

CREATE OR REPLACE FUNCTION crm_equipment_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_equipment_updated_at_trg ON crm_equipment;
CREATE TRIGGER crm_equipment_updated_at_trg BEFORE UPDATE ON crm_equipment FOR EACH ROW EXECUTE FUNCTION crm_equipment_set_updated_at();

-- Exemplos iniciais (não confundir serviço com item físico)
INSERT INTO crm_equipment (id, manufacturer, model, name, description, specifications, compatibilities, category, supplier_name, warranty_months, is_active, is_validated, validation_note)
VALUES
  ('hikvision_ds-2ce56d0t', 'Hikvision', 'DS-2CE56D0T-IRP', 'Câmera Dome 1080p IR', 'Câmera dome analógica 1080p com infravermelho 20m, lente 2.8mm.', '{"resolucao":"1080p","lente":"2.8mm","ir":"20m","wdr":"DWDR","alimentacao":"12V"}'::jsonb, '["DVR Hikvision Turbo HD","Fonte 12V 1A","Cabo coaxial"]'::jsonb, 'camera', 'Fornecedor Padrão CFTV', 12, true, false, 'Exemplo CRM-12 - aguarda validação técnica'),
  ('intelbras_vd_3104', 'Intelbras', 'VD 3104', 'DVR 4 canais 1080p', 'DVR 4 canais analógico + 1 IP, compressão H.265, HDMI/VGA.', '{"canais":"4+1","resolucao":"1080p","compressao":"H.265","saida":"HDMI/VGA","armazenamento":"1x SATA"}'::jsonb, '["Câmeras Intelbras 1080p","HD 1TB","Fonte 12V"]'::jsonb, 'dvr', 'Fornecedor Padrão CFTV', 12, true, false, 'Exemplo CRM-12'),
  ('control_id_idface', 'Control iD', 'iDFace', 'Controle de acesso facial', 'Controlador de acesso com reconhecimento facial, 1500 faces.', '{"capacidade_faces":"1500","conectividade":"TCP/IP, WiFi","leitor":"Facial + senha","saida_rele":"1"}'::jsonb, '["Fechadura eletromagnética","Fonte 12V","Software iDCloud"]'::jsonb, 'controle_acesso', 'Fornecedor Controle Acesso', 12, true, false, 'Exemplo CRM-12')
ON CONFLICT (id) DO NOTHING;

-- Ligação com estoque (AST) - campo stock_sku e stock_location, tabela futura ast_stock_movements referenciará equipment_id
-- Auditoria
ALTER TABLE auth_access_audit DROP CONSTRAINT IF EXISTS auth_access_audit_action_check;
ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action IN (
  'invite_issue','invite_revoke','invite_accept',
  'login','logout','session_revoke_all',
  'email_confirm','email_confirm_resend',
  'password_reset_request','password_reset_complete',
  'account_create','account_status',
  'grant_issue','grant_revoke',
  'contract_create','contract_status','contract_list',
  'document_upload','document_download','document_list',
  'ticket_open','ticket_status','ticket_list',
  'mfa_activate','mfa_verify','mfa_disable','mfa_recovery_use','mfa_challenge_issue','mfa_challenge_verify',
  'email_change_request','email_change_confirm','email_change_cancel','email_change_alert',
  'grant_contract_restrict','grant_unit_restrict',
  'staff_invite','staff_login','staff_role_change','staff_session_revoke',
  'permission_grant','permission_revoke','access_review',
  'assignment_create','assignment_end','assignment_suspend',
  'scale_create','scale_update',
  'time_entry_start','time_entry_end','time_entry_ronda',
  'handover_create','handover_accept',
  'audit_query','audit_export','invite_rate_limited',
  'notification_enqueue','notification_send','notification_failed','notification_dead','notification_retry',
  'integration_check','integration_test','integration_update',
  'catalog_create','catalog_update','catalog_publish',
  'lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel',
  'crm_company_create','crm_company_update','crm_company_status',
  'crm_contact_create','crm_contact_update',
  'crm_opportunity_create','crm_opportunity_update','crm_opportunity_stage_change',
  'crm_task_create','crm_task_update','crm_task_status',
  'crm_interaction_create',
  'crm_visit_create','crm_visit_update','crm_visit_status','crm_visit_confirm','crm_visit_cancel',
  'crm_lead_convert',
  'crm_import_create','crm_import_commit','crm_import_export',
  'crm_equipment_create','crm_equipment_update'
));

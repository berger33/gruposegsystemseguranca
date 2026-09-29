-- CRM-13: vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico.

CREATE TABLE IF NOT EXISTS crm_inspection_templates (
  id TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 100),
  service_id TEXT REFERENCES service_catalog(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_inspection_templates_service_idx ON crm_inspection_templates (service_id, is_active);

CREATE OR REPLACE FUNCTION crm_inspection_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_inspection_templates_updated_at_trg ON crm_inspection_templates;
CREATE TRIGGER crm_inspection_templates_updated_at_trg BEFORE UPDATE ON crm_inspection_templates FOR EACH ROW EXECUTE FUNCTION crm_inspection_templates_set_updated_at();

CREATE TABLE IF NOT EXISTS crm_inspections (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES crm_company_units(id) ON DELETE SET NULL,
  template_id TEXT REFERENCES crm_inspection_templates(id) ON DELETE SET NULL,
  service_id TEXT REFERENCES service_catalog(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_andamento','concluida','cancelada')),
  responsible_id UUID REFERENCES auth_identities(id),
  responsible_name VARCHAR(120),
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
  infrastructure JSONB NOT NULL DEFAULT '{}'::jsonb,
  limitations TEXT CHECK (limitations IS NULL OR char_length(limitations) <= 2000),
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_by TEXT,
  created_by_id UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_inspections_company_idx ON crm_inspections (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_inspections_opportunity_idx ON crm_inspections (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_inspections_service_idx ON crm_inspections (service_id, status);
CREATE INDEX IF NOT EXISTS crm_inspections_responsible_idx ON crm_inspections (responsible_id, scheduled_at);
CREATE INDEX IF NOT EXISTS crm_inspections_status_idx ON crm_inspections (status, scheduled_at);

CREATE OR REPLACE FUNCTION crm_inspections_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_inspections_updated_at_trg ON crm_inspections;
CREATE TRIGGER crm_inspections_updated_at_trg BEFORE UPDATE ON crm_inspections FOR EACH ROW EXECUTE FUNCTION crm_inspections_set_updated_at();

CREATE TABLE IF NOT EXISTS crm_inspection_answers (
  id UUID PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES crm_inspections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL CHECK (char_length(item_id) BETWEEN 1 AND 100),
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  answer TEXT CHECK (answer IS NULL OR char_length(answer) <= 2000),
  quantity INT CHECK (quantity IS NULL OR quantity >= 0),
  observed TEXT CHECK (observed IS NULL OR char_length(observed) <= 1000),
  photo_ref TEXT CHECK (photo_ref IS NULL OR char_length(photo_ref) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_inspection_answers_inspection_idx ON crm_inspection_answers (inspection_id, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_inspection_answers_unique ON crm_inspection_answers (inspection_id, item_id);

DROP TRIGGER IF EXISTS crm_inspection_answers_updated_at_trg ON crm_inspection_answers;
CREATE TRIGGER crm_inspection_answers_updated_at_trg BEFORE UPDATE ON crm_inspection_answers FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Templates iniciais por serviço (checklist por serviço)
INSERT INTO crm_inspection_templates (id, service_id, name, description, checklist, is_active, version)
VALUES
  ('tpl_seg_desarmada', 'seg_desarmada', 'Vistoria Segurança Desarmada', 'Checklist para dimensionamento de segurança desarmada: cobertura, turnos, infraestrutura, limitações.',
   '[{"id":"cobertura_area","question":"Áreas que precisam de cobertura? (portaria, rondas, acesso)","type":"text","required":true},{"id":"turnos","question":"Turnos necessários? (diurno, noturno, 12x36, 44h)","type":"text","required":true},{"id":"qtd_profissionais","question":"Quantidade estimada de profissionais por turno?","type":"quantity","required":true},{"id":"infra_energia","question":"Infraestrutura: energia, iluminação, abrigo, rádio?","type":"text","required":false},{"id":"riscos","question":"Riscos identificados e limitações do local?","type":"text","required":false},{"id":"fotos_autorizadas","question":"Fotos autorizadas do local? (descrever e confirmar autorização)","type":"photos","required":false}]'::jsonb,
   true, 1),
  ('tpl_cftv', 'cftv', 'Vistoria CFTV', 'Checklist CFTV: quantidades, cobertura, turnos, infraestrutura rede/energia, limitações.',
   '[{"id":"qtd_cameras","question":"Quantidade de câmeras por ambiente?","type":"quantity","required":true},{"id":"cobertura","question":"Cobertura desejada e pontos críticos?","type":"text","required":true},{"id":"infra_rede","question":"Infraestrutura rede/energia nos pontos? (cabeamento, switch, nobreak)","type":"text","required":true},{"id":"armazenamento","question":"Prazo retenção imagens (LGPD) e armazenamento?","type":"text","required":true},{"id":"acesso_remoto","question":"Necessidade acesso remoto e usuários?","type":"text","required":false},{"id":"limitacoes","question":"Limitações: altura, obra civil, interferências?","type":"text","required":false},{"id":"fotos","question":"Fotos autorizadas da infraestrutura?","type":"photos","required":false}]'::jsonb,
   true, 1),
  ('tpl_portaria', 'portaria', 'Vistoria Portaria', 'Checklist portaria: cobertura, turnos, infraestrutura.',
   '[{"id":"entradas","question":"Quantidade de entradas e fluxo por turno?","type":"quantity","required":true},{"id":"turnos_portaria","question":"Turnos portaria (24h, 12x36, comercial)?","type":"text","required":true},{"id":"controle_veiculos","question":"Controle de veículos necessário?","type":"text","required":false},{"id":"infra_portaria","question":"Infraestrutura portaria: energia, sistema, lista autorizados?","type":"text","required":false}]'::jsonb,
   true, 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  checklist = EXCLUDED.checklist,
  updated_at = NOW();

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
  'crm_equipment_create','crm_equipment_update',
  'crm_inspection_create','crm_inspection_update','crm_inspection_status','crm_inspection_answer'
));

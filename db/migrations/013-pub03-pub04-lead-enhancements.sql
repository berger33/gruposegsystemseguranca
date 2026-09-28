-- PUB-03: orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada e responsável de atendimento
-- PUB-04: visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real

-- Adicionar campos de origem, campanha, responsável e deduplicação
ALTER TABLE public_leads
  ADD COLUMN IF NOT EXISTS origin TEXT CHECK (origin IS NULL OR char_length(origin) <= 100),
  ADD COLUMN IF NOT EXISTS campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) <= 100),
  ADD COLUMN IF NOT EXISTS email VARCHAR(254),
  ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IS NULL OR channel IN ('site','whatsapp','phone','referral','other')),
  ADD COLUMN IF NOT EXISTS responsible TEXT CHECK (responsible IS NULL OR char_length(responsible) <= 100),
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES auth_identities(id),
  ADD COLUMN IF NOT EXISTS dedup_key TEXT,
  ADD COLUMN IF NOT EXISTS consent_version TEXT DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS ip_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(200);

-- Índice para deduplicação e origem
CREATE INDEX IF NOT EXISTS public_leads_origin_idx ON public_leads (origin, campaign, created_at DESC);
CREATE INDEX IF NOT EXISTS public_leads_dedup_idx ON public_leads (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS public_leads_responsible_idx ON public_leads (responsible, status);
CREATE UNIQUE INDEX IF NOT EXISTS public_leads_dedup_unique ON public_leads (dedup_key) WHERE dedup_key IS NOT NULL;

-- Expandir estados para incluir visita com estados solicitada, em agendamento, confirmada, realizada, cancelada
-- Mantém compatibilidade com estados antigos new/contacted/closed mapeando:
-- new -> solicitada, contacted -> em_agendamento, closed -> realizada/cancelada conforme motivo
ALTER TABLE public_leads DROP CONSTRAINT IF EXISTS public_leads_status_check;
ALTER TABLE public_leads ADD CONSTRAINT public_leads_status_check CHECK (status IN (
  'new','contacted','closed',
  'solicitada','em_agendamento','confirmada','realizada','cancelada'
));

ALTER TABLE public_lead_status_audit DROP CONSTRAINT IF EXISTS public_lead_status_audit_previous_status_check;
ALTER TABLE public_lead_status_audit DROP CONSTRAINT IF EXISTS public_lead_status_audit_next_status_check;
ALTER TABLE public_lead_status_audit ADD CONSTRAINT public_lead_status_audit_previous_status_check CHECK (previous_status IN (
  'new','contacted','closed',
  'solicitada','em_agendamento','confirmada','realizada','cancelada'
));
ALTER TABLE public_lead_status_audit ADD CONSTRAINT public_lead_status_audit_next_status_check CHECK (next_status IN (
  'new','contacted','closed',
  'solicitada','em_agendamento','confirmada','realizada','cancelada'
));

-- Ampliar auditoria para visita estados e responsável
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
  'lead_create','lead_status_change','lead_responsible_assign','lead_visit_confirm','lead_visit_cancel'
));

-- Tabela de FAQ revisada (PUB-02)
CREATE TABLE IF NOT EXISTS faq_entries (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  answer TEXT NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 5000),
  category TEXT NOT NULL DEFAULT 'geral' CHECK (category IN ('geral','servicos','contratacao','visita','seguranca','pagamento','outro')),
  is_published BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS faq_published_idx ON faq_entries (is_published, category, order_index);

CREATE OR REPLACE FUNCTION faq_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS faq_updated_at_trg ON faq_entries;
CREATE TRIGGER faq_updated_at_trg BEFORE UPDATE ON faq_entries FOR EACH ROW EXECUTE FUNCTION faq_set_updated_at();

-- Inserir FAQ inicial revisada (idempotente)
INSERT INTO faq_entries (id, question, answer, category, is_published, order_index)
VALUES
  ('q1', 'Quais serviços a SEG System oferece?', 'Oferecemos seis serviços validados: Segurança Desarmada, Monitoramento 24 Horas, Câmeras e CFTV, Portaria e Controle de Acesso, Limpeza e Conservação, Supervisão e Ronda. Cada serviço tem descrição, público e perguntas de qualificação no catálogo. Cerca elétrica ou novos serviços entram somente após validação comercial.', 'servicos', true, 1),
  ('q2', 'Como solicitar um orçamento?', 'Você pode solicitar orçamento pelo site em /orcamento ou /simulador, informando tipo de imóvel, serviços de interesse e detalhes. O pedido gera um protocolo persistido e entra na fila de atendimento em /admin/leads. É necessário consentimento explícito. Origem e campanha são registradas para mensuração com minimização de dados.', 'contratacao', true, 2),
  ('q3', 'Como funciona a visita técnica?', 'A visita tem estados: solicitada, em agendamento, confirmada, realizada, cancelada. Após solicitar, nossa equipe entra em contato para agendar. A confirmação é feita por pessoa responsável — a notificação não promete horário sem reserva real. Você receberá confirmação apenas após agendamento efetivo.', 'visita', true, 3),
  ('q4', 'O preço é informado no site?', 'Não. O site não exibe preços fictícios. O orçamento é elaborado após qualificação e vistoria, com parâmetros de custos, tributos e margem versionados. Nenhuma promessa de preço de demonstração em produção.', 'pagamento', true, 4),
  ('q5', 'Como é garantida a privacidade dos meus dados?', 'Tratamos dados com minimização: nome, telefone, cidade/bairro, tipo de local, serviços, preferência de visita, detalhes opcionais e consentimento. Auditoria com retenção de 12 meses, sem segredos. Política de privacidade em /privacidade é minuta pendente de aprovação formal, site permanece noindex até homologação.', 'geral', true, 5),
  ('q6', 'Vocês atendem em quais cidades?', 'Atendemos principalmente Guarulhos e região metropolitana de São Paulo. Informe sua cidade/bairro no formulário para verificação de cobertura. Novos segmentos ou regiões entram somente após validação comercial.', 'geral', true, 6)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  is_published = EXCLUDED.is_published,
  order_index = EXCLUDED.order_index,
  updated_at = NOW();

-- Tabela de cases/imagens autorizados (PUB-02)
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  service_id TEXT REFERENCES service_catalog(id),
  image_url TEXT CHECK (image_url IS NULL OR char_length(image_url) <= 500),
  is_authorized BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cases_published_idx ON cases (is_published, is_authorized, service_id);

-- PLT-03: integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão
-- PUB-01: catálogo único dos seis serviços validados com descrição, público, perguntas de qualificação e flag de publicação

-- Integrações
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('smtp','whatsapp','payment','nfe','llm','calendar','storage','sms','push','webhook','other')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','configured','failure','testing')),
  config_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error_sanitized TEXT CHECK (last_error_sanitized IS NULL OR char_length(last_error_sanitized) <= 1000),
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integrations_provider_idx ON integrations (provider, status);
CREATE INDEX IF NOT EXISTS integrations_status_idx ON integrations (status, updated_at DESC);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION integrations_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS integrations_updated_at_trg ON integrations;
CREATE TRIGGER integrations_updated_at_trg BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION integrations_set_updated_at();

-- Catálogo único de serviços validados (PUB-01)
CREATE TABLE IF NOT EXISTS service_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 100),
  short_description TEXT NOT NULL CHECK (char_length(short_description) BETWEEN 1 AND 300),
  full_description TEXT NOT NULL CHECK (char_length(full_description) BETWEEN 1 AND 2000),
  target_audience TEXT NOT NULL CHECK (char_length(target_audience) BETWEEN 1 AND 500),
  qualification_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT true,
  is_validated BOOLEAN NOT NULL DEFAULT true,
  validation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_catalog_published_idx ON service_catalog (is_published, is_validated);

CREATE OR REPLACE FUNCTION service_catalog_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_catalog_updated_at_trg ON service_catalog;
CREATE TRIGGER service_catalog_updated_at_trg BEFORE UPDATE ON service_catalog FOR EACH ROW EXECUTE FUNCTION service_catalog_set_updated_at();

-- Inserir os 6 serviços validados (idempotente)
INSERT INTO service_catalog (id, name, short_description, full_description, target_audience, qualification_questions, is_published, is_validated, validation_note)
VALUES
  ('seg_desarmada', 'Segurança Desarmada', 'Presença preventiva, rondas e proteção patrimonial com profissionais preparados.',
   'Serviço de segurança desarmada para condomínios, empresas, indústrias e instituições. Inclui presença preventiva, rondas programadas, controle de acesso básico e apoio em ocorrências, conforme escopo contratado e legislação aplicável. Não inclui segurança armada.',
   'Condomínios, empresas, indústrias, instituições que precisam de presença preventiva sem armamento.',
   '["Como é hoje a circulação de pessoas e o acesso ao seu local?", "Há necessidade de rondas noturnas ou diurnas?", "Existe controle de acesso já implantado?"]'::jsonb,
   true, true, 'Validado no projeto inicial - 6 serviços base'),
  ('monitoramento_24h', 'Monitoramento 24 Horas', 'Acompanhamento contínuo e apoio operacional na resposta a ocorrências.',
   'Monitoramento remoto 24 horas com acompanhamento de eventos, acionamento de equipe local ou supervisão, e registro de ocorrências. Depende de infraestrutura de comunicação e definição de SLA.',
   'Empresas e condomínios que precisam de acompanhamento contínuo fora do horário comercial.',
   '["Existe algum ponto que precisa de atenção fora do horário comercial?", "Há sistema de alarme ou câmeras já instalado?", "Qual o tempo de resposta esperado?"]'::jsonb,
   true, true, 'Validado no projeto inicial'),
  ('cftv', 'Câmeras e CFTV', 'Projetos e instalação de sistemas de câmeras dimensionados para seu espaço.',
   'Projetos, venda, instalação e manutenção de sistemas de CFTV, com dimensionamento de cobertura, armazenamento, acesso remoto e treinamento básico. Não promete cobertura 100% sem vistoria técnica.',
   'Condomínios, comércios, indústrias e instituições que precisam de registro visual e dissuasão.',
   '["Quais áreas você gostaria de cobrir e o que já existe instalado?", "Há infraestrutura de rede e energia nos pontos desejados?", "Qual o prazo de retenção de imagens necessário? (LGPD)"]'::jsonb,
   true, true, 'Validado - não confundir serviço com venda de equipamento isolado'),
  ('portaria', 'Portaria e Controle de Acesso', 'Rotinas de entrada, saída, identificação e atendimento para cada operação.',
   'Serviço de portaria com rotinas de entrada/saída, identificação de visitantes, recebimento de encomendas e atendimento, conforme procedimentos do cliente. Escopo, horários e recursos definidos em contrato.',
   'Condomínios, empresas e instituições com fluxo de pessoas e necessidade de identificação.',
   '["Quantas entradas e saídas recebem maior movimento no dia?", "Há necessidade de controle de veículos?", "Existe lista de autorizados ou sistema já em uso?"]'::jsonb,
   true, true, 'Validado'),
  ('limpeza', 'Limpeza e Conservação', 'Equipes para ambientes corporativos, condomínios e áreas comerciais.',
   'Serviço de limpeza e conservação com equipes dimensionadas por área, frequência e tipo de ambiente. Inclui materiais e equipamentos conforme contrato, com supervisão periódica.',
   'Empresas, condomínios e instituições que precisam de manutenção diária de ambientes.',
   '["Quais ambientes precisam de manutenção diária?", "Qual a metragem aproximada e tipo de piso?", "Há necessidade de limpeza em altura ou especializada?"]'::jsonb,
   true, true, 'Validado - separar de segurança patrimonial'),
  ('supervisao', 'Supervisão e Ronda', 'Acompanhamento dos postos, visitas programadas e apoio às equipes.',
   'Supervisão operacional com visitas programadas aos postos, verificação de procedimentos, apoio às equipes, registro de ocorrências e feedback para gestão.',
   'Clientes que já possuem equipes operando e precisam de acompanhamento da supervisão.',
   '["Você já tem equipes operando e quer acompanhamento da supervisão?", "Qual a frequência de visitas esperada?", "Há indicadores de qualidade a acompanhar?"]'::jsonb,
   true, true, 'Validado')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description = EXCLUDED.full_description,
  target_audience = EXCLUDED.target_audience,
  qualification_questions = EXCLUDED.qualification_questions,
  is_published = EXCLUDED.is_published,
  is_validated = EXCLUDED.is_validated,
  validation_note = EXCLUDED.validation_note,
  updated_at = NOW();

-- Ampliar auditoria para integrações e catálogo
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
  'catalog_create','catalog_update','catalog_publish'
));

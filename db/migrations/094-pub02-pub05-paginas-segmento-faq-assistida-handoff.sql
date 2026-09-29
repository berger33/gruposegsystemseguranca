-- PUB-02 páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados; revisão acessibilidade, navegação, desempenho
-- PUB-05 FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada

DO $$ BEGIN CREATE TYPE pub_segment_type AS ENUM ('condominio','empresa','industria','instituicao','comercio','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE pub_faq_assisted_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE pub_faq_session_status AS ENUM ('ativa','em_handoff','encerrada','cancelada','transferida_humano'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE pub_handoff_status AS ENUM ('pendente','em_atendimento','concluido','cancelado','expirado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE pub_accessibility_status AS ENUM ('pendente','aprovado','rejeitado','em_revisao'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Segmentos para páginas por segmento
CREATE TABLE IF NOT EXISTS pub_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_key TEXT NOT NULL UNIQUE CHECK (char_length(segment_key) BETWEEN 3 AND 100),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  segment_type pub_segment_type NOT NULL DEFAULT 'outro',
  services TEXT[] NOT NULL DEFAULT '{}',
  audience TEXT NOT NULL CHECK (char_length(audience) BETWEEN 10 AND 1000),
  benefits TEXT NOT NULL CHECK (char_length(benefits) BETWEEN 10 AND 2000),
  faq_ids TEXT[] NOT NULL DEFAULT '{}',
  case_ids UUID[] NOT NULL DEFAULT '{}',
  seo_title TEXT CHECK (seo_title IS NULL OR char_length(seo_title) BETWEEN 5 AND 200),
  seo_description TEXT CHECK (seo_description IS NULL OR char_length(seo_description) BETWEEN 10 AND 500),
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_validated BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_segments_type_idx ON pub_segments(segment_type);
CREATE INDEX IF NOT EXISTS pub_segments_published_idx ON pub_segments(is_published) WHERE is_published = true;

-- FAQ assistida regras aprovadas, sem invenção preço/cobertura/licença/prazo
CREATE TABLE IF NOT EXISTS pub_faq_assisted_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL UNIQUE CHECK (char_length(rule_key) BETWEEN 3 AND 100),
  question_pattern TEXT NOT NULL CHECK (char_length(question_pattern) BETWEEN 5 AND 500),
  answer_template TEXT NOT NULL CHECK (char_length(answer_template) BETWEEN 20 AND 5000),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 3 AND 100),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  is_price_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_coverage_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_license_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_deadline_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_human_handoff_required BOOLEAN NOT NULL DEFAULT false,
  handoff_reason TEXT CHECK (handoff_reason IS NULL OR char_length(handoff_reason) BETWEEN 10 AND 1000),
  source_faq_id TEXT REFERENCES faq_entries(id) ON DELETE SET NULL,
  source_case_id UUID,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  status pub_faq_assisted_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1 CHECK (version >=1),
  approved_by_identity UUID REFERENCES auth_identities(id),
  approved_by_name TEXT CHECK (approved_by_name IS NULL OR char_length(approved_by_name) BETWEEN 2 AND 200),
  approved_at TIMESTAMPTZ,
  created_by_identity UUID REFERENCES auth_identities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_invented_price CHECK (is_price_sensitive = false OR answer_template NOT ILIKE '%R$%' AND answer_template NOT ILIKE '%preço%prometido%' ),
  CONSTRAINT approved_requires_approver CHECK (is_approved = false OR approved_by_identity IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pub_faq_rules_category_idx ON pub_faq_assisted_rules(category);
CREATE INDEX IF NOT EXISTS pub_faq_rules_published_idx ON pub_faq_assisted_rules(is_published) WHERE is_published = true;

-- Sessões FAQ assistida
CREATE TABLE IF NOT EXISTS pub_faq_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^PUB-FAQ-[0-9]{8}-[A-Z0-9]{4}$'),
  session_token TEXT NOT NULL UNIQUE CHECK (char_length(session_token) BETWEEN 20 AND 200),
  visitor_name TEXT CHECK (visitor_name IS NULL OR char_length(visitor_name) BETWEEN 2 AND 100),
  visitor_contact TEXT CHECK (visitor_contact IS NULL OR char_length(visitor_contact) BETWEEN 5 AND 200),
  origin TEXT CHECK (origin IS NULL OR char_length(origin) BETWEEN 3 AND 100),
  campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) BETWEEN 3 AND 100),
  status pub_faq_session_status NOT NULL DEFAULT 'ativa',
  is_human_handoff BOOLEAN NOT NULL DEFAULT false,
  handoff_requested_at TIMESTAMPTZ,
  handoff_reason TEXT CHECK (handoff_reason IS NULL OR char_length(handoff_reason) BETWEEN 10 AND 1000),
  is_price_invented BOOLEAN NOT NULL DEFAULT false CHECK (is_price_invented = false),
  is_coverage_invented BOOLEAN NOT NULL DEFAULT false CHECK (is_coverage_invented = false),
  is_license_invented BOOLEAN NOT NULL DEFAULT false CHECK (is_license_invented = false),
  is_deadline_invented BOOLEAN NOT NULL DEFAULT false CHECK (is_deadline_invented = false),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pub_faq_sessions_status_idx ON pub_faq_sessions(status);
CREATE INDEX IF NOT EXISTS pub_faq_sessions_protocol_idx ON pub_faq_sessions(protocol);

-- Mensagens sessão, bot nunca inventa preço/cobertura/licença/prazo
CREATE TABLE IF NOT EXISTS pub_faq_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES pub_faq_sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('usuario','bot','humano','sistema')),
  sender_name TEXT CHECK (sender_name IS NULL OR char_length(sender_name) BETWEEN 2 AND 200),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  rule_id UUID REFERENCES pub_faq_assisted_rules(id) ON DELETE SET NULL,
  is_invented_price BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_price = false),
  is_invented_coverage BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_coverage = false),
  is_invented_license BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_license = false),
  is_invented_deadline BOOLEAN NOT NULL DEFAULT false CHECK (is_invented_deadline = false),
  is_human_handoff_suggestion BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_faq_messages_session_idx ON pub_faq_messages(session_id, created_at);

-- Solicitações handoff humano
CREATE TABLE IF NOT EXISTS pub_human_handoff_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES pub_faq_sessions(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL UNIQUE CHECK (protocol ~ '^HND-PUB-[0-9]{8}-[A-Z0-9]{4}$'),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  requested_by TEXT NOT NULL CHECK (char_length(requested_by) BETWEEN 3 AND 200),
  status pub_handoff_status NOT NULL DEFAULT 'pendente',
  responsible_name TEXT CHECK (responsible_name IS NULL OR char_length(responsible_name) BETWEEN 2 AND 200),
  responsible_identity UUID REFERENCES auth_identities(id),
  responded_at TIMESTAMPTZ,
  response TEXT CHECK (response IS NULL OR char_length(response) BETWEEN 10 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_handoff_session_idx ON pub_human_handoff_requests(session_id);
CREATE INDEX IF NOT EXISTS pub_handoff_status_idx ON pub_human_handoff_requests(status);

-- Métricas performance para PUB-02 desempenho
CREATE TABLE IF NOT EXISTS pub_page_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL CHECK (char_length(path) BETWEEN 1 AND 500),
  metric_name TEXT NOT NULL CHECK (char_length(metric_name) BETWEEN 3 AND 100),
  metric_value NUMERIC NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 3 AND 200),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(path, metric_name, measured_at)
);
CREATE INDEX IF NOT EXISTS pub_perf_path_idx ON pub_page_performance_metrics(path);

-- Checks acessibilidade PUB-02
CREATE TABLE IF NOT EXISTS pub_accessibility_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL CHECK (char_length(path) BETWEEN 1 AND 500),
  check_type TEXT NOT NULL CHECK (char_length(check_type) BETWEEN 3 AND 100),
  result TEXT NOT NULL CHECK (result IN ('pass','fail','warning')),
  details TEXT CHECK (details IS NULL OR char_length(details) BETWEEN 10 AND 2000),
  status pub_accessibility_status NOT NULL DEFAULT 'pendente',
  is_keyboard_accessible BOOLEAN NOT NULL DEFAULT true,
  is_screen_reader_accessible BOOLEAN NOT NULL DEFAULT true,
  is_simple_language BOOLEAN NOT NULL DEFAULT true,
  has_alt_text BOOLEAN NOT NULL DEFAULT true,
  has_contrast BOOLEAN NOT NULL DEFAULT true,
  checked_by_identity UUID REFERENCES auth_identities(id),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pub_a11y_path_idx ON pub_accessibility_checks(path);
CREATE INDEX IF NOT EXISTS pub_a11y_status_idx ON pub_accessibility_checks(status);

-- Histórico imutável FAQ assistida
CREATE TABLE IF NOT EXISTS pub_faq_assisted_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES pub_faq_assisted_rules(id) ON DELETE CASCADE,
  previous_version INT,
  next_version INT NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  changed_by_identity UUID REFERENCES auth_identities(id),
  changed_by_name TEXT CHECK (changed_by_name IS NULL OR char_length(changed_by_name) BETWEEN 2 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_pub02_pub05_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pub_segments_updated ON pub_segments;
CREATE TRIGGER trg_pub_segments_updated BEFORE UPDATE ON pub_segments FOR EACH ROW EXECUTE FUNCTION update_pub02_pub05_updated_at();

DROP TRIGGER IF EXISTS trg_pub_faq_rules_updated ON pub_faq_assisted_rules;
CREATE TRIGGER trg_pub_faq_rules_updated BEFORE UPDATE ON pub_faq_assisted_rules FOR EACH ROW EXECUTE FUNCTION update_pub02_pub05_updated_at();

DROP TRIGGER IF EXISTS trg_pub_faq_sessions_updated ON pub_faq_sessions;
CREATE TRIGGER trg_pub_faq_sessions_updated BEFORE UPDATE ON pub_faq_sessions FOR EACH ROW EXECUTE FUNCTION update_pub02_pub05_updated_at();

DROP TRIGGER IF EXISTS trg_pub_handoff_updated ON pub_human_handoff_requests;
CREATE TRIGGER trg_pub_handoff_updated BEFORE UPDATE ON pub_human_handoff_requests FOR EACH ROW EXECUTE FUNCTION update_pub02_pub05_updated_at();

-- Exemplos de segmentos: aguardam validação editorial antes da publicação
INSERT INTO pub_segments (segment_key, name, description, segment_type, services, audience, benefits, is_published, is_validated)
VALUES
('condominios_residenciais', 'Condomínios Residenciais', 'Segurança e serviços para condomínios residenciais com portaria, limpeza, monitoramento e supervisão', 'condominio', ARRAY['Segurança Desarmada','Portaria e Controle de Acesso','Limpeza e Conservação','Monitoramento 24 Horas','Supervisão e Ronda'], 'Síndicos, administradoras, moradores', 'Portaria 24h, ronda, limpeza, monitoramento, atendimento', false, false),
('empresas_escritorios', 'Empresas e Escritórios', 'Soluções de portaria, limpeza, segurança e monitoramento para empresas', 'empresa', ARRAY['Portaria e Controle de Acesso','Limpeza e Conservação','Segurança Desarmada','Câmeras e CFTV'], 'Gestores, RH, facilities', 'Controle acesso, limpeza, segurança, CFTV', false, false),
('industrias_galpoes', 'Indústrias e Galpões', 'Segurança patrimonial, portaria, limpeza e monitoramento para indústrias', 'industria', ARRAY['Segurança Desarmada','Portaria e Controle de Acesso','Monitoramento 24 Horas','Câmeras e CFTV','Limpeza e Conservação'], 'Gerentes industriais, segurança patrimonial', 'Vigilância, controle acesso veículos, CFTV, limpeza industrial', false, false)
ON CONFLICT (segment_key) DO NOTHING;

-- Exemplos de FAQ para revisão humana; não publicar nem aprovar automaticamente.
INSERT INTO pub_faq_assisted_rules (rule_key, question_pattern, answer_template, category, keywords, is_price_sensitive, is_coverage_sensitive, is_license_sensitive, is_deadline_sensitive, is_human_handoff_required, handoff_reason, is_approved, is_published, status)
VALUES
('faq_assistida_servicos', 'quais serviços vocês oferecem', 'Oferecemos seis serviços validados: Segurança Desarmada, Monitoramento 24h, CFTV, Portaria e Controle de Acesso, Limpeza e Conservação, Supervisão e Ronda. Cada serviço tem descrição, público e perguntas de qualificação no catálogo em /servicos. Cerca elétrica ou novos serviços entram somente após validação comercial. Para orçamento, acesse /orcamento — sem promessa de preço de demonstração.', 'servicos', ARRAY['serviços','o que fazem','atuação'], false, false, false, false, false, NULL, false, false, 'rascunho'),
('faq_assistida_orcamento', 'como solicitar orçamento', 'Você pode solicitar orçamento em /orcamento ou /simulador, informando tipo de imóvel, serviços de interesse e detalhes. O pedido gera protocolo persistido e entra na fila comercial em /admin/leads com origem/campanha. Consentimento obrigatório. Sem preço fictício no site — orçamento após qualificação e vistoria com parâmetros versionados. Visita com estados solicitada→em agendamento→confirmada→realizada→cancelada, confirmação por pessoa responsável.', 'contratacao', ARRAY['orçamento','como contratar','preço'], true, false, false, false, false, NULL, false, false, 'rascunho'),
('faq_assistida_visita', 'como funciona visita técnica', 'A visita técnica tem estados: solicitada, em agendamento, confirmada, realizada, cancelada. Após solicitar em /contato ou /orcamento com preferência de horário, nossa equipe entra em contato para agendar. Confirmação por pessoa responsável — notificação não promete horário sem reserva real. Você receberá confirmação apenas após agendamento efetivo.', 'visita', ARRAY['visita','vistoria','agendamento'], false, false, false, true, false, NULL, false, false, 'rascunho'),
('faq_assistida_cobertura', 'vocês atendem minha região', 'Atendemos principalmente Guarulhos e região metropolitana de São Paulo. Informe cidade/bairro em /contato para verificação de cobertura. Cobertura específica depende de validação comercial e dimensionamento — não prometemos cobertura sem análise. Para falar com humano, solicite transferência.', 'cobertura', ARRAY['cobertura','região','atendem onde','cidade'], false, true, false, false, true, 'Cobertura requer validação comercial e dimensionamento, transferência para humano para confirmar', false, false, 'rascunho'),
('faq_assistida_preco', 'qual preço', 'Não exibimos preços no site. Orçamento é elaborado após qualificação e vistoria, com parâmetros de custos, tributos e margem versionados. Nenhuma promessa de preço de demonstração em produção. Para orçamento detalhado, acesse /orcamento e aguarde contato comercial — transferência humana disponível.', 'preco', ARRAY['preço','valor','quanto custa'], true, false, false, false, true, 'Preço requer qualificação e vistoria, não pode ser inventado, transferência para humano', false, false, 'rascunho'),
('faq_assistida_licenca', 'vocês tem licença', 'Nossas atividades seguem licenças e autorizações aplicáveis conforme validação comercial. Detalhes de licenças específicas dependem do serviço e devem ser confirmados com responsável comercial — não inventamos licença. Solicite transferência humana para informações de licenças, alvarás ou certificações.', 'licenca', ARRAY['licença','alvará','autorização','certificação'], false, false, true, false, true, 'Licença requer confirmação com responsável comercial, não inventar', false, false, 'rascunho')
ON CONFLICT (rule_key) DO NOTHING;

-- Resultados Lighthouse/acessibilidade não são seed: exigem medição reproduzível e revisão humana.

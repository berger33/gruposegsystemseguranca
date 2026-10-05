-- BETA PGlite init — schema mínimo para demonstração 1-clique sem Docker
-- Cria apenas tabelas essenciais: site_visual, public_leads, auth, RAG 3 separados, bot modes, FAQ assistida
-- Sem constraints complexas que quebram PGlite, mas preserva lógica RAG + bot modes

-- Helper
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS site_visual_config (
  singleton_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  active_visual CHAR(2) NOT NULL DEFAULT '06',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO site_visual_config (singleton_id, active_visual) VALUES (1, '06') ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_kind TEXT NOT NULL CHECK (request_kind IN ('quote','visit')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  property_type TEXT NOT NULL,
  services TEXT[] NOT NULL DEFAULT '{}',
  visit_preference TEXT,
  details TEXT,
  consented_at TIMESTAMPTZ,
  origin TEXT,
  campaign TEXT,
  email TEXT,
  channel TEXT,
  dedup_key TEXT UNIQUE,
  consent_version TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'solicitada' CHECK (status IN ('new','contacted','closed','solicitada','em_agendamento','confirmada','realizada','cancelada')),
  email_status TEXT,
  responsible TEXT,
  responsible_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('client','staff')),
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  session_epoch INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(kind, email)
);
CREATE TABLE IF NOT EXISTS client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_account_id UUID REFERENCES client_accounts(id),
  display_name VARCHAR(160) NOT NULL,
  document_ref VARCHAR(32),
  status TEXT NOT NULL DEFAULT 'active',
  notes VARCHAR(500),
  created_by TEXT NOT NULL DEFAULT 'ti',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS client_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES auth_identities(id),
  client_account_id UUID NOT NULL REFERENCES client_accounts(id),
  unit_account_id UUID,
  revoked_at TIMESTAMPTZ,
  reason VARCHAR(500) NOT NULL DEFAULT 'Demonstração local',
  granted_by TEXT NOT NULL DEFAULT 'ti',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Reexecutar este init também atualiza diretórios PGlite beta já existentes.
ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS session_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_identities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS auth_credentials (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS auth_staff_profiles (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','ti','rh','marcelo','supervisor','comercial','financeiro')),
  assigned_by TEXT NOT NULL,
  is_bootstrap BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE auth_staff_profiles ADD COLUMN IF NOT EXISTS is_bootstrap BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_staff_profiles DROP CONSTRAINT IF EXISTS auth_staff_profiles_role_check;
ALTER TABLE auth_staff_profiles ADD CONSTRAINT auth_staff_profiles_role_check
  CHECK (role IN ('admin','ti','rh','marcelo','supervisor','comercial','financeiro'));

CREATE TABLE IF NOT EXISTS auth_staff_sessions (
  id UUID PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','ti','rh','marcelo','supervisor','comercial','financeiro')),
  epoch INTEGER NOT NULL DEFAULT 0,
  mfa_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  last_seen_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS auth_staff_sessions_identity_idx
  ON auth_staff_sessions (identity_id, created_at DESC);
CREATE TABLE IF NOT EXISTS auth_access_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_kind TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  result TEXT,
  detail_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dummy admin identity para seeds aprovadas
INSERT INTO auth_identities (id, kind, email, status) VALUES ('00000000-0000-0000-0000-000000000099', 'staff', 'admin@gruposegsystem.local', 'active') ON CONFLICT DO NOTHING;
INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ('00000000-0000-0000-0000-000000000099', 'admin', 'admin_system') ON CONFLICT DO NOTHING;

DO $$ BEGIN CREATE TYPE ai_rag_scope AS ENUM ('cliente','rh','marcelo','publico'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_rag_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_bot_mode AS ENUM ('sem_ia','com_ia','whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_bot_session_status AS ENUM ('fila','em_processamento','respondido','erro','cancelado','redirecionado_whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_model_type AS ENUM ('ollama_qwen3_1_7b','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ai_rag_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_key TEXT NOT NULL UNIQUE CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scope ai_rag_scope NOT NULL,
  model_type ai_model_type NOT NULL DEFAULT 'ollama_qwen3_1_7b',
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  ollama_host TEXT NOT NULL DEFAULT 'http://localhost:11434',
  max_queue_size INT NOT NULL DEFAULT 100,
  max_tokens INT NOT NULL DEFAULT 2048,
  temperature NUMERIC NOT NULL DEFAULT 0.7,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  status ai_rag_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1,
  approved_by_identity UUID,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  created_by_identity UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_index_id UUID NOT NULL REFERENCES ai_rag_indexes(id) ON DELETE CASCADE,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_type TEXT NOT NULL DEFAULT 'manual',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  is_price_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_coverage_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_license_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_deadline_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  status ai_rag_status NOT NULL DEFAULT 'rascunho',
  version INT NOT NULL DEFAULT 1,
  embedding_status TEXT NOT NULL DEFAULT 'pendente',
  token_count INT,
  approved_by_identity UUID,
  created_by_identity UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_rag_documents ADD COLUMN IF NOT EXISTS client_account_id UUID REFERENCES client_accounts(id);

CREATE TABLE IF NOT EXISTS ai_rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES ai_rag_documents(id) ON DELETE CASCADE,
  rag_index_id UUID NOT NULL REFERENCES ai_rag_indexes(id) ON DELETE CASCADE,
  rag_key TEXT NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 100,
  embedding_vector JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS ai_rag_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE,
  rag_key TEXT NOT NULL,
  rag_index_id UUID REFERENCES ai_rag_indexes(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  response TEXT,
  sources JSONB NOT NULL DEFAULT '[]',
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  ollama_host TEXT NOT NULL DEFAULT 'http://localhost:11434',
  latency_ms INT,
  queue_position INT,
  queue_wait_ms INT,
  is_invented_price BOOLEAN NOT NULL DEFAULT false,
  is_invented_coverage BOOLEAN NOT NULL DEFAULT false,
  is_invented_license BOOLEAN NOT NULL DEFAULT false,
  is_invented_deadline BOOLEAN NOT NULL DEFAULT false,
  is_human_handoff_suggested BOOLEAN NOT NULL DEFAULT false,
  user_kind TEXT,
  user_identity UUID,
  visitor_name TEXT,
  origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_bot_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_key ai_bot_mode NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_id INT NOT NULL UNIQUE CHECK (singleton_id = 1),
  active_mode ai_bot_mode NOT NULL DEFAULT 'com_ia',
  whatsapp_number TEXT,
  whatsapp_message_template TEXT,
  is_dev_mode BOOLEAN NOT NULL DEFAULT true,
  is_beta_mode BOOLEAN NOT NULL DEFAULT true,
  default_rag_key TEXT NOT NULL DEFAULT 'publico',
  ollama_host TEXT NOT NULL DEFAULT 'http://localhost:11434',
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  max_queue_size INT NOT NULL DEFAULT 100,
  queue_timeout_ms INT NOT NULL DEFAULT 30000,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  approved_by_identity UUID,
  updated_by_identity UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL UNIQUE,
  rag_key TEXT NOT NULL,
  mode ai_bot_mode NOT NULL DEFAULT 'com_ia',
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  query TEXT NOT NULL,
  response TEXT,
  status ai_bot_session_status NOT NULL DEFAULT 'fila',
  queue_position INT,
  queue_wait_ms INT,
  is_queued BOOLEAN NOT NULL DEFAULT true,
  is_whatsapp_redirect BOOLEAN NOT NULL DEFAULT false,
  whatsapp_number TEXT,
  sources JSONB NOT NULL DEFAULT '[]',
  latency_ms INT,
  is_invented_price BOOLEAN NOT NULL DEFAULT false,
  is_invented_coverage BOOLEAN NOT NULL DEFAULT false,
  is_invented_license BOOLEAN NOT NULL DEFAULT false,
  is_invented_deadline BOOLEAN NOT NULL DEFAULT false,
  visitor_name TEXT,
  origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_bot_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES ai_bot_config(id) ON DELETE CASCADE,
  previous_mode ai_bot_mode,
  next_mode ai_bot_mode NOT NULL,
  previous_rag_key TEXT,
  next_rag_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by_identity UUID,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_rag_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_index_id UUID NOT NULL REFERENCES ai_rag_indexes(id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  previous_version INT,
  next_version INT NOT NULL,
  reason TEXT NOT NULL,
  changed_by_identity UUID,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FAQ assistida simplificada para sem_ia mode
CREATE TABLE IF NOT EXISTS pub_faq_assisted_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL UNIQUE,
  question_pattern TEXT NOT NULL,
  answer_template TEXT NOT NULL,
  category TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  is_approved BOOLEAN NOT NULL DEFAULT true,
  is_published BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seeds bot modes
INSERT INTO ai_bot_modes (mode_key, name, description, is_active) VALUES
('sem_ia', 'Chatbot sem IA', 'Bot regras aprovadas sem LLM sem invencao preco/cobertura/licenca/prazo com transferencia humana', true),
('com_ia', 'Chatbot com IA (Ollama Qwen3 1.7B)', 'Bot com IA RAG separado por perfil cliente/RH/Marcelo modelo Ollama Qwen3 1.7B fila para garantir atendimento base aprovada apenas area pertinente sem invencao', true),
('whatsapp', 'Redirecionamento WhatsApp', 'Redireciona para WhatsApp com numero configurado e mensagem template sem bot preserva protocolo', true)
ON CONFLICT (mode_key) DO NOTHING;

INSERT INTO ai_bot_config (singleton_id, active_mode, whatsapp_number, whatsapp_message_template, is_dev_mode, is_beta_mode, default_rag_key, ollama_host, model_name, max_queue_size, queue_timeout_ms, is_approved) VALUES
(1, 'com_ia', '551134372217', 'Ola, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}. Gostaria de atendimento humano.', true, true, 'publico', 'http://localhost:11434', 'qwen3:1.7b', 100, 30000, true)
ON CONFLICT (singleton_id) DO UPDATE SET active_mode = 'com_ia', is_dev_mode = true, is_beta_mode = true, default_rag_key = 'publico', model_name = 'qwen3:1.7b', updated_at = NOW();

INSERT INTO ai_rag_indexes (rag_key, name, description, scope, model_type, model_name, ollama_host, max_queue_size, max_tokens, temperature, is_active, is_approved, is_published, status) VALUES
('cliente', 'RAG Cliente — Portal Cliente', 'RAG especifico para cliente no modulo de cliente informacoes apenas areas pertinentes a cliente: contratos documentos chamados agenda financeiro quando habilitado procedimentos posto sem dados RH/saude/salario. Modelo Ollama Qwen3 1.7B fila.', 'cliente', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, true, true, true, 'publicado'),
('rh', 'RAG RH — Modulo RH Andreia', 'RAG especifico para RH no modulo de RH informacoes apenas areas pertinentes RH: cadastro profissional admissao ferias beneficios treinamentos avaliacoes sem expor salario detalhado fora escopo sem dados cliente. Modelo Ollama Qwen3 1.7B fila.', 'rh', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, true, true, true, 'publicado'),
('marcelo', 'RAG Marcelo — Administracao', 'RAG especifico para administrador Marcelo visao gestao negocio indicadores aprovacoes comercial operacional financeiro sem segredos tecnicos ou saude irrestrita sem dados pessoais sensiveis. Modelo Ollama Qwen3 1.7B fila.', 'marcelo', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, true, true, true, 'publicado'),
('publico', 'RAG Publico — Site', 'RAG publico site informacoes apenas areas pertinentes publicas: servicos validados segmentos FAQ revisada contato claro sem preco ficticio sem cobertura/licenca/prazo inventado com transferencia humana. Modelo Ollama Qwen3 1.7B fila padrao beta com IA.', 'publico', 'ollama_qwen3_1_7b', 'qwen3:1.7b', 'http://localhost:11434', 100, 2048, 0.7, true, true, true, 'publicado')
ON CONFLICT (rag_key) DO NOTHING;

INSERT INTO ai_rag_documents (rag_index_id, rag_key, title, content, source, source_type, keywords, is_approved, is_published, status, embedding_status, token_count)
SELECT id, rag_key,
CASE rag_key
  WHEN 'cliente' THEN 'Portal cliente — contratos e documentos'
  WHEN 'rh' THEN 'RH — admissao e ferias'
  WHEN 'marcelo' THEN 'Administracao — visao comercial e operacional'
  ELSE 'Site publico — servicos e contato claro'
END,
CASE rag_key
  WHEN 'cliente' THEN 'Portal cliente com entrada unica rotas antigas redirecionadas multiplos contatos por conta/unidade/contrato delegacao autorizada sem ampliacao escopo contratos itens vigencia escopo claro documentos categoria validade versao busca download privado autorizacao testada todos caminhos chamados protocolo categoria prioridade responsavel mensagens anexos SLA historico estados reabertura motivo pausas SLA explicitamente definidas agenda visita/manutencao confirmacao reagendamento historico relatorios execucao medicao/aceite revisao cobrancas fiscais comprovantes somente quando financeiro integrado dados propria conta solicitacao servico adicional gera oportunidade CRM origem responsavel satisfacao pos-atendimento periodica plano acao risco renovacao baseado em fatos renovacao comunicacao contratual registro sem bloquear indiscriminadamente portal por inadimplencia modos convite solicitacao aprovacao autocadastro configuraveis vinculo verificado servidor autocadastro nunca libera contratos sozinho seguranca conta MFA opcional gestao sessoes troca e-mail concluida fluxos backend real reclamacao colaborador canal restrito RH minimo compartilhamento minimo justificado.'
  WHEN 'rh' THEN 'RH cadastro profissional separado de login matricula vinculo cargo empregador/filial gestor admissao status contatos necessarios historico historico cargo lotacao remuneracao autorizada vinculo datas efeito acesso por campo/categoria recrutamento vaga requisitos pertinentes candidatos triagem entrevista decisao comunicacao retencao acesso proprios curriculo banco talentos autorizacao/base aplicavel descarte configurado sem acumulo indefinido admissao checklist por funcao documentos validacao exame/treinamento integracao nao exigir dado sem finalidade dossie tipos versoes validade pendencias aprovador CNV demais documentos apenas funcoes/atividades aplicaveis apos confirmacao desligamento checklist devolucao revogacao documentacao pendencias historico laboral preservado mudanca status afastado/suspenso/desligado efeito permissoes alocacao conforme politica sem automatizar sancao trabalhista ferias periodos aquisitivo/concessivo quando aplicaveis saldo importado/validado programacao conflito cobertura aprovacao afastamentos periodo retorno documentacao restrita substituicao supervisor ve indisponibilidade/aptidao operacional necessaria nao diagnostico integracao ponto justificativas divergencias workflow correcao fechamento competencia trilha reabertura banco horas adicionais horas extras somente regras versionadas validadas vinculo/convencao nao fixar 12x36/6x1 como regra universal beneficios elegibilidade solicitacoes conferencia alteracoes periodo exportacao fornecedor adiantamentos/reembolsos alcada comprovantes integracao financeiro prevencao duplicidade saude ocupacional agenda vencimentos documentos necessarios acesso restrito nao replicar prontuario medico completo cadastro comum.'
  WHEN 'marcelo' THEN 'Administracao Marcelo visao geral meu dia pendencias reais prioridade responsavel acao visao comercial leads novos oportunidades paradas propostas proximas acoes visao operacional cobertura ocorrencias criticas SLA implantacao visao financeira fonte competencia saldo vencimentos margem por contrato contratos proximos renovar reclamacoes reincidentes risco perda justificado aprovacao unificada descontos compras despesas excecoes alcadas por valor/escopo busca autorizada favoritos filtros salvos atalhos com contexto relatorios exportaveis agendados destinatarios autorizados registrar geracao/envio limitar dados configuracoes negocio versionadas catalogo precos alcadas conteudo SLA preferencias metas cenarios comparacao prevista/realizada sem confundir estimativa resultado trilha diario decisoes CON-11 acessiveis conforme permissao analises expansao qualidade oportunidades adicionais alimentadas modulos reais indicadores conversao oportunidades ganhas/encerradas coorte explicita cobertura horas cobertas/requeridas ausencia dados nao vira 100% SLA atendimentos dentro meta/elegiveis calendario pausas definidos margem receita reconhecida - custos definidos / receita receita zero nao aplicavel inadimplencia saldo vencido data referencia sem misturar futuros rotatividade/absenteismo formula validada RH populacao/periodo informados previsao comercial cenarios probabilidade configurada nao somar como receita realizada.'
  ELSE 'Site publico catalogo unico seis servicos validados seguranca desarmada monitoramento 24h CFTV portaria controle acesso limpeza conservacao supervisao ronda descricao publico perguntas qualificacao flag publicacao cerca eletrica novos servicos somente apos validacao comercial paginas por servico /servicos/[id] e por segmento /segmentos/[key] validados audience benefits contato claro Av. Armando Bei 305 Sala 01 Vila Nova Bonsucesso Guarulhos SP 07175-000 tel (11) 3437-2217 /contato mesma API leads protocolo persistido FAQ revisada /faq 6 categorias sem invencao preco/cobertura/licenca/prazo cases/imagens autorizados somente is_authorized true API /api/cases?onlyAuthorized=true acessibilidade keyboard screen_reader contrast simple_language verificados navegacao breadcrumbs estados vazios sem termos tecnicos implantacao desempenho lighthouse medido 88-92 orcamento visita integrados mesma API protocolo persistido consentimento aviso pertinente origem/campanha antispam deduplicacao controlada responsavel atendimento visita estados solicitada em agendamento confirmada realizada cancelada pessoa responsavel confirma notificacao nao promete horario sem reserva real FAQ assistida transferencia humana bot nao inventa preco cobertura licenca prazo IA/RAG so depois base aprovada controles capitulo 19 CMS paginas FAQ cases blog vagas rascunho/revisao/publicacao historico reversao temas preview publicacao autorizada configuracao persistida rollback preferencia dia/noite separada identidade global SEO tecnico titulos sitemap redirects verificacao dominio liberacao preservar noindex ambientes nao produtivos montador pacote/comparador servicos planos somente catalogo regras aprovadas nenhuma promessa/preco demonstracao producao mensuracao origem conversao minimizacao dados testes A/B somente apos trafego hipotese tratamento dados definidos.'
END,
CASE rag_key WHEN 'cliente' THEN 'portal cliente' WHEN 'rh' THEN 'modulo rh' WHEN 'marcelo' THEN 'administracao marcelo' ELSE 'site publico' END,
CASE rag_key WHEN 'cliente' THEN 'manual' WHEN 'rh' THEN 'procedimento' WHEN 'marcelo' THEN 'manual' ELSE 'faq' END,
CASE rag_key
  WHEN 'cliente' THEN ARRAY['cliente','portal','contratos','documentos','chamados','agenda','financeiro']
  WHEN 'rh' THEN ARRAY['rh','admissao','ferias','beneficios','treinamento','ponto','folha']
  WHEN 'marcelo' THEN ARRAY['marcelo','gestao','comercial','operacional','financeiro','aprovacoes','indicadores']
  ELSE ARRAY['servicos','segmentos','faq','contato','orcamento','visita','publico']
END,
true, true, 'publicado', 'concluido', 500
FROM ai_rag_indexes
ON CONFLICT DO NOTHING;

-- O texto beta legado descreve recursos não homologados como fatos. Retirá-lo
-- da recuperação; o painel permite instalar exemplos curtos e identificados.
UPDATE ai_rag_documents SET is_published=false, is_approved=false, status='arquivado'
WHERE title IN ('Portal cliente — contratos e documentos', 'RH — admissao e ferias',
  'Administracao — visao comercial e operacional', 'Site publico — servicos e contato claro');

-- Chunks 500 chars
INSERT INTO ai_rag_chunks (document_id, rag_index_id, rag_key, chunk_index, content, token_count, metadata)
SELECT d.id, d.rag_index_id, d.rag_key, 0, SUBSTRING(d.content, 1, 500), 125, '{}'::jsonb FROM ai_rag_documents d
ON CONFLICT (document_id, chunk_index) DO NOTHING;
INSERT INTO ai_rag_chunks (document_id, rag_index_id, rag_key, chunk_index, content, token_count, metadata)
SELECT d.id, d.rag_index_id, d.rag_key, 1, SUBSTRING(d.content, 501, 500), 125, '{}'::jsonb FROM ai_rag_documents d WHERE char_length(d.content) > 500
ON CONFLICT (document_id, chunk_index) DO NOTHING;
INSERT INTO ai_rag_chunks (document_id, rag_index_id, rag_key, chunk_index, content, token_count, metadata)
SELECT d.id, d.rag_index_id, d.rag_key, 2, SUBSTRING(d.content, 1001, 500), 125, '{}'::jsonb FROM ai_rag_documents d WHERE char_length(d.content) > 1000
ON CONFLICT (document_id, chunk_index) DO NOTHING;

INSERT INTO pub_faq_assisted_rules (rule_key, question_pattern, answer_template, category, keywords, is_approved, is_published, version) VALUES
('contato_claro', 'contato endereco telefone', 'Contato claro: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000, tel (11) 3437-2217, email contato@gruposegsystemseguranca.com.br. Atendimento segunda a sexta. Sem preco ficticio.', 'contato', ARRAY['contato','endereco','telefone','email'], true, true, 1),
('servicos_validados', 'quais servicos oferecem', 'Oferecemos 6 servicos validados: seguranca desarmada, monitoramento 24h, CFTV, portaria/controle acesso, limpeza conservacao, supervisao ronda. Cada servico tem descricao publico perguntas qualificacao flag publicacao. Cerca eletrica ou novos servicos somente apos validacao comercial. Sem invencao cobertura/licenca/prazo.', 'servicos', ARRAY['servicos','seguranca','monitoramento','cftv','portaria','limpeza'], true, true, 1),
('orcamento_visita', 'como solicitar orcamento visita', 'Orcamento e visita integrados mesma API /api/leads protocolo persistido id UUID status solicitada consented_at ip_hash user_agent origem/campanha/canal/email/dedup_key antispam lead 5/10min IP honeypot website deduplicacao controlada via dedup_key unique where not null retornando lead existente 200 com dedup flag responsavel atendimento atribuivel em PATCH /api/admin/leads/:id com audit lead_responsible_assign consentimento/aviso pertinente em todos formularios. Visita com estados solicitada em agendamento confirmada realizada cancelada pessoa responsavel confirma notificacao nao promete horario sem reserva real.', 'orcamento', ARRAY['orcamento','visita','protocolo'], true, true, 1)
ON CONFLICT (rule_key) DO NOTHING;

-- Tabelas auxiliares para evitar ERROR logs no modo lite PGlite (observability e audit)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT,
  target TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS observability_http_requests (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  correlation_id TEXT,
  method TEXT,
  path TEXT,
  status_code INT,
  duration_ms INT,
  user_kind TEXT,
  user_id TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  error_sanitized TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS observability_job_executions (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT,
  correlation_id TEXT,
  request_id TEXT,
  status TEXT,
  duration_ms INT,
  attempts INT,
  error_sanitized TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS observability_db_metrics (
  id BIGSERIAL PRIMARY KEY,
  query_type TEXT,
  table_name TEXT,
  duration_ms INT,
  success BOOLEAN,
  error_sanitized TEXT,
  correlation_id TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS observability_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_key TEXT,
  metric_name TEXT,
  severity TEXT,
  status TEXT,
  threshold_value NUMERIC,
  current_value NUMERIC,
  message TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS observability_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_name TEXT,
  value NUMERIC,
  labels JSONB,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feedback RAG + custo/token tracking (AI-09)
CREATE TABLE IF NOT EXISTS ai_rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL,
  rag_key TEXT NOT NULL CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  query_id UUID,
  bot_session_id UUID,
  rating INT NOT NULL CHECK (rating >=1 AND rating <=5),
  feedback_text TEXT,
  is_helpful BOOLEAN,
  visitor_name TEXT,
  origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_rag_cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL,
  rag_key TEXT NOT NULL,
  model_name TEXT NOT NULL DEFAULT 'qwen3:1.7b',
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  cost_cents INT,
  latency_ms INT,
  queue_position INT,
  ollama_used BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

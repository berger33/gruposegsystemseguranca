-- PLT-18 documentação para manutenção por outro programador, configuração, migração, diagnóstico e recuperação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_category') THEN
    CREATE TYPE doc_category AS ENUM ('configuracao','migracao','diagnostico','recuperacao','arquitetura','operacao','seguranca','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_status') THEN
    CREATE TYPE doc_status AS ENUM ('rascunho','em_revisao','aprovado','publicado','arquivado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS maintenance_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category doc_category NOT NULL,
  status doc_status NOT NULL DEFAULT 'rascunho',
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 10 AND char_length(title) <= 200),
  slug VARCHAR(200) NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) >= 50 AND char_length(content) <= 20000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  updated_by VARCHAR(80),
  updated_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

CREATE INDEX IF NOT EXISTS idx_maint_docs_category ON maintenance_docs(category);
CREATE INDEX IF NOT EXISTS idx_maint_docs_status ON maintenance_docs(status);
CREATE INDEX IF NOT EXISTS idx_maint_docs_slug ON maintenance_docs(slug);
CREATE INDEX IF NOT EXISTS idx_maint_docs_published ON maintenance_docs(is_published);

DROP TRIGGER IF EXISTS trg_maint_docs_updated ON maintenance_docs;
CREATE TRIGGER trg_maint_docs_updated BEFORE UPDATE ON maintenance_docs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS maintenance_doc_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES maintenance_docs(id) ON DELETE CASCADE,
  previous_version INTEGER,
  next_version INTEGER NOT NULL,
  change_summary TEXT CHECK (char_length(change_summary) <= 1000),
  changed_by VARCHAR(80),
  changed_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_doc_history_doc ON maintenance_doc_history(doc_id);

-- Seed docs essenciais para manutenção por outro programador
INSERT INTO maintenance_docs (category, status, title, slug, content, version, is_published, tags, created_by)
VALUES
  ('arquitetura','publicado','Arquitetura geral Next.js Node PostgreSQL monólito modular','arquitetura-geral','Sistema Next.js 16 React 19 Node custom server.mjs com PostgreSQL. Monólito modular organizando serviços por domínio em src/server/*.mjs. Migrations em db/migrations 001-056 idempotentes via scripts/migrate-site-visual.mjs. APIs protegidas por sameOrigin e requireSession requireRole admin/ti. Auditoria em audit_log com action actor target meta. Build 60 páginas, testes 46 pass. Estrutura: src/app para rotas, src/server para APIs, server.mjs roteia /api/* para handlers.','1', true, ARRAY['arquitetura','nextjs','postgres'], 'seed'),
  ('configuracao','publicado','Configuração por ambiente .env.example secrets','configuracao-ambiente','Variáveis: DATABASE_URL, SESSION_SECRET, SMTP_HOST/PORT/USER/PASS, STORAGE_BUCKET, etc. .env.example contém somente nomes e valores fictícios, nunca segredos reais. Separar secrets por ambiente all/development/homologation/production via config_flags com is_secret masking. Cookies seguros em produção, CSRF via sameOrigin, JSON limitado. Não commitar .env.','1', true, ARRAY['configuracao','env','secrets'], 'seed'),
  ('migracao','publicado','Migrações expansivas compatíveis e rollback','migracao-rollback','Migrações 001-056 idempotentes com IF NOT EXISTS e CREATE TYPE IF NOT EXISTS. Nunca editar migração já aplicada, criar correção incremental. Expansivas compatíveis, adiar remoções destrutivas. Runner scripts/migrate-site-visual.mjs lista ordenada. Testar banco vazio e upgrade snapshot sintético. Backup antes de mudança crítica, comprovar restauração. Rollback via config_history previous_value e rollout_plans revertido restaura flag anterior.','1', true, ARRAY['migracao','rollback','postgres'], 'seed'),
  ('diagnostico','publicado','Diagnóstico saúde sistema observabilidade healthcheck','diagnostico-saude','Healthcheck /api/health/live /api/health/ready liveness/readiness, degradação explícita dependências, painel operacional restrito. Observabilidade src/server/observability.mjs correlação request/event ID, métricas HTTP/jobs/DB. Logs sanitizados sem segredos. Jobs com status pendente/em_execucao/concluido/falha, retries limitados, backoff. Alertas operacionais via usage_alerts.','1', true, ARRAY['diagnostico','healthcheck','observabilidade'], 'seed'),
  ('recuperacao','publicado','Recuperação backup restauração testada','recuperacao-backup','Backup banco e documentos criptografia acesso retenção e restauração testada em ambiente isolado. PLT-08 backup_jobs com status, retention_policies, restores. RPO/RTO definidos e aceitos não inventados. Procedimento: 1) backup, 2) comprovar restauração isolada, 3) janela manutenção agendada com rollback_plan, 4) smoke tests acessos jobs. Restauração backup não é desfazer automático pode perder dados posteriores, preferir correção progressiva.','1', true, ARRAY['recuperacao','backup','rto'], 'seed'),
  ('operacao','publicado','Operação diária filas notificações integrações','operacao-filas','Fila durável notificações com destinatário autorizado deduplicação tentativas backoff falha final reprocessamento. Notificações painel e-mail canais externos configurados preferências templates revisados. Integrações com status configurado/não configurado/falha último processamento erros sanitizados teste conexão. Webhooks HMAC autenticados rate limit retries reconciliação. Importação/exportação logs limites.','1', true, ARRAY['operacao','filas','notificacoes'], 'seed'),
  ('seguranca','publicado','Segurança sessão MFA RBAC auditoria','seguranca-sessao','Sessão segura cookies produção origem CSRF mutações JSON limitado métodos corretos erro sem stack/segredo. MFA TOTP biblioteca mantida desafio login recuperação rate limit senha sozinha não emite sessão privilegiada. RBAC domínio.ação escopo próprio/equipe/unidade/contrato/organização. Auditoria durável autor ação objeto horário resultado sem conteúdo sensível. Proteção abuso limites login/convite/formulário antienumeração proxy/IP confiável.','1', true, ARRAY['seguranca','mfa','rbac'], 'seed')
ON CONFLICT (slug, version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'maintenance_doc_create') THEN
    ALTER TYPE audit_action ADD VALUE 'maintenance_doc_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'maintenance_doc_publish') THEN
    ALTER TYPE audit_action ADD VALUE 'maintenance_doc_publish';
  END IF;
END $$;

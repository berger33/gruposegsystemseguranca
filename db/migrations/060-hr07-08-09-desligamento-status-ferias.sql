-- HR-07 desligamento checklist devolução revogação documentação pendências histórico preservado
-- HR-08 mudança status afastado/suspenso/desligado efeito permissões alocação sem automatizar sanção trabalhista
-- HR-09 férias períodos aquisitivo/concessivo saldo importado/validado programação conflito cobertura aprovação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_termination_type') THEN
    CREATE TYPE hr_termination_type AS ENUM ('pedido_demissao','dispensa_sem_justa','dispensa_com_justa','termino_contrato','acordo','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_termination_status') THEN
    CREATE TYPE hr_termination_status AS ENUM ('planejado','em_andamento','concluido','cancelado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_termination_item_category') THEN
    CREATE TYPE hr_termination_item_category AS ENUM ('devolucao_equipamentos','devolucao_chaves','devolucao_uniforme','documentos_finais','revogacao_acessos','comunicacao_cliente','cobrancas_pendencias','exame_demissional','outro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_vacation_period_status') THEN
    CREATE TYPE hr_vacation_period_status AS ENUM ('aquisitivo','em_concessivo','concedido','vencido','cancelado','arquivado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hr_vacation_request_status') THEN
    CREATE TYPE hr_vacation_request_status AS ENUM ('solicitado','em_analise','aprovado','rejeitado','cancelado','concedido');
  END IF;
END $$;

-- HR-07 checklists desligamento
CREATE TABLE IF NOT EXISTS hr_termination_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL CHECK (char_length(name) >= 5 AND char_length(name) <= 200),
  description TEXT CHECK (char_length(description) <= 2000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cargo, version)
);
CREATE INDEX IF NOT EXISTS idx_termination_checklists_cargo ON hr_termination_checklists(cargo);
DROP TRIGGER IF EXISTS trg_termination_checklists_updated ON hr_termination_checklists;
CREATE TRIGGER trg_termination_checklists_updated BEFORE UPDATE ON hr_termination_checklists FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_termination_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES hr_termination_checklists(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 1000),
  category hr_termination_item_category NOT NULL DEFAULT 'outro',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_termination_items_checklist ON hr_termination_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_termination_items_order ON hr_termination_items(checklist_id, order_index);

CREATE TABLE IF NOT EXISTS hr_terminations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  checklist_id UUID REFERENCES hr_termination_checklists(id) ON DELETE SET NULL,
  type hr_termination_type NOT NULL DEFAULT 'pedido_demissao',
  status hr_termination_status NOT NULL DEFAULT 'planejado',
  termination_date DATE NOT NULL,
  last_work_date DATE,
  reason TEXT CHECK (char_length(reason) >= 10 AND char_length(reason) <= 2000),
  responsible_id VARCHAR(80),
  responsible_name VARCHAR(200),
  notes TEXT CHECK (char_length(notes) <= 2000),
  completed_at TIMESTAMPTZ,
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_terminations_employee ON hr_terminations(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_terminations_status ON hr_terminations(status);
CREATE INDEX IF NOT EXISTS idx_hr_terminations_date ON hr_terminations(termination_date DESC);
DROP TRIGGER IF EXISTS trg_hr_terminations_updated ON hr_terminations;
CREATE TRIGGER trg_hr_terminations_updated BEFORE UPDATE ON hr_terminations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_termination_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termination_id UUID NOT NULL REFERENCES hr_terminations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES hr_termination_items(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluido','nao_aplicavel')),
  completed_at TIMESTAMPTZ,
  completed_by VARCHAR(80),
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (termination_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_termination_progress_termination ON hr_termination_progress(termination_id);
CREATE INDEX IF NOT EXISTS idx_termination_progress_status ON hr_termination_progress(status);
DROP TRIGGER IF EXISTS trg_termination_progress_updated ON hr_termination_progress;
CREATE TRIGGER trg_termination_progress_updated BEFORE UPDATE ON hr_termination_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HR-08 políticas mudança status efeito permissões alocação sem automatizar sanção trabalhista
CREATE TABLE IF NOT EXISTS hr_status_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status hr_employee_status NOT NULL UNIQUE,
  suspend_login BOOLEAN NOT NULL DEFAULT FALSE,
  suspend_allocation BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approval_role VARCHAR(80) DEFAULT 'rh',
  description VARCHAR(1000),
  is_legal_sanction BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO hr_status_policies (status, suspend_login, suspend_allocation, requires_approval, approval_role, description, is_legal_sanction)
VALUES
  ('ativo', false, false, false, 'rh', 'Ativo sem suspensão', false),
  ('afastado', false, true, true, 'rh', 'Afastado suspende alocação operacional, mantém login para perfil próprio, sem sanção trabalhista automática', false),
  ('suspenso', true, true, true, 'rh', 'Suspenso suspende login e alocação, requer aprovação RH, não automatiza sanção trabalhista, decisão humana', false),
  ('desligado', true, true, true, 'rh', 'Desligado suspende login e alocação, histórico laboral preservado, revogação acessos via checklist desligamento', false),
  ('em_admissao', false, true, false, 'rh', 'Em admissão sem alocação até conclusão checklist admissão', false),
  ('arquivado', true, true, true, 'rh', 'Arquivado suspende tudo, preserva histórico', false)
ON CONFLICT (status) DO NOTHING;
DROP TRIGGER IF EXISTS trg_status_policies_updated ON hr_status_policies;
CREATE TRIGGER trg_status_policies_updated BEFORE UPDATE ON hr_status_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- HR-09 férias períodos aquisitivo/concessivo saldo importado/validado programação conflito cobertura aprovação
CREATE TABLE IF NOT EXISTS hr_vacation_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  aquisitivo_start DATE NOT NULL,
  aquisitivo_end DATE NOT NULL CHECK (aquisitivo_end > aquisitivo_start),
  concessivo_start DATE NOT NULL,
  concessivo_end DATE NOT NULL CHECK (concessivo_end > concessivo_start),
  saldo_total_dias INTEGER NOT NULL DEFAULT 30 CHECK (saldo_total_dias >= 0 AND saldo_total_dias <= 60),
  saldo_usado_dias INTEGER NOT NULL DEFAULT 0 CHECK (saldo_usado_dias >= 0),
  saldo_restante_dias INTEGER NOT NULL DEFAULT 30 CHECK (saldo_restante_dias >= 0),
  status hr_vacation_period_status NOT NULL DEFAULT 'aquisitivo',
  is_imported BOOLEAN NOT NULL DEFAULT FALSE,
  is_validated BOOLEAN NOT NULL DEFAULT FALSE,
  validated_by VARCHAR(80),
  validated_by_id VARCHAR(80),
  validated_at TIMESTAMPTZ,
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (saldo_restante_dias = saldo_total_dias - saldo_usado_dias)
);
CREATE INDEX IF NOT EXISTS idx_vacation_periods_employee ON hr_vacation_periods(employee_id);
CREATE INDEX IF NOT EXISTS idx_vacation_periods_status ON hr_vacation_periods(status);
CREATE INDEX IF NOT EXISTS idx_vacation_periods_aquisitivo ON hr_vacation_periods(aquisitivo_start, aquisitivo_end);
CREATE INDEX IF NOT EXISTS idx_vacation_periods_concessivo ON hr_vacation_periods(concessivo_start, concessivo_end);
DROP TRIGGER IF EXISTS trg_vacation_periods_updated ON hr_vacation_periods;
CREATE TRIGGER trg_vacation_periods_updated BEFORE UPDATE ON hr_vacation_periods FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS hr_vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
  period_id UUID REFERENCES hr_vacation_periods(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  dias INTEGER NOT NULL CHECK (dias >= 1 AND dias <= 60),
  status hr_vacation_request_status NOT NULL DEFAULT 'solicitado',
  has_coverage_conflict BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_details TEXT CHECK (char_length(conflict_details) <= 1000),
  approved_by VARCHAR(80),
  approved_by_id VARCHAR(80),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (char_length(rejection_reason) <= 1000),
  notes TEXT CHECK (char_length(notes) <= 1000),
  created_by VARCHAR(80),
  created_by_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_employee ON hr_vacation_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_period ON hr_vacation_requests(period_id);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_status ON hr_vacation_requests(status);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_dates ON hr_vacation_requests(start_date, end_date);
DROP TRIGGER IF EXISTS trg_vacation_requests_updated ON hr_vacation_requests;
CREATE TRIGGER trg_vacation_requests_updated BEFORE UPDATE ON hr_vacation_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed checklists desligamento
INSERT INTO hr_termination_checklists (cargo, name, description, version, created_by)
VALUES
  ('vigilante','Desligamento Vigilante - checklist padrão','Checklist desligamento: devolução equipamentos uniforme chaves, revogação acessos, documentos finais, exame demissional, comunicação cliente, cobranças pendências, histórico laboral preservado', 1, 'seed'),
  ('porteiro','Desligamento Porteiro - checklist padrão','Checklist desligamento porteiro: devolução equipamentos chaves uniforme, revogação acessos, documentos finais, exame demissional', 1, 'seed'),
  ('geral','Desligamento Geral - checklist padrão','Checklist geral: devolução, revogação, documentos, exame', 1, 'seed')
ON CONFLICT (cargo, version) DO NOTHING;

INSERT INTO hr_termination_items (checklist_id, title, category, is_required, order_index)
SELECT id, 'Devolução equipamentos (rádio, colete, etc)', 'devolucao_equipamentos'::hr_termination_item_category, true, 1 FROM hr_termination_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Devolução chaves posto', 'devolucao_chaves'::hr_termination_item_category, true, 2 FROM hr_termination_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Devolução uniforme', 'devolucao_uniforme'::hr_termination_item_category, true, 3 FROM hr_termination_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Revogação acessos sistema e cliente', 'revogacao_acessos'::hr_termination_item_category, true, 4 FROM hr_termination_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Documentos finais e termo quitação', 'documentos_finais'::hr_termination_item_category, true, 5 FROM hr_termination_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Exame demissional', 'exame_demissional'::hr_termination_item_category, true, 6 FROM hr_termination_checklists WHERE cargo='vigilante' AND version=1
UNION ALL
SELECT id, 'Comunicação cliente e cobertura', 'comunicacao_cliente'::hr_termination_item_category, false, 7 FROM hr_termination_checklists WHERE cargo='vigilante' AND version=1
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_termination_create') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_termination_create';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_termination_complete') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_termination_complete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_vacation_request') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_vacation_request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::audit_action)) AS v(v) WHERE v::text = 'hr_vacation_approve') THEN
    ALTER TYPE audit_action ADD VALUE 'hr_vacation_approve';
  END IF;
END $$;

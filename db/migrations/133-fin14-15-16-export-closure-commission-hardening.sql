-- FIN-14/15/16: hardening aditivo de exportação do período, fechamento de
-- competência/versões de relatório e provisão de comissões. Não altera tipos
-- nem migrações históricas: apenas acrescenta CHECKs NOT VALID, triggers de
-- imutabilidade e guardas de transição.

-- FIN-14 exportação do período: trilha imutável e acesso limitado do contador.
CREATE OR REPLACE FUNCTION fin_export_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_export_log_immutable'; END $$;
DROP TRIGGER IF EXISTS trg_fin_export_logs_immutable ON fin_export_logs;
CREATE TRIGGER trg_fin_export_logs_immutable BEFORE UPDATE OR DELETE ON fin_export_logs
FOR EACH ROW EXECUTE FUNCTION fin_export_log_immutable();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_export_accountant_limited_only') THEN
    ALTER TABLE fin_exports ADD CONSTRAINT fin_export_accountant_limited_only CHECK (is_accountant_limited = true) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fin_export_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status <> OLD.status AND NOT (
    (OLD.status='pendente' AND NEW.status IN ('gerando','falhou'))
    OR (OLD.status='gerando' AND NEW.status IN ('gerado','falhou'))
    OR (OLD.status='gerado' AND NEW.status='expirado')
    OR (OLD.status='falhou' AND NEW.status='pendente')
  ) THEN RAISE EXCEPTION 'fin_export_invalid_transition'; END IF;
  IF NEW.status='gerado' AND (NEW.storage_key IS NULL OR NEW.generated_at IS NULL) THEN
    RAISE EXCEPTION 'fin_export_generated_requires_storage_key';
  END IF;
  NEW.is_accountant_limited := true;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_export_guard ON fin_exports;
CREATE TRIGGER trg_fin_export_guard BEFORE INSERT OR UPDATE ON fin_exports
FOR EACH ROW EXECUTE FUNCTION fin_export_guard();

-- FIN-15 fechamento de competência: versões de relatório preservadas e
-- reabertura somente autorizada.
CREATE OR REPLACE FUNCTION fin_report_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fin_report_version_immutable'; END $$;
DROP TRIGGER IF EXISTS trg_fin_report_versions_immutable ON fin_report_versions;
CREATE TRIGGER trg_fin_report_versions_immutable BEFORE UPDATE OR DELETE ON fin_report_versions
FOR EACH ROW EXECUTE FUNCTION fin_report_version_immutable();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_report_version_preserved_only') THEN
    ALTER TABLE fin_report_versions ADD CONSTRAINT fin_report_version_preserved_only CHECK (is_preserved = true) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fin_closure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status <> OLD.status AND NOT (
    (OLD.status='aberta' AND NEW.status IN ('fechada','bloqueada'))
    OR (OLD.status='fechada' AND NEW.status IN ('reaberta','bloqueada'))
    OR (OLD.status='reaberta' AND NEW.status IN ('fechada','bloqueada'))
  ) THEN RAISE EXCEPTION 'fin_closure_invalid_transition'; END IF;
  IF NEW.status='reaberta' AND (NEW.authorized_by_identity IS NULL OR NEW.authorized_at IS NULL OR NEW.reopen_reason IS NULL) THEN
    RAISE EXCEPTION 'fin_closure_reopen_requires_authorization';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_closure_guard ON fin_competence_closures;
CREATE TRIGGER trg_fin_closure_guard BEFORE INSERT OR UPDATE ON fin_competence_closures
FOR EACH ROW EXECUTE FUNCTION fin_closure_guard();

-- FIN-16 comissões: provisão e revisão; nunca pagamento automático.
CREATE OR REPLACE FUNCTION fin_commission_provision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_auto_paid THEN RAISE EXCEPTION 'fin_commission_auto_pay_forbidden'; END IF;
  IF TG_OP='UPDATE' AND NEW.status <> OLD.status AND NOT (
    (OLD.status='provisionada' AND NEW.status IN ('em_revisao','cancelada'))
    OR (OLD.status='em_revisao' AND NEW.status IN ('revisada','cancelada'))
    OR (OLD.status='revisada' AND NEW.status IN ('em_revisao','paga','cancelada'))
  ) THEN RAISE EXCEPTION 'fin_commission_invalid_transition'; END IF;
  IF NEW.status='paga' AND (NEW.paid_by_identity IS NULL OR NEW.paid_at IS NULL OR NEW.reviewed_by_identity IS NULL) THEN
    RAISE EXCEPTION 'fin_commission_payment_requires_review';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status='paga' AND OLD.status <> 'revisada' THEN
    RAISE EXCEPTION 'fin_commission_payment_requires_review';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_commission_provision_guard ON fin_commission_provisions;
CREATE TRIGGER trg_fin_commission_provision_guard BEFORE INSERT OR UPDATE ON fin_commission_provisions
FOR EACH ROW EXECUTE FUNCTION fin_commission_provision_guard();

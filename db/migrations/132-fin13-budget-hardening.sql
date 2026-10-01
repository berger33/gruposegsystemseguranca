-- FIN-13: hardening aditivo do orçamento gerencial. Não altera tipos nem migrações históricas.
CREATE TABLE IF NOT EXISTS fin_budget_history (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), budget_id UUID NOT NULL REFERENCES fin_budgets(id),
 previous_status fin_budget_status, next_status fin_budget_status NOT NULL,
 changed_by_identity UUID REFERENCES auth_identities(id), changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS fin_budget_history_budget_idx ON fin_budget_history(budget_id, changed_at DESC);
CREATE OR REPLACE FUNCTION fin_budget_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fin_budget_history_immutable'; END $$;
DROP TRIGGER IF EXISTS trg_fin_budget_history_immutable ON fin_budget_history;
CREATE TRIGGER trg_fin_budget_history_immutable BEFORE UPDATE OR DELETE ON fin_budget_history FOR EACH ROW EXECUTE FUNCTION fin_budget_history_immutable();

-- O banco mantém sempre a natureza estimada e impede transições arbitrárias.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_budget_estimate_only') THEN ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_estimate_only CHECK (is_estimate = true) NOT VALID; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_budget_explicit_disclaimer') THEN ALTER TABLE fin_budgets ADD CONSTRAINT fin_budget_explicit_disclaimer CHECK (estimate_note ILIKE '%premiss%' AND estimate_note ILIKE '%não prometer%') NOT VALID; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_scenario_estimate_only') THEN ALTER TABLE fin_budget_scenarios ADD CONSTRAINT fin_scenario_estimate_only CHECK (is_estimate = true) NOT VALID; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_scenario_explicit_disclaimer') THEN ALTER TABLE fin_budget_scenarios ADD CONSTRAINT fin_scenario_explicit_disclaimer CHECK (estimate_note ILIKE '%estimativa%' AND estimate_note ILIKE '%não prometer%') NOT VALID; END IF;
END $$;
CREATE OR REPLACE FUNCTION fin_budget_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.status <> OLD.status AND NOT ((OLD.status='rascunho' AND NEW.status='em_revisao') OR (OLD.status='em_revisao' AND NEW.status IN ('aprovado','rejeitado')) OR (OLD.status IN ('aprovado','rejeitado') AND NEW.status='arquivado')) THEN RAISE EXCEPTION 'fin_budget_invalid_transition'; END IF;
 IF NEW.status='aprovado' AND (NEW.approved_by_identity IS NULL OR NEW.approved_at IS NULL) THEN RAISE EXCEPTION 'fin_budget_approval_requires_auditor'; END IF;
 NEW.is_estimate := true; NEW.estimate_note := CASE WHEN NEW.estimate_note ILIKE '%não prometer%' THEN NEW.estimate_note ELSE 'estimativa com premissas explícitas; não prometer resultado' END;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fin_budget_guard ON fin_budgets;
CREATE TRIGGER trg_fin_budget_guard BEFORE INSERT OR UPDATE ON fin_budgets FOR EACH ROW EXECUTE FUNCTION fin_budget_guard();
CREATE OR REPLACE FUNCTION fin_budget_history_capture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO fin_budget_history(budget_id,previous_status,next_status,changed_by_identity,reason,metadata) VALUES(NEW.id,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,NEW.approved_by_identity,CASE WHEN TG_OP='INSERT' THEN 'Criação do orçamento com premissas explícitas' ELSE 'Transição de status auditada' END,jsonb_build_object('estimate',true)); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_fin_budget_history_capture ON fin_budgets;
CREATE TRIGGER trg_fin_budget_history_capture AFTER INSERT OR UPDATE OF status ON fin_budgets FOR EACH ROW EXECUTE FUNCTION fin_budget_history_capture();
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fin_scenario_types_valid') THEN ALTER TABLE fin_budget_scenarios ADD CONSTRAINT fin_scenario_types_valid CHECK (scenario_type IN ('conservador','base','otimista','expansao','pessimista')) NOT VALID; END IF; END $$;

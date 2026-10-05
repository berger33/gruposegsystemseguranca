-- Migração aditiva 169: EXT-10 / F06 — leitura do plano de continuidade pelo cliente vinculado.
-- Preserva 001–168 imutáveis.
-- Fronteira: o cliente autenticado apenas LÊ o plano da própria conta, e somente depois de
-- publicação explícita por staff autorizado. Nada é publicado por padrão (fail-closed) e
-- nenhum acionamento, notificação ou ator externo é introduzido.

ALTER TABLE ext_continuity_plans
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_visibility_note TEXT
    CHECK (client_visibility_note IS NULL OR char_length(client_visibility_note) BETWEEN 10 AND 1000),
  ADD COLUMN IF NOT EXISTS client_visibility_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_visibility_set_by UUID REFERENCES auth_identities(id);

CREATE INDEX IF NOT EXISTS ext_continuity_plans_client_visible_idx
  ON ext_continuity_plans(client_account_id, client_visible)
  WHERE client_visible IS TRUE;

-- Guarda de publicação: visibilidade ao cliente exige conta vinculada e estado publicável.
-- Se o plano sair do conjunto publicável, a visibilidade é retirada pelo próprio banco.
CREATE OR REPLACE FUNCTION ext_continuity_client_visibility_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.client_visible IS TRUE AND NEW.client_account_id IS NULL THEN
    RAISE EXCEPTION 'continuity plan without client account cannot be published to a client';
  END IF;
  IF NEW.client_visible IS TRUE AND NEW.status NOT IN ('aprovado', 'em_teste', 'testado') THEN
    IF TG_OP = 'UPDATE' AND OLD.client_visible IS TRUE AND NEW.status IS DISTINCT FROM OLD.status THEN
      -- Mudança de estado para fora do conjunto publicável retira a publicação.
      NEW.client_visible := FALSE;
      NEW.client_visibility_note := NULL;
      NEW.client_visibility_set_at := NULL;
      NEW.client_visibility_set_by := NULL;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'continuity plan is not in a publishable state for the client';
  END IF;
  IF NEW.client_visible IS TRUE AND (NEW.client_visibility_set_by IS NULL OR char_length(COALESCE(NEW.client_visibility_note, '')) < 10) THEN
    RAISE EXCEPTION 'continuity plan publication requires an authorising identity and a justification';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ext_continuity_client_visibility_trg ON ext_continuity_plans;
CREATE TRIGGER ext_continuity_client_visibility_trg BEFORE INSERT OR UPDATE ON ext_continuity_plans
  FOR EACH ROW EXECUTE FUNCTION ext_continuity_client_visibility_guard();

-- Ampliação das ações de auditoria (publicação por staff e leituras do cliente vinculado).
DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass AND conname = 'auth_access_audit_action_check' AND contype = 'c';
  IF previous_check IS NOT NULL THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format('ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L, %L, %L, %L)) NOT VALID',
      previous_check,
      'continuity_plan_client_publish',
      'continuity_plan_client_unpublish',
      'continuity_plan_client_list',
      'continuity_plan_client_detail');
  END IF;
END
$audit_actions$;

COMMENT ON COLUMN ext_continuity_plans.client_visible IS
  'EXT-10 / F06: publicação explícita do plano para o cliente vinculado da própria conta. Falso por padrão; retirada automaticamente quando o plano sai de aprovado/em_teste/testado. Leitura apenas: o cliente não transiciona, não documenta simulado e não aciona nada.';

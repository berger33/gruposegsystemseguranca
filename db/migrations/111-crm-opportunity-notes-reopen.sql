-- CRM-07 (residual): notas internas dedicadas por oportunidade e endurecimento
-- do funil de CRM-05/06 (motivo de perda e reabertura auditada).
-- Migrações 001–110 permanecem imutáveis. Esta migração é apenas aditiva.
--
-- Política desta fatia (decidida antes da rota — ver
-- docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md):
--   * Nota interna segue a borda pessoal da oportunidade: só o responsável
--     atual (ou o criador enquanto sem responsável) lê e escreve. Nota nunca
--     aparece em superfície pública, do cliente ou de empresa.
--   * Corpo 1–4000 com trim; a regra vale na API e é repetida aqui no banco.
--   * Exclusão é lógica e coerente: deleted_at e deleted_by_id existem juntos
--     ou não existem.
--   * Versão otimista incrementada por gatilho do banco (padrão da 109), para
--     que nenhum caminho de escrita esqueça o incremento.
--   * Funil: stage='perdido' exige motivo; motivo só existe enquanto perdido;
--     is_won/is_lost não podem divergir do estágio. Os CHECKs entram NOT VALID
--     (aditivos): valem para toda escrita nova sem reescrever linha existente.

CREATE TABLE IF NOT EXISTS crm_opportunity_notes (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES auth_identities(id) ON DELETE SET NULL
);

-- Exclusão coerente: carimbo e autor da exclusão existem juntos.
ALTER TABLE crm_opportunity_notes DROP CONSTRAINT IF EXISTS crm_opportunity_notes_delete_coherent_check;
ALTER TABLE crm_opportunity_notes ADD CONSTRAINT crm_opportunity_notes_delete_coherent_check
  CHECK ((deleted_at IS NULL) = (deleted_by_id IS NULL));

-- Nota editada e depois excluída é coerente; o que o banco recusa é excluir
-- ANTES da última edição (ordem temporal mentirosa).
ALTER TABLE crm_opportunity_notes DROP CONSTRAINT IF EXISTS crm_opportunity_notes_edit_coherent_check;
ALTER TABLE crm_opportunity_notes ADD CONSTRAINT crm_opportunity_notes_edit_coherent_check
  CHECK (deleted_at IS NULL OR edited_at IS NULL OR deleted_at >= edited_at);

CREATE INDEX IF NOT EXISTS crm_opportunity_notes_active_idx
  ON crm_opportunity_notes (opportunity_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- Versão otimista incrementada pelo banco em toda atualização (padrão 109).
CREATE OR REPLACE FUNCTION crm_opportunity_notes_bump_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_opportunity_notes_bump_version_trg ON crm_opportunity_notes;
CREATE TRIGGER crm_opportunity_notes_bump_version_trg
  BEFORE UPDATE ON crm_opportunity_notes
  FOR EACH ROW EXECUTE FUNCTION crm_opportunity_notes_bump_version();

-- CRM-06: motivo de perda é obrigatório e só existe enquanto perdido. NOT VALID
-- mantém a migração aditiva (linhas antigas do operador não são reescritas),
-- mas toda escrita nova já é recusada se mentir sobre o funil.
ALTER TABLE crm_opportunities DROP CONSTRAINT IF EXISTS crm_opportunities_loss_reason_stage_check;
ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_loss_reason_stage_check
  CHECK ((stage = 'perdido') = (loss_reason IS NOT NULL)) NOT VALID;

-- As bandeiras não podem divergir do estágio em escrita nova.
ALTER TABLE crm_opportunities DROP CONSTRAINT IF EXISTS crm_opportunities_won_flag_check;
ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_won_flag_check
  CHECK (is_won = (stage = 'ganho')) NOT VALID;

ALTER TABLE crm_opportunities DROP CONSTRAINT IF EXISTS crm_opportunities_lost_flag_check;
ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_lost_flag_check
  CHECK (is_lost = (stage = 'perdido')) NOT VALID;

-- Preserva todas as ações já aceitas e autoriza explicitamente as ações novas
-- desta fatia. Se a constraint pai sumir, a migração falha em vez de afrouxar
-- a auditoria.
DO $$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_definition
  FROM pg_constraint
  WHERE conrelid = 'auth_access_audit'::regclass
    AND conname = 'auth_access_audit_action_check'
    AND contype = 'c';
  IF current_definition IS NULL OR left(current_definition, 6) <> 'CHECK ' THEN
    RAISE EXCEPTION 'audit_action_constraint_missing';
  END IF;
  IF current_definition LIKE '%crm_note_create%' THEN
    RETURN;
  END IF;
  ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
  EXECUTE format(
    'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (''crm_note_create'',''crm_note_update'',''crm_note_delete'',''crm_opportunity_reopen''))',
    substring(current_definition FROM 7)
  );
END $$;

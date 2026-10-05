-- Migração aditiva 172: EXT-05 isolamento staff A/B por client_account_id.
-- Necessidade comprovada: a tabela canônica criada em 085/151 não possuía vínculo de conta.
-- Linhas anteriores permanecem sem conta e exigem grant global/organization; não há backfill fictício.

ALTER TABLE ext_quality_nonconformities
  ADD COLUMN IF NOT EXISTS client_account_id UUID REFERENCES client_accounts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS ext_quality_nonconformities_account_idx
  ON ext_quality_nonconformities(client_account_id, created_at DESC);

-- O vínculo de conta é identidade material da NC canônica e não pode ser trocado depois.
CREATE OR REPLACE FUNCTION ext_quality_account_immutable_guard() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_account_id IS DISTINCT FROM OLD.client_account_id THEN
    RAISE EXCEPTION 'canonical quality client account is immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ext_quality_account_immutable_trg ON ext_quality_nonconformities;
CREATE TRIGGER ext_quality_account_immutable_trg BEFORE UPDATE ON ext_quality_nonconformities
FOR EACH ROW WHEN (OLD.origin = 'jornada_canonica') EXECUTE FUNCTION ext_quality_account_immutable_guard();

-- Preserva acesso dos operadores atuais após introduzir RBAC explícito. Grants futuros podem
-- ser globais/organizacionais ou restritos a uma conta e continuam revogáveis individualmente.
INSERT INTO auth_permissions(identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason)
SELECT i.id,p.permission,'global',NULL,i.id,sp.role,'EXT-05 qualidade: escopo canônico por conta'
FROM auth_identities i JOIN auth_staff_profiles sp ON sp.identity_id=i.id
CROSS JOIN (VALUES ('quality.read'),('quality.write')) p(permission)
WHERE i.kind='staff' AND i.status='active' AND sp.role IN ('admin','ti','marcelo')
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN ext_quality_nonconformities.client_account_id IS
  'Conta cliente opcional da não conformidade. Grant account vê somente a própria conta; registro sem conta exige global/organization.';

-- PLT-06/07/08 — devolve ao `CHECK` de `auth_access_audit` as cinco ações de
-- auditoria que a reescrita da migração 103 deixou cair.
--
-- Causa medida: 044 (PLT-06), 045 (PLT-07) e 046 (PLT-08) acrescentaram
-- `observability_alert_ack`, `observability_alert_resolve`, `healthcheck_query`,
-- `backup_status` e `backup_retention_update` ao `CHECK`. A 103 reescreveu a
-- constraint a partir de uma cópia literal da lista e não reproduziu esses cinco
-- nomes. Desde então os gravadores tentam o `INSERT`, a constraint recusa e o
-- `try {} catch {}` / `.catch(() => {})` descarta em silêncio: as trilhas de
-- leitura do console de TI nunca chegaram à tabela.
--
-- Ampliação estritamente aditiva: nenhuma ação aceita antes deixa de ser aceita,
-- nenhuma linha existente é reescrita, nenhuma tabela nasce. Os gravadores ficam
-- intactos — o `catch` continua como rede de segurança, mas passa a não ter do
-- que proteger. Mesma técnica da 181: a definição vigente é lida de
-- `pg_constraint`, os nomes já presentes são respeitados e o apêndice entra sem
-- validação retrospectiva, de modo que reexecutar a migração não duplica nem
-- quebra.
DO $audit_actions$
DECLARE previous_check TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
   WHERE conrelid = 'auth_access_audit'::regclass
     AND conname = 'auth_access_audit_action_check'
     AND contype = 'c';
  IF previous_check IS NOT NULL AND (
       position(quote_literal('observability_alert_ack') IN previous_check) = 0
       OR position(quote_literal('observability_alert_resolve') IN previous_check) = 0
       OR position(quote_literal('healthcheck_query') IN previous_check) = 0
       OR position(quote_literal('backup_status') IN previous_check) = 0
       OR position(quote_literal('backup_retention_update') IN previous_check) = 0
     ) THEN
    ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
    EXECUTE format(
      'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L,%L)) NOT VALID',
      previous_check,
      'observability_alert_ack',
      'observability_alert_resolve',
      'healthcheck_query',
      'backup_status',
      'backup_retention_update'
    );
  END IF;
END $audit_actions$;

COMMENT ON CONSTRAINT auth_access_audit_action_check ON auth_access_audit IS
  '183 restores the five PLT-06/07/08 audit actions dropped by the 103 rewrite; previously accepted actions remain valid.';

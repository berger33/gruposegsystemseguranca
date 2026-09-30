-- Incremental only: preserve every prior audit action and migration checksum.
CREATE TABLE crm_portfolio_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth_identities(id),
 request_key uuid NOT NULL,
 source_id uuid NOT NULL REFERENCES crm_opportunities(id),
 opportunity_id uuid NOT NULL UNIQUE REFERENCES crm_opportunities(id),
 kind text NOT NULL CHECK(kind IN ('renovacao','upsell','cross_sell','recuperacao','indicacao')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,request_key)
);
CREATE INDEX crm_portfolio_owner_idx ON crm_portfolio_actions(owner_id,created_at DESC);
DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO previous_check FROM pg_constraint
 WHERE conrelid='auth_access_audit'::regclass AND conname='auth_access_audit_action_check';
 IF previous_check IS NULL THEN RAISE EXCEPTION 'audit action constraint missing'; END IF;
 ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
 EXECUTE format('ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK ((%s) OR action IN (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L))',
 previous_check,'cms_content_create','cms_content_update','cms_content_publish','cms_content_revert',
 'theme_create','theme_publish','theme_rollback','theme_preference_update','package_create','package_update',
 'package_rule_create','package_rule_update','package_comparison_create','crm_portfolio_action','crm_opportunity_create');
END $$;

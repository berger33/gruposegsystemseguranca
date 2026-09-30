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

ALTER TABLE crm_commissions ADD COLUMN rule_snapshot jsonb;
-- Existing rows keep NULL: never invent which historical rule version was used.
-- Preserve historical calculation/content snapshots, including the existing baseline.
CREATE TABLE crm_commercial_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity_type text NOT NULL,
 entity_id uuid NOT NULL,
 version integer NOT NULL,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(entity_type,entity_id,version)
);
CREATE FUNCTION record_l04_commercial_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO crm_commercial_versions(entity_type,entity_id,version,snapshot)
 VALUES(TG_TABLE_NAME,NEW.id,NEW.version,to_jsonb(NEW));
 RETURN NEW;
END $$;
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['crm_goals','crm_commission_rules','crm_commissions','crm_commercial_library'] LOOP
 EXECUTE format('INSERT INTO crm_commercial_versions(entity_type,entity_id,version,snapshot) SELECT %L,id,version,to_jsonb(t) FROM %I t',name,name);
 EXECUTE format('CREATE TRIGGER l04_version AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION record_l04_commercial_version()',name);
 END LOOP;
END $$;
CREATE TRIGGER l04_version_immutable BEFORE UPDATE OR DELETE ON crm_commercial_versions FOR EACH ROW EXECUTE FUNCTION prevent_pub_theme_history_update();
DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO previous_check FROM pg_constraint WHERE conrelid='auth_access_audit'::regclass AND conname='auth_access_audit_action_check';
 ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check;
 EXECUTE 'ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (('||previous_check||') OR action IN (''crm_goal_create'',''crm_goal_status'',''crm_commission_rule_create'',''crm_commission_rule_status'',''crm_commission_create'',''crm_commission_status'',''crm_library_create'',''crm_library_approve'',''crm_library_reject'',''crm_library_update'',''crm_campaign_create'',''crm_campaign_status'',''crm_proposal_comparison_create'',''crm_partner_create'',''crm_partner_status'',''crm_referral_create'',''crm_referral_status'',''crm_renewal_create'',''crm_renewal_status'',''crm_report_view''))';
END $$;

ALTER TABLE site_visual_audit DROP CONSTRAINT site_visual_audit_changed_by_check;
ALTER TABLE site_visual_audit ADD CONSTRAINT site_visual_audit_changed_by_check CHECK(changed_by IN ('admin','marcelo','ti'));
ALTER TABLE site_visual_audit ADD COLUMN actor_identity_id uuid REFERENCES auth_identities(id);
ALTER TABLE site_visual_audit ADD COLUMN reason text;
-- Do not restore explicitly revoked grants.
INSERT INTO auth_permissions(identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason)
SELECT p.identity_id,permission,'organization',NULL,NULL,'system','Retomada autorizada da administração dos dez visuais'
FROM auth_staff_profiles p JOIN auth_identities i ON i.id=p.identity_id AND i.status='active'
CROSS JOIN (VALUES ('site.visual.read'),('site.visual.write')) AS available(permission)
WHERE p.role IN ('admin','marcelo','ti') AND NOT EXISTS (
 SELECT 1 FROM auth_permissions a WHERE a.identity_id=p.identity_id AND a.permission=available.permission
);

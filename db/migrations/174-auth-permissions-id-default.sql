-- Compatibilidade para bancos criados antes dos grants canônicos EXT-08..15.
-- A migração 010 criou id sem DEFAULT; inserções em lote 160+ precisam de UUID.
ALTER TABLE auth_permissions
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

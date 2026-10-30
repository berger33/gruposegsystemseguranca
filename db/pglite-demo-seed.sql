-- Conteúdo de DEMONSTRAÇÃO do PGlite — nunca schema.
--
-- E7: o schema da demo agora vem inteiro de `db/migrations` (001–181), igual ao
-- PostgreSQL. Este arquivo carrega só o estado sintético que o antigo
-- `db/beta-pglite-init.sql` deixava pronto, para a demo não mudar de comportamento:
-- a identidade staff fictícia usada como referência de seeds aprovadas.
--
-- Regras: idempotente, sem dado real, sem credencial (não há senha/MFA aqui) e
-- nenhuma tabela é criada. Qualquer DDL pertence a uma migração.

-- Identidade staff sintética (mesmo UUID do modo beta antigo). Sem credencial,
-- sem sessão: não autentica ninguém, apenas satisfaz as FKs de seeds aprovadas.
INSERT INTO auth_identities (id, kind, email, status)
VALUES ('00000000-0000-0000-0000-000000000099', 'staff', 'admin@gruposegsystem.local', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO auth_staff_profiles (identity_id, role, assigned_by)
VALUES ('00000000-0000-0000-0000-000000000099', 'admin', 'admin_system')
ON CONFLICT DO NOTHING;

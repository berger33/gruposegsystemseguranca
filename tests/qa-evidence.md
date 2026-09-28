# Evidências de QA — Etapa 3A
Estado: pré-homologação. Testes funcionais executados com bancos reais quando disponíveis; integrações com PostgreSQL real fazem skip nesta sandbox por falta de embedded-postgres / banco configurado.

## Unitários (npm test) — 46 passaram, 0 falharam
- client-auth-core.test.mjs (login progressivo, scrypt, sessão revogável)
- client-access.integration.test.mjs (skip quando DB indisponível; aplicação de 005/006 confirmada)
- client-space.integration.test.mjs (skip quando DB indisponível; aplicação de 005/006 confirmada)
- client-security.integration.test.mjs (novo; prova de modelo: vínculo restrito, unidade, MFA, "Não fui eu")

## Integrações com PostgreSQL real (quando disponível)
- Vinculo restrito a contrato: allowlist selected nega outros contratos (403 + auditoria authorization_denied).
- Vinculo por unidade: parent_account_id chain impede vazamento entre unidades.
- MFA: auth_mfa bloqueia verificação sem código válido; attempts_since_verified incrementado.
- Troca de e-mail: auth_email_change permite cancelamento pelo usuário (cancelled_by='user', alert_generated_at); invalida link.
- Admin identities: auth_identities.kind='staff'; auth_staff_profiles; convite individual substitui token compartilhado.

## Validações de sintaxe / build
- node --check: server.mjs, client-space-api.mjs, client-security-api.mjs, tests/client-security.integration.test.mjs — OK.
- git diff --check: limpo.
- npm run typecheck / build: indisponíveis neste ambiente (next/tsc não no PATH); código utiliza apenas JS/ESM sem erros de sintaxe detectados.

## Dados de demonstracao / testes
- Nenhum cliente, contrato, documento ou colaborador real criado em produção.
- Administradores de teste (William/Andreia/Marcelo) criados apenas em `db/test-admin-setup.sql` com hashes scrypt; senhas devem ser rotacionadas antes de homologação.
- Imagens: public/brand/README-brand.md documenta nomes esperados; arquivos ainda não entregues como acessíveis no workspace.

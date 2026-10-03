# L08 / CLI-14 — segurança da conta

Data: 2026-10-03. Base confirmada: `main` e PR #93 (`508daad55cf239113337b6ed7b33a04d356a66cc`), estado `MERGED`, divergência inicial 0/0. Branch desta sessão: `arena/01a1008a-gruposegsystemseguranca`.

## Implementação

- Migração aditiva `145-cli14-account-security.sql`; 001–144 permanecem imutáveis.
- MFA TOTP opcional usa `auth_mfa`: segredo cifrado com AES-GCM e AAD por identidade, recuperação armazenada somente como hashes, confirmação e desativação com reautenticação. O segredo e códigos só aparecem na etapa controlada de configuração/ativação e nunca em listagem ou auditoria.
- Gestão de sessões usa exclusivamente `auth_sessions`. A lista deriva da identidade da sessão, marca a sessão atual sem token/hash, e permite revogar uma sessão ou as demais no servidor.
- Troca de e-mail usa `auth_email_change`, token hash de uso único e expiração de 24 horas; a confirmação atualiza `auth_identities`, revoga sessões e audita a conclusão na mesma transação. Sem SMTP, o mecanismo local/outbox fornece a URL manual.
- Rotas cliente exigem sessão cliente, same-origin e autoria/identidade derivadas no servidor. Não há atalho administrativo nem uso das tabelas v2 `cli_sessions`, `cli_email_change_requests` ou `cli_security_events`.
- Escrita sensível e `auth_access_audit` são transacionais; falha da auditoria retorna `503 audit_unavailable` e faz rollback.
- `/cliente/app/seguranca` deixou de ser prévia: possui MFA, estados de carregamento/erro/retry, sessões e troca de e-mail, sem afirmar conclusão antes da resposta.

## Validação automática executada

- `npm ci`: OK.
- `node scripts/qa-wave0-static.mjs`: 5/5 (001–145).
- `npm run typecheck`: OK.
- `node --test tests/cli14-account-security.test.mjs`: 4/4.
- Teste legado de rotas de segurança: 9/9.
- `npm test`: 230/230; `npm run build`: 84 páginas.

A prova dedicada cobre separação das fontes canônicas, ausência de tokens/hashes na projeção, guardas de sessão/origem/método, transação/rollback/auditoria e expiração/uso único no contrato implementado. Não é a bateria pesada operacional.

## Fronteiras e aceite

A bateria pesada específica de CLI-14, gates L03..L08 em cascata, aplicação da migração em destino e homologação Windows permanecem pendentes por decisão do proprietário. O gate L08 legado 51/51 não é apresentado como prova operacional desta fatia. O aceite humano anterior de Marcelo e Andreia refere-se somente ao L07 e não é renovado aqui; não há aceite humano novo. Próximo alvo: CLI-15.

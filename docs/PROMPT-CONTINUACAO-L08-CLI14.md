# Próxima fatia do L08 — CLI-14, segurança real da conta

Prompt preparado em 2026-10-03, após a entrega e revisão da CLI-13 (PR #93).

## Fonte e estado a preservar

Trabalhe no repositório oficial `berger33/gruposegsystemseguranca`, em branch
Arena própria criada da `main` atual. Antes de editar, confirme no remoto que a
PR #93 está `MERGED`, registre o SHA atual da `main` e confirme divergência 0/0.
Se ainda não estiver mergeada, não refaça CLI-13: aguarde ou parta da PR e
documente a decisão.

Preserve sem reabrir:

- L04–L07 integrados; aceite humano anterior de Marcelo e Andreia somente para
  L07; homologação Windows ainda pendente;
- CLI-01..05 (fonte legada canônica e migração 139), CLI-06..08 (140), CLI-09,
  CLI-10 (141), CLI-11 (142), CLI-12 (143) e CLI-13 (144);
- migrações 001–144 imutáveis; próxima livre: **145**;
- CLI-13: modos configuráveis; pedido sempre pendente; vínculo conta/documento
  verificado no servidor; decisão motivada cria somente convite canônico;
  autocadastro nunca cria grant ou libera contrato sozinho.

A validação rápida da CLI-13 terminou com estático 5/5 (001–144), typecheck,
teste dedicado 11/11, `npm test` 226/226 e build 84 páginas. Durante a revisão
da PR, o gate L08 revelou que o catálogo de modos não existe no schema parcial
legado do gate. A correção passou a consultar `to_regclass` antes de aplicar o
gate do modo convite; `test:l08-delivery:pg` voltou a **51/51**. Essa execução
prova compatibilidade CLI-01..05, não uma jornada pesada CLI-13.

## Objetivo exclusivo

Implementar e provar **CLI-14 — segurança da conta com MFA opcional, gestão de
sessões e troca de e-mail concluída, ligadas ao backend canônico real**, sem
criar uma segunda fonte de autenticação.

Promova a interface hoje parcial/órfã para usar as fontes canônicas:

- identidades, credenciais e sessões de `auth_*` (003 e hardenings posteriores);
- MFA canônico já existente (097/099 e APIs reais);
- troca de e-mail iniciada no backend real, com confirmação segura, rotação de
  sessão e auditoria;
- tabelas v2 da 076 (`cli_security_events`, `cli_email_change_requests`,
  `cli_sessions`) somente se forem reconciliadas de forma aditiva e inequívoca;
  não duplique `auth_sessions`, MFA ou identidade.

## Escopo mínimo

1. **MFA opcional real:** ativar, confirmar e desativar fator pelo cliente
   autenticado, com reautenticação quando aplicável, segredo cifrado, códigos de
   recuperação protegidos e nenhuma exposição de segredo após ativação.
2. **Gestão de sessões:** listar apenas as sessões da identidade autenticada,
   identificar a sessão atual sem expor token/hash, revogar uma sessão ou as
   demais sessões e refletir a revogação imediatamente no servidor.
3. **Troca de e-mail concluída:** solicitar novo e-mail, confirmar por token de
   uso único e prazo explícito, impedir colisão, atualizar a identidade
   canônica, revogar/rotacionar sessões conforme política e registrar o estado
   final. Sem SMTP, usar somente o mecanismo local existente e URL manual.
4. **Autorização e separação:** rotas cliente aceitam exclusivamente sessão
   cliente; rotas administrativas não são atalho. Same-origin nas mutações,
   UUIDs e autoria derivados no servidor, corpo forjado ignorado.
5. **Atomicidade e auditoria:** domínio, histórico/evento e
   `auth_access_audit` na mesma transação. Falha de auditoria retorna 503 e
   reverte tudo, inclusive ativação/desativação MFA, revogação de sessão e troca
   de e-mail.
6. **Idempotência e concorrência:** retry não duplica pedido de troca nem evento;
   chave reusada com conteúdo diferente retorna 409; tokens e transições são de
   uso único sob lock.
7. **UI real:** `/cliente/app/seguranca` deve exibir estados de carregamento,
   vazio, erro, retry, MFA, sessões e troca de e-mail, sem alegar conclusão
   antes da resposta do servidor.

## Antes de implementar

1. Leia `README.md`, `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/ENTREGA-L08.md`, o
   relatório CLI-13 e a linha CLI-14 do checklist.
2. Estude `client-security-api.mjs`, `client-access-api.mjs`, as rotas de
   segurança no `server.mjs`, a tela `/cliente/app/seguranca`, migrações 003,
   005, 076, 097–099, 139–144 e os testes de acesso/MFA existentes.
3. Reproduza antes de editar as lacunas exatas de gestão de sessões e conclusão
   de troca de e-mail; não classifique MFA já funcional como ausente.
4. Execute no SHA inicial: `npm ci`, estático 5/5 (001–144), typecheck,
   `npm test` (226/226) e build (84 páginas).

## Regras inegociáveis

- autorização, identidade e escopo exclusivamente no servidor;
- tokens, hashes, segredo TOTP e códigos de recuperação nunca aparecem em logs,
  listagens ou auditoria;
- sessão staff nunca vale como sessão cliente e vice-versa;
- nenhuma sessão é inventada a partir da tabela v2; `auth_sessions` permanece
  fonte de verdade;
- escrita sensível + histórico/evento + auditoria na mesma transação;
- falha da auditoria: 503 e rollback;
- migração somente aditiva a partir da 145, constraints novas `NOT VALID`, sem
  autoria retroativa inventada;
- sem SMTP real, dados reais, timeout maior, skip ou assertiva enfraquecida;
- registrar o teste dedicado em `package.json` → `test:unit`.

## Validação da fatia

Obrigatório agora:

- `npm ci`;
- `node scripts/qa-wave0-static.mjs` 5/5 com 001–145;
- `npm run typecheck`;
- teste dedicado `tests/cli14-account-security.test.mjs`;
- `npm test` integral, com total atualizado;
- `npm run build` com a rota de segurança listada.

A bateria pesada específica de CLI-14, gates L03..L08 em cascata e aplicação da
migração em destino permanecem pendentes para o fechamento integral, salvo nova
decisão expressa do proprietário. Não transformar o gate L08 legado 51/51 em
prova operacional de CLI-14.

## Entrega

Atualize README, estado, checklist, controle, evidências e entrega L08; crie o
relatório `docs/ENTREGA-L08-RELATORIO-2026-XX-XX-CLI14-SEGURANCA.md`. Diferencie
implementação, validação automática e aceite humano. Não invente aceite de
Marcelo ou Andreia. Abra PR revisável, sem merge automático, e aguarde revisão.

Depois de CLI-14, o próximo alvo é **CLI-15**. A bateria pesada integral e a
homologação Windows continuam no fechamento do sistema.

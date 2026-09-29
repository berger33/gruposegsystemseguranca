# QA-HOM-007 — revisão manual de identidade (SMTP em stand-by)

**Data:** 2026-09-28. **IDs associados:** `SEC-07`, `CLI-01`, `PLT-MIG-001`, `TENANT-SEG-001`; recorte, **não aceite dos 222 IDs**. Ambiente de teste: Linux, Node 22, PostgreSQL temporário em loopback, identidades/empresas `example.invalid` fictícias; arquivos/cluster descartados ao encerrar. Sem envio SMTP externo, sem Windows do proprietário, sem dados reais e sem Funnel.

## Decisão e alteração

- A migração aditiva **098** registra `verification_method` (`email_link` ou `manual`) e `verified_at`, mais a revisão única com ID do TI individual, método presencial/retorno para contato **previamente conhecido**, justificativa e data. Contas legadas não foram marcadas retroativamente como verificadas; `active` sem método falha fechado. A aprovação manual **não confirma posse da caixa postal**: `emailConfirmed=false` e não emite permissão para empresas/contratos por si só.
- Aceite de convite cria conta pendente e login/sessão/MFA não a autenticam. Confirmação real por link identifica `email_link`. Aprovação manual exige convite já aceito, conta individual de TI ativa, senha renovada, limite de tentativas, justificativa (30–500 caracteres), repetição do e-mail esperado, transação/auditoria, invalidação de tokens de confirmação e revogação de sessões. Repetição é negada. SMTP configurado desativa esta exceção manual (sem ligar SMTP por conta própria).
- A tela `/admin/verificacao-manual` permite fila e revisão; clientes veem distinção entre aprovação de identidade e confirmação do e-mail. Uma conta recém-aprovada continua sem acesso a outras empresas até concessão separada.

## Resultados executados neste checkout

| ID rastreável | Comando / verificação | Evidência observada |
|---|---|---|
| `QA-HOM-007.UNIT` | `npm test` | 153/153, exit 0; inclui restrição a TI individual, origem/método e bloqueio da exceção quando `MAIL_HOST` está configurado. |
| `PLT-SMK-001` | `node scripts/qa-wave0-static.mjs` | 5/5, migrações contínuas 001–098, exit 0. |
| `PLT-MIG-001` | `npm run test:migrations:pg` | 98/98 primeiro e segundo passe; checksum alterado intencionalmente no clone recusado; restauração por TEMPLATE do clone, 498 tabelas, cleanup, exit 0 no **retry**. Primeira execução paralela falhou após os checks, com erro assíncrono de conexão encerrada pelo PostgreSQL no teardown; não é contabilizada como passe. Não é ensaio de `pg_dump`/`pg_restore`. |
| `QA-HOM-007.HTTP` | `node scripts/qa-homologacao-local.mjs --verify` | exit 0; pendente 403 sem cookie, legado ativo sem método 403, fila anônimo 401/RH 403/token legado 403/TI individual 200, senha errada 403, alvo errado 409, RH negado 403, aprovação 200, repetição 409, login manual 200, `/me` retorna `emailConfirmed=false`, cliente sem grant recebe lista vazia, token invalidado, evento de auditoria de TI, limpeza true. Rodado novamente após asserção do evento. |
| `TENANT-SEG-001` | `npm run test:tenant:pg` | 9/9, exit 0, DB temporário descartado. |
| `CLI-01.ACCESS` | `npm run test:client-access:pg` | 15/15, exit 0, SMTP de captura **somente dentro do teste** e PostgreSQL temporário descartado. Não prova entrega de e-mail real. |
| `TENANT-SEG-003` | `npm run test:cli-v2:pg` | Primeiro ensaio **falhou 2/8 subtestes**: fixture sintética tinha conta `active` sem método e passou a receber 401, corretamente. Fixture de QA explicitada como `email_link` somente em cluster descartável; retry **9/9**, exit 0. Não houve backfill real. |
| `CLI-04.OBJECTS` | `npm run test:cli-v2:pg:objects` | Primeiro ensaio falhou (expectativa antiga de 96 migrações vs 98); contador da fixture corrigido; retry **1/1**, exit 0, cleanup true. |
| `PLT-BAK-001` | `npm run test:backup-restore:pg` | **Não executado: exit 2**, `pg_dump`/`pg_restore` 17 ausentes/incompatíveis nesta sessão; banco não criado. Restore deste lote **não comprovado**. |
| `QA-HOM-007.BUILD` | `npm run typecheck`; `npm run build` | ambos exit 0; nova rota `/admin/verificacao-manual` incluída no build. `npm ci --no-audit --no-fund` exit 0; `git diff --check` sem erros. |

Logs temporários em `/tmp/manual-{unit-final,type-final,build,qa-audit,migr-retry,tenant,client-access}.log`, não versionados; não expõem senhas/tokens em documentação. Nenhuma execução em Windows nem deploy. O runner HTTP **remove** a massa sintética ao sair: não constitui cadastro persistente para o proprietário. CI remoto deste lote ainda não foi executado nesta evidência.

## Pendências e gate

**NO-GO** para link público, dados reais ou pacote Windows: ainda faltam massa sintética **persistente, isolada e idempotente** para operação local, serviço Windows/PostgreSQL persistentes, backup/restauração de DB+arquivos, chaves estáveis sob custódia, MFA para staff/Marcelo e hardening/QA de acesso externo protegido. A lista de pendências dos 222 IDs continua válida; SMTP só será ligado após recebimento/configuração autorizada dos dados. Toda revisão manual deve ser realmente humana e comprovável por procedimento aprovado, não clicada automaticamente por fixture sintética fora de QA.

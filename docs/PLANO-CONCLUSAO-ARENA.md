# Plano de conclusão (Arena) — lista única de trabalho

## Atualização corrente — F03 contas → baixa → relatório

- Base `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`, branch `arena/01a10845-gruposegsystemseguranca`, implementação `23910567a2a329dc4f46c4aae6cf740c9d4888aa`, PR [#132](https://github.com/berger33/gruposegsystemseguranca/pull/132); documentação `8e7d84230fded1fcac9a256f5d1752e402f49b5a`. Migração 159 aditiva; próxima livre 160.
- Entregue o quarto fluxo automatizado sobre fontes FIN-01..04: leitura e baixa por conta com `financeiro.*` fail-closed, transição estrita, idempotência, locks, transação, histórico/auditoria e relatório interno imutável. Escrita dos aliases HR retorna 410; sem simular banco/SMTP/entrega.
- Provas: gate focal 1/1; Wave0 5/5; typecheck; unitários 526/526; L07 43/43; L08 51/51; client-space 22/22; client-access 27/27; F03 #126/#127/#129 1/1; demo-local OK.
- Próximo passo: revisão/aceite humano e prova Windows/EPERM. **Não marcar F03 concluída antes desses dois gates.** Depois, seguir EXT-08/F04 em fatia separada.

## Atualização corrente — F03 cliente → chamado → atendimento → aceite

- **Base:** `origin/main` `a459e07d42a855f93af4d76d047b49f3ff5e204e` (PR #127 já integrada); **branch fixa:** `arena/01a107a9-gruposegsystemseguranca`; **commits:** `3c7e9ab1da469b94d7cf383491f9240df30a8b6e` (implementação) + `7bf821eabba64b3880698d83b7a0fae3c5001594` (documentação); **PR:** [#129](https://github.com/berger33/gruposegsystemseguranca/pull/129), **integrada em `origin/main` pelo merge `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`**. Não recriar/reabrir/remesclar #126, #127 nem #129.
- A jornada cliente→chamado→atendimento→aceite foi validada por `npm run test:f03-client-ticket-acceptance:pg` (**1/1**, PostgreSQL 17 descartável, HTTP e Chromium), Wave 0 5/5, typecheck, `npm test` 526/526 e regressões (`test:l08-delivery:pg` **51/51**, client-space **22/22**, `test:client-access:pg` **27/27**, gates F03 #126/#127 **1/1**, `test:demo-local:pg`). A migração livre 158 foi consumida additivamente; 001–157 imutáveis; **próxima livre: 159**.
- A prova preserva autorização fail-closed e mesma origem, sessões individuais, A/B, auditabilidade transacional, idempotência/retry e transações atômicas com trilha de mensagens; a escrita CLI-05 legada fechou com 410 `legacy_cli_ticket_write_retired`; a UI administrativa e o portal expõem a trilha e somente ações legais da máquina de estados. Falhas reais (helper de chave de idempotência, asserção de chamado prematuro, ordenação da trilha, health timeout ambiental) foram corrigidas e a execução repetida sem remover asserções.
- **Limites:** F03 ainda não está concluída — falta contas→baixa→relatório, além do aceite humano e Windows/EPERM; SMTP, banco, eSocial, assinatura, hosting e IA externos continuam fora.

## Atualização — F03 funcionário → RH → retorno

- **Base:** `origin/main` `7a41837385985e2321fc86f8b461f133d7c01423` (PR #126 já integrada); **branch fixa:** `arena/01a10761-gruposegsystemseguranca`; **commits:** `d0f1cdebfb5fecac2fc7bb639b554faf1724a7b7` (implementação) e `fcddf69` (evidência/documentação); **PR:** [#127](https://github.com/berger33/gruposegsystemseguranca/pull/127). Não recriar a #126.
- A jornada funcionário→solicitação→análise RH→retorno foi validada localmente por `npm run test:f03-employee-request-rh-return:pg` (**1/1**, PostgreSQL 17 descartável, HTTP e Chromium), além de Wave 0 5/5, typecheck e `npm test` 526/526. A migração livre 157 foi consumida additivamente; 001–156 continuam imutáveis.
- A prova preserva autorização fail-closed e mesma origem, sessões individuais, A/B, auditabilidade transacional e retry idempotente; escrita EMP-12 legada foi fechada com 410 para não contornar a rota canônica.
- Falhas reais registradas: manifesto fechado ainda em 156; conflito enum/texto revelado no PostgreSQL; e seletores/concorrência do Chromium. Todos foram corrigidos e a execução foi repetida sem remover asserções.
- **Limites:** F03 ainda não está concluída — faltam cliente→chamado→aceite e contas→baixa→relatório, aceite humano e Windows/EPERM; SMTP, banco, eSocial, assinatura, hosting e IA externos continuam fora.


Data: 2026-10-04. Base vigente desta fatia: `origin/main` `972e6563f5ea4888b62e88b8c126a925d79f6068`; branch fixa `arena/01a1073d-gruposegsystemseguranca`; PR #126 (`c1a557f` + documentação `e45e41b`), checks publicados verdes. F00/F01 estão integradas; a PR #125 (`e2fa152`) foi integrada no merge acima. Deriva de [docs/auditoria-2026-10-04/02-PLANO-ARENA.md](auditoria-2026-10-04/02-PLANO-ARENA.md) já reconciliado em [STATUS-ATUAL-CONSOLIDADO.md](STATUS-ATUAL-CONSOLIDADO.md). Este é o plano operacional vigente entre sessões; cada sessão atualiza a coluna "situação" e [CONTINUACAO-ARENA.md](CONTINUACAO-ARENA.md).

## Regras permanentes

1. Uma fatia de implementação por PR; PR pequeno revisável; nunca mesclar PRs alternativas antigas.
2. Migrações 001–158 são imutáveis; próxima livre no main vigente: **159** (reconfirmar antes de cada fatia).
3. Autorização no servidor em toda API; nunca apenas ocultação no menu. Fail-closed em erro de banco/permissão.
4. Preservar PLAT-01 (despacho à prova de rejeição), credenciais individuais, isolamento entre clientes, auditoria transacional e idempotência.
5. Evidência real por fatia: comando + resultado + SHA + limite da prova. Banco sempre descartável (embedded-postgres de teste ou Compose exclusivo do operador). Sem segredos em git/logs.
6. SMTP real e hospedagem definitiva fora do escopo; não declará-los como entregues.
7. Não contar tabela/API/tela incompleta ou fallback de IA como funcionalidade concluída.

## Sequência e dependências

| Etapa | Escopo | Dependência | Situação |
|---|---|---|---|
| F00 | Reconciliação dos 222 IDs + classificação dos PRs abertos | — | **concluída nesta sessão**: STATUS-ATUAL-CONSOLIDADO.md + PRs classificados (27 superseded, #121 fonte) |
| F01 | Entrada e navegação por papel: `/admin` hub, `/admin/entrar` login central, redirecionamento seguro com retorno, rótulo papel-neutro, menu por papel, 401/403/500 compreensíveis | F00 | **integrada pela PR #125 (`e2fa152`), merge `972e656`**; aceite humano pendente |
| F02 | Windows/EPERM symlink, isolamento QA×ambiente, scripts start/stop/status, backup/restauração em instância separada | F01 | pendente — requer Windows do operador para aceite |
| F03 | Massa de demonstração e jornadas de negócio ponta a ponta (lead→recebimento, funcionário→RH, cliente→chamado, contas→baixa) | F01 | **em execução**: fundação + três jornadas provadas (lead→contrato→implantação #126 `c1a557f`, gate 1/1; funcionário→solicitação→hora→retorno #127 `d0f1cde`, gate 1/1; cliente→chamado→atendimento→aceite #129 `3c7e9ab1`, gate 1/1); falta contas→baixa→relatório |
| F04–F13 | EXT-08 conhecimento, EXT-09 expansão, EXT-10 continuidade, EXT-11 analytics, EXT-12 visual, EXT-13 relatórios, EXT-14 inteligência comercial, EXT-15 emergencial, EXT-16 central/vídeo (projeto separado), EXT-17 biometria (projeto separado) — um requisito por PR | F01 | pendentes; tabelas 086–087 existem sem jornada provada |
| F14 | IA/RAG real: AI-06 recuperação autorizada + AI-09 curadoria primeiro; depois AI-01..05, 07, 08, 10. Fallback não é inferência. | F03 (massa e escopos) | pendente; OLLAMA_ENABLED=false hoje = fallback |
| F15 | Fronteiras parciais: portal externo fornecedor, upload real, recuperação de conta sem SMTP, jobs vs reinício, notificações internas, isolamento A/B, EXT-07 obrigação vencida | F04+ | pendente |
| F16 | Aceite final: matriz de aceite 03-ACEITE.md, humano de Marcelo/Andreia/funcionário, relatório de riscos, runbook Windows | todas | pendente |

## Trabalho imediato após F01 (ordem)

1. ~~Fechar PRs superseded~~ — **concluído em 04/10/2026**: 27 alternativas fechadas sem merge + #121 fechada após integração documental pela #122; a #124 foi revisada, fechada como superseded e reaplicada na PR #125 sobre o main pós-#123.
2. **F03 — concluir as jornadas sobre a massa idempotente já criada**: lead→contrato→implantação (PR #126), funcionário→solicitação→RH→retorno (PR #127) e cliente→chamado→atendimento→aceite (PR #129) foram provadas; resta contas→baixa→relatório (próxima fatia). Uma jornada por fatia revisável, sem duplicar fontes canônicas.
3. **EXT-08 (F04)** — primeira fatia EXT pendente.
4. Rodada dedicada: obrigação vencida do EXT-07 criando tarefa (pendência declarada no aceite técnico).

## Estados que NÃO permitem declaração de conclusão

- Qualquer EXT-08..17 ou AI-01..10 sem jornada UI→API→PG provada e RBAC testado.
- Aceite humano não registrado por papel (Marcelo/Andreia/funcionário/clientes A e B).
- Windows sem os três casos de symlink exercitados (EPERM) e backup/restauração ensaiados.

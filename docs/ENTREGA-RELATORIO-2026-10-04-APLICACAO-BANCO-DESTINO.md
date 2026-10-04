# Entrega — Aplicação em banco de destino: decisões operacionais, ensaio ponta a ponta e runbook (2026-10-04)

## Resumo

Executa a parcela executável da pendência "aplicação em banco de destino": as **decisões operacionais do proprietário** foram tomadas (intervalo e identidade declarada do agendador), o **fluxo completo de aplicação foi ensaiado ponta a ponta** em cluster PostgreSQL 17.9 descartável — do `db:up` equivalente ao acompanhamento do ledger — e o **procedimento foi versionado como runbook** (`docs/APLICACAO-BANCO-DESTINO.md`) para o operador repetir na máquina real. **Nenhuma linha de código ou migração mudou**: a entrega é documentação + `.env.example`.

| Item | Valor |
|---|---|
| Base | `main` `70ee202cb5a2a5aa9849584005a7e9c90261f7e0` (merge da PR #119); branch `arena/01a10507-gruposegsystemseguranca`, divergência 0/0, árvore limpa |
| Migrações | 001–156 intocadas; **nenhuma nova**; próxima livre **157** |
| Decisões do proprietário (2026-10-04) | Escopo: ensaio no sandbox + runbook; intervalo **3600 s**; identidade declarada = conta staff **TI** ativa |
| Arquivos | `docs/APLICACAO-BANCO-DESTINO.md` (novo), `.env.example` (+ seção do agendador), `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`, este relatório |
| O que permanece pendente | Executar o procedimento na máquina real do operador; aceite humano; validação formal em Windows |

## Decisões operacionais (decisão do proprietário, conforme registrado na PR #119)

| Decisão | Escolha | Fundamento |
|---|---|---|
| `EXT07_EVALUATE_INTERVAL_SECONDS` | `3600` | 24 execuções/dia no ledger; o evento `expiry_evaluated` é deduplicado 1×/dia/ator de qualquer forma; retomada após suspensão de identidade ocorre em até 1 h |
| `EXT07_EVALUATE_IDENTITY` | Conta staff **TI** ativa | A automação age em nome de identidade real com menor privilégio do que admin; o UUID é obtido no banco de destino pela query da Etapa 4 do runbook |
| Ativação | Opt-in via `.env.local` no destino | Padrão do código: sem as duas variáveis, agendador desligado |

## Ensaio ponta a ponta (cluster descartável; script temporário apagado)

Metodologia: cluster PostgreSQL 17.9 descartável (`embedded-postgres`, binário real, porta loopback livre, `persistent: false`) como **stand-in do banco de destino**; todo o fluxo usado é o que o operador usará — `npm run db:migrate` oficial, `server.mjs` real em modo dev, API HTTP real, sessão staff real. Fixtures sintéticas `.invalid`; nenhum banco real; script de ensaio apagado ao final (árvore conferida limpa).

Resultado: **32 verificações verdes em 9 passos, zero falhas**.

| Passo | Verificações | Resultado-chave |
|---|---|---|
| 1. Cluster de destino no ar | 1 | PostgreSQL 17.9 confirmado |
| 2. Aplicação oficial 001–156 (`npm run db:migrate` com `DATABASE_MIGRATION_URL` local) | 3 | exit 0; **156 Applied / 0 Already applied**; `Migration ledger verified: 001–156 (PostgreSQL only)` |
| 3. Re-execução idempotente | 1 | **156 Already applied / 0 Applied** (checksum sha256 por arquivo) |
| 4. Estado pós-migração | 4 | `__migrations` 156/156 com checksum; **562 tabelas**; `ext_compliance_evaluation_runs` presente (mig. 156); seed EXT-07 = 0 (esperado) |
| 5. Identidade declarada | 1 | Identidade staff TI ativa criada; **query do runbook devolve o UUID** |
| 6. Servidor SEM agendador (padrão) | 5 | Sem log de ativação (opt-in confirmado); login TI (cookie `seg_admin_session`); obrigação 201; documento vencido 201; documento a vencer 201; **0 tarefas antes do agendador** |
| 7. Servidor COM agendador (`3600` + UUID TI) | 10 | Log `[ext07-scheduler] ativado: avaliação temporal a cada 3600s`; **primeiro tick imediato avaliou sozinho**; tarefa do vencido criada em nome da identidade TI; run `concluida` com `actor_identity`=TI, `interval_seconds`=3600, `facts.trigger`=`agendada`; evento `expiry_evaluated` do dia 1× (chave `agendada:2026-10-04`); `GET /api/ext/compliance/schedule` 401 anônimo e 200 TI com `enabled`, `interval_seconds`=3600, `actor`=TI, ledger com a execução |
| 8. Acompanhamento do ledger (queries do runbook) | 6 | Resumo por status `[{"concluida":1}]`; última execução com chave do dia; falhas 0; execuções por dia `[{"2026-10-04":1}]`; evento do dia único; 1 tarefa criada pela automação em nome da TI |
| 9. Encerramento | — | Servidores mortos, cluster parado, diretório temporário removido; `/tmp` conferido limpo |

Observações do ensaio: a data-base veio sempre do banco (`CURRENT_DATE`), nunca do relógio do cliente; o documento vencido só gerou tarefa **depois** do agendador ligar — provando na prática que a avaliação automática é quem fechou a pendência da PR #119, agora com os parâmetros de produção escolhidos.

## Gates focais (árvore resultante)

| Gate | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 (001–156 contínuas e registradas) |
| `npm run typecheck` | limpo |
| `npm test` | **514/514**, 0 fail/skip/todo/cancelled |
| `npm run test:migrations:pg` | 156/156 ×2 (aplicação + replay) com checksum; clone negativo rejeitou mutação de checksum sem rebaseline; 562 tabelas preservadas |
| `npm run test:ext07-compliance:pg` | **43/43** (mínimo 41), 0 fail/skip/todo |
| `git diff --check` | limpo |

Bateria integral de evidência (14 passos/PDF) não foi necessária: a entrega não altera código, migrações nem contratos — apenas documentação e `.env.example` (nenhum teste fixa o conteúdo deste arquivo; o nome continua o único `.env.*` permitido). Disponível a pedido.

## Fronteiras desta entrega

- **Não aplicou nada em banco real**: o banco de destino vive na máquina do operador; o sandbox usa somente clusters descartáveis (e os gates continuam recusando `DATABASE_URL` herdada).
- Nenhum segredo trafegou pelo chat; o runbook manda gerar senhas/chaves localmente.
- Nenhuma integração regulatória, ator externo, upload, bytes, checksum, malware scan, armazenamento verificado, download ou aceite humano foi inventado; o agendador segue sendo timer local em nome de identidade staff real declarada.
- Migrações 001–156 intocáveis; nada foi reaplicado ou reordenado no destino porque nenhum destino real foi tocado.

## Encerramento da sessão

Temporários do ensaio apagados (script e clusters); `next-env.d.ts`/`tsconfig.json` restaurados após os servidores dev dos gates; árvore commitada contém somente os entregáveis. Aceite humano, execução na máquina real e validação Windows seguem como pendências documentadas — agora com procedimento validado para executá-las.

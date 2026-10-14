# UX-PRO-07B-2 — escopo, baseline e medição anterior: estados de escrita em `/admin/emergencial`

**Data:** 14/10/2026

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

**Fatia registrada aqui:** UX-PRO-07B-2 — estado de envio pendente, prevenção de duplo clique e reconciliação de resultado das quatro mutações canônicas de `/admin/emergencial` (criação, iniciar ciclo de testes, registrar teste de recebimento, registrar teste de atendimento e marcar ativo), exatamente o que a UX-PRO-07B-1 deixou para a subfatia seguinte da 07B.

## 1. Base realmente conferida

Conferência feita no checkout desta sessão, antes de qualquer edição de tela:

- branch de trabalho: `arena/f9924d6b-gruposegsystemseguranca` (branch da sessão; `main` local e `origin/main` em `a16ab71d4f7b91f151d4eb117f3d5420b94113c5`, merge da PR #223/UX-PRO-07B-1); `HEAD` == `origin/main`, confirmado por `git merge-base --is-ancestor`;
- árvore de trabalho: limpa (`git status --porcelain` vazio) antes e depois de cada verificação;
- PRs abertas: **nenhuma** (`gh pr list --state open` vazio);
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`;
- dependências instaladas com `npm ci` (lockfile do repositório);
- `node scripts/ux-pro-00-inventory.mjs --check` → `OK`; 100 entradas de rota; esta é contagem estática e não equivale a passagem visual, teste de estados ou aceite humano.

Nada de UX-PRO-07A ou UX-PRO-07B-1 foi reaberto: nenhum arquivo de `/admin/patrimonio`, `src/lib/asset-request.ts` ou asserção existente de `tests/ux-asset-workspace.integration.test.mjs` é tocado por esta fatia.

Foram lidos antes deste registro: `AGENTS.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`, `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`, `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, `docs/UX-PRO-07-ESCOPO-EMERGENCIAL-ANTES-2026-10-14.md`, `docs/UX-PRO-07-EMERGENCIAL-RELATORIO-2026-10-14.md`, os dois CSVs vigentes, `scripts/ux-pro-00-inventory.mjs`, `scripts/qa-ux-emergency-postgres.mjs`, `tests/ux-emergency-workspace.integration.test.mjs`, `src/server/ext-emergency-api.mjs`, `src/lib/emergency-request.ts` e `src/app/admin/emergencial/EmergencyWorkspace.tsx`.

## 2. Mapa das mutações que a subfatia trata

| Mutação | Verbo/URL | Permissão no servidor | Resposta canônica de sucesso |
| --- | --- | --- | --- |
| Criar canal (formulário `Registrar rascunho`) | `POST /api/ext/emergency/channels` | `emergency.write` | `201` `{channel, note}` (`ext-emergency-api.mjs`, `create`) |
| Iniciar ciclo de testes | `POST /api/ext/emergency/channels/:id/transition` (`{status:"em_teste"}`) | `emergency.activate` | `200` `{channel, note}` |
| Registrar teste de recebimento | `POST /api/ext/emergency/channels/:id/tests` (`{test_kind:"recebimento",…}`) | `emergency.test` | `201` `{test, readiness, status, note}` |
| Registrar teste de atendimento | `POST /api/ext/emergency/channels/:id/tests` (`{test_kind:"atendimento",…}`) | `emergency.test` | `201` `{test, readiness, status, note}` |
| Marcar ativo (decisão humana) | `POST /api/ext/emergency/channels/:id/transition` (`{status:"ativo", note}`) | `emergency.activate` | `200` `{channel, note}` |

Contratos que esta subfatia não pode quebrar:

- `tests/ext15-emergency.test.mjs` exige que a UI continue declarando `não usa handlers legados como cobertura`, `não envia telefonema`, `registro interno declarado` e `Idempotency-Key`;
- `tests/admin-page-gates.test.mjs:50` exige `page.tsx` com `allowedRoles={[\"ti\",\"admin\"]}` na ordem publicada;
- `tests/ui-surface-locale.test.mjs` recusa `toLocale…String()` sem localidade explícita em `src/app` e `src/components`;
- `tests/ux-emergency-workspace.integration.test.mjs` (gate focal da 07B-1, 12 casos) — nenhuma asserção é editada; a subfatia só acrescenta casos;
- os cinco POSTs mantêm verbo, URL, corpo e o cabeçalho `Idempotency-Key` gerado por `idem(label)` com os mesmos rótulos `create`, `testing`, `receipt`, `attendance`, `activate` (`EmergencyWorkspace.tsx:44`, `:227`, `:243`);
- `src/server/ext-emergency-api.mjs`, `server.mjs`, RBAC, permissões, auditoria, migrações e tenancy: intocados.

## 3. Estados atuais de escrita — medição anterior

| ID | Medição anterior | Evidência `file:line` no SHA-base `a16ab71` |
| --- | --- | --- |
| M1 | Nenhum estado de envio pendente: `create` e `act` não têm flag de envio; durante o POST os cinco botões de escrita (quatro ações + `Registrar rascunho`) seguem clicáveis e nada na tela declara que uma escrita está em curso. | `EmergencyWorkspace.tsx:222-234` (`create`), `:237-250` (`act`), `:276` (submit do formulário sem `disabled`), `:300-303` (quatro ações com `disabled={!actionsEnabled}` apenas — estado de leitura) |
| M2 | Sem prevenção de duplo clique: dois cliques em sequência disparam dois POSTs com `Idempotency-Key` **diferentes** (o gerador `idem()` roda a cada envio), então o replay idempotente do servidor não se aplica; na transição o segundo POST é recusado com `invalid_transition`, mas em `POST .../tests` o servidor aceita o segundo registro e cria **registro duplicado** (não há guarda de duplicidade no `registerTest`). | `EmergencyWorkspace.tsx:44` (geração do key por envio), `:237-250`; `src/server/ext-emergency-api.mjs` (`registerTest` insere sem verificação de duplicidade; `mutate` só replay com a **mesma** key) |
| M3 | Sem reconciliação de resultado: o corpo `2xx` não é validado antes de declarar sucesso. Na criação, `setSelected(d.channel.id)` lança `TypeError` quando o corpo 2xx não traz `channel` (sem captura, sem mensagem); nas ações, `2xx` malformada vira `setMessage(d.note)` com `d.note` indefinida (nenhuma faixa aparece) e a tela ainda assim relê lista e trilha, como se a escrita estivesse confirmada. `r.json().catch(() => ({}))` engole corpo não-JSON. | `EmergencyWorkspace.tsx:230-234`, `:246-250` |
| M4 | Sem classificação de falha de escrita: erro vira a string crua `d.error` (ex.: `invalid_transition`, `forbidden`) ou o genérico `Falha ao configurar canal`/`Falha em <label>`; não se distinguem rede, 401/403, 5xx, nem se declara que o resultado da escrita é incerto após falha transitória. | `EmergencyWorkspace.tsx:231`, `:247`; contraste com a leitura, que classifica em `src/lib/emergency-request.ts:28-88` |
| M5 | Sem fail-closed em 401/403 de escrita: com a sessão negada, a faixa única mostra `forbidden` e a lista/trilha lidas continuam visíveis e aparentemente válidas; nada leva a tela ao estado de negativa da leitura (que limpa dado protegido e não oferece repetição). | `EmergencyWorkspace.tsx:231`, `:247` vs. `:138-164` (caminho fail-closed da leitura) |
| M6 | Falha transitória de escrita (5xx/rede) sem orientação: a lista não é invalidada (correto), mas a tela não declara que **não é possível afirmar se a escrita foi aplicada** nem aponta para a releitura segura (`Atualizar lista`/`Atualizar trilha`); não há repetição automática do POST (comportamento que se preserva). | `EmergencyWorkspace.tsx:231`, `:247`, `:305-306` |
| M7 | A faixa de escrita é uma única string compartilhada entre as cinco mutações (`error`/`message`), sem identificar **qual** ação falhou/foi enviada; após uma criação com sucesso a mensagem não distingue a criação de uma transição. | `EmergencyWorkspace.tsx:118-119`, `:305-306` |
| M8 | Não existe captura de nenhum estado de escrita nesta rota: o gate da 07B-1 cobre somente leitura; `resumo.json` tem 12 entradas, nenhuma de envio, falha de escrita, negativa de escrita ou resposta inválida de escrita. | `tests/ux-emergency-workspace.integration.test.mjs` (12 casos, todos de leitura/seleção/teclado/responsividade) |

## 4. Medição anterior em navegador (ad-hoc, não versionado)

Execução **ad-hoc** fora do repositório (não é gate): PostgreSQL embutido descartável, `server.mjs --dev`, Chromium real, sessão `admin` provisionada pelo fluxo real de login, um canal sintético `rascunho` criado pela API real. O script registrou duas medições antes de ser interrompido por instabilidade do renderer em modo `--single-process` (o Chromium empacotado do repositório); o restante da seção 3 vem de leitura de código com `file:line`. A execução completa e reprodutível dos defeitos fica a cargo do gate novo (seção 7, item 1), que é o registro formal.

| Medição | Resultado anterior |
| --- | --- |
| Duplo clique em `Iniciar ciclo de testes` (`clickCount: 2`, intervalo 60 ms), canal `rascunho` | **2 POSTs** em `.../transition` (deviam ser 1); a UI exibe a string crua `invalid_transition` (sem classificação, sem orientação) |
| Estado do servidor após o duplo clique de transição | canal em `em_teste`; 2 eventos de auditoria registrados pela tentativa (o segundo POST foi recusado pelo servidor, mas **viajou** e foi processado) |
| Botões de escrita durante POST demorado (2,5 s injetados) | medição interrompida; o código da seção 3 (M1) comprova ausência de `disabled`/`aria-busy`/estado de envio em qualquer ramo |

Limitação: a medição ad-hoc usa apenas a identidade `admin` e massa fictícia; o banco foi destruído ao final.

## 5. Subfatia UX-PRO-07B-2 — incluído e excluído

### Incluído

1. **Estado de envio pendente por ação**: enquanto uma das cinco escritas está em curso, a tela declara em `role="status"` qual ação está sendo enviada e que o resultado ainda não foi reconciliado; o botão da ação em curso recebe `aria-busy`; **os cinco controles de escrita ficam bloqueados** (as escritas tocam a mesma máquina de estado canônica do canal — duas escritas concorrentes seriam operações conflitantes; o servidor continua sendo a autoridade). Os controles de **leitura** (`Atualizar lista`/`Atualizar trilha`) permanecem disponíveis: GETs são seguros e o mecanismo existente já descarta resposta superada.
2. **Prevenção de duplo clique**: guarda síncrona (ref + estado) estabelecida **antes** do primeiro `await`, de modo que um segundo clique no mesmo tick não dispara segundo POST; o `disabled` mantém o bloqueio até a resposta. O gerador de `Idempotency-Key` e seus rótulos permanecem idênticos.
3. **Reconciliação de resultado**:
   - corpo `2xx` validado antes de sucesso: criação exige `channel.id`; transição exige `channel.id`; teste exige `readiness` e `status`; `2xx` malformada vira falha declarada (`invalid_emergency_write_response`), **nunca** sucesso e **nunca** vazio; sem sucesso falso nem crash;
   - em sucesso, a tela mantém `d.note` quando presente (caso contrário, frase neutra factual) e relê **exatamente** o que relia antes (criação: seleção do novo canal + `loadChannels`; ação: `loadChannels` + `loadDetail(id)`); o mecanismo de leitura já trata preservação/negativa da releitura;
   - falha `401`/`403` de escrita **falha fechada**: a tela dispara a releitura da lista, cujo caminho existente limpa lista/seleção/trilha protegidos e apresenta o estado de negativa sem repetição;
   - falha transitória (`5xx`/rede) **não** oferece repetição automática do POST (o resultado da escrita pode ser incerto — o POST pode ter sido aplicado e a resposta perdida); a faixa `role="alert"` declara a causa real com o código do servidor e orienta a releitura segura antes de repetir a ação.
4. **Classificação de falha de escrita**: transporte novo em `src/lib/emergency-request.ts` (`emergencyWrite` + descritor de erro de escrita + resposta inválida de escrita) no mesmo modelo da leitura; a faixa de erro identifica a ação, a causa classificada e o código real.
5. **Apresentação**: tokens e classes compartilhados existentes (`UiWorkspace.module.css`, `UiState`, `UiBadge`, `UiTaskWorkspace`); alvos ≥ 44 px; foco visível; nenhuma cor fixa nova; textos em pt-BR sem novos `toLocale…` sem localidade.
6. **Prova**: casos novos aditivos no gate focal `tests/ux-emergency-workspace.integration.test.mjs` (executado pelo runner e workflow já existentes) e capturas de evidência dos estados de escrita em 320/390/768/1440 e tema noite, com `resumo.json` derivado das medições.

### Excluído

- qualquer alteração de verbo, URL, corpo, cabeçalho, estado de domínio ou resposta das mutações; de `src/server/ext-emergency-api.mjs`, `server.mjs`, RBAC, permissões, auditoria, migrações e tenancy;
- repetição automática de POST, fila de escritas, otimista UI ou reconciliação por polling;
- estados B16 (resumo legível da trilha) e B17 (ajuda/obrigatoriedade visível dos campos) — permanecem para a subfatia seguinte;
- `page.tsx`, `AdminGate`, papéis declarados, metadados ou navegação;
- asserções herdadas de `tests/ext15-emergency*.test.mjs`, `tests/l06-delivery.integration.test.mjs`, `tests/l08-delivery.integration.test.mjs` e dos 12 casos existentes do gate focal (nenhuma é editada, removida ou relaxada);
- `/admin/patrimonio` e qualquer outra rota da UX-PRO-07;
- validação manual, homologação, revisão humana e aceite humano.

## 6. Gates herdados executados na base intacta (antes da implementação)

| Verificação | Resultado em `a16ab71` |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit **0** |
| `node scripts/qa-wave0-static.mjs` | **5/5** verificações OK |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas |
| `npm run build` | exit **0**; `/admin/emergencial` presente como `○ Static` |
| `npm run test:ext15-emergency:pg` (gate herdado da rota) | **18/18**, `EXT15_EMERGENCY_TEST_EXIT: 0`, `QA_EXT15_PG_TEMP_CLEANED: true` |
| `npm run test:l06-delivery:pg` | exit **0**, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | exit **0**, `L08_DELIVERY_TEST_EXIT: 0` |
| `npm run test:ux-emergency:pg` (gate focal 07B-1) | **12/12**, `UX_EMERGENCY_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `next-env.d.ts` / `tsconfig.json` após os gates Next | restaurados; SHA-256 `18b697c4…` / `2128c956…` |

## 7. Prova exigida para encerrar a UX-PRO-07B-2

1. **Gate focal aditivo**: casos novos em `tests/ux-emergency-workspace.integration.test.mjs` (PostgreSQL descartável, HTTP real, Chromium; falhas injetadas somente em `window.fetch` da página), provando: envio pendente bloqueia as cinco escritas e declara o motivo; duplo clique não envia segunda mutação; payload canônico e `Idempotency-Key` intactos quando a ação é liberada; falha transitória de escrita com causa real, lista preservada e sem repetição automática do POST; `401`/`403` de escrita falham fechados; `2xx` malformada (transição e criação) não vira sucesso nem vazio e não derruba a tela; reconciliação real após sucesso (releitura da lista e da trilha).
2. O gate novo deve ser **executado primeiro contra a implementação anterior** e o resultado registrado em `docs/ux-pro-07-emergencial-evidencias/antes-07b-2/`, sem fingir que isso é regressão de gate herdado.
3. **Preservação:** `npm run test:ext15-emergency:pg` continua 18/18, os 12 casos do gate focal da 07B-1 continuam passando sem edição, e nenhuma asserção herdada é editada.
4. **Evidências** em `docs/ux-pro-07-emergencial-evidencias/`: envio pendente (1440 dia; 390 dia; 768 noite), falha transitória de escrita, negativa de escrita (fail-closed) e resposta inválida de escrita; `resumo.json` com `problems: []` em todas as entradas (derivado de overflow, menor alvo e contraste medidos), `firstFocus`, `percursoTeclado` e motivos de bloqueio.
5. **Relatório depois** com tabela M1–M8 antes/depois por `file:line` do SHA-base e da implementação final, contratos preservados, gates executados e limitações.
6. **Inventário:** regenerar os dois CSVs somente se as células justificadas mudarem; comparar estruturalmente com os snapshots anteriores e provar que o diff se limita à linha 16 (`/admin/emergencial`) e a efeitos reproduzíveis. Nunca editar CSV à mão.
7. **Bateria completa** antes de fechar: `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run test:ext15-emergency:pg`, `npm run test:l06-delivery:pg`, `npm run test:l08-delivery:pg` e o gate focal novo (agora com os casos da subfatia); `git diff --check` limpo e os dois SHA-256 protegidos reconferidos depois de restaurar as alterações automáticas.

Este documento não é aprovação das fatias seguintes e não declara aceite humano. Uma PR desta subfatia só pode ser mergeada depois de todos os checks visíveis verdes, estado mergeável confirmado (`MERGEABLE`/`CLEAN`) e revisão técnica automatizada publicada como comentário — sem alegar revisão humana.

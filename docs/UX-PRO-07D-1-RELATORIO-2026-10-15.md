# UX-PRO-07D-1 — estados honestos de leitura em `/admin/operacao`

**Data:** 15/10/2026

**Base:** `85e1e075ef047018c9e882d87cb642bf27eb1aef` (`origin/main`, merge da PR #227, UX-PRO-07C-2).

**Escopo registrado antes de editar a tela:** [`UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md`](UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md), commit isolado `c32c922`.

**Status:** relatório da subfatia depois da implementação. “Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu”; nada aqui declara conformidade WCAG integral nem conclui a UX-PRO-07.

## 1. Resultado da subfatia

A tela `/admin/operacao` passou a tratar os cinco grupos de leitura já existentes — grupo principal (postos, alocações, solicitações de cobertura, passagens, ocorrências, checklists, regras de jornada, qualificações e validações), estrutura (cargos/funções e necessidades por turno), dimensionamento (dimensionamentos e lacunas), versões de escala e detalhe da versão selecionada (entradas, ciências e histórico), dezessete `GET`s no total — como grupos com estado próprio: **carregando**, **pronto** (com a hora local da última leitura concluída), **falhou** e **atualizando**. A atomicidade de grupo que a tela já declarava foi preservada: um grupo só fica pronto quando todas as suas leituras respondem `2xx` com a chave canônica sendo uma lista.

O vazio só existe depois de resposta `2xx` válida. Resposta `2xx` sem a chave canônica (ou com a chave não-lista) vira falha declarada `invalid_ops_response`, nunca ausência de registros. Falha transitória de releitura preserva o conteúdo lido, informa a hora da última leitura concluída, declara que o conteúdo pode estar desatualizado e oferece repetição real somente quando a classificação permite. `401`/`403` falham fechado **no grupo**: as coleções protegidas do grupo são limpas (no grupo de versões, também a seleção e o detalhe) e a negativa não é apresentada como dado desatualizado nem oferece repetição da mesma chamada. Cada grupo ganhou um controle explícito de releitura (“Atualizar operação/estrutura/dimensionamento/versões/detalhe”) que emite exatamente os mesmos `GET`s do grupo. Resposta superada é descartada por contador de requisição por grupo: trocar da versão A para a B, ou reler o mesmo grupo duas vezes, nunca aplica a resposta atrasada anterior — e o detalhe da versão anterior não é preservado na troca, só na releitura da mesma versão.

Verbos, URLs, query strings, cabeçalhos, corpos, transições canônicas, autorização, auditoria e tenancy permaneceram intactos; a única escrita do workspace principal (`POST /api/ops/schedule-acks`, ciência de escala) e o seu caminho de reconciliação permaneceram com o comportamento vigente, fora desta subfatia. Nenhum arquivo de servidor foi tocado, e os clientes legados `OpsAdvanced2Client`/`OpsAdvanced3Client` (seis abas legadas) não foram tocados.

Arquivos desta subfatia:

| Arquivo | Papel | Linhas |
| --- | --- | --- |
| `src/lib/ops-read.ts` | resposta inválida `invalid_ops_response` e reconhecimento de falha fechada de leitura (novo; reaproveita `opsRequest`/`describeOpsError`, sem duplicar o vocabulário) | 35 |
| `src/app/admin/operacao/OperacaoWorkspace.tsx` | máquina de estado dos cinco grupos de leitura, controles de releitura, faixas e apresentação (reescrita restrita ao caminho de leitura) | 1648 |
| `tests/ux-ops-workspace.integration.test.mjs` | gate focal: 9 casos herdados intactos + 10 casos novos de leitura | 845 |
| `scripts/qa-ux-ops-postgres.mjs` | runner passa a auditar o resumo TAP e a exigir mínimo de 19 casos (antes não havia auditoria TAP nem mínimo) | 133 |
| `.github/workflows/ux-ops-delivery.yml` | caminho `src/lib/ops-read.ts` acrescentado aos gatilhos da rota | +1 |
| `docs/ux-pro-07-operacao-evidencias/` | 10 capturas + `resumo.json` + medição `antes-07d-1/` | — |

## 2. Medição anterior e posterior do gate focal

| Momento | Resultado | Interpretação |
| --- | --- | --- |
| Baseline herdada na base intacta (antes do gate novo) | **9/9 passaram; 0 falharam**, exit 0 | Gate vigente da UX-07 na base `85e1e07`: `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true`. |
| Antes da tela (base `85e1e07`, gate novo com 19 casos) | **9/19 passaram; 10/19 falharam**, exit 1 | Os oito casos herdados que chegaram a executar e o caso novo de autorização das dezessete leituras no servidor já passavam; os nove casos novos de navegador falharam porque a implementação anterior não tinha estados por grupo, controles de releitura, hora de leitura, preservação, fail-closed por grupo nem validação de corpo `2xx`. O décimo caso reprovado é o caso herdado de 390 px, que falhou **antes de qualquer asserção** por `SIGSEGV` do Chromium empacotado no lançamento do navegador (`browserType.launch: Target page, context or browser has been closed`; `signal=SIGSEGV`) — instabilidade conhecida do Chromium `--single-process`, também registrada no relatório UX-PRO-07C-2; na baseline imediatamente anterior, na mesma base, esse caso passou (9/9 acima). Saída integral em [`ux-pro-07-operacao-evidencias/antes-07d-1/antes-gate-completo.txt`](ux-pro-07-operacao-evidencias/antes-07d-1/antes-gate-completo.txt) e resumo em [`antes-medicoes.json`](ux-pro-07-operacao-evidencias/antes-07d-1/antes-medicoes.json). |
| Depois (1ª execução, com diretório de evidências) | **19/19 passaram; 0 falharam**, exit 0 | PostgreSQL descartável, HTTP real e Chromium; falhas injetadas somente em `window.fetch` da página. `UX_OPS_TAP_SUMMARY: pass=19 fail=0 skipped=0 todo=0 minimo_exigido=19`; `QA_PG_TEMP_CLEANED: true`. |
| Depois (2ª execução, sem diretório de evidências — igual ao CI) | **19/19 passaram; 0 falharam**, exit 0 | Repetição independente para descartar aprovação ocasional. |

O resultado anterior é a falha de **casos novos** contra a implementação antiga — não é regressão de gate herdado, e não substitui a medição herdada da seção 4 do escopo.

## 3. Antes/depois por lacuna registrada

SHA-base = `85e1e07` (tela de 1457 linhas). Implementação final = coluna “Depois”.

| ID | Antes no SHA-base | Depois nesta subfatia |
| --- | --- | --- |
| O1 — 2xx malformada vira vazio | `:373-381`, `:396-397`, `:412-413`, `:424`, `:453-455`: `data.<chave> \|\| []` nas dezessete leituras, sem validar a chave. | `src/lib/ops-read.ts:17-27` (`invalidOpsResponse`); validação `Array.isArray` por chave canônica em `OperacaoWorkspace.tsx:509-517` (principal), `:541-542` (estrutura), `:559-560` (dimensionamento), `:573` (versões) e `:606-608` (detalhe). Caso 15 do gate prova que não vira vazio. |
| O2 — sem hora da última leitura | ausente (nenhum `readAt`; estados `:332-349` só `loading`/`error`). | `:319-324` (`ReadState` com `readAt`), `:325-327` (`readTime` com localidade explícita `pt-BR`); `:349-381` (`GroupReadControls` mostra “Leitura concluída às …” por grupo, com `data-testid="operacao-<grupo>-leitura"`). |
| O3 — releitura escondia/apagava o lido | `:351-371` + `:523-529` (principal trocava a tela pela caixa de erro), estrutura/dimensionamento/versões escondiam as tabelas, `:445-451` (detalhe apagava os três arrays). | `:459-491` (`runReadGroup` preserva o `ready` anterior como `refreshing` e, na falha transitória, como `ready` + `staleError`); `:365-379` (faixa `role="alert"` `operacao-<grupo>-desatualizado` com causa, código real, hora e “pode estar desatualizado”). Casos 13, 16, 17 e 18 do gate provam a preservação nos quatro grupos exercitados. |
| O4 — nenhum controle de releitura após o sucesso | `:385`, `:401`, `:417`, `:428` (só `useEffect` de montagem); nenhum botão de atualização no JSX. | `GroupReadControls` (`:349-381`) renderiza “Atualizar operação/estrutura/dimensionamento/versões/detalhe” (`operacao-<grupo>-atualizar`, `aria-busy` durante a releitura) em `:673-679` (principal, acima das abas), `:853-859` (estrutura), `:1104-1110` (dimensionamento), `:1252-1258` (versões) e `:1324-1330` (detalhe) — sempre com os mesmos `GET`s do grupo. |
| O5 — 401/403 não falhavam fechado | `:368-371`, `:387-399`, `:403-415`, `:419-426`: coleções retidas atrás da caixa de erro; `unauthorized` oferecia repetição. | `src/lib/ops-read.ts:29-31` (`opsReadFailsClosed`: status 401/403 ou `kind` auth/denied); `:443-457` (`clearGroup` limpa as coleções do grupo — e seleção/detalhe no grupo de versões); `:474-477` (falha fechada não vira `staleError`); `:330-347` (`GroupFailed` apresenta `UiState` `denied` sem botão de repetição). Caso 14 do gate prova a remoção das tabelas, a ausência de faixa de desatualizado e zero botões na negativa. |
| O6 — sem guarda contra resposta superada | `:430-456` (`selectVersion` aplicava qualquer resposta atrasada); carregadores idem. | `:421-424` (contador por grupo), `:459-472` (`requestIds` descarta a resposta se uma requisição mais nova do mesmo grupo já começou); detalhe só preserva a **mesma** versão: `:581-595` (trocar de versão limpa entradas/ciências/histórico e volta a `loading`). |
| O7 — vazio alcançável por corpo ilegível | vazios dos painéis combinados com O1. | O vazio continua nos mesmos painéis e textos, mas só é renderizado no ramo `ready` de cada grupo (`:671` principal, estrutura `:853`, dimensionamento `:1102`, versões `:1250`, detalhe `detailReady`), que agora exige `2xx` com a chave canônica validada. Caso 11 do gate prova que carregando não é vazio e que o vazio de cobertura só aparece depois da resposta válida. |
| O8 — sem captura UX-PRO da rota | CSV linha 28: sem captura; lacunas de 320/768/noite/teclado/estados. | Caso 19 do gate grava 10 entradas em [`ux-pro-07-operacao-evidencias/`](ux-pro-07-operacao-evidencias/) (ver seção 5); os CSVs regenerados mudam **somente** na linha 28 (ver seção 6). |

## 4. Provas do gate novo

`npm run test:ux-ops:pg` cobre agora dezenove casos; os dez novos da subfatia (`tests/ux-ops-workspace.integration.test.mjs`, casos estritamente aditivos — o diff do arquivo de teste só altera a linha de importação de `node:fs/promises` e acrescenta código):

1. `:566` (caso 10) **autorização das dezessete leituras no servidor**: anônimo recebe `401 unauthorized` em todos os endpoints dos cinco grupos, sem a chave canônica no corpo da negativa; `ti` recebe `200` com `versions` em lista.
2. `:590` (caso 11) **carregando não é vazio**: com atraso injetado em `posts`, o estado `loading` aparece sem abas e sem “Nenhum posto”; depois da resposta, “Leitura concluída às” aparece e o vazio de Cobertura (“Nenhuma pendência de cobertura registrada”) só surge após `2xx` válido.
3. `:608` (caso 12) **falha inicial transitória**: `503 read_unavailable` em ocorrências mostra a caixa com o código real e sem abas; desligada a falha, “Tentar carregar novamente” emite nova leitura de verdade (contador de `occurrences` aumenta) e a tabela de postos aparece. Captura `operacao-1440-falha-inicial.png`.
4. `:629` (caso 13) **releitura do grupo principal preserva**: um posto criado pela API real durante a falha **não** entra no recorte preservado e só aparece depois da repetição bem-sucedida; a faixa de desatualizado mede contraste **14,63:1**; as abas e a tabela lida permanecem. Captura `operacao-1440-desatualizado.png`.
5. `:659` (caso 14) **`403` depois do sucesso falha fechado**: a negativa remove abas e tabelas protegidas, não mostra faixa de desatualizado e não oferece botão de repetição (zero botões no estado `denied`). Captura `operacao-1440-negada.png`.
6. `:679` (caso 15) **`2xx` malformada de versões**: corpo sem `versions` vira `invalid_ops_response` em `operacao-escalas-falha`, sem “Nenhuma versão de escala registrada”; corrigida a injeção, a repetição mostra “Ver calendário”. Captura `operacao-1440-resposta-invalida.png`.
7. `:697` (caso 16) **detalhe relê somente o detalhe**: “Atualizar detalhe” com falha em `schedule-entries` preserva o calendário, e os contadores de `scheduleVersions`, `posts` e `dimensionings` não mudam enquanto o de `scheduleEntries` aumenta; a repetição limpa a faixa.
8. `:723` (caso 17) **dimensionamento preservado**: com falha em `coverage-gaps`, a faixa de desatualizado aparece e o selo de cobertura `70%` lido permanece; a repetição limpa a faixa.
9. `:742` (caso 18) **estrutura preservada**: com falha em `job-roles`, os títulos “Cargos e funções” e “Necessidade por turno” permanecem sob a faixa; a repetição limpa a faixa.
10. `:760` (caso 19) **medições**: 1440/768/390/320 px com transbordo do documento 0 px e menor alvo 44 px; tema noturno em 768 px pelo controle real do envelope com transbordo 0 px e contraste do título **12,92:1**; percurso por Tab em 390 px até “Atualizar operação”, com primeiro foco visível, gravado no `resumo.json`.

O runner (`scripts/qa-ux-ops-postgres.mjs:57-73` e `:115-121`) passou a capturar a saída, auditar o resumo TAP e exigir **19** casos, reprovando caso reprovado, pulado, marcado como todo, resumo TAP ausente ou aprovações abaixo do mínimo (`UX_OPS_TAP_SUMMARY` / `UX_OPS_GATE_REJECTED`).

Nenhuma asserção herdada de `tests/ux-ops-workspace.integration.test.mjs` (casos 1–9), `tests/ux-ops-vocabulary.test.mjs`, `tests/l06-delivery.integration.test.mjs`, `tests/l08-delivery.integration.test.mjs` ou `tests/ext04-suppliers.integration.test.mjs` foi editada, removida ou relaxada; o gate é estritamente aditivo.

## 5. Evidências visuais e medições

A pasta [`ux-pro-07-operacao-evidencias/`](ux-pro-07-operacao-evidencias/) contém **10 entradas** vigentes no `resumo.json`, todas com `problems: []`:

- `operacao-1440-dia.png`, `operacao-768-dia.png`, `operacao-390-dia.png`, `operacao-320-dia.png` — repouso no tema dia;
- `operacao-768-noite.png` — tema noturno pelo controle real do envelope;
- `operacao-390-teclado.png` — percurso por Tab até “Atualizar operação” (`firstFocus: true`, percurso gravado);
- `operacao-1440-falha-inicial.png` — falha inicial `503` com o código real;
- `operacao-1440-desatualizado.png` — releitura do grupo principal falha com conteúdo preservado e hora;
- `operacao-1440-negada.png` — `403` de releitura em fail-closed (zero controles na negativa);
- `operacao-1440-resposta-invalida.png` — `2xx` sem a chave canônica de versões.

| Medição | Resultado |
| --- | --- |
| Transbordo do documento em 320/390/768/1440 px (dia) | **0 px** |
| Transbordo do documento em 768 px (noite) | **0 px** |
| Menor alvo (`button`) dentro de `[data-operacao-workspace]` nas quatro larguras | **44 px** |
| Contraste do título no tema noite (768 px) | **12,92:1** |
| Contraste da faixa de dado desatualizado do grupo principal | **14,63:1** |
| Controles acionáveis no estado de negativa (fail-closed) | **0** |
| `problems` no `resumo.json` | `[]` em todas as 10 entradas |

`problems` é derivado das medições automatizadas do próprio gate (transbordo, menor alvo e contrastes instrumentados, todos com asserção inline). “As medições automatizadas não equivalem a auditoria WCAG completa”: não cobrem foco em todos os componentes, as seis abas legadas, nem elementos montados depois da captura.

## 6. Inventário regenerado — somente a rota justificada

O gerador foi executado (`node scripts/ux-pro-00-inventory.mjs`) e a comparação estruturada com os CSVs da base mostrou alteração **apenas na linha 28 (`/admin/operacao`)** dos dois arquivos:

- inventário: `capturas_viewports` vazio → `1440x900|320x844|390x844|768x1024`; `capturas_stage` vazio → `ux-pro-07-operacao`; `primeiro_foco` `nao` → `sim`;
- matriz: `responsividade` (`sem captura; 320/390/768/1440 px nao verificados` → `capturado em 1440x900, 320x844, 390x844, 768x1024; faltam nenhum`), `teclado` (`marcadores de teclado no codigo; nao verificado em navegador` → `percurso de teclado registrado em navegador (recorte automatizado do gate); primeiro foco registrado em captura`), `evidencia` e `lacuna` atualizadas no mesmo sentido, e a classe de evidência da rota sobe para `captura visual`.

Nenhuma outra rota mudou nos CSVs e nenhum CSV foi editado à mão.

**Limitação do inventário estático:** o gerador continua escrevendo “tema noturno sem captura” e “estados não exercitados em navegador” para toda rota administrativa, sem ler `entry.theme` nem os casos de estado do `resumo.json`. Por isso essas duas lacunas genéricas permanecem na linha 28, embora o gate e o `resumo.json` desta fatia registrem noite, falha inicial, dado preservado, negativa e resposta inválida. O gerador não foi ampliado nesta subfatia para não misturar uma mudança global de metodologia com a tela de operação (mesma decisão das fatias 07A, 07B e 07C).

## 7. Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm ci` | exit 0 (executado na base e mantido) |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `/admin/operacao` gerada como rota estática (`○ Static`) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas; diff confinado à linha 28 |
| `node scripts/ux-pro-00-inventory.mjs` (regeneração) | diff somente na linha 28 dos dois CSVs |
| `npm run test:ux-ops:pg` (gate focal, 19 casos) — 1ª execução (com evidências) | **19/19**, `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ux-ops:pg` — 2ª execução independente (sem diretório de evidências, igual ao CI) | **19/19**, `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ux-ops:pg` contra a implementação anterior | **9/19**, exit 1 (registro em `antes-07d-1/`; inclui a falha por `SIGSEGV` de lançamento do Chromium no caso herdado de 390 px, sem asserção executada) |
| `npm run test:l06-delivery:pg` | **9/9**, exit 0, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | **51/51**, exit 0, `L08_DELIVERY_TEST_EXIT: 0` |
| `npm run test:ext04-suppliers:pg` (gate herdado da fatia anterior) | **28/28**, `EXT04_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28`, `QA_EXT04_PG_TEMP_CLEANED: true` |
| `git diff --check` | limpo |
| integridade de arquivos protegidos após build e gates | `next-env.d.ts` SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` SHA-256 `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` (restaurados com `git checkout --` após cada build/gate) |

## 8. Limitações, fronteiras e decisões pendentes

- **Escrita da ciência de escala fora do escopo.** `OperacaoWorkspace.tsx:618-635` (`acknowledgeSchedule`) permanece com o comportamento anterior: sem estado de envio declarado nem guarda de duplo clique comprovada por este gate. A idempotência continua garantida pelo servidor (`duplicate_ack` tratado como mensagem, caso 7 herdado) e não foi alterada. Tratar o caminho de escrita é a subfatia seguinte da 07D, no padrão B-1/B-2 e C-1/C-2 — não foi antecipado aqui.
- **Legado avançado fora do escopo.** `OpsAdvanced2Client` (Supervisão, Rondas e claviculários/Relatórios) e `OpsAdvanced3Client` (Métricas, Limpeza e Monitoramento) não foram tocados — inclusive campos sem rótulo associado e estilos próprios registrados desde a UX-07. O mapa da 07D manda separar o legado; ele continua sendo item próprio, e a única prova sobre ele nesta PR é o caso herdado 8, que continua passando sem edição.
- **Fail-closed é por grupo.** Uma negativa em um grupo limpa e fecha aquele grupo; os demais grupos conservam o próprio estado (o grupo principal fechado esconde as abas e, com elas, os demais painéis). Não há um estado global de “sessão perdida” que feche os cinco grupos de uma vez — desenhar isso mudaria a semântica de grupos desacoplados que a tela declara desde a UX-07.
- **Reconciliação da ciência após releitura do detalhe.** O `GET /api/ops/schedule-acks` feito por `acknowledgeSchedule` após o `POST` (caminho de escrita) não passa pela máquina de estado do detalhe e não atualiza a hora de leitura do grupo — comportamento vigente, território da subfatia de escrita.
- **Autorização.** A evidência visual usa a identidade `ti`. Os papéis `supervisor`/`marcelo`/`admin` e as recusas `401` foram exercitados no servidor pelo caso 10 (e o `403` de escrita restrita pelo caso 2 herdado); a decisão real de autorização continua no servidor e não foi alargada.
- **Injeção de falha.** Todas as falhas de leitura são injetadas em `window.fetch` dentro da página; as leituras e a criação sintética de posto que saem para o servidor real usam verbo, payload e transição canônicos, verificados pela API (o posto criado durante a falha só aparece após a repetição bem-sucedida).
- **Instabilidade conhecida do Chromium.** Na execução “antes”, o caso herdado de 390 px morreu no lançamento do navegador (`SIGSEGV`, `--single-process`) antes de qualquer asserção; os casos novos desta fatia usam `withBrowserPro`, que repete somente esse tipo de quebra do renderer (nunca falha de asserção). Nas duas execuções finais o gate passou 19/19 sem precisar da repetição para aprovar caso algum reprovado por asserção.
- **Massa sintética.** Postos, cargos, funcionários, versões e dimensionamentos são fictícios e o banco descartável foi destruído ao final de cada execução (`QA_PG_TEMP_CLEANED: true`). Os horários nas faixas são o relógio do navegador no instante da resposta; não são persistidos nem estimados.
- **Esta fatia fecha somente os estados de leitura dos cinco grupos de `/admin/operacao` e não conclui a UX-PRO-07.** A escrita da ciência (subfatia seguinte da 07D) e as fatias 07E–07M permanecem pendentes no mapa mestre, cada uma exigindo reavaliação contra a `main` vigente antes de ser iniciada.
- **Nada aqui é aprovação humana.** “Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu”. Este relatório não declara conformidade WCAG integral, não conclui a UX-PRO-07 e não autoriza as fatias seguintes.

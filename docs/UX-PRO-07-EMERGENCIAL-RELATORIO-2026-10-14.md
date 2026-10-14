# UX-PRO-07B-1 — leitura honesta e habilitação das ações em `/admin/emergencial`

**Data:** 14/10/2026

**Base:** `d2b79e43e63d76336be7f1cf717d8164c07c5ec6` (`origin/main`, merge da PR #222).

**Escopo registrado antes de editar a tela:** [`UX-PRO-07-ESCOPO-EMERGENCIAL-ANTES-2026-10-14.md`](UX-PRO-07-ESCOPO-EMERGENCIAL-ANTES-2026-10-14.md), commit isolado `7f9e4a2`.

**Status:** relatório da subfatia UX-PRO-07B-1 depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG.

## 1. Resultado da fatia

A tela `/admin/emergencial` passou a tratar a leitura canônica (`GET /api/ext/emergency/channels` e `GET /api/ext/emergency/channels/:id`) como recurso com estado próprio — “ainda não lido”, lendo, pronto, falha, negativa — em vez de uma única variável de erro e um vazio prematuro. O vazio só existe depois de resposta válida; falha transitória de releitura preserva o último dado, declara a hora da última leitura concluída e oferece repetição real; `401`/`403` depois do sucesso falham fechado, sem manter canal ou trilha protegidos; resposta `2xx` malformada nunca vira ausência de canais. Os quatro botões da jornada canônica de ativação só ficam habilitados com leitura bem-sucedida, não desatualizada e seleção válida, e declaram o motivo do bloqueio. Métodos, corpos, `Idempotency-Key`, transições, autorização, auditoria e tenancy permaneceram intactos.

Arquivos desta fatia:

| Arquivo | Papel | Linhas |
| --- | --- | --- |
| `src/lib/emergency-request.ts` | transporte de leitura `GET` com classificação de causa (novo) | 122 |
| `src/app/admin/emergencial/EmergencyWorkspace.tsx` | tela reescrita (somente leitura de estado e apresentação) | 439 |
| `src/app/admin/emergencial/EmergencyWorkspace.module.css` | única classe local (rótulo longo de ação) | 9 |
| `tests/ux-emergency-workspace.integration.test.mjs` | gate focal aditivo (novo) | 804 |
| `scripts/qa-ux-emergency-postgres.mjs` | runner com PostgreSQL descartável (novo) | 149 |
| `.github/workflows/ux-emergency-delivery.yml` | workflow do gate (novo) | 45 |
| `package.json` | script `test:ux-emergency:pg` | +1 linha |

## 2. Medição anterior e posterior do gate focal

| Momento | Resultado | Interpretação |
| --- | --- | --- |
| Antes da tela (base `d2b79e4`, gate novo) | **2/12 passaram; 10/12 falharam**, exit 1 | Só a autorização das duas leituras e o nascimento `rascunho` do canal já estavam preservados; não existiam os estados, marcadores, faixa de dado preservado, motivo de bloqueio nem percurso de teclado. Saída integral em [`ux-pro-07-emergencial-evidencias/antes/antes-gate-completo.txt`](ux-pro-07-emergencial-evidencias/antes/antes-gate-completo.txt) e resumo em [`antes-medicoes.json`](ux-pro-07-emergencial-evidencias/antes/antes-medicoes.json). |
| Depois | **12/12 passaram; 0 falharam**, exit 0 | PostgreSQL descartável, HTTP real e Chromium; falhas injetadas apenas em `window.fetch` da página; nenhuma API, permissão ou transição foi afrouxada. `UX_EMERGENCY_TAP_SUMMARY: pass=12 fail=0 skipped=0 todo=0`; `QA_PG_TEMP_CLEANED: true`. |

O resultado anterior é a falha de um **gate novo** contra a implementação antiga — não é regressão de gate herdado, e não substitui a medição herdada da seção 12 do escopo.

## 3. Antes/depois por lacuna registrada

SHA-base = `d2b79e4` (tela de 36 linhas). Implementação final = coluna “Depois”.

| ID | Antes no SHA-base | Depois nesta fatia |
| --- | --- | --- |
| B1 — vazio antes da leitura | `EmergencyWorkspace.tsx:8`, `:33`: `items` começa `[]` e “Nenhum canal canônico configurado.” aparece antes de qualquer resposta. | `EmergencyWorkspace.tsx:42-53` (`ReadState`), `:210-214`, `:331-336` (carregando), `:363-366` (vazio somente em `ready`). |
| B2 — estados misturados | `:8`, `:10-14`, `:20`: um `error` e um `message` para leitura e as quatro mutações, sem carregamento. | `:115-120`, `:126-136`, `:210-214`: estado por recurso (`channels`/`detail`) e faixa própria de escrita (`:305-306`). |
| B3 — falha sem classificação nem repetição | `:10-11`: `throw new Error(d.error || …)` capturado uma única vez; sem causa orientada à tarefa. | `src/lib/emergency-request.ts:28-77` classifica rede/401/403/5xx/resposta inesperada; `:95-122` executa o `GET`; `EmergencyWorkspace.tsx:338-350` apresenta `UiState` e repetição apenas quando `canRetry`. |
| B4 — 2xx malformada vira vazio | `:10`: `setItems(d.items || [])`. | `src/lib/emergency-request.ts:79-88` (`invalidEmergencyResponse`); `EmergencyWorkspace.tsx:150-163` trata resposta sem `items` como falha, nunca como ausência. |
| B5 — releitura esconde/omite o antigo | `:10-13`, `:20`: sem hora da última leitura em nenhum ponto da tela. | `:81-86` (`readTime`), `:166` (`readAt` ao concluir), `:350-361` (faixa com hora da última leitura concluída). |
| B6 — detalhe silencioso | `:14`, `:34`: `if (r.ok) setDetail(d)`; falha não aparece. | `:170-204` (mesma leitura com preservação/fail-closed), `:400-436` (repetição, desatualizado, negado, falha, carregando, sem seleção). |
| B7 — seleção não verificada | `:8`, `:10`, `:26`: `selected` é string livre mesmo se o id sumiu da lista. | `:167` (seleção automática validada contra o conjunto lido), `:211-212` (`selectionValid`), `:214` (`detailForId`). |
| B8 — detalhe não lido ao carregar | `:14`, `:26`: só existe depois de trocar o `select` ou mutar. | `:206-208` (leitura inicial da lista) e `:216-220` (troca de seleção relê a trilha do canal). |
| B9 — sem marca de desatualizado | `:10-13`, `:33`: conteúdo antigo permanece sem aviso. | `:354-361`: faixa `role="alert"` com causa, hora da última leitura e repetição. |
| B10 — sem controle de releitura | `:16-34`: nenhum botão de leitura. | `:320-329` (`Atualizar lista`, mesma URL e mesmo `GET` de `:138`); `:395` (`Atualizar trilha`). |
| B11 — ações sempre habilitadas | `:27-30`: sem `disabled` antes, durante ou depois da leitura. | `:213` (`actionsEnabled`), `:300-303` (quatro botões com `disabled` e `aria-describedby`). |
| B12 — motivo genérico | `:13`: “Selecione um canal.” para todos os casos. | `:94-112` (`blockedReason`), `:295-297` (motivo declarado em região `role="status"`). |
| B13 — seleção sem explicação | `:26`: `select` nunca desabilitado. | `:283-293`: `disabled={!hasOptions}` com opções “Selecione”/“Nenhum canal lido”. |
| B14 — formulário de criação | `:9`, `:12`, `:22-25`. | Preservado: `:222-236` (mesmo verbo, corpo, `Idempotency-Key`), `:253-257` (mesmos campos `required`), `:269-282`. |
| B15 — teclado e semântica | `:5-35`: sem `onKeyDown`, `tabIndex`, `.focus()` ou semântica de grupo. | `:261-306` usa primitivas com foco visível, `role="status"`/`role="alert"` e `UiBadge` com `srPrefix` (`:373`); evidência `emergencial-390-teclado.png` (21 passos, `firstFocus: true`). |
| B16 — trilha como JSON cru | `:34`: `<pre>` com JSON completo. | **Aberto.** `:386-437` ganhou estados honestos e título canônico, mas o conteúdo continua sendo o JSON canônico; resumo legível e separação trilha/diagnóstico ficam para a próxima subfatia. |
| B17 — ajuda/obrigatoriedade dos campos | `:15`, `:22-24`. | **Preservado.** `:253-257` mantém rótulo + `required`; ajuda, unidade e obrigatoriedade visível não fazem parte desta subfatia. |
| B18 — nunca medido em navegador | CSV vigente: `marcadores_teclado = nao`, sem captura. | CSV regenerado: `marcadores_teclado = sim`, `capturas_primeiro_foco = sim`, stage `ux-pro-07-emergencial`; evidência de teclado em 390 px. |

## 4. Provas do gate novo

`npm run test:ux-emergency:pg` cobre doze casos (`tests/ux-emergency-workspace.integration.test.mjs`):

1. `:396` anônimo recebe 401 e papel `rh` sem permissão recebe 403 nas **duas** leituras; `admin` recebe 200 (autorização preservada, não afrouxada).
2. `:414` leitura não concluída não é vazio (`data-ui-state="loading"`); o vazio só aparece depois da resposta e declara que a consulta foi concluída.
3. `:438` EXT-15 cria o canal sintético pela API real e ele nasce `rascunho`.
4. `:447` falha inicial 503 declara causa/código reais e `Tentar novamente` emite nova leitura de verdade (`calls.list >= 2`).
5. `:473` falha de releitura preserva a lista e a hora; um canal criado pela API durante a falha **não** entra no recorte preservado e só aparece após repetição bem-sucedida.
6. `:515` 403/401 depois do sucesso removem lista e trilha, não viram faixa de desatualizado e não oferecem repetição (fail-closed).
7. `:549` resposta `2xx` malformada (`{note}` sem `items`) vira causa declarada, nunca vazio.
8. `:563` ações bloqueadas com motivo declarado durante a leitura e liberadas só depois de ler e selecionar; dado desatualizado volta a bloquear.
9. `:620` a transição canônica `rascunho → em_teste` continua idêntica quando a ação é liberada (mesmo verbo, corpo e `Idempotency-Key`).
10. `:654` teclado alcança seleção e as quatro ações com foco visível, e trocar de canal relê a trilha.
11. `:738` 320/390/768/1440 px, tema noturno pelo controle real, alvos e contrastes medidos.
12. `:785` contraste claro/noturno da falha inicial, sem vazio falso.

Nenhuma asserção herdada de `tests/ext15-emergency.test.mjs`, `tests/ext15-emergency.integration.test.mjs`, `tests/l06-delivery.integration.test.mjs` ou `tests/l08-delivery.integration.test.mjs` foi editada, removida ou relaxada; o gate é estritamente aditivo.

## 5. Evidências visuais e medições

A pasta [`ux-pro-07-emergencial-evidencias/`](ux-pro-07-emergencial-evidencias/) contém doze entradas vigentes no [`resumo.json`](ux-pro-07-emergencial-evidencias/resumo.json). Toda entrada registra `estado`, `motivoAcao` (motivo de bloqueio ou habilitação), `overflowDocumentoPx` e `menorAlvoPx`, e `problems` é **derivado** dessas medições pelo próprio gate (`tests/ux-emergency-workspace.integration.test.mjs:259-312`: transbordo > 1 px, alvo < 44 px ou contraste “contraste*” < 4,5:1 viram problema declarado).

- `emergencial-1440-vazio.png` — vazio concluído, 1440×900, dia;
- `emergencial-1440-falha-inicial.png` — falha inicial 503, 1440×900, dia;
- `emergencial-1440-desatualizado.png` — releitura falhou com lista preservada, 1440×900, dia;
- `emergencial-1440-acoes-bloqueadas.png` — leitura em andamento, 1440×900;
- `emergencial-1440-acoes-liberadas.png` — pronto com ações liberadas, 1440×900;
- `emergencial-390-teclado.png` — percurso de teclado, 390×844 (`firstFocus: true`, 21 passos);
- `emergencial-{1440,768,390,320}-dia.png` — repouso nas quatro larguras, tema dia;
- `emergencial-768-noite.png` — repouso em 768×1024, tema noite;
- `emergencial-1440-falha-inicial-noite.png` — falha inicial no tema noite, com o mesmo estado medido no tema claro.

Medições produzidas pelo navegador (todas as entradas com `problems: []`):

| Medição | Antes (escopo, §7/§8) | Depois |
| --- | --- | --- |
| Overflow do documento em 320/390/768/1440 (dia) | 122 px / 190 px em 390/320 | **0 px** nas quatro larguras |
| Overflow em 768 no tema noite | 0 px | **0 px** |
| Menor alvo dentro de `[data-task-workspace]` | 44 px nos controles da tela (24 px só no envelope do `AdminGate`, fora do escopo) | **44 px** em todas as larguras e em todos os estados capturados |
| Contraste `kicker` “EXT-15 · F11” no tema noite | **3,20:1** | **7,96:1** |
| Contraste do aviso “Limite da prova” no tema noite | **1,81:1** | **5,95:1** |
| Contraste da faixa de ações no tema noite | — | **7,96:1** |
| Contraste do título `h1` no tema noite | 12,92:1 | 12,92:1 |
| Contraste da faixa de dado desatualizado (dia) | — (faixa não existia) | **14,33:1** |
| Contraste da falha inicial (dia/noite) | noite **1,98:1** | dia **5,70:1** / noite **6,67:1** |
| Cores fixas inline no DOM durante o tema noturno | `rgb(100,116,139)`, `rgb(255,247,237)`, `rgb(203,213,225)`, `rgb(221,221,221)`, `rgb(248,250,252)` | **0 ocorrências** |
| `problems` no `resumo.json` | — | `[]` nas 12 entradas |

O texto e os rótulos dos estados (carregando, vazio, falha, negado, desatualizado, bloqueio, liberação) são neutros e orientados à tarefa; nenhum dado, permissão, mutação ou regra de negócio foi inventado.

Nota de método: as medições “depois” vêm do `resumo.json` gerado pelo próprio gate; as medições “antes” de contraste, overflow e cores fixas inline vêm da execução ad-hoc registrada na seção 8 do escopo (Chromium real, sessão `admin`, servidor e PostgreSQL descartáveis, script não versionado que **não** é gate), e a ausência de cores fixas inline no DOM depois foi reconferida em uma segunda execução ad-hoc com o mesmo método.

## 6. Inventário regenerado — somente a rota justificada

O gerador foi executado e a comparação estruturada com os snapshots anteriores mostrou alteração **apenas** em `/admin/emergencial` (linha 16 dos dois CSVs):

- `componentes_ui_compartilhados`: `UiTaskWorkspace` → `UiBadge|UiState|UiTaskWorkspace`;
- `estilos_ui_compartilhados`: vazio → `UiWorkspace`;
- `estados_carregando` / `estados_erro`: `nao` → `sim`;
- `marcadores_teclado`: `nao` → `sim`;
- `gates_automatizados` / `gates_jobs`: vazio → `ux-emergency-delivery.yml` / `ux-emergency-postgres-browser`;
- `capturas_viewports`: vazio → `1440x900|320x844|390x844|768x1024`; `capturas_stage`: vazio → `ux-pro-07-emergencial`; `capturas_primeiro_foco`: `nao` → `sim`;
- matriz: `classe_evidencia` `codigo` → `captura visual`, com as células de gate, captura, teclado e estados atualizadas.

Nenhuma outra rota mudou, e o `--check` confirma que os CSVs correspondem ao código atual. Nenhum CSV foi editado à mão.

**Limitação do inventário estático:** o gerador atual escreve “tema noturno sem captura” e “estados nao exercitados em navegador” para toda rota administrativa, sem ler `entry.theme` nem os casos de estado do `resumo.json`. Por isso a linha 16 ainda contém essas lacunas genéricas, embora o gate e a evidência desta fatia registrem tema noturno, vazio, falha, desatualizado, bloqueio e liberação. O gerador não foi ampliado nesta fatia para não misturar uma mudança global de metodologia com a tela de emergencial.

## 7. Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `/admin/emergencial` presente (`○ Static`) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 rotas |
| `npm run test:ux-emergency:pg` (gate focal novo) | **12/12**, `UX_EMERGENCY_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ext15-emergency:pg` (gate herdado da rota) | **18/18**, `EXT15_EMERGENCY_TEST_EXIT: 0`, `QA_EXT15_PG_TEMP_CLEANED: true` |
| `npm run test:l06-delivery:pg` | **9/9**, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | **51/51**, `L08_DELIVERY_TEST_EXIT: 0` |
| `git diff --check` | limpo |
| `next-env.d.ts` / `tsconfig.json` | restaurados por `git checkout --` após os gates Next; SHA-256 finais `18b697c4…` / `2128c956…` |

## 8. Limitações explícitas

- A evidência visual usa a identidade `admin`. Os papéis `ti` e as negativas `401/403` foram exercitados no servidor pelo gate (casos 1 e 6), não em captura de navegador; a decisão real de autorização continua no servidor e não foi alargada.
- As falhas de leitura são injetadas em `window.fetch` dentro da página. As **mutações** (criação, testes, transições) saem para o servidor real nos casos 3 e 9; estados de envio pendente, prevenção de duplo clique e reconciliação de resultado de mutação ficam para a subfatia seguinte da 07B.
- `problems` é derivado de medições automáticas de transbordo, dimensão mínima de alvo e contraste; não é auditoria WCAG completa e não cobre foco, seleção nem componentes montados depois da captura.
- Os casos B16 (resumo legível da trilha) e B17 (ajuda/obrigatoriedade dos campos) permanecem abertos e foram mantidos fora desta subfatia.
- A massa é fictícia e o banco descartável foi destruído ao final (`QA_PG_TEMP_CLEANED: true`); horários nas faixas são o relógio real no instante da resposta.
- Não houve validação manual, homologação, revisão humana nem aceite humano; este relatório não declara conformidade WCAG nem aprova as subfatias seguintes.

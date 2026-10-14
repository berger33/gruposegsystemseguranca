# UX-PRO-07B-2 — envio pendente, duplo clique e reconciliação de escrita em `/admin/emergencial`

**Data:** 14/10/2026

**Base:** `a16ab71d4f7b91f151d4eb117f3d5420b94113c5` (`origin/main`, merge da PR #223/UX-PRO-07B-1).

**Escopo registrado antes de editar a tela:** [`UX-PRO-07B-2-ESCOPO-ANTES-2026-10-14.md`](UX-PRO-07B-2-ESCOPO-ANTES-2026-10-14.md), commit isolado `72ef89f`.

**Status:** relatório da subfatia UX-PRO-07B-2 depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG.

## 1. Resultado da subfatia

A tela `/admin/emergencial` passou a tratar as cinco mutações canônicas (criação, iniciar ciclo de testes, registrar teste de recebimento, registrar teste de atendimento e marcar ativo) como operações com estado próprio — "enviando" com `aria-busy` e região `role="status"`, falha classificada com o código real do servidor, sucesso somente com corpo `2xx` validado — em vez de dois strings soltos (`error`/`message`) sem qualquer indicação de envio. Uma guarda síncrona (ref) e o `disabled` durante o envio bloqueiam o segundo clique: duplo clique não dispara segundo POST. A reconciliação de resultado valida o corpo antes de declarar sucesso (`channel.id` na criação e na transição; `readiness`+`status` no teste); `2xx` malformada vira falha declarada (`invalid_emergency_write_response`), nunca sucesso, nunca vazio e sem derrubar a tela; `401`/`403` de escrita falham fechados (a releitura da lista limpa o dado protegido pelo caminho existente); falha transitória (5xx/rede) preserva a leitura, declara que não é possível afirmar se a escrita foi aplicada e aponta para a releitura segura, sem repetir o POST automaticamente.

Verbo, URL, corpo, cabeçalho `Idempotency-Key` (mesmos geradores `create`/`testing`/`receipt`/`attendance`/`activate`), transições canônicas, autorização, auditoria e tenancy permaneceram intactos; nenhum arquivo de servidor foi tocado.

Arquivos desta subfatia:

| Arquivo | Papel | Linhas |
| --- | --- | --- |
| `src/lib/emergency-request.ts` | transporte de leitura (existente) + escrita com classificação de causa (aditivo) | 227 |
| `src/app/admin/emergencial/EmergencyWorkspace.tsx` | estados de escrita, guarda de envio e faixa de resultado (reescrita restrita ao caminho de escrita e apresentação local) | 516 |
| `tests/ux-emergency-workspace.integration.test.mjs` | gate focal aditivo: 12 casos da 07B-1 + 6 novos de escrita | 1069 |
| `scripts/qa-ux-emergency-postgres.mjs` | mínimo de casos do runner 12 → 18 | 1 |
| `package.json` | inalterado (o script `test:ux-emergency:pg` já existia) | 0 |

## 2. Medição anterior e posterior do gate focal

| Momento | Resultado | Interpretação |
| --- | --- | --- |
| Antes da subfatia (base `a16ab71`, gate com 18 casos) | **12/18 passaram; 6/18 falharam**, exit 1 | Os 12 casos de leitura da 07B-1 continuaram passando; nenhum dos seis estados de escrita existia (sem `emergencial-escrita-enviando`, sem classificação, sem validação de corpo, sem fail-closed de escrita). Saída integral em [`ux-pro-07-emergencial-evidencias/antes-07b-2/antes-gate-completo.txt`](ux-pro-07-emergencial-evidencias/antes-07b-2/antes-gate-completo.txt) e resumo em [`antes-medicoes.json`](ux-pro-07-emergencial-evidencias/antes-07b-2/antes-medicoes.json). |
| Depois | **18/18 passaram; 0 falharam**, exit 0 | PostgreSQL descartável, HTTP real e Chromium; falhas de escrita injetadas apenas em `window.fetch` da página; nenhuma API, permissão ou transição foi afrouxada. `UX_EMERGENCY_TAP_SUMMARY: pass=18 fail=0 skipped=0 todo=0`; `QA_PG_TEMP_CLEANED: true`. |

O resultado anterior é a falha de **casos novos** contra a implementação antiga — não é regressão de gate herdado, e não substitui a medição herdada da seção 6 do escopo.

## 3. Antes/depois por lacuna registrada

SHA-base = `a16ab71` (escrevia via `fetch` inline com `error`/`message` strings). Implementação final = coluna "Depois".

| ID | Antes no SHA-base | Depois nesta subfatia |
| --- | --- | --- |
| M1 — sem estado de envio pendente | `EmergencyWorkspace.tsx:222-234`, `:237-250`, `:276`, `:300-303`: sem flag de envio; os cinco botões de escrita clicáveis durante o POST; nada declara o envio. | `:58-74` (`WriteState`/`WRITE_ACTION_NAMES`), `:137` (estado), `:245-254` (`runWrite`), `:373-375` (faixa `role="status"` com a ação em curso), `:344`, `:368-371` (`disabled` + `aria-busy` nos cinco controles de escrita). |
| M2 — sem prevenção de duplo clique | `:44` (`idem()` por envio), `:237-250`: dois cliques → dois POSTs com keys diferentes; na transição o segundo viaja e é recusado com `invalid_transition`; no teste o segundo cria **registro duplicado** no servidor. | `:143` (`sendingRef`), `:245-248` (guarda síncrona antes do primeiro `await`) + `disabled` durante o envio; casos 13 e 14 do gate provam exatamente 1 POST por duplo clique em criação e transição. |
| M3 — sem reconciliação de resultado | `:230-234` (`d.channel.id` lança `TypeError` em 2xx malformada), `:246-250` (`setMessage(d.note)` com `d.note` indefinida e releitura mesmo assim); `r.json().catch(() => ({}))` engole corpo não-JSON. | `src/lib/emergency-request.ts:192-227` (`emergencyWrite` lê o corpo e devolve o descritor), `:273-293` (validação `channel.id` na criação), `:295-322` (validação `channel.id`/`readiness`+`status` nas ações); `2xx` malformada → `invalidEmergencyWriteResponse` (`:176-185`), sem releitura de reconciliação, sem crash (caso 17). |
| M4 — sem classificação de falha de escrita | `:231`, `:247`: string crua `d.error` (`invalid_transition`, `forbidden`) ou genérico `Falha em <label>`. | `src/lib/emergency-request.ts:125-174` (`describeEmergencyWriteError`: rede/401/403/5xx/outro com o código real), `:187-190` (detalhe com código de diagnóstico); a faixa `role="alert"` (`:376-381`) mostra título + causa + código. |
| M5 — sem fail-closed em 401/403 de escrita | `:231`, `:247`: a negativa vira texto na faixa única; lista e trilha protegidas continuam visíveis e aparentemente válidas. | `:256-263` (`failWrite` dispara `loadChannels()`; o caminho de leitura existente limpa seleção, lista e trilha e apresenta a negativa sem repetição); caso 16 do gate prova a remoção de lista, trilha e botões de repetição. |
| M6 — falha transitória sem orientação | `:231`, `:247`: erro genérico; nada declara que o resultado da escrita é incerto nem aponta para a releitura segura. | `src/lib/emergency-request.ts:128-135` e `:157-164` (detalhes que declaram a incerteza e orientam "releia a lista e a trilha…"); caso 15 do gate prova preservação da lista com a hora, ausência de repetição automática do POST e ações liberadas de volta (leitura ainda válida). |
| M7 — faixa única para as cinco mutações | `:118-119`, `:305-306`: `error`/`message` strings compartilhadas; a ação em curso/falha não era identificável. | `:137` (`write` com `action`), `:373-375` (faixa de envio nomeia a ação por `WRITE_ACTION_NAMES`), `:376-383` (falha e sucesso por ação, com testids próprios). |
| M8 — sem captura de estado de escrita | gate da 07B-1: 12 casos, todos de leitura; `resumo.json` sem nenhuma entrada de escrita. | casos 13–18 do gate; 7 capturas novas em [`ux-pro-07-emergencial-evidencias/`](ux-pro-07-emergencial-evidencias/) (`-enviando` 1440/390/768-noite, `-escrita-falha-transitoria` 1440, `-escrita-negada`, `-escrita-resposta-invalida`, `-320-escrita-falha`); `resumo.json` agora com 19 entradas e `problems: []` em todas. |

## 4. Provas do gate novo

`npm run test:ux-emergency:pg` cobre agora dezoito casos; os seis novos da subfatia:

1. `:823` (caso 13) envio pendente da criação bloqueia as quatro ações e o formulário, declara `aria-busy` e a região `role="status"`; duplo clique envia **exatamente 1 POST**; o corpo da criação mantém `name`, `channel_type` e `escalation_steps` canônicos e a `Idempotency-Key` `ext15-ui-create-…`; a reconciliação mostra o canal novo na lista, move a seleção e relê a trilha.
2. `:872` (caso 14) transição com envio pendente mantém o corpo `{status:"em_teste"}` e a key `ext15-ui-testing-…` idênticos; duplo clique não envia segunda transição; a trilha relida confirma `em_teste`.
3. `:907` (caso 15) falha 503 de escrita declara o código `emergency_write_unavailable`, que o resultado é incerto e a releitura segura; a lista preservada mantém a hora da última leitura; nenhum POST é reenviado sozinho; as ações voltam a ser liberadas com a leitura ainda válida; o servidor confirma que o canal segue `rascunho`.
4. `:945` (caso 16) `403` na escrita com a leitura negada falha fechada: a faixa declara a negativa, a lista e a trilha protegidas saem da tela, o estado de negativa não oferece repetição e as ações ficam bloqueadas.
5. `:983` (caso 17) `2xx` malformada na transição não vira sucesso nem vazio, não dispara releitura de reconciliação e mantém a lista visível; a criação com corpo sem `channel.id` não derruba a tela (título permanece) e não apresenta sucesso.
6. `:1017` (caso 18) envio pendente medido em 390 px dia e 768 px noite (contraste da faixa medido ≥ 4,5:1) e falha de escrita em 320 px, com overflow do documento 0 px, menor alvo 44 px em todas as capturas.

Nenhuma asserção dos 12 casos da 07B-1 foi editada, removida ou relaxada; nenhuma asserção herdada de `tests/ext15-emergency*.test.mjs`, `tests/l06-delivery.integration.test.mjs` ou `tests/l08-delivery.integration.test.mjs` foi tocada; o gate é estritamente aditivo.

## 5. Evidências visuais e medições

A pasta [`ux-pro-07-emergencial-evidencias/`](ux-pro-07-emergencial-evidencias/) contém dezenove entradas vigentes no [`resumo.json`](ux-pro-07-emergencial-evidencias/resumo.json) — as doze da 07B-1 (regeneradas pela mesma execução do gate) mais as sete novas da subfatia. Toda entrada registra `estado`, `motivoAcao`, `overflowDocumentoPx` e `menorAlvoPx`, e `problems` é **derivado** dessas medições pelo próprio gate (`tests/ux-emergency-workspace.integration.test.mjs:259-312`): transbordo > 1 px, alvo < 44 px ou contraste "contraste*" < 4,5:1 viram problema declarado.

Novas entradas desta subfatia (todas com `problems: []`):

- `emergencial-1440-enviando.png` — criação em envio, 1440×900, dia (ações e formulário bloqueados, `aria-busy`);
- `emergencial-390-enviando.png` — transição em envio, 390×844, dia;
- `emergencial-768-noite-enviando.png` — teste de recebimento em envio, 768×1024, tema noite (contraste da faixa medido);
- `emergencial-1440-escrita-falha-transitoria.png` — falha 503 de escrita com lista preservada;
- `emergencial-320-escrita-falha.png` — falha de escrita em 320×844 (tema noite, do percurso do caso 18);
- `emergencial-1440-escrita-negada.png` — 403 de escrita em fail-closed (lista e trilha removidas);
- `emergencial-1440-escrita-resposta-invalida.png` — `2xx` malformada na escrita.

Medições produzidas pelo navegador:

| Medição | Valor medido |
| --- | --- |
| Overflow do documento nas 7 capturas novas (320–1440 px, dia/noite) | **0 px** |
| Menor alvo dentro de `[data-task-workspace]` nas capturas novas | **44 px** |
| Contraste da faixa de envio no tema noite (768 px) | **≥ 4,5:1** (medido no caso 18; valor exato no `resumo.json`) |
| `problems` no `resumo.json` | `[]` nas 19 entradas |

As capturas de repouso da 07B-1 (`-vazio`, `-falha-inicial`, `-desatualizado`, `-acoes-*`, `-dia` 320/390/768/1440, `-768-noite`, `-falha-inicial-noite`, `-390-teclado`) foram regeneradas pela mesma execução do gate com a implementação final.

## 6. Inventário

`node scripts/ux-pro-00-inventory.mjs --check` confirma que os dois CSVs vigentes (`docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv` e `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`) correspondem ao código atual **sem alteração de células** nesta subfatia: a linha 16 (`/admin/emergencial`) já registrava gate, capturas, estados e teclado desde a 07B-1, e a subfatia não acrescentou componente compartilhado, estágio de captura ou viewport novos (mesma stage `ux-pro-07-emergencial`, mesmas larguras). Nenhum CSV foi editado à mão.

**Limitação do inventário estático:** o gerador atual continua escrevendo as lacunas genéricas "tema noturno sem captura" e "estados não exercitados em navegador" para toda rota administrativa, sem ler `entry.theme` nem os casos de estado do `resumo.json`. O gerador não foi ampliado nesta subfatia para não misturar uma mudança global de metodologia com a tela de emergencial (mesma decisão registrada nas fatias 07A e 07B-1).

## 7. Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `/admin/emergencial` presente (`○ Static`) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 rotas |
| `npm run test:ux-emergency:pg` (gate focal, agora 18 casos) | **18/18**, `UX_EMERGENCY_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ux-emergency:pg` contra a implementação anterior | 12/18, exit 1 (registro em `antes-07b-2/`) |
| `npm run test:ext15-emergency:pg` (gate herdado da rota) | **18/18**, `EXT15_EMERGENCY_TEST_EXIT: 0`, `QA_EXT15_PG_TEMP_CLEANED: true` |
| `npm run test:l06-delivery:pg` | exit 0, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | exit 0, `L08_DELIVERY_TEST_EXIT: 0` |
| `git diff --check` | limpo |
| `next-env.d.ts` / `tsconfig.json` | restaurados após build e gates Next; SHA-256 `18b697c4…` / `2128c956…` |

## 8. Limitações explícitas

- A evidência visual usa a identidade `admin`. Os papéis `ti` e as negações `401/403` foram exercitados no servidor pelo gate (casos 1, 15 e 16), não em captura de navegador para cada papel; a decisão real de autorização continua no servidor e não foi alargada.
- As falhas de escrita são injetadas em `window.fetch` dentro da página; os POSTs de sucesso (casos 13, 14 e 18) saem para o servidor real, com payload, idempotência, auditoria e transição canônica verificadas em banco.
- A medição ad-hoc registrada na seção 4 do escopo (duplo clique = 2 POSTs reais; erro cru `invalid_transition`; estado `em_teste` com 2 eventos de auditoria) veio de um script não versionado, interrompido por instabilidade do renderer; o registro formal e reprodutível dos defeitos é a execução `antes-07b-2` do gate.
- `problems` é derivado de medições automáticas de transbordo, dimensão mínima de alvo e contraste; não é auditoria WCAG completa e não cobre foco, seleção nem componentes montados depois da captura.
- Os casos B16 (resumo legível da trilha) e B17 (ajuda/obrigatoriedade visível dos campos) permanecem abertos, assim como a eventual subfatia seguinte da 07B; nada aqui os aprova.
- A massa é fictícia e o banco descartável foi destruído ao final (`QA_PG_TEMP_CLEANED: true`); horários nas faixas são o relógio real no instante da resposta.
- Não houve validação manual, homologação, revisão humana ou aceite humano; este relatório não declara conformidade WCAG nem aprova as fatias seguintes.

# UX-PRO-07C-1 — estados honestos de leitura em `/admin/fornecedores`

**Data:** 14/10/2026

**Base:** `ba2a06f8e0fd2827615af3e299b87c58ddcf92e3` (`origin/main`, merge da PR #225, continuação B16/B17 da UX-PRO-07B-2).

**Escopo registrado antes de editar a tela:** [`UX-PRO-07C-1-ESCOPO-ANTES-2026-10-14.md`](UX-PRO-07C-1-ESCOPO-ANTES-2026-10-14.md), commit isolado `134b4aa`.

**Status:** relatório da subfatia depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG integral nem conclui a UX-PRO-07.

## 1. Resultado da subfatia

A tela `/admin/fornecedores` passou a tratar as quatro leituras canônicas — `GET /api/ext/supplier/references`, `GET /api/ext/supplier/quotations`, `GET /api/ext/supplier/orders` e `GET /api/ext/supplier/quotations/:id` — como recursos com estado próprio (“ainda não lido”, lendo, pronto, falhou, negado), em vez de um único booleano `loading` e duas strings (`error`/`denied`) compartilhadas com as nove mutações.

O vazio só existe depois de resposta `2xx` válida e declara que a consulta foi concluída. Falha transitória de releitura preserva o conteúdo lido, informa a hora local da última leitura concluída e oferece repetição real. `401`/`403` depois do sucesso falham fechado: listas, detalhe e formulários saem da tela. Resposta `2xx` sem a chave canônica vira falha declarada, nunca ausência de registros. Selecionar uma cotação relê **somente** o detalhe, sem relançar as três leituras de lista.

Verbos, URLs, corpos, cabeçalho `Idempotency-Key`, rótulos das chaves (`create`, `testing`, `receipt`, `attendance`, `activate` — no caso desta rota, os rótulos próprios de `mutate`), transições canônicas, autorização, auditoria e tenancy permaneceram intactos; nenhum arquivo de servidor foi tocado.

Arquivos desta subfatia:

| Arquivo | Papel | Linhas |
| --- | --- | --- |
| `src/lib/supplier-read.ts` | transporte de leitura com classificação de causa (novo; só leitura) | 125 |
| `src/app/admin/fornecedores/FornecedoresWorkspace.tsx` | máquina de estado das quatro leituras e apresentação com tokens (reescrita restrita ao caminho de leitura e à apresentação) | 753 |
| `src/app/admin/fornecedores/FornecedoresWorkspace.module.css` | apresentação local da rota (novo) | 97 |
| `tests/ux-supplier-workspace.integration.test.mjs` | gate focal: 2 casos estáticos herdados + 8 casos de navegador | 593 |
| `scripts/qa-ux-supplier-postgres.mjs` | runner com auditoria TAP e mínimo de casos 2 → 10 | +38 |
| `docs/ux-pro-07-fornecedores-evidencias/` | 9 capturas + `resumo.json` + medição `antes/` | — |

## 2. Medição anterior e posterior do gate focal

| Momento | Resultado | Interpretação |
| --- | --- | --- |
| Antes da tela (base `ba2a06f`, gate novo com 10 casos) | **3/10 passaram; 7/10 falharam**, exit 1 | Os dois casos estáticos herdados e o caso de autorização no servidor já passavam; nenhum dos oito estados de leitura existia na tela. Saída integral em [`ux-pro-07-fornecedores-evidencias/antes/antes-gate-completo.txt`](ux-pro-07-fornecedores-evidencias/antes/antes-gate-completo.txt) e resumo em [`antes-medicoes.json`](ux-pro-07-fornecedores-evidencias/antes/antes-medicoes.json). |
| Depois (1ª execução) | **10/10 passaram; 0 falharam**, exit 0 | PostgreSQL descartável, HTTP real e Chromium; falhas injetadas somente em `window.fetch` da página. `UX_SUPPLIER_TAP_SUMMARY: pass=10 fail=0 skipped=0 todo=0 minimo_exigido=10`; `QA_PG_TEMP_CLEANED: true`. |
| Depois (2ª execução) | **10/10 passaram; 0 falharam**, exit 0 | Repetição independente para descartar aprovação ocasional. |

O resultado anterior é a falha de **casos novos** contra a implementação antiga — não é regressão de gate herdado, e não substitui a medição herdada da seção 4 do escopo.

## 3. Antes/depois por lacuna registrada

SHA-base = `ba2a06f` (tela de 228 linhas, cores fixas inline). Implementação final = coluna “Depois”.

| ID | Antes no SHA-base | Depois nesta subfatia |
| --- | --- | --- |
| C1 — um `loading` para três leituras | `:42`, `:66`, `:77`, `:165`: booleano único e um parágrafo genérico; o detalhe não tinha estado. | `:33-49` (`ReadState` por recurso), `:110-112` (estados, ref e contador de requisição), `:144-183` (`readResource` com descarte de resposta superada), `:299-302`, `:321-344` (`resourceBand` por recurso com `data-testid` próprio). |
| C2 — erro sem classificação nem código | `:44`, `:76`, `:85`, `:94`, `:167`: string única para leitura e escrita; “Repetir carregamento” oferecido sempre; `canRetry` do vocabulário nunca consultado. | `src/lib/supplier-read.ts:25-74` classifica rede/401/403/5xx/408/429/outro com o código real do servidor; `:88-92` (`supplierReadErrorDetail`); `:338` (repetição somente quando `canRetry`); `:358` (mesma regra na faixa de desatualizado). |
| C3 — 2xx malformada vira vazio | `:73-74`: `references.suppliers \|\| []`, `quotationData.quotations \|\| []`, `orderData.orders \|\| []`. | `:174-181` (`invalidSupplierResponse`) aplicado por `validate` em `:186-213`; `supplier-read.ts:77-86` (código `invalid_supplier_response`). O detalhe exige `quotation.id` (`:210`). |
| C4 — releitura sem marcação | `:66-77`: nenhuma limpeza nem marcação no `catch`. | `:144-183` preserva o `ready` anterior e só substitui em falha fechada; `:346-362` (`staleBand`) declara a causa, o código e que o conteúdo pode estar desatualizado. |
| C5 — negativa não falhava fechado | `:45`, `:166`: a faixa aparecia e as listas continuavam renderizadas abaixo. | `:132-142` (`failClosed` limpa listas, detalhe, seleção e formulário), `:107` (`denied`), `:384-392` (ramo único de negativa, sem lista, sem detalhe e sem botão de repetição). |
| C6 — sem hora da última leitura | ausente. | `:186-213` gravam `readAt` por recurso; `:85-87` (`readTime`, localidade explícita); `:307-311` e `:405-407` (hora das listas); `:439`, `:488`, `:692`, `:549` (hora por recurso). |
| C7 — seleção relançava as três listas | `:75`, `:78`, `:80`, `:190`: `load` dependia de `selectedId` e o efeito rodava a cada mudança. | `:218-221` (`refreshLists` com exatamente os três `GET`s da carga), `:222` (efeito de montagem), `:226` (efeito de seleção relê **somente** o detalhe). Caso 9 do gate prova que os contadores das três listas não mudam. |
| C8 — nenhum estado em navegador | `tests/ux-supplier-workspace.integration.test.mjs:6-10`: 2 casos estáticos, sem Chromium. | `:341-593` do teste: 8 casos de navegador com PostgreSQL descartável, HTTP real e Chromium. `scripts/qa-ux-supplier-postgres.mjs` passa a auditar o resumo TAP e exigir 10 casos. |
| C9 — sem 320/768/noite/teclado | CSV linha 20: `faltam 320px, 768px`; `percurso completo nao verificado`. | Caso 10: 1440/768/390/320 px, tema noturno pelo controle real do envelope e percurso de teclado registrado; 9 capturas em [`ux-pro-07-fornecedores-evidencias/`](ux-pro-07-fornecedores-evidencias/). |
| C10 — cores fixas e noite não medida | `:15-19`, `:163`, `:166-168`, `:171`, `:190`, `:221`: 15 cores hexadecimais inline. | `UiTaskWorkspace` + `UiWorkspace.module.css` + `UiState`/`UiBadge` em `:1-8` e ao longo do JSX; alvos ≥ 44 px e contraste noturno medidos. |
| C11 — abas sem painel | `:170-171`: `role="tablist"` com cinco `role="tab"`, `aria-selected` sempre `index === 0`, sem `aria-controls`, `tabpanel` ou setas. | **Não corrigido.** Ver a seção 8: o defeito foi registrado com `file:line` e depende de decisão explícita do proprietário, porque corrigi-lo reconfigura o layout vigente e passa a ocultar conteúdo hoje sempre visível. Nenhuma asserção foi alterada para acomodá-lo; o trecho segue em `:422-426`. |

## 4. Provas do gate novo

`npm run test:ux-supplier:pg` cobre dez casos (`tests/ux-supplier-workspace.integration.test.mjs`):

1. e 2. `:15` e `:19` — **herdados, sem edição**: a UI continua declarando `<h1>EXT-04 — Fornecedores</h1>`, `role="tablist"`, `data-ui-state="denied"`, `supplierRequest` e `Sem upload real`; e o runner declara injeção de falha por `page.addInitScript` com limpeza em `finally`.
3. `:341` anônimo recebe 401 nas quatro leituras, papel `rh` recebe 403 com o código canônico `forbidden_role` (sem vazar `suppliers`/`quotations`/`orders`/`quotation`), e `admin` recebe 200.
4. `:360` leitura não concluída não é vazio (`data-ui-state="loading"`); o vazio só aparece depois da resposta, com 1,5 s de atraso injetado, e declara que a consulta foi concluída.
5. `:376` falha inicial 503 declara causa e o código `supplier_journey_unavailable`; `Tentar novamente` emite nova leitura de verdade (`calls.quotations >= 2`) e a lista passa a mostrar o protocolo sintético.
6. `:399` falha de releitura preserva a lista e a hora; uma cotação criada pela API durante a falha **não** entra no recorte preservado e só aparece depois da repetição bem-sucedida; a faixa de desatualizado mede contraste ≥ 4,5:1.
7. `:441` 403 depois do sucesso falha fechado: a faixa `data-ui-state="denied"` aparece, listas de cotações e de pedidos e o detalhe saem da tela, não há faixa de desatualizado e não há botão de repetição.
8. `:468` resposta `2xx` sem `quotations` vira falha com o código `invalid_supplier_response`; nenhum vazio é exibido.
9. `:481` clicar na cotação da preparação relê somente o detalhe: os contadores de `references`, `quotations` e `orders` não mudam e o contador de `detail` aumenta.
10. `:501` 1440/768/390/320 px com transbordo do documento 0 px e menor alvo 44 px; tema noturno em 768 px com transbordo 0 px e contraste medido; percurso por Tab em 390 px com primeiro foco visível, gravado no `resumo.json`.

Nenhuma asserção herdada de `tests/ext04-suppliers.test.mjs`, `tests/ext04-suppliers.integration.test.mjs`, `tests/ux-supplier-vocabulary.test.mjs`, `tests/l06-delivery.integration.test.mjs` ou `tests/l08-delivery.integration.test.mjs` foi editada, removida ou relaxada; o gate é estritamente aditivo.

## 5. Evidências visuais e medições

A pasta [`ux-pro-07-fornecedores-evidencias/`](ux-pro-07-fornecedores-evidencias/) contém **9 entradas** vigentes no `resumo.json`, todas com `problems: []`:

- `fornecedores-1440-dia.png`, `fornecedores-768-dia.png`, `fornecedores-390-dia.png`, `fornecedores-320-dia.png` — repouso no tema dia;
- `fornecedores-768-noite.png` — tema noturno pelo controle real do envelope;
- `fornecedores-390-teclado.png` — percurso por Tab (`firstFocus: true`);
- `fornecedores-1440-falha-inicial.png` — falha inicial 503 com o código real;
- `fornecedores-1440-desatualizado.png` — releitura falha com lista preservada e hora;
- `fornecedores-1440-resposta-invalida.png` — `2xx` sem a chave canônica.

| Medição | Resultado |
| --- | --- |
| Transbordo do documento em 320/390/768/1440 px (dia) | **0 px** |
| Transbordo do documento em 768 px (noite) | **0 px** |
| Menor alvo dentro de `[data-task-workspace]` nas quatro larguras | **44 px** |
| Contraste do título no tema noite (768 px) | **12,92:1** |
| Contraste da lista de cotações no tema noite | **12,92:1** |
| Contraste da faixa de dado desatualizado | **14,33:1** |
| `problems` no `resumo.json` | `[]` em todas as 9 entradas |

`problems` é derivado das medições automatizadas do próprio gate (transbordo, menor alvo e contrastes instrumentados). Não é auditoria WCAG completa: não cobre foco em todos os componentes, seleção, nem elementos montados depois da captura.

## 6. Inventário regenerado — somente a rota justificada

O gerador foi executado e a comparação estruturada com os CSVs de `ba2a06f` mostrou alteração **apenas na linha 20 (`/admin/fornecedores`)** dos dois arquivos:

- `componentes_ui_compartilhados`: vazio → `UiBadge|UiState|UiTaskWorkspace`;
- `estilos_ui_compartilhados`: vazio → `UiWorkspace`;
- `estados_erro`: `nao` → `sim`;
- `capturas_viewports`: `1440x900|390x844` → `1440x900|320x844|390x844|768x1024`;
- `capturas_stage`: `ux-09-fornecedores` → `ux-09-fornecedores|ux-pro-07-fornecedores`;
- matriz: `componente`, `responsividade` (`faltam 320px, 768px` → `faltam nenhum`), `teclado` (`percurso completo nao verificado` → `percurso de teclado registrado em navegador (recorte automatizado do gate)`), `estados` (`carregando/erro/vazio`), `evidencia` e `lacuna` atualizadas no mesmo sentido.

Nenhuma outra rota mudou nos CSVs e nenhum CSV foi editado à mão.

**Limitação do inventário estático:** o gerador continua escrevendo “tema noturno sem captura” e “estados não exercitados em navegador” para toda rota administrativa, sem ler `entry.theme` nem os casos de estado do `resumo.json`. Por isso essas duas lacunas genéricas permanecem na linha 20, embora o gate e o `resumo.json` desta fatia registrem noite, falha inicial, dado preservado, negativa e resposta inválida. O gerador não foi ampliado nesta subfatia para não misturar uma mudança global de metodologia com a tela de fornecedores (mesma decisão das fatias 07A, 07B-1 e 07B-2).

## 7. Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `/admin/fornecedores` gerada como rota estática (`○ Static`) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas; diff confinado à linha 20 |
| `npm run test:ext04-suppliers:pg` (gate herdado da rota) | **28/28**, `EXT04_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28`, `QA_EXT04_PG_TEMP_CLEANED: true` |
| `npm run test:ux-supplier:pg` (gate focal, 10 casos) | **10/10** na 1ª e na 2ª execução; `UX_SUPPLIER_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ux-supplier:pg` contra a implementação anterior | **3/10**, exit 1 (registro em `antes/`) |
| `npm run test:l06-delivery:pg` | exit 0, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | exit 0, `L08_DELIVERY_TEST_EXIT: 0` |
| `git diff --check` | limpo |
| integridade de arquivos protegidos após build e gates | `next-env.d.ts` SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` SHA-256 `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` (restaurados) |

## 8. Limitações, fronteiras e decisão pendente

- **C11 (abas sem painel) permanece aberto.** `FornecedoresWorkspace.tsx:422-426` mantém `role="tablist"` com cinco `role="tab"` em que `aria-selected` é sempre `index === 0`, sem `aria-controls`, sem `tabpanel` e sem setas/Home/End. Corrigir exige transformar os cinco rótulos em abas verdadeiras com painéis, o que reconfigura o layout vigente (formulário + lista à esquerda, detalhe/validade/documentos à direita, pedidos abaixo) e passa a ocultar conteúdo hoje sempre visível. Pela regra do repositório de preservar o layout selecionado e não reduzir capacidade por iniciativa própria, a correção **não** foi feita: fica registrada para decisão explícita do proprietário na subfatia seguinte da 07C. Nenhuma asserção foi enfraquecida para acomodar o defeito.
- **Escritas fora do escopo.** Estado de envio pendente, prevenção de duplo clique e reconciliação de resultado das nove mutações não foram tratados: seguem para a subfatia seguinte da 07C, no mesmo padrão da divisão 07B-1/07B-2. A guarda síncrona e as mensagens de chave preservada existentes foram mantidas sem alteração.
- **Autorização.** A evidência visual usa a identidade `admin`. O papel `rh` e as recusas 401/403 foram exercitados no servidor pelo caso 3 do gate, não em captura de navegador para cada papel. A decisão real de autorização continua no servidor e não foi alargada.
- **Injeção de falha.** Todas as falhas de leitura são injetadas em `window.fetch` dentro da página; as escritas de preparação (criação de cotações e catálogo sintético) saem para o servidor real, com payload, idempotência, auditoria e transição canônica verificadas.
- **Inventário estático.** Conforme a seção 6, o gerador não lê tema nem casos de estado; as duas lacunas genéricas permanecem na linha 20 apesar da evidência produzida.
- **Massa sintética.** Fornecedores, produtos e cotações são fictícios e o banco descartável foi destruído ao final (`QA_PG_TEMP_CLEANED: true`). Os horários nas faixas são o relógio do navegador no instante da resposta; não são persistidos nem estimados.
- **Nada aqui é aprovação humana.** Não houve validação manual, homologação, revisão humana ou aceite humano. Este relatório não declara conformidade WCAG integral, não conclui a UX-PRO-07 e não autoriza as fatias seguintes.

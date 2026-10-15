# UX-PRO-07C-2 — estados honestos de escrita em `/admin/fornecedores`

**Data:** 15/10/2026

**Base:** `ff0e6d620104364a35438785d8767400704d90cf` (`origin/main`, merge da PR #226, UX-PRO-07C-1).

**Escopo registrado antes de editar a tela:** [`UX-PRO-07C-2-ESCOPO-ANTES-2026-10-15.md`](UX-PRO-07C-2-ESCOPO-ANTES-2026-10-15.md), commit isolado `0a05bc7`.

**Status:** relatório da subfatia depois da implementação. **Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu**; nada aqui declara conformidade WCAG integral nem conclui a UX-PRO-07.

## 1. Resultado da subfatia

A tela `/admin/fornecedores` passou a tratar as nove mutações canônicas — criar cotação, transição de status da cotação, decisão (aprovar/rejeitar), validade, regra de alerta, referência documental, criar pedido derivado, transição de status do pedido e prazo do pedido — como operações com estado próprio: **enviando** (com `aria-busy` no botão da ação em curso e região `role="status"` nomeando a ação), **incerta** (resultado não confirmado; repetição somente explícita, com a mesma URL, o mesmo corpo e a mesma `Idempotency-Key`), **falha classificada** (com o código real do servidor e a causa canônica) e **sucesso reconciliado** (somente após validar a chave canônica do corpo `2xx`, relendo exatamente o que a tela relia antes).

Uma guarda síncrona (ref) verificada antes do primeiro `await` impede que um segundo clique no mesmo tick dispare um segundo `POST`; o `disabled` dos nove controles de escrita mantém o bloqueio até a resposta, enquanto os controles de leitura (`Atualizar listas`/`Atualizar detalhe`) permanecem disponíveis. Falha transitória (`5xx`/rede/`408`/`429`/`audit_unavailable`/`supplier_journey_unavailable`) declara que não é possível afirmar se a escrita foi aplicada, não repete o `POST` automaticamente e bloqueia novas escritas até a confirmação. `2xx` sem a chave canônica vira falha declarada (`invalid_supplier_write_response`), nunca sucesso e nunca ausência. `401`/`403` de escrita disparam a releitura pelo caminho existente da 07C-1, que falha fechado: listas, detalhe, seleção e formulários protegidos saem da tela. Recusa definitiva (conflito/validação/não encontrado) é distinta do transitório: declara que o servidor recusou sem aplicar, mostra o código canônico, não oferece repetição e libera as escritas de volta.

Verbos, URLs, corpos, cabeçalho `Idempotency-Key`, gerador de chave (`ext04-<operação>-<uuid>`) e rótulos das operações (`create-quotation`, `quote-<id>-<status>`, `decision-<id>`, `validity-<id>`, `alert-<id>`, `document-<id>`, `order-<id>`, `order-<orderId>-<status>`, `deadline-<orderId>`), transições canônicas, autorização, auditoria e tenancy permaneceram intactos; a semântica de preservação da chave também: guardada enquanto houver falha, encerrada somente por uma resposta real bem-sucedida. Nenhum arquivo de servidor foi tocado.

Arquivos desta subfatia:

| Arquivo | Papel | Linhas |
| --- | --- | --- |
| `src/lib/supplier-write.ts` | classificação da falha de escrita, resposta inválida e recibos do corpo `2xx` por mutação (novo; sem fetch próprio — o transporte continua sendo `supplierRequest`) | 163 |
| `src/app/admin/fornecedores/FornecedoresWorkspace.tsx` | máquina de estado das nove escritas, guarda de envio, faixas e apresentação (reescrita restrita ao caminho de escrita) | 967 |
| `tests/ux-supplier-workspace.integration.test.mjs` | gate focal: 10 casos herdados + 8 casos novos de escrita | 1042 |
| `scripts/qa-ux-supplier-postgres.mjs` | mínimo de casos do runner 10 → 18 | +2 (comentário) |
| `docs/ux-pro-07-fornecedores-evidencias/` | 8 capturas novas + `resumo.json` regenerado (17 entradas) + medição `antes-07c-2/` | — |

## 2. Medição anterior e posterior do gate focal

| Momento | Resultado | Interpretação |
| --- | --- | --- |
| Antes da tela (base `ff0e6d6`, gate novo com 18 casos) | **11/18 passaram; 7/18 falharam**, exit 1 | Os dez casos herdados da 07C-1 e a autorização das nove escritas no servidor (caso 11) já passavam; nenhum dos sete estados de escrita existia na tela (sem `fornecedores-escrita-enviando`, sem `aria-busy`, sem guarda de duplo clique comprovada, sem classificação, sem `fornecedores-escrita-incerta`, sem fail-closed de escrita, sem validação de corpo `2xx`). Saída integral em [`ux-pro-07-fornecedores-evidencias/antes-07c-2/antes-gate-completo.txt`](ux-pro-07-fornecedores-evidencias/antes-07c-2/antes-gate-completo.txt) e resumo em [`antes-medicoes.json`](ux-pro-07-fornecedores-evidencias/antes-07c-2/antes-medicoes.json). |
| Depois (1ª execução, com diretório de evidências) | **18/18 passaram; 0 falharam**, exit 0 | PostgreSQL descartável, HTTP real e Chromium; falhas de escrita injetadas somente em `window.fetch` da página; POSTs de sucesso saem para o servidor real. `UX_SUPPLIER_TAP_SUMMARY: pass=18 fail=0 skipped=0 todo=0 minimo_exigido=18`; `QA_PG_TEMP_CLEANED: true`. |
| Depois (2ª execução, sem diretório de evidências — igual ao CI) | **18/18 passaram; 0 falharam**, exit 0 | Repetição independente para descartar aprovação ocasional. |

O resultado anterior é a falha de **casos novos** contra a implementação antiga — não é regressão de gate herdado, e não substitui a medição herdada da seção 4 do escopo.

## 3. Antes/depois por lacuna registrada

SHA-base = `ff0e6d6` (`FornecedoresWorkspace.tsx` com 753 linhas). Implementação final = coluna “Depois” (`FornecedoresWorkspace.tsx` com 967 linhas + `src/lib/supplier-write.ts`).

| ID | Antes no SHA-base | Depois nesta subfatia |
| --- | --- | --- |
| E1 — envio sem declaração | `:104` (`busy` string), `:231` (`setBusy(operation)`), `:471`, `:552`, `:562-563`, `:577`, `:617`, `:631`, `:673`, `:705`, `:744`: todos os botões apenas `disabled={Boolean(busy)}`, sem `aria-busy`, sem `role="status"`, sem nomear a ação em curso. | `:73-83` (`WRITE_ACTION_NAMES` por ação), `:101-106` (`WriteState` sending/uncertain/failed), `:588-592` (faixa `role="status"` `fornecedores-escrita-enviando` nomeando a ação e declarando resultado não confirmado), `:685`, `:766`, `:776-777`, `:791`, `:831`, `:845`, `:887`, `:919`, `:958` (`aria-busy` no botão da ação em curso + `disabled={writesBlocked}` nos nove controles). |
| E2 — sem guarda síncrona | `:228-242` (`mutate` sem ref; nenhum `useRef` de envio), `:231` (`setBusy` antes do await, sem bloqueio comprovado no mesmo tick). | `:164` (`sendingRef`), `:292-294` (guarda verificada **antes** do primeiro `await`; segundo clique no mesmo tick retorna sem enviar), `:317` (liberação no `finally`); casos 12 e 13 do gate provam exatamente 1 `POST` por duplo clique em criação e transição. |
| E3 — corpo 2xx sem validação | `:258` (`data.quotation.id` sem validação — `TypeError` em corpo malformado), `:285` (`data.order.protocol` lido sem validação), `:236-238` (sucesso declarado só pelo status). | `src/lib/supplier-write.ts:151-161` (`supplierWriteReceipts`: `quotation.id`; `order.id`+`order.protocol`; `validity.id`; `alert_rule.id`; `document.id`; `deadline.id`; replay confirmado aceito nos quatro registros), aplicado por `validate` em `:360`, `:377`, `:389`, `:401`, `:416`, `:431`, `:446`, `:460`, `:472`; `2xx` sem a chave canônica → `invalidSupplierWriteResponse` (`supplier-write.ts:96-107`) em `:306-310`; caso 17 do gate prova que não vira sucesso nem ausência e não derruba a tela. |
| E4 — falha única sem classificação | `:236`, `:239-241` (`setWriteError` com string única: `title: detail` + rodapé de código), `:451-456` (faixa única para todo tipo de falha). | `src/lib/supplier-write.ts:38-94` (`describeSupplierWriteError`: rede/`401`/`403`/transitório/recusa definitiva, com código real, causa canônica do vocabulário e orientação distinta), `:118-123` (`supplierWriteErrorDetail`); `:323-339` (`failWrite` classifica e retém a solicitação quando incerta); faixas separadas: `fornecedores-escrita-incerta` (`:594-607`, `role="alert"`) e `fornecedores-escrita-falha` (`:610-613`, `role="alert"`); casos 14 e 15 do gate provam a distinção conflito × transitório com os códigos reais. |
| E5 — 401/403 de escrita não falhavam fechado | `:236`, `:239-241` contra `:132-142` (`failClosed` da leitura nunca disparado por escrita): a faixa aparecia e listas, detalhe e formulários continuavam visíveis. | `:323-329` (`failWrite` dispara `refreshLists()` na negativa; o caminho existente da 07C-1 limpa listas, detalhe, seleção e formulários e apresenta a negativa sem repetição); caso 16 do gate prova remoção de listas, pedidos, detalhe, ausência de faixa de desatualizado e zero controles acionáveis no estado de negativa. |
| E6 — sem affordance de repetição segura | `:229-230`, `:237`, `:240` (chave preservada e reutilizada, mas apenas como texto “Chave preservada para repetição segura: …” na faixa de erro; sem botão, sem declaração de não repetição automática). | `:332-337` (falha incerta retém ação, URL, corpo e chave), `:341-345` (`repeatWrite` reenvia a solicitação armazenada), `:594-607` (faixa declara que a tela não repete a escrita automaticamente, mostra a chave preservada e oferece `fornecedores-escrita-repetir`); `:319` (`onSuccess` no pedido reconcilia inclusive na repetição — o chamador original já retornou); caso 14 do gate prova mesmo corpo, mesma URL e mesma chave no reenvio, sem `POST` automático. |

## 4. Provas do gate novo

`npm run test:ux-supplier:pg` cobre agora dezoito casos; os oito novos da subfatia:

1. `:680` (caso 11) **autorização das nove mutações no servidor**: anônimo recebe `401` em todas as nove rotas de escrita; papel `rh` recebe `403` com o código canônico `forbidden_role`; `admin` cria cotação de verdade (`201` com `quotation.id`).
2. `:713` (caso 12) **envio pendente da criação**: duplo clique envia **exatamente 1 `POST`** com o corpo canônico (`quantity`, `unit_price_cents`, `notes`) e `Idempotency-Key` `ext04-create-quotation-<uuid>`; a faixa `role="status"` nomeia “a criação da cotação” e declara resultado não confirmado; o botão em curso tem `aria-busy`; escritas concorrentes bloqueadas e leituras disponíveis; após a resposta, a seleção segue a cotação nova, o detalhe é relido, o formulário é limpo e o `role="status"` anuncia a confirmação.
3. `:768` (caso 13) **transição com envio pendente**: duplo clique não envia segunda transição; corpo `{status, reason}` e URL canônicos; chave com o rótulo original `ext04-quote-<id>-enviado-…`; o detalhe relido e o servidor confirmam `enviado`.
4. `:804` (caso 14) **falha transitória `503`**: faixa `role="alert"` declara que não é possível afirmar se a escrita foi aplicada, o código `supplier_journey_unavailable` e que a tela não repete a escrita automaticamente; a chave preservada aparece na faixa; listas preservadas com hora e estado anterior visível; escritas bloqueadas e leitura disponível; nenhum `POST` reenviado sozinho (contador confere após espera); “Repetir com a mesma chave” reenvia a mesma URL, o mesmo corpo e a **mesma chave** (log confere os três campos) e reconcilia de verdade — servidor confirma `enviado`.
5. `:854` (caso 15) **conflito real `409`**: segunda validade da mesma cotação é recusada pelo servidor real com `validity_already_registered`; a faixa declara “recusou a operação sem aplicá-la”, **não** declara incerteza, não oferece botão de repetição, não derruba a tela, não falha fechado e libera as escritas de volta.
6. `:894` (caso 16) **`403` de escrita com perda de leitura falha fechado**: a faixa de escrita declara a negativa com `forbidden_role`; a releitura confirmatória leva ao estado de negativa; listas, pedidos e detalhe protegidos saem da tela; não há faixa de desatualizado nem de incerteza; nenhum controle acionável permanece (zero botões/entradas no workspace).
7. `:941` (caso 17) **`2xx` malformada na escrita**: transição com corpo `{note}` vira `invalid_supplier_write_response`, sem sucesso (nenhum `role="status"` de confirmação), sem ausência e sem derrubar a tela; a criação com corpo sem `quotation` também não declara sucesso, não limpa o formulário e mantém o título.
8. `:989` (caso 18) **medições**: envio pendente em 390 px (transbordo 0 px, menor alvo 44 px) e 768 px no tema noturno pelo controle real do envelope (transbordo 0 px, contraste da faixa **6,06:1**); falha transitória de escrita em 320 px (transbordo 0 px, menor alvo 44 px).

O runner (`scripts/qa-ux-supplier-postgres.mjs`) passou a exigir **18** casos e continua reprovando com caso reprovado, pulado, marcado como todo, resumo TAP ausente ou aprovações abaixo do mínimo.

Nenhuma asserção herdada de `tests/ext04-suppliers.test.mjs`, `tests/ext04-suppliers.integration.test.mjs`, `tests/ux-supplier-vocabulary.test.mjs`, `tests/l06-delivery.integration.test.mjs`, `tests/l08-delivery.integration.test.mjs` ou dos dez casos vigentes do gate focal foi editada, removida ou relaxada; o gate é estritamente aditivo (o injetor de falha da página ganhou a classificação dos `POST`s canônicos sem mudar o comportamento das injeções de leitura).

## 5. Evidências visuais e medições

A pasta [`ux-pro-07-fornecedores-evidencias/`](ux-pro-07-fornecedores-evidencias/) contém **17 entradas** vigentes no `resumo.json`, todas com `problems: []` — as nove da 07C-1 (regeneradas pela mesma execução do gate) mais as oito novas de escrita:

- `fornecedores-1440-enviando.png` — criação em envio (ações bloqueadas, `aria-busy`), transbordo 0 px, menor alvo 44 px;
- `fornecedores-390-enviando.png` — transição em envio em 390×844, transbordo 0 px, menor alvo 44 px;
- `fornecedores-768-noite-enviando.png` — envio no tema noite pelo controle real, transbordo 0 px, contraste da faixa 6,06:1;
- `fornecedores-1440-escrita-falha-transitoria.png` — `503` com incerteza declarada, chave preservada e listas preservadas com hora;
- `fornecedores-320-escrita-falha.png` — falha transitória de escrita em 320×844, transbordo 0 px, menor alvo 44 px;
- `fornecedores-1440-escrita-conflito.png` — `409 validity_already_registered` distinto de transitório;
- `fornecedores-1440-escrita-negada.png` — `403` de escrita em fail-closed (zero controles acionáveis);
- `fornecedores-1440-escrita-resposta-invalida.png` — `2xx` sem a chave canônica da escrita.

| Medição | Resultado |
| --- | --- |
| Transbordo do documento nas capturas de escrita (320/390/768/1440 px, dia e noite) | **0 px** |
| Menor alvo dentro de `[data-task-workspace]` nas capturas de escrita com controles visíveis | **44 px** |
| Controles acionáveis no estado de negativa de escrita (fail-closed) | **0** |
| Contraste da faixa de envio no tema noite (768 px) | **6,06:1** |
| `problems` no `resumo.json` | `[]` em todas as 17 entradas |

`problems` é derivado das medições automatizadas do próprio gate (transbordo, menor alvo e contrastes instrumentados, todos com asserção inline). **As medições automatizadas não equivalem a auditoria WCAG completa**: não cobrem foco em todos os componentes, seleção nem elementos montados depois da captura.

## 6. Inventário regenerado — nenhuma célula mudou

O gerador foi executado (`node scripts/ux-pro-00-inventory.mjs`) e a comparação com os CSVs vigentes resultou em **diff vazio**: a subfatia não acrescentou componente compartilhado novo (as faixas usam `UiState`/`UiWorkspace.module.css` já registrados na linha 20 desde a 07C-1), não mudou stage (`ux-pro-07-fornecedores`) nem viewports (`1440x900|320x844|390x844|768x1024`). `node scripts/ux-pro-00-inventory.mjs --check` termina `OK`. Nenhum CSV foi editado à mão; o diff está, por consequência, confinado à linha 20 (`/admin/fornecedores`) — porque é vazio.

**Limitação do inventário estático:** o gerador continua escrevendo “tema noturno sem captura” e “estados não exercitados em navegador” para toda rota administrativa, sem ler `entry.theme` nem os casos de estado do `resumo.json` (mesma limitação registrada nas fatias 07A, 07B e 07C-1; o gerador não foi ampliado para não misturar mudança global de metodologia com esta tela).

## 7. Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm ci` | 81 pacotes, 0 vulnerabilidades |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `/admin/fornecedores` gerada como rota estática (`○ Static`) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas; CSVs sem alteração |
| `node scripts/ux-pro-00-inventory.mjs` (regeneração) | diff vazio |
| `npm run test:ext04-suppliers:pg` (gate herdado da rota) | **28/28**, `EXT04_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28`, `QA_EXT04_PG_TEMP_CLEANED: true` |
| `npm run test:ux-supplier:pg` (gate focal, 18 casos) — 1ª execução | **18/18**, `UX_SUPPLIER_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ux-supplier:pg` — 2ª execução independente (sem diretório de evidências, igual ao CI) | **18/18**, `UX_SUPPLIER_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ux-supplier:pg` contra a implementação anterior | **11/18**, exit 1 (registro em `antes-07c-2/`) |
| `npm run test:l06-delivery:pg` | exit 0, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | **51/51**, exit 0, `L08_DELIVERY_TEST_EXIT: 0` |
| `git diff --check` | limpo |
| integridade de arquivos protegidos após build e gates | `next-env.d.ts` SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` SHA-256 `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` (restaurados com `git checkout --` após cada build/gate) |

## 8. Limitações, fronteiras e decisões pendentes

- **C11 (abas sem painel) permanece aberto.** `FornecedoresWorkspace.tsx:636-640` mantém `role="tablist"` com cinco `role="tab"` em que `aria-selected` é sempre `index === 0`, sem `aria-controls`, sem `tabpanel` e sem setas/Home/End. Corrigir exige transformar os cinco rótulos em abas verdadeiras com painéis, o que reconfigura o layout vigente (formulário + lista à esquerda, detalhe/validade/documentos à direita, pedidos abaixo) e passa a ocultar conteúdo hoje sempre visível. Pela regra do repositório de preservar o layout selecionado, a correção **não** foi feita: continua registrada para decisão explícita do proprietário. Nenhuma asserção foi enfraquecida para acomodar o defeito.
- **Borda conhecida de seleção durante escrita.** Se o operador trocar a cotação selecionada enquanto uma escrita está em curso ou incerta, a reconciliação pós-sucesso relê o detalhe da cotação afetada (comportamento igual ao anterior à subfatia, que já fechava o `refresh` sobre a seleção do momento do clique); a próxima troca de seleção realinha o detalhe. Essa borda não é exercitada pelo gate e pertence ao caminho de leitura (território 07C-1); registrada aqui como limitação, sem ampliar o escopo.
- **Repetição explícita e bloqueio.** Durante o resultado incerto as nove escritas ficam bloqueadas e a única saída é repetir a mesma solicitação (ou reler as listas, que seguem disponíveis). Não há fila de escritas, UI otimista nem reconciliação por polling — por decisão de escopo.
- **Autorização.** A evidência visual usa a identidade `admin`. O papel `rh` e as recusas `401`/`403` das nove escritas foram exercitados no servidor pelo caso 11 e no navegador pelo caso 16; a decisão real de autorização continua no servidor e não foi alargada.
- **Injeção de falha.** Todas as falhas de escrita são injetadas em `window.fetch` dentro da página (atraso, `503`, `403` e `2xx` sem a chave canônica, apenas nos `POST`s canônicos); os `POST`s de sucesso saem para o servidor real, com payload, idempotência, auditoria e transição canônica verificados em banco pelo caso 13 (o servidor confirma `enviado` após a repetição).
- **Chromium `--single-process`.** O caso 17 usa dois navegadores separados porque o Chromium empacotado não sobrevive à reabertura de contexto no mesmo processo; o caso mantém a retentativa `withBrowser` para instabilidade conhecida do renderer.
- **Massa sintética.** Fornecedores, produtos, cotações, validades e decisões são fictícios; o banco descartável foi destruído ao final de cada execução (`QA_PG_TEMP_CLEANED: true`). Os horários nas faixas são o relógio do navegador no instante da resposta.
- **Esta fatia fecha somente os estados de escrita das nove mutações canônicas em `/admin/fornecedores` e não conclui a UX-PRO-07.** As fatias 07D–07M permanecem pendentes no mapa mestre, cada uma exigindo reavaliação contra a `main` vigente antes de ser iniciada.
- **Nada aqui é aprovação humana.** Não houve validação manual, homologação, revisão humana ou aceite humano. Este relatório não declara conformidade WCAG integral, não conclui a UX-PRO-07 e não autoriza as fatias seguintes.

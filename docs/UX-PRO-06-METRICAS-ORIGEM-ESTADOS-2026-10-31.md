# UX-PRO-06 — Mensuração de origem (`/admin/leads`): estado de leitura honesto

**Data:** 31/10/2026 · **Base:** `666ffd7652a245afe2b59ab2c60df339d0733a58` (`origin/main`, merge da PR #322) · **Branch da sessão:** `arena/4e952467-gruposegsystemseguranca`.

**Natureza:** entrega local e incremental, com prova em PostgreSQL 17 descartável (001–181) + HTTP real + Chromium real. Não é aceite humano, UAT, homologação, revisão jurídica nem autorização de produção. Produção permanece **NO-GO** (`docs/PRODUCAO-GATE.md`).

**Escopo:** o painel **`OriginMetricsPanel` (PUB-10)** dentro de `/admin/leads` — superfície já viva, com ciclo de leitura próprio, que a PR #322 **não tocou** de propósito. Nenhuma tela nova foi criada, nenhum endpoint, papel, permissão, migração ou contrato foi alterado.

---

## 0. Reconciliação do ledger pós-merge (feita antes de escolher a fatia)

O pedido registrava uma divergência conhecida: `docs/STATUS-VIGENTE.md` ainda dizia que a **#322** estava "aberta, sem merge", com base `d9d2356`. O estado medido nesta sandbox:

| Verificação | Medido |
|---|---|
| `git rev-parse HEAD` / `git status` | `666ffd7…` (merge da #322), árvore limpa |
| `origin/main` | `666ffd7…` — igual ao HEAD; nenhum reset foi necessário |
| Corpo da #322 (registro no ledger) | **MERGED** em `666ffd7…` |
| Base anterior no ledger | `d9d2356…` (merge da #320) — histórico preservado, não reescrito |

Nenhum commit foi reescrito: a correção é documental (ledger), como manda o §4 do `AGENTS.md`.

## 1. Inventário e sonda antes de escolher (por que esta fatia)

| Candidato do pedido | Sonda real | Decisão |
|---|---|---|
| 1. `OriginMetricsPanel` em `/admin/leads` | Painel montado na rota viva, com ciclo de leitura **próprio** e sem estado de leitura honesto (ver §2). Gate da fila (`tests/ux-crm-workspace.integration.test.mjs`) **não** o exercita; o contrato PUB-10 está no gate L04. Explicitamente intocado pela #322. | **escolhido** |
| 2. Outra superfície UX-PRO-06 (contas admin/contratos/carteira/funil) | Já têm fatias próprias com escopo/estados documentados (`UX-PRO-06-*-ESCOPO/ESTADOS-2026-10-13/14`) | descartado para não reimplementar |
| 3. Aba titular remanescente de RH (UX-PRO-05) | Exige papel que o servidor ainda não autoriza para o titular; decisão de autorização é do proprietário | descartado |
| 4. Reauditoria do índice 222 | Seria mapa de evidências, não prova de superfície viva; o índice está estável (46 `a_revalidar`, 20 sem gate) | adiado |
| 5. Intermitência G5 do portal (`/cliente/convite`, 390 px) | A #322 já registrou **não reprodução** em 2 execuções da base + 2 da árvore; sem reprodução nesta sonda, mexer seria especulação | não tocado |

O critério do pedido ("preferir fechar superfície viva sem estado/prova honestos") caiu no candidato 1 sem criar tela nova.

## 2. Defeitos encontrados na sonda (comportamento real, não leitura de código)

Antes de qualquer edição, a sonda em navegador real (PostgreSQL 17 + Chromium) mediu o painel na base `666ffd7`:

1. **Falha transitória apagava a última leitura.** Qualquer erro (`503`, rede, `409`) executava `setData(null)`: a tabela e os totais desapareciam e sobrava só uma frase de erro. Medido: `0 !== 1` — *"a leitura anterior precisa continuar visível"* (`/tmp/crm-red-base-3.log`, transcrito na PR).
2. **Payload 200 malformado derrubava o painel.** Não havia validação: `data.rows.length` sobre um objeto gerava erro de render, e o painel não exibia estado próprio. Um payload inválido corria o risco de parecer "vazio".
3. **Não havia período nem hora da leitura publicada.** O `<caption>` mostrava o período do payload, mas a tela não declarava *quando* aquela leitura foi concluída, então "número antigo" e "número atual" eram indistinguíveis.
4. **Não havia retry explícito** nem faixa de "desatualizada": repetir dependia de o operador reencontrar o botão de recalcular.
5. **Estados de acessibilidade incompletos:** nenhum `aria-busy` no painel, nenhum `role="status"` para o carregamento, e nenhum foco no alerta quando a falha vinha de uma ação da pessoa.

### Premissa de sonda corrigida (registrada sem maquiar RED)

A primeira premissa era provar **"resposta fora de ordem"** no navegador. A sonda mostrou que **não é alcançável**: o botão de recalcular fica `disabled` enquanto a leitura está em voo, e essa proteção existente foi **preservada**. Nenhuma proteção foi removida para fabricar a prova. A guarda de sequência entrou como **defesa em profundidade** e é provada no teste focal do módulo de estado (evento com sequência antiga devolve o mesmo estado). Segunda premissa corrigida: `<input type="date">` no Chromium é composto de segmentos nativos — um único `Tab` **não** vai de "De" para "Até"; o cenário passou a medir o percurso real em vez de supor a ordem.

## 3. Correção (aditiva, no próprio componente)

- **`src/app/admin/leads/origin-metrics-state.ts` (novo)** — módulo puro, sem React:
  - `parseOriginMetrics(payload, expected)`: valida linhas, totais, datas ISO reais, `windowDays` e — regra nova — **exige que `from`/`to` do payload sejam a janela pedida**; publicar números de outra janela sob o rótulo atual é atribuição falsa. Preserva campos não renderizados (`minimized`, `role`) e não modifica o payload.
  - `describeOriginMetricsError(status, code)`: traduz `401/403/400/405/408/429/5xx`, `lead_metrics_unavailable`, `database_not_configured`, `migration_required` e `invalid_response`; **nenhuma falha é apresentada como ausência de pedidos**.
  - `reduceOriginMetrics(view, event)`: redutor do ciclo de leitura. Evento de sequência antiga devolve **o mesmo objeto** (não publica, não apaga, não encerra carregamento). Falha transitória **preserva** `data`/`readAt`/`readWindow` e marca `stale`; negativa e payload inválido são **falha fechada** (descartam).
- **`OriginMetricsPanel.tsx`** — passou a consumir o módulo: `aria-busy` na seção, `role="status"` no carregamento e na atualização, faixa `origin-metrics-stale` com hora e período preservados + botão `Tentar novamente`, alerta com `data-testid` por motivo (`-denied`, `-invalid`, `-read-error`), foco no alerta **apenas** quando a falha vem de ação da pessoa (a carga inicial não move o foco) e declaração explícita de **período** e **hora da última leitura**.
- **`LeadAdmin.module.css`** — apenas duas classes novas (`.metricsStale`, `.metricsUpdated`) e variantes de tema noturno.

**Preservado sem alteração:** endpoint `GET /api/admin/leads/metrics` e seu contrato (`minimized`, projeção sem dado pessoal), papéis `comercial|admin|ti|marcelo` (RH continua `403`), os campos `#metrics-from`/`#metrics-to`, o botão de recalcular e o rótulo acessível, todos os `data-testid` anteriores (`origin-metrics-panel/table/totals/empty/error/refresh`), a ausência total de escrita de métrica, `server.mjs`, migrações **001–181** (próxima livre **182**) e o painel da fila (`/admin/leads` além do painel) intocado.

## 4. Prova RED → GREEN

| Prova | Antes (RED) | Depois (GREEN) |
|---|---|---|
| Focal `tests/ux-pro-06-metricas-origem-estados.test.mjs` (no `test:unit`) | **1/7** — `origin-metrics-state.ts` ausente | **7/7**, 0 falhas |
| Cenário gate `UX-PRO-06 métricas: falha preserva a leitura, retry, inválido, A/B, larguras, tema e teclado` (painel da base) | **0/1** — `AssertionError: a leitura anterior precisa continuar visível (0 !== 1)` | **1/1** |
| Cenário gate `UX-PRO-06 métricas: contrato, papéis e escrita real alimentam o agregado` | **0/1** na base (rota sem `origin-metrics-period`/estado) | **1/1** |
| Conjunto filtrado (`UX_CRM_TEST_PATTERN='UX-PRO-06 métricas'`) | **1/2** | **2/2** |
| Gate CRM completo | 40/40 antes | ver §7 |

**Mutações (o teste detecta a regressão, não o contrário):**

| Mutação aplicada | Resultado |
|---|---|
| Remover `if (event.sequence !== event.current) return view` do redutor | **6/7** — falha o teste "somente a leitura mais recente publica dados" |
| `descarta = true` (falha transitória volta a apagar a leitura) | **6/7** — falha o teste "falha preserva a última leitura" |
| Remover a conferência da janela esperada no parser | **6/7** — falha o teste "payload malformado nunca vira nenhum pedido" |

Cada mutação foi revertida e o arquivo conferido por `diff` (idêntico ao original).

## 5. O que o cenário de navegador prova (PostgreSQL 17 + Chromium)

- **Papel autorizado e negado:** `comercial`, `admin`, `ti` e `marcelo` leem `200`; `rh` recebe **403 `forbidden`**; anônimo **401 `admin_session_required`**; `POST` **405** com `Allow: GET`.
- **Escrita real com status/corpo:** o `PATCH /api/admin/leads/:id` muda `solicitada → confirmada` (`200`, `leadId`, `previousStatus`, `status`), grava `public_lead_status_audit` e o agregado passa a contar **1 visita confirmada** — o número é derivado de escrita real, não digitado.
- **Minimização:** nome, telefone e id do pedido não aparecem no agregado nem no corpo do painel.
- **Falha preservada:** `503 lead_metrics_unavailable` mantém tabela, totais e o mesmo número; a faixa declara **hora** e **período** preservados e diz "isto não significa que não haja pedidos no período".
- **Retry:** recupera sem recarregar a página (banner sai, tabela continua).
- **Payload 200 inválido:** estado próprio (`origin-metrics-invalid`), **não** vazio, **sem** tabela, **com foco no alerta**, sem erro de página.
- **Negativa:** `403` é estado distinto de erro transitório e **não** oferece retry.
- **A/B sem resíduo:** encerrar a sessão desmonta o painel; a sessão B faz a própria leitura, sem herdar faixa/alerta de A, e o total exibido é conferido contra a leitura HTTP de B.
- **Larguras 320/390/768/1440** sem transbordo de documento, **tema noturno** com superfícies escuras, **teclado**: primeiro controle = `#metrics-from`, percurso real até o botão de recalcular sem escapar do painel, contorno visível, e `Tab` alcança o botão de retry com foco visível.
- **Falha na primeira leitura:** estado de erro explícito, **nunca** "nenhum pedido"; retry recupera.

Evidências: `docs/ux-pro-06-metricas-origem-evidencias/` (`resumo.json` sem `problems` + capturas 320/390/768/1440, noturna e da faixa preserve).

## 6. Limites que permanecem (não resolvidos por esta fatia)

- O agregado do **servidor** continua provado pelo gate **L04 (PUB-10)**; esta fatia prova o **estado de leitura da tela**. Os dois caminhos não se substituem.
- **Sem escrita de métrica** — por decisão do PUB-10, continua não havendo campo para digitar número.
- A leitura administrativa é **global**, sem escopo por conta (contrato vigente); nada foi restringido.
- `OriginMetricsClient` (órfão do `TiConsole`) **permanece órfão**: `EXPECTED_TABS` (24) e `PROMOCOES_COM_PROVA` (11) não foram incrementados; isto não é promoção de aba.
- Sem upload, anonimização, revisão jurídica, leitor de tela, UAT, Windows real, aceite humano (**0/222**) e sem reauditoria integral (**0/222**).
- Backup real, F02, B2, provedores e matriz de autorização continuam decisão do proprietário. **Produção: NO-GO.**

## 7. Bateria (serial, `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x`, Node 22)

| Verificação | Resultado medido |
|---|---|
| `npm ci` | 83 pacotes, 0 vulnerabilidades |
| `npm test` / `npm run test:unit` | **1259/1259**, 0 falhas, 0 skips; **163** arquivos explícitos no `test:unit` |
| `npm run typecheck` | **0 erros** |
| `npm run build` | **106/106** páginas geradas |
| `node scripts/qa-wave0-static.mjs` | **5/5**, 0 imports e 0 migrações ausentes |
| `node scripts/requisitos-222-inventory.mjs --check` | **OK** — 222 IDs, 20 `a_revalidar` sem gate, 0/222 aceite humano |
| `node scripts/ux-pro-00-inventory.mjs --check` | **OK** — 101 rotas; `/admin/leads` registra `ux-pro-06-metricas-origem @ 1440x900|320x844|390x844|768x1024` |
| `node scripts/ux-pro-03-ti-inventory.mjs --check` | **OK** — 84 componentes, 24 abas (24 com prova), 35 órfãos, 11 promoções (inalterado) |
| `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | **OK** — 3 artefatos conferem |
| `npm run reaudit:sec` | **OK** — 35/35 âncoras, 3 artefatos |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades** |
| `node scripts/qa-ux-crm-postgres.mjs` | **42/42**, 0 falhas, 0 skips (40 anteriores + 2 desta fatia) |
| `node scripts/qa-ux-portal-postgres.mjs` | **49/49**, 0 falhas, 0 skips (nenhuma falha G5 reproduzida) |
| `npm run test:ux-hr:pg` | **20/20**, 0 falhas, 0 skips |
| `npm run test:l04-delivery:pg` (PUB-10) | **PUB-10 verde**; 1ª execução **19/20** com falha alheia (CRM-07, *strict mode*, 2 elementos) **não reproduzida** na base (**20/20**) nem na árvore alterada **(20/20)** |
| `git diff --check` | limpo |
| SHA-256 `next-env.d.ts` / `tsconfig.json` | `1862ac4b…9db2b` / `2128c956…8d65`, preservados |
| Migrações | nenhuma criada/alterada; 001–181 imutáveis, próxima livre **182** |

**Flakiness observada e não reproduzida:** o L04 completo nesta árvore fechou **19/20** com a falha **CRM-07** (delegação de tarefa: `strict mode violation` com dois `<p>` idênticos) — superfície **fora** desta fatia. A base `666ffd7` fechou **20/20** e a árvore alterada, repetida, fechou **20/20**. O evento é registrado como **não reproduzido**; não se declara estabilidade do gate nem se alterou o teste alheio.

## 8. Reconciliação de números do ledger (drift encontrado, não maquiado)

| Item | Ledger anterior | Medido nesta fatia |
|---|---|---|
| `.mjs` no topo de `tests/` | 224 | **226** (*já eram 225 em `666ffd7`* + 1 focal novo) |
| Arquivos explícitos no `test:unit` | 162 | **163** |
| Asserções em `npm test` | 1252/1252 | **1259/1259** (1252 + 7 do focal novo) |
| Gate CRM | 40/40 | **42/42** |
| Base/PR do ledger | `d9d2356`, #322 "aberta" | **`666ffd7`, #322 MERGED** |
| `arquivosVarridos` do índice 222 | 1.633 | **1.637** (citação do §2 do relatório de reauditoria e JSON regenerados pelo gerador) |
| `a_revalidar` / sem gate / classes | 46 / 20 / 23·114·85 | **46 / 20 / 23·114·85** (nenhuma classe mudou) |
| Aceite humano / reauditoria integral | 0/222 · 0/222 | **0/222 · 0/222** |

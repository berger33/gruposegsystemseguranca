# UX-PRO-07F-1 — datas e fuso em `/admin/financeiro` (relatório da fatia)

- **Data:** 2026-10-15
- **Fatia:** UX-PRO-07F-1 — datas e fuso na rota `/admin/financeiro` (uma fatia por PR)
- **Base verificada antes do código:** `main` em `12fe34e`, divergência `0 0`
  (`git rev-list --left-right --count origin/main...HEAD`), árvore limpa;
  `next-env.d.ts` = `18b697c4…` e `tsconfig.json` = `2128c956…` conferidos antes e
  depois de cada build.
- **Escopo escrito ANTES do código:** `docs/UX-PRO-07F-1-ESCOPO-ANTES-2026-10-15.md`
  (mapa auditado das 20 exibições, regra, fora de escopo, ordem de execução).
  O que está neste relatório é o resultado medido daquele escopo.

## 1. O que esta fatia entrega

As **20 exibições de data/hora** das nove áreas financeiras deixam de imprimir o
valor cru em ISO e passam a mostrar texto em pt-BR:

| Tipo de dado | Antes (cru em tela) | Depois |
| --- | --- | --- |
| 17 colunas `DATE` | `2038-03-01`, `2038-02-17T00:00:00.000Z` | `01/03/2038`, `17/02/2038` |
| Competência | `2038-02` | `02/2038` |
| 3 carimbos `TIMESTAMPTZ` | `15/10/2026, 12:15:50` (hora da máquina) | `15/10/2026 15:15 UTC` |

Ausência continua ausência declarada ("Não informada" / "Não informado") e
formato inesperado sai **cru e inteiro**, sem truncar: nada é inventado.

## 2. Antes — mapa auditado (20 exibições em 17 linhas de 9 arquivos)

| # | Arquivo:linha | Dado | Antes | Depois |
| --- | --- | --- | --- | --- |
| 1 | `FinanceiroWorkspace.tsx:501` | `rule.start_date` | `String(…).slice(0, 10)` | `financeDate(…)` |
| 2-3 | `FinanceiroWorkspace.tsx:632` | f03 `period_start` + `period_end` | `String(…)` cru (dois campos) | `financeDate(…)` nos dois |
| 4-5 | `BudgetWorkspace.tsx:357` | FIN-13 período (dois campos) | `String(…).slice(0, 10)` | `financeDate(…)` nos dois |
| 6 | `BudgetWorkspace.tsx:413` | FIN-13 `changed_at` | `new Date(…).toLocaleString("pt-BR")` | `financeDateTime(…)` |
| 7 | `CashflowWorkspace.tsx:197` | FIN-07 `competence_date` | `String(…).slice(0, 10)` | `financeDate(…)` |
| 8 | `CashflowWorkspace.tsx:216` | FIN-07 aging `competence_date` | `String(…).slice(0, 10)` | `financeDate(…)` |
| 9 | `ClosureWorkspace.tsx:19` | FIN-15 aviso do fechamento | `…competence_date.slice(0,7)` | `financeMonth(…)` |
| 10 | `ClosureWorkspace.tsx:24` | FIN-15 opção | `…competence_date.slice(0,7)` | `financeMonth(…)` |
| 11 | `ClosureWorkspace.tsx:25` | FIN-15 detalhe | `…competence_date.slice(0,7)` | `financeMonth(…)` |
| 12 | `CommissionWorkspace.tsx:26` | FIN-16 opção `provision_date` | `…provision_date.slice(0,10)` | `financeDate(…)` |
| 13 | `CommissionWorkspace.tsx:27` | FIN-16 `reviewed_at` | `new Date(…).toLocaleString("pt-BR")` | `financeDateTime(…)` |
| 14 | `CostAllocationWorkspace.tsx:99` | FIN-08 importação `competence_date` | `String(…).slice(0,10)` | `financeDate(…)` |
| 15 | `CostAllocationWorkspace.tsx:118` | FIN-08 custo `competence_date` | `String(…).slice(0,10)` | `financeDate(…)` |
| 16-17 | `ExportWorkspace.tsx:34` | FIN-14 período (dois campos) | `…slice(0,10)` | `financeDate(…)` nos dois |
| 18 | `ExportWorkspace.tsx:35` | FIN-14 trilha `created_at` | `new Date(…).toLocaleString("pt-BR")` | `financeDateTime(…)` |
| 19 | `BankReconciliationWorkspace.tsx:273` | FIN-05 `transaction_date` | `{transaction.transaction_date}` cru | `financeDate(…)` |
| 20 | `ManagementResultsWorkspace.tsx:85` | FIN-09 `competence_date` | `{r.competence_date}` cru | `financeDate(…)` |

As linhas 1/2-3, 9/10/11, 12/13 etc. compartilham arquivo; o diff total da fatia
em `src/` é **26 inserções e 17 remoções em 11 arquivos** (9 telas + módulo novo +
declaração de tipos).

## 3. A regra aprovada, e por quê

- **Módulo de tela, não vocabulário:** `src/lib/finance-dates.mjs` +
  `src/lib/finance-dates.d.mts`. `src/lib/finance-vocabulary.mjs` **não foi
  tocado** — mesma razão já registrada em `src/lib/finance-request.ts:60-80`: o
  vocabulário canônico explica código de servidor e é provado por outra fatia
  (`tests/ux-finance-vocabulary.test.mjs`); formato de data de tela é decisão de
  apresentação desta rota.
- **Três funções puras:** `financeDate` (ausente → "Não informada";
  `^(\\d{4})-(\\d{2})-(\\d{2})` lido **dos dígitos** → `DD/MM/AAAA`, sem `new Date`
  e sem `Intl`; qualquer outro texto sai cru e inteiro), `financeMonth`
  (`MM/AAAA`) e `financeDateTime` (ausente → "Não informado"; instante inválido →
  texto cru; senão `DD/MM/AAAA HH:mm UTC` com `Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', hourCycle: 'h23', … })`), mais as constantes
  `FINANCE_DATE_ABSENT` e `FINANCE_DATE_TIME_ABSENT`.
- **Por que UTC, e por que escrito no texto:** `timeZone:'UTC'` já é decisão
  deste repositório para exibir instante — `analytics-vocabulary.mjs:219,228`,
  `compliance-vocabulary.mjs:306,315`, `expansion-vocabulary.mjs:469,478`,
  `fleet-vocabulary.mjs:274,283`, `knowledge-vocabulary.mjs:163,171`,
  `quality-vocabulary.mjs:231,240`, `satisfaction-vocabulary.mjs:262,271`,
  `third-party-vocabulary.mjs:330`, `intel-vocabulary.mjs:54`, além de
  `honestDate`/`honestDateTime`. O defeito corrigido era `toLocaleString("pt-BR")`
  **herdar o fuso da máquina**: o mesmo carimbo saía diferente em fusos
  diferentes. Agora o fuso é fixo e **declarado no texto**.
- **O que NÃO se inventou:** não se escreve "horário de Brasília" nem qualquer
  fuso local. O plano mestre propõe um fuso operacional configurável
  (`docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md:84`), mas proposto não é
  ratificado; até ratificação, o valor declarado é o UTC que os dados já carregam.

## 4. Contrato preservado — o que **não** mudou

Métodos, URLs, corpos, cabeçalhos, permissões, alçadas, idempotência, trilhas de
auditoria e migrações **não foram tocados**; nenhum arquivo de servidor foi
alterado (o diff é só de tela e de dois arquivos novos de biblioteca de tela).
A prova automatizada é o **caso 35**: os **dez endpoints** de data continuam
devolvendo o valor cru em ISO no 200 — a formatação é só de tela. O caso 35
passa **antes e depois** da mudança (é o único dos dez casos novos que passa no
baseline), que é exatamente o que se espera de um contrato preservado.

Ficaram **fora** do escopo, deliberadamente: os 19 `<input type="date">` (o valor
do campo é payload, não texto), `CashflowWorkspace.tsx:164`,
`CostAllocationWorkspace.tsx:78`, `FinanceiroWorkspace.tsx:239` (corpo de POST —
payload inalterado), as chaves `Date.now()` de `BudgetWorkspace.tsx`/
`ExpenseWorkspace.tsx`, o percentual `toLocaleString` de
`ManagementResultsWorkspace.tsx:17` e o achado E3 de `/admin/operacao` (outra
rota, outra fatia).

## 5. Provas automatizadas

### 5.1 Baseline contra a implementação anterior — **35/44, 9 reprovações**

Gate herdado + bloco aditivo, rodado **antes** de tocar em `src/`
(`docs/ux-pro-07-financeiro-evidencias/antes-07f-1/gate.txt`):

```
# tests 44 · # pass 35 · # fail 9 · # skipped 0
UX_FIN_07F1_TAP_SUMMARY: pass=35 fail=9 skipped=0 todo=0 minimo_exigido=44
UX_FIN_07F1_TEST_EXIT: 1
RUNNER_EXIT=1
```

As 9 reprovações são o defeito, medido em tela:

| Caso | Reprovação (valor observado) |
| --- | --- |
| 36 | opção do FIN-15 saía `2038-02 · fechada` em vez de `02/2038` |
| 37 | FIN-16 saía `2038-02-17` em vez de `17/02/2038` |
| 38 | FIN-14 saía `2038-03-01 a 2038-03-31` |
| 39 | FIN-13 saía `2038-03-01 a 2038-03-31` |
| 40 | FIN-05 saía `2038-02-17T00:00:00.000Z` |
| 41 | painel mostrava `Início 2038-03-01` |
| 42 | ausência saía `Início null` |
| 43 | carimbo saía `15/10/2026, 12:15:50` (fuso da máquina) em vez de `… UTC` |
| 44 | FIN-09 saía `2038-02-17T00:00:00.000Z` |

Uma primeira corrida de baseline foi **rejeitada e preservada** como evidência
(`antes-07f-1/gate-rejeitado-1-ordem-de-fechamento.txt`, 34/10): o fechamento
sintético de competência era criado antes dos lançamentos do mesmo mês e o
gatilho `trg_fin_cost_competence_open` (`db/migrations/137-…:63`) recusava o
custo com 400 — defeito **do caso de teste**, não do produto. O bloco foi
corrigido (fechamento depois dos lançamentos, com o motivo escrito no código) e o
baseline acima é o definitivo.

### 5.2 Corrida rejeitada — host do servidor fora de UTC (achado transversal)

Tentativa com `TZ=Asia/Tokyo` no processo que sobe o servidor:
**36/44**, 8 reprovações (35–41 e 44). O diretório
`docs/ux-pro-07-financeiro-evidencias/depois-07f-1/rejeitada-fuso-do-servidor-nao-utc/`
preserva `gate.txt` e a nota de diagnóstico. Causa raiz **anterior a esta fatia**:
as colunas `DATE` chegam do driver `pg` como instante da meia-noite **local** e o
servidor compara/data com `.toISOString().slice(0, 10)`
(`src/server/fin-advanced-api.mjs:761`): com o host a leste de Greenwich o dia
anda para trás e o próprio servidor recusa a gravação (`due_date_mismatch`).
Reprodução de uma linha:

```
TZ=Asia/Tokyo node -e "console.log(new Date(2038,0,10).toISOString().slice(0,10))"  # 2038-01-09
TZ=UTC        node -e "console.log(new Date(2038,0,10).toISOString().slice(0,10))"  # 2038-01-10
```

Corrigir isso mudaria payload/comportamento do servidor — **fora do escopo
autorizado** (ver §9 e a decisão pendente do dono em §12).

A mesma corrida, porém, **prova o que importa desta fatia** sob um host hostil:
os casos 42 (ausência declarada e formato cru) e 43 (o MESMO carimbo em
`America/Sao_Paulo` e `Asia/Tokyo`) passaram — a formatação de carimbo e a
declaração de fuso não dependem da máquina.

### 5.3 Corridas finais — **44/44 em duas execuções independentes**

Somente depois de `src/` corrigido (nenhum arquivo de servidor, payload, URL,
permissão ou auditoria tocado), duas execuções **independentes** do gate, cada uma
com cluster PostgreSQL descartável próprio e pasta de evidência própria:

| Execução | Evidência | Resumo TAP | Códigos |
| --- | --- | --- | --- |
| 1 | `depois-07f-1/execucao-1/gate.txt` | `UX_FIN_07F1_TAP_SUMMARY: pass=44 fail=0 skipped=0 todo=0 minimo_exigido=44` | `UX_FIN_07F1_TEST_EXIT: 0` · `RUNNER_EXIT=0` |
| 2 | `depois-07f-1/execucao-2/gate.txt` | `UX_FIN_07F1_TAP_SUMMARY: pass=44 fail=0 skipped=0 todo=0 minimo_exigido=44` | `UX_FIN_07F1_TEST_EXIT: 0` · `RUNNER_EXIT=0` |

Os dois `07f1-resumo.json` são idênticos fora o caminho da própria pasta
(conferido por `diff` com o nome da pasta normalizado): quatro viewports
(1440×900, 768×1024, 390×844, 320×844), `transbordoDocumentoPx: 0` e
`problems: []` nos quatro. Uma terceira medição do mesmo gate veio pela bateria
(§7, `npm run test:ux-finance:pg`): também **44/44**, exit 0.

### 5.4 Provas puras e determinismo entre fusos

`tests/ux-finance-dates.test.mjs` — 6 casos, sem banco, sem HTTP e sem
navegador: superfície do módulo e das declarações de tipo; leitura por dígitos
(inclusive `2038-02-17T23:30:00.000Z`, que em Tóquio já é dia 18);
`MM/AAAA`; ausência e formato inesperado; `h23` (`00:05`, nunca `24:05`);
e determinismo com dois processos filhos, um em `TZ=America/Sao_Paulo` e outro
em `TZ=Asia/Tokyo`, exigindo texto **idêntico**.

```
$ TZ=Asia/Tokyo node --test tests/ux-finance-dates.test.mjs
# pass 6 · # fail 0
```

## 6. Inventário de rotas

Somente pelo gerador oficial `node scripts/ux-pro-00-inventory.mjs` (nunca à
mão), com prova campo a campo contra o commit anterior:

| CSV | Linhas alteradas | Delta campo a campo |
| --- | --- | --- |
| `UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv` | 1 (a linha `/admin/financeiro`) | campo `gates_automatizados`: `…|ux-pro-07e2-delivery.yml` → `…|ux-pro-07e2-delivery.yml|ux-pro-07f1-delivery.yml` |
| `UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` | 1 (a linha `/admin/financeiro`) | campo `evidencia`: inserção única de `|ux-pro-07f1-delivery.yml` na lista de gates (593 → 618 caracteres, nenhuma outra diferença) |

Depois da regeração: `node scripts/ux-pro-00-inventory.mjs --check` →
`OK: … conferem com o código atual` (exit 0).

## 7. Bateria §6.8

Tudo no host UTC, um passo por vez, com exit code literal por passo (logs em
`depois-07f-1/bateria/`, resumo em `depois-07f-1/bateria/resumo.txt`):

| # | Comando | Exit | Resultado medido |
| --- | --- | --- | --- |
| 01 | `npm ci` | 0 | 81 pacotes, 0 vulnerabilidades |
| 02 | `node scripts/ux-pro-00-inventory.mjs` | 0 | CSVs regerados (§6) |
| 03 | `npm test` | 0 | 939/939 casos de unidade (inclui os 6 novos de datas) |
| 04 | `npm run typecheck` | 0 | `tsc --noEmit` sem erro |
| 05 | `npm run build` | 0 | `Compiled successfully in 12.6s` |
| 06 | `node scripts/qa-wave0-static.mjs` | 0 | 5/5 verificações; 0 imports ausentes; 0 migrações ausentes |
| 07 | `node scripts/ux-pro-00-inventory.mjs --check` | 0 | CSVs conferem com o código |
| 08 | `npm run test:l06-delivery:pg` | 0 | 9/9 · `L06_DELIVERY_TEST_EXIT: 0` |
| 09 | `npm run test:l07-delivery:pg` | 0 | 43/43 · `L07_DELIVERY_TEST_EXIT: 0` |
| 10 | `npm run test:l08-delivery:pg` | 0 | 51/51 · `L08_DELIVERY_TEST_EXIT: 0` |
| 11 | `npm run test:ext04-suppliers:pg` | 0 | 28/28 · `EXT04_SUPPLIERS_TEST_EXIT: 0` |
| 12 | `node --test tests/ux-finance-vocabulary.test.mjs` | 0 | 10/10 (vocabulário canônico intacto) |
| 13 | `npm run test:ux-finance:pg` | 0 | 44/44 · `UX_FINANCE_TEST_EXIT: 0` (terceira medição do gate) |

`next-env.d.ts` (`18b697c4…`) e `tsconfig.json` (`2128c956…`) foram restaurados
depois do build, como manda o procedimento. Os três runners herdados
(`qa-ux-finance-postgres.mjs` `2c7fd489…`, `qa-ux-pro-07e1-postgres.mjs`
`177b2daf…`, `qa-ux-pro-07e2-postgres.mjs` `242f9afc…`) e o `resumo.json` herdado
(`78a21328…`) seguem byte a byte.

## 8. Limitações

1. **Nada disso é homologação.** As provas são automatizadas, em massa sintética
   criada pelas próprias APIs financeiras; nenhuma pessoa conferiu as telas.
2. **O host do servidor precisa estar em UTC** para que as datas de calendário
   cheguem com o dia certo (§5.2). O gate herdado e o CI já rodam assim; um host
   a leste de Greenwich faz o **servidor** (não a tela) deslocar o dia. Fica
   registrado como achado transversal para decisão do dono.
3. **Tema noturno não foi medido nesta fatia** (contraste é o achado transversal
   E8, fora do escopo). `07f1-resumo.json` declara isso em `notes`.
4. **`firstFocus` e `percursoTeclado` não foram medidos** nesta fatia: a medição
   aqui é de texto de data e de transbordo, não de foco — a ausência é declarada
   de propósito, não omitida.
5. **A fatia não corrige o servidor** (o defeito do §5.2 continua lá) nem as
   outras pendências do programa.
6. O `07f1-resumo.json` de cada execução guarda o caminho da própria pasta de
   evidência; os dois arquivos diferem só nesse campo.

## 9. Declarações

> Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu.

> As medições automatizadas não equivalem a auditoria WCAG completa.

**Esta fatia não conclui o UX-PRO-07.** O programa só pode ser declarado
concluído quando existir `docs/UX-PRO-07-CONSOLIDACAO-<data>.md` **e** as
verificações estiverem verdes em `main` depois de todas as fatias.

## 10. Arquivos e hashes

| Arquivo | SHA-256 (16 primeiros caracteres) |
| --- | --- |
| `tests/ux-finance-workspace.integration.test.mjs` (44 casos, 111.225 bytes) | `edccd6386847ea7d…` |
| prefixo herdado de 34 casos (76.468 bytes, congelado) | `e9fc84369f227c53…` |
| `src/lib/finance-dates.mjs` | `825d0620ec5d75ad…` |
| `src/lib/finance-dates.d.mts` | `34f9ec96bab1dfb2…` |
| `tests/ux-finance-dates.test.mjs` | `ac7a14b29f475e2c…` |
| `scripts/qa-ux-pro-07f1-postgres.mjs` | `9974338f57e7346b…` |
| `.github/workflows/ux-pro-07f1-delivery.yml` | `0eb368d2ac901428…` |
| `docs/UX-PRO-07F-1-ESCOPO-ANTES-2026-10-15.md` | `d3bac08035e88d1f…` |
| `docs/ux-pro-07-financeiro-evidencias/resumo.json` (herdado, intacto) | `78a213281c64a08d…` |

## 11. Próximo passo — decisão do dono

Nenhuma pendência foi escolhida por conta própria. A fatia termina perguntando
qual atacar em seguida: E2, E4–E9, os transversais (incluindo o achado do §5.2) ou
C11.

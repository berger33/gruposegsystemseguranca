# UX-PRO-07E-2-ALVO — alvo de toque dos botões "Tentar novamente" legados de `/admin/financeiro`

Data: 2026-10-20
Branch da sessão: `arena/094b9867-gruposegsystemseguranca`
Base: `1f9fc1dbf17062c8ffb53203375fbc833d6a98aa` (`origin/main`, merge da PR #280)
Escopo registrado antes do código: [`UX-PRO-07E-2-ALVO-ESCOPO-ANTES-2026-10-20.md`](UX-PRO-07E-2-ALVO-ESCOPO-ANTES-2026-10-20.md)
Decisão de escopo: **Q1** delegada pelo proprietário ("você decide o que é melhor para o avanço do projeto") → decidido **07E-2**; **Q2** = "nova classe só de alvo"; **Q3** = "sim, day/night × 4 viewports".

## 1. O que esta fatia fecha — e o que ela não fecha

**Fecha somente:** os dois botões "Tentar novamente" legados de `/admin/financeiro` — `fin11-retry` (`src/app/admin/financeiro/FiscalWorkspace.tsx:118`) e `fin10-retry` (`src/app/admin/financeiro/ExpenseWorkspace.tsx:158`) — deixam a caixa nativa do navegador (**29 px**) e passam a ter alvo de toque de **44 px** de altura e **173 px** de largura, nos 4 viewports canônicos e nos dois temas, com contraste de rótulo **9,58:1** (dia) e **7,83:1** (noite) e transbordo do documento **0 px**.

Com isto, o resíduo **07E-2** da fila (alvo de toque) sai da condição de observação registrada na seção 11 de [`UX-PRO-07E-2-RELATORIO-2026-10-15.md`](UX-PRO-07E-2-RELATORIO-2026-10-15.md) e de `docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md:34`, e passa a condição provada por gate.

**Não fecha (continua pendente, sem correção misturada):**

- Os outros **8 resíduos da fila**: E9, PU4, PU5, PU6, 09E-7, 09E-8, ID3, ID4. Nenhum foi iniciado.
- **Todos os outros botões sem classe** do portal administrativo. A classe nova é aplicada **apenas** aos 2 seletores auditados; nenhum reparo transversal foi feito e nenhum outro botão foi medido nem alterado.
- O contraste noturno transversal (**E8**) e os demais achados E2–E7 do plano mestre para `/admin/financeiro`, inclusive `<main>` aninhado em `src/app/admin/AdminGate.tsx:115`.
- **C11**: fora de escopo, somente por ordem expressa do proprietário.
- Os 2 hits auditados e não corrigidos da 07E-2 (`FiscalWorkspace.tsx` `supported_obligations||[]` e `ExpenseWorkspace.tsx` `history[e.id]||[]`), com a justificativa registrada preservada.
- **E3-R2 continua encerrada como observação**: nada aqui tocou timeout, asserção, retry ou workflow do job `ux-ops-postgres-browser`; a falha daquele job continua **não atribuída** ao 07D-1 e o resíduo só reabre com logs completos.
- UX-PRO-07 como um todo.
- Homologação/Produção: **NO-GO**. Nada aqui declara aceite humano, UAT ou conformidade WCAG.

## 2. O defeito na implementação anterior (com `file:line` da base `1f9fc1d`)

Os dois botões renderizavam **sem `className`**, portanto com estilo UA nativo:

| # | Arquivo:linha (base) | `data-testid` | Marcações na base |
| --- | --- | --- | --- |
| 1 | `FiscalWorkspace.tsx:118` | `fin11-retry` | `<button type="button" data-testid="fin11-retry" disabled={loading} onClick={()=>void load()}>` — sem `className` |
| 2 | `ExpenseWorkspace.tsx:158` | `fin10-retry` | `<button data-testid="fin10-retry" onClick={()=>load()} disabled={loading}>` — sem `className` |

Causa exata: os dois arquivos **já importam** `UiWorkspace.module.css`, mas a única regra de alvo para botões daquele módulo é escopada ao contêiner `.actions` (`UiWorkspace.module.css:58-59`). Os botões de repetição vivem dentro de `div[role="alert"]`, fora de `.actions`; `.legacy` (`:178-182`) cobre `table/th/td/input/select/textarea/pre/a`, **não `button`**; e `.workspace input/select/textarea` (`:22-26`) cobre **campos**, não botões. Nenhuma regra os alcançava.

Reconciliação com o registro antigo: as linhas **80** e **176** citadas no registro anterior **migraram** para **118** e **158**, como a fila advertia. `grep -rn "fin11-retry\|fin10-retry"` em `src/`, `tests/` e `scripts/` confirma que existem **exatamente 2** pontos de origem (mais 3 referências de teste: `tests/l07-delivery.integration.test.mjs:1318,1545` e `tests/ux-finance-workspace.integration.test.mjs:1296`).

## 3. Limiar revalidado antes do RED (não inventado nesta fatia)

| Fonte | Valor |
| --- | --- |
| `src/styles/ux-tokens.css:57` | `--ux-height-target: 44px` (já consumido por `AdminThemeToggle.module.css:6` e `comercial/Comercial.module.css:68`) |
| `tests/ux-emergency-workspace.integration.test.mjs` (`measureSurface`, `measuredProblems`) | alvo `>= 44`, contraste `>= 4,5:1`, transbordo `<= 1 px` |
| `docs/UX-PRO-07-EMERGENCIAL-RELATORIO-2026-10-14.md:82,100`; `UX-PRO-07-ESCOPO-EMERGENCIAL-ANTES-2026-10-14.md:103,109-112`; `UX-PRO-07B-2-*`; `UX-PRO-06-CARTEIRA-ESTADOS-2026-10-13.md:44`; `UX-PRO-06-CLIENTES-ESCOPO-2026-10-14.md:63`; `UX-PRO-06-CONTRATO-DETALHE-ESCOPO-2026-10-14.md:63`; `UX-PRO-03-*` | alvo mínimo de 44 px |

## 4. RED canônico — medição real na base, antes do reparo

Executado com `UX_FINANCE_TEST_PATTERN='UX-PRO-07E-2-ALVO' node scripts/qa-ux-finance-postgres.mjs` (PostgreSQL descartável + HTTP real + Chromium), **sem nenhuma alteração de produto**:

```
not ok 1 - UX-PRO-07E-2-ALVO browser: os botões "Tentar novamente" de FIN-11 e FIN-10 têm alvo >= 44px …
  fin11-retry em 1440x900 no tema day: altura do alvo de 29px abaixo do limiar da casa (44px)
# tests 2 | # pass 1 | # fail 1
```

As 16 medições da base (2 botões × 2 temas × 4 viewports):

| botão | viewports | tema | altura | largura | contraste | transbordo | `disabled` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fin11-retry` | 1440/768/390/320 | dia | **29 px** ❌ | 145 px | 18,26:1 | 0 px | false |
| `fin11-retry` | 1440/768/390/320 | noite | **29 px** ❌ | 145 px | 5,33:1 | 0 px | false |
| `fin10-retry` | 1440/768/390/320 | dia | **29 px** ❌ | 145 px | 18,26:1 | 0 px | false |
| `fin10-retry` | 1440/768/390/320 | noite | **29 px** ❌ | 145 px | 5,33:1 | 0 px | false |

O **29 px do registro antigo foi reconfirmado nesta base**, nos dois botões, nas 4 larguras e nos 2 temas. Só a altura reprova: largura, contraste e transbordo já estavam conformes antes do reparo.

O segundo caso (`ok 2`) **já passava na base** — de propósito: ele existe para provar que o reparo **não** muda comportamento, então precisa ser verde antes e depois.

Nenhuma asserção foi afrouxada para obter o RED. O caso herdado que mede `alturaRepetir` apenas como observação (`> 0`, linha 1296) **permanece byte a byte** como registro histórico de 15/10.

## 5. O reparo (aditivo, 3 arquivos de produto)

1. **`src/components/ui/UiWorkspace.module.css`** — 1 classe **nova** `.alertAction` (+ `.alertAction:disabled`), acrescentada ao fim do arquivo. Repete as declarações já existentes de `.actions button` (altura mínima pelo token `--ux-height-target`, `padding: 8px 16px`, borda/raio/fundo/cor por tokens semânticos, `font: inherit`, `inline-flex` centralizado, `max-width: 100%`). **Nenhuma regra existente foi editada**, nenhum token novo foi criado, nenhuma cor fixa foi introduzida.
2. **`src/app/admin/financeiro/FiscalWorkspace.tsx:118`** — acrescentado `className={styles.alertAction}` ao botão `fin11-retry`.
3. **`src/app/admin/financeiro/ExpenseWorkspace.tsx:158`** — acrescentado `className={styles.alertAction}` ao botão `fin10-retry`.

**Preservado sem alteração (verificado no diff e provado pelo caso 2 do gate):** o texto `Tentar novamente`; `type="button"` do `fin11-retry`; os `data-testid`; o `disabled={loading}` dos dois; os handlers `onClick={()=>void load()}` e `onClick={()=>load()}`; o destino e o método de todas as leituras; a estrutura dos `div[role="alert"]`; a regra de `readConfirmed`/falha declarada da 07E-2; nenhuma API, permissão ou dado.

`box-sizing: border-box` é global (`src/app/globals.css:3`), então os 44 px já incluem padding e borda — medido `minHeightComputado: 44px` e `alturaAlvoPx: 44` nos 16 pontos.

## 6. GREEN — medição depois do reparo

`node scripts/qa-ux-pro-07e2-alvo-postgres.mjs` (gate novo, suíte completa, sem filtro):

```
UX_FIN_07E2_ALVO_TAP_SUMMARY: pass=46 fail=0 skipped=0 todo=0 minimo_exigido=46
UX_FIN_07E2_ALVO_TEST_EXIT: 0
```

**46/46** (44 herdados + 2 novos), 0 fail, 0 skip, 0 todo, em 242 s.

| botão | viewports | tema | altura | largura | menor alvo | contraste | transbordo | `min-height` computado | `problems` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fin11-retry` | 1440/768/390/320 | dia | **44 px** | 173 px | **44 px** | **9,58:1** | 0 px | `44px` | `[]` |
| `fin11-retry` | 1440/768/390/320 | noite | **44 px** | 173 px | **44 px** | **7,83:1** | 0 px | `44px` | `[]` |
| `fin10-retry` | 1440/768/390/320 | dia | **44 px** | 173 px | **44 px** | **9,58:1** | 0 px | `44px` | `[]` |
| `fin10-retry` | 1440/768/390/320 | noite | **44 px** | 173 px | **44 px** | **7,83:1** | 0 px | `44px` | `[]` |

Cores medidas: dia `rgb(35, 63, 145)` sobre `rgb(255, 255, 255)`; noite `rgb(146, 189, 242)` sobre `rgb(24, 38, 58)` — ou seja, os tokens `--ux-color-brand`/`--ux-color-surface` de cada tema, sem cor fixa nova. Total de `problems` derivados nas 16 entradas: **0**.

Antes → depois: **29 px → 44 px** de altura (largura 145 → 173 px; contraste dia 18,26 → 9,58:1 e noite 5,33 → 7,83:1, ambos acima de 4,5:1 antes e depois; transbordo 0 px nas duas pontas).

## 7. Evidências

[`ux-pro-07e2-alvo-evidencias-2026-10-20/`](ux-pro-07e2-alvo-evidencias-2026-10-20/) — **19 arquivos**, 5,4 MB:

- **16 capturas comparativas** (Q3): `07e2-alvo-{fin11-retry,fin10-retry}-{dia,noite}-{1440,768,390,320}.png`, `fullPage`, no estado de falha declarada.
- **2 capturas de comportamento**: `07e2-alvo-{fin11-retry,fin10-retry}-recuperou.png`, provando que a repetição recupera a leitura real.
- **[`07e2-alvo-resumo.json`](ux-pro-07e2-alvo-evidencias-2026-10-20/07e2-alvo-resumo.json)**: 16 entradas com `alturaAlvoPx`, `larguraAlvoPx`, `menorAlvoPx`, `contrasteRotulo`, `transbordoDocumentoPx`, `minHeightComputado`, `corTexto`, `corFundo`, `disabled` e `problems` **derivado** das medições (nunca literal). Arquivo próprio: não sobrescreve `resumo.json` da 07E-1, `07e2-resumo.json` da 07E-2 nem `07f1-resumo.json`.

O tema foi alternado pelo **controle real da tela** (`AdminThemeToggle`, `[data-admin-theme-toggle="true"]`), não por estilo inline. As falhas foram injetadas **somente em `window.fetch` da página e somente em GET**, como nos casos herdados: servidor, banco, proxy e escritas permaneceram reais.

Estas medições são automatizadas e **não** equivalem a auditoria WCAG completa, a validação manual, a aceite humano nem a homologação.

## 8. Gate aditivo próprio

- **`scripts/qa-ux-pro-07e2-alvo-postgres.mjs`** (novo): PostgreSQL descartável + migrações reais 001–180 + HTTP real + Chromium, com auditoria TAP que rejeita `fail`, `skip`, `todo`, resumo ausente e qualquer contagem abaixo de `MINIMUM_CASES = 46`. Não aceita filtro de testes.
- **`.github/workflows/ux-pro-07e2-alvo-delivery.yml`** (novo): `npm ci` → `typecheck` → gate acima, `timeout-minutes: 40`, acionado pelos caminhos desta fatia.
- **`tests/ux-finance-workspace.integration.test.mjs`**: 2 casos novos acrescentados **ao fim**; 44 → 46 `test(` no início de linha; 1.878 → 2.138 linhas. Os primeiros **17.004 bytes** continuam com SHA-256 `42dc4da39b583445e338c9fb7d8586d43c6b1a9bc8745768b4290280f7e8ec74` (prefixo herdado da 07E-1, íntegro).
- Os runners herdados `scripts/qa-ux-finance-postgres.mjs`, `scripts/qa-ux-pro-07e1-postgres.mjs` e `scripts/qa-ux-pro-07e2-postgres.mjs` **permanecem intactos** (nenhum byte alterado).

## 9. Efeito colateral registrado: inventário UX-PRO-00

`node scripts/ux-pro-00-inventory.mjs --check` **reprovava** com as mudanças desta fatia e **passava** na base (verificado em worktree descartável de `1f9fc1d`, já removido). Causa: o inventário deriva cobertura dos filtros `paths:` de `.github/workflows` e dos `resumo.json` de evidências — esta fatia acrescentou 1 workflow e 1 diretório de evidências com capturas nos dois temas.

Os CSVs foram regenerados pelo próprio script (`node scripts/ux-pro-00-inventory.mjs`) e versionados. A mudança é de **1 linha em cada CSV**, exclusivamente `/admin/financeiro`:

- `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`: `ux-pro-07e2-alvo-delivery.yml` entra na lista de gates da rota.
- `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`: o mesmo workflow entra na coluna de jornada e o gap **"tema noturno sem captura"** é retirado da rota, porque agora existem capturas noturnas automatizadas registradas para ela.

**Limite honesto desse efeito:** as capturas noturnas registradas são do **estado de falha declarada com o botão de repetir**, nos 4 viewports. Elas **não** constituem auditoria noturna da rota inteira, e o contraste noturno transversal (**E8**) continua pendente. O inventário continua com **100 entradas de rota / 100 rotas distintas**, `chamadasLocalePadrao: 0`, e `--check` agora devolve `OK`.

## 10. Gates da casa (todos nesta base + reparo)

| Verificação | Resultado |
| --- | --- |
| `npm ci` (primeiro, em sandbox novo) | 83 pacotes, 0 vulnerabilidades |
| Gate novo completo `qa-ux-pro-07e2-alvo-postgres.mjs` | **46/46**, fail 0, skip 0, todo 0 |
| RED antes do reparo | `not ok 1` com **29 px** medidos nos 16 pontos |
| `npm run typecheck` | **0 erros** |
| `npm run build` | **OK, 105 páginas** |
| `npm run test:unit` | **975/975**, fail 0, skip 0, todo 0 |
| `node scripts/qa-wave0-static.mjs` | **5/5** OK; 0 imports ausentes; 0 migrações ausentes |
| `node scripts/ux-pro-00-inventory.mjs --check` | **OK**, 100 rotas (após regeneração versionada da seção 9) |
| `git diff --check` | limpo |
| `next-env.d.ts` | MD5 **`87a8bf5c65d00003ad1eba1613711943`** restaurado após cada `tsc`/`build`/`dev` |
| `tsconfig.json` | MD5 **`99f7042f814e77e67b785906e5d4df23`** intacto |
| `tests/ux-portal-workspace.integration.test.mjs` | não tocado; `randomBytes(32).toString('base64url')` preservado |
| Gates pesados navegador/PostgreSQL | executados **sequencialmente**, nunca em paralelo |

## 11. Ponta solta PR #277 — conferida somente leitura, sem ação

Confirmada **duplicata/superada**, sem fechar, sem reabrir, sem comentar e sem reaplicar nada:

- `gh pr view 277` → `OPEN`, `headRefName: arena/86484f7b-gruposegsystemseguranca`, 1 commit (`95105bd`).
- `git diff --stat origin/main origin/pr-277 -- src/app/admin/operacao/OperacaoWorkspace.tsx` → **vazio**: o arquivo central da E3-R1 é **idêntico** ao de `main`.
- `main` confirma o código: `OperacaoWorkspace.tsx:1493` usa `<Stamp value={cov.requested_at} />`, e os três docs `UX-PRO-E3-R1-*-2026-10-20.md` já estão em `main`.
- Diff completo branch↔`main`: **1.100 linhas a menos** no branch (16 arquivos). Mergear a #277 **reverteria** trabalho posterior já mergeado (E3-R2 e E3-CRM).
- O clone é `shallow`, então `merge-base` não é calculável; a conclusão se apoia no diff de conteúdo arquivo a arquivo, não em ancestralidade.

**Recomendação:** fechar como superada, **sem** reaplicar commit. **Não executada** — a guarda permanente exige autorização explícita do proprietário para fechar, e a delegação genérica de Q4 não nomeia esse ato. Aguardando ordem.

## 12. Arquivos desta fatia

**Produto (3):** `src/components/ui/UiWorkspace.module.css` (+35), `src/app/admin/financeiro/FiscalWorkspace.tsx` (+2/-1), `src/app/admin/financeiro/ExpenseWorkspace.tsx` (+3/-1).
**Gate (4):** `tests/ux-finance-workspace.integration.test.mjs` (+260), `scripts/qa-ux-pro-07e2-alvo-postgres.mjs` (novo), `.github/workflows/ux-pro-07e2-alvo-delivery.yml` (novo), CSVs do inventário (1 linha cada).
**Docs/evidências:** este relatório, o escopo ANTES e 19 arquivos em `ux-pro-07e2-alvo-evidencias-2026-10-20/`.

## 13. Declaração final

Nada aqui declara aceite humano, UAT, validação manual ou conformidade WCAG. Homologação e Produção permanecem **NO-GO**. As medições são automatizadas, reproduzíveis pelo gate listado na seção 8, e descrevem apenas o recorte auditado da seção 1.

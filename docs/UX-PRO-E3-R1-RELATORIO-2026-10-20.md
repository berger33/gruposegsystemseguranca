# UX-PRO-E3-R1 — relatório (20/10/2026)

**Subfatia:** E3-R1 — fallback `requested_at` (`TIMESTAMPTZ`) exibido só como data, sem hora e sem fuso, em `/admin/operacao` · `CoveragePanel`.

**Branch da sessão:** `arena/d9ff880a-gruposegsystemseguranca` · **Base confirmada:** `origin/main` = `0a75c5b806a87375ea910667e04c93adcd1dde16` (merge da PR #276, contendo o escopo prévio [`docs/UX-PRO-E3-R1-ESCOPO-ANTES-2026-10-20.md`](UX-PRO-E3-R1-ESCOPO-ANTES-2026-10-20.md) e a UX-PRO-E3 da PR #275). `git fetch origin main` + `git rev-parse origin/main` conferidos antes de qualquer edição; árvore limpa; nenhuma outra PR aberta.

**Decisão explícita do proprietário (registrada nesta sessão antes do RED):**
- **Q1:** `E3-R1` — `CoveragePanel` em `src/app/admin/operacao/OperacaoWorkspace.tsx:1493` (1 subfatia = 1 PR);
- **Q2:** via **(a)** — fuso `America/Sao_Paulo` declarado no próprio texto + instante ISO original preservado como texto secundário, reutilizando `Stamp` / `opsDateTime` / `opsIsoStamp` (`src/lib/ops-dates.mjs`), mantendo `coverage_date` (`DATE`) em ISO sem conversão de fuso;
- **Q3:** `celula_hint` — instante ISO secundário na **mesma célula** com ` · ISO` em `styles.hint` (`<Stamp value={cov.requested_at} />`).

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação e produção permanecem NO-GO.**

---

## 1. Correção aplicada

Uma única linha de `src/app/admin/operacao/OperacaoWorkspace.tsx` (`CoveragePanel`, `:1493`) foi alterada:

```tsx
// antes (:1493)
<td>{cov.coverage_date || String(cov.requested_at).slice(0, 10)}</td>

// depois (:1493)
<td>{cov.coverage_date ? String(cov.coverage_date).slice(0, 10) : <Stamp value={cov.requested_at} />}</td>
```

Comportamento resultante por caso:

| Entrada (`CoverageRequest`) | Antes | Depois |
|---|---|---|
| `coverage_date: null`, `requested_at: "2026-10-05T02:30:00Z"` | `2026-10-05` *(perde hora/fuso e erra o dia civil em SP)* | `04/10/2026 23:30 (America/Sao_Paulo) · 2026-10-05T02:30:00Z` |
| `coverage_date: null`, `requested_at: "2026-10-05T14:32:00Z"` | `2026-10-05` *(colide com `02:30Z`)* | `05/10/2026 11:32 (America/Sao_Paulo) · 2026-10-05T14:32:00Z` |
| `coverage_date: "2026-10-08"`, `requested_at: "2026-10-05T02:30:00Z"` | `2026-10-08` | `2026-10-08` *(inalterado — `DATE` nunca passa por `opsDateTime`)* |

Contagens mecânicas verificadas em `src/app/admin/operacao/OperacaoWorkspace.tsx`:
- **8** ocorrências de `<Stamp value=` (7 da E3 + 1 fallback `cov.requested_at` da E3-R1);
- **2** chamadas de `opsDateTime(` e **2** de `opsIsoStamp(` (`Stamp` + selo de ciência `Ciente desde`);
- **0** ocorrências de `slice(0, 16)` e **0** ocorrências de `String(cov.requested_at).slice(0, 10)`;
- **19** ocorrências de `slice(0, 10)` em **15** linhas — todas agora estritamente sobre datas de calendário (`DATE`), incluindo `String(cov.coverage_date).slice(0, 10)`.

---

## 2. RED → GREEN

### 2.1 RED focal estático (antes do reparo em `OperacaoWorkspace.tsx`)

Executado com `src/app/admin/operacao/OperacaoWorkspace.tsx` intocado no `HEAD` (`0a75c5b`):

```text
not ok 5 - UX-PRO-E3 varredura: as sete exibições usam o auxiliar e as colunas DATE continuam intactas
  ---
  error: |-
    as sete linhas de célula (incluindo o fallback de CoveragePanel) precisam passar pelo componente de carimbo

    7 !== 8
  expected: 8
  actual: 7
  operator: 'strictEqual'
  ...
not ok 7 - UX-PRO-E3-R1 varredura: CoveragePanel preserva coverage_date (DATE) e usa Stamp para requested_at
  ---
  error: 'requested_at (TIMESTAMPTZ) não pode mais ser truncado com slice(0, 10)'
  expected: true
  actual: false
  operator: '=='
  ...
1..7
# tests 7
# pass 5
# fail 2
```

### 2.2 RED canônico de navegador + PostgreSQL (antes do reparo em `OperacaoWorkspace.tsx`)

Caso aditivo `29` em `tests/ux-ops-workspace.integration.test.mjs`, executado via `npm run test:ux-ops:pg` (`MINIMUM_CASES = 29`) com PostgreSQL 17 temporário real, servidor HTTP real e Chromium empacotado, com `OperacaoWorkspace.tsx` ainda intocado:

```text
not ok 29 - E3-R1 browser: CoveragePanel com coverage_date=null exibe requested_at em America/Sao_Paulo + ISO na célula sem colidir 02:30Z e 14:32Z e preserva DATE
  ---
  duration_ms: 4016.423439
  type: 'test'
  location: '/home/user/gruposegsystemseguranca/tests/ux-ops-workspace.integration.test.mjs:1528:1'
  failureType: 'testCodeFailure'
  error: 'requested_at distintos (02:30Z vs 14:32Z) com coverage_date=null não podem colidir na mesma data truncada; recebido: virada="2026-10-05" vs diurno="2026-10-05"'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: '2026-10-05'
  actual: '2026-10-05'
  operator: 'notStrictEqual'
  ...
1..29
# tests 29
# suites 0
# pass 28
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 158796.919978
UX_OPS_TAP_SUMMARY: pass=28 fail=1 skipped=0 todo=0 minimo_exigido=29
UX_OPS_GATE_REJECTED: 1 caso(s) reprovado(s); apenas 28 caso(s) aprovado(s); o gate exige ao menos 29
UX_OPS_TEST_EXIT: 1
QA_PG_TEMP_CLEANED: true
```

### 2.3 GREEN canônico

Após alterar apenas `OperacaoWorkspace.tsx:1493`:

```text
ok 28 - E3 browser: carimbos timestamptz saem em São Paulo com o fuso declarado e o ISO preservado, sem colidir
  ---
  duration_ms: 4758.390207
  type: 'test'
  ...
ok 29 - E3-R1 browser: CoveragePanel com coverage_date=null exibe requested_at em America/Sao_Paulo + ISO na célula sem colidir 02:30Z e 14:32Z e preserva DATE
  ---
  duration_ms: 3876.701689
  type: 'test'
  ...
1..29
# tests 29
# suites 0
# pass 29
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 149063.367576
UX_OPS_TAP_SUMMARY: pass=29 fail=0 skipped=0 todo=0 minimo_exigido=29
UX_OPS_TEST_EXIT: 0
QA_PG_TEMP_CLEANED: true
```

No caso `29`, o Chromium verificou na aba **Cobertura** (`section[aria-labelledby="coverage-title"]`):
1. `celulaVirada` (`coverage_date: null`, `requested_at: "2026-10-05T02:30:00Z"`) ≠ `celulaDiurno` (`coverage_date: null`, `requested_at: "2026-10-05T14:32:00Z"`);
2. virada de dia em São Paulo: `04/10/2026 23:30 (America/Sao_Paulo)` + `<span class="...hint..."> · 2026-10-05T02:30:00Z</span>` na mesma célula;
3. mesmo dia UTC diurno: `05/10/2026 11:32 (America/Sao_Paulo)` + `<span class="...hint..."> · 2026-10-05T14:32:00Z</span>` na mesma célula;
4. `coverage_date: "2026-10-08"` (`DATE`): texto exato `2026-10-08`, sem conversão de fuso e sem `<span>` secundário (`count() === 0`).

### 2.4 Observação transparente sobre execução em paralelo (`E3-R2`)

Na primeira tentativa de GREEN, disparada em paralelo no mesmo sandbox junto com `npm test` + `npm run typecheck`, o caso `29` (`E3-R1 browser`) já passou em `3,98 s`, mas o caso herdado `13` (`browser 07D-1: 2xx sem a lista canônica no painel inicial é falha declarada, não vazio`, `:761`, já catalogado como **E3-R2** em [`UX-PRO-E3-RELATORIO-2026-10-19.md`](UX-PRO-E3-RELATORIO-2026-10-19.md)) excedeu `45000ms` aguardando `[role="tablist"]` sob contenção de CPU. Executado isoladamente sem alteração de timeout nem de asserção, o gate passou **29/29** em `149,1 s` com o caso `13` em `3,71 s`. Nenhum timeout ou asserção foi alterado.

---

## 3. Gates executados (saída real desta sessão)

| Gate | Resultado |
|---|---|
| `npm ci` | `added 83 packages`, `0 vulnerabilities`, `git status --porcelain` vazio |
| `node --test tests/ux-pro-e3-ops-dates.test.mjs` (RED → GREEN) | RED `pass 5 / fail 2` → GREEN **7/7** (`314,9 ms`) |
| `npm run test:ux-ops:pg` (RED, `MINIMUM_CASES = 29`) | `pass=28 fail=1 skipped=0 todo=0 minimo_exigido=29`, `UX_OPS_TEST_EXIT: 1`, `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ux-ops:pg` (GREEN isolado, `MINIMUM_CASES = 29`, timeout padrão) | **29/29**, `UX_OPS_TAP_SUMMARY: pass=29 fail=0 skipped=0 todo=0 minimo_exigido=29`, `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` (`149,1 s`; `E3-R1` em `3,88 s`) |
| `npm run test:l06-delivery:pg` | **9/9** na primeira execução (`42,6 s`), `L06_DELIVERY_TEST_EXIT: 0`, `QA_L06_PG_TEMP_CLEANED: true` — asserções herdadas de `DATE` intocadas |
| `npm test` | **975/975** (968 herdados + 5 E3 + 2 E3-R1), `fail 0`, `skipped 0`, `todo 0` |
| `npm run typecheck` | exit **0**, sem diagnóstico |
| `npm run build` | `✓ Generating static pages using 1 worker (105/105)`, sem erro |
| `node scripts/qa-wave0-static.mjs` | **5/5** verificações estáticas OK; 0 imports ausentes; 0 migrações ausentes |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK: … conferem com o código atual` (100 rotas; **nenhum** CSV alterado) |
| `git diff --check` | sem marcador de whitespace |
| `md5sum next-env.d.ts tsconfig.json` | `87a8bf5c65d00003ad1eba1613711943` / `99f7042f814e77e67b785906e5d4df23` restaurados e conferidos |

---

## 4. Contratos e funcionalidades preservados

- **Código de aplicação:** alterado unicamente `src/app/admin/operacao/OperacaoWorkspace.tsx:1493`.
- **`src/lib/ops-dates.mjs` e `package.json`:** intocados.
- **API, banco, migrações 001–180, RBAC, sessão, auditoria, ordenação, filtros, estados (`UiState`) e textos de botão/rótulo:** intocados.
- **Datas de calendário (`DATE`):** todas as 19 ocorrências de `slice(0, 10)` permanecem exclusivas de colunas `DATE` (nenhuma passa por `opsDateTime`).
- **E3-CRM (`src/app/admin/crm/OpportunitySummary.tsx:82`):** intocado (`toISOString().slice(0, 16)` em `<input type="datetime-local">`, família de entrada).
- **L06 (`test:l06-delivery:pg`) e UX-Ops (`test:ux-ops:pg` casos 1–28):** verdes sem afrouxar nenhuma asserção.

---

## 5. Limites e fila remanescente (nada liberado sem decisão)

- **E3-R1** encerrada nesta PR; restam **11** resíduos numerados da fila (`E3-CRM`, `E3-R2`, `E9`, `PU4`, `PU5`, `PU6`, `09E-7`, `09E-8`, `ID3`, `ID4`, `07E-2`) mais as rotas `UX-PRO-07F→07M` — ver [`UX-PRO-E3-R1-PROMPT-PROXIMA-SUBFATIA-2026-10-20.md`](UX-PRO-E3-R1-PROMPT-PROXIMA-SUBFATIA-2026-10-20.md).
- Nenhuma captura visual nova foi gerada (a fatia não alterou CSS nem layout de colunas; reutilizou `Stamp` / `styles.hint` existentes).
- Não há aceite humano, leitor de tela, UAT, validação em Windows ou conformidade WCAG declarados. Homologação e produção continuam **NO-GO**.

---

## 6. Reprodução

```text
npm ci
node --test tests/ux-pro-e3-ops-dates.test.mjs
npm run test:ux-ops:pg
npm run test:l06-delivery:pg
npm test
npm run typecheck
npm run build
git checkout HEAD -- next-env.d.ts tsconfig.json
node scripts/qa-wave0-static.mjs
node scripts/ux-pro-00-inventory.mjs --check
git diff --check
md5sum next-env.d.ts tsconfig.json
```

# UX-PRO-E3-R1 — escopo ANTES e bloqueio de decisão (20/10/2026)

**Subfatia:** E3-R1 — `requested_at` (`TIMESTAMPTZ`) exibido só como data, sem hora e sem fuso, em `/admin/operacao` · `CoveragePanel`.

**Branch da sessão:** `arena/58bb6102-gruposegsystemseguranca` · **Base confirmada:** `origin/main` = `f5c006d90f4c3a424f2bef7807e60dbb11a06e8e` (merge da PR #275; contém UX-PRO-E3 com `America/Sao_Paulo` + ISO, #272/#273, #271, E2-C1 verificada). `git fetch origin main` + `git rev-parse origin/main` conferidos nesta sessão; `git status --porcelain` vazio antes das medições; nenhuma PR aberta além desta branch.

**Guardas de arquivo:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` e `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23`, conferidos antes de qualquer leitura.

**STATUS: sem decisão do proprietário — sem código.** Este documento foi gravado **antes** de qualquer alteração, medindo o defeito na base real, o que os testes herdados fixam e as vias possíveis. A execução desta fatia **não** foi iniciada. Vale: 1 subfatia = 1 sessão = 1 PR pequena; nada de aceite humano, UAT ou conformidade WCAG; homologação e produção **NO-GO**.

---

## 0. Por que esta sessão para aqui

O prompt da fila ([UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md](UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md)) contém **bloqueio de decisão explícito**: nenhum dos 12 resíduos pode ser codado sem escolha do proprietário para **esta** sessão (qual item entra, qual convenção para família de datas, qual postura para método/produto). A instrução manda, na ausência de decisão, “gravar `docs/UX-PRO-<SLICE>-ESCOPO-ANTES-AAAA-MM-DD.md` com a medição da base e a pergunta, **sem alterar código**”. É o que este documento faz. O código de E3-R1 **não** foi iniciado.

A proposta aqui é **E3-R1** — o único resíduo de exibição deixado no mesmo arquivo da E3 (`OperacaoWorkspace.tsx:1493`), fora das 7 ocorrências já corrigidas. Ele é o menor incremento da família de datas e mantém a convenção E3 sem abrir outra rota.

---

## 1. Entradas lidas e entradas ausentes

Lidos nesta sessão, antes de qualquer medição, na base `f5c006d`:

- [`AGENTS.md`](../AGENTS.md) (raiz — **não existe `docs/AGENTS.md`**), [`README.md`](../README.md), [`docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`](ARENA-PRESERVAR-FUNCIONALIDADES.md);
- [`docs/UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md`](UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md) (fila de 12 resíduos + guardas; **não autoriza subfatia**);
- [`docs/UX-PRO-E3-ESCOPO-ANTES-2026-10-19.md`](UX-PRO-E3-ESCOPO-ANTES-2026-10-19.md), [`docs/UX-PRO-E3-RELATORIO-2026-10-19.md`](UX-PRO-E3-RELATORIO-2026-10-19.md), [`docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md`](CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md) (E3 entregue, E2/E5/E8/E6/E6-C1/C11 em `main`, E9 não reproduz);
- `src/app/admin/operacao/OperacaoWorkspace.tsx` (integral, 1639 linhas), `src/lib/ops-dates.mjs` (84 linhas, E3), `src/app/admin/crm/OpportunitySummary.tsx` (E3-CRM, `datetime-local`);
- `tests/l06-delivery.integration.test.mjs`, `tests/ux-ops-workspace.integration.test.mjs`, `tests/ui-surface-locale.test.mjs`, `tests/ux-ops-vocabulary.test.mjs`, `tests/ux-pro-e3-ops-dates.test.mjs`;
- migrações `071-ops05-06-07-08-cobertura-passagem-ocorrencia-checklist.sql` (`ops_coverage_requests`, `requested_at TIMESTAMPTZ`), `120-l06-fatia-b-operacao.sql` (`coverage_date DATE`).

Ausência registrada:

| Entrada citada | Estado real nesta base |
|---|---|
| Prompt autorizando E3-R1 | **Não existe.** O prompt da fila lista E3-R1 como “decisão de escopo” e manda pedir decisão antes de codar. A instrução operativa é a mensagem do pedido + este escopo. |

---

## 2. Defeito medido na base `f5c006d`

Uma linha de `CoveragePanel` exibe `requested_at` **só como data**, sem hora e sem fuso:

| Linha | Campo | Coluna de origem (migração) | Tipo | Expressão atual | Exemplo `2026-10-05T14:32:00Z` | Exemplo `2026-10-05T02:30:00Z` |
|---|---|---|---|---|---:|---:|
| `OperacaoWorkspace.tsx:1493` | `coverage_date` / `requested_at` | `ops_coverage_requests.coverage_date` (`120:10`) `DATE` **ou** `requested_at` (`071:26`) `TIMESTAMPTZ` | `DATE` ou `TIMESTAMPTZ` | `cov.coverage_date \|\| String(cov.requested_at).slice(0, 10)` | `2026-10-05` | `2026-10-05` (deveria ser `04/10/2026 23:30 (America/Sao_Paulo)` + ISO) |

Varredura de apoio:

- `grep -n "slice(0, 10)" src/app/admin/operacao/OperacaoWorkspace.tsx` → **13** ocorrências (12 de `DATE` legítimas + esta 1 de `TIMESTAMPTZ` disfarçada de data);
- `grep -rn "slice(0, 16)" src` → **1** ocorrência (só `OpportunitySummary.tsx:82`, E3-CRM, família de **entrada**);
- `src/lib/ops-dates.mjs` existe e já distingue `TIMESTAMPTZ` (com hora) de `DATE` (não converte, para não virar o dia anterior em São Paulo).

Prova empírica (Node 22, saída real desta sessão, `America/Sao_Paulo`):

```text
atual (slice 0,10): 2026-10-05
São Paulo 14:32Z → 05/10/2026 11:32 (America/Sao_Paulo)
São Paulo 02:30Z → 04/10/2026 23:30 (America/Sao_Paulo) — um dia antes!
```

Ou seja: quando `coverage_date` é `null`, o instante cai no fallback e perde **hora, minuto e fuso**, além de poder exibir o **dia errado** em São Paulo (virada de dia). Quem lê não sabe se `2026-10-05` é a data de cobertura informada ou o dia UTC truncado do carimbo.

### 2.1 Por que E3-R1 ficou de fora da E3

A E3 autorizou **7 ocorrências** (`validated_at`, `gap_start`/`gap_end`, `published_at`, `acknowledged_at`, `created_at`, `handover_date`, `executed_at`). O pedido listou explicitamente que `OperacaoWorkspace.tsx:1478` (na numeração da época; hoje `:1493`) era **resíduo fora de escopo**, registrado para decisão futura. Corrigi-lo na mesma PR violaria 1 subfatia = 1 PR.

---

## 3. O que os testes herdados realmente fixam (medido, não presumido)

| Gate | Asserção | O que lê | Depende de E3-R1? |
|---|---|---|---|
| `l06-delivery` Fatia B | `/2026-10-05/` (`l06:1160`) em `page.textContent("body")` na aba Dimensionamento | `gap_date` (`DATE`, `:1153`) | **Não** |
| `l06-delivery` Fatia B | `hasText: "2026-12-01"` (`l06:1171`) | `valid_from` (`DATE`, `:1221`) | **Não** |
| `l06-delivery` | `coverage_requests` vazio → `textContent` com “Nenhuma pendência de cobertura” | estado `empty` de `CoveragePanel` (`:1479`) | **Não** (estado vazio, não o valor da célula) |
| `ux-ops` | `/Ciente desde/` em 5 pontos | badge de ciência (`acknowledged_at`) | **Não** |
| `ui-surface-locale` | sem `toLocale…String()` sem localidade | varredura estática | auxiliar novo deve declarar `timeZone` (já faz) |
| `ux-pro-e3` | 5 casos de `opsDateTime`/`opsIsoStamp` | `TIMESTAMPTZ` com hora | **Não** (E3-R1 usa `slice(0,10)`, não `opsDateTime`) |

Consequência: **nenhuma asserção herdada fixa o texto de `coverage_date`/`requested_at`**. Mudar só esta célula não quebra L06/ux-ops e não exige tocar em teste herdado. O risco é de produto, não de gate: a coluna `coverage_date` (quando preenchida) é `DATE` e deve continuar em ISO; só o fallback `requested_at` é `TIMESTAMPTZ` e precisa da convenção E3.

---

## 4. As três vias em avaliação (só uma entra nesta PR)

### (a) Convenção E3 — `America/Sao_Paulo` com fuso declarado + ISO secundário — **recomendada**

Exemplo quando `coverage_date` é `null` e `requested_at = 2026-10-05T14:32:00Z`:

`05/10/2026 11:32 (America/Sao_Paulo) · 2026-10-05T14:32:00Z`

- Reusa `opsDateTime`/`opsIsoStamp` já mergeados (fuso fixo, determinístico entre máquinas, `DATE` não convertida).
- Mantém o dia auditável: o ISO original continua visível como texto secundário na mesma célula (padrão da E3, `styles.hint` em `UiWorkspace.module.css:54`).
- Quando `coverage_date` existe, mantém `String(coverage_date).slice(0,10)` exatamente como está — só o fallback usa o auxiliar.

### (b) Manter só a data, apenas rotulando o fuso

Ex.: `2026-10-05 (UTC)` ou `2026-10-05 (America/Sao_Paulo)`.

- Não resolve a perda de hora; ainda colapsa `02:30Z` e `14:32Z` do mesmo dia em `2026-10-05`.
- **Não recomendada.**

### (c) Exibir só o ISO com `UTC`

Ex.: `2026-10-05T14:32:00Z`.

- Menor mudança, mas quebra a convenção E3 já entregue nas 7 linhas vizinhas e volta a exigir conversão mental.
- **Recomendada apenas se o proprietário preferir consistência UTC em todo o painel.**

---

## 5. Desenho proposto para (a), se autorizada

1. **Uma linha alterada**, só na célula de data de `CoveragePanel` (`:1493`):
   - se `coverage_date` existe → `String(coverage_date).slice(0,10)` (inalterado);
   - senão → `<Stamp value={cov.requested_at} />` (mesmo `Stamp` local da E3, ou `opsDateTime`/`opsIsoStamp` direto, com `styles.hint` para o ISO).
2. **Sem tocar** em API, payloads, banco, migrações 001–180, RBAC, sessão, auditoria, ordenação, filtros, estados, textos de botão ou conteúdo de negócio. A coluna `coverage_date` continua `DATE` em ISO.
3. **Prova focal estática** (aditiva a `tests/ux-pro-e3-ops-dates.test.mjs` ou novo `tests/ux-pro-e3-r1-ops-dates.test.mjs`): `02:30Z` → `04/10` vs `14:32Z` → `05/10` (virada de dia), ISO preservado, `DATE` não convertida.
4. **Gate de navegador** (aditivo a `tests/ux-ops-workspace.integration.test.mjs`): injetar em `window.fetch` um `coverage_request` com `coverage_date=null` e `requested_at` conhecido, e conferir o texto renderizado na tabela de cobertura. Nenhum servidor/banco/permissão alterado.
5. **Sem** `toLocale…String()` sem localidade; `DATE` nunca passa por `opsDateTime`.

---

## 6. Decisão necessária (numerada)

**Q1 — Qual item entra nesta sessão?** `E3-R1` (**proposto**, menor incremento da família de datas; mantém a convenção E3), `E3-CRM` (entrada `datetime-local`, família própria), `07F` (`/admin/frota`) ou outro da fila de 12. Só um por PR.

**Q2 — Se E3-R1, qual via?** `(a)` `America/Sao_Paulo` + ISO (**recomendada**), `(b)` só data com fuso rotulado, ou `(c)` ISO com UTC.

**Q3 — Se (a), como exibir o ISO secundário de E3-R1?** Na mesma célula com ` · ISO` discreto (**recomendado**, padrão da E3), ou em `title` (não lido por `textContent`, perderia auditoria na tela).

Sem resposta a Q1, esta subfatia permanece **sem código**. Se a resposta for outro item da fila, este escopo serve como medição-base e o próximo ESCOPO-ANTES deve medir a rota/item escolhido.

---

## 7. Fora do escopo, registrado (não corrigido)

- **E3-CRM** — `OpportunitySummary.tsx:82` — `new Date(...).toISOString().slice(0, 16)` em `<input type="datetime-local">` (entrada, não exibição). Exige decisão de produto sobre `datetime-local` (valor sem fuso).
- **E3-R2**, **E9**, **PU4**, **PU5**, **PU6**, **09E-7**, **09E-8**, **ID3**, **ID4**, **07E-2** — resíduos listados na [fila](UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md#2-fila-real-de-resíduos-cada-item-exige-decisão-explícita), cada um exigindo decisão antes de codar.
- **UX-PRO-07F→07M** — fila de rotas do cronograma; nenhuma autorizada por este documento.
- Nada de validação manual, leitor de tela, homologação, revisão humana ou aceite humano.

---

## 8. Medições da base `f5c006d` (antes de qualquer edição)

| Verificação | Resultado real nesta sessão |
|---|---|
| `git rev-parse HEAD` / `origin/main` | `f5c006d90f4c3a424f2bef7807e60dbb11a06e8e` / idem |
| `git status --porcelain` | vazio antes e depois das medições |
| `next-env.d.ts` / `tsconfig.json` | MD5 `87a8bf5c65d00003ad1eba1613711943` / `99f7042f814e77e67b785906e5d4df23` |
| `npm test` (gate unitário, base) | **973/973** (968 herdados + 5 de `ux-pro-e3-ops-dates`), `fail 0` |
| `grep -rn "slice(0, 16)" src` | **1** ocorrência (`OpportunitySummary.tsx:82`, E3-CRM) |
| `grep -n "slice(0, 10)" src/app/admin/operacao/OperacaoWorkspace.tsx` | **13** ocorrências (12 de `DATE` + 1 de E3-R1 em `:1493`) |
| `src/lib/ops-dates.mjs` | 84 linhas; `OPS_TIME_ZONE = "America/Sao_Paulo"`; `DATE` não convertida |
| `node scripts/qa-wave0-static.mjs` (base) | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` (base) | 100 rotas, CSVs conferem |

Nenhum gate de navegador/PostgreSQL/build foi executado, porque não houve alteração de código. Serão obrigatórios na execução (seção 9).

---

## 9. Gates planejados para a execução (após a decisão)

1. RED focal gravado **antes** do reparo, aditivo a `tests/ux-ops-workspace.integration.test.mjs` ou ao teste estático de datas, com mensagem exata no relatório; prova de virada de dia (`02:30Z`→`04/10` vs `14:32Z`→`05/10`) e de que o texto não é só `2026-10-05`.
2. `npm run test:ux-ops:pg` (28+1 casos; `MINIMUM_CASES` 28 → 29 na execução).
3. `npm run test:l06-delivery:pg` (asserções de `DATE` intocadas).
4. `npm test` (973+), `npm run typecheck`, `npm run build` (105 páginas).
5. `node scripts/qa-wave0-static.mjs` (5/5).
6. `node scripts/ux-pro-00-inventory.mjs --check` (100 rotas; diff coluna por coluna; atenção à armadilha `EMPTY_MARKERS` em comentários).
7. `git diff --check`; guardas `next-env.d.ts`/`tsconfig.json` restauradas após build/gates Next.
8. `npm ci` primeiro em sandbox novo; capturas só se a fatia exigir.

---

## 10. Limites

- Este documento **não** é a implementação de E3-R1. Ele mede o defeito e formula a decisão que falta.
- A prova da seção 2 é leitura de código + `Intl` em Node; não é captura de navegador nem leitor de tela.
- Não há aceite humano, UAT, homologação ou conformidade WCAG declarados. Homologação e produção seguem **NO-GO**.

---

## 11. Reprodução

```text
git rev-parse HEAD && git rev-parse origin/main
md5sum next-env.d.ts tsconfig.json
grep -n "coverage_date ||" src/app/admin/operacao/OperacaoWorkspace.tsx
grep -n "slice(0, 10)" src/app/admin/operacao/OperacaoWorkspace.tsx
node -e "const a='2026-10-05T14:32:00Z',b='2026-10-05T02:30:00Z';const f=v=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hourCycle:'h23',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v));console.log(String(a).slice(0,10),f(a));console.log(String(b).slice(0,10),f(b));"
npm test
```

## 12. Decisão pendente

Aguardando resposta do proprietário a **Q1/Q2/Q3**. Este documento não autoriza código. A próxima sessão que receber a decisão deve registrar a resposta no relatório e só então iniciar o RED.


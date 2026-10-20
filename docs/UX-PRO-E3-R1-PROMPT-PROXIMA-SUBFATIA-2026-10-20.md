# Prompt da próxima pendência — decisão do próximo item pós E3-R1 (20/10/2026)

**Estado ao encerrar a UX-PRO-E3-R1:** `E3` (PR #275) e `E3-R1` (esta PR) encerradas na via **(a)** (`America/Sao_Paulo` declarado + ISO secundário na mesma célula com `styles.hint`). Em `/admin/operacao` (`OperacaoWorkspace.tsx`), todas as 8 exibições de carimbo `TIMESTAMPTZ` passam por `opsDateTime` / `opsIsoStamp` (`src/lib/ops-dates.mjs`), `test:ux-ops:pg` exige `MINIMUM_CASES = 29` (**29/29**), `test:l06-delivery:pg` segue **9/9** e `npm test` soma **975/975**. Relatório em [`UX-PRO-E3-R1-RELATORIO-2026-10-20.md`](UX-PRO-E3-R1-RELATORIO-2026-10-20.md).

**Este documento não autoriza nenhuma subfatia.** Continua valendo: 1 subfatia = 1 sessão = 1 PR pequena; decisão explícita do proprietário antes de codar; nada de aceite humano, UAT ou conformidade WCAG; homologação e produção **NO-GO**.

---

## 1. Fila real de resíduos pendentes (11 itens + 07F→07M)

| ID | Descrição | Natureza |
|---|---|---|
| **E3-CRM** | `src/app/admin/crm/OpportunitySummary.tsx:82` — `new Date(...).toISOString().slice(0, 16)` preenchendo `<input type="datetime-local">` (formato de **entrada** sem fuso, família própria) | decisão de escopo/produto |
| **E3-R2** | Instabilidade ambiental sob contenção de CPU no caso herdado `07D-1` (`tests/ux-ops-workspace.integration.test.mjs:761`, timeout de 45 s); passa em ~3,7 s em execução isolada | observação para CI; não alterar timeout sem decisão |
| **E9** | Quebra de palavra em cabeçalhos a 768 px (`UiWorkspace.module.css:11`), limitada a 1 `h1`; **não reproduz** na base atual | registro |
| **PU4** | Probe da 09E mede só 7 tags e só o estado inicial; `dt`/`span`/`footer`/`.field span`/`.hint`/`.error` sem medição | decisão de método |
| **PU5** | `.steps li` vence `.stepActive`/`.stepDone`; etapas não se distinguem por cor | decisão de escopo |
| **PU6** | `Layout09.module.css:64 .progressStep` com contraste 2,36:1, em prévia fora das 14 rotas públicas | decisão de escopo |
| **09E-7** | `attributeTextOverflow` é opt-in; levar às demais etapas | decisão de método |
| **09E-8** | Ruído de renderização na rota de aceite sintético e divergência `day`/`night` em 3 rotas | limitação do método |
| **ID3** | `workspaceFetch` nas outras 10 páginas do portal do cliente | família própria |
| **ID4** | `setup.uri`/`otpauth` nunca exibido (possível postura deliberada de segurança) | decisão de produto |
| **07E-2** | Alvo de toque de 29 px do botão de repetir legado no financeiro (`FiscalWorkspace.tsx:80`, `ExpenseWorkspace.tsx:176`) | decisão de escopo |

Além dos 11 resíduos acima, o cronograma mantém **UX-PRO-07F→07M** (`/admin/frota` a seguir, caso escolhida).

---

## 2. Decisão necessária antes de codar na próxima sessão

Responder explicitamente:
- **Q1:** Qual único item entra na próxima sessão (`UX-PRO-07F` `/admin/frota`, `E3-CRM`, `07E-2`, `PU5`, `ID3` ou outro da tabela acima)?
- **Q2:**
  - Se **`E3-CRM`**: converter o valor inicial/enviado de `<input type="datetime-local">` para `America/Sao_Paulo` com rótulo de fuso visível ao lado do campo (ou preservar comportamento atual / trocar controle)?
  - Se **`UX-PRO-07F` (`/admin/frota`)**: autorizar primeiro o `ESCOPO-ANTES` medido + subfatia de leitura honesta `07F` (ou `07F-2` se `07F-1` já constar em `main` — conferir `git log` da rota antes de medir)?
  - Se **`07E-2` / `PU5` / outro**: confirmar escopo estritamente restrito aos seletores/linhas auditados.
- **Q3:** Se houver impacto visual (CSS/layout/contraste), exigir capturas comparativas `day`/`night` nos viewports canônicos (`320/390/768/1440`) antes do merge?

Sem resposta explícita a **Q1**, gravar apenas `docs/UX-PRO-<SLICE>-ESCOPO-ANTES-AAAA-MM-DD.md` com medição real na base, **sem alterar código**.

---

## 3. Guardas técnicas permanentes

1. `npm ci` primeiro em sandbox novo; executar gates pesados de navegador/PostgreSQL **sequencialmente** (nunca em paralelo com `build`/`tsc` sobre `.next`).
2. Restaurar `next-env.d.ts` (`87a8bf5c65d00003ad1eba1613711943`) e `tsconfig.json` (`99f7042f814e77e67b785906e5d4df23`) após `tsc` / `next build` / `dev`.
3. `tests/ux-portal-workspace.integration.test.mjs`: manter `randomBytes(32).toString('base64url')`.
4. `node scripts/qa-wave0-static.mjs` (**5/5**), `node scripts/ux-pro-00-inventory.mjs --check` (**100 rotas**, atenção a `EMPTY_MARKERS` `[Nn]enhum`), `git diff --check`.
5. RED canônico gravado antes do reparo, sem afrouxar asserções nem pular testes; 1 subfatia = 1 PR; merge apenas com `gh pr merge <n> --merge` (sem `--auto`) e todos os checks `SUCCESS`. Homologação e produção **NO-GO**.

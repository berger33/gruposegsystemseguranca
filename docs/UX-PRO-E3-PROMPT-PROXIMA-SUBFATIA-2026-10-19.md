# Prompt da próxima pendência — decisão do próximo item (19/10/2026)

**Estado ao encerrar a UX-PRO-E3:** `main` = `a93c7e37282814ce090c31c53178360c6849f7c5` + o merge desta fatia. Resíduo transversal **E3 encerrado** na via (a): fuso `America/Sao_Paulo` declarado e ISO preservado nas sete linhas de `/admin/operacao`; relatório em [UX-PRO-E3-RELATORIO-2026-10-19.md](UX-PRO-E3-RELATORIO-2026-10-19.md) e escopo/pré-decisão em [UX-PRO-E3-ESCOPO-ANTES-2026-10-19.md](UX-PRO-E3-ESCOPO-ANTES-2026-10-19.md).

**Este documento não autoriza nenhuma subfatia.** Ele registra a fila e a decisão que falta. Continua valendo: 1 subfatia = 1 sessão = 1 PR pequena; nada de aceite humano, UAT ou conformidade WCAG; homologação e produção **NO-GO**.

## 1. O que ficou decidido e entregue

- **E3** — `timestamptz` fatiado sem fuso em `/admin/operacao`: 7 linhas corrigidas com `opsDateTime`/`opsIsoStamp` (`src/lib/ops-dates.mjs`), fuso declarado e ISO secundário. Caso E3 aditivo no gate `test:ux-ops:pg` (28/28), teste estático `tests/ux-pro-e3-ops-dates.test.mjs` (5/5), L06 9/9 sem edição, `npm test` 973/973, build 105 páginas, `qa-wave0-static` 5/5 e inventário `--check` OK.
- **E2/E2-C1, E5, E8, E6/E6-C1, C11** já estavam em `main` e não foram reabertos.
- **E9** não reproduz o defeito na base atual (limite: 1 `h1`); segue apenas registrado.

## 2. Fila real de resíduos (cada item exige decisão explícita)

| ID | Descrição | Natureza |
|---|---|---|
| E3-CRM | `OpportunitySummary.tsx:82` — `toISOString().slice(0,16)` em `<input type="datetime-local">` (formato de **entrada**, família própria) | decisão de escopo |
| E3-R1 | `OperacaoWorkspace.tsx:1478` — `requested_at` (`TIMESTAMPTZ`) exibido só como data, sem fuso | decisão de escopo |
| E3-R2 | Instabilidade observada do caso herdado 07D-1 sob timeout de 45 s no sandbox; passou 28/28 na execução canônica e em 3,9 s com 90 s de timeout | observação para CI; não alterar timeout sem decisão |
| E9 | Quebra de palavra em cabeçalhos a 768 px (`UiWorkspace.module.css:11`), limitada a 1 `h1`; **não reproduz** | registro |
| PU4 | Probe da 09E mede só 7 tags e só o estado inicial; `dt`/`span`/`footer`/`.field span`/`.hint`/`.error` sem medição | decisão de método |
| PU5 | `.steps li` vence `.stepActive`/`.stepDone`; etapas não se distinguem por cor | decisão de escopo |
| PU6 | `Layout09.module.css:64 .progressStep` com a mesma cor 2,36:1, em prévia fora das 14 rotas públicas | decisão de escopo |
| 09E-7 | `attributeTextOverflow` é opt-in; levar às demais etapas | decisão de método |
| 09E-8 | Ruído de renderização na rota de aceite sintético e divergência `day`/`night` em 3 rotas | limitação do método |
| ID3 | `workspaceFetch` nas outras 10 páginas do portal do cliente | família própria |
| ID4 | `setup.uri`/`otpauth` nunca exibido (possível postura de segurança) | decisão de produto |
| 07E-2 | Alvo de toque de 29 px do botão de repetir legado; 2 hits auditados (`FiscalWorkspace.tsx:80`, `ExpenseWorkspace.tsx:176`) | decisão de escopo |

Além deles, o CRONOGRAMA mantém **UX-PRO-07F→07M** como fila de rotas; nenhuma delas está autorizada por este documento.

## 3. Decisão necessária antes de codar

Escolher **um** item da seção 2 ou uma rota de 07F→07M e responder explicitamente:

1. **Qual item/rota** entra nesta sessão;
2. Para itens de família de datas (E3-CRM, E3-R1): manter a convenção da E3 — **fuso declarado + ISO quando for exibição**, e **não** converter valores de `<input>`; ou outra decisão registrada;
3. Para itens de método (PU4, 09E-7): se o probe deve ser ampliado (mais tags/estados) ou se o limite atual permanece aceito como **não medição**;
4. Para ID4: exibir ou manter oculto (postura de segurança) — com o motivo registrado.

Sem essa resposta, a próxima sessão deve apenas gravar `docs/UX-PRO-<SLICE>-ESCOPO-ANTES-AAAA-MM-DD.md` com a medição da base e a pergunta, **sem alterar código**.

## 4. Guardas técnicas que continuam valendo

1. `next-env.d.ts` é reescrito por `tsc` e pelo dev-server: restaurar do HEAD após cada gate e conferir MD5 **`87a8bf5c65d00003ad1eba1613711943`**; `tsconfig.json` MD5 **`99f7042f814e77e67b785906e5d4df23`**.
2. `tests/ux-portal-workspace.integration.test.mjs`: manter `randomBytes(32).toString('base64url')` na chave do harness.
3. Evidência (quando houver): `ux-pro-<slice>-<scenarioId>-<viewport>.png`, byte-comparação nos dois sentidos e IHDR antes de apagar PNG; conferir `day`/`night` se a fatia mexer em CSS.
4. Inventário: após tocar `src/app`, rodar `node scripts/ux-pro-00-inventory.mjs` e depois `--check`; **armadilha já conhecida**: `EMPTY_MARKERS` inclui `[Nn]enhum` sem fronteira de palavra e sem ignorar comentários — conferir o diff coluna por coluna.
5. `qa-wave0-static` **não** é script npm: `node scripts/qa-wave0-static.mjs`.
6. Sandbox novo pode chegar sem `node_modules`: `npm ci` primeiro. Não há fontes de sistema; o Chromium vem do `@sparticuz/chromium`.
7. O gate `test:ux-ops:pg` usa `MINIMUM_CASES=19`; a suíte atual tem 28 casos. Um caso herdado (07D-1, `:761`) mostrou instabilidade sob timeout de 45 s no sandbox — registrar, não afrouxar.

## 5. Regras permanentes

Ler [`AGENTS.md`](../AGENTS.md), [`README.md`](../README.md) e [`docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`](ARENA-PRESERVAR-FUNCIONALIDADES.md). Antes de codar: escopo “antes” medido. Mudanças aditivas, com RED canônico gravado antes do reparo e mensagem exata no relatório. Nenhuma asserção afrouxada; nenhum teste pulado. Sem segredos, credenciais, tokens, cookies ou dados pessoais em docs/logs/capturas. Uma PR, merge só com todos os checks SUCCESS e base confirmada (`gh pr merge <n> --merge`, sem `--auto`). Nunca declarar aceite humano, UAT ou conformidade WCAG; homologação e produção continuam **NO-GO**.

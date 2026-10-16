# UX-PRO-09A-6 / PR #255 — bloqueio verificável do check `operations-postgres-browser`

- **Data**: 2026-10-16 (UTC), sessão Arena `arena/f03acf07-gruposegsystemseguranca`.
- **Escopo desta nota**: diagnóstico e bloqueio. **Nenhum** código, asserção, timeout, branch da PR, revisão ou proteção foi alterada.
- **Veredito**: o check `operations-postgres-browser` reprovou por **asserção real (ERR_ASSERTION)**, não por SIGSEGV ambiental. Logo: **rerun não autorizado pela condição dada**, **merge bloqueado**, e a correção mínima proposta fica registrada sem ser aplicada.

## 1. Estado reconfirmado (2026-10-16 ~05:20Z)

| Item | Valor verificado |
|---|---|
| PR #255 | `OPEN`, base `main`, head `arena/7dbaae55-gruposegsystemseguranca` |
| Head SHA | `c8c68b2bee6fa15e3f98cdfef0486305584c3b39` (1 commit) |
| `origin/main` | `2d2c8b4f6fa445e0ad2cca06b3ddb7598d719f62` (PR #254) |
| Mergeabilidade | `MERGEABLE` / `mergeStateStatus: UNSTABLE` / `reviewDecision:` vazio |
| Checks | 8 de 9 `SUCCESS`; única falha: **`operations-postgres-browser`** |
| Run / job da falha | run `38850923589` (workflow `L06 Operations delivery`), job `116811731556`, `run_attempt: 1`, step 6 "L06 real HTTP, disposable PostgreSQL and Chromium" |
| Ref testada pelo CI | `refs/remotes/pull/255/merge` = `dd5e4791ba93a065af94fa3874d0eeec4a4e4f10` (confirmado na linha de checkout do próprio log) |
| Proteção de branch | não legível com o token atual (`403 Resource not accessible by integration`) — não verificada, apenas registrada |

## 2. Log completo obtido — sem contornar permissão

- `gh run view 38850923589 --log` e `gh api repos/.../actions/jobs/116811731556/logs` **falham no sandbox** com `EOF` / `SSL_ERROR_SYSCALL`, porque o egress está restrito a uma allowlist (`results-receiver.actions.githubusercontent.com` e `productionresultssa*.blob.core.windows.net` não são alcançáveis daqui). Isso é limitação de rede do ambiente, não falta de autorização do GitHub.
- A **URL assinada que o próprio GitHub emite** para este token (302 de `api.github.com`) foi lida pelo buscador de páginas do workspace: log íntegro, **12 blocos**.
- Trecho decisivo (timestamps do runner em 04:31:10Z):

```
not ok 7 - L06 Fatia C: estoque, reserva, ativo/serial, entrega/devolução, requisição, compras sintéticas e auditoria fail-closed
  location: '.../tests/l06-delivery.integration.test.mjs:1243:1'
  failureType: 'testCodeFailure'
  error: 'product SKU rendered in table'
  code: 'ERR_ASSERTION'
  operator: 'match'
  stack: TestContext.<anonymous> (.../tests/l06-delivery.integration.test.mjs:1573:12)
# tests 9 / # pass 8 / # fail 1
L06_DELIVERY_TEST_EXIT: 1
QA_L06_PG_TEMP_CLEANED: true
```

- Nenhuma ocorrência de SIGSEGV, crash de lançamento ou falha de `launchBrowser` no log. As mensagens `relation "audit_log" does not exist` são o **fail-closed esperado** das fatias C/D/E (tabela renomeada de propósito e restaurada em `finally`), não a causa da reprova.

## 3. Causa identificada: corrida de leitura no bloco de navegador da Fatia C

- O campo `actual` do log mostra a página ainda em leitura no instante da asserção:
  "…**Carregando** — **Lendo produtos e saldos de estoque…** Aguarde a resposta desta aba; nenhum vazio ou total é presumido durante a leitura."
- `GET /admin/patrimonio 200 in 640ms` às 04:31:05.948Z (rota já compilada); asserção às 04:31:10.476Z — a aba continuava em fase `loading`.
- A aba "Produtos & Estoque" é lida **no cliente** por `useEffect` (`src/app/admin/patrimonio/PatrimonioWorkspace.tsx:109` → `/api/ast/products`; gatilho em `:277`), com fase explícita `loading` (`data-testid="patrimonio-produtos-carregando"`).
- O bloco (linhas 1560–1586) faz `page.goto(..., { waitUntil: "networkidle" })` e **imediatamente** `page.textContent("body")` + `assert.match`. `networkidle` pode resolver antes da resposta da aba; a leitura então enxerga o estado de carregamento e a asserção de SKU cai.
- Precedentes no próprio repositório, para o mesmo problema:
  - o gate L06 já espera de forma limitada no bloco anterior (Fatia B): `await page.waitForSelector("#posts-title", { timeout: 30_000 })`;
  - o gate dedicado da página espera a tabela: `tests/ux-asset-workspace.integration.test.mjs:311` → `[data-testid="patrimonio-produtos-tabela"]`;
  - o flake é **pré-existente e já registrado**: `docs/ESTADO-EXECUCAO-LOCAL.md:260` ("L06 … reprova de forma intermitente … por carregamento lento da tela de patrimônio"), `docs/EVIDENCIAS-ENTREGA-LOCAL.md:143` ("flake de timing do Chromium (`Carregando dados...`), repetido integral sem mascarar") e `docs/ENTREGA-RELATORIO-2026-10-03-EXT02-TERCEIROS.md:114` ("reproduzido na base").
- **Não** há relação com o diff da PR #255: `git diff origin/main origin/arena/7dbaae55-gruposegsystemseguranca -- tests/l06-delivery.integration.test.mjs` é **vazio** (arquivo idêntico) e nenhum caminho de `src/` tocado pela PR é exercido por esse teste.
- Histórico do workflow `l06-delivery.yml`: 97 de 100 execuções verdes; as duas outras falhas são de 2026-10-07 em branches `codex/*`.

## 4. Correção mínima compatível — APLICADA na PR #256

Trocar a asserção imediata por **espera limitada** antes de ler o corpo, preservando integralmente o texto das asserções (nada afrouxado: se a leitura falhar de verdade, a espera estoura e a asserção continua reprovando). Padrão já usado no mesmo arquivo e no gate dedicado:

```js
// linhas 1568-1573 do estado atual
await page.goto(`${baseUrl}/admin/patrimonio`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { level: 1, name: /Patrimônio, Almoxarifado e Ativos/ })
  .waitFor({ timeout: 30_000 });                                   // título (já presente hoje)
await page.locator('[data-testid="patrimonio-produtos-tabela"]')    // mesmo gancho do gate UX-07A
  .waitFor({ timeout: 30_000 });                                   // sai de "Carregando" antes de ler
let content = await page.textContent("body");
assert.match(content || "", /Patrimônio, Almoxarifado e Ativos/, "patrimonio workspace rendered");
assert.match(content || "", /RAD-VHF-001/, "product SKU rendered in table"); // asserção intacta
```

Para as abas seguintes (linhas 1576–1591), a mesma espera limitada substituindo o `waitForTimeout(500)` fixo, pelos ganchos de estado `patrimonio-{reservas,ativos,requisicoes}-painel` / `-carregando` (cada aba informa leitura, falha ou vazio; nada é presumido). Timeout limitado mantém a reprova honesta; nenhuma mensagem, métrica ou asserção muda.

**Aplicação efetiva (PR #256, branch de sessão `arena/f03acf07-…`):** o arquivo `tests/l06-delivery.integration.test.mjs` ganhou o auxiliar `waitForTabRead(page, tab)` e as quatro leituras passaram a usá-lo. O arquivo pertence ao gate compartilhado, **não** à branch da PR #255; a branch `arena/7dbaae55-…` continua intocada por esta sessão.

### 4.1 Verificação local executada (PostgreSQL descartável + HTTP real + Chromium real)

| Verificação | Resultado |
|---|---|
| `npm run test:l06-delivery:pg` com a correção | **9/9, exit 0** (`L06_DELIVERY_TEST_EXIT: 0`) |
| Probe determinístico — variante do padrão anterior (`networkidle` + leitura imediata, com o workspace na tela) | **REPROVA**: `error: 'product SKU rendered in table'`, com o corpo idêntico ao do CI (`…CarregandoLendo produtos e saldos de estoque…Aguarde a resposta desta aba…`) |
| Probe determinístico — variante com a correção (mesma latência injetada) | **PASSA**: a asserção de não-vacuidade confirma que a leitura imediata capturava o carregamento e a espera limitada liberou a tabela real (`RAD-VHF-001`) |
| `node scripts/qa-wave0-static.mjs` | 5/5 OK |
| `npx tsc --noEmit` | limpo |
| `npm test` | 949/949 |

Latência injetada **apenas no cliente** (`window.fetch` da tela) e **apenas** na leitura da aba de produtos, para tornar a corrida determinística; as duas variantes usam a **mesma** asserção de produto — nenhuma foi enfraquecida para "provar" a correção.

`next-env.d.ts` e `tsconfig.json` foram reescritos pelos gates locais (o dev server aponta `next-env.d.ts` para o diretório de build usado) e **restaurados** ao conteúdo versionado antes do commit; `next-env.d.ts` mantém md5 `87a8bf5c65d00003ad1eba1613711943` e nenhum dos dois aparece no diff.

## 5. Decisões tomadas e não tomadas

- `gh run rerun 38850923589 --failed` **não executado**: a condição ("somente se o log confirmar SIGSEGV ambiental no lançamento do Chromium, antes de qualquer asserção") foi **falseada**.
- `gh pr merge 255 --merge` **não executado**: o único check não verde do PR está `FAILURE`.
- Corrigido o gate **em PR separada (#256)**, a partir desta branch de sessão, sem tocar na branch da PR #255, em #234, 09B ou 09C.
- Nada foi contornado (nem permissão, nem proteção de branch); nenhuma asserção foi afrouxada.
- Sem aceite humano, UAT ou conformidade WCAG. **Homologação e produção permanecem NO-GO.**

## 6. Caminho recomendado para destravar a #255 (decisão do proprietário)

1. Revisar e mergear a **PR #256** (`main` passa a ter o gate corrigido). Os checks de `main` são a evidência de CI.
2. Com a #256 em `main`, o ref de merge da #255 passa a incluir a correção; com **autorização explícita**, reexecutar/disparar o check da #255 (`gh run rerun 38850923589 --failed`) — ou reavaliar o próprio check no novo contexto.
3. Só então considerar `gh pr merge 255 --merge`, com todos os checks obrigatórios `SUCCESS` e a base `main` confirmada.

Nem o passo 2 nem o passo 3 foram executados nesta sessão.

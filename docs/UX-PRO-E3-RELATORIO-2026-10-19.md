# UX-PRO-E3 — relatório (19/10/2026)

**Subfatia:** E3 — datas/horas `timestamptz` exibidas por fatiamento de ISO, sem fuso, em `/admin/operacao`.

**Branch da sessão:** `arena/12ab101d-gruposegsystemseguranca` · **Base confirmada:** `origin/main` = `a93c7e37282814ce090c31c53178360c6849f7c5` (merge da PR #273; contém #271, #272 e a verificação da E2-C1). `git fetch origin main` + `git rev-parse origin/main` conferidos no início; árvore limpa; nenhuma PR aberta.

**Decisão do proprietário (registrada nesta sessão):** Q1 = **via (a)** — formato local `America/Sao_Paulo` com fuso explícito **e** data ISO preservada como texto secundário; Q2 = rótulo **`(America/Sao_Paulo)`**; Q3 = texto ISO **nas sete linhas, inclusive no selo de ciência**. Perguntas e medições anteriores em [UX-PRO-E3-ESCOPO-ANTES-2026-10-19.md](UX-PRO-E3-ESCOPO-ANTES-2026-10-19.md).

**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação e produção permanecem NO-GO.**

---

## 1. Correção aplicada

Sete linhas de `src/app/admin/operacao/OperacaoWorkspace.tsx` deixaram de fatiar o ISO e passaram a exibir o instante em São Paulo com o fuso declarado e o ISO original ao lado:

```tsx
// antes (ex.: :1014)
<td>{String(item.validated_at).slice(0, 16).replace("T", " ")}</td>
// depois
<td><Stamp value={item.validated_at} /></td>
```

O componente local `Stamp` (mesmo arquivo) chama `opsDateTime` + `opsIsoStamp` do novo auxiliar de tela `src/lib/ops-dates.mjs`:

```tsx
function Stamp({ value }: { value: string | null | undefined }) {
  const iso = opsIsoStamp(value);
  return (<>{opsDateTime(value)}{iso ? <span className={styles.hint}> · {iso}</span> : null}</>);
}
```

| # | Linha base | Linha atual | Campo | Antes (`2026-10-05T14:32:00Z`) | Depois |
|---|---|---|---|---|---|
| 1 | `:1014` | `:1028` | `validated_at` | `2026-10-05 14:32` | `05/10/2026 11:32 (America/Sao_Paulo) · 2026-10-05T14:32:00Z` |
| 2 | `:1140` | `:1154` | `gap_start` | `2026-10-05 14:32` | `05/10/2026 11:32 (America/Sao_Paulo) · 2026-10-05T14:32:00Z` |
| 3 | `:1140` | `:1154` | `gap_end` | `2026-10-05 16:32` | `05/10/2026 13:32 (America/Sao_Paulo) · 2026-10-05T16:32:00Z` |
| 4 | `:1209` | `:1223` | `published_at` | `2026-10-05 14:32` | idem #1 (ausente continua `—`) |
| 5 | `:1374` | `:1388`/`:1391` | `acknowledged_at` | `Ciente desde 2026-10-05 14:32` | `Ciente desde 05/10/2026 11:32 (America/Sao_Paulo)` + ` · ISO` no texto secundário |
| 6 | `:1432` | `:1447` | `created_at` (histórico) | `2026-10-05 14:32` | idem #1 |
| 7 | `:1513` | `:1528` | `handover_date` | `2026-10-05 14:32` | idem #1 |
| 8 | `:1583` | `:1598` | `executed_at` | `2026-10-05 14:32` | idem #1 (ausente continua `Pendente`) |

Contagens mecânicas no arquivo final: **0** ocorrências de `slice(0, 16)`; **7** usos de `<Stamp value=` (a janela da lacuna tem dois); **2** chamadas de `opsDateTime(` e **2** de `opsIsoStamp(` (componente + selo de ciência); **19** ocorrências de `slice(0, 10)` em **15** linhas — exatamente as mesmas da base (`git show HEAD:...` também tem 19/15). Nenhuma data de calendário (`DATE`) foi tocada.

Auxiliar novo, sem dependência de servidor: `src/lib/ops-dates.mjs` (+ `ops-dates.d.mts`). Regras: carimbo com hora → `DD/MM/AAAA HH:mm (America/Sao_Paulo)`; ausente → `Não informado`; formato inesperado → devolvido como veio; data de calendário (`DATE`) **não** é convertida (evita o deslocamento de um dia); ISO secundário é o texto original, para auditoria.

## 2. RED → GREEN

### 2.1 RED canônico (antes do reparo, código intocado)

Caso **aditivo** em `tests/ux-ops-workspace.integration.test.mjs` (nenhum caso herdado editado), executado por `npm run test:ux-ops:pg` com PostgreSQL descartável, servidor HTTP real e Chromium. Saída real desta sessão:

```text
not ok 28 - E3 browser: carimbos timestamptz saem em São Paulo com o fuso declarado e o ISO preservado, sem colidir
  ---
  duration_ms: 4319.709679
  location: '.../tests/ux-ops-workspace.integration.test.mjs:1425:1'
  failureType: 'testCodeFailure'
  error: 'gap_start precisa sair em São Paulo com o fuso declarado; recebido: "2026-10-05 14:32 – 2026-10-05 17:32"'
  code: 'ERR_ASSERTION'
  expected: /05\/10\/2026 11:32 \(America\/Sao_Paulo\)/
  actual: '2026-10-05 14:32 – 2026-10-05 17:32'
  operator: 'match'
  ...
1..28
# tests 28
# pass 27
# fail 1
UX_OPS_TAP_SUMMARY: pass=27 fail=1 skipped=0 todo=0 minimo_exigido=19
UX_OPS_GATE_REJECTED: 1 caso(s) reprovado(s)
UX_OPS_TEST_EXIT: 1
QA_PG_TEMP_CLEANED: true
```

O caso prova, com duas marcas distintas do **mesmo dia** (`2026-10-05T14:32:00Z` e `2026-10-05T17:32:00Z`), que o texto exibido precisa manter **duas** horas locais distintas (`11:32` e `14:32`), declarar `America/Sao_Paulo` e preservar cada ISO. Antes do reparo, as duas marcas apareciam como `2026-10-05 14:32` e `2026-10-05 17:32` — sem fuso e com a hora de São Paulo adiantada em 3 h.

### 2.2 GREEN

```text
ok 28 - E3 browser: carimbos timestamptz saem em São Paulo com o fuso declarado e o ISO preservado, sem colidir
  duration_ms: 4943.537075
1..28
# tests 28
# pass 28
# fail 0
# duration_ms 155177.775615
UX_OPS_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28
UX_OPS_TEST_EXIT: 0
QA_PG_TEMP_CLEANED: true
```

### 2.3 Prova estática e de determinismo (aditiva ao gate unitário)

Novo `tests/ux-pro-e3-ops-dates.test.mjs` (5 casos, incluído em `npm run test:unit`):

1. `2026-10-05T14:32:00Z` → `05/10/2026 11:32 (America/Sao_Paulo)`; `2026-10-05T17:32:00Z` → `05/10/2026 14:32 (America/Sao_Paulo)`; os dois textos **não** são iguais e nenhum é o ISO fatiado;
2. a conversão atravessa a virada do dia (`01:30Z` do dia 6 → `22:30` do dia 5; `02:30Z` do dia 5 → `23:30` do dia 4), provando que não é deslocamento de string;
3. ausente é declarado (`Não informado`), formato inesperado volta como veio e `DATE` (`2026-10-05`) **não** é convertida;
4. determinismo em processo filho com `TZ=Pacific/Kiritimati`, `America/Sao_Paulo`, `Asia/Tokyo` e `UTC` — mesmo texto nos quatro;
5. varredura: 7 `<Stamp`, 2 `opsDateTime(`, 2 `opsIsoStamp(`, 0 `slice(0, 16)`; 19 `slice(0, 10)` preservados; prefixo `Ciente desde` preservado; `OpportunitySummary.tsx` (E3-CRM) intocado.

`node --test tests/ux-pro-e3-ops-dates.test.mjs` → **5/5**.

### 2.4 Instabilidade observada em execuções intermediárias (registrada, não mascarada)

Entre o RED e o GREEN, **duas** execuções completas reprovaram um caso **herdado** da 07D-1 (`browser 07D-1: 2xx sem a lista canônica no painel inicial é falha declarada, não vazio`) por `Timeout 45000ms exceeded` em `page.locator('[role="tablist"]').waitFor()` **após** o clique de repetição (`tests/ux-ops-workspace.integration.test.mjs:761`). Evidências:

- no RED, esse caso passou em **4,2 s**;
- isolado (padrão `07D-1 massa sintética|carregamento inicial|2xx sem a lista canônica no painel inicial`), passou **3/3**;
- com `UX_OPS_07D_UI_TIMEOUT=90000`, passou em **3,9 s** (gate 28/28);
- a execução GREEN canônica seguinte, **com o timeout padrão**, passou **28/28** em 152 s;
- a execução canônica final, já com `MINIMUM_CASES=28`, passou **28/28** em 155 s, com o caso E3 em **4,9 s**.

Nenhum caso, asserção ou timeout foi alterado. A leitura honesta é: instabilidade ambiental do caso herdado no sandbox (compilação/dev-server), não regressão funcional do fluxo exercitado — que esta fatia não toca. Fica registrada como **E3-R2** (seção 6) para observação em CI.

O mesmo tipo de instabilidade apareceu uma vez no gate **L06**: a primeira execução completa morreu em `browserType.launch: Target page, context or browser has been closed` com `<process did exit: exitCode=null, signal=SIGSEGV>` — **antes de qualquer asserção** da Fatia B. A reexecução imediata, sem nenhuma alteração de código, passou **9/9**. O log da falha é `/tmp/e3-l06.log`; o da reexecução, `/tmp/e3-l06b.log`. Nenhum teste foi pulado, afrouxado ou reordenado por causa disso.

## 3. Gates executados (saída real desta sessão)

| Gate | Resultado |
|---|---|
| `npm ci` | 83 pacotes, 0 vulnerabilidades |
| `npm run test:ux-ops:pg` (RED) | `pass=27 fail=1`; caso E3 com a mensagem da seção 2.1 |
| `npm run test:ux-ops:pg` (GREEN, timeout padrão, `MINIMUM_CASES=28`) | **28/28**, `pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28`, `UX_OPS_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` (155 s; caso E3 em 4,9 s) |
| `npm run test:l06-delivery:pg` | **9/9**, `L06_DELIVERY_TEST_EXIT: 0`, `QA_L06_PG_TEMP_CLEANED: true` — nenhuma asserção de data herdada editada. Uma execução anterior morreu em `browserType.launch` (SIGSEGV, antes de qualquer asserção) e foi repetida sem mudança de código (seção 2.4) |
| `npm test` | **973/973** (968 herdados + 5 novos), `fail 0`, `skipped 0`, `todo 0` |
| `npm run typecheck` | exit **0**, sem diagnóstico |
| `npm run build` | `✓ Generating static pages (105/105)`, sem erro |
| `node scripts/qa-wave0-static.mjs` | **5/5** verificações OK; 0 imports ausentes; 0 migrações ausentes |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK: … conferem com o código atual` (100 rotas; **nenhum** CSV alterado) |
| `git diff --check` | sem marcador de whitespace |
| `next-env.d.ts` / `tsconfig.json` | MD5 `87a8bf5c65d00003ad1eba1613711943` / `99f7042f814e77e67b785906e5d4df23`, restaurados após `tsc`/`next build` e reconferidos |

## 4. Contratos preservados (confirmados por leitura e regressão)

- **L06** continua verde **sem edição**: as asserções de data herdadas leem `gap_date` e `valid_from` (colunas `DATE`), não os carimbos; `2026-10-05` e `2026-12-01` continuam na tela; `Ciente desde` e `Revisada → Publicada` continuam idênticos.
- **07D-1/07D-2** continuam verdes, incluindo os estados honestos de leitura, a idempotência da ciência, o selo `Ciente desde` e as capturas de teclado.
- **Nada de API/servidor/banco:** URLs, métodos, payloads, respostas, ordenação, filtros, estados de domínio, RBAC, sessão, auditoria e migrações **não** foram tocados. Nenhuma migração nova.
- **Datas de calendário** (`DATE`) da rota: 19 ocorrências de `slice(0, 10)` preservadas, byte a byte iguais à base.
- **Runner do gate**: única mudança fora da exibição, `MINIMUM_CASES` 19 → 28 em `scripts/qa-ux-ops-postgres.mjs`, para que os 8 casos da 07D-2 e o caso E3 também contem como prova. É endurecimento do gate, não afrouxamento.
- **Textos de botão, mensagens e conteúdo de negócio:** inalterados.
- **Sem asserção afrouxada, sem teste pulado, sem skip/todo.**

## 5. Decisão, escopo e limites

- A via (a) foi aplicada exatamente como decidida; o ISO secundário aparece nas sete linhas, inclusive no selo de ciência.
- Não houve redesenho de tabela, mudança de largura, de alinhamento ou de classe compartilhada: o texto secundário reutiliza `styles.hint` já existente em `UiWorkspace.module.css`.
- Nenhuma captura visual nova foi produzida; não há alegação de revisão visual manual. A prova de navegador é automatizada (Chromium empacotado, 1440×900).
- Esta fatia **não** prova leitor de tela, homologação, UAT, Windows, produção ou conformidade WCAG.
- O resíduo **E3-R2** (seção 2.4) é registrado como instabilidade observada; não é aceite nem prova de estabilidade contínua.
- A base é um clone raso e o SHA `f38ef3d` citado no pedido não existe aqui; a base efetiva é `a93c7e3`, registrada na seção 0 do escopo.

## 6. Resíduos numerados (nada liberado sem decisão)

| ID | Estado | Descrição |
|---|---|---|
| **E3-CRM** | fora do escopo, registrado | `src/app/admin/crm/OpportunitySummary.tsx:82` — `new Date(...).toISOString().slice(0, 16)` preenche `<input type="datetime-local">`. É formato de **entrada** de formulário, família própria; exige decisão antes de qualquer mudança. |
| **E3-R1** | fora do escopo, registrado | `OperacaoWorkspace.tsx:1478` — `cov.coverage_date \|\| String(cov.requested_at).slice(0, 10)`: `requested_at` é `TIMESTAMPTZ` exibido só como data, sem hora e sem fuso. Defeito adjacente da mesma família, fora das 7 ocorrências autorizadas. |
| **E3-R2** | observado, sem reparo | Instabilidade ambiental no sandbox: caso herdado 07D-1 sob o timeout padrão de 45 s e uma morte de `browserType.launch` por SIGSEGV no L06, ambas sem reprodução após reexecução (seção 2.4). Não alterar timeout/asserção sem decisão; observar em CI. |
| **E9** | limitado a 1 h1 | Quebra de palavra em cabeçalhos a 768 px (`UiWorkspace.module.css:11`). **Não reproduz defeito na base atual** (conforme o pedido); permanece apenas o registro do `h1`, sem código e sem conclusão de acessibilidade. |
| **PU4** | sem medição | O probe da 09E amostra só 7 tags e só o estado inicial; `dt`, `span`, `footer`, `.field span`, `.hint` e `.error` ficam **sem medição** — o que não é aprovação. |
| **PU5** | sem reparo | Especificidade: `.steps li` vence `.stepActive`/`.stepDone`; as etapas não se distinguem por cor. |
| **PU6** | sem reparo | `Layout09.module.css:64 .progressStep` com a mesma cor 2,36:1, em prévia fora das 14 rotas públicas. |
| **09E-7** | decisão pendente | `attributeTextOverflow` é opt-in; levá-lo às demais etapas é decisão. |
| **09E-8** | limitação do método | Ruído de renderização na rota de aceite sintético e divergência `day`/`night` em 3 rotas fora de escopo; sem reparo proposto. |
| **ID3** | família própria | Mesmos padrões de `workspaceFetch` nas outras 10 páginas do portal do cliente. |
| **ID4** | decisão de produto | `setup.uri`/`otpauth` nunca exibido — possível postura deliberada de segurança. |
| **07E-2** | decisão pendente | Alvo de toque de 29 px do botão de repetir legado no financeiro; 2 hits auditados (`FiscalWorkspace.tsx:80`, `ExpenseWorkspace.tsx:176`). |

Itens já entregues em `main` e **não reabertos** por esta fatia: E2/E2-C1 (#271/#272, verificação #273), E5 (#269), E8 (#268), E6/E6-C1, C11.

## 7. Reprodução

```text
npm ci
node --test tests/ux-pro-e3-ops-dates.test.mjs
npm run test:ux-ops:pg
npm run test:l06-delivery:pg
npm test
npm run typecheck
npm run build
node scripts/qa-wave0-static.mjs
node scripts/ux-pro-00-inventory.mjs --check
git diff --check
md5sum next-env.d.ts tsconfig.json
```

## 8. Próximo passo

A fila e os limites estão em [UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md](UX-PRO-E3-PROMPT-PROXIMA-SUBFATIA-2026-10-19.md). Nenhuma próxima subfatia é presumida: o documento pede decisão explícita do proprietário antes de qualquer código.

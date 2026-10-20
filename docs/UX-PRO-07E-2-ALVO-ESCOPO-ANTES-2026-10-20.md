# UX-PRO-07E-2-ALVO — alvo de toque dos botões "Tentar novamente" legados de `/admin/financeiro`

**Data:** 20/10/2026

**Status deste documento:** registro anterior à implementação. Nenhuma tela, CSS, API, regra de autorização, gate, CSV ou evidência foi alterada para produzi-lo.

## 1. Decisão de escopo do proprietário (Q1/Q2/Q3)

A fila de resíduos pendentes ao fim da sessão anterior tinha 9 itens. Perguntado explicitamente antes de qualquer edição de código, o proprietário:

- **Q1 (qual ÚNICO item entra nesta sessão):** respondeu *"você decide o que é melhor para o avanço do projeto"*. A decisão registrada é **07E-2 — alvo de toque de 29 px dos botões "Tentar novamente" legados do financeiro**, pelos motivos da seção 2. Nenhum outro item da fila (E9, PU4, PU5, PU6, 09E-7, 09E-8, ID3, ID4) foi iniciado, misturado ou presumido.
- **Q2 (técnica e escopo estrito):** respondeu **"nova classe só de alvo"** — adicionar 1 classe nova em `UiWorkspace.module.css` (altura mínima de alvo + preenchimento) e aplicá-la aos 2 botões auditados, sem mexer em layout/fluxo. Fica confirmado o escopo estritamente restrito aos 2 seletores auditados: estilo aditivo, sem trocar comportamento, texto, destino, `data-testid`, `disabled`-state nem `handlers`.
- **Q3 (impacto visual):** respondeu **"sim, day/night × 4 viewports"** — capturas comparativas nos 4 viewports canônicos (320/390/768/1440) nos dois temas antes do merge.

Uma subfatia = uma PR. Nada desta fatia declara aceite humano, UAT, homologação ou conformidade WCAG.

## 2. Por que 07E-2 e não outro item da fila

| Candidato | Leitura na base `1f9fc1d` | Decisão |
| --- | --- | --- |
| **07E-2 (alvo de toque)** | Defeito concreto e reproduzível por inspeção: os 2 botões existem, estão vivos em `main` e não recebem nenhuma regra de alvo. Reparo aditivo, 2 seletores, sem mudança de comportamento. Já tem medição registrada (29 px) e limiar da casa definido em código (`>= 44`). | **ENTRA nesta sessão** |
| E9 (quebra de palavra em `h1` a 768 px) | O próprio registro diz que **não reproduz na base**; tenderia a virar só documento, sem ganho de produto. | fica na fila |
| PU4, PU5, PU6, 09E-7, 09E-8 | São decisões de método/escopo sobre o site público e probes, sem defeito único fechado; exigiriam rodada própria de decisão. | ficam na fila |
| ID3, ID4 | Família própria (`workspaceFetch` em 10 páginas) e decisão de produto (exibição de `otpauth`), ambas maiores que uma subfatia. | ficam na fila |

## 3. Base efetivamente conferida

- Branch fixada da sessão: `arena/094b9867-gruposegsystemseguranca`. Nenhuma troca de branch; nenhum stash ou commit de sessão anterior reaplicado. O branch `pr_merged` anterior não foi tocado.
- `HEAD` local == `origin/main` == `1f9fc1dbf17062c8ffb53203375fbc833d6a98aa` (merge da PR #280, reconciliação 07F–07M), divergência **0/0** após `git fetch --prune origin`. Árvore de trabalho limpa.
- Worktree único: `/home/user/gruposegsystemseguranca`.
- `npm ci` executado primeiro, em sandbox novo: 83 pacotes, 0 vulnerabilidades.
- Arquivos protegidos conferidos ANTES de qualquer `tsc`/`build`/`dev`:
  - `next-env.d.ts` — MD5 `87a8bf5c65d00003ad1eba1613711943`, SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
  - `tsconfig.json` — MD5 `99f7042f814e77e67b785906e5d4df23`, SHA-256 `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.
  Ambos iguais ao registrado na sessão anterior. Devem ser restaurados após `typecheck`/`build`/`dev`.
- Gate herdado conferido antes de qualquer reconstrução: `tests/ux-finance-workspace.integration.test.mjs` tem **1.878 linhas**, SHA-256 `bcc1771e69f8788e969e29326968ac24cf7b1fe8b1462610e572ede4138cbbf7`, **44 `test(` no início de linha**. Todo o conteúdo existente permanece íntegro: esta fatia **acrescenta** casos ao fim do arquivo e não edita, remove nem afrouxa nenhuma asserção herdada.
- `tests/ux-portal-workspace.integration.test.mjs` não é tocado; `randomBytes(32).toString('base64url')` permanece como está.

### 3.1 Ponta solta PR #277 — conferida somente leitura, sem ação

O registro da sessão anterior apontou a PR #277 (`E3-R1 — CoveragePanel requested_at -> Stamp`) como `OPEN` mesmo com o código da E3-R1 já em `main`. Conferência feita **somente leitura** (`gh pr view`, `git fetch origin pull/277/head`, `git diff`), sem fechar, sem reabrir, sem comentar e sem reaplicar nada:

- `gh pr view 277` → `state: OPEN`, `headRefName: arena/86484f7b-gruposegsystemseguranca`, 1 commit (`95105bd`).
- `git diff --stat origin/main origin/pr-277 -- src/app/admin/operacao/OperacaoWorkspace.tsx` → **vazio**: o arquivo central da E3-R1 é **idêntico** entre o branch da PR e `main`.
- `main` confirma o código em produção: `src/app/admin/operacao/OperacaoWorkspace.tsx:1493` usa `<Stamp value={cov.requested_at} />`, e `docs/UX-PRO-E3-R1-{ESCOPO-ANTES,RELATORIO,PROMPT-PROXIMA-SUBFATIA}-2026-10-20.md` já estão em `main`.
- O diff completo branch↔`main` mostra **1.100 linhas a menos** no branch (16 arquivos), ou seja: o branch está **atrás** de `main`. Mergear a #277 **reverteria** trabalho posterior já mergeado (E3-R2 e E3-CRM).
- O clone local é `shallow`, portanto `merge-base` entre `origin/main` e `origin/pr-277` não é calculável; a conclusão acima se apoia no diff de conteúdo arquivo a arquivo, não em ancestralidade.

**Conclusão registrada:** a PR #277 é duplicata/superada — seu código já está em `main` e seu merge seria regressivo. **Não foi fechada**: a guarda permanente exige autorização explícita do proprietário para fechar. A decisão recomendada (fechar como superada, sem reaplicar commit) fica aguardando ordem.

## 4. O defeito, com `file:line` da base `1f9fc1d`

Dois botões de repetição de falha de leitura em `/admin/financeiro` renderizam **sem nenhuma classe**, portanto com estilo UA nativo:

| # | Arquivo:linha (base) | `data-testid` | Contexto | Marcações do botão |
| --- | --- | --- | --- | --- |
| 1 | `src/app/admin/financeiro/FiscalWorkspace.tsx:118` | `fin11-retry` | `<div role="alert" data-testid="fin11-error">`, dentro de `<section data-testid="fin11-fiscal">` (aba `fiscal`) | `<button type="button" data-testid="fin11-retry" disabled={loading} onClick={()=>void load()}>Tentar novamente</button>` — **sem `className`** |
| 2 | `src/app/admin/financeiro/ExpenseWorkspace.tsx:158` | `fin10-retry` | `<div data-testid="fin10-error" role="alert" className={styles.spacedBelow}>` (aba `expenses`) | `<button data-testid="fin10-retry" onClick={()=>load()} disabled={loading}>Tentar novamente</button>` — **sem `className`** |

Reconciliação com o registro antigo: as linhas **80** (`FiscalWorkspace.tsx`) e **176** (`ExpenseWorkspace.tsx`) citadas no registro anterior **migraram** para **118** e **158** nesta base, como a fila já advertia. Nenhum terceiro botão foi encontrado: `grep -rn "fin11-retry\|fin10-retry"` em `src/`, `tests/` e `scripts/` devolve exatamente esses 2 pontos de origem mais 3 referências de teste (`tests/l07-delivery.integration.test.mjs:1318,1545` e `tests/ux-finance-workspace.integration.test.mjs:1296`).

### 4.1 Por que o alvo fica abaixo do limiar

Os dois arquivos **já importam** o módulo compartilhado (`import styles from "../../../components/ui/UiWorkspace.module.css"`), mas a única regra de altura mínima de alvo para botões desse módulo é **escopada ao contêiner `.actions`**:

- `src/components/ui/UiWorkspace.module.css:58-59` → `.actions button, .actions a.button { min-height: 44px; … }`;
- `src/components/ui/UiWorkspace.module.css:22-26` → `.workspace input, .workspace select, .workspace textarea { min-height: 44px; … }` — **campos**, não botões;
- `src/components/ui/UiWorkspace.module.css:92-93` → `.tab, .tabActive { min-height: 44px; … }` — abas;
- `src/components/ui/UiWorkspace.module.css:178-182` → `.legacy` cobre `table/th/td/input/select/textarea/pre/a`, **não `button`**.

Os dois botões de repetição não estão dentro de `.actions` (estão dentro de `div[role="alert"]`), então **nenhuma** regra de alvo os alcança: ficam com a caixa nativa do navegador. É exatamente isso que a medição registrada em `docs/UX-PRO-07E-2-RELATORIO-2026-10-15.md` (seção 11) e em `docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md:34` descreve como **29 px**.

O comentário herdado em `tests/ux-finance-workspace.integration.test.mjs:1296-1302` mede a altura do `fin11-retry` e **apenas registra** (`assert.ok(alturaRepetir !== null && alturaRepetir > 0, …)`), com a observação explícita de que o alvo de 29 px estava fora do escopo daquela fatia. Esse caso **permanece intacto**: continua sendo prova histórica da base de 15/10 e sua asserção continua verdadeira após o reparo.

### 4.2 Limiar da casa revalidado ANTES do RED

O limiar não foi inventado nesta fatia; foi revalidado em três fontes independentes da base:

1. **Token de projeto:** `src/styles/ux-tokens.css:57` → `--ux-height-target: 44px`, já consumido por `src/app/admin/AdminThemeToggle.module.css:6` e `src/app/admin/comercial/Comercial.module.css:68`.
2. **Gate em código:** `tests/ux-emergency-workspace.integration.test.mjs` mede `menorAlvoPx` e deriva `problems` de `menorAlvoPx < 44` (linhas ~295 e ~308-311); `measureSurface()` afirma `menorAlvoPx >= 44`.
3. **Registro documental:** `docs/UX-PRO-07-EMERGENCIAL-RELATORIO-2026-10-14.md:82,100`, `docs/UX-PRO-07-ESCOPO-EMERGENCIAL-ANTES-2026-10-14.md:103,109-112`, `docs/UX-PRO-07B-2-*`, `docs/UX-PRO-06-CARTEIRA-ESTADOS-2026-10-13.md:44`, `docs/UX-PRO-06-CLIENTES-ESCOPO-2026-10-14.md:63`, `docs/UX-PRO-06-CONTRATO-DETALHE-ESCOPO-2026-10-14.md:63` e `docs/UX-PRO-03-*` — todos com alvo mínimo de **44 px**.

Portanto o RED afirma **`>= 44` px**, o mesmo limiar dos gates vizinhos. Contraste do rótulo do botão também é medido nos dois temas com o limiar da casa (**`>= 4,5:1`**, como em `tests/ux-emergency-workspace.integration.test.mjs:313`), porque a classe nova passa a definir cor de texto e de fundo. Transbordo do documento continua com o limiar herdado (**`<= 1 px`**).

## 5. O que esta fatia fecha — e o que ela não fecha

**Fecha somente:** os 2 botões `fin11-retry` (`FiscalWorkspace.tsx:118`) e `fin10-retry` (`ExpenseWorkspace.tsx:158`) passam a ter alvo de toque **>= 44 px** de altura e largura, com rótulo legível nos temas dia e noite, nos 4 viewports canônicos, mantendo texto, destino, `data-testid`, `disabled`-state e `handlers` exatamente como estão — e mantendo provado que a repetição continua recuperando a leitura real.

**Não fecha (permanece pendente, sem correção misturada):**

- E9 (quebra de palavra em cabeçalhos a 768 px, `UiWorkspace.module.css:11`), PU4, PU5, PU6, 09E-7, 09E-8, ID3 e ID4 — todos os outros 8 resíduos da fila.
- O contraste noturno transversal (E8) e os demais achados E2–E7 do plano mestre para `/admin/financeiro`, inclusive `<main>` aninhado em `src/app/admin/AdminGate.tsx:115`.
- C11: fora de escopo, somente por ordem expressa do proprietário.
- Os 2 hits auditados e não corrigidos da 07E-2 (`FiscalWorkspace.tsx` `supported_obligations||[]` e `ExpenseWorkspace.tsx` `history[e.id]||[]`), que continuam com a justificativa registrada.
- **Todos os outros botões sem classe do portal administrativo.** A classe nova é aplicada **apenas** aos 2 seletores auditados; nenhum reparo transversal foi feito, e nenhum outro botão foi medido nem alterado.
- A E3-R2 continua **encerrada como observação**: nada aqui toca timeout, asserção, retry ou workflow do job `ux-ops-postgres-browser`, e a falha daquele job continua **não atribuída** ao 07D-1.
- Homologação/Produção: **NO-GO**.

## 6. Plano de execução (ordem canônica)

1. **RED canônico antes do reparo**, sem afrouxar asserção alguma: 2 casos novos acrescentados ao **fim** de `tests/ux-finance-workspace.integration.test.mjs`.
   - Caso A — para cada um dos 4 viewports (1440×900, 768×1024, 390×844, 320×844), com um browser por largura (limitação do `--single-process`), mede nos **dois temas** e nos **dois botões**: altura e largura do alvo (`>= 44`), contraste do rótulo (`>= 4,5:1`), transbordo do documento (`<= 1 px`) e a identidade preservada do botão (texto `Tentar novamente`, `data-testid`, `disabled` ligado ao estado de carga). Gera 16 capturas (2 botões × 2 temas × 4 viewports) e um resumo com `problems` **derivado** das medições, nunca literal.
   - Caso B — prova de comportamento intacto: com a injeção desligada (`releaseInvalidBody`), clicar em cada um dos 2 botões faz a leitura real voltar e a falha declarada desaparecer. Isso impede que o reparo visual seja confundido com mudança de fluxo.
   - Falha esperada na base: altura medida **< 44 px** nos dois botões, em todas as larguras e nos dois temas.
2. **Reparo aditivo:** 1 classe nova em `src/components/ui/UiWorkspace.module.css` (altura mínima pelo token `--ux-height-target`, preenchimento, borda, raio, fundo, cor, fonte herdada, `inline-flex` centralizado e estado `:disabled`), espelhando as declarações já existentes de `.actions button` para manter coerência visual com o resto do portal; aplicada como `className={styles.…}` **somente** nos 2 botões auditados. Nenhuma outra regra do módulo é editada; nenhuma cor fixa nova; nenhum token novo.
3. **GREEN** com evidências em `docs/ux-pro-07e2-alvo-evidencias-2026-10-20/` (16 capturas day/night × 4 viewports + resumo JSON com medições e `problems` derivados).
4. **Gate aditivo próprio:** `scripts/qa-ux-pro-07e2-alvo-postgres.mjs` (PostgreSQL descartável + HTTP real + Chromium, auditoria TAP sem `skip`/`todo`/`fail` e mínimo de casos igual à contagem real do arquivo) e `.github/workflows/ux-pro-07e2-alvo-delivery.yml`. Os runners herdados `scripts/qa-ux-finance-postgres.mjs`, `scripts/qa-ux-pro-07e1-postgres.mjs` e `scripts/qa-ux-pro-07e2-postgres.mjs` permanecem **intactos**.
5. **Gates da casa, sequenciais:** `npm run typecheck`, `npm run build`, `npm run test:unit`, `node scripts/qa-wave0-static.mjs` (5/5), `node scripts/ux-pro-00-inventory.mjs --check` (100 rotas), `git diff --check`; restauração de `next-env.d.ts` e `tsconfig.json` pelos MD5 acima após cada `tsc`/`build`/`dev`.
6. **Relatório** `docs/UX-PRO-07E-2-ALVO-RELATORIO-2026-10-20.md` com o antes/depois medido, e 1 PR mergeada apenas com todos os checks `SUCCESS`, via `gh pr merge <n> --merge` (sem `--auto`).

## 7. Riscos considerados

- **Regressão de layout em 320/390 px:** um botão que cresce de ~29 px para 44 px dentro de um `div[role="alert"]` pode empurrar largura. Mitigação: `inline-flex` sem largura fixa, `max-width` implícito pelo contêiner e medição de transbordo (`<= 1 px`) nos 4 viewports como asserção, não como observação.
- **Contraste noturno:** a classe define `color: var(--ux-color-brand)` sobre `background: var(--ux-color-surface)`; no tema noite isso é `#92bdf2` sobre `#18263a`. Mitigação: contraste medido e afirmado `>= 4,5:1` nos dois temas, no mesmo gate.
- **Módulo compartilhado:** `UiWorkspace.module.css` é importado por muitas telas. Mitigação: a classe é **nova** (nenhum seletor existente é editado), então nenhuma outra superfície muda de aparência; apenas os 2 botões que passarem a referenciá-la.
- **Custo de CI:** gates de navegador/PostgreSQL são pesados. Mitigação: um único job novo, sequencial, com `timeout-minutes` igual ao dos vizinhos; os três runners herdados não são duplicados nem alterados.

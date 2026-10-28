# UX-PRO-10B / 10C + 09E-8 — Medições em navegador nas prévias (27/10/2026)

**Estado:** entregue localmente. Produção segue **NO-GO**. Sem aceite humano, UAT, Windows real ou leitor de tela.

**Resultado central:** os limites de cobertura **automatizáveis** das prévias
foram medidos em navegador real — e a medição revelou uma **pendência nova de
contraste**: **708 amostras abaixo de 4.5:1** em 11 rotas. Nada foi aprovado
por conta disso; os números foram congelados como baseline de não regressão.

> **ATUALIZAÇÃO 27/10 — correção aplicada (E18 / Opção A).** O proprietário
> escolheu a **Opção A — Ajuste mínimo (AA ≥4.5:1)** entre três propostas com
> prévia visual. As 144 cores de texto problemáticas foram ajustadas nos 10
> `Layout*.module.css` e em `src/app/globals.css`, com duas regras pontuais
> (`.visualIndex` e `.artNumber`) e variantes claras/escuras para as 2 cores
> de superfície mista. **Nova medição no mesmo gate (PostgreSQL 17 +
> Chromium): 2560 amostras, 0 sinais abaixo de 4.5:1** — os **708** foram
> **zerados**. Permanecem **196 indeterminadas** (fundo complexo) e **108
> textos não medidos** (`<option>` de `<select>`), fora do escopo deste
> método. O baseline antigo está preservado em
> `docs/e18-paletas-2026-10-27/amostras-baseline-708.json`; a guarda
> `tests/ux-pro-10b-previas-medicoes.test.mjs` agora exige **zero** e bloqueia
> regressão. Relatório da correção: `docs/E18-OPCAO-A-RESULTADO-2026-10-27.md`.
> Revisão WCAG manual, leitor de tela, UAT/Windows e aceite humano seguem
> pendentes. **Produção segue NO-GO.**

## 1. Escopo

| Limite histórico | Situação após esta fatia |
|---|---|
| Rotas diretas `/layout-02`…`/layout-10` nunca abertas em navegador | **Fechado.** As 10 rotas diretas são abertas em Chromium real pelo E6 grupo 3 e por estes 5 cenários. |
| Um único percurso de teclado (Layout 01) | **Fechado na parte automatizada.** 10 percursos, um por rota direta, com medição de `:focus-visible`. |
| Zoom 200% não executado | **Fechado na parte automatizada.** 11 rotas × `zoom = 2` sem transbordo. |
| `prefers-color-scheme` — diferenças de pintura não medidas formalmente (09E-8) | **Medido.** 11 rotas × light/dark, paleta computada e contraste de texto; **0 rotas mudam de paleta** entre os esquemas. |
| Amostras "não medidas" de 09E-8 | **Reclassificadas com número:** 2.560 amostras, 196 indeterminadas, 108 textos visíveis sem medição. Nenhuma virou aprovação. |
| Teclado dentro do iframe do Layout 01 | **Fechado na parte automatizada.** Título, foco por Tab no 3º passo e saída por Shift+Tab (sem armadilha). |
| Revisão manual de tema/contraste, leitor de tela, WCAG integral, UAT | **Ainda pendente** — não executável sem pessoa/hardware. |

Nenhum layout, rota, permissão, contrato, migração ou paleta foi alterado.
A fatia é composta de workflow + gate + guarda + evidência + documentação.

## 2. RED → GREEN

O gate de navegador nasceu **GREEN 5/5** (`# duration_ms 108123`): não havia
defeito de teclado, zoom ou foco conhecido — a dívida era de **verificação**.
O RED desta fatia é da **guarda de evidência**: sem o JSON de medições (ou sem
o baseline de contraste), `tests/ux-pro-10b-previas-medicoes.test.mjs` falha.
Isso foi provado removendo o arquivo e rodando a guarda: **RED 3/5 → GREEN
5/5** ao restaurá-lo (falharam exatamente os dois testes que leem a evidência).

A descoberta real não foi uma falha de teste, e sim um **número**: o helper
PU4 `measureTextContrast` encontrou 708 sinais abaixo de 4.5:1. Em vez de
esconder, o número virou baseline bloqueante.

## 3. O gate (PostgreSQL 17 descartável + Chromium real)

`.github/workflows/ux-layout-previews-a11y-delivery.yml` roda cinco cenários
isolados por `UX_PUBLIC_TEST_PATTERN: 'UX-PRO-10B previas'`:

1. **Teclado:** 10 rotas diretas, até 20 `Tab` cada, primeiro foco visível
   sempre no **1º passo**; `:focus-visible`, `outline` e `box-shadow` medidos.
2. **Zoom 200%:** 11 rotas, `document.documentElement.style.zoom = '2'`,
   `scrollWidth - clientWidth = 0` em todas (390×844).
3. **`prefers-color-scheme`:** 11 rotas × `light`/`dark`, reutilizando
   `scripts/ux-evidence-text-contrast.mjs` (PU4) via `page.evaluate`;
   `resolved + indeterminate === sampleCount` e `unmeasuredVisibleTextCount`
   preservado. Paleta de `html`/`body` computada nos dois esquemas.
4. **Iframe do Layout 01:** `iframe[title]`, Tab alcança no 3º passo,
   `Shift+Tab` sai, `frameLocator` acessa o corpo.
5. **Layout 09 interativo:** `/layout-preview?visual=09` em light/dark com
   foco visível, zoom 200% e contraste medido.

A evidência é escrita no `after` do teste em
`docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json`. É **determinística**: duas
execuções completas produziram o mesmo SHA-256 (`917236ad…` — baseline ANTES da correção; hoje `14ff3232…`), sem timestamps
ou dados do operador.

## 4. O achado: pendência de contraste (aberta)

| Métrica (light + dark) | Valor |
|---|---|
| Amostras de texto | **2.560** |
| Abaixo de 4.5:1 | **708** |
| Indeterminadas (fundo complexo) | **196** |
| Textos visíveis não medidos | **108** |
| Rotas com paleta diferente entre light/dark | **0** |

Por rota ( `under45` por esquema ): `layout-01` 0 · `02` 27 · `03` 49 ·
`04` 18 · `05` 44 · `06` 32 · `07` 49 · `08` 51 · `09` 36 · `10` 43 ·
`layout-preview` 5.

Interpretação honesta:

- 196 amostras têm fundo complexo/indeterminado — o método PU4 **não** as
  aprova nem as reprova; exigem revisão manual.
- 108 textos visíveis não renderizaram retângulo mensurável — também ficam
  explícitos, não somem da contagem.
- As 708 com razão resolvida abaixo de 4.5:1 são um **sinal forte de defeito
  de contraste**, mas corrigi-las exige **decisão de paleta/design** (cores de
  texto, fundos e estados de foco dos 10 layouts). Por isso **não foram
  alteradas nesta fatia** — mesma natureza de bloqueio de D7/C11.
- Paleta idêntica em light/dark confirma o PU6: `prefers-color-scheme` **não**
  é o controle de tema do produto; a preferência do sistema não repinta as
  prévias. 09E-8 fica **medido e fechado no aspecto de pintura**, mas a
  revisão manual de contraste continua pendente.

**Baseline de não regressão:** `tests/ux-pro-10b-previas-medicoes.test.mjs`
congela os valores por rota. Se qualquer rota piorar, o CI falha — a guarda
roda **depois** do gate, lendo o JSON recém-escrito, não o arquivo versionado.
Melhorar também exige atualizar guarda + relatório (nunca acontece por acidente).

## 5. Guarda e matriz

- `tests/ux-pro-10b-previas-medicoes.test.mjs` (5 testes) congela o workflow,
  os cinco cenários, o uso do helper PU4, `colorScheme`, zoom, `Shift+Tab`,
  `:focus-visible`, a estrutura da evidência, os limites declarados, o baseline
  de contraste e a inclusão no `test:unit`.
- O comentário histórico de `tests/ux-pro-10b-visuals-guard.test.mjs` foi
  atualizado: a verificação em navegador existe, mas não é WCAG integral.
- `node scripts/ux-pro-00-inventory.mjs` regenerou os CSVs: as rotas de prévia
  passam a citar **dois** gates de jornada (E6 grupo 3 + 10B). **100/100
  rotas com gate, 0 lacunas**; `aceite humano: nao_registrado` em todas.
- Workflows: **48 → 49**.

## 6. Validação da fatia

| Verificação | Resultado |
|---|---|
| Guarda RED → GREEN (sem/com evidência) | **3/5 → 5/5** |
| Gate 10B (PostgreSQL 17 + Chromium) | **5/5**, determinístico em 2 execuções |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | ver §7 |
| `npm run typecheck` / `npm run build` | ver §7 |
| `qa-wave0-static` / inventários `--check` / audit / `git diff --check` | ver §7 |
| Gates E6 grupos 1/2/3 + portal | ver §7 |

## 7. Bateria final

Executada em 27/10/2026 no branch `arena/6d37ed49-gruposegsystemseguranca`,
base `6b4212d7e45d58003391dd0291e6c504c5c2964a`:

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1109/1109** (203 arquivos `.mjs`, 140 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00-inventory --check` / `ux-pro-03-ti-inventory --check` | **OK / OK** |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Gate do portal | **40/40** |
| Gates E6 grupos 1 / 2 / 3 | **6/6 · 7/7 · 6/6** |
| Gate 10B prévias | **5/5** |
| Workflows / rotas com gate | **49** / **100 de 100 (0 lacunas)** |
| `next-env.d.ts` `1862ac4b…` / `tsconfig.json` `2128c956…` | **preservados** |
| Evidência `docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json` | SHA `917236ad…` **idêntico** após as 3 execuções do gate (à época; hoje `14ff3232…` com 0 sinais) |

Os cinco gates de navegador usam clusters PostgreSQL 17 descartáveis e
`NEXT_DIST_DIR` próprio; os arquivos gerados foram restaurados após cada um.

## 8. Limitações que esta fatia **não** fecha

- **Contraste das prévias: 708 amostras abaixo de 4.5:1** — pendência aberta,
  dependente de decisão de paleta/design. Esta fatia mediu e travou regressão,
  não corrigiu.
- Revisão manual de tema/contraste, **leitor de tela**, WCAG integral, zoom em
  outros navegadores, UAT e **aceite humano** (0/100 rotas) — não executados.
- `prefers-color-scheme` medido, mas o **controle de tema do produto**
  (`data-color-mode`) segue sem verificação de persistência em navegador.
- D7 (inline dinâmico do Layout 09 e foco do atalho público), C11/2 hits,
  E3/E4, E7–E9, E14 (42 órfãos TI), E15/E16 e a reauditoria dos 222 IDs
  continuam na fila.
- Produção, provedores reais, mensagens reais e publicação continuam fora de
  escopo sem autorização expressa.

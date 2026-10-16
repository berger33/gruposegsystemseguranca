# UX-PRO-09E — site público: overflow a 320 px e as 104 amostras de contraste (16/10/2026)

**Status:** subfatia concluída e medida. É o **item 1** da fila autorizada pelo proprietário em 16/10/2026 ([prompt](UX-PRO-09D-PROMPT-PROXIMA-SUBFATIA-2026-10-16.md)), e nada além dele: as correções do site público registradas pelo **diagnóstico** UX-PRO-09B (PR #257) — (a) overflow do documento a 320 px em `/contato` (343 px) e `/faq` (347 px) e (b) revisão **amostra por amostra** das 104/1.246 amostras de contraste <4,5:1 em `/contato` e `/simulador`. Escopo medido, reparado e provado antes/depois; E6 e C11 **não** foram iniciados. Esta entrega **não** declara conformidade WCAG, aceite humano nem UAT. Homologação e produção permanecem **NO-GO**.

## 1. O que estava em jogo e o que foi decidido amostra a amostra

O 09B mediu em `d0ffffb` e não corrigiu nada, por decisão de escopo. Antes de codar, a medição foi **refeita na base atual** (`4a4b614`) — ver [ESCOPO-ANTES](UX-PRO-09E-ESCOPO-ANTES-2026-10-16.md) §2: os números são os mesmos (1.246 resolvidas, 104 abaixo de 4,5:1, 343/347 px), o que autoriza tratar o diagnóstico como ponto de partida válido.

Revisão: **104 registros = 13 superfícies distintas**, pois cada rota repete as mesmas 6 (em `/contato`) e 7 (em `/simulador`) amostras nas suas 8 capturas (4 larguras × 2 preferências de cor) — nenhum dos elementos medidos depende de largura ou de preferência.

| # | Rota / elemento | Fonte | Antes | Depois | Veredito da revisão |
|---|---|---|---|---|---|
| A1 | `/contato` `h2` "Assistente de dúvidas" `#ea580c` sobre `#fff7ed` | 20 px / 700 | 3,35 | **4,88** | **não era defeito AA** (texto grande ≥18,66 px bold exige 3:1); melhora junto porque é o mesmo token de A2–A6 |
| A2–A5 | `/contato` 4 sugestões `button` sobre `#fff` | 11 px | 3,56 | **5,18** | defeito real → corrigido |
| A6 | `/contato` `button` "Perguntar à base PUBLICO" sobre `#ea580c`→`#c2410c` | 16 px / 600 | 3,56 | **5,18** | defeito real → corrigido |
| B1–B4 | `/simulador` `li` das etapas ("01Seu espaço"…) sobre `#fff` | 11 px / 700 | 2,56 | **5,05** | defeito real → corrigido |
| B4b | `/simulador` número da etapa `.steps li span` sobre `#eef4fa` | 11 px / 800 | 2,72 | **4,56** | dentro da amostra B1–B4 (o texto medido do `<li>` inclui o número); **calculado da fonte**, pois o probe não amostra `span` — sem isto a amostra passaria a medir bem enquanto o pixel continuaria ruim |
| B5 | `/simulador` `p.asideIntro` sobre `#fff` | 12 px | 3,17 | **5,05** | defeito real → corrigido |
| B6–B7 | `/simulador` `p.summaryEmpty` (2 ocorrências) sobre `#fff` | 12 px | 2,36 | **5,05** | defeito real → corrigido (eram as duas menores razões de todo o público) |

**Sem defeito demonstrado** — e por isso **não tocado**: as 1.142 amostras resolvidas que já estavam ≥4,5:1; as 969 indeterminadas (gradiente/imagem/camadas), que seguem *não medidas*, o que não é aprovação. Ver resíduos §6.

## 2. Reparo (4 arquivos, nada além do medido)

| # | Arquivo | Mudança |
|---|---|---|
| C1 | `src/app/contato/page.tsx` (bloco de endereço) · `src/app/faq/page.tsx` (parágrafo "Contato claro") | `overflowWrap: "break-word"` no elemento que carrega o texto medido. A causa era **uma só**: o e-mail `contato@gruposegsystemseguranca.com.br`, palavra não-quebrável de **287 px** de rect medida (atribuição nova — o 09B não conseguia nomear `/faq` porque nenhum *rect de elemento* ultrapassava o limite; o `br@343px` apontado era consequência, não causa) |
| C2 | `src/components/RagWidget.tsx` | **somente** `RAG_COLORS.publico`: `accent`/`border` `#ea580c` → `#c2410c` (mesma família de laranja, uma etapa abaixo). `bg` `#fff7ed` e `light` `#ffedd5` preservados. `#c2410c` resolve ≥4,5:1 nos quatro papéis: 4,88 sobre o cartão, 5,18 sobre o branco, 4,52 na pílula de escopo, 5,18 sob o texto branco do botão |
| C3 | `src/app/simulador/Simulator.module.css` | `.steps li`, `.steps li span`, `.asideIntro` e `.summaryEmpty` passam ao token **já existente** da página, `var(--muted)` (`#5a7189` = 5,05:1 sobre o branco; 4,56 sobre `#eef4fa`) — sem inventar cinza novo, alinhando com o critério 2 do plano mestre |

`overflow-wrap: break-word` (não `anywhere`) foi escolha deliberada: não altera o mínimo do contêenedor, só quebra o que não cabe. Por isso **nenhuma linha muda** em 768/1440 px, e a única diferença além de 320 px é em 390 px, onde a palavra excedia a caixa em ~9 px sem produzir overflow do documento — agora cabe dentro dela.

**Preservado, e verificado por asserção:** todo o texto dos blocos (endereço, telefone, e-mail — inclusive o CNPJ/`noindex` das demais rotas), o formulário de lead de `/contato` (`/api/leads`, `consent`, `origin`, `campaign`, `maxLength`), os `data-testid`/`aria`/pílula de escopo do widget, as cores dos três escopos privados do `RagWidget` (literalmente as mesmas: `cliente` `#0b5fff`, `rh` `#059669`, `marcelo` `#7c3aed`), os 10 layouts e suas prévias, `globals.css`/`theme-tech.css`, e **nenhum** gancho de tema entrou no público (`prefers-color-scheme`, `seg-color-mode`, `data-color-mode`, `adminTheme` — asserido no gate).

## 3. Medição antes/depois (112 capturas em cada lado, mesma matriz do 09B)

| Grandeza | 09B `d0ffffb` | 09E **antes** `4a4b614` | 09E **depois** |
|---|---|---|---|
| Capturas / HTTP | 112 · 200 em 112/112 | 112 · 200 em 112/112 | **112 · 200 em 112/112** |
| Capturas com rolagem horizontal do documento | 4 | 4 | **0** |
| `/contato` a 320 px | 343 px | 343 px | **sem overflow** (probe: `scrollWidth ≤ clientWidth+1`) |
| `/faq` a 320 px | 347 px | 347 px | **sem overflow** |
| Amostras de cor colhidas | 2.215 | 2.214 | **2.214** (universo inalterado) |
| Com fundo sólido resolvido | 1.246 | 1.246 | **1.246** (idem) |
| Abaixo de 4,5:1 | 104 | 104 | **0** |
| Problemas fora do escopo | 8× 404 na rota de aceite com token sintético inválido | idêntico | **idêntico** (não é efeito desta fatia; a rota é deliberadamente inválida) |

Três verificações de que **nada mais se moveu**: o `primeiroTab` focado é idêntico antes/depois nas 8 capturas de cada rota em escopo; os pares `day`/`night` continuam byte-idênticos nas 24 capturas das rotas em escopo (o público não ganhou tema — e os 12 pares que divergem são as mesmas 3 rotas fora de escopo, antes e depois); e o universo de amostras não encolheu, o que é a prova de que o reparo não veio de esconder texto.

## 4. Gate novo e RED

`tests/ux-pro-09e-public-site.test.mjs` (**6 testes**), lido direto do código vigente, sem navegador — razão de contraste calculada com a **mesma fórmula** do probe de captura (sRGB relativa, `(L1+0,05)/(L2+0,05)`), sobre o fundo em que cada papel é realmente pintado; presença da regra de quebra **e** do conteúdo; invariância literal dos escopos privados; ausência de gancho de tema; e integridade da matriz de evidência versionada (contagem, dimensões IHDR = viewport, byte-comparação dos nomes nos dois sentidos, e `antes` com 104 registros/4 overflows contra `depois` com 0/0). Adicionado à lista `test:unit`, que é o que o CI roda como `npm test`.

**RED na base intocada (3 falhas, mensagens exatas):**

```
not ok 1 - UX-PRO-09E PU2: o escopo público do widget resolve >=4,5:1 nos quatro papéis medidos
  error: 'título (accent sobre o cartão): 3.35:1 < 4.5:1'
not ok 4 - UX-PRO-09E PU1: os dois blocos que estouravam o documento a 320 px quebram a palavra e mantêm o conteúdo
  error: '/contato: sem a regra de quebra, o e-mail de 287 px estoura o documento em 343 px'
not ok 3 - UX-PRO-09E PU3: as quatro regras do simulador passam pelo token da página e resolvem >=4,5:1
```

Os outros 3 (invariância dos escopos privados, ausência de tema, integridade da evidência) passam **nos dois lados** por construção: são guardas de preservação, não de reparo. Nenhuma asserção foi afrouxada. Após o reparo: **6/6**.

## 5. Gates executados nesta base `4a4b614`

| Gate | Resultado |
|---|---|
| `LD_LIBRARY_PATH=/tmp/al2023/lib UX_EVIDENCE_09E_DIR=… npm run ux:evidence -- --stage=ux-pro-09e` (antes e depois) | `UX_EVIDENCE_EXIT: 0` · 112 capturas · `UX_EVIDENCE_PG_TEMP_CLEANED: true` (cluster descartável destruído) |
| `npm run test:unit` | **955/955 · 0 falha** (949 de referência + 6 novos) |
| `npm run test:ux-portal:pg` | **22/22 · `UX_PORTAL_TEST_EXIT: 0`** — a 09C (ID1d) e a 09D (ID6a/b/c) seguem verdes com o `RagWidget` alterado |
| `node --test tests/ux-portal-vocabulary.test.mjs` | **17/17** |
| `node --test tests/ux-pro-00-precision.test.mjs` | **7/7** · `node --test tests/admin-navigation.test.mjs` **2/2** |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (roda no CI) — todas as rotas públicas continuam sendo pré-renderizadas |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs` + `--check` | OK; diff nos dois CSVs **conferido coluna a coluna**: 10 rotas × 1 coluna (`capturas_stage` / `evidencia`), apenas o acréscimo `\|ux-pro-09e` |
| `git diff --check` | limpo |
| Guards de arquivo | `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` ✅ (foi reescrito a cada boot do dev-server nos gates e restaurado por `git checkout --`, como previsto); `tsconfig.json` `99f7042f814e77e67b785906e5d4df23` ✅; chave do harness `randomBytes(32).toString('base64url')` ✅ intocada |

## 6. Evidências

- [`UX-PRO-09E-evidencias-2026-10-16/antes/`](UX-PRO-09E-evidencias-2026-10-16/antes/) — base `4a4b614` **sem o reparo**: 14 pastas de rota, **112 PNGs + 1 `resumo.json` por rota**, com a linha de atribuição do texto transbordando (`section "contato@…" rect=287px fim=343px`; `p "E-mail: contato@…" rect=287px fim=347px`) nas 4 capturas de 320 px.
- [`UX-PRO-09E-evidencias-2026-10-16/`](UX-PRO-09E-evidencias-2026-10-16/) — reparado: mesma matriz, **112 PNGs + 14 `resumo.json`**, zero overflow e zero amostra <4,5:1.
- Conferência (nos dois lados): `missing = []` e `orphans = []` entre os 112 PNGs do disco e os `entries[].screenshot` de cada `resumo.json`; dimensões IHDR batem com o viewport declarado em **112/112** capturas de cada pasta (28×`320x780`, 28×`390x844`, 28×`768x1024`, 28×`1440x900`). Nenhum PNG foi apagado; a pasta própria nunca tocou a do 09B. A verificação é **reativável por teste** (`test:unit`), não apenas por texto neste relatório.
- Capturas de `day` e `night` com bytes idênticos onde o público não tem tema: é limitação/constatação, não retrabalho — a dupla preferência continua sendo percorrida porque é assim que o defeito foi registrado no 09B.

## 7. Governança desta sessão

- Base confirmada após `fetch`: `HEAD` = `origin/main` = `4a4b614b08046f93c59e44f9502218b0d9e47244`. **Workspace limpo ao iniciar** — a situação alertada no prompt (checkout restaurado em SHA pré-merge com a fatia já mergeada como mudança não commitada) **não ocorreu**; não houve nada a reconciliar e nenhum `clean`/`reset`/revert foi usado.
- PRs: aberta **somente #234** (UX-PRO-07F-1) — **intocada**, como ordenado.
- **Resíduo 09D-1 resolvido por remoção:** após `git fetch --prune`, `git branch -r` traz apenas `origin/HEAD` e `origin/main`; nem `arena/b9dd5b57-…` nem `arena/7a374da0-…` existem mais. Nada foi apagado por esta sessão.
- Ferramental do sandbox reiniciado: `node_modules` ausente → `npm ci`; sem `/tmp/al2023` prévio (as bibliotecas vêm do `@sparticuz/chromium` e são extraídas no primeiro uso); sem `fontconfig`/fontes de sistema. Consequência registrada: os comprimentos de texto (287 px) e as razões valem para **este** ambiente e por isso o antes/depois é comparado consigo mesmo, sob o mesmo comando.
- **Observação de método** (não é defeito de produto, e não foi consertado por não ser autorizado): o gerador de inventário lê o texto-fonte da rota com `EMPTY_MARKERS` incluindo `[Nn]enhum` sem fronteira de palavra, de modo que um **comentário** meu em `/contato` ("nenhuma linha muda…") chegou a gravar `estados_vazio=sim` no CSV. O comentário foi reescrito e o CSV voltou ao diff puramente aditivo; o gerador continua capaz de contar prosa de comentário como estado do produto — fica para decisão se vale estreitar o marcador (exigir fronteira de palavra ou ignorar comentários).

## 8. Resíduos numerados desta fatia

| # | Resíduo | Estado |
|---|---|---|
| PU1 | overflow a 320 px em `/contato` (343) e `/faq` (347), uma causa | **CORRIGIDO** (esta PR), medido 4→0 capturas |
| PU2 | 6 amostras de `/contato` (token do escopo público) | **CORRIGIDAS** as 5 reais; A1 registrada como texto grande (não era defeito AA) e melhorou junto |
| PU3 | 7 amostras de `/simulador` + o número da etapa dentro da amostra | **CORRIGIDAS** via token da própria página |
| **PU4** | **o conjunto amostrado não é a página:** o probe percorre só `h1,h2,h3,p,a,button,label,li`. Fora dele ficaram `.review dt` e `.summaryBlock > span` (`#8093a4` = 3,17:1), `.field span` (2,82), `.footer` (2,63) e `.doneNote`, todos verificados à mão e **não medidos pelo probe**; e a captura é do **estado inicial** — em `/simulador` só a etapa 1 foi renderizada, então `.hint` (3,42) e o bloco `.error` nunca entraram na amostra. | **sem decisão** — corrigir cores não medidas fugiria à regra "só o sinal real demonstrado"; ampliar o probe (todas as tags de texto + varredura de estados) é decisão do proprietário |
| **PU5** | `.steps li` (0,1,1) vence `.stepActive`/`.stepDone` (0,1,0), e `.steps li span` (0,1,2) vence `.stepActive span`/`.stepDone span`: hoje a etapa ativa e as concluídas herdam o cinza da regra-base e **não se distinguem** das pendentes | **sem decisão** — nenhum contraste abaixo de 4,5:1 depende disso; é outro tipo de defeito (hierarquia de estados) e precisa de autorização própria |
| **PU6** | `Layout09.module.css:64 .progressStep { color: #9aabba }` — exatamente a cor de 2,36:1 que acabava de ser corrigida no simulador, numa **prévia de layout** fora das 14 rotas públicas medidas | **sem decisão** — os 10 layouts são prévias preservadas; nada nelas foi tocado |
| **09E-7** | `attributeTextOverflow` é opt-in: 09B e as demais etapas seguem sem a atribuição por execução de texto | registrado; acionar nas outras etapas é decisão |
| **09E-8** | Ruído do método fora de escopo: a rota de aceite com token sintético variou 1 amostra entre as duas corridas, e 3 rotas têm par `day`/`night` não-idêntico por pintura do navegador | registrado como limitação, sem reparo proposto |

Fila que esta sessão **não** tocou (ordem do proprietário): **E6** (`<main>` aninhado, 19 rotas, `AdminGate.tsx:115`) e **C11** (financeiro: alvo de toque 29 px + `FiscalWorkspace.tsx:80`/`ExpenseWorkspace.tsx:176`), cada um em subfatia própria; e permanecem sem decisão E2, E3, E5, E8, E9, ID3, ID4.

## 9. Limitações

Medição em Chromium headless Linux num sandbox sem fontes de sistema e sem saída de rede para terceiros; `day`/`night` é `prefers-color-scheme`, não um controle de tema do produto; o contraste só é resolvido onde há fundo sólido na cadeia do elemento (969 amostras seguiram indeterminadas); as capturas registram o estado inicial de cada rota, sem forçar estados de erro/vazio/carregando nem submeter formulários; nada foi validado com leitor de tela, zoom de 200%, Windows ou outros navegadores; **não há validação manual nem aceite humano registrados** — a mudança é de cor e de quebra de linha, e a percepção final dessas duas coisas é de pessoa. Capturas não medem produção. **Homologação e produção: NO-GO.**

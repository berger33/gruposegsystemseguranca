# UX-PRO-09E — site público: overflow a 320 px e as 104 amostras de contraste (correções autorizadas do 09B) — escopo antes do código (16/10/2026)

**Status histórico:** medição pré-código da subfatia **UX-PRO-09E — site público**, feita em `4a4b614` antes de qualquer edição de produto. **Retificação pós-merge:** a PR #260 foi mergeada em `origin/main` (`6866b501`) e checks verdes, mas mudou além dos limites autorizados: o acento compartilhado também recoloriu o título grande sem defeito demonstrado e o número `.steps li span` fora das 104 amostras. A correção estreita nesta branch fixa `arena/b928ace8-gruposegsystemseguranca` restaura esses papéis (`#ea580c` e `#8397a8`) e mantém somente as correções medidas. A medição histórica e os limites abaixo permanecem; os itens de implementação foram retificados. Sem aceite humano, UAT nem declaração de conformidade WCAG; homologação e produção **NO-GO**.

> **Decisão final de escopo:** corrigir os **40 sinais reais** dos quatro botões de sugestão + CTA público, sem mudar o título grande ou os demais papéis do RAG; corrigir os **56 sinais reais** nos rótulos de etapa e textos pequenos do resumo, sem recolorir os números em `span`. As oito ocorrências do `h2` continuam “sem defeito demonstrado”; os fundos indeterminados continuam sem classificação por suposição.

## 0. O que está autorizado aqui (decisão item a item do proprietário, 16/10/2026)

Registrada em [`UX-PRO-09D-PROMPT-PROXIMA-SUBFATIA-2026-10-16.md`](UX-PRO-09D-PROMPT-PROXIMA-SUBFATIA-2026-10-16.md). Regra da família: 1 subfatia = 1 sessão = 1 PR pequena. **Esta sessão executa somente o item 1.**

| Item | Escopo autorizado | Nesta sessão |
|---|---|---|
| **1 — site público (09B era só diagnóstico)** | (a) overflow do documento a 320 px em `/contato` (343 px; probe apontou `br`) e `/faq` (347 px; probe não atribuiu), reproduzido nas duas preferências de cor; (b) revisão **amostra por amostra** das 104/1.246 amostras de contraste <4,5:1 (16 capturas de `/contato` e `/simulador`) — **sinais, não conclusões WCAG**; corrigir apenas o que for sinal real demonstrado, com evidência por amostra; o resto registrado como sem defeito demonstrado | **SIM — esta subfatia** |
| 2 — E6 (`<main>` aninhado, 19 rotas, `AdminGate.tsx:115`) | correção estrutural aditiva | fila (subfatia própria) |
| 3 — C11 (financeiro: alvo de toque 29 px + 2 hits auditados) | ordem expressa | fila (subfatia própria) |
| E2, E3, E5, E8, E9, ID3, ID4, 09D-1 | — | **sem decisão**; nada liberado |

Limites assumidos: nenhum contrato de API/formulário/lead, `noindex`, RBAC, sessão ou comportamento público muda além do medido e autorizado; os 10 layouts continuam preservados como prévias (06 é o padrão); **nada de tema sistêmico acidental no público**.

## 1. Base conferida antes de editar

### 1.1 Git e GitHub

- Branch fixa da sessão: `arena/4c52c593-gruposegsystemseguranca`.
- `git fetch --prune`: `HEAD` = `origin/main` = **`4a4b614b08046f93c59e44f9502218b0d9e47244`** — o merge da PR #259 (UX-PRO-09D), que já contém a #258 (09C, merge `f35e1f1445645620a1926a0d6b499679bb3a8e9c`) e a #257 (09B diagnóstico). Clone **raso (1 commit)**: os antecessores não existem localmente; os merges foram confirmados pelo lado do GitHub.
- **PRs abertas: somente #234** (`arena/c544b76f-…`, UX-PRO-07F-1) — **intocada**, como ordenado. Nenhuma outra PR aberta.
- **Resíduo 09D-1 encerrado por remoção:** após o `fetch --prune`, `git branch -r` lista apenas `origin/HEAD` e `origin/main`. Nem `arena/b9dd5b57-…` nem `arena/7a374da0-…` existem mais no origin. Nada foi apagado por iniciativa própria nesta sessão.

### 1.2 Estado do workspace (a ressalva do prompt não se confirmou)

O alerta de que o checkout poderia chegar restaurado em SHA pré-merge com os arquivos da fatia já mergeada como mudanças não commitadas **não se verificou**: `git status --porcelain` estava **vazio** no início da sessão, em `4a4b614`. Não havia conteúdo duplicando a #259; portanto nada a reconciliar, e nenhum `git clean`/`reset --hard`/revert foi usado ou necessário.

### 1.3 Guardas técnicas conferidas

- `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` ✅ na árvore limpa. **Reescreveu-se** durante o boot do dev-server da própria captura (`NEXT_DIST_DIR=.next/ux-evidence`) e foi **restaurado** com `git checkout -- next-env.d.ts` + MD5 reconferido — o efeito previsto no alerta do prompt, reproduzido aqui uma vez.
- `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` ✅ (intocado).
- Chave do harness `CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url')` em `tests/ux-portal-workspace.integration.test.mjs` ✅ preservada — esta subfatia não toca nesse arquivo.

### 1.4 Ambiente novo e cronologia da medição

Sandbox reiniciado: `node_modules` ausente → `npm ci` (exit 0). Não havia `/tmp/al2023` pré-montado: as bibliotecas do Chromium vêm do próprio `@sparticuz/chromium`, extraídas em `/tmp/al2023/lib` no primeiro uso; o `LD_LIBRARY_PATH` documentado continua sendo passado. Não há `fontconfig` nem fontes de sistema — o navegador usa as fontes do pacote. Consequência honesta: os comprimentos de texto medidos valem para **este** ambiente; por isso o antes/depois é sempre comparado **consigo mesmo**, e os números do 09B são reconferidos (não presumidos) — ver §2.2.

| Momento (UTC) | Evento |
|---|---|
| 18:43:28 | captura `antes` encerrada na base intocada (`UX_EVIDENCE_EXIT: 0`) |
| 18:44:56 → 18:45:30 | edições de produto (4 arquivos, §5) |
| 18:49:41 | captura `depois` encerrada |

Nenhuma linha de produto foi tocada antes do fim da medição `antes`.

## 2. Re-medição da base atual — o que o 09B mediu em `d0ffffb`, refeito em `4a4b614`

### 2.1 Como foi medido

Etapa própria, sem sobrescrever a do 09B:

```
LD_LIBRARY_PATH=/tmp/al2023/lib UX_EVIDENCE_09E_DIR='docs/UX-PRO-09E-evidencias-2026-10-16/antes' \
  npm run ux:evidence -- --stage=ux-pro-09e
```

Mesma matriz do diagnóstico: **14 rotas** `site publico` do inventário × **4 larguras** (320/390/768/1440) × **2 preferências de cor** (`day`/`night`) = **112 capturas PNG + `resumo.json` por rota**. Sem cookies, sem sessão, sem submissão de formulário, com PostgreSQL descartável destruído ao fim (`UX_EVIDENCE_PG_TEMP_CLEANED: true`). O output local pre-code foi preservado sem alteração de bytes em [`captura-propria/`](UX-PRO-09E-evidencias-2026-10-16/captura-propria/), junto dos 24 PNGs full-page de contexto; só as referências JSON mudaram para coexistir com o diretório `antes/` já versionado pela #260.

A 09E acrescenta ao harness um probe **opt-in** (`attributeTextOverflow`) que mede cada execução de texto pelo próprio `Range` de linha. É a resposta direta à lacuna do 09B em `/faq` ("probe não atribuiu a elemento"): o laço existente percorre **retângulos de elementos**, e uma palavra mais larga que a coluna estoura o **documento** sem que elemento algum tenha rect além do limite. O 09B e as demais etapas não pedem o flag, logo continuam gerando exatamente a mesma saída.

### 2.2 A base atual reproduz o 09B

| Grandeza | 09B em `d0ffffb` | Captura própria before em `4a4b614` | Baseline herdado da #260 em `4a4b614` |
|---|---|---|---|
| HTTP de navegação | 200 em 112/112 | **200 em 112/112** | **200 em 112/112** |
| Amostras de cor colhidas | 2.215 | **2.215** | 2.214 |
| Com fundo sólido resolvido | 1.246 | **1.246** | **1.246** |
| Fundos indeterminados | 969 | **969** | 968 |
| Abaixo de 4,5:1 | 104 | **104** | **104** |
| `/contato` a 320 px | documento 343 px (`br@343px`) | **documento 343 px** | **documento 343 px** + atribuição Range |
| `/faq` a 320 px | documento 347 px (sem culpado) | **documento 347 px** | **documento 347 px** + atribuição Range |

Confronto chave-a-chave (rota × largura × preferência), 112 chaves: **09B e a captura própria before têm os mesmos totais**. As duas corridas variam apenas na distribuição de amostras indeterminadas da rota diagnóstica de token sintético inválido: `320px/day` tem 2 no 09B e 3 na captura própria; `320px/night` tem 3 no 09B e 2 na captura própria — efeito líquido zero em 2.215/1.246/969 e fora dos 104 sinais. O baseline herdado da #260 registra 2 amostras em ambos os temas a 320 px (2.214/1.246/968); em day/night e fora dessa rota, o universo e os defeitos medidos permanecem iguais. As quatro atribuições Range para `/contato` e `/faq` (320 px, day/night) estão em [`antes/contato/resumo.json`](UX-PRO-09E-evidencias-2026-10-16/antes/contato/resumo.json) e [`antes/faq/resumo.json`](UX-PRO-09E-evidencias-2026-10-16/antes/faq/resumo.json); a captura própria pre-code e seus PNGs full-page preservados estão em [`captura-propria/`](UX-PRO-09E-evidencias-2026-10-16/captura-propria/). Leitura honesta: **o site público não se alterou entre `d0ffffb` e `4a4b614`** (a 09C e a 09D tocaram portal do cliente e o servidor `.mjs`), e as medições do diagnóstico continuam válidas como ponto de partida.

### 2.3 Preferência de cor: por que "se reproduz nas duas preferências"

**44 dos 56** pares `day`↔`night` são **byte-idênticos** (mesmo PNG em ambas). Os 12 que divergem pertencem a 3 rotas fora deste escopo (`/conteudos`, `/conteudos/diagnostico-sem-conteudo`, `/pacotes`) e divergem do mesmo jeito antes e depois — variação de pintura do próprio navegador sob `prefers-color-scheme`, não um tema do produto (que não existe no público, e é a regra). Nas três rotas em escopo **todos os 12 pares (3 rotas × 4 larguras) são idênticos**: o overflow do `/contato` e do `/faq` não é um efeito de tema; é a mesma pintura, medida duas vezes.

### 2.4 As 104 amostras são, na verdade, 13 superfícies

104 = 48 registros em `/contato` + 56 em `/simulador` — as mesmas 6 e 7 superfícies repetidas nas 8 capturas de cada rota (4 larguras × 2 preferências). São **96 sinais reais** (40 em sugestões/CTA e 56 em rótulos/resumo) mais **8 registros do título grande**, sem defeito demonstrado. Revisão final individual: [`correcao/contraste-revisao.json`](UX-PRO-09E-evidencias-2026-10-16/correcao/contraste-revisao.json). O 09B e a captura própria pre-code reportaram 969 fundos indeterminados (2.215 amostras/1.246 resolvidas); o baseline herdado da #260 e o after corrigido reportam 968 (2.214/1.246), com a única diferença na rota de token sintético inválido. Nenhuma amostra de fundo indeterminado foi tratada como defeito.

## 3. Superfícies inventariadas (medição da base real)

| # | Superfície | Natureza | Arquivo medido |
|---|---|---|---|
| S1 | `/contato` — bloco de endereço (texto com o e-mail institucional) | público, inline | `src/app/contato/page.tsx` (seção após o `<h1>`) |
| S2 | `/faq` — parágrafo "Contato claro" (o mesmo endereço, em prosa) | público, inline | `src/app/faq/page.tsx:65` (na base `4a4b614`) |
| S3 | Widget RAG público — acento de escopo usado em título, sugestões, pílula de escopo e botão de envio | **compartilhado** entre 4 escopos; `ragKey="publico"` só em `/contato` | `src/components/RagWidget.tsx:50` (`RAG_COLORS.publico`) |
| S4 | Simulador — rótulos das 4 etapas, número da etapa, intro do resumo e estado vazio do resumo | público, CSS module próprio da rota | `src/app/simulador/Simulator.module.css` (`.steps li`, `.steps li span`, `.asideIntro`, `.summaryEmpty`) |
| S5 | Consumidores das cores tocadas | auditoria | `grep` completo: `RAG_COLORS.publico` só alcança `/contato`; os outros três escopos alimentam `/admin/marcelo/assistente`, `/admin/rh/assistente` e `/cliente/app/assistente`, que têm gate próprio (`tests/ai-rag-widget.integration.test.mjs`, asserções ≥4,5:1 nos rótulos/envio **dos assistentes privados**); nenhum teste ou script referencia `#ea580c` nem as quatro cinzas do simulador (`grep` em `tests/` e `scripts/`: zero ocorrências) |
| S6 | Compartilhamento de CSS no público | fronteira | `src/app/globals.css`, `src/app/theme-tech.css` e os 10 `LayoutXX.module.css` **não contêm** nenhuma das quatro regras; nenhuma das 11 rotas públicas restantes importa `Simulator.module.css` nem `RAG_COLORS` |

### 3.1 Overflow a 320 px — causa **única**, agora atribuída

| Rota | Documento | Culpado atribuído pelo probe estendido (rect medido) |
|---|---|---|
| `/contato` 320 px `day` e `night` | **343 > 320** | `section` — `"contato@gruposegsystemseguranca.com.br"`, rect **287 px**, fim em **343 px** (o `br@343px` do 09B era a **consequência**, não a causa) |
| `/faq` 320 px `day` e `night` | **347 > 320** | `p` — `"E-mail: contato@gruposegsystemseguranca.com.br ("`, rect **287 px**, fim em **347 px** |

A mesma palavra não-quebrável, com o **mesmo rect de 287 px**, em ambas as rotas: o e-mail `contato@gruposegsystemseguranca.com.br`. A diferença de 4 px entre 343 e 347 é só a geometria dos invólucros (`/faq` soma a borda esquerda de 4 px do cartão). Em 390/768/1440 o documento não estoura em nenhuma das duas rotas.

### 3.2 As 13 superfícies de contraste, uma a uma

Tamanho de fonte e peso lidos do código vigente; razão medida pelo probe nas 112 capturas (idêntica em todas as 8 de cada rota).

| # | Rota | Elemento | Fonte | Razão medida | AA exige | Veredito da revisão |
|---|---|---|---|---|---|---|
| A1 | `/contato` | `h2` "Assistente de dúvidas" `#ea580c` sobre `#fff7ed` | 20 px / 700 | **3,35** | 3:1 (texto grande ≥18,66 px bold) | **sem defeito demonstrado** — manter cor e papel exatamente como estavam; não compartilhar a correção dos controles pequenos |
| A2–A5 | `/contato` | 4 sugestões `button` `#ea580c` sobre `#fff` | 11 px | **3,56** | 4,5:1 | **defeito real** (11 px não é texto grande) |
| A6 | `/contato` | `button` "Perguntar à base PUBLICO" `#fff` sobre `#ea580c` | 16 px / 600 | **3,56** | 4,5:1 | **defeito real** (16 px < 18,66 px) |
| B1–B4 | `/simulador` | rótulos textuais das 4 etapas, regra-base `.steps li` `#93a4b4` sobre `#fff` | 11 px / 700 | **2,56** | 4,5:1 | **sinal real**; corrigir o texto da etapa. O `span` numérico (`#8397a8` sobre `#eef4fa`) é explicitamente excluído e preservado, apesar de o `textContent` do `<li>` concatenar o número. |
| B5 | `/simulador` | `p.asideIntro` "Resumo do que você está montando." `#8093a4` sobre `#fff` | 12 px | **3,17** | 4,5:1 | **defeito real** |
| B6–B7 | `/simulador` | `p.summaryEmpty` "Escolha o tipo de imóvel para começar." / "Nenhum selecionado ainda." `#9aabba` sobre `#fff` | 12 px | **2,36** | 4,5:1 | **defeito real** — as duas menores razões de todo o público |

As amostras-alvo têm fundo sólido resolvido pelo probe. A1 é texto grande e não tem defeito demonstrado. Os números em `span` do progresso não integram as 104 amostras para efeito desta correção e mantêm `#8397a8`; não são reclassificados a partir do texto concatenado do `<li>`. A captura própria before soma 2.215 amostras (1.246 resolvidas/969 indeterminadas), como o 09B; o baseline herdado da #260 e o after corrigido somam 2.214 (1.246/968), por uma amostra indeterminada a menos na rota de token sintético inválido. A diferença não alcança sinal abaixo de 4,5:1 nem transforma qualquer fundo indeterminado em defeito.

## 4. Lacunas numeradas

- **PU1 — overflow do documento a 320 px em `/contato` (343 px) e `/faq` (347 px), uma causa.** 4 capturas em 112. Causa medida em §3.1. **Corrigível no escopo autorizado** (quebra de palavra onde o texto não cabe; nada de conteúdo, contrato ou layout muda).
- **PU2 — 40 sinais reais em `/contato`** (4 sugestões + CTA, cinco controles × oito capturas) e oito registros do `h2` grande sem defeito demonstrado. Os controles recebem `--rag-interactive-accent`; `--rag-accent`/`--rag-border` públicos e o título seguem `#ea580c`.
- **PU3 — 56 sinais reais em `/simulador`** (quatro rótulos × oito capturas + três textos de resumo × oito). `.steps li`, `.asideIntro` e `.summaryEmpty` usam `--muted`; `.steps li span` continua `#8397a8` e fora do escopo. PU5 (especificidade dos estados ativo/concluído) permanece sem mudança, conforme limite original.
- **PU4 — o conjunto amostrado não é a página inteira (limitação do método do 09B, registrada, não corrigida).** O probe percorre só `h1,h2,h3,p,a,button,label,li`. Fora dele ficaram, entre outros, `.review dt` e `.summaryBlock > span` (`#8093a4` = 3,17:1), `.field span` e `.footer` (`#8c9cab` = 2,82/2,63:1), `.doneNote` — verificados por mim à mão, **não medidos pelo probe** — além de tudo que só existe em estado posterior (`/simulador` foi capturado na etapa 1; `.hint` = 3,42:1 e o bloco `.error` não chegaram a renderizar). Regra da subfatia: **sem medição ≠ aprovado**, e o que não foi medido não é sinal demonstrado, logo **não se corrige aqui**. Vira decisão do proprietário (ampliar o probe do stage para todas as tags de texto + varrer os estados).
- **PU5 — achado de leitura, sem defeito de contraste: os estados da trilha do simulador não se distinguem por cor.** `.steps li` (especificidade 0,1,1) vence `.stepActive`/`.stepDone` (0,1,0), e `.steps li span` (0,1,2) vence `.stepActive span`/`.stepDone span` (0,1,1): hoje a etapa ativa e as concluídas herdam o cinza da regra-base e ficam iguais às pendentes. Não é lacuna autorizada (nenhuma amostra <4,5:1 depende disso) e **não é tocado nesta subfatia**; registrado com as seletores e as especificidades para decisão.
- **PU6 — ruído do método fora do escopo:** a rota de aceite com token sintético inválido variou 1 amostra entre as duas corridas (§2.2) e 3 rotas têm par `day`/`night` não-idêntico por pintura do navegador (§2.3). Nenhum dos dois é defeito de produto demonstrado; nenhum reparo é proposto.

## 5. O que será corrigido (e o que continua intocado)

| # | Arquivo | Mudança | Razão antes → alvo |
|---|---|---|---|
| C1 | `src/app/contato/page.tsx` (bloco de endereço) e `src/app/faq/page.tsx` (parágrafo "Contato claro") | acrescentar `overflowWrap: "break-word"` no elemento que carrega o texto medido | overflow 343/347 → **documento sem rolagem horizontal** em 320/390/768/1440 |
| C2 | `src/components/RagWidget.tsx` | acrescentar `--rag-interactive-accent: #c2410c` **somente** ao texto das quatro sugestões e ao fundo do CTA de `ragKey="publico"`; manter `RAG_COLORS.publico.accent` e `.border` em `#ea580c` | 40/40 sinais de sugestões/CTA passam de 3,56 para **5,18:1**; o título grande permanece **3,35:1**, sem alteração ou defeito demonstrado; pílula, selo e demais papéis não mudam |
| C3 | `src/app/simulador/Simulator.module.css` | `.steps li` (texto do rótulo), `.asideIntro` e `.summaryEmpty` passam a `var(--muted)`; `.steps li span` restaura/mantém `#8397a8` | 56/56 sinais textuais passam de 2,36–3,17 para **5,05:1**; números em `span` ficam fora das 104 e não são recoloridos |

Escolhas deliberadas de projeto: `break-word` (não `anywhere`) porque não altera o tamanho mínimo do contêenedor — só quebra o que não cabe; `var(--muted)` (token **já existente** da própria página, 5,05:1) em vez de inventar um cinza novo, alinhando com o critério 2 do plano mestre ("tokens semânticos existentes, não valores arbitrários locais").

**Não muda, e continua valendo como preservação:** nenhum texto, campo, `required`, `maxLength`, ordem de formulário, endpoint `/api/leads`, payload, `origin`/`campaign`, consentimento ou estado de envio; nenhum `href`, rota, `metadata`, `noindex` ou título; a pílula de escopo, o `aria`, os `data-testid` e o contrato do widget; as cores dos escopos privados (`cliente`/`rh`/`marcelo`) do `RagWidget`; os 10 layouts e suas prévias; `globals.css`, `theme-tech.css` e qualquer token de tema; nenhum tema sistêmico é adicionado ao público; nenhum `<main>`, permissão ou rota é tocada (E6/C11 ficam na fila).

## 6. Plano de evidência e gates

1. **Evidência:** `captura-propria/` preserva o baseline local pre-code (112 PNGs de viewport + 24 full-page, resumos por rota, 104 revisões e manifesto SHA-256); `antes/` mantém, sem alteração, a referência já versionada pela #260, cujos quatro resumos de `/contato` e `/faq` registram a atribuição do overflow por `Range`; `correcao/` contém o after corrigido, 14 rotas × 8 combinações = 112 PNGs e listas DOM completas de contraste por amostra. `correcao/contraste-revisao.json` cruza os 104 sinais originais; `correcao/integridade.json` cobre as 112 referências herdadas antes e 112 depois. Os testes conferem referências e PNGs nos dois sentidos, dimensões, hashes, pares day/night e a integridade da captura própria.
2. **Resultado revisado:** 96/96 sinais reais corrigidos ≥4,5:1; oito h2 grandes permanecem em 3,35:1 sem alteração e são registrados como “sem defeito demonstrado”; 8 amostras abaixo de 4,5 no after correspondem somente a esses h2. Overflow documental: quatro capturas antes, zero depois.
3. **Regressão:** `tests/ux-pro-09e-public-site.test.mjs` valida a variável separada do RAG, os três grupos de texto medidos do simulador, a preservação do número `#8397a8`, dos escopos privados e dos fluxos, mais o cruzamento detalhado e a integridade das evidências. A razão calculada é triagem automatizada, não uma declaração de conformidade WCAG.
4. **Gates da família nesta base:** `LD_LIBRARY_PATH=/tmp/al2023/lib npm run ux:evidence -- --stage=ux-pro-09e` (depois), `npm test` **956/956** (inclui os sete testes 09E), `node --test tests/ux-portal-vocabulary.test.mjs` 17/17, `UX_PORTAL_09D_EVIDENCE_DIR=… npm run test:ux-portal:pg` 22/22 (`UX_PORTAL_TEST_EXIT: 0`) para provar que a 09D não regrediu, `npm run typecheck`, `node scripts/qa-wave0-static.mjs` 5/5, `node scripts/ux-pro-00-inventory.mjs` + `--check` (após tocar `src/app`; diff aditivo conferido antes de versionar), `git diff --check`, `npm run build` (roda no CI da PR). Restaurar `next-env.d.ts` por MD5 antes de commitar.
5. **PR única pequena**; merge só com todos os checks SUCCESS e base confirmada (`gh pr merge <n> --merge`, sem `--auto`); depois, relatório, resíduos numerados, limites e prompt da próxima pendência.

## 7. Limites deste documento

Medição em Chromium headless Linux num sandbox sem fontes de sistema nem rede externa: os comprimentos de linha e as razões de cor valem para esse ambiente e são comparados antes/depois no mesmo ambiente. `day`/`night` é `prefers-color-scheme`, não um controle de tema do produto. O probe resolve fundo apenas quando há cor de fundo sólida na cadeia do elemento. Nada aqui é avaliação WCAG integral, leitor de tela, zoom 200%, Windows, outros navegadores, UAT ou aceite humano; captura não mede produção. **Homologação e produção: NO-GO.**

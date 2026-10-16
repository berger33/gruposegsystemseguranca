# UX-PRO-09E — correção de escopo após a PR #260

**Data:** 16/10/2026 · **Base da correção:** `6866b5019b0fcb12536ca51fcc7061e9b2e538d9` · **Branch fixa:** `arena/b928ace8-gruposegsystemseguranca` · **Escopo:** apenas os efeitos fora do limite autorizados que a #260 introduziu na UX-PRO-09E já mergeada.

**Status:** a PR #260 foi mergeada em `origin/main` e seus checks estavam verdes. Esta não é uma segunda implementação da subfatia: é a correção estreita autorizada depois de se constatar que o estado mergeado também alterou papéis expressamente excluídos. A primeira execução da CI da PR corretiva detectou que um valor literal nos controles RAG privados ignorava o override noturno (3,03:1 no CTA de `/admin/marcelo/assistente`); o fallback agora referencia `var(--rag-accent)`, preservando o tema. O gate FECH-01 local passou 26/26 após a correção. A PR corretiva permanece aberta até todos os checks do commit final passarem. A execução não registra aceite humano, UAT nem conformidade WCAG. **Homologação e produção permanecem NO-GO.**

## 1. Retificação necessária

A medição e o escopo antes do código estão em [`UX-PRO-09E-ESCOPO-ANTES-2026-10-16.md`](UX-PRO-09E-ESCOPO-ANTES-2026-10-16.md). A base original foi `4a4b614b08046f93c59e44f9502218b0d9e47244`. A #260 foi mergeada como `6866b5019b0fcb12536ca51fcc7061e9b2e538d9` antes da publicação desta branch corretiva.

A #260 resolveu o overflow e escureceu os alvos medidos, mas fez duas alterações além do escopo explícito:

- mudou o `accent`/`border` compartilhado de `RAG_COLORS.publico`, recolorindo o título grande de 20 px/700, que media **3,35:1** e tinha sido classificado como **sem defeito demonstrado**;
- mudou `.steps li span` de `#8397a8`, embora os números sejam spans fora das 104 amostras e devam preservar esse estilo.

A correção atual mantém o `accent` e a borda-base públicos em `#ea580c`, cria `--rag-interactive-accent: #c2410c` somente para o texto das quatro sugestões e o fundo do CTA em `ragKey="publico"`, e restaura `.steps li span` para `#8397a8`. Para `cliente`/`rh`/`marcelo`, o valor interativo referencia `var(--rag-accent)` computado, mantendo os overrides noturnos privados. O gate FECH-01 confirmou os três assistentes em day/night; nenhum estilo privado foi alterado. O overflow já corrigido em `/contato` e `/faq` e as cores dos textos pequenos do simulador permanecem como na #260. Não alterei a especificidade de `.stepActive`/`.stepDone` (resíduo PU5), nem ampliei a correção a outros textos ou fundos.

## 2. Resultado amostra por amostra

A base original contém **104 registros** abaixo de 4,5:1: 48 em `/contato` e 56 em `/simulador`. A revisão visual separou **96 sinais reais** dos oito registros do título grande, que continuam sem defeito demonstrado. As contagens refletem as oito combinações de quatro larguras e duas preferências de cor por rota.

| Alvo | Registros | Antes | Depois corrigido | Resultado |
|---|---:|---:|---:|---|
| Quatro botões de sugestão do RAG público | 32 | 3,56:1 | 5,18:1 | Corrigidos; só o texto desses controles usa o acento interativo. |
| CTA “Perguntar à base PUBLICO” | 8 | 3,56:1 | 5,18:1 | Corrigido; só o fundo do CTA usa o acento interativo. |
| Título “Assistente de dúvidas” (20 px/700) | 8 | 3,35:1 | 3,35:1 | Inalterado em `#ea580c`; sem defeito demonstrado no limiar revisado para texto grande. |
| Rótulos textuais das etapas do simulador | 32 | 2,56:1 | 5,05:1 | Corrigidos com `var(--muted)`. O span numérico continua `#8397a8`, fora do universo autorizado. |
| Instrução do resumo | 8 | 3,17:1 | 5,05:1 | Corrigida com `var(--muted)`. |
| Dois textos do resumo vazio | 16 | 2,36:1 | 5,05:1 | Corrigidos com `var(--muted)`. |
| **Total** | **104** | — | — | **96/96 sinais reais corrigidos; 8/8 registros do título mantidos sem alteração.** |

A lista DOM original conserva `textContent` de cada `<li>`; no simulador, por isso o texto do registro pode concatenar o número e o rótulo. O alvo de contraste é a regra/cor do rótulo `.steps li`; `.steps li span` não é uma amostra independente nem um alvo e preserva `#8397a8`. Essa fronteira está registrada por ocorrência em [`correcao/contraste-revisao.json`](UX-PRO-09E-evidencias-2026-10-16/correcao/contraste-revisao.json).

Os oito registros abaixo de 4,5:1 que permanecem na auditoria corrigida são exclusivamente o mesmo `h2` (oito combinações, `3,35:1`). Isso não converte o título em defeito. Os fundos indeterminados também continuam não medidos: o 09B e a captura própria before registraram 969 (`2.215` amostras, `1.246` resolvidas); o baseline herdado da #260 e o after corrigido registram 968 (`2.214`, `1.246`). A diferença de uma observação entre os dois baselines está na rota diagnóstica de token sintético inválido (`320px/day`: 3 amostras na captura própria, 2 na herdada), e não altera nenhum dos 104 sinais nem a causa do overflow. Nenhum fundo indeterminado foi classificado como defeito por suposição.

## 3. Overflow e evidências

A causa foi atribuída no DOM antes da correção original: em 320 px, o e-mail institucional sem oportunidade de quebra tinha `Range` de **287 px**; sua linha terminava em x=343 em `/contato` e x=347 em `/faq`. A captura original registrou quatro overflows (duas rotas × day/night). A correção de quebra de palavra da #260 foi mantida.

Após a retificação, o runner `ux-pro-09e` foi executado com PostgreSQL **descartável** e saída isolada em `docs/UX-PRO-09E-evidencias-2026-10-16/correcao/`:

| Fase | Rotas/capturas | Amostras | Abaixo de 4,5:1 | Overflow documental |
|---|---:|---:|---:|---:|
| Antes — captura própria preservada, base `4a4b614` | 14 × 8 = 112 | 2.215 (1.246 resolvidas) | 104 | 4 |
| Antes — baseline herdado da #260, também preservado | 14 × 8 = 112 | 2.214 (1.246 resolvidas) | 104 | 4 |
| After corrigido — base `6866b50` + retificação | 14 × 8 = 112 | 2.214 (1.246 resolvidas) | 8, todos os `h2` preservados | 0 |

Os 112 after têm status de navegação 200. As 112 entradas retêm a lista DOM completa de amostras para permitir o cruzamento 104:104, sem limitar o after a `under45`. A evidência contém:

- [`captura-propria/`](UX-PRO-09E-evidencias-2026-10-16/captura-propria/) — baseline executado localmente antes de qualquer edição de produto: 112 capturas viewport + 24 contextos full-page, 14 resumos JSON de rota, revisão própria dos 104 sinais e manifesto SHA-256/dimensões para os 136 PNGs. As referências JSON foram ajustadas para o diretório versionado; os bytes dos PNGs foram preservados.
- [`antes/`](UX-PRO-09E-evidencias-2026-10-16/antes/) — baseline original herdado da #260, preservado sem alteração para comparação reproduzível com seu after;
- [`correcao/`](UX-PRO-09E-evidencias-2026-10-16/correcao/) — after corrigido por rota, com PNGs e `resumo.json` por captura;
- [`correcao/contraste-revisao.json`](UX-PRO-09E-evidencias-2026-10-16/correcao/contraste-revisao.json) — 104 cruzamentos individuais, grupos 40/56, título inalterado e limites dos spans;
- [`correcao/resumo.json`](UX-PRO-09E-evidencias-2026-10-16/correcao/resumo.json) — resumo JSON agregado;
- [`correcao/integridade.json`](UX-PRO-09E-evidencias-2026-10-16/correcao/integridade.json) — SHA-256, dimensões e caminhos das 112 imagens herdadas de baseline e 112 after corrigidas.

O output after anterior da #260 permanece preservado na raiz da pasta de evidências como histórico e **não** é tratado como a visualização final do escopo. Nenhum PNG foi apagado. O teste focal compara referências `entries[].screenshot` com arquivos nos dois sentidos, valida dimensões IHDR e confere hashes do manifesto. Nas três rotas em escopo, pares day/night continuam byte-idênticos; nenhum tema sistêmico foi introduzido no público. A captura não enviou formulários. A rota de aceite com token sintético inválido mantém dois 404 de recursos por captura, já registrados como ruído fora do escopo.

## 4. Verificações executadas nesta branch corretiva

| Verificação | Resultado |
|---|---|
| Captura `ux-pro-09e` pós-retificação | `UX_EVIDENCE_EXIT: 0`; 112 capturas; PostgreSQL temporário removido (`UX_EVIDENCE_PG_TEMP_CLEANED: true`). |
| `npm test` / `npm run test:unit` | **956/956 passaram**, 0 falhas; inclui os sete testes 09E (crosswalk, captura própria, overflow e guardas de escopo). |
| `npm run typecheck` | Passou (`tsc --noEmit`). |
| `npm run build` | Passou; 105 páginas geradas. |
| `node scripts/qa-wave0-static.mjs` | **5/5** verificações. |
| `npm run test:ux-portal:pg` | **22/22**, `UX_PORTAL_TEST_EXIT: 0`; PostgreSQL temporário removido. |
| `npm run test:ai-rag-widget:pg` | **26/26**, `FECH01_RAG_WIDGET_TEST_EXIT: 0`; os três assistentes privados preservaram contraste/tema; PostgreSQL temporário removido. |
| `node scripts/ux-pro-00-inventory.mjs` + `--check` | Passaram após alteração em `src/app` e inclusão da captura própria. O diff foi revisado coluna a coluna: 10 rotas estáticas, apenas `capturas_stage` no inventário e `evidencia` na matriz, com os marcadores aditivos `ux-pro-09e-antes`/`ux-pro-09e-antes-visual`; nenhum campo/rota alheio mudou. Inventário: 100 rotas. |
| Evidência before/after | After: 112/112 PNGs referenciados, nenhum ausente/órfão; dimensões, SHA-256 e pares day/night validados. Before próprio: 112 viewport + 24 full-page, 136/136 PNGs com referências, dimensões e SHA-256 testados; overflow reproduzido em 320 px/day/night (343 px em contato, 347 px em FAQ). |
| `git diff --check` | Passou. |

Guardas finais: `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943`; `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23`. O primeiro foi restaurado após capturas/build/gates que o reescreveram.

## 5. Limites e resíduos

Esta retificação não altera API, formulário/lead, sessão, RBAC, autenticação, RAG privado, noindex, persistência, rotas, navegação, regras de domínio, os dez layouts/prévias (06 segue padrão) nem tema público. Não reimplementa 09A–09D, não toca na PR #234 e não remove branches ou evidências alheias.

PU4 (elementos e estados não amostrados), PU5 (especificidade dos estados ativo/concluído), PU6 (ruído de rota/preferência), os 968 fundos indeterminados e demais itens da fila permanecem sem correção nesta fatia. Nada aqui declara aceite humano, UAT ou conformidade WCAG. **Homologação e produção: NO-GO.**

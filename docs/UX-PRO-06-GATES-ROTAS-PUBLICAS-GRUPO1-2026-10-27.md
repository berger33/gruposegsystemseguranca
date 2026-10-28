# E6 / UX-PRO-06 — gates do grupo 1 de rotas públicas

**Data:** 27/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** 1 grupo de rotas, 1 PR (escopo local, sem commit/push). Continuação de [`UX-PRO-03-PROMOCAO-AMBIENTES-2026-10-27.md`](UX-PRO-03-PROMOCAO-AMBIENTES-2026-10-27.md).

## 1. Por que mudar de frente

Após quatro promoções seguidas de órfãos do `/admin/ti` pelo mesmo padrão, a frente de maior risco **ainda sem prova** era o item 9 / **E6**: o site público — justamente a superfície exposta — tinha **25/100 rotas sem gate automatizado** e **0/100 com validação manual/aceite humano registrado**. Como o usuário respondeu apenas "continuar", interpretei como autorização para usar julgamento na fila e comecei por um **grupo pequeno de 7 rotas**, mantendo a regra de uma fatia por grupo.

Grupo 1 (descoberta/conteúdo): `/servicos`, `/servicos/[id]`, `/segmentos`, `/segmentos/[key]`, `/conteudos`, `/conteudos/[slug]`, `/faq`.

## 2. Como a matriz reconhece um gate

`scripts/ux-pro-00-inventory.mjs` lê os filtros `paths:` dos workflows. Um filtro **preciso** (`src/app/servicos/**`) vira "gate de jornada" das rotas daquele prefixo; um filtro amplo (`src/**`) vira apenas baseline e não prova rota alguma. Portanto a fatia precisava de **workflow + gate de navegador real**, não só documentação — caso contrário a matriz seria maquiada.

Criei `.github/workflows/ux-public-routes-delivery.yml` com `paths:` precisos para os quatro diretórios, executando: `npm ci`, `npm audit --audit-level=moderate`, `typecheck`, a guarda focal, `ux-pro-00-inventory.mjs --check` e o gate PostgreSQL 17 + Chromium.

**Resultado na matriz regenerada:** 25 → **18 rotas sem gate**. As 18 restantes são `/`, as 11 prévias de layout (`/layout-01..10`, `/layout-preview`), `/orcamento`, `/pacotes`, `/privacidade`, `/proposta/aceite/[token]`, `/qa/modulos` e `/simulador`.

## 3. RED — o gate encontrou um defeito real de produção (corrigido)

Ao navegar, o teste esperava o `<h1>` com o nome do serviço e recebeu **"Serviço não encontrado"** em todos os 6 links da listagem. Investigação com log temporário no servidor mostrou uma inconsistência do **Next 16**:

| Função | `params.id` recebido | `findService` |
|---|---|---|
| `generateMetadata` | `"Segurança Desarmada"` (decodificado) | ✅ achou → `<title>` correto |
| componente da página | `"Seguran%C3%A7a%20Desarmada"` (**codificado**) | ❌ falhou → `<h1>Serviço não encontrado` |

Code points confirmaram: o componente recebia `37,67,51,...` (`%C3%...`) em vez de `231` (`ç`). Ou seja: **todos os links "Conhecer este serviço" do site público estavam quebrados**, enquanto o `<title>` sugeria que a página existia. É exatamente o tipo de defeito que a ausência de gate permitia persistir.

**Correção** (`src/app/servicos/[id]/page.tsx`): helper `decodeParam(value)` com `decodeURIComponent` e fallback seguro, aplicado nos **dois** pontos (`generateMetadata` e componente). Nenhuma rota, URL, catálogo, metadata ou contrato mudou — apenas a normalização do parâmetro. Um quarto teste da guarda focal congela essa correção.

## 4. O que o gate prova

`tests/ux-public-routes.integration.test.mjs` + `scripts/qa-ux-public-routes-postgres.mjs` (cluster PostgreSQL 17 descartável, 001–180, Chromium real) — **6 testes**:

1. **HTTP**: as 7 rotas respondem 200 e `/api/public/cms` está disponível.
2. **Responsividade + honestidade**: 320/390/768/1440 px × 7 rotas = 28 medições, zero transbordo horizontal, e `<meta name="robots" content="noindex, nofollow">` em todas (o site é prévia, não produção publicada).
3. **Teclado**: o primeiro `Tab` sai do `BODY` e chega a um controle interativo; `<details>` do FAQ abre com `Enter`.
4. **Estados de `/conteudos`**: vazio honesto ≠ falha de leitura; com `503` injetado apenas no `window.fetch` da página, aparece `role="alert"` com "Conteúdo indisponível no momento." e nenhuma publicação inventada; slug desconhecido mostra mensagem própria.
5. **Ids desconhecidos**: `/servicos/...` e `/segmentos/...` inexistentes devolvem página honesta com link de volta e **não oferecem orçamento** para algo que não existe.
6. **Links reais de serviço**: segue os 6 `href` da listagem e exige `<h1>` e `<title>` com o nome de cada serviço — a prova de regressão do defeito do item 3.

`tests/ux-public-routes-gate.test.mjs` (no `test:unit`) amarra workflow → matriz → gate → correção, e exige que restem exatamente **18** rotas sem gate (impede que a contagem piore sem decisão).

## 5. Evidências

| Verificação | Resultado |
|---|---|
| Guarda focal `tests/ux-public-routes-gate.test.mjs` | **RED 3/4 → GREEN 4/4** |
| Gate novo `test:ux-public-routes:pg` | **6/6**, 0 falhas |
| Gate do portal `test:ux-portal:pg` (regressão) | **40/40**, 0 falhas |
| `npm test` | **1092/1092**, 0 falhas/skips/todo (137 arquivos no `test:unit`) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / `ux-pro-00 --check` / `ux-pro-03 --check` | 5/5 / 100 rotas / 83 componentes, 4 promoções |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |
| `next-env.d.ts` / `tsconfig.json` | SHA `1862ac4b…` / `2128c956…` intactos |
| Workflows | 45 → **46** (novo com `paths:` precisos) |

**Incidência honesta:** uma das quatro execuções de `npm test` apresentou 1 falha isolada que **não se reproduziu** nas três seguintes (1092/1092). Mantém-se a flakiness **E9** em aberto; não foi afrouxado nenhum teste.

**Incidente de infraestrutura tratado:** o Chromium empacotado roda em `--single-process` e morre ao reaproveitar o browser entre contextos. O gate reestruturado abre **um browser por viewport/cenário**, mesma convenção do gate do portal. Uma execução morta por timeout chegou a contaminar `tsconfig.json`; os SHAs foram restaurados e conferidos ao final.

## 6. Limitações honestas

- **Ainda 0/100 com validação manual/aceite humano.** Este gate é prova automatizada; não substitui revisão humana nem UAT. A coluna `validacao manual`/`aceite humano` da matriz continua `nao_registrado` — não foi inventada.
- **Restam 18 rotas sem gate**, incluindo formulários expostos (`/orcamento`, `/simulador`) e `/proposta/aceite/[token]`. Cada grupo precisa de sua própria fatia.
- O gate mede `noindex` porque o sistema é **prévia/NO-GO**. Ele não publica, não indexa, não envia mensagem e não usa dado real.
- `/conteudos` foi provado com banco vazio e com falha injetada; não foi provado com conteúdo publicado real (não há conteúdo real autorizado).
- `/conteudos/[slug]` usa `useParams()` no cliente; a normalização de slugs acentuados não foi exercitada e segue como dívida a verificar no próximo grupo.
- Sem Windows real, leitor de tela ou aceite humano. **Produção: NO-GO.**

## 7. Próxima fatia

Grupo 2 sugerido (sem ordem declarada pelo proprietário): rotas de **conversão** — `/orcamento`, `/simulador`, `/pacotes`, `/privacidade`, `/proposta/aceite/[token]` — com o mesmo padrão: workflow de `paths:` precisos, gate PostgreSQL + Chromium, estados de erro/vazio, teclado, 4 larguras e correção RED→GREEN do que aparecer. Depois, o grupo das prévias de layout e `/`. Fila vigente: `docs/STATUS-VIGENTE.md`.

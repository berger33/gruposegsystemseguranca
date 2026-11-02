# Triagem das 4 PRs abertas — causa medida e remédio por PR (02/11/2026)

**Data:** 02/11/2026 · **Base medida:** `a0105d528e20e6ed83a5360b761550cfb3379e3e` (`main`, merge da **PR #336**) · **Branch da sessão:** `arena/2d86e921-gruposegsystemseguranca`.

**Natureza:** diagnóstico com **execução local**, mais porte do que prestava. **Nenhuma das 4 PRs foi mergeada.** Não é aceite humano, UAT, reauditoria integral nem autorização de produção — produção segue **NO-GO** e o aceite humano segue **0/222** (`docs/PRODUCAO-GATE.md`).

---

## 1. Por que medir local, não ler o CI

Os logs dos jobs vivem em `*.blob.core.windows.net`, **fora do allowlist de rede deste sandbox**: `gh run view --log-failed` e `gh api …/logs` retornam `EOF` (mediado nesta sessão — o `gh api` resolve o redirect para o blob e a conexão cai). Não há anotação de fallback: `…/annotations` responde **404** nos dois jobs vermelhos.

Então o vermelho de cada PR foi **reproduzido**, não lido: `git worktree` na cabeça da PR + `embedded-postgres` 17 descartável + Chromium, com `node_modules` reaproveitado do checkout principal. É mais caro e é melhor: mede a PR contra o `main` de hoje, não contra o log de 30/10.

Complemento estrutural que a API não dá: o clone da sessão era **shallow** (`git rev-parse --is-shallow-repository` = `true`, profundidade 1). Sem `git fetch --unshallow`, `git merge-base pr/N/head origin/main` devolve **vazio** e o `merge-tree` fala em "unrelated histories" — a PR parece impossível de fundir quando o que falta é histórico. As quatro bases reais abaixo só apareceram depois do unshallow.

## 2. O retrato medido

| PR | conteúdo | checks | aplica em `a0105d5`? | causa do vermelho |
|---|---|---|---|---|
| **#321** UX-PRO-06 vistoria | `InspectionClient.tsx` (+494) e `.module.css` novo, relatório, focal de 9 testes, +395 no gate do CRM | **45 pass / 0 fail** | **6 conflitos** | nenhum — está verde; só velha (50 commits) |
| **#308** RH reclamações | `RhWorkspace.tsx`, `SharedComplaints.*`, `employee-complaint-api.mjs`, `server.mjs`, teste do portal, relatório | **44 pass / 1 fail** | 6 conflitos | **intrínseco**: 19/20 reproduzido |
| **#310** docs ERP/Omie | 3 documentos (`.html`, `.md`, `.pdf`), zero código | **1 fail** | **aplica limpa** | inventário do 222 não regenerado |
| **#324** docs | `STATUS-VIGENTE.md` + relatório da mensuração de origem | **1 pass** | 1 conflito | base obsoleta (45 commits) |

O que o ledger dizia e era **falso** sobre esta linha: "#321 (1 check vermelho)" e "#310 (2 checks vermelhos)". #321 está 45/45; #310 tem 1 check e é docs-only. Reconciliado em `docs/STATUS-VIGENTE.md`.

## 3. Causa-raiz de cada vermelho

**#310 — a armadilha da contagem, não um defeito de conteúdo.** `node scripts/requisitos-222-inventory.mjs --check` na árvore dela responde **exit 1**: `arquivosVarridos` versionado **1.620**, regenerado **1.621**. Dos 3 arquivos que a PR acrescenta, **só o `.md` entra na varredura** (o gerador cobre `tests/`, `.github/workflows/`, `docs/`, `src/`, `scripts/` por extensão relevante; `.html` e `.pdf` não contam). Quem quebra é `tests/requisitos-222-inventory.test.mjs`, dentro do `npm test`, que derruba o `static-and-smoke`. Remédio: rodar o gerador e levar CSV+JSON junto — não há nada a consertar nos documentos.

**#308 — implementação paralela a uma que já mergeou.** O gate `ux-hr-postgres-browser` fechou **19/20, exit 1** aqui, em `tests/ux-hr-workspace.integration.test.mjs:290`: `'false' !== 'true'` na asserção de que `End` seleciona a última aba. Não é flake nem base velha: a PR acrescenta uma aba nova ao fim de `RhWorkspace.tsx` **sem atualizar o teste de teclado que fixa qual aba é a última**. E o `main` já tem a jornada, pela **#319**, com outros nomes: `SharedEmployeeComplaints.tsx` (não `SharedComplaints.tsx`) e id `reclamacoes-compartilhadas` (não `compartilhadas`), rótulo idêntico, mesma posição; no servidor, `is_shared_with_hr`, `hrMinimalProjection` e o `404` para não compartilhada já estão no `main`. **Mergear duplicaria aba e componente.** Veredito: **superseded**, como a #318.

**#324 — obsoleta por construção, com uma exceção viva.** Ela reconcilia a base para `3ebdef5…`, que era o topo em 31/10 e hoje está 45 commits atrás. A parte de `STATUS-VIGENTE.md` morreu (reescrita três vezes desde então). Mas **um** parágrafo do relatório dela nunca chegou ao `main`: o bloco **Entrega** de `docs/UX-PRO-06-METRICAS-ORIGEM-ESTADOS-2026-10-31.md`. Antes de copiar, os três hashes foram conferidos — `8c3048f` e `8e1a354` existem, e `gh pr view 323` responde `MERGED` com merge commit `3ebdef5…`. O parágrafo entrou nesta fatia com a fonte da dobra nomeada.

**#321 — verde e velha.** Nenhum vermelho a diagnosticar; o trabalho é a fundição: `package.json`, os dois inventários do 222, o CSV do UX-PRO-03, `STATUS-VIGENTE.md` e o gate do CRM.

## 4. O que foi feito com cada uma

**#321 portada inteira.** Conflitos resolvidos assim: `package.json` por **união programática** — a linha do `test:unit` é um vetor de ~10 KB impossível de emendar a olho; o script computou `theirs − base` (exatamente 1 arquivo, `tests/ux-pro-06-comercial-vistoria-estados.test.mjs`) e o inseriu ao lado do mesmo vizinho da lista da PR, sobre a lista atual do `main` (**179 → 180**), abortando se houvesse duplicação. O gate do CRM tinha **dois appends independentes no EOF** (o `main` somou os 2 casos de métricas da #323; a PR, os 5 de vistoria): `git apply` recusa porque a âncora de contexto não é mais o fim do arquivo, então o delta foi reaplicado como append, com os 7 helpers da PR checados contra o `main` (zero colisão de nome, zero colisão de título). Inventários e `STATUS-VIGENTE.md`: **não portados** — regenerados/refeitos nesta branch, que é a ordem correta.

**Prova do porte, não promessa:** `node scripts/qa-ux-crm-postgres.mjs` → **47/47, exit 0** em PostgreSQL 17 + Chromium (42 da base + os 5 novos, que são os casos 43–47 e rodaram no gate inteiro, não isolados) e o focal **9/9**. Uma PR portada só vale se o gate dela fechar contra o `main` de hoje.

**#310 portada inteira**, com os inventários regenerados por script e o §2 do relatório corrigido (**1.719 → 1.725** com este documento; as classes não mudaram: **27 / 124 / 71**, núcleo **12**).

**#308: o relatório entrou, o código não.** `docs/UX-PRO-RH-RECLAMACOES-COMPARTILHADAS-2026-10-29.md` foi recebido sob cabeçalho que declara que **nenhuma linha dele foi mergeada**, tabela do que o `main` tem de diferente e aviso explícito de que `EXPECTED_TABS 23` / `PROMOCOES_COM_PROVA 10` do texto são da base `d9d011c` e valem hoje **32 / 19** (órfãos 27). Fica como registro da **decisão de produto** — rejeitar o `PATCH` legado, compartilhamento mínimo, fronteira de não-vazamento — não como descrição do sistema.

**#324: parágrafo dobrado.** Ver §3.

**As 4 PRs originais continuam abertas nesta sessão.** Nada foi fechado por esta linha: o conteúdo portado ainda não está no `main` enquanto esta PR não merger, e fechar antes disso seria apagar a única cópia. **#308 e #324 estão autorizadas para fechar como superseded** (decisão do dono nesta sessão) e **#321 e #310** ficam com o dono, já que o porte delas depende do merge daqui.

## 5. O que isto não é

Nenhum aceite humano registrado (**0/222**), nenhuma reauditoria integral, nenhuma promoção de requisito para "entregue". Nenhuma migração foi editada ou apagada (`001–182` intactas; a **183** é aditiva e é o outro commit desta branch). `server.mjs` intocado — 6.310 linhas, sha `c42a7ef6757014d8…`, o catálogo do E15 continua batendo sem regeneração. As 5 remoções sombreadas **decididas na #336 continuam sem execução**: triagem não é autorização.

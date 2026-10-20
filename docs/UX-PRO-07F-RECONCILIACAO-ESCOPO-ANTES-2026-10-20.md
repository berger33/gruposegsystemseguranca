# UX-PRO-07F — reconciliação do ESCOPO-ANTES solicitado em 20/10/2026

**Data da sessão:** 2026-10-20 · **Base:** `origin/main` = `72648d1d018656b820d027ae5543482ffdd4b6b5` (merge da PR #279).
**Natureza:** registro de reconciliação histórica. Documento **somente leitura**: nenhuma tela, API, estilo, contrato, teste ou workflow foi alterado para produzi-lo.

## 0. Procedência deste documento

A versão original deste registro foi escrita na sessão de 20/10/2026, em espaço de trabalho efêmero, e **não chegou a ser commitada nem enviada a nenhum branch remoto**; ela não existe em `origin/main` nem no branch da sessão anterior (`arena/ba5b4de6-…`, verificado via `git ls-tree`). Este texto é uma **reconstrução fiel** do registro perdido, e cada fato abaixo foi **revalidado por API do GitHub na mesma data** (`gh pr view` / `gh api`), sem depender de memória de sessão.

## 1. Decisão do proprietário que originou a consulta

- **Q1:** único item da sessão = `UX-PRO-07F` (`/admin/frota`), a próxima rota canônica do cronograma.
- **Q2:** autorizado `ESCOPO-ANTES` medido + subfatia de leitura honesta `07F`, com verificação prévia de `git log` para saber se `07F-1` já estava em `main`.
- **Q3:** se houvesse impacto visual (CSS/layout/contraste), capturas comparativas dia/noite nos quatro viewports canônicos (320/390/768/1440) seriam obrigatórias antes do merge.

## 2. Achado central: a fatia já estava entregue

A consulta ao histórico mostrou que **não havia reparo a fazer**: a sequência canônica já constava integralmente em `main` desde 15/10/2026.

### 2.1. UX-PRO-07F (`/admin/frota`) — PR #236, MERGED

| Dado | Valor revalidado |
|---|---|
| PR | [#236](https://github.com/berger33/gruposegsystemseguranca/pull/236) — "UX-PRO-07F: leituras honestas em /admin/frota" |
| Merge | `00142f1a3` em 2026-10-15T16:14:23Z |
| Evidências locais versionadas | `docs/UX-PRO-07F-ESCOPO-ANTES-2026-10-15.md`, `docs/UX-PRO-07F-RELATORIO-2026-10-15.md` |

O escopo prévio de 15/10 já havia medido na base os defeitos F1 (2xx malformado virava vazio falso), F2 (releitura descartava o dado sem hora da última leitura) e F3 (negativa indistinguível de falha transitória), e o relatório registra o reparo entregue (`fleetRead` validado em `src/lib/fleet-request.ts`, `Load<T>` com `readAt`/`refreshing`/`staleError`, fail-closed em 401/403) com gate focal `npm run test:ux-fleet:pg` em 13/13. As "leituras honestas" que a decisão Q2 mandava produzir **já são o conteúdo mergeado da PR #236**.

### 2.2. UX-PRO-07F-1 é outro objeto: `/admin/financeiro`, não frota — PR #235, MERGED

| Dado | Valor revalidado |
|---|---|
| PR | [#235](https://github.com/berger33/gruposegsystemseguranca/pull/235) — "UX-PRO-07F-1 — datas e fuso em /admin/financeiro (DD/MM/AAAA, MM/AAAA e carimbo UTC declarado)" |
| Merge | `78244a949` em 2026-10-15T16:25:59Z |
| Evidências locais versionadas | `docs/UX-PRO-07F-1-ESCOPO-ANTES-2026-10-15.md`, `docs/UX-PRO-07F-1-RELATORIO-2026-10-15.md` |

A semelhança de código é apenas nominal: `07F-1` pertence ao **financeiro** e trata de datas/fuso; `07F` pertence à **frota** e trata de estados honestos de leitura. A dúvida do Q2 ("`07F-1` já está em `main`?") fica respondida: sim, mas ela não autoriza nem substitui nada em frota — e a própria fatia de frota também já estava mergeada.

### 2.3. Sequência 07G–07M: toda em `main` (PRs #237–#243)

| Fatia | Rota / tema | PR | Merge (2026-10-15) |
|---|---|---|---|
| 07G | `/admin/terceiros` | [#237](https://github.com/berger33/gruposegsystemseguranca/pull/237) | `1c6fa037d` · 16:20:35Z |
| 07H | `/admin/licitacoes` | [#238](https://github.com/berger33/gruposegsystemseguranca/pull/238) | `3047a0c61` · 16:30:35Z |
| 07I | `/admin/qualidade` | [#239](https://github.com/berger33/gruposegsystemseguranca/pull/239) | `18015c2f6` · 16:41:04Z |
| 07J | `/admin/satisfacao` | [#240](https://github.com/berger33/gruposegsystemseguranca/pull/240) | `e0ad92967` · 16:46:39Z |
| 07K | `/admin/compliance` | [#241](https://github.com/berger33/gruposegsystemseguranca/pull/241) | `600b4258e` · 16:55:38Z |
| 07L | `/admin/continuidade` | [#242](https://github.com/berger33/gruposegsystemseguranca/pull/242) | `239afd30d` · 17:10:19Z |
| 07M | fecha a classe D1 em contratos (auditoria de preservação) | [#243](https://github.com/berger33/gruposegsystemseguranca/pull/243) | `9c6570488` · 17:20:16Z |

Todas as nove PRs (#235–#243) constam **MERGED** na API do GitHub. O cronograma UX-PRO-07F→07M, usado como referência na fila, já está completo em `main`; não há próxima rota canônica inédita nesse intervalo.

## 3. Consequências e postura adotada

1. **Nenhum reparo foi repetido.** Reexecutar `07F` (ou qualquer fatia 07G–07M) criaria trabalho duplicado e arriscaria alterar comportamento já entregue e testado, em desacordo com o AGENTS.md ("não remova, desative, substitua, oculte, renomeie ou reduza nenhuma funcionalidade existente por iniciativa própria").
2. **Nenhuma subfatia nova foi escolhida por iniciativa do agente.** A fila de resíduos segue exigindo decisão explícita do proprietário, um item por sessão.
3. **Não houve impacto visual**, logo a exigência de capturas dia/noite (Q3) não se ativou — nada foi renderizado ou estilizado.
4. O que este documento entrega é a **prova histórica** (PRs, commits de merge, datas e evidências versionadas) de que o trabalho já existe, evitando regressão por reexecução.

## 4. Verificações executadas nesta sessão

- `gh pr view 235..243` (uma a uma): estado `MERGED`, título, data e OID de merge — tabelas acima.
- `git ls-tree` em `origin/main` e no branch remoto da sessão anterior: confirmação de que os documentos de 15/10 estão versionados e de que o arquivo original de 20/10 não existe em nenhum ref remoto.
- Guardas locais: `npm ci` (exit 0), `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `git diff --check` e MD5 de `next-env.d.ts`/`tsconfig.json` — resultados registrados no relato da sessão; nenhum código de produto tocado.

## 5. Limitações

- Isto é uma reconciliação de histórico, **não** uma revalidação funcional das jornadas 07F–07M: os testes e gates dessas fatias não foram reexecutados aqui; a evidência vigente continua sendo a das PRs e dos relatórios de 15/10.
- Não há aceite humano, UAT ou declaração de conformidade WCAG neste documento.

**Homologação/Produção: NO-GO.**

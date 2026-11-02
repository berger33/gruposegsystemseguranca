# Integração do E16 (PR #318) e reconciliação do ledger — 02/11/2026

**Data:** 02/11/2026 (America/Sao_Paulo)
**Merge commit da integração:** `1f6c0ea` — pais `e1b3303` (merge da PR #332 em `main`) e `3ea54e3` (head da PR #318)
**Branch desta sessão:** `arena/4937c125-gruposegsystemseguranca`
**PR aberta a partir dela:** #333
**Natureza:** integração + reconciliação documental. **Não** abre fatia funcional nova, **não** altera 001–181, **não** declara aceite humano, homologação, UAT nem prontidão de produção. **Produção continua NO-GO.**

> Este documento é o relatório datado desta entrega. Estado corrente: [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md). Fila por fatia: [`AUDITORIA-PENDENCIAS-2026-11-02.md`](AUDITORIA-PENDENCIAS-2026-11-02.md).

---

## 1. Por que a PR #318 não pôde ser mergeada como PR

| Medição | Resultado |
|---|---|
| `gh pr view 318 --json mergeable,mergeStateStatus` | `CONFLICTING` / `DIRTY` |
| base da #318 | `6303213` (merge da #317) — **40 commits atrás** de `e1b3303` (#332) |
| `gh pr checks 318` | **45/45 `pass`**, mas runs de **30/10**, sobre a base velha |
| `PUT /pulls/318/update-branch` | **422 `merge conflict between base and head`** |
| `gh pr update-branch` | comando **inexistente** na versão do CLI deste ambiente |

Merge local de `main` na #318 → **4 conflitos**. Como esta sessão só pode commitar/pushar na própria
branch, a saída foi integrar a #318 **por merge commit** aqui (`1f6c0ea`), preservando a ancestralidade
dos dois commits da fatia, e fechar a #318 como **superseded**.

### 1.1 Conflitos e como foram resolvidos

| Arquivo | Resolução |
|---|---|
| `docs/REQUISITOS-222-INVENTARIO-2026-10-27.json` | **regenerado por script** (`node scripts/requisitos-222-inventory.mjs`) sobre a árvore pós-#330/#331/#332 |
| `docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md` | idem (mesmo gerador/`--check`) |
| `package.json` | **união**: lista do `test:unit` do `main` **+** `tests/e16-durable-scheduler.test.mjs` (**178** arquivos), preservando `test:durable-scheduler:pg` (E16) e `test:plt01/plt06/plt09/plt12:pg` (#330/#332) |
| `docs/STATUS-VIGENTE.md` | merge manual; base passa a `1f6c0ea` |

Nenhum arquivo gerado foi editado à mão.

---

## 2. Migração 182 — aditiva, 001–181 intocadas

`db/migrations/182-plat-durable-jobs-ledger.sql` cria **apenas** `durable_jobs` (fila de intenção
persistida): `job_key` único, `slot` de idempotência, `lease_until` + `claim_token` (fencing token),
`attempts`/`consecutive_failures` para backoff exponencial com teto, guarda
`max_backoff_seconds >= lease_seconds`, dois índices parciais **sem `NOW()`** no predicado
(predicado parcial exige expressão `IMMUTABLE`), função/trigger de `updated_at` e `COMMENT`s.

**Não há `ALTER`, `UPDATE`, seed retroativo nem reescrita de 001–181.** O ledger append-only da 156
(`ext_compliance_evaluation_runs`) permanece intocado: as duas naturezas não dividem tabela.

`scripts/qa-wave0-static.mjs` já vinha com `latestMigration = 182` e o arquivo já constava da lista de
`scripts/migrate-site-visual.mjs` — nada disso precisou ser refeito nesta reconciliação.

Fronteira declarada: `EXT07_SCHEDULER_MODE=in-process` continua sendo o **padrão**; `durable` **recusa
ligar sem a 182** (`durable_jobs_schema_missing`) em vez de cair para o timer. Não envia nada a
provedor algum e não depende de cron do sistema.

---

## 3. RED → GREEN: o que a integração quebrou e como foi corrigido

O primeiro `plt-gates-postgres` da PR #333 ficou **vermelho**: três gates de PLT (criados pela #330/#332,
**depois** de a #318 ter sido escrita e validada em 30/10) fixavam a contagem de migrações em **181**.
Com a 182 entrando no ledger, `182 !== 181`. O CI parou no primeiro gate (PLT-06) e **pulou** PLT-09 e
PLT-12 — que falhariam pelo mesmo motivo, como a medição local abaixo confirma.

Nenhuma asserção foi reduzida, nenhum skip foi introduzido e nenhum inventário foi editado à mão: só a
expectativa **de número de migrações** passou de 181 para 182 (e a "próxima livre" de 182 para 183).

| Gate (PostgreSQL 17 descartável) | Antes (RED medido) | Depois (GREEN medido) |
|---|---|---|
| `npm run test:plt06-observability:pg` | **22/23** — `182 !== 181` em `tests/plt06-observability-read-contract.integration.test.mjs:46` | **23/23** |
| `npm run test:plt09-privacy:pg` | **27/28** — mesma causa | **28/28** |
| `npm run test:plt12-incidents:pg` | **19/20** — mesma causa (19 também abaixo do mínimo de 20 casos) | **20/20** |

Arquivos tocados: os três `tests/plt{06,09,12}-*.integration.test.mjs` (rótulo do caso, contagem e
regex da última migração) e o comentário de cabeçalho dos quatro `scripts/qa-plt*-postgres.mjs`
(*"migrações 001–181"* → *"001–182"*). Zero mudança de comportamento de produto.

---

## 4. Evidência medida nesta árvore (02/11/2026)

| Comando | Resultado |
|---|---|
| `npm test` | **1.488/1.488** (1.442 do `main` pós-#332 + 46 do E16) |
| `node scripts/qa-wave0-static.mjs` | **5/5** — 001–182 contínuas, únicas e registradas no migrador |
| `npm run test:pglite-schema` | **19/19** — 182 migrações, 581 tabelas de conteúdo, 2º boot sem reaplicar |
| `npm run test:migrations:pg` | **182/182** em dois passes, **582** tabelas, checksum negativo rejeitado sem rebaseline |
| `npm run test:durable-scheduler:pg` | **11/11** — SIGKILL no meio do lease, retomada do mesmo intervalo exatamente uma vez, backoff, um dono entre três concorrentes, controle negativo |
| `npm run test:plt06/09/12…:pg` | **23/23**, **28/28**, **20/20** |
| `npm run typecheck` | exit 0 |
| `npm run build` | ok |
| `node scripts/{requisitos-222,ux-pro-00,ux-pro-03-ti,ux-pro-10b-contrast}-inventory.mjs --check` | **4/4 OK**, inventários regenerados por script |

Os gates de PostgreSQL rodaram em cluster **descartável** (`embedded-postgres`, porta livre, dados
fictícios). Nenhum banco do operador foi tocado, nenhum dado real, nenhum provedor, nenhum upload.

---

## 5. Reconciliação do ledger (o que estava desatualizado)

| Documento | Ajuste |
|---|---|
| `docs/STATUS-VIGENTE.md` | base `1f6c0ea` + branch da sessão; nova "Atualização corrente" do E16; §1 com **001–182 / próxima 183**, 582 tabelas, 246/178 arquivos, `npm test` 1.488/1.488, PGlite 19/19; ledger de PRs com a #318 integrada/superseded |
| `docs/AUDITORIA-PENDENCIAS-2026-11-02.md` | C4/E16 e a linha da #318 na tabela §8 → "fechado na integração de 02/11"; N6, §11.10 e §13.5/§13.6 atualizados — §13.6 registra que **PLT-09 saiu da fila** e restam **EXT-16/EXT-17** e **AI-01..AI-10**, ambas **bloqueadas**; fotografia física e veredito re-medidos |
| `docs/PLT-09-PRIVACIDADE-2026-11-02.md` §5 | onde se lia "próxima livre 182", passa a registrar que a **182 é do E16** e a próxima livre é **183** |
| `docs/PLT-06-OBSERVABILIDADE-JORNADA-RBAC-GATE-2026-11-02.md` | dívida do `CHECK` de `auth_access_audit` deixa de apontar a 182 (consumida) e aponta a **183**, se autorizada |
| `docs/CHECKLIST-ENTREGA-LOCAL.md` | idem, nas duas ocorrências |
| `docs/CONTROLE-IMPLEMENTACAO.md` | **sem alteração**: `grep -n "182[^5]"` não encontra referência a migração 182 nesse arquivo (só números como `1825`) |

Inventários: **regenerados por script, nunca à mão**. O gerador conta o próprio relatório entre os
arquivos varridos — por isso a ordem foi: escrever este documento → rodar o gerador → ajustar o número
no §2 de `docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md` → rodar os quatro `--check` → `npm test`.

---

## 6. Limites (inalterados por esta entrega)

- **Aceite humano: 0/222. Reauditoria integral: 0/222. Produção: NO-GO.**
- **N7 intocada**: `server.mjs:1229` mantém `mailer: null` — a fila de notificações do console não envia
  e-mail. É decisão do dono, não foi "consertada de passagem" nesta reconciliação.
- Console **esgotado** para promoção de aba (32 abas, 19 promoções, 27 órfãs): `TiConsole.tsx` não foi tocado.
- Borda legada de RH (`authorizeLegacyHrRequest` / `employees.read`) não foi aberta; nenhuma superfície viva
  foi substituída.
- **Nenhuma migração 183 foi criada.** Ela exige autorização expressa.
- PRs #321, #308, #310 e #324 seguem abertas, sem merge, sem fechamento e sem reescrita nesta sessão.
- Sem provedor, sem envio, sem upload, sem dados reais, sem produção, sem Tailscale/Funnel.

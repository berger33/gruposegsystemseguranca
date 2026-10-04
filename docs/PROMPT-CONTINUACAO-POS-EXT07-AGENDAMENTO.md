# Prompt de continuação — gruposegsystemseguranca (pós EXT-07 agendamento)

> Cole o conteúdo abaixo como primeira mensagem da nova sessão.

---

## Contexto

Repo: `berger33/gruposegsystemseguranca` (Next.js + server.mjs Node). Trabalhe **exclusivamente** na branch Arena que a nova sessão criar/rastrear — nunca em outra branch.

Camadas já mescladas no main:

- PR #113 (merge `cda0c18`): migração 154 — constraints NOT VALID.
- PR #115 (merge `8c4d71a`, head `bd96d3f`): migração 155 + API canônica EXT-07 + gate HTTP real.
- PR #118 (merge `150052e`, head `f306dc6`): PLAT-01, despacho HTTP endurecido (`src/server/route-dispatch.mjs`).
- **PR #119** (branch `arena/01a104d5-gruposegsystemseguranca`): EXT-07 **execução agendada** da avaliação temporal — migração 156 + agendador in-process opt-in.

## O que esta entrega entrega (não refazer)

**Pendência resolvida.** A avaliação temporal do EXT-07 era somente operação administrativa explícita (`POST /api/ext/compliance/evaluate`). Probe antes de implementar (cluster descartável, script apagado): estado idêntico após 12 s com servidor de pé — 0 tarefas para o vencido, antecedência não marcada, obrigação pendente. Agora o servidor avalia sozinho.

**Ativação (decisão do proprietário).** Opt-in por ambiente: `EXT07_EVALUATE_INTERVAL_SECONDS` (inteiro ≥ 1; ausente/inválido = desligado) + `EXT07_EVALUATE_IDENTITY` (UUID de identidade staff **admin/ti ativa** em cujo nome a automação age). Sem `DATABASE_URL` o agendador recusa ligar (PGlite beta não tem o schema EXT-07). Padrão: desligado — sem ambiente configurado, comportamento idêntico ao anterior.

**Código.**

- `src/server/ext-compliance-scheduler.mjs` (novo): `parseSchedulerConfig`, `runScheduledEvaluationOnce` (BEGIN → `pg_try_advisory_xact_lock('ext07:scheduler')` → revalida identidade → núcleo → evento do dia com `ON CONFLICT DO NOTHING` → audit_log → run `concluida` → COMMIT; qualquer falha → rollback + run `falha` em transação própria, best-effort), `startExtComplianceScheduler` (timer com `unref`, **primeiro tick imediato**, flag anti-sobreposição, tick sob `dispatchGuarded` — nenhuma rejeição escapa para o timer).
- `src/server/ext-compliance-api.mjs`: núcleo `runExpiryEvaluation(client,{actorIdentityId})` extraído por dedent programático do corpo de `evaluate` (mesmo código para HTTP e agendador; **nenhum contrato HTTP alterado**); `isActiveStaffIdentity` exportada; nova rota `GET /api/ext/compliance/schedule` (staff autorizada: estado do agendador deste processo + ledger; `enabled` reflete o processo, o ledger é do banco); nota da resposta de `evaluate` atualizada.
- `db/migrations/156-ext07-scheduled-evaluation.sql` (aditiva): `ext_compliance_evaluation_runs` — uma linha por execução que rodou (`concluida` inclusive sem efeito, ou `falha` com causa); **append-only** por trigger; sem seed/UPDATE retroativo. Evento `expiry_evaluated` gravado 1×/dia/ator com chave `agendada:YYYY-MM-DD`.
- `server.mjs`: import + handle/`schedulerState` + boot **após** `installProcessSafetyNet()` e `server.listen`, com logs de recusa explícitos.
- Quatro pontos de migração atualizados (migrador files[]/length/mensagens, `qa-wave0-static` latestMigration=**156**); `package.json` test:unit inclui a suíte nova; `MINIMUM_CASES` do gate EXT-07 35→**41**; workflow `ext07-delivery.yml` com paths/passos novos; bateria `qa-evidence-report` com focal `focal-ext07-agendamento` e títulos 001–156.

**Semântica importante.** Identidade declarada é revalidada **a cada tick**: suspensa/desativada → run `falha` com a causa e **zero mutação**; reativada → retomada automática (as tarefas pendentes surgem no tick seguinte). Falha de `audit_log` reverte a execução inteira. Tick pulado por lock concorrente não grava linha (o vão + logs são a evidência). Nenhum NOT NULL relaxado; nenhuma identidade sintética; toda tarefa/evento tem `created_by_identity` = identidade declarada.

**Testes.** `tests/ext-compliance-scheduler.test.mjs` (20: config, migração, tick completo por fake pool, conflito diário, identidade inválida, lock, auditoria, núcleo falho, ator malformado, falha do registro, timer/unref/imediato, sobreposição, guardas estáticas de server.mjs e do módulo, rota de observação 401/403/200). `tests/ext07-compliance.integration.test.mjs` +6 cenários com **segundo servidor real** bootado com o agendador ligado (intervalo 2 s, identidade ti2): desligado por padrão + rota; avaliação sozinha (tarefa atribuída à identidade declarada, `a_vencer`, obrigação derivada, run `concluida`, evento do dia); ticks repetidos sem duplicar; suspensa → `falha`/zero mutação; retomada; append-only no banco. **Guardas provadas por mutação** (agendador antes do safety net; nota regredida; tick sem guard) — todas reprovaram; restauração conferida por `sha256sum -c`.

**Validação exata (evidência `docs/evidencias/qa-evidencia-2026-10-04-ext07-agendamento.{pdf,json}`):** 14/14 passos, **718 asserções TAP, zero fail/skip/todo/cancelled**; npm ci 0 vuln; wave 0 5/5 (001–156); typecheck; focal PLAT-01 25/25; focal EXT-07 19/19; focal agendamento 20/20; `npm test` 514/514; build 92 páginas com `/admin/compliance`; `test:migrations:pg` 156/156 ×2 + clone negativo (562 tabelas); `test:ext07-compliance:pg` **43/43**; cortesia de vizinhança EXT-06 36/36, EXT-05 33/33, EXT-04 28/28; `git diff --check` limpo.

## Passo zero da nova sessão (antes de qualquer trabalho)

1. `git fetch origin main`; confirmar que o main contém o merge da PR #119 (`gh pr view 119` ou `git log origin/main`).
2. Conferir HEAD = origin/main = merge-base; árvore limpa; **156 migrações; próxima livre: 157**.
3. **Perguntar ao usuário qual é a tarefa antes de implementar qualquer coisa.**

## Pendências documentadas (candidatos de continuação)

- **Aplicar migrações em banco de destino / validação no ambiente real do operador** — agora incluindo a decisão operacional de intervalo (`EXT07_EVALUATE_INTERVAL_SECONDS`) e da identidade declarada (`EXT07_EVALUATE_IDENTITY`), e o acompanhamento inicial do ledger `ext_compliance_evaluation_runs`.
- **Aceite humano e validação em Windows.**
- (Baixa prioridade, cosmético) Rótulo de erro por módulo nos 14 despachos de segundo nível — já cobertos pelo guard do topo desde o PLAT-01.

## Restrições permanentes (manter)

- Exclusivamente na branch Arena da sessão; nunca criar/trocar/enviar outras.
- Migrações 001–156 intocáveis; novas somente aditivas (arquivo único, NOT VALID quando necessário, ::text em comparações de enum, sem seed/UPDATE retroativo).
- Sem dados reais, SMTP real, armazenamento externo real; não inventar integrações regulatórias, ator externo, upload, bytes, checksum, malware scan, armazenamento verificado, download ou aceite humano. O agendador NÃO é ator externo: age em nome de identidade staff real declarada por ambiente.
- Fronteira documental do EXT-07: referência declarada e privada; aplicabilidade é declaração interna, não validação jurídica.
- Não remover `src/app/admin/ti/ExtAdvancedClient.tsx` nem handlers EXT-08..12.
- Probe obrigatório antes de implementar; temporários do probe apagados; nunca banco real.
- Gates falham (não pulam) se PostgreSQL indisponível; nunca reduzir asserções para passar.
- Sem auto-merge; merge somente com autorização explícita do usuário.
- Não apresentar a bateria pesada integral como necessária, salvo decisão expressa do usuário.

## Armadilhas técnicas conhecidas (economizam horas)

- **Teste de guarda sem prova negativa é decoração.** Mutar o código, confirmar que o teste reprova, restaurar e conferir por `sha256sum -c`. Nesta sessão: três mutações provadas; uma reversão de mutação quase deixou newline extra no server.mjs — sempre re-conferir checksum após restaurar.
- `edit_file`/`str.replace` às vezes não casam a âncora e falham **em silêncio** — ocorreu de novo nesta sessão (edição "bem-sucedida" não aplicada). Em edição crítica, `python3` inline com `assert s.count(ancora)==1` e conferir com `grep` depois.
- Guarda estática que procura antipadrão precisa remover comentários antes de varrer (`semComentarios` em `route-dispatch-guard.test.mjs`).
- `next-env.d.ts` e `tsconfig.json` são modificados por build/dev e **pelo próprio gate EXT-07** (servidores dev) — `git checkout --` antes de commitar.
- YAML de workflow: validar com parser (pyyaml em venv; chave `on` vira booleano em YAML 1.1); cada item de `paths` é um escalar único.
- PR `CONFLICTING` não dispara workflows `pull_request` — resolver conflito primeiro.
- `auth_identities.status` só `pending_email|active|suspended|disabled`; `auth_staff_profiles.role` só `admin|ti|rh|marcelo`.
- Driver `pg` devolve Date com fuso — usar `to_char(col,'YYYY-MM-DD')` em asserções de data.
- Ao adicionar migração: atualizar os **quatro pontos** — `files[]` em `scripts/migrate-site-visual.mjs`, a checagem `files.length !== N`, a mensagem/log "001–N" e `latestMigration` em `scripts/qa-wave0-static.mjs`; conferir paths do workflow correspondente (`qa-migrations-postgres.mjs` deriva a contagem dinamicamente).
- Gates descartáveis: recusam `DATABASE_URL`/`DATABASE_MIGRATION_URL` herdadas (comportamento correto).
- O gate EXT-07 agora sobe **dois** servidores dev (principal + agendador com `NEXT_DIST_DIR` próprio). Asserções de tempo usam `waitFor` com deadline, nunca sleep fixo.
- Para conferir PDF no sandbox: `python3 -m venv /tmp/pdfvenv && /tmp/pdfvenv/bin/pip install pymupdf`. Ferramenta DE SANDBOX, nunca dependência do repo.
- Bateria integral ~2 min 11 s nesta máquina (evidência 14 passos). Cada gate PG ~16–28 s.

## Referências de gate existentes

`scripts/qa-ext07-compliance-postgres.mjs` (43/43, MINIMUM_CASES 41), `qa-ext06-satisfaction-postgres.mjs`, `qa-ext05-quality-postgres.mjs`, `qa-ext04-suppliers-postgres.mjs`, `qa-migrations-postgres.mjs`. Scripts npm: `test:ext07-compliance:pg`, `test:ext06-satisfaction:pg`, `test:ext05-quality:pg`, `test:ext04-suppliers:pg`, `test:migrations:pg`, `qa:evidence`.

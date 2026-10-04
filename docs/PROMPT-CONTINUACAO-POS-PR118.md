# Prompt de continuação — gruposegsystemseguranca (pós-PLAT-01 / PR #118 mesclada)

> Cole o conteúdo abaixo como primeira mensagem da nova sessão.

---

## Contexto

Repo: `berger33/gruposegsystemseguranca` (Next.js + `server.mjs` Node). Trabalhe **exclusivamente** na branch Arena que a nova sessão criar/rastrear — nunca em outra branch.

Três camadas já mescladas no `main`:

- **PR #113** (merge `cda0c18`): migração 154 — constraints `NOT VALID`.
- **PR #115** (merge `8c4d71a`, head `bd96d3f`): migração 155 + API canônica EXT-07 reescrita + gate HTTP real + rota `/api/ext/compliance/` registrada em `API_PATH_MATCH`.
- **PR #118** (PLAT-01, esta entrega): endurecimento do despacho HTTP. **Sem migração nova.**

## O que a PR #118 entrega (não refazer)

**Defeito corrigido.** `routeApi` despachava 677 handlers com `try { return handler(req,res) } catch`. Em função assíncrona, `return <promise>` dentro de `try` não é aguardado, então o `catch` nunca via a rejeição. Consequências medidas em probe antes de alterar qualquer linha:

1. requisição sem resposta até o timeout do cliente;
2. a rejeição subia ao callback `async` de `createServer` e virava `unhandledRejection` — não existia listener em lugar nenhum do código, e o padrão do Node **encerrava o processo**: uma requisição não autenticada derrubava o servidor inteiro;
3. o `finally` de observabilidade rodava antes do handler terminar e gravava `status 200`, `duration_ms` ~0 e `error: null` para requisições que falharam.

| Rota sintética do probe | Antes | Depois |
|---|---|---|
| `/async-reject` | sem resposta; cliente abortou em 2503 ms; processo `exit 1` | HTTP 500 em 13 ms; processo vivo |
| `/reject-apos-headers` | pendurado 2505 ms | encerrado em 13 ms |
| Ledger | `200 / 0 ms / error null` | status, duração e erro reais |

**Código.**

- `src/server/route-dispatch.mjs` (novo, autocontido — sem banco, rede, Next ou qualquer `import`): `dispatchGuarded` (await + desfecho estruturado `ok`/`failed_closed`/`failed_after_headers`/`failed_unreported`), `guardedRequestHandler`, `installProcessSafetyNet`.
- Fail-closed: 500 com corpo mínimo (`error`, `request_id`) que **não** vaza mensagem, stack, SQL ou nome de tabela.
- Resposta **parcial** é encerrada via `destroySoon`; resposta **íntegra** que falha depois do `end` **não** tem o socket tocado (destruí-lo truncaria bytes em buffer — há teste HTTP real com ~360 KB).
- `server.mjs`: `routeApi` executa o corpo de rotas sob o guard (as 677 rotas preservadas; diff de **+37/−6**); o callback de `createServer` também é guardado, cobrindo `seoTechnicalApi.resolveRedirect` e o handler do Next; `installProcessSafetyNet()` antes de servir.
- Nenhum contrato de API alterado; nenhuma migração nova (001–155 intocadas).

**Testes.** `tests/route-dispatch.test.mjs` (18, unitário + HTTP real em porta efêmera: rajada de 25 falhas, integridade de corpo grande, zero `unhandledRejection`); `tests/route-dispatch-guard.test.mjs` (7, guarda estática sobre `server.mjs`, no estilo de `staff-session-await-guard`); `tests/qa-evidence-report.test.mjs` (12, valida o próprio artefato de evidência).

**Ferramenta de evidência.** `npm run qa:evidence` → `scripts/qa-evidence-report.mjs` executa a bateria declarada e emite PDF paginado + ledger JSON + logs. Gerador próprio em `scripts/lib/pdf-report.mjs`, **sem dependência nova** (segue o padrão artesanal de `src/server/proposal-api.mjs`; sem Chromium, sem rede). Flags: `--list`, `--only=`, `--skip=`, `--rotulo=`, `--slug=`, `--from-ledger=` (re-renderiza sem reexecutar). Seções narrativas opcionais vêm de `docs/evidencias/<slug>.secoes.json`. Critério: saída 0 e, sob `node:test`, zero fail/skip/todo/cancelled.

**CI.** `.github/workflows/plat01-dispatch.yml` (`on: pull_request` + `paths`): `npm ci` → wave 0 → bateria leve via `qa-evidence-report` → publica PDF/ledger/logs como artefato com `if: always()`.

**Docs.** `docs/ENTREGA-RELATORIO-2026-10-03-PLAT01-DESPACHO-HTTP.md`; atualizados `ESTADO-EXECUCAO-LOCAL`, `CONTROLE-IMPLEMENTACAO`, `CHECKLIST-ENTREGA-LOCAL`, `EVIDENCIAS-ENTREGA-LOCAL`. Evidência versionada em `docs/evidencias/qa-evidencia-2026-10-03-plat01-despacho-http.{pdf,json}`.

## Resultados exatos da validação (commit `1dae8db`)

13/13 passos, **672 asserções, zero skip/todo**: npm ci 0 vulnerabilidades; wave 0 5/5 (001–155); typecheck; focal PLAT-01 25/25; focal EXT-07 19/19; `npm test` **494/494**; build 92 páginas com `/admin/compliance`; `test:migrations:pg` 155/155 ×2 + clone negativo rejeitado; `test:ext07-compliance:pg` 37/37; `test:ext06-satisfaction:pg` 36/36; `test:ext05-quality:pg` 33/33; `test:ext04-suppliers:pg` 28/28; `git diff --check` limpo. CI da PR #118: **13/13 checks verdes**.

## Passo zero da nova sessão (antes de qualquer trabalho)

1. `git fetch origin main`; confirmar que o `main` contém o merge da PR #118 (`gh pr view 118` ou `git log origin/main`). O clone costuma ser *shallow*: SHAs antigos não resolvem localmente — use `gh` como fonte.
2. Conferir HEAD = `origin/main` = merge-base; árvore limpa; **155 migrações; próxima livre: 156**.
3. **Perguntar ao usuário qual é a tarefa antes de implementar qualquer coisa.**

## Pendências documentadas (candidatos de continuação)

- **Execução agendada/contínua da avaliação temporal do EXT-07** — hoje `POST /api/ext/compliance/evaluate` é operação administrativa explícita; o agendamento é pendência declarada nos docs. Candidata natural, e agora com o gerador de evidência pronto para documentar a entrega.
- **Aplicar migrações em banco de destino / validação no ambiente real do operador** (fora de escopo até aqui).
- **Aceite humano e validação em Windows.**
- *(Baixa prioridade, registrado por honestidade)* 14 módulos em `src/server/*.mjs` repetem internamente a forma `return handler(req,res)` em despachos de segundo nível. Eles **não têm `try/catch` próprio nesse nível**, então já ficam cobertos pelo guard do topo: nada de queda nem de pendura, e a falha vira 500 fail-closed. O que se ganharia é rótulo de erro por módulo — melhoria cosmética, não correção.

## Restrições permanentes (do usuário — manter)

- Exclusivamente na branch Arena da sessão; nunca criar/trocar/enviar outras.
- Migrações 001–155 intocáveis; novas somente aditivas (arquivo único, `NOT VALID` quando necessário, `::text` em comparações de enum, sem seed/`UPDATE` retroativo).
- Sem dados reais, SMTP real, armazenamento externo real; não inventar integrações regulatórias, ator externo, upload, bytes, checksum, malware scan, armazenamento verificado, download ou aceite humano.
- Fronteira documental do EXT-07: referência declarada e privada; aplicabilidade é declaração interna, não validação jurídica.
- Não remover `src/app/admin/ti/ExtAdvancedClient.tsx` nem handlers EXT-08..12.
- Probe obrigatório antes de implementar; temporários do probe apagados; nunca banco real.
- Gates falham (não pulam) se PostgreSQL indisponível; nunca reduzir asserções para passar.
- Sem auto-merge; merge somente com autorização explícita do usuário.
- Não apresentar a bateria pesada integral como necessária, salvo decisão expressa do usuário.

## Armadilhas técnicas conhecidas (economizam horas)

- **Teste de guarda sem prova negativa é decoração.** Nesta sessão, a primeira versão do teste de "página em branco" passava **tanto** no código correto quanto no mutado — inútil. Só virou teste de verdade quando o estado foi forçado de forma determinística (posicionar o cursor na borda com `spacer`) em vez de torcer para um cenário aleatório encostar na condição. Sempre mutar o código e confirmar que o teste reprova; depois restaurar e conferir por `sha256sum -c`.
- `edit_file` e `str.replace` às vezes não casam a âncora e falham **em silêncio**. Em edição crítica, usar `python3` inline com `assert s.count(ancora)==1` e conferir com `grep` depois. Ocorreu nesta sessão: uma mutação "aplicada" não havia sido aplicada e quase gerou conclusão errada.
- Guarda estática que procura antipadrão **precisa remover comentários** antes de varrer, senão acusa o próprio comentário que cita o padrão (`semComentarios` em `route-dispatch-guard.test.mjs`).
- `next-env.d.ts` e `tsconfig.json` são modificados por `build`/`dev` — `git checkout --` antes de commitar.
- YAML de workflow: `- 'a','b'` (dois escalares num item de sequência) é inválido → GitHub registra "workflow file issue" e o workflow nunca dispara. Validar com parser (`pyyaml` em venv; em YAML 1.1 a chave `on` vira booleano `True` ao carregar).
- PR `CONFLICTING` não dispara workflows `pull_request` — resolver conflito primeiro.
- `auth_identities.status` só aceita `pending_email|active|suspended|disabled`; `auth_staff_profiles.role` só `admin|ti|rh|marcelo`.
- Driver `pg` devolve `Date` com fuso — usar `to_char(col,'YYYY-MM-DD')` em asserções de data.
- Na mesma transação, `ALTER TYPE ... ADD VALUE` + índice/trigger funciona **se** o valor novo não for referenciado como literal enum (usar `::text`).
- Ao adicionar migração: atualizar os quatro pontos — `files[]` em `scripts/migrate-site-visual.mjs`, a checagem `files.length !== N`, a mensagem/log "001–N" e `latestMigration` em `scripts/qa-wave0-static.mjs`; conferir `paths` do workflow correspondente.
- Gates descartáveis: portas 5440+, prefixo `seg_qa_`, recusam `DATABASE_URL`/`DATABASE_MIGRATION_URL` herdadas (comportamento correto, não "bug").
- `gh api .../logs` falha de forma intermitente com EOF — usar a API de jobs/steps como evidência.
- Para conferir PDF visualmente no sandbox: `python3 -m venv /tmp/pdfvenv && /tmp/pdfvenv/bin/pip install pymupdf` e renderizar páginas em PNG. É ferramenta **de sandbox**, nunca dependência do repo.
- Nesta máquina a bateria integral leva ~1 min 47 s (cada gate PG roda em ~18 s). Não presuma que gates PG são lentos aqui.

## Referências de gate existentes

`scripts/qa-ext07-compliance-postgres.mjs`, `qa-ext06-satisfaction-postgres.mjs`, `qa-ext05-quality-postgres.mjs`, `qa-ext04-suppliers-postgres.mjs`, `qa-migrations-postgres.mjs`. Scripts npm: `test:ext07-compliance:pg`, `test:ext06-satisfaction:pg`, `test:ext05-quality:pg`, `test:ext04-suppliers:pg`, `test:migrations:pg`, `qa:evidence`.

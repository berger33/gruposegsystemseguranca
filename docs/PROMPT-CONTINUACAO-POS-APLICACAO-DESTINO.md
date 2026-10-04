# Prompt de continuação — gruposegsystemseguranca (pós aplicação em banco de destino / PR #120)

> Prompt de continuação versionado na própria PR #120 (substitui o placeholder pelo número real da PR para o passo zero da próxima sessão). O SHA do merge entra somente na versão final entregue em chat após o merge.

## CONTEXTO

Repo: `berger33/gruposegsystemseguranca` (Next.js + server.mjs Node). Trabalhe EXCLUSIVAMENTE na branch Arena que a nova sessão criar/rastrear — nunca em outra branch.

Camadas já mescladas no main:

- PR #113 (merge `cda0c18`): migração 154 — constraints NOT VALID.
- PR #115 (merge `8c4d71a`, head `bd96d3f`): migração 155 + API canônica EXT-07 + gate HTTP real.
- PR #118 (merge `150052e`, head `f306dc6`): PLAT-01, despacho HTTP endurecido (`src/server/route-dispatch.mjs`).
- PR #119 (merge `70ee202`, head `ee221b6`): EXT-07 execução agendada da avaliação temporal — migração 156 + agendador in-process opt-in.
- PR #120 (branch `arena/01a10507-gruposegsystemseguranca`, head com este doc): aplicação em banco de destino — decisões operacionais, ensaio ponta a ponta e runbook. **Entrega exclusivamente documental**: nenhum código ou migração mudou (001–156 intocadas; próxima livre 157).

## O QUE A PR #120 ENTREGA (não refazer)

Pendência "aplicação em banco de destino", parcela executável. Decisões do proprietário registradas (2026-10-04): `EXT07_EVALUATE_INTERVAL_SECONDS=3600` (24 execuções/dia no ledger) e identidade declarada = conta staff **TI** ativa (UUID obtido no destino pela query da Etapa 4 do runbook).

- **`docs/APLICACAO-BANCO-DESTINO.md`** (novo): runbook do operador — banco via compose (`db:up`), `db:migrate` 001–156 (saída esperada e idempotência), verificações pós-aplicação (SQL), identidade declarada (query + semântica de revalidação por tick), ativação do agendador (variáveis, reinício, log esperado), acompanhamento inicial do ledger (rota `GET /api/ext/compliance/schedule` + queries), notas Windows e fronteiras (nunca `ALLOW_REMOTE_MIGRATIONS` por conveniência; segredos fora do repo e do chat).
- **`.env.example`**: passa a documentar `EXT07_EVALUATE_INTERVAL_SECONDS`/`EXT07_EVALUATE_IDENTITY` (ausentes até então). Nenhum teste fixa o conteúdo do arquivo; ele segue o único `.env.*` versionado.
- **Ensaio ponta a ponta** (evidência em `docs/ENTREGA-RELATORIO-2026-10-04-APLICACAO-BANCO-DESTINO.md`): cluster PostgreSQL 17.9 descartável como stand-in do destino, **32 verificações verdes em 9 passos** — `npm run db:migrate` oficial 156 Applied + replay 156 Already applied; `__migrations` 156/156 com checksum; 562 tabelas; sem seed EXT-07; servidor SEM agendador mantém padrão desligado; servidor COM 3600+TI avalia sozinho no primeiro tick imediato (tarefa em nome da identidade declarada, run `concluida` com `interval_seconds=3600`, evento do dia 1× com chave `agendada:YYYY-MM-DD`, rota `/schedule` 401 anônimo/200 TI); queries de monitoramento validadas. Script do ensaio temporário APAGADO; nenhum banco real tocado.
- Docs de estado atualizados: `ESTADO-EXECUCAO-LOCAL.md` (novo estado vigente no topo), `CHECKLIST-ENTREGA-LOCAL.md` (linha EXT-07), `CONTROLE-IMPLEMENTACAO.md` (entrada nova).

## PASSO ZERO DA NOVA SESSÃO (antes de qualquer trabalho)

1. `npm ci` no início (node_modules não persiste entre sessões do sandbox).
2. `git fetch origin main`; confirmar que o main contém o merge da PR #120 (`gh pr view 120` ou `git log origin/main`).
3. Conferir HEAD = origin/main = merge-base; árvore limpa; 156 migrações; próxima livre: 157.
4. PERGUNTAR AO USUÁRIO QUAL É A TAREFA ANTES DE IMPLEMENTAR QUALQUER COISA.

## PENDÊNCIAS DOCUMENTADAS (candidatos de continuação)

- **Executar o procedimento na máquina real do operador** (seguindo `docs/APLICACAO-BANCO-DESTINO.md` com as decisões já registradas: 3600 s + TI) — a execução é do operador; a sessão pode apoiar verificando resultados (ledger, rota `/schedule`) se o operador trouxer evidências/consultas.
- **Aceite humano** e **validação formal em Windows**.
- (Baixa prioridade, cosmético) Rótulo de erro por módulo nos 14 despachos de segundo nível — já cobertos pelo guard do topo desde o PLAT-01.

## RESTRIÇÕES PERMANENTES (manter)

- Exclusivamente na branch Arena da sessão; nunca criar/trocar/enviar outras.
- Migrações 001–156 intocáveis; novas somente aditivas (arquivo único, NOT VALID quando necessário, `::text` em comparações de enum, sem seed/UPDATE retroativo).
- Sem dados reais, SMTP real, armazenamento externo real; não inventar integrações regulatórias, ator externo, upload, bytes, checksum, malware scan, armazenamento verificado, download ou aceite humano. O agendador NÃO é ator externo: age em nome de identidade staff real declarada por ambiente.
- Fronteira documental do EXT-07: referência declarada e privada; aplicabilidade é declaração interna, não validação jurídica.
- Não remover `src/app/admin/ti/ExtAdvancedClient.tsx` nem handlers EXT-08..12.
- Probe obrigatório antes de implementar; temporários do probe apagados; nunca banco real; gates recusam `DATABASE_URL` herdada (comportamento correto).
- Gates falham (não pulam) se PostgreSQL indisponível; nunca reduzir asserções para passar.
- Sem auto-merge; merge somente com autorização explícita do usuário.
- Não apresentar a bateria pesada integral como necessária, salvo decisão expressa do usuário.
- Segredos ficam fora do repositório e NUNCA pelo chat.

## ARMADILHAS TÉCNICAS CONHECIDAS (economizam horas)

- **`count(*)` do driver `pg` devolve string, não número** — sempre `count(*)::int` em asserções JS (ocorreu nesta sessão). Datas: `to_char(col,'YYYY-MM-DD')` (driver devolve `Date` com fuso).
- `edit_file`/`str.replace` às vezes não casam a âncora e falham EM SILÊNCIO — em edição crítica, `python3` inline com `assert s.count(ancora)==1` e conferir com `grep` depois.
- Teste de guarda sem prova negativa é decoração: mutar código, confirmar que o teste reprova, restaurar e conferir por `sha256sum -c`.
- `next-env.d.ts` e `tsconfig.json` são modificados por build/dev e pelos gates com servidores dev — `git checkout --` antes de commitar.
- YAML de workflow: validar com parser (pyyaml em venv; chave `on` vira booleano em YAML 1.1); cada item de `paths` é um escalar único.
- PR CONFLICTING não dispara workflows `pull_request` — resolver conflito primeiro.
- `auth_identities.status` só pending_email/active/suspended/disabled; `auth_staff_profiles.role` só admin/ti/rh/marcelo.
- Ao adicionar migração: atualizar os QUATRO pontos (files[] em `scripts/migrate-site-visual.mjs`, checagem `files.length !== N`, mensagem "001–N" e `latestMigration` em `scripts/qa-wave0-static.mjs`) + paths do workflow correspondente.
- O gate EXT-07 sobe DOIS servidores dev (principal + agendador com `NEXT_DIST_DIR` próprio). Asserções de tempo usam `waitFor` com deadline, nunca sleep fixo.
- Workflows de delivery são paths-filtered: PR exclusivamente documental roda só o QA baseline (correto por design).
- Para conferir PDF no sandbox: `python3 -m venv /tmp/pdfvenv && /tmp/pdfvenv/bin/pip install pymupdf` (ferramenta DE SANDBOX, nunca dependência do repo).
- Bateria integral ~2 min 11 s; cada gate PG ~16–30 s.

## REFERÊNCIAS DE GATE EXISTENTES

`scripts/qa-ext07-compliance-postgres.mjs` (43/43, MINIMUM_CASES 41), `qa-ext06-satisfaction-postgres.mjs`, `qa-ext05-quality-postgres.mjs`, `qa-ext04-suppliers-postgres.mjs`, `qa-migrations-postgres.mjs` (156/156 ×2 + clone negativo), `qa-wave0-static.mjs`. Scripts npm: `test:ext07-compliance:pg`, `test:ext06-satisfaction:pg`, `test:ext05-quality:pg`, `test:ext04-suppliers:pg`, `test:migrations:pg`, `qa:evidence`. Runbook do operador: `docs/APLICACAO-BANCO-DESTINO.md`.

# Prompt de continuação — pós testes funcionais 2026-10-10

Copie o bloco abaixo como primeira mensagem de uma sessão nova.

---

## Prompt

Estou continuando o trabalho de testes funcionais do `gruposegsystemseguranca`.
A varredura e as correções já foram feitas e mergeadas; o que resta está listado
abaixo. Leia `docs/RELATORIO-TESTES-FUNCIONAIS-2026-10-10.md` antes de mexer em
qualquer coisa — ele tem os 15 defeitos, as decisões tomadas e a verificação.

### Onde parou

- PR **#190** mergeado em `main` com 20 commits, um por defeito (D1–D11, N1–N4,
  cobertura da rota canônica, CI e relatório).
- Estado verificado no merge: `wave0` 5/5 · `typecheck` exit 0 · `npm test`
  **889/889** em 86 arquivos · `build` 105/105 páginas · varredura de 68 alvos
  **60 OK / 8 NOK** · `qa-homologacao-local.mjs` exit 0 nos três modos
  (`--verify`, `--preflight`, `--verify-win1252`) · `test:cli-v2:pg` 11/11.
- CI do PR: 35/35 checks `pass`.

### O que falta fazer

1. **Estabilizar dois subtestes sensíveis a carga.** Ambos passam isolados e
   oscilam sob varredura longa. Não são regressões — foram comprovados por
   experimento (o `l04` falhava também com o código original, via `git stash`).
   - `test:ext14-intel:pg`, subteste 18 ("UX-07 inteligência browser"): dentro da
     varredura falhou com `browserType.launch: Target page, context or browser has
     been closed` em **54 ms**, nas duas tentativas — o Chromium nem subiu. O gate
     usa `--single-process`. Isolado: 18/18.
   - `test:l04-delivery:pg`, subteste 17 ("temas persistidos"): lê `data-theme` em
     `/conteudos`, que é pré-renderizada estaticamente. Falhou numa varredura e
     passou na seguinte (198 s).
2. **Destravar os 8 gates de `backup-restore`.** Falham com exit 2 em 0 s porque
   `pg_dump`/`pg_restore` da versão 17 não existem no ambiente; o binário de
   `embedded-postgres` traz apenas `initdb`, `pg_ctl` e `postgres`. Em CI significa
   instalar `postgresql-client-17` no job. Verifique
   `scripts/qa-backup-restore-postgres.mjs` antes de concluir que é só isso.

### Armadilhas do ambiente (todas custaram tempo; não repita)

- `node_modules/` e `.next/` **não sobrevivem entre sessões**. Rode `npm ci`
  (~15 s) antes de qualquer verificação, e `npm run build` antes de `test:rag`.
- Os gates recusam `DATABASE_URL` pré-definido (`QA_*_REFUSED`, exit 2). Invoque
  com `env DATABASE_URL= DATABASE_MIGRATION_URL=`.
- Rodar gates reescreve `next-env.d.ts` e `tsconfig.json` (o Next acrescenta um
  `include` por `distDir`) e regenera `docs/ux-03b-evidencias/*`. Reverta com
  `git checkout --` no fim; `tests/cli-v2.integration.test.mjs` já se restaura
  sozinho.
- `pkill -f "node server.mjs"` mata também o shell que chamou. Não use.
- `test:ext14-intel:pg` imprime `minimo_exigido=16` e **isso é uma verificação
  real** (linha 52 do script), não texto decorativo. Convenção repetida em ~20
  gates. Não "limpe".
- `tests/ext-compliance-scheduler.test.mjs:93-96` fixa de propósito
  `files.length !== 180` e `const latestMigration = 180`. Não torne dinâmico.

### Dois fatos que parecem erro e não são

- `sameOrigin()` em `server.mjs:274` retorna `true` incondicionalmente para
  GET/HEAD/OPTIONS. Um teste que espere 403 por origem estrangeira **num GET** é um
  teste falso; prove com POST.
- `evaluateLegacyTokenPolicy` (`src/server/staff-session.mjs:50`) exige **três**
  condições: `SITE_ADMIN_LEGACY_TOKENS="true"`, token com 32+ caracteres **e**
  `provisionedStaffCount = 0`. Ligar o flag nunca reativa o token numa base já
  semeada. É de propósito.

### Regras que valem

`AGENTS.md` é vinculante: nunca remover, desligar, renomear ou reduzir
funcionalidade existente — módulos, rotas, papéis, permissões, contratos de API e
layouts. Prefira mudanças aditivas. Nunca gravar credencial, segredo ou dado real
em código, documento, commit ou log versionado.

Em caso de dúvida sobre comportamento esperado, apresente as opções com as
consequências de cada uma e deixe eu escolher — não decida sozinho.

Ao terminar qualquer alteração, rode a verificação do próprio projeto sobre o
caminho que mudou e diga o que rodou e o que voltou. E termine sempre dizendo qual
é o próximo passo.

Comece pelo item 1.

---

## Notas de quem escreveu este prompt

- Relatório completo: `docs/RELATORIO-TESTES-FUNCIONAIS-2026-10-10.md` (10 seções:
  defeitos, decisões, verificação medida, pendências).
- A varredura de 68 alvos não é um script do repositório. Foi um runner
  descartável em `/tmp`, que não persiste. Os 68 alvos são: todos os
  `test:*:pg` (55) e `test:*:pg:*` (8) de `package.json`, mais `test:rag`,
  `qa:evidence`, `ux:evidence`, e `qa-homologacao-local.mjs` com `--verify` e
  `--preflight`. Teto de 15 min por gate, `DATABASE_URL*` limpos.
- Os dois subtestes do item 1 são os únicos que impedem uma varredura limpa de
  ponta a ponta sem re-execução.

# Fatia 06B — mapa de equivalência de cobertura e fechamento dos gates órfãos

**Data:** 07/11/2026. **Base:** `d2674a25297e1081fc698d98504635907a4068fe` (`main`, merge da PR #350). **Branch:** `arena/a7c6389f-gruposegsystemseguranca`. Publicado na PR **#351**. Nenhum deploy, dado real ou serviço externo: o único uso de rede é o próprio CI do repositório (resultado no §3). A fatia 05 continua **67/68** (E6 administrativo bloqueado por OOM). Produção **NO-GO**.

## 1. Inventário antes da mudança

O item 06 do plano pede o mapa `scripts → arquivos → cenários → workflows`, com ligação **somente** das jornadas realmente órfãs e sem confundir ausência literal com orfandade. Faltava o instrumento: nada no repositório respondia, de forma reproduzível, "este gate é executado por algum workflow?".

Medido sobre a base acima:

| Medida | Valor |
|---|---:|
| Workflows em `.github/workflows` | 60 |
| Scripts npm no `package.json` | 111 |
| Scripts de gate (`test:*`/`qa:*`/`reaudit:*`) | 88 (90 depois desta fatia) |
| Arquivos de teste no topo de `tests/` | 250 (251 depois) |
| Runners em `scripts/*.mjs` | 115 |

Duas armadilhas reais apareceram no inventário e viraram requisito do parser:

1. **Indireção por laço.** `backup-restore-delivery.yml` executa as oito variantes com `for gate in \ … ; do npm run "$gate"; done`. Uma leitura literal de `npm run <nome>` classificaria **oito** scripts como órfãos que são executados em toda PR.
2. **Bandeira ausente não é ausência de jornada.** `test:rag` roda `node tests/ai-rag.integration.test.mjs` **sem** `--test`; um parser que só reconhece `node --test` marcaria a jornada RAG como órfã.

O histórico de 03/10 já registrava seis gates sem workflow (`cli-v2:pg`, `staff-auth:pg`, `client-access:pg`, `backup-restore:pg`, `l02-delivery:pg`, `l03-delivery:pg`). Quatro foram ligados nas fatias 05H/05I/05AI. Restavam:

| Gate | Situação antes | Situação depois |
|---|---|---|
| `test:staff-auth:pg` (L01 — identidade, sessão, MFA, revogação) | sem workflow desde 04/10 | passo no `ci.yml`, piso TAP 21 |
| `test:client-access:pg` (acesso do cliente ponta a ponta) | sem workflow; só a variante `test:tenant:pg` era executada | passo no `ci.yml`, piso TAP 27 |
| `test:cli-v2:pg:objects` (contrato sintético de objeto) | sem workflow | passo no `ci.yml`, piso TAP 1 |
| `test:ux-pro-09e-7` + `tests/ux-pro-09e-7-text-overflow.test.mjs` | script existia, nenhum workflow chamava | arquivo no `test:unit` |
| `tests/lead-flow.integration.test.mjs` | sem workflow | **residual declarado** (allowlist com motivo) |

### Defeito reproduzido antes de ligar a 09E-7

Rodar o arquivo que ninguém executava revelou que ele **não passava em POSIX**: `scripts/ux-pro-09e-7-verify-evidence.mjs` resolvia `path.resolve(root, entry.screenshot)` com os caminhos gravados em `resumo.json` pela captura de 21/10 no **Windows** (`docs\UX-PRO-09E-7-evidencias-2026-10-21\home\w320-day-home.png`). Em POSIX a string inteira vira **um** nome de arquivo, a guarda de isolamento reprova e a evidência legítima é recusada.

Medição do RED: **3/4** casos aprovados, com `AssertionError: screenshot fora da pasta isolada: docs\UX-PRO-09E-7-evidencias-2026-10-21\home\w320-day-home.png`. Os 112 caminhos do manifesto usam `\` (112/112).

## 2. Mudança

### 2.1 Mapa reproduzível

- `scripts/qa-ci-coverage-map.mjs` — gerador com `--check` e `--json`. Lê `package.json`, os 60 workflows, `scripts/*.mjs` e `tests/*.mjs`; resolve `npm run`, `npm test`, `node --test <arquivos>`, `node tests/x.mjs`, `node scripts/x.mjs` e o laço `for <var> in …`. Produz `docs/CI-MAPA-COBERTURA-2026-11-07.csv` (uma linha por comando executado) e `docs/CI-EQUIVALENCIA-COBERTURA-2026-11-07.md` (contagens, tabela por workflow, pendências, allowlist e limites).
- `scripts/ci/coverage-allowlist.mjs` — alvos sem execução automática, **cada um com motivo**. Fica fora de `scripts/*.mjs` porque o mapa usa caminho literal `tests/…` dentro de um runner como indício de "quais jornadas ele executa"; a lista de dívidas ficaria lida como prova de execução (falso positivo medido nesta fatia).
- `tests/qa-ci-coverage-map.test.mjs` — 10 casos: formas de comando reais, laço e indireção não resolvida, parser com comentário entre passos/bloco `|`/escalar `>-`, contagem de declarações e piso TAP, fixture de repositório descartável (alcance, alias, órfão, comando pendurado, allowlist obsoleta), falha fechada, mapa versionado, ausência de `continue-on-error`/`|| true` e determinismo do render.
- Scripts npm `qa:ci-map` e `qa:ci-map:check`; passo **sem banco e sem navegador** no `ci.yml`.

Regras que reprovam (exit 1): comando pendurado; indireção que o parser não resolve; gate sem caminho de execução; arquivo de teste inalcançável; allowlist obsoleta; divergência do versionado. **Fora da falha** por decisão explícita: scripts locais (`dev`, `start`, `db:*`, `demo:local:*`, `package:*`, `build:preview`) e gates cujos alvos já são alcançados por outro caminho (classe `alias`).

### 2.2 Auditoria TAP nos gates reaproveitados

Os três runners ligados (e o `qa-tenant-postgres.mjs`, que já rodava) propagavam apenas o exit code com `stdio: 'inherit'`. Um arquivo inteiro marcado `skip` sai com **código 0** no Node 22 — falso verde, o mesmo defeito que a 06A mediu nas rotas públicas.

- `scripts/lib/qa-tap-summary.mjs` — reencaminha stdout/stderr (log íntegro no CI), guarda até 2 MiB para auditoria e recusa: resumo ausente/duplicado, `fail`/`cancelled`/`skipped`/`todo` diferente de zero, `pass ≠ tests`, ausência de cenário nomeado, saída truncada e contagem abaixo do piso.
- Pisos medidos nesta fatia: `L01` **21**, `tenant` **25**, `client-access` **27**, `CLI-09` **11**, `CLI-04 objeto` **1**. Migração continua no caminho simples: migração não é jornada.

### 2.3 Correção da verificação de evidência 09E-7

`scripts/ux-pro-09e-7-verify-evidence.mjs` normaliza `\` para `/` **antes** de resolver, e continua recusando caminho absoluto (`/…`, `C:`) e escape com `..`. A fronteira de "pasta isolada" não foi afrouxada: a mesma asserção `absolute.startsWith(evidenceRoot + sep)` permanece.

### 2.4 `ci.yml`

Quatro passos novos, todos aditivos: `qa:ci-map:check` (antes do SEC), `test:staff-auth:pg` (antes do tenant), `test:client-access:pg` (depois do tenant) e `test:cli-v2:pg:objects` (depois do CLI-09). Os três gates receberam `timeout-minutes: 10` para limitar a proporção dentro do job de 25 min. Nenhum passo, filtro, checagem ou gate existente foi removido ou alterado.

## 3. Resultados locais

| Ensaio | Resultado | Tempo |
|---|---|---:|
| `node scripts/qa-ci-coverage-map.mjs --check` | OK, 244 comandos, 250/251 arquivos alcançados, 0 pendência | 0,3 s |
| Mapa: gates órfãos / comandos pendurados / indireção não resolvida / allowlist obsoleta | 0 / 0 / 0 / 0 | — |
| `node --test tests/ux-pro-09e-7-text-overflow.test.mjs` | **4/4** (era 3/4) | 0,1 s |
| `npm run test:staff-auth:pg` | **21/21**, `QA_TAP_OK`, piso 21, limpeza confirmada | 13,6 s |
| `npm run test:tenant:pg` | **25/25**, `QA_TAP_OK`, piso 25 | 8,6 s |
| `npm run test:client-access:pg` | **27/27**, `QA_TAP_OK`, piso 27 | 15,9 s |
| `npm run test:cli-v2:pg` | **11/11**, `QA_TAP_OK`, piso 11 | 2,7 s |
| `npm run test:cli-v2:pg:objects` | **1/1**, `QA_TAP_OK`, piso 1 | 0,15 s |
| `node --test tests/qa-ci-coverage-map.test.mjs` | **10/10** | 1,1 s |

**Prova negativa real do auditor (não construída à mão):** `tests/lead-flow.integration.test.mjs` sem opt-in sai com **exit 0** e o auditor recusa com `skipped, pass_diferente_de_tests`. É exatamente o falso verde que a ligação de gates sem auditoria produziria.

**Deriva detectada pelo próprio mapa:** depois de editar os runners, o relatório versionado ficou desatualizado e `--check` reprovou (`docs/CI-EQUIVALENCIA-COBERTURA-2026-11-07.md: desatualizado`) até a regeneração. Sem essa reprovação o mapa viraria documentação morta.

### Fechamento das verificações

`npm test` **1646/1646**, 0 falhas/skip/todo (medido depois de reconciliar o ledger e o relatório do inventário — as duas únicas falhas da primeira execução eram essas contagens documentais, não jornada); focal do mapa 10/10; typecheck e build exit 0; SEC **35/35** âncoras; `qa-wave0-static` **5/5**; inventários `--check` regenerados (222: **1.747** arquivos varridos, era 1.742; rotas inalteradas).

### Flake observado no gate RAG/widget (não é regressão desta fatia)

O workflow `fech-01-rag-widget-delivery.yml` reprovou uma vez na PR (#351): run `42413237737`, step `npm run test:ai-rag-widget:pg`. O mesmo workflow, no **mesmo caminho de código**, havia passado no run anterior `42412725093` (20:47) e a diferença entre os dois commits é **documentação** (`FATIA-06B.md`/`STATUS-VIGENTE.md`), sem tocar runner, tela, migração ou fixture do widget. Repetido localmente: **28/28**, `FECH01_RAG_WIDGET_TAP_SUMMARY pass=28 fail=0 skipped=0`, gerados restaurados e cluster limpo. Classificação: **falha intermitente**, coerente com o SIGSEGV de Chromium já registrado na 05AG (duas ocorrências na primeira execução supervisionada, integral verde na repetição). Nada foi afrouxado, nenhum timeout aumentado e nenhum caso pulado; a reexecução passa pelo mesmo comando.

### Execução remota observada (PR #351)

`QA baseline` (`ci.yml`) **success** no run `42412725190`: **24 passos verdes**, incluindo os quatro acrescentados nesta fatia — `CI coverage equivalence map` (passo 6), `L01 staff identity, session and MFA` (17), `Client access end to end` (19) e `CLI-04 synthetic object contract` (23). Os demais 59 workflows estavam em execução no fechamento desta leitura; o resultado deles **não** é reivindicado aqui.

## 4. Limites e resíduos

- O mapa **não executa nada**: comando presente no workflow não é comando aprovado, e o CI remoto não foi observado.
- Filtros por nome (`--test-name-pattern`) reduzem o que roda dentro de um arquivo; o mapa conta declarações e não tenta adivinhar a seleção.
- Caminhos montados por template string em runner não são referência literal; a lista de arquivos daquele runner fica menor do que a realidade.
- Comentários em runner são removidos antes da leitura de referências (um comentário não executa nada) — o que também significa que um runner que só cite o teste em comentário aparece sem arquivos.
- Pisos TAP são contagens **atuais**: acrescentar ou remover caso exige reconciliar o piso na mesma fatia, por desenho.
- O CSV publica o piso lido do runner; quando o piso é condicional (`minimum: clientAccess ? 27 : 25`), a coluna `piso_tap` mostra o **menor** valor, porque o mapa não escolhe caminho por conta própria. O valor efetivamente auditado em cada variante aparece no log do gate (`QA_TAP_OK`).
- `tests/lead-flow.integration.test.mjs` permanece residual declarado: exige `DATABASE_URL` do operador e `RUN_DATABASE_INTEGRATION=1`; a jornada lead→implantação é exercitada por `test:f03-lead-to-implementation:pg` em cluster descartável. Não é cobertura presumida.
- Os dois runners de captura de evidência (`ux-pro-04` relatórios e pendências) continuam manuais: geram PNG/JSON sem veredito de jornada.
- Windows (o caminho que **produziu** os `resumo.json` com `\`) não foi executado nesta sessão; a correção foi medida apenas em POSIX, com o manifesto de 112 PNGs conferido byte a byte.
- O CI remoto foi observado apenas no `QA baseline` desta PR; os outros 59 workflows não foram lidos no fechamento. UAT, leitor de tela, WCAG integral, operação real e aceite humano **não** foram verificados. Client-security/N8 e N9 seguem abertos; produção permanece **NO-GO**.

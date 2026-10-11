# Relatório de testes funcionais — 2026-10-10

Escopo: varredura funcional do sistema inteiro (todas as funcionalidades), seguida da
correção dos defeitos encontrados sem remover nenhuma funcionalidade existente.

- **Fase 1** — somente testar e relatar erros. Concluída.
- **Fase 2** — corrigir todos os erros sem quebrar nada. Concluída, com 6 decisões do
  usuário registradas na seção 4.

Ambiente: Linux/Node v22.22.3, PostgreSQL embutido por gate, Chromium empacotado.

---

## 1. Resumo

| Item | Resultado |
| --- | --- |
| Defeitos encontrados na Fase 1 | 11 (D1–D11) |
| Defeitos novos revelados ao desbloquear os anteriores | 4 |
| Defeitos corrigidos | 15 |
| Regressões introduzidas | 0 |
| Cobertura acrescentada depois | 9 assertivas sobre `/api/client/cobrancas`, com teste de mutação |
| Suíte unitária | 889/889 (antes: 866/866 em 81 arquivos; agora 86 arquivos) |
| Typecheck | exit 0 |
| Build | exit 0, 105/105 páginas estáticas |
| Gates de integração (68 alvos) | **60 OK / 8 NOK**, medidos nesta rodada (seção 6) |

---

## 2. Defeitos da Fase 1

### D1 — `/admin/continuidade` fora do mapa de navegação
`tests/admin-navigation.test.mjs` falhava com `26 !== 27`. A rota existe e tem
`allowedRoles: ["admin","ti","marcelo","operacao","supervisor"]`, mas não estava em
`ADMIN_MODULES` nem em `ADMIN_GROUPS`: o módulo ficava inalcançável pela navegação.

**Correção:** entrada adicionada em `src/app/admin/AdminGate.tsx` (depois de
`/admin/emergencial`) e `/admin/continuidade` acrescentado ao grupo `entrega`
(Entrega de serviços) em `src/lib/admin-navigation.mjs`. Mudança aditiva.

### D2 — contagem literal obsoleta em `site-appearance.focal`
`assert.equal(declared.length, 177)` com 180 declarações reais. A verificação
substancial do teste é `deepEqual(declared, actual)`; o literal era redundante e
envelheceu.

**Correção:** literal removido, `deepEqual` mantido e acrescentado
`assert.ok(actual.length >= 1)` para que o teste não passe vazio.

### D3 — homologação bloqueada na migração 099
`scripts/qa-homologacao-local.mjs` tinha `if (rows[0].count !== 98)`. Com 180
migrações no disco, **toda** execução da homologação morria no primeiro passo —
o gate inteiro estava cego, não apenas esse teste.

**Correção:** contagem derivada do disco (`readdir('db/migrations')`), log dinâmico.
O migrador já falha fechado em `migration_manifest_mismatch`, então a integridade
continua garantida. Hoje: `QA-HOM-001: 180/180`.

### D4 — `test:demo-local:pg` pendurado para sempre
`scripts/local-demo.mjs` registrava `process.stdin.on('data')` no modo QA; o
`stdin` mantido aberto impedia o processo de encerrar, e
`scripts/qa-local-demo-persistent.mjs` aguardava sem limite. O gate consumia 428 s
e nunca terminava.

**Correção:** `process.stdin.pause(); process.stdin.unref?.()` no `finally` e
esperas limitadas (`exitOfBounded`, 30 s, SIGKILL + erro nomeado) nas duas recusas.
Hoje termina em ~65 s com exit 0 e alcança `INSECURE_CONFIG_REFUSED`,
`REINIT_REFUSED`, `CLIENT_SESSION_AFTER_RESTART`, `RESTART`, `TEMP_CLEANED`.

### D5 — `/api/client/charges-v2` devolvia 401 onde o teste exige 403
Conflito real: o teste exige 403 para sessão de staff, mas a página de Cobranças do
portal do cliente (`src/app/cliente/app/cobrancas/page.tsx`) usava o mesmo alias com
sessão de **cliente**. Não era possível atender aos dois.

**Correção (decisão do usuário):** o alias `-v2` passa a ser só de staff via
`ensureAuth`; criada a rota canônica `/api/client/cobrancas`
(`handleClientCharges`, sessão de cliente + same-origin + grants, mesma projeção),
registrada no despacho de `server.mjs` e em `API_PATH_MATCH`. A página do portal
passou a chamar a rota canônica. Nenhuma rota existente foi removida.

### D6 — `RETURNING` incompleto no ponto eletrônico
`src/server/employee-time-clock-api.mjs` devolvia a linha sem `employee_id`,
enquanto o handler equivalente de ausência (`employee-api.mjs`) já o devolvia.

**Correção:** `RETURNING id,status,employee_id,time_entry_id,reason`.

### D7 — expectativa de texto obsoleta em `l04-delivery`
Teste esperava `/Função: financeiro/`; a UI renderiza `Financeiro`
(`ContactManager.tsx`). **Correção:** teste alinhado ao texto real.

### D8 — seletor de papel ARIA errado em `f03-employee-request-rh-return`
`getByRole('button', { name: /Pedidos$/ })` contra elementos com `role="tab"`
(`EmployeePortal.tsx`). **Correção:** 3 seletores trocados para `'tab'`.

### D9 — `aria-pressed não substitui tab` em 6 gates de UX
A asserção varria a página inteira e capturava `AdminThemeToggle.tsx`, que usa
`aria-pressed` legitimamente (não é aba).

**Correção (decisão do usuário):** escopo da asserção reduzido ao `tablist`, mais
`[aria-pressed]:not([data-admin-theme-toggle="true"]) == 0`. A propriedade testada
é preservada; só o falso positivo sai.

### D10 — `ext14` sem `AWS_EXECUTION_ENV`
Único harness Chromium sem a variável que os demais definem.

**Correção:** `AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x"` no env do spawn.

### D11 — 4 testes órfãos fora do CI
Não eram alcançados por `npm test`.

**Correção (decisão do usuário, opção "mínimo"):** acrescentados a `test:unit`
(81 → 86 arquivos). Suíte foi de 866 para 889 asserções.

---

## 3. Defeitos revelados depois que os bloqueios caíram

Só apareceram quando D3/D9 deixaram de interromper a execução antes deles:

| # | Defeito | Correção |
| --- | --- | --- |
| N1 | `l04-delivery` esperava `Pessoas & jornada`; real é `Pessoas e jornada` (`RhWorkspace.tsx:192`) | teste alinhado |
| N2 | `f03-employee` esperava `Análise registrada…`; real é `Análise iniciada. A pessoa já vê que a solicitação está sendo tratada.` (`RhWorkspace.tsx:656`) | teste alinhado |
| N3 | `f03-contas` esperava `SMTP ou envio externo`; real é `SMTP nem envio externo` (`FinanceiroWorkspace.tsx:589`) | teste alinhado |
| N4 | `qa-backup-restore-postgres.mjs:155` tinha `ledger.length !== 98` latente — reprovaria com `qa_restore_snapshot_invalid` mesmo em cluster íntegro | contagem derivada do disco |

---

## 4. Decisões do usuário

| Assunto | Escolha |
| --- | --- |
| D5 — rota `charges-v2` | nova rota canônica `/api/client/cobrancas` para o portal; alias vira só de staff |
| D1 — grupo do módulo Continuidade | "Entrega de serviços" |
| D9 — `aria-pressed` | escopar a asserção ao `tablist` e permitir só `[data-admin-theme-toggle]` |
| CI — testes órfãos | mínimo: apenas acrescentar ao `npm test` |
| QA-HOM-002 — token do Marcelo | dois passos: 403 com flag desligado, 200 com `SITE_ADMIN_LEGACY_TOKENS=true` |
| QA-HOM-002 — como provar o opt-in | mutação temporária restaurada dentro de `try/finally` |

### Nota importante sobre o QA-HOM-002

A escolha "dois passos" foi feita antes de se conhecer a política completa.
`evaluateLegacyTokenPolicy` (`src/server/staff-session.mjs:50`) exige **três**
condições, não uma:

1. `SITE_ADMIN_LEGACY_TOKENS === "true"` (só o literal `"true"`; `"1"`, `"yes"` e
   `"on"` não ligam);
2. token configurado com 32+ caracteres;
3. `provisionedStaffCount === 0`.

O seed da homologação cria contas individuais de staff, então a condição 3 falha e
o token continua recusado com `legacy_admin_tokens_superseded` **mesmo com o flag
ligado**. É comportamento intencional: *"Assim que a primeira conta individual
existe, o token compartilhado morre sozinho, sem depender de o operador lembrar de
desligá-lo."*

Portanto, ligar o flag **nunca** reativa o token numa base já semeada. Para provar o
opt-in de ponta a ponta o ensaio simula o estado anterior ao bootstrap: marca os
perfis do seed com `is_bootstrap = TRUE` — exatamente o predicado que
`countProvisionedStaff` usa — prova o login e as duas rotas dependentes, e devolve
os perfis no `finally`. É o mesmo padrão que o próprio gate já usa no QA-HOM-007
para a verificação de e-mail. A base é 100% sintética e o diretório inteiro é
apagado no fim da execução.

O opt-in é provado reiniciando o mesmo servidor com o flag ligado, porque o Next
não aceita um segundo dev server no mesmo diretório.

---

## 5. O que mais mudou no gate de homologação

Ao desbloquear D3, o smoke avançou e expôs três expectativas que envelheceram junto
com o produto. Nenhuma foi enfraquecida:

- **Troca de e-mail (`/api/client/security/email-change`)** — o teste esperava 503
  ("explicitamente indisponível"). A rota hoje é real: exige e-mail novo válido e
  diferente, grava pedido com token hasheado e expiração, e só efetiva no PUT.
  O passo agora prova 401 anônimo e 400 `new_email_different_required` com corpo
  vazio — a recusa antes de qualquer efeito colateral, que era a intenção original.
- **Convite (`/api/admin/invites`)** — o teste esperava `emailStatus === 'not_configured'`
  com `inviteUrl` na resposta. Desde o L02, sem SMTP a entrega cai na caixa local e o
  token **não** é ecoado (`src/server/client-access-api.mjs:1069`). O passo agora
  valida a regra L02 inteira: `sent` é rejeitado, `not_configured` exige URL,
  `local_outbox` proíbe eco — e o ensaio busca o link na caixa local, como faz o
  operador.
- **Rotas que usavam a sessão do token compartilhado** (`/api/admin/client-accounts`
  200 e `/api/admin/client-verifications` 403) — movidas para o servidor com o flag
  ligado, onde essa sessão existe. O papel testado não foi substituído.

---

## 6. Verificação final

### Executado depois da última alteração de código

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Gates estáticos | `node scripts/qa-wave0-static.mjs` | 5/5 OK |
| Typecheck | `npm run typecheck` | exit 0 |
| Suíte unitária (86 arquivos) | `npm test` | **889/889**, 0 falhas, 0 pulados |
| Homologação | `node scripts/qa-homologacao-local.mjs --verify` | **exit 0**, 67 passos — 4 execuções consecutivas |
| Homologação, preflight | `--preflight` | exit 0 |
| Homologação, win1252 | `--verify-win1252` | exit 0 |
| Navegação admin | `node --test tests/admin-navigation.test.mjs` | 2/2 |

### Build e varredura completa de integração — medidos nesta rodada

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Build | `npm run build` | exit 0, `✓ Compiled successfully in 16.2s`, **105/105** páginas |
| Varredura de 68 alvos | runner próprio, 15 min de teto por gate | **59 OK / 9 NOK** em 2189 s |
| Rota canônica do portal | `npm run test:cli-v2:pg` | **11/11**, exit 0 |
| Variante de objetos | `npm run test:cli-v2:pg:objects` | 1/1, exit 0 |

Os 9 NOK da varredura:

| Gate | Exit | Causa |
| --- | --- | --- |
| `test:backup-restore:pg` + 7 variantes | 2 em 0 s | `pg_dump`/`pg_restore` 17 ausentes no sandbox (seção 7) |
| `test:ext14-intel:pg` | 1 em 11 s | Chromium não subiu sob carga — ver abaixo |

**O `ext14` é instabilidade de ambiente, não regressão.** Dentro da varredura ele
falhou com 17/18: o único subteste reprovado foi o de browser, com
`browserType.launch: Target page, context or browser has been closed` em **54 ms**
— o Chromium nem chegou a iniciar, nas duas tentativas. Os outros 17 subtestes, que
cobrem toda a lógica do EXT-14, passaram. Rodado isolado logo em seguida:
**18/18, exit 0**. O gate usa `--single-process`, que é sensível a contenção.

Somando o `ext14` isolado, o total real é **60 OK / 8 NOK** — e os 8 são todos
`backup-restore`, por falta de ferramenta no sandbox.

Gates confirmados verdes dentro da varredura, com tempo: `l04-delivery` 198 s ·
`l07-delivery` 144 s · `ux-continuity-client` 72 s · `ux-continuity` 69 s ·
`f03-employee-request-rh-return` 32 s · `f03-contas-baixa-relatorio` 21 s ·
`ux-analytics` 37 s · `ux-quality` 36 s · `ux-compliance` 37 s ·
`ux-satisfaction` 42 s · `ux-expansion` 44 s · `test:rag` 4 s ·
`qa:evidence` 209 s · `ux:evidence` 40 s · `homologacao:verify` 12 s ·
`homologacao:preflight` 0 s.

Linha final do gate de homologação:

```
QA-HOM-001: 180/180 migrações no PostgreSQL novo; 4 identidades e 2 empresas 100% fictícias.
QA-HOM-002_MARCELO_TOKEN_RECUSADO_POR_PADRAO: HTTP 403
QA-HOM-002_MARCELO_TOKEN_OPT_IN: HTTP 200
QA-HOM-002_BOOTSTRAP_STATE_RESTORED: 3 perfis devolvidos a is_bootstrap=FALSE.
QA_HOM_TEMP_CLEANED: true
```

### Gates que passaram a funcionar

`admin-navigation` 2/2 · `demo-local` exit 0 (65 s, antes pendurava 428 s) ·
`cli-v2` 11/11 · `cli-v2:objects` 1/1 · `l03` 1/1 · `l04` 20/20 ·
`f03-employee-request-rh-return` 1/1 · `f03-contas-baixa-relatorio` 1/1 ·
`ext14-intel` 18/18 · `ux-analytics` 8 · `ux-quality` 8 · `ux-compliance` 8 ·
`ux-satisfaction` 9 · `ux-expansion` 12 · `ux-continuity` 17 ·
`homologacao:verify` exit 0 (antes parava no primeiro passo).

### Nenhum gate verde ficou vermelho

`tenant` 22 · `client-access` 27 · `staff-auth` 21 · `ai-rag-widget` 25 · `l02` 14 ·
`l05` 1 · `l06` 9 · `l07` 43 · `l08` 51 · `admin-entry` 13 · `pendencies` 17 ·
`ux-portal` 11 · `ux-finance` 8 · `ux-hr` 13 · `ux-adm` 11 · `ext02`–`ext13` e
`ext15` todos passando · `qa:evidence` exit 0 · `ux:evidence` exit 0.

---

## 7. O que continua pendente e por quê

**8 variantes de `test:backup-restore:pg` — exit 2.** Não é defeito do produto: o
sandbox não tem `pg_dump`/`pg_restore` da versão 17. O binário empacotado do
PostgreSQL embutido traz apenas `initdb`, `pg_ctl` e `postgres`. Em máquina com
`postgresql-client-17` instalado esses gates executam.

**Instabilidade residual, não defeito de código:** dois subtestes oscilam sob
carga e passam isolados.

- `l04-delivery` subteste 17 (temas persistidos, `data-theme` em `/conteudos`, rota
  pré-renderizada): na varredura anterior falhou; nesta passou, com o gate completo
  em 198 s. Comprovado por experimento que não é regressão — com o código
  **original** (`git stash`) ele também falhava.
- `ext14-intel` subteste 18 (browser): falhou na varredura em 54 ms porque o
  Chromium não subiu; isolado, 18/18.

Ambos dependem de Chromium ou de rotas pré-renderizadas e são sensíveis a
contenção de CPU. Merecem correção própria (seção 10), mas não bloqueiam entrega.

---

## 8. Cobertura acrescentada depois da correção do D5

A rota canônica `/api/client/cobrancas`, criada para resolver o D5, entrou sem
nenhum teste que a alcançasse — nem em `tests/` nem em `scripts/`. Os 9/9 do
`cli-v2` e os 11 do `ux-portal` citados como prova não passavam por ela.

Cobertura acrescentada em `tests/cli-v2.integration.test.mjs` (50 linhas, purely
aditivo), já alcançada pelo CI via `test:cli-v2:pg`:

| Propriedade | Assertiva |
| --- | --- |
| Anônimo | 401 `client_session_required` |
| Sessão de cliente com grant | 200, contém a cobrança integrada da própria conta |
| `finance_integration_active=false` | ausente da resposta |
| Cobrança de outra conta | ausente da resposta |
| Sessão de staff TI | 401 (a rota do portal é só do cliente) |
| Sessão de staff RH | 401 |
| `POST` com origem correta | 405 |
| `POST` com origem estrangeira | 403 |
| Grant revogado | 200 com `charges: []`, sessão preservada |

O 403 é provado com `POST`, não com `GET`: `sameOrigin()` (`server.mjs:274`) libera
GET/HEAD/OPTIONS de propósito, porque navegadores não enviam `Origin` em GET
same-origin. Afirmar 403 num GET seria um teste falso.

O outro lado da separação do D5 — o alias `/api/client/charges-v2` rejeitar cookie
do portal com 401 — já estava coberto na linha 191-195 do mesmo arquivo.

**Prova de que as assertivas mordem:** removendo o filtro
`AND client_account_id = ANY($1::uuid[])` de `handleClientCharges`, o gate passa a
falhar com `not ok 8` e `not ok 10` e exit 1. Com o filtro restaurado, volta a
11/11 e exit 0.

### O gate estava órfão no CI

A cobertura acima não seria exigida automaticamente: `grep -rln "cli-v2"
.github/workflows/` não retornava nada. O `ci.yml` rodava wave0, audit,
typecheck, `npm test`, admin-navigation, build, `test:rag`, `test:tenant:pg` e
`test:demo-local:pg`; os outros 34 workflows cobrem gates de entregas
específicas. Era o mesmo problema do D11, só que em nível de gate.

Acrescentado ao `ci.yml`, depois do `test:demo-local:pg`:

```yaml
      - name: CLI-09 portal charges and v2 document aliases (isolated localhost PostgreSQL)
        run: npm run test:cli-v2:pg
```

Validado: YAML parseia (13 steps, timeout de 25 min preservado), a indentação é
byte a byte igual à dos steps vizinhos, e o gate roda verde sob o env exato do job
(`DATABASE_URL: ''`) com 11/11 e exit 0. O `PLT-CI-001` do wave0 continua OK.

### Retificação sobre o log do ext14

Cheguei a afirmar que o `minimo_exigido=16` impresso pelo
`scripts/qa-ext14-intel-postgres.mjs` era texto morto. **Estava errado.** A
linha 52 do mesmo script tem `if (pass !== null && pass < 16) problems.push(...)`:
o mínimo é uma verificação real e o log a espelha, seguindo a mesma convenção de
outros ~20 gates (`ext04` usa `MINIMUM_CASES = 28` na linha 41). Na execução que
falhou, `pass=17 ≥ 16` — o mínimo não disparou; o que rejeitou o gate foi a falha
registrada pelo `auditTap`. O log estava correto e nada foi alterado nele.

---

## 9. Arquivos alterados

25 arquivos, todos aditivos ou de alinhamento de expectativa:

```
package.json
server.mjs
scripts/local-demo.mjs
scripts/qa-backup-restore-postgres.mjs
scripts/qa-cli-v2-postgres.mjs
scripts/qa-ext14-intel-postgres.mjs
scripts/qa-homologacao-local.mjs
scripts/qa-local-demo-persistent.mjs
src/app/admin/AdminGate.tsx
src/app/cliente/app/cobrancas/page.tsx
src/lib/admin-navigation.mjs
src/server/cli-finance-api.mjs
src/server/employee-time-clock-api.mjs
tests/f03-contas-baixa-relatorio.integration.test.mjs
tests/f03-employee-request-rh-return.integration.test.mjs
tests/l04-delivery.integration.test.mjs
tests/site-appearance.focal.test.mjs
tests/ux-analytics-workspace.integration.test.mjs
tests/ux-compliance-workspace.integration.test.mjs
tests/ux-continuity-workspace.integration.test.mjs
tests/ux-expansion-workspace.integration.test.mjs
tests/ux-quality-workspace.integration.test.mjs
tests/ux-satisfaction-workspace.integration.test.mjs
tests/cli-v2.integration.test.mjs
.github/workflows/ci.yml
```

Nenhuma rota, módulo, papel, permissão, contrato de API ou layout foi removido,
renomeado ou reduzido. Nenhum segredo, credencial ou dado real foi gravado em
código, documentação ou log.

---

## 10. Próximos passos

1. **Commit e PR.** Nada foi commitado; o HEAD continua em `c50a99b`. Pendente
   decidir se este relatório entra no commit e se a história será um commit único
   ou separada por defeito. São 25 arquivos modificados mais este documento.
2. **Estabilizar os dois subtestes sensíveis a carga** (seção 7). `ext14-intel`
   subteste 18 usa `--single-process` e falha ao subir o Chromium sob contenção;
   `l04-delivery` subteste 17 lê `data-theme` de uma rota pré-renderizada. Os dois
   passam isolados. Enquanto isso, a varredura completa precisa de re-execução
   para distinguir falha real de contenção.
3. **Os 8 gates de `backup-restore`** só executam em máquina com
   `postgresql-client-17`. Em CI isso significa instalar o pacote no job; local,
   instalar o cliente. Não há alternativa sem mudar a superfície de dependências.

> **Atualização 2026-10-11:** os itens 2 e 3 acima foram executados e a seção 10
> está superada pela seção 11. O item 1 foi resolvido na sessão anterior com o
> PR #190 (merge `6c97c8b`, 21 commits, um por defeito).

---

## 11. Atualização — 2026-10-11

Escopo: fechar os dois itens que sobravam da seção 10 — estabilizar os dois
subtestes sensíveis a carga e destravar os 8 gates de `backup-restore` no CI.
Nenhuma funcionalidade foi removida, renomeada ou reduzida; nenhuma asserção
foi enfraquecida.

### 11.1 `ext14-intel` subteste 18 — crash de launch do Chromium

**Causa raiz.** O laço de repetição do subteste de interface só re-tentava
quando a mensagem do erro continha o literal `ERR_ASSERTION`. Uma `AssertionError`
do `node:assert` não carrega esse literal na mensagem — ele fica em `error.code` —
portanto o predicado **nunca** disparava: qualquer falha, inclusive de asserção,
era relançada na primeira tentativa. O erro observado na varredura
(`browserType.launch: Target page, context or browser has been closed`, em 54 ms,
antes de qualquer asserção) passava direto pelo retry e reprovava o gate.

**Correção.** Alinhamento à convenção que o próprio repo já usa em 10+ gates de
interface (`ux-contract`, `ux-analytics`, `l04`, ...): regex `CRASH` para erros de
infraestrutura do Chromium em `--single-process`, 3 tentativas com 2 s de pausa,
falha de asserção repassada na hora e rastro `EXT14_BROWSER_RETRY` no log. Nenhuma
asserção ficou tolerante — se a jornada real falhar nas 3 tentativas, o último
erro é relançado e o gate reprova.

**Provas.**

| Experimento | Resultado |
| --- | --- |
| Harness determinístico (launch stubado morrendo 1× com o erro real, depois funcionando) | predicado ANTIGO: reprova na hora com `browserType.launch: Target page...`; predicado NOVO: passa |
| Mesmo harness, launch morrendo em todas as tentativas | reprova após esgotar as tentativas (falha honesta preservada) |
| Mesmo harness, asserção real falhando | reprova na hora (nenhuma tolerância) |
| Gate isolado, sem carga | 18/18, exit 0 |
| Gate sob carga (2 CPUs + 1,2 GB ocupados) | 18/18, exit 0 |

### 11.2 `l04-delivery` subteste 17 — corrida do `data-theme` em rota pré-renderizada

**Causa raiz.** `/conteudos` é pré-renderizada: o `data-theme` não vem no HTML —
é aplicado no cliente por `PublishedTheme` depois que `fetch('/api/public/themes')`
responde. `waitUntil: 'networkidle'` não garante que a hidratação concluiu o
efeito: sob contenção de CPU o `networkidle` dispara antes de o cliente aplicar o
atributo, e o `getAttribute` imediato seguinte lia `null`. Sob carga mais pesada o
próprio `networkidle` deixava de estabelecer dentro do timeout de 30 s do
Playwright.

**Correção.** `assertThemeApplied(page, 'tech')`: navegação com
`domcontentloaded` (padrão já usado em outros pontos do mesmo arquivo) e espera
limitada de 20 s pelo atributo — a propriedade real sob teste — com
`assert.equal(value, expected)` no fim. Se o tema nunca for aplicado, a falha
acontece com o valor real. A asserção fica idêntica; só a corrida sai.

**Provas.**

| Experimento | Resultado |
| --- | --- |
| Reprodução sintética fiel (HTML pré-renderizado + tema aplicado no cliente após "hidratação") | padrão ANTIGO (`networkidle` + `getAttribute` imediato): `null`; padrão NOVO: `'tech'` em 324 ms |
| Gate isolado, sem carga | 20/20, exit 0 |
| Gate sob carga controlada (2 CPUs + 1,2 GB ocupados), código PRÉ-FIX | `not ok 17` — `null !== 'tech'` na linha do `getAttribute`; gate exit 1 |
| Gate sob a MESMA carga, código PÓS-FIX | **20/20, 0 falhas, exit 0** — subteste 17 em 6,3 s (a espera foi usada) |
| Gate sob carga 3× (2,2 GB + 3 CPUs, máquina triturada) | a primeira verificação de tema passou (pré-fix falhava ali); a falha passou a ser o `networkidle` do `reload`, que motivou o `domcontentloaded` |

O subteste 16 (CMS versionado), que falhara no mesmo experimento de carga com o
código pré-fix, também passou no pós-fix sob carga idêntica — mesma família de
sensibilidade a `networkidle`.

O terceiro caso conhecido (`ux-contract-postgres-browser`, falha única no CI
revertida sem mudança de código) já usava a convenção `CRASH` + `comNavegador`
desde antes e não precisou de alteração.

### 11.3 Os 8 gates de `backup-restore` no CI

Novo workflow `.github/workflows/backup-restore-delivery.yml`: matriz com as 8
variantes (`:pg`, `:clusters`, `:files`, `:http`, `:signed`, `:inventory`,
`:cli-objects`, `:cli-partial`), `fail-fast: false`, `timeout-minutes: 40`, e o
passo que instala `postgresql-client-17` do repositório PGDG — o gate exige
`pg_dump`/`pg_restore` **exatamente** da versão 17 (o servidor embutido é 17.9) e
recusa qualquer outra com `QA_RESTORE_CLIENT_MISSING_OR_INCOMPATIBLE`. O
`/usr/lib/postgresql/17/bin` é fixado no `$GITHUB_PATH` para que a versão não
dependa do sistema de alternativas da imagem do runner.

**Verificação local.** Impossível neste sandbox: `apt.postgresql.org` está fora da
allowlist de rede e o `embedded-postgres` traz apenas `initdb`, `pg_ctl` e
`postgres` (confirmado: `node_modules/@embedded-postgres/linux-x64/native/bin/`).
O que foi verificado localmente: YAML parseia (1 job, 6 steps, matriz com os 8
nomes de script batendo byte a byte com o `package.json`), o gate continua
recusando de forma limpa e acionável sem o cliente (`QA_RESTORE_CLIENT_MISSING_OR_INCOMPATIBLE`,
exit 2 em 1,4 s, sem criar banco) e os guardas unitários do caminho
(`backup-restore-guard`, `backup-api-fail-closed`, `backup-synthetic-file-bundle`,
`qa-detached-manifest-signature`, `qa-backup-coverage-inventory`, `qa-cli-v2-*`,
`backup-gate-documentation`) passam em `npm test`.

### 11.4 Verificação desta rodada (depois da última alteração)

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Suíte unitária (86 arquivos) | `npm test` | **889/889**, 0 falhas |
| Typecheck | `npm run typecheck` | exit 0 |
| Gates estáticos | `node scripts/qa-wave0-static.mjs` | 5/5 OK |
| ext14 isolado | `npm run test:ext14-intel:pg` | 18/18, exit 0 |
| ext14 sob carga | idem, 2 CPUs + 1,2 GB ocupados | 18/18, exit 0 |
| l04 isolado | `npm run test:l04-delivery:pg` | 20/20, exit 0 |
| l04 sob carga, pós-fix | idem, mesma carga | 20/20, exit 0 |
| backup-restore base | `npm run test:backup-restore:pg` | exit 2, recusa limpa (sem cliente 17 no sandbox) |

### 11.5 Arquivos alterados nesta atualização

```
tests/ext14-intel.integration.test.mjs        (retry de crash alinhado à convenção CRASH)
tests/l04-delivery.integration.test.mjs       (assertThemeApplied + domcontentloaded)
.github/workflows/backup-restore-delivery.yml (novo; matriz das 8 variantes com cliente 17)
docs/RELATORIO-TESTES-FUNCIONAIS-2026-10-10.md (esta seção)
```

Nenhuma rota, módulo, papel, permissão, contrato de API ou layout foi removido,
renomeado ou reduzido. Nenhum segredo, credencial ou dado real foi gravado em
código, documentação ou log. Os subprodutos de gate (`next-env.d.ts`,
`tsconfig.json`) foram revertidos com `git checkout --`.

### 11.6 Próximos passos

1. **Varredura completa dos 68 alvos** com o código estabilizado — agora sem os
   8 `backup-restore` travando: eles têm job próprio no CI e, em máquina com
   `postgresql-client-17`, executam local.
2. **Push da branch e PR** com os 4 commits (2 de estabilização, 1 de CI, 1 de
   doc), seguindo a convenção de um commit por defeito do PR #190.
3. Confirmar no CI que os 8 gates de `backup-restore` ficam verdes com o cliente
   17 instalado pelo job.

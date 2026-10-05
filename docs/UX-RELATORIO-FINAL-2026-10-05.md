# Relatório final versionado — evolução de UX do SEG System

Data: 2026-10-05 · Autor: agente Arena · Revisão independente prevista: Codex

> **Leia primeiro:** nada neste documento foi executado na máquina do operador.
> Todas as validações rodaram numa sandbox Linux. Nenhum aceite humano ocorreu.
> Marcelo e Andreia **não** participaram, por determinação expressa do solicitante.

---

## 1. SHA inicial e final, PRs e commits por etapa

| Item | Valor |
| --- | --- |
| SHA inicial (`origin/main`, PR #151 já mesclada) | `0be3d465de7ea8d41b9af15748071323f8c7d26d` |
| Branch de trabalho | `arena/25fd8d59-gruposegsystemseguranca` |
| SHA final da branch | `614f8fe` |
| Pull request | **#154** — <https://github.com/berger33/gruposegsystemseguranca/pull/154> (base `main`) |
| `origin/main` ao final | **inalterado**, ainda em `0be3d465` — nada foi mesclado |
| Migrações | **001–174, inalteradas**. Nenhuma criada. Próxima livre: 175 |

### Commits, um por família

| # | SHA | Etapa | Conteúdo |
| --- | --- | --- | --- |
| 1 | `cc9a529` | UX-03B | Detalhe da oportunidade, estados honestos, formulários, importação guiada, comercial e carteira |
| 2 | `de1a1d6` | UX-03B | União das PRs #152 e #153 (componentes, arnês de evidência, evidência regerada) |
| 3 | `2740854` | UX-04 | RH com permissão dita em voz alta, estados honestos e formulários com rótulo |
| 4 | `614f8fe` | UX-05 | Painel do Marcelo com estado de carregamento, abas acessíveis e recusa explicada |

### Etapas anteriores (não refeitas, conforme determinado)

UX-00, UX-01, UX-02 e UX-03A já estavam entregues em `main` e **não foram
tocadas**. Seus relatórios seguem em `docs/UX-00-...`, `UX-01-...`, `UX-02-...`,
`UX-03A-CRM-...`.

### Reconciliação das PRs #152 e #153 (decisão "merge_both" do solicitante)

| PR | Branch | Head | Destino |
| --- | --- | --- | --- |
| #152 | `arena/01a10ccd-...` | `8e50df07` | **fechar sem mesclar** |
| #153 | `arena/01a10d1b-...` | `cc9a529f` | **fechar sem mesclar** |

- Adotado de **#153**: telas de CRM/carteira/comercial, `crm-vocabulary.mjs`,
  `UiState` + `crm-request.ts`, gate `ux-crm-postgres-browser`.
- Portado de **#152**: `UiPanel`, `UiBadge`, `scripts/ux-evidence-*.mjs`, script npm `ux:evidence`.
- Descartado por redundância: `crm-labels.mjs`, `ux-feedback.mjs`, `UiAsyncState.*`.
- As capturas de #152 **não** foram reaproveitadas; a evidência foi regerada nesta branch.

> **Ação pendente do dono do repositório:** fechar #152 e #153 sem mesclar.
> O agente não fecha nem mescla PR de terceiros.

---

## 2. Matriz de rotas do inventário

A matriz completa das **98 rotas** do inventário UX-00 está em
**`docs/UX-RELATORIO-FINAL-MATRIZ-ROTAS.csv`**, com as colunas: `rota`,
`papeis_declarados`, `etapa_ux`, `tarefa_do_usuario`, `estados_honestos`,
`evidencia`, `pendencia`, `arquivo`, `arquivo_alterado_nesta_entrega`.

**Cinco rotas foram retrabalhadas nesta entrega.** As outras 93 permanecem
exatamente como estavam em `0be3d465` e estão marcadas como
`nao retrabalhada nesta entrega` / pendência `UX-06..UX-09`.

| Rota | Etapa | Papel | Tarefa do usuário | Estados honestos | Evidência | Pendência |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/crm` | UX-03A + UX-03B | comercial | Lista → detalhe → ação da oportunidade; importação guiada | carregando / vazio / falha / negado distintos | `docs/ux-03b-evidencias/desktop-crm.png`; gate `test:ux-crm:pg` 7/7 | Aceite humano pendente |
| `/admin/carteira` | UX-03B | comercial | Carteira e próximos contatos; dado persistido distinguido de referência | carregando / vazio / falha | `docs/ux-03b-evidencias/desktop-carteira.png` | Blocos de referência seguem rotulados como protótipo |
| `/admin/comercial` | UX-03B | comercial | Vistoria, orçamento, preço, proposta e contrato como tarefas compreensíveis | carregando / vazio / falha | `docs/ux-03b-evidencias/desktop-comercial.png` | Aceite humano pendente |
| `/admin/funcionarios` | UX-04 | rh (`AdminGate` admite rh/marcelo/admin/ti) | Pessoas e jornada do funcionário, conforme **concessão efetiva**, não conforme o menu | carregando / vazio / falha / **negado com 403 explicado** | `docs/ux-04-evidencias/desktop-rh.png`; gate `test:ux-hr:pg` 9/9 | Escala, Documentos e Fechamento não exercitados ponta a ponta; 7 componentes legados marcados na tela |
| `/admin/marcelo` | UX-05 | marcelo (`AdminGate` admite marcelo/admin/ti) | Prioridades, pendências e indicadores com fonte real; decisão com alçada e segregação | carregando / vazio / **indisponível** / falha | `docs/ux-05-evidencias/desktop-marcelo.png`; gates `test:ux-adm:pg` 9/9 e `test:l07-delivery:pg` 43/43 | Abas secundárias não percorridas ponta a ponta; aceite humano pendente |

---

## 3. Testes e comandos, separados por natureza do ambiente

Ambiente único de execução: **sandbox Linux, Node 22, PostgreSQL 17 embarcado e
descartável (`embedded-postgres`), Chromium empacotado (`@sparticuz/chromium`)**.

### 3.1 Estático e unidade (sem banco, sem navegador)

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | **OK** |
| `node scripts/qa-wave0-static.mjs` | **5/5**; migrações 001–174 contínuas e únicas; 0 imports ausentes |
| `npm test` | **688/688**, 0 puladas (eram 672 no SHA inicial; +15 UX-04, +16 UX-05, −15 realocados) |
| `npm run build` | saída **0** |

### 3.2 HTTP real contra PostgreSQL real e descartável + Chromium real

| Comando | Resultado | Cobre |
| --- | --- | --- |
| `npm run test:ux-crm:pg` | **7/7** | UX-03B |
| `npm run test:ux-hr:pg` | **9/9** | UX-04 |
| `npm run test:ux-adm:pg` | **9/9** | UX-05 (novo nesta entrega) |
| `npm run test:l07-delivery:pg` | **43/43** | Gate pré-existente do painel do Marcelo |

O gate L07 foi medido **antes** de qualquer alteração em `MarceloPanel.tsx`
(43/43) e novamente **depois** (43/43). Nenhuma asserção foi relaxada e nenhum
dos 97 `data-testid` existentes foi removido.

### 3.3 Evidência visual (preview com servidor real + PG descartável)

| Comando | Resultado |
| --- | --- |
| `npm run ux:evidence -- --stage=ux-03b` | **6/6 OK** |
| `npm run ux:evidence -- --stage=ux-04` | **2/2 OK** |
| `npm run ux:evidence -- --stage=ux-05` | **2/2 OK** |

Cada captura verifica: desktop 1440×900 e mobile 390×844, ausência de transbordo
horizontal, `Tab` movendo o foco com contorno visível, nenhum erro de console de
origem própria e nenhum 5xx. Google Fonts é inalcançável na sandbox e aparece em
`externalBlocked` nos `resumo.json` — **não é defeito da página**.

### 3.4 CI no GitHub (PR #154)

O workflow de CI dispara **17 jobs** em `pull_request`, incluindo os três gates
de UX (`ux-crm-postgres-browser`, `ux-hr-postgres-browser` e o novo
`ux-adm-postgres-browser`).

**Observação importante e honesta sobre a execução anterior:** na rodada do
commit `2740854`, seis jobs apareceram como `fail` em `gh pr checks`. A inspeção
via API (`actions/jobs/<id>`) mostrou `conclusion: "cancelled"` com
**`steps: []`** — ou seja, os jobs **nunca receberam runner**, ficaram 15 minutos
na fila e foram cancelados. Não houve falha de código: nenhum passo chegou a
executar. É esgotamento de capacidade de runners ao disparar 16–17 jobs com
PostgreSQL e Chromium ao mesmo tempo. **O resultado da rodada do commit final
`614f8fe` ainda não era conhecido quando este relatório foi escrito** e precisa
ser conferido com `gh pr checks 154`.

### 3.5 Não executado

`test:admin-entry:pg`, `test:l04-delivery:pg`, `test:f03-lead-to-implementation:pg`
não foram rodados localmente — rodam na CI e nenhuma das cinco telas desta
entrega altera as rotas que eles exercitam.

### 3.6 Aceite humano

**Pendente, integralmente.** Nenhuma sessão com Marcelo ou Andreia ocorreu, por
determinação expressa. Nada neste repositório deve ser lido como homologação.

---

## 4. Fluxos e permissões preservados; regressões encontradas e corrigidas

### 4.1 Preservado (verificado por teste, não por inspeção)

| Invariante | Onde continua decidido |
| --- | --- |
| Autenticação de equipe e 401 sem sessão | `src/server/*-api.mjs` |
| Permissões granulares e 403 sem concessão | `auth_permissions` + `rbac.mjs` |
| Isolamento por conta/escopo | servidor, inalterado |
| Idempotência (`Idempotency-Key`) | servidor; nenhuma rota afrouxada |
| Auditoria fail-closed | `audit_unavailable` desfaz a operação inteira |
| Alçada de aprovação e segregação "quem pede não decide" | PostgreSQL + `adm-panel-api.mjs` |
| Histórico e versionamento de configuração | servidor, inalterado |
| Operação local | nenhuma dependência pesada adicionada |
| Migrações | 001–174 intactas; **nenhuma nova** |

**Menu nunca virou autorização.** Nenhum `AdminGate` foi alargado. Quando o papel
passa no `AdminGate` mas não tem concessão de API, a tela **diz isso** em vez de
esconder ou de fingir dado.

### 4.2 Regressões e defeitos reais encontrados e corrigidos

| # | Defeito | Etapa | Correção |
| --- | --- | --- | --- |
| 1 | **Negativa de permissão virava indicador zerado.** Em `/admin/funcionarios`, o 403 de `employees.read` era engolido e a tela exibia "0 cadastros, 0 ativos, 0 em admissão". | UX-04 | O 403 passa a renderizar estado `negado`, com título humano, `HTTP 403` e o código apenas entre parênteses. **Zero indicador** é exibido. |
| 2 | **Divergência entre papel no menu e concessão efetiva.** A migração 102 (`provision_hr_role_permissions`) concede `employees.*` ao papel `rh` e **deliberadamente não** a `ti`/`admin`/`marcelo`; mas o `AdminGate` de `/admin/funcionarios` admite os quatro. TI abria a página e tomava 403 em toda leitura. | UX-04 | Corrigido **dizendo a verdade**, não afrouxando acesso. O gate trava: `rh` tem a concessão, `ti` tem **zero** `employees.*`. |
| 3 | **Carregando indistinguível de vazio** no painel do Marcelo: `indicators === null` sem erro renderizava tela em branco. | UX-05 | Estado de carregamento declarado nas oito abas. |
| 4 | **Token técnico como mensagem** ao operador (`(drilldown_source_unavailable)` sem frase). | UX-05 | Vocabulário em português; o código canônico desceu para o rodapé de diagnóstico. |
| 5 | **ARIA inválido:** oito `<button aria-selected>` soltos num `<nav>`, sem `role="tab"` e sem teclado. | UX-05 | `tablist`/`tab`/`tabpanel` reais, roving tabindex, ←/→/Home/End. |
| 6 | **17 códigos de erro do servidor sem tradução** — descoberto pelo próprio teste de deriva, que leu `adm-panel-api.mjs` e reprovou. | UX-05 | Vocabulário completado. **O teste não foi afrouxado.** |
| 7 | **Arnês de evidência travando 60 s em 390px.** A espera por texto casava com um item **oculto** do menu lateral. | UX-05 | Espera ancorada em texto exclusivo do corpo; captura móvel caiu de 62 s para 3 s. |
| 8 | Campos com apenas `placeholder` (some ao digitar, não associado ao campo). | UX-04 e UX-05 | `id` + `<label for>` + `aria-describedby` em todos. |
| 9 | Ausência de trava de clique duplo na decisão. | UX-05 | Botões desabilitados durante o envio, com `finally`. A idempotência do servidor segue sendo a garantia real. |

---

## 5. O que NÃO foi concluído, e por quê

| Item | Motivo |
| --- | --- |
| **UX-06, UX-07, UX-08 e UX-09** | Decisão explícita do solicitante por **profundidade em vez de largura**: entregar UX-03B, UX-04 e UX-05 com teste e evidência, deixando o restante documentado. Prompt de continuação na seção 7. |
| **Aceite humano (Marcelo e Andreia)** | Determinação expressa de não solicitar participação e não inventar homologação. |
| Abas Escala, Documentos e Fechamento de holerite (`/admin/funcionarios`) | Receberam a linguagem visual e os estados, mas não foram percorridas ponta a ponta com massa criada pelo portal. |
| Sete componentes legados `Hr*Client` ("Demais processos") | Não reescritos. Estão **rotulados como legado na própria tela**, em vez de disfarçados. |
| Abas secundárias do painel do Marcelo | Receberam estados honestos, rótulos e semântica de aba, mas não foram percorridas ponta a ponta na interface. O gate L07 já as exercita por HTTP. |
| Aprovar/rejeitar solicitação de RH com massa criada pelo portal | O caminho foi exercitado por API; falta massa de ponta a ponta. |
| `UiPanel` | Portado de #152, segue **sem consumidor**. `UiWorkspace.module.css` atendeu as três telas. |
| Teste com leitor de tela real (NVDA/VoiceOver) | A sandbox não possui leitor de tela. A semântica foi verificada por asserção de ARIA e por teclado, **não por audição**. |
| Validação em Windows e na máquina do operador | O agente não tem acesso ao computador do operador nem ao Ollama. |
| SMTP e hospedagem pública | Fora de escopo, por determinação. |
| Fechamento das PRs #152 e #153 | O agente não fecha PR de terceiros. Ação do dono do repositório. |
| Resultado da CI do commit final `614f8fe` | Ainda pendente na fila do GitHub no momento da escrita. Conferir com `gh pr checks 154`. |

---

## 6. Runbook do operador

> Este runbook **não foi executado** pelo agente. É a sequência que o operador
> deve rodar na própria máquina. Nenhum segredo aparece aqui e **nenhum passo é
> destrutivo automaticamente** — os passos de reversão exigem ação consciente.
>
> Pré-requisitos: Node 22, Git, e o `.env` local que o operador já usa.
> O PostgreSQL dos testes é **embarcado e descartável**: nenhum comando abaixo
> toca o banco do operador. Se `DATABASE_URL` estiver definida no ambiente, os
> gates **recusam-se a rodar** (saída 2), de propósito.

### 6.1 Atualizar o checkout e instalar

```bash
cd <pasta-do-repositorio>
git fetch origin
git status                      # confirme que não há trabalho local não salvo
git checkout arena/25fd8d59-gruposegsystemseguranca
git pull --ff-only origin arena/25fd8d59-gruposegsystemseguranca
npm ci
```

### 6.2 Verificar sem subir nada

```bash
npm run typecheck
node scripts/qa-wave0-static.mjs     # espera 5/5 e migrações 001–174
npm test                             # espera 688/688
npm run build                        # espera saída 0
```

### 6.3 Subir a aplicação localmente

```bash
npm run build
npm start                            # usa o .env do operador
# abra http://localhost:3000/admin/entrar
```

### 6.4 Testar por papel

Login em `/admin/entrar` com a conta de cada papel e percorra:

| Papel | Rota | O que conferir |
| --- | --- | --- |
| comercial | `/admin/crm` | lista → detalhe → ação; importação guiada não confirma duplicata sozinha |
| comercial | `/admin/carteira`, `/admin/comercial` | dado persistido distinguido de referência |
| rh | `/admin/funcionarios` | abas por teclado; todo campo com rótulo; desligamento pede confirmação nomeando a pessoa |
| ti | `/admin/funcionarios` | **deve** mostrar "Sem a concessão necessária" e **nenhum** indicador — é o comportamento correto |
| marcelo | `/admin/marcelo` | cartões com fonte, período e data-base; decisão pede motivo e chave |
| ti | `/admin/marcelo` | lê os indicadores e **não** consegue decidir |

Em cada tela, reduza a janela a 390 px e navegue só com `Tab`, setas, `Home` e `End`.

### 6.5 Rodar os gates com PostgreSQL descartável

```bash
# Garanta que estas variáveis estão VAZIAS nesta shell, senão os gates recusam:
#   DATABASE_URL, DATABASE_MIGRATION_URL, RUN_DATABASE_INTEGRATION_REMOTE
npm run test:ux-crm:pg        # UX-03B, espera 7/7
npm run test:ux-hr:pg         # UX-04,  espera 9/9
npm run test:ux-adm:pg        # UX-05,  espera 9/9
npm run test:l07-delivery:pg  # painel do Marcelo, espera 43/43
```

Cada gate sobe o próprio cluster numa porta livre de `127.0.0.1`, aplica as
migrações, roda e **descarta o diretório temporário ao final**.

### 6.6 Reverter

Nada foi mesclado: `main` continua em `0be3d465`. Para abandonar esta entrega,
basta **não mesclar a PR #154**.

Para voltar o checkout local ao estado anterior:

```bash
git checkout main
git pull --ff-only origin main        # volta a 0be3d465 (ou ao main vigente)
```

Se a PR **já tiver sido mesclada** e for preciso desfazer, prefira a reversão
versionada, que preserva o histórico:

```bash
git checkout main
git pull --ff-only origin main
git revert --no-commit <sha-do-merge-da-PR-154>
git commit            # revise a mensagem antes de confirmar
# empurre apenas após revisar o diff
```

Para remover a branch local depois de concluir (operação consciente, não
automática):

```bash
git branch -d arena/25fd8d59-gruposegsystemseguranca
```

**Não** execute `git reset --hard`, `git push --force` nem `DROP DATABASE`:
nenhum passo desta entrega exige isso.

---

## 7. Prompt de continuação (UX-06 a UX-09)

Copie o bloco abaixo como prompt inicial da próxima sessão.

```text
Continue a evolução de UX do SEG System em github.com/berger33/gruposegsystemseguranca.

ESTADO DE PARTIDA (confirme antes de qualquer coisa):
- GitHub é a fonte da verdade. Não use ZIP nem snapshot antigo.
- Rode: git fetch origin && git log --oneline -1 origin/main && gh pr list
  && ls db/migrations | tail -3
- Base desta linha de trabalho: main em 0be3d465.
- PR #154 (branch arena/25fd8d59-gruposegsystemseguranca, head 614f8fe) entrega
  UX-03B reconciliada, UX-04 (RH) e UX-05 (painel do Marcelo). Verifique se já
  foi mesclada; se sim, parta do main novo.
- PRs #152 e #153 foram SUPERADAS pela #154 e devem ser fechadas sem mesclar
  pelo dono do repositório. Nunca mescle nem reabra PR de terceiros.
- Migrações 001–174. Próxima livre: 175. Não altere migração existente.

JÁ ENTREGUE — NÃO REFAÇA: UX-00, UX-01, UX-02, UX-03A, UX-03B, UX-04, UX-05.
Leia antes de começar:
  docs/UX-PLANO-MESTRE-2026-10-05.md
  docs/ARENA-CONTINUACAO-UX-2026-10-05.md
  docs/UX-RELATORIO-FINAL-2026-10-05.md  (este relatório)
  docs/UX-04-RH-2026-10-05.md, docs/UX-05-MARCELO-2026-10-05.md

O QUE FAZER: UX-06, UX-07, UX-08 e UX-09, na ordem do plano mestre, um commit
bem descrito por família.

PADRÃO JÁ ESTABELECIDO — SIGA-O, não invente outro:
- Vocabulário por domínio em src/lib/<dominio>-vocabulary.mjs (+ .d.mts): os
  VALORES continuam canônicos, só o RÓTULO muda; valor desconhecido passa cru.
- Erros: describe<Dominio>Error(code, status) devolve
  { kind, title, detail, status, canRetry }. O título é humano; o código
  canônico aparece apenas entre parênteses, no rodapé de diagnóstico.
- Estados: src/components/ui/UiState (loading|empty|error|denied|success,
  atributo data-ui-state, role=alert em error/denied). O selo é maiúsculo por
  CSS — compare texto sem diferenciar caixa.
- Superfície visual: src/components/ui/UiWorkspace.module.css. Evite style inline.
- Abas: tablist/tab/tabpanel reais, roving tabindex, ←/→/Home/End.
- Teste de deriva por domínio: leia o arquivo de API e FALHE se a interface
  traduzir código inexistente ou deixar código do servidor sem frase.
- Gate por domínio: scripts/qa-ux-<dominio>-postgres.mjs (PostgreSQL embarcado e
  descartável; recusa rodar se DATABASE_URL estiver definida) +
  tests/ux-<dominio>-*.integration.test.mjs + workflow em .github/workflows/.
- Evidência: npm run ux:evidence -- --stage=<etapa>. O estágio ux-08 já existe
  no arnês. Nunca chame scripts/ux-evidence-capture.mjs direto (sai com 2).

INVARIANTES QUE NÃO PODEM CAIR:
- Autenticação, permissões granulares, isolamento por conta, idempotência,
  auditoria fail-closed, históricos e operação local.
- Menu NÃO é autorização: mantenha todos os AdminGate e guardas de RBAC. Se o
  papel passa no menu e não tem concessão, DIGA ISSO — não alargue o acesso.
- Falha NUNCA vira zero. Carregando, vazio, indisponível, negado e falha são
  cinco estados distintos.
- Não enfraqueça teste para deixar check verde. Se um teste reprovar, corrija o
  código ou explique a limitação.
- Não converta protótipo em "funcionando" por cosmética; rotule o que é
  referência.
- Nenhuma dependência pesada: o PC do operador tem 8 GB de RAM e não tem GPU.
- Não exiba segredo, credencial ou dado pessoal em PR ou captura.

ARMADILHAS JÁ MAPEADAS (não caia de novo):
- Não existe AGENTS.md neste repositório.
- Não há PostgreSQL de sistema; use embedded-postgres. Não tente instalar.
- O download de browser do Playwright é bloqueado; use @sparticuz/chromium com
  --single-process e abra um browser NOVO por contexto (reaproveitar derruba).
- page.route() é instável com esse Chromium: sobrescreva window.fetch via
  page.addInitScript.
- page.locator('main') é ambíguo nas telas de admin (AdminChrome e UiWorkspace
  são ambos <main>). Use data-ui-state ou classe de módulo.
- Em 390px o menu lateral fica no DOM porém OCULTO: getByText(...).first() pode
  casar com item invisível e estourar a espera. Ancore em texto exclusivo do
  corpo da página.
- Google Fonts não carrega na sandbox; aparece em externalBlocked e não é defeito.
- A migração 102 auto-provisiona permissões para rh/admin/ti/marcelo. Consulte
  auth_permissions antes de escrever qualquer fixture de negativa.
- Telas grandes e muito acopladas a teste (como MarceloPanel.tsx, 97 data-testid)
  não admitem reescrita cega: aplique patches dirigidos e verifique, por diff de
  conjunto, que nenhum data-testid sumiu.
- A CI dispara 17 jobs com PostgreSQL e Chromium; jobs podem ser CANCELADOS por
  falta de runner e aparecer como "fail" em gh pr checks. Confirme com
  gh api repos/.../actions/jobs/<id>: steps vazio significa que nunca rodou.

ACEITE HUMANO: Marcelo e Andreia NÃO participam. Não peça participação deles e
não invente homologação. O aceite permanece pendente.

ENTREGUE AO FINAL: relatório versionado com (1) SHA inicial/final, PRs e commits
por etapa; (2) matriz de rotas; (3) testes e comandos com resultado e ambiente,
separando estático, HTTP real, PostgreSQL real e aceite humano; (4) fluxos e
permissões preservados mais regressões encontradas e corrigidas; (5) lista
objetiva do que não foi concluído e por quê; (6) runbook do operador sem segredo
e sem operação destrutiva automática, declarando que não foi executado; (7) novo
prompt de continuação, se ainda restar trabalho.
```

---

## 8. Índice dos artefatos desta entrega

| Caminho | Conteúdo |
| --- | --- |
| `docs/UX-RELATORIO-FINAL-2026-10-05.md` | este relatório |
| `docs/UX-RELATORIO-FINAL-MATRIZ-ROTAS.csv` | matriz das 98 rotas do inventário |
| `docs/UX-03B-CRM-2026-10-05.md` | etapa UX-03B, com a reconciliação de #152/#153 |
| `docs/UX-04-RH-2026-10-05.md` | etapa UX-04 |
| `docs/UX-05-MARCELO-2026-10-05.md` | etapa UX-05 |
| `docs/ux-03b-evidencias/`, `docs/ux-04-evidencias/`, `docs/ux-05-evidencias/` | capturas e `resumo.json` |
| `src/components/ui/` | `UiState`, `UiBadge`, `UiCardLink`, `UiField`, `UiPanel`, `UiWorkspace.module.css` |
| `src/lib/crm-vocabulary.mjs`, `hr-vocabulary.mjs`, `adm-vocabulary.mjs` | vocabulários por domínio |
| `scripts/qa-ux-crm-postgres.mjs`, `qa-ux-hr-postgres.mjs`, `qa-ux-adm-postgres.mjs` | gates com PostgreSQL descartável |
| `scripts/ux-evidence-capture.mjs`, `ux-evidence-postgres.mjs` | arnês de evidência |
| `.github/workflows/ux-crm-delivery.yml`, `ux-hr-delivery.yml`, `ux-adm-delivery.yml` | gates de CI |

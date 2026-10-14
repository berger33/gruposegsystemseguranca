# UX-PRO-07B — escopo, baseline e medição anterior de `/admin/emergencial`

**Data:** 14/10/2026

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

**Fatia registrada aqui:** UX-PRO-07B-1 — leitura canônica e seleção do canal de apoio emergencial em `/admin/emergencial`, com habilitação honesta das ações de ativação.

## 1. Base realmente conferida

Conferência feita no checkout desta sessão, antes de qualquer edição de tela:

- branch de trabalho: `arena/5a204c5d-gruposegsystemseguranca` (única branch `arena/*` existente além de `main`; a branch preservada `arena/14fe7e70-…` não existe neste checkout e não foi tocada);
- `HEAD` local, `main` e `origin/main`: `d2b79e43e63d76336be7f1cf717d8164c07c5ec6` (merge da PR #222), confirmado por `git fetch origin --prune`, `git merge-base --is-ancestor` e `git branch -r --contains`;
- árvore de trabalho: limpa (`git status --porcelain` vazio) antes e depois de cada verificação;
- PRs abertas: **nenhuma** (`gh pr list --state open` vazio); a última PR da trilha é a #222, já `MERGED`;
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`;
- dependências instaladas com `npm ci` (81 pacotes, 0 vulnerabilidades);
- `node scripts/ux-pro-00-inventory.mjs --check` → `OK`, 100 entradas de rota; esta é contagem estática e não equivale a passagem visual, teste de estados ou aceite humano.

Foram lidos antes deste registro: `AGENTS.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`, `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`, `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, `docs/UX-PRO-07-PATRIMONIO-ESTADOS-2026-10-14.md`, os dois CSVs vigentes, `scripts/ux-pro-00-inventory.mjs`, `scripts/qa-ux-asset-postgres.mjs`, `tests/ux-asset-workspace.integration.test.mjs` e o código citado nas seções seguintes.

Nada de UX-PRO-07A foi reaberto: nenhum arquivo de `/admin/patrimonio` ou `src/lib/asset-request.ts` é tocado por esta fatia, e nenhuma asserção existente foi alterada.

## 2. Mapa da rota `/admin/emergencial`

| Item | Valor vigente | Fonte |
| --- | --- | --- |
| Entrada | `/admin/emergencial` (1 entrada de rota, `○ Static` no build) | `src/app/admin/emergencial/page.tsx`, saída de `npm run build` |
| Arquivos locais | 2 | `page.tsx`, `EmergencyWorkspace.tsx` |
| Guarda de UI | `AdminGate allowedRoles={["ti","admin"]}` | `page.tsx:12`; matriz estática em `tests/admin-page-gates.test.mjs:50` |
| Autorização real | `hasPermission` no servidor; permissões `emergency.read`, `emergency.write`, `emergency.test`, `emergency.activate` | `src/server/ext-emergency-api.mjs:34-58` |
| Leitura da lista | `GET /api/ext/emergency/channels` | `EmergencyWorkspace.tsx:10`; `ext-emergency-api.mjs:50` |
| Leitura do detalhe | `GET /api/ext/emergency/channels/:id` | `EmergencyWorkspace.tsx:14`; `ext-emergency-api.mjs:54` |
| Mutação de criação | `POST /api/ext/emergency/channels` com `Idempotency-Key` | `EmergencyWorkspace.tsx:12`; `ext-emergency-api.mjs:51` |
| Mutação de transição | `POST /api/ext/emergency/channels/:id/transition` (`em_teste`, `ativo`) | `EmergencyWorkspace.tsx:13`, `:27`, `:30`; `ext-emergency-api.mjs:52` |
| Mutação de teste | `POST /api/ext/emergency/channels/:id/tests` (`recebimento`, `atendimento`) | `EmergencyWorkspace.tsx:13`, `:28-29`; `ext-emergency-api.mjs:53` |
| Transições canônicas | `TRANSITIONS` em `ext-emergency-api.mjs:11`; ativação exige os dois testes bem-sucedidos | `ext-emergency-api.mjs:52` |
| Rotas legadas | handlers aposentados respondem 410 depois das guardas | `ext-emergency-api.mjs:56` |
| Gate herdado da rota | `npm run test:ext15-emergency:pg` (18 casos; unitário + integração PostgreSQL/HTTP) | `scripts/qa-ext15-emergency-postgres.mjs`, `tests/ext15-emergency*.test.mjs` |
| Captura visual | nenhuma | `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` |
| Workflow que alcance a rota | nenhum (as entradas `l06`/`l08` são baseline de compilação, não jornada da rota) | `.github/workflows/` |

Restrições de contrato que esta fatia não pode quebrar:

- `tests/ext15-emergency.test.mjs:24` exige que a UI continue declarando `não usa handlers legados como cobertura`, `não envia telefonema`, `registro interno declarado` e `Idempotency-Key`;
- `tests/admin-page-gates.test.mjs:50` exige `page.tsx` com `allowedRoles={["ti","admin"]}` na ordem publicada;
- `tests/ui-surface-locale.test.mjs` recusa `toLocale…String()` sem localidade explícita em `src/app` e `src/components`;
- `tests/ext15-emergency.integration.test.mjs` prova payload, idempotência, replay, concorrência, prontidão, ativação, auditoria e imutabilidade no servidor. Nenhuma dessas asserções é tocada.

## 3. Estados atuais de leitura — medição anterior

| ID | Medição anterior | Evidência `file:line` no SHA-base `d2b79e4` |
| --- | --- | --- |
| B1 | Não existe estado “ainda não lido”. `items` começa `[]` e a tela renderiza “Nenhum canal canônico configurado.” antes de qualquer resposta. | `EmergencyWorkspace.tsx:8`, `:33` |
| B2 | Uma única variável `error` (string) e uma única `message` atendem leitura e as quatro mutações; não há estado de carregamento em nenhum caminho. | `EmergencyWorkspace.tsx:8`, `:10-14`, `:20` |
| B3 | `load()` transforma falha em `Error(d.error || "Falha ao carregar canais")` e é capturada uma única vez no `useEffect`: sem classificação de rede/401/403/5xx, sem causa orientada à tarefa e sem repetição. | `EmergencyWorkspace.tsx:10-11` |
| B4 | Resposta 2xx malformada vira vazio falso: `setItems(d.items || [])`. | `EmergencyWorkspace.tsx:10` |
| B5 | Falha na releitura disparada por mutação deixa `items` intacto, mas o erro substitui a mesma faixa única: a hora da última leitura bem-sucedida não existe em nenhum lugar da tela. | `EmergencyWorkspace.tsx:10-13`, `:20` |
| B6 | `show()` ignora silenciosamente toda resposta não-OK e todo erro de rede (`if (r.ok) setDetail(d)`), então o painel “Trilha interna” simplesmente não aparece — sem causa, sem repetição, sem diferença entre “não lido” e “falhou”. | `EmergencyWorkspace.tsx:14`, `:34` |
| B7 | `selected` é um `string` livre: não há verificação de que o id selecionado pertence ao conjunto lido, e um id que desapareceu da lista continua selecionado. | `EmergencyWorkspace.tsx:8`, `:10`, `:26` |
| B8 | O detalhe não é lido ao carregar: só existe depois de o operador trocar o `select` ou depois de uma mutação bem-sucedida. | `EmergencyWorkspace.tsx:14`, `:26` |

## 4. Comportamento após falha transitória com dado previamente lido

| ID | Medição anterior | Evidência |
| --- | --- | --- |
| B9 | Não há marcação de dado desatualizado nem horário da última leitura. A única releitura automática vem das mutações; quando ela falha, o conteúdo antigo permanece na página sem qualquer aviso de que é antigo. | `EmergencyWorkspace.tsx:10-13`, `:33` |
| B10 | Não existe controle de releitura para leitura. O operador só consegue reler recarregando o navegador ou executando uma mutação. | `EmergencyWorkspace.tsx:16-34` (nenhum botão de leitura) |

## 5. Habilitação atual das ações principais

| ID | Medição anterior | Evidência |
| --- | --- | --- |
| B11 | Os quatro botões da jornada de ativação não têm `disabled`: ficam habilitados antes, durante e depois da leitura, inclusive quando ela falhou. | `EmergencyWorkspace.tsx:27-30` |
| B12 | Quando nenhum canal foi lido, o clique responde `Selecione um canal.` — o mesmo texto usado quando a leitura falhou ou ainda não começou. | `EmergencyWorkspace.tsx:13` |
| B13 | O `select` aceita somente valores vindos de `items`, mas nunca é desabilitado; com falha de leitura ele fica com a opção `Selecione` e o usuário não recebe explicação. | `EmergencyWorkspace.tsx:26` |
| B14 | O formulário de criação não depende de leitura prévia e envia `Registrar rascunho` com os campos padrão; esta fatia preserva esse comportamento (ver seção 11). | `EmergencyWorkspace.tsx:9`, `:12`, `:22-25` |

Medições de navegador (Chromium real, sessão `admin`, massa fictícia, servidor e PostgreSQL descartáveis):

| Medição | Resultado anterior |
| --- | --- |
| Antes da resposta da lista (com atraso injetado de 2,5 s) | vazio prematuro visível: **1** ocorrência; texto de carregamento: **0** |
| Depois da resposta com 1 canal | botões habilitados: **11 de 11** |
| Falha inicial HTTP 503 | alerta com o código cru `emergency_unavailable`; vazio prematuro ainda visível; `Tentar novamente`: **0**; botões ainda habilitados: **10** |
| 2xx malformada (`{note}` sem `items`) | vazio falso exibido: **1** |

## 6. Teclado: primeiro foco, percurso, semântica, foco visível e alvos

| ID | Medição anterior | Evidência |
| --- | --- | --- |
| B15 | Não há `onKeyDown`, `tabIndex`, chamada de `.focus()` nem semântica de lista/grades: o `select` é o único controle composto, e a lista de canais é uma sequência de `<article>` sem nome acessível de grupo. | `EmergencyWorkspace.tsx:5-35` (ausência); confirmado por busca no arquivo |
| B16 | O detalhe é um `<pre>` com JSON completo dentro de um `section` com `aria-label="Detalhe do canal"`; não há resumo legível nem separação entre trilha e diagnóstico. | `EmergencyWorkspace.tsx:34` |
| B17 | Os rótulos dos oito campos do formulário existem (`<label>` envolvendo o `input`), mas os campos não declaram ajuda, unidade ou obrigatoriedade visível. | `EmergencyWorkspace.tsx:15`, `:22-24` |
| B18 | Nenhuma tela desta rota tinha sido medida em navegador com teclado antes desta fatia. | CSV vigente: `marcadores_teclado = nao`, sem captura |

Medição de navegador (390 × 844, Chromium real):

- primeiro foco por `Tab` com contorno visível: **sim** (`AdminGate` → `Sair`);
- percurso completo alcança, na ordem: `Sair` → `Início` → âncoras de tarefa (`Configurar canal interno`, `Teste e ativação`, `Canais canônicos`) → 8 campos do formulário → `Registrar rascunho` → `Canal selecionado` → `Iniciar ciclo de testes` → `Registrar teste de recebimento bem-sucedido` → `Registrar teste de atendimento bem-sucedido` → `Marcar ativo (decisão humana)` → envelope do `nextjs-portal` → itens do menu lateral (**presentes no DOM e no percurso mesmo ocultos em 390 px**);
- todos os controles da própria tela medem **≥ 44 px** de altura (44 px nos botões e no `select`, 46 px nos `input`). Alvo pequeno **não** é defeito desta rota: o menor alvo de 24 px observado pertence ao envelope administrativo, fora do escopo desta fatia.

## 7. Responsividade medida (tema dia)

| Largura | Overflow do documento | Menor alvo na tela |
| --- | --- | --- |
| 1440 × 900 | **0 px** | 44 px |
| 768 × 1024 | **0 px** | 44 px |
| 390 × 844 | **122 px** | 44 px |
| 320 × 844 | **190 px** | 44 px |

Causa medida: a grade `repeat(auto-fit,minmax(320px,1fr))` de `EmergencyWorkspace.tsx:21` não cabe em 390/320 px, somada aos `padding: 24px` do envelope (`:16`) e às bordas/paddings internos (`:22`, `:26`). É o defeito de responsividade desta rota; não há tabela na página (`tabelas = 0`).

## 8. Tema dia/noite e contraste medido

| Elemento | Dia | Noite | Limite aplicável |
| --- | --- | --- | --- |
| Título `h1` | 15,54:1 | 12,92:1 | ≥ 4,5:1 ✔ |
| `kicker` “EXT-15 · F11” (`color:#64748b` fixo, `:17`) | 4,76:1 | **3,20:1** | ≥ 4,5:1 ✘ |
| Parágrafo de orientação (`:18`) | 6,18:1 | 7,96:1 | ≥ 4,5:1 ✔ |
| Aviso “Limite da prova” (`background:#fff7ed` fixo, `:19`) | 5,82:1 | **1,81:1** | ≥ 4,5:1 ✘ |
| Cartão de canal (`:33`) | 15,54:1 | 12,92:1 | ≥ 4,5:1 ✔ |
| Alerta de erro (`color:#b91c1c` fixo, `:20`) em falha inicial | — | **1,98:1** | ≥ 4,5:1 ✘ |

Cores fixas confirmadas no DOM durante o tema noturno: `rgb(100,116,139)` (kicker), `background: rgb(255,247,237)` (aviso), `border: 1px solid rgb(203,213,225)` (formulário e painel de ações), `border-top: 1px solid rgb(221,221,221)` (cartões) e `background: rgb(248,250,252)` (trilha). Em 768 px o tema noturno **não** produz overflow do documento (0 px).

Limitação: a medição de contraste é a razão calculada no navegador entre a cor computada do texto e a primeira cor de fundo opaca encontrada subindo o DOM; não é uma auditoria WCAG completa e não cobre estados de foco, seleção ou componentes montados depois.

## 9. Células vigentes dos dois inventários

`/admin/emergencial` está na linha 16 dos dois CSVs de 13/10/2026.

| Célula do inventário | Valor vigente |
| --- | --- |
| `papeis_declarados` / `papeis_no_menu` | `ti\|admin` / `admin\|ti` |
| `fonte_da_guarda` | `AdminGate com papeis declarados (UI; autorizacao fica na API)` |
| `layout` | `src/app/layout.tsx` |
| `arquivos_locais` | `2` |
| `componentes_ui_compartilhados` | `UiTaskWorkspace` |
| `estilos_ui_compartilhados` | *(vazio)* |
| `usa_admin_gate` / `escopo_tema_administrativo` | `sim` / `sim` |
| `tabelas` | `0` |
| `marcadores_demo` | `nao` |
| `estados_carregando` / `estados_erro` / `estados_vazio` | `nao` / `nao` / `sim` |
| `marcadores_teclado` | `nao` |
| `chamadas_locale_padrao` | `0` |
| `gate_baseline` | `admin-entry-delivery.yml\|backup-restore-delivery.yml\|ci.yml\|l04-delivery.yml\|l05-delivery.yml\|l06-delivery.yml\|l07-delivery.yml\|l08-delivery.yml` |
| `gates_automatizados` / `gates_jobs` | *(vazio)* / *(vazio)* |
| `capturas_viewports` / `capturas_stage` / `capturas_primeiro_foco` | *(vazio)* / *(vazio)* / `nao` |
| Matriz: `classe_evidencia` | `codigo` |
| Matriz: `lacuna` | `sem gate automatizado que alcance a rota ; sem captura visual ; tema noturno sem captura ; percurso de teclado nao verificado ; estados nao exercitados em navegador ; validacao manual e aceite humano nao registrados` |

O gate EXT-15 existe no repositório e é executado localmente, mas nenhum workflow com filtro `paths:` alcança `src/app/admin/emergencial/**`; por isso as células de gate/captura estão vazias (critério estático do gerador, seção 2).

## 10. Limitações explícitas desta medição anterior

- As medições de navegador vieram de um script **ad-hoc** executado fora do repositório (não versionado, não é gate): PostgreSQL descartável, `server.mjs --dev`, Chromium real, sessão `admin` provisionada pelo fluxo real de login, um canal fictício criado por HTTP. Não houve gate comitado antes da implementação.
- Foi medida apenas a identidade `admin`. Os outros papéis da rota (`ti`) e as negações 401/403 foram exercitados no servidor pelo gate herdado, não em navegador nesta medição.
- A massa é fictícia e o banco foi destruído ao final. Os números de overflow variam alguns pixels conforme o nome do canal (medido 108 px e 122 px em 390 px, 176 px e 190 px em 320 px).
- Não houve validação manual, homologação, revisão humana nem aceite humano. Nada aqui declara conformidade WCAG.

## 11. Fatia UX-PRO-07B-1 — incluído e excluído

### Incluído

1. **Leitura canônica da lista** (`GET /api/ext/emergency/channels`): “ainda não lido” honesto, carregamento contextual por recurso, vazio somente após resposta válida com causa/limite do recorte e próximo passo, falha inicial com causa real e repetição quando permitida, `401`/`403` falhando fechado, e 2xx malformada tratada como resposta inválida (nunca vazio).
2. **Seleção válida**: as opções do `select` vêm apenas de leitura bem-sucedida; o id selecionado precisa existir no conjunto lido; a seleção automática do primeiro canal é preservada; seleção inválida é declarada como tal.
3. **Leitura do detalhe** (`GET /api/ext/emergency/channels/:id`) amarrada à seleção: não lido, carregando, pronto, falha com repetição, preservação do último detalhe em falha transitória, `401`/`403` sem manter dado protegido visível e resposta malformada ≠ vazio. Conteúdo continua sendo a trilha canônica (`channel`, `tests`, `events`, `readiness`) apresentada como diagnóstico.
4. **Repetição real de leitura**: incluindo um controle aditivo de releitura da lista que executa exatamente o mesmo `GET` já usado na carga inicial. Nenhum verbo, URL, cabeçalho ou corpo novo de escrita é criado.
5. **Habilitação honesta**: os quatro botões da jornada de ativação (`Iniciar ciclo de testes`, dois `Registrar teste …`, `Marcar ativo (decisão humana)`) passam a exigir leitura bem-sucedida, não desatualizada e seleção válida; quando bloqueados, a tela declara o motivo (ainda não lido, lendo, falha, dado desatualizado, seleção inválida). Endpoints, métodos, corpos, `Idempotency-Key`, transições canônicas, autorização e auditoria permanecem idênticos.
6. **Apresentação**: tokens e classes compartilhados (`UiWorkspace.module.css`, `UiState`, `UiBadge`, `UiTaskWorkspace`) no lugar das cores fixas medidas na seção 8, corrigindo o overflow de 390/320 px e os contrastes noturnos medidos; `select` e botões continuam com alvo ≥ 44 px e foco visível.
7. **Prova**: gate focal aditivo (PostgreSQL descartável + HTTP real + Chromium) e workflow próprio, sem alterar as asserções herdadas.

### Excluído

- qualquer alteração de payload, método, corpo, cabeçalho, estado de domínio ou resposta das **mutações** (criação, testes, transições) e das rotas legadas;
- estados de envio pendente, prevenção de duplo clique e reconciliação de resultado das mutações (ficam para a subfatia seguinte da 07B);
- `src/server/ext-emergency-api.mjs`, `server.mjs`, RBAC, permissões, auditoria, migrações e tenancy;
- `page.tsx`, `AdminGate`, papéis declarados, metadados ou navegação;
- asserções herdadas de `tests/l06-delivery.integration.test.mjs`, `tests/l08-delivery.integration.test.mjs` e `tests/ext15-emergency*.test.mjs` (nenhuma é editada, removida ou relaxada);
- outras rotas da UX-PRO-07 e qualquer correção de UX-PRO-07A;
- validação manual, homologação, revisão humana e aceite humano.

O formulário de criação é mantido funcionalmente intacto nesta fatia: mesmos campos, mesmos atributos `required`, mesmo corpo, mesmo cabeçalho de idempotência e mesmas mensagens de retorno, agora apresentadas em região própria para não confundir falha de leitura com falha de escrita.

## 12. Gates herdados executados na base intacta (antes da implementação)

| Verificação | Resultado em `d2b79e4` |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit **0** |
| `node scripts/qa-wave0-static.mjs` | **5/5** verificações OK |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas |
| `npm run test:ext15-emergency:pg` (gate herdado da rota) | **18/18**, `EXT15_EMERGENCY_TEST_EXIT: 0`, `QA_EXT15_PG_TEMP_CLEANED: true` |
| `npm run test:l06-delivery:pg` | **9/9**, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | **51/51**, `L08_DELIVERY_TEST_EXIT: 0` |
| `npm run build` | exit **0**; `/admin/emergencial` presente como `○ Static` |
| `next-env.d.ts` / `tsconfig.json` após os gates Next | restaurados por `git checkout --`; SHA-256 finais `18b697c4…` / `2128c956…`; árvore limpa |

## 13. Prova exigida para encerrar a UX-PRO-07B-1

1. **Gate focal novo e estritamente aditivo** em `tests/ux-emergency-workspace.integration.test.mjs`, executado por `scripts/qa-ux-emergency-postgres.mjs` (PostgreSQL descartável, `DATABASE_URL` remoto recusado, migrações reais, servidor HTTP real, Chromium, limpeza confirmada mesmo em falha), provando: autorização e isolamento das leituras; leitura inicial; vazio honesto; falha inicial com repetição real; preservação em falha transitória de releitura com hora; recuperação após repetir; `403` depois do sucesso sem manter o dado anterior; resposta 2xx malformada ≠ vazio; bloqueio e habilitação das quatro ações com motivo declarado; preservação do payload e da transição canônica `rascunho → em_teste`; teclado e primeiro foco; 320/390/768/1440 px e tema noturno medidos.
2. O gate novo deve ser **executado primeiro contra a implementação anterior** e registrar o resultado em `docs/ux-pro-07-emergencial-evidencias/antes/`, sem fingir que isso é regressão de gate herdado.
3. **Preservação:** `npm run test:ext15-emergency:pg` continua 18/18 e nenhuma asserção herdada é editada.
4. **Evidências** em 320, 390, 768 e 1440 px, tema noturno, percurso de teclado, falha inicial, estado desatualizado, ação bloqueada e ação habilitada; `resumo.json` com `problems: []` em todas as entradas e registro de overflow, dimensões mínimas de alvo, contrastes, `firstFocus`, `percursoTeclado`, estado dos dados e motivo de bloqueio.
5. **Relatório depois** com tabela B1–B18 antes/depois por `file:line` do SHA-base e da implementação final, contratos preservados, gates executados e limitações.
6. **Inventário:** regenerar os dois CSVs apenas se as células justificadas mudarem; comparar de forma estruturada com os snapshots anteriores e provar que o diff se limita a `/admin/emergencial` (linha 16) e ao efeito do novo workflow. Nunca editar CSV à mão.
7. **Bateria completa** antes de fechar: `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run test:ext15-emergency:pg`, `npm run test:l06-delivery:pg`, `npm run test:l08-delivery:pg` e o gate focal novo; `git diff --check` limpo e os dois SHA-256 protegidos reconferidos depois de restaurar as alterações automáticas.

Este documento não é aprovação das fatias seguintes e não declara aceite humano. Uma PR desta fatia só pode ser mergeada depois de todos os checks visíveis verdes, estado mergeável confirmado (`MERGEABLE`/`CLEAN`) e revisão técnica automatizada publicada como comentário — sem alegar revisão humana.

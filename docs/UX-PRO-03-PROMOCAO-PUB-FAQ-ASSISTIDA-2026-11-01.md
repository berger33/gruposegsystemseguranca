# UX-PRO-03 — promoção "com prova" de `PubFaqAssistedClient` (PUB-02 / PUB-05)

**Data:** 2026-11-01
**Fatia:** 18ª promoção com prova do console de TI (`/admin/ti`)
**Componente promovido:** `src/app/admin/ti/PubFaqAssistedClient.tsx` (170 → 401 linhas) + `pub-faq-assistida-state.ts` (427 linhas) + `PubFaqAssistedClient.module.css` (43 linhas)
**Aba nova:** `pub_faq` — "FAQ assistida e segmentos" (31ª aba)
**Grupo:** Experiência e comunicação
**Commit:** ver `git log --oneline -1` no ramo `arena/4eede573-gruposegsystemseguranca`

---

## 1. Por que este componente, e não os nove candidatos medidos antes

A varredura de órfãos do console (28 componentes sem nenhum consumidor em
`src/app`) foi medida candidato a candidato **antes de qualquer código escrito**.
Nove foram descartados por dois motivos já registrados em
`tests/ux-pro-03-ti-reaudit.test.mjs`: dado de funcionário atrás da borda legada
de RH, ou dado que já tem outra superfície viva.

| Candidato | Linhas | Rotas medidas (sem consumidor em `src/app`) | O que já cobre o mesmo dado | Decisão |
|---|---|---|---|---|
| `EmpAdvanced2Client` | 331 | 11 rotas `/api/admin/hr/*` | borda legada de RH (`authorizeLegacyHrRequest`, exige `employees.read`) — proibida pela decisão do dono | **descartado** |
| `EmpOpsClient` | 288 | 8 rotas `/api/admin/hr/*` (ocorrências, escalas, procedimentos) | mesma borda legada de RH | **descartado** |
| `EmpPortalClient` | 283 | 7 rotas `/api/admin/hr/*` (ausências, jornada, escalas) | mesma borda legada de RH | **descartado** |
| `OpsClient` | 247 | 13 rotas `/api/hr/ops-*` | `/admin/operacao` (`OperacaoWorkspace.tsx`) escreve as mesmas tabelas por `/api/ops/*` | **descartado** |
| `EmpSelfClient` | 239 | 7 rotas `/api/admin/hr/*` (autoatendimento, uniformes, documentos) | mesma borda legada de RH | **descartado** |
| `ExtClient` | 224 | 13 rotas `/api/ext/*` planas (frota, terceiros, licitação, qualidade, satisfação) | `/admin/frota`, `/admin/terceiros`, `/admin/satisfacao` e `/admin/qualidade` já leem o mesmo dado pelas rotas canônicas (`/api/ext/fleet/vehicles`, `/api/ext/third-party/parties`, `/api/ext/satisfaction/surveys`, `/api/ext/quality/nonconformities`) | **descartado** |
| `OpsAdvancedClient` | 207 | 9 rotas `/api/hr/ops-*` | `/admin/operacao` (segunda superfície) | **descartado** |
| `CliClient` | 192 | 10 rotas `/api/hr/cli-*` | prefixo `/api/hr/` cai na borda legada de RH (`employees.read`) | **descartado** |
| `EmpProfileClient` | 102 | `/api/admin/employee/profile`, `/api/admin/hr/profile-updates` | borda legada de RH | **descartado** |
| `PubFaqAssistedClient` | 170 | `/api/admin/faq-assisted-rules`, `/api/admin/pub-faq-sessions`, `/api/admin/faq-handoff`, `/api/admin/pub-segments` | **nenhuma** — o único outro consumidor de `faq-assisted-*`, `pub-faq-*`, `faq-handoff` e `pub-segments` é o próprio roteador; preferência média, sessão, handoff e segmento não são dado de funcionário e não estão na borda de RH | **promovido** |

O critério é o mesmo das fatias anteriores: **uma segunda superfície para o
mesmo dado não é entrega, é dívida**. O arquivo promovido foi o próprio órfão
(não um irmão novo), para que a linha do inventário continue rastreável: órfãos
**29 → 28**.

## 2. Defeitos do protótipo (todos travados pelo teste focal e pelo gate)

| # | No protótipo | Efeito | Agora |
|---|---|---|---|
| 1 | um único `msg` para tudo, inclusive `"criando..."` | operador não distinguia erro de servidor de guardrail de sucesso | `classificarLista` (`ok/vazio/negado/falha/invalido`) + `pub-ok` e `pub-erro` em lugares distintos, com código e mensagem |
| 2 | `load()` com `catch{}` vazio | falha de leitura virava "tela sem registros" — negação apresentada como vazio | `data-situacao="negado"` para 401/403 e `"falha"` para erro, com texto explícito; o gate injeta 403 e mede |
| 3 | três botões de situação (`revisão`, `aprovar`, `publicar`) em **qualquer** regra | publicava sem revisão, "aprovava" arquivada | `TRANSICOES` + `proximosEstados`: só o próximo passo do ciclo; `motivo da mudança` é obrigatório e vai ao histórico |
| 4 | `reason: "Mudança status FAQ assistida para ..."` fixo no código | o histórico gravava frase da máquina, não do operador | campo `motivo da mudança`; o gate compara o texto digitado com `pub_faq_assisted_history.reason` |
| 5 | `is_approved: status==="publicado"` no PATCH | publicar marcava aprovação falsa e `is_approved`/`is_published`/`status` podiam divergir | decisão sobre o valor **final** da linha; publicar exige aprovação (409) e o gate lê `is_approved=false` na criação |
| 6 | `resolveHandoff` com `response` e `responsible_name` fixos | concluía handoff sem nada dito ao visitante | campo `resposta ao visitante`; o gate lê `pub_human_handoff_requests.response` com o texto digitado |
| 7 | `<input placeholder>` sem `<label>`, `<table>` de 11px dentro de `<details>`, sem caption/escopo | nome acessível inexistente; tabela ilegível em 320px | `<label>` para cada campo, listas com `data-testid`, `aria-live` no resultado, `aria-pressed` nas situações |
| 8 | sessão listada com `visitor_name` cru e nada de contato | operador não via o contato e, quando visse, veria o dado inteiro | contato **mascarado** (`•••••21`) em qualquer largura; o gate mede `doesNotMatch /98765/` e `endsWith("21")` |
| 9 | segmentos só listados (`<li>`), sem ação | a tela "fechava" PUB-02 no texto e não no fluxo | `Validar` e `Publicar` por segmento, com o 409 do servidor virando mensagem de tela |
| 10 | nenhuma validação de `rule_key` no cliente | chave inválida só era recusada pelo banco | `[a-z0-9_-]`, 2..64, com mensagem que cita hífen e sublinhado (ver §3.9) |

## 3. Defeitos do servidor — encontrados com sonda e corrigidos com prova

Todos medidos contra **PostgreSQL 17 real** e `server.mjs --dev` real (sonda não
versionada `.tmp-probe/probe.mjs`), nunca por leitura de código.

### 3.1 Criar sessão do visitante respondia 500 (token de 11 caracteres)

`generateToken` chamava `require('node:crypto')` dentro de um módulo **ESM**. O
`require` não existe ali: a chamada lançava, o `catch` caía em
`Math.random().toString(36).substring(2, 34)` e o `substring` devolvia **11**
caracteres — abaixo do CHECK `char_length(session_token) BETWEEN 20 AND 200`.

* medido no protótipo: `POST /api/pub/faq/sessions` → **500** `internal_error`,
  nenhuma linha gravada; sonda isolada do fallback: `len 11` (`"imwbl4pv3ie"`);
* depois: **201** com `session_token` hexadecimal de **32** caracteres
  (`^[0-9a-f]{32}$` conferido no gate);
* correção: `randomBytes` importado de `node:crypto`.

### 3.2 Publicar segmento sem validar deixava a página fora do ar

A leitura pública de segmentos filtra `is_published AND is_validated`, mas o
PATCH só olhava `is_published`. O operador publicava, a tela dizia "publicado" e
`/segmentos/[key]` não aparecia.

* medido: `PATCH {is_published:true}` → **200** com `is_validated=false`;
* depois: **409** `segment_must_be_validated_before_publish`, linha intacta;
  validar + publicar → **200**, e `GET /api/segments?type=empresa` público passa a
  devolver a chave nova (medido no gate);
* despublicar preserva `is_validated=true` (o gate confere e republica).

### 3.3 Regra podia ser publicada sem aprovação, no mesmo UPDATE

A condição antiga comparava `cur.is_approved` com o pedido:
`{status:'publicado', is_approved:false}` passava e gravava a linha publicada
com `is_approved=false`.

* medido: **200** com `status=publicado, is_approved=false`;
* depois: **409** `must_be_approved_before_publish`; e `is_published`/`status`
  incoerentes viram **400** `published_status_requires_publish` /
  `publish_requires_published_status` / `approval_status_conflict`.

### 3.4 Todo PATCH de situação respondia 500 (`42P08`)

O comando do protótipo usa `$2` como enum (`status=$2`) e como texto
(`$2 IN ('aprovado','publicado')`) na mesma sentença. O Postgres não consegue
deduzir um tipo único e recusa o comando inteiro:

* sonda RED executando a sentença original contra o banco real:
  `42P08 inconsistent types deduced for parameter $2`, linha permanece
  `rascunho`;
* efeito no produto: **nenhuma** transição de regra gravava; a tela mostrava
  `em_revisao` e o operador não tinha erro visível;
* depois: casts explícitos (`$2::pub_faq_assisted_status`, `$2::text`,
  `$5::boolean`, `$6::uuid`), e o ciclo inteiro
  `em_revisao → aprovado → publicado → arquivado` grava com autor e motivo.

### 3.5 Motivo do histórico vinha fixo do servidor

`reason` tinha padrão `'Atualização FAQ assistida'` e não era obrigatório.
Agora o motivo é do operador (10 a 1.000 caracteres) e `invalid_reason` recusa o
resto; a tela limpa o campo depois de cada gravação, então o gate preenche um
motivo por transição.

### 3.6 Handoff podia ser concluído sem resposta

`status='concluido'` não exigia `response`: o registro ficava concluído sem
nada dito ao visitante. Agora **400** `response_required`, e o gate lê a
resposta digitada em `pub_human_handoff_requests.response`.

### 3.7 `id` não-UUID virava 500

Qualquer `id` que não fosse UUID chegava ao Postgres (`22P02`) e o `catch`
genérico do roteador respondia 500. Agora **400** `invalid_id` nas quatro rotas
(regras, sessões, handoff, segmentos); `no_fields` cobre PATCH sem campo algum.

### 3.8 `R$` em regra de preço sensível era 500, não 400

O CHECK `no_invented_price` da migração 094 recusa valor em R$ em regra marcada
como preço sensível. O servidor não espelhava o CHECK: o operador recebia
`500 internal_error`. Agora **400** `sensitive_template_states_price`, com a
mesma frase visível na tela.

### 3.9 Chave com hífen era recusada pela tela e aceita pelo servidor

O módulo de estado nasceu com `/^[a-z0-9_]+$/`; o servidor aceita hífen. O
formulário recusava `qa-pub-…` em silêncio (o gate só via "regra não criada").
Corrigido **no cliente** (`/^[a-z0-9_-]+$/`, mensagem "hífen e sublinhado"),
porque o servidor está certo.

### 3.10 Limite declarado: o visitante continua sem porta

`server.mjs:2615` manda todo `/api/admin/…` para a guarda de T.I. antes do
despacho, então o ramo `isPublic` das leituras públicas de FAQ/segmento é
**inalcançável** hoje (o `/api/segments` público funciona porque o caminho é
`/api/segments`, fora do prefixo). Esta fatia **não** abre essa porta: mexe só na
tela do operador. Publicar uma regra a deixa pronta, não visível ao visitante.

## 4. Contrato da tela (`src/app/admin/ti/pub-faq-assistida-state.ts`, 427 linhas)

Funções puras, sem React, sem `fetch`, testáveis por `node --test` com
`stripTypeScriptTypes`:

| Export | Contrato |
|---|---|
| `SITUACOES_REGRA` / `TRANSICOES` / `proximosEstados` | ciclo `rascunho → em_revisao → aprovado → publicado → arquivado`, com `rejeitado` a partir de `em_revisao`; nenhum outro salto |
| `validarRegra(form)` | chave `[a-z0-9_-]{2,64}`, pergunta 5..500, resposta 20..5.000, categoria 3..100, `keywords` ≤20 de ≤50; guardrails de preço/cobertura/licença/prazo; `handoff_reason` 10..1.000 quando há transferência; espelho de `no_invented_price` |
| `validarTransicaoRegra(atual, destino, motivo)` | só o próximo passo; `publicado` exige `aprovado`; motivo 10..1.000 |
| `classificarLista(...)` | `ok / vazio / negado / falha / invalido` a partir de `status` HTTP e corpo |
| `mascararContato(valor)` | telefone/e-mail do visitante com só os 2 últimos dígitos |
| `ERROS` | **56** códigos (servidor + PUB-10), cada um com frase de tela |

## 5. Prova

### 5.1 Teste focal — `tests/ux-pro-03-ti-pub-faq-assistida-ui.test.mjs` (13 testes)

**13/13** verde. Quatro mutações medidas (cada uma derruba ≥1 teste, e o arquivo
volta ao original depois):

| Mutação | Resultado |
|---|---|
| `validarTransicaoRegra` sem as duas guardas de ciclo | **12/13** — falha "só o próximo passo do ciclo é oferecido e publicar exige aprovação" |
| servidor aceita publicar segmento não validado | **12/13** |
| tela lê regras por `/api/hr/faq-assisted-rules` (borda de RH) | **12/13** |
| token volta para `Math.random().toString(36)` | **12/13** |

### 5.2 Gate de navegador — `PUB-02/05` (PostgreSQL 17 + Chromium real)

`UX_PORTAL_TEST_PATTERN="PUB-02/05" npm run test:ux-portal:pg` → `ok 1`,
`# pass 1`, `# fail 0`, `UX_PORTAL_TEST_EXIT: 0` (~69 s). Sessões `ti` e `rh`
reais, cookie de equipe, banco migrado do zero:

| Verificação | Resultado medido |
|---|---|
| leitura anônima das quatro rotas | **401** |
| `rh` no console de T.I. | `data-admin-gate="forbidden"`, nenhum card `pub-faq` montado |
| `rh` nas quatro rotas | **403** `role_required` |
| padrões do rascunho | `status=rascunho`, `is_approved=false`, `is_published=false` (linha conferida no banco) |
| 5 guardrails antes do servidor | `R$` na resposta → erro citando `R$`; transferência humana sem motivo → erro citando transferência; contagem de linhas do banco **não muda** |
| publicar sem aprovar | **409** `must_be_approved_before_publish` |
| transição sem motivo | `pub-erro-motivo-transicao` com "10 a 1.000" |
| `em_revisao → aprovado → publicado → arquivado` | as quatro gravam; motivo digitado lido de volta em `pub_faq_assisted_history` |
| `session_token` | **201** com `^[0-9a-f]{32}$` |
| handoff concluído sem resposta | **400** `response_required` |
| handoff com resposta do operador | texto digitado lido de volta em `pub_human_handoff_requests.response` |
| segmento publicado sem validar | **409**; validar + publicar → **200**; despublicar mantém `is_validated=true`; `GET /api/segments?type=empresa` público traz a chave |
| contato do visitante | mascarado: sem `98765`, termina em `21` |
| negação injetada (403) | `data-situacao="negado"`, sem "Nenhum registro" |
| 320 / 390 / 1440 e 1440 à noite | `sobraDocumentoPx: 0` nos quatro retratos |

Evidências: `docs/ux-pro-03-pub-faq-assistida-evidencias/` — **12 PNGs** +
`resumo.json` com 12 entradas, `problems: []` e `sobraDocumentoPx: 0` em todas.

### 5.3 Suíte e guardas estáticas

* `npm test`: contagem declarada em `docs/STATUS-VIGENTE.md` (linha `| Testes |`);
* `npx tsc --noEmit`: limpo; `npm run build`: limpo;
* inventário TI: **31 abas com prova**, **18 promoções**, órfãos **28**,
  `promovidosSemSairDaClassificacao: 0`, `semDispatch: 0`, APIs literais 399;
* instantâneo versionado `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.{csv,json}`
  regenerado pelo script (número novo: `arquivos_locais` 93 → 94 e `<table>`
  43 → 41, consequência direta das listas que substituíram duas tabelas
  ilegíveis em 320px);
* gate completo do portal: cenários declarados em `docs/STATUS-VIGENTE.md`.

## 6. Limites declarados (não são promessas)

* **O visitante não vê a FAQ publicada**: a porta pública segue fechada pelo
  prefixo de T.I. (§3.10). Publicar prepara a base; não abre o site.
* **Não há envio real** de e-mail/WhatsApp para o handoff, nem integração com
  IA/RAG: a tela opera a base aprovada, não o motor de resposta.
* O servidor **não tem máquina de estados**: aceita qualquer `status` válido em
  qualquer momento; a ordem do ciclo é política desta tela. O que o servidor
  garante é coerência (`is_approved`/`is_published`/`status`) e histórico.
* `router` da igualdade `R$` é **espelho de CHECK**, não detector de intenção:
  texto como "a partir de mil reais" passa.
* Sem leitor de tela e sem Windows: teclado, foco e contraste medidos só no
  Chromium empacotado.
* **Sem aceite humano, sem homologação, sem UAT.** O retrato do inventário 222
  vai a **23/120/79**: PUB-02 e PUB-05 passam a ter gate de navegador citado,
  o que **não** é aceite de requisito.
* **Produção: NO-GO. Aceite humano: 0/222.**

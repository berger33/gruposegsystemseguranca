# UX-07 — Satisfação (EXT-06): workspace, vocabulário e gate

Data: 2026-10-06. Família desta fatia: **SATISFAÇÃO** (EXT-06), rota de produto
`/admin/satisfacao`, servidor canônico `src/server/ext-satisfaction-api.mjs`.
Base: `main` no commit `04390a8` (após o merge da PR #168, UX-07 Conhecimento).
Molde seguido: UX-07 Financeiro, Contratos, Inteligência comercial, Analytics,
Qualidade, Compliance e Conhecimento.

Uma família por PR. Um commit. Nenhuma migração criada ou alterada
(001–174 intactas). `server.mjs`, `src/server/ext-satisfaction-api.mjs`,
`src/server/cli-finance-api.mjs` e `db/migrations/**` **não** foram alterados.
Esta família não tem processo agendado: nenhum scheduler foi tocado.

## 0. Reconciliação de pendências antes de editar (ETAPA 0)

Antes de qualquer alteração, o estado remoto foi conferido:

- `gh pr list --state open` → **nenhuma PR aberta**. Nada a reconciliar, nada
  a reproduzir.
- PRs recentes da série: #165, #166 e #168 **merged**; #164 e #167 **closed**.
- **PR #167** (`arena/32d9d78c-gruposegsystemseguranca`, head `014bd7cc`) foi
  comparada contra `origin/main` arquivo a arquivo. O diff filtrado pelos
  arquivos de compliance é **vazio**, e o diff direto é regressivo
  (`15 files changed, 468 insertions(+), 1427 deletions(-)`): a PR apenas
  repetia um estado anterior ao merge de #166/#168. **Veredito: duplicada, sem
  conteúdo exclusivo**; foi corretamente fechada e **não** foi reproduzida.
  Recomendação registrada: remover a branch remota
  `arena/32d9d78c-gruposegsystemseguranca`, que continua no repositório.
- O clone estava raso (`depth 1`), o que impedia `git diff A...B`. Resolvido
  com `git fetch --unshallow origin main` (aditivo). **Nenhum**
  `git reset --hard`, **nenhum** `git clean`, nenhuma alteração local
  descartada.

## 1. Diagnóstico da tela anterior

`src/app/admin/satisfacao/SatisfacaoWorkspace.tsx` tinha **18 linhas**
minificadas, com **22 usos de `style`** (três objetos `React.CSSProperties` —
`box`, `input`, `button` — e um literal inline no `<main>`). Era funcional por
HTTP, mas a apresentação escondia o estado real do sistema — e um dos botões
nunca funcionou:

| Defeito observado | Consequência |
| --- | --- |
| **`start` enviava `{justification}`**: `mutate(..., op==="complete" ? {result} : {justification: result \|\| "Cancelamento explicitamente justificado pela gestão."})`. O servidor lê `note` em `start`. | O botão "Iniciar" **sempre** recebia 400 `note_required`. Defeito funcional real, não cosmético. |
| **A tela inventava o conteúdo do registro imutável**: sem texto, o cancelamento ia com a frase `"Cancelamento explicitamente justificado pela gestão."`. | Justificativa de registro append-only escrita pela interface, não por quem opera. |
| **Um único campo `result`** (com `placeholder`, sem `<label>`) compartilhado por **todos** os acompanhamentos da tela. | Impossível saber a qual acompanhamento o texto pertencia; sem rótulo acessível. |
| **Um `loading`/`error` único para duas leituras independentes** (`/surveys` e `/references`), num `Promise.all` com `if(!a.ok\|\|!b.ok) throw`. | A falha de UMA leitura apagava a outra. |
| **Falha de leitura virava lista vazia**: em falha, `items` continuava `[]` e `loading` virava `false`, então a frase `"Vazio real: nenhuma pesquisa canônica; migração sem seed."` era renderizada **junto** do erro. | O defeito central desta série: falha parecia ausência de dados. |
| Erro exibia o **código cru** do servidor (`setError(b.error \|\| r.status)`), com a chave de idempotência interpolada no meio da frase. | Quem opera lia `satisfaction_journey_unavailable` sem explicação nem ação. |
| Recusa 401/403 (`unauthorized`, `forbidden_role`) era exibida igual a qualquer falha. | Negado, falho e vazio eram indistinguíveis. |
| `new Date(r.responded_at).toISOString()` em data de resposta. | Formato técnico ISO em vez de pt-BR e, com valor ausente, **01/01/1970** na tela. |
| ENUMs crus: `generica`, `nps`, `csat`, `pendente`, `em_acao`, `aberta`, `concluida`. | Valor de banco apresentado como texto de produto. |
| `aggregate`, `criterion` e `empty_state` **devolvidos pelo servidor eram ignorados**; a tela escrevia sua própria frase de vazio. | O indicador honesto do servidor (denominador real + `absence:"sem_respostas"`) não chegava a quem opera. |
| `<pre>{JSON.stringify(detail.events,null,2)}</pre>` despejava a trilha inteira crua. | Trilha imutável sem leitura humana. |
| Nenhuma estrutura de abas; três `<section>` empilhadas; nenhum `UiState`. | Navegação por teclado e por leitor de tela sem marcos reais. |

O que o protótipo **fazia certo** e foi preservado como contrato: a chave de
idempotência criada por operação, **preservada após falha** e descartada só no
sucesso (`keys.current[op]=key` / `delete keys.current[op]`); a leitura de
detalhe por `inspect()`; e as frases de fronteira ("o portal do cliente recebe
projeção mínima; responsável, fatos, notas internas permanecem na fronteira
staff").

**Nenhum endpoint foi inventado.** Todas as URLs foram conferidas uma a uma
contra o dispatch real de `server.mjs` (~linhas 4385–4393) e contra o servidor
canônico. A única correção de chamada — `start` passando a enviar `note` — tem
evidência direta no código do servidor (`txt(b.note,3,1000)` em `handlePlan`) e
é provada por HTTP e no navegador pelo gate novo.

## 2. O que foi reescrito (apresentação, não contrato)

`SatisfacaoWorkspace.tsx` foi reescrito por completo (18 → 1.067 linhas):

- **zero `style` inline**; tudo em `UiWorkspace.module.css` (o módulo
  compartilhado **não** foi alterado: as 37 classes usadas já existiam);
- **quatro abas reais** (`tablist`/`tab`/`tabpanel`, roving tabindex,
  ←/→/Home/End, `aria-selected`, `aria-controls`, foco visível): "Pesquisas e
  indicador", "Configurar pesquisa", "Respostas da pesquisa", "Acompanhamento
  e trilha";
- **`UiState` por leitura independente** — lista + indicador, referências do
  formulário, e o detalhe (respostas, acompanhamentos e trilha) têm cada um seu
  estado de carregando / vazio / falha / negado, sem contaminação. O gate
  prova nos dois sentidos: com `/surveys` derrubada o formulário continua
  montado; com `/references` derrubada a tabela e os indicadores continuam
  montados;
- **falha nunca vira lista vazia nem indicador zero**: em falha ou recusa, a
  tabela, os três indicadores e o bloco do agregado simplesmente **não existem
  no DOM**, e o texto nega explicitamente a ausência ("isto não significa que
  não existam pesquisas registradas");
- recusa de permissão (`unauthorized`, `forbidden_role`, `forbidden`,
  `origin_forbidden`, `client_session_required`) é o estado **negado**,
  distinto de falha, com o código canônico no rodapé técnico e a frase "Menu
  não é autorização";
- todos os rótulos e tons vêm de `src/lib/satisfaction-vocabulary.mjs`; valor
  desconhecido de ENUM passa cru;
- **ausência honesta**: `Dado ausente`, `Média não calculada`, `Sem período
  apurado`, `Resposta ainda não registrada`, `Início pendente`, `Conclusão
  pendente`, `Sem janela de referência declarada`, `Sem responsável canônico
  ativo (o servidor falha fechado)` — nunca `01/01/1970`, nunca `0` inventado.
  O **zero real** do servidor (denominador do indicador, contadores de
  resposta e de acompanhamento) continua aparecendo como `0`;
- o indicador agregado passou a ser exibido **como o servidor o calcula**:
  fonte declarada (`cli_satisfaction_responses`), denominador, média (ou
  `absence:"sem_respostas"` → "Sem respostas registradas", nunca `0`), período
  apurado e o `criterion` canônico ("Resposta gera acompanhamento sem expor
  funcionário"). O `empty_state` do servidor é exibido como veio;
- **a tela parou de inventar conteúdo de registro**: o texto de início,
  resultado e justificativa vem de um campo rotulado **por acompanhamento**
  (`transitionText["plan-<id>"]`), e cada operação envia o campo que o servidor
  realmente lê (`note` / `result` / `justification`). Sem texto, o servidor
  recusa e a recusa é mostrada como veio;
- a chave de idempotência preservada é **mostrada a quem opera** junto do erro
  ("Chave preservada para repetição segura: `ext06-…`"), em vez de interpolada
  numa string;
- informação estruturada que o servidor acrescenta junto do código
  (`canonical` em `legacy_mutation_retired`, `hint`, `detail`) é agregada à
  explicação **sem alterar o código canônico**;
- a trilha imutável passou a ter o **tipo do evento traduzido** e a autoria
  (`actor_kind` → "Equipe interna" / "Cliente, pelo portal"); o conteúdo
  gravado continua como está, declarado como área legada.

Todos os URLs, métodos, corpos, cabeçalhos (`idempotency-key`) e o formato de
chave (`ext06-<op>-<uuid>`) foram preservados exatamente.

Arquivos novos da camada de apresentação:

- `src/lib/satisfaction-vocabulary.mjs` + `src/lib/satisfaction-vocabulary.d.mts`;
- `src/lib/satisfaction-request.ts` — devolve `{ ok: true, data } | { ok: false,
  error }` (e, em falha, `payload` cru para `hint`/`detail`/`canonical`),
  cobrindo falha de rede (`status: 0`), resposta sem JSON e status HTTP de
  erro, sem deixar exceção crua chegar à UI.

## 3. Códigos reais encontrados e método do levantamento

Método registrado (lição das fatias Financeiro/Contratos/Compliance):

```
grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-satisfaction-api.mjs \
  | sed -E "s/\(.*//" | sort | uniq -c
```

O comando **não devolve nada**, e isso é o resultado esperado: a família não
tem wrapper local algum (`bad()`, `unavailable()`, `new HttpError()`,
`new E()`) e **não** converte exceção em resposta — `readBody()` responde
direto com `json(res,400,{error:"invalid_request"})` e
`json(res,413,{error:"body_too_large"})` em vez de lançar. Todas as respostas
saem por `json(res, status, { error: '...' })`, inclusive os `deny` montados
dentro de `work()` e devolvidos por `mutate()`.

O extrator anti-deriva do teste continua casando os **quatro** formatos
conhecidos (literal, `new HttpError()/new E()`, wrapper `bad()/unavailable()` e
`Object.assign(new Error('x'),{status})`) para que a introdução futura de um
wrapper não passe despercebida — e o teste **fixa por asserção** que hoje
nenhum deles existe aqui. Antes de casar, o extrator remove os operandos de
`.includes('…')` e `[=!]==? '…'`: são valores de ENUM e nomes de método HTTP,
não códigos de erro.

### 3.1 Uma origem viva, uma origem morta — decisões registradas

1. **`src/server/ext-satisfaction-api.mjs`** — servidor canônico, religado em
   `server.mjs` por dispatch de `/api/ext/satisfaction/*` (~4385–4393), pelo
   portal do cliente (`/api/client/satisfaction-surveys`, ~3884) e pelos
   aliases legados (~3887 e ~4395). As sub-rotas foram mapeadas lendo o
   dispatch **antes** de alterar a apresentação.
2. **O recorte legado somente-leitura `handleLegacy` vive DENTRO do arquivo
   canônico** e continua religado: GET responde 200 com `items`, mutação
   responde **410 `legacy_mutation_retired`** com o campo `canonical`.
   **DECISÃO: `legacy_mutation_retired` ENTRA no vocabulário**, porque a rota
   está viva — e, por morar no arquivo canônico, já é medido pela mesma
   leitura, sem recorte por marcador (diferente de EXT-07, onde o recorte
   estava em outro arquivo).
3. **`src/server/cli-finance-api.mjs` ainda exporta
   `handleSatisfactionSurveys` e `handleSatisfactionActionPlans`**, com três
   códigos próprios (`satisfaction_surveys_unavailable`,
   `satisfaction_facts_unavailable`, `satisfaction_survey_unavailable`).
   `grep` em `server.mjs` confirma que **nenhuma rota chega a esses dois
   handlers**: EXT-06 assumiu o portal e os aliases `cli-satisfaction-*`.
   **DECISÃO: é origem MORTA e NÃO entra no vocabulário**, como no caso de
   analytics. O teste anti-deriva fixa a decisão nos dois sentidos: os três
   códigos não podem ser traduzidos, e os handlers não podem voltar ao
   dispatch sem refazer o levantamento.

### 3.2 O ternário de `handlePlan` (lição desta fatia)

Três códigos não aparecem como literal isolado: eles saem de um ternário
dentro do `if (!note)` de `handlePlan` —
`operation==="complete"?"result_required":operation==="cancel"?"justification_required":"note_required"`.
Eles só são medidos porque o extrator **limpa as comparações antes** de casar
`error:`; sem essa limpeza, as comparações `operation === "complete"` seriam
confundidas com valores e os três códigos ficariam sem tradução. O teste exige
explicitamente os três.

### 3.3 Total

**28 códigos**, todos traduzidos em `src/lib/satisfaction-vocabulary.mjs`, zero
duplicado, zero inventado: `audit_unavailable`, `body_too_large`,
`client_session_required`, `forbidden`, `forbidden_role`,
`idempotency_key_required`, `idempotency_key_reused`, `invalid_account_id`,
`invalid_account_target`, `invalid_reference`, `invalid_request`,
`invalid_response`, `invalid_scoped_link`, `invalid_survey_configuration`,
`justification_required`, `legacy_mutation_retired`, `method_not_allowed`,
`not_found`, `note_required`, `origin_forbidden`, `plan_not_found`,
`plan_terminal_or_invalid_transition`, `responsible_required`,
`result_required`, `satisfaction_journey_unavailable`,
`score_outside_declared_scale`, `survey_already_answered`, `unauthorized`.

O limiar do teste é `>= 28`: a perda de **um** código no levantamento falha o
gate, e acrescentar código novo sem tradução também falha.

### 3.4 Mensagens

`grep -n "message ===\|\.message ==\|message\.includes" src/app/admin/satisfacao`
confirmou que **nenhuma decisão da tela depende de mensagem**. As decisões por
código (`canRetry`, variante negado/erro) usam o código técnico preservado no
descritor.

### 3.5 ENUMs cobertos

Valor desconhecido preservado cru em todos os nove grupos: tipo da pesquisa (3,
migração 076 + validação do servidor), metodologia declarada (3, migração 152 —
`generica` existe justamente para **não** chamar de NPS/CSAT o que não é),
situação da pesquisa (5, 076 + `cancelada` da 152), situação do acompanhamento
(4, 076/142/152), origem da pesquisa (2, constraint da 152), origem do
acompanhamento (2, constraint da 142), `event_type` (5 — os dois literais que o
servidor grava mais os três montados por `acompanhamento_${operation}`),
`actor_kind` (2, constraint da 152), operador do limiar (1, fixado em `lte`
pelo servidor e pela migração) e a ausência nomeada pelo servidor
(`absence:"sem_respostas"`).

## 4. Permissões e rotas que NÃO mudaram

- `AdminGate` de `/admin/satisfacao` continua `["marcelo", "admin", "ti"]` —
  não foi alargado nem estreitado; `tests/admin-page-gates.test.mjs` e o teste
  novo fixam isso.
- **Quem decide é o servidor.** `staffGuard()` exige sessão de equipe (401
  `unauthorized`), papel em `["admin","marcelo","ti"]` (403 `forbidden_role`),
  origem própria na escrita (403 `origin_forbidden`) e identidade em UUID.
- **EXT-06 NÃO usa permissão granular por grant do lado da equipe**: a
  autorização é por sessão, papel e origem, dentro do próprio servidor
  canônico. Por isso **o gancho opcional `grants` do harness de evidência não
  foi usado** nesta etapa — ele seria no-op aqui. A concessão de acesso
  (`client_access_grants`) pertence ao **portal do cliente** e continua sendo
  exigida lá pelo servidor, sem participar da tela interna.
- "Menu não é autorização" é provado com papel real: nesta família a lista do
  AdminGate **coincide** com a do servidor, então o gate usa `rh` — um papel
  que o menu não deixaria entrar — e apresenta ao AdminGate uma sessão
  sintética **apenas para a tela montar**. A chamada canônica segue com o
  cookie real de `rh` e recebe **403 `forbidden_role` do servidor de verdade**.
  A simulação é só da apresentação do menu; a autorização nunca é simulada, e
  nenhum papel foi alargado para tornar o teste conveniente.
- Nenhuma rota foi criada, renomeada ou removida. Idempotência (com replay por
  `request_fingerprint` e `pg_advisory_xact_lock`), transação
  negócio+evento+auditoria (fail-closed com rollback + 503 `audit_unavailable`),
  proteção de origem, limite de corpo (413) e a projeção mínima do portal
  (`CLIENT_SURVEY_FIELDS`) permanecem como estavam.
- A leitura legada religada continua respondendo 200 e a escrita legada
  continua respondendo 410 `legacy_mutation_retired` — ambas conferidas pelo
  gate novo, sem alteração de servidor. **A tela não consome rota legada
  alguma** (o teste verifica URL por URL, ignorando comentários).

## 5. Ausência de migração

Nenhuma migração foi criada. As migrações 001–174 **não** foram alteradas — o
gate aplica todas, na ordem, num cluster PostgreSQL descartável, e o ledger
confere (`Migration ledger verified: 001–174`). As migrações da família (076,
142, 152) estão intactas, com suas triggers de imutabilidade de resposta, de
evento e de estado terminal. UX não justifica migração.

## 6. Testes e gates

Ambiente: Linux, Node 22, PostgreSQL **embutido e descartável**
(`embedded-postgres`), Chromium `@sparticuz/chromium` em `--single-process`,
baixa memória (`--max-old-space-size=1024`, um processo de teste por vez).
O gate recusa rodar com `DATABASE_URL`, `DATABASE_MIGRATION_URL` ou
`RUN_DATABASE_INTEGRATION_REMOTE` definidos. Falha injetada **somente** por
`page.addInitScript` sobre `window.fetch`; o servidor nunca é enfraquecido.
Crash de Chromium (SIGSEGV/alvo fechado) repete a sessão inteira;
`ERR_ASSERTION` nunca é repetido. A medição espera o **h1 real** ("Satisfação
do cliente e acompanhamento interno") e, dentro das abas, espera pelo
**conteúdo carregado** (protocolo na tabela, texto da resposta, trilha do
plano), nunca pelo contêiner que monta já em "Carregando" — lição da corrida
corrigida na fatia de Compliance (seção 6.1 daquele documento) e reforçada na
revisão da PR #168. As datas da massa são ancoradas no
`CURRENT_DATE` do **servidor** e o prazo exibido é comparado com o que o
servidor gravou, não com o relógio do processo de teste. O preparo imprime
marcas `UX_SATISFACTION_SETUP`.

| Verificação | Natureza | Resultado |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | estática | exit 0 |
| `node --test tests/ux-satisfaction-vocabulary.test.mjs` | estática (anti-deriva, servidor real + origem morta) | **16/16** |
| `node --test tests/ext06-satisfaction.test.mjs` (herdado) | estática | **8/8** |
| `node --test tests/cli11-satisfaction-portal.test.mjs` (herdado) | estática | **6/6** |
| `npm run test:unit` (inclui o vocabulário novo) | estática | **785/785** |
| `npm run test:ux-satisfaction:pg` (novo gate) | HTTP real + PostgreSQL real + Chromium real | **9/9**, exit 0 |
| `npm run test:ext06-satisfaction:pg` (gate herdado da família) | HTTP real + PostgreSQL real | **36/36**, exit 0, sem precisar de reparo |
| `npm run ux:evidence -- --stage=ux-07-satisfacao` | captura real, 1440×900 e 390×844 | exit 0, `problems: []` |
| Aceite humano | — | **PENDENTE.** Marcelo e Andreia não participaram e não foram solicitados. Nada aqui é homologação. |

### 6.1 O que o gate `test:ux-satisfaction:pg` prova, teste a teste

1. **contrato de servidor intacto**: 401 sem sessão e 403 `forbidden_role` com
   papel fora da lista, **sem vazar `surveys`** na negativa; 400 sem
   `idempotency-key`; 403 de origem cruzada; leitura legada ainda 200 e escrita
   legada ainda 410 `legacy_mutation_retired` com `canonical`;
2. **o corpo de cada transição é o que o servidor realmente lê**: `start` com
   `{justification}` → 400 `note_required`; `complete` com `{note}` → 400
   `result_required`; `cancel` com `{result}` → 400 `justification_required`;
   e o acompanhamento continua `aberta` depois das três recusas (a validação
   acontece antes de qualquer efeito). É a prova por HTTP do defeito corrigido;
3. **browser**: a recusa de papel vira estado **negado** com `(forbidden_role)`
   no rodapé — sem vazio, sem tabela, sem indicador, sem agregado;
4. **browser**: falha injetada (`satisfaction_journey_unavailable`, 503) na
   lista vira **falha** com botão de repetir — nunca "nenhuma pesquisa" — e o
   formulário, que depende de outra leitura, continua montado;
5. **browser**: falha injetada nas **referências** deixa a tabela e os
   indicadores intactos e remove o formulário (sem referências a tela não
   digita identidade): independência provada nos dois sentidos;
6. **browser**: 4 abas reais com roving tabindex, ←/→/Home/End e `aria-controls`;
7. **browser**: a jornada criada **pelas próprias APIs** (pesquisa NPS →
   resposta nota 2 pelo portal do cliente → acompanhamento aberto pelo próprio
   servidor → pesquisa CSAT nota 1 em conta sem responsável → pesquisa
   genérica sem resposta) aparece em português ("NPS declarado", "Em
   acompanhamento", "Aguardando resposta", "Derivado da resposta do portal",
   "Jornada canônica EXT-06", "Equipe interna", "Cliente, pelo portal"), com a
   regra declarada ("nota menor ou igual ao limiar (limiar 6); nota observada
   2"), os fatos canônicos, o responsável na fronteira staff, o prazo que o
   **servidor** gravou, e **sem valor cru de banco** nas listas e no detalhe;
   ausência honesta em três formas: "Resposta ainda não registrada", "Início
   pendente"/"Conclusão pendente"/"Dado ausente" e "Ausência de acompanhamento
   não é prova de satisfação" — nunca `01/01/1970`;
8. **browser**: a transição usa o texto de quem opera e preserva a chave —
   clicar "Iniciar" **sem** texto devolve a recusa real (`note_required`) com a
   chave `ext06-<plano>-start-<uuid>` visível para repetição segura e o plano
   intacto; escrever o registro e repetir usa a **mesma chave**, o servidor
   confirma (`em_andamento`, `started_by_identity` = identidade da sessão) e a
   trilha grava **exatamente o texto digitado**, não um texto inventado;
9. **browser**: 390 px sem transbordo horizontal.

### 6.2 Massa de teste: o que nasce em API e o que é provisionamento declarado

Tudo que é de EXT-06 nasce nas **próprias APIs canônicas, por HTTP**: pesquisa
(`POST /api/ext/satisfaction/surveys`), resposta do cliente
(`POST /api/client/satisfaction-surveys`) e transição do acompanhamento
(`POST /api/ext/satisfaction/plans/{id}/start`). Conta de cliente e concessão
de acesso nascem nas APIs canônicas do espaço do cliente
(`POST /api/admin/client-accounts`, `POST /api/admin/grants`) e a empresa em
`POST /api/crm/companies`. **Nenhuma linha de `cli_satisfaction_*` é escrita
por SQL.**

Três vínculos **não têm API canônica em nenhuma família** e ficam declarados
como provisionamento, nunca como regra de negócio de satisfação: identidade de
cliente + sessão do portal (autenticação, como no gate herdado da família), o
responsável canônico da empresa (`crm_companies.responsible_id`) e o elo
conta↔empresa (`client_accounts.crm_company_id`). O teste diz isso no
cabeçalho, em vez de fingir cobertura.

### 6.3 Bloqueio encontrado no ambiente e como foi resolvido (sem afrouxar nada)

A primeira execução do gate falhou em **todos** os testes de navegador com
`/tmp/chromium: error while loading shared libraries: libnspr4.so`. Causa:
`@sparticuz/chromium` **retorna cedo** quando `/tmp/chromium` já existe, sem
extrair o pacote `al2023.tar.br` com as bibliotecas — e `/tmp/chromium` havia
sido extraído antes, numa checagem de ambiente feita **sem**
`AWS_EXECUTION_ENV`. Limpar `/tmp/chromium` e repetir resolveu: a extração
passou a incluir as bibliotecas. **Nenhuma asserção foi enfraquecida e nenhum
arquivo do produto foi alterado** por causa disso. Em CI o `/tmp` começa limpo,
e o gate de Compliance usa exatamente o mesmo caminho.

## 7. Evidência visual

`docs/ux-07-satisfacao-evidencias/` (desktop 1440×900 e mobile 390×844, com
`resumo.json`): papel `admin`, banco limpo — o estado registrado é o **vazio
honesto**, e ele mostra bem a correção desta fatia:

- "A leitura funcionou e nenhuma pesquisa canônica está registrada." com o
  `empty_state` do próprio servidor ("Nenhuma pesquisa canônica; não há seed.");
- no indicador agregado, **"Respostas no denominador: 0"** (zero REAL do
  servidor) ao lado de **"Média das notas: Sem respostas registradas"**
  (ausência nomeada pelo servidor) — a distinção que o protótipo não fazia.

Foco visível e sem erro de console (`problems: []` nos dois viewports). O
bloqueio de fontes do Google aparece em `externalBlocked` e **não é falha**
(limitação de rede do sandbox, campo separado). A jornada com massa real está
coberta pelas capturas do gate (`UX_SATISFACTION_EVIDENCE_DIR`), não por esta
etapa — **cobertura parcial declarada**.

`scripts/ux-evidence-capture.mjs` ganhou apenas a etapa `ux-07-satisfacao`.

## 8. O que permaneceu legado, de propósito

1. **A leitura legada religada** (`/api/ext/satisfaction-surveys` e os aliases
   `cli-satisfaction-*`, ambos em `handleLegacy`) continua no servidor,
   continua respondendo 200 e **não** é consumida por esta tela, que usa só o
   namespace canônico. A escrita legada segue 410. O código desse recorte
   entrou no vocabulário porque a rota está viva.
2. **Os handlers mortos de `src/server/cli-finance-api.mjs` não foram
   removidos.** Remover código de servidor está fora do recorte de
   apresentação; o teste apenas **fixa que eles continuam fora do dispatch**.
3. **O conteúdo gravado nos eventos é trilha imutável.** A tela traduz o
   **tipo** do evento e a autoria, e declara o restante como área legada no
   próprio rodapé. Nada do histórico é reescrito.
4. **Responsável aparece como o servidor devolve** (`responsible_display_name`
   do `JOIN`); quando não há responsável canônico ativo, a tela diz que o
   servidor falha fechado, em vez de inventar um nome.
5. A tela continua **sem edição** de pesquisa após a criação, e **sem
   responder** no lugar do cliente: a resposta nasce no portal, é imutável no
   banco, e a tela não simula nota.

## 9. Limitações conhecidas

1. **Cobertura automatizada é parcial.** O gate focal cobre a jornada canônica
   EXT-06, a autorização por papel, os estados honestos, as abas, a transição
   com texto de quem opera e 390 px. **Não cobre** pelo navegador a conclusão e
   o cancelamento do acompanhamento (cobertos por HTTP no gate herdado, que
   também prova o estado terminal imutável), a criação de pesquisa pelo
   formulário ponta a ponta, viewports intermediários, nem conformidade WCAG
   integral.
2. A tradução de `hint`/`detail`/`canonical` estruturados é coberta por teste
   estático, não por browser.
3. **A evidência visual cobre apenas `/admin/satisfacao` como papel `admin`**,
   em 1440×900 e 390×844, com banco limpo — cobertura parcial declarada.
4. **Aceite humano está PENDENTE**, por decisão explícita. Marcelo e Andreia
   não participaram desta sessão e não foram solicitados. Nada neste documento
   é homologação, e nenhum aceite foi inventado.
5. **Nenhum teste com dados reais do negócio** foi executado: toda a massa é
   fictícia (domínios `.invalid`/`exemplo.invalid`), criada em cluster
   descartável, e nenhuma credencial ou dado pessoal aparece em captura ou PR.
6. **Revisão visual final pendente.**

## 10. Arquivos

Novos:

- `src/lib/satisfaction-vocabulary.mjs`, `src/lib/satisfaction-vocabulary.d.mts`
- `src/lib/satisfaction-request.ts`
- `tests/ux-satisfaction-vocabulary.test.mjs`
- `tests/ux-satisfaction-workspace.integration.test.mjs`
- `scripts/qa-ux-satisfaction-postgres.mjs`
- `.github/workflows/ux-satisfaction-delivery.yml`
- `docs/ux-07-satisfacao-evidencias/` (captura real)
- `docs/UX-07-SATISFACAO-2026-10-06.md` (este arquivo)

Alterados:

- `src/app/admin/satisfacao/SatisfacaoWorkspace.tsx` (reescrito)
- `scripts/ux-evidence-capture.mjs` (etapa `ux-07-satisfacao`)
- `package.json` (`test:ux-satisfaction:pg`; teste de vocabulário no `test:unit`)

**Não** alterados, de propósito: `src/app/admin/satisfacao/page.tsx`,
`src/app/cliente/app/satisfacao/page.tsx`,
`src/server/ext-satisfaction-api.mjs`, `src/server/cli-finance-api.mjs`,
`server.mjs`, `src/components/ui/UiWorkspace.module.css`, `db/migrations/**`,
`tsconfig.json` e `next-env.d.ts` (estes dois últimos são reescritos pelo
`next dev` durante os gates e foram restaurados com `git checkout --` antes do
commit).

## 11. Próxima fatia sugerida

Seguindo o roteiro acordado, a próxima família sem área pulada é **EXT-01 —
Frota** (`src/app/admin/frota`, ~631 linhas), depois terceiros (EXT-02, 751),
licitações (EXT-03, 968), fornecedores (EXT-04, 222 com `style` inline),
expansão (EXT-09, 828), continuidade (EXT-10), visual (EXT-12, 210),
relatórios (EXT-13, 173) e emergencial (EXT-15, 35). Depois delas, UX-08
(TI/RAG e mensagens públicas) e UX-09 (auditoria transversal e matriz de
aceite).

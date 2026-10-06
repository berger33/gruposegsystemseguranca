# UX-07 — Conhecimento (EXT-08): workspace, vocabulário e gate

Data: 2026-10-06. Família desta fatia: **CONHECIMENTO** (EXT-08, base de
conhecimento e procedimentos operacionais canônicos), rota de produto
`/admin/conhecimento`, servidor canônico `src/server/ext-knowledge-api.mjs`.
Base: `main` após o merge da PR #165 (UX-07 Compliance), commit `2691163`.
Molde seguido: UX-07 Financeiro, Contratos, Inteligência comercial, Analytics,
Qualidade e Compliance.

Uma família por PR. Um commit. Nenhuma migração criada ou alterada
(001–174 intactas; as da família — 086 e 160 — intactas). `server.mjs` e
`src/server/ext-knowledge-api.mjs` **não** foram alterados.

## 1. Diagnóstico da tela anterior

`src/app/admin/conhecimento/KnowledgeWorkspace.tsx` tinha 532 linhas e 58
`style={...}` (dois objetos `cardStyle`/`inputStyle` espalhados, mais estilos
soltos em `<main>`, botões, badges e `<li>`). Era funcional por HTTP, mas a
apresentação escondia o estado real do sistema:

| Defeito observado | Consequência |
| --- | --- |
| **Um único `error`/`loading` para três leituras independentes** (lista, detalhe com histórico, ciências). | A falha de uma leitura apagava ou mascarava as demais; nenhuma tinha estado próprio. |
| Falha de leitura escrevia o **código cru** do servidor na tela (`throw new Error(data.error …)` → `forbidden_role`, `database_error`). | Quem opera lia código técnico sem explicação nem ação. |
| **Falha de leitura virava lista vazia**: com `articles` em `[]` e `!loading`, "Nenhum procedimento encontrado com os filtros atuais." era renderizado **junto** do erro. | O defeito central que esta série corrige: falha parecia ausência de dados. |
| **Recusa silenciosa engolida**: `if (ackRes.ok) … else setAcknowledgments([])` — o 403 `forbidden_role` da lista de ciências virava lista vazia, sem dizer que houve recusa. | Negado era apresentado como "nenhum colaborador registrou ciência". |
| Recusa 401/403 da lista era exibida igual a qualquer falha. | Negado, falho e vazio eram indistinguíveis. |
| ENUMs crus na tela: `{art.status}` imprimia `rascunho`, `em_revisao`, `publicado`; o mapa de cores só conhecia 3 dos 5 estados. | Valor de banco apresentado como se fosse texto de produto. |
| Datas com `new Date(...).toLocaleDateString("pt-BR")` sem tratamento de ausência. | Ausência podia virar data inválida ou época. |
| Campos com `placeholder` no lugar de `<label>` (slug, título, resumo, conteúdo, tags, papéis). | Sem rótulo acessível; vocabulário do banco exposto a quem opera. |
| Papéis de acesso digitados como texto livre separado por vírgula. | O que o servidor aceita por lista fechada era adivinhado por quem opera. |
| O select de transição oferecia **as cinco transições sempre**, mesmo as que o ciclo do servidor recusa (409). | A tela prometia transição que o servidor nega. |
| Categoria oferecida por `<option>` fixo (`operacional`, `seguranca`, `rh`, `ti`, `compliance`) como se fosse taxonomia do servidor. | O servidor aceita TEXTO declarado (3–100); a tela inventava uma lista fechada. |
| Nenhuma estrutura de abas, nenhum `tablist`; página única com quatro `<section>` empilhadas. | Navegação por teclado e por leitor de tela sem marcos reais. |

O que o protótipo **fazia certo** e foi preservado como contrato: a chave de
idempotência era criada por operação, **preservada após falha** e descartada só
no sucesso (`keys.current[name]=key` / `delete keys.current[name]`), e todas
as URLs chamadas existem no dispatch real de `handle()` — **nenhuma rota
morta**, verificação feita URL a URL contra `server.mjs` (~linha 4410) e
contra o `handle()` do servidor canônico. Nenhum endpoint foi inventado.

## 2. O que foi reescrito (apresentação, não contrato)

`KnowledgeWorkspace.tsx` foi reescrito por completo:

- **zero `style` inline**; tudo em `UiWorkspace.module.css` (o módulo
  compartilhado não foi alterado);
- **quatro abas reais** (`tablist`/`tab`/`tabpanel`, roving tabindex,
  ←/→/Home/End, `aria-selected`, `aria-controls`, foco visível):
  "Procedimentos e versões", "Ciência da equipe", "Redigir e versionar",
  "Ciclo de vida";
- **`UiState` por leitura independente** — lista de procedimentos, detalhe da
  versão (artigo + histórico de revisões + versões do mesmo slug, uma única
  resposta do servidor) e ciências têm cada um seu estado de carregando /
  vazio / falha / negado, e nenhum contamina o outro (o gate prova: com
  `/acknowledgments` derrubada, lista e detalhe continuam montados);
- **falha nunca vira lista vazia nem indicador zero**: em falha ou recusa, a
  tabela e os quatro indicadores simplesmente não existem no DOM, e o texto da
  falha nega explicitamente a ausência ("isto não significa que não existam
  procedimentos registrados");
- recusa de permissão (`unauthorized`, `forbidden_role`,
  `draft_not_accessible`, `forbidden_by_role_scope`,
  `publish_permission_required`, `origin_forbidden`) é o estado **negado**,
  distinto de falha, com o código canônico no rodapé técnico e a frase
  "abrir a tela pelo menu não concede acesso" na própria tradução;
- todos os rótulos e tons vêm de `src/lib/knowledge-vocabulary.mjs`; valor
  desconhecido de ENUM passa cru;
- **o ciclo de vida apresentado é o do servidor**: `KB_NEXT_STATUS` é um
  espelho de `KB_TRANSITIONS` verificado por `deep-equal` no teste
  anti-deriva, e a aba "Ciclo de vida" só oferece as transições que o estado
  atual permite — o 409 `invalid_status_transition` continua sendo a palavra
  final, e o `current_status`/`allowed` estruturado que o servidor devolve é
  acrescentado à explicação sem alterar o código canônico;
- **categoria, etiquetas e slug são texto declarado**: a lista fechada
  inventada pelo protótipo foi removida; os filtros de categoria/etiqueta são
  texto livre executado pelo servidor, e os valores aparecem como foram
  escritos;
- papéis de acesso agora são **checkboxes da lista real do servidor**
  (`STAFF_ROLES`), com a regra real dita ("nenhum marcado = todos os papéis de
  equipe");
- ausência honesta: `Publicação pendente`, `Revisão pendente`, `Aprovação
  pendente`, `Não arquivado`, `Nenhuma etiqueta declarada`, `Só após
  publicação` e `Dado ausente` — nunca `01/01/1970`, nunca `0` inventado (o
  contador de ciências `ack_count` é zero REAL do servidor e continua
  aparecendo como `0`);
- a chave de idempotência preservada é mostrada a quem opera junto do erro
  ("Chave preservada para repetição segura"), em vez de interpolada numa
  string de erro.

Todos os URLs, métodos (`GET`/`POST`/`PATCH`), corpos, cabeçalhos
(`idempotency-key`) e formatos de chave (`ext08-<op>-<uuid>`) foram
preservados exatamente.

Arquivos novos da camada de apresentação:

- `src/lib/knowledge-vocabulary.mjs` + `src/lib/knowledge-vocabulary.d.mts`;
- `src/lib/knowledge-request.ts` — devolve `{ ok: true, data } | { ok: false,
  error }` (e, em falha, `payload` cru para `current_status`/`allowed`/
  `canonical`), cobrindo falha de rede (`status: 0`), resposta sem JSON e
  status HTTP de erro, sem lançar exceção crua para a UI.

## 3. Códigos reais encontrados e método do levantamento

Método registrado (lição das fatias Financeiro/Contratos):

```
grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-knowledge-api.mjs \
  | sed -E "s/\(.*//" | sort | uniq -c
```

O comando **não devolve nada**: a família não tem wrapper local algum
(`bad()`, `unavailable()`, `new HttpError()`, `new E()`). Todas as respostas
saem por `json(res, status, { error: '...' })`, inclusive os `deny` montados
dentro de `work()` e devolvidos por `executeMutation()`. O extrator
anti-deriva do teste continua casando os formatos conhecidos para que a
introdução futura de um wrapper não passe despercebida, e remove antes os
operandos de `.includes('…')` e `[=!]==? '…'` (valores de ENUM e nomes de
constraint, não códigos de erro).

### 3.1 Uma origem real, lida pelo teste

**`src/server/ext-knowledge-api.mjs`** — servidor canônico, religado em
`server.mjs` (~linha 4410) por dispatch único de `/api/ext/knowledge/*`. As
sub-rotas foram mapeadas lendo `handle()` **antes** de alterar a apresentação.

Diferente da fatia de compliance, **não há segunda origem**: as rotas legadas
(`/api/admin/hr/ext-knowledge-base`, `/api/crm/hr/ext-knowledge-base`,
`/api/hr/ext-knowledge-base`, `/api/ext/knowledge-base`, religadas em
`server.mjs` ~linha 4411) despacham para `handleLegacy()` **dentro do próprio
arquivo canônico** — a leitura legada reaproveita `handleListArticles` e a
escrita legada responde 410 `legacy_knowledge_writer_retired`, código que já
entra no levantamento da origem única. O handler antigo de conhecimento que
resta em `ext-advanced-api.mjs` **não está religado** para esta família, e o
teste fixa isso (nenhum `extAdvancedApi.handle*Knowledge` em `server.mjs`).

### 3.2 O ternário de `parseBody` (lição desta fatia)

Dois códigos **não** saem por `error: "..."` literal simples: `parseBody()`
alimenta o ternário
`error: bodyResult.large ? "body_too_large" : "invalid_body"`. O extrator casa
TODOS os literais dentro da expressão de `error:`, então ambos são medidos —
medir apenas o literal simples os teria deixado sem tradução. O teste fixa a
presença dos dois por asserção nominal.

### 3.3 Total

**27 códigos**, todos traduzidos em `src/lib/knowledge-vocabulary.mjs`, zero
duplicado, zero inventado: `archive_reason_required`, `article_not_found`,
`article_not_published_for_acknowledgment`, `audit_unavailable`,
`body_too_large`, `change_summary_required`, `database_error`,
`draft_not_accessible`, `forbidden_by_role_scope`, `forbidden_role`,
`idempotency_key_required`, `idempotency_key_reused`, `invalid_body`,
`invalid_category`, `invalid_content`, `invalid_id`, `invalid_slug`,
`invalid_status_transition`, `invalid_summary`, `invalid_target_status`,
`invalid_title`, `knowledge_mutation_failed`, `knowledge_route_not_found`,
`legacy_knowledge_writer_retired`, `origin_forbidden`,
`publish_permission_required`, `unauthorized`.

O limiar do teste ficou **logo abaixo** do real (`> 25` para 27): a perda de
um código no levantamento volta a falhar o gate.

### 3.4 Mensagens

Antes de traduzir, `grep -n "message ===\|\.message ==\|message\.includes"
src/app/admin/conhecimento` confirmou que **nenhuma decisão da tela dependia
de mensagem**. As decisões por código (`canRetry`, variante negado/erro) usam
o código técnico preservado no descritor.

### 3.5 ENUMs cobertos

Valor desconhecido preservado cru em todos: estado do ciclo de vida (5
valores, `ext_kb_status` da 086), origem do registro (2, constraint da 160),
os 9 `event_type` reais que o servidor grava (3 literais + `transicao_<um dos
cinco estados>` + `ciencia_registrada`), a origem da ciência
(`jornada_canonica`) e os 8 papéis de `STAFF_ROLES` (lidos do próprio servidor
pelo teste, papel a papel). O espelho do ciclo (`KB_NEXT_STATUS`) é comparado
por `deep-equal` com o `KB_TRANSITIONS` exportado pelo servidor.

**Categoria, etiqueta (tag) e slug NÃO são ENUM**: o servidor valida apenas
tamanho/formato (3–100, 1–50, `SLUG_REGEX`). Nenhuma taxonomia foi inventada;
a tela apresenta o texto declarado como foi escrito e o teste fixa a regra.

## 4. Permissões e rotas que NÃO mudaram

- `AdminGate` de `/admin/conhecimento` continua `["marcelo", "admin", "ti"]` —
  não foi alargado nem estreitado; `tests/admin-page-gates.test.mjs` e o teste
  novo fixam isso. `page.tsx` não foi tocado.
- **Quem decide é o servidor.** `guard()` em `src/server/ext-knowledge-api.mjs`
  exige sessão de equipe (401 `unauthorized`) e papel em `STAFF_ROLES`
  (403 `forbidden_role`); as leituras restritas têm recusas próprias
  (`draft_not_accessible`, `forbidden_by_role_scope`), a lista de ciências é
  só de `EDIT_ROLES` e publicar é só de `PUBLISH_ROLES`
  (403 `publish_permission_required`). Não há permissão granular por grant
  nesta rota (os grants `knowledge.*` da migração 160 existem no banco, mas o
  dispatch canônico decide por sessão e papel) — por isso o gancho opcional
  `grants` do harness de evidência **não foi usado** nesta etapa.
- "Menu não é autorização" é provado com casos reais desta família, papel a
  papel: `supervisor` (papel de equipe válido) recebe 403 `forbidden_role` na
  lista de ciências, 403 `draft_not_accessible` no rascunho e 403
  `forbidden_by_role_scope` no publicado fora do escopo; `rh`, que **edita**,
  recebe 403 `publish_permission_required` ao tentar publicar — editar não é
  publicar. Nenhum papel foi alargado para tornar o teste conveniente.
- Nenhuma rota foi criada, renomeada ou removida; idempotência (com replay por
  `request_fingerprint`), transação negócio+evento+auditoria (fail-closed com
  rollback + 503 `audit_unavailable`), proteção de origem, o versionamento
  imutável (editar publicado/arquivado cria NOVA versão) e a ciência por
  versão (`ON CONFLICT (kb_id, user_identity)`) permanecem como estavam.
- A leitura legada religada continua respondendo 200 e a escrita legada
  continua respondendo 410 `legacy_knowledge_writer_retired` — ambas
  conferidas pelo gate novo, sem alteração de servidor.

## 5. Ausência de migração

Nenhuma migração foi criada. As migrações 001–174 **não** foram alteradas — o
gate aplica todas, na ordem, num cluster PostgreSQL descartável, e o ledger
confere. As migrações da família (086, 160) estão intactas. UX não justifica
migração.

## 6. Testes e gates

Ambiente: Linux, Node 22, PostgreSQL **embutido e descartável**
(`embedded-postgres`), Chromium `@sparticuz/chromium` em `--single-process`,
baixa memória (`--max-old-space-size=1024`, um processo de teste por vez).
O gate recusa rodar com `DATABASE_URL`, `DATABASE_MIGRATION_URL` ou
`RUN_DATABASE_INTEGRATION_REMOTE` definidos. Falha injetada **somente** por
`page.addInitScript` sobre `window.fetch`; o servidor nunca é enfraquecido.
Crash de Chromium (SIGSEGV/alvo fechado) repete a sessão inteira;
`ERR_ASSERTION` nunca é repetido. A medição espera o **h1 real**
("Base de conhecimento e procedimentos operacionais"), não apenas o tablist.

| Verificação | Natureza | Resultado |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | estática | exit 0 |
| `node --test tests/ux-knowledge-vocabulary.test.mjs` | estática (anti-deriva, servidor real) | **16/16** |
| `node --test tests/ext08-knowledge*.test.mjs` (herdados) | estática + integração condicionada | **11/11** (14 casos de integração ficam `skipped` sem cluster, como projetado) |
| `npm run test:ux-knowledge:pg` (novo gate) | HTTP real + PostgreSQL real + Chromium | **9/9**, exit 0 |
| `npm run test:unit` (inclui o vocabulário novo) | estática | **780/780** |
| `npm run ux:evidence -- --stage=ux-07-conhecimento` | captura real, 1440×900 e 390×844 | exit 0, `problems: []` |
| Aceite humano | — | **PENDENTE.** Marcelo e Andreia não participaram e não foram solicitados. Nada aqui é homologação. |

O que o gate `test:ux-knowledge:pg` prova, teste a teste:

1. 401 sem sessão (sem vazar `items`), 400 sem `idempotency-key`, 403
   `origin_forbidden` de origem cruzada; leitura legada ainda 200 e escrita
   legada ainda 410 `legacy_knowledge_writer_retired` — contrato intacto;
2. "menu não é autorização", papel a papel: `admin` e `ti` leem as ciências;
   `supervisor` recebe da lista só o publicado dentro do escopo (sem vazar
   rascunho, aprovado nem escopo alheio) e 403 nas três leituras restritas;
   `rh` edita mas recebe 403 `publish_permission_required` ao publicar;
3. browser: a recusa (403 `forbidden_role` injetada na própria página) vira
   estado **negado** com "menu não concede acesso" e o código no rodapé — sem
   vazio, sem tabela, sem indicador;
4. browser: falha injetada (`database_error`, 503) vira estado de **falha**
   com botão de repetir — nunca "nenhum procedimento" — sem tabela e sem
   indicador zero;
5. browser: com só `/acknowledgments` derrubada, a falha fica na seção de
   ciências e **lista e detalhe continuam montados** (estados independentes);
6. browser: 4 abas reais com roving tabindex e ←/→/Home/End;
7. browser: a jornada completa criada **pelas próprias APIs** (criação →
   revisão → aprovação técnica → publicação → ciência de `ti` → edição do
   publicado virando v2 rascunho com a v1 imutável → procedimento com escopo
   por papel → procedimento parado em aprovado) aparece em português
   ("Publicado", "Rascunho", "Aprovado tecnicamente", "Jornada canônica
   EXT-08", "Jornada canônica de ciência", "TI", "Todos os papéis de equipe
   autenticados"), sem valor cru de banco nas listas, no detalhe e na tabela
   de ciências; o ciclo oferece só a transição permitida (publicado →
   arquivar);
8. browser: o rascunho v2 mostra "Publicação pendente", "Revisão pendente",
   "Aprovação pendente", "Não arquivado" e "Dado ausente", nunca 01/01/1970;
   a ciência da v2 é vazio honesto ("A leitura funcionou…") com o aviso de
   que o servidor recusa ciência fora da publicação;
9. browser: 390 px sem transbordo horizontal.

## 7. Evidência visual

`docs/ux-07-conhecimento-evidencias/` (desktop 1440×900 e mobile 390×844, com
`resumo.json`): papel `admin`, banco limpo — o estado registrado é o **vazio
honesto** ("A leitura funcionou e nenhum procedimento está registrado"), com
foco visível e sem erro de console (`problems: []` nos dois viewports). O
bloqueio de fontes externas, quando aparece, fica em `externalBlocked` e
**não é falha** (limitação de rede do sandbox, campo separado). A jornada com
massa real está coberta pelas capturas do gate
(`UX_KNOWLEDGE_EVIDENCE_DIR`), não por esta etapa — **cobertura parcial
declarada**.

`scripts/ux-evidence-capture.mjs` ganhou apenas a etapa `ux-07-conhecimento`.
O gancho opcional `grants` **não foi usado**: EXT-08 decide por sessão e
papel no dispatch canônico.

## 8. O que permaneceu legado, de propósito

1. **As rotas legadas religadas** (`/api/ext/knowledge-base` e equivalentes de
   RH) continuam no servidor, continuam respondendo 200 na leitura e 410 na
   escrita, e **não** são consumidas por esta tela, que usa só o namespace
   canônico (o teste verifica URL por URL).
2. **O `change_summary` do histórico é trilha imutável do servidor.** Frases
   gravadas como "Transição de rascunho para em_revisao" contêm o valor cru
   do estado DENTRO do texto gravado; a tela as apresenta como foram escritas
   e não reescreve histórico. O vocabulário traduz os CAMPOS (estado, origem,
   papel), nunca o conteúdo gravado — área legada declarada.
3. **O handler antigo de conhecimento em `ext-advanced-api.mjs`** permanece no
   arquivo, **não religado** para esta família; o teste anti-deriva falha se
   ele voltar ao `server.mjs`.
4. **Autor, revisor e aprovador aparecem como o servidor devolve** (nome
   quando há `JOIN`, identificador quando não há). Resolver nome em todos os
   pontos exigiria mudança de resposta do servidor — fora do recorte de
   apresentação.
5. A tela continua **sem exclusão** de procedimento: o ciclo canônico trata
   desativação por arquivamento com motivo, e a tela não finge o contrário.
6. Os grants `knowledge.*` da migração 160 existem no banco e **não são
   consultados** pelo dispatch canônico desta rota; a tela não finge
   permissão granular que o servidor não aplica aqui.

## 9. Limitações conhecidas

1. **Cobertura automatizada é parcial.** O gate focal cobre a jornada canônica
   EXT-08, a autorização por papel, os estados honestos, as abas e 390 px.
   **Não cobre** pelo browser a criação/edição/transição disparadas pela
   própria tela (cobertas por HTTP no gate e pelos testes herdados), o replay
   de idempotência pela interface, viewports intermediários, nem conformidade
   WCAG integral.
2. A tradução do complemento estruturado de `invalid_status_transition`
   (`current_status`/`allowed`) é coberta por teste estático, não por browser.
3. **A evidência visual cobre apenas `/admin/conhecimento` como papel
   `admin`**, em 1440×900 e 390×844, com banco limpo — cobertura parcial
   declarada.
4. **Aceite humano está PENDENTE**, por decisão explícita. Marcelo e Andreia
   não participaram desta sessão e não foram solicitados. Nada neste documento
   é homologação, e nenhum aceite foi inventado.
5. **Nenhum teste com dados reais do negócio** foi executado: toda a massa é
   fictícia e criada pelas próprias APIs, em cluster descartável.
6. **Revisão visual final pendente.**

## 10. Arquivos

Novos:

- `src/lib/knowledge-vocabulary.mjs`, `src/lib/knowledge-vocabulary.d.mts`
- `src/lib/knowledge-request.ts`
- `tests/ux-knowledge-vocabulary.test.mjs`
- `tests/ux-knowledge-workspace.integration.test.mjs`
- `scripts/qa-ux-knowledge-postgres.mjs`
- `.github/workflows/ux-knowledge-delivery.yml`
- `docs/ux-07-conhecimento-evidencias/` (captura real)
- `docs/UX-07-CONHECIMENTO-2026-10-06.md` (este arquivo)

Alterados:

- `src/app/admin/conhecimento/KnowledgeWorkspace.tsx` (reescrito)
- `scripts/ux-evidence-capture.mjs` (etapa `ux-07-conhecimento`)
- `package.json` (`test:ux-knowledge:pg`; teste de vocabulário no `test:unit`)

**Não** alterados, de propósito: `src/app/admin/conhecimento/page.tsx`,
`src/server/ext-knowledge-api.mjs`, `src/server/ext-advanced-api.mjs`,
`server.mjs`, `src/components/ui/UiWorkspace.module.css`, `db/migrations/**`,
`tsconfig.json` e `next-env.d.ts` (estes dois últimos são reescritos pelo
`next dev` durante os gates e foram restaurados com `git checkout --` antes
do commit).

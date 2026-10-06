# UX-07 — Qualidade (EXT-05): workspace, vocabulário e gate

Data: 2026-10-06. Família desta fatia: **QUALIDADE** (EXT-05), rota de produto
`/admin/qualidade`, servidor canônico `src/server/ext-quality-api.mjs`.
Base: `main` após o merge da PR #162 (UX-07 Analytics). Molde seguido:
UX-07 Financeiro, Contratos, Inteligência comercial e Analytics.

Uma família por PR. Um commit. Nenhuma migração criada ou alterada
(001–174 intactas). `server.mjs` e `src/server/ext-quality-api.mjs` **não**
foram alterados.

## 1. Diagnóstico da tela anterior

`src/app/admin/qualidade/QualidadeWorkspace.tsx` era um protótipo minificado
(36 linhas-fonte, linhas de centenas de colunas), funcional por HTTP mas com
defeitos de apresentação que escondiam o estado real do sistema:

| Defeito observado | Consequência |
| --- | --- |
| **Três objetos de estilo inline** (`box`, `input`, `button`) aplicados em ~30 `style={{...}}`; nenhuma classe compartilhada. | Inconsistência visual com o restante do admin; nada reaproveitável. |
| Falha de leitura escrevia o **código cru** do servidor na tela (`throw new Error(b.error)` → `forbidden`, `quality_journey_unavailable`). | Quem opera lia código técnico sem explicação nem ação. |
| **Falha de leitura virava lista vazia**: com `items === []` e `!loading`, a frase "Nenhuma não conformidade no backend canônico" era renderizada **junto** do erro. | O defeito central que esta série corrige: falha parecia ausência de dados. |
| Recusa 403 (`forbidden`, papel sem grant) era exibida igual a qualquer falha. | Negado, falho e vazio eram indistinguíveis. |
| **O botão "Criar ação" nunca funcionou**: postava para `/api/ext/quality/nonconformities/{id}/actions`, caminho que **não existe** em `server.mjs` (a rota religada real é `/nonconformities/{id}/responsibles/{responsavel}/actions`, linha 4365–4366), e não enviava `action_type`, que o servidor exige (3–100 caracteres). | A criação de ação corretiva pela tela era impossível; o `responsible_identity` escolhido ia no corpo e era ignorado. |
| Campos com `placeholder` em inglês no lugar de `<label>` (`title`, `description`, `category`, `evidence_type`…). | Sem rótulo acessível; vocabulário do banco exposto a quem opera. |
| `<pre>{JSON.stringify(...)}</pre>` despejava **JSON cru** de causas e verificações. | Dado ilegível, com chaves técnicas e UUIDs. |
| ENUMs crus na tela: `em_acao_corretiva`, `eficaz`, `media`, `pendente`. | Valor de banco apresentado como se fosse texto de produto. |
| `recurrence_count_derived||0` e ausências sem tratamento. | Ausência de dado podia virar `0` inventado. |
| Nenhuma estrutura de abas, nenhum `tablist`; página única com oito `<section>` empilhadas. | Navegação por teclado e por leitor de tela sem marcos reais. |

O que o protótipo **fazia certo** e foi preservado como contrato: a chave de
idempotência era criada por operação, **preservada após falha** e descartada
só no sucesso (`keys.current[op]=k` / `delete keys.current[op]`), e as frases
"não representam upload" e "Encerrar apenas com evidência e responsável"
declaravam a fronteira — tudo isso é fixado por `tests/ext05-quality.test.mjs`
e permaneceu literal na tela nova.

## 2. O que foi reescrito (apresentação, não contrato)

`QualidadeWorkspace.tsx` foi reescrito por completo:

- **zero `style` inline**; tudo em `UiWorkspace.module.css` (o módulo
  compartilhado não foi alterado);
- **quatro abas reais** (`tablist`/`tab`/`tabpanel`, roving tabindex,
  ←/→/Home/End, `aria-selected`, `aria-controls`, foco visível): "Não
  conformidades", "Nova não conformidade", "Ciclo de vida e registros",
  "Trilha e reincidência";
- **`UiState` por grupo de leitura independente** — a lista
  (`/nonconformities`), as referências de equipe (`/references`) e o detalhe
  (`/nonconformities/{id}`) têm cada um seu estado de carregando / vazio /
  falha / negado, e nenhum contamina o outro;
- **falha nunca vira lista vazia nem métrica zero**: em falha ou recusa, a
  tabela e os três indicadores simplesmente não existem no DOM, e o texto da
  falha nega explicitamente a ausência ("isto não significa que não existam
  não conformidades registradas");
- recusa de permissão (`forbidden`, `forbidden_role`,
  `forbidden_account_scope`, `unauthorized`) é o estado **negado**, distinto
  de falha, com o código canônico no rodapé técnico;
- todos os rótulos e tons vêm de `src/lib/quality-vocabulary.mjs`; valor
  desconhecido de ENUM passa cru;
- ausência honesta: `Encerramento pendente`, `Sem prazo declarado`,
  `Sem conta (escopo global)` e `Dado ausente` — nunca `01/01/1970`, nunca
  `0` inventado (o `0` do contador derivado de reincidência é um zero REAL do
  servidor e continua aparecendo);
- o array `missing` de `closure_prerequisites_missing` é traduzido item a
  item (`closureMissingList`) sem alterar o código canônico;
- a chave de idempotência preservada é mostrada a quem opera junto do erro
  ("Chave preservada para repetição segura"), em vez de interpolada numa
  string de erro.

**Única correção de chamada** (não de servidor): a criação de ação corretiva
passou a usar a rota real religada em `server.mjs` —
`POST /api/ext/quality/nonconformities/{id}/responsibles/{responsavel}/actions`
— com o payload real (`description`, `action_type`, e o trio
`due_date`/`due_date_source`/`due_date_base_date` quando houver prazo). O
protótipo chamava um caminho inexistente; nenhum endpoint foi inventado: a
rota está em `server.mjs` desde a religação EXT-05 e é exercitada pelo gate
herdado. Todos os demais URLs, métodos, corpos, cabeçalhos
(`idempotency-key`) e formatos de chave (`ext05-<op>-<uuid>`) foram
preservados exatamente.

Arquivos novos da camada de apresentação:

- `src/lib/quality-vocabulary.mjs` + `src/lib/quality-vocabulary.d.mts`;
- `src/lib/quality-request.ts` — devolve `{ ok: true, data } | { ok: false,
  error }` (e, em falha, `payload` cru para o `missing`), cobrindo falha de
  rede (`status: 0`), resposta sem JSON e status HTTP de erro, sem lançar
  exceção crua para a UI.

## 3. Códigos reais encontrados e método do levantamento

Método registrado (lição das fatias Financeiro/Contratos):

```
grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-quality-api.mjs \
  | sed -E "s/\(.*//" | sort | uniq -c
```

Resultado: a família **não** tem wrappers locais (`bad()`, `unavailable()`,
`new HttpError()`, `new E()`): todas as respostas saem por
`json(res, status, { error: '...' })`, inclusive os `deny` montados dentro de
`work()`/`mutation()`. O extrator anti-deriva do teste continua casando os
três formatos para que a introdução futura de um wrapper não passe
despercebida, e remove antes os operandos de `.includes('…')` e
`[=!]==? '…'` (valores de ENUM e códigos de PG, não códigos de erro).

Origem única: `src/server/ext-quality-api.mjs`, o único servidor da família
religado em `server.mjs` (namespace `/api/ext/quality/*` e os oito caminhos
legados exatos de leitura). Os handlers antigos foram removidos de
`src/server/ext-api.mjs` — `tests/ext05-quality.test.mjs` falha se voltarem —
portanto não há segunda origem a recortar.

**Total real: 34 códigos**, todos traduzidos em
`src/lib/quality-vocabulary.mjs`, zero duplicado, zero inventado:
`action_not_found`, `action_terminal`, `audit_unavailable`, `body_too_large`,
`client_account_not_found`, `closed_nonconformity_required`,
`closure_prerequisites_missing`, `explicit_operation_required`, `forbidden`,
`forbidden_account_scope`, `forbidden_role`, `idempotency_key_required`,
`idempotency_key_reused`, `invalid_action`, `invalid_cause`,
`invalid_client_account_id`, `invalid_closure`, `invalid_nonconformity`,
`invalid_recurrence`, `invalid_reference`, `invalid_request`,
`invalid_responsible_identity`, `invalid_status_transition`,
`invalid_verification`, `justification_required`, `legacy_mutation_retired`,
`method_not_allowed`, `nonconformity_closed`, `not_found`,
`origin_forbidden`, `predecessor_not_found`, `quality_journey_unavailable`,
`reason_required`, `unauthorized`.

O limiar do teste ficou **logo abaixo** do real (`> 32` para 34): a perda de
um código no levantamento volta a falhar o gate. Antes de traduzir mensagens,
`grep -n "message ===\|\.message ==\|message\.includes" src/app/admin/qualidade`
confirmou que **nenhuma decisão da tela dependia de mensagem**; as decisões
por código (ex.: `canRetry`, variante negado/erro) usam o código técnico
preservado no descritor.

ENUMs cobertos (valor desconhecido preservado cru): situação da NC (6 valores
da migração 085), gravidade (4), situação da ação (3, constraint da 151),
resultado da verificação (2), origem (2) e os 10 `event_type` reais que o
servidor grava, além dos 5 marcadores do array `missing`.

## 4. Permissões e rotas que NÃO mudaram

- `AdminGate` de `/admin/qualidade` continua `["marcelo", "admin", "ti"]` —
  não foi alargado nem estreitado; o teste fixa isso.
- Quem decide é o servidor: `ROLES=["admin","marcelo","ti"]` +
  grant granular `quality.read`/`quality.write` em `auth_permissions`, com
  escopo `global`/`organization`/`account` conferido por `hasPermission`
  (RBAC da migração 172). Menu não é autorização, e o gate browser prova:
  `ti` abre a tela e, com o grant revogado, recebe o estado **negado** do
  próprio servidor (403 `forbidden`), sem tabela e sem métrica.
- **EXT-05 não tem gatilho de provisionamento por papel** (a migração 172 só
  preservou operadores existentes na época). Por isso o gate e a captura de
  evidência provisionam o grant **explicitamente por SQL administrativo**, o
  mesmo caminho da suíte herdada `tests/ext05-quality.integration.test.mjs`.
  Nenhuma permissão nova foi criada e nenhum papel ganhou acesso novo.
- Nenhuma rota foi criada, renomeada ou removida; idempotência, transação
  negócio+evento+auditoria (fail-closed com rollback + 503) e isolamento por
  conta permanecem como estavam.

## 5. Ausência de migração

Nenhuma migração foi criada. As migrações 001–174 **não** foram alteradas —
o gate aplica todas, na ordem, num cluster PostgreSQL descartável, e o ledger
confere. UX não justifica migração.

## 6. Testes e gates

Ambiente: Linux, Node 22, PostgreSQL **embutido e descartável**
(`embedded-postgres`), Chromium `@sparticuz/chromium` em `--single-process`,
baixa memória (`--max-old-space-size=1024`, um processo de teste por vez).
O gate recusa rodar com `DATABASE_URL`, `DATABASE_MIGRATION_URL` ou
`RUN_DATABASE_INTEGRATION_REMOTE` definidos. Falha injetada **somente** por
`page.addInitScript` sobre `window.fetch`; o servidor nunca é enfraquecido.
Crash de Chromium (SIGSEGV/alvo fechado) repete a sessão inteira;
`ERR_ASSERTION` nunca é repetido. A medição espera o **h1 real**
("Qualidade e não conformidades internas"), não apenas o tablist.

| Verificação | Natureza | Resultado |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | estática | exit 0 |
| `node --test tests/ux-quality-vocabulary.test.mjs` | estática (anti-deriva, servidor real) | **13/13** |
| `node --test tests/ext05-quality.test.mjs` (herdado) | estática | **7/7**, pins preservados |
| `npm run test:ux-quality:pg` (novo gate) | HTTP real + PostgreSQL real + Chromium | **8/8**, exit 0, primeira execução, sem retry |
| `npm run test:unit` (inclui o vocabulário novo) | estática | **749/749** |
| `npm run test:ext05-quality:pg` (gate herdado da família) | HTTP real + PostgreSQL real | **38/38**, exit 0, sem precisar de reparo |
| `npm run ux:evidence -- --stage=ux-07-qualidade` | captura real, 1440×900 e 390×844 | exit 0, `problems: []` |
| Aceite humano | — | **PENDENTE.** Marcelo e Andreia não participaram e não foram solicitados. Nada aqui é homologação. |

O que o gate `test:ux-quality:pg` prova, teste a teste:

1. 401 sem sessão (sem vazar registro), 400 sem `idempotency-key`, 403 de
   origem cruzada — contrato intacto;
2. "menu não é autorização": `ti` lê com grant; com `quality.write` revogada
   a escrita é 403 `forbidden`; com `quality.read` revogada a leitura é 403;
   `admin` segue autorizado;
3. browser: recusa vira estado **negado** com o código `(forbidden)` no
   rodapé — sem vazio, sem tabela, sem métrica;
4. browser: falha injetada (`quality_journey_unavailable`, 503) vira estado
   de **falha** com botão de repetir — nunca "nenhuma não conformidade";
5. browser: 4 abas reais com roving tabindex e ←/→/Home/End;
6. browser: a jornada completa criada **pelas próprias APIs** (criação →
   análise → causa → ação com prazo justificado → conclusão → verificação
   eficaz → encerramento com evidência) aparece em português
   ("Encerrada", "Concluída", "Eficaz", "Jornada canônica EXT-05"), sem
   valor cru de banco na lista, no detalhe e nos rótulos da trilha;
7. browser: NC aberta sem registros mostra "Encerramento pendente",
   "Dado ausente" e vazios honestos ("A leitura funcionou…"), nunca
   01/01/1970;
8. browser: 390 px sem transbordo horizontal.

## 7. Evidência visual

`docs/ux-07-qualidade-evidencias/` (desktop 1440×900 e mobile 390×844, com
`resumo.json`): papel `admin` com grant provisionado, banco limpo — o estado
registrado é o **vazio honesto** ("A leitura funcionou e nenhuma não
conformidade está registrada"), com foco visível e sem erro de console. O
bloqueio de fontes do Google aparece em `externalBlocked` e **não é falha**
(limitação de rede do sandbox, campo separado). A jornada com massa real está
coberta pelas capturas do gate (`UX_QUALITY_EVIDENCE_DIR`), não por esta
etapa — cobertura parcial declarada.

Para esta etapa funcionar, `scripts/ux-evidence-capture.mjs` ganhou um gancho
**opcional** `grants` por alvo (seção 4: EXT-05 não tem gatilho de
provisionamento). O gancho é no-op para todas as etapas existentes, que não o
declaram.

## 8. O que permaneceu legado, de propósito

1. **Os caminhos legados de leitura** (`/api/ext/quality-nonconformities`,
   `/api/*/hr/ext-quality-*`) continuam religados no servidor e **não** são
   consumidos por esta tela; mutação legada segue 410.
2. **O resumo dos eventos da trilha** é texto gravado pelo servidor no
   momento da operação e às vezes contém o valor técnico do estado
   (ex.: "Estado alterado de em_analise para verificacao"). Reescrevê-lo
   seria alterar trilha imutável; a tela traduz o **tipo** do evento e
   declara essa área legada no próprio rodapé.
3. **O responsável canônico aparece como identificador** (UUID), como o
   servidor devolve; resolver nome exigiria chamada nova ou mudança de
   resposta do servidor — fora do recorte de apresentação.
4. A tela continua **sem edição** de título/descrição/categoria após a
   criação: o banco declara essa identidade imutável (migração 151), e a
   tela não finge o contrário.

## 9. Limitações conhecidas

1. **Cobertura automatizada é parcial.** O gate focal cobre a jornada
   canônica EXT-05, a autorização granular, os estados honestos, as abas e
   390 px. **Não cobre** o papel `marcelo`, escopo por conta no browser
   (coberto por HTTP no gate herdado), viewports intermediários, nem
   conformidade WCAG integral.
2. A tradução da lista `missing` de `closure_prerequisites_missing` é
   coberta por teste estático (`closureMissingList`), não por browser.
3. **A evidência visual cobre apenas `/admin/qualidade` como papel `admin`**,
   em 1440×900 e 390×844, com banco limpo — cobertura parcial declarada.
4. **Aceite humano está PENDENTE**, por decisão explícita. Marcelo e Andreia
   não participaram desta sessão e não foram solicitados. Nada neste
   documento é homologação, e nenhum aceite foi inventado.
5. **Nenhum teste com dados reais do negócio** foi executado: toda a massa é
   fictícia e criada pelas próprias APIs, em cluster descartável.
6. **Revisão visual final pendente.**

## 10. Arquivos

Novos:

- `src/lib/quality-vocabulary.mjs`, `src/lib/quality-vocabulary.d.mts`
- `src/lib/quality-request.ts`
- `tests/ux-quality-vocabulary.test.mjs`
- `tests/ux-quality-workspace.integration.test.mjs`
- `scripts/qa-ux-quality-postgres.mjs`
- `.github/workflows/ux-quality-delivery.yml`
- `docs/ux-07-qualidade-evidencias/` (captura real)
- `docs/UX-07-QUALIDADE-2026-10-06.md` (este arquivo)

Alterados:

- `src/app/admin/qualidade/QualidadeWorkspace.tsx` (reescrito)
- `scripts/ux-evidence-capture.mjs` (etapa `ux-07-qualidade` + gancho
  opcional `grants`)
- `package.json` (`test:ux-quality:pg`; teste de vocabulário no `test:unit`)

**Não** alterados, de propósito: `src/app/admin/qualidade/page.tsx`,
`src/server/ext-quality-api.mjs`, `server.mjs`,
`src/components/ui/UiWorkspace.module.css`, `db/migrations/**`,
`tsconfig.json` e `next-env.d.ts` (estes dois últimos são reescritos pelo
`next dev` durante os gates e foram restaurados com `git checkout --` antes
do commit).

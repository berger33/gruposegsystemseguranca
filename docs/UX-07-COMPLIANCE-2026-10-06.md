# UX-07 — Compliance (EXT-07): workspace, vocabulário e gate

Data: 2026-10-06. Família desta fatia: **COMPLIANCE** (EXT-07), rota de produto
`/admin/compliance`, servidor canônico `src/server/ext-compliance-api.mjs`.
Base: `main` após o merge da PR #163 (UX-07 Qualidade), commit `0cf5fb8`.
Molde seguido: UX-07 Financeiro, Contratos, Inteligência comercial, Analytics e
Qualidade.

Uma família por PR. Um commit. Nenhuma migração criada ou alterada
(001–174 intactas). `server.mjs`, `src/server/ext-compliance-api.mjs`,
`src/server/ext-advanced-api.mjs` e `src/server/ext-compliance-scheduler.mjs`
**não** foram alterados.

## 1. Diagnóstico da tela anterior

`src/app/admin/compliance/ComplianceWorkspace.tsx` tinha 522 linhas e 23
`style={{...}}` inline. Era funcional por HTTP, mas a apresentação escondia o
estado real do sistema:

| Defeito observado | Consequência |
| --- | --- |
| **Dois objetos de estilo inline** (`box`, `input`) aplicados em 23 `style={{...}}`, mais estilos soltos em `<main>`, botões e `<li>`. | Inconsistência visual com o restante do admin; nada reaproveitável. |
| **Um único `loading`/`error` para quatro leituras independentes** (`obligations`, `documents`, `tasks`, `action-plans`), carregadas num `Promise.all` com `if (!a.ok \|\| !b.ok \|\| ...) throw`. | A falha de UMA leitura apagava as outras três; nenhuma delas tinha estado próprio. |
| Falha de leitura escrevia o **código cru** do servidor na tela (`throw Error(x.error ...)` → `forbidden`, `compliance_journey_unavailable`). | Quem opera lia código técnico sem explicação nem ação. |
| **Falha de leitura virava lista vazia**: com `items` em `[]` e `!loading`, as frases "Nenhuma obrigação no backend canônico" e "Nenhum documento/referência canônica" eram renderizadas **junto** do erro. | O defeito central que esta série corrige: falha parecia ausência de dados. |
| Recusa 403 (`forbidden`, papel `marcelo` que o AdminGate deixa entrar) era exibida igual a qualquer falha. | Negado, falho e vazio eram indistinguíveis. |
| Campos com `placeholder` em inglês no lugar de `<label>` (`obligation_type`, `declared_source`, `applicability_justification`, `issue_date`…). | Sem rótulo acessível; vocabulário do banco exposto a quem opera. |
| ENUMs crus na tela: `vigente`, `a_vencer`, `substituida`, `aberta`, `em_andamento`, `corretivo`, `concluido`. | Valor de banco apresentado como se fosse texto de produto. |
| `privado {String(d.is_private)}` imprimia literalmente `true`. | Dado técnico vazando como texto de produto. |
| Transições de tarefa enviavam **texto sintético gerado pela tela** (`"Conclusão sintética registrada por staff para a tarefa ${t.id.slice(0,8)}"`) como `result`/`justification`. | A tela inventava o conteúdo do registro imutável no lugar de quem opera. |
| Transições de plano caíam num texto padrão quando o campo tinha menos de 10 caracteres. | Mesma invenção, com aparência de validação. |
| `b.facts.tasks_created` interpolado direto numa string, sem tratamento de ausência. | Ausência podia virar `undefined` na frase. |
| Nenhuma estrutura de abas, nenhum `tablist`; página única com cinco `<section>` empilhadas. | Navegação por teclado e por leitor de tela sem marcos reais. |

O que o protótipo **fazia certo** e foi preservado como contrato: a chave de
idempotência era criada por operação, **preservada após falha** e descartada só
no sucesso (`keys.current[name]=key` / `delete keys.current[name]`), e as
frases sobre a fronteira documental declaravam que a referência não é upload.

**Nenhuma rota morta.** Diferente da fatia de Qualidade (onde o botão "Criar
ação" postava para um caminho inexistente), todas as URLs que o protótipo de
compliance chamava existem no dispatch real de `handle()`. A verificação foi
feita URL a URL contra `server.mjs` e contra o `handle()` do servidor canônico.
Nenhuma correção de chamada foi necessária e **nenhum endpoint foi inventado**.
As leituras de detalhe (`/documents/{id}`, `/action-plans/{id}`) e de execução
agendada (`/schedule`) já existiam no servidor e passaram a ser consumidas.

## 2. O que foi reescrito (apresentação, não contrato)

`ComplianceWorkspace.tsx` foi reescrito por completo:

- **zero `style` inline**; tudo em `UiWorkspace.module.css` (o módulo
  compartilhado não foi alterado);
- **cinco abas reais** (`tablist`/`tab`/`tabpanel`, roving tabindex,
  ←/→/Home/End, `aria-selected`, `aria-controls`, foco visível): "Obrigações e
  referências", "Registrar e renovar", "Tarefas de vencimento", "Planos de
  ação", "Execução agendada";
- **`UiState` por grupo de leitura independente** — obrigações, referências,
  tarefas, planos, detalhe da referência, detalhe/trilha do plano e execução
  agendada têm cada um seu estado de carregando / vazio / falha / negado, e
  nenhum contamina o outro (o gate prova: com `/obligations` derrubada, a
  tabela de referências continua montada);
- **falha nunca vira lista vazia nem indicador zero**: em falha ou recusa, a
  tabela e os três indicadores simplesmente não existem no DOM, e o texto da
  falha nega explicitamente a ausência ("isto não significa que não existam
  obrigações declaradas");
- recusa de permissão (`forbidden`, `unauthorized`) é o estado **negado**,
  distinto de falha, com o código canônico no rodapé técnico;
- todos os rótulos e tons vêm de `src/lib/compliance-vocabulary.mjs`; valor
  desconhecido de ENUM passa cru;
- ausência honesta: `Sem vencimento declarado`, `Avaliação ainda não
  executada`, `Conclusão pendente`, `Início pendente`, `Término não
  registrado`, `Sem intervalo declarado` e `Dado ausente` — nunca
  `01/01/1970`, nunca `0` inventado (os contadores da avaliação temporal são
  zeros REAIS do servidor e continuam aparecendo como `0`);
- **a tela parou de inventar conteúdo de registro**: o resultado da conclusão e
  a justificativa do cancelamento (tarefa e plano) agora vêm de um campo
  rotulado preenchido por quem opera. O servidor continua validando tamanho e
  recusando o que não atende — o que mudou é que a tela não escreve mais o
  texto no lugar da pessoa;
- a chave de idempotência preservada é mostrada a quem opera junto do erro
  ("Chave preservada para repetição segura"), em vez de interpolada numa
  string de erro;
- `hint` e `detail` estruturados que o servidor devolve junto do código
  (`current_document_exists`, `invalid_plan_type`, `invalid_transition`) são
  acrescentados à explicação sem alterar o código canônico.

Todos os URLs, métodos, corpos, cabeçalhos (`idempotency-key`) e formatos de
chave (`ext07-<op>-<uuid>`) foram preservados exatamente.

Arquivos novos da camada de apresentação:

- `src/lib/compliance-vocabulary.mjs` + `src/lib/compliance-vocabulary.d.mts`;
- `src/lib/compliance-request.ts` — devolve `{ ok: true, data } | { ok: false,
  error }` (e, em falha, `payload` cru para `hint`/`detail`), cobrindo falha de
  rede (`status: 0`), resposta sem JSON e status HTTP de erro, sem lançar
  exceção crua para a UI.

## 3. Códigos reais encontrados e método do levantamento

Método registrado (lição das fatias Financeiro/Contratos):

```
grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-compliance-api.mjs \
  | sed -E "s/\(.*//" | sort | uniq -c
```

O comando **não devolve nada**: a família não tem wrapper local algum
(`bad()`, `unavailable()`, `new HttpError()`, `new E()`). Todas as respostas
saem por `json(res, status, { error: '...' })`, inclusive os `deny` montados
dentro de `work()` e devolvidos por `mutate()`. O extrator anti-deriva do teste
continua casando os três formatos para que a introdução futura de um wrapper
não passe despercebida, e remove antes os operandos de `.includes('…')` e
`[=!]==? '…'` (valores de ENUM, nomes de constraint e códigos de PG, não
códigos de erro).

### 3.1 Duas origens reais, ambas lidas pelo teste

1. **`src/server/ext-compliance-api.mjs`** — servidor canônico, religado em
   `server.mjs` (~linha 4399) por dispatch único de `/api/ext/compliance/*`.
   As sub-rotas foram mapeadas lendo `handle()` **antes** de alterar a
   apresentação. **33 códigos** por `error:` literal.
2. **O recorte `// EXT-07 compliance` … `// EXT-08 base conhecimento` de
   `src/server/ext-advanced-api.mjs`** (`handleComplianceDocuments`) — rota
   legada de leitura que **continua religada** em `server.mjs` (~linha 4407).
   Diferente do caso de analytics, é origem **viva**, não preventiva.
   Acrescenta **`legacy_writer_retired`** (`forbidden` e `unauthorized` já
   existem no canônico). O teste falha se um dos dois marcadores sumir, em vez
   de medir um pedaço errado do arquivo.

### 3.2 A quarta regra de extração (lição desta fatia)

Três códigos **não** saem por `error:` literal: `readBody()` lança
`Object.assign(new Error('codigo'), { status })` e `mutate()` responde com
`json(res, error.status, { error: error.message })`. São `body_too_large`,
`invalid_json` e `object_required` — códigos REAIS do contrato, exercitados
pelo gate herdado (`tests/ext07-compliance.integration.test.mjs` cobre 400 e
413). Medir apenas um formato os teria deixado sem tradução. O extrator ganhou
uma quarta regra, e o documento registra o motivo.

### 3.3 Total

**37 códigos**, todos traduzidos em `src/lib/compliance-vocabulary.mjs`, zero
duplicado, zero inventado: `action_plan_not_found`, `audit_unavailable`,
`body_too_large`, `cancellation_justification_required`,
`completion_requires_responsible_and_result`, `completion_result_required`,
`compliance_journey_unavailable`, `conflict`, `current_document_exists`,
`document_not_found`, `forbidden`, `idempotency_key_required`,
`idempotency_key_reused`, `invalid_action_plan`, `invalid_document`,
`invalid_due_date`, `invalid_json`, `invalid_obligation`, `invalid_plan_type`,
`invalid_root_cause`, `invalid_task`, `invalid_transition`, `invalid_validity`,
`issue_date_in_future`, `legacy_document_not_renewable`,
`legacy_writer_retired`, `method_not_allowed`, `obligation_not_found`,
`object_required`, `private_reference_required`,
`renewal_justification_required`, `renewal_requires_current_validity`,
`responsible_staff_missing`, `responsible_staff_required`, `task_not_found`,
`terminal_document_not_renewable`, `unauthorized`.

O limiar do teste ficou **logo abaixo** do real (`> 35` para 37, mais um piso
de `>= 33` só no canônico): a perda de um código no levantamento volta a falhar
o gate.

### 3.4 O scheduler

`src/server/ext-compliance-scheduler.mjs` é processo de fundo e **não tem
código HTTP próprio** (zero `error:` literal — verificado e fixado por
asserção no teste novo). **Não foi alterado**, e
`tests/ext-compliance-scheduler.test.mjs` continua passando.

### 3.5 Mensagens

Antes de traduzir, `grep -n "message ===\|\.message ==\|message\.includes"
src/app/admin/compliance` confirmou que **nenhuma decisão da tela dependia de
mensagem**. As decisões por código (`canRetry`, variante negado/erro) usam o
código técnico preservado no descritor.

### 3.6 ENUMs cobertos

Valor desconhecido preservado cru em todos: situação da referência (6 valores,
086 + `substituida` da 155), tipo de compliance (5, 086), situação da obrigação
(7, constraint da 153), criticidade (4, 153), situação da tarefa (4, 153),
situação do plano (4, 168), tipo de plano (2, 168), tipo de referência (4,
`REFERENCE_TYPES` do servidor), origem (2, constraint da 153), resultado e
origem da execução agendada (2 + 1, 156), os 11 `event_type` reais que o
servidor grava e o motivo real de `failed_closed`.

## 4. Permissões e rotas que NÃO mudaram

- `AdminGate` de `/admin/compliance` continua `["marcelo", "admin", "ti"]` —
  não foi alargado nem estreitado; `tests/admin-page-gates.test.mjs` e o teste
  novo fixam isso.
- **Quem decide é o servidor.** `staff()` em `src/server/ext-compliance-api.mjs`
  exige sessão de equipe (401 `unauthorized`) e papel em `["admin","ti"]`
  (403 `forbidden`), antes de qualquer despacho.
- **EXT-07 NÃO usa permissão granular por grant** (`auth_permissions`) e não
  tem gatilho de provisionamento por papel: a autorização é por sessão e papel,
  dentro do próprio servidor canônico. Por isso **o gancho opcional `grants` do
  harness de evidência não foi usado** nesta etapa — ele seria no-op aqui — e
  **nenhum grant é provisionado por SQL** no gate. Nada foi reimplementado.
- "Menu não é autorização" é provado com um caso real desta família: o papel
  **`marcelo` está em `allowedRoles`** do AdminGate e abre a tela, mas o
  servidor canônico **não o aceita** e recusa sozinho com 403 `forbidden`, na
  leitura e na escrita. Nenhum papel foi alargado para tornar o teste
  conveniente.
- Nenhuma rota foi criada, renomeada ou removida; idempotência (com replay por
  `request_fingerprint`), transação negócio+evento+auditoria (fail-closed com
  rollback + 503 `audit_unavailable`), proteção de origem e a fronteira
  documental permanecem como estavam.
- A leitura legada religada continua respondendo 200 e a escrita legada
  continua respondendo 410 `legacy_writer_retired` — ambas conferidas pelo gate
  novo, sem alteração de servidor.

## 5. Ausência de migração

Nenhuma migração foi criada. As migrações 001–174 **não** foram alteradas — o
gate aplica todas, na ordem, num cluster PostgreSQL descartável, e o ledger
confere (`Migration ledger verified: 001–174`). As migrações da família (086,
153, 154, 155, 156, 168) estão intactas. UX não justifica migração.

## 6. Testes e gates

Ambiente: Linux, Node 22, PostgreSQL **embutido e descartável**
(`embedded-postgres`), Chromium `@sparticuz/chromium` em `--single-process`,
baixa memória (`--max-old-space-size=1024`, um processo de teste por vez).
O gate recusa rodar com `DATABASE_URL`, `DATABASE_MIGRATION_URL` ou
`RUN_DATABASE_INTEGRATION_REMOTE` definidos. Falha injetada **somente** por
`page.addInitScript` sobre `window.fetch`; o servidor nunca é enfraquecido.
Crash de Chromium (SIGSEGV/alvo fechado) repete a sessão inteira;
`ERR_ASSERTION` nunca é repetido. A medição espera o **h1 real**
("Compliance corporativo e obrigações internas"), não apenas o tablist.
O agendador de fundo permanece **desligado** no gate
(`EXT07_EVALUATE_INTERVAL_SECONDS` vazio): o que é exercitado é a avaliação
temporal **explícita**.

| Verificação | Natureza | Resultado |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | estática | exit 0 |
| `node --test tests/ux-compliance-vocabulary.test.mjs` | estática (anti-deriva, dois servidores reais) | **15/15** |
| `node --test tests/ext07-compliance.test.mjs tests/ext-compliance-scheduler.test.mjs` (herdados) | estática | **42/42** |
| `npm run test:ux-compliance:pg` (novo gate) | HTTP real + PostgreSQL real + Chromium | **8/8**, exit 0, primeira execução, sem retry |
| `npm run test:unit` (inclui o vocabulário novo) | estática | **764/764** |
| `npm run test:ext07-compliance:pg` (gate herdado da família) | HTTP real + PostgreSQL real | **50/50**, exit 0, sem precisar de reparo |
| `npm run ux:evidence -- --stage=ux-07-compliance` | captura real, 1440×900 e 390×844 | exit 0, `problems: []` |
| Aceite humano | — | **PENDENTE.** Marcelo e Andreia não participaram e não foram solicitados. Nada aqui é homologação. |

O que o gate `test:ux-compliance:pg` prova, teste a teste:

1. 401 sem sessão (sem vazar `items`), 400 sem `idempotency-key`, 403 de origem
   cruzada; leitura legada ainda 200 e escrita legada ainda 410
   `legacy_writer_retired` — contrato intacto;
2. "menu não é autorização": `admin` e `ti` leem; `marcelo`, que o AdminGate
   deixa entrar, recebe 403 `forbidden` do servidor na leitura e na escrita,
   sem vazar registro;
3. browser: a recusa vira estado **negado** com o código `(forbidden)` no
   rodapé — sem vazio, sem tabela, sem indicador;
4. browser: falha injetada (`compliance_journey_unavailable`, 503) vira estado
   de **falha** com botão de repetir — nunca "nenhuma obrigação" — e a leitura
   vizinha de referências continua montada (estados independentes);
5. browser: 5 abas reais com roving tabindex e ←/→/Home/End;
6. browser: a jornada completa criada **pelas próprias APIs** (obrigação →
   referência declarada vencida → segunda obrigação com referência a vencer →
   avaliação temporal explícita → tarefa de vencimento → plano corretivo →
   plano preventivo iniciado e concluído → renovação versionada) aparece em
   português ("Crítica", "A vencer", "Substituída por renovação", "Jornada
   canônica EXT-07", "Corretivo", "Preventivo", "Concluído", "Plano de ação
   concluído"), sem valor cru de banco nas listas, no detalhe e na trilha;
7. browser: plano aberto mostra "Conclusão pendente", "Início pendente" e
   "Dado ausente", nunca 01/01/1970; a execução agendada desligada aparece como
   vazio honesto ("A leitura funcionou…") e "Não ativada neste processo", nunca
   como falha;
8. browser: 390 px sem transbordo horizontal.

## 7. Evidência visual

`docs/ux-07-compliance-evidencias/` (desktop 1440×900 e mobile 390×844, com
`resumo.json`): papel `admin`, banco limpo — o estado registrado é o **vazio
honesto** ("A leitura funcionou e nenhuma obrigação está declarada"), com foco
visível e sem erro de console (`problems: []` nos dois viewports). O bloqueio
de fontes do Google aparece em `externalBlocked` e **não é falha** (limitação
de rede do sandbox, campo separado). A jornada com massa real está coberta
pelas capturas do gate (`UX_COMPLIANCE_EVIDENCE_DIR`), não por esta etapa —
**cobertura parcial declarada**.

`scripts/ux-evidence-capture.mjs` ganhou apenas a etapa `ux-07-compliance`. O
gancho opcional `grants`, adicionado na fatia da Qualidade, **não foi
reimplementado nem usado**: EXT-07 não tem permissão granular por grant.

## 8. O que permaneceu legado, de propósito

1. **A leitura legada religada de `src/server/ext-advanced-api.mjs`**
   (`handleComplianceDocuments`, nos caminhos `/api/ext/compliance-documents` e
   os equivalentes de RH) continua no servidor, continua respondendo 200 e
   **não** é consumida por esta tela, que usa só o namespace canônico (o teste
   verifica URL por URL). A escrita legada segue 410. Os códigos desse recorte
   entraram no vocabulário porque a rota está viva.
2. **O scheduler `src/server/ext-compliance-scheduler.mjs` não foi tocado.** A
   tela apenas **observa** o estado e o histórico de execuções por
   `GET /schedule`; ligar ou desligar continua sendo decisão de ambiente
   (`EXT07_EVALUATE_INTERVAL_SECONDS` + `EXT07_EVALUATE_IDENTITY`), não de API
   nem de interface.
3. **O conteúdo gravado nos eventos é trilha imutável.** A tela traduz o
   **tipo** do evento (`action_plan_complete` → "Plano de ação concluído") e
   declara o restante como área legada no próprio rodapé. Nada do histórico é
   reescrito.
4. **O campo `error` de cada execução agendada** é texto gravado pelo servidor
   e permanece como está — área legada declarada.
5. **Responsável e identidade executora aparecem como o servidor devolve**
   (nome quando há `JOIN`, identificador quando não há). Resolver nome em todos
   os pontos exigiria mudança de resposta do servidor — fora do recorte de
   apresentação.
6. A tela continua **sem edição** de título/descrição/tipo de referência após a
   criação: o ciclo canônico trata isso por renovação versionada, e a tela não
   finge o contrário.

## 9. Limitações conhecidas

1. **Cobertura automatizada é parcial.** O gate focal cobre a jornada canônica
   EXT-07, a autorização por papel, os estados honestos, as abas e 390 px.
   **Não cobre** o cancelamento de tarefa e de plano pelo browser (cobertos por
   HTTP no gate herdado), a execução agendada ligada, viewports intermediários,
   nem conformidade WCAG integral.
2. A tradução de `hint`/`detail` estruturados e da lista `failed_closed` é
   coberta por teste estático, não por browser.
3. **A evidência visual cobre apenas `/admin/compliance` como papel `admin`**,
   em 1440×900 e 390×844, com banco limpo — cobertura parcial declarada.
4. **Aceite humano está PENDENTE**, por decisão explícita. Marcelo e Andreia
   não participaram desta sessão e não foram solicitados. Nada neste documento
   é homologação, e nenhum aceite foi inventado.
5. **Nenhum teste com dados reais do negócio** foi executado: toda a massa é
   fictícia e criada pelas próprias APIs, em cluster descartável.
6. **Revisão visual final pendente.**

## 10. Arquivos

Novos:

- `src/lib/compliance-vocabulary.mjs`, `src/lib/compliance-vocabulary.d.mts`
- `src/lib/compliance-request.ts`
- `tests/ux-compliance-vocabulary.test.mjs`
- `tests/ux-compliance-workspace.integration.test.mjs`
- `scripts/qa-ux-compliance-postgres.mjs`
- `.github/workflows/ux-compliance-delivery.yml`
- `docs/ux-07-compliance-evidencias/` (captura real)
- `docs/UX-07-COMPLIANCE-2026-10-06.md` (este arquivo)

Alterados:

- `src/app/admin/compliance/ComplianceWorkspace.tsx` (reescrito)
- `scripts/ux-evidence-capture.mjs` (etapa `ux-07-compliance`)
- `package.json` (`test:ux-compliance:pg`; teste de vocabulário no `test:unit`)

**Não** alterados, de propósito: `src/app/admin/compliance/page.tsx`,
`src/server/ext-compliance-api.mjs`, `src/server/ext-advanced-api.mjs`,
`src/server/ext-compliance-scheduler.mjs`, `server.mjs`,
`src/components/ui/UiWorkspace.module.css`, `db/migrations/**`,
`tsconfig.json` e `next-env.d.ts` (estes dois últimos são reescritos pelo
`next dev` durante os gates e foram restaurados com `git checkout --` antes
do commit).

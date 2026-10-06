# UX-07 — Analytics (EXT-11 / F07)

Data: 2026-10-06 · Branch `arena/4b86d5bb-gruposegsystemseguranca`
Base de verdade: `origin/main` após `git fetch origin main`, commit
`ad93909a6da5c49f23ad15a26682af8345f18976` — merge da PR #160 (UX-07
Inteligência comercial), confirmada **MERGED** antes de qualquer alteração.
Nenhum ZIP ou snapshot antigo foi usado.

Família desta sessão: **ANALYTICS**, e somente ela. As demais famílias do
roteiro de UX-07 (expansão, relatórios periódicos, painel do Marcelo,
continuidade, compliance, patrimônio, frota, terceiros, qualidade, apoio
emergencial, licitações, fornecedores, satisfação, conhecimento, carteira,
pedidos do site) e as etapas UX-08/UX-09 **não foram iniciadas**.

Tela tratada:

| Rota | Natureza | Autorização |
| --- | --- | --- |
| `/admin/analytics` — abas **Experimentos canônicos**, **Novo rascunho**, **Aprovação e ciclo de vida**, **Observações e trilha** (`AnalyticsWorkspace.tsx`) | **Produto.** Reescrita completa de apresentação. | `AdminGate` (`admin`, `ti`, `marcelo`), fixado por `tests/admin-page-gates.test.mjs` e **não alargado**. Leitura e escrita são decididas em `src/server/ext-analytics-api.mjs` por permissão granular (`analytics.read`, `analytics.write`, `analytics.approve`) via `hasPermission` — nunca pela interface. |

## 1. O que esta fatia mudou e o que NÃO mudou

Fatia de **apresentação, vocabulário e acessibilidade**. Nenhuma rota de API,
método, corpo, cabeçalho, chave de idempotência, regra de aprovação, transição
de estado, validação de origem de observação ou política de privacidade foi
alterada. O banco continua em **001–174**; nenhuma migração nova foi criada e
nenhuma existente foi tocada. `server.mjs` **não foi alterado**.

| Não mudou | Onde continua sendo decidido |
| --- | --- |
| Quem lê, escreve e aprova (`analytics.read` / `analytics.write` / `analytics.approve`) | `src/server/ext-analytics-api.mjs`, por `hasPermission` (fail-closed, negação por padrão) |
| Proteção de origem nas escritas (`origin_forbidden`) | `guard(..., { write: true })` + `sameOrigin` |
| Idempotência (`Idempotency-Key`, replay, `idempotency_conflict_payload_mismatch`) | `mutation()` + `UNIQUE` nas migrações 163 |
| Aprovação humana obrigatória antes da execução (`approval_required`) | servidor; a tela não aprova sozinha |
| Conclusão exigindo observação real de A e de B (`insufficient_real_observations`) | servidor |
| Recusa de observação sintética, futura ou com vencedor digitado (`real_source_required`, `observation_must_be_real_source`) | servidor |
| Remoção dos campos legados `result_a_value`, `result_b_value`, `winner` da resposta | `publicExperiment()` no servidor |
| Auditoria fail-closed (`audit_unavailable` → 503 e rollback completo) | servidor; continua estado próprio, nunca "zero" |
| Histórico append-only de eventos e observações | gatilhos da migração 163; o PostgreSQL recusa `UPDATE`/`DELETE` |
| Aposentadoria da escrita legada (410 `legacy_writer_retired`) | `handleLegacy` em `server.mjs` |

### Fronteira real, conferida e não suposta

`server.mjs` religa, para esta família:

- `url.pathname.startsWith("/api/ext/analytics/")` → `extAnalyticsApi.handle`
  (linha ~4440);
- `/api/admin/hr/ext-analytics-experiments`, `/api/crm/hr/ext-analytics-experiments`,
  `/api/hr/ext-analytics-experiments` e `/api/ext/analytics-experiments` →
  `extAnalyticsApi.handleLegacy` (linha ~4443), que responde **410** em escrita
  e leitura histórica minimizada em `GET`.

O handler `handleAnalyticsExperiments` de `src/server/ext-advanced-api.mjs`
**existe e é exportado, mas não tem rota HTTP**: de `ext-advanced-api.mjs` o
`server.mjs` só religa `handleComplianceDocuments` e `handleContinuityPlans`.
Isto foi conferido antes de alterar a apresentação, não suposto.

## 2. Diagnóstico honesto da tela anterior

`AnalyticsWorkspace.tsx` tinha 155 linhas. Os defeitos medidos:

| Defeito observado | Consequência |
| --- | --- |
| **Falha de leitura virava lista vazia.** `load()` atualizava `items` só em caso de sucesso; o `catch` apenas gravava uma string em `message`. Com `items` ainda `[]`, a tela renderizava *"Nenhum experimento canônico registrado."* | Indisponibilidade do servidor era apresentada como "não existe experimento". É o defeito mais grave da família e o alvo central desta fatia. |
| **Oito `style={{...}}` inline** e nenhuma classe compartilhada. | Inconsistência visual com o restante do admin; nada reaproveitável. |
| `throw new Error(body.error \|\| "Falha ao carregar experimentos")` e `setMessage(body.error \|\| …)` em quatro pontos. | O **código cru do servidor em inglês** aparecia na tela: `approval_required`, `audit_unavailable`, `insufficient_real_observations`, `idempotency_conflict_payload_mismatch`, `forbidden` — **41 códigos possíveis**. |
| Nenhum `UiState`: carregando, vazio, falha e recusa usavam a mesma marcação ad hoc (um `<p role="alert">`). | Quatro significados distintos com a mesma aparência. Recusa de permissão (`403 forbidden`) era indistinguível de falha de banco. |
| `{item.observations_count \|\| 0}` | **Ausência renderizada como zero** — exatamente o que a política proíbe. |
| Situação impressa com o valor cru do banco (`<b>{item.status}</b>` → `rascunho`, `em_execucao`, `concluido`). | Jargão de coluna de banco exposto a quem opera. |
| `setMessage(\`Estado alterado para ${status}.\`)` | A confirmação também usava o valor cru. |
| Seções empilhadas numa página só, sem `tablist`, sem navegação por teclado. | Percurso sem estrutura anunciável por leitor de tela. |

**O que já estava correto e foi preservado:** o texto que recusa vencedor e
significância já existia e **não** foi inventado por esta fatia; a tela já não
lia a rota legada; e a chave de idempotência já era enviada em toda mutação.
Isto fica registrado para não inflar o que esta fatia corrigiu.

**Decisões da tela baseadas em código de erro:** a verificação obrigatória
`grep -n "message ===|\.message ==|message.includes" src/app/admin/analytics`
devolveu **nenhum resultado**. A tela não tomava nenhuma decisão comparando
mensagem ou código, então traduzir não quebrou lógica alguma. Ainda assim o
código canônico continua disponível em `descriptor.code` para quem precisar
decidir por ele no futuro.

## 3. Códigos reais encontrados e método do levantamento

Primeiro, a busca obrigatória por **wrappers locais** da família:

```
grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/*analytics*.mjs \
  | sed -E "s/\(.*//" | sort | uniq -c
```

Resultado: **vazio**. Ampliando para `\b[a-zA-Z_]{2,16}\(\s*res\s*,` aparecem
apenas `json` (44) e `mutation` (5). Ou seja, esta família **não** define
`bad(res, 'codigo')` nem `unavailable(res, 'codigo')`: tudo sai por
`json(res, status, { error: '...' })`, inclusive os códigos montados dentro de
`work()` e devolvidos por `mutation()`. Mesmo assim o extrator do teste
anti-deriva continua casando os três formatos, para que a introdução de um
wrapper amanhã não passe despercebida.

Regras do extrator (`tests/ux-analytics-vocabulary.test.mjs`), idênticas às das
fatias Financeiro e Contratos:

1. remover antes os operandos de `.includes('…')` e de `[=!]==?\s*'…'` — são
   nomes de constraint, valores de ENUM e métodos HTTP, **não** códigos;
2. casar `error:` seguido de literal;
3. casar `new HttpError(status,'code')` e `new E(status,'code')`;
4. casar `\b(?:bad|unavailable)\(\s*res\s*,\s*'code'`;
5. ler os arquivos reais de servidor, nunca uma lista escrita à mão.

Duas origens reais, ambas lidas pelo teste:

| Origem | Religada em `server.mjs`? | Códigos |
| --- | --- | --- |
| `src/server/ext-analytics-api.mjs` (arquivo inteiro) | **Sim** | **37** |
| Trecho `handleAnalyticsExperiments` de `src/server/ext-advanced-api.mjs`, entre os marcadores `// EXT-11 analytics/A-B` e `// EXT-12 editor visual avançado` | **Não** — sem rota HTTP hoje | 12, dos quais **4 exclusivos** |

**Total real: 41 códigos, zero duplicado, zero inventado.** O recorte do
segundo arquivo é deliberado e declarado: o restante dele pertence a
EXT-07/08/09/10/12 e está fora desta família; incluí-lo inteiro inflaria o
número sem relação com analytics. Os quatro códigos exclusivos do legado
(`missing_id`, `invalid_variant_a`, `invalid_variant_b`, `invalid_winner`)
foram traduzidos de propósito, pelo mesmo motivo registrado na seção 1 de
`docs/UX-07-CONTRATOS-2026-10-05.md`: se a rota for religada, a pessoa lê
português em vez do código cru. Isso **não** significa que a rota esteja
exposta — não está.

Limiares do teste, logo abaixo do real para que uma regressão falhe:
`canonicalCodes.size > 35` (real 37) e `codes.size > 39` (real 41). O teste
também falha se o vocabulário traduzir um código que servidor nenhum devolve.

Os 37 códigos canônicos: `approval_note_required`, `approval_only_in_draft`,
`approval_required`, `audit_unavailable`, `conclusion_note_required`,
`database_error`, `experiment_not_found`, `experiment_not_running`,
`forbidden`, `idempotency_conflict_payload_mismatch`,
`idempotency_key_required`, `insufficient_real_observations`,
`internal_error`, `invalid_description`, `invalid_experiment_id`,
`invalid_hypothesis`, `invalid_json`, `invalid_justification`,
`invalid_metric_name`, `invalid_metric_value`, `invalid_sample_size`,
`invalid_source_record_id`, `invalid_source_recorded_at`, `invalid_status`,
`invalid_transition`, `invalid_variant`, `invalid_variants`,
`legacy_writer_retired`, `method_not_allowed`, `metric_mismatch`, `not_found`,
`observation_must_be_real_source`, `origin_forbidden`, `payload_too_large`,
`privacy_minimization_required`, `real_source_required`, `unauthorized`.

## 4. O que foi reescrito

1. **`src/lib/analytics-vocabulary.mjs` (+ `.d.mts`)** — os **41 códigos**
   acima.
   `describeAnalyticsError(code, status) -> { kind, title, detail, status, canRetry, code }`,
   mais `analyticsErrorMessage`, `analyticsErrorVariant` e
   `analyticsErrorFootnote` (código canônico só entre parênteses ou como
   "Código técnico", nunca como título principal). Código desconhecido
   **passa cru**, com o próprio código no detalhe e nenhuma frase inventada;
   `status: 0` é falha de rede e vira estado próprio; resposta de erro sem
   código legível também tem descritor próprio, com `code: null`, sem inventar
   um código para preencher a lacuna.
   **Cinco grupos de ENUM, 19 valores**, todos efetivamente usados pela
   família: situação do experimento (`ext_analytics_status`, migração 086),
   origem (`origin`, migração 163), variante, tipo de origem da observação e
   tipo de evento da trilha. Valor desconhecido de ENUM é **preservado cru**.
   Formatadores honestos: `honestDate`, `honestDateTime`, `count`,
   `honestNumber`, `honestPercent` e `honestText` — ausência devolve
   **"Dado ausente"** (ou **"Percentual não calculado"**), nunca `0`, `0%` ou
   `01/01/1970`; zero **real** vindo do servidor continua aparecendo como `0`.
   Toda saída de `Intl.NumberFormat('pt-BR')`/`Intl.DateTimeFormat('pt-BR')`
   é normalizada para remover `U+00A0`/`U+202F`, pelo mesmo motivo registrado
   na seção 5.1 de `docs/UX-07-FINANCEIRO-2026-10-05.md`.
   **Decisão explícita:** não existe vocabulário para `winner` nem para
   `result_a_value`/`result_b_value`. A jornada canônica remove esses campos da
   resposta; traduzi-los daria aparência de verdade a um valor que o produto
   recusa calcular.
2. **`src/lib/analytics-request.ts`** — `analyticsRequest()` devolvendo
   resultado discriminado `{ ok: true, status, data }` ou
   `{ ok: false, status, error }`, com o descritor já classificado. Falha de
   rede vira `status: 0`; corpo não-JSON não derruba nada. Nenhuma exceção crua
   chega à interface. Esta camada não decide autorização, não acrescenta
   cabeçalho de idempotência por conta própria e não reescreve URL, método ou
   corpo.
3. **`src/app/admin/analytics/AnalyticsWorkspace.tsx`** (155 → 789 linhas) —
   reescrito:
   - **zero `style` inline**; tudo por `UiWorkspace.module.css` (nenhuma classe
     nova foi necessária, nenhum arquivo compartilhado foi alterado);
   - **duas leituras independentes**, cada uma com seu `UiState`: a lista
     canônica e o detalhe do experimento selecionado;
   - os cinco estados são distintos: **carregando**, **vazio**, **falha**,
     **negado** e **sucesso**. A falha da lista diz, com todas as letras, que
     **não significa que não existam experimentos**, mostra o código canônico e
     oferece repetir; e **nem a tabela nem os indicadores são renderizados**
     enquanto a leitura não termina com sucesso — falha não vira lista vazia
     nem métrica zero;
   - `UiBadge` com `srPrefix` em toda situação e origem exibidas;
   - **quatro abas** `tablist`/`tab`/`tabpanel` reais, com roving tabindex
     (uma com `tabindex=0`, três com `-1`), `←`/`→` circulares, `Home`/`End`,
     `aria-selected`, `aria-controls`, `aria-labelledby` e foco visível. Não há
     `aria-pressed` na tela;
   - todo campo tem `<label htmlFor>` associado;
   - **URL, método, corpo, `content-type` e `Idempotency-Key` idênticos aos do
     protótipo anterior**, inclusive a forma da chave (`ext11-<uuid>`) e os
     textos de `approval_note` e `justification`;
   - a declaração de honestidade (não coleta tráfego, não inventa tráfego nem
     conversões, não declara vencedor nem significância) ficou no `lede`, e um
     cartão de indicador mostra **"Percentual não calculado"** no lugar onde um
     painel comum poria uma taxa de conversão inventada.

## 5. O que permaneceu legado (pendências declaradas, não dívida escondida)

1. **A tela continua sem formulário de observação real.** `POST
   /api/ext/analytics/experiments/{id}/observations` existe no servidor, é
   exercitado por HTTP nesta sessão e no gate herdado, mas acrescentá-lo à tela
   seria **capacidade nova**, não apresentação — fora do escopo declarado desta
   fatia. A própria tela diz isso ao usuário, no rodapé da aba de ciclo de
   vida.
2. **A tela continua sem a transição "concluir".** Mesmo motivo: o protótipo
   anterior também não a oferecia, e o servidor exige nota de conclusão escrita
   por uma pessoa.
3. **O resumo de cada evento da trilha é texto gravado pelo servidor** e às
   vezes contém o valor técnico do estado (ex.: `Estado alterado para
   em_execucao; …`). Reescrevê-lo na tela significaria alterar trilha imutável;
   fica declarado no rodapé da aba e aqui.
4. **A leitura legada (`GET /api/ext/analytics-experiments`) continua não
   consumida por esta tela**, de propósito. Religá-la ou removê-la é decisão de
   produto, não de UX.
5. **O handler legado `handleAnalyticsExperiments` continua sem rota HTTP**
   (seção 1). O vocabulário cobre seus quatro códigos exclusivos por precaução,
   e isso está escrito no cabeçalho de `src/lib/analytics-vocabulary.mjs` para
   não induzir ninguém ao engano de achar que a rota está exposta.
6. **Nenhuma área legada foi promovida a "pronto" por cosmética.**

## 6. Permissões e rotas que não mudaram

- `src/app/admin/analytics/page.tsx` **não foi alterado**:
  `allowedRoles={["admin", "ti", "marcelo"]}`, como `tests/admin-page-gates.test.mjs`
  exige. **O AdminGate não foi alargado.**
- `src/server/ext-analytics-api.mjs` **não foi alterado**.
- `server.mjs` **não foi alterado** — por isso ele está fora dos `paths` do
  workflow desta família.
- `db/migrations/**` **não foi alterado**; não há migração nova. UX não
  justifica migração, e nada nesta fatia exigiu mudança de banco.
- "Menu não é autorização" está provado no gate: o papel `ti` está em
  `allowedRoles` **e** nos `ADMIN_MODULES` do menu, abre `/admin/analytics`, e
  mesmo assim o servidor recusa sozinho com `403 forbidden` quando a permissão
  granular é revogada (`revoked_at`, o caminho real de revogação que a própria
  migração 163 declara possível) — na leitura e na aprovação — enquanto `admin`
  segue autorizado em tudo. A negativa não vaza `items` nem `experiment`.

## 7. Ausência de migração

As migrações **001–174 permanecem intactas**; `ls db/migrations | wc -l` = 174
e não existe arquivo 175+. O ledger foi verificado em toda execução dos gates:
`Migration ledger verified: 001–174 (PostgreSQL only)`.

## 8. Evidência

`npm run ux:evidence -- --stage=ux-07-analytics` — **exit 0**, com a etapa
`ux-07-analytics` acrescentada a `scripts/ux-evidence-capture.mjs`.

- `docs/ux-07-analytics-evidencias/desktop-analytics.png` (1440×900)
- `docs/ux-07-analytics-evidencias/mobile-analytics.png` (390×844)
- `docs/ux-07-analytics-evidencias/resumo.json` — `problems: []` nos dois
  viewports.

O `externalBlocked` traz duas entradas por viewport, ambas do mesmo recurso:
`fonts.googleapis.com` (`net::ERR_CONNECTION_CLOSED`). É **bloqueio esperado de
rede do ambiente, não falha da página**, e por isso o script o registra em
campo separado.

O banco desta etapa é limpo, então a evidência mostra o **vazio honesto**
("A leitura funcionou e nenhum experimento canônico está registrado"). A
jornada com massa real é capturada pelo gate próprio, via
`UX_ANALYTICS_EVIDENCE_DIR`.

## 9. Resultados dos testes

Ambiente: Linux, Node 22, PostgreSQL **embutido e descartável**
(`embedded-postgres`), Chromium `@sparticuz/chromium` em `--single-process`,
`--max-old-space-size=1024`. Nenhum banco do operador foi tocado: o gate recusa
rodar com `DATABASE_URL`, `DATABASE_MIGRATION_URL` ou
`RUN_DATABASE_INTEGRATION_REMOTE=1` definidos.

| Verificação | Natureza | Resultado |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | estática | **exit 0** |
| `node --test tests/ux-analytics-vocabulary.test.mjs` | estática (anti-deriva: lê os arquivos reais de servidor) | **13/13** |
| `node --test tests/ext11-analytics.test.mjs` (gate herdado da família) | estática | **10/10**, sem precisar de reparo além do descrito em 9.1 |
| `npm run test:ux-analytics:pg` | HTTP real + PostgreSQL real + Chromium real | **8/8**, exit 0, na primeira execução |
| `npm run test:ext11-analytics:pg` (gate herdado da família) | HTTP real + PostgreSQL real | **18/18**, exit 0, **sem reparo** |
| `npm run test:unit` (inclui o teste novo) | estática | **736/736** |
| `npm run ux:evidence -- --stage=ux-07-analytics` | captura real, 1440×900 e 390×844 | exit 0, `problems: []` |
| Aceite humano | — | **PENDENTE.** Marcelo e Andreia não participaram e não foram solicitados. Nada aqui é homologação. |

O que o gate `test:ux-analytics:pg` prova, teste a teste:

1. A rota canônica continua exigindo sessão (`401 unauthorized` sem cookie, sem
   vazar `items`), continua exigindo `Idempotency-Key` (`400`) e continua
   recusando origem estranha (`403`).
2. **"Menu não é autorização"**: com as permissões granulares provisionadas
   pelo gatilho da migração 163, o papel `ti` lê (`200`); revogada
   `analytics.approve`, a aprovação vira `403 forbidden`; revogada
   `analytics.read`, a leitura vira `403 forbidden`. `admin` segue em `200`.
3. **Recusa do servidor vira estado NEGADO na tela**: `data-ui-state="denied"`
   explicando que falta permissão granular, com `(forbidden)` disponível — e
   **nenhuma** tabela vazia, **nenhum** indicador zero, **nenhum**
   `data-ui-state="empty"`.
4. **Falha de leitura não vira "nenhum experimento"**: injetando `503
   audit_unavailable` em `/api/ext/analytics/experiments`, a tela mostra
   `data-ui-state="error"` dizendo que **não significa que não existam
   experimentos**, com `(audit_unavailable)` e botão de repetir; a tabela e os
   indicadores não são renderizados.
5. As quatro abas são um `tablist` de verdade: roving tabindex (1 com
   `tabindex=0`, 3 com `-1`), `←`/`→` movendo foco e seleção juntos e
   circulando, `Home`/`End`, `aria-controls` correto, só o painel ativo montado
   e **zero** `aria-pressed`.
6. **A jornada real sai em português**: massa fictícia criada pelas próprias
   APIs canônicas (rascunho → aprovação humana → execução → observação real A e
   B) aparece como **"Em execução"**, **"Jornada canônica EXT-11"**,
   **"Variante A"/"Variante B"**, **"Registro operacional interno"** e
   **"Observação real registrada"** — nenhum `em_execucao`,
   `internal_operational_record`, `ext11_canonica` ou `observation_recorded` na
   tela. A taxa aparece como **"Percentual não calculado"**, nunca `0%`.
7. **Ausência honesta**: no rascunho sem aprovação, a tela diz
   **"Aprovação pendente"** e **"Dado ausente"**, nunca `01/01/1970`; a lista de
   observações vazia diz que **a leitura funcionou** e que **zero não é a
   resposta**, sem `data-ui-state="error"`.
8. 390×844 sem transbordo horizontal.

A falha é injetada **apenas em `window.fetch`, dentro da página**
(`page.addInitScript`): o servidor nunca é enfraquecido para o teste passar. O
gate espera o **`h1` real** (`Analytics e experimentos A/B controlados`) antes
de medir a tela, não apenas o `tablist`. O helper `comNavegador` repete a
**sessão inteira** até três vezes somente quando o erro casa o padrão de crash
de infraestrutura (`SIGSEGV`, alvo fechado, `Protocol error`); qualquer
`ERR_ASSERTION` é repassado na hora, e a repetição é registrada no log
(`UX_ANALYTICS_BROWSER_RETRY`) para não virar flakiness silenciosa.

### 9.1 Duas frases do gate herdado foram preservadas, não enfraquecidas

`tests/ext11-analytics.test.mjs` exige que o workspace contenha
`Não há dados suficientes` e `não inventa tráfego`. A primeira redação da
reescrita trocou essas frases por sinônimos e **quebrou o gate herdado**. A
correção foi na **apresentação**, não no teste: o estado de dados insuficientes
voltou a se chamar **"Não há dados suficientes para uma conclusão."** e o `lede`
voltou a conter **"não inventa tráfego nem conversões"**. Nenhuma asserção
herdada foi relaxada, removida ou reescrita.

As três asserções equivalentes do teste novo passaram a usar `\s+` entre as
palavras, porque o JSX quebra a frase em duas linhas — é a mesma frase, medida
do mesmo jeito.

### 9.2 Integração contínua da PR #162

A fatia foi aberta como **PR #162** (`arena/4b86d5bb-gruposegsystemseguranca` →
`main`). No primeiro push, **os 23 checks passaram**, sem nenhum reparo — ao
contrário da fatia A, que precisou do commit `84c4ac0` para consertar um gate
herdado. Os 22 checks herdados continuaram verdes, o que é a evidência de que
esta fatia não quebrou nenhuma outra família.

**Em qual commit esses 23 checks rodaram.** Eles rodaram no commit `510969f`.
Este documento foi acrescentado depois, emendando (`--amend`) o commit único da
família para preservar a regra "um commit por família"; por isso o SHA final é
outro. A árvore final difere da que foi testada **apenas por este arquivo de
documentação** (`git diff --stat 510969f..HEAD` = 1 arquivo, só Markdown):
nenhuma linha de código, teste, script, workflow ou migração mudou depois do
CI verde.

Os workflows da família têm filtro de `paths` e **não** são reexecutados quando
o único arquivo alterado está em `docs/**` — logo o gate não rodou de novo no
SHA final, e **não** foi forçado a rodar. Não se inventou um
`workflow_dispatch` para isso: nenhum dos workflows do repositório tem um, e
repintar o CI tocando em arquivo seria exatamente a cosmética que esta fatia se
proibiu. O que rodou no SHA final foi o workflow `QA baseline`, que é disparado
por `push` e não tem filtro de `paths`: **passou**.

O check novo é `ux-analytics-postgres-browser`, do workflow
`.github/workflows/ux-analytics-delivery.yml`, e executou quatro passos reais:
`npm run typecheck`, `node --test tests/ux-analytics-vocabulary.test.mjs`,
`node --test tests/ext11-analytics.test.mjs` e `npm run test:ux-analytics:pg` —
todos com conclusão `success`.

**Como isso foi conferido, e o que não deu para conferir.** O conteúdo bruto do
log do CI **não** pôde ser lido do ambiente de trabalho: o blob é servido por
`results-receiver.actions.githubusercontent.com`, inacessível dali. A
verificação foi feita pela API, passo a passo (nome, conclusão e duração de
cada um), e não pela leitura do log. Duas observações sustentam a leitura de
que o gate rodou de verdade em vez de passar por omissão:

1. O gate é **fail-closed**. Em `scripts/qa-ux-analytics-postgres.mjs`, qualquer
   falha de infraestrutura — subir o PostgreSQL, aplicar as migrações
   (`migrations_failed_exit_*`), executar a suíte ou parar o cluster — cai no
   `catch`/`finally`, força `result = 1` e termina em `process.exit(1)`. Não
   existe caminho que pule a execução e ainda assim saia com zero.
2. A duração é compatível com a dos gates já provados do repositório: o passo
   `test:ux-analytics:pg` levou **28s** no runner, contra **13s** do
   `test:ux-intel:pg` herdado na mesma PR. O gate novo é o mais lento dos dois,
   não o mais rápido; a execução local demora bem mais apenas porque a máquina
   de trabalho é mais lenta que o runner.

## 10. Limitações conhecidas

1. **Cobertura automatizada é parcial.** O gate focal cobre a jornada canônica
   EXT-11, a autorização granular, os estados honestos, as abas e 390px. **Não
   cobre** a superfície administrativa antiga, outros papéis do `AdminGate`
   (`marcelo`), viewports intermediários, nem conformidade WCAG integral.
2. **A evidência visual cobre apenas `/admin/analytics` como papel `admin`**,
   em 1440×900 e 390×844, com banco limpo — cobertura parcial declarada.
3. **Aceite humano está PENDENTE**, por decisão explícita. Marcelo e Andreia
   não participaram desta sessão e não foram solicitados. Nada neste documento
   é homologação, e nenhum aceite foi inventado.
4. **Nenhum teste com dados reais do negócio** foi executado: toda a massa é
   fictícia e criada pelas próprias APIs, em cluster descartável.
5. **Revisão visual final pendente.**
6. **As pendências da seção 5 continuam abertas** e não foram disfarçadas.

## 11. Arquivos

Novos:

- `src/lib/analytics-vocabulary.mjs`, `src/lib/analytics-vocabulary.d.mts`
- `src/lib/analytics-request.ts`
- `tests/ux-analytics-vocabulary.test.mjs`
- `tests/ux-analytics-workspace.integration.test.mjs`
- `scripts/qa-ux-analytics-postgres.mjs`
- `.github/workflows/ux-analytics-delivery.yml`
- `docs/ux-07-analytics-evidencias/` (captura real)
- `docs/UX-07-ANALYTICS-2026-10-06.md` (este arquivo)

Alterados:

- `src/app/admin/analytics/AnalyticsWorkspace.tsx` (reescrito)
- `scripts/ux-evidence-capture.mjs` (etapa `ux-07-analytics`)
- `package.json` (`test:ux-analytics:pg`; teste de vocabulário no `test:unit`)

**Não** alterados, de propósito: `src/app/admin/analytics/page.tsx`,
`src/server/ext-analytics-api.mjs`, `server.mjs`,
`src/components/ui/UiWorkspace.module.css`, `db/migrations/**`, `tsconfig.json`
e `next-env.d.ts` (estes dois últimos são reescritos pelo `next dev` durante os
gates e foram restaurados com `git checkout --` antes do commit).

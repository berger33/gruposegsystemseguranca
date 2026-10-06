# UX-07 — Analytics e experimentos (EXT-11 / F07)

Data: 2026-10-06
Família: **ANALYTICS** (`/admin/analytics`)
Base de verdade: `origin/main` após `git fetch origin main`, commit
`ad93909a6da5c49f23ad15a26682af8345f18976` — merge da PR #160 (UX-07
Inteligência comercial), confirmada como `MERGED` e presente em `origin/main`.
Branch da sessão: `arena/1d3a2d0e-gruposegsystemseguranca`.

Esta fatia trata **somente a apresentação** da jornada canônica EXT-11 / F07.
Nenhuma outra família foi tocada.

## 1. Diagnóstico honesto da tela anterior

`src/app/admin/analytics/AnalyticsWorkspace.tsx` (155 linhas) apresentava:

| Defeito observado | Consequência |
| --- | --- |
| `if (!response.ok) throw new Error(body.error \|\| …)` em todas as cinco chamadas, com o `catch` jogando `error.message` num `<p role="alert">`. | O **código cru do servidor em inglês** aparecia na tela: `audit_unavailable`, `approval_required`, `insufficient_real_observations`, `idempotency_conflict_payload_mismatch`, `origin_forbidden` etc. |
| A leitura da lista só gravava `items`; qualquer falha caía no `message` e `items` permanecia `[]`. | **Falha virava lista vazia**: um `503 database_error` era renderizado como “Nenhum experimento canônico registrado.” |
| `{item.observations_count \|\| 0}`. | **Ausência renderizada como zero** — exatamente o que analytics não pode fazer. |
| Treze `style={{…}}` inline e nenhuma classe compartilhada. | Inconsistência visual com o restante do admin. |
| Nenhum `UiState`: carregando, vazio, falha e recusa usavam a mesma marcação. | Quatro significados distintos com a mesma aparência. |
| Página única empilhada (formulário + lista + detalhe), sem `tablist` e sem navegação por teclado. | Percurso longo e sem estrutura anunciável por leitor de tela. |
| Estados impressos com o valor cru do banco (`rascunho`, `em_execucao`, `concluido`). | Jargão de coluna exposto a quem opera. |
| `placeholder` no lugar de `label` em todos os campos do formulário. | Campo sem rótulo programático. |

Levantamento prévio exigido antes de traduzir mensagens:
`grep -n "message ===\|\.message ==\|message.includes" src/app/admin/analytics`
→ **nenhuma ocorrência**. Não havia decisão de tela baseada em texto de
mensagem; mesmo assim, o código técnico continua disponível no descritor
(`descriptor.code`) para qualquer lógica futura e é exibido apenas como nota
técnica entre parênteses, nunca como título.

## 2. Códigos reais encontrados e método do levantamento

Primeiro, o inventário de wrappers locais da família:

```
grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"\`][a-z0-9_]+" src/server/ext-analytics-*.mjs \
  | sed -E "s/\(.*//" | sort | uniq -c
```

→ **nenhum wrapper** do tipo `bad(res, 'code')` / `unavailable(res, 'code')`:
o servidor usa um único `json(res, status, { error })`. O extrator do teste
anti-deriva cobre os três formatos mesmo assim (`error:` literal,
`new HttpError(status,'code')` / `new E(status,'code')` e
`bad|unavailable(res,'code')`), e **remove antes** os operandos de
`.includes('…')` e de `[=!]==?\s*'…'`, que são nomes de constraint/estado e não
códigos.

Arquivos de servidor realmente lidos: `src/server/ext-analytics-api.mjs`.
Fronteira conferida em `server.mjs` (não suposta):

- linha ~4440 — `/api/ext/analytics/**` → `extAnalyticsApi.handle`;
- linha ~4443 — `/api/admin/hr/ext-analytics-experiments`,
  `/api/crm/hr/ext-analytics-experiments`, `/api/hr/ext-analytics-experiments` e
  `/api/ext/analytics-experiments` → `handleLegacy` (leitura minimizada,
  escrita `410 legacy_writer_retired`).

Não existe outro servidor na família: `ls src/server | grep -i analy` devolve
apenas `ext-analytics-api.mjs`.

Total levantado: **37 códigos reais**, todos traduzidos:

`approval_note_required`, `approval_only_in_draft`, `approval_required`,
`audit_unavailable`, `conclusion_note_required`, `database_error`,
`experiment_not_found`, `experiment_not_running`, `forbidden`,
`idempotency_conflict_payload_mismatch`, `idempotency_key_required`,
`insufficient_real_observations`, `internal_error`, `invalid_description`,
`invalid_experiment_id`, `invalid_hypothesis`, `invalid_json`,
`invalid_justification`, `invalid_metric_name`, `invalid_metric_value`,
`invalid_sample_size`, `invalid_source_record_id`,
`invalid_source_recorded_at`, `invalid_status`, `invalid_transition`,
`invalid_variant`, `invalid_variants`, `legacy_writer_retired`,
`method_not_allowed`, `metric_mismatch`, `not_found`,
`observation_must_be_real_source`, `origin_forbidden`, `payload_too_large`,
`privacy_minimization_required`, `real_source_required`, `unauthorized`.

O limiar do teste anti-deriva está em `> 35`, **logo abaixo** do total real de
37. O mesmo teste falha nos dois sentidos: código real sem descrição **e**
código descrito que o servidor não devolve.

## 3. O que foi reescrito

1. **`src/lib/analytics-vocabulary.mjs` (+ `.d.mts`)** —
   `describeAnalyticsError(code, status) -> { kind, title, detail, status, canRetry, code }`,
   mais `analyticsErrorVariant`, `analyticsErrorFootnote` e
   `analyticsErrorMessage`. Código desconhecido **passa cru** (título genérico
   e o código citado no detalhe); `status === 0` vira estado de rede próprio.
   ENUMs efetivamente usados pela família: estado do experimento (migração
   163), variante (`A`/`B`) e `source_type` (`internal_operational_record`,
   `internal_event`) — valor desconhecido é preservado como veio.
   Formatadores honestos: `honestDate`, `honestDateTime`, `count`, `decimal`,
   `honestPercent` e `honestText` devolvem **“Dado ausente”**, nunca `0`,
   `0%` ou `01/01/1970`. `honestPercent` exige numerador e denominador reais
   (denominador ≤ 0 → ausente). As saídas de `Intl.NumberFormat('pt-BR')`
   têm o espaço rígido normalizado.
2. **`src/lib/analytics-request.ts`** — `analyticsRequest()` devolvendo
   `{ ok: true, data } | { ok: false, error }`, cobrindo falha de rede e
   status HTTP; nenhuma exceção crua chega à UI.
3. **`src/app/admin/analytics/AnalyticsWorkspace.tsx`** (155 → 309 linhas) —
   zero `style` inline, `UiWorkspace.module.css`, dois grupos de leitura
   independentes (lista e trilha do experimento) com `UiState` próprio e
   estados distintos de **carregando / vazio / falha / negado / sucesso**.
   A falha da lista diz explicitamente que **não significa lista vazia nem
   métrica zero**. Três abas `tablist`/`tab`/`tabpanel` reais com roving
   tabindex e ←/→/Home/End, `aria-selected`, `aria-controls` e foco visível —
   sem `aria-pressed`. Campos com `label`/`htmlFor` reais. A tela continua
   declarando que não inventa tráfego, conversões, vencedor ou significância,
   e que o protótipo não vira produto homologado por acabamento visual.
4. **`tests/ux-analytics-vocabulary.test.mjs`** — 9 testes anti-deriva.
5. **`scripts/qa-ux-analytics-postgres.mjs`** + `npm run test:ux-analytics:pg`
   + cenário browser acoplado em `tests/ext11-analytics.integration.test.mjs`
   + contrato `tests/ux-analytics-workspace.integration.test.mjs`.
6. **`.github/workflows/ux-analytics-delivery.yml`** com paths restritos à
   família.

## 4. O que permaneceu legado

- O handler `handleLegacy` (leitura histórica `origin='registro_legado'`,
  escrita `410`) **não tem tela**; continua sem apresentação própria e não foi
  promovido.
- Os campos `result_a_value`, `result_b_value` e `winner` da tabela da migração
  086 permanecem legados: o servidor já os remove de toda resposta
  (`publicExperiment`) e a tela não os exibe nem os reintroduz.
- O registro de **observações** (`POST …/observations`) e a transição para
  `concluido` (que exige `conclusion_note`) continuam **sem formulário na
  tela**, como antes desta fatia. A interface não foi ampliada para não
  inventar payload; essas operações seguem disponíveis apenas pela API
  canônica e estão cobertas pelo gate EXT-11. É pendência declarada, não
  entrega.

## 5. Permissões e rotas que não mudaram

Nada de autorização foi alterado. Quem decide é o servidor; menu não é
autorização.

| Operação | Rota / método (inalterados) | Permissão granular exigida no servidor |
| --- | --- | --- |
| Listar experimentos canônicos | `GET /api/ext/analytics/experiments` | `analytics.read` |
| Detalhe e trilha | `GET /api/ext/analytics/experiments/{id}` | `analytics.read` |
| Criar rascunho | `POST /api/ext/analytics/experiments` + `Idempotency-Key` | `analytics.write` + same-origin |
| Aprovação humana | `POST …/{id}/approve` + `Idempotency-Key` | `analytics.approve` + same-origin |
| Transição de estado | `POST …/{id}/transition` + `Idempotency-Key` | `analytics.execute` + same-origin |
| Observação | `POST …/{id}/observations` + `Idempotency-Key` | `analytics.write` + same-origin |

`AdminGate` em `src/app/admin/analytics/page.tsx` continua exatamente
`["admin", "ti", "marcelo"]` — **não foi alargado**. O gate de página é só
navegação: o gate browser confirma que um papel sem a concessão granular
recebe `403` do servidor mesmo chegando à rota. Idempotência, auditoria
fail-closed (`503 audit_unavailable` com rollback), isolamento e trilha
append-only permanecem no servidor, intactos.

## 6. Ausência de migração

Nenhuma migração foi criada ou alterada. O ledger continua em **001–174**,
verificado pelo próprio gate (`Migration ledger verified: 001–174`). UX não
justifica migração e nenhuma necessidade funcional nova apareceu nesta fatia.

## 7. Cobertura, evidência e resultados

Cobertura automatizada é **parcial**: o gate focal cobre a jornada canônica
EXT-11 (criação, aprovação humana separada, transições, observação real,
recusa de dado sintético, idempotência, auditoria fail-closed, escrita legada
410), RBAC granular, estados honestos da tela, abas acessíveis e ausência de
scroll horizontal. **Não** cobre toda a superfície administrativa antiga, o
console de TI, dados reais do negócio nem aceite humano.

Evidência: `docs/ux-07-analytics-evidencias/` (`desktop-analytics.png`,
`mobile-analytics.png`, `resumo.json`), estágio `ux-07-analytics` adicionado a
`scripts/ux-evidence-capture.mjs`. `problems: []` nos dois viewports; o
bloqueio das fontes Google aparece em `externalBlocked` e **é esperado**, não
é falha.

Resultados:

- `npm run typecheck` — **passou**.
- `node --test tests/ux-analytics-vocabulary.test.mjs` — **9/9**.
- `node --test tests/ux-analytics-vocabulary.test.mjs tests/ux-analytics-workspace.integration.test.mjs` — **12/12**.
- `npm run test:ux-analytics:pg` — **20/20** (PostgreSQL embutido descartável,
  migrações 001–174, HTTP real, Chromium `@sparticuz/chromium`
  `--single-process`).
- `npm run test:unit` — **735/735**.
- Gates herdados que tocam `/admin/analytics`:
  `tests/admin-page-gates.test.mjs`, `tests/route-dispatch.test.mjs`,
  `tests/ext11-analytics.test.mjs` — **29/29**.
- `npm run ux:evidence -- --stage=ux-07-analytics` — **passou** em desktop e
  mobile.

## 8. Limitações conhecidas

- A tela não oferece registro de observação nem conclusão com nota; sem isso,
  um experimento não chega a `concluido` pela interface (seção 4).
- A leitura legada não tem apresentação própria.
- Nenhum dado real de negócio foi usado; toda a verificação usa massa
  sintética criada por HTTP dentro do gate descartável.
- Chromium em `--single-process` com baixa memória pode cair por
  `ERR_ASSERTION`/`SIGSEGV`; isso é crash de infraestrutura e a sessão inteira
  é repetida (o gate repete até duas vezes). Nenhuma asserção foi tornada
  tolerante.

## 9. Aceite humano

**Pendente.** Não há homologação de Marcelo nem de Andreia nesta fatia, e
nenhum aceite foi simulado. Revisão visual final e teste com dados reais do
negócio continuam pendentes. O merge é tarefa exclusiva do dono do
repositório.

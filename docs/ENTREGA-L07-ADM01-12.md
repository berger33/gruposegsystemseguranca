# ENTREGA L07 — ADM-01..12: painel funcional do Marcelo

Sessão Arena `arena/01a0fd08-gruposegsystemseguranca`, criada da `main` em
`ad8668b09f757da60e1486e52e57a9df4f39aae6` (merge da PR #73). Nenhuma PR de
referência anterior (#47/#53/#59/#60/#62) foi reavaliada; nenhum merge e nenhum
force push foram feitos.

## 1. O que existia antes (reproduzido por prova, não por opinião)

- `/admin/marcelo` era um **protótipo descritivo**: a página listava, em texto,
  o que o painel deveria ter. Nenhum cartão lia registro, nenhum número tinha
  fonte, nada abria lista ou registro.
- Os doze requisitos ADM-01..12 estavam `a_revalidar` no CHECKLIST com todos os
  campos “preencher”.
- `src/app/admin/ti/` guardava 82 componentes `*Client.tsx` (13.895 linhas) que
  **nenhuma rota importa** (prova em `docs/INVENTARIO-ADMIN-TI.md`), incluindo
  `AdmClient`/`AdmAdvancedClient`, rascunhos do painel ADM.
- A baseline do gate foi reconfirmada **antes** de qualquer edição, em um
  worktree do próprio commit base: `test:l07-delivery:pg` 37/37 em duas
  execuções consecutivas, `qa-wave0-static` 5/5, `typecheck` 0, `npm test`
  196/196, `test:migrations:pg` exit 0 (137/137, 522 tabelas).

## 2. O que foi implementado

### Banco — migração aditiva `138-adm01-12-painel-marcelo-decisoes-escopo.sql`

Somente aditiva, a partir do próximo número livre; constraints novas sobre
tabelas com histórico entram `NOT VALID`; nenhuma linha antiga recebe autoria
inventada.

- `adm_panel_decisions` (decisão unificada ADM-06) com `UNIQUE(idempotency_key)`,
  `UNIQUE(source_kind, source_id)`, CHECK de segregação (solicitante ≠ decisor)
  e CHECK de alçada (`authority_limit_cents >= amount_cents` quando aprovada).
- `adm_panel_decision_history` + gatilhos de imutabilidade (UPDATE/DELETE
  recusados em banco, inclusive por SQL direto).
- CHECKs `NOT VALID` de dono em `adm_search_favorites`, `adm_saved_filters` e
  `adm_shortcuts` (ADM-07).
- `adm_reports`: `idempotency_key`, `request_fingerprint`, `recipient_identity`,
  `source_tables`, `as_of` e autoria; `adm_report_logs.actor_identity` (ADM-08).
- `adm_business_configs.supersedes_id` + índice único parcial de versão ativa
  por chave (ADM-09).
- `adm_goals_comparison.realized_source/realized_as_of` (ADM-10),
  `adm_management_diary_access.accessor_identity` (ADM-11) e
  `adm_expansion_analyses.source_tables/computed_as_of` (ADM-12).

### API — `src/server/adm-panel-api.mjs` (11 rotas `/api/adm/panel/*`)

- **Autorização no servidor**: anônimo 401; papel fora de `admin|marcelo|ti`
  403; escrita exige mesma origem (403 `forbidden_origin`), papel decisor
  (403 `read_only` para TI) e identidade de sessão válida. A autoria **nunca**
  vem do cliente.
- **Indicadores**: doze cartões, cada um com uma única SQL canônica que serve o
  número e o drill-down, declarando `source.tables`, `source.period_field`,
  `period` e `as_of`.
- **Ausência ≠ falha ≠ zero**: leitura sem linhas devolve
  `empty_reason:'sem_registro_canonico_no_periodo'` com `amount_cents:null`;
  falha de leitura devolve `status:'indisponivel'` com `value:null` e
  `unavailable_reason`, e o drill-down responde 503 em vez de lista vazia.
- **Drill-down → registro real**: cada linha carrega
  `canonical.api=/api/adm/panel/record?kind=…&id=…` e a tabela de origem; o
  `/record` projeta colunas por allowlist (o lead, por exemplo, sai sem PII).
- **ADM-06**: decisão unificada de despesas e descontos, com advisory lock por
  chave de idempotência, replay 200, conflito de conteúdo 409, origem já
  decidida 409, alçada ausente/excedida 403, segregação 403, e origem +
  histórico + decisão + auditoria **na mesma transação**; auditoria
  indisponível → 503 e rollback completo.
- **ADM-07/08/09/10/11/12**: escopo por identidade, relatórios com total
  recalculado da fonte canônica e dados limitados, configurações versionadas,
  meta (estimativa) separada do realizado com fonte e data-base, diário CON-11
  filtrado por permissão com acesso registrado, e análises de expansão
  alimentadas por módulos reais.

### Interface — `src/app/admin/marcelo/MarceloPanel.tsx`

A página deixou de ser protótipo: oito abas (indicadores, aprovações, espaço de
trabalho, relatórios, configurações, metas, diário, expansão), período
ajustável, fonte e data-base visíveis por cartão, erro de leitura declarado com
“Tentar novamente” (nunca um zero no lugar), cartão acionável abrindo lista
filtrada e registro canônico, e formulário de decisão com motivo e chave de
idempotência. Dinheiro em `Intl.NumberFormat('pt-BR')`/BRL.

## 3. Prova automatizada

`tests/l07-delivery.integration.test.mjs` passou de 37 para **43 subtestes**
(HTTP real, PostgreSQL descartável, Chromium empacotado; dados sintéticos e
período próprio por subteste para contagem determinística):

1. **ADM-01..05/12 — papéis, origem e drill-down de cada indicador**: anônimo
   401 em indicador/drill-down/registro, RH e financeiro 403, TI lê com
   `can_decide:false`, Marcelo decide; os doze cartões declaram fonte, campo de
   período e data-base e batem com o universo canônico; **cada linha de cada
   indicador** abre o registro real pelo contrato publicado; lead sem PII;
   indicador inexistente 400, tipo arbitrário 400, UUID inválido 400,
   inexistente 404 sem vazar SQL; período inválido/invertido 400.
2. **Falha de leitura e retry**: com a fonte ilegível, dois cartões viram
   `indisponivel` com `value:null`, o drill-down responde 503, o cartão não
   relacionado continua correto e o retry recupera o número sem intervenção;
   período vazio é vazio declarado, não falha.
3. **ADM-06 — decisão unificada**: alçada ausente 403 sem alterar o registro;
   6 chamadas concorrentes com a mesma chave → 1 criação + 5 replays do mesmo
   id; limite aplicado em snapshot; histórico imutável comprovado por SQL
   direto; chave repetida com outro conteúdo 409; segunda decisão sobre a mesma
   origem 409; valor acima da alçada 403; **auditoria indisponível → 503 com
   rollback verificado em banco**; depois disso a decisão conclui e o item sai
   do cartão de pendências.
4. **ADM-07/08/09**: dono derivado da sessão e invisível para outra identidade;
   atalho externo 400; total do relatório igual ao do cartão; destinatário sem
   papel 403; download anônimo 401, de terceiro 403, do destinatário 200 com
   exatamente os cinco campos limitados; geração/download registrados;
   versões 1→2 preservando a anterior; três mutações com auditoria indisponível
   → 503 sem deixar resíduo.
5. **ADM-10/11/12**: estimativa e realizado separados com fonte própria; TI não
   vê decisão restrita e RH é barrado; acesso ao diário registrado com a
   identidade do leitor e revertido quando a auditoria falha; blocos de
   expansão com tipo/fonte e indisponibilidade declarada.
6. **Jornada Chromium de Marcelo**: abre o painel com a leitura falhando (erro
   visível, nenhum cartão inventado), clica em “Tentar novamente”, ajusta o
   período, confere valor em `R$`, fonte e data-base, abre o drill-down, abre o
   registro canônico, aprova a despesa pela aba de aprovações (o banco confirma
   `approver_identity` igual à sessão) e visita metas, diário e expansão.

## 4. Resultados reais no mesmo SHA

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `npm run typecheck` | exit 0 |
| `npm test` (unitários) | 196/196 |
| `npm run build` | exit 0 |
| `npm run test:l07-delivery:pg` | **43/43** — veja a nota de execuções abaixo |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:migrations:pg` (baseline do commit base) | exit 0, 137/137, 522 tabelas |

Transparência das execuções, sem maquiagem: a primeira rodada final do gate L07
passou 43/43; a segunda reprovou **apenas** o subteste 22 — a jornada Chromium
**legada** do FIN-10 — com `Carregando histórico…` ainda na tela, a mesma
manifestação transitória já documentada nas execuções 7 e 8 do histórico do
L07 (disputa de CPU no ambiente de dois núcleos). Nenhum subteste ADM reprovou
em nenhuma execução. Nenhum timeout foi aumentado, nenhum `skip` foi usado e
nenhuma assertiva foi removida ou enfraquecida; o gate foi reexecutado duas
vezes consecutivas para obter as duas rodadas limpas exigidas.

Também por transparência: na reconfirmação da baseline (commit base, sem
nenhuma alteração desta sessão) o gate `test:l03-delivery:pg` reprovou uma vez
com `403 /api/employee/offline`, e passou no SHA entregue. É instabilidade
pré-existente do L03 observada no ambiente, não regressão desta entrega.

## 5. Componentes órfãos de `/admin/ti`

Inventário por prova em [`docs/INVENTARIO-ADMIN-TI.md`](./INVENTARIO-ADMIN-TI.md):
0 promovidos como estão, **2 adaptados** (`AdmClient`, `AdmAdvancedClient`,
reimplementados no painel com autorização, fonte e drill-down provados) e
**80 mantidos como dívida explícita**, com critério objetivo de saída da
dívida. Nenhum arquivo foi apagado.

## 6. Limites honestos

- **Aceite humano pendente**: Marcelo e Andreia não validaram este painel.
  ADM-01..12 ficam `pronto_local`; nada aqui autoriza declarar L07 concluído.
- Nada externo: nenhum PSP, banco, SMTP, emissão, pagamento ou dado de cliente
  real. Todo o universo exercitado é sintético e descartável.
- Os cartões cobrem os registros canônicos existentes hoje. Onde o módulo de
  origem ainda não produz registro (por exemplo, análises de expansão
  registradas), o painel diz que não há registro — não preenche com número.
- A margem por contrato de ADM-04 é apresentada a partir de recebíveis e
  pagáveis canônicos; não há rateio contábil inventado.
- FIN-01..16 permanecem `pronto_local` com aceite humano pendente, intocados
  por esta entrega (FIN-13/134, FIN-12→FIN-04/135, FIN-10/136 e FIN-14/15/16/137
  preservados).

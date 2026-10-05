# UX-07A — Família de operação (L06): estado honesto e abas de verdade

Data: 2026-10-05 · Branch `arena/59c7190d-gruposegsystemseguranca`
Base: `main` em `a6b5c064731906caee8b23e6814dab7fa9294e9e`
(UX-06, PR #156). Migrações continuam **001–174**: nenhuma criada, nenhuma
alterada.

Esta é a **fatia A** da UX-07 (famílias restantes). Uma família por PR, sem
reescrita de lógica, com teste focal de regressão.

| Rota | Natureza | Autorização (inalterada) |
| --- | --- | --- |
| `/admin/operacao` | **Produto.** Superfície canônica de operação L06. | `AdminGate allowedRoles={['supervisor','marcelo','admin','ti']}` + sessão de equipe exigida em `ops-api.mjs` e irmãs (`401 unauthorized`); escrita exige `admin\|ti\|rh` (`403 forbidden`). |

## 1. O que mudou e o que NÃO mudou

Fatia de **apresentação, vocabulário e acessibilidade**. Nenhuma rota de API,
método, corpo, cabeçalho, `Idempotency-Key`, regra de sessão, escopo de dados,
`AdminGate` ou migração foi tocado.

| Não mudou | Onde continua sendo decidido |
| --- | --- |
| Quem abre a tela | `src/app/admin/operacao/page.tsx` (`AdminGate`, quatro papéis) |
| Quem lê operação | `requireSession` em `ops-api.mjs` e irmãs → `401 unauthorized` |
| Quem escreve operação | `requireRole(sess, ['admin','ti','rh'])` → `403 forbidden` |
| Jornada, descanso, sobreposição e habilitação | motor OPS-04 no servidor (`overlap_detected`, `max_weekly_hours_exceeded`, `min_rest_hours_violated`, `qualification_required`) |
| Contrato não operacional não recebe nova alocação | `contract_not_operational`, no servidor; histórico preservado |
| Auditoria fail-closed | `audit_unavailable`: sem trilha, nada é gravado |
| Idempotência da ciência de escala | `duplicate_ack`, no servidor |

**Menu não é autorização.** O supervisor passa pelo `AdminGate` e lê, mas a
escrita continua recusada com `403 forbidden` — e agora a tela **diz isso**,
em vez de exibir o código cru. Nenhum acesso foi ampliado.

## 2. Diagnóstico da tela anterior (medido, não suposto)

| Defeito observado | Consequência |
| --- | --- |
| `catch (err: any) { setError(err.message \|\| "Falha ao carregar.") }` em cinco pontos. | O usuário lia `read_unavailable` cru, ou a frase genérica. **403 (negado) e 503 (indisponível) ficavam indistinguíveis.** |
| `fetchJson` lançava `new Error(value.error)` — status HTTP descartado. | Impossível distinguir sessão, concessão, conflito e falha. |
| Falha de rede (`fetch` rejeitado) caía no mesmo texto. | Requisição que nem chegou aparecia como erro do servidor. |
| 17 painéis com `<p>Nenhum …</p>`. | Vazio e falha usavam a mesma aparência; ausência de registro era afirmada mesmo sem leitura concluída. |
| `role="tab"` em 14 botões **sem** `tabpanel`, sem roving tabindex, sem teclado. | ARIA inválido: o leitor de tela anuncia aba sem painel, e seta/Home/End não navegavam. |
| 287 `style` inline. | Superfície visual fora do padrão `UiWorkspace`. |

## 3. O que foi entregue

1. **`src/lib/ops-vocabulary.mjs` (+ `.d.mts`)** — tradução dos **140 códigos**
   da união de `ops-api.mjs`, `ops-advanced-api.mjs`, `ops-advanced2-api.mjs`,
   `ops-advanced3-api.mjs` e `ops-pendency-api.mjs`. Nenhum a mais, nenhum a
   menos (o teste de deriva falha nos dois sentidos).
   `describeOpsError(code, status) -> { kind, title, detail, status, canRetry, code }`,
   `opsErrorVariant` e `opsErrorFootnote` (código canônico **só entre
   parênteses, no rodapé**). Rótulos de situação, tipo de posto, tipo de turno,
   gravidade e dia da semana: **VALOR canônico, só o RÓTULO muda; valor
   desconhecido passa cru**.
2. **`src/app/admin/operacao/OperacaoWorkspace.tsx`**:
   - `fetchJson` preserva **código + status** e distingue falha de rede
     (`status 0`) de resposta de erro;
   - os quatro grupos de leitura (geral, estrutura, dimensionamento, escalas)
     guardam um descritor tipado, não uma string;
   - `UiState` com `data-ui-state` em **carregando, vazio, falha e negado**;
     nova tentativa só aparece quando `canRetry`;
   - **17** estados vazios passam a declarar que *a leitura foi concluída com
     sucesso* — é a frase que separa "não há registro" de "não consegui ler";
   - abas de verdade: `tablist/tab/tabpanel`, `aria-controls`, roving tabindex
     e ←/→/Home/End, dirigidas por uma única tabela `OPS_TABS`;
   - `WEEKDAY_LABELS` local removido em favor de `weekdayLabel` — e `NULL`
     continua sendo **"Sem dia específico"**, nunca "todos os dias".
3. **Teste de deriva** `tests/ux-ops-vocabulary.test.mjs` (18 casos): lê os
   cinco servidores e **falha** se a UI traduzir código inexistente ou deixar
   código do servidor sem frase; tranca também "falha ≠ zero", "negado ≠
   indisponível", rodapé com HTTP e código, e os rótulos contra o contrato.
4. **Gate por domínio**: `scripts/qa-ux-ops-postgres.mjs` (PostgreSQL embutido
   descartável; recusa rodar com `DATABASE_URL` definido) +
   `tests/ux-ops-workspace.integration.test.mjs` (7 casos) + workflow
   `.github/workflows/ux-ops-delivery.yml`.

## 4. Verificação executada nesta sessão (local, Node 22, Linux)

| Comando | Resultado | Natureza |
| --- | --- | --- |
| `npm ci` | OK | ambiente |
| `npm run typecheck` | OK | estático |
| `node scripts/qa-wave0-static.mjs` | **5/5** | estático |
| `node --test tests/ux-ops-vocabulary.test.mjs` | **18/18** | estático (lê o código dos servidores) |
| `npm test` | **688/688** | estático + unidade |
| `npm run test:ux-portal:pg` | **11/11** | HTTP real + PostgreSQL real + Chromium (regressão UX-06) |
| `npm run test:ux-ops:pg` | **7/7** | HTTP real + PostgreSQL real + Chromium |
| `npm run build` | OK | build de produção |
| `npm run ux:evidence -- --stage=ux-07a` | **OK em 1440x900 e 390x844**; capturas em `docs/ux-07a-evidencias/` | Chromium real |

**Regressão achada e corrigida durante a verificação:** a primeira captura a
390px acusou `rolagem horizontal do documento: 439 > 390`, causada pelas
tabelas de largura fixa dentro das seções. Corrigido aplicando
`styles.legacy` (`min-width: 0; overflow-x: auto`) às 19 seções da tela: a
tabela rola dentro da própria seção, e o documento não transborda. A segunda
captura passou nos dois tamanhos. O gate `test:ux-ops:pg` foi reexecutado
depois da correção (**7/7**).

A CI do repositório já esgotou runners em sessões anteriores (jobs cancelados
na fila aparecem como falha com `steps` vazio). Por isso **os gates foram
rodados localmente e o resultado está registrado acima**.

## 5. O que esta fatia NÃO provou

- **Aceite humano: pendente, por decisão explícita.** Marcelo e Andreia não
  participam; nenhuma homologação foi simulada ou inventada.
- O gate exercita **leitura** pela tela. A escrita de operação pela interface
  (criar posto, cargo, necessidade, entrada de escala) é provada por HTTP, não
  por navegador.
- As abas **OPS-09 a OPS-16** (`supervisao`, `rondas`, `relatorios`,
  `metricas`, `limpeza`, `monitoramento`) continuam renderizando
  `OpsAdvanced2Client` e `OpsAdvanced3Client`, que mantêm **estados próprios**
  ainda não migrados para `UiState`. Isso é declarado, não disfarçado.
- Restam **273** atributos `style` inline na tela (eram 287). A superfície
  visual só foi trocada onde o estado honesto exigiu; uma troca cega de 287
  estilos seria reescrita, não a fatia combinada. As 19 seções receberam
  `styles.legacy` (contenção e rolagem local), que é o que resolveu o
  transbordo a 390px — ver item 4.
- Nenhuma tela de referência foi promovida a produto.

## 6. Rotas da família ainda pendentes na UX-07

Levantadas, **não** tratadas nesta fatia (ordem por tamanho):
`licitacoes/LicitacoesWorkspace.tsx` (968), `crm/page.tsx` (876 — já tratada em
UX-03B), `expansao/ExpansionWorkspace.tsx` (828),
`terceiros/TerceirosWorkspace.tsx` (751), `frota/FrotaWorkspace.tsx` (631),
`conhecimento/KnowledgeWorkspace.tsx` (532),
`compliance/ComplianceWorkspace.tsx` (522), `financeiro/BudgetWorkspace.tsx`
(418) + `BankReconciliationWorkspace.tsx` (276),
`patrimonio/PatrimonioWorkspace.tsx` (417).

## 7. Runbook do operador (não executado)

Nada abaixo foi executado contra banco do operador. Nenhum comando é
destrutivo; nenhum segredo aparece.

```
npm ci
npm run typecheck
node --test tests/ux-ops-vocabulary.test.mjs
npm run test:ux-ops:pg     # sobe PostgreSQL descartável; recusa rodar se DATABASE_URL existir
npm run build
```

O gate recusa-se a rodar com `DATABASE_URL`, `DATABASE_MIGRATION_URL` ou
`RUN_DATABASE_INTEGRATION_REMOTE=1` definidos (saída 2). O cluster temporário é
removido ao final (`QA_PG_TEMP_CLEANED: true`).

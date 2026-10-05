# Prompt de continuação — UX-07, UX-08 e UX-09

Gerado em 2026-10-05, após o merge de UX-06 (PR #156).
Copie o bloco abaixo como mensagem inicial da próxima sessão.

---

Continue a evolução de UX do SEG System em `github.com/berger33/gruposegsystemseguranca`.
**O GitHub é a fonte da verdade: comece clonando o `main` mais recente. Nunca use ZIP ou snapshot antigo.**

## 1. Ponto de partida

- `main` = **`a6b5c06`** ("UX-06: portais do funcionário e do cliente com estado honesto de leitura (#156)").
- Migrações: **001–174**. A próxima livre é a 175. **Não altere migração existente**; só crie 175+ com necessidade funcional provada.
- PRs abertos: **apenas #152** (UX-03B, superado por #154). **Não mergeie, não feche, não reabra** — é tarefa do dono fechar sem merge.
- `node_modules` não persiste entre sessões: rode `npm ci` ao retomar (Node 22).

Já entregue e **mergeado** — não refaça: UX-00, UX-01, UX-02, UX-03A, UX-03B, UX-04, UX-05, UX-05.1 e **UX-06**.

| Etapa | Commit / PR |
| --- | --- |
| UX-03B | `cc9a529`, `de1a1d6` · PR #154 (merge `e96a69a`) |
| UX-04 RH | `2740854` |
| UX-05 Marcelo | `614f8fe` · PR #155 (merge `f0dea7b`) |
| UX-05.1 pendências herdadas | `cb20c47` |
| **UX-06 portais** | `0771e29` · **PR #156 (merge `a6b5c06`)** |

## 2. O que falta: UX-07, UX-08, UX-09

Ordem do plano-mestre (`docs/UX-PLANO-MESTRE-2026-10-05.md`, seção 7), **um commit bem descrito por família**.

### UX-07 — famílias restantes (operação, financeiro, contratos, compliance, extensões)
Uma família por PR, **sem reescrita de lógica**, com teste focal de regressão.
Registre **toda** rota coberta e as que ficaram pendentes.

Terreno já levantado para a fatia A (operação), use e não repita:
- Tela: `src/app/admin/operacao/OperacaoWorkspace.tsx` — **1373 linhas, 287 `style` inline**, `role="tab"` **sem** `tabpanel`, sem roving tabindex e sem teclado; erros exibidos como `err.message` ("Falha ao carregar.").
- APIs da família: `src/server/ops-api.mjs` (1672 l.), `ops-advanced-api.mjs` (1571 l.), `ops-advanced2-api.mjs`, `ops-advanced3-api.mjs`, `ops-pendency-api.mjs` — **~140 códigos distintos** na união, incluindo `audit_unavailable`, `read_unavailable`, `*_unavailable`, `forbidden`, `origin_forbidden`, `unauthorized`, `overlap_detected`, `max_weekly_hours_exceeded`, `min_rest_hours_violated`, `qualification_required`, `mandatory_items_pending`, `version_not_published`.
- Demais telas da família, por tamanho: `licitacoes/LicitacoesWorkspace.tsx` 968, `crm/page.tsx` 876, `expansao/ExpansionWorkspace.tsx` 828, `terceiros/TerceirosWorkspace.tsx` 751, `frota/FrotaWorkspace.tsx` 631, `conhecimento/KnowledgeWorkspace.tsx` 532, `compliance/ComplianceWorkspace.tsx` 522, `financeiro/BudgetWorkspace.tsx` 418 + `BankReconciliationWorkspace.tsx` 276, `patrimonio/PatrimonioWorkspace.tsx` 417.

### UX-08 — TI/RAG, mensagens públicas, polimento global
**Achado já confirmado, aproveite:** `/admin/ti` é um **protótipo descritivo**. `src/app/admin/ti/page.tsx` renderiza 10 cartões estáticos sob `AdminGate allowedRoles={['ti','admin']}`, com aviso de que os componentes "ainda não estão conectados a esta página". Dos **81 arquivos** da pasta, só **26** são importados. Órfãos **reais** (verificados por amostragem): `RbacClient`, `AuditClient`, `BackupClient`, `ConfigClient`, `EnvClient`, `HealthcheckClient`, `ObservabilityClient`, `IntegrationsClient`, `PrivacyClient`, `LgpdRequestClient`, `RetentionClient`, `ThemeClient`, `SeoClient`, `CmsClient`, `AiRagClient`, `DependencyClient`, `IncidentClient`, além das famílias Adm/Ast/Cli/Emp/Ext/Fin/Contract.
Plano aprovado: console de TI agrupado que **monta sob demanda** (dynamic import) os consoles genuínos, `AdminGate` e autorização do servidor **intocados**, rótulo "apenas referência" **só** onde de fato é protótipo.
Mensagens claras para: **Ollama indisponível**, **índice vazio** e **falha de leitura** (`src/app/admin/ti/AiRagClient.tsx` 293 l., `src/server/ai-rag-api.mjs`, `ai-rag-real-api.mjs`, `docs/AI-RAG-LOCAL-2026-10-05.md`).

### UX-09 — auditoria transversal e aceite
Matriz jornada×estado, WCAG, testes de regressão, métricas e pendências honestas.

## 3. Entregável final

Relatório versionado contendo:
1. SHA inicial e final, PRs e commits por etapa;
2. matriz de rotas atualizada em `docs/UX-RELATORIO-FINAL-MATRIZ-ROTAS.csv` (98 rotas);
3. testes/comandos com resultado e ambiente, **separando** estático, HTTP real, PostgreSQL real e aceite humano;
4. fluxos e permissões preservados, mais regressões achadas e corrigidas;
5. lista objetiva do que **não** foi concluído e por quê;
6. runbook do operador sem segredos e sem operação destrutiva automática, **declarando que não foi executado**;
7. novo prompt de continuação.

## 4. Padrão obrigatório (não invente outro)

- **Vocabulário** em `src/lib/<dominio>-vocabulary.mjs` (+ `.d.mts`): VALOR continua canônico, só o RÓTULO muda; valor desconhecido **passa cru**.
- **Erros**: `describe<Dominio>Error(code, status) -> { kind, title, detail, status, canRetry }`. Título humano; código canônico **só entre parênteses, no rodapé**.
- **Estados**: `src/components/ui/UiState` (`loading|empty|error|denied|success`, atributo `data-ui-state`, `role=alert` em error/denied). O selo é maiusculizado por CSS — compare texto sem distinguir caixa.
- **Superfície visual**: `src/components/ui/UiWorkspace.module.css`. Evite `style` inline.
- **Abas**: `tablist/tab/tabpanel` de verdade, roving tabindex, ←/→/Home/End.
- **Teste de deriva por domínio**: ler o arquivo da API e **FALHAR** se a UI traduzir código inexistente ou deixar código do servidor sem frase.
- **Gate por domínio**: `scripts/qa-ux-<dominio>-postgres.mjs` (PostgreSQL embutido descartável; recusa rodar se `DATABASE_URL` estiver definido) + `tests/ux-<dominio>-*.integration.test.mjs` + workflow em `.github/workflows/`.
- **Evidência**: `npm run ux:evidence -- --stage=<etapa>`. Nunca chame `scripts/ux-evidence-capture.mjs` direto (sai com 2).
- Modelos prontos para copiar: **UX-06** (`src/lib/portal-vocabulary.mjs`, `tests/ux-portal-vocabulary.test.mjs`, `tests/ux-portal-workspace.integration.test.mjs`, `scripts/qa-ux-portal-postgres.mjs`, `.github/workflows/ux-portal-delivery.yml`, `docs/UX-06-PORTAIS-2026-10-05.md`) e UX-05 (`ux-adm-*`).

## 5. Invariantes que não podem cair

Autenticação, permissões granulares, isolamento por conta, idempotência, auditoria *fail-closed*, históricos, operação local.

- **Menu não é autorização**: mantenha todo `AdminGate` e toda guarda RBAC. Se um papel passa pelo menu mas não tem a concessão, **diga isso** — não amplie acesso.
- **Falha NUNCA vira zero.** Carregando, vazio, indisponível, negado e falha são **cinco** estados distintos.
- **Não enfraqueça teste** para deixar verificação verde.
- **Não transforme protótipo em "funcionando" por cosmética**; rotule o que é referência.
- **Sem dependência pesada**: o PC do operador tem 8 GB de RAM e não tem GPU.
- **Nunca exiba segredo, credencial ou dado pessoal** em PR ou captura.
- **Aceite humano**: Marcelo e Andreia **não participam**. Não peça participação e não invente homologação. O aceite permanece **pendente**.

## 6. Armadilhas confirmadas (não as acione de novo)

- Não existe `AGENTS.md`.
- Não há PostgreSQL de sistema: use `embedded-postgres`. O download de browser do Playwright é bloqueado: use `@sparticuz/chromium` com `--single-process`.
- **`--single-process`: fechar um `BrowserContext` derruba o processo.** Use **um browser novo por contexto**.
- `page.route()` é instável nesse Chromium — substitua `window.fetch` via `page.addInitScript`. **Nunca enfraqueça o servidor para o teste passar.**
- `page.locator('main')` é ambíguo nas telas admin: ancore em `data-ui-state` ou em classe de CSS-module. A 390px a barra lateral fica no DOM, porém oculta: `getByText(...).first()` pode casar nó invisível e travar.
- Tabpanels de workspace são nomeados por um `h2` `visuallyHidden` que duplica o `h3` do painel → `getByRole('heading', { name })` vira violação de modo estrito. Passe **`level: 3`** (ou use o `id`).
- `getByRole(..., { name })` é por substring, a não ser com `exact: true` — e `exact: true` quebra em abas com sufixo `visuallyHidden`. Use regex ancorada em `^`.
- Importar helper de vocabulário em tela que já declara constante de mesmo nome → **TS2440**. Renomeie a constante local.
- `git stash` suja `next-env.d.ts`: rode `git checkout next-env.d.ts` antes de `pop` e antes de commitar. Um gate novo também acrescenta entradas `.next/integration-ux-<dom>/...` em `tsconfig.json` — é esperado, mantenha.
- Migração 102 concede `employees.read/write` ao papel `rh` e **não** a `ti`/`admin`/`marcelo`, enquanto `/admin/funcionarios` aceita os quatro: consulte `auth_permissions` antes de escrever fixture negativa.
- `MarceloPanel.tsx` tem 99 `data-testid`: faça patch dirigido com diff de conjunto, **nunca** reescrita cega.
- **A CI já disparou ~17 jobs PostgreSQL+Chromium e esgotou os runners**: jobs são CANCELADOS na fila e aparecem como falha com `steps` vazio. Foi assim que a quebra do L03 chegou ao `main` sem ninguém ver. **Rode os gates localmente e registre o resultado.** (No PR #156 os 18 checks passaram; não conte com isso.)

## 7. Comandos de verificação

```
npm ci
npm run typecheck
node scripts/qa-wave0-static.mjs          # 5/5
node --test tests/ux-portal-vocabulary.test.mjs   # 17/17
npm run test:ux-portal:pg                 # 11/11
npm run test:ux-hr:pg                     # 13/13
npm run test:ux-adm:pg                    # 11/11
npm run test:ux-crm:pg                    # 7/7
npm run test:l03-delivery:pg              # 1/1
npm run test:l07-delivery:pg              # 43/43
npm test
npm run build
```

## 8. Pendências declaradas que UX-07/UX-09 herdam de UX-06

1. As **12 sub-rotas de `/cliente/app/*`** já separam carregando / vazio / falha e recebem a mensagem honesta vinda da provedora, mas o `catch` local ainda colapsa **403 (negado)** e **503 (falha)** na mesma frase genérica. Deveriam ser dois estados.
2. `ClientAppNavigation.tsx` continua sendo navegação real (13 `<Link>` com `aria-current="page"`) — **não** a converta em `role="tab"`, seria mentira semântica. Falta revisar rótulos e alvos de toque a 390px.
3. Telas de referência em `/cliente/{chamados,contratos,documentos,painel,conta}` seguem como protótipo, não promovidas.
4. **Aceite humano: pendente, por decisão explícita.**

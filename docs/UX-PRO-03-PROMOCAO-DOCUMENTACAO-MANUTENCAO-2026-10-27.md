# UX-PRO-03 — 2ª promoção "com prova": PLT-18 documentação de manutenção

**Data:** 27/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** 1 família, 1 PR (escopo local, sem commit/push). Continuação de [`UX-PRO-03-PROMOCAO-DEPENDENCIAS-2026-10-27.md`](UX-PRO-03-PROMOCAO-DEPENDENCIAS-2026-10-27.md).

## 1. Por que esta família

Sem ordem de áreas declarada pelo proprietário, apliquei o mesmo critério da fatia anterior — **menor risco com autorização já decidida no servidor**:

| Critério | PLT-18 `MaintenanceDocClient` |
|---|---|
| Papel no servidor | **os dois handlers** (`handleDocs`, `handleDocById`) chamam `requireRole(sess,['admin','ti'])`; a leitura pública usa caminho **separado** (`/api/docs`), que a aba não chama |
| Contrato antigo e estável | migração `056-plt18-maintenance-docs.sql`; **7 documentos sintéticos** semeados com `ON CONFLICT DO NOTHING` |
| Fonte/período/data-base | `published_at`, `created_at`, `version`, `created_by`, `change_summary`, `changed_by` vêm do banco |
| Drill-down natural | detalhe integral + registro canônico em JSON + histórico de versões (`maintenance_doc_history`) |
| Ação externa | nenhuma: a tela não executa migração, backup, restauração nem envia mensagem |

A dívida registrada na fatia anterior sobre `IntegrationsClient` (PLT-03) **permanece**: seu módulo aceita qualquer sessão staff e promovê-lo exigiria mudar permissão. Nenhuma alteração foi feita nele.

## 2. O que mudou (aditivo)

- **`src/app/admin/ti/MaintenanceDocClient.tsx`** — reescrito. O protótipo era inseguro de montar: `document.getElementById` para ler um `textarea`, hex inline, `style={{...}}`, `any`, `fetch` sem checar status, conteúdo cortado em 2000 caracteres e um único `<p>` para qualquer falha. Agora:
  - **quatro estados** de leitura via `UiState` (`loading`, `empty`, `error`, `denied`) com retry, mais estados próprios para a abertura do detalhe;
  - `Array.isArray` na lista e no histórico, `sequence` e `detailSequence` descartando respostas fora de ordem, limpeza completa de seleção/histórico ao trocar de leitura;
  - `aria-busy`, `role="status"`/`role="alert"`, `<label>` associado a todos os campos, `<details>` de drill-down, conteúdo **integral** (sem corte);
  - **todos os contratos preservados**: GET da lista, GET do detalhe com histórico, POST de documento, PATCH de publicação e PATCH de nova versão (que cria outro `id` — a tela reabre o registro devolvido); tradução de `title_min_10`, `content_min_50`, `slug_min_3`, `invalid_category`, `invalid_status`, `no_changes`, `not_found`, `forbidden` etc.;
  - honestidade: o rodapé declara que os 7 documentos semeados são **conteúdo sintético, não procedimento homologado**, e que publicar torna o registro visível em `/api/docs`.
- **`src/app/admin/ti/MaintenanceDocClient.module.css`** (novo) — tokens `--ux-color-*`, breakpoints 900/650 px, `:focus-visible`, zero hex.
- **`src/app/admin/ti/TiConsole.tsx`** — 14ª aba `['manutencao','Documentação de manutenção']` no grupo "Saúde e operação".
- **`scripts/ux-pro-03-ti-inventory.mjs`** — segunda entrada em `PROMOCOES_COM_PROVA`; `--check` exige que **cada** promoção tenha aba montada com `com_prova` **e** relatório existente no disco.
- **`tests/ux-pro-03-ti-reaudit.test.mjs`** — `EXPECTED_TABS = 14`.

**Preservado:** nenhuma migração, rota de API, RBAC, permissão, segredo, dado de produção ou configuração foi alterado. A única mudança em handler foi a correção dos dois defeitos descritos em 2.1, dentro do próprio módulo PLT-18 e provada pelo gate. Os 44 órfãos restantes continuam sem rota.

### 2.1 Dois defeitos reais que a promoção revelou (e corrigiu com prova)

A exigência de prova em navegador foi justamente o que expôs bugs que o protótipo órfão nunca poderia mostrar:

1. **`src/server/maintenance-doc-api.mjs:5` — `uuidRe` sem o 4º grupo.** A regex era `8-4-4-12` em vez de `8-4-4-4-12`, então **todo UUID válido** era recusado com `400 invalid_id` em `GET /api/admin/maintenance/docs/<uuid>`. O detalhe e o histórico de versões eram inalcançáveis por qualquer cliente. O gate capturou a resposta real (`400 {"error":"invalid_id"}` para um UUID de 36 caracteres) antes da correção. Guarda de regressão adicionada ao teste focal.
2. **`src/server/maintenance-doc-api.mjs` — atribuições duplicadas no `UPDATE` de publicação.** Com `status:'publicado'` **e** `publish:true` (payload que o próprio protótipo enviava), o handler montava `SET is_published=true, published_at=now(), …, is_published=true, published_at=now()`. O PostgreSQL recusa com *multiple assignments to same column*, e o PATCH falhava. Aplicado dedupe: o segundo bloco só entra quando `next_status !== 'publicado'`. Após a correção o gate registrou `PATCH 200`. Guarda de regressão no teste focal.

**Efeito colateral registrado como E17:** o mesmo `uuidRe` quebrado existe em `src/server/env-api.mjs:7` e `src/server/budget-api.mjs:6`. **Não foram alterados** — pertencem a outras famílias e exigem fatia própria com RED focal e gate. Corrigi-los aqui sem prova seria exatamente o tipo de atalho que a decisão de 02/10 proíbe.

**E13 residual:** `dist/LEIA-ME.md` não sobrevive a snapshots do ambiente (`dist/` é diretório excluído), o que fazia `tests/package-artifacts.test.mjs` falhar em `npm test` no início desta fatia. A guarda passou a materializar o aviso a partir do canônico `downloads/LEIA-ME.md` num hook `before`; nenhuma asserção foi afrouxada.

## 3. Os cinco critérios de 02/10 e suas provas

| Critério | Prova |
|---|---|
| Rota real | aba alcançável por teclado em `/admin/ti`, atrás de `AdminGate allowedRoles={['ti','admin']}` |
| Autorização decidida no servidor | `requireRole(sess,['admin','ti'])` nos 2 handlers; **HTTP real** no gate: `rh` recebe **403**, `ti` recebe **200** com a lista |
| Fonte/período/data-base | cabeçalho nomeia `maintenance_docs` e `maintenance_doc_history`; "Data-base: publicação mais recente em …"; `published_at`/`created_at`/`version`/`created_by` por registro |
| Drill-down ao registro canônico | "Abrir e ver histórico" → conteúdo integral, JSON do documento e histórico com `change_summary` e `changed_by` |
| Erro de leitura com retry + subteste no gate | `503` → `data-ui-state="error"`; restauração do `fetch` real + retry → volta à leitura; `403` → `data-ui-state="denied"` distinto. Cenário no gate PostgreSQL 17 + Chromium |

## 4. Evidências

| Verificação | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-maintenance-docs-ui.test.mjs` | **RED 0/4 → GREEN 4/4** |
| Guarda de reauditoria (14 abas) | **3/3** — voltou a detectar a promoção e exigiu contagem/CSV |
| Cenário focal no gate | **1/1** |
| Gate completo `test:ux-portal:pg` | **37/37**, 0 falhas |
| `npm test` | **1076/1076**, 0 falhas/skips/todo (133 arquivos no `test:unit`) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / `ux-pro-00 --check` / `ux-pro-03 --check` | 5/5 / 100 rotas / 83 componentes, 2 promoções com relatório |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |
| `next-env.d.ts` / `tsconfig.json` após o gate | SHA `1862ac4b…` / `2128c956…` intactos |

**Cenário A/B e escrita real (PostgreSQL descartável, Chromium):**
- **A** — documento `QA-PLT18-ALFA` (slug `qa-plt18-alfa`, categoria `arquitetura`, tag `qa-plt18-a`); **B** — `QA-PLT18-BETA` (categoria `diagnostico`, tag `qa-plt18-b`).
- Em A os marcadores de B não aparecem; em B os de A desaparecem — prova de que a leitura usa o banco atual e limpa o estado anterior, incluindo o detalhe aberto.
- **POST pela UI**: preenchimento do formulário → `201` → mensagem com versão/slug → documento aparece na lista (fecha a limitação da fatia anterior, que só provara leitura).
- **PATCH pela UI**: publicação e nova versão, com o histórico exibindo `change_summary` e `changed_by`.
- 320 / 390 / 768 / 1440 px: zero transbordo; foco na aba e ativação por `Enter`.
- `503` e `403` produzem estados distintos; retry recupera sem recarregar a página.

> **Atualizações no mesmo dia:** o E17 registrado nesta fatia como "2 módulos" foi reauditado e **fechado** (8 regexes em 7 módulos, guarda permanente e gate HTTP — `docs/E17-UUID-VALIDACAO-RESULTADO-2026-10-27.md`). Em seguida, a 3ª promoção (PLT-16 Orçamento e uso) elevou o console a **16 abas / 42 órfãos / 4 promoções** e provou o E17 na interface — `docs/UX-PRO-03-PROMOCAO-ORCAMENTO-USO-2026-10-27.md`.

## 5. Limitações honestas

- O teste focal e a guarda são prova estática; o cenário de navegador cobre leitura, POST, publicação e nova versão, mas **não** cobre todos os erros de validação do servidor nem concorrência de versões entre dois operadores.
- Publicar um documento o torna visível na leitura pública — a decisão continua humana e auditada; o QA usa apenas registros sintéticos e os remove ao final.
- Sem aceite humano, UAT, Windows real ou leitor de tela. **Produção: NO-GO.**
- Restam **44 órfãos**. Nenhuma ordem entre famílias foi inventada.

## 6. Próxima fatia

Escolher a próxima família com o mesmo conjunto de provas, ou resolver a dívida de papel de PLT-03 antes de promovê-la. Instrumento de estado: `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`/`.json`. Fila vigente: `docs/STATUS-VIGENTE.md`.

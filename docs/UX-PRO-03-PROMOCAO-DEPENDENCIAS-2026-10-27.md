# UX-PRO-03 — primeira promoção "com prova" de órfão de `/admin/ti` (PLT-14)

**Data:** 27/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** 1 família, 1 PR (escopo local, sem commit/push). Continuação de [`UX-PRO-03-REAUDITORIA-TICONSOLE-2026-10-27.md`](UX-PRO-03-REAUDITORIA-TICONSOLE-2026-10-27.md).

## 1. Por que esta família

A decisão de 02/10 (`docs/ENTREGA-L07-ACEITE-E-AUDITORIA-L08.md`) autoriza **promover por área somente com prova** e **não declara ordem entre áreas**. Sem pedido de área específica, escolhi pelo critério de menor risco, não por preferência de negócio:

| Critério | PLT-14 `DependencyClient` |
|---|---|
| Autorização já no servidor | **os quatro handlers** (`audits`, `vulnerabilities`, `updates`, `lockfile`) chamam `requireRole(sess,['admin','ti'])` em `src/server/dependency-api.mjs` |
| Contrato antigo e estável | migração `052-plt14-dependencies.sql`; quatro rotas despachadas em `server.mjs` |
| Domínio estritamente de TI | auditoria de dependências, lockfile, vulnerabilidades, atualizações — cabe no grupo "Saúde e operação" do console |
| Indicador com fonte/data-base | `audit_date`, `created_by`, `lockfileVersion`, `packagesCount` vêm do banco/arquivo lido no servidor |
| Ação externa | **nenhuma**: a tela não instala pacotes, não chama provedor e não envia mensagem |

**Candidata descartada:** `IntegrationsClient` (PLT-03) era menor e da mesma área de integrações, mas `src/server/integrations-api.mjs` exige apenas **uma sessão staff qualquer**, sem restringir papel. Promovê-la exigiria **alterar permissão no servidor**, o que está fora do escopo autorizado (preservar papéis e permissões). Fica registrada como dívida: antes de promover PLT-03 é preciso decidir e provar o gate de papel. Não foi feita nenhuma alteração nesse módulo.

## 2. O que mudou (aditivo)

- **`src/app/admin/ti/DependencyClient.tsx`** — reescrito. O protótipo era inseguro de montar como estava: `alert`/`prompt`, cores hex inline, `style={{...}}` espalhado, `any`, `fetch` sem verificação de status e um único `<p>` para toda e qualquer falha. Agora:
  - quatro estados de leitura distintos via `UiState` (`loading`, `empty`, `error`, `denied`), cada um com mensagem própria e **retry**;
  - `Array.isArray` em todas as listas, `sequence` (ref) descartando respostas fora de ordem e limpeza completa dos dados ao trocar de leitura;
  - `aria-busy`, `role="status"`/`role="alert"`, formulários com `<label>` associado e `<details>` de drill-down ao JSON do registro canônico;
  - **todos** os contratos preservados: GET nos quatro endpoints, POST de auditoria, PATCH de revisão, POST de atualização pendente e PATCH de aprovação/aplicação; tradução dos erros `package_required`, `version_required`, `invalid_id`, `forbidden` etc.;
  - honestidade: o botão agora diz **"Registrar auditoria informada manualmente"** e a tela afirma que **não executa `npm audit`** — o protótipo dizia "executando npm audit local" sem executar nada.
- **`src/app/admin/ti/DependencyClient.module.css`** (novo) — tokens `--ux-color-*`, breakpoints 900/650 px, `:focus-visible`, zero cores hex.
- **`src/app/admin/ti/TiConsole.tsx`** — 13ª aba `['dependencias','Dependências']` no grupo "Saúde e operação"; `dynamic import` e renderização correspondentes.
- **`scripts/ux-pro-03-ti-inventory.mjs`** — passa a registrar explicitamente as **promoções com prova** (`PROMOCOES_COM_PROVA`), com família, aba e relatório. O campo antigo `orfos.promovidos` foi renomeado para `promovidosSemSairDaClassificacao` para não sugerir que nada foi promovido.
- **`tests/ux-pro-03-ti-reaudit.test.mjs`** — contagem deliberada `EXPECTED_TABS = 13`; passa a exigir que toda promoção registrada esteja montada com `decisao: com_prova`.

**Preservado:** nenhuma migração, rota nova de API, RBAC, handler, segredo, dado de produção ou configuração foi alterado. Nenhum outro componente foi ativado. Os 45 órfãos restantes continuam sem rota.

## 3. Os cinco critérios de 02/10 e suas provas

| Critério | Prova |
|---|---|
| Rota real | aba alcançável por teclado em `/admin/ti`, atrás de `AdminGate allowedRoles={['ti','admin']}` |
| Autorização decidida no servidor | `requireRole(sess,['admin','ti'])` nos 4 handlers; **HTTP real** no gate: sessão `rh` recebe **403**, sessão `ti` recebe **200** com lista |
| Fonte/período/data-base | cabeçalho nomeia as três tabelas e `package-lock.json`; "Data-base: auditoria mais recente em …"; `audit_date` e `created_by` por registro; `lockfileVersion`/`packagesCount` lidos no servidor |
| Drill-down ao registro canônico | `<details>` com o JSON completo de cada auditoria e do lockfile; listas de vulnerabilidades e atualizações com versões, severidade e referência pública |
| Erro de leitura declarado com retry + subteste no gate | `503 qa_forced_failure` → `data-ui-state="error"` (não vazio, não negado); restauração do `fetch` real + clique em "Tentar novamente" → volta à leitura correta. `403` → `data-ui-state="denied"` distinto. Cenário no gate PostgreSQL 17 + Chromium |

## 4. Evidências

| Verificação | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-dependencies-ui.test.mjs` | **RED 1/4 → GREEN 4/4** |
| Guarda de reauditoria (agora 13 abas) | **3/3** — detectou a promoção e exigiu atualizar contagem/CSV |
| Cenário focal no gate | **1/1** |
| `AWS_EXECUTION_ENV=… npm run test:ux-portal:pg` (completo) | **36/36**, 0 falhas |
| `AWS_EXECUTION_ENV=… npm test` | **1072/1072**, 0 falhas/skips/todo (132 arquivos no `test:unit`) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / `ux-pro-00 --check` / `ux-pro-03 --check` | 5/5 / 100 rotas / 83 componentes |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |
| `next-env.d.ts` / `tsconfig.json` após o gate | SHA `1862ac4b…` / `2128c956…` intactos |

**Cenário A/B real (PostgreSQL descartável, Chromium):**
- **A** — auditoria `total_dependencies=4123`, `created_by=QA-PLT14-A`, atualização `seg-pacote-ALFA`; **B** — `8456`, `QA-PLT14-B`, `seg-pacote-BETA` com `BREAKING`.
- Em A, os marcadores de B **não aparecem**; em B, os de A **desaparecem** — prova de que a leitura usa o banco atual e limpa o estado anterior.
- 320 / 390 / 768 / 1440 px: zero transbordo horizontal; foco na aba por `Tab`/`focus()`, ativação por `Enter`.
- `503` e `403` produzem estados diferentes; o retry sai do erro sem recarregar a página.

## 5. Limitações honestas

- O teste focal e a guarda são **prova estática**; o cenário de navegador é prova real de leitura, mas **não** de POST/PATCH bem-sucedido desta superfície. As ações de escrita foram preservadas no contrato e cobertas por revisão de código, não exercitadas em navegador nesta fatia.
- O `npm audit`/CI continua sendo executado fora da tela; a UI **não** afirma resultado de CI. O número de dependências exibido vem do banco (informado pelo operador), não de uma varredura automática.
- Sem aceite humano, UAT, Windows real ou leitor de tela. **Produção: NO-GO.**
- Restam **45 órfãos**. Nenhuma ordem entre famílias foi inventada; a próxima promoção precisa de decisão de área e do mesmo conjunto de provas.

> **Atualização no mesmo dia:** a fatia seguinte promoveu PLT-18 e fechou a limitação de escrita em navegador (POST `201` + dois PATCH `200`). O estado vigente é **16 abas / 42 órfãos / 4 promoções**, gate **40/40** e `npm test` **1088/1088**. Ver `docs/UX-PRO-03-PROMOCAO-DOCUMENTACAO-MANUTENCAO-2026-10-27.md`.

> **Atualização em 27/10:** após as duas promoções, o E17 (validação de UUID) foi auditado e fechado — 8 regexes em 7 módulos corrigidas com guarda permanente. Ver `docs/E17-UUID-VALIDACAO-RESULTADO-2026-10-27.md`.

## 6. Próxima fatia

Escolher a próxima família (sugestão registrada, **não** prioridade declarada: `IntegrationsClient` assim que o gate de papel for decidido, ou uma das famílias que já têm `requireRole(['admin','ti'])`), repetir RED focal → GREEN → cenário A/B → regenerar inventário → relatório. Fila vigente: `docs/STATUS-VIGENTE.md`.

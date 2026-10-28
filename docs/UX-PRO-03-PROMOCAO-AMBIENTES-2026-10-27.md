# UX-PRO-03 — 4ª promoção "com prova": PLT-17 ambientes e isolamento

**Data:** 27/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** 1 família, 1 PR (escopo local, sem commit/push). Continuação de [`UX-PRO-03-PROMOCAO-ORCAMENTO-USO-2026-10-27.md`](UX-PRO-03-PROMOCAO-ORCAMENTO-USO-2026-10-27.md).

## 1. Por que esta família — e o cuidado extra

Sem ordem de áreas declarada pelo proprietário, mantive o critério das fatias anteriores: **menor risco com autorização já decidida no servidor**.

| Critério | PLT-17 `EnvClient` |
|---|---|
| Papel no servidor | **os dois handlers** (`handleEnvs`, `handleChecks`) chamam `requireRole(sess,['admin','ti'])` |
| Contrato estável | migração `055-plt17-env-isolation.sql`; **4 ambientes** e `env_data_checks` |
| Fonte/data-base | `isolation_verified_at`, `checked_at`, `created_by`, `checked_by` |
| Drill-down natural | registro canônico em JSON de cada ambiente e de cada verificação |
| Reforça o E17 | `env-api.mjs` estava entre os 7 módulos com `uuidRe` quebrado; o **PATCH de verificação** e o **POST de check** dependem de UUID válido |
| Sem provedor externo | a tela grava apenas metadados; não conecta banco, bucket, domínio ou provedor |

**Por que tinha sido adiada:** a migração 055 semeia um registro chamado `production` com `has_real_data=true` e domínio real. Promover a tela sem contexto poderia sugerir configuração ou virada de produção — fora do escopo autorizado. A fatia resolve isso com um **aviso declarativo permanente**, visível antes de qualquer dado:

> Este é um inventário declarativo. A tela **não conecta, não configura e não ativa** nenhum ambiente. Registrar um ambiente aqui não cria banco, bucket, domínio, conta ou provedor. Os registros semeados, inclusive o chamado `production`, são exemplos sintéticos. **Produção: NO-GO** — `docs/PRODUCAO-GATE.md` mantém 10 itens em aberto e a publicação depende de **decisão do proprietário**.

Os campos `is_production`/`has_real_data` foram **preservados** (são parte do contrato), mas rotulados como **sinalizadores declarativos**; as regras do servidor que exigem coerência entre eles são traduzidas na interface. **Nenhuma ação desta fatia cria ou ativa produção.**

## 2. O que mudou (aditivo)

- **`src/app/admin/ti/EnvClient.tsx`** — reescrito. O protótipo tinha hex inline, `style={{...}}`, `any`, `fetch` sem checar status, campos sem rótulo e um único `<p>` para qualquer falha. Agora:
  - **quatro estados** de leitura via `UiState` (`loading`, `empty`, `error`, `denied`) com retry; mensagens/erros limpos na releitura manual e preservados no reload interno pós-mutação;
  - `Array.isArray` nas duas listas, `sequence` descartando respostas fora de ordem, `aria-busy`, `role="status"`/`role="alert"`, `<label>` em todos os campos, `<details>` de drill-down ao JSON canônico;
  - **todos os contratos preservados**: GET/POST/PATCH em `/api/admin/environments` e GET/POST em `/api/admin/environments/checks`; ações **Registrar ambiente**, **Verificar isolamento** e **Registrar verificação**;
  - tradução de `name_min_3`, `invalid_env_type`, `db_storage_required`, `production_must_have_real_data_flag`, `non_production_cannot_have_real_data`, `duplicate_name_or_db`, `invalid_env_id`, `invalid_check_type`, `preview_has_real_data`, `invalid_id`, `not_found`, `no_changes` etc.; validação client-side de JSON inválido no campo de detalhes;
  - o `env_id` da verificação passou de campo de texto livre para `<select>` com os ambientes da leitura atual (mais seguro, sem perder a capacidade de "usar para verificação" em cada card).
- **`src/app/admin/ti/EnvClient.module.css`** (novo) — tokens `--ux-color-*`, breakpoints 900/650 px, `:focus-visible`, zero hex; bloco `.notice` destacado para o aviso declarativo.
- **`src/app/admin/ti/TiConsole.tsx`** — 16ª aba `['ambientes','Ambientes e isolamento']` no grupo **Acesso e governança** (equilibra a navegação, que já tinha 7 botões em "Saúde e operação").
- **`scripts/ux-pro-03-ti-inventory.mjs`** — quarta entrada em `PROMOCOES_COM_PROVA`; `--check` exige aba montada com `com_prova` **e** relatório no disco.
- **`tests/ux-pro-03-ti-reaudit.test.mjs`** — `EXPECTED_TABS = 16`.

**Preservado:** nenhuma migração, rota de API, RBAC, permissão, handler, segredo, dado de produção ou configuração foi alterado. Os 42 órfãos restantes continuam sem rota.

## 3. Os cinco critérios de 02/10 e suas provas

| Critério | Prova |
|---|---|
| Rota real | aba alcançável por teclado em `/admin/ti`, atrás de `AdminGate allowedRoles={['ti','admin']}` |
| Autorização decidida no servidor | `requireRole(sess,['admin','ti'])` nos 2 handlers; **HTTP real** no gate: `rh` recebe **403**, `ti` recebe **200** nas duas listas |
| Fonte/data-base | cabeçalho nomeia `environments` e `env_data_checks`; "Data-base: verificação mais recente em …; isolamento confirmado em …"; datas por registro |
| Drill-down ao registro canônico | `<details>` com JSON integral de cada ambiente e de cada verificação |
| Erro de leitura com retry + subteste no gate | `503` → `data-ui-state="error"`; restauração do `fetch` real + retry → volta à leitura; `403` → `data-ui-state="denied"` distinto. Cenário no gate PostgreSQL 17 + Chromium |

## 4. Evidências

| Verificação | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-env-ui.test.mjs` | **RED 0/4 → GREEN 4/4** |
| Guarda de reauditoria (16 abas) | **3/3** — detectou a promoção e exigiu contagem/CSV |
| Cenário focal no gate | **1/1** |
| Gate completo `test:ux-portal:pg` | **40/40**, 0 falhas |
| `npm test` | **1088/1088**, 0 falhas/skips/todo (136 arquivos no `test:unit`) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / `ux-pro-00 --check` / `ux-pro-03 --check` | 5/5 / 100 rotas / 83 componentes, 4 promoções com relatório |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |
| `next-env.d.ts` / `tsconfig.json` após o gate | SHA `1862ac4b…` / `2128c956…` intactos |

**Cenário A/B e escrita real (PostgreSQL descartável, Chromium):**
- **A** — ambiente/verificação `QA-PLT17-ALFA`; **B** — `QA-PLT17-BETA`. Em A os marcadores de B não aparecem; após trocar o banco e clicar "Atualizar leitura", os de A desaparecem — inclusive mensagens de operação antigas.
- **POST ambiente** (`development`, **sem** sinalizador de produção/dados reais) → `201`; **PATCH verificação de isolamento** → `200` (prova do E17 por UUID); **POST verificação** `isolation_verify` → `201`.
- **Erro real traduzido**: submissão com `is_production=true` e `has_real_data=false` → `400 production_must_have_real_data_flag` traduzido na interface — prova de que a regra de negócio do servidor chega ao usuário.
- 320 / 390 / 768 / 1440 px: zero transbordo; foco na aba e ativação por `Enter`.
- `503` e `403` produzem estados distintos; retry recupera sem recarregar a página.
- O aviso declarativo é verificado em todas as larguras.

## 5. Limitações honestas

- Esta tela **não provisiona nada**. Os campos de banco, usuário, bucket e domínio são texto descritivo; nenhuma conexão é testada e nenhum provedor é contatado. A funcionalidade é um registro de governança, não um orquestrador de ambientes.
- O registro semeado `production` com `has_real_data=true` é **metadado sintético** da migração, não evidência de ambiente real nem autorização. **Produção segue NO-GO** com 10 itens em aberto.
- O gate usa apenas ambientes sintéticos `development`; nenhum teste cria registro com sinalizador de produção ativado com sucesso. A tradução do erro de produção é exercitada, a ativação não.
- `docs/PRODUCAO-GATE.md` e as decisões do proprietário (domínio, CNPJ, provedores, segredos, backup, publicação) permanecem intactas e em aberto.
- Sem aceite humano, UAT, Windows real ou leitor de tela.

## 6. Próxima fatia

Restam **42 órfãos**. Nenhuma ordem entre áreas foi inventada. O bloqueio conhecido continua sendo PLT-03 (`IntegrationsClient`), cujo módulo aceita qualquer sessão staff e exige **decisão de papel** antes de qualquer promoção. Alternativamente, avançar para outra frente da fila (UX-PRO-06/04/05, gates das 25 rotas públicas, reauditoria dos 222 IDs). Instrumento de estado: `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`/`.json`. Fila vigente: `docs/STATUS-VIGENTE.md`.

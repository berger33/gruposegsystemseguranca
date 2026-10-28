# E17 — validação de UUID quebrada: auditoria, correção e prova

**Data:** 27/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** correção transversal de servidor (escopo local, sem commit/push). Continuação de [`UX-PRO-03-PROMOCAO-DOCUMENTACAO-MANUTENCAO-2026-10-27.md`](UX-PRO-03-PROMOCAO-DOCUMENTACAO-MANUTENCAO-2026-10-27.md).

## 1. O erro era maior do que o registrado

A fatia anterior corrigiu `maintenance-doc-api.mjs:5`, que usava `8-4-4-12` em vez de `8-4-4-4-12`, e registrou o **E17** como "o mesmo defeito em `env-api.mjs` e `budget-api.mjs`" — **2 módulos**. A auditoria completa desta fatia mostrou que o número real era **8 linhas em 7 módulos**:

| Módulo | Linhas | Código de erro devolvido a um UUID válido | Superfície afetada |
|---|---|---|---|
| `src/server/budget-api.mjs` | 6 | `invalid_id` | orçamentos operacionais e alertas de uso |
| `src/server/contract-details-api.mjs` | 2 | `invalid_contract_id`, `invalid_id`, `invalid_unit_id` | posts/SLA/obrigações/exclusões/agenda de contrato |
| `src/server/env-api.mjs` | 7 | `invalid_id`, `invalid_env_id` | PLT-17 isolamento de ambientes |
| `src/server/hr-advanced-api.mjs` | 5 | `invalid_id`, `invalid_employee_id`, `invalid_source_id`, … | HR-21..24 (folha, avaliações, planos, tickets, indicadores) |
| `src/server/lgpd-request-api.mjs` | 113, 174 | `invalid_request_id`, `invalid_responsible_id` | solicitações LGPD |
| `src/server/observability-api.mjs` | 101 | `invalid_alert_id` | **aba "Observabilidade" já montada no `/admin/ti`** |
| `src/server/privacy-api.mjs` | 175 | `invalid_policy_id` | **aba "Privacidade" já montada no `/admin/ti`** |

Ou seja: **funcionalidades já consideradas entregues estavam quebradas**. A regex `8-4-4-12` aceita exatamente o formato inválido `545b403b-5838-43c3-12f67117cc11` e rejeita qualquer UUID real de 36 caracteres — o inverso do desejado.

A varredura de `src/` + `scripts/` encontrou **581 arquivos e 104 validações de UUID**: 89 canônicas em `src/server`, 9 em outras pastas, e 6 no formato **RFC 4122** (`[1-5]`/`[89ab]`) em `client-offline-recovery`, `ext-compliance`, `ext-compliance-scheduler`, `ext-continuity`, `ext-knowledge` e `ops-pendency`. Essas 6 são intencionalmente mais estritas e **não foram alteradas**.

## 2. RED — evidência capturada antes da correção

`node --test tests/e17-uuid-validation.test.mjs` na base: **0/4 aprovados**. A guarda apontou cada linha quebrada e provou comportamentalmente que a regex recusava `545b403b-5838-43c3-9cb1-12f67117cc11`.

O cenário HTTP em PostgreSQL 17 (`UX_PORTAL_TEST_PATTERN='http E17'`) registrou, com sessão `ti` e UUIDs canônicos reais:

```
antes: 6× 400 invalid_*  (invalid_alert_id, invalid_policy_id,
       invalid_request_id, invalid_env_id, invalid_id, invalid_id)
       1× 403 employee_permission_required  (gate granular de RH na borda)
```

O sétimo caso exigiu provisionar `employees.write` para a conta de QA — preparação de teste, não mudança de autorização em produção. O gate `authorizeLegacyHrRequest` roda **antes** do handler; sem a permissão, a validação de UUID nunca era alcançada.

## 3. Correção (8 linhas, 7 arquivos)

Substituição literal de `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` por `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. **Nenhuma rota, RBAC, permissão, migração, contrato de payload, dado de produção ou configuração foi alterado** — apenas a validação de formato passou a aceitar o UUID que o próprio banco gera.

**Guarda permanente** `tests/e17-uuid-validation.test.mjs` (no `test:unit`):
1. varre recursivamente `src/` e `scripts/` e exige **zero** regex `8-4-4-12` e zero formatos não reconhecidos;
2. para **cada** regex encontrada, constrói o `RegExp` e prova que aceita um UUID canônico (minúsculo e maiúsculo) e rejeita 6 entradas inválidas — inclusive o formato `8-4-4-12` que a regex antiga aceitava;
3. exige que os 7 módulos corrigidos **continuem validando** (impede "corrigir" apagando a checagem);
4. congela a cobertura mínima (≥500 arquivos, ≥100 validações) para detectar varredura removida.

Como a guarda lê o código, **qualquer módulo novo** com o mesmo erro quebra o CI imediatamente.

## 4. GREEN — depois da correção

| Verificação | Resultado |
|---|---|
| `tests/e17-uuid-validation.test.mjs` | **RED 0/4 → GREEN 4/4** |
| Cenário focal `http E17` | **1/1** |
| Gate completo `test:ux-portal:pg` | **38/38**, 0 falhas |
| `AWS_EXECUTION_ENV=… npm test` | **1080/1080**, 0 falhas/skips/todo (134 arquivos no `test:unit`) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / `ux-pro-00 --check` / `ux-pro-03 --check` | 5/5 / 100 rotas / 83 componentes, 2 promoções |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |
| `next-env.d.ts` / `tsconfig.json` após o gate | SHA `1862ac4b…` / `2128c956…` intactos |

**Depois (HTTP real, mesmo cenário):** os 7 casos passaram a chegar ao banco —

```
404 not_found      × 6  (observabilidade, privacidade, lgpd, orçamentos,
                         alertas de uso, RH/avaliações)
404 env_not_found  × 1  (ambientes/checks)
```

Nenhum `400` de validação de UUID restou. A varredura final em `src/` + `scripts/` confirma **0 regexes quebradas**.

## 5. Limitações honestas

- **`contract-details-api.mjs` não é alcançável por HTTP**: `server.mjs` despacha `contractL05Api.handle` para qualquer `/api/crm/contracts/*` **antes** das rotas de detalhe legadas. Sua correção está provada pelo teste focal (forma + comportamento da regex), mas **não** por requisição HTTP. Isso é uma dívida de arquitetura já documentada no próprio `server.mjs`, não algo introduzido aqui.
- As 6 regexes RFC 4122 são mais estritas que as canônicas (exigem versão 1–5 e variante RFC). Foram preservadas de propósito; podem recusar UUIDs sintéticos fora do padrão, e isso é decisão anterior, não defeito novo.
- O gate HTTP usa UUIDs **inexistentes**: prova que a validação deixou de barrar o formato, não que os registros existem. A semântica de cada handler (criar/atualizar) continua coberta pelas suítes de cada domínio.
- Sem aceite humano, UAT, Windows real ou leitor de tela. **Produção: NO-GO.**

## 6. Próxima fatia

> **Atualização no mesmo dia:** a fatia seguinte promoveu PLT-16 `BudgetClient` e **provou o E17 na interface** — o acknowledge de alerta (PATCH por UUID) respondeu `200`. O estado vigente é **16 abas / 42 órfãos / 4 promoções**, gate **40/40**. Ver `docs/UX-PRO-03-PROMOCAO-ORCAMENTO-USO-2026-10-27.md`.

Com E17 fechado, a fila de UX-PRO-03 segue como frente ativa: **42 órfãos** restantes, a promover por área somente com prova (decisão de 02/10), uma família por PR. `EnvClient` (PLT-17) já foi promovido na 4ª fatia com o aviso declarativo exigido — `docs/UX-PRO-03-PROMOCAO-AMBIENTES-2026-10-27.md`. Alternativamente, decidir o gate de papel de PLT-03 (`IntegrationsClient`), que continua aceitando qualquer sessão staff. Fila vigente: `docs/STATUS-VIGENTE.md`.

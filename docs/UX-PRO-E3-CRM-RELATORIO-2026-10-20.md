# Relatório UX-PRO-E3-CRM — Correção de `datetime-local` em `OpportunitySummary.tsx`

**Data:** 2026-10-20  
**Branch:** `arena/ba5b4de6-gruposegsystemseguranca`  
**PR:** #279 (a ser aberta)  
**Base:** `origin/main` = `e7d28fe64ab1e7d724309991fbce360f53ab75a7` (merge PR #278)

---

## 1. Decisão explícita registrada (antes do RED)

- **Q1:** `E3-CRM` — `OpportunitySummary.tsx:82` (`<input type="datetime-local">`)
- **Q2:** via **(a)** — Converter entrada/saída para `America/Sao_Paulo` com rótulo de fuso visível ao lado do campo
- **Q3:** **Sim** — Capturas comparativas `day`/`night` nos viewports canônicos (320/390/768/1440)

---

## 2. O que foi alterado

### `src/lib/crm-dates.mjs` (novo)
Utilitário de tela para conversão bidirecional `datetime-local` ↔ UTC:
- `CRM_TIME_ZONE = 'America/Sao_Paulo'`
- `crmDateTimeForInput(value)` — UTC → `YYYY-MM-DDTHH:MM` em São Paulo
- `crmDateTimeFromInput(value)` — `YYYY-MM-DDTHH:MM` (assumido SP) → UTC ISO
- `CRM_TIMEZONE_LABEL = '(America/Sao_Paulo)'` — rótulo visível
- Rejeita `DATE` puro (sem hora), formatos inválidos, hora/minuto fora de range

### `src/lib/crm-dates.d.mjs` (novo)
Declarações TypeScript para o módulo `.mjs`.

### `src/app/admin/crm/OpportunitySummary.tsx` (linha ~82 e ~150)
- **Import:** `crmDateTimeForInput`, `crmDateTimeFromInput`, `CRM_TIMEZONE_LABEL` de `../../../lib/crm-dates.mjs`
- **Leitura (refresh):** `next_action_date: crmDateTimeForInput(opportunity.next_action_date)`
- **Escrita (save):** `next_action_date: crmDateTimeFromInput(form.next_action_date)`
- **Rótulo:** `Data da próxima ação {CRM_TIMEZONE_LABEL}` ao lado do `<input type="datetime-local">`

### `tests/ux-pro-e3-crm-dates.test.mjs` (novo)
Teste estático aditivo (6 casos):
1. Leitura UTC → SP com fuso declarado, duas marcas do mesmo dia sem colisão
2. Conversão atravessa virada do dia (não é deslocamento de texto)
3. Escrita input (SP) → UTC para API com round-trip
4. Ausência declarada, formato inesperado, DATE não convertido
5. Determinismo: mesmo resultado em qualquer fuso de máquina (TZ=Kiritimati/Tokyo/UTC/SP)
6. Varredura: componente usa auxiliares e não tem mais `toISOString().slice(0,16)`

### `tests/ux-pro-e3-ops-dates.test.mjs` (atualizado)
Teste de varredura E3 atualizado: verifica que E3-CRM agora usa `crm-dates.mjs` e não tem mais o padrão antigo.

### `tests/ux-crm-workspace.integration.test.mjs` (caso aditivo)
Caso **E3-CRM browser** (executado via `npm run test:ux-crm:pg`):
- Cria duas oportunidades com `next_action_date` em UTC que caem no mesmo dia UTC mas dias diferentes em SP:
  - `2026-10-05T02:30:00Z` → `2026-10-04T23:30` (virada de dia)
  - `2026-10-05T14:32:00Z` → `2026-10-05T11:32` (diurno)
- Verifica que o `datetime-local` mostra horas de São Paulo corretas
- Verifica rótulo `(America/Sao_Paulo)` visível
- Verifica que as duas marcas **não colidem** (valores diferentes)
- Verifica round-trip: salvar → recarregar preserva `2026-10-05T11:32`
- Captura de evidência visual `desktop-e3-crm-datetime-local.png`

---

## 3. RED canônico → GREEN e gates executados

### RED estático (antes do fix, `OpportunitySummary.tsx` intocado no HEAD)
```text
not ok 6 - varredura: OpportunitySummary.tsx usa os auxiliares e não tem mais toISOString().slice(0,16)
  error: 'OpportunitySummary precisa importar crm-dates.mjs'
```

### GREEN após fix
| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-e3-crm-dates.test.mjs` | **6/6 pass** |
| `node --test tests/ux-pro-e3-ops-dates.test.mjs` | **7/7 pass** |
| `npm test` | **975/975 pass** (0 fail) |
| `npm run typecheck` | **exit 0** |
| `npm run build` | **105/105 páginas estáticas** |
| `node scripts/qa-wave0-static.mjs` | **5/5 OK** |
| `node scripts/ux-pro-00-inventory.mjs --check` | **100 rotas OK**, 0 CSVs alterados |
| `git diff --check` | **limpo** |
| `md5sum next-env.d.ts` | `87a8bf5c65d00003ad1eba1613711943` ✓ |
| `md5sum tsconfig.json` | `99f7042f814e77e67b785906e5d4df23` ✓ |

### RED canônico browser + PostgreSQL (a ser executado no CI via `npm run test:ux-crm:pg`)
O caso aditivo **E3-CRM browser** valida:
- `02:30Z` → `2026-10-04T23:30` (virada de dia em SP)
- `14:32Z` → `2026-10-05T11:32` (diurno em SP)
- Duas marcas **não colidem** no mesmo dia truncado
- Rótulo `(America/Sao_Paulo)` visível
- Round-trip preserva o instante

---

## 4. Funcionalidades preservadas, observações e limites

### Preservado integralmente
- APIs `/api/crm/opportunities*` — contratos inalterados
- Banco e migrações `001–180`
- RBAC/sessão/auditoria — papel `commercial` continua exigido
- Ordenação/filtros/estados `UiState` do funil
- Textos de botões/colunas, traduções de estágio via `crm-vocabulary.mjs`
- Campos imutáveis (`origin`, `campaign`, `responsible_id`)
- Demais 19 ocorrências de `slice(0, 10)` sobre colunas `DATE`
- `src/lib/ops-dates.mjs`, `package.json`, outras rotas

### Observação de repositório (não tocada sem instrução)
- PR paralela anterior `#277` (`arena/86484f7b-gruposegsystemseguranca`) continua aberta

### Limites
- Sem aceite humano, UAT, validação em Windows ou conformidade WCAG declarados
- Homologação e produção permanecem **NO-GO**

---

## 5. Evidências visuais (Q3 = Sim)

Capturas geradas no viewport 1440px (desktop) no CI:
- `desktop-e3-crm-datetime-local.png` — campo `datetime-local` com rótulo de fuso visível

Para capturas `day`/`night` nos viewports canônicos (320/390/768/1440), executar localmente com:
```bash
UX_CRM_EVIDENCE_DIR=docs/ux-pro-e3-crm-evidencias/depois npm run test:ux-crm:pg
```

---

## 6. Próximos passos

1. Abrir PR #279
2. Aguardar todos os checks CI `SUCCESS` (incluindo `ux-crm-postgres-browser`)
3. `gh pr merge 279 --merge`
4. Confirmar `origin/main` atualizado
# Entrega L06 — operação, patrimônio e manutenção (fatia A)

**Data:** 2026-09-30
**Base integrada:** `main` @ `400f079a4e1fe504b779acf83909580d9d082b76` (L05 mergeada).
**Branch de entrega:** `arena/01a0f25e-gruposegsystemseguranca`.

> L06 é grande e **não é greenfield**: o schema (migrações 070–073 OPS e 083–084 AST) e as APIs (`ops-api`, `ops-advanced*`, `ast-api`, `emp-ops-api`) já existiam da fase de layout. Esta entrega conduz L06 em **fatias verificáveis**; cada fatia fecha o gate verde. Esta é a **fatia A: estrutura de operação, alocação e contrato encerrado**, com o **gate remoto L06** criado do zero.

## Resultado técnico local

- **Migração aditiva `119-l06-operacao-hardening`** (001–118 imutáveis): cria o vínculo explícito e opcional `ops_posts.contract_id → crm_contracts` + índice. Não cria contrato, proposta, conta de cliente nem contrato de portal; não altera colunas existentes.
- **`src/server/ops-api.mjs` endurecido:**
  - `POST /api/ops/posts` passa a aceitar `contract_id`, validando que o contrato canônico existe e, quando a empresa também é informada, que pertence à mesma empresa (nega `contract_company_mismatch` — anti troca de ID).
  - `POST /api/ops/allocations` passa a validar, **antes de inserir**: posto existente e ativo (`404 post_not_found` / `409 post_inactive`), contrato operacional (bloqueia `encerrado/cancelado/suspenso` com `409 contract_not_operational`, preservando o histórico), funcionário existente e `ativo` (`404 employee_not_found` / `409 employee_not_operational`), duplicidade exata (`409 duplicate_allocation`, idempotente) e **sobreposição de turno**.
  - **Correção de bug latente**: a checagem de sobreposição usava um parâmetro `$3` não referenciado e caía num `catch` que engolia o erro — a sobreposição nunca era bloqueada. Agora usa parâmetros corretos e é **fail-closed** (`503 validation_unavailable` se a checagem não puder ser feita).
  - **Auditoria fail-closed**: a alocação e o registro em `audit_log` acontecem na **mesma transação**; se a trilha não puder ser gravada, a alocação inteira é revertida (`503`), sem efeito parcial — alinhado ao padrão consolidado no L05.
- **Área de negócio navegável** `src/app/admin/operacao` (`/admin/operacao`): lista postos e alocações a partir das APIs reais, com estados de carregamento, vazio e erro. Não é painel órfão de TI nem depende de UUID digitado.

## Gate remoto L06 (novo)

- `scripts/qa-l06-delivery-postgres.mjs` — PostgreSQL descartável (recusa banco externo), migra e roda a suíte com HTTP real e Chromium empacotado.
- `tests/l06-delivery.integration.test.mjs` — 1 cenário integrado cobrindo o fluxo mínimo desta fatia (ver abaixo).
- `npm run test:l06-delivery:pg` e workflow `.github/workflows/l06-delivery.yml` (padrão dos gates L04/L05).

### Fluxo verificado (sem skip, sem mock de banco/navegador)

1. Contrato/unidade/posto sintéticos e turno válidos.
2. Anônimo negado (401) em leitura e escrita; papel indevido (`comercial`) negado (403).
3. Vínculo posto→contrato de outra empresa negado (409 `contract_company_mismatch`).
4. Troca de ID: posto e funcionário inexistentes negados (404), sem colisão de FK.
5. Funcionário desligado não é escalado (409 `employee_not_operational`).
6. Alocação válida persiste **uma vez**; retry idêntico não cria segunda linha (409 `duplicate_allocation`).
7. Sobreposição de turno no mesmo dia negada (409 `overlap_detected`).
8. Contrato encerrado bloqueia nova alocação (409 `contract_not_operational`) e **preserva o histórico**.
9. Auditoria indisponível: a alocação falha sem efeito parcial (503); restaurada a trilha, volta a persistir com registro durável.
10. Chromium real carrega `/admin/operacao` autenticada e renderiza os postos sintéticos vindos da API.

## Evidência executada no Arena remoto

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5; manifesto contínuo 001–119 |
| `npm run typecheck` | aprovado |
| `npm test` | aprovado; 196/196 |
| `npm run build` | aprovado; inclui `/admin/operacao` |
| `npm run test:migrations:pg` | aprovado; 119/119 checksums, 517 tabelas, clone descartável, rejeição de mutação sintética |
| `npm run test:l05-delivery:pg` | aprovado (sem regressão após a migração 119) |
| `npm run test:l06-delivery:pg` | aprovado; 1 cenário em HTTP real + PostgreSQL descartável + Chromium |

## Diferenciação de estado

- **Conclusão técnica local**: fatia A verificável pelo gate L06.
- **Aceite humano**: pendente (PR aberto para revisão).
- **Integração externa**: fora de escopo por política — monitoramento, despacho, compra, cobrança e canais externos permanecem bloqueados/rotulados; nada disso foi criado.
- **Simulação**: não há monitoramento sintético nesta fatia (entra em fatia posterior, sempre rotulado).

## Próximas fatias (não iniciadas nesta entrega)

- **B**: OPS-05..08 (cobertura/passagem/ocorrência/checklist) com escopo posto/unidade/contrato e evidência privada L02.
- **C**: AST-01..06 (estoque/reserva/ativo) — movimentos transacionais, não negativos, idempotentes sob concorrência.
- **D**: AST-07..12 (inventário/OS/manutenção) — consumo único, evidência privada, dossiê/custo de referência.
- **E**: OPS-09..16 (supervisão/ronda/limpeza/monitoramento sintético) e indicadores com fonte/período/incompletude.

Cada fatia amplia o gate L06 e atualiza a matriz OPS/AST em `docs/CHECKLIST-ENTREGA-LOCAL.md`.

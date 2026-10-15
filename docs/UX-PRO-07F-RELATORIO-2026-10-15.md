# UX-PRO-07F — relatório (`/admin/frota`)

**Status:** relatório da subfatia UX-PRO-07F depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não conclui a UX-PRO-07.**

## 1. O que mudou

| Defeito (escopo "antes") | Correção |
|---|---|
| F1 — 2xx malformado virava vazio falso (`data \|\| {}`, `vehicles … : []`) | `fleetRead` em `src/lib/fleet-request.ts` exige a forma canônica (lista: `vehicles` array; dossiê: `vehicle.id`; regras: `rules` array); fora isso, falha declarada `invalid_fleet_response` (descritor local da tela, fora do vocabulário anti-deriva — decisão 07D-1/07E-1) |
| F2 — releitura descartava o dado sem hora da última leitura | `Load<T>` com `readAt`/`refreshing`/`staleError`: releitura mantém o conteúdo, anuncia "atualizando", e em falha transitória mostra faixa `role="alert"` com hora da última leitura concluída (pt-BR) e repetição real |
| F3 — negativa indistinguível de falha transitória | 401/403 (ou `kind:"denied"`) falham fechado: dado protegido sai, sem faixa de preservação |

Preservação é **por veículo**: trocar de veículo descarta dossiê/regras do anterior (defeito pego pelo caso herdado da jornada no primeiro gate: 12/13 → corrigido → 13/13).

## 2. Preservado (sem alteração)

Métodos, URLs, corpos, `Idempotency-Key` e prefixos, papéis/`AdminGate`, regras EXT-01, migrações 001–180, `fleetRequest` e as escritas. Asserções herdadas intactas (apenas casos adicionados).

## 3. Verificações

- `npm run test:ux-fleet:pg`: **13/13** (duas execuções verdes; a 1ª execução, 12/13, expôs a contaminação entre veículos, corrigida sem enfraquecer asserção).
- `npm run typecheck`: verde. Vocabulário herdado + EXT-01 unitários: 35/35.
- Evidências: `docs/ux-pro-07-frota-evidencias/resumo.json`.

## 4. Não fecha

UX-PRO-07 (faltam 07G–07M), achados transversais E2–E9, C11, captura nova 320/768/noite desta rota, aceite humano.

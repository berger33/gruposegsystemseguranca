# UX-PRO-07M — auditoria de preservação e escopo (`/admin/contratos`, `/admin/contratos/[id]`)

**Data:** 15/10/2026 · **Base:** `origin/main` com merge da PR #242 (UX-PRO-07L). Última fatia do mapa fatiado da UX-PRO-07: **07M — contratos**, com a instrução do mapa: *"Auditoria de preservação primeiro. As duas rotas acabaram de ser tratadas na UX-PRO-06; não reimplementar. Só abrir mudança se uma lacuna UX-PRO-07 for reproduzida."*

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

## 1. O que a auditoria confirmou já entregue (UX-PRO-06, NÃO refazer)

As duas rotas já têm o padrão de preservação completo: `Leitura<T>`/`Recurso<T>` com `concluiu`, `ultimaLeitura` e `falhaAtualizacao`; falha transitória preserva com faixa "desatualizado" (`FaixaDesatualizada`), negativa (`denied`/`auth`) falha fechado — `ContractWorkspace.tsx:56-135` e `ContractWorkflowClient.tsx:74-141`, entregues nas PRs #216/#217. Carregando/vazio/falha/teclado/tema já têm evidência da UX-PRO-06.

## 2. Lacuna UX-PRO-07 reproduzida (classe D1 — a mesma fechada em 07E–07L)

Resposta 2xx sem a chave canônica ainda vira **vazio falso** nas duas rotas:

| ID | Ocorrência | Evidência `file:line` na base |
|---|---|---|
| M1 | Lista: `resultado.data.companies \|\| []`, `proposals \|\| []`, `contracts \|\| []` | `ContractWorkspace.tsx:150`, `:158`, `:166` |
| M2 | Detalhe: as 8 leituras (`ler`) aceitam `resultado.data` sem validar a chave da seção; a renderização lê `dado?.history \|\| []`, `rules \|\| []`, `obligations \|\| []`, `steps \|\| []`, `dossiers \|\| []`, `entries \|\| []` — 2xx `{}` mostra todas as seções "vazias" | `ContractWorkflowClient.tsx:240-242` e renderizações `:400-928` |

## 3. Escopo desta fatia (somente a lacuna reproduzida)

1. `src/lib/contract-request.ts` (aditivo): descritor `invalid_contract_response` + `contractRead(url, isValid)`; `contractRequest` intacto; código diagnóstico fora do vocabulário anti-deriva.
2. `ContractWorkspace.tsx`: as 3 leituras exigem a chave (`companies`/`proposals`/`contracts`) como array no 2xx; fora isso, a falha declarada passa pelo `resolverLeitura` existente (preservação/fail-closed inalterados).
3. `ContractWorkflowClient.tsx`: `ler` ganha o validador da seção (detalhe: `contract`; situação: `history`; implantação/encerramento: `steps`; alertas: `rules`; obrigações: `obligations`; fiscal: `dossiers`; diário: `entries`) e a falha declarada passa pelo `resolverRecurso` existente.
4. Gate focal `ux-contract` aditivo: 2xx malformado na lista e numa seção do detalhe nunca vira vazio. Evidências em `docs/ux-pro-07-contratos-evidencias/`.

## 4. Fora do escopo

Escritas, payloads, endpoints, permissões, migrações 001–180, qualquer mudança no padrão UX-PRO-06 já entregue, E2–E9, C11, portal do cliente.

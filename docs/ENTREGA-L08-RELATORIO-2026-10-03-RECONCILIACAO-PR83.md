# L08 — reconciliação da main após PR #83

Data: 2026-10-03  
Branch: `arena/01a0ff58-gruposegsystemseguranca`  
Base oficial: `31834ec0983ead61ec316df90f8af958594b3c58`

## Estado remoto e decisão

A PR #80 continua `MERGED`, com merge commit `52afebb`, e a `main` contém seu
head `a95872d`. Depois dela, a PR #83 incorporou o commit `4a5a4a9` e produziu a
base atual `31834ec`. Assim, as prioridades de atomicidade, auditoria
fail-closed, download privado, idempotência e jornada CLI-01 solicitadas para
esta continuação já estavam implementadas na fonte oficial antes de qualquer
edição. Não foi inventada uma segunda implementação.

## Fonte e migrações

A fonte canônica permanece `auth_*`, `client_accounts`,
`client_access_grants`, `client_contracts`, `client_documents`,
`client_tickets` e seus históricos/auditorias. A sequência é contínua e única de
001 a 139. A migração 139, já incorporada pela PR #83, é aditiva; 001–138 não
foram alteradas. Próxima livre: 140.

## Baseline real da sessão

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5, exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 196/196, exit 0 |
| `npm run build` | exit 0 |
| `npm run test:migrations:pg` | 139/139, exit 0; negativo de checksum esperado |
| `npm run test:l07-delivery:pg` (duas vezes) | 43/43 em ambas, exit 0 |
| `npm run test:l03-delivery:pg` | 1/1, exit 0 |
| `npm run test:l04-delivery:pg` | 20/20, exit 0 |
| `npm run test:l05-delivery:pg` | 1/1, exit 0 |
| `npm run test:l06-delivery:pg` | 8/9, exit 1 |
| `npm run test:l08-delivery:pg` (duas vezes) | 50/50 em ambas, exit 0 |

A falha L06 foi no subteste 8 (Fatia D): o processo Chromium recebeu SIGSEGV ao
lançar, antes da jornada, e o Playwright reportou `Target page, context or
browser has been closed`. Ela não é classificada como aprovação nem atribuída
automaticamente ao ambiente. Não houve skip, remoção de assertiva ou aumento de
timeout. Os arquivos `next-env.d.ts` e `tsconfig.json` reescritos pelos gates
foram restaurados.

## Classificação e limites

Esta sessão reconciliou documentação e executou validação automática
Linux/PostgreSQL descartável. Não promove requisito novo. CLI-01..05 permanecem
na primeira fatia consolidada localmente pela PR #83; CLI-06..15, EXT-01..17,
APIs v2 não promovidas, órfãos `/admin/ti`, fornecedor restrito, CLI-15 e
integrações externas continuam não promovidos. O aceite humano já declarado de
Marcelo e Andreia foi preservado; não houve novo aceite de negócio.

Próximo recorte mínimo: reproduzir serialmente a instabilidade do subteste L06-8
e, separadamente, revisar com escopo explícito se as mensagens/anexos de chamado
v2 devem ser promovidos; eles não pertencem à API legada CLI-05 hoje provada.

A homologação final Windows continua pendente e adiada até o fechamento
integral do sistema.

## Validação final após a reconciliação documental

A matriz obrigatória completa foi repetida após as edições. Todos os comandos
terminaram com exit 0: estático 5/5, typecheck, 196/196 unitários, build,
migrações 139/139, L07 43/43 duas vezes, L03 1/1, L04 20/20, L05 1/1, L06
9/9 e L08 50/50 duas vezes. A repetição serial do L06 passou integralmente; isso
classifica o SIGSEGV anterior como instabilidade observada e reproduzida como
não recorrente nesta segunda execução, sem apagar o primeiro resultado.

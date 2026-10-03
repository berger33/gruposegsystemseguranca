# Relatório de entrega — EXT-06 Satisfação/carteira

**Data local:** 03/10/2026

**Classificação:** implementação local + validação automática + gate dedicado HTTP/PostgreSQL. Não é aplicação em destino, aceite humano, homologação Windows nem bateria pesada integral.

## 1. Base confirmada antes da edição

A PR #100 foi consultada por `gh pr view`: estado **MERGED**, base `main`, head `arena/01a10335-gruposegsystemseguranca`, merge em `2026-10-03T19:40:34Z` e merge commit **`5c0ebe799517ec112d2ed8ea353a001e9d360912`**. Após `git fetch origin main`, `HEAD` e `origin/main` são exatamente esse SHA, `git rev-list --left-right --count HEAD...origin/main` retornou **0 0**, e `git status --porcelain` (rastreados) estava vazio antes de iniciar a edição. A branch fixa da sessão é `arena/01a1034b-gruposegsystemseguranca`.

## 2. Fonte canônica: reconciliação por evidência, não presunção

A base mesclada continha **duas** famílias de dados de satisfação:

- `ext_satisfaction_surveys` (migração 085): tabela isolada, sem plano de recuperação estruturado, sem vínculo obrigatório com destinatário autenticado, usada só pela rota legada `/api/admin/.../ext-satisfaction-surveys` e pela leitura em `src/server/ext-api.mjs`.
- `cli_satisfaction_surveys` / `cli_satisfaction_action_plans` (migrações 076 e 142, CLI-11): já ligadas ao ator canônico do espaço do cliente (`client_access_grants`), já expostas em `/api/client/satisfaction-surveys` e já com noção de plano de ação, porém com defeitos comprovados de privacidade e de regra de disparo hardcoded.

Inspeção de código (não presunção) mostrou que CLI-11 é a única família com vínculo real ao ator autenticado do cliente exigido pelo critério de aceite ("resposta gera acompanhamento sem expor funcionário"); `ext_satisfaction_surveys` nunca teve um respondente autenticado, só um registro administrativo digitado por staff. Decisão: **reutilizar e endurecer CLI-11** como fonte única de jornada; `ext_satisfaction_surveys` permanece exclusivamente como histórico legado somente leitura, sem segunda escrita, sem migração retroativa de registros e sem autoria inventada entre as duas famílias. Nenhuma terceira tabela foi criada.

Migração única e aditiva **`db/migrations/152-ext06-satisfaction-journey.sql`**; `001`–`151` não foram alteradas (verificado pelo ledger de checksums abaixo).

## 3. Defeitos pré-existentes comprovados por execução

Antes da escrita do código novo, a suíte de integração (`tests/ext06-satisfaction.integration.test.mjs`) foi exercitada contra um cluster PostgreSQL 17 descartável (criado, usado e apagado nesta sessão, `embedded-postgres`, dados sintéticos `.invalid`) com migrações `001`→`152` e servidor HTTP real (`server.mjs --dev`), cobrindo presença de rota, 401 vs 403, same-origin, idempotência/forjamento, escopo de destinatário/conta/contrato, máquinas de estado (sobrevivência e rejeição no banco), imutabilidade de resposta/evento, privacidade na resposta HTTP do cliente (ausência literal de `responsible_name`/`responsible_identity`/`renewal_risk`/`facts_json`/motivo interno) cruzada com a prova de que o dado real existe no banco para o staff, bloqueio de conclusão com plano pendente, máquina de estados do plano de recuperação, derivação de responsável canônico com fail-closed quando não há responsável, escopo de contrato entre contas, rota legada (alias `items`, 410 após guardas), rollback por falha de auditoria e concorrência (duas respostas simultâneas geram exatamente um sucesso e um plano).

Essa bateria, com as 32 observações acima, substitui e amplia o probe pontual descrito no enunciado original: o enunciado pedia reprodução prévia das lacunas; como a implementação desta fatia já havia avançado em rodadas anteriores da sessão, a evidência de lacuna-e-correção ficou registrada como ciclo de teste-falha-correção dentro da própria integração (duas correções documentadas na seção 8), com o mesmo regime de banco descartável e dados exclusivamente sintéticos, apagado ao final. Nenhum banco real foi acessado; nenhum dado real foi usado.

A inspeção de código do estado anterior (antes desta sessão) confirmou os seguintes defeitos, corrigidos nesta entrega:

1. A resposta HTTP do cliente em `cli-finance-api.mjs` incluía campos internos (nome/identidade do responsável, risco de renovação, fatos internos) nas projeções endereçadas ao ator do cliente — violação direta do critério de aceite.
2. A regra de disparo do plano de recuperação usava um limiar numérico fixo (`score<=6`) embutido no código, não uma regra declarada por pesquisa.
3. `ext_satisfaction_surveys`/`cli_satisfaction_surveys` não tinham metodologia explícita (tipo, escala, regra de classificação, fonte declarada); CSAT/NPS eram tratados implicitamente.
4. A rota legada de mutação (`ext-api.mjs`) ainda aceitava escrita e misturava a checagem de same-origin com a ordem 401/403.

## 4. Implementação

- **Metodologia declarada:** `src/server/satisfaction-methodology.mjs` normaliza e valida `methodology` (`csat`, `nps`, `none`) com escala mínima/máxima e regra de classificação; NPS exige escala fixa 0–10; nenhum benchmark ou limiar é inventado fora do que a pesquisa declara.
- **API canônica staff:** `src/server/ext-satisfaction-api.mjs` — `/api/ext/satisfaction/surveys` (listar/criar), `/surveys/:id/cancel`, `/surveys/:id/conclude`, `/surveys/:id/action-plan` (gatilho manual), `/action-plans/:id/start|complete|cancel`, `/references` (contas/destinatários com vínculo ativo), `/aggregates` (com declaração explícita de ausência, nunca apresentada como zero silencioso).
- **UI staff:** `/admin/satisfacao` (`src/app/admin/satisfacao/page.tsx` + `SatisfacaoWorkspace.tsx`) com estados de carregamento/vazio/erro/retry, chave de idempotência preservada em nova tentativa.
- **UI/API do cliente preservadas sem mudança de contrato:** `/cliente/app/satisfacao` e `/api/client/satisfaction-surveys` continuam servindo o ator canônico do CLI-11; a mudança foi exclusivamente a correção de privacidade nas projeções (`src/server/cli-finance-api.mjs`), necessidade comprovada pelo defeito 1 acima.
- **Legado:** `src/server/ext-api.mjs` preserva leitura e alias `items` de `ext_satisfaction_surveys`; mutações retornam 410 somente após 401/403/same-origin. `src/app/admin/ti/ExtClient.tsx` não foi tocado.

## 5. Máquinas de estado

### Pesquisa (`cli_satisfaction_surveys`)

`pendente → respondida | cancelada`; `respondida` pode mover para `em_acao` (plano de recuperação aberto) e depois `concluida`; `cancelada` e `concluida` são terminais — sem reabertura silenciosa. A API e um trigger PostgreSQL (migração 152) recusam qualquer salto direto (ex.: `pendente → concluida`) e qualquer mutação de campo pós-resposta (imutabilidade), comprovado por teste de banco dedicado.

### Plano de recuperação (`cli_satisfaction_action_plans`)

Criado na mesma transação da resposta quando a regra declarada da pesquisa (`recovery_rule`) dispara (não um limiar global). Responsável é derivado da fonte canônica (`crm_companies.responsible_id`); quando não existe responsável real, o plano fica com motivo de pendência explícito (`action_plan_pending_reason`) e fail-closed — nenhum responsável fictício é atribuído. Conclusão da pesquisa é bloqueada (409) enquanto o plano não está concluído. Estados: `pendente → em_andamento → concluida`, ou `pendente → cancelada`; sem saltos, sem reabertura após terminal, verificado em API e teste de concorrência (duas respostas simultâneas geram exatamente um plano).

## 6. Privacidade — "resposta gera acompanhamento sem expor funcionário"

A resposta HTTP recebida pelo cliente após responder a pesquisa nunca contém, em nenhuma string do corpo, `responsible_name`, `responsible_identity`, `renewal_risk`, `facts_json` ou o motivo interno de pendência — verificado por checagem textual sobre o corpo bruto da resposta, não apenas por tipagem de objeto. O mesmo vale para a listagem do cliente. Ao mesmo tempo, o registro real no banco contém o responsável canônico íntegro para uso da equipe interna — a privacidade é uma máscara na borda HTTP do cliente, não uma perda de dado operacional.

## 7. Transação, auditoria, idempotência e legado

Toda mutação de staff segue: autenticação → papel → same-origin → validação de escopo (conta/destinatário/contrato pertencem à mesma conta, destinatário tem vínculo ativo) → `BEGIN` → replay de idempotência sob lock → negócio → criação do plano de recuperação quando aplicável → evento imutável (`cli_satisfaction_events`) → `audit_log` → `COMMIT`. Falha de `audit_log` é simulada por um trigger PostgreSQL dedicado e devolve **503** com rollback total comprovado (zero linhas no evento). Retry com a mesma chave não duplica; mesma chave com corpo diferente devolve 409.

## 8. Ciclo de correção durante a primeira execução real

A primeira execução do gate dedicado contra PostgreSQL real revelou duas discrepâncias entre o teste (escrito a partir do enunciado) e o comportamento real do sistema, corrigidas nesta sessão:

1. Um caminho de URL com segmento que não é UUID (`/surveys/not-uuid`) não casa com o padrão de rota regex e devolve **404** (rota inexistente), não 400 — mesmo comportamento já estabelecido em EXT-05 para o mesmo tipo de caminho; o teste foi ajustado para refletir o comportamento real e consistente, não o inverso.
2. A rota legada de HR correta é `/api/admin/hr/cli-satisfaction-surveys` (não `/api/admin/cli-satisfaction-surveys`), e exige a permissão granular `employees.read`/`employees.write` (tabela `auth_permissions`), não apenas o papel `ti`. O teste foi corrigido para usar o caminho certo e conceder a permissão sintética mínima necessária ao staff de teste.

Depois dessas duas correções, a suíte de integração completa passou **32/32** sem nenhuma asserção enfraquecida, sem `skip`/`todo` e sem aumento de timeout.

## 9. Resultados exatos (medidos nesta sessão, nesta base)

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0; 82 pacotes; 0 vulnerabilidades |
| `node --check` nos novos `.mjs` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | **5/5**, migrações 001–152 contínuas |
| `npm run typecheck` | exit 0 |
| `node --test tests/ext06-satisfaction.test.mjs` | **12/12**, 0 fail/skip/todo |
| `npm run test:unit` | **442/442**, 0 fail/skip/todo |
| `npm run build` | exit 0; **91 páginas**, incluindo `/admin/satisfacao` e `/cliente/app/satisfacao` |
| `npm run test:migrations:pg` | primeira aplicação e replay; **152/152** checksums; checksum negativo 006 rejeitado (sem rebaseline automático); clone/restauração **152/152**, 557 tabelas |
| `npm run test:ext06-satisfaction:pg` | **32/32**, 0 fail/skip/todo; mínimo autoauditado 30; PostgreSQL 17 descartável + HTTP real; cluster apagado ao final |
| `git diff --check` | exit 0 |

O gate EXT-06 cobre: presença de rota, 401 vs 403 em ordem correta, mutação cross-origin, idempotência obrigatória, metodologia incompleta/NPS fora de 0–10, destinatário sem vínculo ativo, autoria/origem/status forjados ignorados, retry idêntico sem duplicação, corpo divergente com mesma chave (409), cancelamento só antes da resposta com justificativa mínima, conclusão antes da resposta recusada, salto de estado recusado pelo banco, imutabilidade de resposta e de evento, resposta do cliente com NPS detrator abrindo plano com responsável canônico sem vazar identidade em nenhuma string HTTP, listagem do cliente livre de campos internos, conclusão bloqueada com plano pendente, máquina de estados do plano sem saltos, gatilho manual de plano exigindo responsável real, escopo de contrato entre contas, `aggregates` declarando ausência sem apresentá-la como zero, rotas legadas (alias `items`, 410 após guardas, inclusive a rota HR com permissão granular), rollback por falha de auditoria e concorrência sem plano duplicado. Asserções e timeout não foram enfraquecidos; as duas correções da seção 8 foram de rota/teste, não de enfraquecimento de verificação.

## 10. O que não cobre EXT-06

Estático, typecheck, teste unitário, build e teste de migrações **não substituem** o gate dedicado. Também não cobrem EXT-06 os gates EXT-01..05, L02–L08, tenant, staff-auth, client-access, CLI v2, backup/restore, RAG e demo-local. A bateria pesada integral não foi executada nem apresentada como necessária para provar esta fatia. Os seis gates sem workflow (`cli-v2:pg`, `staff-auth:pg`, `client-access:pg`, `backup-restore:pg`, `l02-delivery:pg`, `l03-delivery:pg`) permanecem fora do escopo, assim como as faixas conhecidas de instabilidade pré-existentes (401/403 do `cli-v2:pg`, flake de Chromium do L06, janela de 45s do L05, ferramental do backup-restore) — nenhuma delas foi tocada nesta entrega.

## 11. Fronteiras e pendências

O ator do cliente permanece exclusivamente o CLI-11 autenticado; nenhum login, sessão, grant, respondente anônimo ou link público foi inventado. Dados reais, SMTP e integrações externas não foram usados; todo dado de teste usa domínio `.invalid`. Permanecem distintos e pendentes: aplicação em destino, bateria pesada integral, revisão/aceite humano e homologação Windows. Não houve aceite humano novo; Marcelo/Andreia continuam valendo somente para L07. As condições comerciais pendentes de EXT-03 e EXT-04 não foram resolvidas nesta entrega.

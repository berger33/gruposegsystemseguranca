# L07 — FIN-12 · boletos, Pix e gateway somente após seleção e sandbox

**Sessão:** `arena/01a0f88d-gruposegsystemseguranca`

**Base confirmada:** `origin/main` e HEAD inicial em `06d50a3f7b48c1c77ccf5c0b6a9438f7b0f3c127`, merge da PR #55 (FIN-11). A confirmação foi feita com `git log`/`git ls-remote` antes de qualquer edição.

**Escopo:** somente FIN-12. FIN-01..11 foram preservados e revalidados. FIN-13..16 e ADM-01..12 **não** foram iniciados.

## Recuperação da sessão anterior

A sessão que começou o FIN-12 terminou com erro antes de qualquer `commit`/`push`. O trabalho ficou apenas no sandbox daquela sessão: `git ls-remote --heads origin` mostra `arena/01a0f82e` (FIN-11, mergeada) como a branch mais recente, não existe PR depois da #55 e o checkout limpo em `06d50a3` não contém `131-...sql`, `GatewayWorkspace.tsx` nem os subtestes FIN-12. **Nada daquele progresso era recuperável do Git** — o que havia era a descrição do que tinha sido feito. Esta entrega refaz o FIN-12 do zero, auditando de novo o código existente em vez de confiar no relato.

## Diagnóstico da implementação preexistente

O rascunho `079-fin09-10-11-12-resultado-despesa-fiscal-gateway.sql` já criava `fin_payment_gateways`, `fin_gateway_webhooks` e `fin_gateway_charges`, e `src/server/fin-management-api.mjs` já expunha três rotas. A auditoria encontrou:

| Área | Situação encontrada |
|---|---|
| `fin_payment_gateways` | sem código canônico, sem ambiente declarado, sem idempotência; `status` mudava por `COALESCE($1,status)` — dava para nascer direto em `sandbox`, `selecionado` ou `producao`; `config` aceitava qualquer chave, inclusive credenciais; o único CHECK era "selecionado ⇒ sandbox". |
| `fin_gateway_webhooks` | **`is_valid_signature` vinha do corpo da requisição**: o cliente HTTP declarava se a própria assinatura era válida; `signature` era texto livre de 10 a 1000 caracteres, nunca verificado; `is_replay` também era declarado pelo cliente. |
| Replay | detectado por `SELECT` fora de transação e tratado mutando o registro original (`status='replay'`), destruindo o veredito recebido. |
| `fin_gateway_charges` | `receivable_id` opcional (cobrança sem origem canônica); `status` mudava por `COALESCE`, então **`pago` era alcançável por `PATCH` direto**, sem nenhum webhook; `is_conciliated` virava `true` junto, sem conciliação nenhuma. |
| Handlers | escrita fora de transação, `auditLog` em `try{}catch{}` (falha silenciosa), respostas com `details: e.message` e `details: e.detail` expondo mensagem e detalhe do PostgreSQL; sem validação de UUID. |
| `server.mjs` | três rotas registradas e presentes em `API_PATH_MATCH`, sem rota de histórico nem de assinatura. |
| Workspace financeiro | nenhuma aba de gateway em `/admin/financeiro`; só o formulário de diagnóstico em `/admin/ti`, que criava gateway já `sandbox`+`is_selected` e webhook com `is_valid_signature` marcado à mão num checkbox. |
| Testes e gate L07 | 20 subtestes, nenhum cobrindo FIN-12. |

## Entrega

- **Schema:** migration **exclusivamente aditiva** `131-fin12-gateway-hardening.sql`. Nenhuma migração histórica foi tocada e nenhum tipo existente foi alterado (o migrador roda cada arquivo em transação, então `ALTER TYPE ... ADD VALUE` foi deliberadamente evitado; os enums de 079 já bastavam).
  - **`fin_gateway_history`** (nova): histórico imutável de gateway, webhook e cobrança (`UPDATE`/`DELETE` bloqueados por trigger).
  - **Gateway:** colunas `gateway_code`, `environment`, `idempotency_key`, `webhook_secret_sandbox`, `selected_at`, `sandbox_validated_at`. Trigger com máquina de estados `nao_selecionado → selecionado → sandbox → desativado` (e `desativado → nao_selecionado`), campos de identidade imutáveis, **`producao` recusado pelo banco**, `environment` travado em `sandbox`, `is_sandbox` travado em `true` e recusa de credenciais na configuração (`token`, `secret`, `password`, `senha`, `api_key`, `certificate`, `private_key`, `client_secret`…).
  - **Cobrança:** colunas `simulated`, `cancel_reason`, `settled_at`, `conciliated_webhook_id`. Recebível canônico obrigatório; `provider_charge_id` restrito a `synthetic-chg-<hex>`; índice único parcial impede duas cobranças abertas para o mesmo recebível; transições `pendente → pago|falhou|cancelado`, `falhou → cancelado`, `pago → estornado`; e a regra central: **`pago` exige `conciliated_webhook_id` apontando para um webhook `conciliado`, do mesmo gateway, com assinatura válida e ligado a esta cobrança**.
  - **Webhook:** colunas `signature_algorithm`, `payload_digest`, `replay_attempts`, `charge_id`. Assinatura obrigatoriamente `hmac-sha256` em 64 hex; o recebimento é imutável (payload, assinatura, digest, chave e veredito não mudam depois de gravados); só duas alterações são possíveis — incrementar o contador de replay, ou conciliar `validado → conciliado` contra uma cobrança pendente do mesmo gateway que ainda não tenha webhook conciliado.
- **Somente após seleção e sandbox:** o gateway nasce `nao_selecionado` com `is_selected = false`; a API recusa `is_selected` no POST (`selection_is_an_explicit_transition`). Cobrança em gateway `nao_selecionado` **ou** `selecionado` devolve `409 gateway_not_selected_sandbox_required` — selecionar não basta, é preciso homologar em sandbox.
- **Assinatura verificada de verdade:** a API recalcula `HMAC-SHA256` sobre a mensagem canônica `código.evento.chave_de_idempotência.sha256(payload canônico)` com o segredo sintético do gateway e compara em tempo constante (`timingSafeEqual`). O JSON do payload é canonizado (chaves ordenadas) para que a assinatura não dependa da ordem de serialização. O corpo da requisição **não pode** declarar `is_valid_signature` nem `status` (`400 signature_verdict_is_server_side`). Assinatura divergente grava o recebimento como `rejeitado` (trilha preservada) e responde `400 webhook_signature_invalid`.
- **Replay idempotente:** chave repetida devolve `409 replay_detected` com `applied: false`, incrementa `replay_attempts` e grava histórico, **sem** criar recebimento novo e **sem** alterar o veredito original.
- **Conciliação explícita:** `PATCH /gateway-webhooks` com `charge_id` move webhook `validado → conciliado` e cobrança `pendente → pago` na mesma transação. Conciliar de novo, conciliar webhook rejeitado ou conciliar cobrança de outro gateway são recusados.
- **Nenhuma cobrança real:** não há cliente HTTP para provedor externo, nem credencial. O segredo de webhook é gerado localmente (`sandbox-whsec-<32 hex>`), fica no servidor e **nunca** aparece nas respostas da API. A rota `POST /api/fin/gateway-webhook-sign` é o simulador local do provedor e responde `simulator: "local_sandbox", real_provider: false`; toda resposta de cobrança carrega `real_charge: false`.
- **API:** `GET/POST/PATCH /api/fin/payment-gateways`, `/api/fin/gateway-webhooks`, `/api/fin/gateway-charges`, mais `POST /api/fin/gateway-webhook-sign` e `GET /api/fin/gateway-history` (com os aliases históricos `/api/hr/fin-gateway-*`, registrados também em `API_PATH_MATCH`). Toda escrita exige sessão de papel financeiro, same-origin, UUIDs válidos, motivo de 10 a 1000 caracteres e chave de idempotência.
- **Transacional e fail-closed:** criações e transições usam `pool.connect()`, `BEGIN`, `FOR UPDATE`/`FOR SHARE`, gravam o histórico e chamam `auditLog({ client })` no mesmo cliente; o `COMMIT` só acontece depois da auditoria. Auditoria indisponível devolve `503 {"error":"audit_unavailable"}` e reverte tudo.
- **Respostas sem detalhes SQL:** erros `23514` são traduzidos por uma **allowlist** de códigos de domínio conhecidos; qualquer outra coisa vira `invalid_gateway_transition` ou `internal`. Nenhuma mensagem, `constraint`, `detail` ou posição vinda do PostgreSQL chega ao cliente.
- **UI real:** nova aba **Boletos / Pix / Gateway** em `/admin/financeiro` (`GatewayWorkspace.tsx`): cadastra o gateway, percorre seleção e homologação sandbox (com a coluna "cobrança liberada" mudando de `não` para `sim`), cria a cobrança ligada ao recebível, dispara o webhook assinado pelo simulador, oferece o botão de assinatura forjada para ver a recusa e mostra webhooks com veredito e contador de replay. A tela de diagnóstico `/admin/ti` deixou de escrever gateway/webhook/cobrança e passou a ser somente leitura, apontando para o caminho canônico.
- **Gate L07:** dois subtestes novos (HTTP e Chromium) elevam o gate de 20 para **22** casos.

## Evidência reproduzível

Todos os gates PostgreSQL usam cluster embutido descartável e somente dados sintéticos; o runner recusa banco fornecido pelo ambiente. O L07 usa HTTP real, sessão/cookie real, Next local e Chromium empacotado pelo Playwright.

### Baseline antes de editar

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–130 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` | 20/20, exit 0 |

### Validação final

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–131 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` — rodada 1 | 22/22, exit 0 |
| `npm run test:l07-delivery:pg` — rodada 2 consecutiva | 22/22, exit 0 |
| `npm run test:migrations:pg` | verde, 131/131 checksums em dois passes, 521 tabelas; cenário negativo de checksum rejeitado e restaurado |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run build` | exit 0 |
| `git diff --check` | limpo |

Durante o desenvolvimento, uma execução intermediária do L07 terminou 21/22: o `load()` do workspace estava embrulhado no mesmo `run()` das ações, e recarregar a lista apagava o aviso que o Chromium esperava. Corrigido (o `load()` virou função simples, como no `FiscalWorkspace`); as duas rodadas finais foram feitas depois dessa correção.

### O que o gate FIN-12 prova

Subteste HTTP:
- 401 sem sessão, 403 para papel não financeiro (leitura e histórico), 403 para origem externa;
- cadastro recusa código inválido, tipo inválido, credenciais na configuração, `environment: "producao"` e `is_selected: true`; o gateway nasce `nao_selecionado` e a resposta **não** traz o segredo de webhook; idempotência devolve 409;
- transição para `producao` é recusada (400) e o banco repete a recusa para escrita direta;
- cobrança em gateway `nao_selecionado` é recusada; depois de `selecionado` **ainda** é recusada; só passa depois de `sandbox`; voltar de `sandbox` para `selecionado` é recusado;
- cobrança exige recebível canônico, valor positivo e valor dentro do saldo do recebível; duas cobranças abertas para o mesmo recebível devolvem 409; chave repetida devolve 409;
- `PATCH` de cobrança para `pago` devolve `409 charge_paid_only_via_conciliated_webhook`;
- assinatura não-hex é recusada; `is_valid_signature` enviado pelo cliente é recusado; assinatura forjada grava `rejeitado` e responde 400; assinatura válida de **outro** payload (campo alterado) também é recusada;
- replay devolve 409 com `applied: false`, conta 1 e depois 2 tentativas, e continua existindo **um único** recebimento;
- webhook rejeitado não concilia; webhook de um gateway não concilia cobrança de outro; conciliação válida deixa a cobrança `pago`/`is_conciliated` com `settled_at`; conciliar de novo é recusado; estorno de cobrança conciliada é aceito e auditado;
- o banco repete as garantias para escrita direta (produção recusada, `pago` sem webhook recusado, `simulated=false` recusado, recebimento de webhook imutável);
- histórico da cobrança tem exatamente os três movimentos (criação, conciliação, estorno) e é imutável a `UPDATE` e `DELETE`;
- auditoria indisponível devolve 503 sem `details` e reverte gateway, cobrança e webhook por completo;
- ao final, nenhuma cobrança com `simulated = false` e nenhum gateway fora de `sandbox` existem.

Subteste Chromium: o papel financeiro cadastra o gateway pela interface (coluna "cobrança liberada" em `não`), seleciona, homologa em sandbox (coluna vira `sim`), cria a cobrança ligada ao recebível, dispara o botão de **assinatura forjada** — a interface mostra a recusa e a cobrança continua `pendente` —, e então dispara o webhook assinado pelo simulador, que valida e concilia. O banco confirma `pago`, `is_conciliated = true`, `simulated = true`, `settled_at` preenchido e o webhook ligado em `conciliado` com assinatura válida.

## Limitações e fronteiras explícitas

- Não existe integração com banco, PSP, adquirente, Bacen/Pix, registradora de boleto ou qualquer provedor externo. Nada é transmitido para fora do processo e nenhum valor é movimentado.
- A rota de assinatura (`/api/fin/gateway-webhook-sign`) é deliberadamente um **oráculo de assinatura local**: quem tem papel financeiro consegue assinar um payload, porque ela existe para substituir o provedor no ambiente sintético. Em um ambiente real ela não deve existir — o segredo seria do provedor, não do simulador.
- O estado `pago` significa **cobrança sintética conciliada pelo simulador**, nunca dinheiro recebido. A baixa do recebível correspondente (FIN-04) **não** é feita automaticamente por esta fatia: a cobrança registra `receivable_id` e a conciliação, mas não escreve em `fin_payment_history`. Ligar conciliação de gateway à baixa do recebível é decisão de contrato financeiro e fica como pendência explícita.
- Os valores `recebido` e `replay` do enum `fin_webhook_status` e `producao` do enum `fin_gateway_status` continuam existindo (os enums são de 079 e não foram alterados), mas as novas constraints impedem que qualquer escrita nova os use; `replay` sobrevive apenas como rótulo no histórico.
- Linhas criadas pelo rascunho 079 continuam legíveis: as constraints novas são `NOT VALID`, de modo que valem integralmente para toda escrita nova e toda alteração, sem reescrever histórico.
- A matriz `docs/CHECKLIST-ENTREGA-LOCAL.md` continua com FIN-05..FIN-12 em `a_revalidar`: as entregas por fatia documentaram a evidência em `docs/ENTREGA-L07-FIN*.md`, mas ninguém consolidou a matriz. Consolidar é tarefa do fechamento do bloco L07, não desta fatia.

## Revalidação posterior e integração FIN-12 → FIN-04 (2026-10-02)

A limitação histórica de que a conciliação não baixava o recebível foi superada pela migração aditiva `135-fin09-fin12-revalidation-hardening.sql` e pelo handler canônico. Ao conciliar webhook assinado válido, a mesma transação cria um `fin_payments` FIN-04 ligado à cobrança, atualiza saldo/status do recebível e grava `fin_payment_history`; estornar a cobrança cria pagamento reversor (`is_estorno=true`, `previous_payment_id` da baixa) e, quando integralmente revertido, devolve o recebível a `pendente`. O gate L07 31/31 prova payload assinado divergente recusado, replay concorrente (1 criação + 5 replays), a baixa/histórico, o saldo/status e o reversor; Chromium confirma a baixa no banco.

A fronteira externa permanece inalterada: gateway, assinatura e cobrança são locais/sintéticos; nenhum Pix, boleto, PSP, adquirente, banco ou valor real é movimentado.

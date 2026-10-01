# L07 — FIN-12 · boletos/Pix/gateway (sandbox)

**Sessão:** `arena/01a0f872-gruposegsystemseguranca`

**Base confirmada:** `origin/main` em `06d50a3f7b48c1c77ccf5c0b6a9438f7b0f3c127`, merge da PR #55 (FIN-11) feito pelo usuário. Nenhum merge foi realizado nesta sessão.

**Escopo:** somente FIN-12. FIN-01..11 foram preservados e revalidados pelos gates existentes. FIN-13..16 e ADM-01..12 **não** foram iniciados.

## Diagnóstico da implementação preexistente

O rascunho `079-fin09-10-11-12-resultado-despesa-fiscal-gateway.sql` já criava `fin_payment_gateways`, `fin_gateway_webhooks` e `fin_gateway_charges`, e `src/server/fin-management-api.mjs` já expunha três rotas (`handleGateways`, `handleWebhooks`, `handleCharges`). A auditoria encontrou as seguintes lacunas graves:

| Área | Situação encontrada |
|---|---|
| `fin_payment_gateways` | `status` incluía `producao` no enum, sem nenhum `CHECK` que o impedisse de ser alcançado; `webhook_secret_hash` (sem formato sandbox obrigatório); nenhuma máquina de estados no banco — `PATCH` trocava `status`/`is_selected`/`config` livremente via `COALESCE`; nenhuma proteção contra credenciais reais em `config`. |
| `fin_gateway_webhooks` | **A assinatura (`is_valid_signature`) e o replay (`is_replay`) eram aceitos diretamente do corpo da requisição do cliente** — o handler apenas persistia o que o chamador afirmava, sem recalcular nada. Isso tornava a verificação de assinatura inteiramente decorativa: qualquer chamador podia declarar `is_valid_signature:true` e nada no servidor conferia. Não existia vínculo com uma cobrança (`charge_id`), então não havia como a conciliação saber qual cobrança um webhook deveria confirmar. |
| `fin_gateway_charges` | `PATCH` aceitava `status:"pago"` diretamente via HTTP, sem exigir nenhum webhook validado; não existia `confirmation_webhook_id`/`refund_webhook_id`, então nada ligava uma cobrança paga a um evento específico; `is_conciliated`/`conciliated_at` podiam ser setados por qualquer `PATCH`. |
| Handlers de gateway | Mesma lacuna estrutural das fatias anteriores: sem transação em alguns caminhos, sem `auditLog` fail-closed, respostas com `details` potencialmente vazando erro SQL. |
| `server.mjs` | Rotas de gateway/webhook/charge registradas, mas sem rota de histórico (`fin-gateway-history`) nem de simulador de assinatura. |
| Workspace financeiro | Nenhuma aba de gateway em `/admin/financeiro`; o único lugar que escrevia gateway/webhook/cobrança era um formulário de diagnóstico em `/admin/ti` que incluía um **checkbox `is_valid_signature`** — ou seja, a própria tela de administração permitia fabricar uma assinatura "válida" sem qualquer HMAC. |
| Migration 079 | Rascunho acima; não alterada. |
| Testes e gate L07 | 20 subtestes, nenhum cobrindo FIN-12. |

A lacuna da assinatura aceita por afirmação do cliente era a mais séria: ela invalidava por completo o requisito explícito do checklist ("validar assinatura de webhook, replay, idempotência e conciliação").

## Entrega

- **Schema:** migração **exclusivamente aditiva** `131-fin12-gateway-hardening.sql`. Nenhuma migração histórica foi tocada; nenhum tipo existente foi renomeado (o migrador roda cada arquivo em transação, então `ALTER TYPE ... ADD VALUE` foi deliberadamente evitado — os enums `fin_gateway_type`/`fin_gateway_status`/`fin_webhook_status`/`fin_charge_status` do rascunho 079 já cobriam os valores necessários).
  - **`fin_gateway_history`** (nova): histórico imutável de gateway, webhook e cobrança (`UPDATE`/`DELETE` bloqueados por trigger), com `entity_type`/`entity_id`/`previous_status`/`next_status`/`reason`/`metadata`.
  - **Gateway:** `gateway_code` canônico (`^[a-z][a-z0-9_-]{2,59}$`), `idempotency_key` (8–200), `webhook_secret` restrito ao formato sandbox (`^sandbox_[A-Za-z0-9]{16,64}$`), `CHECK (status <> 'producao')` — **`producao` nunca é alcançável, nem por escrita direta no banco**. Trigger de guarda: nasce `nao_selecionado` sem credenciais; campos de identidade (nome, código, ambiente, segredo, chave de idempotência, criador) são imutáveis; transições válidas são só `nao_selecionado → selecionado|desativado`, `selecionado → sandbox|desativado`, `sandbox → desativado`; `selecionado`/`sandbox` exigem `is_sandbox=true`; `sandbox` exige `last_test_at` preenchido; `config` recusa chaves de credencial (`token`, `secret`, `password`, `senha`, `certificate`, `certificado`, `private_key`).
  - **Webhook:** nova coluna `charge_id` (referência à cobrança que o evento confirma/falha/estorna) e `verification_method`. `event_type` restrito a `gateway.ping`/`payment.confirmed`/`payment.failed`/`payment.refunded`; eventos de pagamento exigem `charge_id`, `gateway.ping` não pode ter. Trigger de guarda: nasce `validado` ou `rejeitado` (nunca outro status); campos de assinatura/payload/evento/idempotência/`charge_id`/`is_valid_signature`/`verification_method` são **imutáveis depois de inseridos**; transições válidas são só `validado → replay|conciliado` e `rejeitado → replay`; `is_valid_signature=true` exige `verification_method='hmac_sha256_sandbox'` (nunca pode ser marcado válido sem o método de verificação sintético registrado); conciliar exige `charge_id` e assinatura válida.
  - **Cobrança:** novas colunas `is_real_payment` (travada em `false` por `CHECK`), `confirmation_webhook_id`, `refund_webhook_id` (cada um único por cobrança), `cancel_reason`. Trigger de guarda: nasce `pendente`; só pode ser criada quando o gateway referenciado está **`selecionado` E `sandbox` E testado** (`gateway_not_ready` caso contrário); transições válidas são só `pendente → pago|falhou|cancelado` e `pago → estornado`; `pago`/`falhou` exigem `confirmation_webhook_id` apontando para um webhook já **`conciliado`**, com assinatura válida, do mesmo gateway, da mesma cobrança e do `event_type` correspondente (`payment.confirmed` para `pago`, `payment.failed` para `falhou`); `estornado` exige o mesmo para `refund_webhook_id`/`payment.refunded` e só a partir de `pago`; cancelamento manual só é aceito quando a cobrança ainda não tem nenhum webhook de confirmação ligado.
- **Assinatura nunca é afirmação do cliente:** a API recomputa `HMAC-SHA256(secret, canonicalStringify(payload))` no servidor com o `webhook_secret` do gateway (`verifySandboxSignature`, comparação com `timingSafeEqual`) e decide `is_valid_signature`/`status` sozinha; o corpo da requisição não pode conter `is_valid_signature`, `is_replay` ou `status` (`400 server_computed_fields_cannot_be_set_by_client`). O gatilho do banco reforça a mesma regra de forma independente da API.
- **Replay via idempotência:** reenviar a mesma `idempotency_key` nunca cria uma segunda cobrança confirmada; se o webhook original ainda estava `validado`/`rejeitado`, ele é marcado `replay` e **deixa de poder ser conciliado** — fechando a janela de uma tentativa de reaproveitar uma assinatura já usada para confirmar duas vezes.
- **Conciliação dedicada:** `PATCH /api/fin/gateway-webhooks` com `action:"conciliate"` é o único caminho que move uma cobrança para `pago`/`falhou`/`estornado`; ele liga explicitamente um webhook `validado` à cobrança que ele referencia (nunca um `PATCH` livre de status na cobrança — isso é recusado com `400`).
- **Segredo mostrado uma única vez:** o `webhook_secret` sandbox só aparece na resposta de **criação** do gateway (como um provedor real mostraria uma vez), com aviso explícito (`copie_o_webhook_secret_agora_nao_sera_mostrado_novamente`); `GET` e todas as demais respostas usam `redactGateway()` e nunca o relistam.
- **Simulador de assinatura sandbox:** `POST /api/fin/gateway-webhook-sign` reproduz o que o **gateway externo simulado** faria com o segredo recebido fora de banda — ele nunca é usado pelo caminho de verificação (`handleWebhooks` sempre recalcula de forma independente); serve só para a interface/gate produzirem a assinatura de teste sem expor o segredo de novo.
- **Nenhuma cobrança real:** `is_real_payment` é recusado tanto na criação da cobrança quanto do gateway, travado em `false` por `CHECK`; o gateway nunca alcança `status='producao'`.
- **API:** `GET/POST/PATCH /api/fin/payment-gateways`, `GET/POST/PATCH /api/fin/gateway-webhooks`, `GET/POST/PATCH /api/fin/gateway-charges`, `GET /api/fin/gateway-history`, `POST /api/fin/gateway-webhook-sign` (com os aliases históricos `/api/hr/fin-gateway-*`, registrados também em `API_PATH_MATCH`). Toda escrita exige sessão de papel financeiro, same-origin, UUIDs válidos e, para transições, motivo de 10 a 1000 caracteres.
- **Transacional e fail-closed:** criações e transições usam `pool.connect()`, `BEGIN`, `FOR UPDATE`, gravam o histórico e chamam `auditLog({ client })` no mesmo cliente; o `COMMIT` só acontece depois da auditoria. Auditoria indisponível devolve `503 {"error":"audit_unavailable"}` e reverte tudo (gateway, cobrança e webhook, sem efeito parcial).
- **Respostas sem detalhes SQL:** erros `23514` são traduzidos por uma **allowlist** de códigos de domínio conhecidos; qualquer outra coisa vira `invalid_gateway_transition`/`internal`. Nenhuma mensagem, `constraint`, `detail` ou posição vinda do PostgreSQL chega ao cliente.
- **UI real:** nova aba **Boletos/Pix/Gateway** em `/admin/financeiro` (`GatewayWorkspace.tsx`): cadastra gateway sandbox, mostra o segredo uma única vez na notificação de criação, transições (Selecionar/Testar sandbox/Desativar) com motivo obrigatório, cria cobrança apenas contra gateway já testado em sandbox, cria webhook com cálculo de assinatura via simulador (campo de assinatura editável para permitir testar assinatura inválida deliberadamente) e concilia webhooks validados. A tela de diagnóstico `/admin/ti` deixou de ter o checkbox `is_valid_signature` e os formulários de escrita direta; passou a ser somente leitura, apontando para o caminho canônico.
- **Gate L07:** dois subtestes novos (HTTP e Chromium) elevam o gate de 20 para **22** casos.

## Evidência reproduzível

Todos os gates PostgreSQL usam cluster embutido descartável e somente dados sintéticos; o runner recusa banco fornecido pelo ambiente. O L07 usa HTTP real, sessão/cookie real, Next local e Chromium empacotado pelo Playwright.

### Baseline antes de editar

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
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
| `npm run test:migrations:pg` | verde, 131/131 checksums em dois passes; cenário negativo de checksum rejeitado e restaurado |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run build` | exit 0 |
| `git diff --check` | limpo |

Durante o desenvolvimento, uma rodada inicial do gate terminou 20/22: o teste assumia que reenviar a mesma chave de idempotência criaria uma nova linha "replay" deixando a original `validado` disponível para conciliar — na implementação real (e correta), a reutilização da chave marca a **própria linha original** como `replay`, revogando sua validade para conciliação. O teste foi corrigido para refletir esse comportamento (replay invalida o webhook original; um segundo evento genuíno com chave distinta é o que efetivamente concilia). Um segundo problema era do próprio teste Chromium: o campo de motivo é compartilhado entre as três seções e é limpo após cada transição — o teste não o preenchia de novo antes de clicar "Testar sandbox". Ambos foram corrigidos e as duas rodadas finais passaram sem alterar nenhuma asserção de segurança.

### O que o gate FIN-12 prova

Subteste HTTP:
- 401 sem sessão, 403 para papel não financeiro, 403 para origem externa;
- gateway recusa código fora do padrão canônico, segredo fora do formato sandbox e credenciais em `config`; idempotência devolve 409; segredo nunca é relistado em `GET`;
- cobrança é recusada (`409 gateway_not_selected_sandbox_tested`) antes de o gateway estar selecionado **e** testado em sandbox, mesmo já selecionado sem teste;
- transição direta de `nao_selecionado` para `sandbox` é recusada pelo banco; repetir o mesmo estado é recusado; `is_real_payment=true` é recusado tanto no gateway quanto na cobrança;
- webhook recusa tipo de evento desconhecido, falta de `charge_id` em evento de pagamento, `charge_id` presente em `gateway.ping`, e qualquer tentativa do cliente de afirmar `is_valid_signature`/`is_replay`/`status`;
- uma assinatura incorreta é persistida como `rejeitado` (prova de que a API não rejeita a requisição, mas também não aceita a assinatura — ela registra o resultado real da verificação);
- uma assinatura correta (calculada com o segredo recebido na criação) é validada e o mesmo evento reenviado é detectado como replay, **invalidando o webhook original** para conciliação;
- o fluxo completo é percorrido com um segundo evento genuíno (chave de idempotência distinta): conciliação move a cobrança para `pago`, liga `confirmation_webhook_id`, marca `is_conciliated=true`; tentar conciliar de novo é recusado; `payment.failed` move outra cobrança pendente para `falhou`; `payment.refunded` exige cobrança `pago` (recusa se a cobrança já falhou) e move para `estornado`;
- cancelamento manual só é aceito antes de qualquer webhook de confirmação ligado;
- o simulador `/gateway-webhook-sign` produz exatamente a mesma assinatura que a verificação independente calcularia — prova de que ele é consistente, mas documentado como nunca usado pelo caminho de verificação;
- o banco repete as garantias para escrita direta (ambiente/identidade imutáveis, `producao` recusado, cobrança não pula de `cancelado` para `pago`, `is_valid_signature` imutável);
- histórico imutável a `UPDATE` e `DELETE`;
- auditoria indisponível devolve 503 sem `details` e reverte gateway e cobrança por completo, sem nenhuma linha parcial;
- nenhuma cobrança com `is_real_payment=true` e nenhum gateway com `status='producao'` existe ao final.

Subteste Chromium: o papel financeiro cadastra o gateway sandbox na aba **Boletos/Pix/Gateway**, lê o segredo exibido uma única vez na notificação, seleciona o gateway, testa em sandbox, cria uma cobrança pendente, monta um webhook de confirmação calculando a assinatura pelo simulador sandbox, envia o webhook (a API confirma "assinatura recomputada no servidor: válida") e concilia — a cobrança muda para `pago` na tabela, com `confirmation_webhook_id` preenchido e `is_real_payment=false` confirmado no banco.

## Limitações e fronteiras explícitas

- Não existe integração com nenhum provedor de pagamento, banco, Pix ou boleto reais; nenhuma credencial de produção é persistida, aceita ou sequer suportada pelo formato de configuração.
- O "gateway externo" é inteiramente simulado dentro do próprio processo: o endpoint `/gateway-webhook-sign` representa o lado emissor sintético, nunca uma chamada de rede real.
- `environment` e `status='producao'` são permanentemente inalcançáveis nesta implementação — não há caminho, nem mesmo via escrita direta no banco, para sair do sandbox.
- Linhas criadas pelo rascunho 079 continuam legíveis: as constraints novas são `NOT VALID`, de modo que valem integralmente para toda escrita nova e toda alteração, sem reescrever histórico.
- FIN-13 (orçamento/cenários) permanece no rascunho, sem hardening e fora do gate.

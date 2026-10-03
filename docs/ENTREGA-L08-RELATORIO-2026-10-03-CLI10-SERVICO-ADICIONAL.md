# Entrega L08 — CLI-10 solicitação de serviço adicional

Data: 03/10/2026  
Branch: `arena/01a1003f-gruposegsystemseguranca`  
Base oficial: `f67c5ffe5d5fe30825167b34c99b35733e3df6d9`

## Sincronização e escopo

Antes de editar, a branch foi comparada com `origin/main`: divergência `0/0` no SHA `f67c5ffe5d5fe30825167b34c99b35733e3df6d9`. A PR #89 foi confirmada no remoto como `MERGED`, tendo esse mesmo SHA como merge commit. CLI-09 foi preservado e não foi refeito.

Este lote promove somente **CLI-10**. CLI-11 e CLI-12 continuam pendentes de suas jornadas cliente completas; CLI-13..15 também não foram promovidos.

## Implementação entregue

### Jornada cliente

- nova rota real `/cliente/app/solicitacoes`, integrada à navegação do portal;
- formulário com título, descrição e contrato relacionado opcional;
- texto explícito de que a solicitação não é aceite, contratação, cobrança ou obrigação;
- listagem dos protocolos criados pela identidade na conta selecionada;
- estados de carregamento, vazio, erro, retry, envio e sucesso;
- retry preserva a chave idempotente até confirmação do servidor.

### Autorização e isolamento

A rota `/api/client/service-requests` usa a sessão canônica do cliente, não a sessão administrativa. Em cada operação:

- exige sessão cliente e same-origin;
- valida UUIDs no servidor;
- revalida grant não revogado e conta ativa;
- impede consulta de conta sem vínculo;
- restringe a listagem à conta e à identidade autenticadas;
- quando há contrato, confirma que pertence à conta e está no escopo `all`/`selected` do grant;
- deriva autoria da sessão; não aceita identidade ou responsável forjados pelo corpo.

### Persistência e CRM

- `cli_service_requests` permanece a fonte canônica da solicitação;
- `crm_opportunities` permanece a fonte canônica da oportunidade;
- `client_accounts.crm_company_id` registra o vínculo explícito entre conta do portal e empresa do CRM;
- responsável é derivado do cadastro real da empresa no CRM; a API falha de forma explícita se o vínculo ou responsável ainda não estiver configurado;
- solicitação, oportunidade em estágio `novo`, histórico inicial e auditoria canônica são gravados na mesma transação;
- falha em qualquer uma dessas etapas causa rollback e resposta 503;
- a solicitação permanece no estado `solicitada`; nenhuma escrita é feita em contratos, cobranças ou obrigações;
- chave idempotente única por identidade e fingerprint do conteúdo impedem duplicação e reuso divergente.

A escrita administrativa legada de solicitações foi preservada para compatibilidade. A garantia transacional solicitação/oportunidade promovida neste lote pertence à rota cliente.

## Migração

Criada somente:

- `db/migrations/141-l08-cli10-service-request-portal.sql`.

Ela é aditiva e inclui:

- vínculo `client_accounts.crm_company_id` com a empresa canônica;
- índice único parcial do vínculo;
- backfill conservador apenas quando o documento é não vazio, exato e não ambíguo;
- idempotency key e fingerprint em `cli_service_requests`;
- identidade responsável na solicitação;
- ações `service_request_list` e `service_request_create` no CHECK acumulado da auditoria.

As migrações 001–140 não foram alteradas. O manifesto do migrador e o QA estático foram atualizados para 001–141.

## Validações executadas

- `npm ci`: OK, 0 vulnerabilidades;
- `node --test tests/cli10-service-request.test.mjs`: **3/3 OK** — sessão obrigatória, negação/auditoria sem grant e transação completa sem escrita contratual/financeira;
- `node scripts/qa-wave0-static.mjs`: **5/5 OK**;
- `npm run typecheck`: OK;
- `npm test`: **199/199 testes OK**;
- `npm run build`: OK, **82 páginas**, incluindo `/cliente/app/solicitacoes`.

Não foram executados gates L03..L08 em cascata, Chromium massivo ou PostgreSQL embutido em loop, conforme a diretriz de validação rápida. A migração não foi aplicada em banco operacional nesta sessão.

## Pendências reais

- aplicar a migração 141 no ambiente de destino pelo processo autorizado;
- contas sem correspondência documental única precisam ter `crm_company_id` configurado de forma explícita e a empresa CRM precisa possuir responsável real antes de aceitar solicitações;
- CLI-11 e CLI-12 continuam pendentes de promoção vertical no portal;
- homologação humana e operacional da jornada continua pendente;
- homologação final Windows permanece reservada para o fechamento integral.

“A homologação final Windows continua pendente e adiada até o fechamento integral do sistema.”

# Entrega L08 — CLI-11 satisfação, plano de ação e risco de renovação

Data: 03/10/2026  
Branch: `arena/01a10049-gruposegsystemseguranca`  
Base oficial: `1024b3b555baff6d26cdda1643ca8103e51754ee` (merge da PR #90)

## Sincronização e escopo

A branch desta sessão foi criada da `main` oficial no merge commit da **PR #90**,
já verificada no repositório local. CLI-09 e CLI-10 foram preservados e não
foram refeitos; a migração 141 permanece imutável.

Este lote promove somente **CLI-11**. CLI-12 continua pendente da jornada
cliente de comunicação de renovação; CLI-13..15 também não foram promovidos.

## Implementação entregue

### Jornada cliente

- nova rota real `/cliente/app/satisfacao`, integrada à navegação do portal;
- lista apenas as pesquisas **endereçadas à identidade autenticada** na conta
  selecionada — pesquisas sem destinatário explícito não aparecem;
- formulário de resposta com nota 0–10 e comentário obrigatório (10–2000);
- estados de carregamento, vazio, erro, retry, envio e sucesso;
- o retry preserva a chave idempotente até confirmação do servidor;
- quando o risco não é sustentado por registros, a tela declara
  “Não classificado”, em vez de exibir um rótulo inventado.

### Autorização e isolamento

A rota `/api/client/satisfaction-surveys` usa a sessão canônica do cliente, não
a sessão administrativa. Em cada operação:

- exige sessão cliente e same-origin;
- valida UUIDs no servidor;
- revalida grant não revogado e conta ativa;
- restringe leitura e resposta à conta e à identidade destinatária;
- deriva autoria da sessão: `responded_by_identity` nunca vem do corpo;
- recusa segunda resposta da mesma pesquisa com 409.

A rota administrativa legada (`/api/cli/satisfaction-surveys` e aliases) foi
preservada integralmente para compatibilidade.

### Fatos, plano de ação e risco

O risco de renovação é derivado **somente de contagens em registros canônicos**,
lidas dentro da mesma transação: `client_tickets` (abertos/em andamento),
`cli_charges_v2` (vencidos) e respostas anteriores com nota até 6. Os fatos, as
fontes e a data-base são gravados em `facts_json` e exibidos ao cliente. Falha
de leitura aborta a transação; nenhuma contagem ausente vira zero.

Classificação determinística, sem estimativa: nota ≤ 6 com agravante → `alto`;
nota ≤ 6 sem agravante → `medio`; nota 7–8 com agravante → `medio`; nota 7–8 sem
agravante → **não classificado**; nota ≥ 9 → `baixo` (ou `medio` com agravante).

O plano de ação só é aberto quando a nota é ≤ 6 **e** existe responsável
comercial real na empresa canônica do CRM vinculada à conta. Sem esse
responsável, nenhum nome é inventado: a pesquisa registra
`action_plan_pending_reason` e a tela declara a pendência. Resposta, fatos,
plano e auditoria canônica são gravados na mesma transação; falha em qualquer
etapa causa rollback e 503. Nenhuma escrita é feita em contratos, cobranças ou
obrigações.

## Migração

Criada somente:

- `db/migrations/142-l08-cli11-satisfaction-portal.sql`.

Ela é aditiva e inclui:

- `target_identity_id` e `responded_by_identity` em `cli_satisfaction_surveys`;
- chave de idempotência + fingerprint da resposta, com unicidade por identidade;
- `action_plan_pending_reason` com CHECK `NOT VALID`;
- `responsible_identity_id`, `origin` e `facts_json` em
  `cli_satisfaction_action_plans`, com índice único parcial que impede plano
  automático duplicado por pesquisa;
- ações `satisfaction_survey_list` e `satisfaction_survey_respond` no CHECK
  acumulado da auditoria.

Linhas históricas não recebem destinatário nem autoria inventados: ficam `NULL`
e, por isso, não são expostas na jornada autenticada. As migrações 001–141 não
foram alteradas. O manifesto do migrador e o QA estático foram atualizados para
001–142.

## Validações executadas

- `npm ci`: OK, 0 vulnerabilidades;
- `node --test tests/cli11-satisfaction-portal.test.mjs`: **6/6 OK** — sessão
  obrigatória, negação/auditoria sem grant, transação completa com plano e
  auditoria, ausência de plano sem responsável real, validações de entrada sem
  abrir transação e reuso divergente de chave idempotente;
- `node scripts/qa-wave0-static.mjs`: **5/5 OK** (001–142);
- `npm run typecheck`: OK;
- `npm test`: **205/205 testes OK**;
- `npm run build`: OK, **83 páginas**, incluindo `/cliente/app/satisfacao`.

Não foram executados gates L03..L08 em cascata, Chromium massivo ou PostgreSQL
descartável em loop: por decisão explícita do proprietário, os **testes pesados
ficam para depois da entrega do sistema**. A migração não foi aplicada em banco
operacional nesta sessão.

## Pendências reais

- aplicar a migração 142 no ambiente de destino pelo processo autorizado;
- pesquisas antigas sem `target_identity_id` precisam ser endereçadas
  explicitamente para aparecerem no portal;
- contas sem empresa CRM vinculada e com responsável real só registram a
  resposta, com o plano de ação declarado pendente;
- CLI-12 continua pendente de promoção vertical no portal; CLI-13..15 idem;
- gate `test:l08-delivery:pg` com HTTP/PostgreSQL/Chromium reais para CLI-11
  continua pendente, junto com a bateria pesada;
- homologação humana e operacional da jornada continua pendente;
- homologação final Windows permanece reservada para o fechamento integral.

“A homologação final Windows continua pendente e adiada até o fechamento integral do sistema.”

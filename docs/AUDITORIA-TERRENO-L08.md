# Auditoria documental do terreno L08 — CLI-01..15 e EXT-01..17

Data: 2026-10-02. Base auditada: `ad01d7d` (merge da PR #76). Próxima migração livre: **139**.

## Limite desta auditoria

O L07 recebeu aceite humano integral de Marcelo e Andreia para FIN-01..16 e
ADM-01..12, mas **não houve validação Windows com evidência**. Por isso o L07
continua em execução e, conforme a ordem autorizada, o L08 **não foi iniciado**.
Este documento apenas inventaria código existente, rotas, tabelas e provas; não
promove nenhum requisito, não cria `test:l08-delivery:pg` e não trata componente
órfão como tela entregue.

Critério usado:

- **provado**: existe jornada executável e teste vigente que exerce autorização,
  HTTP e PostgreSQL no comportamento citado;
- **parcial/legado**: há infraestrutura útil e prova anterior, mas ela não cobre
  todo o requisito L08 ou usa as tabelas legadas 003–005;
- **órfão/não provado**: tabela/API/componente existe, porém não há rota de tela
  que o renderize e gate L08 que prove o requisito ponta a ponta.

## Terreno comum do portal

- Rotas reais: `/cliente/entrar`, convite, confirmação, recuperação, troca de
  senha, `/cliente/app`, `/cliente/app/contratos`, `/documentos`, `/chamados` e
  `/seguranca`.
- APIs legadas efetivamente usadas pelas telas: `/api/auth/*`,
  `/api/client/accounts`, `/contracts`, `/documents`, download por ID,
  `/tickets` e `/security/mfa/*`.
- Tabelas legadas: migrações 003–005 (`auth_*`, `client_accounts`,
  `client_access_grants`, `client_contracts`, `client_documents`,
  `client_tickets`, auditoria de status e escopos de contrato/MFA/troca de
  e-mail), endurecidas por 097–101.
- Provas reaproveitáveis, mas ainda fora de um gate L08: unitários
  `client-auth-core`, `client-space-*`, `client-security-*`; integrações
  `client-access.integration`, `client-space.integration` e
  `client-security.integration`; runner `qa-tenant-postgres --client-access`.
- A migração 075 criou `cli_tickets_v2`, já lida como fonte canônica por ADM-01 e
  ADM-03 no gate L07. Isso prova a fonte para indicadores do painel, **não** a
  jornada do cliente no L08.

## CLI-01..15

| ID | Tela/rota encontrada | APIs e tabelas encontradas | Prova vigente e lacuna para L08 | Classificação |
|---|---|---|---|---|
| CLI-01 | Entrada/convite/recuperação reais sob `/cliente`; `/cliente/app/portal` é apenas texto “Camada 1” | `/api/auth/*`; 003 e 097–101. Metadados v2 `/api/cli/entry-points|old-routes`; 074 | Fluxo legado tem integração PG; entrada/rotas v2 só aparecem em `CliClient.tsx`, órfão e staff-only | parcial/legado |
| CLI-02 | Administração de contas/grants em `/admin/clientes`; nenhuma tela cliente v2 de contatos/delegação | `/api/client/accounts`; `/api/admin/grants`; `/api/cli/client-contacts|contact-scopes|contact-delegate`; 004–005/074 | Escopo A≠B legado é provado; contatos/delegação v2 exigem staff e não têm jornada cliente | parcial/órfão v2 |
| CLI-03 | `/cliente/app/contratos` usa contrato legado | `/api/client/contracts`; v2 `contract-items|scopes|vigencia`; 004/074 | Contrato por conta é provado no legado; itens/escopo/vigência v2 ficam no `CliClient.tsx` órfão e staff-only | parcial/órfão v2 |
| CLI-04 | `/cliente/app/documentos` lista e baixa documento legado privado | `/api/client/documents` e download; v2 categorias/documentos/versões/download/logs; 004/074 e 101 | Bytes privados, integridade e conta A≠B têm prova legada/QA; alias v2 continua staff-only e retorna metadado/URL, não streaming cliente | em execução; não fechado |
| CLI-05 | `/cliente/app/chamados` cria/lista chamado legado | `/api/client/tickets`; v2 tickets/mensagens/anexos/histórico/SLA; 004/075 | Legado tem prova PG; `cli_tickets_v2` é fonte ADM provada, mas alias v2 requer sessão staff e `CliAdvancedClient.tsx` é órfão | parcial/órfão v2 |
| CLI-06 | Nenhuma tela cliente para estados/reabertura/SLA v2 | mesmos handlers/tabelas de CLI-05 | Não há gate L08; mutações v2 não estão demonstradas como uma transação única com auditoria fail-closed | órfão/não provado |
| CLI-07 | Nenhuma tela cliente de agenda | `/api/cli|client/visits`, histórico; `cli_visits`, `cli_visit_history` (075) | Alias cliente chega a handler staff-only; componente TI órfão; sem prova A≠B | órfão/não provado |
| CLI-08 | Nenhuma tela cliente de relatórios/aceite | `/api/cli|client/reports-v2`, histórico; tabelas 075 | Handler e componente existem, mas não há UI cliente nem gate de revisão/aceite/autorização | órfão/não provado |
| CLI-09 | Nenhuma tela cliente de cobranças | `/api/cli|client/charges-v2`; `cli_charges_v2` (076) | Componente `CliFinanceClient.tsx` órfão; não há vínculo provado com FIN nem dados próprios da conta | órfão/não provado |
| CLI-10 | Nenhuma tela cliente de serviço adicional | `/api/cli|client/service-requests`; `cli_service_requests` (076) | Não há jornada provando criação da oportunidade CRM, origem, responsável, atomicidade ou rollback | órfão/não provado |
| CLI-11 | Nenhuma tela cliente de satisfação | `/api/cli/satisfaction-surveys|action-plans`; tabelas 076 | Somente API/componente órfão; risco de renovação baseado em fatos não tem gate | órfão/não provado |
| CLI-12 | Nenhuma tela cliente de renovação | `/api/cli/renewal-communications`; tabela 076 | API/componente órfão; ausência de bloqueio indiscriminado não foi provada | órfão/não provado |
| CLI-13 | `/admin/portal/solicitacoes` existe; nenhuma jornada cliente v2 homologada | `/api/cli/portal-mode-configs|portal-access-requests` e alias cliente; tabelas 076; convite legado 003 | Aprovação manual tem guards legados, mas modos/vínculo/negação de contrato automático ainda sem gate L08 | parcial/órfão v2 |
| CLI-14 | `/cliente/app/seguranca` opera MFA; páginas de troca de e-mail existem | `/api/client/security/mfa/*`, `/api/auth/*`; v2 security-events/email-change/sessions; 005/076/097–099 | MFA e sessão legados têm testes; gestão completa v2 e autoria/escopo cliente ainda não têm gate L08 | parcial/legado |
| CLI-15 | Nenhuma tela cliente; `EmployeeComplaintClient.tsx` é órfão de `/admin/ti` | `/api/cli/employee-complaints`; cinco tabelas 093 | Sem jornada cliente, roteamento aos responsáveis, mínimo de RH e controles A≠B no gate L08 | órfão/não provado |

### Risco transversal CLI v2

Os módulos `cli-api.mjs`, `cli-advanced-api.mjs` e `cli-finance-api.mjs` declaram
ou implementam acesso **staff-only** em vários aliases `/api/client/*`. Logo, a
existência do alias não prova autorização do cliente. Há ainda escritas em
múltiplas consultas seguidas de `auditLog` sem transação única em handlers v2;
o padrão L08 exige falha da auditoria → 503 e rollback integral. Esses pontos
precisam de prova e, onde necessário, hardening aditivo a partir da migração 139.

## EXT-01..17

As migrações 085–087 e os módulos `ext-api.mjs`, `ext-advanced-api.mjs` e
`ext-reporting-api.mjs` cobrem nominalmente todos os IDs. Entretanto, as únicas
interfaces encontradas são `ExtClient.tsx`, `ExtAdvancedClient.tsx` e
`ExtReportingClient.tsx` em `/admin/ti`; os três estão entre os 80 componentes
órfãos, não são importados por rota e não têm gate de entrega por requisito.

| IDs | APIs principais | Tabelas | Estado real da prova |
|---|---|---|---|
| EXT-01 | `fleet-vehicles|fuel-logs|maintenance-logs|documents` | `ext_fleet_*` (085) | API/tabelas; UI órfã; sem gate |
| EXT-02 | `third-parties|third-party-documents` | `ext_third_parties`, documentos/logs (085) | Sem sessão de fornecedor restrita ou prova de revogação ponta a ponta |
| EXT-03 | `bidding-notices|bidding-documents` | `ext_bidding_*` (085) | Sem rota de tela/gate; arquivos são metadados |
| EXT-04 | `supplier-portal-quotations` | `ext_supplier_portal_*` (085) | Handler é staff-only; fornecedor restrito não está provado |
| EXT-05 | `quality-nonconformities|quality-actions` | `ext_quality_*` (085) | Regras existem no handler; sem UI/gate/rollback transacional provado |
| EXT-06 | `satisfaction-surveys` | `ext_satisfaction_surveys` (085) | Sem jornada nem prova de privacidade/recuperação |
| EXT-07 | `compliance-documents` | `ext_compliance_documents` (086) | UI órfã; sem gate de validade/tarefa/privacidade |
| EXT-08 | `knowledge-base` | base, histórico e ciências (086) | UI órfã; escopo, versão, busca e ciência não provados ponta a ponta |
| EXT-09 | `expansion-plans|scenarios` | `ext_expansion_*` (086) | Sem prova de premissa/fonte e ausência distinta de zero |
| EXT-10 | `continuity-plans` | planos/exercícios (086) | Simulação não identificada por gate; sem UI real |
| EXT-11 | `analytics-experiments` | `ext_analytics_experiments` (086) | Sem gate de aprovação, métrica e privacidade |
| EXT-12 | `visual-tokens|visual-layouts` | tokens/layouts/histórico (086) | Sem rota, preview/publicação/rollback provados |
| EXT-13 | `periodic-reports` | relatórios/logs (087) | Sem prova de fonte, escopo autorizado ou envio simulado identificado |
| EXT-14 | `commercial-intelligence` | `ext_commercial_intelligence` (087) | Sem gate de recomendação, justificativa e aprovação humana |
| EXT-15 | `emergency-channels|tests` | canais/testes (087) | Sem integração real; disponibilidade/recebimento/escalonamento não provados |
| EXT-16 | `central-projects` | projetos/eventos (087) | Projeto separado apenas em dados/API; nenhum vídeo/central real e nenhuma UI provada |
| EXT-17 | `biometry-projects` | `ext_biometry_projects` (087) | Projeto separado apenas; nenhuma biometria coletada, sem avaliação/homologação provada |

### Risco transversal EXT

Os handlers EXT em geral exigem staff `admin|ti`, mas frequentemente devolvem
401 tanto para ausência de sessão quanto para papel indevido, exigem same-origin
até em GET e fazem escrita, escrita relacionada e auditoria em consultas
separadas. Não há prova vigente de fornecedor restrito, rollback por falha de
auditoria, idempotência/concorrência ou indicadores com período/fonte/data-base.
Não devem ser promovidos “porque as tabelas existem”.

## Primeira fatia recomendada quando o L08 for autorizado

**CLI-01..05**, aproveitando 003–005 e as jornadas legadas já testadas, mas sem
misturar o legado com v2 por presunção. O novo gate deve provar, no mínimo:

1. cliente A entra e opera apenas suas contas/contratos/documentos/chamados;
2. cliente A nunca lê nem escreve recurso de B em cada caminho e download;
3. autoria vem da sessão; identidade/conta enviada no corpo não amplia escopo;
4. escrita sensível + histórico + auditoria na mesma transação; auditoria
   indisponível devolve 503 e reverte tudo;
5. retry concorrente é idempotente e não duplica protocolo/documento/mensagem;
6. Chromium percorre entrada → contrato → documento privado → chamado v2;
7. fontes simuladas são rotuladas e ausência de dado não vira zero.

Até haver evidência Windows do L07, isto permanece **recomendação não iniciada**.

## Atualização da sessão L08 — 2026-10-02

A PR #77 foi confirmada como mergeada na `main` (`06be226`). A transição para
L08 foi autorizada pelo proprietário: L07 está encerrado no escopo local e aceito
por Marcelo e Andreia; a homologação Windows continua pendente e foi adiada para
o fechamento integral do sistema. Os 80 órfãos de `/admin/ti` continuam sujeitos
à promoção por área somente com prova.

A primeira fatia implementada/consolidada nesta sessão é CLI-01..05 sobre as
rotas legadas já reais. Não foram criadas fontes v2 concorrentes: as tabelas
canônicas são `auth_*`, `client_accounts`, `client_access_grants`,
`client_contracts`, `client_documents`, `client_tickets` e suas auditorias,
provenientes das migrações 003–005 e endurecidas por 097–101. CLI-06..15 e
EXT-01..17 permanecem não promovidos.

## L08 — revisão da PR #80 e hardening CLI-04/CLI-05 (02/10/2026)

Base confirmada: `main` oficial `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc9`
(merge da PR #78). Sessão Arena `arena/01a0fea1-gruposegsystemseguranca`
(branch fixa da sessão; equivale ao `arena/l08-next-*` sugerido no prompt,
porque a plataforma vincula o trabalho a esta branch criada sobre a main atual).

**Revisão remota da PR #80** (`gh pr view 80` + fetch): estado **OPEN**, não
draft, sem merge commit; head `arena/l08-hardening-20261002` apontando
`a95872de2a29d9ea39773a942cd9e3f7e91bfa4d` (filho direto de `c16673c`); a main
não contém a PR (`git merge-base --is-ancestor` negativo). Validação
independente nesta sessão: worktree destacado em `a95872d`,
`npm run test:l08-delivery:pg` **11/11 em duas execuções consecutivas**,
incluindo a jornada Chromium real (servidor real em loopback → HTTP →
`/cliente/entrar` → heading e campos reais). Achados não bloqueantes
registrados na PR: placeholder "(a segunda execução deverá ser registrada…)" em
7 de 8 documentos; SHA base truncado em 39 caracteres; gate consolidado não
importa `client-access.integration` (a jornada profunda de CLI-01 roda em
`npm run test:integration`, fora do runner L08). **Nenhum merge foi feito** —
a decisão permanece humana.

**Revisão requisito por requisito (achados na primeira fatia):** o espaço do
cliente legado gravava o chamado e só depois tentava a auditoria, fora de
transação e com falha engolida (`console.error`), sem chave de idempotência; o
log de download era gravado depois de os bytes já terem saído; a auditoria da
transição de status do chamado (admin) era gravada após o COMMIT; e a UI de
chamados validava um campo `ok` inexistente na resposta, exibindo sucesso como
erro e incentivando reenvio — caminho real para duplicidade. Isso falhava os
critérios mínimos 5–7 (atomicidade, auditoria fail-closed com 503,
idempotência sob retry concorrente).

**Hardening desta sessão (aditivo; 001–138 imutáveis):**

- Migração **139** `139-cli05-client-ticket-idempotency.sql`: colunas
  `idempotency_key` (8–200, opcional) e `content_fingerprint` em
  `client_tickets`, CHECKs como NOT VALID + VALIDATE (padrão da 134) e índice
  único parcial por `(client_account_id, opened_by_identity, idempotency_key)`.
  Próxima migração livre: **140**.
- `POST /api/client/tickets`: chamado + auditoria na MESMA transação (falha de
  auditoria → ROLLBACK → 503), replay idempotente (200, mesmo `ticketId`),
  conflito de fingerprint (409 `idempotency_key_conflict`) e corrida tratada
  via UNIQUE (23505 → relê a linha vencedora). Sem chave, o contrato anterior
  permanece (cada POST abre um chamado novo).
- Download privado: log registrado ANTES de qualquer byte; falha de auditoria →
  503 e zero bytes servidos. Transição de status do chamado (admin): auditoria
  dentro da mesma transação da escrita.
- UI `/cliente/app/chamados`: envia `idempotency_key` por tentativa, mantém a
  chave em erro de rede (retry não duplica), renova após sucesso e mostra o
  resultado real (replay e 409 com mensagens honestas).
- Testes: novo unitário `tests/client-ticket-write-hardening.test.mjs`
  (9 subtestes com injeção de falha; suíte 196→**205**) e novo subteste de
  integração em `client-space.integration` (8→9; gate L08 11→**12**) provando,
  com PostgreSQL real, duas requisições simultâneas → mesmo protocolo, 1 linha,
  1 auditoria; replay; 409; escopo B negado com a mesma chave; contrato sem
  chave preservado. O fixture de integração passou a aplicar a 139.
- **Falha intermediária registrada (implementação, não ambiente):** a primeira
  execução do gate L08 com o hardening reprovou 3 subtestes porque a lista de
  migrações do próprio fixture não aplicava a 139; corrigida a lista, o gate
  passou sem alterar assertivas, timeouts ou skips.

**Resultados reais:** baseline `c16673c` antes de editar — estático 5/5,
typecheck 0, unitários 196/196, build 0, migrações 138/138 (524 tabelas,
clone/checksum negativo), L07 43/43 duas vezes, L03 1/1, L04 20/20, L05 1/1,
L06 9/9, L08 11/11 (formulação pré-hardening, pois a PR #80 não estava na
base). Código final desta branch: estático 5/5 (001–139), typecheck 0,
unitários **205/205**, build 0, migrações **139/139** (dois passes, 524
tabelas, clone/checksum negativo), L07 **43/43 em duas execuções consecutivas**
(uma execução anterior da mesma bateria registrou 42/43 com log detalhado não
preservado; as duas seguintes, sem mudança de código, 43/43 — instabilidade
transitória registrada, sem skip/timeout/assertiva), L03 1/1, L04 20/20,
L05 1/1, L06 9/9 em cadeia serial, L08 **12/12 em duas execuções consecutivas**.

**Classificação:** implementação local + validação automática Linux/PostgreSQL
descartável. Não é aceite humano e não é homologação Windows; o aceite humano
de Marcelo e Andreia no L07 permanece preservado. **Não promovidos:**
CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações
externas. Pendências reais: PR #80 aberta aguardando decisão humana; escritas
administrativas do espaço do cliente (contas, grants, contratos, upload de
documento) mantêm auditoria sequencial fail-open — próxima fatia candidata;
gate L08 ainda não incorpora `client-access.integration`; placeholder e SHA
truncado nos documentos da série da PR #80. Windows continua pendente até o
fechamento integral do sistema.

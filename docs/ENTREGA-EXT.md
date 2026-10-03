# Entrega EXT — expansões condicionais ligadas ao backend canônico

## EXT-05 qualidade — 03/10/2026

Partindo da `main` `ba2202f` (PR #99 MERGED; divergência 0/0), promove qualidade para jornada interna real: `/admin/qualidade`, `/api/ext/quality/*` e migração 151 aditiva. O probe da base em PostgreSQL 17 + HTTP real reproduziu 9/9 lacunas: rota/tela 404, rh tratado como 401, retry duplicado, salto/fechamento e contador forjável, texto livre no lugar de evidência, auditoria sem rollback, ausência de históricos e zero seed.

Causa é histórica e imutável; ação tem responsável staff, prazo com fonte/data-base e terminais explícitos; verificação estruturada contém autor/data e referência declarada; fechamento exige responsável, causa, ação concluída, nenhuma pendência e verificação eficaz. Reabertura é formal e preserva o fechamento; reincidência liga predecessor e nova NC, e o contador é derivado. Estados, imutabilidade e pré-condições existem na API e no banco. Toda mutação usa sessão, URL canônica, same-origin, idempotência e transação negócio+evento+auditoria; falha audit_log = 503/rollback. Nenhum ator externo/upload/armazenamento/aceite foi inventado.

Provas: focal 6/6; suíte 430/430; estático 5/5; build 90; migrations 151/151; gate HTTP/PG dedicado 33/33 e workflow próprio. Demais gates não cobrem a jornada. Bateria pesada, destino, aceite humano e Windows pendentes. Relatório: [EXT-05](ENTREGA-RELATORIO-2026-10-03-EXT05-QUALIDADE.md).

Este documento acompanha o lote EXT (EXT-01..17), iniciado após o fechamento
local de CLI-15 no L08. Cada fatia promove um requisito EXT de "API/tabela/
componente órfão" para jornada funcional provada; a existência de tabela ou
handler não é tratada como entrega.


## EXT-04 fornecedores — 03/10/2026

Fatia partindo da `main` oficial em `5abc199` (merge da PR #98 / EXT-03, feito por decisão expressa do proprietário nesta sessão; divergência 0/0). Promove somente **EXT-04** para jornada administrativa interna: `/admin/fornecedores`, `/api/ext/supplier/*` e migração aditiva 150, com 001–149 imutáveis.

### Condição e fronteira

O plano em `PLANO-MESTRE-IMPLEMENTACAO.md:423` exige *"se volume justificar"*. Não existe no repositório medição, meta ou histórico de volume; `AUDITORIA-TERRENO-L08.md:85` registra apenas handler/tabelas sem fornecedor restrito provado. Veredito declarado em API, tela e docs: **`sem_evidencia`**. Nenhum dado foi semeado; a ativação segue pendente de decisão do proprietário.

Não existe ator externo fornecedor canônico: nenhuma identidade, credencial, sessão, grant, rota externa, upload ou aceite. A jornada usa somente sessão staff. Portanto o "escopo próprio" do fornecedor permanece **PENDENTE**, não é simulado e não recebe aceite. `file_url`/`storage_key` são somente referências declaradas.

### Lacunas executadas e implementação

Antes de implementar, um PostgreSQL 17 descartável + servidor HTTP real confirmou: namespace e tela canônicos 404; rotas de documentos/pedidos 404; `rh` recebia 401 como anônimo; retry idêntico retornava 201/201 e gravava 2 linhas; `aprovado → rascunho` retornava 200; e auditoria indisponível ainda retornava 201 e aumentava a contagem. O banco limpo tinha zero fornecedores/cotações/pedidos/documentos, o que prova ausência de seed — não prova volume real.

A 150 acrescenta origem/decisão imutável à cotação, validade com fonte e substituição, documento versionado/desativável, pedido derivado da cotação aprovada, prazo do pedido, regra explícita de alerta e eventos imutáveis/idempotentes. Máquinas de estado existem em API e gatilhos; pedido fechado/cancelado e cotação terminal não reabrem. Documento recebe versão dentro de transação após lock; duas escritas concorrentes produziram versões 1 e 2. Toda mutação usa autoria da sessão, vínculo da URL/registro, same-origin, UUID validado, idempotência e transação única com evento + `audit_log`; falha de auditoria ⇒ 503/rollback.

### Validação e classificação

Estático 5/5 (001–150), typecheck, teste focal 42/42, `npm test` 424/424, build 89 páginas, migrations 150/150 ×2 e **gate dedicado `test:ext04-suppliers:pg` 28/28**, zero skip/todo, por HTTP e PostgreSQL reais (`.github/workflows/ext04-delivery.yml`). Estático/typecheck/unit/build/migrations e todos os demais gates **não** são apresentados como prova da jornada; só o gate EXT-04 a exercita ponta a ponta.

Classificação: implementação local + validação automática + gate dedicado. Bateria pesada integral, aplicação em destino, aceite humano, confirmação de volume, ator externo e Windows pendentes. CLI-01..15 e EXT-01..03 preservadas; EXT-05..17 pendentes. O órfão `src/app/admin/ti/ExtClient.tsx` continua não promovido e não foi removido. Relatório: [EXT-04](ENTREGA-RELATORIO-2026-10-03-EXT04-FORNECEDORES.md).

## EXT-03 licitações — 03/10/2026

Fatia partindo da `main` oficial em `4518b3f` (merge da PR #97, confirmado
MERGED no remoto antes de editar; divergência 0/0). Promove somente **EXT-03**:
edital, prazos, documentos, responsáveis, proposta e resultado, ligados ao
backend canônico real (tabelas `ext_bidding_*` da 085 + jornada da 149).

### A condição "se mercado relevante", avaliada e não presumida

O critério do plano é condicional. A evidência disponível é
`docs/referencias-marca.md`, que registra "órgãos públicos" entre os segmentos
citados **pelo site atual**, em seção explicitamente marcada como "confirmar
antes da nova publicação". Portanto a relevância está **indicada e NÃO
confirmada pelo proprietário**. A decisão tomada foi implementar a jornada e
**declarar a condição** (`market_relevance: "indicada_nao_confirmada"`) em API,
tela e documentação, sem afirmar participação em licitações e sem semear
nenhum edital. Confirmação do proprietário é pendência registrada.

### Lacunas reproduzidas antes de implementar

Nove lacunas foram reproduzidas **por execução contra o código anterior**, não
por leitura: 401 para papel sem direito (sem 403); auditoria que falhava
**depois** da gravação, sem transação nem rollback; retry que duplicava; `PATCH`
que aceitava id do corpo e **reabria licitação homologada**; resultado
sobrescrito sem histórico; prazos sem derivação e listagem sem fonte/data-base;
documento com `bidding_id` não validado e versão calculada fora de transação;
**proposta inexistente** como registro canônico; e responsável em texto livre.

### O que passou a valer

Rotas canônicas `/api/ext/bidding/*` com guardas 401/403 distintas, autoria
derivada da sessão, transação única negócio+evento+auditoria (503 com rollback),
idempotência por `(identidade, chave)` e histórico apenas-acréscimo. O critério
é imposto **também pelo banco**: `CHECK` recusa proposta posterior ao prazo de
entrega registrado; gatilhos recusam reabrir edital encerrado, sobrescrever
resultado, editar ou apagar prazo, e apagar histórico. Checklist é derivado dos
documentos ativos e "a vencer" só existe com regra de antecedência registrada.
Rotas legadas mantêm leitura autorizada com o alias `items` e devolvem 410 na
mutação — **depois** das guardas, de modo que anônimo continua recebendo 401.

### Validação

Estático 5/5 (001–149), typecheck limpo, teste dedicado 67/67 em `test:unit`,
`npm test` 382/382, build 88 páginas com `/admin/licitacoes` listada,
`test:migrations:pg` 149/149 em dois passes com checksum negativo rejeitado e
**`test:ext03-biddings:pg` 26/26** por HTTP real contra PostgreSQL real
descartável (`.github/workflows/ext03-delivery.yml`).

Na primeira execução esse gate devolveu **22/26**: três reprovações vinham de um
**defeito real** — o gatilho comparava `ext_bidding_status` (enum) com `TEXT[]`,
e o PostgreSQL recusa (`operator does not exist`), derrubando toda atualização
de edital canônico em 503. A causa foi isolada em laboratório antes da correção
(`::text` resolve) e o filtro `stage`, que usava cast frágil e não tinha teste,
passou a ser exercitado nos dois sentidos. A quarta reprovação era do próprio
teste, que tentava burlar o gatilho de prazo; foi corrigida registrando o prazo
vencido pela API. Nenhuma asserção enfraquecida, nenhum caso pulado, nenhum
timeout aumentado.

### Fronteira declarada

Não existe portal público de compras integrado, importação automática de edital,
envio de proposta a órgão nem upload real de arquivo. `file_url` e `storage_key`
são referências declaradas pela equipe. Bateria pesada integral, aplicação em
destino, aceite humano e Windows seguem pendentes; o aceite de Marcelo e Andreia
continua valendo somente para L07. CLI-01..15, EXT-01 e EXT-02 preservadas;
EXT-04..17 pendentes. Relatório:
[EXT-03](ENTREGA-RELATORIO-2026-10-03-EXT03-LICITACOES.md).

## EXT-02 terceiros — 03/10/2026

Fatia partindo da `main` oficial em `48aa7a4` (merge da PR #96, confirmado
MERGED no remoto antes de editar; divergência 0/0). Promove somente **EXT-02**:
terceiros com cadastro, contrato, documentos, vencimentos, acesso temporário e
avaliação, ligados ao backend canônico real (tabelas `ext_third_part*` da 085 +
jornada da 148).

Critério do plano: **"terceiro acessa só OS/contrato autorizado e perde acesso
ao término"**.

**Fronteira declarada:** não existe hoje ator externo "terceiro" autenticado.
Nenhuma sessão, login ou canal externo de terceiro foi criado — nem simulado.
A janela de acesso e o escopo autorizado são impostos nos registros canônicos e
em toda consulta derivada do lado staff; o acesso do próprio terceiro permanece
**PENDENTE** e é declarado como tal pela API (`external_actor_boundary`, no
dossiê, nas janelas, na autorização e na listagem) e pela tela. O ponto de
imposição é consultável: `GET /api/ext/third-party/parties/<id>/authorization`.

- Migração aditiva única: `148-ext02-third-parties-canonical-journey.sql`
  (001–147 imutáveis; próxima livre 149): origem da jornada e verificação
  canônica do contrato em `ext_third_parties`; `ext_third_party_access_grants`
  (a janela que decide acesso, presa a um único escopo autorizado — contrato
  `crm_contracts` ou OS `ast_service_orders` — com término obrigatório e
  revogação declarada); `ext_third_party_evaluations` (autor, data e
  justificativa obrigatórios); `ext_third_party_document_rules` (regra explícita
  de antecedência, uma ativa por terceiro); `ext_third_party_events` (histórico
  imutável + ledger de idempotência por identidade staff); desativação declarada
  de documento. Constraints novas com `NOT VALID`; sem autoria retroativa. As
  colunas `access_start`/`access_end` da 085 ficam marcadas **LEGADO** por
  COMMENT e nenhuma derivação as lê; `ext_third_party_access_logs` é declarada
  legado e não decide acesso. Triggers recusam UPDATE/DELETE em avaliações e
  eventos, e na janela aceitam **uma única** transição: a revogação declarada.
- API canônica `src/server/ext-third-party-api.mjs` em `/api/ext/third-party/*`:
  papéis admin/marcelo/ti; anônimo 401 e papel não autorizado 403 antes de
  qualquer consulta; same-origin e `Idempotency-Key` em toda mutação (replay
  idêntico devolve o mesmo registro; reuso divergente 409); autoria derivada da
  sessão e vínculo derivado da URL — IDs/autoria/vínculos/janela/nota do corpo
  são ignorados; contrato só é vinculado após validação canônica em
  `crm_contracts`, com quem verificou, quando e a situação observada gravados;
  negócio + evento + `audit_log` na mesma transação, falha da auditoria devolve
  503 com rollback.
- "Perde acesso ao término" é derivação determinística de `access_end`
  (`vigente`/`nao_iniciado`/`expirado`/`revogado`), nunca marcação manual; a API
  recusa criar janela já vencida e encerrar o terceiro revoga as janelas vivas
  na mesma transação, com autor e motivo. Vencimento de documento é derivado só
  da data registrada; "a vencer" só existe com regra explícita, caso contrário a
  resposta declara `sem_regra_de_antecedencia`. Toda resposta derivada carrega
  fonte e data-base.
- Rotas legadas de terceiros: leitura pela mesma autorização, com fonte
  declarada e **preservando a chave `items`** que os leitores legados usavam
  (mais `canonical` apontando a rota nova); mutação aposentada com
  `410 legacy_route_retired`. Handlers de terceiros removidos de `ext-api.mjs`
  (383 → 304 linhas); o componente órfão de `/admin/ti` segue órfão e não foi
  promovido.
- UI real `/admin/terceiros`: carregamento, vazio declarado, erro com retry e
  confirmação somente após resposta real; chave de idempotência preservada em
  falha; verificador de autorização por escopo, dossiê completo e banner da
  fronteira externa declarada. Documento é registro de metadados sintéticos
  (sem upload real, declarado na tela).

Validações: estático 5/5 (001–148, guarda de manifesto e `latestMigration`
atualizados juntos com a migração), typecheck OK, teste dedicado
`tests/ext02-third-parties.test.mjs` 50/50 (registrado em `test:unit`),
`npm test` 315/315, build 87 páginas com `/admin/terceiros` listada,
`npm run test:migrations:pg` 148/148 (dois passes, replay, checksum negativo
rejeitado, clone com 539 tabelas) e — diferente da fatia anterior — um **gate
dedicado de jornada**: `npm run test:ext02-third-parties:pg` **22/22**, por HTTP
real contra PostgreSQL real descartável, com o servidor de verdade e sessão
staff canônica, provando no banco a autoria derivada, o 409 de idempotência, o
**503 com rollback sob auditoria derrubada**, o escopo autorizado, a perda de
acesso ao término, a revogação e as travas de imutabilidade. `npm run
test:l08-delivery:pg` 51/51 e `npm run test:demo-local:pg` OK aplicam 001–148,
mas **não** cobrem a jornada EXT-02 e não são apresentados como prova dela.

Classificação: implementação local + validação automática rápida + gate HTTP/DB
dedicado de EXT-02. Bateria pesada integral, cascata completa, aplicação em
destino, aceite humano e Windows permanecem pendentes; o aceite Marcelo/Andreia
preservado é somente L07. CLI-01..15 e EXT-01 preservadas; EXT-03..17 e órfãos
continuam não promovidos. Relatório:
[EXT-02](ENTREGA-RELATORIO-2026-10-03-EXT02-TERCEIROS.md).

## EXT-01 frota — 03/10/2026

Fatia partindo da `main` oficial em `3353b2f` (merge da PR #95, confirmado
MERGED no remoto antes de editar; divergência 0/0). Promove somente **EXT-01**:
frota com veículo, responsável, abastecimento, manutenção, documentos e custo,
com histórico/custo por veículo e alerta de manutenção, ligada ao backend
canônico real (tabelas `ext_fleet_*` da 085 + jornada da 147).

A condição do plano é **"se frota própria existir"**: sem registro canônico, a
listagem e a tela declaram a ausência (`fleet_registered: false`); nenhum
veículo, custo ou histórico é inventado ou estimado.

- Migração aditiva única: `147-ext01-fleet-canonical-journey.sql` (001–146
  imutáveis; próxima livre 148): origem da jornada no veículo, histórico
  imutável de responsável, regra explícita de alerta de manutenção (uma ativa
  por veículo), eventos imutáveis com ledger de idempotência por identidade
  staff, desativação declarada de documento e triggers de imutabilidade nos
  históricos. Constraints novas com `NOT VALID`; sem autoria retroativa.
- API canônica `src/server/ext-fleet-api.mjs` em `/api/ext/fleet/*`: papéis
  admin/marcelo/ti; anônimo 401 e papel não autorizado 403 antes de qualquer
  consulta; same-origin e `Idempotency-Key` em toda mutação (replay idêntico
  devolve o mesmo registro; reuso divergente 409); autoria derivada da sessão
  e vínculo derivado da URL — IDs/autoria/vínculos do corpo são ignorados;
  negócio + evento + `audit_log` na mesma transação, falha da auditoria
  devolve 503 com rollback; quilometragem não regride; datas futuras recusadas.
- Histórico/custo por veículo somente de registros canônicos, com fonte e
  data-base declaradas; alerta derivado exclusivamente de regra registrada
  (`sem_regra`/`sem_base` declarados; `em_dia`/`alerta`/`vencida` com a
  derivação exposta).
- Rotas legadas `/api/ext/fleet-*`: leitura pela mesma autorização com fonte
  declarada; mutação aposentada com `410 legacy_route_retired`. Handlers de
  frota removidos de `ext-api.mjs`; o componente órfão de `/admin/ti` segue
  órfão e não foi promovido.
- UI real `/admin/frota`: carregamento, vazio declarado, erro com retry e
  confirmação somente após resposta real; chave de idempotência preservada em
  falha. Documento é registro de metadados sintéticos (sem upload real,
  declarado na tela).

Validações: estático 5/5 (001–147, guarda de manifesto e `latestMigration`
atualizados juntos com a migração), typecheck OK, teste dedicado
`tests/ext01-fleet.test.mjs` 20/20 (registrado em `test:unit`), `npm test`
265/265, build 86 páginas com `/admin/frota` listada,
`npm run test:migrations:pg` 147/147 (dois passes, replay, checksum negativo
rejeitado, clone com 535 tabelas), `npm run test:l08-delivery:pg` 51/51
(aplica 001–147; cobre CLI-01..05, **não** a jornada EXT-01 — não é
apresentado como prova dela) e `npm run test:demo-local:pg` OK.

Classificação: implementação local + validação automática rápida. Bateria
pesada específica de EXT-01, cascata completa, aplicação em destino, aceite
humano e Windows permanecem pendentes; o aceite Marcelo/Andreia preservado é
somente L07. CLI-01..15 preservadas; EXT-02..17 e órfãos continuam não
promovidos. Relatório:
[EXT-01](ENTREGA-RELATORIO-2026-10-03-EXT01-FROTA.md).

## EXT-06 — satisfação/carteira

**Fonte canônica:** `cli_satisfaction_surveys`/`cli_satisfaction_action_plans`, endurecida pela 152. `ext_satisfaction_surveys` é legado somente leitura; nenhum registro foi migrado por presunção. Pesquisa declara finalidade, metodologia, escala, fonte, período, destinatário e limiar próprio. NPS exige 0–10; CSAT exige 1–5; genérica não recebe esses rótulos. Resposta cria histórico imutável e, quando `score <= follow_up_threshold`, acompanhamento único na mesma transação ou pendência explícita sem responsável inventado. A projeção cliente exclui dados internos. Critério automatizado: **Resposta gera acompanhamento sem expor funcionário**.

## EXT-07 — Compliance corporativo
Jornada canônica `/admin/compliance`, API `/api/ext/compliance/*`, obrigação aplicável, responsável staff, validade, referência privada e tarefa de vencimento dedicada. Migração 153 aditiva; documentos 086 permanecem legados. Sem ator externo e sem alegação de upload/armazenamento verificado.

## EXT-07 hardening — 2026-10-03
A base confirmada é a main pós-PR #103. A migração 154 é aditiva: impõe privacidade, validade, tarefas fail-closed e vínculo de renovação. A prova de arquivo armazenado, checksum, malware scan ou download não é declarada; `declared_reference` é apenas referência documental. O gate dedicado deve usar PostgreSQL 17 descartável, HTTP real e dados sintéticos `.invalid`.

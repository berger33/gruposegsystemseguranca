# Estado da execução — entrega local integral

## Estado vigente — PLAT-01 despacho HTTP à prova de rejeição assíncrona (2026-10-03)

Base `main` `8c4d71a46215c0d775c4a7880a6e95bc01b9ea00` (merge da PR #115 / EXT-07 migração 155), branch `arena/01a104ae-gruposegsystemseguranca`, divergência inicial 0/0 e árvore limpa. **Nenhuma migração nova**: 001–155 intocadas, próxima livre segue 156.

Executa a pendência de plataforma declarada no relatório da 155. `routeApi` despachava 677 handlers com `try { return handler(req,res) } catch`, que não aguarda a promise: a rejeição escapava do `catch`, a requisição ficava sem resposta, o `finally` registrava 200/0 ms/erro nulo e — por não existir listener de `unhandledRejection` em lugar nenhum do código — o processo era **encerrado pelo Node**. Probe sintético (apagado) mediu: `/async-reject` sem resposta com `exit 1` do processo, contra HTTP 500 em 13 ms depois da correção; `/reject-apos-headers` pendurado 2505 ms contra 13 ms.

Correção em `src/server/route-dispatch.mjs` (módulo autocontido, sem banco/rede/Next): `dispatchGuarded` aguarda o corpo de rotas e devolve desfecho estruturado; 500 fail-closed com corpo mínimo que não vaza mensagem, stack, SQL ou tabela; resposta parcial é encerrada via `destroySoon`; **resposta íntegra que falha depois do `end` não tem o socket tocado** (destruí-lo truncaria bytes em buffer — há teste HTTP real com ~360 KB). O callback de `createServer` também foi embrulhado, protegendo `resolveRedirect` e o handler do Next, e `installProcessSafetyNet()` registra `unhandledRejection` sem derrubar o servidor, preservando a falha rápida em `uncaughtException`. Nenhum contrato de API mudou.

Validação (bateria **integral**, consolidada em PDF e ledger JSON versionados): npm ci 0 vulnerabilidades; wave 0 5/5 (001–155); typecheck; focal PLAT-01 25/25; focal EXT-07 19/19; `npm test` 494/494 zero skip/todo; build 92 páginas com `/admin/compliance`; `test:migrations:pg` 155/155 ×2 + clone negativo rejeitado; gates HTTP/PG de regressão EXT-07 37/37, EXT-06 36/36, EXT-05 33/33 e EXT-04 28/28; `git diff --check` limpo. A guarda estática foi provada por mutação: removido o `await`, ela reprova; restaurado por checksum, volta a 7/7. Novo `npm run qa:evidence` e workflow `plat01-dispatch.yml`. Agendamento da avaliação temporal do EXT-07, aplicação em destino, aceite humano e Windows seguem pendentes. [Relatório](ENTREGA-RELATORIO-2026-10-03-PLAT01-DESPACHO-HTTP.md).

## Estado vigente — EXT-05 qualidade com gate HTTP/DB dedicado (2026-10-03)

Base `main` `ba2202ff6655f425edf405afc42de7ce3786a2a0` (PR #99 MERGED), branch `arena/01a10335-gruposegsystemseguranca`, divergência inicial 0/0 e árvore limpa. Quinta fatia EXT: `/admin/qualidade`, `/api/ext/quality/*`, migração aditiva 151; 001–150 imutáveis, próxima livre 152.

Jornada exclusivamente staff admin/marcelo/ti, sem ator externo inventado. Causa, ação, verificação, fechamento, reabertura e reincidência são históricos canônicos. API e banco impõem estados e **“Encerrar apenas com evidência e responsável”**; evidência é referência declarada, não upload/armazenamento. Idempotência por identidade, evento imutável e `audit_log` estão no mesmo commit; falha de auditoria retorna 503 e rollback. Legado preserva leitura `items` e mutação 410 após 401/403/same-origin. `ExtClient.tsx` foi preservado.

Validação: npm ci; sintaxe; estático 5/5 (001–151); typecheck; focal 6/6; suíte 430/430; build 90 páginas; migrations 151/151 ×2 + negativo + clone; gate dedicado EXT-05 **33/33**, zero skip/todo. Primeira execução do gate expôs allowlist ausente (27/33 falharam em 404), corrigida e repetida integralmente. Demais gates não cobrem EXT-05; bateria pesada não executada. Destino, aceite humano e Windows pendentes; Marcelo/Andreia somente L07. [Relatório](ENTREGA-RELATORIO-2026-10-03-EXT05-QUALIDADE.md).

## Estado vigente — EXT-04 fornecedores internos com gate HTTP/DB dedicado (2026-10-03)

Base oficial `main` `5abc199a7694c5bc0f508ac13cb2569a515a034d` (PR #98 / EXT-03 mesclada por decisão expressa do proprietário nesta sessão), divergência 0/0 antes da implementação. Branch `arena/01a10305-gruposegsystemseguranca`. Quarta fatia EXT: tela real `/admin/fornecedores`, API `/api/ext/supplier/*` e migração aditiva 150; 001–149 imutáveis, próxima livre 151.

A condição *"se volume justificar"* foi avaliada, não presumida. `PLANO-MESTRE-IMPLEMENTACAO.md:423` declara a condição; `AUDITORIA-TERRENO-L08.md:85` registra somente tabela/handler e ausência de prova do fornecedor restrito; não existe medição, meta ou histórico de volume. Veredito em API/tela/docs: **`sem_evidencia`**. Um cluster limpo apresentou zero registros, o que prova ausência de seed e não volume real. Confirmação do proprietário continua pendente.

A entrega é exclusivamente interna de staff admin/marcelo/ti. Não existe ator fornecedor canônico (identidade/login/sessão/grant/canal), upload ou aceite; `external_actor_boundary` declara tudo como falso e situação pendente. Logo "fornecedor não vê concorrente/RH" não é apresentado como aceite ponta a ponta. `file_url`/`storage_key` são referências declaradas.

Cotações usam fornecedor/produto canônicos, validade com fonte e situação derivada, alerta só com regra explícita, decisão com autor/data/justificativa imutável, documento versionado sob lock e pedido inteiramente derivado da cotação aprovada, com prazo/fonte e máquina de estados. Autoria vem da sessão; IDs/vínculos vêm da URL ou registro; corpo forjado é ignorado. 401/403 distintos, same-origin, UUID e `Idempotency-Key`; negócio + evento + `audit_log` na mesma transação, 503/rollback se auditoria falhar. Rotas legadas preservam `items` em leitura e devolvem 410 em mutação após guardas.

Validação: `npm ci`; estático 5/5 (001–150, os três pontos da guarda atualizados juntos); typecheck; teste focal 42/42; `npm test` 424/424 com zero pulados; build 89 páginas com `/admin/fornecedores`; `test:migrations:pg` 150/150 ×2 com checksum negativo rejeitado; **`test:ext04-suppliers:pg` 28/28**, zero skip/todo, HTTP real contra PostgreSQL real e workflow próprio `.github/workflows/ext04-delivery.yml`. Os demais gates não cobrem EXT-04 e não foram usados como prova. Não houve cascata/bateria pesada integral nesta fatia.

Bateria pesada integral, aplicação em destino, confirmação de volume, ator externo, aceite humano e Windows seguem pendentes. O aceite de Marcelo/Andreia permanece somente L07. CLI-01..15 e EXT-01..03 preservadas; EXT-05..17 pendentes; os seis gates sem workflow permanecem pendentes. O órfão `ExtClient.tsx` continua não promovido. Relatório: [EXT-04](ENTREGA-RELATORIO-2026-10-03-EXT04-FORNECEDORES.md); lote: [ENTREGA-EXT](ENTREGA-EXT.md).

## Estado vigente — EXT-03 licitações entregue com gate HTTP/DB dedicado (2026-10-03)

Base oficial `main` `4518b3f0a7e2c8e900e135a656f8b73b2fa5dfaa` (PR #97 MERGED), divergência inicial 0/0 confirmada antes de editar. Branch `arena/01a1026a-gruposegsystemseguranca`. Terceira fatia do lote EXT: EXT-03 promove licitações de API/tabela/órfão para jornada funcional — `/admin/licitacoes` e `/api/ext/bidding/*` sobre as tabelas `ext_bidding_*` da 085, com a jornada canônica da migração aditiva 149 (001–148 imutáveis; próxima livre 150).

Condição do plano avaliada e declarada: EXT-03 vale "se mercado relevante". A única evidência é `docs/referencias-marca.md` (linha 20), que cita "órgãos públicos" entre os segmentos do **site atual**, dentro da seção "confirmar antes da nova publicação" (linha 12); não há edital, contrato público nem registro de participação no repositório. Veredito: **relevância indicada e NÃO confirmada pelo proprietário**. A jornada foi construída e a condição é declarada em API, tela e docs (`market_relevance.situacao = "indicada_nao_confirmada"`), sem semear dado algum e sem afirmar que a empresa participa de licitações.

O critério é imposto por registro canônico em dois níveis: proposta versionada pelo servidor e recusada pelo próprio PostgreSQL se posterior ao prazo registrado; prazo com fonte declarada, um vigente por tipo, substituível só por novo registro; resultado exigindo edital encerrado, autor, data e justificativa, imutável depois; estado terminal final (homologado não reabre, nem por API nem por banco); responsável como identidade canônica de equipe com papel copiado no ato; checklist derivado dos documentos ativos; alerta só com regra de antecedência registrada. Autoria da sessão, vínculo da URL, UUID validado no servidor; same-origin e `Idempotency-Key` em toda mutação; negócio + evento + `audit_log` na mesma transação com 503 e rollback. Rotas legadas: leitura autorizada com `items` preservado, mutação 410 depois das guardas. **Fronteira:** nenhum portal público de compras integrado, nenhuma importação de edital, nenhum envio de proposta a órgão, nenhum upload real de arquivo.

Validação: `npm ci`, estático 5/5 (001–149; guarda de manifesto de `migrate-site-visual.mjs` e `latestMigration` de `qa-wave0-static.mjs` atualizados juntos com a migração), typecheck, teste dedicado EXT-03 67/67 (`tests/ext03-biddings.test.mjs`, registrado em `test:unit`), `npm test` integral 382/382 com 0 pulados e build 88 páginas com `/admin/licitacoes` listada. `npm run test:migrations:pg` 149/149 em dois passes (replay, checksum negativo rejeitado, clone 545 tabelas). **`npm run test:ext03-biddings:pg` 26/26** — gate novo e dedicado desta jornada, por HTTP real contra PostgreSQL real descartável, com servidor de verdade e sessão staff canônica (`scripts/qa-ext03-biddings-postgres.mjs` + `tests/ext03-biddings.integration.test.mjs`, na CI em `.github/workflows/ext03-delivery.yml`). Esse gate reprovou **22/26 na primeira execução** e expôs um defeito real (comparação entre enum e `text` em gatilho, que derrubava toda atualização de edital em 503), corrigido e re-provado sem enfraquecer asserção. Os demais gates do repositório aplicam 001–149 e preservam CLI-01..15/EXT-01/EXT-02, mas **não** cobrem a jornada EXT-03 e não são apresentados como prova dela.

Cascata de regressão com os 17 gates do repositório executada em PostgreSQL descartável: **14 PASS**, incluindo `ext03` 26/26 e **`ext02` 22/22 sob a 149** (EXT-02 não regrediu). Três não-PASS, **nenhum vindo de EXT-03**: `cli-v2:pg` reproduz falha idêntica no commit base (pré-existente na `main`), `backup-restore:pg` recusa o ambiente por falta de `pg_dump` 17 (nenhum banco criado) e `l05-delivery:pg` esgotou a janela fixa de 45 s de arranque do servidor logo após o `l04` (195 s na mesma máquina) — repetido integral e isolado **duas vezes, passou nas duas** (servidor em 11,7 s), sem aumentar timeout e sem mascarar. Seis gates seguem sem cobertura de CI — achado registrado para decisão do proprietário, fora do escopo desta fatia.

Bateria pesada integral homologada, aplicação em destino, aceite humano e Windows continuam pendentes, assim como a confirmação do mercado de licitações pelo proprietário. Aceite anterior de Marcelo e Andreia permanece somente no L07; não houve aceite novo. CLI-01..15, EXT-01 e EXT-02 preservadas sem reabertura; EXT-04..17 pendentes. Relatório: [EXT-03](ENTREGA-RELATORIO-2026-10-03-EXT03-LICITACOES.md); lote: [ENTREGA-EXT](ENTREGA-EXT.md).

## Estado anterior — EXT-02 terceiros entregue com gate HTTP/DB dedicado (2026-10-03)

Base oficial `main` `48aa7a43251a8b5affcb6627b0096c14cf15aa3a` (PR #96 MERGED), divergência inicial 0/0 confirmada antes de editar. Branch `arena/01a1026a-gruposegsystemseguranca`. Segunda fatia do lote EXT: EXT-02 promove terceiros de API/tabela/órfão para jornada funcional — `/admin/terceiros` e `/api/ext/third-party/*` sobre as tabelas `ext_third_part*` da 085, com a jornada canônica da migração aditiva 148 (001–147 imutáveis; próxima livre 149).

Critério do plano imposto: **"terceiro acessa só OS/contrato autorizado e perde acesso ao término"**. A janela deixa de ser campo livre em `ext_third_parties` (as colunas `access_start`/`access_end` ficam marcadas LEGADO por COMMENT e nenhuma derivação as lê) e passa a viver em `ext_third_party_access_grants`, presa a um único escopo autorizado, com término obrigatório e revogação declarada. A vigência é derivada; o banco recusa esticar o término, trocar o escopo, reabrir ou apagar a janela. Encerrar o terceiro revoga as janelas vivas na mesma transação.

**Fronteira declarada:** não existe ator externo "terceiro" autenticado; nenhuma sessão, login ou canal externo foi criado ou simulado. O acesso do próprio terceiro permanece pendente e é declarado pela API (`external_actor_boundary`) e pela tela. As sessões canônicas seguem três: `auth_staff_sessions`, `auth_sessions` e `auth_employee_sessions`.

Validação: `npm ci`, estático 5/5 (001–148; guarda de manifesto de `migrate-site-visual.mjs` e `latestMigration` de `qa-wave0-static.mjs` atualizados juntos com a migração), typecheck, teste dedicado EXT-02 50/50 (`tests/ext02-third-parties.test.mjs`, registrado em `test:unit`), `npm test` integral 315/315 e build 87 páginas com `/admin/terceiros` listada. `npm run test:migrations:pg` 148/148 em dois passes (replay, checksum negativo rejeitado, clone 539 tabelas). **`npm run test:ext02-third-parties:pg` 22/22** — gate novo e dedicado desta jornada, por HTTP real contra PostgreSQL real descartável, com servidor de verdade e sessão staff canônica (`scripts/qa-ext02-third-parties-postgres.mjs` + `tests/ext02-third-parties.integration.test.mjs`, na CI em `.github/workflows/ext02-delivery.yml`). `npm run test:l08-delivery:pg` 51/51 e `npm run test:demo-local:pg` OK aplicam 001–148 e preservam CLI-01..05, mas **não** cobrem a jornada EXT-02 e não são apresentados como prova dela.

Cascata de regressão com os 16 gates do repositório executada em PostgreSQL descartável: 13 PASS (incluindo `l07` 43/43, `l08` 51/51, `l04` 20/20 e `ext02` 22/22). Os três não-PASS foram classificados com prova e **nenhum vem de EXT-02**: `cli-v2:pg` reproduz falha idêntica no commit base `48aa7a4` (pré-existente na `main`), `backup-restore:pg` recusa o ambiente por falta de `pg_dump` 17 (nenhum banco criado) e `l06-delivery:pg` é flake de timing do Chromium reproduzido também na base, repetido integral sem mascarar. Seis gates seguem sem cobertura de CI — achado registrado para decisão do proprietário, fora do escopo desta fatia.

Bateria pesada integral homologada, aplicação em destino, aceite humano e Windows continuam pendentes. Aceite anterior de Marcelo e Andreia permanece somente no L07; não houve aceite novo. CLI-01..15 e EXT-01 preservadas sem reabertura; EXT-03..17 pendentes. Relatório: [EXT-02](ENTREGA-RELATORIO-2026-10-03-EXT02-TERCEIROS.md); lote: [ENTREGA-EXT](ENTREGA-EXT.md).

## Estado anterior — EXT-01 frota entregue com validação rápida (2026-10-03)

Base oficial `main` `3353b2f013b7c51e74e50460ce62c1fa243c460f` (PR #95 MERGED), divergência inicial 0/0. Branch `arena/01a1023b-gruposegsystemseguranca`. Primeira fatia do lote EXT: EXT-01 promove a frota de API/tabela/órfão para jornada funcional — `/admin/frota` e `/api/ext/fleet/*` sobre as tabelas `ext_fleet_*` da 085, com a jornada canônica da migração aditiva 147 (001–146 imutáveis; próxima livre 148). A condição do plano é "se frota própria existir": sem registro canônico, a tela e a API declaram a ausência; nenhum veículo, custo ou histórico é inventado.

Papéis autorizados admin/marcelo/ti gerenciam veículos, responsável (histórico imutável), abastecimentos, manutenções, documentos (com desativação declarada) e regras de alerta; anônimo 401 e papel não autorizado 403 antes de qualquer consulta. Autoria derivada da sessão, vínculo derivado da URL; IDs/autoria/vínculos do corpo são ignorados. Toda mutação exige same-origin e `Idempotency-Key` (ledger em `ext_fleet_vehicle_events`): replay idêntico devolve o mesmo registro, reuso divergente 409. Negócio + evento imutável + `audit_log` na mesma transação; falha da auditoria devolve 503 com rollback. Histórico/custo por veículo soma apenas registros canônicos, com fonte e data-base declaradas; o alerta de manutenção deriva exclusivamente de regra explícita registrada (`sem_regra`/`sem_base` declarados, `em_dia`/`alerta`/`vencida` com derivação exposta). Quilometragem canônica não regride; datas futuras são recusadas; logs têm triggers de imutabilidade. Rotas legadas `/api/ext/fleet-*`: leitura com a mesma autorização e fonte declarada, mutação aposentada com 410; os handlers antigos saíram de `ext-api.mjs` e o órfão de `/admin/ti` segue não promovido.

Validação rápida: `npm ci`, estático 5/5 (001–147; guarda de manifesto de `migrate-site-visual.mjs` e `latestMigration` de `qa-wave0-static.mjs` atualizados juntos com a migração), typecheck, teste dedicado EXT-01 20/20 (`tests/ext01-fleet.test.mjs`, registrado em `test:unit`), `npm test` integral 265/265 e build 86 páginas com `/admin/frota` listada. `npm run test:migrations:pg` 147/147 em dois passes (replay, checksum negativo rejeitado, clone 535 tabelas). `npm run test:l08-delivery:pg` 51/51 aplica 001–147 e preserva CLI-01..05; esse gate não cobre a jornada EXT-01 e não é apresentado como prova dela. `npm run test:demo-local:pg` OK. Bateria pesada específica de EXT-01, cascata completa, aplicação em destino, aceite humano e Windows continuam pendentes. Aceite anterior de Marcelo e Andreia permanece somente no L07; não houve aceite novo. CLI-01..15 preservadas (CLI-15 não reaberta); EXT-02..17 pendentes. Relatório: [EXT-01](ENTREGA-RELATORIO-2026-10-03-EXT01-FROTA.md); lote: [ENTREGA-EXT](ENTREGA-EXT.md).

## Estado anterior — L08/CLI-15 entregue com validação rápida (2026-10-03)

Base oficial `main` `1d41160366266ab57a07b82f2b1a3e346e8bd528` (PR #94 MERGED), divergência inicial 0/0. Branch `arena/01a101d4-gruposegsystemseguranca`. CLI-15 promove a reclamação sobre colaborador em canal restrito: jornada cliente real em `/cliente/app/reclamacoes-colaborador` e `/api/client/employee-complaints` sob sessão de cliente canônica, sobre as tabelas da 093 (`cli_employee_complaints`, histórico imutável e `cli_employee_complaint_hr_shares`). Migração aditiva 146; 001–145 imutáveis; próxima livre 147.

Autoria, identidade, conta, UUIDs e protocolo são derivados/validados no servidor; o corpo do navegador nunca vincula. Cliente A não lista, consulta nem infere reclamações de B: fora do escopo responde 403 genérico idêntico ao inexistente, com `authorization_denied` auditado. O RH recebe somente o envelope mínimo justificado (protocolo, categoria, severidade, situação), registrado campo a campo na mesma transação; descrição, conta e identidade do cliente não são repassadas. Abertura + histórico + envelope RH + `auth_access_audit` são transacionais; falha da auditoria devolve 503 com rollback; retry idêntico não duplica e chave reutilizada com conteúdo divergente devolve 409. A rota administrativa legada não é atalho: cookie de cliente não produz sessão staff, papéis staff não autorizados recebem 403 `forbidden_restricted_channel` e o RH só vê a projeção mínima de reclamações compartilhadas.

Validação rápida: `npm ci`, estático 5/5 (001–146), typecheck, teste dedicado CLI-15 15/15, `npm test` integral 245/245 e build 85 páginas com `/cliente/app/reclamacoes-colaborador` listada. `npm run test:l08-delivery:pg` 51/51 em PostgreSQL descartável aplica 001–146 e preserva CLI-01..05; esse gate não cobre a jornada CLI-15 e não é apresentado como prova dela. Bateria pesada específica de CLI-15, cascata L03..L08, aplicação em destino, aceite humano e Windows continuam pendentes. Aceite anterior de Marcelo e Andreia permanece somente no L07; não houve aceite novo. Relatório: [CLI-15](ENTREGA-L08-RELATORIO-2026-10-03-CLI15-RECLAMACAO.md).

## Estado anterior — L08/CLI-14 entregue com validação rápida (2026-10-03)

Base oficial `main` `508daad55cf239113337b6ed7b33a04d356a66cc` (PR #93 MERGED), divergência inicial 0/0. Branch `arena/01a1008a-gruposegsystemseguranca`. CLI-14 promove segurança da conta no backend canônico: `auth_mfa`, `auth_sessions`, `auth_email_change`, `auth_identities` e `auth_access_audit`; tabelas v2 não são fonte de autenticação. Migração aditiva 145; 001–144 imutáveis; próxima livre 146.

MFA TOTP cifrado, códigos de recuperação protegidos, reautenticação, sessões da própria identidade com revogação imediata e troca de e-mail com token hash de 24 horas, colisão protegida, revogação/rotação de sessões e auditoria transacional. Falha da auditoria retorna 503 e reverte. UI real em `/cliente/app/seguranca` cobre carregamento, erro/retry, MFA, sessões e troca sem sucesso prematuro.

Validação rápida: `npm ci`, estático 5/5 (001–145), typecheck, teste dedicado CLI-14 4/4 e rotas 9/9. `npm test` integral 230/230 e build 84 páginas. Bateria pesada CLI-14, cascata L03..L08, aplicação em destino, aceite humano e Windows continuam pendentes. Aceite anterior de Marcelo e Andreia permanece somente no L07; não houve aceite novo. Próximo CLI-15. Relatório: [CLI-14](ENTREGA-L08-RELATORIO-2026-10-03-CLI14-SEGURANCA.md).


Base oficial `fa75e32` (PR #92 MERGED, divergência inicial 0/0); branch
`arena/01a10074-gruposegsystemseguranca`. CLI-13 promove a configuração real
dos três modos, solicitação pública pendente com vínculo conta/documento
verificado no servidor e revisão admin/ti. Aprovação cria somente convite 003;
identidade, sessão, grant e contrato não são criados. Migração aditiva 144;
001–143 imutáveis; próxima livre 145.

Baseline: npm ci, estático 5/5 (001–143), typecheck, 215/215 e build 84.
Resultado: estático 5/5 (001–144), typecheck, teste dedicado 11/11, npm test
226/226 e build 84. Gate pesado PostgreSQL/HTTP/Chromium, cascata L03..L08,
aplicação em destino, aceite humano e Windows pendentes. Próximo: CLI-14,
depois CLI-15. Relatório: [CLI-13](ENTREGA-L08-RELATORIO-2026-10-03-CLI13-ACESSO.md).


## Estado vigente — L08/CLI-12 entregue com validação rápida (2026-10-03)

Base oficial: `main` em `5cff301` (merge da PR #91, confirmada mergeada no
remoto antes de editar; divergência 0/0 da branch nova contra `origin/main`).
Branch desta sessão: `arena/01a10062-gruposegsystemseguranca`. Continuidade
retomada exatamente onde CLI-11 parou: a fatia promove **somente CLI-12**
(renovação e comunicação contratual com registro, sem bloquear
indiscriminadamente o portal por inadimplência), com tela real
`/cliente/app/renovacao`, rota `/api/client/renewal-communications` sob sessão
de cliente e migração aditiva **143** (001–142 imutáveis; próxima livre: 144).

O cliente lê somente comunicações registradas, dirigidas à própria conta e com
envio local registrado; registra ciência/interesse/pedido de contato com
autoria da sessão, idempotência por identidade (chave + fingerprint; reuso
divergente 409) e histórico imutável, na mesma transação da auditoria
canônica. Provado por teste que inadimplência em `cli_charges_v2` não participa
de nenhuma decisão de acesso (CLI-12 e também as leituras CLI-10/CLI-11);
restrição só por `encerramento` bloqueante com `block_reason`, declarada com
motivo e origem. Vencimentos só de `client_contracts.ends_on` e
`crm_renewals.renewal_date`, com fonte e data-base; ausência declarada. A rota
administrativa legada foi preservada sem mudança de contrato.

Por decisão explícita do proprietário, **os testes pesados ficam para depois da
entrega do sistema**: nesta sessão não foram executados gates L03..L08 em
cascata, Chromium massivo nem PostgreSQL descartável em loop. Validação
executada: `npm ci` OK, estático **5/5 (001–143)**, typecheck OK, `npm test`
**215/215** (novo teste registrado em `test:unit`), build OK com **84 páginas**
e `tests/cli12-renewal-communications.test.mjs` **10/10**.

Estado declarado: CLI-12 passa a `pronto_local` **apenas na validação
automática rápida**; gate PostgreSQL/HTTP/Chromium, aplicação da migração 143
em destino, aceite humano e homologação Windows continuam pendentes.
CLI-13..15, EXT-01..17 e os 80 órfãos de `/admin/ti` continuam não promovidos.
Próximo passo real: CLI-13 (modos de acesso configuráveis; autocadastro nunca
libera contrato sozinho), depois CLI-14 e CLI-15; a bateria pesada e a
homologação Windows só entram no fechamento integral. Relatório:
[`ENTREGA-L08-RELATORIO-2026-10-03-CLI12-RENOVACAO.md`](ENTREGA-L08-RELATORIO-2026-10-03-CLI12-RENOVACAO.md).


## Estado anterior — L08/CLI-11 entregue com validação rápida (2026-10-03)

Base oficial: `main` em `1024b3b` (merge da PR #90). Branch desta sessão:
`arena/01a10049-gruposegsystemseguranca`. Continuidade retomada exatamente onde
CLI-10 parou: a fatia promove **somente CLI-11** (satisfação pós-atendimento e
periódica, plano de ação e risco de renovação baseado em fatos), com tela real
`/cliente/app/satisfacao`, rota `/api/client/satisfaction-surveys` sob sessão de
cliente e migração aditiva **142** (001–141 imutáveis; próxima livre: 143).

Por decisão explícita do proprietário, **os testes pesados ficam para depois da
entrega do sistema**: nesta sessão não foram executados gates L03..L08 em
cascata, Chromium massivo nem PostgreSQL descartável em loop. Validação
executada: `npm ci` OK, estático **5/5 (001–142)**, typecheck OK, `npm test`
**205/205**, build OK com **83 páginas** e `tests/cli11-satisfaction-portal.test.mjs`
**6/6**.

Estado declarado: CLI-11 passa a `pronto_local` **apenas na validação automática
rápida**; gate PostgreSQL/HTTP/Chromium, aceite humano e homologação Windows
continuam pendentes. CLI-12..15, EXT-01..17 e os 80 órfãos de `/admin/ti`
continuam não promovidos. Próximo passo real: CLI-12 (comunicação de renovação
no portal, sem bloqueio indiscriminado por inadimplência) e, após a entrega, a
bateria pesada completa. Relatório:
[`ENTREGA-L08-RELATORIO-2026-10-03-CLI11-SATISFACAO.md`](ENTREGA-L08-RELATORIO-2026-10-03-CLI11-SATISFACAO.md).


## Estado anterior — aceite humano registrado; Windows ainda bloqueia o L07 (2026-10-02)

Base oficial `main` em `ad01d7d` (merge da PR #76); branch `arena/01a0fdbd-gruposegsystemseguranca`. Após apresentação da [`MATRIZ-FECHAMENTO-L07.md`](MATRIZ-FECHAMENTO-L07.md) seção por seção, o proprietário declarou em **02/10/2026** que **Marcelo e Andreia aceitaram integralmente FIN-01..16 e ADM-01..12**. Esse aceite humano não substitui nem se confunde com a implementação e a validação automática já registradas.

O proprietário declarou também que **não houve validação Windows com evidência**. Assim, apesar do aceite dos 28 requisitos, o equipamento-alvo segue sem prova e o **L07 permanece em execução, não concluído**. Para os 80 órfãos de `/admin/ti`, a decisão foi **promover por área somente com prova**, conforme o critério do inventário; nenhuma prioridade entre áreas foi informada. Até a promoção, continuam protótipos e não contam como funcionalidade entregue.

Baseline antes de editar no SHA `ad01d7d`: estático 5/5, typecheck 0, unitários 196/196, migrações 138/138 em dois passes + clone/checksum negativo (524 tabelas). L07: 43/43; depois 42/43 por `SIGSEGV` do Chromium no lançamento do subteste 6; duas repetições imediatamente consecutivas 43/43 + 43/43. Regressão encadeada: L03 1/1; L04 18/20 por dois `SIGSEGV` no lançamento do Chromium e, na repetição integral, 20/20; L05 1/1; L06 9/9. Sem timeout maior, skip ou alteração de assertiva.

Como o L07 não fechou formalmente, o **L08 não foi iniciado**. Nenhum gate/workflow/migração L08 foi criado; apenas o terreno CLI-01..15/EXT-01..17 foi documentado em [`AUDITORIA-TERRENO-L08.md`](AUDITORIA-TERRENO-L08.md), sem promoção de estado. Validação final: estático 5/5, typecheck, unitários 196/196, build, migrações 138/138, L07 **43/43 + 43/43 consecutivos**, L03 1/1, L04 20/20, L05 1/1 e L06 encadeado 9/9. Duas execuções L07 intermediárias tiveram `SIGSEGV` do Chromium no lançamento (subtestes 12 e 32) e foram recuperadas sem alteração de teste/produto. Relatório: [`ENTREGA-L07-ACEITE-E-AUDITORIA-L08.md`](ENTREGA-L07-ACEITE-E-AUDITORIA-L08.md). Próximo passo real: validação Windows relatada com evidência; depois, e somente depois, fechamento formal L07 e início de CLI-01..05.

## Estado atual — L07: matriz e evidências fechadas; aceite humano pendente (2026-10-02)

Base oficial utilizada: `main` `bbcf311` (merge da PR #74, ADM-01..12). Branch Arena desta sessão: `arena/01a0fd4f-gruposegsystemseguranca`. A matriz de fechamento do L07 foi construída em [`docs/MATRIZ-FECHAMENTO-L07.md`](MATRIZ-FECHAMENTO-L07.md), ligando cada requisito FIN-01..16 e ADM-01..12 a tela/rota, API, tabelas canônicas, subtestes vigentes do gate de 43, resultado da última execução e pendência — conferida linha a linha contra o código e o corpo de cada subteste, sem texto "para parecer completo". O CHECKLIST ganhou o mapeamento por requisito; duas imprecisões documentais foram corrigidas (rótulo real da aba FIN-10 e a evidência vigente defasada em EVIDENCIAS); nenhuma lacuna funcional real foi encontrada (próxima migração segue 139).

Baseline reconfirmada antes de qualquer edição no SHA `bbcf311`: estático 5/5, typecheck 0, unitários 196/196, build exit 0, migrações 138/138 (2 passes + clone/checksum negativo), L07 **43/43 duas vezes consecutivas**, L03 1/1, L04 20/20, L05 1/1 e L06 encadeado **8/9** — o subteste 9 reprovou com `Carregando operação…`, a instabilidade de carga conhecida (as nomeadas do ponto de partida, L03 403 e L07-22, não reapareceram). Causa raiz investigada: o subteste 9 era o único do gate L06 que não esperava seletor de conteúdo (os subtestes 1–8 esperam, com timeout 30 s) e clicava/lia antes de o bootstrap do `OperacaoWorkspace` concluir sob carga. Correção **do teste**, no padrão do próprio arquivo: esperar `#posts-title` antes do clique e a seção alvo depois — **sem aumentar timeout, sem skip, assertiva final idêntica**. Validação no SHA entregue: estático 5/5, typecheck, 196/196, build, migrações 138/138, **L07 43/43 em duas execuções consecutivas**, L03 1/1, L04 20/20, L05 1/1 e **L06 9/9 encadeado** na mesma sequência que antes reprovava. Relatório: [ENTREGA-L07-MATRIZ-FECHAMENTO.md](ENTREGA-L07-MATRIZ-FECHAMENTO.md).

**Estado declarado:** FIN-01..16 e ADM-01..12 permanecem `pronto_local` apenas na validação automática; **aceite humano de Marcelo/Andreia pendente** (não inventado) e Windows não validado. Dívidas explícitas abertas: os **80 componentes órfãos de `/admin/ti`** (critério de saída em [INVENTARIO-ADMIN-TI.md](INVENTARIO-ADMIN-TI.md)) e o monitoramento das instabilidades residuais. **L07 não está concluído; L08 não foi iniciado.** Para declarar o L07 concluído: aceite humano, decisão sobre a dívida dos órfãos e instabilidades fechadas — depois disso, iniciar o L08 pela migração 139.

- Próximos três passos: aceite humano das 28 jornadas (roteiro na matriz); decisão sobre os 80 órfãos de `/admin/ti`; retomar execução com `npm ci`, estático, typecheck, `npm test`, migrações e L07 dupla antes de qualquer edição nova.
- PR desta sessão aberta para revisão, **sem merge**.

## Estado anterior — jornadas FIN-14/15/16 (2026-10-02)

Base oficial utilizada: `main` em `cc4da84`; branch Arena desta sessão. As jornadas UI FIN-14/15/16 foram implementadas com a migração aditiva 137 e gate L07 ampliado para 37 subtestes. FIN-14, FIN-15 e FIN-16 estão `pronto_local` na validação automática; aceite humano/Windows pendentes. FIN-10, FIN-13 e FIN-12→FIN-04 foram preservados sem reabertura. **L07 segue em execução; ADM-01..12 e L08 não foram iniciados.** Próximo recorte: [ADM-01..12, painel Marcelo](PROMPT-PROXIMA-SESSAO-L07-ADM01-12.md).


## Estado atual — L07 em execução; fatia FIN-10 + avaliação adaptativa #47/#53 concluída em 2026-10-02

**Base e escopo.** Base oficial: `main`/`origin/main` em `bd794dc99bfc12a7e8a811783bda1234aeb4fe6b` (merge da PR #69). Trabalho na branch Arena `arena/01a0fa9e-gruposegsystemseguranca`. Sem uso da cópia local do proprietário e sem nenhuma ligação com FIN-14/15/16, ADM-01..12 ou L08 nesta sessão.

**Mudança aditiva.** A migração `136-fin10-fin05-policy-history-locks.sql` preserva 001–135 e endurece: snapshot do limite de alçada aplicado (`fin_expenses.approval_limit_cents`, `fin_expense_history.authority_limit_cents`, sincronizados pelo state machine), `allow_self_approval` com segregação migrada do CHECK 079 para trigger auditável (a governança supre: só se autoapura quem tem política ativa+aprovada com flag), índice parcial de duplicidade natural pendente `fin_expenses_pending_natural_key`, trava estrita de exclusão `fin_expense_no_delete` e hardening FIN-05/#47 (FKs da conciliação em RESTRICT com NOT VALID + commit ad-hoc e CHECK `fin05_conciliation_requires_movement_and_one_account` na forma canônica). Manifest/migrador/QA estático passaram a exigir 001–136.

**O que foi demonstrado.** FIN-10 está `pronto_local`: lista/busca em nome, protocolo e referência de evidência; criação com valores em R$ (`Intl.NumberFormat('pt-BR')`), solicitante real derivado da sessão, categoria e evidência sintética obrigatórias; aprovado por identidade distinta via alçada ativa e `allow_self_approval=false` (padrão), sem aprovação automática, sem promessa de aprovação, sem inventar política; retry/idempotência sob concorrência devolve o mesmo registro (200) e não gera conflito falso; decisão exige motivo e grava histórico/persistência com snapshot; nenhuma decisão cria pagamento/baixa/cobrança/recebível/pagável. Escrita direta no banco em autoaprovação é bloqueada (`fin_expense_segregation`) e exclusão de despesa é bloqueada (`fin_expense_no_delete`). Falha de leitura mostra erro+retry (não mistura com lista vazia). FIN-05 recebeu as travas faltantes da #47 no formato auditável atual (garantidor movimento–conta e RESTRICT, provados por SQL direto).

**Validação automática nesta fatia.** Estático 5/5, typecheck sem erros, `npm test` 196/196, `npm run build` verde, `npm run test:migrations:pg` 136/136 em dois passes + clone/checksum negativo (522 tabelas), e `npm run test:l07-delivery:pg` **35/35 em duas execuções consecutivas sem skips** (PostgreSQL descartável, Next local, HTTP real, Chromium empacotado; subtestes novos 19–22 + reprovações negativas de autorização/auditoria já homologadas). Abertura de PR pequena revisável ao final, sem merge, aguardando autorização humana.

**Avaliação adaptativa de referências, sem cópia.** PR #47 e #53 foram analisadas como referência histórica; foi adotado apenas o que estava ausente/compatível na main (política de alçada sem política padrão, snapshot de limite, duplicidade natural, autor real derivado da sessão, trava de exclusão, garantia movimento–conta de conciliação). O restante (aprovador automático por faixa, telas paralelas, fluxos/migrações de gateway da #47) foi descartado com motivo. Registro completo em [`docs/CONSOLIDACAO-L07-PRS-PENDENTES.md`](./CONSOLIDACAO-L07-PRS-PENDENTES.md).

- Próximos três passos: jornadas UI FIN-14/15/16; painel funcional `/admin/marcelo` com inventário/destino da dívida dos componentes órfãos de `/admin/ti`; aceite humano/execução Windows pendentes (nenhuma nova funcionalidade iniciada aqui).
- Retomada: `npm ci`; `node scripts/qa-wave0-static.mjs`; `npm run typecheck`; `npm test`; `npm run test:migrations:pg`; `npm run test:l07-delivery:pg`.

## Estado anterior — L07 em execução; revalidação FIN-09/FIN-11/FIN-12 e ligação FIN-12 → FIN-04 concluídas em 2026-10-02

**Base e escopo.** Base oficial atual: `main`/`origin/main` em `ffdf7fbb49832abe30930c355b3085d190a7861e` (merge da PR #68). Trabalho nesta branch Arena: `arena/01a0fa11-gruposegsystemseguranca`. Esta é a primeira fatia depois da integração da PR #68: revalida FIN-09, FIN-11 e FIN-12, e fecha o vínculo canônico entre conciliação sintética de gateway (FIN-12) e baixa/estorno de recebível (FIN-04). Não houve uso da cópia local do proprietário, merge, publicação ou chamada externa.

**Mudança aditiva.** A migração `135-fin09-fin12-revalidation-hardening.sql` preserva 001–134 e endurece: (a) FIN-09 não aceita `margin_percent` legado quando a margem calculada canônica é nula/incompleta; (b) o vínculo entre cobrança, webhook, pagamento e recebível; e (c) a integridade da baixa e do estorno reversor de gateway. O manifest e a verificação estática agora exigem 001–135.

**O que foi demonstrado.** FIN-09 mantém receita/custos conhecidos e declara base de margem incompleta, sem exibir zero ou percentual inventado; a UI mostra erro de leitura e oferece retry. FIN-11 separa provedor e obrigação determinada pela regra de atividade, registra somente documento sandbox sintético e também mostra/retry de falha de leitura. FIN-12 aceita cobrança apenas em gateway selecionado e homologado em sandbox, verifica HMAC no servidor, rejeita payload divergente e replay; uma conciliação válida cria a baixa FIN-04 (`fin_payments` + histórico), atualiza o saldo/status do recebível e, no estorno, cria pagamento reversor ligado ao original e devolve o recebível a `pendente` quando integralmente revertido. Tudo ocorre na mesma transação de domínio/auditoria e não cria efeito financeiro externo.

**Validação automática concluída nesta fatia.** `node scripts/qa-wave0-static.mjs` 5/5, `npm run typecheck` sem erros, `npm test` 196/196, `npm run build` (78 páginas) e `npm run test:migrations:pg` 135/135 em dois passes, clone/checksum negativo restaurado (522 tabelas), e `npm run test:l07-delivery:pg` 31/31, com PostgreSQL descartável, HTTP real, sessão/cookie real, Next local e Chromium empacotado. O gate inclui negativos de autorização/origem, auditoria indisponível com rollback, HMAC forjado/payload divergente, replay concorrente (1 criação + 5 replays), persistência da baixa e estorno reversor, além de jornadas Chromium FIN-09/11/12.

**Estado declarado.** FIN-09, FIN-11 e FIN-12 estão `pronto_local` para a validação automática desta fatia; FIN-04 é revalidado somente no vínculo gateway→baixa/estorno, sem reabrir seu contrato. A [PR #69](https://github.com/berger33/gruposegsystemseguranca/pull/69) foi aberta sem merge e seus cinco checks passaram (`static-and-smoke`, financeiro, contratos, CRM e operações). Aceite humano, execução Windows e qualquer integração fiscal/PSP/banco real continuam pendentes e explicitamente fora de escopo. **L07 não está concluído; L08 não foi iniciado.**

- Próximos três passos: FIN-10 e avaliação adaptativa dos resíduos úteis de #47/#53; jornadas UI FIN-14/15/16; painel funcional `/admin/marcelo` para ADM-01..12 com inventário/destino da dívida dos componentes órfãos de `/admin/ti`.
- Retomada: `npm ci`; `node scripts/qa-wave0-static.mjs`; `npm run typecheck`; `npm test`; `npm run test:migrations:pg`; `npm run test:l07-delivery:pg`.

## Estado anterior — L07 em execução; fatia aditiva de FIN-13 concluída em 2026-10-01

Base confirmada antes de escrever: main `4ea35780bacc80bd228f6a970949a52e6f9504ba` (merge do PR #66), **sem commits posteriores** na consulta. Branch de trabalho: `arena/01a0f9da-gruposegsystemseguranca`, criada a partir dessa main. Ambiente remoto Arena; a cópia desatualizada do computador do proprietário não foi usada nem alterada.

**Baseline reconfirmado na base atual, antes de qualquer alteração** (resultado histórico do PR #65 não comprova commit novo): estático 5/5 (001–133), typecheck sem erros, `npm test` 196/196 e gate `test:l07-delivery:pg` **27/27, zero skips**.

**Lacunas reproduzidas antes de corrigir.** Os seis achados de FIN-13 foram confirmados no código e convertidos em testes reais; executados contra a base sem correção, o gate ficou em **27 aprovados e 4 reprovados** de 31 subtestes. Nenhum achado estava previamente resolvido.

**Fatia entregue — FIN-13, orçamento gerencial e cenários:**
- orçamento aprovado tem conteúdo congelado: edição ordinária devolve 409 e o banco recusa a alteração mesmo por SQL direto;
- revisão explícita exige motivo e autor, incrementa a versão, preserva a versão anterior em snapshot, retira a aprovação e exige nova aprovação;
- margem percentual é calculada a partir de receita e custo no servidor e conferida por constraint; receita zero e base incompleta ficam sem percentual, com motivo (`margin_basis`), preservando os valores já conhecidos;
- criação é idempotente por chave do cliente: retry igual devolve o mesmo orçamento, retry concorrente de 6 requisições cria exatamente um registro e a mesma chave com conteúdo diferente é recusada com 409;
- histórico imutável com snapshot anterior/posterior, versões, autor real, data e motivo — sem atribuir autoria por suposição;
- interface com seleção por nome/protocolo, moeda em R$, erro de leitura visível (não mais lista vazia) e jornada de revisão/aprovação/histórico;
- autorização no servidor (anônimo 401, papel indevido 403, TI somente leitura) e auditoria na mesma transação, com rollback e 503 quando a auditoria falha;
- aprovar orçamento **não** gera recebível, pagável, pagamento ou cobrança — asserido por teste.

Migração nova **134** (`134-fin13-budget-revision-margin-idempotency.sql`), aditiva: 001–133 preservadas, a 132 não foi reescrita, constraints novas entram `NOT VALID` e as linhas antigas são tratadas explicitamente (orçamentos herdados em `version=1` sem chave; cenários herdados marcados `margin_source='legado_informado'` conservando o número; histórico legado sem snapshot, declarado como tal).

Validação desta fatia: estático 5/5 (001–134), typecheck, build, `npm test` 196/196, `test:migrations:pg` **134/134** com replay/clone/checksum negativo, `test:l07-delivery:pg` **31/31 em duas execuções aprovadas** (uma execução intermediária deu 30/31 por queda do Chromium no `launch` no subteste 18 de FIN-10, fora desta fatia) e regressões L03 1/1, L04 20/20, L05 1/1, L06 9/9 (L06 verde nas duas execuções isoladas; reprova de forma intermitente quando encadeada após outros gates na mesma máquina de 2 vCPU, por carregamento lento da tela de patrimônio). Relatório em [ENTREGA-L07-FIN13.md](ENTREGA-L07-FIN13.md); evidências em [EVIDENCIAS-ENTREGA-LOCAL.md](EVIDENCIAS-ENTREGA-LOCAL.md).

**FIN-13 recebe `pronto_local` na validação automática; o aceite humano continua pendente** e a validação em Windows não foi feita (sessão em Linux). **L07 NÃO está concluído** e L08 não foi iniciado.

PRs #47/#53/#59/#60/#62 continuam **abertos**; o que foi aproveitado e o que foi descartado de #60/#62 está registrado na [consolidação](CONSOLIDACAO-L07-PRS-PENDENTES.md), seção “Aproveitamento efetivo nesta fatia”.

- Próximos três passos: jornadas FIN-14..16 com integração financeira e ligação FIN-12 → FIN-04; resíduos úteis de FIN-05/FIN-10 vindos de #47/#53; painel ADM-01..12. Prompt pronto em [PROMPT-PROXIMA-SESSAO-L07-FIN14-16.md](PROMPT-PROXIMA-SESSAO-L07-FIN14-16.md).
- Comandos de retomada: `npm ci`; `node scripts/qa-wave0-static.mjs`; `npm run typecheck`; `npm test`; `npm run build`; `npm run test:migrations:pg`; `npm run test:l07-delivery:pg`; regressões `test:l0{3,4,5,6}-delivery:pg`.

## Estado anterior — L07 em execução; consolidação em 2026-10-01

Main consultada: `fa893d69d2e3205e508a0a3a1e95fd5ff956258f`, PR #64 integrado, migrações 001–133. PR #65 ainda aberto na consulta; seus gates estão verdes na branch, não incorporados à main por este documento.

L04, L05 e L06 possuem entregas técnicas integradas. L07 chegou aos handlers FIN-14..16, mas faltam jornadas financeiras e o painel funcional de Marcelo. L08–L10 ainda precisam do fechamento previsto.

A comparação de #47/#53/#59/#60/#62 encontrou melhorias não equivalentes à main e colisões de migrações. Mantê-los como referência, sem merge em bloco ou descarte de código. FIN-13 exige atenção antes de ampliar telas: edição preserva aprovação anterior e percentual de margem vem do navegador.

- Relatório: [CONSOLIDACAO-L07-PRS-PENDENTES.md](CONSOLIDACAO-L07-PRS-PENDENTES.md).
- Retomada executável: [PROMPT-RETOMADA-L07-CONSOLIDADO.md](PROMPT-RETOMADA-L07-CONSOLIDADO.md).
- Próximos três passos: integrar/revalidar #65; corrigir FIN-13 de forma aditiva; concluir jornadas financeiras e ADM-01..12.
- Evidências #65: baseline 196 unitários, L04 20/20, L05 1/1, L06 9/9, L07 27/27, migrações 133/133; links no relatório.
- Esta consolidação é documental e estática: não executou branches antigas nem novas correções de negócio. Aceite humano e validação Windows permanecem pendentes.

## Histórico preservado

Os estados e números abaixo pertencem às respectivas sessões. Não substituem a seção atual; particularmente, referências a “próximo L06”, “L04 parcial” ou “L05 não iniciado” são históricas.

## Histórico — entrega técnica L05 (2026-09-30)

Fonte oficial: GitHub `berger33/gruposegsystemseguranca`; base integrada `main` / `2e3106fd41aac5510c24064ccbbfa7d3ab046b40` (PR #33). Trabalho executado exclusivamente no ambiente remoto Arena, na branch `arena/01a0f23a-gruposegsystemseguranca`; nenhum comando, instalação ou alteração foi executado no computador do usuário.

**L05 está concluído no escopo técnico local/remoto**, cobrindo CON-01..CON-11. O relatório e limites estão em [ENTREGA-L05.md](ENTREGA-L05.md); a matriz por requisito está em [CHECKLIST-ENTREGA-LOCAL.md](CHECKLIST-ENTREGA-LOCAL.md). A próxima migração é a aditiva **118**, preservando 001–117, com manifesto e preflight atualizados.

A área de negócio é `/admin/contratos`; `crm_contracts` é canônico. O portal legado continua usando `client_contracts` e só recebe vínculo explícito e restritivo. Cadastro manual deixa `proposal_id` nulo, com origem, autor e motivo reais; o aceite de proposta inicia contrato em rascunho e não ativa operação.

Validação executada no ambiente remoto com dados sintéticos e PostgreSQL descartável:

- `node scripts/qa-wave0-static.mjs` — 5/5, migrações 001–118;
- `npm run typecheck` e `npm run build` — aprovados;
- `npm run test:migrations:pg` — 118/118, reaplicação, clone e checksum negativo aprovados (517 tabelas);
- `npm run test:l04-delivery:pg` — 20/20 aprovados, preservando L04;
- `npm run test:l05-delivery:pg` — 1/1 cenário integrado aprovado, HTTP real, PostgreSQL descartável e Chromium.

O gate L05 prova: autorização anônima/papel, manual sem proposta fictícia, aceite/retry concorrente, composição, documento privado, bloqueio de implantação, ativação válida, aditivo sem reescrever histórico, alerta idempotente com saída local, dossiê, diário restrito, encerramento e preservação de outro contrato do cliente. SMTP real, hospedagem pública, pagamentos, emissão fiscal, assinatura externa e disparos de WhatsApp seguem fora do escopo e não foram alegados.

A conclusão permanece sujeita a aceite humano e aos checks do PR que será aberto nesta branch. O próximo lote é L06 (operação, patrimônio e manutenção); o prompt foi preparado, mas L06 não foi iniciado.

## Histórico de continuação — CRM-03 (revisão dedicada de deduplicação de CSV, 2026-09-29)

Base confirmada antes de escrever: `c3d799c186e8b513d130d786b6d14d86275a90f0`
(PR #31 mergeado), branch `arena/01a0efec-gruposegsystemseguranca`, árvore
limpa. A única fatia escolhida foi **CRM-03 — revisão dedicada de
deduplicação**; a política foi registrada antes da rota em
`docs/PROMPT-CONTINUACAO-CRM-03-DEDUPLICACAO.md`. L04 continua parcial e L05
não foi iniciado.

O que existia antes: a prévia da importação já marcava linhas duplicadas, mas
a decisão só podia chegar como mapa solto `actions` no corpo do commit — sem
persistência, sem autor, sem data e sem trilha. Na prática não havia revisão:
havia default silencioso.

O que a fatia entrega:

- `GET /api/crm/imports/:id/duplicates` — superfície dedicada com as linhas
  duplicadas, o registro casado e a decisão atual (`pending_review`,
  `review_complete`).
- `PATCH /api/crm/imports/:id/rows/:rowNumber` — decisão explícita
  `create`/`skip` com justificativa opcional, autor e data do servidor;
  campo desconhecido 400 `field_not_editable`; valor fora da lista 400
  `invalid_decision`; linha não duplicada 409 `row_not_duplicate` (revisão não
  promove linha inválida); lote fora de `pending` 409 `batch_not_pending`.
- `POST /api/crm/imports/:id/commit` passa a ser **fail-closed**: duplicata sem
  decisão devolve 409 `pending_dedup_review` e o lote **continua `pending`**
  (nada criado); o corpo `actions` deixou de ser aceito (400
  `actions_not_accepted`).
- Fechamento do lote e trilha `crm_import_commit` na **mesma transação**; a
  decisão grava `crm_import_row_decision` também transacionalmente — falha de
  auditoria reverte e devolve 503.
- Leitura/fechamento de lote passam a exigir a família de papel comercial
  (RH recebe **403**, não 401), como a revisão.
- Corrigido o curinga cru do pré-cálculo de duplicata por nome: agora
  `ILIKE ... ESCAPE '\'` com padrão escapado (um CSV com `%` deixou de casar
  com empresas de terceiros).
- `ImportDedupReview.tsx` integrado a `/admin/crm`: decide linha a linha e só
  libera a confirmação quando não resta pendência.

Migração aditiva **116** (`116-crm-03-dedup-review.sql`): colunas
`decision`, `decision_note`, `decided_by`, `decided_by_id`, `decided_at` em
`crm_import_rows` (nulas por padrão — o passado não é reescrito), CHECK de
coerência `NOT VALID`, índice de revisão e reautorização **delimitada** da ação
`crm_import_row_decision` no CHECK de auditoria (falha se a constraint pai
sumir; nunca redigita a lista). Migrações 001–115 permanecem imutáveis;
manifesto e `latestMigration` apontam para 116. As outras 146 ações perdidas
continuam fora, por decisão.

Gate: novo cenário **15** em `tests/l04-delivery.integration.test.mjs`
(autorização, entrada, curinga escapado, commit bloqueado por revisão
pendente, recusa do `actions` legado, rollback por auditoria injetada, decisão
auditada, commit revisado, imutabilidade pós-commit e jornada UI em Chromium
real). Resultado: **15/15 em duas execuções consecutivas aprovadas**, com
PostgreSQL descartável, HTTP real e Chromium real sem `--disable-web-security`.
Duas execuções intermediárias falharam por ruído conhecido do ambiente
(Chromium morrendo no `launch`, sem nenhuma asserção reprovada) e uma falhou
por seletor de UI (`getByLabel` em `<label>` sem `htmlFor`), corrigido para
`getByPlaceholder` — nenhuma regra foi afrouxada.
Fechamento: `npm ci` (82 pacotes, 0 vulnerabilidades), `qa-wave0-static` 5/5
(001–116), `test:migrations:pg` **116/116** com replay/clone/checksum negativo
e 510 tabelas, `npm test` 196/196, typecheck e build aprovados, `git status`
limpo após restaurar `tsconfig.json` e `next-env.d.ts`.


## Continuação atual — CRM-01 (superfície dedicada de unidades atendidas, 2026-09-30)

Base confirmada antes de escrever: `186e7dd4c420d577540b6ade8902b678762fac8b`
(PR #30 mergeado), branch `arena/01a0efcc-gruposegsystemseguranca`, árvore limpa.
A única fatia escolhida nesta continuação foi a **Opção A — completar CRM-01**;
a política foi registrada antes da rota em
`docs/PROMPT-CONTINUACAO-CRM-01-UNIDADES.md`. L04 continua parcial e L05 não
foi iniciado.

A entrega adiciona a superfície navegável `UnitManager.tsx` em `/admin/crm`.
Ela seleciona uma empresa, lista somente as unidades dessa empresa, cria e
edita campos controlados de CRM-01 (nome da unidade, cidade, endereço e
indicação de unidade principal). A indicação de unidade principal desmarca
atomicamente qualquer unidade principal anterior da mesma empresa na mesma
transação, garantindo ausência de duplicidade. O servidor adiciona
`GET/POST /api/crm/units` e `GET/PATCH /api/crm/units/:id`, exige a família de
papel comercial (`comercial`, `admin`, `marcelo`, `ti`), bloqueia RH (403),
exige empresa para leituras listadas e criação, mantém `company_id` imutável na
edição (400 `company_immutable`), rejeita campos desconhecidos (400
`field_not_editable`) e impede unidade órfão pela superfície.

Criação e edição executam mutação + `auth_access_audit` na mesma transação;
falha da trilha retorna 503 e reverte, inclusive na edição. A migração aditiva
**115** reautoriza `crm_unit_create` e `crm_unit_update`, falhando se o CHECK
pai ou o `actor_kind='comercial'` desaparecer. Migrações 001–114 permanecem
imutáveis; manifesto e `latestMigration` agora apontam para 115.

Gate dedicado em `tests/l04-delivery.integration.test.mjs`: **14/14**, duas
execuções finais consecutivas aprovadas, com PostgreSQL descartável, servidor
HTTP real e Chromium real sem `--disable-web-security`; prova 401/403/405,
validações, escopo por empresa, criação/edição via API substituindo fixture
SQL, desmarcação atômica de unidade principal, trilhas e rollback de criação e
edição por falha de auditoria injetada, jornada UI com `page.waitForResponse`,
sem rolagem horizontal, erro de console ou HTTP 5xx inesperado. Fechamento
desta continuação: `npm ci` (82 pacotes, 0 vulnerabilidades), `qa-wave0-static`
5/5, `test:migrations:pg` 115/115 com replay/clone/checksum negativo e 510
tabelas, `npm test` 196/196, typecheck aprovado, build aprovado e
`git diff --check` limpo após restaurar `tsconfig.json` e `next-env.d.ts`.

Limites honestos: CRM-03 segue sem revisão de deduplicação dedicada, CRM-04 não
resolve automaticamente contato sem empresa, as outras 144 ações do achado de
auditoria continuam fora do CHECK, lembretes/notificações externas de CRM-08
seguem fora, PUB-02/05/06/07/09 continuam pendentes/parciais, CRM-10 permanece
fora por decisão e não houve aceite humano, Windows, produção ou serviço externo.

## Histórico — CRM-02 (superfície dedicada de contatos, 2026-09-30)

Base confirmada antes de escrever: `42086989943b5af8b2baec0bb19a700ea6b6cfc1`
(PR #29 mergeado), branch `arena/01a0efae-gruposegsystemseguranca`, árvore limpa.
A única fatia escolhida nesta continuação foi a **Opção A — completar CRM-02**;
a política foi registrada antes da rota em
`docs/PROMPT-CONTINUACAO-CRM-02-CONTATOS.md`. L04 continua parcial e L05 não
foi iniciado.

A entrega adiciona a superfície navegável `ContactManager.tsx` em
`/admin/crm`. Ela seleciona uma empresa, lista somente os contatos dessa
empresa, cria e edita campos controlados de CRM-02 (função, papel de compra,
preferências de canais/horário, restrições, origem controlada, principal e
ativo/inativo). O servidor adiciona `GET/PATCH /api/crm/contacts/:id`, exige a
família de papel comercial, bloqueia RH, exige empresa para leituras listadas e
criação, mantém `company_id` imutável na edição e impede contato órfão pela
superfície. O detalhe da empresa passou a usar a mesma borda para não virar
bypass de leitura.

Criação e edição executam mutação + `auth_access_audit` na mesma transação;
falha da trilha retorna 503 e reverte, inclusive na edição. A migração aditiva
**114** reautoriza somente `crm_contact_update`, falhando se o CHECK pai ou o
`actor_kind='comercial'` desaparecer. Migrações 001–113 permanecem imutáveis;
manifesto e `latestMigration` agora apontam para 114.

Gate dedicado em `tests/l04-delivery.integration.test.mjs`: **13/13**, duas
execuções finais consecutivas aprovadas, com PostgreSQL descartável, servidor
HTTP real e Chromium real sem `--disable-web-security`; prova 401/403/405,
validações, escopo por empresa, edição, trilhas e rollback de criação/edição,
jornada UI com `page.waitForResponse`, sem rolagem horizontal, erro de console
ou HTTP 5xx inesperado. Fechamento desta continuação: `npm ci` (82 pacotes,
0 vulnerabilidades), `qa-wave0-static` 5/5, `test:migrations:pg` 114/114 com
replay/clone/checksum negativo e 510 tabelas, `npm test` 196/196, typecheck
aprovado, build aprovado e `git diff --check` limpo após restaurar
`tsconfig.json` e `next-env.d.ts`.

Limites honestos: CRM-01 continua parcial (unidades sem rota própria), CRM-03
segue sem revisão de deduplicação dedicada, CRM-04 não resolve automaticamente
contato sem empresa, as outras 146 ações do achado de auditoria continuam fora
do CHECK, lembretes/notificações externas de CRM-08 seguem fora, PUB-02/05/06/07/09
continuam pendentes/parciais, CRM-10 permanece fora por decisão e não houve
aceite humano, Windows, produção ou serviço externo.

## Histórico — CRM-01..04 (revalidação campo a campo, 2026-09-29)

Base confirmada no disco: `main @ 5eea847` / HEAD inicial desta sessão, sem
alterações locais. Política registrada antes da rota em
`docs/PROMPT-CONTINUACAO-CRM-01-04-REVALIDACAO.md`.

A fatia corrigiu a gravação de empresa e contato para auditoria transacional:
falha injetada no `auth_access_audit` reverte a empresa e responde 503. Contato
agora exige empresa existente, função validada e mantém preferências/restrições
no registro. A migração aditiva **113** reautoriza somente as duas ações
transacionais desta implementação (`crm_company_create` e `crm_contact_create`), reafirmando a constraint pai e
o `actor_kind='comercial'`; 001–112 permanecem imutáveis. O manifesto e
`latestMigration` foram atualizados para 113.

O gate ganhou cenário próprio com HTTP real, PostgreSQL descartável e Chromium
real sem `--disable-web-security`: 401/405, campos de CRM-01, contato CRM-02,
prévia/commit CSV, exportação com neutralização de fórmula, conversão CRM-04 e
reconversão idempotente, rollback transacional de auditoria e jornada UI com
`page.waitForResponse`. Resultado observado: **12/12**, duas execuções
consecutivas finais aprovadas; uma execução intermediária teve SIGSEGV do
Chromium empacotado antes dos testes e não é contada como aprovação.

CRM-01..04 continuam **parciais** no checklist: CRM-03 ainda não tem prova
completa de deduplicação revisável em interface; CRM-02 não tem tela dedicada
com função/preferências e permanece sem componente órfão conectado. A fatia
não ativou PUB-07, não iniciou L05 e não reautorizou as outras 146 ações do
achado de auditoria.


Documento de retomada entre sessões. Atualizado a cada lote concluído.
Referência: `docs/EXECUCAO-ENTREGA-LOCAL.md` (roteiro L00–L10) e
`docs/PLANO-MESTRE-IMPLEMENTACAO.md` (222 requisitos).


## Continuação mais recente — PUB-08: SEO técnico (Arena, 2026-09-29)

Base: `main @ b3c1db6` (merge do PR #26, PUB-10), na branch
`arena/01a0ef61-gruposegsystemseguranca`. Durante a sessão o **PR #25 foi
mergeado** por fora (`main @ 8f52137`); esta branch **incorporou `origin/main`
por merge, sem conflito**, e a bateria foi re-executada sobre o estado
mesclado. A política foi registrada ANTES da rota em
`docs/PROMPT-CONTINUACAO-PUB08-SEO-TECNICO.md`.

Fatia entregue: **PUB-08 — SEO técnico**. O que existia era uma casca: não
havia `/robots.txt`; o sitemap era *digitado à mão* numa tabela
(`seo_sitemap_entries`) e montado sem escapar XML; os redirects eram só linhas
numa tabela que **nenhum ponto do servidor consultava**; `GET /api/seo` e
`GET /api/seo-configs` eram públicos e devolviam inclusive
`is_published = false`; papel errado recebia 401 em vez de 403; e o `PATCH` de
domínio gravava `verificado` sem verificar nada.

O que passou a existir:

- **`GET /robots.txt`** (novo) e **`GET /sitemap.xml`**, ambos derivados do
  código em `src/lib/seo-technical.mjs` / `src/server/seo-technical-api.mjs`.
  As 17 URLs vêm das rotas estáticas reais + `PUBLIC_SERVICES` + os segmentos;
  para ter **uma** fonte, `src/lib/segment-examples.ts` virou `.mjs` + `.d.mts`
  (mesmo padrão de `service-catalog.mjs`), sem mudança de conteúdo.
- **`noindex` fail-closed**: só libera com `NEXT_PUBLIC_ENV=production` **e**
  `NEXT_PUBLIC_ALLOW_INDEX=true`. Fora disso, `Disallow: /` sem anunciar mapa,
  `X-Robots-Tag: noindex, nofollow` e `/sitemap.xml` **404** — não há parâmetro,
  cabeçalho ou papel que destrave.
- **`GET /api/admin/seo/sitemap-preview`**: revisão autenticada do XML que
  *seria* publicado, sem publicar nada.
- **Redirects que redirecionam**: `GET/POST/PATCH /api/admin/seo-redirects`
  cadastra com regra fail-closed (caminho interno absoluto, sem laço, sem
  sombrear rota existente, destino obrigatoriamente público, sem cadeia) e o
  servidor resolve **um único salto** no caminho da requisição, antes do Next,
  só em GET/HEAD, preservando a query.
- **Vazamento fechado**: `/api/seo` e `/api/seo-configs` deixaram de ter
  caminho público; papel errado agora é 403.
- **Auditoria transacional**: criar/alterar redirect grava a trilha em
  `auth_access_audit` na mesma transação; falha injetada devolve 503 e reverte.

**Achado que obrigou uma migração:** o gate provou que a suposição da política
("as ações já estão no CHECK desde a 090") era **falsa**. As migrações 099,
100 e 103 **redigitaram a lista inteira** do CHECK `auth_access_audit_action_check`
em vez de ampliá-la e, com isso, apagaram **148 valores** que existiam na lista
da 093 — todas as ações de SEO, CMS, temas, pacotes, origem/conversão e
reclamação. O defeito ficou invisível porque quase todo gravador de trilha do
projeto embrulha o `INSERT` em `try {} catch {}`. Criada a migração **112**
(aditiva, no padrão da 110/111: aninha a definição anterior, falha se a
constraint pai sumir e se `actor_kind` deixar de aceitar `'ti'`), que
reautoriza **apenas** `seo_redirect_create` e `seo_redirect_update` — as duas
que esta fatia escreve e prova. **As outras 146 continuam fora da lista e
ficam declaradas como achado aberto.** Migrações **001–112**, **510 tabelas**;
001–111 permanecem imutáveis.

Descartes declarados: **`SeoClient.tsx` permanece órfão e descartado** (permite
digitar qualquer URL no sitemap, `robots` livre e "Marcar verificado" num
clique); `seo_sitemap_entries` e `seo_configs` deixam de ser fonte de verdade;
a coluna `hits` não é incrementada; `/layout-01..10`, `/qa/modulos` e
`/proposta/aceite/[token]` ficam fora do sitemap. **Verificação de domínio fica
FORA por fronteira externa** (DNS/HTTP no domínio real) e o caminho que
fabricava o fato foi fechado com 400 `domain_verification_not_supported`.

Outros dois achados registrados: (1) a regra de **cadeia** é hoje
estruturalmente inalcançável pelo cadastro (origem nunca é rota pública e
destino sempre é) e fica como segunda barreira porque o catálogo de serviços
muda — no gate ela só é alcançável por fixture SQL; (2) a migração 090 **semeia
quatro redirects**, e os três com origem sob `/cliente` e `/admin` nascem
**inertes** pela regra de prefixo reservado, de modo que `/cliente/acesso`
continua servindo a página real.

Gate: `npm run test:l04-delivery:pg` **11/11, duas vezes consecutivas**
(PostgreSQL descartável, HTTP real, Chromium real sem `--disable-web-security`,
`page.waitForResponse` em vez de espera fixa). Regressão: `qa-wave0-static`
5/5, `test:migrations:pg` **112/112 checksums e 510 tabelas** (replay, clone e
mismatch negativo), `npm test` **196/196**, `typecheck` 0 erros, `build` OK,
`git diff --check` limpo, `tsconfig.json`/`next-env.d.ts` restaurados após o
dev server do gate.

Integração: **PR #27, mergeado em `main @ 0f0fb70`**, com os três checks do CI
verdes (`static-and-smoke` ×2 e `crm-postgres-browser`).

L04 continua **PARCIAL** e **L05 não foi iniciado**. PUB-08 passa a *parcial*
(SEO técnico provado; verificação de domínio declaradamente fora). Seguem em
aberto: PUB-02/05/06/07/09 com componentes órfãos, CRM-01..04 aguardando
revalidação campo a campo, lembretes/notificações de agenda e CRM-10 fora por
decisão.

### Continuação anterior — CRM-07 residual: notas internas e campo a campo de CRM-05/06 (Arena, 2026-09-29)

A base desta continuação é `ed50d22` (HEAD de `main` e da branch no início, merge dos PRs #22 e #23), na branch `arena/01a0eef9-gruposegsystemseguranca`. O recorte escolhido é a lacuna 1 de L04: **revisão campo a campo do kanban/tabela de oportunidades herdados de CRM-05/06 e notas internas dedicadas de CRM-07**. A política foi registrada antes da rota em `docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md`.

A revisão campo a campo encontrou **dois defeitos reais de borda**: as rotas de oportunidade (`GET /api/crm/opportunities`, `GET/PATCH /api/crm/opportunities/:id`) não aplicavam a política pessoal já registrada para tarefas/interações/visitas/cadências — **qualquer** sessão de staff autenticada (RH, outro comercial, qualquer papel) listava todas as oportunidades de todos, com necessidade, valor, origem e motivo de perda, e podia mudar estágio e valor de oportunidade alheia; e a auditoria dessas mutações era gravada por um auxiliar que engolia falha com `try/catch` (mutação persistia sem trilha). Ambos corrigidos: listagem/detalhe/PATCH agora são do responsável atual (ou do criador enquanto sem responsável), o detalhe legado é 404 para qualquer outra identidade (inclusive participante de visita, cujo caminho de leitura continua sendo a própria agenda), o papel precisa ser da família comercial (RH 403) e toda mutação de oportunidade audita na mesma transação — falha injetada reverte.

Notas internas: tabela nova `crm_opportunity_notes` (corpo 1–4000 com trim no banco, versão otimista incrementada por gatilho no padrão da 109, exclusão lógica coerente com `deleted_at`/`deleted_by_id`), rotas dedicadas `GET/POST /api/crm/opportunities/:id/notes` e `PATCH/DELETE .../notes/:noteId` em `src/server/crm-note-api.mjs`, com auditoria transacional (`crm_note_create`/`crm_note_update`/`crm_note_delete`), paginação real 1–100 e a regra de que **só quem escreveu edita ou exclui a própria nota** — nem o responsável pela oportunidade reescreve palavra de outro autor. Nota nunca aparece em superfície pública, do cliente ou de empresa.

CRM-05 completo: criação (POST direto e conversão de lead) aceita e valida todos os campos — serviço, necessidade, responsável (agora gravado de verdade na conversão, com nome vindo de `auth_identities.display_name`), **unidade validada contra a mesma empresa**, previsão, valor, próxima ação/data, origem, campanha e prioridade; PATCH mantém todos os campos editáveis. **Atribuição é imutável**: `origin`/`campaign`/`responsible_id`/`responsible_name` não são editáveis (400 `field_not_editable`) e `public_lead_id` nunca vem do corpo (400 `server_managed_fields`, decisão CRM-08). Busca e prioridade passaram para o servidor com curinga escapado (`100%` é literal). CRM-06 endurecido: motivo de perda obrigatório também no banco (`NOT VALID`, vale para escrita nova), reabertura de `perdido`/`ganho` exige motivo explícito, audita ação dedicada `crm_opportunity_reopen` e limpa o `loss_reason` corrente (o motivo antigo fica no histórico de estágio); trocar direto entre `ganho` e `perdido` é recusado (400 `invalid_terminal_transition`); `is_won`/`is_lost` não podem divergir do estágio (CHECK no banco). UI: formulário de nova oportunidade com todos os campos, tabela/kanban exibindo serviço/responsável/unidade/previsão/origem/motivo de perda, painel `OpportunitySummary.tsx` com manutenção de campos e movimentação de funil exigindo os motivos na interface, e `OpportunityNotes.tsx`.

Migração `111-crm-opportunity-notes-reopen.sql` (aditiva): tabela de notas com CHECKs, índice parcial e gatilho de versão; CHECKs `NOT VALID` de coerência do funil (aditivos — não reescrevem linha existente do operador, mas valem para toda escrita nova); reafirmação do CHECK de `auth_access_audit` no padrão herdado (falha se a constraint pai sumir), acrescentando `crm_note_create`, `crm_note_update`, `crm_note_delete` e `crm_opportunity_reopen`. **510 tabelas.**

Gate: `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas** (PostgreSQL 17 descartável, HTTP real, Chromium real sem `--disable-web-security`). O oitavo cenário prova campo a campo: criação com todos os CRM-05 e persistência conferida, controles negativos de cada campo (prioridade inválida, unidade de outra empresa, valor negativo, data de previsão inválida, vínculo de lead forjado, empresa inexistente), imutabilidade de atribuição, manutenção por PATCH incluindo limpeza de unidade, busca literal `100%` sem casar `1000`, filtro de prioridade no servidor, borda pessoal na listagem/detalhe/PATCH/detalhe-de-empresa (outro comercial 404, RH 403, sem sessão 401, origem ausente 403 em mutação), funil completo com histórico de estágios, perda sem motivo recusada, troca direta de terminal recusada, reabertura sem motivo recusada, reabertura limpando motivo, trilha de auditoria completa (`crm_opportunity_reopen` dedicada), rollback por falha de auditoria injetada na reabertura, CHECKs do banco como controle negativo por SQL (perdido sem motivo, bandeira mentindo, nota de whitespace), notas com paginação sem sobreposição/perda, versão otimista por gatilho (inclusive escrita direta no banco), regra de autor (nota de outro autor não é reescrita nem pelo dono), exclusão lógica preservada e não reversível, rollback de criação e edição de nota por falha de auditoria, e a jornada de UI real (formulário completo, cartão e tabela com todos os campos, funil com motivos exigidos, notas criar/editar/excluir, ganho “não é dinheiro recebido”), sem erro de console/5xx e sem rolagem horizontal. Ajustes declarados em cenários preexistentes: as asserções de “detalhe legado 200 com lista vazia” de CRM-07 tarefas/interações/delegação, CRM-09 e CRM-08 passaram a afirmar **404** (regra mais forte), a visão do participante de CRM-08 passou a ser reafirmada pela própria agenda, e o rótulo de busca da UI de oportunidades mudou para refletir que a busca agora é no servidor. Regressão: `qa-wave0-static` 5/5, `test:migrations:pg` 111/111 (replay, clone, checksum negativo, 510 tabelas), `npm test` 186/186, `typecheck` 0 erros, `build` com `/admin/crm`, `git diff --check` limpo, `tsconfig.json`/`next-env.d.ts` restaurados após o dev server do gate.

**Integração com o main atualizado:** esta fatia foi desenvolvida em paralelo à fatia de calendário de CRM-08 (PR #24, branch `arena/01a0ef36`) e à fatia de métricas PUB-10 (PR #26, branch `arena/01a0ef49`). Os conflitos do gate e dos docs foram resolvidos mantendo **todos** os cenários; no gate mesclado, notas/kanban é o oitavo, calendário o nono e PUB-10 o décimo, e a bateria completa foi re-executada sobre o estado mesclado: `test:l04-delivery:pg` **10/10, duas vezes consecutivas**, `test:migrations:pg` 111/111, `npm test` 186/186, `typecheck` 0 erros, `build` ok, `git diff --check` limpo.

L04 continua **parcial**: dentro de CRM-08, a visão de calendário por semana foi entregue em paralelo pelo PR #24 (`arena/01a0ef36`) e restam lembretes/notificações (dependem de provedor/autorização/opt-out) e ações dentro da própria visão (deliberadamente só leitura); CRM-01..04 aguardam revalidação campo a campo (CRM-02 segue sem tela de contato com função); PUB-02/05 e PUB-06..09 seguem com componentes órfãos (PUB-10 foi entregue em paralelo pelo PR #26); CRM-10 está fora por decisão. **CRM-05, CRM-06 e CRM-07 passaram a pronto_local nesta fatia** (provados por gate campo a campo). L05 não foi iniciado.

### Continuação anterior — PUB-10: mensuração de origem e conversão (Arena, 2026-09-29)

A base desta continuação é `fe35b4c` (HEAD de `main` e da branch no início,
merge do PR #24 — visão de calendário por semana em CRM-08), na branch
`arena/01a0ef49-gruposegsystemseguranca`.

Fatia entregue: **PUB-10 — mensuração de origem e conversão**, como painel
**derivado e somente leitura**, no domínio de atendimento (`/admin/leads`).
A política foi registrada ANTES da rota em
`docs/PROMPT-CONTINUACAO-PUB10-METRICAS-ORIGEM.md`.

O que passou a existir:

- `GET /api/admin/leads/metrics?from=&to=` (`handleAdminLeadMetrics` em
  `server.mjs`): agrega `public_leads` por origem/campanha/canal dentro de um
  período e cruza com `crm_opportunities.public_lead_id`/`stage` para medir
  quatro degraus observáveis — pedidos, visitas confirmadas, convertidos em
  oportunidade e ganhos no funil. Taxas são calculadas pelo servidor sobre
  esses inteiros, nunca digitadas.
- `src/app/admin/leads/OriginMetricsPanel.tsx`, renderizado em
  `/admin/leads` abaixo da fila de pedidos, com seletor de período.

Decisões de política registradas nesta fatia:

- **`OriginMetricsClient.tsx` foi descartado para esta finalidade e continua
  órfão.** É um CRUD onde um humano digitaria `total_leads` e
  `converted_leads` à mão: isso não é mensuração, é número inventado com
  aparência de relatório oficial. As tabelas da migração 092 continuam
  existindo, sem tela e sem serem fonte de verdade de nada.
- Autorização idêntica à de `GET /api/admin/leads` (`marcelo`, `ti`,
  `comercial`, `admin`); sem sessão 401, papel fora da lista 403, método
  diferente de GET 405. Sem bypass de nenhum tipo.
- Minimização por construção: só rótulos e inteiros saem da rota. Nenhuma
  coluna por-lead é projetada em ponto algum, e não existe parâmetro que
  destrave linha individual.
- Janela fail-closed: formato inválido ou `from > to` → 400 `invalid_period`;
  acima de 366 dias → 400 `period_too_long`. Não há consulta "tudo desde
  sempre" por esta rota.
- Denominador zero devolve `null`, não `0`: "não há base para calcular" é
  diferente de "a taxa é zero".
- A rota não grava trilha por consulta (leitura agregada sem dado pessoal;
  auditar cada render degradaria `auth_access_audit`). Como não há mutação,
  não há nesta fatia o cenário de auditoria transacional.
- **Testes A/B continuam fora**, por decisão registrada: o requisito os
  condiciona a tráfego, hipótese e tratamento de dados definidos, e nenhuma
  das três coisas existe.

Sem migração nova: 001–110 seguem imutáveis, 509 tabelas, próxima livre
**111**. Gate `npm run test:l04-delivery:pg` **9/9 duas vezes consecutivas**,
com cenário novo cobrindo 401/403/405, quatro variações de janela inválida,
agregados conferidos contra fixture, distinção entre 0 e `null`, rótulo
`(não informado)`, minimização provada no JSON e no DOM, e Chromium real
lendo 4 pedidos em 90 dias e 3 em 30 dias. Ajuste declarado: o cenário foi
corrigido para afirmar os dois valores depois de a primeira redação assumir
janela errada — a regra não foi afrouxada. Detalhes em
`docs/EVIDENCIAS-ENTREGA-LOCAL.md`.

**L04 continua PARCIAL.** Pendentes: CRM-07 residual (kanban/tabela campo a
campo e notas internas), PUB-02/05 e PUB-06..09, e revalidação campo a campo
de CRM-01..06.

*(Nota de integração: na fusão com a fatia de notas/kanban este cenário passou a
ser o décimo do gate; a bateria mesclada revalidou 10/10.)*

### Continuação anterior — CRM-08 residual: visão de calendário por semana, somente leitura (Arena, 2026-09-29)

A base desta continuação é `ed50d22` (HEAD de `main` e da branch no início,
merge dos PRs #22 e #23; a fatia de código é o merge `ea7a1ed`), na branch
`arena/01a0ef36-gruposegsystemseguranca`. O recorte escolhido é a lacuna 2 de
L04 (`docs/PROMPT-PROXIMA-SESSAO-L04.md`): **visão de calendário por
período/semana na agenda pessoal de CRM-08**. A política foi registrada antes
do código em `docs/PROMPT-CONTINUACAO-CRM-AGENDA-CALENDARIO.md`.

`MyAgenda.tsx` ganhou um alternador "Ver em lista" / "Ver por semana". A
visão semanal navega por "Semana anterior"/"Semana atual"/"Próxima semana"
(segunda a domingo, fuso local do navegador) e agrupa os compromissos por
dia. Decisão central: **não foi criada nenhuma rota, coluna ou migração
nova** — a visão reaproveita exatamente o mesmo `GET
/api/crm/visits/agenda?from=&to=` já existente e já autorizado desde CRM-08
(migração 107/110), então a mesma política de escopo (só responsável/
participante, sem bypass administrativo, sem exposição de agenda alheia) se
aplica automaticamente, sem trabalho extra de autorização. A visão de
calendário é deliberadamente **somente leitura**: confirmar/recusar
presença, reagendar e cancelar continuam exclusivos da lista, para não
duplicar controle de versão otimista em duas superfícies — decisão de
escopo explícita, registrada no prompt da fatia.

Migrações continuam 001–110 (509 tabelas), sem nenhuma migração nova nesta
fatia — confirmado por `qa-wave0-static` e `test:migrations:pg` antes e
depois da mudança.

Gate: `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas**
(PostgreSQL 17 descartável, HTTP real, Chromium real sem
`--disable-web-security`). O oitavo cenário prova, por HTTP e Chromium reais:
alternância lista↔semana sem quebrar a lista pré-existente (a espera da
resposta real do endpoint evita uma corrida com o estado "carregando" da
UI); uma visita "perto" (2 dias à frente) aparecendo no dia certo da semana
atual ou, no pior caso próximo da virada de semana, da seguinte
(nome do dia da semana e data calculados independentemente pelo teste e
comparados ao rótulo acessível da UI); uma visita "distante" (20 dias à
frente) nunca aparecendo em nenhuma das duas janelas; uma semana totalmente
no passado sem nenhuma das duas; e volta à lista preservando ambas as
visitas, sem erro de console/rede/5xx. Regressão: `qa-wave0-static` 5/5,
`test:migrations:pg` 110/110 (replay, clone, checksum negativo, 509
tabelas, inalterado), `npm test` 186/186, `typecheck` 0 erros, `build` com
`/admin/crm`, `git diff --check` limpo (`tsconfig.json`/`next-env.d.ts`
restaurados após o dev server do gate reescrevê-los).

L04 continua **parcial**: dentro de CRM-08, faltam lembretes/notificações
(dependem de provedor/autorização/opt-out, nenhum decidido) e qualquer ação
dentro da própria visão de calendário (deliberadamente só leitura); CRM-07
ainda tem revisão campo a campo de kanban/tabela e notas internas; CRM-01..06
aguardam revalidação campo a campo; PUB-02/05 e PUB-06..10 seguem com
componentes órfãos; CRM-10 está fora por decisão. L05 não foi iniciado.

*(Nota de integração: na fusão com a fatia de notas/kanban este cenário passou a
ser o nono do gate; com a integração posterior do PUB-10, a bateria mesclada
revalidou 10/10.)*

### Continuação anterior — CRM-08: conflito de horário e vínculo PUB-04 (Arena, 2026-09-29)

A base desta continuação é `fd7a939` (HEAD de `main` e da branch no início, merge do PR #21), na branch `arena/01a0eeda-gruposegsystemseguranca`. O recorte escolhido é a lacuna 2 de L04: **detecção de conflito de horário do responsável e vínculo PUB-04** em CRM-08. Calendário, lembretes e notificação externa continuam fora por decisão. A política foi registrada antes da rota em `docs/PROMPT-CONTINUACAO-CRM-VISITAS-CONFLITO-PUB04.md`.

Conflito: a faixa `[início, início+duração)` do **responsável** não pode sobrepor outra visita viva dele (`solicitada`/`em_agendamento`/`confirmada`); duração nula vale 60 minutos; encostar não é conflito; participante convidado não bloqueia (ele pode recusar, e a agenda alheia não é exposta — a checagem só olha as visitas do próprio ator, então a resposta de conflito não vira oráculo). É fail-closed: `409 visit_schedule_conflict`, sem parâmetro de força e sem exceção por papel administrativo. A corrida real é serializada por `pg_advisory_xact_lock` por identidade responsável dentro da transação. A recheca ocorre na criação, ao mover data/duração e ao confirmar.

Vínculo PUB-04: quando a oportunidade veio de lead público, a visita herda `public_lead_id` **da oportunidade** (nunca do corpo da requisição — o campo passou a ser recusado como `server_managed_fields`) e propaga, na mesma transação: `confirmada`/`realizada` → lead confirmado/realizado com `lead_visit_confirm`; `cancelada` → lead cancelado com `lead_visit_cancel`, **apenas se não sobrar outra visita viva do mesmo lead**; reagendamento → lead volta a `em_agendamento` com `lead_status_change` (não se promete horário sem reserva real). Lead `realizada` é congelado. Cada propagação escreve `public_lead_status_audit`, a ação PUB-04 em `auth_access_audit` e `crm_visit_lead_sync`; falha de qualquer trilha reverte a mutação da visita. Correção associada em `PATCH /api/admin/leads/:id`: a rota auditava **qualquer** transição de visita (inclusive cancelamento) como `lead_visit_confirm` e engolia a falha de auditoria com `try {} catch {}` — agora o mapeamento é fiel e a falha reverte a transição. O teto de antispam de PUB-03 passou a aceitar `LEAD_MAX_ATTEMPTS` por ambiente (padrão seguro 5/10min, mesmo padrão de `ADMIN_LOGIN_MAX_ATTEMPTS`) para o gate exercitar várias jornadas públicas sem afrouxar produção.

Migração `110-crm-visit-conflict-lead-link.sql` (aditiva): `lead_sync_status`/`lead_sync_at` com CHECK de coerência e de exigência do lead, índices parciais de conflito e de lead, e reafirmação do CHECK de `auth_access_audit` no padrão herdado — falha se a constraint pai sumir **ou se as ações PUB-04 desaparecerem**, nunca afrouxa.

Gate: `npm run test:l04-delivery:pg` **7/7, duas vezes consecutivas** (PostgreSQL 17 descartável, HTTP real, Chromium real sem `--disable-web-security`). O sétimo cenário prova lead público real convertido, recusa do vínculo forjado, conflito por faixa igual/sobreposta/por trás, encostar permitido, agenda de outro comercial livre na mesma hora, conflito ao reagendar e ao esticar duração sem consumir versão, propagação de confirmação/realização/cancelamento com e sem outra visita viva, queda da confirmação no reagendamento, congelamento do lead realizado, rollback por falha de auditoria injetada em `lead_visit_cancel`, trilha correta na rota manual de PUB-04 e jornada de UI (selo do lead e mensagem de conflito). O cenário CRM-08 anterior foi ajustado em um ponto: a visita usada para provar rollback de auditoria passou a usar faixa livre, porque a sobreposição agora é recusada antes da auditoria. Regressão: `qa-wave0-static` 5/5, `test:migrations:pg` 110/110 (replay, clone, checksum negativo, 509 tabelas), `npm test` 186/186, `typecheck` 0 erros, `build` com `/admin/crm`, `git diff --check` limpo.

L04 continua **parcial**: CRM-08 ainda não tem lembretes/notificações nem visão de calendário por período; CRM-07 ainda tem revisão campo a campo de kanban/tabela e notas internas; CRM-01..06 aguardam revalidação campo a campo; PUB-02/05 e PUB-06..10 seguem com componentes órfãos; CRM-10 está fora por decisão. L05 não foi iniciado.

### Continuação anterior — CRM-07: prazo, paginação e delegação com aceite (Arena, 2026-09-29)

A base desta continuação é `942b3fc` (HEAD de `main` e da branch no início, merge do PR #20), na branch `arena/01a0eeb7-gruposegsystemseguranca`. A decisão de negócio pendente de CRM-07 foi tomada e registrada antes da rota (`docs/PROMPT-CONTINUACAO-CRM-TAREFAS-DELEGACAO.md`): **existe delegação explícita entre comerciais, com aceite, e não existe visibilidade de equipe ampla**. A fatia entrega, na migração `108`→`109-crm-task-delegation.sql`, versão otimista incrementada por gatilho do banco, campos de delegação com CHECK de coerência e de não-autodelegação, índice parcial e seis ações novas de auditoria.

`src/server/crm-task-api.mjs` foi reescrita como objeto de handlers: GET paginado de verdade (1–100, `offset` até 10000, `total`) com filtros de situação, busca por título com curinga escapado e vencidas no servidor; PATCH com uma única operação por chamada (transição por `expected_status` OU prazo por `expected_version`); `POST/DELETE .../delegation`; `GET /api/crm/tasks/delegated`; `POST .../response`; `PATCH /api/crm/tasks/delegated/:id`. Política: só o responsável pela oportunidade delega, apenas para staff ativo `comercial`, por e-mail exato com erro genérico único (sem oráculo de diretório); pendente congela o dono e pode ser revogada; recusa devolve; aceite transfere `responsible_id` e as transições passam a ser exclusivas do delegado; tarefa de cadência (CRM-09) não é delegável; o delegado recebe contexto mínimo (tarefa, empresa, título da oportunidade, quem delegou) e nenhum outro acesso à oportunidade; a rota legada de detalhe não deixa a tarefa delegada sumir do dono. Papel administrativo não delega nem recebe. Revogação após aceite ficou fora por decisão. UI: `OpportunityTasks.tsx` ganhou paginação/busca/filtros/edição de prazo/delegação, novo `MyDelegatedTasks.tsx` sempre visível, e o kanban de oportunidades ganhou busca por título, filtro de prioridade e alternância kanban/tabela.

Gate: `npm run test:l04-delivery:pg` **6/6, duas vezes consecutivas** (PostgreSQL 17 descartável, HTTP real, Chromium real sem `--disable-web-security`; segundo navegador/sessão para o delegado). O sexto cenário prova paginação sem sobreposição nem perda (34 tarefas), controles negativos de parâmetros, busca literal `100%` com escape de curinga, conflito de versão real na edição de prazo, todos os caminhos de delegação (negações, erro genérico idêntico, cadência, pendente/revogada/recusada/aceita, transferência conferida no banco, borda do delegado, auditoria por ator e rollback por falha de auditoria injetada no aceite) e a jornada de UI completa dono→delegado→dono. Regressão: `qa-wave0-static` 5/5, `test:migrations:pg` 109/109 (replay, clone, checksum negativo, 509 tabelas), `npm test` 186/186, `typecheck` 0 erros, `build` com `/admin/crm`, `git diff --check` limpo, `tsconfig.json` restaurado após o dev server do gate reescrevê-lo.

L04/CRM-07 continuam parciais nas lacunas registradas: revisão campo a campo de kanban/tabela herdados de CRM-05/06 e notas internas dedicadas; CRM-08 (conflitos/PUB-04), CRM-10, lacunas PUB e revalidação CRM-01..06 seguem pendentes. Fora desta entrega, por decisão: CRM-10, automação de mensagens, SMTP, calendário/lembretes adicionais, hospedagem externa, Windows e aceite humano.

### Continuação anterior — CRM-09, cadências manuais (Arena, 2026-09-29)

A base desta continuação é `5a2e6a7` (HEAD da branch Arena e de `main` no início), na branch `arena/01a0eea3-gruposegsystemseguranca`. O recorte Opção C implementa CRM-09 verticalmente em `108-crm-manual-cadences.sql`, `src/server/crm-cadence-api.mjs` e `/admin/crm`: modelos privados por comercial, passos com intervalo/canal/responsável, aplicação somente à própria oportunidade e materialização imediata de tarefas manuais. Não há envio automático de mensagem.

A política foi registrada antes da rota: somente identidade ativa com papel `comercial` cria, edita, arquiva e aplica seus modelos; outro comercial, admin, Marcelo, TI e RH não fazem bypass. O contato da oportunidade é obrigatório e precisa estar ativo; opt-out bloqueia novas aplicações e cancela passos pendentes. Oportunidade ganha/perdida e contato desativado também encerram a cadência e cancelam somente tarefas abertas/em andamento. Tarefas concluídas não são reabertas. A rota legada de detalhe passou a filtrar `stages` pela mesma propriedade da oportunidade.

O gate CRM-09 prova UI real em Chromium e HTTP + PostgreSQL descartável: criação/edição/recarregamento do modelo e aplicação pela UI, outro usuário/papel/sessão/origem/método/campos inválidos, propriedade da oportunidade, deduplicação, opt-out, ganho, contato inativo, auditoria e rollback por falha de auditoria. A decisão de automação de mensagens permanece pendente de autorização, opt-out operacional e provedor; esta fatia não envia nada.

### Continuação anterior — CRM-07, interações completas (Arena, 2026-09-29)

A base real desta sessão foi `05f258f` (`main` após o ajuste documental do PR #15), na branch `arena/01a0ee5c-gruposegsystemseguranca`. O recorte **Opção A** do prompt anterior foi entregue no código `c69685f`: interações agora aceitam os sete tipos do schema, contato ativo da mesma empresa, paginação real, edição com versão otimista, exclusão lógica e anexos privados. Os anexos reutilizam o provider local de L02 (`CLIENT_DOCS_DIR`/`.data/documents`) com chave aleatória, SHA-256, verificação de integridade antes do download e autorização da oportunidade; nunca recebem URL pública. As ações `create`, `update`, `delete`, `attachment_create` e `attachment_download` têm auditoria própria e transacional, sem copiar detalhes sensíveis para a auditoria.

A interface em `/admin/crm` foi ampliada (tipos, seletor de contato, upload, download, edição, confirmação de exclusão e páginas de 25). A exclusão preserva os bytes e a linha para auditoria, marca `deleted_at`/`deleted_by_id` e a remove de todas as leituras normais, inclusive na rota legada de detalhe. A política continua individual: só o responsável atual da oportunidade, ou quem a criou quando ainda não há responsável, lê e altera; não foi criado bypass por papel. Equipe/delegação continua pendente por decisão explícita.

Migração `106-crm-interaction-follow-up.sql` acrescenta controle de versão, remoção lógica, metadados de anexos e novos eventos de auditoria, sem modificar 001–105. O gate L04 agora prova por HTTP + Chromium + PostgreSQL descartável: UI cria ligação com contato e TXT, recarrega, edita; download entrega bytes privados corretos; outro comercial recebe 404; todos os tipos, paginação, conflito e remoção lógica funcionam; falhas de auditoria injetadas revertem criação e exclusão. Confira o prompt e a evidência. L04/CRM-07 continuam parciais: ainda há tarefas sem equipe/delegação/paginação/edição de prazo e a revisão completa de kanban/filtros.

### Continuação anterior — tarefas CRM-07

PR #13: tarefas pessoais conectadas em /admin/crm, com auditoria atômica e proteção por responsável também na rota legada. Código validado `7bab313`: CI baseline e gate L04 (2/2, HTTP/Chromium/PostgreSQL) aprovados; migrações 104/104 e replay aprovados. Os resultados dos lotes anteriores abaixo são históricos, não novas execuções desta continuação.

## Situação atual

| Campo | Valor |
|---|---|
| Branch de trabalho | `arena/01a0efae-gruposegsystemseguranca` |
| Base desta sessão | `42086989943b5af8b2baec0bb19a700ea6b6cfc1` (merge do PR #29) |
| Lote ativo | **L04 — CRM-02 concluído localmente; L04 ainda parcial**. CRM-01 unidades, CRM-03 deduplicação revisável, CRM-04 resolução automática de contato sem empresa, PUB-02/05/06..09, lembretes/notificações externas e CRM-10 permanecem fora conforme políticas. |
| Último gate aprovado | **L04 ampliado: 13/13, duas vezes consecutivas**, PostgreSQL descartável, HTTP real e Chromium sem `--disable-web-security`, incluindo o cenário dedicado CRM-02. |
| Migrações | 001–114 (510 tabelas; 114 reautoriza somente `crm_contact_update`, preservando o CHECK anterior) |
| Data | 2026-09-30 |

## Lotes

| Lote | Escopo | Estado | Gate |
|---|---|---|---|
| L00 | Base íntegra e controle confiável | **concluído** | aprovado |
| L01 | Identidade, autorização e integridade básica | **parcial ampliado** | SEC-02/04/05/06 + controles dependentes do L03: RBAC sem bypass, escopo, remuneração/saúde e revogação |
| L02 | Armazenamento, notificações locais, continuidade | **concluído** | 14/14 HTTP em PostgreSQL descartável (revalidado nesta sessão) |
| L03 | Funcionário e RH | **concluído** | EMP-01..19 e HR-01..24 navegáveis; gate integral aprovado (revalidado nesta sessão) |
| L04 | Site/captação e comercial | **parcial — CRM-05/06/07, calendário de CRM-08 e PUB-10 concluídos; lacunas explícitas** | Núcleo CRM-11..27 provado; CRM-07 completo (tarefas, interações, anexos, delegação com aceite, kanban/tabela campo a campo e notas internas dedicadas, todos provados por gate); CRM-05/06 prontos (todos os campos, funil com motivo de perda obrigatório no banco e reabertura auditada, borda pessoal nas rotas de oportunidade); CRM-08 tem agenda de responsável/participantes, conflito de horário, vínculo PUB-04 auditado e visão de calendário por semana (somente leitura), faltando lembretes/notificações (dependem de provedor); PUB-10 entregue como painel derivado e somente leitura em `/admin/leads` (PR #26); CRM-09 tem modelos privados e tarefas manuais, sem automação; CRM-01..04 foram revalidados parcialmente nesta sessão; CRM-02 segue sem tela dedicada; CRM-10 e PUB-02/05/06..09 continuam pendentes |
| L05 | Contratos e implantação | pendente | — |
| L06 | Operação, patrimônio e manutenção | **concluído (entrega técnica local; aceite humano e fronteiras externas pendentes item a item na matriz)** | Gate L06 9/9 em HTTP + PostgreSQL descartável + Chromium, com OPS-01..16 e AST-01..12 `pronto_local`; bateria final: L04 20/20, L05 1/1, migrações 123/123, unitários 196/196, typecheck, build e estático 5/5 |
| L07 | Financeiro e Marcelo | **FIN-01..05 prontos; FIN-06 pronto_local** | Após a base integrada da PR #48 (`9de7c5ac6dea9b6822e3e4050519ff4048432f77`), FIN-06 endurece a implementação de rascunho pré-existente: política de cobrança aprovada com tipo de lembrete/dias antes/escalonamento estruturados, lembrete com responsável/conteúdo validado/`is_real_message` sempre falso, histórico imutável sem bloqueio automático (`is_blocking_action` fixo em `false` por `CHECK`), autorização restrita a `financeiro`/`admin`/`ti`, same-origin e auditoria transacional fail-closed com rollback. Migração aditiva `125-fin06-collection-hardening.sql`. `npm run test:l07-delivery:pg` 10/10 em duas execuções finais; `npm run typecheck`, `node scripts/qa-wave0-static.mjs` (5/5), `npm test` (196/196), `npm run test:migrations:pg` e `npm run build` verdes; `npm run test:l06-delivery:pg` 9/9 preservado. FIN-07..16 e ADM-01..12 fora desta sessão; sem produção. |
| L08 | Cliente e expansões | pendente | — |
| L09 | IA local e RAG | pendente | — |
| L10 | Integração final e pacote local | pendente | — |

## L00 — resultado (concluído)

Base revalidada em `931e028`. O estado real diverge bastante da fotografia da
auditoria de 28/09 citada no plano mestre: quase todos os achados de
infraestrutura já estavam corrigidos.

Verificado com execução, não com leitura:

| Verificação | Resultado |
|---|---|
| `npm ci` pelo lockfile | 62 pacotes, 0 vulnerabilidades, reproduzível |
| `tsc --noEmit` | 0 erros |
| `npx next build` | sucesso |
| Suíte unitária | 157/157 (antes do L01) |
| Migrações em banco vazio | 001–098 aplicadas, 498 tabelas |
| Repetição do runner | idempotente, checksum por arquivo, lock consultivo |
| Falha intermediária | `migration_checksum_mismatch` recusa e não faz rebaseline |
| IDs do checklist | 222 únicos confirmados |

Achados do plano mestre **já resolvidos** na base atual (não reabrir):
`scripts/migrate-site-visual.mjs` já listava 001–098 (não 001–004);
`client-security-api.mjs` não usa mais `req.json`/`res.status`;
`client-access-api.mjs` já tinha desafio MFA real para cliente;
`006-admin-identities.sql` já usa `DROP CONSTRAINT IF EXISTS` antes de recriar.

### Achado principal e ainda aberto do L00

**82 de 82 componentes administrativos estão órfãos.** Nenhum arquivo em
`src/app/admin/ti/*Client.tsx` é importado por qualquer página. A página
`src/app/admin/ti/page.tsx` é um protótipo descritivo de 28 linhas que declara
isso abertamente ("os componentes administrativos ainda não estão conectados a
esta página").

Ou seja: existem ~1.400 rotas de API, 499 tabelas e 82 telas ricas — e **nenhum
caminho de navegação até elas**. Esse é o maior obstáculo ao critério nº 1 de
"pronto local" ("ação acessível por navegação normal para o usuário correto"),
e é pré-requisito prático dos lotes L03–L08.

O roteiro pede reaproveitar esses componentes **por domínio**, sem despejá-los
na página de TI. Ver "Próximos passos".

## L01 — resultado (gate aprovado no escopo atacado)

Corrigido em `6b117f0`. Cada item foi reproduzido como falha antes da correção.

| ID | Correção | Prova |
|---|---|---|
| SEC-04 | Removido `rec.role \|\| "admin"`: identidade sem perfil não vira admin | integração 1 |
| SEC-04 | Só `status='active'` autentica (`pending_email` emitia sessão) | integração 2, 3 |
| SEC-04 | Sessão com estado no servidor: suspensão/rebaixamento/epoch derrubam na hora | integração 6, 7, 8, 9 |
| SEC-04 | Auditoria identifica a pessoa (identityId), não o papel | integração 5 |
| SEC-05 | Token compartilhado recusado por padrão e auto-desligado | integração 11 |
| SEC-06 | Desafio MFA anterior à sessão privilegiada de staff | integração 15, 18 |
| SEC-06 | Uso único, expiração, limite de 5 tentativas, replay TOTP e recuperação | integração 18, 19, 20 |
| SEC-02 | Cookie forjado/legado negado; erro de banco nega (fail-closed) | integração 12, 13 |
| SEC-02 | 15 endpoints administrativos negam sem sessão | integração 14 |
| — | Logout revoga no servidor | integração 10 |
| — | Rate limiting com `Retry-After` | integração 21 |

Detalhe e comandos em `docs/EVIDENCIAS-ENTREGA-LOCAL.md`.

### Risco introduzido e contido

`readAdminSession`/`requireSession` passaram a ser assíncronas em 42 módulos
(291 pontos de chamada). Uma chamada sem `await` devolve uma `Promise`, que é
sempre truthy: `if (!session) return 401` deixaria de barrar qualquer
requisição — desligando a autenticação de módulos inteiros em silêncio.

Contenção: `tests/staff-session-await-guard.test.mjs` quebra o build se o padrão
voltar. A guarda foi validada injetando uma violação real (ela acusou) e
revertendo.

### O que do L01 continua pendente após o L03

O L03 ampliou o catálogo de staff, retirou o bypass de admin/TI, implementou
escopos `own`/unidade/conta/contrato e separou remuneração e saúde. Esses pontos
não devem ser reabertos sem uma regressão concreta. O restante de L01 que ainda
permanece `a_revalidar`/`pendente` inclui:

- auditoria sensível durável com transação/outbox em todas as operações;
- revisão sistemática de limites de corpo, método, origem/CSRF e erros
  sanitizados nos fluxos que ainda não passaram por um lote;
- aplicação e prova das mesmas regras de identidade nos fluxos de
  convite/provisionamento de staff, não apenas no login;
- os demais IDs SEC cujo checklist ainda não contém evidência executada,
  especialmente troca de e-mail, privacidade, abuso e identidade.

## Bloqueios reais

1. **Sem GPU e com 16 GB (informado pelo proprietário; o plano citava 8 GB).**
   Afeta o dimensionamento do L09. Ainda não medido — Ollama não foi executado
   nesta sessão.
2. **SMTP e hospedagem externa fora de escopo** (decisão do proprietário).
   Implica caixa de saída local no L02; nenhum estado pode dizer "e-mail
   entregue".
3. **Ambiente de desenvolvimento é Linux; o alvo é Windows.** Os scripts
   PowerShell do L10 poderão ser escritos, mas não executados aqui. Isso precisa
   constar do aceite como verificação pendente no equipamento do proprietário.

## Próximos três passos

1. Revalidar campo a campo CRM-01..04 com cenários dedicados no gate (CRM-02 precisa de tela de contato com função decisor/influenciador/usuário/financeiro com preferências e restrições; unidade de CRM-01 segue sem rota de criação — hoje é fixture).
2. Fechar PUB-02/05 e PUB-06..09 (CMS, temas, SEO, montador de pacote — componentes órfãos em `src/app/admin/ti/*Client.tsx`, conectar por domínio; PUB-10 já entregue pelo PR #26).
3. Lembretes/notificações de CRM-08 seguem dependendo de provedor, autorização e opt-out; testes A/B de PUB-10 seguem fora por decisão registrada; CRM-10 (carteira), automação de mensagens, Windows, SMTP, hospedagem externa e aceite humano continuam fora por decisão registrada. Só depois avaliar L05.

## Retomada executável

```bash
npm ci
npm run test:unit                    # 186 testes, sem banco

# Gates em PostgreSQL real e descartável (nenhum toca banco do operador).
# Exigem DATABASE_URL e DATABASE_MIGRATION_URL vazias.
npm run test:migrations:pg           # migrações 001–103 + replay + checksum negativo
npm run test:l02-delivery:pg         # L02 — 14 testes HTTP
npm run test:l03-delivery:pg         # L03 — HTTP, duas identidades e Chromium headless
npm run test:l04-delivery:pg         # L04 — HTTP, Chromium real, jornada comercial completa
npm run test:staff-auth:pg           # L01 — autenticação de staff

npm run typecheck && npm run build
```

Os gates L03 e L04 usam `embedded-postgres`, Playwright e o Chromium
empacotado em `@sparticuz/chromium`; não baixam navegador durante a execução.
Nenhum comando acima precisa de segredo. **Atenção:** `node_modules/` não é
persistido entre sessões neste ambiente — rode `npm ci` no início de toda
sessão nova antes de qualquer gate.

## L02 — entrega local de arquivos, fila e comunicação (commit `4b95616`)

Concluído e provado por HTTP real contra PostgreSQL descartável
(`npm run test:l02-delivery:pg`, 14 testes):

| Frente | O que mudou | Prova |
| --- | --- | --- |
| Arquivos privados | Chave de 24 bytes gerada pelo servidor, `content_sha256` gravado e **conferido em todo download** | testes 1–5; adulteração em disco devolve 409 |
| Travessia de caminho | Nome enviado pelo cliente nunca vira caminho | teste 2: `../../../../etc/passwd` não escapa do diretório |
| Fila de notificações | Reivindicação atômica (`UPDATE ... RETURNING`) no lugar de `SELECT ... FOR UPDATE SKIP LOCKED` fora de transação | teste 8 + controle negativo: com o código antigo, "entregue 2 vezes" |
| Regex de UUID | `isValidUuid` tinha 4 grupos e recusava todo UUID canônico | teste 6 + controle negativo |
| Caixa de saída local | Estado `local_outbox`, `sent_at` nulo, corpo oculto na listagem, leitura auditada, vencida 410 | testes 9–14 |

Dois defeitos foram **provados por controle negativo**: o código antigo foi
restaurado, a suíte foi executada e exatamente o teste correspondente falhou.
Sem isso, um teste verde não distingue "corrigido" de "nunca quebrado".

### Correções colaterais encontradas durante o L02

- `client_documents.uploaded_by` tinha `CHECK IN ('marcelo','ti')` e passou a
  rejeitar os papéis `admin`/`rh` criados no L01 — regressão latente que
  derrubaria qualquer upload desses perfis. Corrigida na migração 101.
- Três contagens de migração fixas em literal (`98`) em `local-demo.mjs`,
  `qa-local-demo-persistent.mjs` e `demo-offline-snapshot.mjs` estavam
  defasadas desde a 099 e reprovavam instalação íntegra. Agora derivam do disco.

### Limitação declarada do L02

A trilha de **dump lógico** (`npm run test:backup-restore:pg`) não foi
exercitada: exige `pg_dump`/`pg_restore` 17, ausentes neste sandbox Linux
(`embedded-postgres` traz apenas `initdb`, `pg_ctl` e `postgres`) e sem pacote
disponível. A suíte recusa de forma explícita e não cria banco — não é um falso
verde. A trilha de **cópia fria com manifesto e sha256 por arquivo**, essa sim,
foi exercitada e passa, incluindo restauração em cluster isolado verificada por
HTTP (`npm run test:demo-local:pg`, QA-HOM-009).

## L03 — funcionário e RH (concluído localmente)

`/funcionario` é um portal móvel próprio, com identidade de empregado separada
da sessão de staff. `/admin/funcionarios` contém a jornada operacional principal
e conecta, no grupo “Processos HR-01..24”, os sete módulos históricos de RH.
Assim, EMP-01..19 e HR-01..24 deixaram de ser componentes órfãos.

O gate `npm run test:l03-delivery:pg` aplica as migrações 001–102 num PostgreSQL
descartável, inicia o servidor real, usa duas identidades de empregados e abre
as duas interfaces em Chromium headless. Ele prova:

- titular derivado exclusivamente da sessão e negação cruzada de perfil,
  documentos, escala, ponto, curso, uniforme/EPI e holerite;
- admissão, credencial temporária, troca obrigatória de senha e revogação por
  senha, papel, suspensão ou desligamento;
- upload privado com bytes/hash, revisão, publicação salarial por fonte
  autorizada e concessão salarial separada;
- escala versionada, correção, ausência, troca, passagem, ocorrência, curso,
  fechamento demonstrativo e acesso ao holerite próprio;
- recibo operacional de uniforme sem alegação de assinatura qualificada;
- fila offline no navegador limitada à ciência de procedimento, chave por
  empregado, idempotência/conflito no servidor e nenhuma cache de documentos
  médicos ou salariais;
- navegação móvel em 390×844 e RH em 1440×1000, sem rolagem horizontal nem
  respostas de API com erro durante o percurso.

Controles de L01 concluídos como dependência do lote: RBAC granular sem bypass
de admin/TI, aliases legados cobertos pela mesma borda, escopos
organização/unidade/contrato/próprio, remuneração e saúde separadas, e invalidação
material de sessões após alterações de papel, permissão, senha ou status.

## L04 — site, captação e comercial (jornada central concluída)

Gate `npm run test:l04-delivery:pg` (`scripts/qa-l04-delivery-postgres.mjs` →
`tests/l04-delivery.integration.test.mjs`) sobe PostgreSQL 17 descartável,
aplica 001–103, inicia `server.mjs` real e percorre em Chromium real e HTTP
direto: visitante anônimo em `/servicos`→`/contato` (captura de lead com
protocolo/consentimento/origem/campanha real, dedup/antispam por controle
negativo) → duas identidades de staff `comercial` distintas com RBAC
genuinamente diferente (só uma tem `proposals.approve_discount`) → conversão
de lead em oportunidade (idempotente) → vistoria → orçamento de mão de obra e
técnico → cenário de preço (incl. controle negativo de denominador inválido)
→ pedido de desconto com negação por autoaprovação, negação por falta de
permissão e aprovação real cruzada → edição de item pós-aprovação reabrindo a
aprovação (CRM-18) → proposta versionada com trava de item pós-envio (409) e
PDF real (bytes/cabeçalho conferidos) → entrega honesta (só caixa local,
nunca finge "entregue") → aceite seguro por link (`/proposta/aceite/[token]`,
tela pública nova) com token forjado 404, versão divergente 409, link
expirado 410, aceite real e reuso 410 → contrato mínimo idempotente (CRM-23)
→ varredura final autenticada de `/admin/leads` e `/admin/comercial` sem
rolagem horizontal, sem erro de console/5xx. Passou duas vezes consecutivas;
revalidado novamente ao final desta sessão junto com `npm test` (186/186),
`test:l02-delivery:pg` (14/14), `test:l03-delivery:pg` (1/1),
`test:migrations:pg` (103/103, 504 tabelas), `test:rag`, `tsc --noEmit` e
`next build` (72 rotas, incluindo `/admin/comercial` e
`/proposta/aceite/[token]`) — todos verdes, sem regressão.

### Achado principal do L04: trilha de auditoria quebrada desde a origem

`auth_access_audit.action` e `auth_access_audit.actor_kind` tinham um `CHECK`
desatualizado desde muito antes desta sessão: cerca de **175 valores de
`action`** já usados em `src/server/*.mjs` nos domínios `crm_*`, `cli_*`,
`ops_*`, `hr_*` e `emp_*` eram silenciosamente rejeitados pelo banco. Como os
inserts de auditoria estavam em `try/catch` mudo, nada quebrava na hora — mas
nenhuma dessas ações jamais gravou uma linha de auditoria. Corrigido de forma
aditiva na migração `103-l04-comercial-role-widening.sql` (mesma migração
também amplia `crm_companies.created_by` e `public_lead_status_audit.changed_by`
para aceitar os papéis `comercial`/`financeiro`, que já eram válidos em
`auth_staff_profiles` desde a migração 102, mas não nessas duas tabelas).

### Outros defeitos reais encontrados e corrigidos no L04

1. `src/server/discount-api.mjs`: a verificação de alçada (CRM-18) era um
   bloco que nunca bloqueava nada (comentário "para simplicidade, apenas
   auditar") — qualquer papel, incluindo o próprio solicitante, podia aprovar
   qualquer desconto. Corrigido: bloqueio de autoaprovação verificado primeiro,
   depois `hasPermission()` real contra `auth_permissions`, sem bypass por
   papel/admin.
2. `src/server/proposal-acceptance-api.mjs`: `require('node:crypto')` dentro de
   um módulo ESM — `ReferenceError` mudo (dentro de `try/catch`) que degradava
   o hash de IP do aceite. Corrigido para usar o `createHash` já importado.
3. `src/lib/public-lead-validation.mjs` descartava silenciosamente
   `origin`/`campaign`/`channel`/`email` enviados pelo formulário real de
   `/contato` — o PUB-03 (rastreio de origem/campanha) nunca teria funcionado
   mesmo com a tela certa. Corrigido com validação explícita desses campos.
4. `handleCreateLead` confiava em um `dedupKey` vindo do navegador — forjável
   por um cliente malicioso para colidir ou "roubar" o protocolo de outra
   pessoa. Corrigido: a chave passou a ser derivada só no servidor.
5. `AiBotWidget.tsx` disparava, em toda página pública, uma requisição não
   autenticada a um endpoint só-admin (`/api/ai-bot-config`), gerando 401 em
   série no console. Corrigido: só busca quando `showDevConfig` está ativo.
6. `/admin/leads/page.tsx` tinha um formulário de login do modelo antigo
   (token compartilhado), incompatível com a sessão real de e-mail/senha — a
   tela principal de caixa de entrada de leads estava, na prática,
   inacessível para um funcionário real. Substituída por login real.

### O que o L04 entrega e o que fica para a próxima sessão

**Entregue e provado:** captação pública real (PUB-01/03/04); conversão de
lead; todo o núcleo comercial CRM-11..27 (catálogo/equipamento, vistoria,
orçamento MO/técnico, parâmetros de custo, cenário de preço, alçada de
desconto real, proposta versionada com PDF real, entrega honesta, aceite
seguro com UI nova, contrato mínimo idempotente, relatórios/comissões/
biblioteca/parcerias conectados) — tudo em `/admin/comercial`
(`ComercialWorkspace.tsx`, novo).

**Não entregue nesta sessão (órfão ou não revalidado), documentado
honestamente no checklist item a item:**

- PUB-02/05 (páginas por segmento e FAQ assistida com handoff humano);
- PUB-06 (CMS), PUB-07 (temas), PUB-08 (SEO técnico) — componentes existem em
  `src/app/admin/ti/*Client.tsx`, nenhum conectado a uma página;
- PUB-09 (montador de pacote/comparador) — `/orcamento` deixou de simular
  preço, mas o montador/comparador administrativo (`PackageClient.tsx`)
  continua desconectado;
- PUB-10: a **mensuração** foi entregue (painel derivado de origem/conversão
  em `/admin/leads`, somente leitura e minimizado, provado por gate). Ficam
  fora, por decisão registrada, os **testes A/B** (dependem de tráfego,
  hipótese e tratamento de dados definidos) e exportação/gráficos.
  `OriginMetricsClient.tsx` foi **descartado** para esta finalidade e
  continua órfão: permitiria digitar métrica à mão;
- CRM-01..06: herdados de `/admin/crm` (página anterior a esta sessão), não
  revalidados a fundo — usados apenas indiretamente pelo gate L04 (a
  conversão de lead cria empresa/oportunidade real);
- CRM-07/08/10: tarefas/interações e agenda existem em `/admin/crm`, mas
  continuam parciais nas lacunas registradas; carteira CRM-10 ainda não tem
  jornada. CRM-09 deixou de ser schema órfão nesta continuação: modelos e
  tarefas manuais estão montados em `CadenceClient.tsx`, sem automação de
  mensagens.

**Risco residual anotado, não corrigido:** `handleAdminLeadStatus` em
`server.mjs` faz um insert de auditoria "solto" dentro de uma transação
multi-instrução sem `SAVEPOINT` — se esse insert falhar (por exemplo por um
futuro `CHECK` que volte a ficar desatualizado), toda a transação de mudança
de status pode ser revertida silenciosamente por causa só do log. O
comportamento correto hoje foi confirmado (a migração 103 fechou o `CHECK`
que causaria isso agora), mas o padrão em si não foi estruturalmente
hardenizado (faltaria isolar a auditoria em sua própria sub-transação ou
`SAVEPOINT`).

## O que NÃO está pronto

O sistema ainda não está integralmente entregue: PUB-02/05/06/07/08/09/10 e
CRM-01..08/10 do L04 (ver acima), L05–L10 e as cinco jornadas finais do L10 não
foram executados integralmente. CRM-09 foi entregue somente no recorte manual
descrito abaixo; automação de mensagens continua fora. SMTP e hospedagem
externa permanecem fora do escopo; Windows ainda exige aceite no equipamento do
proprietário. Os IDs tratados nesta continuação foram atualizados no checklist;
os demais conservam seus estados anteriores.

CRM-07 recebeu tarefas e histórico de interações, anexos, edição/exclusão,
contato, tipos e paginação; ganhou também edição de prazo com versão otimista,
paginação/busca/filtros de tarefas no servidor, delegação explícita com aceite
(decisão de equipe registrada: sem fila ampla) e, na última continuação, a
revisão campo a campo do kanban/tabela de CRM-05/06 e as notas internas
dedicadas — CRM-05, CRM-06 e CRM-07 estão pronto_local, provados pelo oitavo
cenário do gate. CRM-08 segue parcial em lembretes e visão de calendário por
período (fora desta entrega). CRM-10 e as lacunas PUB continuam pendentes.

## Continuação CRM-08 (commit `7ddd659`)

A agenda de visitas/reuniões deixou de ser apenas schema. `/admin/crm` passou a
ter a agenda da oportunidade e a agenda pessoal, servidas por
`src/server/crm-visit-api.mjs` e pela migração 107 (versão otimista, motivo e
marcas de cancelamento, contador de reagendamento e `crm_visit_participants`
com resposta individual). A política de escopo foi decidida e registrada antes
da rota: responsável gerencia, participante convidado apenas vê a própria
agenda e responde por si, papel administrativo não é bypass e nenhum diretório
de staff é exposto. Reagendar zera confirmações; cancelar exige motivo; estados
`realizada`/`cancelada` são finais. O vazamento residual de `visits` na rota
legada `GET /api/crm/opportunities/:id` foi fechado com a mesma política.

Provas históricas do CRM-08: `npm run test:migrations:pg` 107/107 (506 tabelas,
replay, clone e checksum negativo) e `npm run test:l04-delivery:pg` 4/4 com
HTTP real, Chromium real e PostgreSQL descartável. Nesta continuação, a rota
legada também passou a proteger `stages` por propriedade.

L04 continua **PARCIAL**. CRM-08 ainda não tem lembretes, visão de calendário,
detecção de conflito de horário nem vínculo com PUB-04; CRM-07 segue sem
delegação/equipe, edição de prazo e revisão integral de tarefas/kanban/busca;
CRM-10, lacunas PUB e a revalidação campo a campo de CRM-01..06 continuam
pendentes. Sem SMTP, hospedagem externa ou aceite Windows/humano.

## Continuação CRM-09 — cadências manuais (migração 108)

A UI em `/admin/crm` (`CadenceClient.tsx`) permite ao comercial criar/editar/
arquivar modelos privados e definir passos com título, intervalo de 0–365 dias,
canal sugerido e responsável derivado da sessão. Aplicar o modelo materializa
uma tarefa por passo com data futura calculada, responsável da sessão e o canal
apenas como metadado. Não há worker ou envio de e-mail/WhatsApp.

Rotas novas: `GET/POST /api/crm/cadences/templates`, `PATCH
/api/crm/cadences/templates/:id`, `GET/POST
/api/crm/opportunities/:id/cadences` e `PATCH
/api/crm/opportunities/:id/cadence-contact`. Só `comercial` ativo opera
modelos/aplicações; cada oportunidade segue a mesma borda individual de CRM-07.
Outro comercial, admin, Marcelo, TI, RH, sessão ausente e origem inválida são
negados conforme o caso. Aplicação é idempotente por modelo/oportunidade/
contato, captura o estado e não duplica tarefas.

Decisões da fatia, registradas antes da rota:
- criação, edição, arquivamento e aplicação de modelos: apenas o comercial
  proprietário, sem bypass administrativo; passos usados ficam imutáveis;
- aplicação em oportunidade de outra pessoa: proibida, mesmo para outro
  comercial e papéis administrativos;
- opt-out do contato: bloqueia novas aplicações e cancela tarefas de cadência
  abertas/em andamento; não ressuscita tarefa nem envia mensagem;
- oportunidade ganha/perdida: encerra a aplicação correspondente e cancela só
  pendências abertas/em andamento, preservando concluídas;
- contato desativado: encerra aplicações e cancela pendências pelo mesmo
  critério; o banco também mantém a razão do bloqueio;
- automação de mensagem: não autorizada nesta entrega; fica para decisão de
  negócio sobre autorização, base de opt-out e provedor antes de qualquer
  worker. Sem SMTP/provedor externo.

Gate CRM-09: `npm run test:l04-delivery:pg` passou 5/5 (inclui os quatro
recortes anteriores e o quinto cenário novo), com PostgreSQL descartável, HTTP
real e Chromium real sem `--disable-web-security`; SQL apenas para fixtures,
asserções, desativação sintética de contato e trigger de falha de auditoria.
`npm run test:migrations:pg` passou 108/108 em primeira aplicação/replay, clone
e checksum negativo. Regressão no SHA desta continuação: `npm test` 186/186,
`npm run typecheck` 0 erros, `npm run build` 70 rotas e `git diff --check`
sem erros; `next-env.d.ts`/`tsconfig.json` ficaram limpos.


## ADM-01..12 — painel funcional do Marcelo (02/10/2026)

`/admin/marcelo` era protótipo descritivo e passou a painel real: indicadores
calculados de registros canônicos com fonte/período/data-base, cada cartão
abrindo lista filtrada e registro autorizado, decisão unificada com alçada e
segregação, espaço de trabalho por identidade, relatórios limitados/auditados,
configurações versionadas, meta separada do realizado, diário CON-11 por
permissão e análises de expansão. Autorização decidida no servidor (anônimo
401, papel indevido 403, TI somente leitura); escrita sensível grava origem,
histórico, decisão e auditoria na mesma transação, e falha de auditoria devolve
503 revertendo tudo. Ausência de dado é declarada (`sem_registro_canonico_no_periodo`)
e falha de leitura é declarada (`indisponivel` com retry) — nenhuma vira zero.

Migração aditiva 138. API `src/server/adm-panel-api.mjs`. UI
`src/app/admin/marcelo/MarceloPanel.tsx`. Gate `test:l07-delivery:pg` de 37 para
**43 subtestes**, com duas execuções consecutivas limpas no SHA entregue;
regressões no mesmo SHA: L03 1/1, L04 20/20, L05 1/1, L06 9/9, `npm test`
196/196, `typecheck` 0, `build` exit 0, estático 5/5. Instabilidades
transitórias observadas e registradas sem mascaramento (subteste 22 legado do
FIN-10 em uma execução; L03 na baseline do commit base), sem alterar timeout,
skip ou assertiva.

Componentes órfãos de `/admin/ti`: inventariados por prova em
`docs/INVENTARIO-ADMIN-TI.md` — 0 promovidos, 2 adaptados, 80 dívida explícita.

ADM-01..12 ficam `pronto_local` com **aceite humano pendente** (Marcelo/Andreia
não validaram). L07 não está concluído; L08 não foi iniciado.

## L08 — decisão de sequência e primeira fatia (02/10/2026)

A PR #77 está mergeada na main oficial (`06be226`). L07 foi encerrado no escopo
local e aceito humanamente por Marcelo e Andreia. Windows não foi homologado:
permanece pendente e adiado para o fechamento integral do sistema. A transição
para L08 foi autorizada pelo proprietário. A decisão dos 80 componentes órfãos
permanece: promoção por área somente com prova; até lá são protótipos.

CLI-01..05 foram consolidados sobre a fonte canônica legada das migrações 003–005
(`auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`,
`client_documents`, `client_tickets` e auditorias), sem duplicar a fonte v2.
Rotas reais: `/cliente/entrar`, `/cliente/app/conta`, `/cliente/app/contratos`,
`/cliente/app/documentos`, `/cliente/app/chamados`; APIs correspondentes em
`/api/auth/*` e `/api/client/*`. O gate `test:l08-delivery:pg` prova isolamento
A/B, autorização derivada da sessão, corpo forjado sem ampliação, download
privado, histórico e erros de acesso. CLI-06..15 e EXT-01..17 não foram
promovidos.

## Série L08 hardening — 02/10/2026

- **Lote/base:** L08 hardening da primeira fatia, baseado na `main` oficial em `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc`; PR #78 confirmada mergeada nesse merge commit e presente na main. Branch de trabalho: `arena/l08-hardening-20261002`.
- **Mudança:** o subteste Chromium deixou de usar apenas `setContent` sintético. Agora inicia o servidor real em loopback, navega por HTTP para `/cliente/entrar` com Chromium empacotado e verifica heading e campos reais. PostgreSQL continua descartável; não há sessão ou dado inventado no smoke.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica: `auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`, `client_documents`, `client_tickets` e auditorias. Nenhuma migração criada; 001–138 permanecem imutáveis; próxima livre: 139.
- **Prova automática L08:** 11/11 em duas execuções (a segunda execução deverá ser registrada no relatório final desta série), incluindo 8 subtestes de isolamento/autorização/forged body/download/auditoria/revogação, inventário canônico e jornada Chromium real.
- **Regressões:** estático 5/5, typecheck OK, build exit 0. A execução unitária inicial no ambiente desta sessão teve falhas ambientais pré-existentes relacionadas à versão Node 20/dependências do conjunto de backup/homologação; não foram mascaradas nem alteradas. Windows não foi executado e continua pendente.
- **Classificação:** implementação local + validação automática Linux/PostgreSQL descartável. Aceite humano anterior de Marcelo e Andreia permanece preservado; isto não constitui aceite novo nem homologação Windows.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações externas. Próximo passo: revisão humana da PR; merge somente após revisão, sem merge automático.

## Reconciliação pós-PR #83 — 03/10/2026

A `main` oficial em `31834ec` já contém a PR #83 (`4a5a4a9`), posterior à PR
#80. Esse lote implementou o hardening transacional de CLI-01..05 descrito em
`ENTREGA-L08-RELATORIO-2026-10-02-ATOMICIDADE-CLI01-05.md`: auditoria
fail-closed, atomicidade, download privado antes dos bytes, idempotência
concorrente de chamados/documentos e jornada completa de acesso no gate L08.
A migração aditiva `139-l08-client-space-atomic-idempotency.sql` é a última da
sequência contínua 001–139; 001–138 permanecem imutáveis e a próxima livre é
140.

Revalidação desta base no Linux/Node 22: estático 5/5, typecheck, unitários,
build, migrações 139/139, L03, L04, L05, duas execuções L07 (43/43) e duas
execuções L08 (50/50) passaram. L06 terminou 8/9: o subteste 8 sofreu SIGSEGV no
lançamento do Chromium (`Target page, context or browser has been closed`); a
falha foi preservada, sem skip, relaxamento de assertiva ou aumento de timeout.
Nenhum requisito adicional foi promovido por esta reconciliação. CLI-06..15,
EXT-01..17, APIs v2 não promovidas, órfãos de `/admin/ti`, fornecedor restrito e
integrações externas continuam fora do escopo. O aceite humano anterior de
Marcelo e Andreia permanece; não houve novo aceite humano nem homologação
Windows.

A matriz obrigatória foi repetida após esta atualização documental e terminou
integralmente verde, inclusive L06 9/9; o SIGSEGV anterior não recorreu. L07
passou 43/43 duas vezes e L08 passou 50/50 duas vezes.

## Resiliência de Interface e Separação de Sessões pós-PR #85 — 03/10/2026

- **Lote/base:** L08 pós-merge da PR #85, baseado na `main` oficial em `8eae38ae7ce84b9a824a63d469d36e03a3b0a5c0`. Branch de trabalho: `arena/01a0fffd-gruposegsystemseguranca`.
- **Mudança:** resiliência das telas do portal do cliente (`ClientSpaceProvider`, `/cliente/app`, `/contratos`, `/documentos`, `/chamados`, `/seguranca`) com retry explícito (`Tentar novamente`) em alertas e distinção de falha do provedor de contas; adicionado subteste de separação estrita de sessões staff × cliente em `tests/client-space.integration.test.mjs`.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica (`auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`, `client_documents`, `client_tickets` e auditorias). Nenhuma migração criada; 001–139 imutáveis; próxima livre: 140.
- **Validação:** estático 5/5 OK, typecheck OK (`tsc --noEmit`), unitários 196/196 OK, build 78 páginas OK (`next build` Turbopack).
- **Classificação:** implementação local + validação estática/unitária/build. Aceite humano local de Marcelo e Andreia sobre L07 preservado; homologação Windows continua pendente e adiada até o fechamento integral.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações externas. Próximo passo: PR contra main para revisão humana; sem merge automático.

## EXT-06 — satisfação/carteira (2026-10-03)

Implementada na migração 152 sobre a fonte CLI-11, sem seed e sem copiar `ext_satisfaction_surveys`. Rotas reais: staff `/admin/satisfacao` + `/api/ext/satisfaction/*`; cliente `/cliente/app/satisfacao` + `/api/client/satisfaction-surveys`. Resposta imutável, regra de acompanhamento por pesquisa, responsável CRM fail-closed, evento/auditoria/idempotência na mesma transação e projeção cliente mínima. Validação dedicada: `test:ext06-satisfaction:pg` (PostgreSQL 17 descartável).

## EXT-07 (2026-10-03)
A base da sessão é o merge da PR #101 (`efc74bacb7a23314db1d267d91438519dc342a8c`), sem divergência inicial. A implementação aditiva 153 preserva linhas 086 como `registro_legado`; a comprovação documental é referência privada declarada, sem bytes/arquivo verificado. Gate dedicado EXT-07 foi criado; validação PostgreSQL completa e aplicação em destino permanecem pendentes quando o ambiente não fornece o cluster descartável.

## EXT-07 hardening (2026-10-03, base PR #103)
Base da sessão: merge da PR #103 (`eff0bbddb5d5681d2612010e4349cfb9ff61234b`; pais `efc74ba` main + `3cf218d` feature). O probe obrigatório em PostgreSQL 17 descartável com servidor HTTP real e sessão staff real reproduziu lacunas estruturais da entrega 153: a rota canônica `/api/ext/compliance/*` não estava registrada na borda API (Next devolvia 404 HTML), o regex de data duplo-escapada impedia qualquer criação de documento por HTTP, anônimo ficava sem resposta (sem 401) e o gate anterior não exercitava HTTP. A migração 155 (aditiva sobre a 154 do main vinda do PR #113, `NOT VALID` onde necessário, comparações enum com `::text`) corrige os índices de versão corrente, adiciona o estado terminal `substituida` para renovação formal, fail-closed de tarefa sem responsável, coerência temporal vigente/vencida no INSERT/UPDATE e constraints de versionamento. A API ganhou 401/403 corretos, detalhe com allowlist, listagem de tarefas, renovação versionada e avaliação temporal exclusivamente na data do servidor com fatos/denominador/ausência distinta de zero. O handler legado EXT-10 teve `ca.name` corrigido para `ca.display_name` (listagem quebrada desde 086 — reproduzida pelo gate). Gate reescrito com HTTP real: `test:ext07-compliance:pg` **37/37**, sem fail/skip/todo. Validação: `qa-wave0-static` 5/5 (001–155), typecheck, `npm test` 457/457, build 92 páginas com `/admin/compliance`, migrações 155/155 com clone negativo, EXT-04 28/28, EXT-05 33/33, EXT-06 36/36. Referência documental permanece declarada: sem upload, bytes, checksum, malware scan, armazenamento verificado ou download; sem ator externo; avaliação é operação administrativa explícita (execução agendada é pendência). Relatório: `docs/ENTREGA-RELATORIO-2026-10-03-EXT07-COMPLIANCE-HARDENING-MIGRACAO-155.md` (a camada 154 do main tem relatório próprio no arquivo sem sufixo, preservado do PR #113).

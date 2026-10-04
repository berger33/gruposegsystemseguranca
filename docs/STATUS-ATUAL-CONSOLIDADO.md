# Status atual consolidado — reconciliação F00 + F01 + jornadas F03

## Atualização F03 — cliente → chamado → atendimento → aceite

**Base confirmada:** `origin/main` `a459e07d42a855f93af4d76d047b49f3ff5e204e` (merge da PR #127, conferido por `git fetch origin main`); **branch fixa:** `arena/01a107a9-gruposegsystemseguranca`; **commits:** `3c7e9ab1da469b94d7cf383491f9240df30a8b6e` (implementação) e documentação desta seção; **PR:** [#129](https://github.com/berger33/gruposegsystemseguranca/pull/129), **integrada pelo merge normal `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`** (14 checks publicados verdes antes do merge). #126, #127 e #129 estão integradas e não devem ser recriadas nem remescladas.

A migração aditiva **158** (`158-f03-client-ticket-acceptance.sql`) cria `client_ticket_messages` (trilha com chave/impressão de idempotência por autor, índices únicos parciais e trigger de validação), amplia os checks de `changed_by` e registra `ticket_attend`/`ticket_resolve`/`ticket_accept` em `auth_access_audit`; 001–157 imutáveis. O manifesto PG, Wave 0, asserção EXT-07 e relatório de evidência passam ao ledger 001–158. A fila canônica `GET /api/admin/client/l08/tickets` exige `client.tickets.read` (fail-closed, recorte pelas concessões) e as transições em `PATCH` exigem `client.tickets.write` por conta com `open|waiting_client → in_progress → resolved` e devolutiva 5–1000; a aceitação `PATCH /api/client/tickets/:id/accept` é do cliente (`resolved → closed`, `closed_at`). Legados `waiting_client` retomam SLA na transação. Escrita CLI-05 legada responde 410 `legacy_cli_ticket_write_retired` após as guardas de sessão.

**Evidência atual:** `node scripts/qa-wave0-static.mjs` (**5/5**), `npm run typecheck`, `npm test` (**526/526**), `npm run test:f03-client-ticket-acceptance:pg` (**1/1**, PG17 descartável + HTTP + Chromium nas duas personas), `npm run test:l08-delivery:pg` (**51/51**), client-space (**22/22**), `npm run test:client-access:pg` (**27/27**), `npm run test:f03-lead-to-implementation:pg` (**1/1**), `npm run test:f03-employee-request-rh-return:pg` (**1/1**), `npm run test:demo-local:pg` (OK), `git diff --check` e `node --check`.

**Falhas reais e correção, sem enfraquecer asserções:** helper da suíte client-space só anexava `Idempotency-Key` em POST de dois paths (PATCHes perdiam a chave; corrigido para honrar a chave sempre que fornecida); asserção de transição prematura referenciava variável inexistente (substituída por chamado irmão criado via HTTP, resolvendo de `open` ⇒ 409); a consulta da trilha ordenava por coluna inexistente (ordenação por `id`); uma execução do gate falhou na subida do servidor dev por health timeout ambiental (repetida limpa com sucesso; flakiness acompanhada); inventário L08 re-expandido com as rotas canônicas.

F03 permanece **em execução**: esta é a terceira jornada (após #126 lead→implantação e #127 funcionário→RH); falta contas→baixa→relatório, além do aceite humano e Windows/EPERM. Sem dados reais, segredos em git/logs, SMTP, banco bancário, eSocial, assinatura externa, hosting permanente ou IA externa.

## Atualização F03 — funcionário → solicitação → análise RH → retorno

**Base confirmada:** `origin/main` `7a41837385985e2321fc86f8b461f133d7c01423` (PR #126 já integrada normalmente); **branch fixa:** `arena/01a10761-gruposegsystemseguranca`; **commits:** `d0f1cdebfb5fecac2fc7bb639b554faf1724a7b7` (implementação) e `fcddf69` (evidência/documentação); **PR:** [#127](https://github.com/berger33/gruposegsystemseguranca/pull/127), **integrada pelo merge normal `a459e07d42a855f93af4d76d047b49f3ff5e204e`**. Portanto #126 não deve ser recriada nem mesclada de novo, e a #127 não deve ser reaberta/remesclada.

A migração aditiva **157** introduz chave/impressão de idempotência e índices únicos parciais para `emp_self_requests` e `emp_self_request_followups`; 001–156 não foram alteradas. O manifesto PG, Wave 0, a asserção EXT-07 e o relatório de evidência foram atualizados para o ledger 001–157. A API canônica vincula criação ao funcionário da sessão, exige mesma origem e `Idempotency-Key`, e usa lock/transaction/auditoria em conjunto. A fila RH requer as permissões reais `employees.read`/`employees.write` com escopo e permite somente `solicitado → em_analise → aprovado|rejeitado` com mensagem explícita. O portal exibe somente a solicitação do titular e seus retornos; `RhWorkspace` usa essa fila canônica e declara corretamente que não há SMTP.

O caminho EMP-12 legado foi inspecionado: permitia escrita sem a máquina de estados, escopo granular, idempotência ou auditoria transacional. Suas mutações foram aposentadas com 410 `legacy_emp12_write_retired` (inclusive follow-up mutável), deixando leitura de compatibilidade; o gate prova a recusa e a ausência de mudança no registro.

**Evidência atual:** `npm ci` (82 pacotes/0 vulnerabilidades), `node scripts/qa-wave0-static.mjs` (5/5), `npm run typecheck`, `npm test` (**526/526**) e `npm run test:f03-employee-request-rh-return:pg` (**1/1**, PG17 descartável + HTTP + Chromium) passaram; `git diff --check` e `node --check` também passaram. O gate cobre negações, A/B, concorrência/replay/conflito, rollback por auditoria, retry e UI de funcionário/RH/funcionário com monitoramento de console/page/5xx e overflow móvel.

**Falhas encontradas/reparadas, sem reduzir prova:** o primeiro run falhou no guard de manifesto 001–156; a solução foi registrar 157 em todos os pontos, não ignorar o guard. O banco real expôs conflito de inferência enum/texto nos placeholders da criação/fila/revisão; foram separados/castados explicitamente. O Chromium expôs seletor de `meta[name=description]`, limitação `--single-process` entre contextos e corrida do refresh do RH; o teste agora usa seletor de textarea, processos de navegador isolados por papel e espera a confirmação antes da segunda mensagem.

F03 permanece **em execução**: esta é a segunda jornada após a #126; cliente→chamado→aceite, contas→baixa→relatório, aceite humano e Windows/EPERM continuam pendentes. Sem SMTP, banco bancário, eSocial, assinatura externa, dados reais, hosting ou IA externa.


Data: 2026-10-04. Base da fatia: `origin/main` em `972e6563f5ea4888b62e88b8c126a925d79f6068`; branch `arena/01a1073d-gruposegsystemseguranca`; PR #126, commits `c1a557f`/`e45e41b`. Todos os checks publicados da #126 passaram; a PR #125 (`e2fa152`) já foi integrada pelo merge acima.
Método: [matriz declarada no checklist](CHECKLIST-ENTREGA-LOCAL.md) cruzada com código, telas, migrações 001–156, gates e PRs do GitHub. Auditoria de terreno: [docs/auditoria-2026-10-04/AUDITORIA.md](auditoria-2026-10-04/AUDITORIA.md).

## Atualização da fatia F03 — PR #126

A primeira jornada de negócio foi implementada sem nova migração: lead público → conversão transacional em empresa/contato/oportunidade → proposta com revisão e versão enviada → aceite server-side → contrato L05 e checklist de implantação. O gate `npm run test:f03-lead-to-implementation:pg` passou 1/1 em PostgreSQL 17 descartável, HTTP real e Chromium; incluiu bloqueio pré-aceite, retry concorrente sem duplicação, rollback por falha de auditoria, RBAC/origem e isolamento de clientes A/B. A UI retorna a implantação/checklist no detalhe, expõe erro de listagem e distingue lista vazia.

A alteração de conversão CRM-04 passou `npm run test:l04-delivery:pg` (20/20), a fronteira L05 passou `npm run test:l05-delivery:pg` (1/1), e as validações gerais passaram: `npm run typecheck`, `npm test` (526/526), `npm run build` (94 páginas), `git diff --check`. A primeira execução do gate encontrou o guard de nome `seg_qa_` do migrador; o runner foi corrigido para o `seg_demo_local` canônico em cluster loopback descartável e repetido com todas as asserções. F03 permanece em execução: três jornadas, aceite humano e limites externos continuam pendentes.

Este documento é o inventário único de trabalho exigido pela etapa F00 do [plano](auditoria-2026-10-04/02-PLANO-ARENA.md). Estados `pronto_local` vêm de validação automática anterior: não são aceite humano nem homologação Windows. "Teste vigente" aponta o gate que valida o requisito hoje, sem prometer cobertura total da jornada.

## Sumário executivo

- 222 IDs transcrevidos 1:1 do checklist, sem renumerar.
- Maioria `pronto_local` por gates automáticos; aceite humano formal pendente para RH/funcionário/clientes e jornadas integradas.
- **F01 (entrada e navegação) foi integrada pela PR #122**: `/admin` hub, `/admin/entrar`, retorno seguro, menu por papel e logout revogável. A expansão do `AdminGate` às 28 páginas restantes foi integrada pela PR #125 (`e2fa152`), com aceite humano ainda pendente.
- **F03 está em execução após a fundação da massa sintética**: além do bootstrap transacional/idempotente e do gate `test:demo-local:pg`, a PR #126 prova a primeira jornada lead→oportunidade→proposta revisada→contrato→implantação com HTTP/PG/Chromium. Três jornadas permanecem pendentes; F03 não está concluída.
- EXT-06 estava `a_revalidar` na auditoria: a PR #101 (EXT-06 satisfação) **está mesclada no main** (migração 152 + gate 36/36 declarado); a alternativa #102 foi fechada sem merge na limpeza pós-F00. Resta aceite humano/Windows.
- PLT-01 estava `a_revalidar`: a PR #118 (despacho à prova de rejeição) **está mesclada no main** com testes e workflow próprios.
- EXT-08 a EXT-17 e AI-01 a AI-10: existem tabelas (086–087, 095–096) e handlers legados; **sem jornada UI→API→PG provada** — não contar como entregues.
- Os 82 componentes `src/app/admin/ti/*Client.tsx` seguem órfãos (L00): protótipo descritivo em `/admin/ti`, sem prova de gate. Nenhum é promovido por existência.

## PRs reconciliados no GitHub — limpeza concluída após a PR #122

| PR | Tema | Classificação | Razão |
|---|---|---|---|
| #126 | F03 — lead até implantação | **em validação nesta branch** | primeira jornada sobre `origin/main` `972e656`; implementação `c1a557f`, gate HTTP/PG/Chromium, sem migração nova |
| #125 | F01 — gate nas 28 páginas administrativas restantes | **integrada** | reaplicou o escopo válido da #124 sobre o main pós-#123; sem API/migração nova; merge `972e656` |
| #124 | F01 — gate nas páginas administrativas restantes | fechada como superseded | diff correto como envelope, mas base antiga e `CONFLICTING`/`DIRTY`; checks conferidos e trabalho preservado na #125 |
| #121 | docs/auditoria-2026-10-04 (instruções Arena) | fechada sem merge próprio | conteúdo incorporado, reconciliado e integrado pela #122 |
| #104–#117 (12 PRs) | EXT-07 compliance (alternativas) | superseded — não mesclar | main já contém EXT-07 completo: #103 (jornada 153), #113 (154), #115 (hardening 154+155), #118 (PLT-01), #119 (agendador 156) |
| #102 | EXT-06 satisfação/carteira | superseded — não mesclar | EXT-06 foi mesclada pela PR #101 (migração 152); gate ext06 36/36 declarado |
| #79, #81, #82, #84, #86 | L08 CLI hardening (alternativas) | superseded — não mesclar | CLI-01..15 mesclados pelas PRs #78–#95; migração 139 e gates L08 presentes no main |
| #47, #53, #59, #60, #62, #67, #70, #72, #75 | FIN-05/FIN-10/FIN-13/FIN-14..16 (alternativas) | superseded — não mesclar | FIN-01..16 mesclados pelas PRs #57–#77; matriz L07 fechada com gate 43/43 |

Ação executada em 04/10/2026 após o merge da #122: as **27 alternativas superseded** listadas acima foram fechadas sem merge, cada grupo com comentário apontando a linha oficial; a #121 também foi fechada porque seu conteúdo documental já estava integrado pela #122. A contagem anterior de “26” era um erro aritmético documental: 12 + 1 + 5 + 9 = 27. A #124 foi revisada contra o main pós-#123, fechada como `superseded` por conflito e substituída pela #125; nenhum commit das alternativas antigas foi mesclado.

## Matriz reconciliada dos 222 requisitos

Legenda do estado confirmado: `pronto_local` = validação automática local anterior; `a_revalidar` = exige prova nova antes de qualquer promoção; `em_execucao` = trabalho em curso; `pendente_externo` = depende de integração fora do escopo. Em todos: aceite humano e Windows seguem pendências globais (F16).

### SEC — contexto comum do grupo

- Telas: /admin/entrar (nova, F01), /admin/clientes, /cliente/entrar.
- APIs: /api/admin/session, /api/auth/*, /api/admin/permissions, /api/admin/rbac.
- Tabelas canônicas: auth_identities, auth_credentials, auth_staff_profiles, auth_staff_sessions, auth_permissions, audit_log (006,010,099).
- Papéis: staff admin/ti/rh/marcelo (+supervisor/comercial/financeiro previstos), cliente.
- Teste vigente: test:staff-auth:pg; staff-auth-hardening; staff-session-await-guard; l03-security.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| SEC-01 | Inventariar rotas, APIs, tabelas, jobs, permissões e documentação no commit atual | em_execucao | em_execucao (esta reconciliação F00 é o mapa rota-a-rota pedido) | Falta o mapa completo rota-a-rota por ID (real/parcial/prévia/ausente). | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-02 | Corrigir verificações de escopo para negar por padrão em qualquer erro | pronto_local (parcial) | pronto_local (parcial) | Parcial: cobre autenticação de staff. Escopo por unidade/contrato em consultas de negócio ainda a revalidar (L02+). | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-03 | Associar documentos a conta/unidade/contrato/classificação e aplicar autorização uniforme | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-04 | Login individual de staff, papéis, convites e revogação | em_execucao (autenticação e revogação prontas; navegação por papel ausente) | em_execucao — autenticação/revogação prontas; F01 entrega entrada e navegação por papel | NÃO atende ainda o aceite completo: "Andreia acessa RH" exige tela de RH acessível, e os 82 componentes administrativos continuam órfãos (ve | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-05 | Substituir tokens compartilhados por autenticação individual com migração controlada | pronto_local | pronto_local | Procedimento de recuperação administrativa documentado em docs/ESTADO-EXECUCAO-LOCAL.md; sem aceite humano. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-06 | MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit | pronto_local | pronto_local | Chave CLIENT_MFA_ENCRYPTION_KEY ausente mantém MFA indisponível (503), nunca rebaixa para senha. Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-07 | Corrigir troca de e-mail e handlers HTTP | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-08 | Migrações rastreadas e executáveis | pronto_local | pronto_local | Contagens fixas substituídas por leitura do disco. Não executado em Windows. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-09 | Reparar suíte e testar APIs reais | em_execucao | em_execucao | Cobertura ainda concentrada em autenticação e infraestrutura; jornadas de negócio sem teste de ponta a ponta. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-10 | Consolidar orçamento/simulador e catálogo | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-11 | Separar prévias e recursos reais | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-12 | Privacidade e declarações de aprovação verificáveis | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-13 | Segurança de sessão, CSRF, origem e erros | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-14 | Auditoria durável e operacional | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| SEC-15 | Proteção de abuso e identidade | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### PUB — contexto comum do grupo

- Telas: / (site), /servicos, /segmentos, /orcamento, /contato, /faq, /conteudos, /pacotes, /simulador, /proposta/aceite/[token]; /admin/publicacao, /admin/visual, /admin/leads.
- APIs: /api/public/leads, /api/seo-*, /api/public/*, /api/admin/publication, /api/admin/site-visual.
- Tabelas canônicas: public_leads (002,013), site_visual* (001), cms_* (088), temas (089), seo (090,112), pacotes (091), origem (092), pub handoff (094).
- Papéis: público anônimo; staff marcelo/ti/comercial na publicação e leads.
- Teste vigente: gate L04 20/20 (qa-l04-delivery-postgres); seo-technical; public-lead-validation; service-catalog.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| PUB-01 | catálogo único dos seis serviços validados no projeto; cada item tem descrição, público… | pronto_local | pronto_local | Nenhum novo serviço (ex.: cerca elétrica) foi adicionado; catálogo permanece fechado aos 6 validados. Sem tela de administração do catálogo  | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-02 | páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados;… | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Aceite visual e revisão do conteúdo pelos responsáveis pendentes. Teste funcional móvel não é certificação WCAG nem ensaio de carga. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-03 | orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pe… | pronto_local | pronto_local | Responsável de atendimento por lead ainda é atribuído manualmente em `/admin/leads`, sem regra automática de distribuição. Antispam é básico | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-04 | visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa… | pronto_local | pronto_local | Notificação ao solicitante sobre confirmação de horário usa a caixa local (L02) — nunca promete envio real (SMTP fora de escopo). Sem tela d | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-05 | FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou praz… | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | LLM/RAG pertence a L09. Atendimento humano só é solicitado após persistir o formulário com consentimento; sem SMTP ou promessa de atendiment | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-06 | CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e … | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Textos e autorização de cases precisam de aceite humano antes de uso real. Texto simples; sem novo upload público. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-07 | temas com preview, publicação autorizada, configuração persistida e rollback; preferênc… | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Tokens aplicados às superfícies editoriais; seleção dos dez layouts permanece em `/admin/visual`. Portais internos não são redesenhados. Ace | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-08 | SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preserv… | pronto_local (limites externos/condicionais descritos abaixo) | pronto_local (limites externos/condicionais descritos abaixo) | **Verificação de domínio fica FORA por fronteira externa** (exige DNS/HTTP no domínio real) — em vez de um botão que mente, o caminho que fa | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-09 | montador de pacote/comparador de serviços e planos somente a partir de catálogo e regra… | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Sem tabela de preço inventada, compatibilidade de equipamento garantida ou contratação automática. Precificação segue vistoria/orçamento/pro | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PUB-10 | mensuração de origem e conversão com minimização de dados; testes A/B somente após tráf… | pronto_local (limites externos/condicionais descritos abaixo) | pronto_local (limites externos/condicionais descritos abaixo) | **Testes A/B continuam sem rota e sem tela, por decisão registrada** — o requisito os condiciona a tráfego, hipótese e tratamento de dados d | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### CRM — contexto comum do grupo

- Telas: /admin/crm (unidades, contatos, dedup, agenda, tarefas, cadências, notas, kanban, interações, visitas), /admin/leads, /admin/carteira.
- APIs: /api/crm/* (units, contacts, dedup, tasks, agenda, cadences, notes, interactions, visits, opportunities, proposals, reports).
- Tabelas canônicas: crm_* (014–031, 104–116, 117) e tabelas crm derivadas.
- Papéis: staff marcelo/comercial/ti/admin conforme ação.
- Teste vigente: gate L04 20/20 + integrações lead-flow; 103 (comercial role widening); CRM-03 gate dedup 15/15 em duas execuções.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| CRM-01 | cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, … | **pronto_local** (superfície dedicada de unidades entregue nesta continuação; aceite humano pendente) | **pronto_local** (superfície dedicada de unidades entregue nesta continuação; aceite humano pendente) | nenhum mapa externo, geocodificação ou integração de terceiros nesta fatia. Aceite humano/Windows continuam pendentes; L04 segue parcial e L | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-02 | contato com função no processo de compra (decisor, influenciador, usuário, financeiro),… | **pronto_local** (superfície dedicada entregue nesta continuação; aceite humano pendente) | **pronto_local** (superfície dedicada entregue nesta continuação; aceite humano pendente) | nenhum envio externo, SMTP, unidade ou sincronização externa entra nesta fatia. A coluna legada `crm_contacts.company_id` permanece nullable | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-03 | importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revis… | pronto_local (gate L04 15/15 em duas execuções consecutivas, PostgreSQL descartável e Chromium real) | pronto_local (gate L04 15/15 em duas execuções consecutivas, PostgreSQL descartável e Chromium real) | sem aceite humano do proprietário. Mesclagem/atualização do registro existente, deduplicação de contatos e revisão de lotes antigos pela tel | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-04 | converter lead do site em contato/oportunidade preservando histórico; tratar duplicidad… | pronto_local | pronto_local | Tratamento de duplicidade é feito pela chave de empresa informada manualmente no prompt; não há resolução automática de contato sem empresa. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-05 | oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado,… | pronto_local | pronto_local | Criação/edição de unidade segue sem rota própria (escopo CRM-01; o gate usa fixture SQL declarada). `service_id` do catálogo é validado quan | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-06 | funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → env… | pronto_local | pronto_local | Sem drag-and-drop no kanban (movimentação por painel de detalhe, deliberado). Aceite humano/Windows não executado. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-07 | kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anex… | pronto_local | pronto_local | aceite humano/Windows | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-08 | agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e … | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | SMTP, push e calendário externo não configurados. Lembretes desta entrega são internos à agenda; não funcionam como notificação em segundo p | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-09 | cadências de prospecção inicialmente como tarefas; automação de mensagens depende de au… | pronto_local (recorte manual; automação externa pendente) | pronto_local (recorte manual; automação externa pendente) | Canal é apenas sugestão; não há envio automático, worker, SMTP ou provedor. Opt-out cancela pendências abertas/em andamento; ganho/perda e c | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-10 | carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem … | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Carteira pessoal conforme política anterior; ganho não representa recebimento. Implantação e efeitos contratuais pertencem a L05. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-11 | separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato q… | pronto_local | pronto_local | Locação/comodato como modalidade de cobrança não foi exercitada explicitamente no gate; existe no schema. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-12 | equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia… | pronto_local | pronto_local | Ligação com estoque físico não foi exercitada (fora do escopo local declarado). | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-13 | vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, foto… | pronto_local | pronto_local | Fotos autorizadas e checklist completo por serviço não foram exercitados byte a byte; o gate cobre os campos estruturais. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-14 | orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, ben… | pronto_local | pronto_local | Todos os componentes de custo (benefícios, provisões, substituição etc.) existem no schema; o gate não confere cada um isoladamente, só a cr | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-15 | orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, i… | pronto_local | pronto_local | Garantia e manutenção como campos foram criados no schema; não foram todos exercitados individualmente pelo gate. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-16 | parâmetros de tributos/custos/jornada versionados com validade, fonte e aprovador; nenh… | pronto_local | pronto_local | Fonte/aprovador de cada parâmetro não foram auditados um a um; o gate cobre o efeito (bloqueio) e não o cadastro completo de todas as alíquo | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-17 | cenários de preço e margem, separando margem de markup. Para tributos proporcionais à r… | pronto_local | pronto_local | Aprovação contábil formal do cenário é um campo/flag no fluxo, não uma integração externa real; permanece decisão local, não contábil oficia | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-18 | alçadas de desconto e exceções; motivo, solicitante, aprovador e versão. Alteração de i… | pronto_local | pronto_local | A concessão de `proposals.approve_discount` ainda é feita nesta entrega via inserção direta em `auth_permissions` para fins de prova; não há | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-19 | proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões… | pronto_local | pronto_local | Reajuste previsto e condições contratuais complexas existem como campos; não foram todos exercitados individualmente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-20 | estados rascunho → revisão → aprovada para envio → enviada → aceita/recusada/expirada/s… | pronto_local | pronto_local | Estados aceita/recusada/expirada/substituída são exercitados via o fluxo de aceite (CRM-22/23), não isoladamente aqui. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-21 | envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/lei… | pronto_local | pronto_local | Assinatura por integração (DocuSign etc.) não existe e não está no escopo local; aceite é só o link seguro (CRM-22). | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-22 | aceite por link seguro, expirável e vinculado à versão, se adotado; decisão jurídica so… | pronto_local | pronto_local | Decisão jurídica formal sobre o valor do aceite simples não foi registrada (é uma decisão de negócio/jurídica, fora do escopo técnico desta  | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-23 | proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cli… | pronto_local | pronto_local | É um contrato mínimo/stub: sem numeração fiscal, sem integração de faturamento; rotulado como tal. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-24 | relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos d… | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Probabilidades são estimativas; cenários de preço são alternativas vinculadas, sem soma como receita. Não equivale a faturado/recebido ou pr | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-25 | metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período,… | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Sem pagamento automático. Base informada é manual e deve ser conferida pela gestão; integração com recebíveis/faturamento é L07. Registros a | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-26 | biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação… | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Nenhum disparo de campanha externo. URLs de materiais restringidas a HTTPS/caminho interno. Conteúdo e autorização real dos materiais depend | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CRM-27 | parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e … | pronto_local (escopo técnico L04) | pronto_local (escopo técnico L04) | Sem comissão automática de parceiros, contatos externos ou sincronização contratual completa; efeitos de L05/L07 permanecem nesses lotes. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### CON — contexto comum do grupo

- Telas: /admin/contratos (+ /admin/contratos/[id]).
- APIs: /api/crm/contracts* (fronteira única contract-l05-api).
- Tabelas canônicas: crm_contracts + contratos con01–con11 (032–042, 118).
- Papéis: admin/marcelo gerenciam; comercial só consulta contratos próprios.
- Teste vigente: gate L05 (qa-l05-delivery-postgres).

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| CON-01 | contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência,… | pronto_local (L05) | pronto_local (L05) | documento deve já existir no provider privado L02; nenhuma conta/contrato de portal é criado automaticamente; aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-02 | itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, … | pronto_local (L05) | pronto_local (L05) | dimensionamento operacional posterior não é inferido pelo cadastro de posto. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-03 | estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; trans… | pronto_local (L05) | pronto_local (L05) | assinatura externa não é executada nem alegada; a evidência informada é registro interno. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-04 | aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobr… | pronto_local (L05) | pronto_local (L05) | não há geração de cobrança ou reajuste financeiro automático. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-05 | alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vin… | pronto_local (L05) | pronto_local (L05) | `queued` é caixa de saída local, não envio, entrega ou leitura externa. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-06 | obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, … | pronto_local (L05) | pronto_local (L05) | não há upload de bytes novo nesta tela; reutiliza L02. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-07 | implantação com checklist: contrato, data de início, postos, dimensionamento, contrataç… | pronto_local (L05) | pronto_local (L05) | RH/operação/faturamento de lotes posteriores não são simulados como integração automática. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-08 | bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e pe… | pronto_local (L05) | pronto_local (L05) | avaliação jurídica permanece humana; a API apenas impede a exceção legal. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-09 | encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos … | pronto_local (L05) | pronto_local (L05) | não baixa cobrança nem apaga pendência; comunicação externa não é enviada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-10 | dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade. | pronto_local (L05) | pronto_local (L05) | não emite documento fiscal e não aceita URL como evidência. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CON-11 | diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; … | pronto_local (L05) | pronto_local (L05) | filtro de termos é defesa adicional, não substitui política humana de classificação. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### EMP — contexto comum do grupo

- Telas: /funcionario (portal do funcionário).
- APIs: /api/employee/* (sessão própria auth_employee_sessions).
- Tabelas canônicas: emp/opcao-b (007,058,065–069,102).
- Papéis: funcionário (identidade employee); RH consulta.
- Teste vigente: gate L03 (qa-l03-delivery-postgres, duas identidades, HTTP real); l03-security.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| EMP-01 | perfil próprio e solicitação de atualização cadastral; dados restritos mascarados confo… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-02 | próximo plantão com local, horário, função, contato do supervisor, orientações e itens … | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-03 | calendário de escala, folgas, alterações e ciência da versão publicada; usuário não mod… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-04 | jornada individual, comprovantes/importação de provedor, divergências e pedido de corre… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-05 | aviso de ausência/atraso com protocolo, motivo limitado, responsável e acompanhamento; … | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-06 | troca de plantão com solicitação, aceite do outro profissional quando aplicável, valida… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-07 | passagem de serviço com pendências, chaves, equipamentos, ocorrências e aceite; não exp… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-08 | ocorrência com categoria, descrição, horário, local e anexo pertinente; restrição para … | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-09 | procedimentos do posto versionados, ciência e contatos de apoio. | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-10 | envio de documentos solicitados, status pendente/em análise/aprovado/rejeitado com moti… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-11 | holerites/informes/documentos próprios, acesso privado e histórico de disponibilização;… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-12 | férias, afastamentos, benefícios e reembolsos com solicitação, anexos restritos, aprova… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-13 | uniformes/EPI/equipamentos com entrega, recibo, solicitação de troca e devolução. | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-14 | cursos e reciclagens, comprovantes e alertas de vencimento. | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-15 | comunicados direcionados, confirmação de leitura e central de notificações. | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-16 | atendimento RH com protocolo, categoria, mensagens privadas e acompanhamento. | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-17 | canal confidencial separado, com responsáveis e política de acesso; anonimato somente s… | pronto_local | pronto_local | Canal sigiloso e identificado; anonimato não está habilitado e pedido anônimo falha explicitamente. Aceite humano no Windows pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-18 | PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotênci… | pronto_local | pronto_local | Fila deliberadamente limitada; não armazena documentos médicos/salariais. Teste no Windows permanece para L10. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EMP-19 | FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de da… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### HR — contexto comum do grupo

- Telas: /admin/funcionarios (RhWorkspace), /admin/rh/assistente.
- APIs: /api/admin/hr/* (cadastro, recrutamento, desligamento, ausências, benefícios, treinamento, DP, holerites, avaliações).
- Tabelas canônicas: hr_* (057,059–064).
- Papéis: staff rh (Andreia) com restrições salariais; marcelo/admin parcial.
- Teste vigente: gates L04/L06 e unitários da fase; aceite humano da Andreia pendente.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| HR-01 | cadastro profissional separado de identidade de login; matrícula, vínculo, cargo, empre… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-02 | histórico de cargo, lotação, remuneração autorizada e vínculo com datas de efeito; aces… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-03 | recrutamento com vaga, requisitos pertinentes, candidatos, triagem, entrevista, decisão… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-04 | banco de talentos e autorização/base aplicável; descarte configurado, sem acúmulo indef… | pronto_local | pronto_local | Política e descarte são configuráveis; base jurídica e prazos reais exigem decisão do controlador. Aceite Windows pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-05 | admissão com checklist por função, documentos, validação, exame/treinamento e integraçã… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-06 | dossiê com tipos, versões, validade, pendências e aprovador. CNV e demais documentos ap… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-07 | desligamento com checklist, devolução, revogação, documentação e pendências; histórico … | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-08 | mudança de status (afastado/suspenso/desligado) com efeito em permissões e alocação con… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-09 | férias com períodos aquisitivo/concessivo quando aplicáveis, saldo importado/validado, … | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-10 | afastamentos com período, retorno, documentação restrita e substituição; supervisor vê … | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-11 | integração de ponto, justificativas, divergências, workflow de correção e fechamento de… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-12 | banco de horas, adicionais e horas extras somente com regras versionadas e validadas pa… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-13 | benefícios com elegibilidade, solicitações, conferência, alterações por período e expor… | pronto_local | pronto_local | Exportação local não comprova entrega ao fornecedor. Integração externa não é alegada; aceite Windows pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-14 | adiantamentos/reembolsos com alçada e comprovantes, integração com financeiro e prevenç… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-15 | saúde ocupacional com agenda, vencimentos e documentos necessários; acesso restrito. Nã… | pronto_local | pronto_local | Acesso de saúde é separado; o sistema não se declara prontuário médico. Validação ocupacional e aceite Windows pendentes. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-16 | integração/exportação para contabilidade/SST, recibos de processamento, erros e correçã… | pronto_local | pronto_local | Adaptador/recibo local, sem afirmar envio eSocial/SST oficial. Provedor e protocolo externo dependem de integração futura. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-17 | treinamento por cargo/atividade, obrigatoriedade aplicável, validade, inscrição, presen… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-18 | matriz de competências integrada à alocação, sem decisão automática de contratação/puni… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-19 | uniformes/EPI com entrega, recibo, substituição, validade/controle aplicável e devolução. | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-20 | fechamento DP com faltas, férias, variáveis e documentos conferidos; exportação version… | pronto_local | pronto_local | Fechamento é demonstrativo e não constitui cálculo trabalhista oficial; validação contábil e aceite Windows pendentes. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-21 | holerites/informes importados de fonte autorizada, vinculação inequívoca ao colaborador… | pronto_local | pronto_local | Fonte autorizada é cadastrada pelo operador local; sem entrega externa nem cálculo oficial. Aceite Windows pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-22 | avaliações e planos de desenvolvimento com critérios definidos, acesso privado e partic… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-23 | atendimento interno com fila, responsável, categoria, prazo e mensagens; anexos de saúd… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| HR-24 | indicadores de quadro, admissão, faltas, rotatividade, férias, documentos e atendimento… | pronto_local | pronto_local | Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### OPS — contexto comum do grupo

- Telas: /admin/operacao (postos, alocações, cobertura, turnos, ocorrências, checklists, escalas).
- APIs: /api/ops/* e /api/ops-advanced*.
- Tabelas canônicas: ops_* (070–073,119,120).
- Papéis: staff supervisor/marcelo/ti conforme ação.
- Teste vigente: gate L06 (qa-l06-delivery-postgres, 9+ subtestes).

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| OPS-01 | estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação;… | pronto_local | pronto_local | aceite humano pendente (revisão de entrega). A tela expõe o cadastro real; não propõe dimensionamento automático — posto sem necessidade por | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-02 | dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e… | pronto_local | pronto_local | aceite humano pendente (revisão de entrega). Horas alocadas são soma dos turnos das alocações da faixa e não substituem as horas realizadas  | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-03 | escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equip… | pronto_local | pronto_local | aceite humano pendente — a ciência registrada pela interface comprova ciência do profissional, não substitui validação de convenção coletiva | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-04 | validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/… | pronto_local | pronto_local | aceite humano pendente. A qualificação guarda `document_url` em texto; vincular o comprovante ao provedor privado L02 (`client_documents`) e | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-05 | ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qu… | pronto_local | pronto_local | Comunicações e notificações são internas/sintéticas no sistema (sem envio externo SMS/WhatsApp real). Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-06 | passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite. | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-07 | livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidê… | pronto_local | pronto_local | Nenhum acionamento policial/SAMU/bombeiros externo ou 24h real simulado. Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-08 | checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências pro… | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-09 | visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação. | pronto_local | pronto_local | aceite humano da operação permanece pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-10 | rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratam… | pronto_local | pronto_local | fluxo obrigatoriamente rotulado sintético; QR/GPS não é prova de presença real. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-11 | chaves, rádios, materiais e equipamentos com guarda/transferência/devolução. | pronto_local | pronto_local | conferência física e aceite humano pendentes. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-12 | relatórios periódicos ao cliente com revisão de conteúdo e privacidade. | pronto_local | pronto_local | envio externo real não é alegado; aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-13 | métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fo… | pronto_local | pronto_local | qualidade da fonte deve ser validada pelo responsável. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-14 | escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motiv… | pronto_local | pronto_local | publicação exige conflitos resolvidos, revisão humana e motivo. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-15 | supervisão de limpeza com rotinas por ambiente, consumo e não conformidades. | pronto_local | pronto_local | inspeção física real permanece responsabilidade humana. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| OPS-16 | eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não constr… | pronto_local | pronto_local | sem central 24h, vídeo ou promessa de despacho externo real. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### CLI — contexto comum do grupo

- Telas: /cliente/entrar, /cliente/app/* (conta, contratos, documentos, chamados, agenda, cobranças, relatórios, renovação, satisfação, segurança, solicitações, reclamações).
- APIs: /api/auth/*, /api/client/*, /api/admin/client-*, /api/admin/invites, /api/admin/client-verifications.
- Tabelas canônicas: client_* (003–005,074–076,093,097–101) + integridade e idempotência (139,143+).
- Papéis: cliente (identidade client) com grants por contrato; staff admin/ti na administração.
- Teste vigente: gate L08 (qa-l08-delivery-postgres, 51/51) + unitários cli10–cli15, client-* fail-closed.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| CLI-01 | identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identific… | a_revalidar | a_revalidar | Aceite L08 não iniciado; unificar sem presumir que alias v2 é jornada cliente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-02 | múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo clien… | a_revalidar | a_revalidar | UI v2 órfã e falta prova de autoria/escopo por recurso. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-03 | contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico inte… | a_revalidar | a_revalidar | Falta gate cliente para itens/vigência e bloqueio de conteúdo interno. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-04 | documentos com categoria/validade/versão, busca e download privado; autorização testada… | em_execucao | em_execucao | Mantido `em_execucao`; falta jornada v2 integral e gate L08. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-05 | chamados com protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e hi… | a_revalidar | a_revalidar | Componente v2 órfão; falta cliente A≠B, transação e UI. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-06 | estados aberto/em atendimento/aguardando cliente/resolvido/encerrado, reabertura e moti… | a_revalidar | a_revalidar | Órfão/não provado. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-07 | agenda de visita/manutenção, confirmação, reagendamento e histórico. | a_revalidar | a_revalidar | Órfão/não provado. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-08 | relatórios de execução e medição/aceite de serviço com revisão. | a_revalidar | a_revalidar | Órfão/não provado. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-09 | cobranças/documentos fiscais/comprovantes somente quando financeiro estiver integrado; … | a_revalidar | a_revalidar | Órfão; qualquer PSP/fiscal real continua fora. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-10 | solicitação de serviço adicional gera oportunidade no CRM com origem e responsável. | a_revalidar | a_revalidar | Órfão/não provado. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-11 | satisfação pós-atendimento e periódica, plano de ação e risco de renovação baseado em f… | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) | gate `test:l08-delivery:pg` com HTTP/PostgreSQL/Chromium reais adiado junto da bateria pesada; migração 142 ainda não aplicada em ambiente d | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-12 | renovação e comunicação contratual com registro, sem bloquear indiscriminadamente o por… | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) | gate `test:l08-delivery:pg` com HTTP/PostgreSQL/Chromium reais adiado junto da bateria pesada; migração 143 ainda não aplicada em ambiente d | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-13 | modos convite, solicitação com aprovação e autocadastro configuráveis; vínculo verifica… | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) | `test:l08-delivery:pg`, cascata L03..L08 e aplicação da migração 144 adiados; sem aceite humano novo; Windows pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| CLI-14 | segurança da conta com MFA opcional, gestão de sessões e troca de e-mail concluída; flu… | pronto_local (validação automática md) |
| CLI-15 | reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com… | pronto_local (validação automática rápida; bateria pesada e aceite humano pendentes) | pronto_local (validação automática rápida; bateria pesada e aceite humano pendentes) | bateria pesada específica de CLI-15 (HTTP/DB em PostgreSQL descartável dedicado), cascata L03..L08, aplicação da migração 146 em destino, ac | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### FIN — contexto comum do grupo

- Telas: /admin/financeiro (contas, conciliação, cobrança, fluxo, custos, resultado, despesas, fiscal, gateway, orçamento, exportações, fechamento, comissões).
- APIs: /api/fin/* (cada aba com handler dedicado).
- Tabelas canônicas: fin_* (077–080,122–138).
- Papéis: staff financeiro/marcelo/ti; alçadas segregadas.
- Teste vigente: gate L07 43/43 em duas execuções consecutivas (MATRIZ-FECHAMENTO-L07).

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| FIN-01 | contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, va… | pronto_local | pronto_local | dados apenas sintéticos; nenhuma integração de produção. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-02 | contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos. | pronto_local | pronto_local | anexos e pagamentos externos permanecem sintéticos; FIN-05..16 não iniciados. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-03 | geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e susp… | pronto_local | pronto_local | não há cobrança externa; conta é sintética e explícita. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-04 | pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nu… | pronto_local | pronto_local | sem gateway ou banco real; FIN-05..16 não iniciados. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-05 | conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar… | pronto_local | pronto_local | não há banco, provedor, gateway, webhook, arquivo ou credencial de produção; não há cobrança automática. Aceite humano/Windows permanece pen | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-06 | cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais… | pronto_local | pronto_local | não há e-mail, WhatsApp, SMS, gateway, webhook, arquivo ou credencial de produção; "envio" é sempre uma transição de estado local simulada.  | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-07 | fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis. | pronto_local | pronto_local | fluxo e aging não integram banco/gateway real, não baixam recebíveis, não enviam cobrança e usam somente dados sintéticos. `npm run test:mig | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-08 | custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materi… | pronto_local | pronto_local | apenas metadados/valores sintéticos; nenhum arquivo, folha, estoque, ERP ou provedor externo é lido. UUIDs opcionais de equipamento/supervis | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-09 | resultado gerencial por contrato, separando receita contratada, faturada, recebida, cus… | pronto_local | pronto_local | resultados são dados sintéticos locais; aceite humano e Windows pendentes. L07 não está encerrado. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-10 | despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprova… | pronto_local | pronto_local | política padrão é vazia (ausência não aprova); evidências são metadados sintéticos; nenhuma emissão fiscal, Pix/boleto, cobrança ou pagament | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-11 | integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação … | pronto_local | pronto_local | não há NFS-e/NF-e, certificado, credencial, arquivo, ERP ou transmissão para provedor real. Aceite humano e Windows pendentes. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-12 | boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, repl… | pronto_local | pronto_local | gateway, assinatura e pagamentos são simuladores locais; não há Pix/boleto, PSP, banco, adquirente, cobrança ou valor real. Aceite humano e  | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-13 | > Revalidação concluída em 2026-10-01 sobre a main `4ea3578`: os seis achados foram rep… | pronto_local (validação automática completa; aceite humano pendente) | pronto_local (validação automática completa; aceite humano pendente) | **Aceite humano pendente** (nenhuma aprovação de Marcelo/Andreia registrada) e validação em Windows pendente — a sessão rodou em Linux. Adia | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-14 | exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do con… | pronto_local (validação automática completa; aceite humano pendente) | pronto_local (validação automática completa; aceite humano pendente) | artefato apenas sintético, sem envio ao contador/storage externo. Aceite humano e Windows pendentes. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-15 | fechamento de competência e reabertura autorizada; preservar versões de relatório. | pronto_local (validação automática completa; aceite humano pendente) | pronto_local (validação automática completa; aceite humano pendente) | aceite humano e Windows pendentes; fechamento não substitui validação contábil externa. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| FIN-16 | comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente. | pronto_local (validação automática completa; aceite humano pendente) | pronto_local (validação automática completa; aceite humano pendente) | não há pagamento real; aceite humano e Windows pendentes. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### AST — contexto comum do grupo

- Telas: /admin/patrimonio e abas de /admin/operacao.
- APIs: /api/ast/* (estoque, ativos, inventário, OS, manutenção, CFTV, limpeza).
- Tabelas canônicas: ast_* (083–084,121).
- Papéis: staff supervisor/marcelo/ti.
- Teste vigente: gate L06 (qa-l06-delivery-postgres).

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| AST-01 | produtos/SKU, fornecedores, unidade de medida, custo, local e estoque mínimo. | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-02 | entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movi… | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-03 | reserva para proposta/implantação sem confundir reserva com saída; liberação em cancela… | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-04 | equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manute… | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-05 | entrega/devolução, avaria/perda, fotos pertinentes e conferência. | pronto_local | pronto_local | Fotos/anexos operam sobre armazenamento privado local/sintético. Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-06 | requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar. | pronto_local | pronto_local | Não integra compras fiscais ou pagamentos externos reais (fluxo sintético interno rotulado). Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-07 | inventário físico, divergências e ajuste aprovado. | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-08 | ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, pe… | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-09 | evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao q… | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-10 | manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por … | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-11 | dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; se… | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AST-12 | materiais de limpeza com consumo por local, reposição e comparação ao previsto. | pronto_local | pronto_local | Aceite humano pendente. | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### ADM — contexto comum do grupo

- Telas: /admin/marcelo (indicadores, aprovações, espaço, relatórios, configurações, metas, diário, expansão).
- APIs: /api/adm/panel/* (números calculados no servidor; drill-down auditável).
- Tabelas canônicas: adm_* (081–082) + leituras canônicas fin/crm/hr.
- Papéis: marcelo (can_decide), ti somente leitura técnica.
- Teste vigente: gate L07 cenários ADM (MATRIZ-FECHAMENTO-L07); aceite humano L07 registrado 2026-10-02.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| ADM-01 | painel “Meu dia” com pendências reais, prioridade, responsável e ação. | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-02 | visão comercial com leads novos, oportunidades paradas, propostas e próximas ações. | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-03 | visão operacional com cobertura, ocorrências críticas, SLA e implantação. | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-04 | visão financeira com fonte/competência, saldo, vencimentos e margem por contrato. | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-05 | contratos próximos de renovar, reclamações reincidentes e risco de perda justificado. | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-06 | aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por … | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-07 | busca autorizada, favoritos, filtros salvos e atalhos com contexto. | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-08 | relatórios exportáveis e agendados para destinatários autorizados; registrar geração/en… | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-09 | configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e prefer… | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-10 | metas e cenários com comparação prevista/realizada, sem confundir estimativa com result… | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-11 | trilha e diário de decisões CON-11 acessíveis conforme permissão. | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| ADM-12 | análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos re… | pronto_local | pronto_local | Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de clie | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### PLT — contexto comum do grupo

- Telas: (plataforma) /admin/ti protótipo descritivo; consoles dedicados em /admin/ti/* ainda órfãos.
- APIs: /api/admin/observability, /api/admin/backup, /api/admin/config, /api/admin/notifications, /api/admin/integrations.
- Tabelas canônicas: plt_* (043–056), audit_log, outbox.
- Papéis: staff ti.
- Teste vigente: route-dispatch + route-dispatch-guard (PLT-01, workflow próprio); backup/cli-v2/observability gates (PG).

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| PLT-01 | diretório de usuários, papéis, escopos, convites, suspensão/revogação e revisão periódi… | a_revalidar | entregue_e_verificado_gate_local (PR #118; route-dispatch guard + workflow próprio) | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-02 | auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e ex… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-03 | integrações com status configurado/não configurado/falha, último processamento, erros s… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-04 | fila durável de notificações com destinatário autorizado, deduplicação, tentativas, bac… | pronto_local | pronto_local | A tela de operação da fila ainda não existe; o consumo é por API. Reprocessamento manual exposto, mas sem agendador automático em execução c | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-05 | notificações no painel, e-mail e canais externos configurados, preferências e templates… | em_execucao | em_execucao | SMTP está fora do escopo por decisão do cliente: não há e-mail real. Falta a tela de painel de notificações e a revisão de conteúdo de templ | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-06 | observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas ac… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-07 | healthcheck/liveness/readiness, degradação explícita de dependências e painel operacion… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-08 | backup de banco e documentos, criptografia, acesso, retenção e restauração testada em a… | em_execucao | em_execucao | A trilha de dump lógico (npm run test:backup-restore:pg) NÃO foi exercitada neste ambiente: exige pg_dump/pg_restore 17, que não existem no  | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-09 | política de privacidade completa, inventário de dados/finalidades, bases aplicáveis, de… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-10 | pedidos de acesso/correção/eliminação com verificação de identidade, responsável, prazo… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-11 | retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal e hi… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-12 | resposta a incidente com responsáveis, contenção, evidências, análise e comunicação con… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-13 | gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de inf… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-14 | revisão de dependências, lockfile, vulnerabilidades, atualizações e CI. | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-15 | importação/exportação, logs de integração, limites, webhooks autenticados, retries e re… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-16 | orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraes… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-17 | isolamento de desenvolvimento/homologação/produção com contas e dados próprios; preview… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| PLT-18 | documentação para manutenção por outro programador, configuração, migração, diagnóstico… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### EXT — contexto comum do grupo

- Telas: EXT-01:/admin/frota · EXT-02:/admin/terceiros · EXT-03:/admin/licitacoes · EXT-04:/admin/fornecedores · EXT-05:/admin/qualidade · EXT-06:/admin/satisfacao · EXT-07:/admin/compliance.
- APIs: /api/ext/fleet|third-party|bidding|supplier|quality|satisfaction|compliance/*.
- Tabelas canônicas: ext_* (085; 148–156 jornadas canônicas EXT-02..07).
- Papéis: staff admin/marcelo/ti; sem ator externo inventado.
- Teste vigente: gates dedicados unit + PG: ext01..ext07 (workflows próprios a partir do EXT-02); EXT-07 43/43 + agendador.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| EXT-01 | Frota | pronto_local (validação automática rápida; bateria pesada específica, aceite humano e Windows pendentes) | pronto_local (validação automática rápida; bateria pesada específica, aceite humano e Windows pendentes) | Upload real de arquivo de documento fica fora desta fatia (metadados sintéticos declarados na tela). Bateria pesada HTTP/DB dedicada, aplica | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-02 | Terceiros | pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes) | pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes) | **Não existe ator externo "terceiro" autenticado**; nenhuma sessão, login ou canal externo foi criado ou simulado — o acesso do próprio terc | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-03 | Licitações | pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes) | pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes) | **Não existe portal público de compras integrado** (ComprasNet, BEC/SP, PNCP ou equivalente), nem importação automática de edital, nem envio | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-04 | Portal fornecedores | pronto_local **da jornada interna de staff** (gate HTTP/DB dedicado; condição de volume e ator externo pendentes) | pronto_local **da jornada interna de staff** (gate HTTP/DB dedicado; condição de volume e ator externo pendentes) | não existe identidade/login/sessão/grant/canal/upload/aceite de fornecedor; "escopo próprio" externo permanece pendente e não é apresentado  | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-05 | Qualidade | pronto_local (jornada interna de staff + gate HTTP/PostgreSQL dedicado; destino, aceite humano e Windows pendentes). | pronto_local (jornada interna de staff + gate HTTP/PostgreSQL dedicado; destino, aceite humano e Windows pendentes). | jornada exclusivamente interna, sem ator externo exigido ou inventado. Evidência é referência declarada, não upload/arquivo verificado/armaz | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-06 | Satisfação/carteira | a_revalidar | a_revalidar — PR alternativa #102 aberta; mesclada oficialmente pela PR #101 (migração 152); gate ext06 36/36 declarado | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-07 | Compliance corporativo | entregue_e_verificado_gate_local (2026-10-03, hardening 155 sobre a 153 e a 154 do main; base PR #103 + PR #113; 2026-10-04, execução agendada da avaliação temporal — migração 156 + agendador in-process opt-in por ambiente) | entregue_e_verificado_gate_local (2026-10-03, hardening 155 sobre a 153 e a 154 do main; base PR #103 + PR #113; 2026-10-04, execução agendada da avaliação temporal — migração 156 + agendador in-process opt-in por ambiente) | aplicação em banco de destino — decisões operacionais tomadas (2026-10-04: intervalo 3600 s + identidade declarada TI), fluxo ensaiado ponta | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-08 | Base de conhecimento | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-09 | Expansão/unidades | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-10 | Continuidade operacional | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-11 | Analytics/A-B | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-12 | Editor visual avançado | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-13 | Relatório periódico | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-14 | Inteligência comercial | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-15 | Apoio emergencial | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-16 | Central/vídeo | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| EXT-17 | Biometria/reconhecimento | a_revalidar | a_revalidar | Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
### AI — contexto comum do grupo

- Telas: /admin/ti (AiRagClient órfão), FAQ pública assistida (PUB-05).
- APIs: /api/ai-rag*, /api/ai/rag*, /api/public/ai/rag* (OLLAMA_ENABLED=true exigido p/ inferência real).
- Tabelas canônicas: ai_rag_* (095–096).
- Papéis: público (FAQ), cliente, RH, gestão — escopos separados.
- Teste vigente: ai-rag-public-scope (unit); test:rag (integração); sem prova de LLM real homologada.

| ID | Requisito (resumo) | Estado declarado | Estado confirmado nesta reconciliação | Pendência principal | Próxima ação |
|---|---|---|---|---|---|
| AI-01 | FAQ pública com respostas aprovadas e transferência humana; informar limites, não inven… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-02 | resumo de histórico comercial autorizado, com links para registros de origem. | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-03 | rascunho de proposta a partir de catálogo e versão de custos aprovados; sem alterar pre… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-04 | classificação e sugestão de resposta a chamados, submetida a revisão. | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-05 | extração de campos de documentos em ambiente privado, revisão humana e descarte de arte… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-06 | busca interna/RAG filtrada por permissão antes de recuperar conteúdo; isolar índices/co… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-07 | relatório gerencial com cálculos feitos por código/consulta validada; IA narra, não inv… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-08 | inconsistências cadastrais e próximas ações sugeridas, com justificativa e fonte. | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-09 | curadoria da base, versão, publicação, feedback, avaliação, custo/token e rollback. | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |
| AI-10 | automações determinísticas de vencimentos, distribuição de tarefas e cobrança interna a… | a_revalidar | a_revalidar | preencher | ver [plano](PLANO-CONCLUSAO-ARENA.md) |

## Divergências históricas resolvidas nesta reconciliação

1. Documentos antigos (AUDITORIA-TERRENO-L08, CONSOLIDACAO-L07-PRS-PENDENTES) citavam como pendências itens já entregues depois (CLI-06..15, EXT-01..07): segue o main vigente, não o histórico. Próxima migração livre no main: **157**.
2. A auditoria de 04/10 marcava EXT-06 `a_revalidar` e PLT-01 `a_revalidar`: ambas as PRs oficiais (#101, #118) estão mescladas com migração e gate próprios; os estados passam a `pronto_local` com aceite humano/Windows pendentes.
3. O `ESTADO-EXECUCAO-LOCAL.md` declara migração seguinte livre 157 — confirmado: 156 arquivos em `db/migrations/`, última 156-ext07-scheduled-evaluation.
4. Endereços `/admin` (404), `/admin/marcelo` (anônimo sem caminho de login) e rótulo "E-mail individual de TI" em login compartilhado são os achados F01 tratados nesta mesma sessão; ver CONTINUACAO-ARENA.md.
5. `docs/auditoria-2026-10-04/` veio da branch docs/auditoria-arena-2026-10-04 (PR #121) sem alterar código do main.
o` (anônimo sem caminho de login) e rótulo "E-mail individual de TI" em login compartilhado são os achados F01 tratados nesta mesma sessão; ver CONTINUACAO-ARENA.md.
5. `docs/auditoria-2026-10-04/` veio da branch docs/auditoria-arena-2026-10-04 (PR #121) sem alterar código do main.

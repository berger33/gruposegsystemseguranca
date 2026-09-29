# Checklist da entrega local — 222 requisitos
Gerado em 2026-09-29 a partir do plano mestre; não é declaração de nova auditoria ou de conclusão.
Leia EXECUCAO-ENTREGA-LOCAL.md. Todos começam em a_revalidar para confrontar evidências históricas com a versão final. Isso não apaga o trabalho realizado.
Para cada ID, completar: rota/tela; API/tabela; perfil/escopo; integração; teste e commit; evidência; bloqueio; aceite humano.
Estados: a_revalidar, pendente, em_execucao, bloqueado, pronto_local, depende_integracao_externa.
SMTP/hospedagem externa estão fora da entrega; adaptadores simulados precisam ser identificados. AI-02/03/04/05/07/08 continuam no escopo.
Não copiar "verificado" de relatório histórico sem verificar a versão entregue.

## SEC-01
Inventariar rotas, APIs, tabelas, jobs, permissões e documentação no commit atual Aceite: Mapa com real/parcial/prévia/ausente e divergências documentadas
- Estado: em_execucao
- Tela / API / dados / autorização: Inventário do L00 registrado em docs/ESTADO-EXECUCAO-LOCAL.md e docs/EVIDENCIAS-ENTREGA-LOCAL.md.
- Integração e evidência (teste, resultado, commit): L00: 222 IDs únicos confirmados; 82/82 componentes administrativos órfãos; 5 achados do plano mestre revalidados como já corrigidos — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Falta o mapa completo rota-a-rota por ID (real/parcial/prévia/ausente).

## SEC-02
Corrigir verificações de escopo para negar por padrão em qualquer erro Aceite: Testar usuário A/B, outra unidade/contrato e falha de banco sem retorno de dados
- Estado: pronto_local (parcial)
- Tela / API / dados / autorização: Sessão administrativa: `server.mjs` readSession + `src/server/staff-session.mjs`; tabela `auth_staff_sessions`; nega por padrão em erro de banco.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` 21/21 (cenários 12,13,14) + `tests/staff-session-await-guard.test.mjs` 4/4 — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Parcial: cobre autenticação de staff. Escopo por unidade/contrato em consultas de negócio ainda a revalidar (L02+).

## SEC-03
Associar documentos a conta/unidade/contrato/classificação e aplicar autorização uniforme Aceite: Lista, busca, download, exportação e links respeitam o mesmo escopo
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-04
Login individual de staff, papéis, convites e revogação Aceite: Andreia acessa RH; funcionário não acessa RH geral; auditoria identifica pessoa
- Estado: em_execucao (autenticação e revogação prontas; navegação por papel ausente)
- Tela / API / dados / autorização: `POST /api/admin/session` (e-mail/senha) e `GET /api/admin/session`; tabelas auth_identities, auth_credentials, auth_staff_profiles, auth_staff_sessions; papel vem do banco.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenários 1-10: sem perfil 403, pending_email 401, suspensão/rebaixamento/epoch derrubam sessão, auditoria com identityId — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: NÃO atende ainda o aceite completo: "Andreia acessa RH" exige tela de RH acessível, e os 82 componentes administrativos continuam órfãos (ver L00-9). Papéis atuais: admin|ti|rh|marcelo; supervisor/comercial/financeiro não unificados. Convites de staff não revalidados. Aceite humano pendente.

## SEC-05
Substituir tokens compartilhados por autenticação individual com migração controlada Aceite: Credenciais legadas desligadas após contas válidas; recuperação administrativa documentada
- Estado: pronto_local
- Tela / API / dados / autorização: Token compartilhado recusado por padrão em `POST /api/admin/session`; exige SITE_ADMIN_LEGACY_TOKENS=true e desliga-se quando há conta individual; bootstrap cria identidade auditável.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenário 11 (403 legacy_admin_tokens_disabled) + `tests/staff-auth-hardening.test.mjs` 16/16; suítes tenant/client-access/cli-v2 migradas para login individual — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Procedimento de recuperação administrativa documentado em docs/ESTADO-EXECUCAO-LOCAL.md; sem aceite humano.

## SEC-06
MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit Aceite: Senha sozinha não emite sessão privilegiada; TOTP/recovery inválido ou reutilizado negado
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/admin/session` devolve 202+desafio quando há MFA; `POST /api/admin/session/mfa` conclui; tabelas auth_mfa e auth_mfa_challenges.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenários 15,16,18,19,20,21: senha sozinha não emite sessão, TOTP replay negado, recuperação de uso único, limite de 5 tentativas, expiração, rate limit 429 — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Chave CLIENT_MFA_ENCRYPTION_KEY ausente mantém MFA indisponível (503), nunca rebaixa para senha. Aceite humano pendente.

## SEC-07
Corrigir troca de e-mail e handlers HTTP Aceite: Senha atual verificada, novo e-mail confirmado, token único/expirável, atualização atômica, aviso antigo e sessões revogadas
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-08
Migrações rastreadas e executáveis Aceite: Banco vazio e upgrade de snapshot sintético passam; constraints corretas, repetição do runner segura
- Estado: pronto_local
- Tela / API / dados / autorização: `scripts/migrate-site-visual.mjs` (manifesto 001-099) e tabela `__migrations` com checksum e lock consultivo.
- Integração e evidência (teste, resultado, commit): `npm run test:migrations:pg`: banco vazio 99/99 e 499 tabelas; segunda passagem idempotente; clone adulterado recusado com migration_checksum_mismatch — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Contagens fixas substituídas por leitura do disco. Não executado em Windows.

## SEC-09
Reparar suíte e testar APIs reais Aceite: Testes não substituem chamada HTTP por SQL demonstrativo; dependências e CI reproduzíveis
- Estado: em_execucao
- Tela / API / dados / autorização: Suítes: test:unit (177) e gates em PostgreSQL real por HTTP.
- Integração e evidência (teste, resultado, commit): L01: nova suíte HTTP real `scripts/qa-staff-auth-postgres.mjs` 21/21; suítes existentes migradas de token compartilhado/cookie forjado para login individual; nenhuma expectativa foi apagada — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Cobertura ainda concentrada em autenticação e infraestrutura; jornadas de negócio sem teste de ponta a ponta.

## SEC-10
Consolidar orçamento/simulador e catálogo Aceite: Só confirmar após persistência; preço fictício ausente do fluxo real; sem modo administrativo público
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-11
Separar prévias e recursos reais Aceite: Nenhuma simulação concede permissão ou informa envio inexistente
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-12
Privacidade e declarações de aprovação verificáveis Aceite: Minuta explicitamente pendente enquanto faltar aprovação; texto completo antes de publicar
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-13
Segurança de sessão, CSRF, origem e erros Aceite: Cookies seguros em produção, origem/CSRF em mutações, JSON limitado, métodos corretos, erro sem stack/segredo
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-14
Auditoria durável e operacional Aceite: Alterações sensíveis rastreáveis; indisponibilidade de auditoria não gera falsa segurança
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-15
Proteção de abuso e identidade Aceite: Limites de login/convite/formulário/reenvio, respostas antienumeração, proxy/IP confiável definido
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-01
catálogo único dos seis serviços validados no projeto; cada item tem descrição, público, perguntas de qualificação e flag de publicação. Cerca elétrica ou novos serviços entram somente após validação comercial.
- Estado: pronto_local
- Tela / API / dados / autorização: `src/lib/service-catalog.mjs` — catálogo único dos 6 serviços (descrição, público, perguntas de qualificação, flag de publicação). Consumido por `/servicos`, `/orcamento` e `/contato`.
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l04-delivery:pg` (Chromium real) navega `/servicos` e usa o mesmo catálogo em `/orcamento`/`/contato` — sessão L04, branch `arena/01a0ed3d-gruposegsystemseguranca`.
- Pendência / fronteira externa / aceite humano: Nenhum novo serviço (ex.: cerca elétrica) foi adicionado; catálogo permanece fechado aos 6 validados. Sem tela de administração do catálogo em si (é código, não CMS) — aceite humano pendente.

## PUB-02
páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados; revisão de acessibilidade, navegação e desempenho.
- Estado: parcial
- Tela / API / dados / autorização: `/servicos`, `/servicos/[id]`, `/faq`, `/contato` (páginas públicas existentes, não alteradas nesta sessão salvo remoção do fetch admin indevido em `AiBotWidget.tsx`).
- Integração e evidência (teste, resultado, commit): Gate L04: Chromium percorre `/servicos` (mobile) e valida ausência de rolagem horizontal e de erros de console/rede same-origin. `PubFaqAssistedClient.tsx` (FAQ assistida/handoff, PUB-05) segue órfão — não conectado nesta sessão.
- Pendência / fronteira externa / aceite humano: Revisão de acessibilidade/desempenho formal não foi feita. FAQ assistida com IA (PUB-05) permanece componente não conectado a nenhuma página; handoff humano não implementado além do FAQ estático.

## PUB-03
orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada e responsável de atendimento.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/leads` (`server.mjs handleCreateLead`) grava `public_leads` (protocolo, consentimento, origem, campanha, canal, e-mail, dedup_key); validação em `src/lib/public-lead-validation.mjs`.
- Integração e evidência (teste, resultado, commit): Gate L04: visitante anônimo real (sem sessão) envia `/contato`; dedup/antispam/consentimento testados por HTTP direto com controles negativos (origem/campanha maliciosa, canal inválido, e-mail inválido, replay). Corrigido nesta sessão: `public-lead-validation.mjs` descartava silenciosamente origin/campaign/channel/email do formulário real; `handleCreateLead` confiava em `dedupKey` vindo do navegador — agora a chave é derivada só no servidor (telefone+cidade+serviços+janela de 30min).
- Pendência / fronteira externa / aceite humano: Responsável de atendimento por lead ainda é atribuído manualmente em `/admin/leads`, sem regra automática de distribuição. Antispam é básico (padrões de marcação/URL); sem CAPTCHA nem rate limit dedicado ao endpoint de leads além do geral.

## PUB-04
visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real.
- Estado: pronto_local
- Tela / API / dados / autorização: `PATCH /api/admin/leads/:id` (`handleAdminLeadStatus`) com estados solicitada→em_agendamento→confirmada→realizada→cancelada; UI em `/admin/leads` (papéis `marcelo`,`ti`,`comercial`,`admin`).
- Integração e evidência (teste, resultado, commit): Gate L04 exercita transições de visita reais via HTTP autenticado com sessão de staff `comercial` (login real, não token).
- Pendência / fronteira externa / aceite humano: Notificação ao solicitante sobre confirmação de horário usa a caixa local (L02) — nunca promete envio real (SMTP fora de escopo). Sem tela dedicada de agenda/calendário; apenas lista com status.

## PUB-05
FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada e controles do capítulo 19.
- Estado: a_revalidar
- Tela / API / dados / autorização: `PubFaqAssistedClient.tsx` existe mas não está conectado a nenhuma rota; `/faq` é estático.
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão (L04 focou a jornada comercial central). `AiBotWidget.tsx` foi corrigido apenas para não disparar fetch admin indevido nas páginas públicas.
- Pendência / fronteira externa / aceite humano: FAQ assistida por IA/RAG e transferência humana continuam sem tela conectada. Não avançar guardrails de preço/cobertura/licença/prazo do bot sem essa conexão.

## PUB-06
CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão.
- Estado: a_revalidar
- Tela / API / dados / autorização: `CmsClient.tsx` existe em `src/app/admin/ti/` mas não está importado por nenhuma página.
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão.
- Pendência / fronteira externa / aceite humano: CMS de páginas/FAQ/cases/blog/vagas com rascunho/revisão/publicação/histórico permanece órfão. Fica para a próxima sessão (ver prompt de continuação).

## PUB-07
temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global. Implementar após núcleo.
- Estado: a_revalidar
- Tela / API / dados / autorização: `ThemeClient.tsx` existe mas não está conectado; `/admin/tema` é uma página separada e anterior, não revalidada nesta sessão.
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão.
- Pendência / fronteira externa / aceite humano: Preview/publicação/rollback de tema e preferência dia/noite não foram revalidados nem conectados ao componente órfão.

## PUB-08
SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos.
- Estado: a_revalidar
- Tela / API / dados / autorização: `SeoClient.tsx` existe mas não está conectado a nenhuma página administrativa.
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão.
- Pendência / fronteira externa / aceite humano: SEO técnico, sitemap, redirects e verificação de domínio permanecem sem tela de administração navegável.

## PUB-09
montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produção.
- Estado: parcial
- Tela / API / dados / autorização: `/orcamento` foi reescrita nesta sessão: removido o antigo "modo empresarial" com preços inventados; agora é formulário de pedido de orçamento real sobre o catálogo (PUB-01), via `/api/leads`. `PackageClient.tsx` (montador/comparador administrativo) continua órfão.
- Integração e evidência (teste, resultado, commit): Gate L04 valida `/orcamento` real (sem preço fabricado) enviando lead com `origin=orcamento`.
- Pendência / fronteira externa / aceite humano: Não existe montador de pacote nem comparador de planos no lado público ou administrativo — apenas o pedido de orçamento simples substituiu a simulação falsa que havia antes. `PackageClient.tsx` não foi conectado.

## PUB-10
mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos.
- Estado: a_revalidar
- Tela / API / dados / autorização: `OriginMetricsClient.tsx` existe mas não está conectado a nenhuma página administrativa.
- Integração e evidência (teste, resultado, commit): Origem/campanha são capturadas e persistidas desde o L04 (`public_leads.origin/campaign`, ver PUB-03) e aparecem em `/admin/leads`, mas não há painel de métricas de conversão nem testes A/B.
- Pendência / fronteira externa / aceite humano: Mensuração de conversão por origem/campanha e testes A/B continuam sem tela; dados brutos existem, análise não.

## CRM-01
cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distinguir prospect/cliente/parceiro sem duplicar entidade.
- Estado: parcial (pré-existente, não revalidado a fundo nesta sessão)
- Tela / API / dados / autorização: `/admin/crm` (página anterior a esta sessão) — `POST/GET /api/crm/companies`, tipo prospect/cliente/parceiro.
- Integração e evidência (teste, resultado, commit): Não foi alvo de mudança nem de gate dedicado nesta sessão; comportamento herdado. Migração 103 desta sessão apenas ampliou o CHECK de `crm_companies.created_by` para permitir gravação pelo papel `comercial` (antes rejeitada).
- Pendência / fronteira externa / aceite humano: Sem teste de HTTP+navegador dedicado a CRM-01 nesta sessão; a tela não foi inspecionada campo a campo. Cadastro central existe e funciona (usado indiretamente pelo fluxo de conversão de lead do gate L04), mas o requisito completo (unidades, canais, responsáveis) não foi revalidado.

## CRM-02
contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem legítima, sem coleta indiscriminada.
- Estado: a_revalidar
- Tela / API / dados / autorização: Sem tela dedicada de contato com função (decisor/influenciador/usuário/financeiro) encontrada em `/admin/crm`; a API `crm_contacts` pode existir no schema, mas não foi localizada UI própria.
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão.
- Pendência / fronteira externa / aceite humano: Preferências/restrições de abordagem e origem legítima do contato não foram revalidadas nem expostas em tela.

## CRM-03
importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação.
- Estado: parcial (pré-existente, não revalidado a fundo nesta sessão)
- Tela / API / dados / autorização: `/admin/crm` tem importação de CSV com prévia (`csvContent`, `importPreview`, `importResult`).
- Integração e evidência (teste, resultado, commit): Não foi alvo de mudança nem de gate dedicado nesta sessão.
- Pendência / fronteira externa / aceite humano: Deduplicação revisável e prevenção de fórmula maliciosa na exportação não foram reexecutadas como prova nesta sessão.

## CRM-04
converter lead do site em contato/oportunidade preservando histórico; tratar duplicidade e contato sem empresa.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/crm/leads/:id/convert`; UI em `/admin/leads` (`convertLead()`, novo nesta sessão) e em `/admin/crm` (`convertLead()` pré-existente).
- Integração e evidência (teste, resultado, commit): Gate L04: conversão de lead real por HTTP autenticado (staff `comercial`) e reconversão idempotente do mesmo lead (não duplica empresa/oportunidade).
- Pendência / fronteira externa / aceite humano: Tratamento de duplicidade é feito pela chave de empresa informada manualmente no prompt; não há resolução automática de contato sem empresa.

## CRM-05
oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda.
- Estado: parcial (pré-existente, não revalidado a fundo nesta sessão)
- Tela / API / dados / autorização: `/admin/crm` lista oportunidades com estágio, prioridade, valor estimado, próxima ação/data.
- Integração e evidência (teste, resultado, commit): Usado indiretamente pelo gate L04 (a conversão de lead cria a oportunidade), mas os campos individuais (origem, motivo de perda) não foram todos exercitados nesta sessão.
- Pendência / fronteira externa / aceite humano: Sem revalidação campo a campo desta sessão.

## CRM-06
funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para perda; reabertura auditada. Não tratar “ganho” como dinheiro recebido.
- Estado: parcial (pré-existente, não revalidado a fundo nesta sessão)
- Tela / API / dados / autorização: `/admin/crm` — funil novo→qualificação→vistoria→proposta_elaboração→enviada→negociação→ganho/perdido (rótulos no código-fonte da página).
- Integração e evidência (teste, resultado, commit): Gate L04 cria e avança oportunidade só até o ponto necessário para orçamento/proposta; não exercitou o funil completo nem motivo de perda/reabertura.
- Pendência / fronteira externa / aceite humano: Motivo obrigatório de perda e reabertura auditada não foram provados nesta sessão.

## CRM-07
kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas.
- Estado: em_execucao
- Tela / API / dados / autorização: /admin/crm → Abrir tarefas; OpportunityTasks.tsx; GET/POST de tarefas por oportunidade e PATCH de status. Responsável/autor derivados da sessão; mesma restrição no detalhe legado. Tarefa e auditoria em transação. Migração 104.
- Integração e evidência (teste, resultado, commit): código 7bab313, PR #13; Actions 36604855660: L04 2/2 HTTP+Chromium+PostgreSQL, sem skips, mais migrações/replay/checksum 104/104. Actions 36604855633: baseline aprovado. Criação, prazo vencido, filtro, recarga, conclusão, negação cruzada, conflito e rollback de auditoria comprovados.
- Pendência / fronteira externa / aceite humano: CRM-07 NÃO concluído. Histórico de interações, anexos/notas, paginação, tarefas de equipe/delegação/edição e revisão completa de kanban/filtros ainda pendentes. Lista pessoal limitada a 200 por oportunidade. Aceite humano/Windows não executado.

## CRM-08
agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento. Links/calendário externo somente por integração configurada.
- Estado: a_revalidar
- Tela / API / dados / autorização: Sem UI de agenda de visitas/reuniões; schema de `visits` existe (ver CRM-07).
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão. PUB-04 (estados de visita) tem tela própria em `/admin/leads`, mas não é a agenda de CRM-08.
- Pendência / fronteira externa / aceite humano: Confirmação, reagendamento e cancelamento de reunião não têm tela dedicada.

## CRM-09
cadências de prospecção inicialmente como tarefas; automação de mensagens depende de autorização, opt-out quando aplicável e provedor.
- Estado: a_revalidar
- Tela / API / dados / autorização: Sem UI de cadências; schema de `tasks` existe (ver CRM-07).
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão.
- Pendência / fronteira externa / aceite humano: Cadências de prospecção como tarefas não têm tela; automação de mensagens nem deveria avançar sem autorização/opt-out/provedor definidos.

## CRM-10
carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem próxima ação e relacionamentos por grupo/unidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: Sem UI de carteira; schema pode existir mas não foi localizada tela.
- Integração e evidência (teste, resultado, commit): Não atacado nesta sessão.
- Pendência / fronteira externa / aceite humano: Renovação, upsell, reativação, indicações e relacionamento por grupo/unidade continuam sem tela.

## CRM-11
separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato quando praticados. Campos: unidade de cobrança, escopo, exclusões, recursos, custo, preço, vigência e aprovação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. Serviços/equipamentos via `CatalogClient.tsx`/`EquipmentClient.tsx` na tab catálogo.
- Integração e evidência (teste, resultado, commit): Gate L04 usa catálogo/equipamento reais como base do orçamento técnico e de mão de obra.
- Pendência / fronteira externa / aceite humano: Locação/comodato como modalidade de cobrança não foi exercitada explicitamente no gate; existe no schema.

## CRM-12
equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `EquipmentClient.tsx`.
- Integração e evidência (teste, resultado, commit): Gate L04 cria/consulta equipamento real vinculado ao orçamento técnico.
- Pendência / fronteira externa / aceite humano: Ligação com estoque físico não foi exercitada (fora do escopo local declarado).

## CRM-13
vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `InspectionClient.tsx` na tab vistoria.
- Integração e evidência (teste, resultado, commit): Gate L04: cria vistoria real vinculada à visita/oportunidade, por HTTP autenticado, antes de orçar.
- Pendência / fronteira externa / aceite humano: Fotos autorizadas e checklist completo por serviço não foram exercitados byte a byte; o gate cobre os campos estruturais.

## CRM-14
orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, benefícios, provisões, substituição, supervisão, uniforme/EPI, deslocamento, materiais e indiretos.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `LaborBudgetClient.tsx` na tab orçamentos.
- Integração e evidência (teste, resultado, commit): Gate L04 cria orçamento de mão de obra real vinculado à vistoria.
- Pendência / fronteira externa / aceite humano: Todos os componentes de custo (benefícios, provisões, substituição etc.) existem no schema; o gate não confere cada um isoladamente, só a criação e o fluxo de aprovação de preço.

## CRM-15
orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `TechnicalBudgetClient.tsx` na tab orçamentos.
- Integração e evidência (teste, resultado, commit): Gate L04 cria orçamento técnico real (materiais/equipamento/instalação) vinculado à mesma vistoria.
- Pendência / fronteira externa / aceite humano: Garantia e manutenção como campos foram criados no schema; não foram todos exercitados individualmente pelo gate.

## CRM-16
parâmetros de tributos/custos/jornada versionados com validade, fonte e aprovador; nenhuma alíquota ou regra coletiva inventada. Impedir preço oficial se faltar parâmetro essencial.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `CostParameterClient.tsx` na tab precos.
- Integração e evidência (teste, resultado, commit): Gate L04 prova o bloqueio intencional: sem parâmetro essencial, o preço oficial não pode ser aprovado (`essential_params_missing_cannot_approve_official_price`) — comportamento correto da regra de negócio, confirmado por controle negativo real, não simulado.
- Pendência / fronteira externa / aceite humano: Fonte/aprovador de cada parâmetro não foram auditados um a um; o gate cobre o efeito (bloqueio) e não o cadastro completo de todas as alíquotas.

## CRM-17
cenários de preço e margem, separando margem de markup. Para tributos proporcionais à receita e margem sobre receita, uma simulação pode usar preço = custo / (1 - taxa - margem), somente sob premissas explícitas, denominador válido e aprovação contábil. Não impor essa fórmula a todos os regimes.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `PriceScenarioClient.tsx` na tab precos.
- Integração e evidência (teste, resultado, commit): Gate L04 cria cenário de preço válido e testa controle negativo de denominador inválido (fórmula preço = custo / (1 - taxa - margem) recusada quando o denominador não é positivo).
- Pendência / fronteira externa / aceite humano: Aprovação contábil formal do cenário é um campo/flag no fluxo, não uma integração externa real; permanece decisão local, não contábil oficial.

## CRM-18
alçadas de desconto e exceções; motivo, solicitante, aprovador e versão. Alteração de itens/custos após aprovação reabre a aprovação.
- Estado: pronto_local
- Tela / API / dados / autorização: `src/server/discount-api.mjs` (corrigido nesta sessão) + `DiscountClient.tsx` na tab precos.
- Integração e evidência (teste, resultado, commit): Achado e corrigido nesta sessão: a verificação de alçada era um bloco vazio (nunca bloqueava de fato) com bypass implícito para qualquer papel/admin. Agora: bloqueio de autoaprovação verificado primeiro (solicitante == aprovador nunca aprova), depois `hasPermission(pool,{permission:'proposals.approve_discount'})` real via `auth_permissions` — sem bypass por papel. Gate L04 prova: negação de autoaprovação, negação por falta de permissão, aprovação real por segunda identidade com a concessão, e reabertura da aprovação após editar item pós-aprovação (mecanismo já existente, agora com trilha de prova ponta a ponta).
- Pendência / fronteira externa / aceite humano: A concessão de `proposals.approve_discount` ainda é feita nesta entrega via inserção direta em `auth_permissions` para fins de prova; não há tela de administração de concessão de permissões comerciais (a de RH/portal cobre outros domínios).

## CRM-19
proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões, prazo, reajuste previsto, validade e condições; PDF gerado a partir da mesma versão persistida.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ProposalClient.tsx` na tab propostas.
- Integração e evidência (teste, resultado, commit): Gate L04: cria proposta versionada com itens reais, transições de versão, trava de itens após envio (409), e gera PDF cujos bytes/cabeçalho são verificados de verdade (não é simulação).
- Pendência / fronteira externa / aceite humano: Reajuste previsto e condições contratuais complexas existem como campos; não foram todos exercitados individualmente.

## CRM-20
estados rascunho → revisão → aprovada para envio → enviada → aceita/recusada/expirada/substituída; preservar versões enviadas.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ProposalClient.tsx`.
- Integração e evidência (teste, resultado, commit): Gate L04 percorre rascunho→revisão→aprovada para envio→enviada, incluindo a trava de itens (409) após o envio; versões anteriores preservadas.
- Pendência / fronteira externa / aceite humano: Estados aceita/recusada/expirada/substituída são exercitados via o fluxo de aceite (CRM-22/23), não isoladamente aqui.

## CRM-21
envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integração.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ProposalDeliveryClient.tsx` na tab propostas.
- Integração e evidência (teste, resultado, commit): Gate L04 confirma que a entrega é honesta: usa só a caixa de saída local (L02), nunca declara "entregue"/"lido" sem `proof` explícito — sem SMTP nem provedor real, conforme escopo.
- Pendência / fronteira externa / aceite humano: Assinatura por integração (DocuSign etc.) não existe e não está no escopo local; aceite é só o link seguro (CRM-22).

## CRM-22
aceite por link seguro, expirável e vinculado à versão, se adotado; decisão jurídica sobre valor do aceite registrada. Não chamar clique simples de assinatura qualificada.
- Estado: pronto_local
- Tela / API / dados / autorização: `src/server/proposal-acceptance-api.mjs` (bug de `require()` em ESM corrigido nesta sessão) + nova página pública `/proposta/aceite/[token]` (`AcceptanceClient.tsx`, novo nesta sessão) — primeira UI para esse fluxo, que antes só existia como API.
- Integração e evidência (teste, resultado, commit): Gate L04 prova por Chromium real: token forjado 404, versão divergente após nova versão 409, link expirado 410 (backdatando `created_at` e `expires_at` para satisfazer `chk_expires_future`), aceite real preenchendo o formulário, reuso do link já aceito 410. Cópia explícita na tela: "aceite simples, não assinatura qualificada".
- Pendência / fronteira externa / aceite humano: Decisão jurídica formal sobre o valor do aceite simples não foi registrada (é uma decisão de negócio/jurídica, fora do escopo técnico desta sessão).

## CRM-23
proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ContractClient.tsx` na tab contratos.
- Integração e evidência (teste, resultado, commit): Gate L04 aceita a proposta duas vezes seguidas (reuso do link já usado → 410) e confirma, via consulta direta, que existe exatamente uma linha de contrato — idempotência real provada, não assumida.
- Pendência / fronteira externa / aceite humano: É um contrato mínimo/stub: sem numeração fiscal, sem integração de faturamento; rotulado como tal.

## CRM-24
relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário. Previsão ponderada é estimativa identificada.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ReportClient.tsx` na tab relatorios.
- Integração e evidência (teste, resultado, commit): Componente conectado nesta sessão; não foi alvo de cenário dedicado no gate L04 além de estar acessível sem 5xx na varredura final de `/admin/comercial`.
- Pendência / fronteira externa / aceite humano: Relatórios de conversão por etapa/origem e pipeline por cenário não tiveram cada métrica conferida individualmente nesta sessão — só a conectividade e ausência de erro foram provadas.

## CRM-25
metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento automático.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `CommissionClient.tsx` na tab relatorios.
- Integração e evidência (teste, resultado, commit): Conectado nesta sessão; coberto pela varredura final de `/admin/comercial` sem 5xx/console error. Sem pagamento automático (conforme exigido).
- Pendência / fronteira externa / aceite humano: Base de cálculo (contratado/faturado/recebido) e aprovação não foram exercitadas cenário a cenário nesta sessão.

## CRM-26
biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `CommercialLibraryClient.tsx` na tab biblioteca.
- Integração e evidência (teste, resultado, commit): Conectado nesta sessão; coberto pela varredura final sem 5xx/console error.
- Pendência / fronteira externa / aceite humano: Comparação de propostas lado a lado não foi exercitada como cenário próprio.

## CRM-27
parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `PartnershipClient.tsx` na tab biblioteca.
- Integração e evidência (teste, resultado, commit): Conectado nesta sessão; coberto pela varredura final sem 5xx/console error.
- Pendência / fronteira externa / aceite humano: Métricas de renovação/upsell/recuperação de carteira não foram exercitadas cenário a cenário nesta sessão.

## CON-01
contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-02
itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-03
estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura com ativação operacional.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-04
aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-05
alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-06
obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-07
implantação com checklist: contrato, data de início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções, faturamento e convite do cliente.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-08
bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-09
encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-10
dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-11
diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-01
perfil próprio e solicitação de atualização cadastral; dados restritos mascarados conforme necessidade e mudança revisada.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` (perfil e login próprio); `/api/employee/session`, `/me`, `/profile-updates`; `auth_employee_access`, `hr_employees`; titular derivado do cookie employee.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: login individual, perfil A/B, parâmetro `employee_id` adversarial ignorado, troca de senha com revogação. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-02
próximo plantão com local, horário, função, contato do supervisor, orientações e itens necessários.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-03
calendário de escala, folgas, alterações e ciência da versão publicada; usuário não modifica unilateralmente a escala.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-04
jornada individual, comprovantes/importação de provedor, divergências e pedido de correção; preservar registro original.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-05
aviso de ausência/atraso com protocolo, motivo limitado, responsável e acompanhamento; aciona fluxo de cobertura.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-06
troca de plantão com solicitação, aceite do outro profissional quando aplicável, validações e aprovação operacional.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-07
passagem de serviço com pendências, chaves, equipamentos, ocorrências e aceite; não expor dados desnecessários de terceiros.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-08
ocorrência com categoria, descrição, horário, local e anexo pertinente; restrição para informações pessoais.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-09
procedimentos do posto versionados, ciência e contatos de apoio.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-10
envio de documentos solicitados, status pendente/em análise/aprovado/rejeitado com motivo e nova versão.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-11
holerites/informes/documentos próprios, acesso privado e histórico de disponibilização; publicação proveniente de fonte autorizada.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-12
férias, afastamentos, benefícios e reembolsos com solicitação, anexos restritos, aprovação e prazo de resposta.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-13
uniformes/EPI/equipamentos com entrega, recibo, solicitação de troca e devolução.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-14
cursos e reciclagens, comprovantes e alertas de vencimento.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-15
comunicados direcionados, confirmação de leitura e central de notificações.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-16
atendimento RH com protocolo, categoria, mensagens privadas e acompanhamento.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-17
canal confidencial separado, com responsáveis e política de acesso; anonimato somente se efetivamente suportado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Canal sigiloso e identificado; anonimato não está habilitado e pedido anônimo falha explicitamente. Aceite humano no Windows pendente.

## EMP-18
PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotência, conflito explícito, horário do dispositivo e recebimento no servidor separados. Não cachear documentos médicos/salariais por padrão.
- Estado: pronto_local
- Tela / API / dados / autorização: PWA `/funcionario`, fila local por empregado só para ciência aprovada e `/api/employee/offline`; service worker exclui API/portal e conteúdo médico/salarial; migração 069/102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Chromium fica offline, guarda 1 tarefa, volta online e espera 201; HTTP prova retry idempotente, conflito explícito e timestamps separados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Fila deliberadamente limitada; não armazena documentos médicos/salariais. Teste no Windows permanece para L10.

## EMP-19
FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de dados.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Mais, FAQ interno e preferências de acessibilidade; layout móvel 390×844, navegação sem mouse e linguagem simples; migração 069.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium percorre todas as abas, encontra FAQ/acessibilidade e recusa rolagem horizontal; build e typecheck aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## HR-01
cadastro profissional separado de identidade de login; matrícula, vínculo, cargo, empregador/filial, gestor, admissão, status, contatos necessários e histórico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Admissão & acesso/Processos HR-01,02,05; `hr-api` e migração 057; cadastro laboral separado da identidade e remuneração sob concessão própria.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium cria cadastro + admissão + acesso e escala; HTTP prova salário mascarado sem `employees.compensation.read`. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-02
histórico de cargo, lotação, remuneração autorizada e vínculo com datas de efeito; acesso por campo/categoria.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Admissão & acesso/Processos HR-01,02,05; `hr-api` e migração 057; cadastro laboral separado da identidade e remuneração sob concessão própria.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium cria cadastro + admissão + acesso e escala; HTTP prova salário mascarado sem `employees.compensation.read`. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-03
recrutamento com vaga, requisitos pertinentes, candidatos, triagem, entrevista, decisão e comunicação; retenção e acesso próprios para currículo.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-03,04,06; `HrRecruitmentClient`, `hr-recruitment-api` e migração 059, sob `employees.read/write`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre o grupo conectado e exige carga das APIs sem erro; migração 001–102 e build aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-04
banco de talentos e autorização/base aplicável; descarte configurado, sem acúmulo indefinido.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-03,04,06; `HrRecruitmentClient`, `hr-recruitment-api` e migração 059, sob `employees.read/write`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre o grupo conectado e exige carga das APIs sem erro; migração 001–102 e build aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Política e descarte são configuráveis; base jurídica e prazos reais exigem decisão do controlador. Aceite Windows pendente.

## HR-05
admissão com checklist por função, documentos, validação, exame/treinamento e integração; não exigir dado sem finalidade.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Admissão & acesso/Processos HR-01,02,05; `hr-api` e migração 057; cadastro laboral separado da identidade e remuneração sob concessão própria.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium cria cadastro + admissão + acesso e escala; HTTP prova salário mascarado sem `employees.compensation.read`. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-06
dossiê com tipos, versões, validade, pendências e aprovador. CNV e demais documentos apenas para funções/atividades aplicáveis, após confirmação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-03,04,06; `HrRecruitmentClient`, `hr-recruitment-api` e migração 059, sob `employees.read/write`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre o grupo conectado e exige carga das APIs sem erro; migração 001–102 e build aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-07
desligamento com checklist, devolução, revogação, documentação e pendências; histórico laboral preservado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Desligamento/Processos HR-07..09; `hr-termination-api`, políticas/status/férias e migração 060; trigger 102 revoga acesso.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate conclui desligamento pela interface e comprova sessão employee revogada; status/papel/senha também têm controles negativos. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-08
mudança de status (afastado/suspenso/desligado) com efeito em permissões e alocação conforme política, sem automatizar sanção trabalhista.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Desligamento/Processos HR-07..09; `hr-termination-api`, políticas/status/férias e migração 060; trigger 102 revoga acesso.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate conclui desligamento pela interface e comprova sessão employee revogada; status/papel/senha também têm controles negativos. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-09
férias com períodos aquisitivo/concessivo quando aplicáveis, saldo importado/validado, programação, conflito de cobertura e aprovação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Desligamento/Processos HR-07..09; `hr-termination-api`, políticas/status/férias e migração 060; trigger 102 revoga acesso.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate conclui desligamento pela interface e comprova sessão employee revogada; status/papel/senha também têm controles negativos. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-10
afastamentos com período, retorno, documentação restrita e substituição; supervisor vê indisponibilidade/aptidão operacional necessária, não diagnóstico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-10..12 e portal Jornada; `hr-absence-api`, afastamentos/ponto/banco/regras versionadas; migração 061.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium solicita correção e ausência; grupo RH carrega APIs reais; fechamento demonstrativo preserva trilha. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-11
integração de ponto, justificativas, divergências, workflow de correção e fechamento de competência; trilha de reabertura.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-10..12 e portal Jornada; `hr-absence-api`, afastamentos/ponto/banco/regras versionadas; migração 061.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium solicita correção e ausência; grupo RH carrega APIs reais; fechamento demonstrativo preserva trilha. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-12
banco de horas, adicionais e horas extras somente com regras versionadas e validadas para o vínculo/convenção; não fixar 12x36/6x1 como regra universal.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-10..12 e portal Jornada; `hr-absence-api`, afastamentos/ponto/banco/regras versionadas; migração 061.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium solicita correção e ausência; grupo RH carrega APIs reais; fechamento demonstrativo preserva trilha. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-13
benefícios com elegibilidade, solicitações, conferência, alterações por período e exportação ao fornecedor.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Exportação local não comprova entrega ao fornecedor. Integração externa não é alegada; aceite Windows pendente.

## HR-14
adiantamentos/reembolsos com alçada e comprovantes, integração com financeiro e prevenção de duplicidade.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-15
saúde ocupacional com agenda, vencimentos e documentos necessários; acesso restrito. Não replicar prontuário médico completo no cadastro comum.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Acesso de saúde é separado; o sistema não se declara prontuário médico. Validação ocupacional e aceite Windows pendentes.

## HR-16
integração/exportação para contabilidade/SST, recibos de processamento, erros e correção. Não declarar envio eSocial sem protocolo válido do responsável/provedor.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Adaptador/recibo local, sem afirmar envio eSocial/SST oficial. Provedor e protocolo externo dependem de integração futura.

## HR-17
treinamento por cargo/atividade, obrigatoriedade aplicável, validade, inscrição, presença e comprovante.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-18
matriz de competências integrada à alocação, sem decisão automática de contratação/punição.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-19
uniformes/EPI com entrega, recibo, substituição, validade/controle aplicável e devolução.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-20
fechamento DP com faltas, férias, variáveis e documentos conferidos; exportação versionada e acesso do contador limitado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Fechamento é demonstrativo e não constitui cálculo trabalhista oficial; validação contábil e aceite Windows pendentes.

## HR-21
holerites/informes importados de fonte autorizada, vinculação inequívoca ao colaborador, revisão antes de publicar e correção rastreada.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Fonte autorizada é cadastrada pelo operador local; sem entrega externa nem cálculo oficial. Aceite Windows pendente.

## HR-22
avaliações e planos de desenvolvimento com critérios definidos, acesso privado e participação humana; feedback de cliente não vira punição automática.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-23
atendimento interno com fila, responsável, categoria, prazo e mensagens; anexos de saúde fora de tickets genéricos.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-24
indicadores de quadro, admissão, faltas, rotatividade, férias, documentos e atendimento, com fórmula e período explícitos.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## OPS-01
estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação; cargo/função em entidade própria.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-02
dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-03
escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-04
validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-05
ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-06
passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-07
livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-08
checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-09
visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-10
rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/QR isolado não prova execução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-11
chaves, rádios, materiais e equipamentos com guarda/transferência/devolução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-12
relatórios periódicos ao cliente com revisão de conteúdo e privacidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-13
métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-14
escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-15
supervisão de limpeza com rotinas por ambiente, consumo e não conformidades.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-16
eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto específico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-01
identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identificadas/redirecionadas com cuidado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-02
múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo cliente apenas se autorizada, sem ampliação fora do próprio escopo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-03
contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico interno não publicado automaticamente.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-04
documentos com categoria/validade/versão, busca e download privado; autorização testada em todos os caminhos.
- Estado: em_execucao
- Tela / API / dados / autorização: POST /api/admin/documents grava bytes reais em ctx.docsDir com chave de 24 bytes gerada pelo servidor (48 hex, validada por STORAGE_KEY_PATTERN antes de path.join) e content_sha256; GET /api/admin/documents/:id/download e /api/client/documents/:id/download exigem sessão.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 1 a 5, commit 4b95616: bytes conferidos em disco; nome "../../../../etc/passwd" não vira caminho e nada é escrito fora do diretório; download sem sessão 401; adulteração do arquivo em disco devolve 409 document_integrity_failed em vez de servir bytes trocados; documento de outra conta negado pela rota do cliente.
- Pendência / fronteira externa / aceite humano: Faltam categoria com validade e versionamento de documento (a tabela client_documents ainda não tem versão nem vencimento) e a busca por documento. A migração 101 também corrigiu CHECK (uploaded_by IN ('marcelo','ti')), que rejeitava os papéis admin/rh criados no L01.

## CLI-05
chamados com protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-06
estados aberto/em atendimento/aguardando cliente/resolvido/encerrado, reabertura e motivo; pausas de SLA explicitamente definidas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-07
agenda de visita/manutenção, confirmação, reagendamento e histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-08
relatórios de execução e medição/aceite de serviço com revisão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-09
cobranças/documentos fiscais/comprovantes somente quando financeiro estiver integrado; dados da própria conta.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-10
solicitação de serviço adicional gera oportunidade no CRM com origem e responsável.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-11
satisfação pós-atendimento e periódica, plano de ação e risco de renovação baseado em fatos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-12
renovação e comunicação contratual com registro, sem bloquear indiscriminadamente o portal por inadimplência.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-13
modos convite, solicitação com aprovação e autocadastro configuráveis; vínculo verificado no servidor em todos. Autocadastro nunca libera contratos sozinho.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-14
segurança da conta com MFA opcional, gestão de sessões e troca de e-mail concluída; fluxos ligados ao backend real.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-15
reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com RH.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-01
contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, valor e situação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-02
contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-03
geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-04
pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-05
conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-06
cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-07
fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-08
custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-09
resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompleta.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-10
despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-11
integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-12
boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-13
orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-14
exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do contador.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-15
fechamento de competência e reabertura autorizada; preservar versões de relatório.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-16
comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-01
produtos/SKU, fornecedores, unidade de medida, custo, local e estoque mínimo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-02
entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movimentos consistentes.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-03
reserva para proposta/implantação sem confundir reserva com saída; liberação em cancelamento.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-04
equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manutenção e termo de guarda.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-05
entrega/devolução, avaria/perda, fotos pertinentes e conferência.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-06
requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-07
inventário físico, divergências e ajuste aprovado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-08
ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, peças e execução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-09
evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao que for aprovado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-10
manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por ativo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-11
dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; senhas de equipamentos fora do cadastro/log comum.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-12
materiais de limpeza com consumo por local, reposição e comparação ao previsto.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-01
painel “Meu dia” com pendências reais, prioridade, responsável e ação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-02
visão comercial com leads novos, oportunidades paradas, propostas e próximas ações.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-03
visão operacional com cobertura, ocorrências críticas, SLA e implantação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-04
visão financeira com fonte/competência, saldo, vencimentos e margem por contrato.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-05
contratos próximos de renovar, reclamações reincidentes e risco de perda justificado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-06
aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por valor/escopo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-07
busca autorizada, favoritos, filtros salvos e atalhos com contexto.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-08
relatórios exportáveis e agendados para destinatários autorizados; registrar geração/envio e limitar dados.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-09
configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e preferências.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-10
metas e cenários com comparação prevista/realizada, sem confundir estimativa com resultado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-11
trilha e diário de decisões CON-11 acessíveis conforme permissão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-12
análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos reais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-01
diretório de usuários, papéis, escopos, convites, suspensão/revogação e revisão periódica de acesso.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-02
auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e exportação auditada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-03
integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-04
fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento.
- Estado: pronto_local
- Tela / API / dados / autorização: POST/GET /api/admin/notifications, POST /api/admin/notifications/:id/retry, POST /api/admin/notifications/process (sessão de staff). Tabela notification_queue com dedup_key único parcial, attempts/max_attempts, next_attempt_at e escada de backoff 1/5/15/60/240 min; estados queued, sending, local_outbox, failed, dead.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 6, 7 e 8 (HTTP real + PostgreSQL descartável), commit 4b95616. Dois defeitos corrigidos e provados por controle negativo: (a) isValidUuid com 4 grupos recusava todo UUID canônico; (b) reivindicação não atômica permitia entrega dupla — com o código antigo restaurado o teste 8 falha com "entregue 2 vezes".
- Pendência / fronteira externa / aceite humano: A tela de operação da fila ainda não existe; o consumo é por API. Reprocessamento manual exposto, mas sem agendador automático em execução contínua.

## PLT-05
notificações no painel, e-mail e canais externos configurados, preferências e templates revisados; nenhuma informação médica em assunto/push.
- Estado: em_execucao
- Tela / API / dados / autorização: Canal de e-mail roteado para a caixa de saída LOCAL (src/server/local-outbox.mjs); GET /api/admin/outbox e /api/admin/outbox/:id sob sessão de staff. Preferências e templates existem em 043-plt05-notifications.sql.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 9 a 14, commit 4b95616: estado gravado é local_outbox e sent_at permanece nulo; nenhuma resposta contém "enviado"/"entregue"; listagem não devolve o corpo; leitura é contada e auditada; mensagem vencida responde 410.
- Pendência / fronteira externa / aceite humano: SMTP está fora do escopo por decisão do cliente: não há e-mail real. Falta a tela de painel de notificações e a revisão de conteúdo de templates (assunto/push sem informação médica) ainda não foi verificada por teste.

## PLT-06
observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas acionáveis, sem segredos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-07
healthcheck/liveness/readiness, degradação explícita de dependências e painel operacional restrito.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-08
backup de banco e documentos, criptografia, acesso, retenção e restauração testada em ambiente isolado.
- Estado: em_execucao
- Tela / API / dados / autorização: scripts/demo-offline-snapshot.mjs: cópia fria de pgdata + documents com manifest.json (formato seg-demo-cold-copy-v1) contendo caminho, bytes e sha256 por arquivo; restauração em diretório e cluster isolados, sem sobrescrever a origem.
- Integração e evidência (teste, resultado, commit): npm run test:demo-local:pg (QA-HOM-009), commit 4b95616: backup a quente é recusado com o lock do runner; a restauração isolada confere marcador de instalação, ledger de migrações e todos os checksums, sobe PostgreSQL próprio e valida por HTTP que o cliente enxerga a conta A e não a B.
- Pendência / fronteira externa / aceite humano: A trilha de dump lógico (npm run test:backup-restore:pg) NÃO foi exercitada neste ambiente: exige pg_dump/pg_restore 17, que não existem no sandbox Linux (o pacote embedded-postgres traz apenas initdb, pg_ctl e postgres) e não há pacote disponível. A suíte recusa de forma explícita e não cria banco. No alvo Windows o PostgreSQL 17 instala esses binários e a suíte deve ser executada lá. Criptografia em repouso e política de retenção ainda não implementadas.

## PLT-09
política de privacidade completa, inventário de dados/finalidades, bases aplicáveis, destinatários, prazos, contatos e direitos; revisão competente antes de publicar.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-10
pedidos de acesso/correção/eliminação com verificação de identidade, responsável, prazo e impedimentos legais documentados.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-11
retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal e histórico minimizado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-12
resposta a incidente com responsáveis, contenção, evidências, análise e comunicação conforme avaliação aplicável.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-13
gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de infraestrutura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-14
revisão de dependências, lockfile, vulnerabilidades, atualizações e CI.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-15
importação/exportação, logs de integração, limites, webhooks autenticados, retries e reconciliação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-16
orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraestrutura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-17
isolamento de desenvolvimento/homologação/produção com contas e dados próprios; previews sem dados reais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-18
documentação para manutenção por outro programador, configuração, migração, diagnóstico e recuperação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-01
Frota Aceite: Veículo, responsável, abastecimento, manutenção, documentos e custo; se frota própria existir
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-02
Terceiros Aceite: Cadastro, contrato, documentos, vencimentos, acesso temporário e avaliação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-03
Licitações Aceite: Edital, prazos, documentos, responsáveis, proposta e resultado; se mercado relevante
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-04
Portal fornecedores Aceite: Cotações/documentos/pedidos com escopo próprio; se volume justificar
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-05
Qualidade Aceite: Não conformidade, causa, ação corretiva, verificação e reincidência
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-06
Satisfação/carteira Aceite: Pesquisas, CSAT/NPS quando adequado, histórico e tarefa de recuperação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-07
Compliance corporativo Aceite: Licenças/certidões/seguros e obrigações aplicáveis com responsável e validade
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-08
Base de conhecimento Aceite: Procedimentos versionados, busca, acesso e ciência
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-09
Expansão/unidades Aceite: Planejamento de filial/contrato, capacidade e cenários financeiros
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-10
Continuidade operacional Aceite: Contingência por posto/cliente, contatos, exercícios e recuperação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-11
Analytics/A-B Aceite: Hipótese, variantes aprovadas, métrica e privacidade
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-12
Editor visual avançado Aceite: Tokens/layouts versionados, preview e publicação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-13
Relatório periódico Aceite: Consolidação de métricas e envio autorizado
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-14
Inteligência comercial Aceite: Indicações, reativação e recomendações baseadas em histórico
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-15
Apoio emergencial Aceite: Canal, destinatário, disponibilidade e escalonamento definidos
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-16
Central/vídeo Aceite: Projeto separado para eventos de monitoramento, vídeo e disponibilidade
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-17
Biometria/reconhecimento Aceite: Projeto separado, necessidade e avaliação de impacto/base aplicável
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-01
FAQ pública com respostas aprovadas e transferência humana; informar limites, não inventar serviços/credenciais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-02
resumo de histórico comercial autorizado, com links para registros de origem.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-03
rascunho de proposta a partir de catálogo e versão de custos aprovados; sem alterar preço/escopo ou enviar sozinho.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-04
classificação e sugestão de resposta a chamados, submetida a revisão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-05
extração de campos de documentos em ambiente privado, revisão humana e descarte de artefatos conforme política.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-06
busca interna/RAG filtrada por permissão antes de recuperar conteúdo; isolar índices/consultas quando necessário.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-07
relatório gerencial com cálculos feitos por código/consulta validada; IA narra, não inventa totais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-08
inconsistências cadastrais e próximas ações sugeridas, com justificativa e fonte.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-09
curadoria da base, versão, publicação, feedback, avaliação, custo/token e rollback.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-10
automações determinísticas de vencimentos, distribuição de tarefas e cobrança interna antes de agentes autônomos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

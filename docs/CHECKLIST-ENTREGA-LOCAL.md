# Checklist da entrega local — 222 requisitos

Atualização de controle em 2026-10-01: L07 em execução. Ver [consolidação](CONSOLIDACAO-L07-PRS-PENDENTES.md) e [retomada](PROMPT-RETOMADA-L07-CONSOLIDADO.md). L04–L06 já têm entregas técnicas integradas. Estados abaixo conservam evidências por requisito, não uma porcentagem global; não houve promoção em massa nesta revisão.
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
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/servicos`, `/servicos/[id]`, `/segmentos`, `/faq`, `/contato`, `/conteudos` e `/conteudos/[slug]`; cases exigem declaração de autorização; conteúdo simples sem HTML executável.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 1, 11, 16 e 18: navegação HTTP/Chromium, viewport móvel, handoff com consentimento/protocolo e bloqueio de case não autorizado. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Aceite visual e revisão do conteúdo pelos responsáveis pendentes. Teste funcional móvel não é certificação WCAG nem ensaio de carga.

## PUB-03
orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada e responsável de atendimento.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/leads` (`server.mjs handleCreateLead`) grava `public_leads` (protocolo, consentimento, origem, campanha, canal, e-mail, dedup_key); validação em `src/lib/public-lead-validation.mjs`.
- Integração e evidência (teste, resultado, commit): Gate L04: visitante anônimo real (sem sessão) envia `/contato`; dedup/antispam/consentimento testados por HTTP direto com controles negativos (origem/campanha maliciosa, canal inválido, e-mail inválido, replay). Corrigido nesta sessão: `public-lead-validation.mjs` descartava silenciosamente origin/campaign/channel/email do formulário real; `handleCreateLead` confiava em `dedupKey` vindo do navegador — agora a chave é derivada só no servidor (telefone+cidade+serviços+janela de 30min).
- Pendência / fronteira externa / aceite humano: Responsável de atendimento por lead ainda é atribuído manualmente em `/admin/leads`, sem regra automática de distribuição. Antispam é básico (padrões de marcação/URL); sem CAPTCHA. O limite dedicado do endpoint (5 envios por IP a cada 10 min) passou a aceitar `LEAD_MAX_ATTEMPTS` por ambiente do servidor, com padrão seguro inalterado e valor inválido caindo no padrão — usado apenas pelo gate, como já era feito com `ADMIN_LOGIN_MAX_ATTEMPTS`.

## PUB-04
visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real.
- Estado: pronto_local
- Tela / API / dados / autorização: `PATCH /api/admin/leads/:id` (`handleAdminLeadStatus`) com estados solicitada→em_agendamento→confirmada→realizada→cancelada; UI em `/admin/leads` (papéis `marcelo`,`ti`,`comercial`,`admin`).
- Integração e evidência (teste, resultado, commit): Gate L04 exercita transições de visita reais via HTTP autenticado com sessão de staff `comercial` (login real, não token). Nesta sessão (`arena/01a0eeda`), o cenário 7 do gate provou o vínculo com CRM-08: a agenda comercial propaga confirmação/realização/cancelamento ao lead de origem com `lead_visit_confirm`/`lead_visit_cancel` e histórico em `public_lead_status_audit`, na mesma transação (falha de auditoria injetada reverte a visita e o lead).
- Pendência / fronteira externa / aceite humano: Notificação ao solicitante sobre confirmação de horário usa a caixa local (L02) — nunca promete envio real (SMTP fora de escopo). Sem tela dedicada de agenda/calendário; apenas lista com status. Corrigido nesta sessão: `PATCH /api/admin/leads/:id` auditava qualquer transição de visita (inclusive cancelamento) como `lead_visit_confirm` e engolia a falha de auditoria com `try {} catch {}` — o mapeamento passou a ser fiel e a falha de trilha reverte a transição.

## PUB-05
FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada e controles do capítulo 19.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `FaqAssistedWidget` em `/faq` → `POST /api/faq-assisted`; respostas de FAQ publicada em `cms_contents`. Encaminhamento a `/contato?origin=faq`, pergunta só no navegador, lead real em `/api/leads`. Sessões/mensagens legadas protegidas.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 16: pergunta sensível sem preço inventado, resposta publicada com fonte, acesso público às sessões negado e envio real no Chromium com origem `faq`. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: LLM/RAG pertence a L09. Atendimento humano só é solicitado após persistir o formulário com consentimento; sem SMTP ou promessa de atendimento instantâneo.

## PUB-06
CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/publicacao` → CMS com admin/marcelo/ti. `cms_contents`, versões e histórico imutáveis; `/conteudos` e `/conteudos/[slug]` leem somente publicados.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 16: rascunho privado, transições, duas versões publicadas sequencialmente com uma ativa, restauração como nova versão, histórico, negação e rollback por auditoria injetada. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Textos e autorização de cases precisam de aceite humano antes de uso real. Texto simples; sem novo upload público.

## PUB-07
temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global. Implementar após núcleo.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/tema` e aba Temas de `/admin/publicacao`; `pub_themes`, versões/histórico/preferências. Prévia isolada; publicação e rollback transacionais, um tema ativo; leitura pública mínima.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 16–17: prévia não altera estado global, publicar dois temas, restaurar anterior, recarregar navegador e manter paleta, preferência pessoal não muda tema global. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Tokens aplicados às superfícies editoriais; seleção dos dez layouts permanece em `/admin/visual`. Portais internos não são redesenhados. Aceite visual humano pendente.

## PUB-08
SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos.
- Estado: pronto_local (limites externos/condicionais descritos abaixo)
- Tela / API / dados / autorização: `GET /robots.txt` e `GET /sitemap.xml` públicos, ambos **derivados do código** (`src/lib/seo-technical.mjs` + `src/server/seo-technical-api.mjs`); prévia autenticada `GET /api/admin/seo/sitemap-preview`; cadastro `GET/POST/PATCH /api/admin/seo-redirects`; resolução do desvio no caminho da requisição, antes do Next. Sitemap montado a partir das rotas estáticas reais + `PUBLIC_SERVICES` (`src/lib/service-catalog.mjs`) + `SEGMENT_EXAMPLES` (`src/lib/segment-examples.mjs`, convertido de `.ts` para ter uma fonte só), com XML escapado e somente `<loc>`. `noindex` fail-closed: só libera com `NEXT_PUBLIC_ENV=production` **e** `NEXT_PUBLIC_ALLOW_INDEX=true` — fora disso `Disallow: /` sem linha `Sitemap:`, `X-Robots-Tag: noindex, nofollow` e `/sitemap.xml` 404. Papéis `marcelo`,`ti`,`admin`: sem sessão 401, papel fora da lista **403** (antes era 401), mutação sem mesma origem 403, método errado 405 com `Allow`. Escrita transacional com trilha em `auth_access_audit` (`seo_redirect_create`/`seo_redirect_update`, `actor_kind` = papel) na mesma transação. Migração **112** (aditiva) reautoriza essas duas ações. Tabelas `seo_redirects` (usada), `seo_configs`/`seo_sitemap_entries` (declaradas **não** fonte de verdade).
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l04-delivery:pg` **11/11 duas vezes consecutivas** — cenário "PUB-08: SEO técnico — robots/sitemap derivados, noindex fail-closed e redirect real". Prova: robots fail-closed e `/sitemap.xml` 404 imune a `?released/force/preview`; prévia 401/403/405/200 sem `/admin`, `/api/`, `/cliente`, `/funcionario`, `/layout-0`, `/qa/`, `/proposta` e sem `<lastmod>/<priority>/<changefreq>`; **cada uma das 17 URLs derivadas buscada por HTTP real exigindo 200 e `<title>` não vazio**; `GET /api/seo` e `/api/seo-configs` anônimos 401 e `comercial` 403 (vazamento de rascunho fechado); 14 recusas nomeadas do cadastro (externo absoluto, `//` relativo a protocolo, barra invertida, espaço, sombra de rota pública real, de `/admin`, de `/api` e do próprio `/sitemap.xml`, destino inexistente, destino em área interna, laço, tipo de status inventado, motivo curto e campo gerido pelo servidor vindo do cliente) — nenhuma grava linha — mais a recusa de **cadeia**, alcançável só por fixture SQL; falha de auditoria injetada por gatilho ⇒ 503 e **zero** linha em `seo_redirects`; criação 201 com exatamente 1 linha de trilha `actor_kind='ti'` e 2ª tentativa `duplicate_old_path`; ação não autorizada ainda recusada pelo banco com `23514`; salto real 301 preservando `?utm`, POST não desviado, `is_active=false` para de desviar e `true` volta, com 1 linha de trilha por alteração; `PATCH` de domínio para `verificado` ⇒ 400 `domain_verification_not_supported` com a linha ainda `pendente`; Chromium real sai de `/promo-portaria` e chega em `/servicos` usando `page.waitForResponse`, sem rolagem horizontal e sem erro de console. Também `npm test` 196/196, `npm run typecheck` 0 erros, `npm run test:migrations:pg` 112/112 checksums e 510 tabelas, `node scripts/qa-wave0-static.mjs` 5/5, `npm run build` OK.
- Pendência / fronteira externa / aceite humano: **Verificação de domínio fica FORA por fronteira externa** (exige DNS/HTTP no domínio real) — em vez de um botão que mente, o caminho que fabricava o fato foi fechado. **`SeoClient.tsx` foi descartado para esta finalidade e permanece órfão**: permite digitar qualquer URL no sitemap, `robots` livre e "Marcar verificado" com um clique. `seo_sitemap_entries` e `seo_configs` continuam existindo sem tela e sem serem fonte de verdade; a coluna `hits` continua 0 e não é incrementada (contar exigiria escrever no banco a cada requisição pública). `/layout-01..10`, `/qa/modulos` e `/proposta/aceite/[token]` ficam fora do sitemap por decisão. Curinga/regex e redirect por domínio fora. **Achado aberto registrado**: as migrações 099/100/103 redigitaram o CHECK de `auth_access_audit` e apagaram 148 ações da lista da 093; a 112 reautoriza só as duas que esta fatia prova — a migração 117 acrescenta somente ações efetivamente usadas nesta entrega; ações dos demais lotes continuam sujeitas à revisão. Indexação **não foi ligada** (nada é publicado em produção). Aceite humano pendente.

- Revalidação final L04: cenários anteriores preservados e executados novamente; consultar SHA e resultados em docs/ENTREGA-L04.md.

## PUB-09
montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produção.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/publicacao` aba Pacotes e `/pacotes`; serviços publicados/validados, regras aprovadas, revisão, aprovação, publicação e comparação. APIs públicas somente leitura e sem custo interno.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 18: preço vindo do cliente recusado, publicação sem aprovação bloqueada, composição persistida, comparador real em Chromium, preço ausente continua nulo/sob consulta e revogação recolhe publicação. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Sem tabela de preço inventada, compatibilidade de equipamento garantida ou contratação automática. Precificação segue vistoria/orçamento/proposta.

## PUB-10
mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos.
- Estado: pronto_local (limites externos/condicionais descritos abaixo)
- Tela / API / dados / autorização: `GET /api/admin/leads/metrics?from=&to=` (`handleAdminLeadMetrics` em `server.mjs`) agrega `public_leads` por origem/campanha/canal e cruza com `crm_opportunities.public_lead_id`/`stage`. Painel `src/app/admin/leads/OriginMetricsPanel.tsx` renderizado em `/admin/leads`. Papéis `marcelo`,`ti`,`comercial`,`admin` (os mesmos de `GET /api/admin/leads`); sem sessão 401, papel fora da lista 403, método diferente de GET 405. Somente leitura: não escreve nada e não grava trilha por consulta. Sem migração nova (001–110 inalteradas).
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l04-delivery:pg` 9/9 duas vezes consecutivas — cenário "PUB-10: mensuração de origem e conversão". Prova: 401 anônimo, 403 papel `rh`, 405 em POST com `Allow: GET`, 400 `invalid_period` (formato inválido, `from > to`, data inexistente 2026-02-31) e 400 `period_too_long` acima de 366 dias; agregados conferidos contra fixture (lead de 40 dias atrás fora da janela de 30 dias, origem em branco virando `(não informado)`, taxa 0% com base existente vs. `null` sem base); minimização provada por asserção de que telefone, e-mail, nome e ids de lead não aparecem no JSON nem no DOM, que as chaves da linha são só rótulos e inteiros, e que `&detail=1&raw=true&include=leads` não destrava nada; Chromium real com sessão `comercial` lê 4 pedidos na janela padrão de 90 dias, encurta para 30 dias esperando a resposta HTTP real e passa a ler 3.
- Pendência / fronteira externa / aceite humano: **Testes A/B continuam sem rota e sem tela, por decisão registrada** — o requisito os condiciona a tráfego, hipótese e tratamento de dados definidos, e nenhuma das três coisas existe. **`OriginMetricsClient.tsx` foi descartado para esta finalidade e permanece órfão**: é um CRUD onde um humano digitaria `total_leads`/`converted_leads` à mão, o que seria métrica inventada com cara de relatório; as tabelas da migração 092 (`pub10_origin_metrics`, `pub10_conversion_events`, `pub10_ab_tests`) continuam existindo, sem tela e sem serem fonte de verdade de nada. Fora desta fatia: exportação (CSV/PDF), gráficos, comparação entre períodos, atribuição multi-toque, contrato como degrau do funil e qualquer envio a ferramenta externa de analytics. "Ganho no funil" é decisão comercial registrada, nunca dinheiro recebido. Aceite humano pendente.

- Revalidação final L04: cenários anteriores preservados e executados novamente; consultar SHA e resultados em docs/ENTREGA-L04.md.

## CRM-01
cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distinguir prospect/cliente/parceiro sem duplicar entidade.
- Estado: **pronto_local** (superfície dedicada de unidades entregue nesta continuação; aceite humano pendente)
- Tela / API / dados / autorização: `/admin/crm` agora inclui `UnitManager.tsx`, com seleção de empresa, criação e edição controladas de unidade, nome da unidade (obrigatório), cidade, endereço e indicação de unidade principal. `GET /api/crm/units?companyId=...` exige escopo de empresa; `GET/PATCH /api/crm/units/:id` não permite trocar `company_id`. Regra atômica desmarca unidade principal anterior ao promover ou criar nova unidade principal. Sessão individual e família `comercial/admin/marcelo/ti`; anônimo 401, RH 403, origem/método inválidos negados. Criação e edição usam auditoria transacional com rollback.
- Integração e evidência (teste, resultado, commit): Gate dedicado `CRM-01: unidades dedicadas com escopo de empresa, unidade principal única, auditoria transacional e UI`, em PostgreSQL descartável + HTTP real + Chromium real sem `--disable-web-security`, **14/14 no total em duas execuções finais consecutivas**. O cenário dedicado prova 401/403/405, empresa obrigatória/inexistente, campos completos, edição de endereço e cidade, unidade principal sem duplicidade por desmarcação atômica, empresa imutável, auditoria e rollback por falha injetada na criação e edição. Migração aditiva 115 reautoriza `crm_unit_create` e `crm_unit_update`, preservando o CHECK anterior e exigindo `auth_access_audit_action_check` e `actor_kind='comercial'`.
- Pendência / fronteira externa / aceite humano: nenhum mapa externo, geocodificação ou integração de terceiros nesta fatia. Aceite humano/Windows continuam pendentes; L04 segue parcial e L05 não iniciado.

## CRM-02
contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem legítima, sem coleta indiscriminada.
- Estado: **pronto_local** (superfície dedicada entregue nesta continuação; aceite humano pendente)
- Tela / API / dados / autorização: `/admin/crm` agora inclui `ContactManager.tsx`, com seleção de empresa, criação e edição controladas de contato, função/papel de compra, preferências de canais e horário, restrições, origem controlada, contato principal e ativo/inativo. `GET /api/crm/contacts?companyId=...` exige escopo de empresa; `GET/PATCH /api/crm/contacts/:id` não permite trocar `company_id`. Sessão individual e família `comercial/admin/marcelo/ti`; anônimo 401, RH 403, origem/método inválidos negados. Criação e edição usam auditoria transacional.
- Integração e evidência (teste, resultado, commit): Gate dedicado `CRM-02: contato dedicado com escopo de empresa, edição e auditoria transacional`, em PostgreSQL descartável + HTTP real + Chromium real sem `--disable-web-security`, **13/13 no total em duas execuções finais consecutivas**. O cenário dedicado prova 401/403/405, empresa obrigatória/inexistente, preferências/origem inválidas, leitura por empresa, campos completos, edição de estado e função, empresa imutável, auditoria e rollback por falha injetada na criação e edição. Migração aditiva 114 reautoriza somente `crm_contact_update`, preservando o CHECK anterior e exigindo `auth_access_audit_action_check` e `actor_kind='comercial'`.
- Pendência / fronteira externa / aceite humano: nenhum envio externo, SMTP, unidade ou sincronização externa entra nesta fatia. A coluna legada `crm_contacts.company_id` permanece nullable para preservar migrações/histórico, mas toda nova criação e edição da superfície exige empresa válida. Aceite humano/Windows continuam pendentes; L04 segue parcial e L05 não iniciado.

## CRM-03
importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação.
- Estado: pronto_local (gate L04 15/15 em duas execuções consecutivas, PostgreSQL descartável e Chromium real)
- Tela / API / dados / autorização: `/admin/crm` com `ImportDedupReview.tsx`; `GET /api/crm/imports/:id/duplicates` e `PATCH /api/crm/imports/:id/rows/:n` (família comercial, RH 403); commit fail-closed em `POST /api/crm/imports/:id/commit`; migração 116 (`decision`, `decision_note`, `decided_by`, `decided_by_id`, `decided_at` + ação `crm_import_row_decision`).
- Integração e evidência (teste, resultado, commit): cenário 15 do gate L04 (decisão explícita persistida e auditada, 409 `pending_dedup_review`, 400 `actions_not_accepted`, rollback 503 por auditoria injetada, curinga ILIKE escapado, jornada UI em Chromium real). Local: static 5/5, migrations 116/116 (510 tabelas, clone/checksum negativo), gate L04 15/15 x2, unit 196/196, typecheck e build aprovados.
- Pendência / fronteira externa / aceite humano: sem aceite humano do proprietário. Mesclagem/atualização do registro existente, deduplicação de contatos e revisão de lotes antigos pela tela seguem fora, por decisão.

## CRM-04
converter lead do site em contato/oportunidade preservando histórico; tratar duplicidade e contato sem empresa.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/crm/leads/:id/convert`; UI em `/admin/leads` (`convertLead()`, novo nesta sessão) e em `/admin/crm` (`convertLead()` pré-existente).
- Integração e evidência (teste, resultado, commit): Gate L04: conversão de lead real por HTTP autenticado (staff `comercial`) e reconversão idempotente do mesmo lead (não duplica empresa/oportunidade).
- Pendência / fronteira externa / aceite humano: Tratamento de duplicidade é feito pela chave de empresa informada manualmente no prompt; não há resolução automática de contato sem empresa.

## CRM-05
oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/crm` — formulário "Nova oportunidade (CRM-05)" com todos os campos (empresa, título, serviço, necessidade, unidade da mesma empresa, prioridade, previsão, valor, próxima ação/data, origem), kanban/tabela exibindo serviço, responsável, unidade, previsão, origem e motivo de perda, e painel `OpportunitySummary.tsx` de manutenção. API `POST /api/crm/opportunities` valida todos os campos (unidade precisa pertencer à mesma empresa; criação de unidade segue sendo escopo de CRM-01, sem rota própria) e `PATCH /api/crm/opportunities/:id` mantém serviço, necessidade, unidade, previsão, valor, próxima ação/data e prioridade (chave omitida não altera; `null`/string vazia limpa). Atribuição é imutável: `origin`/`campaign`/`responsible_id`/`responsible_name` nunca são editáveis (400 `field_not_editable`) e `public_lead_id` nunca vem do corpo (400 `server_managed_fields`). O responsável é gravado de verdade nos dois caminhos de criação (POST direto e conversão de lead), com nome de `auth_identities.display_name`. A listagem é pessoal (só o próprio funil), exige papel da família comercial e aplica busca/prioridade no servidor com curinga escapado (`100%` é literal). Detalhe de empresa também filtra oportunidades pela mesma borda. Mutação audita na mesma transação (falha injetada reverte).
- Integração e evidência (teste, resultado, commit): Sessão `arena/01a0eef9` (fatia notas/kanban): `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas** — o oitavo cenário cria oportunidade com TODOS os campos por HTTP e confere persistência campo a campo, exercita controles negativos de cada campo (prioridade inválida, unidade de outra empresa, valor negativo, previsão inválida, vínculo de lead forjado, empresa inexistente), imutabilidade de atribuição, manutenção por PATCH incluindo limpeza de unidade, busca literal `100%` sem casar `1000`, borda pessoal (outro comercial 404 na listagem/detalhe/PATCH, RH 403, sem sessão 401, origem ausente 403 em mutação) e a jornada de UI real preenchendo o formulário completo e conferindo cartão e tabela. Ver `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e `docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md`.
- Pendência / fronteira externa / aceite humano: Criação/edição de unidade segue sem rota própria (escopo CRM-01; o gate usa fixture SQL declarada). `service_id` do catálogo é validado quando informado, mas a UI usa `service_name` livre. Aceite humano/Windows não executado; sem SMTP/hospedagem externa.

## CRM-06
funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para perda; reabertura auditada. Não tratar “ganho” como dinheiro recebido.
- Estado: pronto_local
- Tela / API / dados / autorização: `PATCH /api/crm/opportunities/:id` com histórico de estágio (`crm_opportunity_stages`) por transição; painel `OpportunitySummary.tsx` movimenta o funil exigindo motivo de perda e motivo de reabertura na própria interface. Regras: perda exige motivo (400 `loss_reason_required`) e o banco também recusa `stage='perdido'` sem motivo (CHECK `NOT VALID`, vale para escrita nova); motivo só existe enquanto perdido (reabertura limpa o `loss_reason` corrente — o motivo antigo permanece no histórico); sair de `perdido`/`ganho` para estágio aberto é reabertura com motivo obrigatório (400 `reopen_reason_required`) auditada com ação dedicada `crm_opportunity_reopen`; trocar direto entre `ganho` e `perdido` é recusado (400 `invalid_terminal_transition`); `is_won`/`is_lost` não podem divergir do estágio (CHECK no banco); `ganho` é estado de funil — a UI mostra explicitamente "ganho é estado de funil — não é dinheiro recebido" e o gate confere que nenhuma linha de contrato nasce do estágio.
- Integração e evidência (teste, resultado, commit): Sessão `arena/01a0eef9`: `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas** — o oitavo cenário percorre o funil completo (novo→qualificação→vistoria→proposta_elaboração→proposta_enviada→negociacao→ganho), prova perda sem motivo recusada, troca direta de terminal recusada nos dois sentidos, reabertura sem motivo recusada, reabertura com motivo limpando o `loss_reason`, histórico de estágios completo com motivos, trilha de auditoria com as ações na ordem (incluindo `crm_opportunity_reopen`), rollback por falha de auditoria injetada na reabertura e os CHECKs do banco como controle negativo por SQL. UI real movimenta estágios com os motivos exigidos. Ver `docs/EVIDENCIAS-ENTREGA-LOCAL.md`.
- Pendência / fronteira externa / aceite humano: Sem drag-and-drop no kanban (movimentação por painel de detalhe, deliberado). Aceite humano/Windows não executado.

## CRM-07
kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/crm` → “Abrir tarefas”; `OpportunityTasks.tsx` (tarefas pessoais com paginação real 1–100/`offset`/total, filtros de situação/busca/vencidas no servidor, edição de prazo com `expected_version` e delegação explícita), `MyDelegatedTasks.tsx` (visão pessoal “Tarefas delegadas a mim”, aceite/recusa e execução) e `OpportunityInteractions.tsx` (histórico completo). Oportunidades agora têm busca por título, filtro de prioridade e alternância kanban/tabela. Delegação: só o responsável pela oportunidade delega, tarefa a tarefa, para outro staff ativo com papel `comercial`, por e-mail exato e erro genérico (sem oráculo de diretório); nasce `pendente`, exige aceite (que transfere `responsible_id`), pode ser revogada enquanto pendente e recusada devolve o controle ao dono; tarefas de cadência (CRM-09) não são delegáveis; o delegado só vê título/prazo/prioridade/estado, empresa, título da oportunidade e quem delegou — nenhum outro acesso à oportunidade. As interações têm GET paginado (1–100, `limit`/`offset`/total), POST dos sete tipos, PATCH com `expected_version`, DELETE lógico e upload/download de anexo privado. A propriedade continua individual e sem bypass administrativo; ações e auditoria transacionam juntas (novas ações `crm_task_update`, `crm_task_delegate`, `crm_task_delegation_revoke`, `crm_task_delegation_accept`, `crm_task_delegation_decline`, `crm_task_delegated_status`). Migrações 104 (tarefas), 105/106 (interações) e 109 (versão otimista por gatilho, campos de delegação com CHECK de coerência, índice parcial). O detalhe legado mantém a borda e não deixa a tarefa delegada “sumir” do dono. Fatia `arena/01a0eef9`: o detalhe legado agora é 404 para qualquer identidade fora da propriedade e também devolve `notes`; oportunidades ganharam formulário de criação com todos os campos de CRM-05, painel de manutenção `OpportunitySummary.tsx` com movimentação de funil (motivo de perda e de reabertura exigidos), tabela/kanban com todos os campos, busca/prioridade no servidor e borda pessoal; migração 111 (notas, CHECKs de funil, ações de auditoria).
- Integração e evidência (teste, resultado, commit): tarefas — código 7bab313, PR #13; interações — código `c69685f` (histórico). Prazo/paginação/delegação — sessão `arena/01a0eeb7`: `node scripts/qa-wave0-static.mjs` 5/5; `npm run test:migrations:pg` 109/109 com replay, clone e checksum negativo (509 tabelas); `npm run test:l04-delivery:pg` **6/6, duas vezes consecutivas** — o sexto cenário é HTTP + Chromium + PostgreSQL descartável: 34 tarefas reais com paginação sem sobreposição/perda, controles negativos de `limit`/`offset`/`status`/`q`/`overdue`, busca com curinga escapado (`100%` literal), uma operação por PATCH (transição OU prazo), edição de prazo com conflito de versão real e recusa em tarefa encerrada, delegação negada sem sessão/RH/origem/e-mail inválido/não dono, erro genérico idêntico para RH/inexistente/autodelegação, tarefa de cadência não delegável (fixture SQL), pendente congela o dono, recusa devolve, revogação limpa, aceite transfere `responsible_id` (conferido no banco), delegado sem acesso à oportunidade (404/lista vazia), transições exclusivas do delegado, trilha de auditoria completa por ator e rollback por falha de auditoria injetada no aceite; na UI real, o dono busca/edita prazo/delega, o delegado (segundo navegador/sessão) aceita e conclui, e o dono revê o estado `aceita` após recarregar, sem erro de console/5xx nem rolagem horizontal. `npm test` 186/186; `npm run typecheck` 0 erros; `npm run build` com `/admin/crm`. Ver `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e `docs/PROMPT-CONTINUACAO-CRM-TAREFAS-DELEGACAO.md`. Notas internas + campo a campo — sessão `arena/01a0eef9`: `qa-wave0-static` 5/5; `test:migrations:pg` 111/111 (replay, clone, checksum negativo, 510 tabelas); `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas** — o oitavo cenário cobre tudo o que está descrito acima (campo a campo, imutabilidade de atribuição, funil com reabertura auditada, CHECKs do banco por controle negativo, CRUD de notas com versão/autor/exclusão lógica/rollback de auditoria e jornada de UI completa); `npm test` 186/186; `typecheck` 0 erros; `build` com `/admin/crm`. Ver `docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md`.
- Pendência / fronteira externa / aceite humana: Requisito integral atendido nesta última fatia (sessão `arena/01a0eef9`): kanban e tabela com todos os campos de CRM-05/06, filtros (tipo/estágio/prioridade) e busca aplicados no servidor com curinga escapado, tarefas vencidas, histórico de interações com anexos e **notas internas dedicadas** (`OpportunityNotes.tsx`, `crm_opportunity_notes`, rotas em `src/server/crm-note-api.mjs`) — corpo 1–4000 com trim validado na API e no banco, versão otimista por gatilho, exclusão lógica, só quem escreveu edita/exclui, auditoria transacional (`crm_note_create`/`crm_note_update`/`crm_note_delete`) e paginação real 1–100; nota nunca aparece em superfície pública, do cliente ou de empresa. A borda pessoal passou a cobrir a oportunidade em si (listagem, detalhe legado e PATCH eram abertos a qualquer sessão de staff — defeito corrigido; RH 403, outro comercial 404, participante de visita usa a própria agenda). Revogação de delegação após aceite continua fora por decisão. Aceite humano/Windows não executado; sem SMTP/hospedagem externa.

## CRM-08
agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento. Links/calendário externo somente por integração configurada.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `MyAgenda` em `/admin/crm`: lista e semana reutilizam `OpportunityVisits` para ações; lembretes internos nas próximas 24h ao abrir/atualizar. API existente mantém responsável/participante, conflito de horário e versão otimista.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 4, 7 e 9: participantes, reagendamento, conflitos, vínculo com lead, navegação semanal e confirmação de visita pelo calendário, com lembrete real de visita em duas horas. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: SMTP, push e calendário externo não configurados. Lembretes desta entrega são internos à agenda; não funcionam como notificação em segundo plano. Aceite humano/Windows é L10.

## CRM-09
cadências de prospecção inicialmente como tarefas; automação de mensagens depende de autorização, opt-out quando aplicável e provedor.
- Estado: pronto_local (recorte manual; automação externa pendente)
- Tela / API / dados / autorização: `/admin/crm` → `CadenceClient.tsx`; modelos privados e passos em `crm_cadence_templates`/`crm_cadence_steps`; aplicações em `crm_cadence_enrollments`; tarefas derivadas em `crm_tasks` com `cadence_enrollment_id`, `cadence_step_id` e `suggested_channel`. Rotas `GET/POST /api/crm/cadences/templates`, `PATCH /api/crm/cadences/templates/:id`, `GET/POST /api/crm/opportunities/:id/cadences` e `PATCH /api/crm/opportunities/:id/cadence-contact`. Somente o papel `comercial` ativo cria/edita/arquiva/aplica seus modelos; proprietário da oportunidade é obrigatório; nenhum bypass administrativo.
- Integração e evidência (teste, resultado, commit): Migração `108-crm-manual-cadences.sql`; `npm run test:migrations:pg` 108/108, replay, clone/checksum negativo, 509 tabelas; `npm run test:l04-delivery:pg` 5/5 com Chromium + HTTP + PostgreSQL descartável. O cenário CRM-09 cria/edita modelo pela UI, recarrega, aplica tarefas, prova outro comercial/RH/sessão/origem/método/campos inválidos, oportunidade alheia, deduplicação, conflito de versão, opt-out, ganho, contato inativo e rollback de auditoria.
- Pendência / fronteira externa / aceite humano: Canal é apenas sugestão; não há envio automático, worker, SMTP ou provedor. Opt-out cancela pendências abertas/em andamento; ganho/perda e contato inativo fazem o mesmo, preservando concluídas. Reativação não ressuscita tarefas; novo contato/modelo exige novo fluxo. Aceite humano/Windows pendente.

## CRM-10
carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem próxima ação e relacionamentos por grupo/unidade.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/carteira` e `/api/crm/portfolio`: carteira pessoal, grupo/unidade, falta/vencimento de próxima ação e ações de renovação/upsell/cross-sell/recuperação/indicação. Reutiliza oportunidades, renovações e indicações; vínculo/idempotência em `crm_portfolio_actions`.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 19: usuário A/B, criação vinculada, retry sem duplicidade, recuperação de perdida, auditoria transacional com rollback e UI móvel. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Carteira pessoal conforme política anterior; ganho não representa recebimento. Implantação e efeitos contratuais pertencem a L05.

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
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: Relatórios em `/admin/comercial`; consultas usam fontes limitadas à identidade antes da agregação. Conversão, ciclo, perdas, atrasos, pipeline e previsão ponderada.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 19: total de oportunidades conferido, usuário alheio com zero, estimativa de 1000 ponderada em 100 no estágio novo e marcação explícita de estimativa. Cenário 1 mantém acesso às telas anteriores. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Probabilidades são estimativas; cenários de preço são alternativas vinculadas, sem soma como receita. Não equivale a faturado/recebido ou previsão garantida.

## CRM-25
metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento automático.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/comercial`: metas/regras/comissões da gestão, leitura comercial limitada, `crm_commercial_versions` imutável e snapshot da regra utilizada. Alterar regra retira aprovação; cálculo anterior preservado.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 20: meta versionada, regra recebida de 5%, base informada de 1000 → comissão de 50, aprovação, bloqueio de pagamento antecipado/conflitante, cancelamento com motivo e preservação do cálculo após mudar regra. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Sem pagamento automático. Base informada é manual e deve ser conferida pela gestão; integração com recebíveis/faturamento é L07. Registros antigos sem regra comprovada mantêm snapshot nulo.

## CRM-26
biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: Biblioteca/campanhas/comparação em `/admin/comercial`, gestão restrita; edição de material revoga aprovação, campanha exige biblioteca aprovada e é pausada se o material perde aprovação.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 20: material rascunho bloqueia campanha, aprovação permite cadastro, edição volta a rascunho e pausa campanha ativa; reativação com material não aprovado é negada. Versões preservadas. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Nenhum disparo de campanha externo. URLs de materiais restringidas a HTTPS/caminho interno. Conteúdo e autorização real dos materiais dependem do responsável.

## CRM-27
parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: Parcerias/indicações/renovações em `/admin/comercial` e ações em `/admin/carteira`; leitura comercial própria e gestão administrativa explícita; filtro de datas das métricas corrigido.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 19–20: renovação/upsell/cross-sell/recuperação/indicação com vínculo; métricas da carteira derivadas do funil; renovação de 100 para 125 com uplift 25%; filtro por período/responsável retorna contagem correta. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Sem comissão automática de parceiros, contatos externos ou sincronização contratual completa; efeitos de L05/L07 permanecem nesses lotes.

## CON-01
contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/admin/contratos` e detalhe; `contract-l05-api.mjs`; `crm_contracts`, unidades/itens/responsáveis e vínculos L02/portal da 118. Só `admin`/`marcelo` escrevem; comercial só lê a própria carteira.
- Integração e evidência (teste, resultado, commit): Gate L05: cadastro manual sem proposta fictícia, retry, unidade da empresa, responsável, item e documento privado; HTTP+PG+Chromium aprovado.
- Pendência / fronteira externa / aceite humano: documento deve já existir no provider privado L02; nenhuma conta/contrato de portal é criado automaticamente; aceite humano pendente.

## CON-02
itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: detalhe contratual usa recursos `items`, `posts`, `sla`, `obligations`, `exclusions` e `schedule`, todos com whitelist, escopo de empresa/unidade e leitura persistida.
- Integração e evidência (teste, resultado, commit): Gate L05 persiste item recorrente, posto e SLA; valida referência de unidade fora da empresa.
- Pendência / fronteira externa / aceite humano: dimensionamento operacional posterior não é inferido pelo cadastro de posto.

## CON-03
estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura com ativação operacional.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/status` registra histórico, data de efeito e evento de assinatura separado; ativação somente para gestor autorizado e com pré-requisitos.
- Integração e evidência (teste, resultado, commit): Gate L05 prova 409 para implantação incompleta, assinatura sem ativação e ativação posterior válida.
- Pendência / fronteira externa / aceite humano: assinatura externa não é executada nem alegada; a evidência informada é registro interno.

## CON-04
aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/amendments` exige chave idempotente, base, justificativa e data; aprovação grava histórico e não reescreve o total histórico.
- Integração e evidência (teste, resultado, commit): Gate L05 aprova reajuste e confirma `crm_contracts.total_price` original preservado.
- Pendência / fronteira externa / aceite humano: não há geração de cobrança ou reajuste financeiro automático.

## CON-05
alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: regras e execução em `/alert-rules`; `crm_contract_alert_runs` impede duplicação e cria tarefa, oportunidade CRM e notificação local `queued` na mesma transação.
- Integração e evidência (teste, resultado, commit): Gate L05 reprocessa a mesma data e confirma uma única execução com tarefa/oportunidade/outbox.
- Pendência / fronteira externa / aceite humano: `queued` é caixa de saída local, não envio, entrega ou leitura externa.

## CON-06
obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/document-obligations`; aprovação exige `client_document_id` privado no contrato portal explicitamente vinculado; mapa 118 preserva a prova.
- Integração e evidência (teste, resultado, commit): Gate L05 cria obrigação e só aprova com comprovante privado em escopo.
- Pendência / fronteira externa / aceite humano: não há upload de bytes novo nesta tela; reutiliza L02.

## CON-07
implantação com checklist: contrato, data de início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções, faturamento e convite do cliente.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/implantation` cria/backfill dez passos explicitamente pendentes; atualização requer base de verificação e checks reais para assinatura, início e postos.
- Integração e evidência (teste, resultado, commit): Gate L05 conclui passos sintéticos documentados e só então ativa.
- Pendência / fronteira externa / aceite humano: RH/operação/faturamento de lotes posteriores não são simulados como integração automática.

## CON-08
bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: bloqueios e exceções em `/implantation`; exceção tem motivação, aprovação e validade; bloqueio legal é não-waivable.
- Integração e evidência (teste, resultado, commit): Gate L05 prova ativação recusada antes do checklist e ativação válida apenas após condições.
- Pendência / fronteira externa / aceite humano: avaliação jurídica permanece humana; a API apenas impede a exceção legal.

## CON-09
encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/closure` exige passos concluídos; preserva registros e revoga somente contrato portal associado, mantendo grants de outros contratos ativos.
- Integração e evidência (teste, resultado, commit): Gate L05 fecha o checklist, verifica contrato CRM/portal encerrado e allowlist do outro contrato preservada.
- Pendência / fronteira externa / aceite humano: não baixa cobrança nem apaga pendência; comunicação externa não é enviada.

## CON-10
dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/fiscal` persiste dossiê e medição; evidência aceita exclusivamente documento privado L02 no escopo do contrato.
- Integração e evidência (teste, resultado, commit): Gate L05 cria dossiê e medição por HTTP com papel autorizado.
- Pendência / fronteira externa / aceite humano: não emite documento fiscal e não aceita URL como evidência.

## CON-11
diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/management-diary` é restrito a `admin`/`marcelo`, pesquisa no escopo do contrato e rejeita padrões de senha/token/CPF/prontuário.
- Integração e evidência (teste, resultado, commit): Gate L05 grava decisão e confirma 403 para comercial.
- Pendência / fronteira externa / aceite humano: filtro de termos é defesa adicional, não substitui política humana de classificação.

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
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Postos e Alocações` em `/admin/operacao` exibe a cadeia completa com nomes canônicos por join de leitura (sem entidade paralela): cliente (`crm_companies`), unidade atendida (`crm_company_units`), contrato (`crm_contracts`), posto, necessidade por turno e alocação com posto e profissional. As seções `Cargos e funções (OPS-01)` e `Necessidade por turno (OPS-01)` carregam em grupo próprio, com estados de carregamento, vazio e erro desacoplados dos 9 fetches originais da tela. `GET /api/ops/posts`, `GET /api/ops/allocations` e `GET /api/ops/post-shift-needs` devolvem os nomes da cadeia. `POST /api/ops/post-shift-needs` valida posto existente e ativo, contrato operacional, turno existente e ativo, cargo existente, headcount inteiro 1..100 e dia 0..6, com troca de ID devolvendo 404/409 nomeados (nunca colisão de FK); headcount `0` deixou de ser convertido silenciosamente em `1` (coalescência nullish); idempotência NULL-safe por `IS NOT DISTINCT FROM` (a unicidade DISTINCT do banco não cobria dia/cargo ausentes); necessidade e auditoria gravadas na mesma transação (fail-closed). Os aliases históricos `/api/hr/ops-*`, `/api/admin/hr/ops-*` e `/api/crm/hr/ops-*` saíram da borda de RH legada: o handler de operação autoriza a si mesmo (sessão de staff + papel + same-origin), idêntico ao caminho canônico `/api/ops/*`; antes admin/ti recebiam 403 `employee_permission_required` no alias legado e 200 no canônico do mesmo recurso, e os clientes embutidos da tela de operação renderizavam vazio. Paths de RH que não são de operação continuam na borda.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 9/9 (antes 8/8) com o subteste `L06 OPS-01` em HTTP real + PostgreSQL descartável + Chromium: alias legado e canônico respondem igual (anônimo 401; admin/ti/rh 200; comercial 403 `forbidden` pelo handler); `/api/hr/employees` segue exigindo permissão granular de RH (403 para admin sem concessão); necessidade negada para anônimo (401) e comercial (403); dia 7, headcount 0 e headcount 1,5 recusados (400); posto, turno e cargo inexistentes recusados com 404 nomeados; posto inativo (409 `post_inactive`) e contrato encerrado (409 `contract_not_operational`); repetição com dia/cargo ausentes rejeitada (409 `duplicate_need`) sem segunda linha; auditoria indisponível → 503 sem efeito parcial e recuperação após restauração; leitura devolve `post_name`/`shift_template_name`/`role_name` e a alocação fecha a cadeia com `post_name`/`employee_name`; Chromium real renderiza cliente, unidade, cargo, turno e profissional da cadeia na aba `Postos e Alocações`. Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5. Nenhuma migração 124 necessária.
- Pendência / fronteira externa / aceite humano: aceite humano pendente (revisão de entrega). A tela expõe o cadastro real; não propõe dimensionamento automático — posto sem necessidade por turno cadastrada aparece com lacuna, não com número inventado.

## OPS-02
dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Dimensionamento (OPS-02)` em `/admin/operacao` com contratado × planejado × realizado por faixa de tempo, horas exigidas/realizadas, cobertura % (derivada pelo banco em `coverage_percent`), alocados na faixa, habilitados e sem cargo exigido, além das lacunas de cobertura registradas — com **período e fórmula explícitos no rodapé** e estados de carregamento/vazio/erro em grupo de fetch próprio, desacoplado dos demais. `GET /api/ops/dimensioning` devolve, por registro, o cruzamento com profissional habilitado recomputado ao vivo por `LEFT JOIN LATERAL` sobre as alocações não canceladas da faixa do registro: `allocated_employees`, `qualified_employees`, `unqualified_employees`, `employees_without_requirement` e `allocated_hours` (soma das horas dos turnos da faixa). A regra de habilitação é a **mesma** do motor OPS-04 — predicado único `QUALIFICATION_USABLE_SQL` (`is_valid` e validade ≥ `GREATEST(hoje, data da alocação)` em `ops_employee_qualifications`), extraído de `evaluateOps04` e reutilizado; não existe segunda regra. Alocação sem cargo exigido é contada à parte: não vira habilitado nem inabilitado. `GET /api/ops/coverage-gaps` devolve o nome canônico do posto. Escrita de dimensionamento segue endurecida (valores finitos/inteiros/não negativos, enum de status, posto ativo, coerência de empresa/unidade/contrato, contrato operacional).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 9/9 com o subteste `L06 OPS-02` ampliado em HTTP real + PostgreSQL descartável + Chromium: na mesma faixa do registro, dois profissionais alocados (um com cargo exigido e qualificação válida, outro sem cargo exigido) e um terceiro **fora da faixa** — painel devolve `allocated_employees=2` (o de fora excluído), `qualified_employees=1`, `unqualified_employees=0`, `employees_without_requirement=1` e `allocated_hours=16`; cobertura planejada versus realizada lida do registro (372/744 = 50%); qualificação **revogada pela API depois da alocação** (upsert de qualificação) faz o painel recomputar para `qualified_employees=0` e `unqualified_employees=1` — a degradação vira lacuna visível, não número fictício; lacunas lidas com nome canônico do posto; Chromium real renderiza posto, 50%, "sem habilitação válida", fórmula explícita no rodapé e data de lacuna. Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5. Nenhuma migração 124 necessária.
- Pendência / fronteira externa / aceite humano: aceite humano pendente (revisão de entrega). Horas alocadas são soma dos turnos das alocações da faixa e não substituem as horas realizadas informadas no registro — divergência entre realizado informado e alocado é exibida, não conciliada.

## OPS-03
escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Escalas (OPS-03)` em `/admin/operacao` com versões (empresa, unidade/equipe, validade, situação, publicação), **calendário nas três visões exigidas** — por posto (profissionais escalados no posto por dia), por equipe (profissionais distintos por unidade por dia) e por pessoa (turnos do profissional por dia) —, ciência registrada pela interface e histórico de transições (rascunho → publicada → revisada com motivo e autor). Colunas do calendário são os dias da validade da própria versão (janela de 31 colunas com recorte declarado quando a validade excede); célula vazia é ausência de registro, não folga confirmada. Grupo de carregamento próprio com estados de carregamento/vazio/erro; o detalhe da versão selecionada (entradas, ciências, histórico) carrega sob demanda. `GET /api/ops/schedule-versions`, `GET /api/ops/schedule-entries` e `GET /api/ops/schedule-acks` devolvem os nomes canônicos (empresa, unidade, posto, profissional, turno) por join, sem entidade paralela. `POST /api/ops/schedule-acks` passou a exigir papel de operação (`admin`/`ti`/`rh`): antes qualquer sessão de staff registrava ciência por qualquer profissional. O caminho canônico `/api/ops/schedule-history` foi adicionado ao roteador — era o único endpoint de operação sem alias canônico (só existiam os três aliases históricos de RH).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 9/9 com o subteste `L06 OPS-03` ampliado em HTTP real + PostgreSQL descartável + Chromium: duas entradas na versão publicada (uma com ciência, uma pendente); ciência negada para anônimo (401) e papel comercial (403) — antes comercial obtinha 201; jornada completa de ciência **pela interface** em Chromium real: clique registra ciência (201, "Ciência registrada para…"), segundo clique exibe "segunda ciência não duplica efeito" (409 `duplicate_ack`), estado "ciente desde" visível e SQL confirma exatamente 2 ciências para 2 profissionais, sem duplicação da UI; calendário por posto renderiza posto e profissionais da cadeia, por equipe renderiza a unidade e por pessoa o turno canônico; histórico mostra a transição "revisada → publicada". Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5. Nenhuma migração 124 necessária.
- Pendência / fronteira externa / aceite humano: aceite humano pendente — a ciência registrada pela interface comprova ciência do profissional, não substitui validação de convenção coletiva/jurídico da escala em si. Publicação registra histórico, entradas respeitam validade e retries de entrada/ciência são rejeitados sem duplicação (já provados no gate).

## OPS-04
validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Jornada & Habilitação (OPS-04)` em `/admin/operacao`. Motor único `evaluateOps04` aplicado a `POST /api/ops/allocations` e `POST /api/ops/schedule-entries`: posto ativo, contrato operacional, funcionário `ativo`, sobreposição real de turno, indisponibilidade em `hr_absences` (bloqueia `solicitado/em_analise/aprovado/em_afastamento`; `rejeitado/cancelado/retornado` não bloqueiam), habilitação em `ops_employee_qualifications` e validade do documento conferida contra `GREATEST(CURRENT_DATE, data alvo)`. Jornada diária/semanal, descanso mínimo e dias consecutivos só são aplicados quando existe regra **aprovada e ativa** em `ops_work_rules`; havendo várias, vale a combinação mais restritiva. `PATCH /api/ops/work-rules` grava mudança e auditoria na mesma transação. Sem regra aprovada nada é presumido e a resposta declara `work_rule_applied: false`. Nenhuma migração 124 foi necessária: o schema 070 já continha as tabelas.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 8/8 (antes 7/7) com o subteste `L06 OPS-04` em HTTP real + PostgreSQL descartável + Chromium: anônimo (401) e papel comercial (403) em regra e qualificação; regra não aprovada não inventa limite (9h/dia aceitos, `work_rule_applied:false`); aprovação auditada (`ops_work_rule_update`); `max_daily_hours_exceeded` (422, 9h > 8h); `min_rest_hours_violated` (422, 10h < 11h) e 18h de descanso aceitos; `max_weekly_hours_exceeded` (422, 21h > 16h); `max_consecutive_days_exceeded` (422, 3 > 2); `qualification_required`, `qualification_expired`, `qualification_invalid` (422) e alocação aprovada após habilitação válida; `role_required_by_work_rule` (422) quando a regra aprovada exige certificação, liberado ao desativar a regra; `employee_unavailable` (409) com afastamento aprovado e ausência `rejeitado` não bloqueando; na escala, funcionário desligado (409), posto inexistente (404), `overlap_detected` (409), retry (409) e validação positiva persistida com `entry_id`; auditoria indisponível devolve 503 sem efeito parcial em alocação, entrada de escala e alteração de regra. Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5.
- Pendência / fronteira externa / aceite humano: aceite humano pendente. A qualificação guarda `document_url` em texto; vincular o comprovante ao provedor privado L02 (`client_documents`) exige coluna nova e, portanto, migração aditiva — deliberadamente fora desta fatia. Conformidade legal/convenção coletiva dos limites configurados continua dependendo de validação de RH/jurídico: o sistema aplica a regra aprovada, não julga se ela é legal.

## OPS-05
ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ops/coverage-requests`, `POST/GET/PATCH /api/ops/substitution-candidates`, `POST/GET /api/ops/coverage-communications`. Tabelas `ops_coverage_requests`, `ops_substitution_candidates`, `ops_coverage_communications`. Validação fail-closed de contrato operacional, funcionário ativo, qualificação para o cargo (`ops_employee_qualifications`), disponibilidade e sobreposição de turno (`checkCandidateConflict`). Decisão humana com registro de auditoria atômico.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 2.1-2.11): nega anônimo (401), papel indevido (403), posto inexistente (404), contrato encerrado (409), candidato sem qualificação (409 `candidate_unqualified`), candidato com sobreposição de turno (409 `candidate_shift_conflict`), candidato desligado (409 `employee_not_operational`), decisão humana registra e atualiza status para `candidato_encontrado`.
- Pendência / fronteira externa / aceite humano: Comunicações e notificações são internas/sintéticas no sistema (sem envio externo SMS/WhatsApp real). Aceite humano pendente.

## OPS-06
passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ops/handovers`, `GET /api/ops/handover-escalations`. Tabelas `ops_handovers`, `ops_handover_escalations`. Validação fail-closed de posto ativo, contrato operacional, funcionários de origem e destino distintos e ativos, protocolo único (`HND-OPS-...`), pendências, itens de guarda, ciência idempotente e escalonamento obrigatório de motivo.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 3.1-3.5): nega anônimo (401), posto inexistente (404), mesmo funcionário na origem/destino (400), contrato encerrado (409), aceite idempotente sem duplicar efeito, escalonamento sem motivo bloqueado (400) e com motivo registrado em trilha imutável.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## OPS-07
livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ops/occurrence-book`, `GET /api/ops/occurrence-history`, `POST/GET /api/ops/occurrence-evidences`, `POST/GET /api/ops/occurrence-actions`. Tabelas `ops_occurrence_book`, `ops_occurrence_history`, `ops_occurrence_evidences`, `ops_occurrence_actions`. Protocolo único (`OCC-OPS-...`), retificação com motivo obrigatório e preservação imutável da versão anterior, vínculo de evidências com validação de escopo multi-tenant do L02 (`client_documents`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 4.1-4.8): nega anônimo (401), contrato encerrado (409), retificação sem motivo (400), documento privado de outro cliente/contrato rejeitado (403), documento no mesmo escopo aceito (201), histórico preserva versão original e retificada com flag e auditoria fail-closed.
- Pendência / fronteira externa / aceite humano: Nenhum acionamento policial/SAMU/bombeiros externo ou 24h real simulado. Aceite humano pendente.

## OPS-08
checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ops/checklist-templates`, `POST/GET/PATCH /api/ops/checklist-runs`, `POST/GET /api/ops/checklist-answers`. Tabelas `ops_checklist_templates`, `ops_checklist_runs`, `ops_checklist_answers`. Execução vinculada a posto e contrato operacional, validação de preenchimento obrigatório de todos os itens com `is_required=true` antes da finalização, registro de não-conformidade e evidências no escopo L02, finalização e retry de envio idempotentes.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 5.1-5.6): nega anônimo (401), contrato encerrado (409), finalização com item obrigatório não preenchido rejeitada (422 `missing_required_items`), resposta de item duplicada impedida com upsert idempotente, finalização aprovada após preenchimento integral e retry idempotente sem efeito colateral.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## OPS-09
visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação.
- Estado: pronto_local
- Tela / API / dados / autorização: abas `Supervisão` em `/admin/operacao`; `/api/ops/supervision-visits`, `/supervision-inspections` e `/supervision-action-plans`; posto e contrato ativos, supervisor ativo, score 0–100, apontamentos e verificação nominal. Migração aditiva 123 e auditoria transacional fail-closed.
- Integração e evidência (teste, resultado, commit): Subtest 5 do gate L06 cobre criação, score inválido e verificação obrigatória; `npm run test:l06-delivery:pg` verde, 5/5.
- Pendência / fronteira externa / aceite humano: aceite humano da operação permanece pendente.

## OPS-10
rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/QR isolado não prova execução.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Rondas & Claviculário`; `/api/ops/patrols`, `/patrol-points` e `/patrol-readings`; detecta `duplicate_qr`, `too_fast`, `gps_jump`, exige motivo de localização indisponível e oferece chave idempotente de leitura.
- Integração e evidência (teste, resultado, commit): Subtest 5 valida localização indisponível, replay e retry idempotente.
- Pendência / fronteira externa / aceite humano: fluxo obrigatoriamente rotulado sintético; QR/GPS não é prova de presença real.

## OPS-11
chaves, rádios, materiais e equipamentos com guarda/transferência/devolução.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Rondas & Claviculário`; `/api/ops/keys` e `/key-movements`; tipos fechados, responsável/finalidade e índice único de custódia ativa.
- Integração e evidência (teste, resultado, commit): Subtest 5 confirma retirada, segunda retirada 409 e devolução preservando a cadeia.
- Pendência / fronteira externa / aceite humano: conferência física e aceite humano pendentes.

## OPS-12
relatórios periódicos ao cliente com revisão de conteúdo e privacidade.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Relatórios`; `/api/ops/client-reports`; transições estritas `rascunho → em_revisao → aprovado → enviado`, escopo contrato/unidade/documento e revisão de privacidade.
- Integração e evidência (teste, resultado, commit): Subtest 5 bloqueia envio antecipado e valida aprovação formal antes da liberação.
- Pendência / fronteira externa / aceite humano: envio externo real não é alegado; aceite humano pendente.

## OPS-13
métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Métricas & Escalas`; `/api/ops/metrics-definitions` e `/metrics-snapshots`; fonte, janela, fórmula, valor e completude (`completo`, `parcial`, `incompleto`) explícitos.
- Integração e evidência (teste, resultado, commit): Subtest 5 rejeita valor ausente/zero implícito e incompletude sem justificativa.
- Pendência / fronteira externa / aceite humano: qualidade da fonte deve ser validada pelo responsável.

## OPS-14
escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Métricas & Escalas`; `/api/ops/assisted-schedules` e `/assisted-schedule-entries`; detecta sobreposição, interjornada e falta de qualificação, gravando conflitos explicáveis.
- Integração e evidência (teste, resultado, commit): Subtest 5 produz conflito e confirma bloqueio 409 da publicação.
- Pendência / fronteira externa / aceite humano: publicação exige conflitos resolvidos, revisão humana e motivo.

## OPS-15
supervisão de limpeza com rotinas por ambiente, consumo e não conformidades.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Limpeza`; APIs de ambientes, rotinas, execuções e não conformidades; executor ativo, inspeção/score e severidade registrados.
- Integração e evidência (teste, resultado, commit): Subtest 5 cobre banheiro, rotina diária, executor, inspeção de qualidade e NC alta.
- Pendência / fronteira externa / aceite humano: inspeção física real permanece responsabilidade humana.

## OPS-16
eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto específico.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Monitoramento Sintético`; `/api/ops/monitoring-connectors` e `/monitoring-events`; restrições SQL `is_synthetic=true`, eventos fechados e fluxo pendente/reconhecido/em tratamento/resolvido.
- Integração e evidência (teste, resultado, commit): Subtest 5 rejeita evento não sintético e valida reconhecimento, tratamento, encerramento e Chromium real.
- Pendência / fronteira externa / aceite humano: sem central 24h, vídeo ou promessa de despacho externo real.

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
- Estado: pronto_local
- Tela / API / dados / autorização: workspace `/admin/financeiro`, `/api/fin/receivables`, PostgreSQL real e papéis financeiros; `rh` negado 403.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` 6/6 em duas rodadas finais, HTTP e Chromium reais; `handleReceivables` transacional e fail-closed comprovado; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Pendência / fronteira externa / aceite humano: dados apenas sintéticos; nenhuma integração de produção.

## FIN-02
contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos.
- Estado: pronto_local
- Tela / API / dados / autorização: workspace financeiro e APIs canônicas de pagáveis, fornecedores e centros; PostgreSQL real; `financeiro`/`admin`/`ti`.
- Integração e evidência (teste, resultado, commit): gate L07 6/6 em duas rodadas preserva criação e aprovação auditada de pagável, fornecedor e centro; `handlePayables` POST/PATCH transacional e criação fail-closed 503 sem pagável/histórico parcial; unitários 196/196; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Pendência / fronteira externa / aceite humano: anexos e pagamentos externos permanecem sintéticos; FIN-05..16 não iniciados.

## FIN-03
geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas.
- Estado: pronto_local
- Tela / API / dados / autorização: aba Recorrência exige conta real selecionada/informada, APIs canônicas, transação única de geração/histórico/regra/auditoria.
- Integração e evidência (teste, resultado, commit): Chromium cria/aprova/gera, repete e vê 409; banco confirma uma linha; geração com auditoria indisponível devolve 503 sem recebível/histórico e sem alterar `last_generated_competence`; L07 6/6 em duas rodadas; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Pendência / fronteira externa / aceite humano: não há cobrança externa; conta é sintética e explícita.

## FIN-04
pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa.
- Estado: pronto_local
- Tela / API / dados / autorização: aba Pagamentos, transação, `FOR UPDATE`, overpayment 409, estorno limitado/escopado/repetido 409 e auditoria fail-closed.
- Integração e evidência (teste, resultado, commit): HTTP concorrente real, auditoria indisponível 503 sem efeito e Chromium com baixa/estorno; L07 6/6 duas vezes; `handlePayments` e todos os demais handlers FIN-01..04 auditados como transacionais; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Pendência / fronteira externa / aceite humano: sem gateway ou banco real; FIN-05..16 não iniciados.

## FIN-05
conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Conciliação bancária** (`BankReconciliationWorkspace.tsx`) usa somente `/api/fin/bank-statements`, `/api/fin/bank-transactions` e `/api/fin/conciliations`. Acesso exige sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin. Extrato e transações são explicitamente sintéticos; `storage_key` e `bank_ref` são únicos; a conciliação exige exatamente uma conta e uma transação bancária, registra sugestão, confirmação/divergência e marca a transação como conciliada somente na confirmação. A migração aditiva `124-fin05-conciliation-hardening.sql` acrescenta unicidade parcial da transação bancária por conciliação e CHECK de valor não negativo.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **8/8** (HTTP real + PostgreSQL descartável + Chromium real, incluindo a jornada FIN-05); duas execuções finais consecutivas verdes. Cobertura: anônimo/RH/origem externa negados, importação, duplicidade de `storage_key`/`bank_ref`/conciliação, referências inválidas, confirmação repetida, auditoria indisponível com `503` e rollback, e UI real. `npm run typecheck` e `npm run build` verdes.
- Pendência / fronteira externa / aceite humano: não há banco, provedor, gateway, webhook, arquivo ou credencial de produção; não há cobrança automática. Aceite humano/Windows permanece pendente. FIN-06..16 e ADM-01..12 continuam fora desta sessão.

## FIN-06
cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Cobrança** (`CollectionWorkspace.tsx`) usa somente `/api/fin/collection-policies`, `/api/fin/collection-reminders` e `/api/fin/collection-history`. Acesso exige sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin. Política de cobrança tem nome único, descrição, tipo de lembrete, dias antes, nível de escalonamento e separação entre criação (rascunho não aprovado) e aprovação auditada. Lembrete exige política aprovada/ativa, recebível existente, responsável (2–200), conteúdo (20–2000) e nunca aceita `is_real_message=true` (rejeitado com `400`). Histórico é imutável por trigger de banco e `is_blocking_action` é sempre `false` por `CHECK`. A migração aditiva `125-fin06-collection-hardening.sql` acrescenta `reminder_type`/`days_before`/`escalation_level` estruturados à política e `is_blocking_action` ao histórico.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **10/10** (HTTP real + PostgreSQL descartável + Chromium real, incluindo a jornada FIN-06) em duas execuções finais consecutivas. Cobertura: anônimo/papel indevido/origem externa negados, duplicidade de nome, aprovação sem autorização rejeitada, aprovação válida e auditada, referências inválidas, lembrete com responsável, conteúdo inválido rejeitado, `is_real_message=true` rejeitado, envio apenas simulado, histórico imutável sem bloqueio automático, e auditoria indisponível com `503`/rollback. `npm run typecheck`, `node scripts/qa-wave0-static.mjs` (5/5), `npm test` (196/196), `npm run test:migrations:pg` (125/125) e `npm run build` verdes; `npm run test:l06-delivery:pg` 9/9 preservado. Detalhe completo em [`docs/ENTREGA-L07-FIN06.md`](./ENTREGA-L07-FIN06.md).
- Pendência / fronteira externa / aceite humano: não há e-mail, WhatsApp, SMS, gateway, webhook, arquivo ou credencial de produção; "envio" é sempre uma transição de estado local simulada. Aceite humano/Windows permanece pendente. FIN-07..16 e ADM-01..12 continuam fora do escopo FIN-06; FIN-07 é documentado na seção seguinte.

## FIN-07
fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Fluxo de caixa / Aging** (`CashflowWorkspace.tsx`), usando `/api/fin/cashflow-snapshots` e `/api/fin/aging-receivables`. Acesso exige sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin. A migration aditiva `126-fin07-cashflow-aging-hardening.sql` preserva o rascunho 078, permite aging por `(receivable_id, competence_date)`, deriva valor restante no banco e valida o vínculo/bucket canônicos. Criações são sintéticas, transacionais e auditadas fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **12/12** em duas execuções consecutivas (HTTP real + PostgreSQL descartável + sessão/cookie real + Next local + Chromium real). `npm test` 196/196, `npm run typecheck`, `node scripts/qa-wave0-static.mjs` 5/5 com migrations 001–126, `npm run test:l06-delivery:pg` 9/9 e `npm run build` verdes. Detalhe em [`docs/ENTREGA-L07-FIN07.md`](./ENTREGA-L07-FIN07.md).
- Pendência / fronteira externa / aceite humano: fluxo e aging não integram banco/gateway real, não baixam recebíveis, não enviam cobrança e usam somente dados sintéticos. `npm run test:migrations:pg` termina exit 0 após dois passes de 126/126, rejeita o clone com checksum adulterado como esperado e restaura o clone; aceite humano/Windows permanece pendente. FIN-08..16 e ADM-01..12 continuam fora desta sessão.

## FIN-08
custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Custos / Rateio** (`CostAllocationWorkspace.tsx`), usando `/api/fin/cost-imports` e `/api/fin/costs`. Sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin são obrigatórios. A migration aditiva `127-fin08-cost-allocation-hardening.sql` preserva o rascunho 078, adiciona valor de origem/chave idempotente, valida conta–contrato–posto pelo escopo canônico, sincroniza origem/competência da importação e protege no banco o cálculo do valor alocado pelo percentual documentado. Criações são transacionais e auditadas fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **14/14** em duas execuções consecutivas (PostgreSQL descartável, HTTP real, sessão/cookie real, Next local e Chromium real). Cobertura FIN-08: autorização/origem, fontes e filtros inválidos, importação e linha idempotentes, vínculos canônicos, divergência de importação, valor rateado adulterado na API e em SQL direto, listagem/agregados, auditoria indisponível com 503/rollback e jornada visual. Regressões: unitários 196/196, L06 9/9, migrations 001–127, typecheck, build e static 5/5 verdes. Detalhe em [`docs/ENTREGA-L07-FIN08.md`](./ENTREGA-L07-FIN08.md).
- Pendência / fronteira externa / aceite humano: apenas metadados/valores sintéticos; nenhum arquivo, folha, estoque, ERP ou provedor externo é lido. UUIDs opcionais de equipamento/supervisão ainda não possuem catálogo canônico no rascunho. Restrições novas preservam linhas históricas sem certificá-las retroativamente. Aceite humano/Windows permanece pendente. FIN-09..16 e ADM-01..12 não foram iniciados.

## FIN-09
resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompleta.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → Resultado gerencial (`ManagementResultsWorkspace.tsx`) usa a rota canônica `/api/fin/management-results`; PostgreSQL calcula/conserva a margem canônica e declara base incompleta em vez de aceitar percentual do navegador ou inventar zero. Sessão, papel financeiro/admin e same-origin são decididos no servidor; TI permanece leitura quando aplicável. A migração 135 impede margem legada quando a margem calculada é nula.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` 31/31 (PostgreSQL descartável, HTTP real e Chromium) cobre margem incompleta, cálculo no servidor, auditoria/rollback e UI de falha de leitura + retry; `npm run test:migrations:pg` 135/135 em dois passes; estático 5/5, typecheck, build e `npm test` 196/196 verdes nesta fatia.
- Pendência / fronteira externa / aceite humano: resultados são dados sintéticos locais; aceite humano e Windows pendentes. L07 não está encerrado.

## FIN-10
despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-11
integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → Fiscal (`FiscalWorkspace.tsx`) usa `/api/fin/fiscal-activity-rules`, provedores, obrigações e documentos canônicos. Regra de atividade determina a obrigação; o provedor sandbox só registra documento sintético. Sessão, papel e origem são validados no servidor; a tela revela falha de leitura e permite retry.
- Integração e evidência (teste, resultado, commit): gate L07 31/31 inclui HTTP de provedores/obrigações/documentos, negativas de autorização/origem, determinação por atividade, nenhuma emissão real, auditoria fail-closed e Chromium para a jornada fiscal/retry. Migrações 001–135 reaplicadas e verificadas no mesmo ambiente isolado.
- Pendência / fronteira externa / aceite humano: não há NFS-e/NF-e, certificado, credencial, arquivo, ERP ou transmissão para provedor real. Aceite humano e Windows pendentes.

## FIN-12
boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → Boletos / Pix / Gateway (`GatewayWorkspace.tsx`) usa APIs canônicas de gateway, cobrança, webhook/histórico e simulador sandbox. O servidor confere HMAC/payload, autorização e origem; somente gateway selecionado/homologado em sandbox recebe cobrança. A conciliação materializa a baixa FIN-04 na mesma transação (`fin_payments`, recebível e histórico); estorno cria pagamento reversor ligado à baixa original. A migração 135 assegura os vínculos pagamento–charge e baixa/estorno.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` 31/31 prova assinatura divergente recusada, replay concorrente (1 criação + 5 replays), criação de uma baixa FIN-04, saldo/status do recebível, estorno reversor e Chromium confirmando a baixa no banco; auditoria indisponível reverte a operação. `npm run test:migrations:pg` 135/135, estático 5/5, typecheck, build e unitários 196/196 verdes.
- Pendência / fronteira externa / aceite humano: gateway, assinatura e pagamentos são simuladores locais; não há Pix/boleto, PSP, banco, adquirente, cobrança ou valor real. Aceite humano e Windows pendentes.

## FIN-13

> Revalidação concluída em 2026-10-01 sobre a main `4ea3578`: os seis achados foram reproduzidos por teste real (31 subtestes do gate L07, 4 reprovados antes da correção) e corrigidos por fatia aditiva com a migração **134**, sem reescrever a 132. Melhorias de #60/#62 portadas ou descartadas com justificativa registrada na [consolidação](CONSOLIDACAO-L07-PRS-PENDENTES.md). Os PRs de referência continuam abertos.

orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado.
- Estado: pronto_local (validação automática completa; aceite humano pendente)
- Tela / API / dados / autorização: Aba “Orçamento / Cenários” em `/admin/financeiro` (`BudgetWorkspace.tsx`) com seleção por nome/protocolo, moeda em R$, erro de leitura visível e ações de revisão/aprovação/histórico. APIs `GET/POST/PATCH /api/fin/budgets`, `GET/POST /api/fin/budget-scenarios` e `GET /api/fin/budget-history` (mais aliases `/api/{admin,crm}/hr/fin-budget*`), em `src/server/fin-budget-api.mjs`. Tabelas `fin_budgets`, `fin_budget_scenarios` e `fin_budget_history` (migrações 080, 132 e a aditiva 134). Sessão obrigatória, papéis financeiro/admin, `/admin/ti` somente leitura, same-origin nas mutações; escrita + histórico + auditoria na mesma transação, com rollback e `503 audit_unavailable`.
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l07-delivery:pg` **31/31** em duas execuções aprovadas (era 27/27 antes da fatia; uma execução intermediária deu 30/31 por queda do Chromium no `launch` no subteste 18 de FIN-10, fora desta fatia — ver EVIDENCIAS-ENTREGA-LOCAL.md), com PostgreSQL descartável, HTTP real e Chromium real. Cobre: edição de orçamento aprovado recusada (409 `approved_budget_locked_requires_revision`) com trava equivalente no banco; revisão com motivo e autor que incrementa versão, retira a aprovação e exige nova aprovação; histórico imutável com snapshot anterior/posterior, versões, autor real, data e motivo; margem calculada no servidor/banco com receita zero e dados incompletos tratados sem inventar percentual nem apagar valores conhecidos; idempotência de criação com retry sequencial (200 replay), conflito de conteúdo (409) e **retry concorrente de 6 requisições gerando um único orçamento**; erro de leitura exibido na interface em vez de lista vazia; papel indevido, anônimo e TI negados; rollback quando a auditoria falha; aprovação sem gerar recebível, pagável, pagamento ou cobrança. Regressões preservadas: `npm test` 196/196, `test:migrations:pg` 134/134 com replay/clone/checksum, L03 1/1, L04 20/20, L05 1/1, L06 9/9, typecheck e build aprovados. Detalhes em [ENTREGA-L07-FIN13.md](ENTREGA-L07-FIN13.md) e [EVIDENCIAS-ENTREGA-LOCAL.md](EVIDENCIAS-ENTREGA-LOCAL.md).
- Pendência / fronteira externa / aceite humano: **Aceite humano pendente** (nenhuma aprovação de Marcelo/Andreia registrada) e validação em Windows pendente — a sessão rodou em Linux. Adiados por decisão de negócio: origem do número e data-base por cenário (#62), premissas estruturadas e aprovador distinto do autor/mínimo de dois cenários (#59). Orçamento permanece estimativo: não gera cobrança, pagamento ou obrigação.

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
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ast/suppliers`, `POST/GET/PATCH /api/ast/products`, workspace `/admin/patrimonio`. Tabelas `ast_suppliers`, `ast_products`. Validação de SKU único (409), nomes, unidades de medida, custos, preços e estoques mínimos. Transação atômica com auditoria fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 2): nega anônimo (401), papel indevido (403), fornecedor com nome duplicado negado (409), produto com SKU duplicado negado (409), criação válida com vínculo de fornecedor e auditoria atômica persistida.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-02
entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movimentos consistentes.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ast/stock-movements`. Tabelas `ast_stock_movements`, `ast_products`. Bloqueio pessimista (`FOR UPDATE`), validação de escopo de contrato operacional e trava em banco (`CHECK stock_current >= 0`) para impedir saldo negativo fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 3.1-3.3): entrada de 50 eleva saldo para 50, saída de 20 reduz saldo para 30, tentativa de saída de 40 (superior ao saldo de 30) bloqueada fail-closed com 400 (`insufficient_stock`), saldo permanece 30.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-03
reserva para proposta/implantação sem confundir reserva com saída; liberação em cancelamento.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ast/reservations`. Tabelas `ast_reservations`, `ast_stock_movements`, `ast_products`. Cálculo atômico de saldo disponível (`stock_current - reservas ativas`), índice único contra reservas ativas duplicadas, ações de liberar (recompõe disponibilidade sem afetar estoque físico) e converter (baixa efetiva em estoque via `movement_type='saida'`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 4.1-4.5): reserva de 15 reduz disponibilidade, tentativa de sobre-reserva de 20 negada (400 `insufficient_available_stock`), retry duplicado negado (409), liberação recompõe disponibilidade uma única vez (segunda liberação negada 400), conversão em saída reduz saldo físico de 30 para 20.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-04
equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manutenção e termo de guarda.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ast/serialized-assets`. Tabela `ast_serialized_assets`. Vínculo a `product_id`, número de série único (`serial_number`), garantias, contratos e postos operacionais.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 5): criação de ativo serializado com status `disponivel`, serial duplicado rejeitado com 409 (`duplicate_serial_number`), histórico e auditoria fail-closed.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-05
entrega/devolução, avaria/perda, fotos pertinentes e conferência.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ast/deliveries`. Tabelas `ast_deliveries`, `ast_serialized_assets`. Gestão de custódia e termos de guarda com conferência antes/depois, fotos e notas; bloqueia dupla entrega ativa de ativo já em uso (`em_uso`) sem prévia devolução.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 5.1-5.3): entrega para titular altera status para `em_uso`, tentativa de entrega simultânea do mesmo ativo negada (409 `asset_already_in_use`), devolução altera status de volta para `disponivel`, cadeia de custódia preservada.
- Pendência / fronteira externa / aceite humano: Fotos/anexos operam sobre armazenamento privado local/sintético. Aceite humano pendente.

## AST-06
requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ast/requisitions`, `POST/GET/PATCH /api/ast/quotations`, `POST/GET/PATCH /api/ast/purchase-orders`, `GET /api/ast/requisition-history`, `GET /api/ast/order-history`. Tabelas `ast_requisitions`, `ast_quotations`, `ast_purchase_orders`, `ast_requisition_history`, `ast_order_history`. Protocolos automáticos (`REQ-AST-...`, `PED-AST-...`), fluxo sintético interno rotulado (`is_synthetic_flow=true`), seleção exclusiva de cotação e recebimento total com entrada automática no estoque.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 6): criação de requisição, aprovação auditada, cotação selecionada, pedido sintético emitido, recebimento total gera entrada automática (+10) no estoque físico e trilhas imutáveis de histórico preservadas.
- Pendência / fronteira externa / aceite humano: Não integra compras fiscais ou pagamentos externos reais (fluxo sintético interno rotulado). Aceite humano pendente.

## AST-07
inventário físico, divergências e ajuste aprovado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/patrimonio` (aba Inventários Físicos com lista, protocolo, status e contagem). Endpoints: `POST/GET/PATCH /api/ast/inventories`, `POST/GET/PATCH /api/ast/inventory-items`, `GET /api/ast/inventory-history`. Tabelas: `ast_inventories`, `ast_inventory_items`, `ast_inventory_history`. Protocolo gerado (`INV-AST-...`), conciliação física de contagem, histórico imutável e aplicação atômica de ajuste de estoque apenas após aprovação formal (`status='aprovado'`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 2): inventário criado, contagem física divergente (esperado 30, apurado 25), aprovação atômica deduz 5 unidades do saldo em estoque com `FOR UPDATE`, re-aprovação bloqueada por idempotência, navegação confirmada em Chromium real.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-08
ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, peças e execução.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/patrimonio` (aba Ordens de Serviço (OS) com protocolo, prioridade, técnico, status e detalhes). Endpoints: `POST/GET/PATCH /api/ast/service-orders`, `GET /api/ast/service-order-history`. Tabelas: `ast_service_orders`, `ast_service_order_history`. Protocolo gerado (`OS-AST-...`), escopo de contrato operacional e cliente vinculados, checklist de diagnóstico, baixa atômica de peças (`movement_type='saida'`, `reference_type='ordem_servico'`) e obrigatoriedade de notas de execução e identificação do técnico para conclusão.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 3): abertura de OS, bloqueio de conclusão sem notas de execução (400), conclusão válida deduz 5 peças do saldo em estoque (25 -> 20), re-conclusão bloqueada sem duplicidade de consumo, rejeição atômica de OS com peças excedentes ao estoque disponível, navegação confirmada em Chromium real.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-09
evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao que for aprovado.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET/PATCH /api/ast/service-order-evidences`. Tabela: `ast_service_order_evidences`. Validação estrita de escopo L02 de documentos privados (`client_documents`), proibição de anexos de outros clientes/contratos (403), tipo de evidência antes/depois, garantia, custo e liberação controlada de visibilidade para o cliente (`is_client_visible=true`) somente após aprovação (`is_approved=true` ou status aprovado no documento L02).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 4): bloqueio de evidência de cliente divergente (403 `document_scope_violation`), cadastro de evidência válida do mesmo contrato, rejeição de visibilidade ao cliente sem aprovação (400), e aprovação com liberação de visibilidade e prazo de garantia.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-10
manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por ativo.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET/PATCH /api/ast/maintenance-plans`, `POST/GET /api/ast/maintenance-executions`. Tabelas: `ast_maintenance_plans`, `ast_maintenance_executions`. Planos de manutenção preventiva/corretiva por ativo (`asset_id`), periodicidade em dias, alerta antecipado, registro de execuções com técnico responsável, custo e avanço automático da próxima data de visita (`next_due_date`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 5): criação de plano preventivo trimestral (90 dias), registro de execução de manutenção técnica, e conferência no banco de que a próxima data de vencimento foi atualizada atomicamente no plano para a data indicada na execução.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-11
dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; senhas de equipamentos fora do cadastro/log comum.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET/PATCH /api/ast/cftv-dossiers`. Tabela: `ast_cftv_dossiers`. Dossiê com modelo, fabricante, número de série, endereço IP, documentação técnica anexada, e proteção absoluta contra senhas em texto puro (`plaintext_password_prohibited` com rejeição 400 se `plain_password` ou `password` forem fornecidos), exigindo referência a cofre corporativo de senhas (`password_reference` / `password_storage_hint`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 6): tentativa de envio de senha em texto plano rejeitada com 400, e cadastro seguro do dossiê com apontador URI de cofre seguro e meta auditada sem credenciais sensíveis.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-12
materiais de limpeza com consumo por local, reposição e comparação ao previsto.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET /api/ast/cleaning-materials`. Tabela: `ast_cleaning_materials`. Consumo esperado vs real por local/posto, período apurado, cálculo automático de razão de consumo (`consumption_ratio`), variância percentual (`variance_percent`), e acionamento automático do indicador de necessidade de reposição (`needs_replacement=true`) em caso de consumo excedente ao previsto.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 7): registro de consumo de produto de limpeza com consumo de 12 unidades contra 10 previstas, validação da variância (2 unidades / 20%), e flag `needs_replacement` ativada.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

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

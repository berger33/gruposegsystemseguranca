# Estado da execução — entrega local integral

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
| Branch de trabalho | `arena/01a0eef9-gruposegsystemseguranca` (integra com o main atualizado pelos merges dos PRs #24 e #26) |
| Base desta sessão | `ed50d22` (merge dos PRs #22 e #23) + PR #24 (`fe35b4c`, calendário CRM-08) + PR #26 (`b3c1db6`, PUB-10) |
| Lote ativo | **L04 — CRM-05/06/07 concluídos (notas internas + campo a campo), CRM-08 com calendário semanal e PUB-10 entregue; L04 ainda parcial**. Lembretes/notificações de CRM-08, revalidação campo a campo de CRM-01..04, PUB-02/05/06..09 e CRM-10 continuam pendentes. |
| Último gate aprovado | **L04 ampliado: 10/10, duas vezes consecutivas** (núcleo comercial + CRM-07 tarefas + interações + CRM-08 agenda + CRM-09 cadências + CRM-07 prazo/paginação/delegação + CRM-08 conflito/PUB-04 + CRM-07 notas/campo a campo CRM-05/06 + CRM-08 calendário por semana + PUB-10 métricas de origem), PostgreSQL descartável, HTTP real e Chromium sem `--disable-web-security`. |
| Migrações | 001–111 (510 tabelas; 111 adiciona `crm_opportunity_notes` com CHECKs/gatilho, CHECKs `NOT VALID` de coerência do funil e as ações `crm_note_*`/`crm_opportunity_reopen`) |
| Data | 2026-09-29 |

## Lotes

| Lote | Escopo | Estado | Gate |
|---|---|---|---|
| L00 | Base íntegra e controle confiável | **concluído** | aprovado |
| L01 | Identidade, autorização e integridade básica | **parcial ampliado** | SEC-02/04/05/06 + controles dependentes do L03: RBAC sem bypass, escopo, remuneração/saúde e revogação |
| L02 | Armazenamento, notificações locais, continuidade | **concluído** | 14/14 HTTP em PostgreSQL descartável (revalidado nesta sessão) |
| L03 | Funcionário e RH | **concluído** | EMP-01..19 e HR-01..24 navegáveis; gate integral aprovado (revalidado nesta sessão) |
| L04 | Site/captação e comercial | **parcial — CRM-05/06/07, calendário de CRM-08 e PUB-10 concluídos; lacunas explícitas** | Núcleo CRM-11..27 provado; CRM-07 completo (tarefas, interações, anexos, delegação com aceite, kanban/tabela campo a campo e notas internas dedicadas, todos provados por gate); CRM-05/06 prontos (todos os campos, funil com motivo de perda obrigatório no banco e reabertura auditada, borda pessoal nas rotas de oportunidade); CRM-08 tem agenda de responsável/participantes, conflito de horário, vínculo PUB-04 auditado e visão de calendário por semana (somente leitura), faltando lembretes/notificações (dependem de provedor); PUB-10 entregue como painel derivado e somente leitura em `/admin/leads` (PR #26); CRM-09 tem modelos privados e tarefas manuais, sem automação; CRM-01..04 aguardam revalidação campo a campo; CRM-10 e PUB-02/05/06..09 continuam pendentes |
| L05 | Contratos e implantação | pendente | — |
| L06 | Operação, patrimônio e manutenção | pendente | — |
| L07 | Financeiro e Marcelo | pendente | — |
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

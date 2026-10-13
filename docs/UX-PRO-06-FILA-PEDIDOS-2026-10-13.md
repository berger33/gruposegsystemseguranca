# UX-PRO-06 — fila de pedidos recebidos (`/admin/leads`)

**Base:** `main` `6ada38575fd1238864e7b94c619e80fef2531042` (13/10/2026).
**Superfície desta PR:** a tela `/admin/leads` — "Pedidos recebidos" — e o seu
módulo de estilos. É a fila interna de atendimento do CRM/comercial.

**Fora desta PR, deliberadamente:**

- `/admin/crm`, `/admin/carteira` e `/admin/comercial` já receberam as fatias
  UX-03A e UX-03B e não foram revisitados aqui;
- `/admin/clientes` (gestão interna de contas, vínculos, grants, convites) —
  família distinta, com risco próprio de escopo;
- o portal autenticado do cliente (`/cliente/app/*`) — área separada, com
  sessão, grant e escopo próprios, que o plano mestre manda revisar sem misturar
  com a área interna;
- `/admin/contratos`, oportunidades, atividades, calendário, orçamento/proposta.

UX-PRO-06 **não** está concluída por esta fatia: esta PR cobre uma tela coerente
da família CRM/comercial.

## Antes

- O cartão do pedido mostrava tipo, nome, status, data de recebimento, contato,
  local, serviços, preferência de visita, detalhes e o estado do e-mail. Não
  havia noção de **espera**, **prioridade**, **fonte**, **responsável** ou
  **próxima ação**.
- A API `GET /api/admin/leads` já devolvia `origin`, `campaign`, `channel`,
  `responsible`, `responsible_id` e `updated_at`; nenhum deles chegava à tela.
- Não havia "prazo": `public_leads` não tem campo de vencimento, e a tela não
  dizia há quanto tempo o pedido esperava.
- O resumo era apenas a contagem total do filtro.
- `Carregando pedidos…` era um `<div>` sem `role="status"` nem `aria-busy`, e
  durante qualquer atualização a lista inteira desaparecia.
- Quando uma nova leitura falhava, a mensagem de erro aparecia no rodapé e a
  lista anterior continuava na tela **sem nenhuma marcação**: dado antigo era
  apresentado como se fosse atual.
- "Nenhum pedido neste filtro" servia tanto para ausência real de dados quanto
  para filtro sem resultado; falha de leitura nunca foi distinguida de "zero".
- Um único estado `busy` desabilitava **todos** os controles de **todos** os
  cartões: uma ação num pedido congelava a fila inteira.

## Depois

- **Resumo da fila** com três números e o critério declarado ao lado de cada um:
  pedidos aguardando retorno, pedidos sem retorno há mais de 3 dias e a hora da
  última leitura concluída. O texto diz explicitamente que as contagens e a
  ordenação são derivadas apenas dos pedidos já carregados (a API devolve no
  máximo 100 por vez), que **nenhum campo novo é gravado** e que **nenhum valor
  é estimado**.
- **Espera** calculada sobre o `created_at` canônico (`recebido agora`,
  `há 12 min`, `há 3 h`, `há 5 dias`, `há 2 meses`), comparada ao instante da
  última leitura bem-sucedida — não ao relógio a cada render.
- **Atenção** para pedidos ainda abertos esperando há mais de 3 dias, com selo
  próprio no cartão e contagem no resumo. O limiar é visível no rótulo
  ("mais de 3 dias") e é regra de apresentação, não campo do registro.
- **Fonte do pedido** com cada parte nomeada (`origem: contato · campanha: site ·
  canal: site`). Quando alguma parte não existe no registro, a tela diz qual
  falta ("Sem origem nem campanha no registro."); quando nada existe, diz
  "Não informada no registro".
- **Responsável pelo atendimento** lido do registro, com "Não atribuído" quando
  ninguém foi definido. Nenhuma atribuição automática foi criada.
- **Próxima ação** por estado do pedido (solicitada → definir quem atende e
  contatar; em agendamento → combinar data; confirmada → realizar; realizada →
  converter ou encerrar; cancelada → nenhuma). É uma regra de apresentação
  derivada do status, declarada como tal.
- **Protocolo curto** (8 primeiros caracteres do id) no cabeçalho do cartão, o
  mesmo número que o site público entrega a quem enviou o pedido.
- **Ordenação** opcional "Sem retorno há mais tempo primeiro", que reordena só o
  que já está carregado: abertos primeiro, e entre eles o mais antigo primeiro.
- **Estados honestos e distintos:**
  - `Carregando pedidos…` com `role="status"` e `aria-busy="true"`;
  - "A fila ainda não foi carregada" quando nenhuma leitura foi concluída —
    não é zero nem vazio;
  - "Nenhum pedido recebido até agora" (ausência real) é diferente de "Nenhum
    pedido com o status X" (filtro), que oferece o botão "Ver todos os pedidos";
  - falha de leitura com dados anteriores mantém a lista e mostra faixa
    `role="alert"`: "A última atualização falhou… podem estar desatualizados —
    isto não significa que a fila esteja vazia";
  - durante a atualização, a lista permanece visível com um indicador
    "Atualizando a fila…" em vez de desaparecer.
- **Ação por pedido:** o envio passou a ser travado por pedido (`pendingId`).
  A trava de duplo envio continua existindo, mas uma ação num cartão deixa de
  congelar os demais.

## Preservações e escopo técnico

Nenhuma rota, método, payload, cabeçalho, papel do `AdminGate`, permissão,
transição de status, trilha de auditoria, chave de idempotência, regra de
deduplicação, política de antispam, dado canônico ou contrato de API foi
alterado. Em particular:

- os papéis continuam `comercial | marcelo | admin | ti`;
- `PATCH /api/admin/leads/:id` continua sendo o único caminho de transição, com
  a mesma auditoria (`public_lead_status_audit` + `auth_access_audit`);
- `POST /api/crm/leads/:id/convert` continua idêntico, inclusive a reapropriação
  sem duplicar;
- nenhuma migração foi criada; a leitura continua `SELECT` sobre
  `public_leads`;
- o teto de antispam de PUB-03 continua 5 envios por IP a cada 10 minutos em
  produção; `LEAD_MAX_ATTEMPTS` só é elevado dentro do gate, como os demais
  gates já fazem com `ADMIN_LOGIN_MAX_ATTEMPTS`.

A única mudança fora da tela é de **configuração de verificação**:
`src/app/admin/leads/**` passou a constar nos `paths` de
`.github/workflows/ux-crm-delivery.yml`, para que a fila passe a ter o mesmo
gate de navegador do funil. Isso alterou duas colunas do inventário gerado
(`gates_automatizados` e `gates_jobs` de `/admin/leads`), e os CSVs vigentes de
13/10 foram regenerados pelo próprio gerador.

## Verificações e evidência

- **Inspeção estática:** leitura de `server.mjs` (`handleAdminLeads`,
  `handleAdminLeadStatus`, `handleCreateLead`) e de
  `src/lib/public-lead-validation.mjs` para confirmar quais campos já existiam;
  leitura do inventário vigente e do gerador
  `scripts/ux-pro-00-inventory.mjs`. Nenhuma rota foi adicionada ou removida
  (100 entradas de rota, inalteradas).
- **Automatizado de contrato (HTTP real, PostgreSQL descartável):** 401 para
  anônimo e 403 para papel `rh` em `/api/admin/leads`, com resposta que não vaza
  dados; presença confirmada de `origin`, `campaign`, `channel`, `responsible`,
  `responsible_id` e `updated_at` na resposta, provando que nenhum contrato novo
  foi necessário.
- **Automatizado de navegador (Chromium real, PostgreSQL descartável, migrações
  001–180):** `npm run test:ux-crm:pg` — **15/15**, sendo 7 testes pré-existentes
  do funil, 1 guarda de ambiente e 7 novos da fila:
  0. guarda de ambiente: falha se `RUN_DATABASE_INTEGRATION`/`DATABASE_URL`
     não estiverem definidos, para a suíte não passar verde com tudo ignorado;
  1. contrato da API preservado (401/403 e campos existentes);
  2. espera, fonte nomeada, responsável, protocolo e próxima ação, incluindo as
     duas ausências ("Não informada no registro", "Não atribuído");
  3. falha de leitura marca a fila como desatualizada e mantém os pedidos;
  4. filtro sem resultado é ausência de dados, com caminho de volta;
  5. ordenação por espera é derivada e declarada;
  6. sem transbordo horizontal em **320, 390 e 768 px** e tema noturno aplicado
     às superfícies novas (fundo escuro e número claro verificados por CSS
     calculado);
  7. percurso de Tab (filtro → atualizar → ordenação), contorno de foco visível
     e operação do seletor de ordenação por seta.
- **Outro gate que toca esta tela:** `npm run test:l04-delivery:pg` também visita
  `/admin/leads` em Chromium autenticado (1440×1000), conferindo ausência de
  rolagem horizontal e ausência de erro de console/HTTP 5xx (trecho 15 do
  primeiro teste de `tests/l04-delivery.integration.test.mjs`). Executado
  localmente com as mudanças desta PR: **20/20**.
- **Automatizado geral:** `npm run typecheck` aprovado; `npm run build`
  aprovado; `npm test` (933 asserções) aprovado; `node scripts/qa-wave0-static.mjs`
  5/5; `node --test tests/admin-navigation.test.mjs` 2/2;
  `node scripts/ux-pro-00-inventory.mjs --check` OK.
- **Capturas** (massa inteiramente sintética, sem dado pessoal e sem
  credencial), em `docs/ux-pro-06-evidencias/`:
  [`desktop-leads-fila.png`](ux-pro-06-evidencias/desktop-leads-fila.png),
  [`desktop-leads-desatualizado.png`](ux-pro-06-evidencias/desktop-leads-desatualizado.png),
  [`mobile-leads-fila.png`](ux-pro-06-evidencias/mobile-leads-fila.png) e
  [`mobile-leads-noturno.png`](ux-pro-06-evidencias/mobile-leads-noturno.png).

## Limitações

- Não existe campo de **prazo/vencimento** em `public_leads`: o que a tela
  apresenta é a *espera* desde o recebimento, e o limiar de 3 dias é regra de
  apresentação, não acordo de nível de serviço registrado.
- **Responsável** é somente leitura aqui. O endpoint `PATCH /api/admin/leads/:id`
  já aceita `responsible`/`responsible_id`, mas a tela não atribui ninguém:
  decidir quem recebe cada pedido é regra de negócio do proprietário, e criar
  essa automação estaria fora do escopo de uma fatia de interface.
- As contagens de "aguardando retorno" e "sem retorno há mais de 3 dias" cobrem
  apenas a página carregada (máximo 100 pedidos). A contagem total do filtro é a
  do servidor e continua exposta separadamente.
- O navegador Chromium foi executado de forma automatizada com massa sintética.
  Isso **não** é validação manual por pessoa nem aceite de Marcelo, Andreia,
  comercial ou cliente.
- Não foram testados envio real de e-mail (`MAIL_HOST` vazio no gate),
  WhatsApp em dispositivo real, HTTPS hospedado, Windows ou o banco do operador.
- Os CSVs de 10/10 permanecem como registro histórico; apenas o par vigente de
  13/10 foi regenerado, que é o que o guarda de regressão confere.

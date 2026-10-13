# UX-PRO-06 — estados de leitura do funil de oportunidades (`/admin/crm`)

**Base:** `main` `ac3267d919bff254dda6f6a4b1a48c5ca6e97d04` (13/10/2026, pós-merge da PR #211).
**Superfície desta PR:** a tela `/admin/crm` — "Empresas e oportunidades" — e o seu
módulo de estilos. É a tela do funil de oportunidades da família CRM/comercial
interna. Também nesta PR: testes do gate UX CRM que exercitam esta tela, as
capturas próprias desta fatia e a regeneração do par vigente de CSVs do
inventário (apenas a linha `/admin/crm` mudou).

**Fora desta PR, deliberadamente:**

- `/admin/leads` — fila entregue nas PRs #210/#211, não reaberta;
- `/admin/comercial`, `/admin/carteira`, `/admin/contratos` — demais telas da
  família, cada uma com sua própria fatia;
- `/admin/clientes` (gestão interna de contas, vínculos, grants, convites) —
  família distinta, com risco próprio de escopo;
- o portal autenticado do cliente (`/cliente/app/*`) — área separada, com
  sessão, grant e escopo próprios;
- formulários, importação CSV, conversão de pedido, abas do detalhe, agenda e
  delegações — comportamento destes fluxos permanece o mesmo;
- contratos de API, permissões, papéis e dados canônicos — nenhum tocado.

UX-PRO-06 **não** está concluída por esta fatia: esta PR cobre uma tela coerente
da família CRM/comercial interna.

## Antes

A leitura do funil (e da lista de empresas) tinha três defeitos de estado,
demonstráveis no código:

1. **Uma falha na atualização apagava o funil já lido.** Em `loadOpportunities`
   o caminho de falha fazia `setOpps([]); setOppsTotal(0)` e trocava a área
   inteira por um estado de erro; `loadCompanies` fazia `setCompanies([])`.
   Uma 503 transitória em "Atualizar listas" destruía a visão de trabalho — o
   oposto do padrão já entregue na fila de pedidos (#210/#211).
2. **Durante qualquer recarga a lista desaparecia.** `oppsState === "loading"`
   substituía todo o funil por "Consultando o seu funil…", mesmo quando já
   havia dados na tela (inclusive após criar uma oportunidade, que recarrega
   as listas).
3. **Não havia como distinguir "dados possivelmente desatualizados" de "nunca
   houve leitura concluída"** quando a falha vinha depois de um sucesso: o
   estado de erro ocupava o mesmo lugar que a ausência total de dado.

## Depois

- **Falha na atualização preserva o que já foi lido.** Se já existiu uma
  leitura concluída, a falha mantém lista, total e cabeçalho "(X de Y)"
  anteriores e exibe uma faixa `role="alert"` com o motivo real da falha, a
  hora da última leitura concluída (relógio do navegador no instante do
  sucesso; nenhum valor é estimado nem gravado) e o aviso de que os dados
  podem estar desatualizados — "isto não significa que o funil esteja vazio" —
  com botão "Tentar novamente" quando o erro permite repetição.
- **Atualização em curso mantém a lista visível.** Com dados já lidos, a
  recarga mostra um indicador `role="status"` ("Atualizando o funil…" /
  "Atualizando as empresas…") sem esconder o conteúdo; o bloco de carregamento
  cheio ("Consultando…") continua a existir apenas quando ainda não há
  nenhuma leitura concluída.
- **Autorização continua falhando fechada.** Se a falha for de permissão
  (`denied`) ou de sessão (`auth`), a tela NÃO mantém os dados anteriores:
  ela substitui tudo pelo estado negado completo, sem repetir a chamada.
  Dúvida de autorização nunca é mascarada por dados preservados.
- **Empresas e funil seguem o mesmo padrão**, porque são as duas leituras da
  mesma seção de resultados.
- **Correção de layout em 320 px.** A coluna implícita do grid de campo do
  CRM crescia pelo conteúdo mínimo do `<select>` de empresa (opção longa no
  dropdown) e empurrava rótulo, campo e nota 16 px além do contêiner em
  320 px. `.field` passou a declarar `grid-template-columns: minmax(0, 1fr)`;
  o `max-width: 100%` dos controles já existente passa a valer contra a
  coluna correta. Nenhuma opção de/select é removida; o controle só deixa de
  transbordar o contêiner.

## Preservações e escopo técnico

Nenhuma rota, método, payload, cabeçalho, papel do `AdminGate`, permissão,
transição de estado, trilha de auditoria, regra de negócio ou contrato de API
foi alterado. A mudança é de apresentação e de higiene de verificação:

- os papéis continuam `comercial | marcelo | admin | ti`;
- `GET /api/crm/companies` e `GET /api/crm/opportunities` continuam iguais
  (a listagem de empresas segue não-pessoal e o funil segue pessoal —
  comportamento do servidor inalterado);
- nenhuma migração foi criada; nenhum dado novo é gravado;
- os estados de erro/vazio/carregado/negado pré-existentes (UX-03B) seguem
  existindo e sendo exercitados pelos testes originais do gate;
- `next-env.d.ts` e `tsconfig.json` não são alterados por esta fatia (os gates
  restauram os dois arquivos ao encerrar; conferido após cada execução).

## Verificações e evidência

- **Automatizado de navegador (Chromium real, PostgreSQL descartável, migrações
  001–180):** `npm run test:ux-crm:pg` — **19/19**, sendo 16 pré-existentes
  (incluindo os 8 da fila de pedidos) e 3 novos desta fatia:
  1. falha ao atualizar mantém o funil carregado, marca os dados como
     desatualizados com o motivo real e sana pela repetição dentro da faixa;
  2. atualização em curso mantém a lista visível com indicador `role="status"`
     e não deixa falso desatualizado após sucesso;
  3. sem transbordo horizontal em **320 e 768 px** e tema noturno aplicado às
     superfícies do funil (fundo de coluna escurecido e título clareado,
     medidos por CSS calculado após o controle real do envelope).
- **Outro gate que toca esta tela:** `npm run test:l04-delivery:pg` —
  **20/20** (exercita jornadas do funil, incluindo tarefas, interações e
  visitas em `/admin/crm`).
- **Automatizado geral (executados nesta sessão):** `npm run typecheck`
  aprovado; `npm run build` aprovado; `npm test` **933/933**, 0 pulados;
  `node scripts/qa-wave0-static.mjs` **5/5**; `node scripts/ux-pro-00-inventory.mjs --check`
  OK com o par de CSVs regenerado.
- **Capturas** (massa inteiramente sintética, sessão de staff provisionada
  pelo gate, sem dado pessoal e sem credencial), em
  `docs/ux-pro-06-funil-evidencias/` com `resumo.json` legível por máquina:
  [`desktop-crm-funil.png`](ux-pro-06-funil-evidencias/desktop-crm-funil.png)
  (1440×900, dia),
  [`funil-320.png`](ux-pro-06-funil-evidencias/funil-320.png) (320×844),
  [`funil-768.png`](ux-pro-06-funil-evidencias/funil-768.png) (768×1024),
  [`funil-768-noturno.png`](ux-pro-06-funil-evidencias/funil-768-noturno.png)
  (768×1024, tema noturno) e
  [`desktop-crm-funil-desatualizado.png`](ux-pro-06-funil-evidencias/desktop-crm-funil-desatualizado.png)
  (falha na atualização com dados preservados e faixa de alerta). As capturas
  de outras execuções da suíte ficaram fora desta pasta para não misturar
  artefatos de outras fatias.
- **CSVs do inventário:** o par vigente de 13/10 foi regenerado pelo próprio
  gerador porque o `resumo.json` desta fatia altera a linha `/admin/crm` da
  matriz (viewports `320x844` e `768x1024` passam a existir; a coluna de
  evidência passa a citar o estágio `ux-pro-06-funil`). Nenhuma outra linha
  mudou; os CSVs de 10/10 permanecem como registro histórico.

## Limitações

- A faixa "atualização falhou" usa o relógio do navegador no instante do
  sucesso da leitura; não há servidor de tempo nem campo novo em banco.
- Enquanto a faixa estiver visível, o filtro atual pode não estar aplicado
  aos dados mostrados (eles são os da última leitura concluída) — a faixa diz
  isso; limpar filtros ou repetir a consulta atualiza de verdade.
- O texto estático da matriz "tema noturno sem captura" é fixo do gerador de
  inventário e não interpreta o `resumo.json`; a captura noturna desta fatia
  existe e está registrada no `resumo.json` da pasta de evidências.
- O navegador Chromium roda de forma automatizada com massa sintética. Isso
  **não** é validação manual por pessoa nem aceite de Marcelo, Andreia,
  comercial ou cliente — nenhum registro de aceite humano foi criado.
- Não foram testados envio real de e-mail, WhatsApp em dispositivo real,
  HTTPS hospedado, Windows ou o banco do operador.
- A medição de 320/768 px reconfirma após o reflow do resize para não reprovar
  transiente de layout; o overflow real (persistente) continua reprovando o
  teste, como provado durante o desenvolvimento desta fatia.

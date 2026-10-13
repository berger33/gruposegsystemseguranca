# UX-PRO-06 — estados de leitura da carteira comercial (`/admin/carteira`)

**Base:** `main` `d84dc8f2ab96c8f1ede482e8d0892f27afc6b0d5` (13/10/2026, pós-merge da PR #212).
**Superfície desta PR:** a tela `/admin/carteira` — "Carteira e próximos contatos" — e o seu
módulo de estado próprio. É uma tela da família CRM/comercial interna, escolhida pelo
proprietário nesta sessão entre as recomendações `/admin/carteira` e `/admin/comercial`.

**Fora desta PR, deliberadamente:**

- `/admin/crm` (funil) e `/admin/leads` (fila de pedidos) — entregues nas PRs #210/#211/#212,
  não reabertas nem reimplementadas;
- `/admin/comercial`, `/admin/contratos`, `/admin/expansao` — demais telas da família, cada
  uma com sua própria fatia; a rota `/admin/comercial` não é tocada aqui;
- `/admin/clientes` (gestão interna de contas, vínculos, grants, convites) — família distinta;
- o portal autenticado do cliente (`/cliente/app/*`) — área separada, com sessão, grant e
  escopo próprios;
- formulários, criação de ação de carteira, idempotência (`request_key`), filtros canônicos,
  paginação por `offset`, indicadores e lista de ações recentes — o comportamento destes
  fluxos permanece o mesmo;
- `src/components/ui/UiWorkspace.module.css`, compartilhado por 32 arquivos — **não foi
  alterado**. Chegou-se a medir uma correção de grade nele; o formulário de indicação não
  transborda em 320 px com o CSS atual (medido, ver abaixo), então a alteração foi descartada
  como desnecessária e fora do escopo desta fatia;
- contratos de API, papéis, permissões, auditoria e dados canônicos — nenhum tocado.

UX-PRO-06 **não** está concluída por esta fatia: esta PR cobre uma tela coerente da família
CRM/comercial interna.

## Escopo registrado antes de implementar (13/10/2026)

**Comportamento que precisa permanecer (inventariado no código antes de editar):**

- `AdminGate allowedRoles={["comercial","marcelo","admin","ti"]}` — papéis e sessão inalterados;
- `GET /api/crm/portfolio?filter=<all|no_next|overdue|won|lost>&offset=N` — mesmos filtros
  canônicos, mesma paginação, mesma leitura **pessoal** (`o.responsible_id=$1 OR (o.responsible_id
  IS NULL AND o.created_by_id=$1)`);
- `POST /api/crm/portfolio` com `source_id`, `request_key`, `kind`, `title`, `next_action`,
  `next_action_date` — mesma idempotência, mesmas regras (reativação só a partir de perdida,
  indicação exige `target_company_id`) e mesma trilha de auditoria;
- `GET /api/crm/companies?limit=200` usado pelo seletor de empresa da indicação;
- estados já existentes de carregando / vazio / erro / negado / sucesso (UX-03B) e o
  vocabulário de estágios e de tipos de ação (`stageLabel`, `kindLabel`);
- foco programático no título do formulário ao abrir "Criar ação de carteira"
  (`tabIndex={-1}` + `ref`) e alvos de toque ≥ 44 px;
- ausência de transbordo horizontal em 390 px e o título acessível do cartão, exercitados
  pelo gate `npm run test:l04-delivery:pg`;
- URL, método, corpo e cabeçalhos de todas as chamadas (`crmRequest` não recebeu alteração).

**Riscos identificados e como foram tratados:**

1. **Mostrar dado velho como se fosse atual.** → A faixa é `role="alert"`, cita o motivo real,
   a hora da última leitura concluída e a frase de que dados antigos não significam carteira
   vazia; a hora vem do relógio do navegador no instante do sucesso — nada é estimado nem
   gravado.
2. **Autorização mascarada por dado preservado.** → Falha `denied`/`auth` continua falhando
   fechada: substitui o conteúdo pelo estado negado completo e não oferece repetir a mesma
   chamada. Dado preservado só existe para falha transitória/de rede (`retry`).
3. **Recorte diferente do dado preservado.** → Enquanto a faixa está visível, a tela diz que
   os itens, os totais e as ações recentes são da última leitura concluída, que o recorte
   exibido pode não ser o recém-escolhido, e a paginação passa a declarar o intervalo do
   recorte que produziu os itens (não o pedido que ainda não voltou).
4. **Regressão fora da tela.** → Nenhuma alteração em módulo compartilhado; a fatia
   acrescentou apenas um módulo CSS local da própria tela.
5. **Regressão silenciosa nos arquivos gerados.** → `next-env.d.ts` e `tsconfig.json` foram
   conferidos por hash após cada execução de gate e restaurados ao baseline.
6. **Inventário divergente.** → Os dois CSVs vigentes de 13/10 foram regenerados pelo próprio
   gerador e a conferência por coluna mostra que **somente a linha `/admin/carteira`** mudou.
7. **Evidência com dado real.** → Massa 100% sintética criada pelas mesmas APIs, sessão de
   staff provisionada pelo gate; nenhuma credencial, dado pessoal ou endpoint efêmero em
   captura, log ou documento.

## Antes

Três defeitos de estado, medidos no código de `d84dc8f` e reproduzidos com a suíte desta PR
rodando contra um checkout descartável dessa mesma base (capturas em
[`antes/`](ux-pro-06-carteira-evidencias/antes/)):

1. **Uma falha na releitura apagava a carteira já lida.** Em `load()` o caminho de falha fazia
   `setData(null)` e trocava o conteúdo pelo estado de erro. Evidência da execução em
   `d84dc8f`: `a carteira lida continua visivel apos a falha? false` — o item já lido
   desaparecia da tela
   ([`antes-desktop-carteira-releitura-falhou.png`](ux-pro-06-carteira-evidencias/antes/antes-desktop-carteira-releitura-falhou.png)).
2. **Não havia como distinguir "possivelmente desatualizado" de "nunca houve leitura".** A
   falha ocupava o mesmo lugar da ausência total de dado, sem hora de referência nem repetição
   dentro do aviso.
3. **A falha inicial não era declarada no painel de resultados.** O painel dizia apenas
   `"Os números aparecem junto com a lista acima."` mesmo com a leitura falhada — texto que
   sugere ausência de ações, não falha de leitura
   ([`antes-desktop-carteira-leitura-inicial-falhou.png`](ux-pro-06-carteira-evidencias/antes/antes-desktop-carteira-leitura-inicial-falhou.png)).

O funil de oportunidades recebeu essa mesma correção na PR #212; a carteira, que é a tela
seguinte do mesmo fluxo comercial, ficou com o comportamento antigo.

## Depois

- **Falha na releitura preserva o que já foi lido.** Se já existiu leitura concluída, a falha
  mantém itens, contagem do título, totais de ações, ações recentes e paginação anteriores e
  exibe uma faixa `role="alert"` (`data-testid="carteira-desatualizada"`) com o motivo real, a
  hora da última leitura concluída e o aviso de que os dados podem estar desatualizados —
  "isto não significa que a carteira esteja vazia" —, mais o botão "Tentar novamente" quando o
  erro permite repetição.
- **Releitura em curso mantém a lista visível.** Com dados já lidos, a releitura mostra um
  indicador `role="status"` (`data-testid="carteira-atualizando"`) sem esconder o conteúdo; o
  bloco de carregamento cheio ("Consultando a sua carteira…") continua a existir apenas quando
  ainda não há nenhuma leitura concluída.
- **Autorização continua falhando fechada.** Falha `denied`/`auth` não preserva nada: substitui
  o conteúdo pelo estado negado completo e não oferece repetir a mesma chamada.
- **A falha inicial é declarada onde importa.** Sem leitura concluída, o painel de resultados
  diz que a leitura falhou e cita o motivo, em vez de sugerir que não existem ações; a
  contagem não aparece no título.
- **Os números desatualizados são rotulados.** Com a faixa visível, o painel de resultados diz
  de quando é o dado, e o intervalo de paginação declara que vem da última leitura concluída.
- **Provas de acessibilidade no caminho real.** O percurso de Tab (filtro → ação do cartão →
  link do cartão → título do formulário → campos) e as setas do `select` de tipo de ação são
  exercitados pelo gate, com contorno de foco visível medido por CSS calculado.
- **Sem transbordo em 320, 390 e 768 px**, inclusive com o formulário de indicação aberto em
  320 px (o caminho mais largo da tela), e tema noturno alcançando cartão e título pelos
  tokens de aviso — medidos por CSS calculado, não por inspeção visual.

## Preservações e escopo técnico

Nenhuma rota, método, payload, cabeçalho, papel do `AdminGate`, permissão, transição de
estado, trilha de auditoria, regra de negócio ou contrato de API foi alterado. A mudança é de
apresentação:

- os papéis continuam `comercial | marcelo | admin | ti`;
- `GET`/`POST /api/crm/portfolio` continuam iguais, incluindo `request_key`, os cinco `kind`,
  a regra de reativação e o escopo pessoal (o gate reafirma 401 para anônimo, 403 para papel
  fora da lista, 400 para filtro fora da lista canônica, isolamento entre duas pessoas
  comerciais e `limit: 50`);
- nenhuma migração foi criada; nenhum dado novo é gravado;
- os estados de erro/vazio/carregado/negado pré-existentes (UX-03B) seguem existindo e sendo
  exercitados pelos testes originais;
- `UiWorkspace.module.css` não foi alterado; a tela ganhou apenas
  `src/app/admin/carteira/Carteira.module.css` com as duas classes de estado que ela mesma usa
  (os mesmos tokens de aviso já usados pelo funil);
- `next-env.d.ts` e `tsconfig.json` não são alterados por esta fatia (conferidos por hash após
  cada execução; o gate restaura os dois ao encerrar).

## Verificações e evidência

- **Automatizado de navegador (Chromium real, PostgreSQL descartável, migrações 001–180):**
  `npm run test:ux-crm:pg` — **26/26**, sendo 19 pré-existentes (incluindo os 16 do funil e da
  fila entregues em #210–#212) e **7 novos desta fatia**: 1 de contrato por HTTP (sessão,
  papel, recorte pessoal, filtros canônicos, limite de página) e 6 de navegador (falha que
  preserva; releitura em curso; negativa que falha fechada; primeira leitura que falha sem
  virar zero ou vazio; 320/390/768 px com formulário de indicação e tema noturno; teclado).
- **Antes/depois da mesma suíte:** com os testes desta PR aplicados ao checkout de `d84dc8f`,
  falhavam 5 (as capturas anteriores são as duas que documentam o defeito). Na base corrigida,
  a suíte inteira passa.
- **Outro gate que toca esta tela:** `npm run test:l04-delivery:pg` — **20/20** (exercita
  carteira pessoal, renovação, indicação, reativação, idempotência, auditoria e ausência de
  transbordo a 390 px).
- **Automatizado geral:** `npm run typecheck` aprovado; `npm run build` aprovado;
  `npm test` **933/933**, 0 pulados; `node scripts/qa-wave0-static.mjs` **5/5**;
  `node scripts/ux-pro-00-inventory.mjs --check` OK com o par vigente de CSVs regenerado.
- **Capturas** (massa inteiramente sintética, sessão de staff provisionada pelo gate, sem dado
  pessoal e sem credencial), em `docs/ux-pro-06-carteira-evidencias/` com `resumo.json`
  legível por máquina: [`desktop-carteira.png`](ux-pro-06-carteira-evidencias/desktop-carteira.png)
  (1440×900, dia), [`carteira-320.png`](ux-pro-06-carteira-evidencias/carteira-320.png),
  [`carteira-320-formulario-indicacao.png`](ux-pro-06-carteira-evidencias/carteira-320-formulario-indicacao.png),
  [`carteira-390.png`](ux-pro-06-carteira-evidencias/carteira-390.png),
  [`carteira-768.png`](ux-pro-06-carteira-evidencias/carteira-768.png),
  [`carteira-768-noturno.png`](ux-pro-06-carteira-evidencias/carteira-768-noturno.png) (tema
  noturno real pelo controle do envelope),
  [`desktop-carteira-desatualizada.png`](ux-pro-06-carteira-evidencias/desktop-carteira-desatualizada.png)
  (falha na releitura com dados preservados e faixa de alerta) e
  [`desktop-carteira-falha.png`](ux-pro-06-carteira-evidencias/desktop-carteira-falha.png)
  (primeira leitura falhada, sem leitura concluída).
- **CSVs do inventário:** o par vigente de 13/10 foi regenerado porque as capturas novas
  alteram a linha `/admin/carteira` (viewports 320/844 e 768/1024 passam a existir, a evidência
  passa a citar o estágio `ux-pro-06-carteira` e `estados_erro` passa a `sim`). Conferência por
  coluna: **nenhuma outra linha mudou**; os CSVs de 10/10 permanecem como registro histórico.

## Limitações

- A faixa "atualização falhou" usa o relógio do navegador no instante do sucesso da leitura;
  não há servidor de tempo nem campo novo em banco.
- Enquanto a faixa estiver visível, o recorte atual pode não estar aplicado aos dados
  mostrados (eles são os da última leitura concluída) — a faixa e a paginação dizem isso;
  trocar o filtro ou repetir a consulta atualiza de verdade.
- O texto estático da matriz "tema noturno sem captura" é fixo do gerador de inventário e não
  interpreta o `resumo.json`; a captura noturna desta fatia existe e está registrada no
  `resumo.json` da pasta de evidências.
- A medição de 320/390/768 px reconfirma após o reflow do resize para não reprovar transiente
  de layout; o overflow real (persistente) continua reprovando o teste.
- O navegador Chromium roda de forma automatizada com massa sintética. Isso **não** é validação
  manual por pessoa nem aceite de Marcelo, Andreia, comercial ou cliente — nenhum registro de
  aceite humano foi criado.
- Não foram testados envio real de e-mail, WhatsApp em dispositivo real, HTTPS hospedado,
  Windows ou o banco do operador.

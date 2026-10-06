# UX-11 / EXT-10 — fluxos de estado e detalhe do portal

**Data local:** 2026-10-06

**Escopo:** `/admin/continuidade` e `/cliente/app/continuidade`

**Massa:** exclusivamente fictícia, em PostgreSQL 17 descartável.

## O que foi provado por execução

As provas abaixo foram executadas com servidor HTTP canônico, sessões reais,
PostgreSQL descartável e Chromium real. Não houve `page.route()`, resposta
sintetizada, monkey-patch de resposta ou endpoint novo.

### Tela de equipe

- Um plano fictício foi criado pelos controles reais de
  `/admin/continuidade`, vinculado a uma conta fictícia e confirmado por
  leitura no servidor canônico.
- A ação real **Aprovar** mudou a situação visual para **Aprovado** e o
  detalhe canônico confirmou a persistência da transição.
- A ação real **Colocar em teste**, seguida do formulário real
  **Documentar simulado**, registrou data, próximo teste e responsável. A tela
  apresentou `11/03/2026` e `11/09/2026` em UTC, sem época/zero, e exibiu o
  efeito canônico de estado **Em teste** → **Testado**.
- A publicação foi acionada pelo controle real **Publicar no portal**, com
  conta vinculada, estado publicável e justificativa válida. O servidor
  confirmou `client_visible=true`.
- A retirada foi acionada pelo controle real **Retirar publicação**. O
  servidor confirmou `client_visible=false`; o cliente atualizou pelo botão
  real e obteve o estado vazio honesto, sem erro e sem perder o vínculo.
- O mesmo fluxo abriu o portal para a conta fictícia vinculada e para outra
  conta fictícia: o plano apareceu somente para a conta vinculada.

### Portal do cliente e 404 de detalhe

- O portal continua lendo listas pelo wrapper `continuityRequest`, com
  `credentials: 'same-origin'`, `cache: 'no-store'` e `accept: application/json`.
- Foi acrescentada a ação somente leitura **Abrir detalhes**, que chama apenas
  `GET /api/client/continuity/plans/<plan-id>`.
- Com a lista previamente lida, a equipe retirou a publicação pela própria UI.
  O clique real em **Abrir detalhes** recebeu do servidor canônico um HTTP 404
  `plan_not_found`.
- A apresentação exibiu o vocabulário canônico de indisponibilidade para
  consulta/escopo, o código técnico `plan_not_found`, nenhum botão de nova
  tentativa e nenhum conteúdo do detalhe. A lista previamente lida continuou
  visível e não foi convertida em vazio.
- Estados de carregamento, sucesso, vazio, falha recuperável e NEGADO seguem
  separados; as negativas 403 e a falha 503/rede continuam cobertas pelos
  gates focais.

### Gates e evidências executados nesta fatia

- `scripts/qa-ux-continuity-postgres.mjs`: **17/17** TAP aprovados, piso 17.
- `scripts/qa-ux-continuity-client-postgres.mjs`: **10/10** TAP aprovados,
  piso 10.
- Evidências do fluxo da equipe:
  `docs/ux-11-continuidade-evidencias/`.
- Evidências do portal e 404 real:
  `docs/ux-11-continuidade-cliente-evidencias/`.

## O que não foi provado

- Não houve homologação humana.
- Não houve aceite de Marcelo, Andreia ou qualquer outro responsável.
- Não houve auditoria WCAG completa, ensaio com tecnologia assistiva ou matriz
  integral de navegadores/dispositivos.
- Não houve observação de produção, carga, disponibilidade de produção ou
  confirmação de operação externa/fornecedor de emergência.
- A prova de 404 não declara causa para a indisponibilidade do plano; ela prova
  somente a resposta canônica e a apresentação segura dessa resposta.

## Pendências e limites remanescentes

Não foi identificada pendência automatizada dentro desta fatia após os gates
acima. Permanecem os limites deliberadamente fora de escopo: homologação
humana, aceite de negócio, auditoria de acessibilidade completa e validação em
produção. Esses limites não devem ser interpretados como aprovados por esta
execução.

## Integridade de contratos

Esta fatia não alterou `server.mjs`, nenhum servidor canônico em
`src/server/ext-*.mjs`, migração existente, scheduler ou contrato HTTP. Não
foram criados endpoints, URLs, métodos, corpos ou cabeçalhos novos. O detalhe
consome exclusivamente o endpoint GET já existente e todos os dados usados são
fictícios.

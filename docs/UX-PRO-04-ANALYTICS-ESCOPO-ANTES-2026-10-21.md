# UX-PRO-04 — Analytics: justificativa explícita de aprovação (escopo antes)

**Data:** 21/10/2026  
**Base:** `main` `66799ec434350445b0d68bad42960d1a01489efd` (merge da PR #290)  
**Rota:** `/admin/analytics` — componente montado `AnalyticsWorkspace`  
**Família desta fatia:** somente aprovação de rascunho em Analytics.

## Lacuna confirmada na base

O detalhe do rascunho mostra hipótese, métrica e variantes. A ação **Registrar aprovação humana** envia ao endpoint canônico `POST /api/ext/analytics/experiments/{id}/approve` uma frase fixa (`Aprovação humana registrada após revisão da hipótese, variantes, métrica e minimização.`). O servidor já valida `approval_note` com 10–1000 caracteres e grava a nota junto da identidade autenticada e do instante canônico. A interface não coleta a nota da pessoa que aprova; portanto o texto de auditoria é uma afirmação produzida pelo cliente, não uma justificativa fornecida por quem opera.

## Escopo proposto

- Na aprovação de um rascunho, apresentar campo rotulado para a justificativa da pessoa operadora, com limite/validação compatíveis com a API (10–1000 caracteres após remover espaços externos).
- Manter a ação indisponível até haver texto válido, enviar o texto informado no campo existente `approval_note` e limpar a justificativa ao trocar de experimento ou após sucesso.
- Preservar a sequência atual: aprovação é explícita e separada do início da execução. Mensagens de falha continuam visíveis; somente sucesso da API confirma o registro.
- Acrescentar teste focal no gate browser/PostgreSQL existente: sem nota válida não ocorre POST; com nota válida o servidor grava exatamente o texto fornecido e a identidade continua sendo a sessão autenticada.

## Preservações e limites

- Manter rota, `AdminGate` (`admin`, `ti`, `marcelo`), permissões granulares server-side (`analytics.approve`), endpoint, método, esquema de corpo, cabeçalho `Idempotency-Key`, validações, auditoria, banco e isolamento.
- Não alterar regras de aprovação, transições, observações, relatórios, painel do Marcelo, outras páginas UX-PRO-04, CSS compartilhado, servidor ou APIs.
- A justificativa deve orientar a decisão operacional e não solicitar segredo, credencial, dado pessoal ou identificador direto. Não será usada como prova independente de revisão humana.
- Fixtures e capturas do gate são sintéticas; não comprovam uso real nem aceite humano.

## Riscos

- **Aprovação acidental ou sem justificativa específica:** impedir envio até que a pessoa informe texto válido; não preencher valor padrão nem reciclar nota de outro rascunho.
- **Divergência de contrato:** usar o campo e limites já exigidos pelo endpoint; não introduzir campo server-side ou migração.
- **Vazamento de dados na trilha:** explicar que a nota é persistida e orientar a não inserir dados pessoais/segredos; usar apenas texto fictício nos testes.
- **Regressão de alçada:** manter o endpoint como autoridade; teste deve confirmar que a identidade vem da sessão e que a tela não eleva permissões.
- **Alcance visual:** limitar a mudança ao fluxo de aprovação já montado; estilos locais somente se necessários e medidos nos quatro viewports/temas.

## Validações planejadas

1. Commitar este documento antes de editar teste ou tela.
2. Acrescentar o teste focal e executá-lo contra esta `main` para registrar o defeito antes da implementação.
3. Implementar a menor mudança aditiva na tela e executar `npm run test:ux-analytics:pg`, `npm run typecheck`, `npm test`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check` e `git diff --check`.
4. Preservar `next-env.d.ts` e `tsconfig.json` por hash. Registrar qualquer falha ambiental sem pular ou reclassificar testes.
5. Exercitar viewport 320/390/768/1440, tema dia/noite disponível e percurso de teclado no gate Chromium. Separar teste automatizado, inspeção estática de capturas, validação visual manual e aceite humano; não inferir os dois últimos.
6. Registrar antes/depois e limitações em documento de resultado próprio. Abrir PR pequena sobre `main`; não fazer merge sem revisão concluída e checks obrigatórios verdes.


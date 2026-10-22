# UX-PRO-04 — Analytics: justificativa explícita de aprovação

**Data:** 22/10/2026 (continuação iniciada em 21/10)  
**Base:** `main` `66799ec434350445b0d68bad42960d1a01489efd` (merge da PR #290)  
**Escopo registrado antes:** [UX-PRO-04 Analytics — escopo e riscos](UX-PRO-04-ANALYTICS-ESCOPO-ANTES-2026-10-21.md), commit `c75dfd9`.  
**Superfície:** somente a aprovação de rascunho em `/admin/analytics` (`AnalyticsWorkspace`).

## Antes e depois

| Antes na base | Depois nesta fatia |
|---|---|
| O botão de aprovação enviava sempre a frase fixa “Aprovação humana registrada após revisão da hipótese, variantes, métrica e minimização.” | A pessoa operadora escreve a justificativa no detalhe do rascunho; a UI exige pelo menos 10 caracteres não brancos e limita o campo a 1.000. |
| O endpoint já persistia `approval_note`, identidade da sessão e horário canônico, mas a interface não coletava a nota. | A UI envia no mesmo campo `approval_note` o texto escrito pela pessoa, com espaços externos removidos. A tela não preenche mais uma declaração de revisão por ela. |
| Trocar de experimento não tinha justificativa local, pois não havia campo de justificativa. | A nota ainda não enviada é limpa ao trocar de experimento e após sucesso. A nota permanece no formulário se a API recusar a ação, permitindo correção/repetição. |

O antes automatizado reproduziu a lacuna: o gate falhou ao encontrar zero campos rotulados de justificativa, enquanto os outros nove testes da família passaram. A captura do estado anterior está em [`antes/`](ux-pro-04-analytics-evidencias/antes/). Uma primeira tentativa com o Chromium empacotado não encontrou o executável (`ENOENT`); o gate foi repetido com Chrome local pelo parâmetro de ambiente já previsto no teste, sem relaxar asserções.

## Preservação funcional

- Permanecem a rota e o `AdminGate` para `admin`, `ti` e `marcelo`; o servidor continua decidindo `analytics.approve` pela sessão e permissão granular.
- Endpoint, método, corpo (`approval_note`), limites aceitos pelo servidor, `Idempotency-Key`, validação, identidade auditada e regras de aprovação/transição não mudaram. Não houve alteração de servidor, API, esquema, migração ou banco canônico.
- O rascunho ainda exige aprovação explícita e iniciar a execução continua sendo outra ação. “Cancelar” e as demais ações mantêm seus handlers e condições.
- A justificativa fica na trilha canônica. O campo orienta a não inserir dados pessoais, credenciais ou segredos; testes e capturas usam somente valores sintéticos.

## Validação automatizada

| Gate | Resultado |
|---|---:|
| `npm run test:ux-analytics:pg` | **10/10**; PostgreSQL descartável, API HTTP real e Chromium/Chrome local. O teste novo verifica campo obrigatório, nota só de espaços inválida, limpeza ao trocar de experimento, envio do valor digitado, identidade autenticada, persistência canônica e percurso por Tab. |
| `npm run typecheck` | passou |
| `npm test` | **993/993**; zero falhas, skips ou TODOs |
| `npm run build` | passou; **105/105** páginas geradas |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | passou; **100 rotas** |
| `git diff --check` | passou |

O inventário e a matriz vigentes foram regenerados após a inclusão das novas evidências. A alteração de cobertura fica restrita à linha `/admin/analytics` em cada CSV; o inventário continua com 100 rotas.

Após `typecheck`, gate PostgreSQL e `build`, `next-env.d.ts` e `tsconfig.json` foram restaurados e conferidos com os mesmos hashes da base: `18B697C4794F97EDD5AED1537BF1D1882597F545881DFCBA7FC8C659075F11A2` e `2128C956B8C75820BC217C00557346BEFA1E687565D2D8A0BB970FAADB7A8D65`.

## Evidência de tela e teclado

O gate Chromium percorreu o fluxo montado com rascunhos sintéticos criados pela API canônica. Nas larguras 320, 390, 768 e 1440 px, nos temas administrativos claro e escuro, a captura mediu **0 px de overflow horizontal do documento**. O `Tab` moveu o foco da justificativa para o botão de aprovação; o anel computado teve 3 px. As medições e as oito capturas estão em [`depois/resumo.json`](ux-pro-04-analytics-evidencias/depois/resumo.json) e [`depois/`](ux-pro-04-analytics-evidencias/depois/).

As imagens de 320 px/claro, 320 px/escuro, 390 px/claro, 390 px/escuro, 768 px/escuro e 1440 px nos dois temas foram inspecionadas estaticamente quanto à composição, foco e recorte. Isso não é validação manual interativa de uma pessoa usuária. Não houve validação com dados reais, teste de leitor de tela, auditoria WCAG integral, revisão de Marcelo, aceite humano ou homologação de produção.

## Limites desta fatia

O gate confirma o fluxo de aprovação do cliente canônico EXT-11 e a gravação da justificativa/identidade em PostgreSQL temporário. Não confirma decisão de negócio real, veracidade independente do texto escrito, uso em produção nem revisão humana. A tela continua sem formulário de observações reais ou nota de conclusão; esses limites preexistentes foram mantidos.


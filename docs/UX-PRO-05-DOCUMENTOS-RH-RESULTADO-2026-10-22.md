# UX-PRO-05 — devolução de documentos ao funcionário (resultado)

**Base:** `main` `5c369da3eb0f7881757a6a54b3743b5532a4393b` (merge #292).
**Escopo registrado antes:** [UX-PRO-05-DOCUMENTOS-RH-ESCOPO-ANTES-2026-10-22.md](UX-PRO-05-DOCUMENTOS-RH-ESCOPO-ANTES-2026-10-22.md).
**Rotas montadas:** `/admin/funcionarios` → `Documentos`; `/funcionario` → `Docs`.
**Branch:** `ux-pro-05-document-review-20261022`.

## Antes e depois

| Antes | Depois |
|---|---|
| O PATCH de RH já aceitava `status: rejected` e exigia `rejectionReason`, mas a interface RH só oferecia aprovar e baixar. | Para documentos pendentes, a linha oferece campo rotulado para motivo (5–1000 caracteres) e ação “Rejeitar”, chamando o PATCH existente; o botão só habilita com cinco caracteres. A opção não aparece em estados já decididos. Aprovar e baixar permanecem. |
| O servidor persistia `rejection_reason` e já gerava o evento de revisão, mas `/api/employee/home` e `/api/employee/documents` não selecionavam esse campo. | As duas leituras incluem o motivo aditivamente, sem mudar URL, método, escrita ou outros campos. As consultas continuam limitadas ao funcionário da sessão e aos documentos que enviou ou que foram publicados para ele. |
| A aba Docs mostrava estado, metadados e download, sem retorno do RH. O estado inicial `pending` aparecia como token cru `PENDING`. | Quando o documento próprio está rejeitado e tem motivo, a aba mostra “Motivo informado pelo RH”. `pending` agora é apresentado como “Pendente”; os valores canônicos e contratos não mudam. |

## Preservações

- Nenhuma rota, migração, coluna, endpoint, método, permissão, concessão ou papel foi criado ou ampliado.
- A ação RH continua atrás das permissões de leitura/escrita existentes (`employees.read`/`employees.write`), verificadas pelo servidor. Motivo não é aceito como autoria nem como prova de identidade.
- A rejeição reaproveita a transação/registro existente do servidor, com autor e evento em `employee_private_document_access`; o gate verificou a presença do evento.
- O portal do funcionário continua usando a sessão autenticada e o filtro `employee_id` existente. Nenhuma leitura de outro titular foi adicionada; `scope: own` é mantido.
- Aprovação, download privado/auditado, envio e publicação separada seguem disponíveis.
- Nenhum arquivo foi modificado em `next-env.d.ts` ou `tsconfig.json` ao final. SHA-256: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2` e `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`, respectivamente.

## Verificações

- **Inspeção estática:** rotas e abas confirmadas em `EmployeePortal.tsx` e `RhWorkspace.tsx`; as três consultas de documento foram verificadas quanto ao filtro do titular e campos. O PATCH já exigia sessão, concessão e motivo mínimo de cinco caracteres.
- **Teste “antes”:** o novo teste RH falhou porque o campo de motivo ainda não existia. A primeira tentativa do gate também tentou usar um Chromium inexistente em `%TEMP%\chromium` (`ENOENT`); o gate foi executado com o Chrome instalado usando a variável já suportada `UX_HR_BROWSER_EXECUTABLE_PATH`. Nenhum desses resultados foi contado como aprovação.
- **Focal RH:** `npm run test:ux-hr:pg` — 15/15, PostgreSQL descartável e Chrome. Inclui teste da interface de rejeição e verificação do estado/motivo persistidos. Após restringir a ação nova a documentos ainda pendentes, o caso focal foi repetido e passou 1/1. A execução identificou ainda que o teste de falha de leitura podia ser mascarado por uma segunda consulta da montagem; o fixture agora mantém 503 até a ação de repetir, sem enfraquecer a asserção de erro/vazio.
- **Focal portal:** `npm run test:ux-portal:pg` — 25/25, PostgreSQL descartável e Edge instalado. A jornada percorre envio do titular, rejeição no RH, leitura autenticada após recarregar a aba, escopo próprio e evento de auditoria. Após ajustes finais de captura e enquadramento, a execução isolada do mesmo caso passou 1/1.
- **Suite:** `npm test` — 993/993; 0 falhas, 0 ignorados.
- **Typecheck:** `npm run typecheck` — aprovado após correção de escopo de variável durante a revisão local.
- **Build:** `npm run build` — compilação concluída e 105/105 páginas geradas.
- **QA estático:** `node scripts/qa-wave0-static.mjs` — 5/5.
- **Inventário:** `node scripts/ux-pro-00-inventory.mjs --check` — 100/100 rotas; CSV/matriz conferem. Não foram adicionadas rotas.
- **Diff:** `git diff --check` — aprovado; repetir após esta documentação/capturas antes do push.

## Evidências e limites

Capturas e [`resumo.json`](evidencias/ux-pro-05-documentos-rh-2026-10-22/resumo.json) em `docs/evidencias/ux-pro-05-documentos-rh-2026-10-22/`: RH antes e depois da rejeição em 320/390/768/1440 px; portal do titular em quatro larguras; RH e portal em tema noturno a 390 px; cartão recortado do titular para deixar o motivo legível. Os gates mediram overflow do documento, exercitaram foco/teclado no campo de motivo em quatro larguras e foco no link do titular. Os PNGs foram inspecionados nesta sessão; os indicadores do Next de desenvolvimento foram retirados somente das capturas, e a captura recortada do cartão esconde o tablist fixo para enquadrar o conteúdo.

No RH estreito a lista continua sendo uma tabela com rolagem horizontal; a página não transborda, mas a pessoa precisa rolar horizontalmente até as ações. Essa limitação foi observada e registrada; não houve alteração no CSS compartilhado da tabela. O filtro por identidade estática e a resposta `scope: own` foram verificados; o caso novo exercita uma única identidade titular, não um teste adversarial A/B de documentos. Os dados e arquivos foram inteiramente sintéticos.

**Não comprovado:** operação manual por pessoa, revisão visual manual em dispositivo, aceite de Marcelo/RH/funcionário, navegador diferente de Chrome/Edge do gate, leitores de tela, avaliação WCAG integral, upload de arquivos reais ou funcionamento em produção. A inspeção dos PNGs e o teclado automatizado não substituem essas validações.

## Situação de entrega

Esta branch contém a especificação anterior já commitada (`80cc70c`) e a implementação/resultado a serem publicados numa PR pequena baseada em `main`. Não declarar integrada até confirmar review concluída, checks remotos obrigatórios verdes, merge e sincronização de `main`.

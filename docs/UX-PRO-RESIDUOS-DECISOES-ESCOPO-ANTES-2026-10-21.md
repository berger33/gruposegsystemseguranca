# UX-PRO — reconciliação de resíduos e decisões (escopo antes)

**Data:** 21/10/2026  
**Base:** `origin/main` `fb174f93996944c0b11e64553b4dc81c64a90856`  
**PRs abertas na conferência:** nenhuma  
**Objetivo desta fatia:** reconciliar decisões explícitas e estado histórico dos resíduos UX-PRO, sem alterar telas, APIs, permissões, dados ou fluxos.

## Escopo e evidência

Foram cruzados o plano mestre, o cronograma, README, relatório 09E, escopos 09E, relatórios 03/04/05/06/07/08/10, histórico de PRs e branches do GitHub até a #283. A fonte canônica para conclusão de código é o merge na `main`; branches antigas sem PR aberta não significam trabalho novo. Documentos históricos serão mantidos e recebem reconciliação datada, sem apagar afirmações que eram verdadeiras na data original.

## Decisões registradas

1. **ID4 — `setup.uri` / `otpauth`: manter fora da interface.** Esses valores podem conter o segredo de provisionamento MFA. A UI continua sem exibi-los; nenhum contrato ou fluxo de MFA será alterado. A decisão é preventiva e não afirma que houve exposição ou incidente.
2. **E9 — sem defeito atual confirmado.** A ocorrência histórica a 768 px não será corrigida por inferência. O seletor compartilhado atual já usa quebra de texto; uma correção só será proposta se uma rota/component montado reproduzir overflow com viewport e nó registrados.
3. **E3-R2 — observação histórica encerrada sem atribuição causal.** A PR #281 confirma que não houve alteração de timeout, retry, asserção ou workflow. O run de CI permanece uma falha histórica não atribuída; execução isolada verde não prova causa nem estabilidade contínua. Só reabrir se logs completos identificarem o caso 07D-1.
4. **09E-8 — limitação de captura, não defeito de produto confirmado.** Diferenças de pintura em `prefers-color-scheme` e respostas de rota de aceite sintético permanecem metadados/limites do método. Não criar tema público nem mudar rota/captura para ocultar ruído.
5. **10A/10B/10C — conclusão delimitada.** 10A é auditoria estática; 10B foi integrada na #265 com evidência automatizada específica; 10C reconcilia docs e matriz. Nenhuma delas equivale a revisão manual global, aceite humano, WCAG integral ou homologação.

## Itens já integrados, fora de reimplementação

- E2 e E2-C1: #271/#272, verificação #273.
- E3 e E3-R1: #275/#276/#278/#279; E3-R2 está encerrada como observação histórica não atribuída, sem mudança de timeout/retry/asserção.
- E5 #269, E8 #268, E6 #262, E6-C1 #270, C11 de fornecedores #267.
- UX-PRO-07F–07M: merges #235–#243 confirmados pela reconciliação #236–#243 e atualizada em #280.
- UX-PRO-07E-2-ALVO: #281 corrigiu `fin11-retry` e `fin10-retry` para alvos 44×173 px nos quatro viewports e temas claro/escuro, com gate de navegador/PostgreSQL. Os dois hits de dados sem correção citados pelo relatório são distintos do defeito de alvo e permanecem fora da fila de UI. Não reabrir a fatia de toque.
- UX-PRO-09E PU5: #283, merge `fb174f9`.
- UX-PRO-10B #265 e documentação 10C #266.

## Resíduos que continuam autorizados para implementação, em PRs separadas

- **PU4:** ampliar a coleta de contraste para conteúdo textual de todos os estados efetivamente exercitados, incluindo tags e seletores omitidos. A etapa deve ser isolada, preservar a saída histórica de outros stages e registrar cenário/estado/fundo não resolvido. Ausência de amostra continua `não medido`.
- **PU6:** medir novamente a prévia de Layout 09 em navegador e viewport atuais; só mudar CSS se a razão de contraste for reproduzida no componente montado. Não transferir a leitura para as 14 rotas públicas.
- **09E-7:** criar cobertura opt-in de overflow por execução de texto nas etapas/rotas explicitamente incluídas, sem tornar o probe obrigatório nem alterar outputs existentes de outras etapas.
- **UX-PRO-03, 04, 05 e 06:** reauditar componentes montados na `main` e entregar somente superfícies com lacuna comprovada, uma tela/família coerente por PR. Em particular, UX-PRO-04 deve separar painel, pendências, analytics e relatórios; UX-PRO-05 deve separar portal do funcionário e fluxos RH; UX-PRO-06 deve reconciliar os entregues antes de escolher qualquer complemento.
- **ID3:** revisar as dez páginas restantes do portal do cliente para estados de leitura `workspaceFetch`, preservando isolamento conta A/B e verificando endpoint por endpoint antes de alterar.

## Fora desta fatia e preservações

Nenhum arquivo de produto, CSS, API, RBAC, banco, auditoria, dados, navegação ou gerador de inventário será alterado aqui. A decisão ID4 é somente documental. As fatias de código acima exigem escopo próprio, teste RED focal e evidência antes/depois; nenhuma é implicitamente concluída por este registro.

## Validação local

- API do GitHub: PRs #267–#283 reconciliadas; sem PR aberta antes desta branch. #281 confirma os dois `data-testid` e o relatório registra 16 medidas (2 botões × 4 larguras × 2 temas).
- `git diff --check`: aprovado.
- `node scripts/qa-wave0-static.mjs`: 5/5 aprovado.
- `node scripts/ux-pro-00-inventory.mjs --check`: 100 rotas, CSVs conferem.
- `npm run typecheck`: exit 0.
- `npm run build`: concluído, 105/105 páginas.
- `npm test`: 973/976 aprovados; 3 falharam com `EPERM` ao criar symlinks nos testes `qa-backup-coverage-inventory`, `qa-cli-v2-local-provider` e `qa-cli-v2-transfer`. Nenhum teste foi pulado, alterado ou declarado aprovado. A validação Linux na CI é necessária antes de abrir PR.
- Hashes após typecheck/build: `next-env.d.ts` SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` SHA-256 `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`; ambos sem diff.
- Sem validação manual ou aceite humano.

# UX-PRO-06 — escopo, riscos e validações de `/admin/comercial`

**Data:** 13/10/2026
**Base confirmada:** `main` `267fb55f183ec6ec1252d2d920c4627d5d7f5b12` (merge da PR #213), conferida por `git fetch origin main` antes de qualquer edição. Sem PR aberta no repositório no momento da confirmação; PRs #210, #211, #212 e #213 estão `MERGED`.
**Status deste documento:** registro **anterior à implementação**, commitado isoladamente antes de tocar em tela, teste ou inventário.

## 1. Recorte escolhido

Uma única tela da família CRM/comercial interna: **`/admin/comercial`** ("Vistoria, orçamento, proposta e contrato"). A escolha segue a recomendação do proprietário na mensagem desta sessão e a matriz de 13/10, que registra para esta rota "sem componente UI compartilhado detectado", ausência de captura em 320/768 px, tema noturno sem captura, percurso de teclado não verificado e estados não exercitados em navegador.

**Dentro do recorte**

- `src/app/admin/comercial/ComercialWorkspace.tsx` — casca em etapas (8 etapas UX-03B), cabeçalho, trilha e navegação entre etapas.
- `src/app/admin/comercial/CommercialHistory.tsx` — bloco "Histórico de versões comerciais" (estilos inline e estados da consulta). É o componente legado próprio desta rota.
- Um módulo CSS local (`src/app/admin/comercial/Comercial.module.css`), criado apenas se a medição justificar, para os ajustes de layout e tema que a tela precisar, sem depender de alteração em módulo compartilhado.
- Testes do gate `test:ux-crm:pg` que exercitam esta rota, capturas próprias, `resumo.json` e as linhas de `/admin/comercial` nos dois CSVs de 13/10 (regeneradas pelo gerador, conferindo que só essa linha muda).

**Fora do recorte, deliberadamente**

- `src/app/admin/ti/*` (CatalogClient, EquipmentClient, InspectionClient, LaborBudgetClient, TechnicalBudgetClient, CostParameterClient, PriceScenarioClient, DiscountClient, ProposalClient, ProposalDeliveryClient, ProposalAcceptanceClient, ContractClient, ReportClient, CommissionClient, CommercialLibraryClient, PartnershipClient). Eles são **componentes de domínio montados também por `/admin/ti`**; alterá-los mudaria outra tela sem autorização expressa. Ver risco R3.
- `src/components/ui/UiWorkspace.module.css` — compartilhado por 32 arquivos; **não será alterado sem medição** (regra da fatia anterior, #213).
- `/admin/contratos` e `/admin/contratos/[id]` — alternativa descartada nesta fatia; permanecem como próxima candidata.
- `/admin/clientes` (gestão interna de contas, vínculos, grants, convites) e o portal `/cliente/app/*` — famílias distintas.
- `/admin/crm`, `/admin/leads`, `/admin/carteira` — já entregues (#210–#213), não reabertos.
- Menu (`ADMIN_MODULES` em `AdminGate.tsx`) — `/admin/comercial` não está no menu hoje e **continua sem entrada no menu**; é alcançada pelas trilhas de `/admin/carteira`, `/admin/contratos`, `/admin/leads` e `/admin/publicacao`. Incluir a rota no menu seria mudança de navegação fora do pedido.
- APIs, papéis, permissões, auditoria, idempotência, migrações e dados canônicos — nenhum tocado.

## 2. Comportamento que precisa permanecer (inventariado no código)

- `AdminGate allowedRoles={["comercial","marcelo","admin","ti"]}` em `page.tsx`. A autorização real continua nas APIs (`readSession`/`requireRole`).
- As 8 etapas, com seus rótulos, perguntas e "próximo passo" (`TABS`), e o botão de cada etapa com `aria-pressed`.
- Cada etapa monta exatamente os componentes atuais (vistoria; orçamentos técnico/MO/custos; preço e desconto; propostas, envio e aceite; contrato; catálogo e equipamentos; relatórios e comissões com histórico; biblioteca e parcerias). Nenhum é removido, reordenado ou ocultado.
- Links para `/admin/crm`, `/admin/leads`, `/admin/carteira` e `/admin/contratos` no cabeçalho e na etapa Contrato.
- Consulta de histórico `GET /api/crm/commercial-versions?type=…&id=…` com os mesmos quatro tipos (meta, regra de comissão, comissão, biblioteca), mesmo corpo de resposta e mesma exibição de campos (exclui `id`, `created_by_id`, `responsible_id`, `approved_by`, `file_url`).
- Textos de aviso já existentes: "nenhuma comissão é paga automaticamente", "Comissão apurada não é comissão paga".
- Os componentes `ti/*` continuam sendo a única fonte de comportamento das etapas.

## 3. Riscos identificados

| # | Risco | Como será tratado |
|---|---|---|
| R1 | **Falha que apaga dados** na própria casca (ex.: consulta de histórico que limpa o resultado anterior ao falhar). | Medido antes; a falha preserva o último histórico lido, com `role="alert"`, hora da última leitura concluída e repetição. |
| R2 | **Autorização mascarada** por dado preservado ou por texto genérico. | Negativa (401/403) segue fail-closed no servidor e a tela não oferece repetição nem mantém dado antigo nesse caso. Teste de contrato HTTP cobre 401, 403 e 400. |
| R3 | **Componentes `ti/*` compartilhados** com `/admin/ti`: alguns zeram dados em falha (`CatalogClient` faz `setServices([])`; `ReportClient` faz `setReports(null)`), e nem todos têm estado vazio/erro honestos. | **Não alterados nesta fatia.** Os testes de falha ficam restritos à casca e ao histórico. O defeito de domínio é registrado como limitação e candidato a fatia própria com decisão do proprietário, porque mudaria também `/admin/ti`. |
| R4 | **Recorte divergente**: texto dizendo "os números aparecem junto…" ou resultado antigo sem rótulo de desatualização. | Textos da casca revistos apenas onde mentem; nada de número novo é exibido. |
| R5 | **Regressão em módulo compartilhado**: `UiWorkspace.module.css` (32 consumidores). | Não é alterado. Ajustes ficam em módulo local; qualquer necessidade de tocar no compartilhado exige medição e registro próprio. |
| R6 | **Tema noturno**: as etapas carregam os componentes `ti/*` com cores próprias; a casca usa classes compartilhadas. | Medido por CSS calculado no tema noturno real do envelope (`data-admin-theme-toggle`), para a casca e o histórico. Componentes `ti/*` são registrados como não medidos onde não forem cobertos. |
| R7 | **Arquivos gerados**: `next-env.d.ts` e `tsconfig.json` alterados pelo `next build`/gates. | Hashes registrados antes (`18b697c4…` e `2128c956…`) e conferidos após cada execução; restaurados pelo gate. |
| R8 | **Inventário divergente**: alterar mais de uma linha do CSV ou mudar o gerador. | Gerador não é alterado; apenas o par de CSVs de 13/10 é regenerado e a conferência por coluna deve mostrar que só `/admin/comercial` mudou. |
| R9 | **Evidência sintética vendida como validação real**: captura e navegador automatizados não são aceite humano. | Massa 100% fictícia criada pelas APIs; sem credencial, dado pessoal ou URL efêmera; documentado como não-aceite. |
| R10 | **Workflow não dispara**: `ux-crm-delivery.yml` só observa `src/app/admin/comercial/**` e outros caminhos; `ti/*` não está nele. | Mudanças ficam em `src/app/admin/comercial/**`, que já dispara o workflow. Se o teste tocar `tests/` já listado, dispara normalmente. |

## 4. Validações planejadas

**Antes (provas de defeito, executadas contra `main` em checkout descartável limpo, antes de qualquer edição de tela):**

1. Testes novos do gate `npm run test:ux-crm:pg` escritos primeiro, com `UX_CRM_TEST_PATTERN` apontando para os casos novos, rodados contra `267fb55`. Devem **falhar** onde o defeito existe. Os casos esperados como falhos são os de transbordo em 320 px, tema noturno da casca, falha do histórico e foco/estados do histórico.
2. Capturas "antes" em `docs/ux-pro-06-comercial-evidencias/antes/`.

**Depois (na branch da fatia):**

- `npm run typecheck`
- `npm test` (inclui `tests/ux-crm-vocabulary.test.mjs` e `tests/ux-pro-00-inventory.test.mjs`)
- `npm run build`
- `node scripts/qa-wave0-static.mjs`
- `node scripts/ux-pro-00-inventory.mjs --check`
- `npm run test:ux-crm:pg` — gate completo da família (todos os casos pré-existentes + novos).
- `npm run test:l04-delivery:pg` — o gate L04 também toca `/admin/comercial` (`tests/l04-delivery.integration.test.mjs`).
- Conferência por hash de `next-env.d.ts` e `tsconfig.json` após cada gate.
- Evidências próprias em 320, 390, 768 e 1440 px, dia e noite, e percurso de teclado, com `resumo.json` legível por máquina.

## 5. Critério de conclusão e limites conhecidos

- Só há merge com **todos os checks obrigatórios verdes**, sem conflito, base `main` confirmada e revisão concluída. Check cancelado, pulado ou em fila não conta como aprovado.
- Não há aceite humano de comercial, Marcelo ou Andreia; nenhum registro de aceite será criado.
- Os componentes `ti/*` das etapas não são validados em 320/768 px nem no tema noturno por esta fatia, salvo onde a casca os envolve; essa lacuna é declarada no relatório da PR.
- Não há alteração de Windows, de HTTPS hospedado nem de banco do operador.

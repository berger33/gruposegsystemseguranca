# UX-PRO-06 — escopo, riscos e validações de `/admin/contratos` (lista)

**Data:** 14/10/2026
**Status deste documento:** registro **anterior à implementação**, commitado isoladamente antes de tocar em tela, teste ou inventário.

## 0. Confirmação de base (divergência registrada e reconciliada)

O pedido desta sessão esperava a `main` em `267fb55f183ec6ec1252d2d920c4627d5d7f5b12` (merge da PR #213). A conferência por `git fetch origin` + GitHub API antes de qualquer edição mostrou:

- `267fb55f183ec6ec1252d2d920c4627d5d7f5b12` **é** o merge commit da PR #213 (`gh pr view 213`), mas **não é mais a ponta da `main`**;
- a `main` atual é `259ee43c38deeb35fb29a2c622f2ed3e6f6a6712`, merge da **PR #214** ("estados honestos do histórico e contraste noturno em `/admin/comercial`", mergeada em 13/10/2026, todos os checks verdes, incluindo `ux-crm-postgres-browser`);
- não há PR aberta no repositório; as execuções mais recentes sobre a `main` (`QA baseline`, backup/restore) estão `success`.

Consequência: a tela recomendada no pedido (`/admin/comercial`) **já foi entregue pela PR #214** e não será reaberta nem reimplementada — o mesmo vale para #210, #211, #212 e #213 (`/admin/leads`, `/admin/crm`, `/admin/carteira`). Aplica-se, portanto, a **alternativa indicada no próprio pedido**: a família de contratos. O relatório da PR #214 também registra "`/admin/contratos` (próxima candidata)".

## 1. Recorte escolhido

Uma única tela da família CRM/comercial interna: **`/admin/contratos`** — "Contratos e implantação" (lista da carteira contratual, `src/app/admin/contratos/ContractWorkspace.tsx`).

**Por que só a lista, e não também `/admin/contratos/[id]`:** o pedido exige "uma única tela" e "uma PR pequena". O detalhe (`ContractWorkflowClient.tsx`, 814 linhas, oito leituras, seis abas, mutações de ciclo de vida) é uma superfície distinta — a matriz de 13/10 inclusive o trata em linha própria, sem nenhuma captura. Ele fica como **fatia seguinte** (ver prompt de retomada ao final da entrega), sem nenhuma alteração nesta PR.

**Dentro do recorte**

- `src/app/admin/contratos/ContractWorkspace.tsx` — as três leituras independentes (empresas, propostas aceitas, contratos) e os dois formulários de criação existentes;
- um módulo CSS local novo (`src/app/admin/contratos/Contratos.module.css`), apenas se a medição justificar, nos moldes de `Carteira.module.css` (#213) — nunca o módulo compartilhado sem medição;
- testes novos no gate `test:ux-contract:pg` (`tests/ux-contract-workspace.integration.test.mjs`) que exercitam esta rota;
- capturas próprias em `docs/ux-pro-06-contratos-evidencias/` com `resumo.json`, e a regeneração do par vigente de CSVs de 13/10 conferindo que **só a linha `/admin/contratos`** muda.

**Fora do recorte, deliberadamente**

- `/admin/contratos/[id]` — fatia seguinte; nenhum arquivo dele é tocado (inclusive `src/lib/contract-request.ts` e `src/lib/contract-vocabulary.mjs`, compartilhados com o detalhe, **não são alterados**);
- `/admin/comercial`, `/admin/crm`, `/admin/leads`, `/admin/carteira` — já entregues (#210–#214), não reabertos;
- `/admin/clientes` e o portal `/cliente/app/*` — famílias distintas, com sessão/grant próprios;
- `src/components/ui/UiWorkspace.module.css` — compartilhado por dezenas de arquivos; **não será alterado sem medição** (regra das fatias #212/#213/#214);
- APIs, papéis, permissões, auditoria, idempotência (`request_key`), migrações e dados canônicos — nenhum tocado.

## 2. Comportamento que precisa permanecer (inventariado no código)

- `AdminGate allowedRoles={["marcelo","admin","comercial"]}` em `page.tsx`; a autorização real continua nas APIs.
- As três leituras, com as mesmas URLs: `GET /api/crm/companies?type=client`, `GET /api/crm/proposals?status=aceita&limit=100`, `GET /api/crm/contracts`.
- As duas criações: `POST /api/crm/contracts` com `source: "proposal"` (idempotente por proposta/versão) e `source: "manual"` com `request_key` `crypto.randomUUID()`, mesmos campos e mesmas regras do servidor.
- Os títulos "Contratos e implantação" e "Cadastro manual identificado" — contrato do gate herdado `tests/l05-delivery.integration.test.mjs`, preservados exatamente.
- Estados honestos já existentes (UX-07): falha inicial de uma leitura não vira lista vazia (`UiState` error/denied com repetição), vazio legítimo declarado ("A leitura funcionou…"), independência entre as três leituras, vocabulário em português com código canônico só no rodapé.
- Links de navegação para `/admin/comercial` e `/admin/crm`, e o link "Abrir composição e implantação" por contrato.
- Nenhum `style` inline novo; alvos e foco existentes preservados.

## 3. Defeitos a medir (hipóteses verificáveis contra a `main`)

Comparando com o padrão já entregue no funil (#212), na carteira (#213) e no comercial (#214) — falha preserva dados com `role="alert"` + hora + repetição; `role="status"` na releitura; negativa fail-closed; estados honestos com `UiState` — a lista de contratos apresenta, por leitura de código, os mesmos defeitos que aquelas telas tinham:

| # | Defeito (hipótese) | Onde |
|---|---|---|
| D1 | **Falha em releitura apaga o que já foi lido**: o caminho de falha das três leituras faz `itens: []`, trocando o conteúdo pela tela de erro. | `carregarEmpresas/Propostas/Contratos` |
| D2 | **Releitura em curso esconde o conteúdo**: com dados já lidos, `carregando` substitui lista/formulário pelo bloco "Lendo…" em tela cheia. | render de propostas e contratos |
| D3 | **Sem distinção entre "desatualizado" e "nunca lido"**: não há hora da última leitura concluída nem faixa `role="alert"` de dados preservados. | idem |
| D4 | Risco a **não** introduzir: negativa (401/403) mascarada por dado preservado. Hoje ela falha fechada (estado negado, sem dado); a correção de D1–D3 precisa manter isso. | idem |
| D5 | Cobertura visual incompleta na matriz de 13/10: só 1440/390 px, sem 320/768 px, tema noturno sem captura, teclado não verificado, estados não exercitados em navegador. | matriz `UX-PRO-00` |

## 4. Riscos identificados

| # | Risco | Como será tratado |
|---|---|---|
| R1 | **Falha que apaga dados** (D1/D2). | Medido antes; a falha transitória preserva os itens lidos, com faixa `role="alert"`, hora da última leitura concluída (relógio do navegador no instante do sucesso — nada estimado nem gravado) e "Tentar novamente"; releitura em curso mostra `role="status"` sem esconder o conteúdo. |
| R2 | **Autorização mascarada** por dado preservado. | Falha `denied`/`auth` continua fail-closed: substitui o conteúdo pelo estado negado completo, descarta os itens e não oferece repetição da mesma chamada. Teste de navegador cobre a negativa **depois** de uma leitura concluída. |
| R3 | **Recorte divergente**: dado antigo exibido como se fosse o recorte atual. | A faixa declara que itens/contagem são da última leitura concluída e podem estar desatualizados; nada de número novo é exibido. |
| R4 | **Módulos compartilhados**: `UiWorkspace.module.css` (dezenas de consumidores), `contract-request.ts`/`contract-vocabulary.mjs` (compartilhados com `/admin/contratos/[id]`). | Nenhum dos três é alterado. Ajustes ficam em módulo CSS local da própria tela; necessidade de tocar em compartilhado exige medição e registro próprios — e, sem eles, a parte correspondente para. |
| R5 | **Arquivos gerados**: `next-env.d.ts` e `tsconfig.json` alterados por build/gates. | Hashes do baseline registrados antes (`18b697c4…` e `2128c956…`, idênticos aos da fatia #214) e conferidos após cada execução; restaurados se mudarem. |
| R6 | **Inventário divergente**: alterar mais de uma linha do CSV ou o gerador. | Gerador não é alterado; o par de CSVs de 13/10 é regenerado e a conferência por coluna deve mostrar que só `/admin/contratos` mudou. |
| R7 | **Evidência sintética** vendida como validação real. | Massa 100% fictícia criada pelas próprias APIs, sessão de staff provisionada pelo gate; sem credencial, dado pessoal ou URL efêmera; documentado como não-aceite humano. |
| R8 | **Workflow não dispara**: `ux-contract-delivery.yml` observa `src/app/admin/contratos/**`, testes e scripts da família. | Mudanças restritas a esses caminhos; conferir no PR que `ux-contract-postgres-browser` foi acionado. |
| R9 | **Gate herdado L05** depende dos títulos e fluxos desta tela. | `npm run test:l05-delivery:pg` entra nas validações; títulos preservados exatamente. (`test:l04-delivery:pg` não exercita contratos — conferido por busca no teste — e por isso não é gate desta fatia.) |
| R10 | **Intermitência de navegador** (Chromium empacotado) confundida com regressão. | Padrão dos gates existentes (`comNavegador` só repete crash, nunca asserção); qualquer falha de asserção é tratada como vermelha de verdade. |

## 5. Validações planejadas

**Antes (provas de defeito, contra a `main` sem edição de tela):**

1. Testes novos do gate escritos **primeiro** em `tests/ux-contract-workspace.integration.test.mjs`, copiados para um worktree descartável de checkout limpo da `main` (`259ee43`), executados com `UX_CONTRACT_TEST_PATTERN` apontando para os casos novos de `/admin/contratos`. Devem **falhar** onde D1–D3 existem e **passar** onde o comportamento já está correto (preservações e a negativa fail-closed de D4).
2. Capturas/medições "antes" guardadas fora do `resumo.json` vigente.

**Depois (na branch da fatia):**

- `npm run typecheck`
- `npm test` (inclui `tests/ux-contract-vocabulary.test.mjs` e `tests/ux-pro-00-inventory.test.mjs`)
- `npm run build`
- `node scripts/qa-wave0-static.mjs`
- `node scripts/ux-pro-00-inventory.mjs --check`
- `npm run test:ux-contract:pg` — gate completo da família (pré-existentes + novos)
- `npm run test:l05-delivery:pg` — gate herdado que exercita esta tela
- conferência por hash de `next-env.d.ts` e `tsconfig.json` após cada gate
- evidências próprias em 320, 390, 768 e 1440 px, dia e noite, e percurso de teclado, com `resumo.json` legível por máquina

## 6. Critério de conclusão e limites conhecidos

- Só há merge com **todos os checks obrigatórios verdes**, sem conflito, base `main` confirmada e revisão concluída. Check cancelado, pulado ou em fila não conta como aprovado. Se qualquer check ficar vermelho ou houver dúvida de regressão, a fatia **não avança**: entrega-se o motivo verificável e o prompt de retomada desta mesma fatia.
- Não há aceite humano de Marcelo, Andreia ou comercial; nenhum registro de aceite será criado.
- `/admin/contratos/[id]` não é medido nem alterado aqui; sua ausência total de capturas na matriz permanece como lacuna declarada para a fatia seguinte.
- Sem validação em Windows, HTTPS hospedado ou banco do operador.

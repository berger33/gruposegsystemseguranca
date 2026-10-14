# UX-PRO-06 — escopo, riscos e validações de `/admin/contratos/[id]` (detalhe)

**Data:** 14/10/2026
**Status deste documento:** registro **anterior à implementação**, commitado isoladamente antes de tocar em tela, teste ou inventário.

## 0. Confirmação de base (divergência registrada e reconciliada)

O pedido desta sessão esperava a `main` em `267fb55f183ec6ec1252d2d920c4627d5d7f5b12` (merge da PR #213). A conferência por `git fetch origin --prune` + GitHub API, antes de qualquer edição, mostrou:

- `267fb55f183ec6ec1252d2d920c4627d5d7f5b12` **é** o merge commit da PR #213 ("UX-PRO-06: preservar a carteira lida na falha de atualização (/admin/carteira)", mergeada em 13/10/2026 22:33Z) — confirmado por `gh pr view 213`;
- **não é mais a ponta da `main`**. A ponta vigente é `f066768dec841bf6f1e2cb6ce54c96cab1044b4f`, merge da **PR #216** ("UX-PRO-06: preservar contratos lidos na falha de releitura (/admin/contratos)", mergeada em 14/10/2026 01:17Z). Entre a base esperada e a ponta atual entraram a **PR #214** ("estados honestos do histórico e contraste noturno em `/admin/comercial`", merge `259ee43c38deeb35fb29a2c622f2ed3e6f6a6712`) e a própria #216;
- checks na ponta da `main` (`f066768`): `static-and-smoke` **success** e `backup-restore-postgres` **success** — os dois únicos workflows cujos filtros de caminho foram acionados por aquelas PRs. Nenhum check cancelado, pulado ou em fila;
- **PR aberta no repositório: apenas a #215** ("UX-PRO-06: estados de leitura da lista de contratos (/admin/contratos)"), com *todos* os checks verdes mas `mergeable: CONFLICTING` (`mergeStateStatus: DIRTY`): ela ficou obsoleta porque a #216 entregou o mesmo recorte na `main`. **A #215 não é reaberta, não é mesclada e não é fechada por esta fatia** — a decisão sobre ela é do proprietário. Ela não bloqueia este trabalho.

Consequências para o recorte:

- a tela recomendada no pedido, **`/admin/comercial`, já foi entregue pela PR #214**;
- a lista **`/admin/contratos` já foi entregue pela PR #216**;
- as PRs #210, #211, #212 e #213 (`/admin/leads`, `/admin/crm`, `/admin/carteira`) também estão entregues e **não são reabertas nem reimplementadas**;
- aplica-se, portanto, a **segunda metade da alternativa indicada no próprio pedido**: **`/admin/contratos/[id]`**. Ela é, além disso, a fatia seguinte declarada de forma explícita em dois lugares da `main`: no `README.md` ("O detalhe `/admin/contratos/[id]` é a fatia seguinte") e no documento de estados da #216 ("É a fatia seguinte recomendada"). A matriz de 13/10 registra para essa rota `sem captura; 320/390/768/1440 px nao verificados`, `marcadores de teclado no codigo; nao verificado em navegador` e `estados nao exercitados em navegador` — exatamente as lacunas que a #216 deixou apontadas.

## 1. Recorte escolhido

**Uma única tela:** `/admin/contratos/[id]` — o detalhe do contrato ("ciclo de vida, composição, alertas, obrigações, implantação, fiscalização, diário e encerramento"), implementado em `src/app/admin/contratos/[id]/ContractWorkflowClient.tsx` (814 linhas) sob o `page.tsx` da mesma pasta.

**Por que é uma fatia coerente e pequena:** é uma rota, um componente cliente e um módulo CSS local novo. As oito leituras e as seis abas já existem e não mudam de contrato; a mudança é de estado de leitura e de apresentação.

**Dentro do recorte**

- `src/app/admin/contratos/[id]/ContractWorkflowClient.tsx` — o modelo de estado das oito leituras independentes e a apresentação do resultado de cada uma;
- um módulo CSS local **novo** (`src/app/admin/contratos/[id]/DetalheContrato.module.css`), nos moldes de `Contratos.module.css` (#216) e `Carteira.module.css` (#213) — apenas as duas classes de estado que esta tela usa, com os mesmos tokens de aviso;
- testes novos no gate **`test:ux-contract:pg`** (`tests/ux-contract-workspace.integration.test.mjs`), que já é o gate desta rota;
- capturas próprias em `docs/ux-pro-06-contrato-detalhe-evidencias/` com `resumo.json`, e regeneração do par vigente de CSVs de 13/10 conferindo que **só a linha `/admin/contratos/[id]`** muda.

**Fora do recorte, deliberadamente**

- `/admin/contratos` (lista) — entregue na #216, não reaberta;
- `/admin/comercial` (#214), `/admin/crm` (#212), `/admin/leads` (#210/#211), `/admin/carteira` (#213) — entregues, não reabertos;
- `/admin/clientes` (gestão interna de contas, vínculos, grants, convites) — família distinta, com risco próprio de escopo;
- o portal autenticado do cliente (`/cliente/app/*`) — área separada, com sessão, grant e escopo próprios;
- `src/components/ui/UiWorkspace.module.css` — compartilhado por dezenas de arquivos; **não será alterado sem medição** (regra das fatias #212/#213/#214/#216). Se a medição exigir tocá-lo, a parte correspondente para e o motivo é registrado;
- `src/lib/contract-request.ts` e `src/lib/contract-vocabulary.mjs` — compartilhados com a lista e com as APIs; **não são alterados**;
- APIs, papéis, permissões, auditoria, idempotência (`request_key`), migrações, transições de ciclo de vida e dados canônicos — nenhum tocado. Nenhum `POST`/`PATCH` muda de URL, método, corpo ou cabeçalho;
- as seis abas, os formulários de escrita e o comportamento de `tablist` (roving tabindex, ←/→/Home/End) — preservados exatamente;
- a PR #215 — não é tocada (ver §0).

**Fronteira declarada:** esta fatia **não** conclui a UX-PRO-06. Ela cobre a tela de detalhe de contratos da família CRM/comercial interna.

## 2. Comportamento que precisa permanecer (inventariado no código antes de editar)

Levantado lendo `ContractWorkflowClient.tsx`, `page.tsx`, `contract-vocabulary.mjs` e os gates antes de qualquer edição:

- `AdminGate allowedRoles={["marcelo","admin","comercial"]}` em `page.tsx` — papéis e sessão inalterados; **a autorização real continua sendo decidida no servidor**, a cada leitura e a cada escrita;
- as oito leituras, com as mesmas URLs: `GET /api/crm/contracts/{id}`, `…/status`, `…/implantation`, `…/alert-rules`, `…/document-obligations`, `…/closure`, `…/fiscal`, `…/management-diary`;
- as escritas, com as mesmas URLs, métodos e corpos: `POST …/status`, `POST …/responsibles`, `POST …/posts`, `POST …/sla`, `POST …/alert-rules`, `POST …/alert-rules/{ruleId}/run`, `POST …/document-obligations`, `POST …/implantation/blocks`, `PATCH …/implantation/steps/{stepId}`, `POST …/fiscal/dossiers`, `POST …/management-diary`, `POST …/closure`;
- a **independência das oito leituras** (`Promise.allSettled`): a falha de uma não derruba as outras sete — defeito corrigido na UX-07 e coberto pelo gate;
- o **fechamento de autorização** já existente: falha `denied`/`auth` substitui o conteúdo pelo estado negado, sem dado preservado e sem oferecer repetir a mesma chamada;
- os `data-testid` exercitados pelo gate: `contract-detail`, `contract-detail-error`, `contract-status-error`, `contract-composition-error`, `contract-alerts-error`, `contract-obligations-error`, `contract-implantation-error`, `contract-fiscal-error`, `contract-diary-error`, `contract-closure-error`, `contract-lifecycle`, `contract-composition`, `contract-alerts`, `contract-implantation`, `contract-fiscal`, `contract-closure`, `contract-implantation-steps`, `contract-alert-rules`, `contract-obligations`, `contract-dossiers`, `contract-diary`, `contract-status-history`, `contract-closure-steps`, `contract-next-status`, `contract-tab-*`, `contract-notice`, `contract-write-error`;
- a **primeira `<p>` do `main[data-testid="contract-detail"]`** é o `lede` do cabeçalho (o gate de vocabulário lê `locator('p').first()`), e o `<h1>` traz o título do contrato;
- os estados honestos já existentes (UX-07): falha inicial não vira zero nem lista vazia; vazio legítimo é declarado ("A leitura funcionou e …"); `UiState` com repetição quando o erro permite;
- o vocabulário em português (`contractStatusLabel`, `stepStatusLabel`, `shortDate` em pt-BR, código canônico só no rodapé) e nenhum `style` inline;
- o texto de acessibilidade das abas (`role="tablist"/"tab"/"tabpanel"`, `aria-controls`, `aria-selected`, `tabIndex` móvel);
- alvos de toque ≥ 44 px dos controles, por token compartilhado.

## 3. Defeitos a medir (hipóteses verificáveis contra a `main`)

Comparando com o padrão já entregue no funil (#212), na carteira (#213), no comercial (#214) e na lista de contratos (#216) — **falha preserva dados com `role="alert"` + hora + repetição; `role="status"` na releitura; negativa fail-closed; estados honestos com `UiState`** — o detalhe apresenta, por leitura de código, os mesmos defeitos que aquelas telas tinham:

| # | Defeito (hipótese) | Onde |
|---|---|---|
| D1 | **Falha em releitura apaga o que já foi lido.** A função `ler()` começa toda leitura com `aplicar({ dado: null, carregando: true, erro: null })` e, na falha, aplica `{ dado: null, … erro }`. Um 503 transitório numa releitura descarta o contrato já lido — nas **oito** leituras. | `ler()` / `ContractWorkflowClient.tsx` |
| D2 | **Releitura em curso esconde o conteúdo.** Com `carregando` verdadeiro, o painel troca o conteúdo pelo bloco `UiState variant="loading"` em tela cheia, mesmo já havendo dado lido. O cabeçalho é pior: `lendoCabecalho = detalhe.carregando` faz o `<h1>` e a vigência sumirem em **toda** releitura do detalhe. | render dos oito recursos e `lendoCabecalho` |
| D3 | **Sem distinção entre "possivelmente desatualizado" e "nunca houve leitura".** Não há hora da última leitura concluída, nem faixa `role="alert"` de dados preservados, nem repetição dentro do aviso. | idem |
| D4 | **Risco a NÃO introduzir:** negativa (401/403) mascarada por dado preservado. Hoje a negativa falha fechada (estado negado, sem dado); a correção de D1–D3 precisa manter isso. | `Falha` / `resolverLeitura` |
| D5 | **Zero apresentado durante a leitura.** Na aba "Composição" o painel lê `detalhe.dado?.items?.length ?? 0` e mostra "Itens 0 / Unidades 0 / Responsáveis 0" **enquanto a leitura ainda está em curso** — um zero que não foi medido. | aba Composição |

## 4. Riscos identificados

| # | Risco | Como será tratado |
|---|---|---|
| R1 | **Falha que apaga dados** (D1/D2). | Medido antes, em worktree descartável limpo da `main`. A falha transitória preserva os dados lidos, com faixa `role="alert"` (`data-testid="*-desatualizada"`), hora da última leitura concluída (relógio do navegador no instante do sucesso — nada estimado nem gravado) e "Tentar novamente"; a releitura em curso mostra `role="status"` (`data-testid="*-atualizando"`) sem esconder o conteúdo. |
| R2 | **Autorização mascarada** por dado preservado (D4). | Falha `denied`/`auth` continua fail-closed: descarta o dado, substitui o conteúdo pelo estado negado completo e **não** oferece repetir a mesma chamada. Teste de navegador exercita a negativa **depois** de uma leitura concluída. |
| R3 | **Recorte divergente**: dado antigo exibido como se fosse recém-lido. | A faixa declara que os dados são "da última leitura concluída", cita a hora e diz que podem estar desatualizados; nenhum número novo é inventado. |
| R4 | **Módulos compartilhados.** `UiWorkspace.module.css` (dezenas de consumidores), `contract-request.ts` e `contract-vocabulary.mjs` (compartilhados com a lista e com as APIs). | Nenhum dos três é alterado. Os ajustes ficam em módulo CSS local da própria pasta. Se a medição exigir tocar em compartilhado, a parte correspondente para e o motivo é registrado. |
| R5 | **Arquivos gerados.** `next-env.d.ts` e `tsconfig.json` alterados por build/gates. | Hashes do baseline registrados antes (`next-env.d.ts` = `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`, `tsconfig.json` = `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`) e conferidos após **cada** execução; restaurados do Git se mudarem. |
| R6 | **Inventário divergente**: alterar mais de uma linha do CSV ou o gerador. | O gerador **não** é alterado. O par de CSVs vigente de 13/10 é regenerado e a conferência por coluna deve mostrar que **só `/admin/contratos/[id]`** mudou. |
| R7 | **Evidência sintética vendida como validação real.** | Massa 100% fictícia criada pelas próprias APIs, sessão de staff provisionada pelo gate; sem credencial, dado pessoal ou URL efêmera; documentado como **não**-aceite humano. |
| R8 | **Regressão no gate herdado.** `test:l05-delivery:pg` exercita as APIs contratuais e as duas telas por HTTP; os títulos "Contratos e implantação" e "Cadastro manual identificado" são contrato herdado dessa suíte. | Títulos e fluxos preservados; `test:l05-delivery:pg` entra nas validações. `test:l04-delivery:pg` **não** é gate desta fatia: conferido por busca, o teste L04 não referencia a UI de contratos (as quatro ocorrências de "contract" ali são `crm_contracts` criado pelo aceite de proposta e uma contagem por oportunidade, sem passar pelas rotas `/admin/contratos`). |
| R9 | **Workflow não dispara.** `ux-contract-delivery.yml` observa `src/app/admin/contratos/**`, os testes e os scripts da família. | Mudanças restritas a esses caminhos; conferir na PR que `ux-contract-postgres-browser` foi acionado. |
| R10 | **Intermitência de navegador** (Chromium empacotado) confundida com regressão. | Padrão dos gates existentes (`comNavegador` repete **só** crash, nunca asserção); qualquer falha de asserção é tratada como vermelha de verdade. |
| R11 | **Âncora de teste herdada quebrada.** O gate de vocabulário lê `main[data-testid="contract-detail"] p` **`.first()`**. | O indicador de releitura do cabeçalho é renderizado **depois** do `<p class="lede">`; no estado estável ele nem existe. A primeira `<p>` continua sendo o `lede`. Conferido executando o gate completo. |

## 5. Validações planejadas

**Antes (provas de defeito, contra a `main` sem edição de tela):**

1. Testes novos do gate escritos **primeiro** em `tests/ux-contract-workspace.integration.test.mjs`, copiados para um **worktree descartável de checkout limpo** da `main` (`f066768`) e executados com `UX_CONTRACT_TEST_PATTERN` apontando para os casos novos do detalhe. Devem **falhar** onde D1–D3/D5 existem e **passar** onde o comportamento já está correto (a negativa fail-closed de D4 e as preservações de layout/teclado).
2. Capturas/medições "antes" guardadas fora do `resumo.json` vigente.

**Depois (na branch da fatia):**

- `npm run typecheck`
- `npm test` (inclui `tests/ux-contract-vocabulary.test.mjs` e `tests/ux-pro-00-inventory.test.mjs`)
- `npm run build`
- `node scripts/qa-wave0-static.mjs`
- `node scripts/ux-pro-00-inventory.mjs --check`
- `npm run test:ux-contract:pg` — gate completo da família (pré-existentes + novos)
- `npm run test:l05-delivery:pg` — gate herdado que exercita esta rota
- conferência por hash de `next-env.d.ts` e `tsconfig.json` após cada gate
- evidências próprias em 320, 390, 768 e 1440 px, dia e noite, e percurso de teclado, com `resumo.json` legível por máquina

## 6. Critério de conclusão e limites conhecidos

- Só há merge com **todos os checks obrigatórios verdes**, sem conflito, base `main` confirmada e revisão concluída. Check cancelado, pulado ou em fila **não** conta como aprovado. Se qualquer check ficar vermelho ou houver dúvida de regressão, a fatia **não avança**: entrega-se o motivo verificável e o prompt de retomada desta mesma fatia.
- Não há aceite humano de Marcelo, Andreia ou comercial; nenhum registro de aceite será criado.
- Não há validação em Windows, HTTPS hospedado ou banco do operador.
- A decisão sobre a PR #215 (obsoleta e conflitante) permanece com o proprietário e não é tomada aqui.

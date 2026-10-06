# UX-07 (fatia C) — Contratos

Data: 2026-10-05 · Branch `arena/daead24f-gruposegsystemseguranca`
Base: `main` em `139372082c7fa2d7ef9d7feae53e866d46a79b86` (commit de partida
desta sessão; UX-07 fatia A — Operação, PR #158; fatia B — Financeiro, PR #159).

Esta é a **fatia C** de UX-07 — a família **Contratos** apenas
(`/admin/contratos` e `/admin/contratos/[id]`). As demais famílias do roteiro
de UX-07 (compliance, patrimônio, frota, terceiros, qualidade, apoio
emergencial, licitações, fornecedores, satisfação, conhecimento, carteira,
pedidos do site, inteligência comercial, expansão, analytics, relatórios
periódicos, painel do Marcelo, continuidade) e as etapas UX-08/UX-09 **não
foram iniciadas**; ficam para sessões seguintes, por decisão explícita de
escopo.

**Empilhamento na mesma PR, por decisão explícita do usuário.** Esta fatia foi
commitada na mesma branch da fatia B, de modo que a **PR #159 passa a conter
duas famílias** (Financeiro e Contratos), em **commits separados**. A regra
"um commit por família" continua valendo; a regra "uma família por PR" foi
suspensa para esta sessão a pedido do dono do repositório. O merge continua
sendo tarefa exclusiva dele.

Telas tratadas:

| Rota | Natureza | Autorização |
| --- | --- | --- |
| `/admin/contratos` — lista da carteira, criação a partir de proposta aceita e cadastro manual identificado (`ContractWorkspace.tsx`) | **Produto.** Reescrita completa de apresentação. | `AdminGate` (`marcelo`, `admin`, `comercial`), fixado por `tests/admin-page-gates.test.mjs`; leitura e escrita decididas em `src/server/contract-l05-api.mjs` — nunca pela interface. |
| `/admin/contratos/[id]` — ciclo de vida, composição, aditivos, alertas, obrigações documentais, implantação, bloqueios, fiscalização, diário de gestão e encerramento (`ContractWorkflowClient.tsx`) | **Produto.** Reescrita completa de apresentação. | Mesmo `AdminGate`; `CONTRACT_READERS` (`marcelo`, `admin`, `comercial`) para leitura e `MANAGERS` (`marcelo`, `admin`) para gestão, decididos no servidor. |
| `src/app/admin/ti/Contract*Client.tsx` — dez clientes de contrato dentro do console de TI (1.481 linhas) | **Fora do escopo desta fatia.** | Pertencem ao recorte UX-08 (console de TI). Não foram tocados nem promovidos a "pronto". Ver seção 6. |

## 1. O que esta fatia mudou e o que NÃO mudou

Fatia de **apresentação, vocabulário e acessibilidade**. Nenhuma rota de API,
nenhum método, corpo, cabeçalho, nenhuma regra de escopo de carteira,
transição de situação, bloqueio legal, checklist de implantação, idempotência
ou encerramento foi alterada. O banco continua em **001–174**; nenhuma migração
nova foi criada, e nenhuma existente foi tocada.

| Não mudou | Onde continua sendo decidido |
| --- | --- |
| Quem lê e quem gere cada contrato (`CONTRACT_READERS` × `MANAGERS`) | `src/server/contract-l05-api.mjs` |
| Escopo de carteira (contrato fora da carteira responde `404 contract_not_found`) | `contract-l05-api.mjs` + consulta ao banco |
| Transições de situação (`rascunho`→`assinado`→`ativo`→`suspenso`/`encerrado`) e separação entre assinatura e ativação operacional | servidor + migrações 034 e 118 |
| Exigência de checklist concluído e bloqueios resolvidos para ativar | servidor (CON-07/CON-08) |
| Idempotência da criação canônica (`request_key`) | `UNIQUE` no banco + transação do L05 |
| Auditoria fail-closed (falha de auditoria → `503`, contrato não criado) | servidor; continua sendo estado próprio, nunca "zero" |
| Criação a partir de proposta aceita, sem inventar proposta para o cadastro manual | servidor (`createFromProposal` × `createManual`) |

**Fronteira real, conferida e não suposta:** `server.mjs` (linha ~3022) envia
*todo* `/api/crm/contracts` e `/api/crm/contracts/*` para
`contract-l05-api.mjs`. Os outros dez servidores da família continuam no
repositório por compatibilidade histórica e **não são alcançáveis por HTTP**.
O vocabulário cobre os onze mesmo assim, de propósito: se uma rota legada for
religada, a pessoa vê português em vez do código cru. Isto está escrito no
cabeçalho de `src/lib/contract-vocabulary.mjs` e no teste anti-deriva, para não
induzir ninguém ao engano de achar que onze servidores estão expostos.

## 2. O diagnóstico honesto da tela anterior

| Defeito observado | Consequência |
| --- | --- |
| **As oito leituras do detalhe estavam num único `Promise.all` dentro de um `try/catch`.** Bastava uma falhar para `data` ficar nulo. | A página inteira virava **"Contrato indisponível"**, descartando as sete leituras que haviam funcionado. Com o papel `comercial`, em que o servidor recusa as frentes de gestão por projeto, a tela de contrato era simplesmente inutilizável — uma recusa legítima de permissão aparecia como indisponibilidade geral do contrato. Este é o defeito mais grave da família e o alvo central da fatia. |
| `if (!response.ok) throw new Error(result.error \|\| "Operação indisponível.")` nos dois arquivos, com o `catch` exibindo `error.message`. | O **código cru do servidor em inglês** aparecia na tela: `contract_management_forbidden`, `blocking_items_pending`, `invalid_status_transition`, `audit_unavailable`, `duplicate_request_key` — **305 códigos possíveis**. |
| Doze `style={{...}}` inline (8 na lista, 4 no detalhe) e nenhuma classe compartilhada. | Inconsistência visual com o restante do admin. |
| Nenhum `UiState`: carregando, vazio, falha e recusa usavam marcação ad hoc. | Quatro significados distintos com a mesma aparência — e, no caso acima, falha indistinguível de ausência. |
| Oito seções empilhadas em uma página única, sem `tablist`, sem navegação por teclado. | Percurso longo e sem estrutura anunciável por leitor de tela. |
| Situações impressas com o valor cru do banco (`rascunho`, `nao_aplicavel`, `em_andamento`, `encerrado`, `bloqueio_legal`). | Jargão de coluna de banco exposto a quem opera. |

## 3. O que foi entregue

1. **`src/lib/contract-vocabulary.mjs` (+ `.d.mts`)** — tradução dos **305
   códigos** de erro que os onze servidores da família podem devolver.
   `describeContractError(code, status) -> { kind, title, detail, status, canRetry, code }`,
   mais `contractErrorVariant`, `contractErrorFootnote` e
   `contractErrorMessage` (código canônico só entre parênteses, nunca como
   frase principal). Valor desconhecido **passa cru** — nunca é inventada uma
   tradução. Além disso, os pares `label`/`tone` de **todos** os ENUMs das
   migrações 027 e 032–042 (mais a canonicalização 118): situação do contrato,
   origem, implantação, etapa, bloqueio, exceção, aditivo, alerta, obrigação,
   encerramento, dossiê fiscal, medição, evidência, diário, turno de posto e
   serviço de SLA; e `shortDate()`/`brl()`, que devolvem texto honesto para
   valor ausente em vez de `01/01/1970` ou `R$ 0,00`.
2. **`src/lib/contract-request.ts`** — `contractRequest()` devolvendo resultado
   discriminado (`{ ok: true, status, data }` ou `{ ok: false, status, error }`)
   com o descritor já classificado; falha de rede vira `status: 0` e um estado
   próprio, em vez de exceção solta.
3. **`src/app/admin/contratos/ContractWorkspace.tsx`** (94 → 328 linhas) —
   reescrito: zero `style` inline; três grupos de leitura independentes
   (propostas aceitas, empresas, carteira), cada um com seu `UiState`;
   `UiBadge` com `srPrefix` em toda situação; a lista vazia diz **"A leitura
   funcionou e nenhum contrato está na sua carteira"**, e a falha diz
   explicitamente que **não significa que a carteira esteja vazia**.
4. **`src/app/admin/contratos/[id]/ContractWorkflowClient.tsx`** (77 → 814
   linhas) — reescrito: as oito leituras passaram de `Promise.all` para
   **estado próprio por recurso** (cada uma com carregando / dado / falha com
   código canônico e botão de repetir); seis abas
   `tablist`/`tab`/`tabpanel` reais com roving tabindex e ←/→/Home/End; zero
   `style` inline; todo formulário preserva URL, método e payload originais.
5. **Teste anti-deriva** `tests/ux-contract-vocabulary.test.mjs` (12 testes),
   que lê os onze arquivos de servidor e falha se a interface traduzir um
   código inexistente ou deixar um código sem frase.
6. **Gate próprio** `scripts/qa-ux-contract-postgres.mjs` +
   `tests/ux-contract-workspace.integration.test.mjs` + script
   `test:ux-contract:pg` + workflow `.github/workflows/ux-contract-delivery.yml`.

## 4. Correção fora da fatia: o extrator de códigos estava subestimando

Esta fatia encontrou — e consertou — um **defeito de método** que já havia
afetado a fatia B (Financeiro, PR #159). Ele está declarado aqui e na seção 5.3
de `docs/UX-07-FINANCEIRO-2026-10-05.md` em vez de corrigido em silêncio.

O extrator usado para levantar os códigos de erro casava apenas
`{ error: '...' }` literal e `new HttpError(..., '...')`. Só que **cada
servidor define wrappers locais**:

```js
const bad = (res, msg) => json(res, 400, { error: msg });
const unavailable = (res, msg = 'contracts_unavailable') => json(res, 503, { error: msg });
```

Os códigos passados por esses wrappers **não eram capturados**. Consequência
medida:

| Família | Códigos declarados antes | Códigos reais | Faltavam |
| --- | --- | --- | --- |
| Financeiro (fatia B, já em PR) | 319 | **342** | 23 |
| Contratos (esta fatia) | 147 | **305** | 158 |

Pior do que o número: o teste anti-deriva da fatia B afirmava cobertura total
com um limiar (`> 300`) baixo demais para expor o buraco. Um teste que mede a
coisa errada dá falsa segurança.

O que foi feito:

- extrator corrigido nos **dois** testes anti-deriva, passando a casar
  `\b(?:bad|unavailable)\(\s*res\s*,\s*'código'`;
- limiares subidos para `> 340` (financeiro) e `> 300` (contratos), de modo que
  uma regressão de levantamento volte a falhar;
- **+23 traduções** em `src/lib/finance-vocabulary.mjs` (agora 342, zero
  duplicado) e **+158** em `src/lib/contract-vocabulary.mjs` (agora 305, zero
  duplicado);
- procedimento registrado para as próximas fatias: antes de declarar o
  levantamento completo, listar **todos** os wrappers da família com
  `grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"]" src/server/<familia>-*.mjs | sort | uniq -c`.

Nenhum comportamento de servidor foi alterado por esta correção: ela só amplia
o que a interface sabe traduzir.

## 5. Validação executada

Ambiente: Linux, Node 22, PostgreSQL **embutido e descartável**
(`embedded-postgres`), Chromium `@sparticuz/chromium` em `--single-process`.
Nenhum banco do operador foi tocado; o gate recusa rodar com `DATABASE_URL`,
`DATABASE_MIGRATION_URL` ou `RUN_DATABASE_INTEGRATION_REMOTE` definidos.

| Verificação | Natureza | Resultado |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | estática | exit 0 |
| `node --test tests/ux-contract-vocabulary.test.mjs` | estática (anti-deriva, onze arquivos de servidor) | **12/12** |
| `node --test tests/ux-finance-vocabulary.test.mjs` (após a correção da seção 4) | estática | **10/10** |
| `npm run test:ux-contract:pg` | HTTP real + PostgreSQL real + Chromium | **8/8**, exit 0 |
| `npm run test:unit` (inclui os dois testes de vocabulário) | estática | **718/718** |
| `npm run test:l05-delivery:pg` (gate herdado desta família) | HTTP real + PostgreSQL real + Chromium | **1/1**, exit 0, **sem precisar de reparo** |
| `npm run ux:evidence -- --stage=ux-07-contratos` | captura real, 1440×900 e 390×844 | exit 0, `problems: []` |
| `npm audit --audit-level=high` | estática | 0 vulnerabilidades, após o commit `chore(deps)` da seção 5.3 |
| Aceite humano | — | **PENDENTE.** Marcelo e Andreia não participaram e não foram solicitados. Nada aqui é homologação. |

O que o gate `test:ux-contract:pg` prova, teste a teste:

1. As rotas de contrato continuam exigindo sessão (401 sem cookie, sem vazar
   contrato algum na negativa).
2. **"Menu não é autorização"**: o papel `comercial` está em `allowedRoles` do
   `AdminGate` das duas telas e, mesmo assim, o servidor recusa sozinho —
   `403 contract_management_forbidden` em `/fiscal` e `/management-diary`,
   `404 contract_not_found` no contrato fora da carteira, lista `[]` por
   escopo e `403` na tentativa de criar contrato — enquanto `admin` segue
   autorizado em tudo. A tela não inventa permissão nem remove a que existe.
3. **O defeito central está corrigido**: derrubando apenas `/management-diary`
   (503 `diary_unavailable`), o cabeçalho do contrato continua na tela, não há
   erro de página inteira, os dossiês fiscais lidos no mesmo painel continuam
   visíveis, e só o diário mostra `data-ui-state="error"` com `(diary_unavailable)`
   e botão de repetir.
4. As seis abas são um `tablist` de verdade: roving tabindex (1 com
   `tabindex=0`, 5 com `-1`), ←/→ movendo foco e seleção juntos, Home/End indo
   para a primeira/última, só o painel ativo montado.
5. Situação, origem, vigência e etapas de implantação aparecem em português
   (**"Rascunho"**, **"Cadastro manual identificado"**, **"01/03/2036"**,
   **"Situação da etapa: Pendente"**) — nenhum valor cru do banco na tela.
6. **Falha de leitura da carteira não vira "nenhum contrato"**: com 503
   (`contracts_unavailable`) em `/api/crm/contracts`, a lista declara que a
   falha **não significa** carteira vazia, nenhuma tabela vazia é renderizada,
   e o cadastro manual continua utilizável.
7. **Vazio legítimo não é apresentado como falha**: o papel `comercial`, cuja
   carteira está de fato vazia, vê `data-ui-state="empty"` dizendo que a
   leitura funcionou — e nenhum estado de erro.
8. 390×844 sem transbordo horizontal nas duas rotas.

A falha é injetada **apenas em `window.fetch`, dentro da página**
(`addInitScript`): o servidor nunca é enfraquecido para o teste passar.

### 5.1 Gates herdados

`tests/l05-delivery.integration.test.mjs` (job `contracts-postgres-browser`)
**passou sem reparo**: os dois textos que ele exige na tela — os títulos
`"Contratos e implantação"` e `"Cadastro manual identificado"` — foram
preservados literalmente na reescrita, assim como as asserções de API
(idempotência por `request_key`, auditoria fail-closed em 503, encerramento
propagando só para o `client_contracts` vinculado).
`tests/admin-page-gates.test.mjs` e `tests/admin-entry.test.mjs` também passam:
`allowedRoles` e o `sanitizeAdminNext("/admin/contratos/<uuid>")` não foram
tocados.

### 5.2 Duas correções no próprio gate, depois da primeira rodada de CI

A primeira execução do job `ux-contract-postgres-browser` no GitHub Actions
falhou, embora as rodadas locais estivessem verdes. Ambas as causas eram do
teste, não do produto, e foram corrigidas **sem relaxar asserção alguma**:

1. **Corrida de leitura.** O `tablist` do detalhe é montado antes de as oito
   leituras terminarem; medir a tela logo depois dele pegava
   `"Lendo o contrato…"` no lugar da situação. Os três testes que inspecionam
   o detalhe passaram a esperar o `h1` do contrato. Reproduzido localmente
   antes do conserto.
2. **Crash do navegador não é resultado de teste.** O Chromium
   `--single-process` eventualmente sai com `SIGSEGV` no `launch` ou com o
   alvo fechado no meio da sessão. O helper `comNavegador` repete a sessão
   inteira até três vezes **apenas** quando o erro casa o padrão de crash;
   qualquer `ERR_ASSERTION` é repassado na hora. A repetição é registrada no
   log (`UX_CONTRACT_BROWSER_RETRY`) para não virar flakiness silenciosa.

### 5.3 Advisory alheio que travava o CI

O job `static-and-smoke` passou a falhar em `npm audit --audit-level=high` por
causa de um advisory publicado depois da última rodada verde desta branch
(`GHSA-68fv-2mgg-jv7q`, `source-map-js`, dependência transitiva). Nada a ver
com estas fatias. Correção mínima em commit próprio: `source-map-js` 1.2.1 →
1.2.2 no lockfile, sem dependência nova e sem mexer em dependência direta;
`npm ci`, `typecheck`, `test:unit` (718/718) e `npm run build` reexecutados
depois da atualização.

## 6. O que NÃO foi feito (pendências declaradas)

1. **Os dez `Contract*Client.tsx` de `src/app/admin/ti/` (1.481 linhas) não
   foram tocados.** Pertencem ao console de TI, recorte de UX-08. Continuam
   com código cru de servidor na tela. É dívida explícita, não escondida.
2. **Os dez servidores legados da família continuam sem rota HTTP** (seção 1).
   Religá-los, ou removê-los, é decisão de produto — não de UX — e não foi
   tomada aqui.
3. **Evidência visual** (`npm run ux:evidence -- --stage=ux-07-contratos`) cobre
   apenas `/admin/contratos` como papel `admin`, em 1440×900 e 390×844. **Não
   cobre** `/admin/contratos/[id]` (depende de massa, capturada pelo gate via
   `UX_CONTRACT_EVIDENCE_DIR`) nem os papéis `marcelo` e `comercial` —
   cobertura parcial declarada.
4. **Demais famílias de UX-07** não foram iniciadas.
5. **UX-08** (console de TI/RAG, mensagens públicas, polimento global) e
   **UX-09** (auditoria cruzada e aceite) não foram iniciadas.
6. **Aceite humano**: pendente, por decisão explícita. Marcelo e Andreia não
   participaram desta sessão e não foram solicitados.
7. **Nenhuma migração nova.** Nada nesta fatia exigiu mudança de banco, e
   mudança de banco por UX continua proibida.

## 7. Arquivos

Novos:

- `src/lib/contract-vocabulary.mjs` (1.993 linhas), `src/lib/contract-vocabulary.d.mts`
- `src/lib/contract-request.ts`
- `tests/ux-contract-vocabulary.test.mjs`
- `tests/ux-contract-workspace.integration.test.mjs`
- `scripts/qa-ux-contract-postgres.mjs`
- `.github/workflows/ux-contract-delivery.yml`
- `docs/ux-07-contratos-evidencias/` (captura real)
- `docs/UX-07-CONTRATOS-2026-10-05.md` (este arquivo)

Alterados:

- `src/app/admin/contratos/ContractWorkspace.tsx` (reescrito)
- `src/app/admin/contratos/[id]/ContractWorkflowClient.tsx` (reescrito)
- `scripts/ux-evidence-capture.mjs` (etapa `ux-07-contratos`)
- `package.json` (`test:ux-contract:pg`; teste de vocabulário no `test:unit`)
- `tsconfig.json` (tipos de `.next/integration-ux-contract`)

Alterados **fora** desta família, pela correção da seção 4 (commit separado):

- `src/lib/finance-vocabulary.mjs` (+23 traduções)
- `tests/ux-finance-vocabulary.test.mjs` (extrator e limiares)

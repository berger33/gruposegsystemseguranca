# UX-PRO-06 — escopo, riscos e validações de `/admin/clientes` (cadastros centrais)

**Data:** 14/10/2026
**Status deste documento:** registro **anterior à implementação**, commitado isoladamente antes de tocar em tela, teste ou inventário.

## 0. Confirmação de base (divergência registrada)

O pedido desta sessão esperava **retomar o branch `arena/ux-pro-06-client-admin-accounts`** já existente em `berger33/gruposegsystemseguranca`, com "commit de escopo e trabalho local" a preservar. A conferência **antes de qualquer edição** mostrou o contrário:

- `git fetch origin --prune` + `git branch -a` trazem **apenas** `main` e `origin/main`; **não existe** `remotes/origin/arena/ux-pro-06-client-admin-accounts`;
- `gh api repos/berger33/gruposegsystemseguranca/branches/arena%2Fux-pro-06-client-admin-accounts` → **404 Branch not found**; `gh pr list --head arena/ux-pro-06-client-admin-accounts --state all` → vazio; não há PR aberto, mesclado ou fechado com esse head;
- no clone desta sessão: `git stash list` vazio, `git reflog` com apenas `clone` + `checkout` do branch desta sessão, e nenhuma ocorrência de `client-admin-accounts` em arquivo algum do repositório — **não há trabalho local a preservar aqui**;
- a ponta vigente da `main` é `0e21c82df87860df786cadb995f687a4c9d8d213` (merge da **PR #217** — "UX-PRO-06: preservar o detalhe do contrato na falha de releitura (/admin/contratos/[id])", mergeada em 14/10/2026 01:38Z), com árvore limpa e clone raso (`--depth=1`) consistente com o remoto;
- **limitação de verificação:** `gh api .../branches/main/protection` responde **403 "Resource not accessible by integration"** com o token desta sessão; a lista de *required status checks* da `main` **não pôde ser lida por API**. O critério adotado nesta fatia é o conservador: **todo check disparado pela PR precisa ficar verde**, sem cancelado, pulado ou em fila.

Consequência: o recorte foi **reconstruído do zero nesta sessão**, no branch fixo dela (`arena/40f48ef1-gruposegsystemseguranca`, exigência da plataforma), seguindo exatamente a convenção das fatias #212–#217 (documento de escopo isolado → teste focal primeiro → correção → evidência → checks → PR pequena). Se o branch original reaparecer no remoto, esta PR pode ser **fechada ou substituída** — a decisão é do proprietário, e nenhuma PR existente é reaberta, mesclada ou fechada por esta fatia.

### 0.1 Bateria `npm test` — 930/933 com `EPERM` em `%TEMP%`

O pedido registra a bateria parando em **930/933**: três testes existentes de backup/CLI falharam ao criar *symlinks* sob `%TEMP%` com `EPERM`, mesmo com `TEMP`/`TMP=F:\SegSystem-QA-Temp`. Apuração desta sessão (detalhada no documento de estados):

- os **três** testes que criam *symlink* no repositório são exatamente `tests/qa-backup-coverage-inventory.test.mjs` (`symlink(tmpdir(), link)`), `tests/qa-cli-v2-local-provider.test.mjs` (`symlink(tmpdir(), <root>/objects)`) e `tests/qa-cli-v2-transfer.test.mjs` (`symlink(<destino>/objects/<canário>, unsafe)`) — todos ligam **para diretórios**;
- no ambiente suportado desta sessão (Linux, equivalente ao runner `ubuntu-latest` dos workflows) os três passam: `node --test` dos três arquivos = **11/11, 0 falhas**, e a bateria inteira `npm test` = **933/933, 0 falhas, 0 pulados**;
- `EPERM` na criação de *symlink* no Windows **não é problema de caminho**: é privilégio. `CreateSymbolicLink` exige `SeCreateSymbolicLinkPrivilege` (Administrador, ou usuário com **Modo de Desenvolvedor** habilitado desde o Windows 10 1703). Trocar `%TEMP%` de volume não concede o privilégio;
- **nesta fatia os três testes não são alterados** — não há *skip*, tolerância nem troca de *symlink* por *junction*. O caminho suportado está registrado no documento de estados (§Limitações) e a limitação fica verificável.

## 1. Recorte escolhido

**Uma leitura de uma rota:** a lista de **cadastros centrais de clientes** — `GET /api/admin/client-accounts` — que alimenta a tela `/admin/clientes` inteira (`src/app/admin/clientes/page.tsx` → `AccountsSection.tsx` e, pelo mesmo prop `accounts`, as seções 2–7).

**Por que é uma fatia coerente e pequena:** um arquivo de página, um componente de seção já existente (`AccountsSection`), o módulo compartilhado **local da pasta** (`admin-shared.ts`) e as duas classes de estado no módulo CSS **local** da rota. Nenhuma URL, método, corpo, papel, permissão, campo, migração ou transição é tocado; os oito formulários e as sete seções restantes continuam com os próprios fluxos.

**Dentro do recorte**

- `src/app/admin/clientes/page.tsx` — o modelo de estado da leitura dos cadastros (preservação em falha transitória, falha fechada em negativa, hora da última leitura concluída, repetição);
- `src/app/admin/clientes/AccountsSection.tsx` — apresentação dessa leitura (carregando/vazio/falha/desatualizado/negado nunca se confundem);
- `src/app/admin/clientes/admin-shared.ts` — **aditivo**: `callApi` passa a devolver um erro com `status`, código canônico e classificação (`auth` | `denied` | `transient`), sem mudar a mensagem que os consumidores atuais já usam;
- `src/app/admin/clientes/AdminClientes.module.css` — **módulo local da própria pasta**; recebe as classes `.updating`/`.stale` já usadas nas fatias irmãs, com os mesmos tokens de aviso;
- **gate novo e focal**: `tests/ux-client-admin-workspace.integration.test.mjs` + `scripts/qa-ux-client-admin-postgres.mjs` + `npm run test:ux-client-admin:pg` + `.github/workflows/ux-client-admin-delivery.yml`. Hoje `/admin/clientes` está entre as **46 rotas com apenas evidência de código** (`docs/UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md`, §111) e **nenhum workflow observa `src/app/admin/clientes/**`**; sem esse gate o teste focal não rodaria no CI;
- **evidência própria** em `docs/ux-pro-06-clientes-evidencias/` (capturas + `resumo.json`) e regeneração do par de CSVs vigente de 13/10, conferindo que **só** a linha `/admin/clientes` muda.

**Fora do recorte, deliberadamente**

- as outras sete seções (`GrantsSection`, `ContractsSection`, `DocumentsSection`, `TicketsSection`, `VisitsSection`, `ReportsSection`) e `InvitesSection`/`RecoveriesSection` — cada uma tem leitura própria e não é reimplementada; a dependência delas com a lista de cadastros é declarada (§3/R3);
- `/admin/contratos`, `/admin/contratos/[id]`, `/admin/comercial`, `/admin/crm`, `/admin/leads`, `/admin/carteira` — entregues nas PRs #210–#217, **nenhuma reaberta**; a PR #215 (obsoleta por #216) também não é tocada;
- o portal autenticado do cliente (`/cliente/app/*`) e `/admin/entrar` — sessão e gate próprios;
- `src/components/ui/UiWorkspace.module.css` (compartilhado por dezenas de arquivos) — **não alterado**; a fatia só usa `src/components/ui/UiState.tsx` como já era usado no produto;
- APIs, papéis, permissões, auditoria, idempotência, migrações e dados canônicos — nenhum tocado. Nenhum `POST`/`PATCH` muda de URL, método, corpo ou cabeçalho;
- `next-env.d.ts` e `tsconfig.json` — **não fazem parte da mudança**; hashes do baseline conferidos após cada execução (§4/R5).

**Fronteira declarada:** esta fatia **não** conclui a UX-PRO-06. Ela cobre a leitura de cadastros centrais da área interna de clientes.

## 2. Comportamento que precisa permanecer (inventariado no código antes de editar)

- `AdminGate allowedRoles={["marcelo","ti"]}` em `page.tsx` — papéis e sessão **inalterados**; a autorização real continua decidida no servidor (`requireAdminSession`), a cada leitura e a cada escrita;
- `InvitesSection` + `RecoveriesSection` renderizadas **somente** para `role === "ti"` — a condição não muda;
- a ordem e o texto do cabeçalho: `h1` "Administração de clientes" e o parágrafo "Fluxo em ordem: **1** … → **7** …";
- as URLs usadas pela tela: `GET /api/admin/client-accounts` (esta fatia), `POST` na mesma rota, `PATCH /api/admin/client-accounts/:id`, `GET/POST /api/admin/grants`, `DELETE /api/admin/grants/:id`, e as rotas de contratos, documentos, chamados, visitas e relatórios das demais seções — **todas intactas**;
- os fluxos de escrita da seção 1: criar cadastro (`displayName`, `documentRef`, `notes`) e alterar situação (`active|suspended|closed`) com aviso `role="status"` e o recarregamento da lista;
- o estado de repouso: `Carregando cadastros…` só enquanto **nunca** houve leitura concluída; `Nenhum cadastro criado ainda. Comece pelo formulário acima.` para lista legitimamente vazia; a lista com nome, documento, data e seletor de situação;
- a marcação e os `data-testid` herdados que os testes atuais leem (papéis do `AdminGate` em `tests/admin-page-gates.test.mjs:51`; `RecoveriesSection.tsx` com "sem SMTP" e "aparece uma única vez" em `tests/client-offline-recovery.test.mjs:10`);
- o vocabulário em português (`accountStatusLabel`) e **nenhum `style` inline novo**;
- alvos de toque ≥ 44 px dos controles, por token compartilhado.

## 3. Defeitos a medir (hipóteses verificáveis contra a `main`)

| # | Defeito (hipótese) | Onde |
|---|---|---|
| D1 | **Falha inicial vira "carregando" eterno.** `loadAccounts` engole o erro (`catch { /* … */ }`) e `accounts` permanece `null`: a seção 1 exibe `Carregando cadastros…` **para sempre**, sem motivo, sem hora e sem repetição — falha apresentada como carregamento. | `page.tsx` / `AccountsSection.tsx` |
| D2 | **Falha na releitura é invisível.** Se já houve leitura, a lista antiga (e os seletores das seções 2–7) continua na tela **sem nenhum aviso de desatualização**, sem hora da última leitura e sem repetição. | `page.tsx` `loadAccounts` |
| D3 | **Negativa de autorização falha ABERTO na tela.** 401/403 na releitura (sessão expirada, papel trocado) mantêm os cadastros — e os nomes dos clientes — visíveis, como se a sessão ainda tivesse acesso. O servidor nega; a tela não acata. | `page.tsx` `catch` |
| D4 | **Releitura em curso não é anunciada.** "Recarregar lista" não dá nenhum sinal de progresso (`role="status"`), mesmo com conteúdo preservado. | `AccountsSection.tsx` |
| D5 | **Zero não medido nas seções 2–7.** Com a leitura falha, os seletores de cadastro leem `accounts ?? []` e ficam vazios **sem explicar por quê** — ausência de dado apresentada como ausência de cadastros. | seções 2–7 (declarado, não reescrito) |
| D6 | **Risco a NÃO introduzir:** a correção de D2 não pode mascarar D3. Negativa continua descartando o dado (falha fechada) e sem oferecer repetir a mesma chamada. | `resolverLeitura` |

## 4. Riscos identificados

| # | Risco | Como será tratado |
|---|---|---|
| R1 | Falha que apaga dados (oposto de D2). | A releitura **nunca** começa apagando: `resolverLeitura` preserva o que foi lido e a falha transitória vira faixa `role="alert"` com motivo, hora e repetição. |
| R2 | Autorização mascarada (D3). | `auth`/`denied` descartam o dado e substituem o conteúdo da tela pelo estado negado, sem repetição. Caso exercitado em navegador **depois** de uma leitura concluída. |
| R3 | Seções 2–7 seguirem com seletores vazios/antigos. | A tela passa a declarar em **um** aviso visível que a lista de cadastros não pôde ser lida (e, na falha de releitura, a faixa diz que os dados são da última leitura); as seções não são reescritas nesta fatia e essa fronteira fica declarada. |
| R4 | Módulos compartilhados com outras rotas. | `admin-shared.ts` é importado **somente** pela pasta `clientes` (conferido por busca); a mudança é aditiva (a mensagem atual continua igual). `UiWorkspace.module.css` e `UiState.tsx` não são alterados. |
| R5 | Arquivos gerados pelo build. | Hashes do baseline registrados antes (`next-env.d.ts` = `18b697c4…`, `tsconfig.json` = `2128c956…`) e conferidos após cada execução; restaurados do Git se mudarem. |
| R6 | Inventário divergente. | O gerador **não** é alterado; o par de CSVs vigente de 13/10 é regenerado e a conferência por linha deve mostrar que **só `/admin/clientes`** mudou. |
| R7 | Evidência sintética vendida como validação real. | Massa 100% fictícia criada pelas próprias APIs; sessão provisionada pelo gate; nenhum dado pessoal, credencial ou URL efêmera; documentado como **não**-aceite humano. |
| R8 | Workflow novo não disparar / check novo sem efeito. | `ux-client-admin-delivery.yml` observa `src/app/admin/clientes/**`, o teste focal, o script do gate, `tests/helpers/**` e ele mesmo; conferir na PR que o check foi acionado e ficou verde. |
| R9 | Intermitência do navegador empacotado confundida com regressão. | Mesmo padrão dos gates irmãos: repetir **só** *crash*, nunca asserção. |
| R10 | Teste focal "passar à toa" na `main`. | Antes da correção, a suíte é executada num **worktree descartável** de `0e21c82` com **apenas** o teste novo e o script do gate: os casos das hipóteses D1–D4 **devem falhar** e os casos de preservação **devem passar**. |

## 5. Validações planejadas

**Antes (provas de defeito, contra a `main` `0e21c82`, sem edição de tela):** suíte focal copiada para worktree descartável limpo, executada pelo gate com `UX_CLIENT_ADMIN_TEST_PATTERN` apontando para os casos novos; medições em `docs/ux-pro-06-clientes-evidencias/antes/`.

**Depois (na branch da fatia):**

- `npm run typecheck`
- `npm test` (inclui `tests/ux-pro-00-inventory.test.mjs` e `tests/admin-page-gates.test.mjs`)
- `npm run build`
- `node scripts/qa-wave0-static.mjs`
- `node scripts/ux-pro-00-inventory.mjs --check`
- `npm run test:ux-client-admin:pg` — gate focal novo (pré-existentes + novos casos)
- `npm run test:l08-delivery:pg` — gate herdado da família de portais/clientes
- conferência por hash de `next-env.d.ts` e `tsconfig.json` após cada gate
- evidências próprias em 320, 390, 768 e 1440 px, dia e noite, e percurso de teclado até a seção 1, com `resumo.json` legível por máquina

## 6. Critério de conclusão e limites conhecidos

- Só há merge com **todos os checks obrigatórios verdes**, sem conflito, base `main` confirmada e revisão concluída. Check cancelado, pulado ou em fila **não** conta como aprovado. Se qualquer check ficar vermelho ou houver dúvida de regressão, a fatia **não avança**: entrega-se o motivo verificável e o prompt de retomada desta mesma fatia.
- Não há aceite humano de Marcelo, Andreia, TI ou comercial; nenhum registro de aceite será criado.
- Não há validação em Windows, HTTPS hospedado ou banco do operador.
- As três seções/arquivos de *symlink* citados em §0.1 **não** são alterados por esta fatia.
- A decisão sobre o branch `arena/ux-pro-06-client-admin-accounts` ausente e sobre a PR #215 permanece com o proprietário.

# UX-PRO-06 — escopo, riscos e validações de `/admin/clientes` (contas administrativas do cliente)

**Data:** 14/10/2026
**Status deste documento:** registro **anterior à implementação**, commitado isoladamente antes de tocar em tela, teste, gate ou inventário.

> **AVISO DE STATUS (14/10/2026, importação documental): a implementação paralela descrita neste escopo NÃO foi entregue.**
> Ela permanece preservada no branch `arena/14fe7e70-gruposegsystemseguranca`, tip `affb2a9`.
> A implementação vigente de `/admin/clientes` foi entregue pela **PR #218** (`27a26f8`), com
> tela e gate próprios (`clientes-cadastros-*`). Este documento é um registro histórico,
> não a entrega nem a autorização para substituir essa implementação. Sua importação
> não traz tela, gate, CSV ou capturas do branch preservado e não declara validação manual
> nem aceite humano. O restante do escopo mantém o contexto da sua base original.

## 0. Confirmação de base

O pedido original desta sessão era **retomar** o branch `arena/ux-pro-06-client-admin-accounts`, preservando um commit de escopo e trabalho local anteriores. A conferência feita antes de qualquer edição mostrou que esse material **não existe neste clone**, e a ausência está documentada com comandos e resultados em [`docs/ARENA-RETOMADA-UX-PRO-06-CONTAS-ADMIN-2026-10-14.md`](ARENA-RETOMADA-UX-PRO-06-CONTAS-ADMIN-2026-10-14.md) §1–§2:

- `git ls-remote --heads origin | grep -i ux-pro-06` → nenhuma correspondência entre os 204 heads remotos;
- nenhuma PR (aberta, mesclada ou fechada) com esse head; as oito PRs UX-PRO-06 existentes (#210–#217) cobrem `/admin/leads`, `/admin/crm`, `/admin/carteira`, `/admin/comercial`, `/admin/contratos` e `/admin/contratos/[id]`;
- `git status --porcelain` vazio, `git stash list` vazio, `git reflog` com apenas `clone` + `checkout` → **nenhum commit de escopo e nenhum trabalho local** a preservar;
- `docs/UX-PRO-06-CONTRATO-DETALHE-ESCOPO-2026-10-14.md` declara `/admin/clientes` **fora do recorte** da última fatia ("família distinta, com risco próprio de escopo").

O proprietário foi consultado nesta sessão e decidiu **implementar a fatia do zero**, a partir da `main` vigente. Este documento é, portanto, o commit de escopo da fatia — não a retomada de um escopo anterior.

Base medida:

| Item | Valor conferido |
|---|---|
| Ponta da `main` | `0e21c82df87860df786cadb995f687a4c9d8d213` (merge da PR #217) |
| Checks na ponta | `static-and-smoke` **success**; `backup-restore-postgres` **success** |
| PRs abertas | nenhuma |
| Proteção de branch | API responde 403 (`Resource not accessible by integration`); a referência de checks obrigatórios é a lista de 9 checks verdes da PR #217 |
| Ambiente de verificação | Linux, Node `v22.22.3`, npm `10.9.8`, `npm ci` pelo lockfile — mesma família de plataforma do CI (`runs-on: ubuntu-latest` em todos os workflows) |
| Baseline SHA-256 | `next-env.d.ts` `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` |
| Bateria na base | `npm test` **933/933**, 0 pulados; `typecheck` exit 0; `build` exit 0; `qa-wave0-static` 5/5; `ux-pro-00-inventory --check` OK; `test:l08-delivery:pg` 51/51; `test:ux-adm:pg` 12/12; `test:f03-client-ticket-acceptance:pg` 1/1 |

Sobre os três testes de backup/CLI que falham com `EPERM` no Windows do operador (`qa-backup-coverage-inventory`, `qa-cli-v2-local-provider`, `qa-cli-v2-transfer`): são guardas negativos P0 e **não serão alterados, pulados nem enfraquecidos** por esta fatia. A causa é privilégio de criação de symlink do processo Windows, não o diretório temporário; as formas suportadas de executá-los e a verificação de que passam 11/11 em Linux estão no §3 do registro de retomada acima.

## 1. Recorte escolhido

**Uma única tela:** `/admin/clientes` — "Administração de clientes" (cadastros centrais de clientes, vínculos/grants, contratos, documentos, chamados, visitas e relatórios), em `src/app/admin/clientes/page.tsx` (74 linhas) com as dez seções locais do mesmo diretório (1.768 linhas no total).

**Por que é uma fatia coerente e pequena:** é uma rota, uma leitura compartilhada (`/api/admin/client-accounts`) e a apresentação do resultado dessa leitura. As nove seções, os formulários de escrita, as APIs, os papéis e a auditoria já existem e não mudam de contrato; a mudança é de **estado de leitura** e de apresentação — exatamente o recorte das fatias #212, #213, #214, #216 e #217.

**Dentro do recorte**

- `src/app/admin/clientes/page.tsx` — o modelo de estado da leitura de cadastros e a apresentação do seu resultado (carregando, concluída, em releitura, desatualizada, falha sem leitura anterior e negativa);
- `src/app/admin/clientes/AccountsSection.tsx` — apenas o ramo que hoje mostra "Carregando cadastros…" para sempre quando a leitura falha, mais marcadores `data-testid` dos estados de leitura;
- `src/app/admin/clientes/admin-shared.ts` — **acréscimo** de um descritor de falha de leitura (função nova; `callApi`, `jsonInit`, `explainApiError` e o mapa de mensagens continuam intactos para as nove seções);
- `src/app/admin/clientes/AdminClientes.module.css` — **acréscimo** das classes de estado desta tela com os tokens de aviso já usados em `Carteira.module.css` e `Contratos.module.css`;
- gate focal **novo** para a rota (`tests/ux-pro-06-clientes-contas.integration.test.mjs` + `scripts/qa-ux-pro-06-clientes-postgres.mjs` + script npm + workflow), porque hoje **nenhum gate focal exerce a tela**: o que a alcança é `test:f03-client-ticket-acceptance:pg` (jornada de chamado, `staffPage.goto('/admin/clientes')` na linha 383) e asserções estáticas de `tests/admin-page-gates.test.mjs:51` (papéis) e `tests/client-offline-recovery.test.mjs` (texto de `RecoveriesSection`);
- capturas próprias em `docs/ux-pro-06-contas-admin-evidencias/` com `resumo.json`, e regeneração do par vigente de CSVs de 13/10 conferindo que **só a linha `/admin/clientes`** muda.

**Fora do recorte, deliberadamente**

- as **outras nove seções** (`GrantsSection`, `ContractsSection`, `DocumentsSection`, `TicketsSection`, `VisitsSection`, `ReportsSection`, `InvitesSection`, `RecoveriesSection`) — continuam recebendo exatamente as mesmas props (`accounts: AdminAccount[] | null`) e preservam suas próprias leituras, formulários, mensagens e comportamento;
- `/admin/portal/*` (acessos do portal), `/cliente/*` e `/cliente/app/*` — áreas separadas, com sessão, grant e escopo próprios;
- `/admin/contratos`, `/admin/contratos/[id]`, `/admin/comercial`, `/admin/crm`, `/admin/leads`, `/admin/carteira` — entregues em #210–#214, #216 e #217; **não são reabertos nem reimplementados**;
- `src/components/ui/UiTaskWorkspace.tsx` e `UiWorkspace.module.css` — compartilhados; **não serão alterados**. Os estados novos usam o módulo CSS local da rota;
- APIs, papéis, permissões, auditoria, idempotência (`request_key`), migrações e dados canônicos — nenhum tocado. `GET/POST /api/admin/client-accounts`, `PATCH /api/admin/client-accounts/[id]` e as demais rotas `/api/admin/*` usadas pelas seções mantêm URL, método, corpo, cabeçalhos e códigos de erro;
- `AdminGate` (compartilhado por todas as telas `/admin`) — não é tocado; `allowedRoles={["marcelo","ti"]}` permanece;
- a PR #215 (fechada, obsoleta desde a #216) — não é reaberta, mesclada ou fechada aqui; a decisão é do proprietário.

**Fronteira declarada:** esta fatia **não** conclui a UX-PRO-06. Ela cobre a leitura dos cadastros centrais de clientes em `/admin/clientes`.

## 2. Comportamento que precisa permanecer (inventariado no código antes de editar)

- **Rota e papéis:** `/admin/clientes` sob `AdminGate allowedRoles={["marcelo","ti"]}`, com `key={session.identityId ?? session.role}`; no servidor, `requireAdminSession` (`src/server/client-space-api.mjs:150`) aceita apenas `marcelo|ti` **com identidade individual** — 401 `admin_session_required` sem sessão, 403 `forbidden` fora desses papéis, 403 `individual_staff_required` sem `identityId`. Menu não é autorização; nada disso muda.
- **Leitura compartilhada:** `GET /api/admin/client-accounts` → `{ accounts, limit, offset, role }`, uma única chamada por carga, alimentando `AccountsSection`, `GrantsSection`, `ContractsSection`, `DocumentsSection`, `TicketsSection`, `VisitsSection` e `ReportsSection` (todas usam `(accounts ?? [])`). `InvitesSection` e `RecoveriesSection` (só papel `ti`) não consomem cadastros.
- **Escritas preservadas:** criação de cadastro (`POST`, com `displayName`/`documentRef`/`notes` e `noValidate`), alteração de situação (`PATCH` por cadastro), vínculos/grants com motivo, contratos, documentos, chamados (assumir/resolver/reabrir), visitas e relatórios — todas com suas mensagens `role="alert"`/`role="status"` de escrita já existentes (linhas 106–107 de `AccountsSection.tsx`), `busy` de envio e recarga via `reloadAccounts()` depois de gravar.
- **Textos e vocabulário:** "Administração de clientes", o fluxo numerado 1–7 do cartão `#clientes-intro`, "1 · Cadastros centrais de clientes", "Recarregar lista", "Carregando cadastros…", "Nenhum cadastro criado ainda. Comece pelo formulário acima.", os rótulos de situação (`Ativa`/`Suspensa`/`Encerrada`) e as datas em `pt-BR`.
- **Estrutura e acessibilidade herdadas:** `UiTaskWorkspace aria-labelledby="intro-title"` com o sumário de tarefas gerado a partir dos `h2`/`h3`, `aria-labelledby="accounts-section-title"`, `label`/`htmlFor` dos campos, `maxLength`, `aria-label` do `select` de situação, `role="alert"`/`role="status"` das mensagens de escrita.
- **Nenhum `data-testid` existe hoje nesta rota** — os marcadores novos são aditivos e nomeados para a rota, sem renomear nem remover nada.

## 3. Defeitos de estado de leitura que esta fatia corrige (lidos no código da `main`)

1. **Falha na leitura é engolida.** `loadAccounts` termina em `catch { /* As seções exibem erro próprio quando necessário. */ }`: nenhuma faixa, nenhum motivo, nenhuma hora, nenhuma repetição. Se a falha acontece **depois** de uma leitura concluída, a tela continua mostrando os cadastros antigos como se estivessem atuais — o operador não tem como saber que a lista pode estar desatualizada.
2. **Falha na primeira leitura vira "carregando para sempre".** Como `accounts` permanece `null`, `AccountsSection` renderiza o spinner "Carregando cadastros…" indefinidamente e as outras sete seções renderizam listas e seletores vazios por `(accounts ?? [])` — falha de leitura apresentada como ausência de dados, e sem caminho de repetição.
3. **Releitura em curso não declara estado.** Nem `loadAccounts` nem o botão "Recarregar lista" marcam a releitura: não há `role="status"`, e o botão de recarga nem sequer é desabilitado enquanto uma escrita está em curso (`busy` cobre só escritas).
4. **Negativa não falha fechada na apresentação.** Com sessão expirada (`admin_session_required`) ou papel recusado (`forbidden`/`individual_staff_required`), a falha também cai no `catch {}` silencioso: o conteúdo lido antes continua na tela como se o acesso estivesse autorizado.
5. **Nenhum marcador de estado de leitura.** Sem `data-testid`, nenhum gate automatizado consegue exercer esses quatro casos em navegador — e não existe gate focal da rota.

## 4. Plano de verificação (o que será medido, sem inventar aceite)

| Verificação | Como |
|---|---|
| "Antes" medido na `main` | o gate focal novo é executado **antes** de qualquer edição de tela; os casos de estado de leitura devem **falhar** (timeout esperando os `data-testid` novos) e os casos de preservação de contrato devem passar |
| Gate focal novo | `npm run test:ux-pro-06-clientes:pg` — PostgreSQL 17 descartável, migrações vigentes, servidor real, sessão de staff individual provisionada pelo fluxo real, massa sintética criada pela própria API, Chromium real; falha injetada **apenas** em `window.fetch` dentro da página (o servidor nunca é enfraquecido) |
| Gates herdados | `npm run test:f03-client-ticket-acceptance:pg` (navega até `/admin/clientes`), `npm run test:l08-delivery:pg`, `npm run test:admin-entry:pg`, `node --test tests/admin-page-gates.test.mjs tests/client-offline-recovery.test.mjs` |
| Bateria e estáticos | `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check` |
| Evidências | capturas em 320/390/768/1440 px (dia), 768 px (noite, pelo controle real do envelope), percurso de teclado com foco visível medido, faixa de dados desatualizados e estado negado, com `resumo.json` legível por máquina; subpasta `antes/` guarda as capturas da `main` sem a correção |
| Inventário | regeneração dos CSVs de 13/10 e conferência **por linha**: somente `/admin/clientes` pode mudar |
| Hashes | `next-env.d.ts` e `tsconfig.json` conferidos por SHA-256 antes e depois de cada execução; `next build` e os gates que sobem workspace Next próprio os reescrevem, e ambos são restaurados do Git — **não entram no diff** |

## 5. Riscos e decisões

- **Risco de tocar em código compartilhado.** `admin-shared.ts` e `AdminClientes.module.css` são usados pelas dez seções da rota. Decisão: só **acréscimo** (função nova de descrição de falha; classes novas). `callApi`, `jsonInit`, `explainApiError`, o mapa `apiErrors` e as classes existentes não são alterados — nenhuma seção muda de comportamento por causa desta fatia.
- **Risco de duplicar a faixa.** Sete seções consomem a mesma leitura. Decisão: a faixa de desatualização e o indicador de releitura aparecem **uma vez**, acima das seções, onde ficam sempre visíveis — como no detalhe do contrato (#217), que não duplica a faixa por aba.
- **Risco de enfraquecer a negativa.** Decisão: dúvida de autorização (401/403) **descarta** o dado lido e substitui o conteúdo pelo estado negado, sem oferecer repetição da mesma chamada; falha transitória (rede/5xx) preserva o dado e oferece "Tentar novamente".
- **Risco de relógio inventado.** A hora exibida na faixa é a do **relógio do navegador no instante do sucesso**; nenhum campo novo em banco, nenhum valor estimado, nada gravado.
- **Risco de escopo crescer para as outras seções.** As leituras próprias de grants, contratos, documentos, chamados, visitas e relatórios têm o mesmo defeito em potencial, mas **não** são tocadas aqui: seria escopo de outras fatias, com medição própria.

## 6. O que este documento não declara

Não declara validação manual, não declara aceite humano (de Marcelo, Andreia, TI ou comercial) e não declara homologação. Chromium automatizado com PostgreSQL descartável e massa sintética é verificação automatizada de contrato e de apresentação; o inventário continua registrando `validacao manual: nao_registrado` e `aceite humano: nao_registrado`, que nunca são inferidos automaticamente.

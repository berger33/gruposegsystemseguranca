# UX-PRO — jornada do RH em reclamações compartilhadas

**Data:** 29/10/2026 · **Base:** `d9d011c9904783d5f240ed4fbefdd3e581996a59` (`main`, merge da PR #307) · **Branch:** `arena/6404aeb6-gruposegsystemseguranca`.

**Natureza:** entrega local, com teste focal e cenários em PostgreSQL descartável + Chromium. **Não** é aceite humano, homologação nem autorização de produção. Produção permanece **NO-GO** (`docs/PRODUCAO-GATE.md`). **Não** é promoção do `TiConsole`: `EXPECTED_TABS` continua **23** e `PROMOCOES_COM_PROVA` continua **10**.

## 1. Decisão de produto e escolha da solução

O proprietário delegou a escolha da solução mais segura e fácil de usar para o RH acompanhar e atualizar reclamações **explicitamente compartilhadas**. A decisão tomada foi a **operação aditiva própria**, e não o "conserto" do PATCH legado:

| Alternativa | Por que não foi escolhida |
|---|---|
| Corrigir o enum do PATCH legado para todos os papéis | É exatamente a tentativa que, na PR #307, devolveu **200 com a linha completa** (descrição, referência em texto claro) até de relato **não compartilhado**. Ela muda o contrato e a autorização de uma rota que tem consumidores (console de TI e o cenário do gate do portal). |
| Restringir/permitir por papel no PATCH legado | Alteraria um contrato existente sem autorização explícita para a parte incompatível (`AGENTS.md`). |
| Montar o cliente administrativo de TI (`EmployeeComplaintClient`) dentro do RH | É tela de TI: cinco contratos, abertura de reclamação, evidências e compartilhamento. Não é a jornada mínima do RH. |
| **Operação + aba aditivas** (escolhida) | Não toca no PATCH legado, não reduz permissão, não muda contrato: soma uma rota com autorização, checagem de compartilhamento, transação e projeção mínima, e uma aba em `/admin/funcionarios`. |

Portanto: a **nova** jornada existe e funciona; a **dívida** do PATCH legado (`500` para o RH) continua **aberta e registrada**, coberta por asserção no gate — nada foi apagado nem afrouxado.

## 2. Inventário feito antes de editar

| Contrato conferido no código | Uso nesta fatia |
|---|---|
| `GET /api/admin/employee-complaints` | lista; `rh` recebe **apenas** relatos `is_shared_with_hr=true`, com projeção mínima (`id, protocol, category, severity, status, is_restricted, minimal_share, is_shared_with_hr, shared_with_hr_at, created_at`) |
| `GET /api/admin/employee-complaints/:id` | detalhe; `rh` recebe **404** se não compartilhado e, se compartilhado, envelope mínimo + `hr_shares` + `history` |
| `PATCH /api/admin/employee-complaints` (legado) | **não é usado** pela jornada nova; continua com `500` para `rh` e `200` para `admin|ti` |
| `POST/GET /api/admin/employee-complaint-hr-shares` | compartilhamento estrito `admin|ti` (o RH recebe 401), usado para preparar massa de teste |
| **`PATCH /api/admin/employee-complaint-hr-status`** | **novo**, aditivo: `rh` (e `admin|ti`) atualizam situação de relato compartilhado |
| `/admin/funcionarios` + `AdminGate(['rh','marcelo','admin','ti'])` | página onde a aba entra; **nenhum papel do gate foi alterado** |
| Migração 093 / 146 | enum `cli_complaint_status`, triggers de imutabilidade do histórico e `auth_access_audit`; **nenhuma migração foi criada ou alterada** |

Papéis medidos no servidor (sonda real): `rh` **200** na lista e no detalhe compartilhado, **404** no detalhe não compartilhado; `comercial` e `marcelo` **403**; `admin|ti` **200**. O `AdminGate` aceita `marcelo`, então a página abre para ele — mas **a API nega**, e a tela mostra o estado *negado*. Menu não é autorização.

## 3. Sonda real ANTES de editar (PostgreSQL descartável + HTTP real)

Cluster temporário `seg_qa_*`, migrações **001–181**, servidor real, sessões staff individuais, apenas dados sintéticos. A sonda e o diretório de build foram removidos; nada foi versionado.

| Requisição | Medição na base `d9d011c` |
|---|---|
| `POST` reclamação (TI) | **201**, `employee_reference_hash` com 64 hex |
| `POST` compartilhamento (TI) | **201** |
| `GET` lista — TI / RH / comercial / marcelo | 200 / **200 (1 item, 10 chaves)** / **403** / **403** |
| `GET` detalhe — RH compartilhado / não compartilhado | **200 (sem `description`)** / **404** |
| `PATCH` legado — TI | **200** (`em_analise`) |
| `PATCH` legado — **RH em relato NÃO compartilhado** | **500 `internal_error`**, banco **inalterado** (`pendente`), corpo sem linha |
| Log do servidor | `routeApi error inconsistent types deduced for parameter $2` |
| SQL exato do legado | **42P08** confirmado; com `$2::cli_complaint_status` → **200** |
| `GET` mensagens — RH sem id / de relato não compartilhado | **400 `missing_complaint_id`** / **200 com 0 itens** (a rota **não** checa o compartilhamento do relato) |

O último item é a dívida de privacidade declarada na PR #307: **não foi resolvida** nesta fatia e continua registrada (ver §7).

## 4. O que foi entregue

### 4.1 Servidor — `PATCH /api/admin/employee-complaint-hr-status`

Arquivo: `src/server/employee-complaint-api.mjs` (novo handler `handleHrStatus`), despachado em `server.mjs` e registrado em `API_PATH_MATCH` (sem esse par, a rota cairia no handler do Next).

| Regra | Como está implementado |
|---|---|
| Mesma origem | `sameOrigin(req)` → senão **403 `forbidden`** |
| Sessão | `requireSession` → senão **401 `unauthorized`** |
| Papel | `admin|ti|rh` → senão **403 `forbidden_restricted_channel`** |
| Método | só `PATCH` → senão **405 `method_not_allowed`** |
| Validação | `id` UUID canônico 8-4-4-4-12 (**400 `invalid_id`**), situação do enum `cli_complaint_status` (**400 `invalid_status`**), motivo 10–1000 (**400 `invalid_reason`**), `expected_status` opcional (**400 `invalid_expected_status`**). Nada disso abre transação. |
| Compartilhamento | `SELECT … WHERE id=$1 AND is_restricted=true AND is_shared_with_hr=true FOR UPDATE`; sem linha → **404 `not_found`** (não revela existência nem diferencia inexistente de não compartilhado) |
| Concorrência | `FOR UPDATE` serializa a decisão; `expected_status` divergente → **409 `status_conflict`** com `current_status`; situação igual à atual → **409 `status_unchanged`** (não fabrica histórico) |
| Escrita | `UPDATE … SET status=$2::cli_complaint_status … WHERE id=$1 AND is_restricted=true AND is_shared_with_hr=true RETURNING <colunas explícitas>` — **enum tipado** (causa do 42P08) e **nunca `RETURNING *`** |
| Histórico | `INSERT INTO cli_employee_complaint_history (…, is_hr_share=false) RETURNING previous_status, next_status, is_hr_share, created_at` |
| Auditoria | `INSERT INTO audit_log (action='cli_complaint_hr_status', actor, target, meta{from,to,role,reason≤200,minimal_share})` na **mesma conexão/transação** |
| Falha | qualquer erro → **ROLLBACK** e **503 `complaint_status_unavailable`**, sem escrita parcial |
| Resposta | `{ complaint: <projeção mínima, 10 chaves>, history: {previous_status, next_status, is_hr_share, created_at}, note }` — **sem** `description`, `title`, `employee_reference`, `employee_reference_hash`, `client_account_id`, vínculos, `responsible_id` ou `request_fingerprint` |

`admin|ti` também são aceitos nesta rota (não perdem nada: continuam com o PATCH legado), e para eles vale a mesma checagem de compartilhamento — a operação é **explicitamente** sobre relato compartilhado.

**Ponto de injeção `writeAudit`** (opcional, com padrão que grava `audit_log` na transação): existe para tornar o rollback **observável em PostgreSQL real**, sem alterar o caminho de produção.

### 4.2 Interface — aba “Reclamações compartilhadas” em `/admin/funcionarios`

Novo componente `src/app/admin/funcionarios/SharedComplaints.tsx` (+ `SharedComplaints.module.css`), montado como **10ª aba** de `RhWorkspace` (as nove anteriores preservadas). A tela:

- **lista** os relatos que o servidor devolve ao RH (protocolo, situação com rótulo, categoria, severidade, data do compartilhamento) e **detalhe** com o envelope mínimo (protocolo, categoria, severidade, situação, compartilhado em, aberto em);
- mostra **campos adicionais somente quando expressamente compartilhados**: só `title` e `minimal_description` aparecem, e apenas se existirem em `hr_shares` (com a justificativa registrada). Qualquer outro nome de campo é ignorado;
- **atualiza a situação** com motivo obrigatório, usando o enum aceito pelo servidor e enviando `expected_status` (a situação vista em tela) para não sobrescrever decisão concorrente;
- estados **carregando / vazio / erro / negado** distintos (e “payload inválido” nunca vira vazio), `aria-busy`, `role="status"`/`role="alert"`, **retry** na lista e no detalhe, **sequências independentes** contra resposta fora de ordem, `Array.isArray` em todas as coleções, **motivos traduzidos** por código (sem ecoar texto cru do servidor), `htmlFor`/`aria-describedby` em todo campo, foco no alerta de erro e CSS em tokens com `:focus-visible` e breakpoints 900/650;
- **não** exibe descrição integral, título por padrão, referência do colaborador, hash, conta, contatos, responsáveis internos, mensagens ou evidências;
- declara os limites na própria tela (sem upload, sem anonimização, leitura administrativa global, dívida das rotas de mensagens/evidências, auditoria administrativa das demais rotas sem garantia transacional, NO-GO, aceite humano não registrado).

## 5. Provas

### 5.1 Teste focal — RED real antes da implementação

`tests/ux-pro-rh-reclamacoes-compartilhadas-ui.test.mjs`, incluído explicitamente em **`test:unit`**:

| Momento | Resultado |
|---|---|
| Antes de existir handler, rota, componente e aba | **RED 0/11** (11 falhas, zero `pass`) |
| Depois da implementação | **GREEN 11/11** |

Cobre: aba aditiva sem montar a aba de TI; rota despachada e `API_PATH_MATCH`; PATCH legado preservado (`$2` sem tipo e `RETURNING *` continuam no arquivo, por decisão); mesma origem/sessão/papel (6 papéis negados, 3 aceitos); validação sem abrir transação; 404 de não compartilhado sem `UPDATE`; 409 de concorrência e de situação repetida sem histórico; escrita com enum explícito, `FOR UPDATE`, `RETURNING` de colunas explícitas, histórico e auditoria na mesma transação; **rollback + 503** na falha de auditoria; estados/sequência/`Array.isArray`/traduções/rótulos/tokens/responsividade; e a asserção de que o gate do portal **mantém** `rhPatch.status === 500`.

### 5.2 Cenários novos no gate do portal (PostgreSQL + Chromium)

Em `tests/ux-portal-workspace.integration.test.mjs` (executado por `scripts/qa-ux-portal-postgres.mjs`):

1. **`browser UX-PRO RH: relatos compartilhados`** — `rh` autorizado no relato compartilhado, `rh` **404** no não compartilhado (banco intacto), `comercial` e `marcelo` **403** na leitura e na escrita, `admin` (TI) **200** no legado e na rota nova, resposta **sem** dados restritos (`description`, `title`, `employee_reference`, hash, conta, vínculos, `responsible_id`), **escrita real com status e corpo** (`200`, `history.previous_status/next_status`, banco, histórico +1, auditoria com o ator), **concorrência** (`409 status_conflict`), **situação repetida** (`409 status_unchanged`, sem histórico), **A/B sem resíduo** (o relato não compartilhado nunca aparece, nem após reler), **503 com retry** (injetado só em `window.fetch`; a tela traduz, não vaza o código e não grava), **estado negado real do Marcelo** (a página abre porque o gate aceita; a API nega; a tela diz “Seu papel não opera este canal” e não mostra protocolo) e **quatro larguras (320/390/768/1440)** com detalhe e formulário abertos, sem transbordo e com rótulo em todo campo.
2. **`UX-PRO RH: falha da auditoria desfaz situação e histórico em PostgreSQL real`** — o **mesmo handler**, contra o PostgreSQL do gate, com a auditoria falhando: **503**, situação ainda `pendente`, **0** linhas de histórico e **0** linhas de auditoria; na sequência, com a auditoria real, **200** com situação, **1** histórico e **1** auditoria. É o rollback **medido**, não só declarado.

Resultados: o cenário de navegador passou **1/1 isolado** e o gate completo fechou **49/49** (era **47/47**), 0 skips.

### 5.3 Sonda depois (mesmas condições descartáveis)

| Requisição | Antes | Depois |
|---|---|---|
| `PATCH` legado — RH | 500 `internal_error` (42P08) | **500 `internal_error`** (preservado por decisão) |
| `PATCH` legado — `admin|ti` | 200 | **200** |
| Rota nova — RH em relato compartilhado | rota não existia | **200**, 10 chaves, `history {em_analise → escalonada}` |
| Rota nova — RH em relato **não** compartilhado | rota não existia | **404 `not_found`**, sem linha na resposta |
| Rota nova — comercial / marcelo | rota não existia | **403** / **403** |
| Rota nova — TI | rota não existia | **200** |
| Banco após a rota nova | — | `status` atualizado, histórico **+1** por transição, **1** linha de `audit_log` por operação |
| Sonda SQL (transação + rollback) | 42P08 no SQL exato | `SELECT … FOR UPDATE` → 1 linha; `UPDATE … $2::cli_complaint_status … RETURNING <colunas>` → 1; histórico `pendente → escalonada`; auditoria 1; **ROLLBACK** → `status` `pendente`, **0** histórico, **0** auditoria |

## 6. Bateria de verificação (29/10, nesta sandbox)

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1222/1222**, 0 falhas, 0 skips (base 1211) |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm run test:unit` | **1222/1222**, 0 falhas, 0 skips; **158** arquivos explícitos (base 157) |
| `npm run typecheck` | **0 erros** |
| `npm run build` | **106/106** páginas (mesma contagem da base) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| Inventário TI `--check` | **OK** — 84 componentes, **23 abas**, 36 órfãos, **10 promoções** (inalterados) |
| Inventário 222 `--check` | **OK** — 222 IDs, **20 `a_revalidar` sem gate**, 0/222 aceite humano; `arquivosVarridos` 1616 → **1619** (três arquivos novos) |
| Inventário de rotas `--check` | **OK** (101 rotas; `/admin/funcionarios` passou a 4 componentes) |
| `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | **OK** |
| `npm run reaudit:sec` | **35/35** âncoras, 3 artefatos |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades** |
| `git diff --check` | limpo |
| `next-env.d.ts` / `tsconfig.json` | `1862ac4b…` / `2128c956…`, preservados |
| Gate do portal (PostgreSQL descartável + Chromium) | **49/49** (era 47/47) |
| Migrações | **nenhuma criada ou alterada**; 001–181 imutáveis, próxima livre 182 |

Inventários foram **regenerados pelos scripts**, nunca à mão. As sondas temporárias e seus diretórios de build foram removidos; nenhum segredo, cookie, log ou dado real foi versionado.

## 7. Limitações e dívidas — o que NÃO foi resolvido

- **PATCH legado do RH continua 500** (`42P08`). A asserção do gate foi mantida; mudar o contrato/permissão dessa rota segue exigindo decisão explícita do proprietário.
- **Mensagens e evidências** continuam verificando apenas `is_hr_visible`, **não** o compartilhamento do relato. Medido: `GET /api/admin/employee-complaint-messages?complaint_id=` de relato **não compartilhado** devolve **200 com 0 itens** (sem vazar conteúdo hoje, mas sem a checagem). Nesta jornada a tela **não** exibe mensagens nem evidências e diz isso na tela.
- **Leitura administrativa global**, sem escopo automático por conta/unidade/contrato (herdado do canal).
- **Auditoria:** apenas a operação nova tem transação única e rollback provados. A auditoria administrativa das demais rotas continua fora de transação e absorvendo falhas.
- **Sem upload real**, sem anonimização, sem retenção configurada, sem e-mail (SMTP), sem worker/scheduler.
- **`admin|ti` na rota nova também exige compartilhamento** — comportamento documentado, não redução: eles mantêm o PATCH legado para qualquer relato.
- **Sem aceite humano, UAT, leitor de tela ou Windows real**; 0/222 com aceite humano e 0/222 com reauditoria integral. **Produção: NO-GO**; backup real, PITR/RPO/RTO, F02, B2 e provedores seguem pendências do proprietário.
- O cenário de navegador prova **comportamento automatizado**; não substitui revisão manual por papel.

## 8. Funcionalidades preservadas

Nenhuma rota, papel, permissão, campo, contrato ou aba existente foi removida, ocultada ou reduzida. Especificamente: os cinco despachos anteriores de reclamações, o canal do cliente (`/api/client/employee-complaints*`), o PATCH legado com seu `500` para RH e `200` para `admin|ti`, o console de TI com **23 abas** e **10 promoções**, as **9** abas anteriores de `RhWorkspace`, o `AdminGate(['rh','marcelo','admin','ti'])` da página e as migrações **001–181**. A mudança é aditiva: uma rota nova, uma aba nova, um componente novo e as provas.

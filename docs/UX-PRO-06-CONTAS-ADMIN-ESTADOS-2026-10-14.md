# UX-PRO-06 — estados de leitura de `/admin/clientes` (contas administrativas do cliente)

**Data:** 14/10/2026
**Escopo declarado antes da implementação:** [`docs/UX-PRO-06-CONTAS-ADMIN-ESCOPO-2026-10-14.md`](UX-PRO-06-CONTAS-ADMIN-ESCOPO-2026-10-14.md) (commit `e191ab2`, anterior a qualquer edição de tela, teste, gate ou inventário).
**Registro da base e da retomada:** [`docs/ARENA-RETOMADA-UX-PRO-06-CONTAS-ADMIN-2026-10-14.md`](ARENA-RETOMADA-UX-PRO-06-CONTAS-ADMIN-2026-10-14.md).

> **AVISO DE STATUS (acrescentado ao final desta sessão): esta implementação NÃO foi entregue.**
> Antes de abrir a PR, a sincronização da `main` mostrou que o mesmo recorte já havia sido
> mesclado pela **PR #218** (`27a26f8`, 14/10/2026 03:43:54Z), com implementação, gate focal
> (`npm run test:ux-client-admin:pg`), workflow, docs e evidências próprios. A reconciliação
> produz conflito de conteúdo em seis arquivos; resolvê-lo significaria substituir trabalho já
> entregue, o que `AGENTS.md` proíbe sem decisão explícita do proprietário. Este documento
> permanece como registro medido de uma implementação paralela **não mesclada**, preservada no
> commit `66fa00b` do branch da sessão. O registro vigente da fatia é
> [`docs/UX-PRO-06-CLIENTES-ESTADOS-2026-10-14.md`](UX-PRO-06-CLIENTES-ESTADOS-2026-10-14.md),
> e a colisão está documentada em
> [`docs/ARENA-RETOMADA-UX-PRO-06-CONTAS-ADMIN-2026-10-14.md`](ARENA-RETOMADA-UX-PRO-06-CONTAS-ADMIN-2026-10-14.md) §8.

Este documento descreve os estados que a tela passou a declarar, o que foi medido antes e depois, e o que **não** foi provado. Não declara validação manual nem aceite humano.

---

## 1. Rota, papéis e fonte de verdade

| Rota | Papéis (`AdminGate`) | Autorização real | Leitura compartilhada |
|---|---|---|---|
| `/admin/clientes` | `marcelo \| ti` (inalterado) | `requireAdminSession` em `src/server/client-space-api.mjs:150` — 401 `admin_session_required` sem sessão, 403 `forbidden` fora de `marcelo\|ti`, 403 `individual_staff_required` sem identidade individual | `GET /api/admin/client-accounts` → `{ accounts, limit, offset, role }` |

O `AdminGate` não foi tocado. Nenhuma URL, método, corpo, cabeçalho, papel, permissão, migração ou código de erro mudou.

## 2. Estados que a tela declara agora

Todos os estados abaixo são da **única leitura compartilhada** (cadastros centrais) e são declarados **uma vez**, acima das sete seções que consomem `accounts` — a faixa não é duplicada por seção.

| Estado | Condição | Apresentação | Marcador |
|---|---|---|---|
| Leitura em curso, sem leitura concluída | primeira carga | spinner "Carregando cadastros…" (como antes), agora com `role="status"` | `clientes-contas-carregando` |
| Leitura concluída | sucesso | lista de cadastros + seletores das sete seções | `clientes-contas-lista`, `clientes-contas-cadastro-<id>`, `clientes-contas-vazio` quando não há cadastro |
| Releitura em curso | `carregando` **com** leitura concluída | `role="status"` "Atualizando os cadastros de clientes…", **sem esconder o conteúdo** | `clientes-contas-atualizando` |
| Falha transitória depois de leitura concluída | rede/5xx | **preserva** `itens`; faixa `role="alert"` com o motivo real, "última leitura concluída, de `<hora>`", a negação explícita de "não haja cadastros" e "Tentar novamente" | `clientes-contas-desatualizada` |
| Falha transitória sem leitura anterior | rede/5xx na primeira carga | estado de falha `role="alert"` com motivo e "Tentar novamente"; **não** há spinner eterno, **não** há lista vazia, **não** há "Nenhum cadastro criado ainda" | `clientes-contas-falha` |
| Negativa (dúvida de autorização) | 401 ou 403 | **descarta** o dado lido: lista e seletores voltam a ficar sem cadastros, faixa `role="alert"` explicando que nada foi alterado e que o servidor confirma a sessão em cada leitura; **sem** botão de repetir a mesma chamada | `clientes-contas-negada` |

A hora exibida na faixa vem do **relógio do navegador no instante do sucesso** (`Date.now()` guardado em estado). Nenhum campo novo em banco, nenhum valor estimado, nada gravado.

Classificação da falha: `describeAdminReadError(code, status)` em `src/app/admin/clientes/admin-shared.ts` (acréscimo). Ela reusa o vocabulário já existente da tela (`explainApiError`) e devolve `kind` (`retry` / `denied` / `auth` / `error`), `title`, `detail` e `canRetry`. `callApi`, `jsonInit`, `explainApiError` e o mapa de mensagens **não foram alterados** — as escritas das dez seções continuam exatamente como estavam.

## 3. Comportamento preservado (nada removido, desativado ou renomeado)

- as dez seções e suas props: `GrantsSection`, `ContractsSection`, `DocumentsSection`, `TicketsSection`, `VisitsSection` e `ReportsSection` continuam recebendo `accounts: AdminAccount[] | null`; `InvitesSection` e `RecoveriesSection` continuam restritas ao papel `ti`;
- todas as escritas: criação de cadastro (`POST`), situação (`PATCH`), vínculos com motivo, contratos, documentos, chamados (assumir/resolver/reabrir), visitas e relatórios — mesmas URLs, métodos, corpos, `request_key`, mensagens `role="alert"`/`role="status"` de escrita e `busy` de envio;
- recarga depois de gravar (`reloadAccounts()`) e o botão "Recarregar lista", que ganhou apenas `data-testid`;
- textos e vocabulário: "Administração de clientes", o fluxo numerado 1–7 do cartão `#clientes-intro`, "1 · Cadastros centrais de clientes", "Carregando cadastros…", "Nenhum cadastro criado ainda. Comece pelo formulário acima.", rótulos `Ativa`/`Suspensa`/`Encerrada`, datas em `pt-BR`;
- estrutura e acessibilidade herdadas: `UiTaskWorkspace aria-labelledby="intro-title"` com o sumário de tarefas, `aria-labelledby="accounts-section-title"`, `label`/`htmlFor`, `maxLength`, `aria-label` do `select` de situação;
- estilos: as classes existentes de `AdminClientes.module.css` não foram alteradas; `.updating`, `.stale`, `.readFailure` e seus botões são acréscimos com os tokens `--ux-color-warning`/`--ux-color-error`, como em `Carteira.module.css` e `Contratos.module.css`. `UiWorkspace.module.css` e `UiTaskWorkspace.tsx` (compartilhados) **não foram tocados**;
- as leituras próprias das outras seções (grants, contratos, documentos, chamados, visitas, relatórios) mantêm o padrão anterior: não fazem parte desta fatia e não foram alteradas.

## 4. Antes — medido na `main` (`0e21c82`), com a tela intacta e apenas o gate novo presente

Metodologia: `git stash push` dos quatro arquivos de tela (page, AccountsSection, admin-shared, CSS), `.next/integration-ux-pro-06-clientes` removido para não reaproveitar compilação, e o gate executado com **somente** `tests/ux-pro-06-clientes-contas.integration.test.mjs`, `scripts/qa-ux-pro-06-clientes-postgres.mjs`, o script npm e o workflow acrescentados. Confirmado durante a medição: `git diff --stat HEAD -- src/app/admin/clientes` vazio e `catch {` ainda presente na linha 32 de `page.tsx`.

**Resultado: `tests 9 / pass 2 / fail 7 / skipped 0`, exit 1.**

| Caso do gate | Na `main` | Motivo medido |
|---|---|---|
| O contrato de leitura e escrita dos cadastros não mudou | **passou** | preservação que a correção precisava manter (401/403/200/201/PATCH/auditoria/405) |
| Menu não é autorização: comercial vê o gate negar e nenhuma lista | **passou** | o estado `data-admin-gate="forbidden"` já existia; a contagem de lista é 0 também porque o marcador ainda não existia — caso de preservação, não de defeito |
| Leitura concluída mostra os cadastros sem faixa alguma | **falhou** | `locator.waitFor: Timeout 60000ms` esperando `[data-testid="clientes-contas-lista"]` |
| Falha na releitura preserva os cadastros já lidos, com hora e repetição | **falhou** | timeout de 60 s esperando `[data-testid="clientes-contas-lista"]` |
| A repetição lê de verdade e traz o cadastro criado durante a falha | **falhou** | timeout de 60 s esperando `[data-testid="clientes-contas-lista"]` |
| Releitura em curso mantém o conteúdo visível com `role="status"` | **falhou** | timeout de 60 s esperando `[data-testid="clientes-contas-lista"]` |
| Falha na primeira leitura não vira "Carregando cadastros…" eterno | **falhou** | timeout de 60 s esperando `[data-testid="clientes-contas-falha"]` |
| Negativa na releitura falha fechada, sem dado preservado nem repetição | **falhou** | timeout de 60 s esperando `[data-testid="clientes-contas-lista"]` |
| 320/390/768/1440 dia e noite sem transbordo, com percurso de teclado | **falhou** | timeout de 60 s esperando `[data-testid="clientes-contas-lista"]` |

Defeitos lidos no código antes de editar (confirmados pela medição): `loadAccounts` terminava em `catch { /* As seções exibem erro próprio quando necessário. */ }` — falha depois de leitura concluída mantinha a lista antiga sem nenhum aviso; falha na primeira leitura deixava `accounts === null` para sempre (spinner eterno nas cadastros e seletores vazios nas outras sete seções, por `(accounts ?? [])`); releitura em curso não declarava nada; negativa 401/403 também caía no `catch {}` silencioso, mantendo o dado lido antes na tela.

**Não há capturas do estado "antes"**: os marcadores não existiam na `main` e a fatia não acrescentou um harness de captura ad hoc só para fotografar o defeito. O "antes" é a medição acima (2/9) mais a leitura do código, ambos reproduzíveis.

## 5. Depois — medido com a correção

**Gate focal novo: `npm run test:ux-pro-06-clientes:pg` → `tests 9 / pass 9 / fail 0 / skipped 0`, `UX_PRO_06_CLIENTES_TEST_EXIT: 0`**, com PostgreSQL 17 descartável (`seg_qa_ux_pro_06_clientes`), migrações 001–180 aplicadas, servidor real, sessão de staff individual provisionada pelo fluxo real de login, massa sintética criada pela própria API e Chromium real. A falha foi injetada apenas em `window.fetch` dentro da página (bandeira `window.__uxp06Falha` / atraso `window.__uxp06Atraso`); **o servidor nunca foi enfraquecido**.

| Check | Comando | Resultado |
|---|---|---|
| Gate focal novo | `npm run test:ux-pro-06-clientes:pg` | **9/9**, 0 pulados, exit 0 |
| Bateria de unidade | `npm test` | **933/933**, 0 pulados, exit 0 (contagem inalterada: a fatia não acrescentou teste unitário) |
| Typecheck | `npm run typecheck` | exit 0, sem diagnósticos |
| Build | `npm run build` (beta, noindex) | exit 0; `/admin/clientes` na lista de rotas |
| Onda 0 estática | `node scripts/qa-wave0-static.mjs` | **5/5** OK |
| Inventário | `node scripts/ux-pro-00-inventory.mjs --check` | OK — CSVs de 13/10 conferem com o código atual |
| Guardas estáticos herdados da rota | `node --test tests/admin-page-gates.test.mjs tests/client-offline-recovery.test.mjs` | **7/7**, 0 pulados |
| Gate herdado que alcança a tela | `npm run test:f03-client-ticket-acceptance:pg` | **1/1**, 0 pulados, exit 0 (navega até `/admin/clientes` em Chromium e opera a fila de chamados) |
| Gate L08 | `npm run test:l08-delivery:pg` | **51/51**, 0 pulados, `L08_DELIVERY_TEST_EXIT: 0` |
| Gate F01 de entrada administrativa | `npm run test:admin-entry:pg` | **13/13**, 0 pulados, exit 0 |
| `next-env.d.ts` / `tsconfig.json` | SHA-256 antes e depois de cada execução | **baseline preservado**: `18b697c4…11a2` e `2128c956…8d65`. `next build` reescreve `next-env.d.ts`; os gates que sobem workspace Next próprio (`integration-ux-pro-06-clientes`, `integration-f03-ticket`, `l08-browser-smoke`, `integration-admin-entry`) reescrevem os dois. Ambos foram restaurados do Git após cada execução e **não entram no diff** |

### Inventário: diferença por linha

`node scripts/ux-pro-00-inventory.mjs` regenerou os dois CSVs; `git diff --numstat` mostra **1 linha alterada em cada arquivo**, e a rota afetada é **somente `/admin/clientes`**:

- inventário (5 células): `gates_automatizados` `"" → ux-pro-06-clientes-delivery.yml`; `gates_jobs` `"" → ux-pro-06-clientes-postgres-browser`; `capturas_viewports` `"" → 1440x900|320x844|390x844|768x1024`; `capturas_stage` `"" → ux-pro-06-contas-admin`; `capturas_primeiro_foco` `nao → sim`;
- matriz (5 células): `responsividade` `sem captura; 320/390/768/1440 px nao verificados → capturado em 1440x900, 320x844, 390x844, 768x1024; faltam nenhum`; `teclado` `sem marcador e sem verificacao → primeiro foco registrado em captura; percurso completo nao verificado`; `evidencia` acrescenta `teste automatizado de jornada: ux-pro-06-clientes-delivery.yml` e `captura visual: ux-pro-06-contas-admin @ …`; `classe_evidencia` `codigo → captura visual`; `lacuna` perde `sem gate automatizado que alcance a rota` e `sem captura visual`.

Nenhuma outra rota mudou. `validacao manual: nao_registrado` e `aceite humano: nao_registrado` permanecem em todas as linhas — o gerador nunca os infere.

## 6. Evidências

`docs/ux-pro-06-contas-admin-evidencias/` — 13 capturas PNG (8,6 MB) + `resumo.json` com 8 entradas legíveis por máquina, geradas pelo próprio gate (`UX_PRO_06_CLIENTES_EVIDENCE_DIR`):

- 320/390/768/1440 px em dia e 768 px à noite, pelo controle real do envelope (`data-admin-theme-toggle`), **sem transbordo de documento em nenhuma largura** (`problems: []`);
- percurso de teclado em 390 px: primeiro foco com foco visível medido (`firstFocus: true`), do início da página até `clientes-contas-recarregar`, passando por `#new-account-name`;
- faixa de dados preservados em 320 px e 1440 px com **contraste medido de 6,54:1** (texto sobre `--ux-color-warning-soft`), sem transbordo;
- estados capturados: leitura concluída, releitura em curso, dados preservados, falha sem leitura anterior e negativa.

Nenhuma captura contém dado pessoal, credencial ou segredo: a massa é sintética, criada pela API canônica com nomes como "Condomínio Sintético UX-PRO-06 <uuid>", e as senhas de teste vêm do helper de staff com valor fixo sintético já usado pelos demais gates.

## 7. Limitações (declaradas, não escondidas)

1. **Não há validação manual nem aceite humano.** Chromium automatizado com PostgreSQL descartável e massa sintética não é revisão de Marcelo, Andreia ou TI, nem homologação. O inventário continua registrando `validacao manual: nao_registrado` e `aceite humano: nao_registrado`.
2. A falha é injetada em `window.fetch` **dentro da página**; o servidor e a API nunca foram enfraquecidos. O gate prova a apresentação sob falha, **não** o comportamento sob falha real de infraestrutura, rede ou banco.
3. A hora da faixa é o relógio do navegador no instante do sucesso; não há servidor de tempo nem campo novo em banco. Enquanto a faixa está visível, o conteúdo é o da última leitura concluída — a faixa diz isso, e repetir a consulta atualiza de verdade (provado pelo cadastro criado durante a falha, que só aparece depois de a repetição concluir).
4. Ao clicar em "Tentar novamente", a faixa sai imediatamente e o indicador `role="status"` assume o lugar dela durante a releitura; o conteúdo preservado continua visível nesse intervalo.
5. A faixa cobre **apenas a leitura compartilhada dos cadastros**. As leituras próprias das outras seções (grants, contratos, documentos, chamados, visitas, relatórios) mantêm o padrão anterior e são escopo de outras fatias.
6. O texto estático da matriz (`tema noturno sem captura`, `percurso completo nao verificado`, `percurso de teclado nao verificado`, `estados nao exercitados em navegador`) é fixo do gerador de inventário e não interpreta o `resumo.json` — a captura noturna em 768 px e os estados exercitados existem no gate, mas a célula não os descreve.
7. Sem Windows, sem HTTPS hospedado e sem banco do operador nesta verificação. Os três testes de backup/CLI que falham com `EPERM` de symlink no Windows do operador não foram alterados, pulados nem enfraquecidos; em Linux/Node 22 a bateria passa 933/933 (ver §3 do registro de retomada).
8. Esta fatia **não** conclui a UX-PRO-06. Não foram tocados `/admin/contratos`, `/admin/contratos/[id]`, `/admin/comercial`, `/admin/crm`, `/admin/leads`, `/admin/carteira` (entregues em #210–#214, #216, #217), `/admin/portal/*` nem o portal `/cliente/app/*`.
9. A PR #215 (fechada, obsoleta desde a #216) não foi reaberta, mesclada ou fechada aqui; a decisão sobre ela é do proprietário.

# UX-PRO-06 — estados da leitura dos cadastros centrais de clientes (`/admin/clientes`)

**Base:** `main` `0e21c82df87860df786cadb995f687a4c9d8d213` (merge da PR #217).
**Escopo registrado antes de tocar em tela:** [`UX-PRO-06-CLIENTES-ESCOPO-2026-10-14.md`](UX-PRO-06-CLIENTES-ESCOPO-2026-10-14.md) (commit isolado `a0833da`, anterior à implementação).
**Superfície desta PR:** a leitura `GET /api/admin/client-accounts` — a lista de cadastros centrais que alimenta a seção 1 e, pelo mesmo dado, as seções 2–7 — e a sua apresentação em `/admin/clientes`. **Não é a conclusão de UX-PRO-06.**

**Divergência de base, registrada:** o pedido esperava retomar o branch `arena/ux-pro-06-client-admin-accounts`; ele **não existe** no remoto (API 404, `git fetch` sem a referência, nenhuma PR) nem neste clone (sem stash, sem reflog, nenhuma ocorrência do nome). A fatia foi **reconstruída do zero** nesta sessão, no branch fixo dela — ver §0 do documento de escopo. Se o branch original reaparecer, esta PR pode ser fechada ou substituída pelo proprietário.

**Fora desta PR, deliberadamente:** as seções 2–7 (`GrantsSection`, `ContractsSection`, `DocumentsSection`, `TicketsSection`, `VisitsSection`, `ReportsSection`) e `InvitesSection`/`RecoveriesSection` — nenhuma reescrita; `/admin/contratos`, `/admin/contratos/[id]`, `/admin/comercial`, `/admin/crm`, `/admin/leads`, `/admin/carteira` (entregues em #210–#217, nenhuma reaberta); o portal `/cliente/app/*`; `UiWorkspace.module.css` (compartilhado, **não alterado**); APIs, papéis, permissões, auditoria, idempotência, migrações e dados canônicos. A PR #215 (obsoleta) **não** é tocada aqui.

## Antes (medido em `0e21c82`, worktree descartável limpo, só com o teste focal e o gate)

A suíte focal rodada contra a `main`, **sem nenhuma edição de tela**: **4 falharam (defeitos) e 2 passaram (preservações)**. Medições em [`antes/antes-medicoes.json`](ux-pro-06-clientes-evidencias/antes/antes-medicoes.json); o `UX_CLIENT_ADMIN_TEST_EXIT` foi `1`.

| Caso | Resultado na `main` | Evidência |
|---|---|---|
| Falha da leitura inicial não vira "carregando" eterno | **falha** | timeout de 45 s esperando `clientes-cadastros-falha`: o erro era engolido em `loadAccounts` e a seção 1 girava "Carregando cadastros…" para sempre — falha apresentada como carregamento (D1) |
| Falha na releitura preserva o que já foi lido, com hora e repetição | **falha** | timeout de 45 s esperando `clientes-cadastros-desatualizada`: a lista antiga continuava na tela sem motivo, sem hora e sem repetição (D2) |
| Releitura em curso mantém o conteúdo e anuncia com `role="status"` | **falha** | timeout de 20 s esperando `clientes-cadastros-atualizando`: "Recarregar lista" não anunciava progresso (D4) |
| Negativa na releitura descarta o dado e não oferece repetir | **falha** | timeout de 45 s esperando `clientes-cadastros-negado`: um 403 na releitura mantinha o cadastro (nome do cliente) visível — falha ABERTA (D3) |
| 401 sem sessão e 403 para papel sem acesso, decididos no servidor | passa | preservação: o servidor já decidia (`admin_session_required` sem cookie; `forbidden` para `rh`) e continua decidindo |
| 320/390/768/1440 dia e noite sem transbordo, com percurso de teclado | passa | preservação de layout, tema e foco |

O mesmo defeito de "releitura que apaga ou esconde" já havia sido corrigido no funil (#212), na carteira (#213), no comercial (#214), na lista de contratos (#216) e no detalhe do contrato (#217); a leitura dos cadastros centrais era a que ficou para trás — e, além daqueles, tinha o defeito **exclusivo** de falhar aberta numa negativa de autorização.

## Depois

Na branch, a suíte focal passa **6/6** (0 pulados).

- **Falha da leitura inicial é declarada, com repetição.** Sem leitura concluída, a seção 1 troca o bloco de carregamento por `UiState variant="error"` (`data-testid="clientes-cadastros-falha"`, `role="alert"`) com o motivo real devolvido pelo servidor e o botão "Tentar novamente" — que relê de verdade: no caso exercitado, a lista aparece com o cadastro criado pela API.
- **As seções 2–7 deixam de fingir lista vazia.** Enquanto a leitura não concluiu, a tela publica um aviso único (`data-testid="clientes-cadastros-indisponivel"`, `role="alert"`) explicando que os seletores das seções 2–7 ficam vazios por causa da leitura — ausência de dado não é apresentada como ausência de cadastros. O aviso sai quando a leitura conclui.
- **Falha de releitura preserva o que já foi lido.** Faixa `role="alert"` (`data-testid="clientes-cadastros-desatualizada"`) com o motivo real, a **hora da última leitura concluída** (relógio do navegador no instante do sucesso; nada é estimado nem gravado), a declaração de que não se trata de lista vazia e o botão "Tentar novamente".
- **Releitura em curso anuncia sem esconder.** Indicador `role="status"` (`data-testid="clientes-cadastros-atualizando"`) com a lista visível; o bloco "Carregando cadastros…" continua existindo **apenas** enquanto não houve nenhuma leitura concluída.
- **Negativa de autorização falha fechada.** 401/403 na releitura **descarta** o dado lido, substitui o conteúdo pelo estado negado (`data-testid="clientes-cadastros-negado"`, `UiState variant="denied"`) e **não** oferece repetir a mesma chamada. O nome do cliente deixa de ser exibido no mesmo instante em que o servidor nega — o defeito mais grave desta tela, e o único da família que não existia nas telas já corrigidas.
- **O motivo da negativa virou frase.** `forbidden` (403 de papel sem acesso) passou a ter tradução em `admin-shared.ts` — antes caía no texto genérico de "resposta inesperada". O código canônico continua sendo o que o servidor devolve.
- **A leitura é identificada por classe de erro.** `callApi` passa a devolver `AdminApiError` com `status`, código e `kind` (`auth` | `denied` | `transient`); a mensagem em português exibida pelos formulários **não mudou** e os demais consumidores do módulo (todos dentro da pasta `clientes`) seguem lendo `cause.message`.
- **Estilos**: as classes novas (`updating`, `stale`, `unavailable`) vivem em `AdminClientes.module.css`, módulo **local da própria pasta**, com os mesmos tokens de aviso das fatias irmãs. `UiWorkspace.module.css` não foi alterado e nenhum `style` inline foi criado.
- **O layout em repouso não mudou — conferido por medida, não por impressão.** As capturas de repouso de 1440 px dia, 768 px dia, 768 px à noite, 390 px dia e 320 px dia são **byte a byte idênticas** (SHA-256 conferido par a par) às capturas da `main` **sem** a correção. A única captura que difere é a do percurso de teclado, e a diferença está confinada ao retângulo do foco do campo: **4.705 pixels** de 390×7.066, na caixa `x 0–77 × y 790–877` (medida por comparação pixel a pixel em Chromium).

**Preservado sem alteração:** `AdminGate` (`marcelo | ti`) e a decisão de autorização no servidor; `InvitesSection`/`RecoveriesSection` só para `ti`; o cabeçalho "Administração de clientes" e o parágrafo "Fluxo em ordem: 1 … 7"; a ordem das seções; as URLs, métodos e corpos de todas as leituras e escritas das oito seções; o fluxo de criação de cadastro e de alteração de situação, com o aviso `role="status"`; os estados de carregamento e de lista vazia legítima; o vocabulário em português (`accountStatusLabel`); os alvos de toque ≥ 44 px.

## Evidência própria

Pasta [`ux-pro-06-clientes-evidencias/`](ux-pro-06-clientes-evidencias/): `resumo.json` (formato do inventário) com 9 entradas — 320/390/768/1440 px em dia, 768 px à noite (pelo controle real do envelope), percurso de teclado em 390 px com foco visível medido, a falha inicial declarada, a faixa de dados preservados na releitura e o estado negado. Nenhum transbordo de documento em nenhuma largura. Massa 100% sintética; sem credencial, dado pessoal ou URL efêmera. Isto **não** é aceite humano.

A subpasta [`antes/`](ux-pro-06-clientes-evidencias/antes/) guarda as capturas e medições da `main` **sem** a correção, fora do `resumo.json` vigente de propósito: documentam o defeito corrigido, não a evidência vigente.

## Verificações

| Check | Resultado |
|---|---|
| `npm run typecheck` | aprovado |
| `npm test` | **933/933**, 0 pulados — depois de regenerar os CSVs (ver nota abaixo) |
| `npm run build` | aprovado; `/admin/clientes` presente na lista de rotas (`✓ Compiled successfully in 12.4s`) |
| `node scripts/qa-wave0-static.mjs` | **5/5** (`RESUMO: 5/5 verificações estáticas OK; 0 imports ausentes; 0 migrações ausentes`) |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK (após a regeneração feita pelo próprio gerador) |
| `npm run test:ux-client-admin:pg` | **6/6**, 0 pulados (`UX_CLIENT_ADMIN_TEST_EXIT: 0`) |
| `npm run test:l08-delivery:pg` | **51/51**, 0 pulados (`L08_DELIVERY_TEST_EXIT: 0`) — igual ao baseline da `main` medido nesta sessão |
| `next-env.d.ts` / `tsconfig.json` | baseline conferido por SHA-256 **depois de cada execução**; os gates de navegador (`NEXT_DIST_DIR`) reescrevem os dois arquivos, e ambos foram **restaurados do Git** ao fim (hash final `18b697c4…` / `2128c956…`, idênticos ao baseline) |
| CSVs do inventário | regenerados pelo próprio gerador; conferência por linha mostra que **somente `/admin/clientes`** muda — uma linha em cada arquivo —, saindo de "codigo / sem gate" para "captura visual + teste automatizado de jornada (`ux-client-admin-delivery.yml`, job `ux-client-admin-postgres-browser`)" |
| Capturas de repouso (antes × depois) | 1440/768/768-noite/390/320 px dia-noite **byte a byte idênticas** (SHA-256 par a par); só a captura de teclado difere, e apenas no retângulo do foco (4.705 px de 390×7.066, caixa `x 0–77 × y 790–877`) |

**Nota honesta sobre o `npm test`:** a primeira execução da bateria nesta branch deu **930/933**. Não é o `EPERM` do Windows: os três reprovados eram `tests/ux-pro-00-inventory.test.mjs`, que roda o gerador com `--check` e, corretamente, **reprova enquanto os CSVs versionados estiverem desatualizados** em relação ao código. Regenerados os CSVs (passo seguinte da mesma bateria), `npm test` volta a **933/933** e `--check` responde `OK`. Ou seja: a assinatura "930/933" aparece por duas causas distintas — CSVs desatualizados (resolvido aqui) e falta do privilégio de *symlink* no Windows (registrado em Limitações).

## Limitações

- A faixa usa o relógio do navegador no instante do sucesso da leitura; não há servidor de tempo nem campo novo em banco.
- Enquanto a faixa está visível, a lista exibida é a da última leitura concluída — a faixa diz isso, e repetir a consulta atualiza de verdade.
- **As seções 2–7 não repetem o aviso individualmente.** Cada uma recebe `accounts` como antes; quando a leitura nunca concluiu, existe **um** aviso no alto da tela declarando o impacto nos seletores delas. Quando a falha é de releitura, os seletores seguem com a última lista lida (comportamento anterior preservado) e a faixa da seção 1 declara a idade do dado. Declarado, não escondido.
- O teste focal exercita a lista com um cadastro real criado pelas APIs; não exercita paginação (`limit`/`offset`) nem filtro por situação.
- **`npm test` em Windows:** os três testes que criam *symlink* (`tests/qa-backup-coverage-inventory.test.mjs`, `tests/qa-cli-v2-local-provider.test.mjs`, `tests/qa-cli-v2-transfer.test.mjs`) falham com `EPERM` quando o processo não tem `SeCreateSymbolicLinkPrivilege`. Isso **não** é problema de caminho: trocar `TEMP`/`TMP` para outro volume (`F:\SegSystem-QA-Temp`, como na retomada relatada) não concede o privilégio. Caminhos suportados: (a) habilitar **Modo de Desenvolvedor** (Windows 10 1703+) ou executar o processo **elevado**, que passam a conceder o privilégio ao usuário; (b) rodar no ambiente suportado do CI (`ubuntu-latest`) ou em Linux/WSL — verificado nesta sessão: os três arquivos passam **11/11** e a bateria completa passa **933/933**. **Nenhum teste foi alterado, pulado ou enfraquecido por esta fatia** e nenhum deles pertence a este recorte.
- Chromium automatizado com massa sintética **não é validação manual nem aceite** de Marcelo, Andreia, TI ou comercial. Sem Windows, HTTPS hospedado ou banco do operador.
- A ausência do branch `arena/ux-pro-06-client-admin-accounts` e a decisão sobre a PR #215 permanecem com o proprietário.

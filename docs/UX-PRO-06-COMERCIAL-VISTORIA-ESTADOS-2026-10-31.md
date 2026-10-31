# UX-PRO-06 — Vistoria (`/admin/comercial`, 1ª etapa): estado de leitura honesto numa superfície viva sem prova

**Data:** 31/10/2026 · **Base medida:** `d9d2356` (`main`, merge da PR #320) · **Branch da sessão:** `arena/b924e565-gruposegsystemseguranca`.

**Entrega:** **PR #321 aberta** (não mergeada) a partir de `arena/b924e565-gruposegsystemseguranca`. Mergear não altera o estado do produto: continua sem aceite humano (**0/222**) e produção **NO-GO**.

**Natureza:** entrega local com prova em PostgreSQL 17 descartável + HTTP real + Chromium. **Não** é aceite humano, UAT, homologação nem autorização de produção. Produção permanece **NO-GO** (`docs/PRODUCAO-GATE.md`). Nenhum requisito da matriz de 222 foi promovido: `aceite_humano` segue `nao_registrado` em **0/222** e `reauditoria_integral` segue `nao_executada`.

## 1. Sincronização, leitura e escolha da fatia

`git fetch origin` + `git status --porcelain` + `git log origin/main` foram executados antes de qualquer edição. A árvore estava **limpa** e `HEAD` era **idêntico** a `origin/main` (`d9d2356`, merge da PR #320); nenhum `reset` foi necessário e nada foi descartado. As PRs **#319** (`2976c70`, jornada do RH em reclamações compartilhadas) e **#320** (reconciliação do ledger) já estavam **mergeadas** — nada dessa jornada foi reimplementado.

Foram lidos, na ordem pedida, `AGENTS.md`, `README.md`, `docs/STATUS-VIGENTE.md`, `docs/UX-PRO-03-RH-RECLAMACOES-COMPARTILHADAS-ESTADO-2026-10-30.md`, `docs/UX-PRO-03-RH-RECLAMACOES-COMPARTILHADAS-2026-10-29.md` e `docs/PRODUCAO-GATE.md` — antes de qualquer leitura de código.

**Inventário da família UX-PRO-06 (medido, não copiado):** as telas da família já entregues (carteira, funil, fila de pedidos, histórico comercial, contratos lista/detalhe, cadastros centrais de cliente) têm gate de navegador próprio. A **primeira etapa** de `/admin/comercial` — a aba **Vistoria**, que é o conteúdo default da tela — é diferente:

| Verificação de inventário (antes de editar) | Medido |
|---|---|
| Referências a `InspectionClient` em `tests/` e `scripts/` | **0** |
| Referências a `/api/crm/inspections` em `tests/` | 1 chamada de API em outro gate (`l04`), nenhuma na tela |
| O gate de navegador de `/admin/comercial` abre a aba Vistoria? | **Não**: as asserções cobrem a casca (oito etapas), o histórico de versões, larguras, teclado, tema e o gate de papel |
| O próprio gate declara o limite | `tests/ux-crm-workspace.integration.test.mjs`: "Componentes de domínio das etapas (`src/app/admin/ti/*`) são medidos apenas pela casca; não foram alterados nesta fatia" |
| `.github/workflows/ux-crm-delivery.yml` dispara em `src/app/admin/comercial/**` | **Sim** — o workflow dispara para um arquivo que nenhum cenário seu exercita |

Estado de leitura do componente na base (lido no código): `loadTemplates` tinha `catch {}` — falha de checklist virava **"Templates (0)"**, indistinguível de "não há checklist"; `error` recebia `e.message`, isto é, o **código técnico do servidor** (`inspection_unavailable`, `create_failed`) ia cru para a tela; `inspections` começava em `[]`, então a primeira leitura pendente já se apresentava como **lista vazia**; `data.inspections || []` aceitava resposta sem lista como vazio; não havia sequência de leitura, então uma resposta atrasada podia **sobrescrever** a mais recente; não havia vazio explícito, negado explícito nem repetição; os campos não tinham nome acessível (só `placeholder`).

**Decisão (delegada pelo proprietário):** fechar esta superfície viva, aditiva e verificável, em vez de criar tela nova. Isto realiza o item (a) das candidatas — uma superfície real por vez, com carregando/vazio/erro/negado/retry, sequência contra respostas fora de ordem, validação de arrays e quatro larguras.

## 2. Sonda real antes de implementar

| Sonda (base limpa) | Resultado medido |
|---|---|
| Gate `test:ux-crm:pg` filtrado em `UX_CRM_TEST_PATTERN='comercial'` | **6/6**, 0 falhas — a base estava verde antes de qualquer edição |
| Teste focal novo (área nomeada, 9 asserções) | **RED 4/9** — as 5 asserções de estado falham; as 4 de contrato do servidor já passam |
| Cenários de navegador novos | **RED 0/5** — `locator.waitFor: Timeout 30000ms exceeded ... section[aria-labelledby="vistoria-titulo"]`, porque a superfície não declarava nenhum dos estados |

O RED é de **produto**, não de ambiente: o mesmo cluster/Chromium fechou 6/6 nos cenários existentes na mesma sessão, e as asserções de contrato do servidor (que não dependem da tela) já passavam no RED.

## 3. O que mudou (aditivo, sem tocar contrato)

Somente a **leitura de estado** da tela, em `src/app/admin/ti/InspectionClient.tsx` + módulo de estilos próprio `InspectionClient.module.css` (apenas tokens semânticos; o tema noturno continua valendo):

- **Carregando / atualizando / atualizado / vazio / desatualizado / erro / negado** declarados com `role="status"` ou `role="alert"` e `data-testid` próprio; `aria-busy` na área da tabela.
- **Vazio ≠ falha ≠ negado**: o vazio só aparece **depois** de uma leitura concluída com zero registros; a falha diz que nada foi lido **e** que isso não significa ausência de vistoria; a negativa não preserva dado anterior e **não** oferece repetir a mesma chamada.
- **Sequência própria de leitura** (`readSequence`) e de checklist (`templateSequence`): só a leitura mais recente publica resultado, e uma resposta fora de ordem não sobrescreve a tela nem deixa "carregando" preso.
- **Falha de checklist deixa de ser engolida** (`catch {}` removido): passa a ter anúncio próprio, com repetição só quando é recuperável.
- **Validação de arrays**: `Array.isArray` em `inspections`, `templates` e em `checklist` de cada template; item sem `id` não é renderizado.
- **Tradução dos códigos técnicos**: `admin_session_required`, `same_origin_required`, `inspection_unavailable`, `invalid_company_id`, `invalid_title`, `invalid_request`, `create_failed` e falha de rede viram mensagens em português; nenhum código cru vai para a tela.
- **Escrita preservada e declarada**: mesmo `POST /api/crm/inspections`, mesmo corpo, mesmos campos obrigatórios; o botão declara `aria-busy` durante o envio, mostra o resultado ("Vistoria criada às hh:mm") e relê a lista depois de criar.
- **Acessibilidade do formulário**: rótulos visíveis (`<label htmlFor>`) + `aria-label` em cada campo; `<caption>` na tabela; foco visível em controles e botões. Todos os campos, placeholders, limites (`maxLength={200}`), o `select` de checklist e os botões **continuam existindo**, com os mesmos rótulos e a mesma ordem de tela.

**Preservado sem alteração:** `src/server/inspection-api.mjs` (nenhuma linha), o despacho em `server.mjs`, `ComercialWorkspace.tsx` (a etapa continua renderizando `<InspectionClient />`), `UiWorkspace.module.css`, `Comercial.module.css`, o `AdminGate` de `/admin/comercial` (`comercial|marcelo|admin|ti`), as migrações 001–181, o PATCH legado do RH (continua 500, asserção intacta), as rotas de mensagens/evidências (continuam sem checar o compartilhamento do relato), as 24 abas/11 promoções do console e a fila de 222.

## 4. Prova RED → GREEN

| Prova | Antes (RED) | Depois (GREEN) |
|---|---|---|
| `tests/ux-pro-06-comercial-vistoria-estados.test.mjs` (no `test:unit`, 162º arquivo) | **4/9** | **9/9** |
| Cenários novos no gate `test:ux-crm:pg` | **0/5** | **5/5** |
| Gate CRM completo (PostgreSQL 17 descartável + Chromium) | 37 cenários antes desta fatia | **42/42**, 0 falhas, 0 skips |
| `npm test` | 1245/1245 | **1254/1254** |

Cenários novos, um por requisito do método:

1. **Papel autorizado + escrita real com status e corpo** — o comercial cria a empresa pela API, cria a vistoria **pela tela**, e o teste afirma `201` + corpo (`title`, `company_id`, `status` rascunho), a linha na tabela, a conferência por HTTP independente e o `401 admin_session_required` do anônimo.
2. **503 com repetição** — falha forçada na leitura: alerta sem código técnico, sem "vazio", sem tabela, **uma** oferta de repetir; a repetição relê de verdade e publica a lista.
3. **Resposta fora de ordem** — as leituras iniciais ficam retidas enquanto a releitura responde primeiro; quando as antigas chegam, o conteúdo publicado continua sendo o mais recente, o rótulo antigo (`VISTORIA-ANTIGA`) **não** aparece e o estado de carregamento não fica preso; a releitura em curso mantém a tabela visível com anúncio próprio.
4. **Vazio e larguras** — vazio forçado: `vistoria-vazio` presente, nenhum alerta, tabela ausente, checklist vazio declarado como vazio; medição de transbordo em **320/390/768/1440 px** nos estados vazio e falha (0 px de sobra) e contraste do texto de vazio no tema noturno ≥ 4,5:1.
5. **Negado** — `401` forçado na leitura: bloco negado sem código cru, sem repetição e sem dado preservado; papel `rh` continua barrado pelo `AdminGate` e não vê a superfície.

## 5. Limitações declaradas

- A tela **não** cria checklist, **não** responde item de checklist, **não** anexa foto e **não** pagina além do `limit=50` já existente: isso é o contrato atual do componente e da rota, preservado de propósito.
- O anexo de fotos continua sendo apenas um dos campos lidos/exibidos; **não há upload real** de arquivo (dívida já registrada no ledger).
- **Divergência de autorização preservada, não corrigida:** a rota `/api/crm/inspections` exige **sessão**, sem lista de papéis, enquanto a tela `/admin/comercial` libera `comercial|marcelo|admin|ti`. Qualquer sessão staff consegue ler pela API. Restringir seria reduzir permissão atual — decisão do proprietário, fora desta fatia.
- A prova é **automatizada** (Chromium headless em cluster descartável): não é validação manual, leitor de tela, UAT nem aceite de Marcelo, Andreia, comercial ou TI. **0/222 com aceite humano.**
- Backup real, F02, B2, matriz de autorização e provedores seguem pendentes do proprietário. **Produção: NO-GO.**

## 6. Bateria executada nesta sessão

`npm test` **1254/1254** · `npm run test:unit` (162 arquivos explícitos) · `npm run typecheck` 0 erros · `npm run build` · `node scripts/qa-wave0-static.mjs` · os quatro inventários `--check` · `npm run reaudit:sec` · `npm audit --audit-level=moderate` · `git diff --check` · SHA-256 de `next-env.d.ts` (`1862ac4b…`) e `tsconfig.json` (`2128c956…`) preservados · `test:ux-crm:pg` **42/42** · gate do portal `qa-ux-portal-postgres.mjs` **49/49** · `test:ux-hr:pg` **20/20**.

Vale a armadilha conhecida de ambiente: se o Chromium empacotado morrer com SIGSEGV, a execução é repetida (base limpa e árvore alterada, duas execuções cada) antes de culpar o código; nenhuma execução desta fatia caiu por isso.

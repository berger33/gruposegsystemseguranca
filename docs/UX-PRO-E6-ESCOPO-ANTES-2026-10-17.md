# UX-PRO-E6 — escopo ANTES (17/10/2026)

**Subfatia:** E6 — `<main>` aninhado transversal (memória do cronograma: 19 rotas, `AdminGate.tsx:115`).
**Branch:** `arena/c4d6838c-gruposegsystemseguranca` · **Base:** `origin/main` = `1aa1261204d6d94f7fbfc5ccd2ea9ebc7fc45c74` (merge da PR #261, UX-PRO-09E corrigida), confirmada por `git fetch origin main` nesta sessão. Árvore limpa antes de qualquer alteração.
**Guardas de arquivo:** `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` e `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` — conferidos **antes** e cópias salvas em diretório fora do Git para restauração somente por cópia (nada de `git checkout --`, `git clean`, `git reset --hard` ou revert).
**PR #234:** aberta, `arena/c544b76f-gruposegsystemseguranca`, `CONFLICTING` — **intocada** nesta subfatia.
**Este documento não declara aceite humano, UAT nem conformidade WCAG. Homologação e produção permanecem NO-GO.**

---

## 1. Origem confirmada no código

O caminho da memória (`src/components/AdminGate.tsx:115`) mudou: o shell está em **`src/app/admin/AdminGate.tsx`**. Comportamento observado no SHA-base:

- `AdminChrome` (renderizado pelo `AdminGate` nos estados `ready` e `forbidden`) emite o marco do shell: `src/app/admin/AdminGate.tsx:115` — `<main className={styles.page} data-admin-theme-scope="true">` — que envolve **header + navegação lateral + breadcrumb + `{children}`**.
- Os estados transitórios do gate emitem `<main>` próprio e **mutuamente exclusivos**: `:234` (`checking`) e `:247` (`error`) — cada documento renderiza exatamente um deles por vez.
- As páginas em `/admin/*` sob `AdminGate` emitem **outro `<main>`** no conteúdo (`styles.workspace`, `styles.page` ou `style` inline), dentro do `<main>` do shell → **`<main>` aninhado (inválido por HTML: um documento não pode ter dois `main`)**.
- **Nenhum** `<main>` do repositório declara `aria-label`/`aria-labelledby` (varredura em `src/**/*.tsx`): não há nome acessível de marco em jogo.
- O tema administrativo (dia/noite) aplica-se por `html body main[data-admin-theme-scope="true"] …` em `src/app/admin/admin-theme.css:2` e seguintes — o seletor **acopla o tema ao `<main>` do shell**. Os `<main>` de página **não** carregam `data-admin-theme-scope`; recebem o tema como descendentes do shell.

## 2. Reconciliação da memória “19 rotas” × base real

A memória “19 rotas” (CRONOGRAMA e 07D-1: “padrão transversal de 19 rotas”) **não enumera as rotas em lugar algum**. Medições da base real (`1aa1261`):

| Conjunto | Contagem | Critério |
|---|---|---|
| Rotas `/admin/*` com `<main>` de conteúdo aninhado ao `<main>` do shell | **28** (27 componentes; `/admin/tema` reutiliza `PublicationClient`) | página sob `<AdminGate>` + `<main>` alcançável no grafo de imports da página |
| Subconjunto “padrão transversal” UiWorkspace (`<main className={styles.workspace}>` de `components/ui/UiWorkspace.module.css`) | **exatamente 19** | coincide com a memória — provável origem da contagem do PR #229 |
| Demais rotas `/admin` com o mesmo defeito (classes próprias/inline) | **9** | `/admin/crm`, `/admin/pendencias`, `/admin/publicacao`, `/admin/tema`, `/admin/portal/{alertas,autocadastro,convites,permissoes,solicitacoes}` |
| Documentos `/cliente/app/*` com `<main>` aninhado a **outra origem** | **2** | `/cliente/app/cobrancas` (`page.tsx:15`) e `/cliente/app/portal` (`page.tsx:3`) dentro do `<main>` de `src/app/cliente/RealAccessShell.tsx:26` (layout `src/app/cliente/app/layout.tsx`) |
| Demais rotas do repositório | 1 `<main>` por documento/estado | site público (`PublicSite`, `Layout01–10`), prévias `/cliente/*`, `/funcionario`, `/admin/entrar`, `/admin/convite`, `/admin/verificacao-manual` — cada `<main>` está em ramos mutuamente exclusivos, sem aninhamento |

**Decisão de escopo E6:** o item E6 está definido como “o shell administrativo emite `<main>` enquanto páginas em `/admin/*` também emitem o seu”. As **28 rotas `/admin`** estão **dentro** dessa definição (a contagem 19 era estimativa do padrão UiWorkspace) e serão corrigidas. Os **2 documentos `/cliente/app`** têm a **mesma classe de defeito, mas outra origem** (`RealAccessShell`, família do portal do cliente com pendências próprias — ID3): ficam **registrados como resíduo numerado** para decisão item a item, sem alteração nesta subfatia (regra de preservação: somente a mudança expressamente autorizada).

## 3. Enumeração das 28 rotas afetadas — estrutura e semântica observadas

Em todas: o `<main>` de conteúdo é **descendente direto/indireto** do `<main>` do shell (`AdminGate.tsx:115`), **sem nome acessível**, e é o único `<main>` da página (as demais rotas `/admin` não emitem `<main>` e dependem exclusivamente do marco do shell — ver §4).

| # | Rota | `<main>` de conteúdo (file:line) | Atributos observados | Conteúdo/identidade (h1) |
|---|---|---|---|---|
| 1 | `/admin/analytics` | `src/app/admin/analytics/AnalyticsWorkspace.tsx:273` | `className={styles.workspace}` `data-testid="analytics-workspace"` | Analytics e experimentos A/B controlados |
| 2 | `/admin/carteira` | `src/app/admin/carteira/page.tsx:160` | `className={styles.workspace}` | Carteira e próximos contatos |
| 3 | `/admin/comercial` | `src/app/admin/comercial/ComercialWorkspace.tsx:61` | `className={styles.workspace}` | Vistoria, orçamento, proposta e contrato |
| 4 | `/admin/compliance` | `src/app/admin/compliance/ComplianceWorkspace.tsx:671` | `className={styles.workspace}` `data-testid="compliance-workspace"` | Compliance corporativo e obrigações internas |
| 5 | `/admin/conhecimento` | `src/app/admin/conhecimento/KnowledgeWorkspace.tsx:417` | `className={styles.workspace}` | Base de Conhecimento e Procedimentos Operacionais |
| 6 | `/admin/continuidade` | `src/app/admin/continuidade/ContinuityWorkspace.tsx:36` | `className={styles.workspace}` | Continuidade de negócios e contingência |
| 7 | `/admin/contratos` | `src/app/admin/contratos/ContractWorkspace.tsx:222` | `className={styles.workspace}` `data-testid="contracts-workspace"` | Contratos e implantação |
| 8 | `/admin/contratos/[id]` | `src/app/admin/contratos/[id]/ContractWorkflowClient.tsx:319` | `className={styles.workspace}` `data-testid="contract-detail"` | título do contrato (dinâmico) |
| 9 | `/admin/crm` | `src/app/admin/crm/page.tsx:385` | `className={styles.workspace}` (CrmWorkspace.module.css) | Empresas e oportunidades |
| 10 | `/admin/expansao` | `src/app/admin/expansao/ExpansionWorkspace.tsx:485` | `className={styles.workspace}` `data-testid="expansion-workspace"` | Expansão, capacidade e cenários financeiros |
| 11 | `/admin/financeiro` | `src/app/admin/financeiro/FinanceiroWorkspace.tsx:344` | `className={styles.workspace}` `data-testid="financeiro-workspace"` | Financeiro — contas, recorrência e baixas |
| 12 | `/admin/frota` | `src/app/admin/frota/FrotaWorkspace.tsx:586` | `className={styles.workspace}` `data-testid="frota-workspace"` | Frota própria, custo por veículo e alerta de manutenção |
| 13 | `/admin/funcionarios` | `src/app/admin/funcionarios/RhWorkspace.tsx:187` | `className={styles.workspace}` | Pessoas e jornada do funcionário |
| 14 | `/admin/inteligencia` | `src/app/admin/inteligencia/IntelWorkspace.tsx:38` | `className={styles.workspace}` | Inteligência comercial |
| 15 | `/admin/licitacoes` | `src/app/admin/licitacoes/LicitacoesWorkspace.tsx:416` | `className={styles.workspace}` | Licitações — EXT-03 |
| 16 | `/admin/marcelo` | `src/app/admin/marcelo/MarceloPanel.tsx:216` | `data-testid="marcelo-panel"` `className={styles.workspace + executive.workspace}` | Painel do Marcelo |
| 17 | `/admin/operacao` | `src/app/admin/operacao/OperacaoWorkspace.tsx:586` | `className={styles.workspace}` | Operação — controle e gestão operacional |
| 18 | `/admin/pendencias` | `src/app/admin/pendencias/PendencyWorkspace.tsx:83` | `style` inline (maxWidth 1000…) | Minhas pendências |
| 19 | `/admin/portal/alertas` | `src/app/admin/portal/alertas/page.tsx:38` | `className={styles.page}` (SecurityAlerts.module.css) | Eventos para revisão da equipe |
| 20 | `/admin/portal/autocadastro` | `src/app/admin/portal/autocadastro/page.tsx:15` | `className={styles.page}` (SelfRegistration.module.css) | Cadastro iniciado com acesso restrito |
| 21 | `/admin/portal/convites` | `src/app/admin/portal/convites/page.tsx:46` | `className={styles.page}` (InvitationFlow.module.css) | Convite, aceite e verificação |
| 22 | `/admin/portal/permissoes` | `src/app/admin/portal/permissoes/page.tsx:193` | `className={styles.page}` (ReminderPermissions.module.css) | Permissão para mudar o canal dos avisos |
| 23 | `/admin/portal/solicitacoes` | `src/app/admin/portal/solicitacoes/page.tsx:19` | `className={styles.page}` (AccessRequests.module.css) | Modos e pedidos com decisão registrada |
| 24 | `/admin/publicacao` | `src/app/admin/publicacao/PublicationClient.tsx:19` | `style` inline (maxWidth 1080…) | Publicação do site |
| 25 | `/admin/tema` | `src/app/admin/publicacao/PublicationClient.tsx:19` (mesmo componente; `initialTab="temas"`) | idem | Publicação do site |
| 26 | `/admin/qualidade` | `src/app/admin/qualidade/QualidadeWorkspace.tsx:505` | `className={styles.workspace}` `data-testid="quality-workspace"` | Qualidade e não conformidades internas |
| 27 | `/admin/satisfacao` | `src/app/admin/satisfacao/SatisfacaoWorkspace.tsx:443` | `className={styles.workspace}` `data-testid="satisfacao-workspace"` | Satisfação do cliente e acompanhamento interno |
| 28 | `/admin/terceiros` | `src/app/admin/terceiros/TerceirosWorkspace.tsx:658` | `className={styles.workspace}` `data-testid="terceiros-workspace"` | Terceiros, acesso por escopo autorizado e perda de acesso |

As 19 do “padrão transversal” (memória) são as linhas 1–8, 10–17, 26–28 (todas com `styles.workspace` de `UiWorkspace.module.css`); as 9 restantes usam CSS próprio ou `style` inline com o mesmo defeito estrutural.

**Rotas `/admin` SEM `<main>` de conteúdo** (o marco do shell é o único — não podem perder): `/admin` (hub), `/admin/aparencia`, `/admin/clientes`, `/admin/emergencial`, `/admin/fornecedores`, `/admin/leads`, `/admin/marcelo/assistente`, `/admin/patrimonio`, `/admin/portal`, `/admin/relatorios`, `/admin/rh/assistente`, `/admin/ti`, mais os estados `forbidden`/`checking`/`error` do próprio gate. As exceções deliberadas fora do gate (`/admin/entrar`, `/admin/convite`, `/admin/verificacao-manual`) já têm 1 `<main>` por documento em estados mutuamente exclusivos.

## 4. Decisão de marco — análise forçada (NÃO é decisão de produto)

Regra do item: se a correção exigir escolher entre promover o `<main>` do shell ou o da página, mudando o marco ou seu nome acessível, parar e pedir decisão. A análise da base real mostra que **não existe escolha livre** — uma única direção é aditiva e preservadora:

1. **Promover o `<main>` da página (rebaixar o do shell) é bloqueado pelas regras de preservação:**
   - o tema dia/noite inteiro (`admin-theme.css`) está acoplado a `main[data-admin-theme-scope="true"]` — rebaixar o shell quebraria a aparência de todas as rotas admin (mudança não aditiva);
   - as 12+ rotas/admin sem `<main>` de conteúdo, o hub e os estados `forbidden`/`checking`/`error` **ficariam sem marco `main`** (regressão de semântica) a menos que passássemos a editar essas páginas;
   - os seletores `main[data-admin-theme-scope] …` herdados (`tests/ux-portal-workspace.integration.test.mjs:414-416`) e a cobertura do marco (header/nav deixariam o `main`) mudariam — exatamente “mudar o marco”;
   - nome acessível não é fator (nenhum dos `<main>` tem nome), mas a **cobertura** do marco mudaria.
2. **Manter o `<main>` do shell e rebaixar o `<main>` interno duplicado para `<div>` não muda o marco:** o elemento sobrevivente continua **byte a byte o mesmo** (mesma tag, mesmos atributos, mesma posição, mesma cobertura, nenhum nome acessível → nenhum). O que desaparece é o **duplicado inválido** — que é o próprio defeito E6. Conteúdo, classes, `data-testid`, títulos, ordem do DOM e renderização permanecem idênticos (`<main>` e `<div>` são ambos `display:block` sem estilo de UA relevante).

Portanto a correção estrutural aditiva é: **em cada uma das 28 rotas, o `<main>` de conteúdo vira `<div>` com todos os atributos preservados** + marcador estrutural `data-admin-content="true"` (par de `data-admin-chrome="true"`), que dá à região de conteúdo o mesmo âncora semântica que os testes herdados obtinham com o seletor `main main` (ver §6). O shell (`AdminGate.tsx`) **não é alterado**. A alternativa (promover o `<main>` da página) **não foi tomada**; se o proprietário preferir essa direção, exige subfatia própria com redesign do tema e das rotas sem `<main>` — registrado aqui para decisão.

Quirk preservado deliberadamente (fora de escopo, mudaria o marco): o `<main>` do shell envolve header/nav — comportamento atual, não alterado.

## 5. Teste RED canônico (gravado antes do reparo)

**Arquivo:** `tests/ux-pro-e6-single-main.test.mjs` (unitário/estático, incluído em `test:unit` → `npm test` no CI). Contrato: para **cada** página `/admin` que renderiza `<AdminGate>`, o grafo de imports alcançável **não** pode emitir `<main>` fora de `AdminGate.tsx` (o shell emite exatamente 3 `<main>`, em estados mutuamente exclusivos — `:115`, `:234`, `:247` — logo cada documento renderiza exatamente um `<main>`).

**Prova DOM (gate focal):** `tests/ux-pro-e6-single-main.integration.test.mjs` executado por `scripts/qa-ux-pro-e6-postgres.mjs` (PostgreSQL descartável + HTTP real + Chromium, padrão `qa-ux-pro-07f1`): varre as rotas `/admin` autenticadas e exige `document.querySelectorAll('main').length === 1` por documento, o `<main>` único ser o do shell (`[data-admin-theme-scope="true"]`) e a região `[data-admin-content="true"]` existir dentro dele.

**Mensagem exata da falha RED** (saída real da primeira execução, `node --test tests/ux-pro-e6-single-main.test.mjs` em 17/10/2026, **antes** de qualquer reparo):

### 5.1 Saída RED real

```
not ok 1 - UX-PRO-E6: nenhuma rota /admin sob AdminGate emite <main> aninhado ao do shell
  ---
  failureType: 'testCodeFailure'
  error: |-
    UX-PRO-E6: <main> aninhado presente em 28 ocorrência(s):
    rota src/app/admin/analytics/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/analytics/AnalyticsWorkspace.tsx:273 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/carteira/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/carteira/page.tsx:160 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/comercial/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/comercial/ComercialWorkspace.tsx:61 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/compliance/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/compliance/ComplianceWorkspace.tsx:671 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/conhecimento/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/conhecimento/KnowledgeWorkspace.tsx:417 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/continuidade/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/continuidade/ContinuityWorkspace.tsx:36 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/contratos/[id]/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/contratos/[id]/ContractWorkflowClient.tsx:319 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/contratos/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/contratos/ContractWorkspace.tsx:222 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/crm/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/crm/page.tsx:385 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/expansao/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/expansao/ExpansionWorkspace.tsx:485 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/financeiro/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/financeiro/FinanceiroWorkspace.tsx:344 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/frota/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/frota/FrotaWorkspace.tsx:586 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/funcionarios/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/funcionarios/RhWorkspace.tsx:187 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/inteligencia/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/inteligencia/IntelWorkspace.tsx:38 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/licitacoes/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/licitacoes/LicitacoesWorkspace.tsx:416 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/marcelo/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/marcelo/MarceloPanel.tsx:216 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/operacao/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/operacao/OperacaoWorkspace.tsx:586 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/pendencias/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/pendencias/PendencyWorkspace.tsx:83 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/portal/alertas/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/portal/alertas/page.tsx:38 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/portal/autocadastro/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/portal/autocadastro/page.tsx:15 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/portal/convites/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/portal/convites/page.tsx:46 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/portal/permissoes/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/portal/permissoes/page.tsx:193 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/portal/solicitacoes/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/portal/solicitacoes/page.tsx:19 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/publicacao/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/publicacao/PublicationClient.tsx:19 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/qualidade/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/qualidade/QualidadeWorkspace.tsx:505 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/satisfacao/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/satisfacao/SatisfacaoWorkspace.tsx:443 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/tema/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/publicacao/PublicationClient.tsx:19 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
    rota src/app/admin/terceiros/page.tsx emite <main> aninhado ao shell do AdminGate: src/app/admin/terceiros/TerceirosWorkspace.tsx:658 — o documento deve conter exatamente um <main> (o do shell, em src/app/admin/AdminGate.tsx)
ok 2 - UX-PRO-E6: o shell administrativo preserva o marco main[data-admin-theme-scope] nos três estados
# pass 1
# fail 1
```

A falha canônica lista **28 ocorrências** (as 28 rotas do §3), exatamente a medição da base real. O segundo teste (preservação do shell) já passa no RED e continua verde após o reparo.

## 6. Colateral de testes herdados (adaptação de seletor, sem afrouxar asserção)

10 asserções herdados usam o seletor `main main …` para **escopar o conteúdo da página dentro do shell** (excluir chrome do menu):

- `tests/ux-ops-workspace.integration.test.mjs:610,619,625,729,733,734,746,748,755`
- `tests/ux-knowledge-workspace.integration.test.mjs:478`

Com o reparo, `main main` deixa de existir (corretamente). O âncora equivalente é `main [data-admin-content="true"] …` — **mesmo conjunto de alvos, mesmas contagens, mesma intenção** (região de conteúdo, sem o chrome). Nenhuma asserção é removida, afrouxada ou invertida; apenas o seletor acompanha a estrutura corrigida.

Verificado sem mudança de resultado:

- `tests/ext10-continuity.integration.test.mjs:450` (`page.locator("main").last().innerText()`): o `.last()` passa a ser o único `<main>` (shell); o `innerText` do shell **contém** o texto da página — o `assert.match` permanece verdadeiro e igualmente forte para o texto afirmado.
- `tests/ux-contract-workspace.integration.test.mjs:646` (`page.locator('main').waitFor()`): inalterado.
- `tests/ux-portal-workspace.integration.test.mjs:414-416` (`main[data-admin-theme-scope="true"] > div` etc.): alvo é o shell, inalterado.
- `scripts/ux-pro-08d-measurements.mjs:130` (`sample('main')`): `querySelector('main')` já retornava o shell (primeiro em ordem de documento) — inalterado.

## 7. Resíduos numerados (registrados, não corrigidos nesta subfatia)

1. **E6-C1 — `/cliente/app/cobrancas` e `/cliente/app/portal`:** `<main>` aninhado a `src/app/cliente/RealAccessShell.tsx:26` (via `src/app/cliente/app/layout.tsx`), com os mesmos efeitos de E6. Origem/família diferentes (portal do cliente — família ID3/pendências próprias). Correção idêntica em forma (rebaixar o `<main>` interno) aguarda autorização item a item.

## 8. Limites declarados

- Não alterar: rotas, destinos, papéis, permissões, grants, navegação, títulos, conteúdo, contratos de API/session, payloads, cookies, MFA, rate limit, auditoria ou isolamento.
- Não declarar aceite humano, UAT nem conformidade WCAG. Homologação/produção NO-GO.
- Evidências em `docs/UX-PRO-E6-evidencias-2026-10-17/` (`antes/` sem `resumo.json`, para não virar evidência vigente no inventário; `depois/` com `resumo.json`), dados sintéticos apenas em banco descartável.
- Inventário `node scripts/ux-pro-00-inventory.mjs` + `--check` após tocar `src/app`; diff dos CSVs coluna por coluna, aceitando apenas mudanças justificadas por evidência real desta subfatia.

## 9. RED DOM antes do fix — gate `qa-ux-pro-e6-postgres.mjs` (2026-10-17)

Execução RED (código intocado): **5 casos — 2 aprovações, 3 reprovações**. Os casos
`forbidden` e `error` do gate já têm exatamente um `<main>` (provam que a reprovação
é do aninhamento em si, não do harness). Mensagens exatas dos casos reprovados:

- **Caso 1 (varredura, 43 documentos):** `UX-PRO-E6: documento(s) /admin com <main> != 1:`
  seguido das **28 rotas** com `mainCount=2 (esperado 1)` — `/admin/analytics`,
  `carteira`, `comercial`, `compliance`, `conhecimento`, `continuidade`, `contratos`,
  `contratos/e6-sintetico-000`, `crm`, `expansao`, `financeiro`, `frota`,
  `funcionarios`, `inteligencia`, `licitacoes`, `marcelo`, `operacao`, `pendencias`,
  `portal/alertas`, `portal/autocadastro`, `portal/convites`, `portal/permissoes`,
  `portal/solicitacoes`, `publicacao`, `qualidade`, `satisfacao`, `tema`, `terceiros`.
- **Caso 2 (marco/estrutura das 28 rotas E6):** por rota, `mainCount=2 (esperado 1)`,
  `regiões [data-admin-content]=0 (esperado 1)` e a árvore de landmarks do DOM real
  mostra os dois `<main>`: `["main","header","nav[aria-label=Módulos administrativos]",
  "nav[aria-label=Você está aqui]","main","nav[aria-label=Trilha]"]` — `main` do
  shell + `main` da página.
- **Caso 5 (capturas dia/noite):** reprovado por instabilidade do Chromium empacotado
  (`page.waitForFunction: Timeout 60000ms` após 16 capturas fullPage com um único
  browser); as 16 medições registradas documentam `mainCount=2`. O caso foi
  endurecido em seguida para **browser novo por captura**. A evidência RED canônica
  do documento completo é o teste estático §5.1 + os casos 1 e 2 acima.

Evidência `antes/`: `varredura.json` + capturas parciais, **sem `resumo.json`**.

## 10. Evidência antes/depois — verificação executada (2026-10-17)

- `antes/` (RED, código intocado): `varredura.json` com 71 medições (43 varredura +
  28 capturas dia/noite) e **28 PNGs**; `problems` documenta `mainCount=2` nas 28
  rotas E6; **sem `resumo.json`** (regra 07D-1).
- `depois/` (GREEN, gate 5/5): `varredura.json` 71 medições, **28 PNGs**,
  `resumo.json` (stage `ux-pro-e6`); `problems` vazio em todas as linhas.
- **Byte-compare nos dois sentidos** (nomes das capturas × `entries[].screenshot`,
  arquivo a arquivo, nos dois diretórios): casamento exato, nenhum PNG órfão nem
  entrada sem arquivo; assinatura PNG válida; largura = viewport da entrada
  (fullPage: a altura pode exceder o `scroll` medido antes da captura em rotas com
  conteúdo que assenta após a hidratação — artefato de captura, presente nos dois
  estados e registrado).
- **Fingerprints (geometria + estilos computados, SEM nome de tag) por rota/largura/
  tema:** 20 dos 28 pares de captura são **idênticos** antes/depois; os 8 pares que
  divergem concentram-se em três rotas com renderização assíncrona (`crm`,
  `operacao`, `conhecimento`) — nas quais as próprias alturas de PNG variam entre
  execuções do mesmo código (em `antes`, `operacao` 1440×900 saiu 1030px no dia e
  1687px na noite). Como o rebaixamento da tag ocorre nas 28 rotas e 20 pares ficam
  idênticos, a demolição não altera geometria nem estilo; as divergências residuais
  são variação de hidratação entre execuções. As 43 rotas da varredura: 41
  idênticas; `/admin/ti` e `/admin/licitacoes` (dados assíncronos) divergem pelo
  mesmo motivo.

- **Experimento de variância (mesmo código, duas execuções do gate "depois"):**
  10 dos 28 pares de captura divergem entre si (as mesmas rotas `crm`,
  `conhecimento`, `operacao`) e 3 rotas da varredura (`licitacoes`, `ti`,
  `entrar`) — confirma que a divergência residual de fingerprint é variação de
  hidratação/execução, e não efeito do rebaixamento da tag (20 pares idênticos
  antes/depois + 18 pares idênticos entre execuções iguais).

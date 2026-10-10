# UX-PRO-00 — Reconciliação e mapa de cobertura (10/10/2026)

**Fatia:** UX-PRO-00 do [plano mestre de profissionalização UX](PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md).
**Natureza:** inventário estático do código, reconciliação documental e matriz de cobertura. **Não** é homologação visual, de teclado, de tema, de responsividade nem de aceite. Nenhuma funcionalidade, rota, permissão, API, dado ou migração foi alterada.

**Fontes vigentes desta fatia:**

- Matriz gerada: [`UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv`](UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv) (100 linhas, 22 colunas).
- Gerador: `scripts/ux-pro-00-inventory.mjs`. Teste de reprodutibilidade: `tests/ux-pro-00-inventory.test.mjs`.

**Registros históricos preservados (não são a fonte vigente):** [UX-00](UX-00-AUDITORIA-BASELINE-2026-10-05.md) e [UX-00-INVENTARIO-ROTAS.csv](UX-00-INVENTARIO-ROTAS.csv) (05/10, 98 linhas); [FECH-12 inventário](FECH-12-INVENTARIO-ROTAS-2026-10-07.csv) e [FECH-12 matriz](FECH-12-MATRIZ-COBERTURA-2026-10-07.csv) (07/10, 98 páginas); [auditoria de interface](AUDITORIA-INTERFACE-ROTAS-2026-10-08.md) e seu CSV (08/10, 100 arquivos de entrada).

---

## 1. Base confirmada

| Item | Valor verificado nesta sessão |
|---|---|
| Branch de trabalho | `arena/b2de92cc-gruposegsystemseguranca` |
| `origin/main` (fetch em 10/10/2026) | `c50a99beecb057c2a819d5556cf1405f3434458c` (`docs(ux): clean master plan markdown formatting`) |
| HEAD da branch antes da fatia | igual à `origin/main` (0 de divergência) |
| Árvore antes da fatia | limpa |
| Histórico local | **1 commit** (`git rev-list --count HEAD` = 1). Não é possível rastrear por Git a autoria ou a data de mudanças anteriores. |
| PRs abertas | **0** (`gh pr list --state open`) |
| PRs recentes mescladas | #186 (endereço HERE nos comprovantes de ponto, 07/10/2026), #185, #184, #183 (fechamento UX/RAG) |
| PRs fechadas sem merge | #182 (FECH-01) e #173 (UX-07 EXT-02). O conteúdo de FECH-01 consta, segundo o próprio documento de 07/10, como aproveitado no fechamento. |

**SHAs citadas em documentos que não existem neste clone** (não é possível verificá-las localmente; isso não é conflito de código): `87aef9f…` (base do plano mestre), `1c4b859c…` (base do UX-00), `5abc199a…` (base do EXT-04) e `7765d998…` (base do FECH). Os documentos foram tratados como registros de data, não como prova da árvore atual.

**Workflows:** 35 arquivos em `.github/workflows`, todos com gatilho `pull_request`. A maioria filtra `branches: [main]` e/ou `paths`; três (`ux-bidding`, `ux-expansion`, `ux-supplier`) não filtram branch. Apenas `ci.yml` (`QA baseline`) também dispara em `push` para `main` e `arena/**`. Esta fatia não altera `src/**`, então os workflows com filtro em `src/**` ou em áreas específicas não são acionados por ela. O check obrigatório é `QA baseline`.

## 2. Documentos lidos antes de qualquer alteração

| Documento | Papel | Situação na reconciliação |
|---|---|---|
| `AGENTS.md` | regras do repositório | vigente; aplicado (sem remoção, sem alteração de permissão) |
| `README.md` (223 linhas) | entrada do repositório | vigente. Continha o link “inventário completo das **98** páginas”, agora marcado como histórico e apontando para este documento |
| `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md` | regra de preservação | vigente |
| `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md` | plano da fatia | vigente |
| `docs/AUDITORIA-INTERFACE-ROTAS-2026-10-08.md` | auditoria de 08/10 | histórico. Declara que as contagens do CSV são ocorrências estáticas |
| `docs/FECH-ENTREGA-DESENVOLVIMENTO-2026-10-07.md` | entrega de 07/10 | histórico. Declara que não houve homologação, aceite nem teste pesado |

Também conferidos: `UX-00-AUDITORIA-BASELINE-2026-10-05.md`, `UX-02-NAVEGACAO-2026-10-05.md`, `MATRIZ-FECHAMENTO-L07.md`, `ENTREGA-L07-ACEITE-E-AUDITORIA-L08.md`, as pastas `docs/*-evidencias/`, `.github/workflows/ci.yml`, `package.json`, `tests/admin-page-gates.test.mjs` e `tests/admin-navigation.test.mjs`.

## 3. Método de contagem (reproduzível)

1. **Entradas de rota:** todos os arquivos `page.tsx` em `src/app` (`find src/app -name page.tsx`). Resultado: **100**. Não há `route.*` (API) em `src/app`; as APIs ficam em `server.mjs` e `src/server`, fora desta contagem.
2. **Rota:** caminho do diretório relativo a `src/app`, com `/` na raiz. Rotas dinâmicas (`[id]`, `[key]`, `[slug]`, `[token]`) contam como uma rota.
3. **Áreas:** prefixo `/admin` (incluindo `/admin`), `/cliente` (incluindo `/cliente/app/*`) e demais.
4. **Comandos:**
   - `node scripts/ux-pro-00-inventory.mjs --summary` (contagens em JSON);
   - `node scripts/ux-pro-00-inventory.mjs --write` (grava a matriz);
   - `node --test tests/ux-pro-00-inventory.test.mjs` (confere contagens e igualdade byte a byte da matriz).
5. **Comparação histórica:** conjunto de rotas de cada CSV contra o conjunto atual, com `diff` após ordenação.

## 4. Reconciliação 98 × 100

| Grupo | 98 (UX-00 e FECH-12) | 100 (código atual) | Diferença |
|---|---|---|---|
| `/admin` (incl. `/admin`) | 43 | 44 | **+ `/admin/aparencia`** |
| `/cliente` (incl. 15 em `/cliente/app`) | 29 | 29 | 0 |
| Demais | 26 | 27 | **+ `/layout-preview`** |
| **Total** | **98** | **100** | **+2** |

**Diferença exata verificada por conjunto:** só `/admin/aparencia` e `/layout-preview` aparecem no código e não nos CSVs de 05/10 e 07/10. Nenhuma rota dos CSVs antigos deixou de existir.

**Ponto de atenção — `/admin/visual`:** a rota existe nos dois inventários, mas **mudou de natureza**.

- Em 05/10 era uma página com `AdminGate` e papéis `ti|admin`.
- Hoje é `redirect('/admin/aparencia')`, um alias de compatibilidade (`src/app/admin/visual/page.tsx`).
- `/admin/aparencia` tem `AdminGate` com papéis `admin|marcelo|ti`. Ou seja, quem chega por um favorito antigo passa a ser atendido pelo gate de `/admin/aparencia`, e **o papel `marcelo` passou a ter acesso à entrada visual**, que antes era restrita a `ti|admin`.
- Sem histórico Git, não é possível datar essa mudança. Ela está presente na `main` e **não foi alterada nesta fatia**. Ver a decisão pendente D1 abaixo.

**Auditoria de 08/10:** o CSV `AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv` lista exatamente as 100 entradas `page.tsx` atuais (conjunto idêntico, verificado). Portanto, já em 08/10 a contagem era 100; os 98 de 05/10 e 07/10 estavam defasados.

**Contador do build:** `npm run build` desta fatia reportou `Generating static pages (105/105)`, com 6 caminhos SSG gerados por parâmetro. Esse contador **não é** contagem de `page.tsx` e não é reconciliado linha a linha aqui. Os textos antigos “98 páginas” e “100 páginas” em checklists e continuações referem-se a builds anteriores cujo critério não está registrado; ficam como histórico.

## 5. Catálogo de navegação: teste em 27, código em 26

- `tests/admin-navigation.test.mjs` exigia **27** destinos. O catálogo atual (`ADMIN_MODULES` em `AdminGate.tsx` e `ADMIN_GROUPS` em `src/lib/admin-navigation.mjs`) tem **26**, e o documento [UX-02](UX-02-NAVEGACAO-2026-10-05.md) registra 26 destinos verificados “exatamente uma vez”.
- **Estado da `main` antes desta fatia:** etapa `Administrative navigation catalogue and role-filtered search` do `ci.yml` **falhava** (`26 !== 27`). Era uma falha de check obrigatório já presente na `main`.
- **Correção aplicada:** a baseline do teste foi alterada de 27 para 26, com comentário que aponta para este documento. A verificação de **unicidade** (cada destino em exatamente um grupo) e a **igualdade de conjunto** entre catálogo e grupos permanecem integrais. Não houve alteração no catálogo, nos papéis ou nos grupos.
- A substituição de `/admin/visual` por `/admin/aparencia` no catálogo é a causa provável da diferença de 1 destino. Como o histórico é único, a intenção foi inferida pelo próprio código: `tests/admin-page-gates.test.mjs` registra `/admin/visual` como redirect “para a entrada visual oficial” e proíbe recriar o editor duplicado. Confirmação do proprietário: D1.

## 5-bis. Check obrigatório vermelho na `main`: `test:demo-local:pg` travava

- **Sintoma:** a etapa `QA-HOM-008 persistent synthetic restart` do `ci.yml` (`npm run test:demo-local:pg`) não terminava. O gate ficava aguardando a saída de um processo `scripts/local-demo.mjs --start` que já havia registrado a falha esperada.
- **Causa verificada:** em modo de teste (`SEG_DEMO_TEST_MODE=1`), `scripts/local-demo.mjs` registra um listener em `process.stdin` no nível do módulo, para o encerramento controlado pelo pai. Quando a inicialização falha antes do servidor web (ex.: `demo_insecure_data_permissions`, que o gate exige), o `catch` registra o erro e define `exitCode = 1`, mas o stdin em modo *flowing* mantém o event loop vivo. O processo não termina.
- **Reprodução isolada (antes da correção):** com stdin aberto pelo pai, `timeout` encerrou o processo com código **124**; com stdin fechado, saiu com código **1**. Diagnóstico completo registrado nesta fatia.
- **Correção mínima aplicada:** no bloco `finally` de `scripts/local-demo.mjs`, `if (qa) process.stdin.pause();`. Efeito: em falha, o processo termina com código 1 (verificado: código 1 com stdin aberto). O caminho de produção (fora do modo QA) não tem listener de stdin e não foi alterado. A mensagem de erro e a recusa de permissão inseguras permanecem idênticas.
- **Regressão:** o próprio gate `test:demo-local:pg` cobre a recusa de configuração insegura (`QA-HOM-008_INSECURE_CONFIG_REFUSED`) e o restart/stop completos; `tests/local-demo-guards.test.mjs` e `tests/demo-snapshot-guards.test.mjs` passam.

## 6. Papéis e gates

- **39 páginas** declaram papéis literais em `AdminGate allowedRoles`. Esse mapa é fixado por `tests/admin-page-gates.test.mjs`, que também exige exceções explícitas.
- **5 páginas `/admin` sem lista literal**, classificadas como:

| Rota | Classificação | Fonte |
|---|---|---|
| `/admin` | hub: `AdminHub` contém `AdminGate` (papéis do catálogo) | `src/app/admin/page.tsx`, `AdminHub.tsx` |
| `/admin/entrar` | entrada de login da equipe; não pode ter gate (evitaria redirecionamento para si mesma) | teste de gates |
| `/admin/convite` | **exceção deliberada**: aceite de convite, sem `AdminGate` | teste de gates |
| `/admin/verificacao-manual` | **exceção deliberada**: verificação manual, sem `AdminGate` | teste de gates |
| `/admin/visual` | redirect de compatibilidade para `/admin/aparencia` | teste de gates |

- **Autorização real:** o `AdminGate` é apenas controle de interface. Toda API decide no servidor (`readSession`/`requireRole`, grants). Nada nesta fatia alterou essa camada.
- **Área do cliente autenticada** (`/cliente/app/*`, 15 rotas): gate pelo layout (`RealAccessShell` + `ClientSpaceProvider`) e decisão final no servidor (sessão + grant + cadastro).
- **Funcionário** (`/funcionario`): sessão validada no componente `EmployeePortal`.
- **Demais rotas públicas e prévias:** sem papel declarado no arquivo.

## 7. Classificação das evidências (categorias não equivalentes)

| Categoria | Definição usada nesta matriz | Contagem (100 rotas) |
|---|---|---|
| **Código** | arquivo da rota lido e classificado de forma estática; não prova comportamento | 100 |
| **Teste automatizado** | script ou teste do repositório que **cita a rota exata** entre aspas. Prova que a rota é referenciada por um gate, **não** que ele exercita a rota por completo. Scripts que só produzem capturas (`ux-evidence-*`) são excluídos | 41 |
| **Captura visual** | PNG e `resumo.json` gerados por script com Chromium, em 1440×900 e 390×844. Registram foco inicial e lista de problemas automáticos (vazia em todos os 40 registros do `resumo.json`: 20 rotas × 2 viewports). Não cobrem percurso de teclado, tema nem estados reais | 20 |
| **Validação manual** | não há registro por rota no repositório | 0 |
| **Aceite humano** | Marcelo e Andreia aceitaram **FIN-01..16 e ADM-01..12** em 02/10/2026 (L07). O aceite está registrado por **IDs de matriz**, sem mapeamento a rotas no repositório, e vale somente para as jornadas locais e fronteiras sintéticas da matriz | 0 por rota |
| **Sem nenhuma evidência automatizada nem visual** | — | **53** |

Os números de captura correspondem a 20 rotas, todas existentes no inventário atual (verificado; nenhuma órfã): `/admin/analytics`, `/admin/carteira`, `/admin/comercial`, `/admin/compliance`, `/admin/conhecimento`, `/admin/continuidade`, `/admin/contratos`, `/admin/crm`, `/admin/expansao`, `/admin/financeiro`, `/admin/fornecedores`, `/admin/frota`, `/admin/funcionarios`, `/admin/inteligencia`, `/admin/licitacoes`, `/admin/marcelo`, `/admin/qualidade`, `/admin/satisfacao`, `/admin/terceiros` e `/cliente/app/continuidade`. As capturas de `/cliente/app/continuidade` têm dados fictícios, conforme o README da pasta.

## 8. Matriz vigente — o que cada coluna significa

Arquivo: [`UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv`](UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv).

| Coluna | Como é obtida | Limite |
|---|---|---|
| `rota`, `area`, `posicao_no_catalogo` | diretório da rota e catálogo `admin-navigation.mjs` | área é agrupamento de apresentação, não permissão |
| `papel_declarado`, `gate`, `layout` | `allowedRoles` literal ou classificação da seção 6 | papel na interface, não permissão efetiva de API |
| `componentes_compartilhados`, `primitivos_ui` | imports locais de até 2 níveis, fora da pasta da rota e de `src/lib` | não inclui dependência de pacotes externos |
| `tema_tokens`, `tema_cores_literais`, `tema_scope_dia_noite` | contagem de `var(--…)` e de cores literais (hex e `rgb`) na árvore da rota | indício estático; **não** é validação dia/noite |
| `responsividade_media_queries` | `@media` nos CSS da árvore | **não** prova 320/390/768/1440 px |
| `estados_no_codigo` | marcadores textuais (`UiState`, carregamento, erro, vazio, negado, sucesso) | presença de texto, não de estado real |
| `marcadores_demonstrativos`, `marcador_previa` | termos como “demonstrativo”, “fictício”, “exemplo”, “prévia” | sinalização textual para revisão |
| `evid_*` | seções 7 acima | ver categorias |
| `lacunas` | regras explícitas por coluna | sempre inclui teclado, dia/noite e responsividade como **não validados nesta matriz** |

**Números principais:**

- 79 rotas com `@media` e 21 sem;
- 33 rotas com `UiState` (componente de estado compartilhado); 8 sem nenhum marcador de estado;
- 58 rotas sem escopo administrativo de tema declarado (públicas, cliente, funcionário e prévias); 39 com escopo `data-admin-theme-scope` herdado do `AdminGate`; 3 com escopo presente na própria árvore;
- 65 rotas com algum marcador demonstrativo textual; 36 com marcador de prévia.

## 9. Itens da tarefa e situação

| Item | Situação |
|---|---|
| 1. Inventário atual de rotas, áreas, papéis, layouts, componentes, dados demonstrativos e estados | **feito** (matriz, seções 3 a 6) |
| 2. Reconciliação 98 × 100 com método reproduzível; sem apagar evidências | **feito** (seção 4). Histórico preservado |
| 3. Matriz rota → área/papel → componente → tema → responsividade → teclado → estados → evidência → lacuna | **feito** como matriz estática. Tema, responsividade, teclado e estados **reais** não foram validados e aparecem como lacuna |
| 4. Classificação das evidências por categoria | **feito** (seção 7) |
| 5. Atualização apenas dos documentos necessários | **feito**: este documento, pointer no README, nota no plano mestre, baseline de `admin-navigation`, teste e script novos |
| 6. Preservação de auth, grants, isolamento, contratos, auditoria, idempotência, estados, navegação e funcionamento local | **preservado**. Alterações: baseline de contagem em `tests/admin-navigation.test.mjs` (27 → 26, ver seção 5); inclusão do teste novo em `package.json` (`test:unit`); correção de encerramento em `scripts/local-demo.mjs` somente no modo QA (seção 5-bis, sem mudança de comportamento para o operador); README, plano e docs. Nenhuma rota, permissão, API, dado ou migração foi alterada |
| 7. PR pequena com inventário, critério de contagem, antes/depois documental, limitações e validação | **ver a PR** (seção 12 e resposta final) |

## 10. Decisões pendentes do proprietário (não tomadas nesta fatia)

- **D1 — `/admin/visual` → `/admin/aparencia`:** confirmar se a troca de entrada e a ampliação de papéis (`ti|admin` → `admin|marcelo|ti`) são intencionais. Nenhuma alteração foi feita. Se não forem, a correção é uma decisão de produto e de permissão, fora desta fatia.
- **D2 — `/admin/convite` e `/admin/verificacao-manual` sem `AdminGate`:** são exceções registradas por teste. Confirmar se as APIs que usam têm guarda própria suficiente, e se a página deve ou não ganhar envelope visual de sessão. Nenhuma alteração foi feita.
- **D3 — destinos fora do catálogo** (`/admin/comercial`, `/admin/continuidade`, `/admin/pendencias`, `/admin/publicacao`, `/admin/rh/assistente`, `/admin/tema`): o [UX-02](UX-02-NAVEGACAO-2026-10-05.md) já registra que a posição e o papel serão revisados antes de incluí-las, sem alargar acesso. Permanecem como estão.
- **D4 — aceite humano por rota:** não existe. Definir, antes de UX-PRO-04 a UX-PRO-07, quem aceita e com qual escopo. Não inventar aceite.

## 11. Limitações

- Histórico Git achatado: não há rastreio de autoria, data ou PR por mudança anterior, e SHAs citadas em documentos não existem no clone.
- Matriz estática: uma coluna “cita a rota” não prova cobertura. Rotas dinâmicas não foram avaliadas instância por instância.
- Nenhuma navegação em navegador nesta fatia: tema dia/noite, teclado, zoom, responsividade (320/390/768/1440) e estados reais ficam como lacuna.
- Windows não foi executado nesta fatia. O gerador usa normalização de caminhos e ordenação estável para não depender do SO; isso não substitui a execução no Windows do operador.
- As capturas não trazem data nem SHA de origem no `resumo.json`. A única data encontrada nos READMEs das pastas de captura é 06/10/2026 (`docs/ux-11-continuidade*-evidencias/README.md`); as demais datas do repositório pertencem a outros registros (QA-HOM, F10, qa-evidencia-*), não a capturas por rota. Por isso as capturas são tratadas como estado de execuções anteriores, não como estado atual.

## 12. Validação executada

Base de comparação: `main` `c50a99b`, com as alterações desta fatia. Os comandos e variáveis de ambiente seguem os de `.github/workflows/ci.yml` (`DATABASE_URL`, `MAIL_HOST` vazios; `OLLAMA_ENABLED=false`; `NEXT_PUBLIC_ALLOW_INDEX=false`; `NEXT_PUBLIC_ENV=beta`).

**Antes da alteração (estado da `main`):**

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 OK |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| `npm run typecheck` | exit 0 |
| `npm test` | 866/866 |
| `node --test tests/admin-navigation.test.mjs` | **falhou** (26 ≠ 27) |
| `npm run build` | exit 0 (105/105) |

**Gate com falha identificado na `main`:** `npm run test:demo-local:pg` não terminava (seção 5-bis). Após a correção mínima, o gate passou ponta a ponta (EXIT=0), com `QA-HOM-008_INSECURE_CONFIG_REFUSED`, `QA-HOM-008_RESTART` e `QA-HOM-008/009_TEMP_CLEANED: true`.

**Após a alteração — sequência completa na ordem do `ci.yml`, em um único run:**

| Etapa | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | EXIT 0 (5/5) |
| `npm audit --audit-level=high` | EXIT 0 (0 vulnerabilidades) |
| `npm run typecheck` | EXIT 0 (reexecutado isoladamente, EXIT 0) |
| `npm test` | EXIT 0 (**871/871**: 866 anteriores + 5 de `ux-pro-00-inventory`) (reexecutado isoladamente, EXIT 0) |
| `node --test tests/admin-navigation.test.mjs` | EXIT 0 (2/2) (reexecutado isoladamente, EXIT 0) |
| `npm run build` | EXIT 0 (105/105) |
| `npm run test:rag` | EXIT 0 |
| `npm run test:tenant:pg` | EXIT 0 (22 testes, 22 passam; `QA_PG_TEMP_CLEANED: true`) |
| `npm run test:demo-local:pg` | EXIT 0 |

Observação: a saída da sequência foi truncada no meio do log; por isso `typecheck`, `npm test` e `admin-navigation` foram reexecutados separadamente, com códigos de saída registrados. Também foram executados `node --test tests/ux-pro-00-inventory.test.mjs` (5/5), `node --test tests/local-demo-guards.test.mjs tests/demo-snapshot-guards.test.mjs` (4/4).

`npm ci` foi executado no início da fatia. O `next-env.d.ts` gerado pelo `next build` foi revertido e não faz parte da entrega.

## 13. Prompt da próxima sessão — UX-PRO-01 (Tokens e chrome compartilhado)

> Trabalhe no repositório `berger33/gruposegsystemseguranca`, partindo da `main` mais recente. Leia `AGENTS.md`, `README.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md` e `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`. Antes de qualquer alteração, leia também `docs/UX-PRO-00-RECONCILIACAO-2026-10-10.md` e a matriz `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv`.
>
> Faça `git fetch origin main`, confirme o SHA da `main`, conferir se a PR de UX-PRO-00 está `MERGED` e se `origin/main` contém o commit dela. **Não reabra a PR anterior** e não use cópia local antiga. Confirme com `gh pr list --state open` que não há PR de UX-PRO-01 já aberta.
>
> Execute **somente UX-PRO-01 — Tokens e chrome compartilhado**. Reavalie o código antes de implementar (`src/styles/ux-tokens.css`, `src/styles/themes.css`, `src/app/admin/AdminGate.tsx`, `src/app/admin/AdminChrome.module.css`, `src/app/admin/admin-theme.css`, `src/components/ui/*`, `src/app/admin/AdminThemeToggle.tsx`) para não duplicar trabalho já integrado. Defina ou complete escala de tipografia, espaçamento, superfícies, bordas, elevação, foco, estados, largura de conteúdo e breakpoint; audite cabeçalho, identificação do papel, botão dia/noite, sair, breadcrumb, menu desktop/mobile, busca e estado ativo; verifique onde a preferência de tema é persistida (navegador ou conta) sem alterar autenticação; gere capturas base comparáveis com dados fictícios.
>
> Preserve autenticação, sessão, permissões e grants, isolamento por identidade/conta/contrato, contratos HTTP, estados do domínio, auditoria, idempotência, navegação, dados e funcionamento local. Não altere papéis, rotas ou destinos. Não resolva as decisões D1 a D4 de `UX-PRO-00` sem autorização explícita do proprietário.
>
> Valide com `npm ci`, `node scripts/qa-wave0-static.mjs`, `npm audit --audit-level=high`, `npm run typecheck`, `npm test`, `node --test tests/admin-navigation.test.mjs`, `npm run build`, `npm run test:rag`, `npm run test:tenant:pg` e `npm run test:demo-local:pg`, e os gates de área que a alteração tocar. Faça evidências antes/depois em 320, 390, 768 e 1440 CSS px, em dia e noite, com teclado. Não declare teclado, tema ou responsividade validados sem essas evidências; classifique cada evidência como código, teste automatizado, captura visual, validação manual ou aceite humano.
>
> Abra uma PR pequena baseada na `main`. Só faça merge quando todos os checks obrigatórios estiverem realmente verdes (cancelados, pulados ou sem runner não contam), a revisão estiver concluída e a base for `main`. Use `gh pr merge <número> --merge` sem `--auto`, como último comando da cadeia, e confirme `MERGED`, o SHA do merge e que `origin/main` contém o commit. Se houver bloqueio, não avance: explique a evidência e entregue um prompt de retomada de UX-PRO-01. Ao terminar, atualize o registro da fatia e entregue o prompt da próxima sessão (UX-PRO-02), seguindo o modelo do plano mestre.

# UX-PRO-00 — Reconciliação e mapa de cobertura (10/10/2026)

**Fatia:** UX-PRO-00 do [plano mestre de profissionalização de UX](PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md).
**Base confirmada antes de editar:** `main` = `origin/main` = `c50a99beecb057c2a819d5556cf1405f3434458c`, divergência **0/0**, árvore limpa.
**PRs no momento da reconciliação:** nenhuma aberta; a última mergeada foi a **#186** (`79cccb7168…`).
**Escopo desta fatia:** inventário, matriz de cobertura, critério de contagem e reconciliação documental. **Nenhuma tela, rota, API, permissão, contrato, dado ou fluxo foi alterado.** As únicas alterações de código estão na seção 8.

Este documento é a **fonte vigente** do inventário de rotas e da cobertura de interface. Os inventários anteriores continuam no repositório, com data e SHA próprios, como registro histórico — nada foi apagado nem reescrito.

## 1. Arquivos vigentes e como regenerá-los

| Arquivo | Conteúdo |
|---|---|
| [`UX-PRO-00-INVENTARIO-ROTAS-2026-10-10.csv`](UX-PRO-00-INVENTARIO-ROTAS-2026-10-10.csv) | 100 linhas: rota, área, papéis declarados, papéis no menu, fonte da guarda, arquivo de entrada, layout, arquivos locais, componentes/estilos UI compartilhados, escopo de tema, tabelas, marcadores de demonstração/estado/teclado, gates, capturas. |
| [`UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv`](UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv) | 100 linhas: rota → área/papel → componente → tema → responsividade → teclado → estados → evidência → classe de evidência → lacuna. |

```bash
node scripts/ux-pro-00-inventory.mjs           # regenera os dois CSVs e imprime o resumo
node scripts/ux-pro-00-inventory.mjs --check   # não escreve; exit 1 se o versionado divergir do código
```

O gerador lê apenas fontes objetivas: `src/app`, `docs/**/resumo.json` (capturas), `.github/workflows/*.yml` (gates) e os três inventários históricos (só leitura, para a reconciliação). Regressão automatizada: `tests/ux-pro-00-inventory.test.mjs` (4 testes), registrado em `npm test`.

## 2. Critério de contagem

> **1 entrada de rota = 1 arquivo `page.(tsx|jsx|ts|js)` sob `src/app`.**
> A rota é o diretório desse arquivo relativo a `src/app`, com grupos de rota `(nome)` removidos; segmentos dinâmicos `[param]` permanecem literais.

Aplicado hoje: **100 arquivos de entrada → 100 entradas → 100 rotas distintas** (nenhuma colisão; hoje todas as entradas são `.tsx`, e não há grupos de rota no projeto).

Três números diferentes circulam na documentação e **não são a mesma medida**:

| Medida | Valor hoje | O que conta |
|---|---|---|
| Entradas de rota (critério acima) | **100** | arquivos `page.*` |
| Linhas na tabela `Route (app)` do build | **101** | as 100 entradas **+** `/_not-found`, rota sintética do Next.js |
| Contador `Generating static pages` do build | **105** | páginas geradas, incluindo filhos SSG de `/segmentos/[key]` e `/servicos/[id]` e páginas internas do Next.js — **não é contagem de rotas** |
| Ocorrências de controles/labels no CSV de 08/10 | 2.940 / 1.128 | ocorrências estáticas de código, **não** campos renderizados |

Verificação cruzada executada: as 100 rotas do inventário aparecem na tabela do build (`inventario − build = ∅`); a única linha extra é `/_not-found`. Do total, 94 são estáticas (`○`), 5 dinâmicas (`ƒ`: `/admin/contratos/[id]`, `/conteudos/[slug]`, `/layout-preview`, `/proposta/aceite/[token]`, `/qa/modulos`) e 2 são pais de segmento dinâmico com 7 filhos SSG listados.

Nota de reprodutibilidade: `scripts/ux00-inventory.mjs` (usado por UX-00 e FECH-12) reconhece **apenas** `page.tsx`, enquanto `scripts/audit-ui-inventory.mjs` (08/10) reconhece `page.(tsx|jsx|ts|js)`. Hoje os dois coincidem em 100 porque todas as entradas são `.tsx`; se surgir uma entrada `.jsx`/`.ts`, o gerador antigo voltará a divergir. O gerador desta fatia usa o conjunto amplo.

## 3. Reconciliação 98 × 100

Método reproduzível: o gerador lê a primeira coluna de cada CSV histórico, normaliza (barra inicial; a raiz gravada como `page.tsx` volta a ser `/`) e compara o conjunto com o inventário vigente. Saída em `reconciliacao` no resumo.

| Inventário | Data | Total registrado | Diferença contra o código de hoje |
|---|---|---|---|
| `UX-00-INVENTARIO-ROTAS.csv` | 05/10/2026 | 98 | **+2** `/admin/aparencia`, `/layout-preview` · −0 |
| `FECH-12-INVENTARIO-ROTAS-2026-10-07.csv` | 07/10/2026 | 98 | **+2** `/admin/aparencia`, `/layout-preview` · −0 |
| `AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv` | 08/10/2026 | 100 | **+0 · −0** (conjunto idêntico ao de hoje) |

**Nenhum inventário antigo estava errado na sua data.** A diferença tem causa única e datada:

- As duas rotas vieram do commit `0b2413e03c` (2026-10-07T05:26:19Z), mergeado pela **PR #185** (`a52351d6ab…`, merged em 2026-10-07T12:46:58Z).
- A base registrada pelo FECH-12 é `7765d998…` (PR #183, mergeada em 2026-10-07T04:48:37Z — **antes** da PR #185). Nessa base, a API de conteúdo do GitHub responde **HTTP 404** para `src/app/admin/aparencia/page.tsx` e `src/app/layout-preview/page.tsx`; em `a52351d6…` ambas respondem **HTTP 200**.
- `7765d998… → a52351d6…` = 12 commits à frente, 0 atrás.

Conclusão vigente: **100 entradas de rota**. O documento `IDENTIDADE-VISUAL-E-APARENCIA-2026-10-07.md` (a entrega que criou as duas rotas) ainda cita "98 páginas" — registro histórico preservado, apontado para esta fonte.

Divergências de **formato** encontradas nos históricos (registradas, não corrigidas nos arquivos): o CSV de 08/10 grava a rota **sem barra inicial** nas 100 linhas e a raiz como `page.tsx`. O gerador normaliza ao comparar; os arquivos continuam exatamente como foram publicados.

## 4. Escala de evidência (níveis não intercambiáveis)

| Nível | O que prova | Como é obtido aqui |
|---|---|---|
| 1. **código** | a rota existe e declara o que declara | leitura estática de `src/app` pelo gerador |
| 2. **teste automatizado** | comportamento verificado por máquina | `gates_automatizados` (workflow cujo filtro `paths:` alcança a rota) |
| 3. **captura visual** | aparência registrada em viewport declarado | `docs/<etapa>-evidencias/resumo.json` |
| 4. **validação manual** | percurso humano executado e anotado | **sem fonte legível por máquina** → `nao_registrado` |
| 5. **aceite humano** | decisão do proprietário/área | **nunca inferido** → `nao_registrado` |

Regra aplicada: um nível inferior **não** substitui um superior, e a coluna `classe_evidencia` registra apenas o nível mais alto realmente sustentado. O gerador atribui 1–3; 4 e 5 exigem registro explícito de quem executou.

Toda rota tem ainda o **baseline** `gate_baseline` (`ci.yml`, `admin-entry-delivery.yml`, `l04`–`l08-delivery.yml`, que usam `src/**` ou não têm filtro de caminho). Ele prova compilação e unidade, **não** a jornada da rota; por isso não eleva a classe de evidência.

**Distribuição atual (100 rotas):** código **46** · teste automatizado de jornada **34** · captura visual **20** · validação manual registrada **0** · aceite humano registrado **0**.

## 5. O que o inventário registra

| Área | Rotas | Papéis declarados na página | No escopo do tema admin | Gate de jornada | Captura | Componente/estilo UI | Marcador demo | `<table>` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| administrativo staff | 44 | 39 | 42 | 23 | 19 | 31 | 18 | 100 |
| portal do cliente autenticado | 15 | 0 | 0 | 15 | 1 | 1 | 0 | 0 |
| entrada/recuperação do cliente | 14 | 0 | 0 | 14 | 0 | 0 | 8 | 0 |
| site público | 14 | 0 | 0 | 1 | 0 | 0 | 1 | 1 |
| prévias visuais de layout | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| portal do funcionário | 1 | 0 | 0 | 1 | 0 | 1 | 0 | 0 |
| homologação local (restrita) | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| **Total** | **100** | **39** | **42** | **54** | **20** | **33** | **28** | **101** |

Outros fatos verificados no código:

- **Layouts:** apenas dois — `src/app/layout.tsx` (raiz) e `src/app/cliente/app/layout.tsx` (área autenticada do cliente). Nenhuma rota tem layout próprio além desses.
- **Papéis declarados** (`AdminGate allowedRoles`), por quantidade de rotas: `admin` 38 · `ti` 35 · `marcelo` 28 · `comercial` 9 · `supervisor` 4 · `financeiro` 3 · `rh` 3 · `operacao` 2. O menu (`ADMIN_MODULES`) declara **26** destinos — reconciliado na seção 8.
- **Tema dia/noite:** 42 rotas estão dentro de `data-admin-theme-scope` (40 via `AdminGate`, mais `/admin/entrar` e `/admin/verificacao-manual`). As demais 58 estão fora do escopo do tema administrativo. Tokens em `src/styles/ux-tokens.css` (dia) e `src/app/admin/admin-theme.css` (bloco `html[data-admin-theme="night"]`). Persistência por **navegador** (`localStorage`, chave `segsystem.admin.appearance.v1`), não por conta.
- **Componentes compartilhados** (`src/components/ui`): usados por 32 rotas — `UiState` 22, `UiBadge` 15, `UiTaskWorkspace` 10, `UiTableScroll` 2, `UiCardLink`/`UiField`/`UiEmployeePicker`/`UiRecordPicker` 1 cada. A folha `UiWorkspace.module.css` é usada por 19 rotas. **`UiPanel` é componente órfão**: nenhuma rota ou componente o importa. **67 rotas** não usam componente nem estilo UI compartilhado.
- **Dados demonstrativos:** 28 rotas carregam marcador textual de demonstração/protótipo/simulação/dado fictício. `/qa/modulos` só responde em modo de homologação loopback (`notFound()` caso contrário) e `/admin/visual` é redirecionamento de compatibilidade para `/admin/aparencia`.
- **Estados declarados** (ocorrência estática, não exercício): carregando 42 · erro 24 · vazio 62.
- **`toLocaleString()` sem localidade:** **0** ocorrências — a regressão da auditoria de 08/10 continua valendo.

## 6. O que segue desconhecido

- **Nada foi verificado em navegador nesta fatia.** Não houve captura nova, percurso de teclado, teste de contraste nem conferência em 320/390/768/1440 px.
- **80 rotas não têm captura visual.** As 20 capturadas existem só em `1440x900` e `390x844`; faltam 320 px e 768 px.
- **Tema noturno: nenhuma captura nos dois modos.** A cobertura de tema é afirmação de código (tokens + escopo), não verificação visual.
- **Teclado:** os `resumo.json` registram apenas o *primeiro foco* (20 rotas). Percurso completo, ordem, foco visível e armadilha de foco continuam não verificados.
- **Estados:** a matriz registra presença declarada no código; carregando/erro/vazio/acesso negado/indisponibilidade não foram exercitados.
- **Validação manual e aceite humano: zero registros legíveis por máquina.** Nenhuma rota pode ser declarada aceita.
- **46 rotas têm apenas evidência de código**, entre elas todas as 21 rotas administrativas sem gate de jornada: `/admin`, `/admin/aparencia`, `/admin/clientes`, `/admin/convite`, `/admin/emergencial`, `/admin/entrar`, `/admin/leads`, `/admin/patrimonio`, `/admin/pendencias`, `/admin/portal` (+ `/alertas`, `/autocadastro`, `/convites`, `/permissoes`, `/solicitacoes`), `/admin/publicacao`, `/admin/relatorios`, `/admin/tema`, `/admin/ti`, `/admin/verificacao-manual`, `/admin/visual`.

## 7. Limitações do próprio método

- Contagens de controles, tabelas e estados são **ocorrências estáticas**: componentes compartilhados, conteúdo condicional e campos criados em tempo de execução podem não estar atribuídos à rota correta.
- O mapeamento de gates usa o filtro `paths:` dos workflows. Um gate cujo filtro seja mais largo que `src/app/...` cai em `gate_baseline`, não em `gates_automatizados` — o inventário pode **subestimar** cobertura, nunca superestimar.
- Capturas são atribuídas pela rota declarada no `resumo.json`; se uma etapa registrar a rota errada, o inventário reproduz o erro.
- A reconciliação compara **conjuntos de rota**, não o conteúdo das telas. Uma rota presente nos dois conjuntos pode ter mudado inteiramente entre as datas.

## 8. Única alteração de código desta fatia — check vermelho pré-existente na `main`

`tests/admin-navigation.test.mjs` falhava na `main` antes desta sessão: o teste esperava **27** destinos no catálogo e o código tem **26**. Evidência:

- `QA baseline` (`.github/workflows/ci.yml`) está **failure** nos últimos 5 pushes da `main` — runs `38024246882` (`c50a99b`), `38024238905`, `38006137177`, `37993655399`, `37871637500`. No run `38024246882` o único step vermelho é `Administrative navigation catalogue and role-filtered search`.
- Causa: o commit `77d50275e5` (2026-10-08T04:52:19Z, pushed direto na `main`, sem PR) retirou `/admin/visual` ("Editor visual") de `ADMIN_MODULES` e do grupo `Sistema` em `src/lib/admin-navigation.mjs`, sem atualizar o baseline do teste.

Correção aplicada: baseline do teste **27 → 26**, com comentário datado. **Nenhuma capacidade foi removida nem restaurada por iniciativa própria**:

- `/admin/visual` continua existindo como rota e como redirecionamento para `/admin/aparencia` (`src/app/admin/visual/page.tsx`), e está no inventário;
- `/admin/aparencia` está no menu desde a PR #185;
- `ADMIN_GROUPS` já soma 26 hrefs e cobre exatamente os 26 destinos do catálogo — as demais asserções do teste passam sem alteração.

Reverter a decisão de menu (devolver "Editor visual" ao catálogo) exigiria autorização explícita do proprietário, porque contradiz a decisão registrada no código ("Appearance is the sole visual entry"). **Fica como decisão pendente do proprietário**, não como pendência técnica.

Além disso, `tests/ux-pro-00-inventory.test.mjs` foi registrado em `test:unit` (`package.json`) para que `npm test`/`ci.yml` exerçam o gerador. Nenhum outro arquivo de produto foi tocado.

## 9. Validação executada

Base `c50a99b`, Node v22.22.3, npm 10.9.8, Linux.

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | **5/5 OK**, 0 imports ausentes, 0 migrações ausentes (001–180) |
| `npm run typecheck` (`tsc --noEmit`) | **exit 0**, sem erros |
| `npm test` (`test:unit`, agora com os 4 testes novos) | **870 aprovados, 0 falhas, 0 pulados** (866 antes + 4) |
| `node --test tests/ux-pro-00-inventory.test.mjs` | **4/4 aprovados** |
| `node --test tests/admin-navigation.test.mjs` | **2/2 aprovados** após a correção do baseline (antes: 1 falha `26 !== 27`) |
| `npm audit --audit-level=high` | **found 0 vulnerabilities**, exit 0 |
| `npm run build` | **exit 0**, `Compiled successfully`, `Generating static pages (105/105)`, tabela `Route (app)` com as 100 rotas + `/_not-found` |
| `npm run test:rag` | **OK** (`RAG HTTP smoke: rota canônica, escopo privado e rascunho oculto OK`), exit 0 |
| `npm run test:tenant:pg` | **22/22 aprovados**, exit 0, `QA_PG_TEMP_CLEANED: true` |
| `node scripts/ux-pro-00-inventory.mjs --check` | **OK**: os dois CSVs versionados conferem com o código |
| `git diff --check` | sem whitespace errors |

Os gates `test:demo-local:pg` e os gates focais por família (`test:ux-*:pg`, `test:ext*:pg`) exigem PostgreSQL/Chromium e são exercidos pelos workflows na PR; o resultado publicado na PR é a evidência para eles.

## 10. Registros históricos preservados

Mantidos integralmente, com a data e o número que registraram: `UX-00-INVENTARIO-ROTAS.csv`, `UX-00-AUDITORIA-BASELINE-2026-10-05.md`, `FECH-12-INVENTARIO-ROTAS-2026-10-07.csv`, `FECH-12-MATRIZ-COBERTURA-2026-10-07.csv`, `FECH-ENTREGA-DESENVOLVIMENTO-2026-10-07.md`, `AUDITORIA-INTERFACE-ROTAS-2026-10-08.csv`, `AUDITORIA-INTERFACE-ROTAS-2026-10-08.md`, `UX-RELATORIO-FINAL-MATRIZ-ROTAS.csv`, `IDENTIDADE-VISUAL-E-APARENCIA-2026-10-07.md`, `ARENA-CONTINUACAO-UX-2026-10-05.md`, `FECHAMENTO-UX-RAG-CHECKLIST-2026-10-07.md`, `FECH-PROMPT-VALIDACAO-2026-10-07.md`.

Os documentos de entrada que citam contagem de rotas receberam apenas um **apontador aditivo** para esta fonte vigente; nenhum texto histórico foi editado.

## 11. Próxima fatia

UX-PRO-01 — Tokens e chrome compartilhado. Insumos desta fatia: os 67 rotas sem componente/estilo UI compartilhado, `UiPanel` órfão, os dois layouts, o escopo de tema em 42 rotas e a persistência de tema por navegador (`segsystem.admin.appearance.v1`).

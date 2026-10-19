# UX-PRO-E5 — regiões focáveis para tabelas administrativas

**Data:** 19/10/2026
**Base:** `main`/`origin/main` = `b207f62bd87b7d5a2945f82c0547f12c0942266a` (merge da PR #268).
**Branch:** `ux-pro-e5-analytics-table-scroll`.
**Autorização:** E5 faz parte da fila compartilhada E8/E9/E5 autorizada pelo proprietário; E8 já foi integrada na #268.

## Descoberta estática do DOM montado

O componente real `src/components/ui/UiTableScroll.tsx` já fornece `role="region"`, `aria-label` e `tabIndex={0}`. Uma varredura TypeScript sobre os TSX administrativos encontrou **51 wrappers `styles.tableWrap` em 14 arquivos**:

- 6 wrappers em Patrimônio contêm `UiTableScroll`; já têm a semântica e o foco no elemento de rolagem interno.
- 5 wrappers de Integration Logs têm `role="region"`, nome acessível e `tabIndex={0}`.
- 1 wrapper de Incidentes tem `tabIndex={0}` e `aria-label`, mas não declara `role="region"`.
- Os outros **39 wrappers envolvem diretamente uma `<table>` sem `role`, nome acessível ou foco por teclado**.

Todos os 45 casos que envolvem diretamente tabela ficam em `/admin/analytics`, `/admin/compliance`, `/admin/contratos`, `/admin/expansao`, `/admin/financeiro`, `/admin/frota`, `/admin/funcionarios`, `/admin/operacao`, `/admin/qualidade`, `/admin/satisfacao`, `/admin/terceiros` e áreas TI (logs/incidentes). As ocorrências são elementos JSX reais montados pelos workspaces; a lista, contagem e tratamento dos componentes já preparados devem ser verificados por teste AST, não por busca textual parcial.

## Escopo desta PR

Completar a semântica e navegação de teclado nos wrappers administrativos que ainda rolam horizontalmente sem foco acessível: nos 39 casos diretos, adicionar `role="region"`, nome acessível consistente com o componente existente (`Tabela com rolagem horizontal`) e `tabIndex={0}`; no wrapper de Incidentes, completar `role="region"`. Preservar os wrappers já corretos e os 6 usos de `UiTableScroll` sem criar regiões/focos duplicados.

A apresentação e o contrato visual do conteúdo não mudam: classes CSS, tabela, cabeçalhos, linhas, nomes, ordenação, ações, API, papéis, permissões, isolamento, auditoria e dados permanecem iguais. O CSS de foco já cobre elementos `[tabindex]` dentro do escopo administrativo em `admin-theme.css`; não há motivo para alterar CSS sem nova medição.

## Riscos e invariantes

- Não aplicar atributos a wrappers genéricos que não contêm diretamente tabela nem aos wrappers externos que já contêm `UiTableScroll`.
- Não duplicar `role="region"`, tab stop ou rótulo numa mesma área de Patrimônio/Integration Logs.
- Uma região pode não precisar ser percorrida em desktop sem overflow; o padrão `UiTableScroll` existente já usa tab stop uniforme, mas o teste deve provar dimensões e comportamento em viewport estreita.
- Testar navegação por teclado e foco visível; não declarar auditoria com leitor de tela ou aceite humano.
- Preservar estados, conteúdo e fluxos de todos os módulos; nenhuma alteração em APIs, banco, autenticação, RBAC ou autorização.
- Os arquivos gerados `next-env.d.ts` e `tsconfig.json` devem manter seus hashes antes/depois dos gates.

## Plano de validação e evidência

1. Criar teste AST focal para os 51 wrappers e executar antes da correção: provar os 39 semânticos incompletos, 1 parcial, 5 prontos e 6 wrappers internos já cobertos.
2. Usar o gate PostgreSQL/HTTP/Chromium já existente de `/admin/analytics` e medir antes/depois a tabela canônica em 320/390 px, rolagem horizontal, Tab/foco visível e atributos reais do DOM. O gate já verifica isolamento/sessão, estados, contratos e dados sintéticos via APIs canônicas.
3. Acrescentar teste AST de regressão nos 51 wrappers para que novos casos não voltem a ser adicionados sem rótulo, região e foco; validar exceções já cobertas sem aninhamento.
4. Executar gate focal, `npm test`, typecheck, build, `qa-wave0-static`, inventário `--check`, `git diff --check` e checks remotos da PR.
5. Capturar screenshot e resumo JSON próprios; separar inspeção estática, captura automatizada e validação manual. Nenhum aceite humano será inferido.

## Limitações atuais

O inventário estático demonstra omissão de semântica em JSX, não comprova overflow real em todas as tabelas/estados. A evidência automatizada de navegador cobre um caminho montado representativo em Analytics; leitores de tela, todos os dados e estados de todos os 12 módulos e validação manual permanecem fora desta prova. A suíte completa do Windows pode falhar por `EPERM` em testes alheios de criação de symlink; isso deve ser reportado separadamente, sem apagar ou pular essas asserções.

## Execução da linha de base

- A varredura AST TypeScript identificou 51 ocorrências em 14 arquivos: 6 wrappers externos de Patrimônio já delegam ao `UiTableScroll`, 5 wrappers de Integration Logs já estão completos, 1 wrapper de Incidentes tem foco/rótulo sem role, e os outros 39 não têm atributos de região/foco.
- Antes de mudar qualquer JSX de workspace, o gate isolado `UX_ANALYTICS_TEST_PATTERN='UX-PRO-E5 browser' npm run test:ux-analytics:pg` subiu servidor real, PostgreSQL temporário UTF-8 e Chromium local. Em `/admin/analytics` (admin, 390×844, dia), a tabela rolou horizontalmente: wrapper `clientWidth=301`, `scrollWidth=842`, `maxScrollLeft=541`; o DOM confirmou `role=null`, `aria-label=null`, `tabIndex=-1`. O teste falhou como esperado ao exigir `role="region"`.
- Captura anterior automatizada: `docs/ux-pro-e5-evidencias/analytics-390-e5-before.png`; medições reproduzíveis em `analytics-390-e5-before.json`. A imagem inclui a indicação visual de compilação do Next em desenvolvimento; os valores de geometria vieram diretamente do DOM.
- O primeiro gate criou cluster com locale WIN1252 e migração falhou antes da suíte; a configuração do gate foi corrigida para UTF-8/locale `C`, e o teste foi repetido com sucesso até a asserção E5.

# UX-PRO-E8 — contraste noturno dos controles compartilhados

**Data:** 19/10/2026
**Base:** `main`/`origin/main` = `8306f84326ebb0e3634e6363ee807b1930389019` (merge da PR #267); 11 checks remotos SUCCESS.
**PRs abertas no início:** nenhuma.
**Branch:** `ux-pro-e8-shared-contrast`.
**Autorização:** o proprietário autorizou E8/E9/E5 como fila compartilhada em uma ou duas PRs após concluir C11.

## Escopo desta PR

Corrigir **E8**, contraste dos controles ativos compartilhados pelo `UiWorkspace.module.css`, somente no tema administrativo noturno. Evidência integrada em `/admin/conhecimento`: a aba ativa mede `1,95:1` (`#fff` sobre `--ux-color-brand` noturno `#92bdf2`), abaixo de 4,5:1. Fonte: `docs/ux-pro-08-conhecimento-evidencias/resumo.json`, captura `conhecimento-768-noite.png`, viewport 768×1024.

No workspace de Conhecimento, os botões primários têm `className="primary"` literal e não recebem a classe local de CSS Modules `.primary`; por isso eles não demonstram a regra `.actions .primary` e foram excluídos do teste focal. Esta fatia corrige somente a aba ativa, efetivamente montada. O seletor de ação compartilhado fica fora do escopo até ser reproduzido em um consumidor que aplique ambas as classes locais.

## E9 e E5: triagem e separação

- **E9 (cabeçalho/quebra em 768 px):** a evidência atual de Conhecimento em 768 px mostra o `h1` dentro do contêiner, sem overflow do documento. O seletor compartilhado vigente já inclui `overflow-wrap: anywhere` em `.workspace`. O alvo histórico `UiWorkspace.module.css:11` não identifica por si só um defeito atual. A nova passagem medirá cabeçalhos montados no recorte de 768 px; E9 só entra em correção se um caso atual for reproduzido. Não se força quebra de palavras apenas por inferência histórica.
- **E5 (região focável de rolagem de tabela):** o inventário local encontrou 51 usos de `styles.tableWrap` no administrativo; o componente `UiTableScroll` já fornece `role="region"`, nome acessível e `tabIndex={0}` em alguns consumidores. A cobertura precisa distinguir esses wrappers, seus nomes/rotas e quais realmente rolam horizontalmente em 320/390 px. Será uma PR separada, ainda dentro da autorização de até duas PRs, para não misturar a mudança de contraste com alteração JSX em numerosas telas.

## Superfícies e invariantes

- CSS compartilhado é importado por `/admin/conhecimento`, `/admin/fornecedores`, `/admin/comercial`, `/admin/carteira`, `/admin/financeiro`, `/admin/operacao`, RH e demais workspaces listados no código. O efeito de E8 deve permanecer restrito à moldura staff em tema `night`.
- Não alterar texto, conteúdo, cores de tema diurno, ações, estados selecionados/inativos, navegação, autenticação, papéis, permissões, APIs, payloads, dados, auditoria nem fluxo de operação.
- Preservar a identidade visual e os tokens existentes; usar cor de texto escura legível sobre o fundo brand claro do tema noturno, sem inventar fundo ou token arbitrário.
- Não tocar em `UiTaskWorkspace.module.css`, tabelas de clientes nem CSS do site público nesta PR.

## Plano de teste e evidência

1. Acrescentar primeiro um caso focal de navegador para `/admin/conhecimento` que leia a cor computada da aba ativa no tema noturno e exija razão ≥4,5:1; executar contra este SHA antes de mudar CSS e registrar a falha exata. O dia deve permanecer inalterado.
2. No mesmo caso, registrar dimensões/retângulos dos cabeçalhos a 768 px e confirmar que a evidência atual não atribui problema a E9. Se outro heading transbordar, documentar o nó real; correção E9 fica condicionada à reprodução e à revisão do menor escopo.
3. Capturar antes/depois com Chromium local e papel de teste, sem dados reais; separar captura automatizada de inspeção estática e de validação manual.
4. Executar o gate PostgreSQL/HTTP/Chromium de Conhecimento, gate de preservação dos assistentes se tocar tokens compartilhados, typecheck, build, `qa-wave0-static`, inventário `--check`, regressões focais e `git diff --check`.
5. Conferir consumidores do CSS e o diff inteiro. Nenhum arquivo gerado (`next-env.d.ts`, `tsconfig.json`) deve ser incluído.

## Limites

O número 1,95:1 é evidência automatizada localizada em uma rota/viewport/tema, não auditoria de todos os consumidores. A PR não declara conformidade WCAG, teste com leitores de tela, validação manual, aceite humano, homologação ou prontidão de produção. E9 e E5 permanecem explicitamente separados até serem medidos no código e navegador atuais.

## Execução da linha de base

- O primeiro gate falhou antes dos testes porque o cluster descartável herdou WIN1252; a configuração do próprio gate foi fixada para `UTF8`/locale `C` e usa sempre PostgreSQL temporário.
- Em 19/10/2026, antes da regra CSS, o gate `npm run test:ux-knowledge:pg` executou 11 testes: 10 passaram e o caso E8 falhou como esperado com `activeTab ... 1.95:1` (limite do teste: 4.5:1). O cabeçalho E9 a 768 px ainda não foi alcançado na asserção porque o caso encerrou no primeiro defeito. Após a correção, a próxima execução medirá ambos.
- O gate permite Chromium local por `UX_KNOWLEDGE_BROWSER_EXECUTABLE_PATH`; o caminho padrão empacotado permanece inalterado. A captura própria desta fatia é opcional via `UX_E8_EVIDENCE_DIR`.

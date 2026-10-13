# UX-PRO-03 — Catálogo e equipamentos

Data: 13/10/2026  
Base: `main` em `8c3ba6538decb61a154f184218a38c237f8d9520` (após PR #200).  
Rota e navegação: workspace `/admin/comercial`, etapa existente “Catálogo & equipamentos”. Os componentes `CatalogClient` e `EquipmentClient` já estavam montados; esta fatia não cria rota ou acesso novo.

## Antes e depois

| Antes | Depois |
|---|---|
| Catálogo apresentava uma lista de cartões densos, um parágrafo de esquema/API e um rodapé que dizia haver rascunhos, embora o filtro de consulta excluísse serviços não publicados. | A tela explica o escopo da consulta, permite escolher o tipo, informa a origem (banco ou fallback) e diferencia carregamento, erro e lista vazia. Dados extensos de atendimento e qualificação podem ser expandidos por serviço. Rótulos de tipo/aprovação não inventam valores quando ausentes. |
| Equipamentos misturavam cadastro, filtros e cartão com JSON técnico exposto, em controles sem rótulo persistente. A tela não explicava que o cadastro novo fica pendente de validação. | O formulário e a busca têm rótulos, instruções, estados de envio e confirmação. Cartões priorizam nome, fabricante/modelo e situação; identificador, especificações e compatibilidades ficam em detalhe expansível. A interface informa que o item é criado ativo e aguardando validação técnica, e que SKU/local são referências, não movimentação de estoque. |
| Cores inline, listas sem estado vazio consistente e layout largo pouco adaptável. | Estilo compartilhado utiliza tokens administrativos para tema dia/noite, cartões responsivos, foco visível, alvos de 44px e conteúdo móvel em uma coluna. |

## Comportamento preservado e limites funcionais

- Catálogo mantém `GET /api/catalog` com `includeUnpublished=false` e o filtro `serviceType`; continua usando o escopo de serviços publicado/validado da API, sem mostrar rascunhos como disponíveis.
- A origem retornada (`database` ou `fallback`) é apenas indicada na tela; fonte e regras permanecem controladas pela API existente.
- Equipamentos mantêm `GET /api/crm/equipment` com filtros de categoria/pesquisa e `POST /api/crm/equipment` com os mesmos campos enviados antes (`id`, fabricante, modelo, nome, categoria, fornecedor e garantia).
- O servidor continua exigindo sessão administrativa e same-origin; grava o item como ativo e não validado e registra a ação de auditoria. Nenhuma permissão, endpoint, payload, dado ou regra de servidor foi alterada.
- A tela não ganhou edição/aprovação, paginação, integração de estoque, especificações editáveis nem validação automática. Itens além do limite padrão da API continuam exigindo refinamento pelos filtros; a limitação fica informada.
- Nenhum componente órfão foi ativado, e nenhum layout público foi alterado.

## Validação

- `node --test tests/ux-pro-03-catalog-equipment-ui.test.mjs` — 5/5 aprovados. Verifica montagem, contratos de rota/payload, estado de aprovação, filtros, rótulos e classes responsivas.
- `npm run typecheck` — aprovado.
- `node scripts/ux-pro-00-inventory.mjs --check` — aprovado; inventário preservado em 100 rotas.
- `npm run build` — aprovado; 105 páginas geradas.
- `git diff --check` — aprovado.
- Revisão de código/CSS para viewports 320, 390, 768 e 1440 px: formulários fluem para uma coluna em até 700 px, cartões para uma coluna em até 1000 px, conteúdo quebra linhas, sem largura mínima fixa nos cartões.
- Tema noite: superfícies, texto, bordas e estados usam tokens `--ux-color-*`; o contraste foi revisado no CSS, sem medição automatizada de contraste nesta fatia.
- Teclado: `<label>` associado a cada controle, ordem nativa, summaries expansíveis, foco `:focus-visible` e botões com alvo mínimo de 44 px foram conferidos no código.

## Limitações da evidência

Não foi feita sessão autenticada em navegador, travessia manual por teclado nem captura real antes/depois nos quatro viewports ou nos dois temas. Os tamanhos e temas foram revisados estaticamente no CSS; os testes verificam estrutura e contratos, não substituem a inspeção visual e o aceite humano.

## Próxima etapa UX-PRO-03

Reavaliar na `main` as telas renderizadas restantes do console técnico: backup, integrações, notificações e privacidade, além de SEO/retenção somente se estiverem montadas atualmente. Componentes encontrados apenas em definições não devem ser ativados sem decisão funcional própria.

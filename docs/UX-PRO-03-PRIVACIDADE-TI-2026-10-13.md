# UX-PRO-03 — Privacidade no console de TI

**Data:** 13/10/2026
**Base:** `main` SHA `664f25fefc1287b5caef72e4f863152cb8f55c90`
**Superfície:** opção Privacidade, realmente montada por `TiConsole` e protegida pela página `/admin/ti`.

## Antes e depois

| Antes | Depois |
|---|---|
| Inventário e políticas apareciam em formulários compactos com estilos inline, nomes de campos em inglês e pouca separação entre revisão, cadastro e publicação. | A tela separa inventário e políticas, usa rótulos persistentes em português, explicações, unidades e limites dos campos; conteúdo longo e informações de política têm hierarquia própria. |
| Não havia estado inicial explícito e falhas de consulta podiam deixar a tela parecendo vazia. | Consultas simultâneas mostram carregamento; vazio só é mostrado após resposta válida; sessão/permissão, falha de conexão/API e sucesso têm feedback distinto e opção de tentar novamente. |
| Categorias e bases legais apresentavam valores internos e não expunham todos os valores aceitos pela API. | Rótulos são traduzidos sem alterar os valores enviados; categorias, bases legais e estados existentes permanecem disponíveis. |
| Campos opcionais aceitos pela API (detalhe da base, fonte, contato do encarregado) não estavam plenamente visíveis; detalhes de política ficavam comprimidos. | Campos existentes foram organizados e os registros mostram finalidade, base, retenção, destinatários, sensibilidade, obrigatoriedade, fonte e dados da política em detalhes expansíveis. |
| Layout compacto e cores locais dificultavam leitura em tema noite e telas menores. | CSS module usa tokens semânticos existentes, grades responsivas, controles com alvos de 44 px e foco de teclado visível. |

## Contratos e comportamento preservados

- A tela continua montada em `TiConsole` e sob o gate existente da página `/admin/ti`; não foi alterada a autorização do servidor.
- Leituras mantêm `GET /api/admin/privacy/inventory` e `GET /api/admin/privacy/policies`. Escritas mantêm `POST /api/admin/privacy/inventory`, `POST /api/admin/privacy/policies` e `PATCH /api/admin/privacy/policies/{id}`.
- Os campos e tipos de payload aceitos são preservados: categoria, campo, descrição, finalidade, base legal e detalhe, retenção, destinatários, sensibilidade, obrigatoriedade e fonte; título, conteúdo, contatos, encarregado, retenção, direitos e destinatários da política; transição de estado e motivo de rejeição.
- Todas as categorias, bases legais e estados retornados/aceitos pela API continuam representados. Regras de aprovação e publicação permanecem aplicadas pela API; a publicação continua condicionada à aprovação por Administração. Uma falha na carga não é apresentada como lista vazia.
- Registros de inventário e políticas são descritos como declarações internas. A interface não afirma adequação jurídica, conformidade legal ou validação pelo encarregado. Criar rascunho não publica. Não houve mudança de banco, rota, migração, auditoria, papel, dado ou integração externa.

## Validação

- Teste focal: `node --test tests/ux-pro-03-ti-privacy-ui.test.mjs` — 5/5 aprovados.
- `npm run typecheck` — aprovado.
- `npm run build` — aprovado; 105 páginas geradas.
- `node scripts/ux-pro-00-inventory.mjs --check` — aprovado; 100 rotas conferem com os CSVs vigentes.
- `git diff --check` — aprovado.
- `npm test` — 917 aprovados e 3 falhas em 920 testes. As três falhas são tentativas de criar symlinks bloqueadas por `EPERM` no Windows: `qa-backup-coverage-inventory`, `qa-cli-v2-local-provider` e `qa-cli-v2-transfer`. O `QA baseline` do GitHub/Linux precisa confirmar a suíte sem essas restrições locais.
- Revisão estática desktop/mobile: tokens e quebra em 900 px e 650 px; os painéis passam a uma coluna até 900 px e os campos e ações ocupam uma coluna/largura total até 650 px. A matriz do repositório define viewports 320, 390, 768 e 1440 CSS px; os breakpoints foram inspecionados em código, sem execução visual autenticada nesses viewports.
- Tema claro/escuro: os elementos desta superfície usam tokens do console; revisão estática, não captura de navegador autenticado.
- Teclado: campos associados por `<label>`, controles HTML nativos, `<details>/<summary>` e `:focus-visible`; não houve travessia manual autenticada.
- Não foi obtido aceite humano. A validação manual desktop/mobile, mudança real de tema e navegação completa por teclado permanecem pendentes, pois não havia sessão autenticada utilizável nesta execução.

## Limites e próxima etapa

A API limita a lista de políticas às 50 versões mais recentes; a tela informa esse limite e não acrescenta paginação. O mesmo serviço pode retornar todo o inventário; essa regra não foi alterada. A tela mantém o comportamento existente de ações de estado e não determina se um conteúdo é juridicamente correto. A mudança não valida publicação ponta a ponta no site público nem promove a tela como revisão legal.

Na próxima sessão, conferir a `main` atual e o histórico UX-PRO-03 para escolher uma única superfície restante que esteja de fato montada no console TI. Inspecionar seu componente e API antes de editar, não ativar componentes órfãos, abrir PR pequena e seguir o mesmo gate de checks/revisão antes do merge.

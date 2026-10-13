# UX-PRO-03 — Curadoria de RAG e fontes por pasta

Data: 13/10/2026  
Base: `main` na revisão local `5150418`  
Escopo desta PR: telas “Bases dos assistentes” e “Fontes em pastas” no console de TI.

## Antes e depois

| Antes | Depois |
|---|---|
| A gestão de fontes mostrava chave da raiz e caminho relativo misturados ao resumo operacional, com o relatório JSON aberto no mesmo cartão. | Os cartões priorizam nome, área, conta vinculada quando aplicável, situação, última sincronização e totais do último processamento. JSON fica recolhido em “Detalhes técnicos da sincronização”. |
| O formulário não explicava a diferença entre raiz autorizada e caminho relativo; ações e resultados ficavam dispersos. | Instruções sequenciais explicam cadastro, sincronização em rascunho e revisão/publicação. Campos têm rótulos, exemplos e ajuda persistente. |
| A tela de curadoria usava roxo e superfícies brancas fixas, nomes de colunas e estados técnicos em inglês, além de pergunta de teste sem rótulo visível. | Superfícies, bordas, foco e estados passaram a usar tokens compartilhados; tabelas e ações receberam rótulos em português, estados legíveis e a pergunta tem rótulo associado. |

## Comportamento preservado

- Endpoints `/api/admin/ai-rag-directory-sources`, `/api/admin/ai-rag-indexes` e `/api/admin/ai-rag-documents` e contratos de payload permanecem iguais.
- Cadastro, sincronização de rascunhos, pausa/reativação, criação/publicação/arquivamento de documentos e vínculo do corpus de cliente continuam disponíveis.
- Autorização por papel, escopo de conta, auditoria, revisão humana antes de publicar e operação local não foram alterados.
- Nenhuma rota ou componente órfão foi incluído no menu. Não se anuncia Ollama como saudável só por estar habilitado.
- Nenhuma migração, segredo, dado real ou caminho físico foi adicionado ao Git.

## Validação

- `npm run typecheck` — aprovado.
- `npm run build` — aprovado; 105 páginas geradas.
- `node --test tests/ai-rag-real-scope.test.mjs tests/ai-rag-public-scope.test.mjs tests/rag-widget-contract.test.mjs` — 48/48 aprovados.
- `node --test tests/ux-pro-03-rag-source-ui.test.mjs` — verificação de regressão da apresentação, das ações existentes e dos pontos de foco/responsividade.
- `git diff --check` — aprovado.
- Desktop/mobile: os cartões e campos usam grade fluida e breakpoint de 760px; em telas estreitas, os cartões passam a uma coluna e botões ocupam a largura disponível. A responsividade foi revisada no CSS, sem captura visual autenticada nesta sessão.
- Teclado: rótulos associados, botões nativos, `summary` nativo e foco visível com contorno de 3px estão presentes. A passagem manual completa por teclado permanece pendente.

## Limitações e próxima etapa

A inspeção autenticada no navegador local não foi possível nesta sessão: `/admin/ti` redirecionou para `/admin/entrar`, que permaneceu em “Verificando sessão administrativa”; o servidor de desenvolvimento indicou PGlite em schema mínimo e erros `42P01` em consultas de tabelas ausentes. Por isso não há captura visual desktop/mobile nem validação manual de login nesta entrega. Nenhum aceite humano foi inferido.

Esta PR cobre somente a família coerente RAG/fontes dentro da UX-PRO-03. RBAC, orçamento técnico, SEO, relatórios, retenção, catálogo, backup, auditoria, observabilidade, integrações, notificações e privacidade ainda precisam de revisão própria antes de declarar UX-PRO-03 concluída.

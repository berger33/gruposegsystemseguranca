# Desenvolvimento das frentes de fechamento — 07/10/2026

> **Reconciliação de 10/10/2026 (UX-PRO-00):** registro histórico — preserva a contagem e os limites da sua data. A fonte vigente do inventário de rotas e da cobertura é [UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md](UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md): **100 entradas de rota** na `main` `c50a99beec…`, com critério reproduzível (`node scripts/ux-pro-00-inventory.mjs`) e a reconciliação 98 × 100.

Base: main `7765d9983bdd7bad97f6d8e088e9ae9356d9be8f`. Incorporado o código da PR #182, head `605a64bbfc7fae7ab0d9383f03d86347ad27c69b`, sem repetir os testes do Arena. O proprietário determinou foco no desenvolvimento das 12 frentes e adiamento dos testes. Portanto esta entrega **não é homologação completa, aceite humano ou certificação WCAG**.

## Implementação por frente

| Frente | Código entregue nesta continuação | Limite da entrega |
|---|---|---|
| FECH-01 | Aproveitado assistente privado/contrato da PR #182; RH e Marcelo recebem superfície compartilhada | Testes e capturas importados pertencem ao Arena; não foram reexecutados |
| FECH-02 | Console TI montado, curadoria alcançável, curadoria RH na sua área, leitura com erro/loading, leitura do texto e confirmação visual de revisão antes de publicar; transação de documentos/índices com auditoria estrita; vínculo de versão anterior | Configuração efetiva do modelo vem do ambiente, não dos antigos formulários de bot |
| FECH-03 | Migração 175, API e painel de fontes; raízes vinculadas a área/conta; sincronização explícita; textos/Markdown; hash e versões; rascunho; relatório; pausas; exemplos genéricos no repositório | Requer PostgreSQL migrado e raízes locais configuradas. Sem PDF, watcher, embeddings ou publicação automática |
| FECH-04 | Cadastro/recrutamento com rótulos, seleções, superfície, atalhos, tabelas e estados de leitura; trava de envio em mutações | Reaproveita regras e handlers existentes, sem novo processo de negócio |
| FECH-05 | Afastamentos/benefícios/treinamento com a mesma base visual, erros HTTP, carregamento e trava de mutação | Permissões e fluxos sensíveis precisam de validação posterior |
| FECH-06 | Desligamento/avançado com seleção de pessoas e registros, campos, tabelas, feedback e trava de mutação; alertas modais antigos do avançado passam a mensagem na área | Escala, holerite, revogação e pedido funcionário→RH não foram exercitados ponta a ponta nesta sessão |
| FECH-07 | Subpáginas cliente usam fetch que preserva a distinção HTTP; contratos/documentos mostram erro original classificado; navegação tem alvo mínimo de 44px | Continuidade previamente entregue não foi reescrita; nem todas as mensagens de domínio foram redesenhadas |
| FECH-08 | Patrimônio recebe superfície, campos/tabelas e navegação por tarefas | Nenhuma regra ou movimentação de estoque alterada |
| FECH-09 | Relatórios/emergencial recebem superfície e tabelas acessíveis por rolagem | Sem SMTP, envio externo ou execução de socorro |
| FECH-10 | Leads/clientes/portal recebem superfície de tarefas | Não cria integrações, grants ou novos fluxos de convite |
| FECH-11 | Visual recebe superfície; console TI encaminha saúde, observabilidade, incidentes, registros de integração, RBAC, auditoria, catálogo de backups, notificações, privacidade e tema; carregamento sob demanda; mensagem pública de demonstração | Componentes históricos não são montados indiscriminadamente. Catálogo de backup não significa backup/restauração operacional |
| FECH-12 | Inventário atual de 98 páginas, matriz de origem/cobertura estática, este relatório e runbook; documentação histórica reconciliada | Auditoria visual transversal, leitores de tela, métricas e testes continuam pendentes por instrução do proprietário |

## Verificações feitas

`npm run typecheck`, sintaxe de `server.mjs`, `ai-rag-api.mjs` e `ai-rag-directory-api.mjs`, e `git diff --check`. Inventário gerado com `scripts/ux00-inventory.mjs`. Inspeção de tipos, integração e limites de acesso; orientação da skill React best practices aplicada. Nenhum teste unitário/integrado/browser pesado executado nesta sessão, nem build ou migração no banco operacional. Não desligada a CI: GitHub pode disparar os workflows existentes ao receber commits; seus resultados precisam de revisão separada.

## Segurança e operação

O assistente não ganhou acesso a dados vivos por cosmética. Autorizações continuam no servidor. TI cura público/clientes; admin pode curar todas as áreas; RH cura RH. Novas fontes exigem raiz explicitamente vinculada ao corpus e, para cliente, a uma conta. Raízes de escopos diferentes não podem se sobrepor. Caminhos físicos não saem no contrato de GET. Caminhos relativos não aceitam traversal/absolutos, links são recusados e a importação é limitada. O operador deve usar pastas dedicadas, sem segredos e sem gravação por usuários não confiáveis; não apontar uma raiz para o HD inteiro.

Transação nova usa o mesmo cliente PostgreSQL para documento/chunks/auditoria; falha impede a confirmação. Sincronização usa lock da fonte, mantém o documento antigo e cria rascunho quando o hash muda. O curador precisa revisar/publicar a nova versão e arquivar a anterior explicitamente. Pausar a fonte impede novas leituras da pasta, **não revoga documentos já publicados**. Remoção de arquivo não apaga publicação. Isso evita perda de histórico e alterações silenciosas.

## Validação entregue ao próximo agente

Começar por build e migração 175 em PostgreSQL descartável, migrador oficial duas vezes e checks do SHA final. Depois executar `test:ai-rag-widget:pg`, `test:ux-hr:pg`, `test:ux-portal:pg` e gates das áreas afetadas. Não usar a aprovação de um gate antigo como prova de todo este delta.

Acrescentar cobertura específica da API de fontes: 401/403, raízes ausentes, raiz de corpus/conta errada, sobreposição, traversal, link simbólico, extensão/UTF-8/tamanho/profundidade/quantidade, repetição sem duplicação, alteração criando rascunho ligado ao anterior, arquivo removido, pausa, concorrência, falha de auditoria com rollback. Validar publicação/arquivo/manual versão, índice arquivado, cliente A/B e grant revogado. Em seguida RH sensível, patrimônio, relatórios, acesso TI por papel, formulários e teclado/mobile/zoom. Corrigir defeitos em PRs focais, sem enfraquecer asserções. Windows/Ollama real e aceite humano ficam com o operador.

Nenhuma promessa de que todas as 98 páginas foram redesenhadas individualmente ou que todas as jornadas passaram. Esta entrega cobre desenvolvimento focal nas 12 frentes; o refinamento completo e a certificação dependem da revisão posterior.

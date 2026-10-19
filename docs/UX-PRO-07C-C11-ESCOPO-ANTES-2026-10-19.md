# UX-PRO-07C — C11: abas funcionais em fornecedores

**Data:** 19/10/2026  
**Base:** `main` / `origin/main` em `1a058f2503a560f3e9bf6eb0c65c5820a77dfe8b`  
**Rota:** `/admin/fornecedores`  
**Papel declarado no gate da rota:** `admin`; a guarda existente também admite `marcelo` e `ti`.  
**Escopo:** corrigir somente o C11 documentado para o workspace de fornecedores. Os resíduos E2–E9 de `/admin/financeiro` são outra família e ficam fora.

## Diagnóstico antes da mudança

`FornecedoresWorkspace` monta cinco controles com `role="tab"`, mas todos anunciam `aria-selected` para a primeira posição; não há relação `aria-controls`, painéis `tabpanel`, seleção real nem navegação por setas/Home/End. Ao mesmo tempo, o formulário, a lista, o detalhe, validade/alertas, referências documentais e pedidos internos ficam todos visíveis em uma página longa.

O C11 foi explicitamente autorizado pelo proprietário como parte da fila de trabalho. A solução aplicará o padrão de abas WAI-ARIA dentro da rota já montada e organizará o conteúdo existente em cinco painéis: **Cotações** (formulário e lista), **Detalhe canônico**, **Validade e alertas**, **Referências documentais** e **Pedidos internos**. Todos os campos, ações e resultados existentes serão mantidos nos respectivos painéis. Somente o painel ativo ficará visível; os outros continuarão montados e seus estados controlados serão preservados ao trocar de aba.

## Invariantes e riscos a controlar

- Não alterar rotas, APIs, métodos, payloads, cabeçalhos, chaves de idempotência, transições, auditoria, autenticação, `AdminGate` ou decisão de autorização no servidor.
- Não mover conteúdo para outras páginas nem remover ações. Cada controle existente deve continuar acessível no painel correspondente.
- Manter a ordem e o estado da cotação selecionada, dos formulários e dos dados carregados ao alternar painéis; não disparar novas escritas ao navegar.
- Garantir IDs estáveis e únicos para abas/painéis, `aria-selected`, `aria-controls`, `aria-labelledby`, roving `tabIndex`, setas esquerda/direita, Home e End; Tab sai do conjunto e entra no painel/controles.
- Medir que um clique/tecla troca visibilidade e seleção do painel sem duplo disparo, perda de entrada controlada ou ação fora do escopo.
- Não alterar `UiWorkspace.module.css` sem medição. Preferir as classes já usadas pela tela.
- Dados e contas dos testes são sintéticos; não validar nem registrar acesso de fornecedor externo, que ainda não existe.

## Validação planejada

1. Acrescentar primeiro testes focais para reproduzir o tablist falso na `main` e confirmar a falha antes da implementação.
2. Executar `npm run test:ux-supplier:pg` e o gate herdado `npm run test:ext04-suppliers:pg`; executar `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check` e `git diff --check` conforme o escopo.
3. Validar no Chromium automatizado teclado, ARIA, painel ativo, retenção do estado ao trocar de aba, desktop e 390 px. Separar evidência automatizada de inspeção estática e de validação manual.
4. Confirmar que inventário de rotas não muda e que `next-env.d.ts`/`tsconfig.json` continuam sem alterações.
5. Abrir PR pequena baseada em `main`; aguardar revisão concluída e todos os checks obrigatórios verdes antes de qualquer merge.

## Limites

Esta fatia não corrige itens E2–E9, não representa auditoria WCAG completa, aceite humano, homologação de fornecedor nem validação de produção. O conteúdo de cada aba deve continuar funcional e disponível a quem já tinha acesso.

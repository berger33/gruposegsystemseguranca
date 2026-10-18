# Gap Resolution: UX-Pro-10B P0 - Keyboard Accessibility

> **Retificação (18/10/2026, PR corretiva da #263):** documento movido da raiz para `docs/`. Premissa corrigida: **apenas o Layout 01 contém iframe** (`/visuals/layout-01/index.html`); os layouts 02–10 são componentes React. O gap abaixo — navegação de teclado **em navegador real** — **continua pendente**: não foi executado pela PR #263 nem por esta correção, e nenhum teste unitário o substitui. Ver [`UX-PRO-10B-CORRECAO-263-ESCOPO-ANTES-2026-10-18.md`](UX-PRO-10B-CORRECAO-263-ESCOPO-ANTES-2026-10-18.md).

## Contexto
- **Gap**: Keyboard accessibility (P0)
- **Arquitetura (corrigida)**: somente o Layout 01 contém iframe (`/visuals/layout-01/index.html`); os demais layouts são componentes React
- **Focus management**: Necessário testar Tab order e focus dentro dos iframes
- **Testes unitários**: 958 testes passing (já verificados)

## Status Atual (Análise Estática)

### Estrutura de Navegação
- Todos os layouts têm `SitePreviewNotice visual="XX"` com `aria-label="Prévia interna do layout XX"`
- O componente `SitePreviewNotice` tem `data-testid="site-preview-notice"` e `aria-label`
- Apenas o Layout 01 renderiza `<main className={styles.framePage}>` com iframe interno; os demais renderizam o componente React do layout
- O iframe do Layout 01 tem `title="Layout 01 — Institucional clássica"` e `loading="eager"`

### ✅ Elementos com Atributos de Acessibilidade
- [x] `SitePreviewNotice` tem `aria-label` correto
- [x] Iframe tem `title` descriptivo
- [x] Layouts têm estrutura semântica `header > main > footer`
- [x] Botões de ação têm labels descritivos

### ⚠️ Gap: Navegação de Teclado dentro de Iframes
- **Não verificado**: Tab order dentro do conteúdo do iframe
- **Não verificado**: Management de focus ao entrar/sair do iframe
- **Não verificado**: Contraste de foco visível

## Plano de Ação

### Passo 1: Testar Manual em Navegador
1. Abrir `http://localhost:3000/layout-01` (quando server estiver rodando)
2. Pressionar `Tab` repetidamente até foco chegar ao iframe
3. Verificar se o foco está dentro do iframe ou permanece no parent
4. Testar `Shift+Tab` (reverse navigation)
5. Verificar `focus` styles são visíveis (`:focus-visible`)

### Passo 2: Verificar Estrutura de Foco
1. Contar número de elementos focáveis (tabindex elements)
2. Verificar ordem de tab: header → main content → footer → iframe → preview notice
3. Testar `Esc` para fechar/voltar (se houver modal/dialog)
4. Testar `Enter` em botões de ação

### Passo 3: Verificar Focus Visible
1. Testar com `DevTools > Toggle device toolbar`
2. Verificar `:focus-visible` styles são aplicados
3. Confirmar que `outline` não é removido sem alternativa

### Passo 4: Documentar Resultados
1. Número de passos Tab até alcançar iframe
2. Elementos focáveis identificados
3. Questões de focus management identificadas
4. Correções necessárias (se houver)

## Evidências Esperadas

### ✅ Já Confirmado (Static)
- SitePreviewNotice tem `data-testid="site-preview-notice"`
- Iframe tem `title="Layout 01 — Institucional clássica"`
- Main content tem estrutura semântica

### ⚠️ Pendente (Browser Test)
- [ ] Tab order within iframe content
- [ ] Focus management on iframe enter/exit
- [ ] `:focus-visible` styles aplicados
- [ ] Keyboard trap issues (se houver)
- [ ] Skip navigation links (se aplicável)

## Checklist de Teste

### Nível 1 - Básico
- [ ] Tab key move focus forward
- [ ] Shift+Tab move focus backward  
- [ ] Focus visible is obvious
- [ ] Esc key dismisses any open menus

### Nível 2 - Intermediate
- [ ] Focus reaches iframe content
- [ ] Focus management on context change
- [ ] No focus traps
- [ ] Logical tab order

### Nível 3 - Avançado
- [ ] Skip links para pular conteúdo repetitivo
- [ ] Landmark roles (header, main, navigation) funcionam com leitores de tela
- [ ] Contraste de foco atende WCAG AA (3:1 minimum)
- [ ] Programmatic focus management funciona

## Prioridade e Impacto

### Prioridade: P0 (Crítica)
- **Impacto**: Acessibilidade fundamental - usuários que navegam apenas com teclado não conseguem acessar o conteúdo dos layouts
- **Frequência**: Todo usuário que use teclado apenas (screen readers, motoriidade reduzida, power users)
- **Conformidade**: WCAG 2.1 AA - Success Criterion 2.4.3 Focus Order, 2.4.7 Focus Visible

### Prioridade: P1 (Alta)
- **Impacto**: Usabilidade para leitores de screen readers
- **Frequência**: Usuários de tecnologias assistivas
- **Conformidade**: WCAG 2.1 AA - Success Criterion 1.3.1 Info and Relationships

### Prioridade: P2 (Media)
- **Impacto**: Conforto visual, não bloqueia funcionalidade
- **Frequência**: Usuários sensíveis a contraste
- **Conformidade**: WCAG 2.1 AA - Success Criterion 1.4.3 Contrast (Minimum)

## Próximos Steps Imediatos

1. **Iniciar server** (`npm run dev`) e testar em navegador real
2. **Registrar Tab count** até alcançar iframe content
3. **Testar Shift+Tab** (reverse)
4. **Verificar focus styles** com DevTools
5. **Documentar gaps** encontrados
6. **Criar fixes** se necessário (adicionar tabindex, foco management, etc.)

## Riscos e Considerações

- **Se iframe content for inacessível**: Considerar remover tabindex do iframe ou prover links de pular conteúdo
- **Se focus management for complex**: Implementar `focus-management` role ou `aria-flowto`
- **Conflito com SitePreviewNotice**: Garantir que focus possa mover tanto do preview notice quanto do iframe content

## Rastreamento

Este gap será rastreado no checklist UX-Pro-10B e resolvido antes do fechamento da fatia. Status será atualizado de `⚠️ Pendente` para `✅ Concluído` após teste manual em navegador.

---
**Prioridade**: P0 (Crítica - acessibilidade fundamental)  
**Status**: ⚠️ Pendente - requer teste manual em navegador  
**Próximo passo**: Iniciar server e testar em navegador real
# Gap Resolution: UX-Pro-10B P1 - Theme Switching

## Contexto
- **Gap**: Theme switching (P1)
- **Arquitetura**: 10 temas definidos em `src/styles/themes.css` + `data-color-mode="claro"|"escuro"|"sistema"`
- **Visual files**: layout-01 visual tem toggle de tema preview (light/dark classes)
- **Testes unitários**: 958 testes passing (já verificados)

## Status Atual (Análise Estática)

### ✅ Temas CSS Confirmados
Arquivo: `src/styles/themes.css` contém 10 temas com variáveis CSS:

| Tema | --theme-bg | --theme-fg | --theme-accent | Observações |
|------|-----------|-----------|---------------|-------------|
| institucional | #f7f6f2 | #1a1a2e | #8b6f3e | Padrão/default |
| minimalista | #ffffff | #0a0a0a | #111111 | Clean/white |
| tech | #0b0d12 | #e8e8ee | #00d4aa | Dark mode, ciano |
| acolhedor | #fdf8f3 | #2e1810 | #c27a4e | Warm/beige |
| industrial | #e4e2db | #1f2730 | #7a6e5d | Gray tones |
| formal-b2b | #f3f1ec | #15192b | #2e3d5b | Corporate/blue |
| editorial | #fffdf8 | #1a1a1a | #bfa15f | Magazine style |
| app | #f4f6fa | #0f172a | #4f8ef7 | Blue/intermediate |
| dashboard | #0f1117 | #f0f0f5 | #f59e0b | Admin/SAAS dark |
| sazonal | #fdfcf5 | #221e1c | #e07a4e | Seasonal/fall |

### Modos de Cor
- `data-color-mode="claro"`: background `#fff`, text `#17253b`
- `data-color-mode="escuro"`: background `#111827`, text `#f8fafc`
- `media (prefers-color-scheme: dark)`: system detection, background `#111827`, text `#f8fafc`

### ✅ Toggle de Tema no Visual Preview
O arquivo `public/visuals/layout-01/index.html` tem:
- [x] Seletor de tema: `.theme-preview__options` com botões
- [x] Classe `active` no botão atual
- [x] `aria-pressed="true"` no botão ativo
- [x] Dois temas: "Clássica" (light) e "Tecnológica" (dark)
- [x] `small` texto: "A escolha muda apenas a prévia neste navegador"
- [x] `aria-label="Prévia das interfaces"`

### ⚠️ Gap: Integração com Aplicação Principal
- **Não verificado**: Como os temas são toggled na aplicação Next.js real
- **Não verificado**: Se o `data-color-mode` attribute é atualizado dinamicamente
- **Não verificado**: Integração com `theme-tech.css` ou outros arquivos de tema
- **Não verificado**: Persistence do tema entre sessões (localStorage, cookie, etc.)

## Plano de Ação

### Passo 1: Verificar Integração de Temas na Aplicação Next.js

Examinar como os temas são aplicados:
1. Verificar `src/app/layout.tsx` ou `_app.tsx` para global CSS
2. Verificar if há `data-theme` ou `data-color-mode` no `<html>` ou `<body>`
3. Verificar toggle botões e seu `onClick` handler
4. Confirmar que `theme-tech.css` é importado/usado

### Passo 2: Testar Troca de Tema em Navegador

Quando server estiver rodando:
1. Abrir `http://localhost:3000/layout-01`
2. Localizar o toggle de tema (`.theme-preview__options button`)
3. Clicar no modo "Tecnológica" (dark)
4. Verificar se `data-color-mode` attribute mudou de `claro` para `escuro`
5. Confirmar que as variáveis CSS foram atualizadas (background, color, etc.)
6. Testar modo "Sistema" (deve respeitar `prefers-color-scheme: dark`)
7. Clicar novamente em "Clássica" e verificar retorno ao modo claro

### Passo 3: Verificar Persistence (opcional)
1. Testar em sessão anônima/incognito
2. Verificar se tema persiste após refresh
3. Testar se mudança em um layout afeta outros layouts
4. Verificar localStorage/cookie para persistência

### Passo 4: Documentar Resultado

1. Lista de temas testados (10 themes + 3 color modes)
2. Qual toggle mechanism existe (button, switch, meta tag)
3. Se `data-color-mode` é atualizado dinamicamente
4. Se persistência funciona
5. Gaps identificados e plano de correção

## Evidências Esperadas

### ✅ Já Confirmado (Static)
- 10 temas definidos em `src/styles/themes.css`
- Variáveis CSS para cada tema (bg, fg, accent, radius, font, shadow)
- Modos de color: claro, escuro, sistema (media query)
- Visual preview tem toggle com 2 opções (clássica/tecnológica)
- `data-color-mode` attribute no body/template

### ⚠️ Pendente (Browser Test)
- [ ] Toggle mechanism na aplicação Next.js real
- [ ] `data-color-mode` attribute update dynamicamente
- [ ] Integração com variáveis CSS do componente
- [ ] Persistence entre páginas/refresh
- [ ] Respeito de `prefers-color-scheme: dark`
- [ ] Theme switching em todos os 10 layouts

## Checklist de Teste

### Nível 1 - Básico
- [ ] Abrir toggle de tema
- [ ] Clicar em modo diferente
- [ ] Verificar mudança visual (background/color)
- [ ] Confirmar `data-color-mode` attribute change

### Nível 2 - Intermediate
- [ ] Testar modo "Sistema" (respeta OS preference)
- [ ] Clicar alternando entre claro/escuro múltiplas vezes
- [ ] Verificar consistência em todos os layouts (01-10)
- [ ] Testar em modo anônimo/incognito

### Nível 3 - Avançado
- [ ] Theme persistence (localStorage/cookie)
- [ ] Integração com `theme-tech.css` ou sistema global
- [ ] Consistência entre desktop e mobile viewports
- [ ] Acessibilidade do toggle (aria-pressed, role button)
- [ ] Animação de transição entre temas (se houver)

## Prioridade e Impacto

### Prioridade: P1 (Alta)
- **Impacto**: Experiência do usuário - personalização visual
- **Frequência**: Opcional - usuários podem escolher tema preferido
- **Conformidade**: Non-critical para WCAG, mas importante para UX
- **Negócio**: Marca consistente, experiência personalizada

### Prioridade: P2 (Media)
- **Impacto**: Acessibilidade visual (usuários com sensibilidade a contraste)
- **Frequência**: Alguns usuários
- **Conformidade**: WCAG AAA - contrastes melhorados em modo escuro

### Prioridade: P3 (Low)
- **Impacto**: Feature nice-to-have, não bloqueia funcionalidade core
- **Frequência**: Opcional
- **Conformidade**: Non-WCAG, experiência do usuário

## Prioridade vs Impacto Matrix

| | Sem Theme Switching | Com Theme Switching Funcional |
|---|---|---|
| **Critical business** | ❌ Bloqueia | ✅ Suporta |
| **High UX** | ⚠️ Limited | ✅ Complete |
| **Medium accessibility** | ⚠️ Partial | ✅ Full |
| **Low polish** | ✅ OK | ✅ Enhanced |

## Próximos Steps Imediatos

1. **Iniciar server** (`npm run dev`) e abrir `http://localhost:3000/layout-01`
2. **Localizar toggle de tema** (`.theme-preview__options button`)
3. **Testar clique** em modo claro vs escuro
4. **Verificar `data-color-mode`** no inspector do navegador
5. **Testar modo sistema** (toggle OS dark mode)
6. **Testar em todos os 10 layouts** (`/layout-01` através `/layout-10`)
7. **Documentar resultados** no checklist UX-Pro-10B

## Riscos e Considerações

- **Se toggle não funcionar**: Considerar implementar handler `onClick` que toggle `data-color-mode` no `<body>` ou `<html>`
- **Se persistência for esperada**: Implementar `localStorage.setItem('color-mode', 'dark')` e `window.matchMedia('(prefers-color-scheme: dark)')`
- **Se theme consistency falhar**: Garantir que todas as variáveis CSS são atualizadas no mesmo toggle event
- **Conflito com meta tags**: Garantir que `theme-tech.css` não entre em conflito com variáveis definidas inline

## Próximos Steps (After This Session)

1. **Após testar**: Atualizar checklist UX-Pro-10B status de theme switching
2. **Se gaps encontrados**: Criar PR com fixes de toggle mechanism
3. **Se tudo funcional**: Confirmar no checklist e marcar como concluído
4. **Documentar**: Adicionar anotações sobre mechanism used no UX-Pro-10C closeout

---
**Prioridade**: P1 (Alta - experiência do usuário)  
**Status**: ⚠️ Pendente - requer teste manual em navegador  
**Complexidade**: Média - requer modificar handler de toggle ou verificar integração existente  
**Próximo passo**: Testar em navegador real após iniciar server
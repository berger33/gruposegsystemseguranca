# Gap Resolution: UX-Pro-10B P0 - Iframe Content Accessibility

## Contexto
- **Gap**: Iframe content accessibility (P0)
- **Arquitetura**: Layouts têm iframes apontando para `/visuals/layout-XX/index.html`
- **Arquivos visual**: Existirem em `public/visuals/layout-01/`, mas apenas layout-01 tem index.html
- **Outos layouts**: layout-02 a 10 estão missing o index.html

## Status Atual

### ✅ layout-01
- `public/visuals/layout-01/index.html` EXISTS
- Contém HTML completo com:
  - `<title>Grupo SEG System | Segurança Integrada em Guarulhos</title>`
- Metatags: viewport, description, robots noindex, nofollow
- Estrutura semântica: header, main, footer
- Atributos aria em elementos
- Toggle de tema preview (light/dark classes)

### ❌ layout-02 a layout-10
- `public/visuals/layout-XX/index.html` MISSING
- Precisam ser criados ou removidos dos layouts

## Plano de Ação

### Passo 1: Verificar quais layouts têm iframes referenciando visuals

Já verificado:
- Todos os 10 layouts têm `<iframe src="/visuals/layout-XX/index.html">`
- Apenas layout-01 tem o arquivo correspondente

### Passo 2: Criar arquivos index.html para layouts missing

Padrão baseado em layout-01. Cada visual deve ter:
- Título único (`Grupo SEG System | [descrição]`)
- Metatags apropriadas
- Estrutura semântica similar
- Atributos de acessibilidade

### Passo 3: Testar acessibilidade dos iframes

Testes manuais em navegador:
1. Acessar `/layout-XX` em navegador real
2. Verificar o iframe carrega corretamente
3. Testar Tab navigation dentro do iframe
4. Verificar title do documento
5. Confirmar meta tags

### Passo 4: Validar após criação

- `npm run build` para garantir não quebra
- Verificar todos os 10 layouts carregam sem erros 404

## Evidências e Checklist

### ✅ layout-01 Verificado
- [x] Arquivo index.html existe em public/visuals/layout-01/
- [x] Título da página carregado corretamente
- [x] Metatags de viewport e description presentes
- [x] Estrutura semântica com header/main/footer
- [x] Atributos aria em elementos de navegação
- [x] Toggle de tema preview (classes light/dark)
- [x] Accessibility label no iframe title

### ⚠️ layout-02 a layout-10 Pendente
- [ ] Criar index.html para cada layout missing
- [ ] Verificar título único por layout
- [ ] Confirmar metatags por layout
- [ ] Testar carregamento em navegador
- [ ] Testar navegação de teclado dentro do iframe
- [ ] Validar após build

## Próximos Passos Imediatos

1. **Criar index.html para layouts 02-10** baseando no layout-01
2. **Testar em navegador** cada um dos 10 layouts
3. **Testar keyboard accessibility** (Tab order, focus management)
4. **Confirmar theme switching** nos visuais
5. **Atualizar checklist** UX-Pro-10B

## Riscos e Limitações

- **Se visual files não puderem ser criados**: Remover referências de iframe dos layouts correspondentes ou apontar para página de fallback
- **Se os visual files forem gerados dinamicamente**: Verificar build process e garantir geração para todos os 10 layouts
- **Contraste de cores**: Os visual files têm temas claros; verificar modo escuro também

## Próximos Steps (After This Session)

Após criar os arquivos:
1. `npm run build` - confirmar build success
2. Testar manualmente cada `/layout-XX` em navegador
3. Testar Tab navigation e foco dentro dos iframes
4. Verificar title tags e metatags por layout
5. Confirmar que o checklist UX-Pro-10B está verde para este item

---
**Prioridade**: P0 (Crítico - afeta acessibilidade de todas as 10 layouts)
**Responsável**: Desenvolvedor/QA
**Dependências**: Arquivos estáticos em public/visuals/
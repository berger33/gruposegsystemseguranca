# Gap Resolution: UX-Pro-10B P0 - Iframe Content Accessibility

> **Retificação (18/10/2026, PR corretiva da #263):** este documento foi criado na raiz do repositório pela PR #263 sob uma premissa falsa e movido para `docs/`. Medido no código: **somente o Layout 01 usa iframe** (`src/components/Layout01.tsx` → `/visuals/layout-01/index.html`); os layouts 02–10 são componentes React próprios e nunca referenciaram `public/visuals/layout-XX/`. Os 9 arquivos criados pela #263 eram órfãos, sem CSS de layout e sem referência alguma, e foram **removidos por decisão do proprietário** — portanto o item "layout-02 a 10 estão missing" **não é um gap**: não há iframe nem arquivo a criar para eles. O gap real que resta é o da UX-PRO-10B: **teste em navegador** (teclado dentro do iframe do Layout 01, tema, zoom), que **continua pendente** e não foi resolvido pela #263 nem por esta correção. Escopo e evidências em [`UX-PRO-10B-CORRECAO-263-ESCOPO-ANTES-2026-10-18.md`](UX-PRO-10B-CORRECAO-263-ESCOPO-ANTES-2026-10-18.md). O texto histórico abaixo fica preservado, com as afirmações falsas corrigidas nos pontos marcados.

## Contexto
- **Gap**: Iframe content accessibility (P0)
- **Arquitetura (corrigida)**: apenas o Layout 01 tem iframe apontando para `/visuals/layout-01/index.html`; os layouts 02–10 são componentes React (`Layout02.tsx`…`Layout10.tsx`) renderizados por `SiteVisualRenderer`/`/layout-preview`
- **Arquivos visual**: `public/visuals/layout-01/index.html` é o único arquivo desta família e o único esperado pelos scripts `package:layout-*`
- **Outros layouts**: não usam iframe nem `public/visuals/` — nada missing

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

Verificado (e retificado em 18/10/2026):
- Apenas o layout-01 tem `<iframe src="/visuals/layout-01/index.html">` (`src/components/Layout01.tsx`)
- Os layouts 02–10 são componentes React e não têm iframe para `public/visuals/`

### Passo 2: ~~Criar arquivos index.html para layouts missing~~ — **cancelado (premissa falsa)**

Não há layouts missing: os arquivos `layout-02..10` criados pela PR #263 a partir desta instrução eram órfãos e foram removidos pela PR corretiva. Nenhum arquivo novo deve ser criado nesta família sem uma referência real no código.

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

### layout-02 a layout-10 — **não se aplica (retificado)**
- [x] Confirmado que nenhum layout 02–10 usa iframe/`public/visuals/` — nenhum arquivo a criar
- [x] Arquivos órfãos da #263 removidos (PR corretiva, 18/10/2026); guarda automatizada em `tests/ux-pro-10b-visuals-guard.test.mjs`
- [ ] Testar em navegador o único iframe real (`/layout-01` → `/visuals/layout-01/index.html`)
- [ ] Testar navegação de teclado dentro desse iframe
- [ ] Validar após build

## Próximos Passos Imediatos

1. **Testar em navegador** o `/layout-01` e os demais layouts como componentes React (`/layout-02`…`/layout-10`, `/layout-preview`)
2. **Testar keyboard accessibility** (Tab order, focus management) — UX-PRO-10B, pendente
3. **Confirmar theme switching** nos visuais
4. **Atualizar checklist** UX-Pro-10B com evidência de navegador

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
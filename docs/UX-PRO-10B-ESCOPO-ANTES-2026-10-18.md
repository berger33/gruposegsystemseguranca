# UX-PRO-10B — escopo antes do navegador (18/10/2026)

**Base:** `origin/main` `d3f8e1711a37b8acbb0b147f5d30f5bbee9655b3` (merge #264); branch `arena/ux-pro-10b-browser-20261018`. **Estado inicial:** zero PRs abertas; checks de `main`: `static-and-smoke` e `backup-restore-postgres` SUCCESS. Esta é a fatia de validação da UX-PRO-10B; não reabre #263/#264 e não mistura o fechamento documental 10C.

## Superfícies montadas e cobertura planejada

| Superfície | Implementação vigente | Verificação de navegador |
|---|---|---|
| `/layout-01` | `SitePreviewNotice` + `SiteVisualRenderer` com Layout 01, que contém iframe para a exportação `public/visuals/layout-01/index.html` | foco entrando e saindo do iframe, foco interno, links e resposta em viewports estreitos/largos |
| `/layout-02`…`/layout-10` | componentes React próprios selecionados pelo `SiteVisualRenderer`; Layout 06 é o site institucional React | navegação por teclado, dimensões e temas do documento/preview |
| `/layout-preview?visual=01..10` | `SitePreviewNotice` + um componente selecionado pelo parâmetro; parâmetros inválidos caem no Layout 06 com aviso | selecionar todas as prévias por URL e conferir nome/estrutura; sem afirmar comparação lado a lado |
| `/admin/aparencia` | galeria autenticada com iframe de comparação e controles desktop/celular | exige sessão autorizada; não contornar auth nem registrar credenciais |

O teste deve cobrir dia/noite quando o contexto suportar tema administrativo e os temas públicos definidos no aplicativo; preferências são distintas. Registrar 320, 390, 768 e 1440 CSS px e zoom/navegação por teclado somente onde o navegador real permitir. Não presumir que tema administrativo controla o tema público.

## Riscos e preservações

- Não alterar o conteúdo público, publicação do layout, endpoint `/api/site-visual`, autenticação, papéis, auditoria, APIs ou dados.
- O iframe 01 é uma exportação estática independente; comportamento/dimensões internos podem diferir dos componentes React.
- A galeria `/admin/aparencia` pode redirecionar para login sem sessão; a evidência anônima não valida a jornada autenticada.
- Um navegador automatizado/headless não equivale a travessia manual nem a aceite humano. Não registrar tokens, cookies, dados reais ou endpoints efêmeros.
- Se medições mostrarem defeito que exige mudança funcional/visual, manter correção aditiva e restrita à UX-PRO-10B; bloquear se conflitar com publicação, identidade pública ou preservação.

## Validações previstas

1. Inspeção estática das rotas e componentes realmente montados; sem ativar rotas/componentes órfãos.
2. Capturas automatizadas reproduzíveis em viewport/tema aplicáveis e percurso automatizado de teclado no browser disponível; evidência e `resumo.json` devem distinguir browser automatizado, inspeção estática e validação manual.
3. Gate focal, `npm test`, typecheck, build, QA estático, inventário `--check`, smoke das rotas e diff limpo conforme scripts/workflows vigentes.
4. Conferência final das alterações geradas (`next-env.d.ts`, `tsconfig.json`) e da revisão/checks da PR; sem merge se qualquer check obrigatório estiver pendente/falho ou revisão ausente.

## Estado antes

A nota de correção da #264 registra 10B como pendente: teclado no iframe 01, tema, zoom/tamanhos e prévias ainda sem validação em navegador. O status desta medição será atualizado com evidências observadas; ausência de falhas em inspeção estática não será convertida em aprovação visual ou acessível.

### Evidência de navegador da linha de base (18/10/2026)

- Chrome instalado, Playwright, aplicação no worktree limpo e banco PostgreSQL temporário UTF-8; migrações 001–180 aplicadas para a galeria autenticada.
- 40 capturas de `/layout-preview?visual=01..10`, nos viewports 320, 390, 768 e 1440: HTTP 200, título H1 presente, faixa de prévia presente, nenhum iframe inesperado (Layout 01 tem um iframe) e sem rolagem horizontal medida.
- Em `/layout-01`, Tab percorre “Abrir Aparência do site” → “Ver site atual” → iframe; dentro do iframe o foco chega ao link `#inicio`; Shift+Tab retorna ao link pai “Ver site atual”.
- `/admin/aparencia` com perfil sintético `ti`: 8 capturas (4 larguras × claro/escuro), carregamento concluído e mensagem de acesso somente para comparação; a conta não tem `site.visual.write`. Enter compara Layout 01 e não executa publicação.
- O percurso automatizado encontrou, em 1440 px, um campo `input` focado sem indicador visual detectável no shell compartilhado. A inspeção de código localizou o campo “Buscar módulo” e uma regra de foco que não inclui `input`; essa é a única correção proposta nesta fatia. O achado só ocorre quando a busca está visível; nos viewports estreitos ela fica recolhida.
- Inspeção estática de captura já feita; as imagens persistidas não constituem validação manual. Nenhum usuário autenticou manualmente, nenhum aceite humano foi realizado e a publicação do layout não foi alterada.

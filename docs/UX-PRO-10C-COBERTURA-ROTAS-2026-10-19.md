# UX-PRO-10C — reconciliação documental e cobertura por rota

**Data da conferência:** 19/10/2026
**Base:** `main` após a UX-PRO-10B, SHA `3e9a4eec4fb4b14e70f02bb15e38fddeb07d3774` (merge da PR #265).
**Escopo:** reconciliar o fechamento UX-PRO-10, o README e os artefatos reproduzíveis de inventário. Nenhuma tela, API, permissão, autenticação, dado de negócio ou publicação foi alterada.

## Antes e depois

| Fonte | Antes | Depois |
|---|---|---|
| README | A atualização mais nova da trilha destacava UX-PRO-08 de 15/10 e não registrava o merge da 10B. | Um aviso vigente registra 10A/10B/10C, o SHA da 10B, os limites e links para o inventário por rota. Os registros datados anteriores foram preservados como históricos. |
| Fechamento 10C e auditoria 10A | Os banners refletiam corretamente o estado de 18/10, mas continuavam dizendo que a 10B estava pendente após a #265 ser integrada. | Addendums datados distinguem a correção da #263, o estado pré-merge e o estado atual pós-merge. Nenhuma afirmação histórica foi apagada. |
| Inventário / matriz | O gerador lia `resumo.json.entries`; não lia o resumo complementar `resumo-layouts.json.routes`, não agregava a query à rota real `/layout-preview` e ignorava `requestedTheme`. A cobertura da 10B ficava incompleta na matriz. | O gerador agrega a query ao pathname, converte viewports nomeados nas dimensões registradas, lê claro/escuro e reconhece percurso explícito. Os CSVs foram regenerados pelo comando oficial. |

## Cobertura atual do inventário

O critério de contagem permanece **um arquivo de entrada `page.*` em `src/app` = uma rota distinta**. O inventário contém 100 rotas, distribuídas assim:

| Área | Rotas |
|---|---:|
| Site público | 14 |
| Administrativo staff | 44 |
| Entrada/recuperação do cliente | 14 |
| Portal do cliente autenticado | 15 |
| Portal do funcionário | 1 |
| Prévias visuais de layout | 11 |
| Homologação local restrita | 1 |
| **Total** | **100** |

Resumo da matriz gerada em 19/10:

- **75/100** rotas têm pelo menos um gate de workflow cuja cobertura é reconhecida pelo inventário.
- Classes exclusivas atribuídas por prioridade: **53** rotas com captura visual, **34** com teste automatizado de jornada e **13** com evidência de código. A classe indica a evidência mais forte detectada pelo gerador; não é uma avaliação de qualidade nem comprova todos os estados da rota.
- **39** rotas têm papéis declarados na entrada; 43 estão no escopo de tema administrativo; 34 importam componente UI compartilhado; 65 não têm componente nem estilo UI compartilhado detectado no diretório local.
- O gerador registra zero chamadas de formatação locale padrão entre as fontes locais de página. `UiPanel` continua listado como componente compartilhado órfão; não foi promovido a tela.

Os detalhes das 100 rotas — papel/guarda, componente/layout, tema, viewports, teclado, estados detectados, fontes e lacunas — estão na [matriz gerada](UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv), alinhada linha a linha ao [inventário gerado](UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv). Os nomes mantêm o caminho estável usado pelo gerador; o conteúdo foi regenerado nesta base em 19/10. Os inventários históricos de 05, 07, 08 e 10/10 não foram reescritos.

## Evidências específicas da 10B refletidas na matriz

| Rota montada | Evidência integrada | Limite da afirmação |
|---|---|---|
| `/layout-preview` | 40 entradas em `resumo-layouts.json`: `visual=01..10` × 320×900, 390×844, 768×1024 e 1440×900. As 40 respostas foram HTTP 200; o resumo registra zero overflow horizontal e zero erro de navegador. | São variações de uma rota Next com query string. A matriz não as converte em dez rotas distintas nem afirma que `/layout-02`…`/layout-10` foram abertas diretamente. |
| `/layout-01` | Percurso automatizado em 1440×900: links pai, entrada no iframe, foco interno em `#inicio` e retorno por Shift+Tab; a sequência observada está registrada em `resumo-layouts.json`. | Um único percurso e viewport, sem validação manual ou avaliação completa de acessibilidade. |
| `/admin/aparencia` | 8 capturas com perfil TI sintético: 320, 390, 768 e 1440 px em tema claro e escuro; automação verificou alternância/restauração da preferência e comparação. | Não testa publicação, escrita de layout, sessão real nem aceite de Marcelo. Tema noturno passa a ser evidência automatizada, não aprovação visual humana. |

As rotas diretas `/layout-02`…`/layout-10` mantêm suas próprias linhas na matriz. A evidência de `/layout-preview?visual=XX` não é transferida para elas. As linhas de outras áreas também conservam seus próprios estágios de captura e gates; nenhuma cobertura foi propagada por semelhança de componente ou prefixo além do critério já implementado no gerador.

## Preservações, limitações e status

- A mudança funcional da 10B continua restrita ao indicador de foco da busca da navegação lateral. A 10C mexe no gerador da matriz, em seu teste e nos documentos; não altera UI, contrato HTTP, autenticação, papel, permissão, auditoria, banco ou operação local.
- A matriz separa inspeção estática, gates automatizados e capturas. As colunas `validacao manual` e `aceite humano` continuam `nao_registrado` em todas as rotas. Não houve UAT, aceite humano, auditoria WCAG integral, validação em produção ou aprovação de todas as combinações de navegador/dispositivo.
- Os dados de estados no inventário são marcadores estáticos. Captura sem estado específico não prova carregamento, erro, vazio ou recuperação; cada linha mantém lacunas explícitas.
- A atualização documental conclui a reconciliação 10C e encerra o registro da fatia 10B integrada. Não declara que todas as 100 rotas passaram por auditoria visual recente nem que o produto está pronto para produção.

Reprodução e validação desta reconciliação:

```text
node scripts/ux-pro-00-inventory.mjs
node scripts/ux-pro-00-inventory.mjs --check
node --test tests/ux-pro-00-precision.test.mjs tests/ux-pro-00-inventory.test.mjs
```

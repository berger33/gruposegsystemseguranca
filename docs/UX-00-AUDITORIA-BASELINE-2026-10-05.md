# UX-00 — inventário, linha de base e prioridades

**Base:** `main` `1c4b859c965df994378e1d4c1d318887ecf085e2`, 05/10/2026. **Natureza:** auditoria de rotas/código e observação local com contas fictícias. Não há pesquisa com Marcelo ou Andreia, nem homologação de todos os fluxos. Nenhuma mutação de negócio foi executada para esta auditoria.

## Método e artefatos

- `node scripts/ux00-inventory.mjs` gerou [`UX-00-INVENTARIO-ROTAS.csv`](UX-00-INVENTARIO-ROTAS.csv), uma linha por `page.tsx`: rota, papéis declarados no `AdminGate` quando presentes, evidência de página e arquivo. **Papel no componente não prova permissão de API.** A coluna de estado do negócio exige leitura das guardas e teste focal antes da respectiva etapa.
- 98 páginas encontradas: 43 em `/admin`, 29 em `/cliente` e 26 demais. Das 43 administrativas, 39 declaram `AdminGate` com lista local de papéis; `/admin`, `/admin/entrar`, `/admin/convite` e `/admin/verificacao-manual` usam outros caminhos de entrada a conferir individualmente. As 15 páginas sob `/cliente/app` estão no layout `RealAccessShell` + `ClientSpaceProvider`, sujeito a sessão e grant no servidor.
- Ambiente observado: servidor local em `127.0.0.1:3100`, Chrome headless via Playwright, viewports **1440×900** e **390×900**, base de demonstração. Login staff admin e RH feitos com credenciais locais fictícias, sem registrar senhas. Capturas selecionadas em [`ux-00-evidencias/`](ux-00-evidencias/). As capturas mostram estado vazio; não demonstram operação de ações nem autorizam uso real.
- Fonte do número de migrações: nomes em `db/migrations`, última `174-auth-permissions-id-default.sql`. Nenhuma migração foi aplicada neste trabalho.

## Matriz de jornadas e estado observado

| Entrada/rotas | Pessoa/papel | Tarefa principal | Estado comprovado nesta auditoria | Próximo teste necessário |
|---|---|---|---|---|
| `/`, `/contato`, `/servicos`, `/orcamento`, `/proposta`, `/faq` | visitante | entender serviço e solicitar contato | páginas públicas existem; site mantém mensagem de prévia; envio não foi acionado | formulário com dados fictícios e confirmação real |
| `/admin/entrar`, `/admin` | staff conforme sessão | entrar e localizar módulo | login individual e hub renderizados; 26 destinos no catálogo, **25 visíveis** à conta admin demo | 401/403, teclado, retorno ao destino e grants reais por perfil |
| `/admin/crm`, `/admin/comercial`, `/admin/carteira`, `/admin/leads`, `/admin/expansao`, `/admin/inteligencia` | comercial/marcelo/admin/ti conforme página e API | lead → oportunidade → carteira | CRM renderizado; interface longa, contraste insuficiente visualmente e estouro horizontal a 390 px; operações não executadas | jornada completa e escopos por conta/tarefa |
| `/admin/funcionarios`, `/admin/rh/assistente` | RH e papéis declarados, sujeitos a grants | equipe → admissão → escala → pedidos → documentos/folha → desligamento | conta RH demo abriu equipe vazia; conta admin demo recebeu `permission_scope_denied` na API apesar de ver link; assistente não testado | permissões granulares, dados sensíveis, resultado de cada ação e revogação |
| `/admin/marcelo`, `/admin/analytics`, `/admin/pendencias`, `/admin/relatorios` | Marcelo/admin/ti conforme rota | ver pendência e decidir | arquivos e gates existem; decisões e indicadores não testados nesta etapa | origem do número, ação auditada, vazio/erro/403 |
| `/admin/contratos`, `/admin/operacao`, `/admin/patrimonio`, `/admin/frota`, `/admin/terceiros`, `/admin/qualidade`, `/admin/emergencial`, `/admin/continuidade` | papéis operacionais declarados | acompanhar entrega e exceções | rotas presentes; algumas não aparecem no menu global (`/admin/continuidade`) | matrícula/contrato/conta, transições e histórico |
| `/admin/financeiro`, `/admin/compliance`, `/admin/licitacoes`, `/admin/fornecedores` | papéis específicos | prazo, conferência e decisão | rotas presentes; sem operação testada | autorização de dado sensível, fonte e confirmação |
| `/admin/ti`, `/admin/portal/*`, `/admin/clientes`, `/admin/visual`, `/admin/tema`, `/admin/publicacao`, `/admin/conhecimento` | TI/admin e exceções por página | acesso, configuração, RAG e publicação | `/admin/ti` é **protótipo descritivo sem links operacionais**; `AiRagClient.tsx` existe mas não está importado por página; outras rotas exigem análise própria | mapa de consoles reais, curadoria RAG por escopo, 401/403 e estados de serviço |
| `/cliente/painel`, `/cliente/contratos`, `/cliente/documentos`, `/cliente/chamados`, `/cliente/conta` | visitante em prévia | conhecer proposta de portal | páginas de prévia e rótulo “PRÉVIA DO PORTAL”; não são evidência de dados reais | distinguir prévia da jornada real na comunicação |
| `/cliente/entrar`, `/cliente/app/*` | cliente autenticado com grant | ver conta própria, contratos, documentos e chamados | layout de sessão/grant inspecionado; **sem identidade cliente demo disponível** para testar via navegador | criar identidade fictícia autorizada em ambiente descartável e provar isolamento A/B |
| `/funcionario` | funcionário próprio | plantão, ciência, pedidos e documentos | página de entrada observada; `EmployeePortal.tsx` tem cinco abas e fila offline limitada a ciência de procedimento; sem identidade demo de funcionário testada | jornada com conta fictícia, offline/reconexão e privacidade |
| `/qa/modulos`, `/layout-01`…`/layout-10` | operador/visual | QA e prévias de layout | QA é condicional por ambiente; layouts são prévias; texto do QA contém descrições históricas possivelmente superadas | não usar como fonte única do estado atual |

O inventário CSV registra **papéis declarados no envelope visual**, não a permissão efetiva de cada endpoint. O passo de implementação deverá ligar rota → tarefa → chamada de API → permissão/grant → estado de negócio em teste focal. O menu atual omite algumas rotas existentes, enquanto inclui `/admin/ti`, cuja página é apenas descritiva.

## Linha de base visual e interação

| Tela/captura | Observação verificável | Severidade |
|---|---|---|
| [Hub desktop](ux-00-evidencias/desktop-hub.png) e [mobile](ux-00-evidencias/mobile-hub.png) | Conta admin demo vê 25 links no cabeçalho e os mesmos 25 cartões no hub; no celular, a lista ocupa quase uma tela antes do conteúdo. Sem agrupamento por tarefa. | P0 |
| [CRM desktop](ux-00-evidencias/desktop-crm.png) e [mobile](ux-00-evidencias/mobile-crm.png) | Título, texto e seções herdam cor escura sobre fundo escuro; muitos campos usam apenas placeholder; títulos expõem códigos CRM. Em viewport 390 px, captura tem **572 px** de largura: conteúdo e funil vazam horizontalmente. | P0 |
| [RH com papel RH](ux-00-evidencias/desktop-rh-com-papel-rh.png) | O papel RH vê oito abas, incluindo “Processos HR-01..24”; equipe vazia, sem orientação de próxima tarefa. Admin demo vê erro cru `permission_scope_denied`; papel visual não corresponde ao grant. | P0 |
| [TI](ux-00-evidencias/desktop-ti.png) | Página avisa que os cartões são protótipo, mas o menu e hub apontam para TI como destino de trabalho; não há ligação com console real de RAG nessa página. | P0 |

**Medição técnica básica:** página de hub sem overflow horizontal a 390 px (`scrollWidth=390`); o CRM tem overflow evidenciado pela captura de 572 px. A navegação por teclado, leitor de tela, contraste numérico, tempos de tarefa, taxa de sucesso e satisfação **não foram medidos** nesta etapa. A ausência dessas medições não deve virar “aprovado”. A captura com admin em RH é evidência de UX/confusão de concessão, não indicação de que a API deveria permitir acesso.

## Fila priorizada e dependências

| ID | Problema / decisão | Critério para encerrar | Etapa |
|---|---|---|---|
| UXP-01 | Contraste e overflow no CRM | texto legível e sem corte a 320/390 px; campos rotulados e tarefa completa testada | UX-01 fundamentos; UX-03 correção da tela |
| UXP-02 | 25 links planos e hub repetitivo | todas as rotas permitidas alcançáveis, com grupos e item ativo; teclado/mobile/401/403 | UX-02 |
| UXP-03 | Entradas por papel ignoram grants ou mostram erro técnico cru | estado “sem permissão” claro sem ampliar acesso; menu continua apenas navegação; APIs intactas | UX-02/04 |
| UXP-04 | Entrada TI descritiva e RAG sem caminho visível | mapa de consoles operacionais com status real e caminho de curadoria por escopo; protótipo explicitado | UX-08 |
| UXP-05 | RH com oito abas e códigos internos | ações principais visíveis por tarefa, estados claros, dados sensíveis e revogação preservados | UX-04 |
| UXP-06 | Cliente prévia versus área real | mensagens identificam corretamente cada jornada; nenhuma capacidade alegada sem teste | UX-06/08 |
| UXP-07 | Falta de linha de base de tarefa com usuários | roteiro reproduzível para cinco tarefas/papel; registrar tempos reais quando houver acesso humano | UX-09; aceite de Marcelo/Andreia pendente |

**Próxima fatia recomendada:** UX-01, tokens semânticos e dois componentes usados de verdade, com testes visual e teclado. Não alterar 98 páginas de uma vez. UX-02 depende do mapa de módulos e da regra de grants; UX-03 deve corrigir o CRM observado antes de polimento secundário. O ambiente local de 8 GB sem GPU continua como referência de desempenho.

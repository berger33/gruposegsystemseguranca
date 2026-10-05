# Plano mestre de experiência e interface — SEG System

**Data e base auditada:** 05/10/2026, `main` `84b3532eb110ed50ddbf743626f40b9b5d92fb48`. Este documento é um plano de produto e UX baseado no código e nos fluxos disponíveis; não equivale a teste com usuários nem declara que toda função está homologada. A implementação deve sempre partir do `main` mais recente.

## 1. Diagnóstico verificável

| Evidência no repositório | Consequência para a pessoa usuária | Prioridade |
|---|---|---|
| `src/app/admin/AdminGate.tsx`: 26 destinos planos no catálogo de navegação, exibidos conforme papel; `AdminHub.tsx`: grade que repete os destinos permitidos | Marcelo/admin/TI precisam varrer uma lista longa e misturada; tarefas afins não aparecem como grupo | P0 |
| `src/app/admin/AdminChrome.module.css`: contêiner de 1080 px, navegação que quebra linhas, rótulos de 12,5 px | Pouca área útil e localização difícil em telas largas e estreitas | P0 |
| `src/app/admin/crm/page.tsx`: criação, importação, funil, busca e tabelas numa página; títulos exibem códigos CRM-xx | Carga cognitiva alta; conceitos internos substituem linguagem de negócio | P0 |
| `src/app/admin/funcionarios/RhWorkspace.tsx`: várias frentes de RH e processos legados densos, parte em JSX compacto | Fluxos sensíveis pouco guiados; difícil reconhecer etapa e resultado | P0 |
| `src/app/admin/ti/page.tsx`: cartões ainda declarados como protótipo, enquanto outras páginas de TI existem; `AiRagClient.tsx` tem tabelas e muitos formulários | Entrada de TI não encaminha claramente para as funções reais e seu estado operacional | P0 |
| `src/components/ClientPortalNavigation.tsx`: rótulo “PRÉVIA DO PORTAL”; site público também diz “PRÉVIA DE DESENVOLVIMENTO” | Mensagens de maturidade inconsistentes; corrigir apenas após verificar quais jornadas estão operacionais | P1 |
| `src/app/funcionario/EmployeePortal.tsx`: cinco abas, ações rápidas e estado offline específico | Há boa base, mas atalhos, estados, acessibilidade e terminologia precisam de validação em contexto de plantão | P1 |
| CSS e estilos inline por módulo | Hierarquia, espaçamento, cores, campos e feedback variam entre módulos | P0 |

O inventário acima não é uma auditoria visual exaustiva. Antes de alterar cada tela, registrar captura desktop/mobile e fluxo real com dados fictícios. O sistema já contém camadas de autorização e estados de negócio que a nova interface deve preservar.

## 2. Resultado esperado

Uma pessoa deve localizar a tarefa principal em até três escolhas a partir do início do seu papel; saber onde está, o que pode fazer, o que falta e o que aconteceu após cada ação. A interface deve oferecer uma identidade visual profissional e coerente, sem esconder status, permissões ou limitações. Não criar uma “superdashboard” com todos os dados sensíveis: mostrar apenas o que cada sessão está autorizada a consultar, e confirmar no servidor.

**Métricas de avaliação, não promessas:** tempo e taxa de sucesso em cinco tarefas por papel; cliques e retornos para achar uma função; erros de formulário; abandono; acessibilidade automatizada e manual; satisfação após tarefa. Registrar linha de base antes da mudança e comparar depois. Não inventar feedback de Marcelo ou Andreia antes de eles terem acesso.

## 3. Arquitetura de informação proposta

O menu global administrativo terá **Início**, grupos expansíveis curtos, busca de módulos/tarefas e conta/ajuda. Desktop: navegação lateral persistente, recolhível, com item ativo e seção aberta. Mobile: botão de menu, painel acessível, foco gerenciado; navegação de ações frequentes apenas quando comprovada útil. Breadcrumbs abaixo do cabeçalho, título inequívoco e ação primária por tela. A busca não deve pesquisar dados sigilosos sem autorização; na primeira fatia, indexa apenas rótulos de destinos permitidos ao papel.

| Grupo para Marcelo/admin | Destinos atuais a classificar | Primeira pergunta na tela |
|---|---|---|
| Visão e pendências | `/admin`, `/admin/marcelo`, `/admin/analytics`, `/admin/relatorios` | O que exige minha decisão hoje? |
| Clientes e comercial | `/admin/crm`, `/admin/carteira`, `/admin/leads`, `/admin/inteligencia`, `/admin/expansao`, `/admin/satisfacao` | Qual cliente ou oportunidade precisa de ação? |
| Entrega de serviços | `/admin/contratos`, `/admin/operacao`, `/admin/patrimonio`, `/admin/frota`, `/admin/terceiros`, `/admin/qualidade`, `/admin/emergencial` | O que está em risco, atrasado ou sem responsável? |
| Pessoas | `/admin/funcionarios` e processos RH permitidos | O que precisa de aprovação ou acompanhamento? |
| Gestão financeira e conformidade | `/admin/financeiro`, `/admin/compliance`, `/admin/licitacoes`, `/admin/fornecedores` | Qual prazo ou obrigação vem primeiro? |
| Portais e conhecimento | `/admin/clientes`, `/admin/conhecimento`, `/admin/portal` | Qual acesso ou conteúdo precisa de revisão? |
| Sistema | `/admin/ti`, `/admin/visual` e consoles técnicos reais | Há incidente ou configuração pendente? |

Este agrupamento é hipótese inicial. Confirmar nomenclatura e frequência por inventário de tarefas. Itens sem implementação real devem mostrar estado honesto, não ação falsa. **A lista de navegação não é autorização:** manter filtros de papel e todas as guardas de API/RBAC, escopos de conta e auditoria existentes.

**Entradas por papel:** Marcelo vê decisões, exceções e atalhos para clientes, comercial, operação e financeiro; Andreia vê admissões, solicitações, escalas, documentos, prazos e pendências RH, sem salário/saúde sem concessão própria; funcionário vê próximo plantão, ações necessárias, pedidos e documentos próprios; cliente vê contrato, documentos, chamados e conta do próprio vínculo; comercial vê fila de leads, agenda, funil e carteira; TI vê saúde operacional, acessos, RAG, auditoria, backup e configuração, com status real. Cada início é um painel de tarefas, não a mesma grade genérica.

## 4. Linguagem visual e componentes

Criar tokens semânticos para cor, tipografia, espaçamento (escala 4/8), raio, borda, sombra, foco e estados; modo claro como padrão corporativo, escuro apenas se testado e completo. Preservar marca SEG, mas substituir páginas inteiras em azul escuro e cartões indistintos por superfícies claras, contraste claro de hierarquia, poucos acentos e densidade ajustável para tabelas. Tipos em escala legível, linha de leitura confortável e números tabulares para indicadores. Cor nunca será o único sinal de status.

Biblioteca compartilhada: AppShell, PageHeader, SectionNav, Breadcrumb, Card, StatCard, DataTable responsiva, FilterBar, SearchField, FormField, Fieldset, Stepper, Dialog/Confirm, Drawer, Tabs, Badge, EmptyState, Skeleton, ErrorState, Toast/Status, FileUpload, Pagination e HelpText. Especificar variantes, estados, teclado e mensagens em português. Evitar abstração prematura: implementar conforme uso em duas telas reais, depois generalizar.

**Padrões:** uma ação primária por contexto; ações destrutivas e irreversíveis requerem resumo do efeito e confirmação específica; formulários longos são divididos por objetivo com salvamento seguro quando backend suportar; campos têm rótulo persistente, exemplo e erro junto ao campo, mantendo dados após erro; tabelas têm ordenação/filtro/paginação autorizados, contagem, estado vazio e ação contextual; no celular, apresentar cartões ou rolagem horizontal declarada sem perder colunas críticas. Status técnico como UUID, `Idempotency-Key` e códigos CRM-xx fica em detalhe avançado, não no título da tarefa.

## 5. Jornadas por área e entregas

| Área | Jornada prioritária | Ajuste de UX e aceite funcional |
|---|---|---|
| Público | conhecer serviço → pedir contato | proposta clara, CTA consistente, campos mínimos, confirmação real; revisar mensagens de “prévia” somente após checar o estado verdadeiro da função |
| Cliente | entrar → ver contrato/documento → abrir/acompanhar chamado | navegação coerente, estado do vínculo/grant, detalhe e histórico; acesso indevido continua 401/403/404 conforme contrato atual |
| Funcionário | entrar → ver próximo plantão → confirmar ciência/abrir pedido | tarefas urgentes primeiro, estado offline explícito e sincronização verificável, linguagem de campo, toque e teclado, sem dados de outros funcionários |
| Andreia/RH | localizar pessoa → admissão/acesso → escala → solicitação → documento/folha → desligamento | separar listas, detalhes e fluxos guiados; indicar autorização específica, rascunho/revisão/resultado; remuneração e saúde só com grants apropriados; desligamento explicita revogação |
| Comercial | lead → qualificação → oportunidade → proposta/tarefa → cliente/carteira | uma ficha de conta, próximos passos, filtros salvos localmente se adequado, funil e tabela equivalentes, importação CSV com prévia/erros sem esconder duplicatas |
| Marcelo | pendência → contexto → decisão auditada → acompanhamento | cartões de “precisa de mim”, filtros por prazo/área, trilha e efeito de decisão; não apresentar totais fabricados nem fundir permissões de RH/financeiro |
| Operação/serviços | posto/turno → ocorrência/cobertura → ação | priorizar prazo, responsável e gravidade, mostrar estados e confirmação, navegação consistente entre contrato e operação |
| Financeiro/compliance | obrigação → conferência → aprovação/fechamento | linguagem precisa, dados-fonte e data, confirmação de efeito, sem simular pagamento ou parecer jurídico |
| TI/RAG | saúde → base/escopo → documento → revisão/publicação → teste | distinguir protótipo de console real, estado de Ollama e fonte; curadoria por área, acesso fail-closed, teste sem fonte não inventa resposta; sem expor dados privados em busca global |

## 6. Acessibilidade, desempenho e qualidade

Meta: **WCAG 2.2 AA** para novas telas e componentes. Testar navegação só por teclado, foco visível e não oculto, ordem de foco, rótulos/nome acessível, leitores de tela nas jornadas críticas, zoom 200/400%, reflow, contraste texto/controles, alvo de toque mínimo quando aplicável, erros anunciados e sem depender só de cor. Respeitar `prefers-reduced-motion`. Não substituir `<button>` por elementos sem semântica. Testar larguras 320, 768, 1280 e 1920 px; estados de carregamento, zero dados, falha, permissão negada, sessão expirada e ações concorrentes. Definir orçamento de desempenho antes de micro-otimizar e medir em máquina sem GPU.

## 7. Sequência de execução com gates

| Etapa | Entrega pequena e revisável | Gate de saída |
|---|---|---|
| UX-00 | Inventário de rotas, papel, tarefas, capturas, problemas e baseline; mapa de dependências e permissões | Matriz rota × papel × tarefa × estado, sem alegar testes humanos inexistentes |
| UX-01 | Tokens e componentes base, guia de conteúdo e exemplos | Teste visual/teclado em dois componentes e documentação de variantes |
| UX-02 | Shell administrativo agrupado, breadcrumbs, busca apenas de destinos, hub por papel | Todas as rotas anteriores continuam alcançáveis pelo papel correto; 401/403; desktop/mobile/teclado |
| UX-03 | CRM/comercial e carteira: lista → detalhe → ação, importação guiada | Fluxos com dados fictícios, mesmas APIs e mesmas regras; testes focais |
| UX-04 | RH da Andreia, começando solicitações e admissão, depois escala/documentos/folha/desligamento | Permissões granulares, efeito das ações e revogação preservados; revisão especial de dados sensíveis |
| UX-05 | Início de Marcelo, decisões/pendências e saltos entre módulos | Indicadores com fonte real e estado vazio; decisão auditada continua idempotente |
| UX-06 | Funcionário e cliente | Fluxos próprios, responsividade, isolamento de dados, offline e sessão preservados |
| UX-07 | Operação, financeiro, contratos, compliance e demais extensões por família | Uma família por PR, sem reescrever lógica; teste de regressão focal |
| UX-08 | TI/RAG, mensagens públicas e polimento global | Console real identificado, curadoria por escopo, acessibilidade e revisão de cópia baseada em estado real |
| UX-09 | Auditoria transversal e aceite | Matriz de jornadas/estados preenchida, WCAG, testes de regressão, métricas e pendências honestas |

Cada etapa: branch do `main` atualizado, escopo estreito, antes/depois, evidência de desktop e celular sem dados sensíveis, testes focais/typecheck/build quando afetados, PR independente e merge apenas após checks. Se houver trabalho paralelo do Arena, rebase/reconciliação antes de abrir PR. Não alterar migrações 001–174 para trabalho visual; migração 175+ só com necessidade funcional comprovada e plano próprio. Não bloquear melhoria visual por testes humanos impossíveis agora: registrar o aceite de Marcelo/Andreia como pendente até a apresentação surpresa.

## 8. Referências de projeto

- [WCAG 2.2, W3C](https://www.w3.org/TR/WCAG22/) e [Understanding WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/): critérios de acessibilidade.
- [USWDS Side Navigation](https://designsystem.digital.gov/components/side-navigation/): hierarquia, item ativo e testes de navegação.
- [GOV.UK Design System Patterns](https://design-system.service.gov.uk/patterns/) e [Recover from validation errors](https://design-system.service.gov.uk/patterns/validation/): jornadas, formulários e recuperação de erro.
- [Nielsen Norman Group — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): complexidade avançada apenas quando necessária.

Estas fontes orientam decisões; o desenho final depende de observação das tarefas reais e validação com usuários quando possível.

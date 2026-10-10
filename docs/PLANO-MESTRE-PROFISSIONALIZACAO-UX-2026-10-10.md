# Plano mestre — profissionalização e padronização da interface

**Data:** 10/10/2026
**Base confirmada:** `main` / `origin/main`, `87aef9f486d893f0e793b5a6faf2677714bb240f`
**Escopo:** auditoria e melhoria visual incremental de todas as áreas do SEG System.
**Estado inicial:** plano de trabalho; as fatias abaixo ainda precisam ser reavaliadas contra o código atual antes de qualquer implementação.

**Registro de execução:** UX-PRO-00 (reconciliação e mapa de cobertura) foi executada em 10/10/2026 sobre a `main` `c50a99beecb057c2a819d5556cf1405f3434458c`. Resultado, critério de contagem (100 `page.tsx`; 98 = histórico) e matriz: [UX-PRO-00-RECONCILIACAO-2026-10-10.md](UX-PRO-00-RECONCILIACAO-2026-10-10.md). A base `87aef9f` citada acima não existe no clone atual; ver o registro.

## Instrução prioritária ao Arena

Leia este documento inteiro e `AGENTS.md`, `README.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`, `docs/AUDITORIA-INTERFACE-ROTAS-2026-10-08.md` e `docs/FECH-ENTREGA-DESENVOLVIMENTO-2026-10-07.md` antes de alterar o repositório. Os dois últimos são registros com limites e datas próprios; não trate pendência histórica como defeito atual sem conferir o código na `main` mais recente.

O objetivo é elevar clareza, consistência, legibilidade e acabamento profissional. **Preserve integralmente o comportamento existente:** autenticação, sessão, permissões e grants, isolamento por identidade/conta/contrato, contratos HTTP, estados do domínio, auditoria, idempotência, navegação, dados e funcionamento local. Não remova nem esconda recursos para simplificar uma tela. Não afrouxe autorização para fazer um link ou botão funcionar. Mudança funcional só pode ocorrer se for necessária para corrigir um defeito visual/UX demonstrado, for compatível e aditiva, tiver cobertura apropriada e mantiver todas as invariantes; se não for possível, documente e pare naquela parte.

Não publique dados reais, segredos, credenciais, tokens, URLs temporárias ou informação pessoal. Use somente dados fictícios já existentes ou criados em banco descartável. Não invente aceite de Marcelo, Andreia, funcionários ou clientes. Não aplique migrações em bancos operacionais. Não altere o site público além do logo, salvo pedido expresso posterior.

## Estado de referência e problema

O checkout estava limpo e sincronizado em `87aef9f` quando este plano foi criado. A auditoria de 08/10 encontrou 100 arquivos de entrada de rota e advertiu que contagens de elementos no CSV são ocorrências estáticas, não campos renderizados. Há documentação anterior que fala em 98 rotas; reconcilie esses inventários sem apagar evidências históricas.

Já existem tokens visuais, navegação administrativa agrupada, alternância dia/noite e componentes como `UiField`, `UiState` e `UiTableScroll`. Também há telas e módulos próprios. A cobertura compartilhada não comprova que todas as telas consomem os mesmos padrões. A revisão estática encontrou áreas técnicas/legadas com estilos inline, controles compactos, nomes internos em inglês, cores fixas e tabelas densas. O modo noturno também precisa ser verificado nas telas que mantêm cores locais. Os relatórios de 07–08/10 registram explicitamente que a passagem visual integral, por papel/rota/estado, não foi concluída.

Áreas incluídas: site público e entradas; área do funcionário; RH; painel do Marcelo e CRM/comercial; TI e administração; portal cliente; módulos de operação, contratos, financeiro, patrimônio, compliance, frota, terceiros, licitações, fornecedores, qualidade, satisfação, continuidade, relatórios, analytics, conhecimento/RAG, aparência e acessos do portal. A lista de rotas vigente deve ser gerada a partir do código, incluindo layouts e componentes efetivamente renderizados.

## Critérios visuais comuns

Aplicar estes critérios em cada fatia, conforme pertinência:

1. **Hierarquia:** uma finalidade e título claros por tela; resumo antes de detalhes; ações principais visíveis e ações secundárias agrupadas; terminologia consistente com a tarefa real do papel.
2. **Design system:** usar tokens semânticos existentes ou propor adição central e documentada. Evitar valores arbitrários de cor, fonte, raio, sombra, espaçamento e z-index repetidos localmente. Preservar a identidade azul institucional e o logo atual.
3. **Texto:** português natural e revisado, datas/horas em `pt-BR`, moeda em BRL quando aplicável; identificadores de API, JSON, UUID, hash e códigos ficam em áreas de diagnóstico claramente separadas, com cópia/explicação quando útil.
4. **Campos:** rótulo persistente associado, instrução e unidade claras, obrigatoriedade visível, erro próximo do campo, foco preservado após erro, confirmação após sucesso e bloqueio visual durante envio. Placeholder nunca substitui rótulo.
5. **Listas e tabelas:** cabeçalho, densidade legível, alinhamento de números, estados, ações por registro, filtros com rótulos, ordenação/paginação se volume pedir, contagem e vazio com próxima ação. Em telas estreitas, permitir rolagem contida ou apresentação alternativa sem cortar ações.
6. **Estados honestos:** carregando, vazio, erro/rede, acesso negado, indisponibilidade, sucesso e dados simulados devem ser distintos. Falha nunca pode aparecer como zero, lista vazia ou sucesso.
7. **Tema:** tudo que pertence às áreas staff (Marcelo, RH e TI) deve funcionar nos modos dia/noite, incluindo página, navegação, diálogos, menus, tabelas, formulários, gráficos, estados e componentes montados sob demanda. Não deixar texto/fundo fixo com contraste ruim. O site público não recebe tema sistêmico por consequência acidental.
8. **Acessibilidade e uso:** navegação por teclado, ordem e foco visíveis, nomes acessíveis, alvos adequados, zoom 200%, redução de movimento e contraste conferidos. Não declarar conformidade WCAG sem avaliação sustentada.
9. **Responsividade:** conferir no mínimo 320, 390, 768 e 1440 CSS px; sem overflow do documento, conteúdo encoberto ou ação inacessível. O overflow dentro de tabela é permitido se indicado e operável por teclado.
10. **Integridade funcional:** visual não pode mudar payload, endpoint, permissão, transição, autoria, escopo, auditoria ou regra de negócio sem justificativa e gate específico aprovado.

## Fatias de execução

Trabalhe **uma fatia por sessão e uma PR por fatia**. No início de cada sessão, busque a `main`, registre o SHA, confira PRs/commits recentes, inventário vigente, trabalho pendente e se a fatia já foi parcialmente implementada. Reduza a fatia ao que falta; não reimplemente nem reverta trabalho que já está correto.

### UX-PRO-00 — Reconciliação e mapa de cobertura

- Atualize o inventário de rotas a partir do código e identifique componentes compartilhados, papéis declarados, layout, dados demonstrativos e estados.
- Marque cada evidência como código, teste automatizado, captura visual, validação manual ou aceite humano; esses níveis não são intercambiáveis.
- Compare inventários de 98/100 rotas e resolva a diferença com critério reproduzível. Gere uma matriz vigente rota → área/papel → componente → tema → responsividade → teclado → estados → evidência → lacuna.
- Corrija links/documentos de entrada conflitantes sem apagar registros históricos; registre o que foi confirmado e o que segue desconhecido.
- Não faça redesign amplo nesta fatia.

### UX-PRO-01 — Tokens e chrome compartilhado

- Inspecione tokens e shell existentes; defina/complete escala de tipografia, espaçamento, superfícies, bordas, elevação, foco, estados, largura de conteúdo e breakpoint.
- Audite cabeçalho, identificação do papel, botão dia/noite, sair, breadcrumb, menu desktop/mobile, busca e estado ativo.
- Verifique persistência da preferência de tema; documente se é preferência por navegador ou por conta e evite alteração de autenticação para resolver isso.
- Criar capturas base comparáveis sem substituir funcionalidades ou copiar informação real.

### UX-PRO-02 — Cobertura completa de tema dia/noite

- Percorra a matriz de rotas administrativas nos dois temas, priorizando Marcelo, RH, TI, funcionário e telas com componentes antigos.
- Substitua estilos locais incompatíveis por tokens e corrija gráficos, diálogos, focus rings, seleção e tabelas.
- Confira contrastes com ferramenta adequada e registre valores/limitações; não declare acessibilidade integral por inspeção visual.
- Mantenha tema do site público e identidade de marca conforme escopo existente.

### UX-PRO-03 — TI e superfícies técnicas/legadas

- Revisar console e telas renderizadas de RBAC, orçamento técnico, SEO, relatórios, retenção, catálogo, backup, auditoria, observabilidade, integrações, notificações, privacidade e RAG/fontes.
- Agrupar por tarefa operacional, melhorar rótulos e ajuda, esconder complexidade sem esconder controles; separar dados operacionais de logs/JSON.
- Refatorar tabelas, formulários, mensagens e cores fixas com componentes comuns.
- Componentes órfãos ou protótipos: não os tornar navegáveis nem anunciar como recursos disponíveis só por estética. Registrar o limite.

### UX-PRO-04 — Marcelo: visão e decisões

- Revisar painel, pendências, analytics, relatórios, CRM, comercial, carteira, expansão, contratos e financeiro acessíveis ao perfil real.
- Organizar por prioridade/decisão, período e fonte; destacar responsável, prazo, estado e ação seguinte.
- Explicar ausência de dados e métricas; zero só quando medido. Distinguir simulação, estimativa e valor canônico.
- Mover IDs técnicos e detalhes de origem para contexto secundário; não inventar dados nem alterar alçada.

### UX-PRO-05 — RH e funcionário

- Rever RH de ponta a ponta por tarefas: pessoas, admissão, jornada/ponto, ajuste, escala, documentos, benefícios, treinamento, afastamentos, folha e desligamento conforme implementados.
- Rever portal do funcionário: ponto/geolocalização, comprovante, hash, endereço quando obtido, solicitações, jornada, documentos e estados offline/rede conforme código.
- Tornar explícito quem pode ver, aprovar ou rejeitar cada ação, sem ampliar permissões; distinguir original, solicitado e aprovado.
- Não expor dados de outros funcionários e não tratar endereço reverso como garantido se o provedor não responder.

### UX-PRO-06 — CRM, comercial, clientes e portal

- Revisar pedidos/leads, prospecções, empresas, contatos, oportunidades, atividades, calendário, orçamento/proposta, carteira e contratos; revisar a área interna de gestão de clientes e a área autenticada do cliente separadamente.
- Refinar funil, filtros, estados, ações e formulários com os vocabulários reais; garantir leitura em celular sem perder ações.
- Diferenciar prévia pública de área autenticada e dado de demonstração de registro persistido.
- Preservar isolamento entre contas A/B, escopo do vínculo e contratos de APIs.

### UX-PRO-07 — Operação, contratos, finanças e conformidade

- Auditar operações/ordens, patrimônio, frota, terceiros, fornecedores, licitações, qualidade, satisfação, compliance, continuidade, emergencial e documentos/obrigações.
- Para cada tela, comunicar ciclo de vida, responsável, prazo, evidência, próxima ação e histórico sem transformar tabelas em páginas de texto técnico.
- Padronizar filtros, datas, moeda, identificadores, alertas, confirmações e ações irreversíveis.
- Protótipos, canais não integrados, arquivos apenas referenciados e simulações devem permanecer identificados com honestidade.

### UX-PRO-08 — Conhecimento, assistentes e aparência do site

- Revisar entrada/curadoria do RAG por área e portal; mostrar corpus/escopo e estado da fonte sem revelar caminhos físicos, conteúdo fora da alçada ou segredos.
- Distinguir sem documentos, sem resultado relevante, modelo ocupado, modelo indisponível e erro de rede; fontes e citações devem ser compreensíveis.
- Revisar painel TI de aparência do site e as dez prévias, deixando claro ativo versus comparação e prévia versus publicação.
- Não mudar conteúdo/composição do site público, exceto logo, nem publicar layout sem ação autorizada pelo fluxo existente.

### UX-PRO-09 — Site público, entradas e identidade

- Revisar acessibilidade, tipografia, formulários, erros, confirmação e responsividade da página pública e das entradas de funcionário, cliente e equipe.
- Preservar escopo expresso: no site público, nenhuma alteração além do logo. Melhorias de conteúdo ou estrutura pública ficam documentadas como sugestão e não devem ser executadas nesta fatia.
- Não expor credenciais fictícias em capturas, logs ou documentos.

### UX-PRO-10 — Auditoria visual final e fechamento documental

- Percorrer todas as rotas vigentes da matriz, agrupadas por área/papel; testar estados reais ou cenários de teste identificados, temas, teclado, zoom e tamanhos de tela.
- Fechar cada lacuna com correção em PR própria ou registrar claramente como pendência operacional/aceite externo, sem transformar ausência de evidência em aprovação.
- Atualizar inventário, docs de entrada e README; preservar as evidências históricas com data e SHA.
- Emitir relatório final com cobertura por rota, evidências, checks, falhas/cancelamentos, limitações e aceites ainda necessários.

## Regra de PR, checks e merge — obrigatória em toda fatia

1. Criar branch a partir da `main` mais recente; confirmar base e SHA antes de editar.
2. Implementar apenas a fatia atual, preservar arquivos do usuário e manter a alteração pequena/coesa.
3. Executar os checks existentes e pertinentes à superfície alterada, além dos checks requeridos pelo repositório. Descobrir os comandos no `package.json`/workflows vigentes; não inventar comando nem relaxar teste. Executar build/typecheck e teste focal quando aplicável. Não declarar verde se job foi cancelado, ficou em fila, foi pulado ou não recebeu runner.
4. Abrir uma PR com problema, antes/depois, rotas/papéis, comportamento preservado, checks com links/resultado real, evidências desktop/mobile/teclado e limitações. Não incluir credenciais, dados pessoais nem endpoints efêmeros.
5. Resolver todos os checks vermelhos e comentários bloqueadores. Se GitHub não permitir rerun/merge, parar e entregar o motivo verificável; não afirmar que houve merge.
6. **Somente quando todos os checks exigidos estiverem verdes**, a revisão estiver concluída e a PR tiver base `main` correta, fazer o merge da fatia. Confirmar o estado `MERGED`, SHA do merge e que `origin/main` contém o commit. Não acumular várias fatias numa PR gigante.
7. No encerramento da sessão, fornecer ao usuário o resultado, PR e merge, checks, evidências, limitações e um **prompt completo da próxima sessão**. O prompt precisa mandar o Arena buscar a `main` já atualizada, conferir se a próxima fatia permanece pendente e continuar sem reabrir a PR anterior.

Se não for possível obter checks verdes, a fatia não está concluída e **não deve ser mesclada**. Informar o bloqueio e entregar um prompt de retomada para corrigir os checks dessa mesma fatia, não para avançar.

## Modelo obrigatório de prompt de continuação

Ao terminar UX-PRO-00, a próxima sessão começa em UX-PRO-01. Em cada sessão seguinte, avance para a primeira fatia ainda pendente, sempre com base na `main` já mergeada. O prompt entregue ao usuário deve seguir esta forma e substituir os campos entre colchetes:

> Trabalhe no repositório `berger33/gruposegsystemseguranca`, partindo da `main` mais recente. Leia `AGENTS.md`, `README.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md` e `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`. Confirme o SHA e reconcilie a situação de PRs/checks; não use cópia local antiga. Execute **somente [ID e nome da fatia]**, reavaliando o código antes para evitar duplicar trabalho já integrado. Preserve funcionalidades, APIs, permissões, isolamento, auditoria, dados e operação local. Faça implementação, validação focal, evidências antes/depois em 320/390/768/1440 px, dia/noite e teclado conforme aplicável. Abra uma PR pequena. Só faça merge depois que todos os checks obrigatórios estiverem realmente verdes, revisão concluída e base `main` confirmada; depois confirme o merge na `main`. Não trate cancelados/pulados como aprovação nem invente aceite humano. Atualize o registro da fatia e entregue o prompt completo da próxima sessão. Se houver bloqueio ou check não verde, não avance nem faça merge; explique a evidência e entregue prompt de retomada desta fatia.

## Definição de pronto

Uma fatia só está pronta quando o escopo corresponde ao código atual, tarefas e rótulos são claros, aparência é consistente nos estados e temas previstos, desktop/mobile/teclado foram comprovados com evidências, comportamento funcional e segurança foram preservados, checks obrigatórios passaram, documentação está atualizada e o merge foi confirmado na `main`. A experiência integral do sistema só pode ser declarada concluída após UX-PRO-10 e sem lacunas ocultadas.

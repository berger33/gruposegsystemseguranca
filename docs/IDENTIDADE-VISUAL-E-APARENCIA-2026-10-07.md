# Identidade visual e administração da aparência — 07/10/2026

## Resultado e escopo

Logo oficial fornecido pelo usuário aplicado aos cabeçalhos e entradas do staff, funcionário, cliente e às dez apresentações do site, além do ícone padrão da aplicação. A fotografia de referência orientou a leitura corporativa, mas não foi adicionada ao site. O JPG de 345 × 345 foi preservado sem redesenhar letras ou escudo; o tratamento circular é CSS. Para impressão ou ampliação, obter futuramente o arquivo vetorial oficial.

O site público conserva seu conteúdo, composição, estilos e layout padrão 06. Não foi publicada nenhuma troca de layout no banco operacional. Outros layouts continuam contendo os textos e limitações das propostas existentes; selecionar uma apresentação não transforma seus formulários ou protótipos em funcionalidades novas.

## Diagnóstico e alterações

| Problema observado | Tratamento entregue | Limite |
| --- | --- | --- |
| Marca fictícia SEG e cores de origens diferentes | Componente BrandLogo único, azul institucional e superfícies claras | Imagem original tem resolução limitada |
| Fundo administrativo muito escuro e contraste fraco no breadcrumb claro | Fundo claro, cabeçalho azul, navegação branca e breadcrumb com texto escuro | Não equivale a certificação integral WCAG |
| Formulários de entrada ocupavam largura excessiva | Cards proporcionais, campos legíveis e ações principais de 44 px | Login operacional depende das contas do destino |
| Ferramentas TI apresentadas como sequência longa | Quatro grupos: conteúdo, operação, governança, experiência | Formulários internos complexos ainda exigem revisão por tarefa |
| Confusão entre dez paletas e dez layouts | Galeria das dez apresentações reais, seleção e estado ativo distintos | Esquemas pequenos são miniaturas conceituais; iframe é a prévia real |
| Ferramenta antiga de aparência pausada e contrato incompatível | Entrada canônica /admin/aparencia, TI → Aparência do site | A rota /admin/visual redireciona para Aparência; o editor duplicado foi removido da navegação |
| Publicação sem identidade individual nem permissão específica | Papel admin/marcelo/TI + site.visual.write organizacional/global, motivo e autoria UUID | Contas futuras precisam receber concessão pelo fluxo RBAC existente |
| Possibilidade de sobrescrever escolha de outro administrador | expectedVisual + bloqueio da linha + conflito 409 | Atualizar configuração antes de tentar novamente |
| Migrações 175/176 fora do migrador oficial | Manifesto e verificador estático atualizados até 177 | Aplicação no banco de destino ainda pendente |

## Paleta do sistema

Azul principal #233f91; azul profundo #172b68; fundo #f3f5fb; superfície #ffffff; texto #15243d; secundário #52627c; seleção #edf1fc; borda #d1d9e8; foco #315aca. Vermelho permanece reservado a erros/ações destrutivas e verde a confirmações. Não se depende apenas de cor: ativo, selecionado e situação têm rótulos.

As alterações estão nos tokens do sistema, chrome administrativo, espaços de tarefa, área do funcionário e portal cliente. Os CSS dos dez sites públicos não foram recoloridos. A navegação por papel, busca de módulos e menu móvel foram preservados.

Referências: [contraste mínimo WCAG](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) e [tamanho de alvo WCAG](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Foram adotados alvos principais de 44 px e foco visível; os documentos não representam auditoria automática de todos os elementos.

## Como administrar os layouts

1. Entrar com conta individual autorizada.
2. Abrir Aparência do site pelo menu Sistema, ou pelo console TI.
3. Comparar as dez opções; uma única prévia real é carregada por vez.
4. Alternar Desktop/Celular ou abrir a prévia em outra aba.
5. Conferir qual é o layout ativo e qual está em comparação.
6. Revisar e aplicar: registrar motivo de 10–1000 caracteres e marcar a confirmação.
7. Conferir a confirmação do servidor. Para voltar, selecionar e aplicar o layout anterior.

A alteração e as duas auditorias usam uma transação. Falha de auditoria devolve 503 e mantém o layout anterior. A prévia nunca grava seleção. Marcelo possui entrada própria /admin/aparencia, sem precisar ter acesso ao console inteiro de TI.

## Ativação local

Esta entrega não aplicou migrações nem reiniciou o ambiente operacional em 3100. Usar o runbook local vigente, backup e DATABASE_MIGRATION_URL correto antes de `npm run db:migrate`. O migrador oficial agora cobre 001–177 e verifica checksums; executar novamente deve reconhecer os arquivos aplicados. Não editar migrações históricas.

A migração 177 adiciona autoria/motivo à auditoria e concede site.visual.read/write aos perfis ativos admin/marcelo/TI que não tenham qualquer registro anterior dessa permissão. Concessões revogadas não são restauradas. A variável antiga SITE_VISUAL_SELECTION_ENABLED foi retirada: seleção agora depende da autorização individual.

Antes de iniciar a versão nova, conferir `site_visual_config.active_visual`: o banco passa a ser a fonte da escolha. Se a antiga seleção pausada escondia outra escolha, reconciliar explicitamente com a apresentação atualmente desejada. Nenhum UPDATE foi executado por esta entrega no destino. Manter 06 para conservar o site atual.

Atualizar código, instalar dependências conforme runbook, compilar e reiniciar o servidor. A configuração Next de desenvolvimento agora aceita localhost/127.0.0.1, preservando os hosts e2b já utilizados. O PGlite beta mínimo não substitui o ledger PostgreSQL completo. Ícones PWA configurados explicitamente no banco continuam obedecendo à configuração existente; o logo é o padrão quando não há configuração.

## Evidências e limites de validação

Evidências em `docs/evidencias/identidade-2026-10-07/`: login anterior (servidor 3100), login novo, site com logo, entradas funcionário/cliente, galeria desktop/mobile e console TI. Telas administrativas foram revisadas com componente real e perfil fictício em uma rota temporária local; APIs continuaram exigindo autenticação e nenhuma publicação foi habilitada. A rota temporária não integra a entrega.

Foi conferida a comparação de cartões pelo navegador, navegação Tab entre propostas e largura móvel de 390 px sem transbordamento horizontal do documento. A prévia desktop de 1120 px admite rolagem dentro da moldura. Esta revisão não declara homologação de Marcelo/Andreia nem validação de todas as 98 páginas com dados operacionais.

Verificações focais: manifesto completo, concessão/negação por papel, preservação de revogação, same-origin, conflito entre escolhas, autoria/motivo e rollback de auditoria em PGlite descartável. TypeScript e sintaxe dos módulos revisados. Testes completos de regressão, carga, autenticação HTTP real, aplicação 001–177 e jornadas internas por papel ficam para a etapa operacional.

## Próximas melhorias, em ordem

1. Homologar autenticação real e troca/restauração de layout no PostgreSQL local após migração, desktop/celular/teclado.
2. Rever todas as jornadas autenticadas com dados fictícios: funcionário (ponto/ajuste), RH (fila de aprovação), Marcelo (pendências/comercial), cliente (chamados/documentos), TI (RAG/fontes).
3. Substituir campos técnicos/JSON remanescentes por formulários orientados a tarefas, uma família coerente por PR; não modificar contratos ou permissões apenas por estética.
4. Refinar densidade de tabelas, filtros, vazios, carregamento e erros em cada módulo. A melhoria dos componentes compartilhados alcança os painéis que os usam, mas não substitui a revisão individual.
5. Homologar conteúdo e funcionalidades de cada apresentação alternativa antes de disponibilizá-la aos visitantes. A galeria administra layouts existentes, não homologa propostas.
6. Obter logo vetorial oficial e exportações profissionais para ícones instaláveis, mantendo o desenho fiel.

## Continuação para Arena/Antigravity

Partir da main atual. Ler este relatório, README e o runbook local. Não recriar migrações 175–177 nem alterar históricas. Registrar o SHA auditado. Executar primeiro os testes focais da aparência e depois regressões; relatar falhas com evidências. Validar, no ambiente apropriado, publicação e retorno com identidade individual real, revogação, conflito e falha de auditoria. Trabalhar nas melhorias acima em pequenas PRs, sem declarar completo o que só recebeu atualização de tokens. Preservar o site público, exceto logo e trocas explícitas feitas pelo administrador. Não receber segredos, não inventar aceite e não acessar banco de produção.

Correção adicional observada: a navegação automática de tarefas passou a ignorar espaços internos aninhados, dialogs fechados e elementos ocultos. Isso evita atalhos duplicados e destinos invisíveis. A revisão final usou compilação Next isolada; artefatos `.next*` são ignorados no Git. Logo original e cópia pública têm SHA-256 idêntico. Os 22 testes focais (aparência e scheduler/manifesto) passaram; não foi executada a suíte completa.

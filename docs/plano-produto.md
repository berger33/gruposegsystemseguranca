# Grupo Seg System — plano de produto (rascunho de descoberta)

> Status: planejamento, **não** é uma especificação aprovada nem um sistema em produção. Revisar com o responsável pela empresa antes de publicar informações oficiais, preços ou documentos. Atualizado em 27/09/2026.

## 1. Decisões confirmadas nesta conversa

- Construir o **sistema completo por fases**, desenvolvendo neste repositório; o **site público e a captação de clientes** têm prioridade na primeira entrega.
- O site atual publica seis serviços: **Segurança Desarmada**, **Monitoramento 24 Horas**, **Câmeras e CFTV**, **Portaria e Controle de Acesso**, **Limpeza e Conservação**, **Supervisão e Ronda**. Cerca elétrica apareceu na ideia inicial, mas **não foi encontrada no site**; confirmar antes de anunciar. Não inferir vigilância armada, credenciais da Polícia Federal ou licenças sem documentação.
- Quatro ambientes principais: **público**, **equipe**, **Marcelo** e **administração de TI**. Cliente contratado e funcionário de campo podem ter papéis específicos e acesso limitado, sem receber as permissões de RH.
- O site público atual é https://gruposegsystemseguranca.com.br/ e o usuário indicou a página https://www.facebook.com/gruposegsystemseguranca.com.br/ como referências de material. O conteúdo público verificável do site e as pendências estão em [referências de marca](referencias-marca.md); a página do Facebook não pôde ser lida automaticamente. Uma imagem de viatura foi mostrada na conversa, mas o arquivo anunciado como anexo ainda não está acessível no workspace.
- A identidade visual observável usa azul, branco e tons escuros. As cores oficiais, logotipo em arquivo e autorização de uso de imagens ainda precisam ser confirmados.
- A primeira versão pública desejada inclui **todos os fluxos da camada pública**: site, simulador, pacote, agendamento, portal autenticado do cliente, vagas, conteúdo, planos e chamados. Isso é um lançamento amplo, que pode ser implementado em incrementos verificáveis antes da publicação.
- O responsável aprovou visualmente os layouts **01 (institucional)**, **02 (Central tecnológica)**, **03 (Presença/humano-editorial)**, **04 (Operação industrial)**, **05 (Institucional B2B)** e **06 (Azul em camadas/editorial)**. O layout **07 (Mapa de cuidado)** está em avaliação nesta etapa. As dez interfaces são criadas e avaliadas **uma por vez**; só avançar para a seguinte após aprovação explícita. O bot começa com **FAQ aprovada e transferência para humano**; IA/RAG entra após organizar conteúdo e custos.
- O portal começa **sem dados reais importados**; dados de demonstração só em ambiente de teste, identificados como tal. A configuração de cadastro de clientes terá três modos selecionáveis por Marcelo/TI: **convite** (padrão inicial), **solicitação de acesso com aprovação** e **autocadastro**. Nos três, acessar contratos exige vínculo verificado e autorizado no servidor; autocadastro não concede acesso automático a documentos.
- Leads serão gravados no painel, com notificação por e-mail e **link de WhatsApp** sem API paga na primeira versão. Agendamento começa como **solicitação de horários**, confirmada por uma pessoa; não é reserva automática.
- Preparar o modelo de dados para **filiais futuras**: cada registro operacional e comercial pertinente pertence a uma unidade, com acesso delimitado.
- O responsável quer desenvolver o sistema aqui e, quando estiver pronto para produção, contratar **hospedagem paga e segura**, com orientação de implantação. Não deseja administrar servidores complexos por conta própria. Teto informado para hospedagem: **R$ 200/mês**; orçamento para outros serviços ainda indefinido. Haverá um programador para manutenção futura, portanto documentação e repasse técnico importam.

## 2. Princípios e limites

1. O ambiente público não expõe dados pessoais, contratos, imagens de CFTV, preços não aprovados ou alegações regulatórias não verificadas.
2. Permissão é por **papel + módulo + ação + escopo** (por exemplo, um cliente só vê seus próprios chamados; um funcionário só vê postos aos quais foi vinculado). Negar por padrão; verificar também no servidor, não apenas ocultar botões.
3. Registrar em trilha de auditoria ações sensíveis, incluindo autor, data, objeto e mudança. Restringir acesso ao próprio registro de auditoria; evitar gravar segredos nele.
4. Dados pessoais, documentos de RH e imagens exigem acesso mínimo, política de retenção, segurança e validação jurídica/LGPD. Imagens de CFTV não devem ser colocadas no chatbot nem copiadas para o site.
5. Cálculos trabalhistas, regras de vigilância, faturas, emissão fiscal e bloqueios por inadimplência dependem de validação jurídica/contábil/operacional; não automatizar decisões punitivas por padrão.
6. Iniciar o simulador em **captação de lead**, até existir tabela de preços aprovada. Se ativado, preço exibido deve ser rotulado como estimativa, sujeito a visita e condições comerciais.
7. Publicação de temas, textos, documentos de conhecimento do bot e políticas comerciais deve ter pré-visualização, autorização e possibilidade de reversão.

## 3. Modelo de acesso proposto

| Contexto / papel inicial | Acesso esperado | Restrição importante |
| --- | --- | --- |
| Visitante | Site, serviços, conteúdo, orçamento, contato, vagas, bot público | Sem dados internos |
| Cliente autenticado | Seus contratos/documentos autorizados, faturas, chamados, agendamentos e feedback | Nunca vê dados de outros clientes nem avaliação individual enviada ao RH |
| Funcionário de campo | Seus plantões, ponto, comunicados, ocorrências e solicitações | Sem visão geral de RH ou financeiro |
| RH / administrativo | Pessoas, documentos, escalas, despesas e módulos concedidos | Folha, dados médicos e aprovações exigem permissões separadas |
| Marcelo / administrador de negócio | Visão de negócio, CRM, contratos, aprovações, conteúdo e configurações comerciais | Sem segredos, infraestrutura, edição de permissões privilegiadas ou código |
| TI / administrador do sistema | Configurações técnicas, RBAC, integrações, auditoria e operações de plataforma | 2FA obrigatório, registro reforçado e ações destrutivas protegidas |

Os quatro **ambientes** não são uma hierarquia simples: o cliente e o colaborador de campo são papéis de escopo reduzido. A matriz de permissões definitiva depende da definição dos usuários reais.

## 4. Mapa de módulos por fase sugerida

**Fase 0 — Base e descoberta.** Identidade e conteúdo oficiais; serviços; papéis e política de acesso; modelo de dados preparado para unidade/filial se necessário; autenticação e 2FA privilegiado; auditoria; backups e política de privacidade inicial; critérios de aceite; ambiente de homologação.

**Fase 1 — Camada pública completa (prioridade, em incrementos).** Site responsivo; catálogo de serviços; planos comparativos; cases autorizados; blog; vagas e candidaturas; contato/WhatsApp; formulários protegidos contra abuso; simulador e montador de pacote gerando leads; solicitação de visita com confirmação humana; painel de leads e notificação por e-mail; **portal autenticado do cliente** com contratos/documentos permitidos, chamados e acompanhamento; configurações de negócio (incluindo os três modos de cadastro do portal); criação e revisão progressiva dos **dez layouts**, um por vez, aguardando aprovação do responsável entre eles; modo dia/noite nas áreas internas. Começar o bot com FAQ validada e handoff humano. O portal requer autenticação, isolamento de dados por cliente e conteúdo operacional real; dados demonstrativos aparecem somente em homologação/testes, nunca como contratos verdadeiros. Convite é o modo inicial de cadastro e qualquer modo alternativo precisa preservar a verificação do vínculo com contratos.

**Fase 2 — Comercial e relacionamento aprofundados.** CRM com funil e follow-up, propostas, contratos, tabela de preços, aprovações comerciais, notificações e amadurecimento do portal. Avaliações de colaboradores seguem um fluxo privado para RH; reclamações operacionais seguem para tickets. Política de inadimplência precisa ser decidida antes de qualquer restrição do portal. Prosseguir com os layouts restantes conforme o ritmo de revisão e aprovação do responsável.

**Fase 3 — Pessoas e operação.** Cadastro por administradores autorizados; postos e alocações; escalas 12x36/6x1/diarista sob regras revisadas; substituição; ponto por posto; passagem de plantão; ronda; documentos e alertas; uniformes/equipamentos; reembolsos, comunicados e indicadores. Geolocalização e dados de saúde requerem finalidade, retenção e acesso específicos.

**Fase 4 — Gestão e financeiro.** Visão executiva, contas a pagar/receber, conciliação e inadimplência, inventário, compliance da empresa, metas, comissões quando aplicável, aprovações unificadas e diário privado de decisões. Integrações fiscais (inclusive tipo de nota adequado à operação) e assinatura eletrônica somente após escolha de provedores e validação contábil/jurídica.

**Fase 5 — Plataforma avançada.** Editor e histórico das dez interfaces, testes A/B com consentimento quando aplicável, RBAC avançado, curadoria/versionamento de RAG, custos de IA/infraestrutura, integrações, manutenção, restauração testada, políticas LGPD e monitoração. Algumas dessas capacidades (como logs, backups e permissões) começam na Fase 0; esta fase amplia o controle de TI.

Uma fase não significa que todo seu escopo precise ser publicado de uma vez: cada entrega deve ter critérios de aceite, testes e homologação.

## 5. Site com dez interfaces

Uma única fonte de conteúdo e componentes reutilizáveis, com dez **composições visuais realmente distintas**, tokens de cor/tipografia e seleção de seções; não dez bancos de dados distintos. Os layouts 01 (institucional), 02 (Central tecnológica), 03 (Presença humano-editorial), 04 (Operação industrial), 05 (Institucional B2B) e 06 (Azul em camadas/editorial) foram aprovados pelo responsável. O layout 07 — conceito Mapa de cuidado — está em avaliação nesta etapa. As composições 08 a 10 serão apresentadas em fluxo sequencial: apresentar uma, aguardar aprovação ou pedido de ajustes, e só então iniciar a próxima. Todas preservam identidade oficial, acessibilidade, navegação e funcionalidades. Marcelo visualiza e ativa uma versão publicada; TI edita definições e reverte versões.

**Toggles de negócio (Marcelo/TI):** tema ativo, modo de orçamento por serviço (lead ou faixa aprovada), conteúdo publicado, padrão visual das áreas internas e disponibilidade de campanhas. **Flags técnicas (somente TI):** integrações, provedores, manutenção, experimentos, limites e comportamentos de infraestrutura.

## 6. Arquitetura candidata, não aprovada

**Recomendação preliminar:** aplicação web modular em TypeScript, banco relacional PostgreSQL, armazenamento privado para documentos, serviço de autenticação com 2FA, tarefas assíncronas para notificações/IA, backups automatizados e ambiente de homologação separado. Um monólito modular costuma ser mais simples de evoluir e hospedar do que muitos microsserviços neste estágio. O site, painéis e API podem viver no mesmo produto inicialmente; RBAC e validação de escopo permanecem no servidor.

**Implantação:** o domínio informado já possui um site ativo; desenvolver e testar em ambiente separado e planejar migração sem interromper o endereço atual, incluindo revisão de URLs/SEO. Escolher plataforma gerenciada com suporte real ao runtime da aplicação, banco, armazenamento privado, HTTPS, backups e jobs. Hospedagem compartilhada convencional pode não atender processos Node, tarefas em segundo plano e requisitos operacionais; uma oferta de VPS exige mais administração. Hostinger pode ser considerada se o plano específico suportar a arquitetura escolhida, mas não será assumida como destino obrigatório. O teto para **hospedagem** é R$ 200/mês, não um orçamento total: domínio, e-mail transacional, armazenamento, IA, mensagens e integrações podem ter custos adicionais. Não prometer custo final antes de dimensionar uso e comparar planos atuais. Antes da produção: domínio, volume de usuários/documentos, política de retenção, testes de restauração, configuração de e-mail, observabilidade e responsabilidade pelo suporte. Preparar documentação de instalação, variáveis de ambiente, atualização e recuperação para o programador que fará manutenção futura.

## 7. Decisões pendentes para as próximas conversas

- Nome empresarial exato, CNPJ, domínio, endereço, horários, contatos, logotipo, cores, fotos com autorização, lista final de serviços e eventuais registros/licenças verificáveis.
- Confirmar se os dados do [site atual](referencias-marca.md) continuam corretos, incluindo nome comercial, telefone, e-mail, endereço e serviços. Enviar logotipo original (idealmente SVG/PNG), imagens autorizadas e arquivo da viatura acessível no workspace. Enviar eventuais registros/licenças apenas se devem ser publicados e podem ser comprovados.
- FAQ inicial: quais perguntas/respostas foram aprovadas? Qual número/canal atende a transferência para humano? Conteúdo RAG posterior precisa de curadoria.
- Simulador: começar somente em modo lead, como solicitado originalmente; quais serviços e perguntas entram e quem recebe e confirma cada pedido? Para exibir faixas no futuro, é necessária tabela aprovada por serviço.
- Portal: quando houver dados reais, serão cadastrados manualmente, importados ou integrados? Quais documentos e funções ficarão indisponíveis enquanto não existirem dados?
- Número de usuários/clientes/postos; quem serão os administradores iniciais, responsáveis por filial e aprovadores de ações sensíveis.
- Integrações existentes e desejadas (WhatsApp, e-mail, agenda, financeiro, nota fiscal, assinatura); custos externos além do teto de hospedagem, domínio e critérios de segurança.
- Prazo desejado, critérios para chamar cada fase de pronta e requisitos de suporte após a publicação.

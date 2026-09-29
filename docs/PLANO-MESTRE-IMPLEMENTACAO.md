# SEG System — Plano mestre de implementação, correção e implantação
Versão: 1.0 • 28/09/2026 • Documento de execução para Arena.ai e agentes de desenvolvimento.

Repositório: https://github.com/berger33/gruposegsystemseguranca
Referência remota consultada: main em 49d366cd9335ca33fe9703a397dc0488b6468ef8.
Este documento especifica trabalho futuro. Sua criação não implementa, homologa ou publica as funcionalidades.

## 1. Objetivo e resultado esperado

Evoluir o projeto existente para uma plataforma integrada de site/captação, comercial, clientes, contratos, pessoas, operação, financeiro e administração técnica. Os usuários principais são Marcelo (gestão do negócio), Andreia (RH), funcionários, supervisores, equipe comercial, financeiro, clientes e TI.

Fluxo central: contato → oportunidade → vistoria → proposta → contrato → implantação → posto/equipe/equipamento → execução → atendimento → cobrança → acompanhamento de resultado → renovação.

Implementar jornadas reais com interface, autorização no servidor, persistência, histórico, testes e documentação. Uma tela com cards, um schema isolado ou um botão que altera apenas estado local não satisfaz um requisito funcional.

Todo o catálogo deste documento deve permanecer rastreado. Implementar primeiro o núcleo; evoluções condicionais também devem constar do backlog, sem desaparecer da prestação de contas. Não chamar o projeto de completo enquanto houver itens obrigatórios sem evidência. Diferenciar conclusão do núcleo, conclusão das expansões e liberação para produção.

## 2. Como ler e resolver divergências

Ordem de leitura: AGENTS.md aplicáveis, README.md, este documento inteiro, docs/CONTROLE-IMPLEMENTACAO.md, docs/PROMPT-MASTER-ARENA.md, documentos históricos pertinentes, código e testes.

Respeitar instruções atuais do proprietário e regras do ambiente. Este plano orienta a implementação e corrige critérios de conclusão; não é prova de aprovação jurídica, configuração de produção ou comportamento já existente. Quando documentos históricos disserem “ativo/aprovado/concluído” e o código não comprovar, registrar a divergência e corrigir a descrição. Quando o código já tiver evoluído, reaproveitar a solução verificada; não reconstruir cegamente.

Decisões comerciais, trabalhistas e de tratamento de dados não devem ser inventadas. Registrar pendência com responsável, impacto e alternativa provisória segura. Continuar nos itens independentes. Escolhas técnicas reversíveis e de baixo impacto podem ser tomadas pelo agente com justificativa curta.

Preservar layout 06 como padrão, identidade visual existente e dez prévias. Não trocar framework, provedor, banco ou arquitetura inteira sem necessidade demonstrada. A evolução do seletor global permanece posterior aos fluxos essenciais. Não usar nomes pessoais como mecanismo de autorização: Marcelo e Andreia serão contas associadas a papéis/permissões.

## 3. Evidências iniciais e limites da auditoria

A auditoria de 28/09 examinou a cópia local e executou 46 testes isolados, todos aprovados. Não houve homologação em navegador autenticado, build completo ou teste contra banco nessa auditoria. README.md, docs/auditoria-modulos.md e server.mjs também foram consultados no GitHub para preparar este plano. Não foi feita nova auditoria integral de todos os arquivos remotos. O agente deve revalidar o commit efetivamente trabalhado.

Achados a reproduzir, corrigir ou demonstrar já resolvidos:
- server.mjs: autenticação administrativa por chaves para marcelo/ti; perfis staff/RH do schema não comprovam login e autorização individuais.
- src/server/client-space-api.mjs: erros de consulta de escopo por unidade/contrato podem ser ignorados e preservar acesso mais amplo.
- Documentos estão associados à conta; restrição de contratos selecionados não está integralmente propagada ao acesso documental.
- src/server/client-security-api.mjs: uso de req.json/res.status incompatível com o servidor HTTP Node atual; verificação MFA demonstrativa; senha atual não verificada na troca de e-mail; fluxo incompleto de envio/revogação.
- src/server/client-access-api.mjs: não foi encontrado desafio MFA integrado à emissão de sessão de login.
- scripts/migrate-site-visual.mjs: lista somente migrações 001–004; 005–007 não integram o procedimento padrão.
- db/migrations/006-admin-identities.sql: revisar nomes de constraints já criados em 003 e reaplicação.
- tests/client-security.integration.test.mjs: simula consultas sem exercitar várias alegações dos títulos; depende de embedded-postgres não declarado no package.json examinado.
- src/app/admin/funcionarios/page.tsx, admin/marcelo/page.tsx e admin/ti/page.tsx: telas principalmente descritivas.
- src/app/orcamento/page.tsx: confirmação local sem gravação, preço ilustrativo, controle de modo pelo visitante e divergência de catálogo.
- src/app/admin/tema/page.tsx: atributo visual local não equivale a publicação global persistida.
- src/app/privacidade/page.tsx: declaração de aprovação sem política completa apresentada.
- Documentos e README apresentam estados conflitantes e não devem servir como prova isolada.

As referências são pontos de partida, não um diagnóstico de incidentes já ocorridos nem garantia de que o commit futuro preserve as falhas.

## 4. Regras universais de implementação

### 4.1 Entrega e segurança
- Trabalhar em branches de escopo pequeno. Preservar alterações existentes e trabalho concorrente do Arena.
- Não fazer force push, reset destrutivo, exclusão de dados ou reescrita do histórico.
- Cada lote entrega uma capacidade vertical utilizável, não dezenas de telas vazias.
- Proibir segredos, senhas, tokens, dados médicos, documentos reais e dados pessoais de produção em commits, PRs, logs e screenshots.
- Repositório público: usar exclusivamente dados sintéticos claramente identificados em testes/homologação.
- Mocks só em testes/demonstrações isoladas. Integração não configurada deve aparecer indisponível; nunca simular sucesso real.
- Proteger no servidor leitura, criação, edição, aprovação, exportação, download e jobs; ocultar botões é apenas complemento.
- Negar acesso quando sessão, permissão ou escopo não puderem ser confirmados. Falha técnica deve produzir resposta controlada sem liberar dados.
- Registrar transações sensíveis com autor imutável, ação, objeto, horário e resultado. Não copiar conteúdo sensível para a auditoria.
- Ações que exigem histórico durável devem gravar mudança e auditoria na mesma transação, ou usar mecanismo durável equivalente.
- Não publicar nem operar produção automaticamente a partir deste plano. Preparar artefatos, validar homologação e apresentar um gate concreto de liberação.
- Não contratar serviços, efetuar pagamentos ou enviar campanhas/mensagens reais sem autorização específica. Desenvolver e testar com sandbox/captura local.

### 4.2 Contrato comum para todos os módulos
Cada requisito implementado deve incluir:
1. Dados e invariantes, migração e índices.
2. API/serviço com validação, autorização e tratamento de erro.
3. Interface com carregamento, vazio, sucesso verdadeiro, erro recuperável e confirmação de ações relevantes.
4. Busca, filtros, paginação e escopo consistentes quando houver listas.
5. Histórico e notificações quando o fluxo exigir.
6. Concorrência, idempotência e retry nas ações suscetíveis a repetição.
7. Testes proporcionais ao risco; ao menos integração e jornada real para fluxos críticos.
8. Documentação de uso, operação, configurações e limitações.
9. Evidência no controle de implementação, vinculada ao requisito e commit.

### 4.3 Dados e arquitetura
Manter inicialmente Next.js/React, servidor Node e PostgreSQL existentes, organizando serviços por domínio. Confirmar versões reais pelo lockfile. Monólito modular é o padrão de partida; evitar microsserviços prematuros.

Distinguir organização prestadora/filial, empresa cliente, unidade atendida, local/posto, função/cargo, turno e alocação. Nunca usar “posto” simultaneamente como cargo e local físico.

Usar IDs estáveis, chaves estrangeiras, unicidade e validação de compatibilidade entre referências. Uma atribuição não pode ligar funcionário/posto/cliente de escopos incompatíveis. Identidade de acesso e cadastro trabalhista são entidades separadas. Não usar e-mail como chave de permissão.

Valores monetários em decimal exato ou centavos; moeda explícita, regras de arredondamento e snapshots. Datas civis para férias/vigência; instantes UTC para eventos; fuso operacional explícito, inicialmente America/Sao_Paulo configurável. Não recalcular proposta histórica com preço/custo atual.

Registros financeiros, jornada, contratos e histórico de vínculos exigem cancelamento/retificação rastreável, sem apagamento silencioso. Revisar ON DELETE CASCADE antes de conectar novos dados regulados.

Arquivos privados com metadados, categoria, checksum, limite/tipo validado, quarentena/verificação conforme capacidade escolhida, download autorizado e retenção. Nunca servir documentos de RH por diretório público.

Eventos internos recomendados: LeadReceived, ProposalAccepted, ContractActivated, EmployeeAssigned, ShiftUncovered, DocumentExpiring, TicketEscalated, InvoiceDue. Implementar outbox transacional onde mudança e notificação devam permanecer consistentes. Consumidores idempotentes com chave de evento e retries limitados.

## 5. Matriz de acesso e organização da interface

| Perfil | Acesso principal | Restrições |
|---|---|---|
| Funcionário | Dados próprios, escala, solicitações e tarefas atribuídas | Sem dados de colegas, carteira comercial ou prontuários |
| Supervisor | Postos/equipes sob gestão, cobertura e ocorrências | Sem salários e saúde detalhada por padrão |
| RH/Andreia | Pessoas, admissão, documentos, férias e atendimento | Folha e saúde com permissões específicas |
| Comercial | Contas, contatos, oportunidades, propostas | Sem dossiês de RH; descontos dentro da alçada |
| Financeiro | Títulos, cobrança, conciliação e custos permitidos | Sem alteração irrestrita de acessos |
| Marcelo | Gestão do negócio, indicadores e aprovações | Sem segredos técnicos ou saúde irrestrita |
| TI | Plataforma, integrações, acesso e diagnóstico | Sem direito automático de ler todo documento |
| Cliente | Dados explicitamente concedidos de conta/unidade/contrato | Sem outra conta ou dados individuais de RH |
| Prestador/contador | Conjunto limitado e temporal de dados | Sem acesso amplo ao restante da empresa |

Permissões expressas como domínio.ação com escopo próprio/equipe/unidade/contrato/organização. Exemplos: employees.read, employees.health.read, proposals.approve_discount, documents.download, payroll.export, permissions.grant. Os nomes finais podem variar; a separação não.

A concessão de privilégios elevados exige permissão distinta e registro. Não permitir autoelevação nem confiar em papel enviado pelo browser. Mudança de papel/status deve invalidar ou reavaliar sessões imediatamente. Prever acumulação de funções explícita e contas de serviço com escopo mínimo.

Menu Marcelo: Visão geral, Comercial, Clientes e contratos, Operação, Pessoas, Financeiro, Aprovações, Relatórios, Configurações de negócio.
Menu Andreia: Meu dia, Colaboradores, Admissões, Documentos, Escalas/ausências, Férias, Benefícios, Treinamentos, Solicitações, Fechamento DP.
Menu funcionário: Meu plantão, Minha escala, Minha jornada, Solicitações, Documentos, Comunicados.
Menu cliente: Visão geral, Contratos, Documentos, Chamados, Agenda, Financeiro quando habilitado.
Menu TI: Acessos, Auditoria, Integrações, Jobs/notificações, Saúde do sistema, Backup/recuperação, Configurações técnicas.

Criar navegação consistente, busca autorizada, filtros salvos, breadcrumbs, atalhos e links dos indicadores para os dados de origem. Estados vazios explicam a próxima ação. Não usar termos técnicos de implantação em jornadas de negócio.

## 6. Correções obrigatórias antes da expansão — SEC

| ID | Implementação exigida | Aceite mínimo |
|---|---|---|
| SEC-01 | Inventariar rotas, APIs, tabelas, jobs, permissões e documentação no commit atual | Mapa com real/parcial/prévia/ausente e divergências documentadas |
| SEC-02 | Corrigir verificações de escopo para negar por padrão em qualquer erro | Testar usuário A/B, outra unidade/contrato e falha de banco sem retorno de dados |
| SEC-03 | Associar documentos a conta/unidade/contrato/classificação e aplicar autorização uniforme | Lista, busca, download, exportação e links respeitam o mesmo escopo |
| SEC-04 | Login individual de staff, papéis, convites e revogação | Andreia acessa RH; funcionário não acessa RH geral; auditoria identifica pessoa |
| SEC-05 | Substituir tokens compartilhados por autenticação individual com migração controlada | Credenciais legadas desligadas após contas válidas; recuperação administrativa documentada |
| SEC-06 | MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit | Senha sozinha não emite sessão privilegiada; TOTP/recovery inválido ou reutilizado negado |
| SEC-07 | Corrigir troca de e-mail e handlers HTTP | Senha atual verificada, novo e-mail confirmado, token único/expirável, atualização atômica, aviso antigo e sessões revogadas |
| SEC-08 | Migrações rastreadas e executáveis | Banco vazio e upgrade de snapshot sintético passam; constraints corretas, repetição do runner segura |
| SEC-09 | Reparar suíte e testar APIs reais | Testes não substituem chamada HTTP por SQL demonstrativo; dependências e CI reproduzíveis |
| SEC-10 | Consolidar orçamento/simulador e catálogo | Só confirmar após persistência; preço fictício ausente do fluxo real; sem modo administrativo público |
| SEC-11 | Separar prévias e recursos reais | Nenhuma simulação concede permissão ou informa envio inexistente |
| SEC-12 | Privacidade e declarações de aprovação verificáveis | Minuta explicitamente pendente enquanto faltar aprovação; texto completo antes de publicar |
| SEC-13 | Segurança de sessão, CSRF, origem e erros | Cookies seguros em produção, origem/CSRF em mutações, JSON limitado, métodos corretos, erro sem stack/segredo |
| SEC-14 | Auditoria durável e operacional | Alterações sensíveis rastreáveis; indisponibilidade de auditoria não gera falsa segurança |
| SEC-15 | Proteção de abuso e identidade | Limites de login/convite/formulário/reenvio, respostas antienumeração, proxy/IP confiável definido |

MFA administrativo obrigatório antes de uso real. MFA de cliente permanece opcional conforme decisão histórica, mas deve ser efetivo quando ativado. Método por e-mail somente se especificado/configurado com limites próprios; não confundir confirmação de e-mail com segundo fator.

Recuperação de conta não deve permitir bypass de MFA por suporte sem verificação formal. Armazenar tokens e códigos de recuperação apenas como hashes e segredo TOTP cifrado com gestão de chave. Invalidar tokens anteriores conforme fluxo e impedir replay.

Na troca de e-mail, testar ausência de sessão, senha errada, endereço já ocupado, expiração, concorrência, confirmação repetida e cancelamento “Não fui eu”. Aviso ao endereço antigo não deve depender da sessão comprometida para permitir tratamento seguro do incidente.

Backfill documental: documentos antigos sem classificação não ganham autorização por inferência. Gerar fila de classificação por pessoa autorizada e manter acesso restrito até decidir.

Migrações: não editar migração já aplicada como se isso atualizasse o banco; criar correção incremental quando necessário. Não executar scripts test-admin-* em produção. Não adivinhar que 007 está aplicada porque uma tela assim declara.

## 7. Site, conteúdo e captação — PUB

- PUB-01: catálogo único dos seis serviços validados no projeto; cada item tem descrição, público, perguntas de qualificação e flag de publicação. Cerca elétrica ou novos serviços entram somente após validação comercial.
- PUB-02: páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados; revisão de acessibilidade, navegação e desempenho.
- PUB-03: orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada e responsável de atendimento.
- PUB-04: visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real.
- PUB-05: FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada e controles do capítulo 19.
- PUB-06: CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão.
- PUB-07: temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global. Implementar após núcleo.
- PUB-08: SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos.
- PUB-09: montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produção.
- PUB-10: mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos.

Aceite: enviar pedido pelo celular → registro único → fila comercial com origem → próxima ação atribuída; falha SMTP não apaga lead nem produz confirmação de e-mail entregue. Recarga/retry não criam duplicatas indevidas.

## 8. Comercial completo — CRM

### 8.1 Empresas, contatos, prospecção e funil
- CRM-01: cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distinguir prospect/cliente/parceiro sem duplicar entidade.
- CRM-02: contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem legítima, sem coleta indiscriminada.
- CRM-03: importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação.
- CRM-04: converter lead do site em contato/oportunidade preservando histórico; tratar duplicidade e contato sem empresa.
- CRM-05: oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda.
- CRM-06: funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para perda; reabertura auditada. Não tratar “ganho” como dinheiro recebido.
- CRM-07: kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas.
- CRM-08: agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento. Links/calendário externo somente por integração configurada.
- CRM-09: cadências de prospecção inicialmente como tarefas; automação de mensagens depende de autorização, opt-out quando aplicável e provedor.
- CRM-10: carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem próxima ação e relacionamentos por grupo/unidade.

### 8.2 Catálogo, vistoria e preços
- CRM-11: separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato quando praticados. Campos: unidade de cobrança, escopo, exclusões, recursos, custo, preço, vigência e aprovação.
- CRM-12: equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico.
- CRM-13: vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico.
- CRM-14: orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, benefícios, provisões, substituição, supervisão, uniforme/EPI, deslocamento, materiais e indiretos.
- CRM-15: orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção.
- CRM-16: parâmetros de tributos/custos/jornada versionados com validade, fonte e aprovador; nenhuma alíquota ou regra coletiva inventada. Impedir preço oficial se faltar parâmetro essencial.
- CRM-17: cenários de preço e margem, separando margem de markup. Para tributos proporcionais à receita e margem sobre receita, uma simulação pode usar preço = custo / (1 - taxa - margem), somente sob premissas explícitas, denominador válido e aprovação contábil. Não impor essa fórmula a todos os regimes.
- CRM-18: alçadas de desconto e exceções; motivo, solicitante, aprovador e versão. Alteração de itens/custos após aprovação reabre a aprovação.

### 8.3 Propostas e contratação
- CRM-19: proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões, prazo, reajuste previsto, validade e condições; PDF gerado a partir da mesma versão persistida.
- CRM-20: estados rascunho → revisão → aprovada para envio → enviada → aceita/recusada/expirada/substituída; preservar versões enviadas.
- CRM-21: envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integração.
- CRM-22: aceite por link seguro, expirável e vinculado à versão, se adotado; decisão jurídica sobre valor do aceite registrada. Não chamar clique simples de assinatura qualificada.
- CRM-23: proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento.
- CRM-24: relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário. Previsão ponderada é estimativa identificada.
- CRM-25: metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento automático.
- CRM-26: biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas.
- CRM-27: parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas.

Aceite: captar lead → qualificar → vistoriar → precificar → aprovar desconto → emitir versão → aceitar → criar contrato uma única vez → abrir implantação e tarefas de RH/estoque. Proposta rejeitada/expirada não cria obrigação financeira.

## 9. Contratos e implantação — CON

- CON-01: contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada.
- CON-02: itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma.
- CON-03: estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura com ativação operacional.
- CON-04: aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada.
- CON-05: alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM.
- CON-06: obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante.
- CON-07: implantação com checklist: contrato, data de início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções, faturamento e convite do cliente.
- CON-08: bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox.
- CON-09: encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico.
- CON-10: dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade.
- CON-11: diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres.

Aceite: mudar um aditivo não altera faturas anteriores; encerramento deixa de gerar novas rotinas conforme data de efeito sem apagar lançamentos já existentes.

## 10. Área do funcionário — EMP

Tela móvel com ações prioritárias “Meu plantão”, “Minha escala”, “Avisar problema” e “Falar com RH”.

- EMP-01: perfil próprio e solicitação de atualização cadastral; dados restritos mascarados conforme necessidade e mudança revisada.
- EMP-02: próximo plantão com local, horário, função, contato do supervisor, orientações e itens necessários.
- EMP-03: calendário de escala, folgas, alterações e ciência da versão publicada; usuário não modifica unilateralmente a escala.
- EMP-04: jornada individual, comprovantes/importação de provedor, divergências e pedido de correção; preservar registro original.
- EMP-05: aviso de ausência/atraso com protocolo, motivo limitado, responsável e acompanhamento; aciona fluxo de cobertura.
- EMP-06: troca de plantão com solicitação, aceite do outro profissional quando aplicável, validações e aprovação operacional.
- EMP-07: passagem de serviço com pendências, chaves, equipamentos, ocorrências e aceite; não expor dados desnecessários de terceiros.
- EMP-08: ocorrência com categoria, descrição, horário, local e anexo pertinente; restrição para informações pessoais.
- EMP-09: procedimentos do posto versionados, ciência e contatos de apoio.
- EMP-10: envio de documentos solicitados, status pendente/em análise/aprovado/rejeitado com motivo e nova versão.
- EMP-11: holerites/informes/documentos próprios, acesso privado e histórico de disponibilização; publicação proveniente de fonte autorizada.
- EMP-12: férias, afastamentos, benefícios e reembolsos com solicitação, anexos restritos, aprovação e prazo de resposta.
- EMP-13: uniformes/EPI/equipamentos com entrega, recibo, solicitação de troca e devolução.
- EMP-14: cursos e reciclagens, comprovantes e alertas de vencimento.
- EMP-15: comunicados direcionados, confirmação de leitura e central de notificações.
- EMP-16: atendimento RH com protocolo, categoria, mensagens privadas e acompanhamento.
- EMP-17: canal confidencial separado, com responsáveis e política de acesso; anonimato somente se efetivamente suportado.
- EMP-18: PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotência, conflito explícito, horário do dispositivo e recebimento no servidor separados. Não cachear documentos médicos/salariais por padrão.
- EMP-19: FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de dados.

Não oferecer botão de emergência/pânico antes de definir destinatário, cobertura, escalonamento e teste real de atendimento. Deixar a funcionalidade condicional em backlog (EXT-15).

Aceite: funcionário A nunca consulta arquivo, solicitação ou jornada de B por URL/API; desligamento revoga acesso; submissão offline repetida sincroniza uma vez e mostra confirmação somente após recebimento.

## 11. RH, Andreia e departamento pessoal — HR

### 11.1 Cadastro e ciclo do colaborador
- HR-01: cadastro profissional separado de identidade de login; matrícula, vínculo, cargo, empregador/filial, gestor, admissão, status, contatos necessários e histórico.
- HR-02: histórico de cargo, lotação, remuneração autorizada e vínculo com datas de efeito; acesso por campo/categoria.
- HR-03: recrutamento com vaga, requisitos pertinentes, candidatos, triagem, entrevista, decisão e comunicação; retenção e acesso próprios para currículo.
- HR-04: banco de talentos e autorização/base aplicável; descarte configurado, sem acúmulo indefinido.
- HR-05: admissão com checklist por função, documentos, validação, exame/treinamento e integração; não exigir dado sem finalidade.
- HR-06: dossiê com tipos, versões, validade, pendências e aprovador. CNV e demais documentos apenas para funções/atividades aplicáveis, após confirmação.
- HR-07: desligamento com checklist, devolução, revogação, documentação e pendências; histórico laboral preservado.
- HR-08: mudança de status (afastado/suspenso/desligado) com efeito em permissões e alocação conforme política, sem automatizar sanção trabalhista.

### 11.2 Ausências, jornada e benefícios
- HR-09: férias com períodos aquisitivo/concessivo quando aplicáveis, saldo importado/validado, programação, conflito de cobertura e aprovação.
- HR-10: afastamentos com período, retorno, documentação restrita e substituição; supervisor vê indisponibilidade/aptidão operacional necessária, não diagnóstico.
- HR-11: integração de ponto, justificativas, divergências, workflow de correção e fechamento de competência; trilha de reabertura.
- HR-12: banco de horas, adicionais e horas extras somente com regras versionadas e validadas para o vínculo/convenção; não fixar 12x36/6x1 como regra universal.
- HR-13: benefícios com elegibilidade, solicitações, conferência, alterações por período e exportação ao fornecedor.
- HR-14: adiantamentos/reembolsos com alçada e comprovantes, integração com financeiro e prevenção de duplicidade.

### 11.3 Saúde, capacitação e DP
- HR-15: saúde ocupacional com agenda, vencimentos e documentos necessários; acesso restrito. Não replicar prontuário médico completo no cadastro comum.
- HR-16: integração/exportação para contabilidade/SST, recibos de processamento, erros e correção. Não declarar envio eSocial sem protocolo válido do responsável/provedor.
- HR-17: treinamento por cargo/atividade, obrigatoriedade aplicável, validade, inscrição, presença e comprovante.
- HR-18: matriz de competências integrada à alocação, sem decisão automática de contratação/punição.
- HR-19: uniformes/EPI com entrega, recibo, substituição, validade/controle aplicável e devolução.
- HR-20: fechamento DP com faltas, férias, variáveis e documentos conferidos; exportação versionada e acesso do contador limitado.
- HR-21: holerites/informes importados de fonte autorizada, vinculação inequívoca ao colaborador, revisão antes de publicar e correção rastreada.
- HR-22: avaliações e planos de desenvolvimento com critérios definidos, acesso privado e participação humana; feedback de cliente não vira punição automática.
- HR-23: atendimento interno com fila, responsável, categoria, prazo e mensagens; anexos de saúde fora de tickets genéricos.
- HR-24: indicadores de quadro, admissão, faltas, rotatividade, férias, documentos e atendimento, com fórmula e período explícitos.

Painel Andreia: admissões para início de contrato, documentos/exames/treinamentos a vencer, férias a programar, ausências que afetam cobertura, pendências DP e solicitações atrasadas.

Aceite: completar admissão sintética → validar documentos → alocar apenas profissional elegível → publicar documento individual → fechar/exportar competência → desligar e revogar acesso. Exceções devem ser registradas e não apagar originais.

Estratégia de integração: preferir folha/ponto/SST especializados; construir gestão e interfaces de integração. Se o proprietário optar por motor próprio, abrir projeto específico de conformidade, escopo e homologação, sem declarar conformidade apenas com testes de código.

## 12. Operação, postos, escalas e supervisão — OPS

- OPS-01: estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação; cargo/função em entidade própria.
- OPS-02: dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado.
- OPS-03: escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência.
- OPS-04: validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas.
- OPS-05: ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação.
- OPS-06: passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite.
- OPS-07: livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação.
- OPS-08: checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais.
- OPS-09: visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação.
- OPS-10: rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/QR isolado não prova execução.
- OPS-11: chaves, rádios, materiais e equipamentos com guarda/transferência/devolução.
- OPS-12: relatórios periódicos ao cliente com revisão de conteúdo e privacidade.
- OPS-13: métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela.
- OPS-14: escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar.
- OPS-15: supervisão de limpeza com rotinas por ambiente, consumo e não conformidades.
- OPS-16: eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto específico.

Jornada e ronda são registros distintos. Jornada identifica trabalhador e contexto do posto. Manter horário original, horário de recebimento, origem, versão e correções. Não afirmar conformidade legal do ponto antes da avaliação pertinente.

Aceite: ausência durante plantão gera cobertura; substituto com conflito é recusado; troca aprovada atualiza escala e histórico; passagem pendente permanece visível; cliente só recebe relatório aprovado do próprio contrato.

## 13. Portal e atendimento ao cliente — CLI

- CLI-01: identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identificadas/redirecionadas com cuidado.
- CLI-02: múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo cliente apenas se autorizada, sem ampliação fora do próprio escopo.
- CLI-03: contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico interno não publicado automaticamente.
- CLI-04: documentos com categoria/validade/versão, busca e download privado; autorização testada em todos os caminhos.
- CLI-05: chamados com protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e histórico.
- CLI-06: estados aberto/em atendimento/aguardando cliente/resolvido/encerrado, reabertura e motivo; pausas de SLA explicitamente definidas.
- CLI-07: agenda de visita/manutenção, confirmação, reagendamento e histórico.
- CLI-08: relatórios de execução e medição/aceite de serviço com revisão.
- CLI-09: cobranças/documentos fiscais/comprovantes somente quando financeiro estiver integrado; dados da própria conta.
- CLI-10: solicitação de serviço adicional gera oportunidade no CRM com origem e responsável.
- CLI-11: satisfação pós-atendimento e periódica, plano de ação e risco de renovação baseado em fatos.
- CLI-12: renovação e comunicação contratual com registro, sem bloquear indiscriminadamente o portal por inadimplência.
- CLI-13: modos convite, solicitação com aprovação e autocadastro configuráveis; vínculo verificado no servidor em todos. Autocadastro nunca libera contratos sozinho.
- CLI-14: segurança da conta com MFA opcional, gestão de sessões e troca de e-mail concluída; fluxos ligados ao backend real.
- CLI-15: reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com RH.

Aceite: duas empresas com usuários e contratos diferentes; nenhuma consulta, busca, anexos, exportação, notificação ou cache cruza escopos. Restrição de contrato deve se refletir em documentos relacionados e no portal.

## 14. Financeiro e gestão de resultados — FIN

- FIN-01: contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, valor e situação.
- FIN-02: contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos.
- FIN-03: geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas.
- FIN-04: pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa.
- FIN-05: conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações.
- FIN-06: cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação.
- FIN-07: fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis.
- FIN-08: custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado.
- FIN-09: resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompleta.
- FIN-10: despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida.
- FIN-11: integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo.
- FIN-12: boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes.
- FIN-13: orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado.
- FIN-14: exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do contador.
- FIN-15: fechamento de competência e reabertura autorizada; preservar versões de relatório.
- FIN-16: comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente.

Aceite: contrato → título único → recebimento parcial → conciliação → saldo correto → estorno rastreado → relatório consistente. Valores não usam ponto flutuante impreciso; operação repetida não duplica recebimento.

## 15. Estoque, patrimônio, compras e manutenção — AST

- AST-01: produtos/SKU, fornecedores, unidade de medida, custo, local e estoque mínimo.
- AST-02: entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movimentos consistentes.
- AST-03: reserva para proposta/implantação sem confundir reserva com saída; liberação em cancelamento.
- AST-04: equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manutenção e termo de guarda.
- AST-05: entrega/devolução, avaria/perda, fotos pertinentes e conferência.
- AST-06: requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar.
- AST-07: inventário físico, divergências e ajuste aprovado.
- AST-08: ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, peças e execução.
- AST-09: evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao que for aprovado.
- AST-10: manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por ativo.
- AST-11: dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; senhas de equipamentos fora do cadastro/log comum.
- AST-12: materiais de limpeza com consumo por local, reposição e comparação ao previsto.

Aceite: venda de instalação → reserva → saída para OS → execução → aceite → ativo vinculado ao cliente → garantia/manutenção; cancelamento libera reserva e não gera saldo negativo indevido.

## 16. Marcelo, aprovações e indicadores — ADM

- ADM-01: painel “Meu dia” com pendências reais, prioridade, responsável e ação.
- ADM-02: visão comercial com leads novos, oportunidades paradas, propostas e próximas ações.
- ADM-03: visão operacional com cobertura, ocorrências críticas, SLA e implantação.
- ADM-04: visão financeira com fonte/competência, saldo, vencimentos e margem por contrato.
- ADM-05: contratos próximos de renovar, reclamações reincidentes e risco de perda justificado.
- ADM-06: aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por valor/escopo.
- ADM-07: busca autorizada, favoritos, filtros salvos e atalhos com contexto.
- ADM-08: relatórios exportáveis e agendados para destinatários autorizados; registrar geração/envio e limitar dados.
- ADM-09: configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e preferências.
- ADM-10: metas e cenários com comparação prevista/realizada, sem confundir estimativa com resultado.
- ADM-11: trilha e diário de decisões CON-11 acessíveis conforme permissão.
- ADM-12: análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos reais.

Dicionário mínimo de indicadores:
- Conversão: oportunidades ganhas / oportunidades encerradas no período, com definição explícita de coorte.
- Cobertura: horas cobertas / horas requeridas do escopo; ausência de dados não vira 100%.
- SLA: atendimentos dentro da meta / elegíveis, com calendário e pausas definidos.
- Margem: (receita reconhecida para o relatório - custos definidos) / receita; receita zero retorna “não aplicável”.
- Inadimplência: saldo vencido na data de referência, sem misturar recebíveis futuros.
- Rotatividade/absenteísmo: fórmula validada com RH e população/período informados.
- Previsão comercial: cenários ou probabilidade configurada; não somar como receita realizada.

Aceite de usabilidade: Marcelo cria oportunidade e encontra próxima ação, aprova desconto, consulta contrato e identifica origem de um indicador sem manipular IDs; Andreia admite colaborador e resolve pendência; funcionário consulta próximo plantão pelo celular. Registrar passos, dificuldades e correções em homologação com usuários ou representante autorizado.

## 17. TI, notificações, privacidade e continuidade — PLT

- PLT-01: diretório de usuários, papéis, escopos, convites, suspensão/revogação e revisão periódica de acesso.
- PLT-02: auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e exportação auditada.
- PLT-03: integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão.
- PLT-04: fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento.
- PLT-05: notificações no painel, e-mail e canais externos configurados, preferências e templates revisados; nenhuma informação médica em assunto/push.
- PLT-06: observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas acionáveis, sem segredos.
- PLT-07: healthcheck/liveness/readiness, degradação explícita de dependências e painel operacional restrito.
- PLT-08: backup de banco e documentos, criptografia, acesso, retenção e restauração testada em ambiente isolado.
- PLT-09: política de privacidade completa, inventário de dados/finalidades, bases aplicáveis, destinatários, prazos, contatos e direitos; revisão competente antes de publicar.
- PLT-10: pedidos de acesso/correção/eliminação com verificação de identidade, responsável, prazo e impedimentos legais documentados.
- PLT-11: retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal e histórico minimizado.
- PLT-12: resposta a incidente com responsáveis, contenção, evidências, análise e comunicação conforme avaliação aplicável.
- PLT-13: gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de infraestrutura.
- PLT-14: revisão de dependências, lockfile, vulnerabilidades, atualizações e CI.
- PLT-15: importação/exportação, logs de integração, limites, webhooks autenticados, retries e reconciliação.
- PLT-16: orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraestrutura.
- PLT-17: isolamento de desenvolvimento/homologação/produção com contas e dados próprios; previews sem dados reais.
- PLT-18: documentação para manutenção por outro programador, configuração, migração, diagnóstico e recuperação.

Decisões históricas a reconciliar: logs/alertas de segurança com 12 meses, notificações de permissão com expiração, exceções aprovadas, canais de lembrete e políticas de sessão. Implementar conforme decisão válida registrada, não aplicar “12 meses” indistintamente a folha, documentos médicos, geolocalização e contratos. Proposta antiga de retenção geográfica não vale como aprovação.

Consulta técnica privilegiada a dados reais requer justificativa e auditoria; privilégios de plataforma não devem tornar todo conteúdo visível no painel TI. Imagens de CFTV podem conter dados pessoais; não classificar toda imagem automaticamente como dado sensível nem autorizar seu uso em IA por padrão.

## 18. Expansões condicionais — EXT

Todos os itens abaixo devem existir no controle, com condição de entrada e critérios próprios. Não criar menus ativos vazios para eles. “Condicional” não significa esquecido: só vira dispensado por decisão explícita registrada.

| ID | Capacidade | Implementação e condição de entrada | Evidência de aceite |
|---|---|---|---|
| EXT-01 | Frota | Veículo, responsável, abastecimento, manutenção, documentos e custo; se frota própria existir | Histórico/custo por veículo e alerta de manutenção |
| EXT-02 | Terceiros | Cadastro, contrato, documentos, vencimentos, acesso temporário e avaliação | Terceiro acessa só OS/contrato autorizado e perde acesso ao término |
| EXT-03 | Licitações | Edital, prazos, documentos, responsáveis, proposta e resultado; se mercado relevante | Checklist e alerta por edital, dossiê versionado |
| EXT-04 | Portal fornecedores | Cotações/documentos/pedidos com escopo próprio; se volume justificar | Fornecedor não vê concorrente nem dados de RH |
| EXT-05 | Qualidade | Não conformidade, causa, ação corretiva, verificação e reincidência | Encerrar apenas com evidência e responsável |
| EXT-06 | Satisfação/carteira | Pesquisas, CSAT/NPS quando adequado, histórico e tarefa de recuperação | Resposta gera acompanhamento sem expor funcionário |
| EXT-07 | Compliance corporativo | Licenças/certidões/seguros e obrigações aplicáveis com responsável e validade | Vencimento gera tarefa e documento privado |
| EXT-08 | Base de conhecimento | Procedimentos versionados, busca, acesso e ciência | Usuário encontra apenas conteúdo de seu escopo |
| EXT-09 | Expansão/unidades | Planejamento de filial/contrato, capacidade e cenários financeiros | Premissas e fonte visíveis, sem projeção vendida como certeza |
| EXT-10 | Continuidade operacional | Contingência por posto/cliente, contatos, exercícios e recuperação | Simulado documentado com responsáveis |
| EXT-11 | Analytics/A-B | Hipótese, variantes aprovadas, métrica e privacidade | Experimento reversível, resultado sem dados inventados |
| EXT-12 | Editor visual avançado | Tokens/layouts versionados, preview e publicação | Permissão real, recarga consistente e rollback |
| EXT-13 | Relatório periódico | Consolidação de métricas e envio autorizado | Totais rastreáveis e destinatários corretos |
| EXT-14 | Inteligência comercial | Indicações, reativação e recomendações baseadas em histórico | Sugestão explicada; humano aprova contato |
| EXT-15 | Apoio emergencial | Canal, destinatário, disponibilidade e escalonamento definidos | Teste de recebimento/atendimento antes de disponibilizar |
| EXT-16 | Central/vídeo | Projeto separado para eventos de monitoramento, vídeo e disponibilidade | Escopo, fornecedor, custos e privacidade aprovados antes da ativação |
| EXT-17 | Biometria/reconhecimento | Projeto separado, necessidade e avaliação de impacto/base aplicável | Não implementar coleta por padrão; decisão e validação específicas |

## 19. IA e automações — AI

Implementar depois das permissões e da qualidade dos dados, usando provedores selecionados pelo proprietário. Cada tarefa deve ter limite de custo, dados permitidos, revisão humana e opção de desligar.

- AI-01: FAQ pública com respostas aprovadas e transferência humana; informar limites, não inventar serviços/credenciais.
- AI-02: resumo de histórico comercial autorizado, com links para registros de origem.
- AI-03: rascunho de proposta a partir de catálogo e versão de custos aprovados; sem alterar preço/escopo ou enviar sozinho.
- AI-04: classificação e sugestão de resposta a chamados, submetida a revisão.
- AI-05: extração de campos de documentos em ambiente privado, revisão humana e descarte de artefatos conforme política.
- AI-06: busca interna/RAG filtrada por permissão antes de recuperar conteúdo; isolar índices/consultas quando necessário.
- AI-07: relatório gerencial com cálculos feitos por código/consulta validada; IA narra, não inventa totais.
- AI-08: inconsistências cadastrais e próximas ações sugeridas, com justificativa e fonte.
- AI-09: curadoria da base, versão, publicação, feedback, avaliação, custo/token e rollback.
- AI-10: automações determinísticas de vencimentos, distribuição de tarefas e cobrança interna antes de agentes autônomos.

Documentos recuperados são dados não confiáveis: não executar instruções encontradas neles nem permitir que alterem permissões ou ferramentas. Testar prompt injection, exfiltração entre clientes, ausência de informação, falha do provedor, custo excedido e cancelamento. Não enviar saúde, biometria, vídeo ou segredos para modelo sem escopo e tratamento aprovados.

Aceite: resposta indica fontes autorizadas; usuário sem permissão não obtém conteúdo nem por resumo; proposta gerada permanece rascunho; indisponibilidade de IA não derruba CRM/RH.

## 20. Decisões pendentes, parâmetros e defaults

Criar/atualizar docs/DECISOES-IMPLEMENTACAO.md durante F0. Cada decisão: ID, pergunta, responsável, opções, impacto, prazo, status, resposta e evidência. Não inserir e-mail, salário, CPF ou dados reais no documento público.

| Decisão | Responsável de negócio | Caminho provisório |
|---|---|---|
| Volume de funcionários/clientes/postos/unidades | Marcelo/Andreia | Dados sintéticos e limites ajustáveis, sem prometer capacidade |
| Atividades e licenças efetivas | Marcelo/responsável competente | Publicar só catálogo validado |
| Funções de Andreia, supervisão e financeiro | Marcelo/Andreia | Papéis separados; atribuição explícita |
| Folha, ponto, SST, contabilidade existentes | Andreia/contador | Adaptadores/exportação; sem motor legal inventado |
| Escalas, convenções, descanso e adicionais | RH/assessoria competente | Regras pendentes bloqueiam automatização oficial |
| Tabela de custos/preços, impostos e alçadas | Marcelo/contador | Orçamento em rascunho até parâmetros aprovados |
| Dados de saúde, geolocalização e retenção | Responsável por privacidade/RH | Minimização e recurso opcional desativado |
| Canais SMTP/WhatsApp/agenda/assinatura | Marcelo/TI | Sandbox ou indisponível; nenhuma simulação de entrega |
| Responsáveis por alertas/emergências | Operação/Marcelo | Nenhum botão de emergência sem atendimento |
| Hospedagem, RPO/RTO e suporte | Marcelo/TI | Homologação isolada e plano de custos |
| CNPJ, contatos, marca e política | Marcelo | Pendência explícita, sem informação inventada |
| Integração fiscal/cobrança/pagamento | Financeiro/contador | Sem emissão/cobrança real |
| Frota, licitação, terceiros, vídeo e biometria | Marcelo | Backlog condicional, sem recurso ativo fictício |

O planejamento anterior menciona teto de R$ 200/mês para hospedagem, não para todo o ecossistema. Reconfirmar validade e dimensionar banco, backups, armazenamento, mensagens, suporte e integrações separadamente. Não escolher automaticamente serviço pago nem prometer atender todos os módulos dentro desse valor.

Perguntas essenciais devem ser agrupadas e feitas quando bloquearem trabalho concreto. Falta de provedor não impede construir domínio, interface, adaptador e testes de contrato; integração externa continua marcada pendente até sandbox real/configuração.

## 21. Fases, dependências e gates

| Fase | Escopo | Dependência | Gate de saída |
|---|---|---|---|
| F0 | Inventário SEC-01, baseline, decisões, matriz e backlog | Repositório e ambiente | Estado real documentado, tarefas rastreáveis e testes classificados |
| F1 | SEC-02 a SEC-15; PLT básico de auditoria/configuração/ambientes | F0 | Escopo, identidade e migrações testados em HTTP/DB reais |
| F2 | Modelo central, permissões, navegação, documentos e tarefas/notificações comuns | F1 | Perfis sintéticos executam apenas ações autorizadas; domínios consistentes |
| F3 | PUB essencial e CRM completo por sublotes | F2 | Lead → proposta → contrato demonstrável com persistência e aprovação |
| F4 | CON e implantação, unidades/postos e ligação com RH/estoque | F3 + modelo F2 | Checklist de implantação cria responsabilidades sem duplicidade |
| F5 | HR + EMP, integração DP/ponto e capacitação | F2 + estrutura F4 | Jornada admissão → alocação → solicitação → desligamento validada |
| F6 | OPS, AST e CLI ampliado | F4/F5 conforme submódulo | Plantão/ocorrência/OS/relatório e acesso cliente testados |
| F7 | FIN e ADM consolidados | Contratos, custos e operação suficientes | Títulos, recebimentos e resultado reconciliáveis |
| F8 | PLT completo, publicação de conteúdo e preparação de produção | F1–F7 | Segurança, restauração, suporte e homologação de usuários |
| F9 | EXT, AI e recursos avançados PUB/CRM | Dados confiáveis + decisões | Aceites específicos e custo/benefício registrado |

Fases são dependências lógicas, não obrigação de concluir um módulo gigante numa única sessão. Dividir em lotes pequenos. Segurança, testes, backup e documentação começam cedo; F8 consolida. Se a dor prioritária for RH/operação, reordenar F3/F5 com justificativa e sem violar F1/F2. Condicionais não bloqueiam liberação do núcleo quando formalmente fora da versão liberada.

Primeiro lote recomendado: F0 + reprodução/correção SEC-02/03 no escopo viável, testes de negação e correção de alegações documentais. Não implementar CRM e RH em paralelo sobre autorização quebrada.

## 22. Protocolo de orquestração e continuidade

O agente coordenador deve:
1. Identificar repositório, branch, commit, alterações locais e diferenças com a base. Não presumir que main ainda coincide com a referência deste documento.
2. Ler instruções e controle. Não repetir trabalho marcado verificado sem motivo; revisar evidência e compatibilidade.
3. Converter cada ID do catálogo em tarefas verificáveis, preservando relação pai/filho. IDs SEC/PUB/CRM/CON/EMP/HR/OPS/CLI/FIN/AST/ADM/PLT/EXT/AI não podem sumir.
4. Escolher um lote compatível com dependências e capacidade da sessão; declarar objetivo, testes e arquivos afetados.
5. Implementar dados → serviço/API → autorização → interface → integração → testes → documentação.
6. Revisar diff e executar verificações pertinentes. Separar falha pré-existente, introduzida, bloqueio de ambiente e teste não executado.
7. Registrar checkpoint antes de encerrar/contexto esgotado. Incluir último commit, arquivos alterados, migrações, testes exatos, bloqueios e próxima ação concreta.
8. Criar commit/PR conforme autorização e fluxo do repositório, sem merge automático. Não misturar funcionalidades sem relação nem interferir em outra branch do Arena.
9. Continuar no próximo lote autorizado; não encerrar todo o projeto após apenas planejar ou criar placeholders.
10. Ao atingir bloqueio externo, avançar em itens independentes. Não marcar tarefa bloqueada como concluída.

O usuário solicitou orquestração. Se a plataforma permitir agentes paralelos, usá-los apenas para subtarefas independentes, com propriedade de arquivos definida: backend/migração, frontend, testes/revisão. Um coordenador integra. Não dar o mesmo arquivo ou migração a dois agentes. Testes compartilhados com banco usam isolamento por execução. Sem suporte multiagente, executar o mesmo protocolo sequencialmente. Nunca alegar delegação não realizada.

Arquivos de continuidade:
- docs/CONTROLE-IMPLEMENTACAO.md: registro principal de tarefas, estados, gates e próxima execução.
- docs/DECISOES-IMPLEMENTACAO.md: decisões e perguntas, criado pelo agente em F0.
- docs/evidencias/: relatórios sanitizados por lote com commit, comando, resultado e limites.
- README.md: entrada atual, instalação, status verificado e links. Preservar histórico útil, corrigir afirmações enganosas.
- docs/proximo-passo.md: resumo compatível com o controle, sem criar autoridade concorrente.

Estados: não iniciado; em análise; em implementação; implementado não verificado; verificado; bloqueado; condicional; dispensado por decisão. “Verificado” exige evidência; “dispensado” exige decisão explícita, não conveniência do agente. Homologação do usuário/produção é registrada separadamente.

## 23. Plano de testes e definição de pronto

### 23.1 Ambiente e níveis
Não instalar automaticamente a última versão de tudo. Reproduzir a instalação pelo lockfile, verificar suporte do Node e corrigir scripts portáveis quando necessário. A sintaxe de variável inline dos scripts atuais pode não funcionar em PowerShell; documentar/corrigir sem vazar segredos.

Separar:
- Unitário: validadores, políticas, cálculo e transições relevantes.
- Integração: servidor HTTP real + PostgreSQL descartável, migrações reais, armazenamento privado temporário, captura de e-mail.
- E2E: navegador nos fluxos completos, sessão real e verificação de persistência após recarga.
- Contrato de integração: sandbox do fornecedor, assinatura de webhook e idempotência.
- Homologação: usuários/representantes executam tarefas; feedback registrado.

Mocks não substituem integração de autorização. Testes não devem enviar e-mail real, cobrar, alterar produção ou depender de porta fixa compartilhada. Limpeza segura em finally; impedir uso acidental de banco real. Falta de ambiente deve ser relatada, não convertida em “passou”.

### 23.2 Casos críticos obrigatórios
- Sessão ausente, expirada, revogada, usuário suspenso e papel alterado.
- Cliente A/B, unidade irmã, contrato não permitido, documento direto e exportação.
- Erro de DB/consulta de permissão sem abertura de acesso.
- MFA ausente/errado/expirado/replay/recovery reutilizado.
- Troca de e-mail concorrente e senha incorreta.
- Convite usado, revogado, expirado e recuperação genérica.
- Migrações em banco vazio, upgrade com dados sintéticos e reinício do runner.
- Lead recebido com SMTP fora, retry e duplicidade.
- Desconto acima da alçada e proposta alterada após aprovação.
- Aceite repetido sem duplicar contrato/implantação.
- Alocação incompatível, conflito de escala e ausência.
- Documento de funcionário inacessível por colega, supervisor ou cliente sem permissão.
- Sincronização offline repetida, relógio incorreto e conflito.
- Pagamento parcial, estorno, competência e precisão monetária.
- Upload inválido, arquivo excessivo, nome/path malicioso e download sem grant.
- Webhook falso/repetido/fora de ordem; job falho com recuperação.
- Busca, relatório, notificação, cache e RAG respeitando escopo.
- Backup restaurado com banco e documento íntegros.

### 23.3 Gate de cada lote
Código revisado; testes relevantes passaram; typecheck/build quando afetados; migração e reversão operacional definidas; navegação verificada em desktop e celular quando houver UI; dados persistem; autorização negativa testada; logs sanitizados; documentação e controle atualizados; nenhum botão promete efeito inexistente.

Não exigir testes artificiais para edição puramente documental. Não ampliar testes indefinidamente depois de validação suficiente, salvo nova falha ou risco.

### 23.4 Metas não funcionais
Antes de prometer capacidade, medir volume e acordar metas. Como ponto inicial de homologação, testar telas usuais em 360/390 px e desktop, teclado/foco/leitor, busca paginada, concorrência de escrita e rede lenta. Propor meta p95 de API e carga somente com dataset/cenário registrados. Nenhum “rápido/escalável” sem medição.

## 24. Implantação em homologação e produção

### 24.1 Preparar o ambiente
- Inventariar runtime Node, PostgreSQL, processo web, worker/agendador, arquivos privados e SMTP.
- Escolher hospedagem compatível com servidor Node customizado, jobs, storage durável e acesso ao DB; não assumir que exportação estática ou hospedagem padrão suporta tudo.
- Separar secrets/configuração por ambiente; .env.example contém somente nomes e valores fictícios.
- CI para instalação, testes, typecheck e build; integração isolada para DB e artefatos privados.
- Criar ambiente de homologação sem dados reais e configurar domínio próprio desse ambiente.
- Definir TLS, domínio público final, proxies confiáveis, cookies e base URL corretos.
- Definir banco com usuário de runtime restrito e usuário de migração separado quando possível.
- Definir armazenamento privado, cópia de segurança, ciclo de vida e limites.
- Definir scheduler/worker e responsabilidade por acompanhar falhas.
- Criar contas reais somente pelo fluxo seguro e entrega manual/autorizada de convite; sem senha padrão.

### 24.2 Plano de migração de dados e release
1. Levantar dados existentes e mapear campos, identificadores, duplicatas e escopos.
2. Executar importação em dry-run com relatório por linha e validação de totais.
3. Testar upgrade em cópia sintética/anonimizada autorizada.
4. Preparar backup e comprovar restauração antes de mudança crítica.
5. Usar migrações expansivas/compatíveis; adiar remoções destrutivas para outra release.
6. Definir janela e responsável; executar produção apenas após autorização.
7. Validar migração, smoke tests, acessos e jobs.
8. Monitorar erros, latência e filas; interromper rollout em falha relevante.
9. Reverter aplicação quando schema permitir; preferir correção progressiva para dados. Restauração de backup não é “desfazer” automático e pode perder dados posteriores.
10. Registrar versão, scripts aplicados, resultado, decisão de seguir/reverter e responsáveis.

### 24.3 Gate de produção
- Nenhuma falha crítica de autenticação/escopo pendente.
- Contas/permissões reais validadas; MFA privilegiado efetivo.
- SMTP e integrações habilitadas testados em seus ambientes corretos.
- Política de privacidade, contatos, conteúdo, preço e requisitos aplicáveis aprovados por responsáveis.
- Backup/restauração comprovados; RPO/RTO definidos e aceitos, não inventados pelo agente.
- Monitoramento, alertas, manutenção e suporte com responsáveis.
- Homologação de Marcelo, Andreia, funcionário e cliente representativo.
- Recursos não prontos desligados com mensagens honestas.
- Plano de reversão e custo operacional apresentado.
- Autorização explícita de publicação/execução em produção.

Manter limites claros: não criar provedor pago, alterar DNS, migrar dados reais, enviar campanhas, emitir nota ou movimentar dinheiro somente porque o código está pronto.

## 25. Rastreabilidade, conclusão e primeira ação

O arquivo CONTROLE-IMPLEMENTACAO.md contém todos os IDs deste documento, inicialmente sem alegação de execução. Em F0, conferir contagem e mapear cada item a tarefas menores, requisitos de decisão e evidências. Alterações de escopo devem preservar histórico.

Relatório de cada lote:
- Capacidade entregue e necessidade atendida.
- IDs tratados, commit/branch e caminhos principais.
- Testes executados com resultado e evidência.
- O que não foi testado e por quê.
- Migrações/configurações necessárias.
- Riscos e dependências ainda existentes.
- Próximo lote com ação concreta.

Concluir o núcleo somente com os gates F0–F8 aplicáveis e homologação registrada. Concluir escopo ampliado somente quando F9 estiver verificada ou itens condicionais tiverem decisão explícita. Não usar percentual subjetivo de “sistema pronto”.

Primeira ação do agente: ler o repositório atual, registrar baseline e divergências, executar os testes possíveis em ambiente isolado e iniciar o primeiro lote de correções de segurança. Não iniciar com redesign nem com centenas de telas vazias.

## 26. Referências e validação regulatória

Referências usadas como orientação na auditoria, não como parecer jurídico ou promessa de conformidade. Antes de implementar regras reguladas, consultar versão vigente e responsável competente:
- Ponto eletrônico/MTE: https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/fiscalizacao-do-trabalho/Perguntas%20e%20Respostas%20REP
- eSocial/SST: https://www.gov.br/esocial/pt-br/empresas/manual-web-geral
- Segurança privada/PF: https://www.gov.br/pf/pt-br/assuntos/seguranca-privada/legislacao/leis-decreto-portarias-ins/leis/
- Segurança da informação/ANPD: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes
- Referência funcional de CRM: https://ajuda.rdstation.com/s/article/Introdu%C3%A7%C3%A3o-ao-RD-Station-CRM?language=pt_BR

Não presumir que todas as funções são vigilantes, que a empresa possui autorização não comprovada, que toda imagem é dado sensível ou que uma mesma retenção serve para todos os dados. Regras de jornada, folha, tributos e emissão fiscal são parametrizadas e revisadas por responsáveis.

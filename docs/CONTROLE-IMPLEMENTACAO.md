# Controle de implementação — SEG System
Versão inicial: 28/09/2026.

Este arquivo foi criado junto ao plano mestre. Nenhum item foi implementado ou homologado pela criação desta documentação. Referência remota inicial: 49d366cd9335ca33fe9703a397dc0488b6468ef8. O agente deve atualizar o estado com base no commit atual e em evidências, preservando o histórico.

## Documentos
- [Plano mestre](PLANO-MESTRE-IMPLEMENTACAO.md)
- [Prompt de execução e retomada](PROMPT-MASTER-ARENA.md)

## Checkpoint atual
- Fase: preparação documental; F0 ainda não executada pelo agente implementador.
- Branch documental: docs/plano-mestre-implementacao-2026-09-28.
- Código/banco/configuração: não alterados por esta entrega.
- Validação disponível: auditoria anterior executou 46 testes isolados; não equivale à homologação.
- Próxima ação: verificar repositório/branch/commit, ler plano inteiro, reproduzir baseline e iniciar SEC-01 e primeiro lote F1.
- Bloqueios de negócio: levantar no registro de decisões em F0.
- Produção: não liberada por este documento.

## Regras do controle
Estados permitidos: não iniciado; em análise; em implementação; implementado não verificado; verificado; bloqueado; condicional; dispensado por decisão.
“Verificado” exige evidência e commit. “Dispensado” exige decisão explícita. Conservar todos os IDs e adicionar tarefas filhas quando necessário.
Fases nesta tabela são orientativas; prevalecem dependências e gates do plano. Recursos condicionais aguardam confirmação de necessidade/configuração, sem telas de sucesso fictício.

## Registro de requisitos (222 IDs)
| ID | Fase | Requisito resumido | Estado | Evidência/commit/decisão |
|---|---|---|---|---|
| SEC-01 | F0/F1 | Inventariar rotas, APIs, tabelas, jobs, permissões e documentação no commit atual | não iniciado | — |
| SEC-02 | F0/F1 | Corrigir verificações de escopo para negar por padrão em qualquer erro | não iniciado | — |
| SEC-03 | F0/F1 | Associar documentos a conta/unidade/contrato/classificação e aplicar autorização uniforme | não iniciado | — |
| SEC-04 | F0/F1 | Login individual de staff, papéis, convites e revogação | não iniciado | — |
| SEC-05 | F0/F1 | Substituir tokens compartilhados por autenticação individual com migração controlada | não iniciado | — |
| SEC-06 | F0/F1 | MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit | não iniciado | — |
| SEC-07 | F0/F1 | Corrigir troca de e-mail e handlers HTTP | não iniciado | — |
| SEC-08 | F0/F1 | Migrações rastreadas e executáveis | não iniciado | — |
| SEC-09 | F0/F1 | Reparar suíte e testar APIs reais | não iniciado | — |
| SEC-10 | F0/F1 | Consolidar orçamento/simulador e catálogo | não iniciado | — |
| SEC-11 | F0/F1 | Separar prévias e recursos reais | não iniciado | — |
| SEC-12 | F0/F1 | Privacidade e declarações de aprovação verificáveis | não iniciado | — |
| SEC-13 | F0/F1 | Segurança de sessão, CSRF, origem e erros | não iniciado | — |
| SEC-14 | F0/F1 | Auditoria durável e operacional | não iniciado | — |
| SEC-15 | F0/F1 | Proteção de abuso e identidade | não iniciado | — |
| PUB-01 | F3/F8/F9 | catálogo único dos seis serviços validados no projeto; cada item tem descrição, público, perguntas de qualificação e flag de publicação. Cerca elétrica ou novos serviços entram somente após validação comercial. | não iniciado | — |
| PUB-02 | F3/F8/F9 | páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados; revisão de acessibilidade, navegação e desempenho. | não iniciado | — |
| PUB-03 | F3/F8/F9 | orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada e responsável de atendimento. | não iniciado | — |
| PUB-04 | F3/F8/F9 | visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real. | não iniciado | — |
| PUB-05 | F3/F8/F9 | FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada e controles do capítulo 19. | não iniciado | — |
| PUB-06 | F3/F8/F9 | CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão. | não iniciado | — |
| PUB-07 | F3/F8/F9 | temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global. Implementar após núcleo. | não iniciado | — |
| PUB-08 | F3/F8/F9 | SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos. | não iniciado | — |
| PUB-09 | F3/F8/F9 | montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produção. | não iniciado | — |
| PUB-10 | F3/F8/F9 | mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos. | não iniciado | — |
| CRM-01 | F3 | cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distinguir prospect/cliente/parceiro sem duplicar entidade. | não iniciado | — |
| CRM-02 | F3 | contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem legítima, sem coleta indiscriminada. | não iniciado | — |
| CRM-03 | F3 | importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação. | não iniciado | — |
| CRM-04 | F3 | converter lead do site em contato/oportunidade preservando histórico; tratar duplicidade e contato sem empresa. | não iniciado | — |
| CRM-05 | F3 | oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda. | não iniciado | — |
| CRM-06 | F3 | funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para perda; reabertura auditada. Não tratar “ganho” como dinheiro recebido. | não iniciado | — |
| CRM-07 | F3 | kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas. | não iniciado | — |
| CRM-08 | F3 | agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento. Links/calendário externo somente por integração configurada. | não iniciado | — |
| CRM-09 | F3 | cadências de prospecção inicialmente como tarefas; automação de mensagens depende de autorização, opt-out quando aplicável e provedor. | não iniciado | — |
| CRM-10 | F3 | carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem próxima ação e relacionamentos por grupo/unidade. | não iniciado | — |
| CRM-11 | F3 | separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato quando praticados. Campos: unidade de cobrança, escopo, exclusões, recursos, custo, preço, vigência e aprovação. | não iniciado | — |
| CRM-12 | F3 | equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico. | não iniciado | — |
| CRM-13 | F3 | vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico. | não iniciado | — |
| CRM-14 | F3 | orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, benefícios, provisões, substituição, supervisão, uniforme/EPI, deslocamento, materiais e indiretos. | não iniciado | — |
| CRM-15 | F3 | orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção. | não iniciado | — |
| CRM-16 | F3 | parâmetros de tributos/custos/jornada versionados com validade, fonte e aprovador; nenhuma alíquota ou regra coletiva inventada. Impedir preço oficial se faltar parâmetro essencial. | não iniciado | — |
| CRM-17 | F3 | cenários de preço e margem, separando margem de markup. Para tributos proporcionais à receita e margem sobre receita, uma simulação pode usar preço = custo / (1 - taxa - margem), somente sob premissas explícitas, denominador válido e aprovação contábil. Não impor essa fórmula a todos os regimes. | não iniciado | — |
| CRM-18 | F3 | alçadas de desconto e exceções; motivo, solicitante, aprovador e versão. Alteração de itens/custos após aprovação reabre a aprovação. | não iniciado | — |
| CRM-19 | F3 | proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões, prazo, reajuste previsto, validade e condições; PDF gerado a partir da mesma versão persistida. | não iniciado | — |
| CRM-20 | F3 | estados rascunho → revisão → aprovada para envio → enviada → aceita/recusada/expirada/substituída; preservar versões enviadas. | não iniciado | — |
| CRM-21 | F3 | envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integração. | não iniciado | — |
| CRM-22 | F3 | aceite por link seguro, expirável e vinculado à versão, se adotado; decisão jurídica sobre valor do aceite registrada. Não chamar clique simples de assinatura qualificada. | não iniciado | — |
| CRM-23 | F3 | proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento. | não iniciado | — |
| CRM-24 | F3 | relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário. Previsão ponderada é estimativa identificada. | não iniciado | — |
| CRM-25 | F3 | metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento automático. | não iniciado | — |
| CRM-26 | F3 | biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas. | não iniciado | — |
| CRM-27 | F3 | parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas. | não iniciado | — |
| CON-01 | F4 | contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada. | não iniciado | — |
| CON-02 | F4 | itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma. | não iniciado | — |
| CON-03 | F4 | estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura com ativação operacional. | não iniciado | — |
| CON-04 | F4 | aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada. | não iniciado | — |
| CON-05 | F4 | alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM. | não iniciado | — |
| CON-06 | F4 | obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante. | não iniciado | — |
| CON-07 | F4 | implantação com checklist: contrato, data de início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções, faturamento e convite do cliente. | não iniciado | — |
| CON-08 | F4 | bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox. | não iniciado | — |
| CON-09 | F4 | encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico. | não iniciado | — |
| CON-10 | F4 | dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade. | não iniciado | — |
| CON-11 | F4 | diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres. | não iniciado | — |
| EMP-01 | F5 | perfil próprio e solicitação de atualização cadastral; dados restritos mascarados conforme necessidade e mudança revisada. | não iniciado | — |
| EMP-02 | F5 | próximo plantão com local, horário, função, contato do supervisor, orientações e itens necessários. | não iniciado | — |
| EMP-03 | F5 | calendário de escala, folgas, alterações e ciência da versão publicada; usuário não modifica unilateralmente a escala. | não iniciado | — |
| EMP-04 | F5 | jornada individual, comprovantes/importação de provedor, divergências e pedido de correção; preservar registro original. | não iniciado | — |
| EMP-05 | F5 | aviso de ausência/atraso com protocolo, motivo limitado, responsável e acompanhamento; aciona fluxo de cobertura. | não iniciado | — |
| EMP-06 | F5 | troca de plantão com solicitação, aceite do outro profissional quando aplicável, validações e aprovação operacional. | não iniciado | — |
| EMP-07 | F5 | passagem de serviço com pendências, chaves, equipamentos, ocorrências e aceite; não expor dados desnecessários de terceiros. | não iniciado | — |
| EMP-08 | F5 | ocorrência com categoria, descrição, horário, local e anexo pertinente; restrição para informações pessoais. | não iniciado | — |
| EMP-09 | F5 | procedimentos do posto versionados, ciência e contatos de apoio. | não iniciado | — |
| EMP-10 | F5 | envio de documentos solicitados, status pendente/em análise/aprovado/rejeitado com motivo e nova versão. | não iniciado | — |
| EMP-11 | F5 | holerites/informes/documentos próprios, acesso privado e histórico de disponibilização; publicação proveniente de fonte autorizada. | não iniciado | — |
| EMP-12 | F5 | férias, afastamentos, benefícios e reembolsos com solicitação, anexos restritos, aprovação e prazo de resposta. | não iniciado | — |
| EMP-13 | F5 | uniformes/EPI/equipamentos com entrega, recibo, solicitação de troca e devolução. | não iniciado | — |
| EMP-14 | F5 | cursos e reciclagens, comprovantes e alertas de vencimento. | não iniciado | — |
| EMP-15 | F5 | comunicados direcionados, confirmação de leitura e central de notificações. | não iniciado | — |
| EMP-16 | F5 | atendimento RH com protocolo, categoria, mensagens privadas e acompanhamento. | não iniciado | — |
| EMP-17 | F5 | canal confidencial separado, com responsáveis e política de acesso; anonimato somente se efetivamente suportado. | não iniciado | — |
| EMP-18 | F5 | PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotência, conflito explícito, horário do dispositivo e recebimento no servidor separados. Não cachear documentos médicos/salariais por padrão. | não iniciado | — |
| EMP-19 | F5 | FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de dados. | não iniciado | — |
| HR-01 | F5 | cadastro profissional separado de identidade de login; matrícula, vínculo, cargo, empregador/filial, gestor, admissão, status, contatos necessários e histórico. | não iniciado | — |
| HR-02 | F5 | histórico de cargo, lotação, remuneração autorizada e vínculo com datas de efeito; acesso por campo/categoria. | não iniciado | — |
| HR-03 | F5 | recrutamento com vaga, requisitos pertinentes, candidatos, triagem, entrevista, decisão e comunicação; retenção e acesso próprios para currículo. | não iniciado | — |
| HR-04 | F5 | banco de talentos e autorização/base aplicável; descarte configurado, sem acúmulo indefinido. | não iniciado | — |
| HR-05 | F5 | admissão com checklist por função, documentos, validação, exame/treinamento e integração; não exigir dado sem finalidade. | não iniciado | — |
| HR-06 | F5 | dossiê com tipos, versões, validade, pendências e aprovador. CNV e demais documentos apenas para funções/atividades aplicáveis, após confirmação. | não iniciado | — |
| HR-07 | F5 | desligamento com checklist, devolução, revogação, documentação e pendências; histórico laboral preservado. | não iniciado | — |
| HR-08 | F5 | mudança de status (afastado/suspenso/desligado) com efeito em permissões e alocação conforme política, sem automatizar sanção trabalhista. | não iniciado | — |
| HR-09 | F5 | férias com períodos aquisitivo/concessivo quando aplicáveis, saldo importado/validado, programação, conflito de cobertura e aprovação. | não iniciado | — |
| HR-10 | F5 | afastamentos com período, retorno, documentação restrita e substituição; supervisor vê indisponibilidade/aptidão operacional necessária, não diagnóstico. | não iniciado | — |
| HR-11 | F5 | integração de ponto, justificativas, divergências, workflow de correção e fechamento de competência; trilha de reabertura. | não iniciado | — |
| HR-12 | F5 | banco de horas, adicionais e horas extras somente com regras versionadas e validadas para o vínculo/convenção; não fixar 12x36/6x1 como regra universal. | não iniciado | — |
| HR-13 | F5 | benefícios com elegibilidade, solicitações, conferência, alterações por período e exportação ao fornecedor. | não iniciado | — |
| HR-14 | F5 | adiantamentos/reembolsos com alçada e comprovantes, integração com financeiro e prevenção de duplicidade. | não iniciado | — |
| HR-15 | F5 | saúde ocupacional com agenda, vencimentos e documentos necessários; acesso restrito. Não replicar prontuário médico completo no cadastro comum. | não iniciado | — |
| HR-16 | F5 | integração/exportação para contabilidade/SST, recibos de processamento, erros e correção. Não declarar envio eSocial sem protocolo válido do responsável/provedor. | não iniciado | — |
| HR-17 | F5 | treinamento por cargo/atividade, obrigatoriedade aplicável, validade, inscrição, presença e comprovante. | não iniciado | — |
| HR-18 | F5 | matriz de competências integrada à alocação, sem decisão automática de contratação/punição. | não iniciado | — |
| HR-19 | F5 | uniformes/EPI com entrega, recibo, substituição, validade/controle aplicável e devolução. | não iniciado | — |
| HR-20 | F5 | fechamento DP com faltas, férias, variáveis e documentos conferidos; exportação versionada e acesso do contador limitado. | não iniciado | — |
| HR-21 | F5 | holerites/informes importados de fonte autorizada, vinculação inequívoca ao colaborador, revisão antes de publicar e correção rastreada. | não iniciado | — |
| HR-22 | F5 | avaliações e planos de desenvolvimento com critérios definidos, acesso privado e participação humana; feedback de cliente não vira punição automática. | não iniciado | — |
| HR-23 | F5 | atendimento interno com fila, responsável, categoria, prazo e mensagens; anexos de saúde fora de tickets genéricos. | não iniciado | — |
| HR-24 | F5 | indicadores de quadro, admissão, faltas, rotatividade, férias, documentos e atendimento, com fórmula e período explícitos. | não iniciado | — |
| OPS-01 | F6 | estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação; cargo/função em entidade própria. | não iniciado | — |
| OPS-02 | F6 | dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado. | não iniciado | — |
| OPS-03 | F6 | escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência. | não iniciado | — |
| OPS-04 | F6 | validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas. | não iniciado | — |
| OPS-05 | F6 | ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação. | não iniciado | — |
| OPS-06 | F6 | passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite. | não iniciado | — |
| OPS-07 | F6 | livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação. | não iniciado | — |
| OPS-08 | F6 | checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais. | não iniciado | — |
| OPS-09 | F6 | visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação. | não iniciado | — |
| OPS-10 | F6 | rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/QR isolado não prova execução. | não iniciado | — |
| OPS-11 | F6 | chaves, rádios, materiais e equipamentos com guarda/transferência/devolução. | não iniciado | — |
| OPS-12 | F6 | relatórios periódicos ao cliente com revisão de conteúdo e privacidade. | não iniciado | — |
| OPS-13 | F6 | métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela. | não iniciado | — |
| OPS-14 | F6 | escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar. | não iniciado | — |
| OPS-15 | F6 | supervisão de limpeza com rotinas por ambiente, consumo e não conformidades. | não iniciado | — |
| OPS-16 | F6 | eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto específico. | não iniciado | — |
| CLI-01 | F6 | identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identificadas/redirecionadas com cuidado. | não iniciado | — |
| CLI-02 | F6 | múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo cliente apenas se autorizada, sem ampliação fora do próprio escopo. | não iniciado | — |
| CLI-03 | F6 | contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico interno não publicado automaticamente. | não iniciado | — |
| CLI-04 | F6 | documentos com categoria/validade/versão, busca e download privado; autorização testada em todos os caminhos. | não iniciado | — |
| CLI-05 | F6 | chamados com protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e histórico. | não iniciado | — |
| CLI-06 | F6 | estados aberto/em atendimento/aguardando cliente/resolvido/encerrado, reabertura e motivo; pausas de SLA explicitamente definidas. | não iniciado | — |
| CLI-07 | F6 | agenda de visita/manutenção, confirmação, reagendamento e histórico. | não iniciado | — |
| CLI-08 | F6 | relatórios de execução e medição/aceite de serviço com revisão. | não iniciado | — |
| CLI-09 | F6 | cobranças/documentos fiscais/comprovantes somente quando financeiro estiver integrado; dados da própria conta. | não iniciado | — |
| CLI-10 | F6 | solicitação de serviço adicional gera oportunidade no CRM com origem e responsável. | não iniciado | — |
| CLI-11 | F6 | satisfação pós-atendimento e periódica, plano de ação e risco de renovação baseado em fatos. | não iniciado | — |
| CLI-12 | F6 | renovação e comunicação contratual com registro, sem bloquear indiscriminadamente o portal por inadimplência. | não iniciado | — |
| CLI-13 | F6 | modos convite, solicitação com aprovação e autocadastro configuráveis; vínculo verificado no servidor em todos. Autocadastro nunca libera contratos sozinho. | não iniciado | — |
| CLI-14 | F6 | segurança da conta com MFA opcional, gestão de sessões e troca de e-mail concluída; fluxos ligados ao backend real. | não iniciado | — |
| CLI-15 | F6 | reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com RH. | não iniciado | — |
| FIN-01 | F7 | contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, valor e situação. | não iniciado | — |
| FIN-02 | F7 | contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos. | não iniciado | — |
| FIN-03 | F7 | geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas. | não iniciado | — |
| FIN-04 | F7 | pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa. | não iniciado | — |
| FIN-05 | F7 | conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações. | não iniciado | — |
| FIN-06 | F7 | cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação. | não iniciado | — |
| FIN-07 | F7 | fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis. | não iniciado | — |
| FIN-08 | F7 | custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado. | não iniciado | — |
| FIN-09 | F7 | resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompleta. | não iniciado | — |
| FIN-10 | F7 | despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida. | não iniciado | — |
| FIN-11 | F7 | integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo. | não iniciado | — |
| FIN-12 | F7 | boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes. | não iniciado | — |
| FIN-13 | F7 | orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado. | não iniciado | — |
| FIN-14 | F7 | exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do contador. | não iniciado | — |
| FIN-15 | F7 | fechamento de competência e reabertura autorizada; preservar versões de relatório. | não iniciado | — |
| FIN-16 | F7 | comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente. | não iniciado | — |
| AST-01 | F6 | produtos/SKU, fornecedores, unidade de medida, custo, local e estoque mínimo. | não iniciado | — |
| AST-02 | F6 | entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movimentos consistentes. | não iniciado | — |
| AST-03 | F6 | reserva para proposta/implantação sem confundir reserva com saída; liberação em cancelamento. | não iniciado | — |
| AST-04 | F6 | equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manutenção e termo de guarda. | não iniciado | — |
| AST-05 | F6 | entrega/devolução, avaria/perda, fotos pertinentes e conferência. | não iniciado | — |
| AST-06 | F6 | requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar. | não iniciado | — |
| AST-07 | F6 | inventário físico, divergências e ajuste aprovado. | não iniciado | — |
| AST-08 | F6 | ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, peças e execução. | não iniciado | — |
| AST-09 | F6 | evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao que for aprovado. | não iniciado | — |
| AST-10 | F6 | manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por ativo. | não iniciado | — |
| AST-11 | F6 | dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; senhas de equipamentos fora do cadastro/log comum. | não iniciado | — |
| AST-12 | F6 | materiais de limpeza com consumo por local, reposição e comparação ao previsto. | não iniciado | — |
| ADM-01 | F7 | painel “Meu dia” com pendências reais, prioridade, responsável e ação. | não iniciado | — |
| ADM-02 | F7 | visão comercial com leads novos, oportunidades paradas, propostas e próximas ações. | não iniciado | — |
| ADM-03 | F7 | visão operacional com cobertura, ocorrências críticas, SLA e implantação. | não iniciado | — |
| ADM-04 | F7 | visão financeira com fonte/competência, saldo, vencimentos e margem por contrato. | não iniciado | — |
| ADM-05 | F7 | contratos próximos de renovar, reclamações reincidentes e risco de perda justificado. | não iniciado | — |
| ADM-06 | F7 | aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por valor/escopo. | não iniciado | — |
| ADM-07 | F7 | busca autorizada, favoritos, filtros salvos e atalhos com contexto. | não iniciado | — |
| ADM-08 | F7 | relatórios exportáveis e agendados para destinatários autorizados; registrar geração/envio e limitar dados. | não iniciado | — |
| ADM-09 | F7 | configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e preferências. | não iniciado | — |
| ADM-10 | F7 | metas e cenários com comparação prevista/realizada, sem confundir estimativa com resultado. | não iniciado | — |
| ADM-11 | F7 | trilha e diário de decisões CON-11 acessíveis conforme permissão. | não iniciado | — |
| ADM-12 | F7 | análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos reais. | não iniciado | — |
| PLT-01 | F1/F2/F8 | diretório de usuários, papéis, escopos, convites, suspensão/revogação e revisão periódica de acesso. | não iniciado | — |
| PLT-02 | F1/F2/F8 | auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e exportação auditada. | não iniciado | — |
| PLT-03 | F1/F2/F8 | integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão. | não iniciado | — |
| PLT-04 | F1/F2/F8 | fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento. | não iniciado | — |
| PLT-05 | F1/F2/F8 | notificações no painel, e-mail e canais externos configurados, preferências e templates revisados; nenhuma informação médica em assunto/push. | não iniciado | — |
| PLT-06 | F1/F2/F8 | observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas acionáveis, sem segredos. | não iniciado | — |
| PLT-07 | F1/F2/F8 | healthcheck/liveness/readiness, degradação explícita de dependências e painel operacional restrito. | não iniciado | — |
| PLT-08 | F1/F2/F8 | backup de banco e documentos, criptografia, acesso, retenção e restauração testada em ambiente isolado. | não iniciado | — |
| PLT-09 | F1/F2/F8 | política de privacidade completa, inventário de dados/finalidades, bases aplicáveis, destinatários, prazos, contatos e direitos; revisão competente antes de publicar. | não iniciado | — |
| PLT-10 | F1/F2/F8 | pedidos de acesso/correção/eliminação com verificação de identidade, responsável, prazo e impedimentos legais documentados. | não iniciado | — |
| PLT-11 | F1/F2/F8 | retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal e histórico minimizado. | não iniciado | — |
| PLT-12 | F1/F2/F8 | resposta a incidente com responsáveis, contenção, evidências, análise e comunicação conforme avaliação aplicável. | não iniciado | — |
| PLT-13 | F1/F2/F8 | gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de infraestrutura. | não iniciado | — |
| PLT-14 | F1/F2/F8 | revisão de dependências, lockfile, vulnerabilidades, atualizações e CI. | não iniciado | — |
| PLT-15 | F1/F2/F8 | importação/exportação, logs de integração, limites, webhooks autenticados, retries e reconciliação. | não iniciado | — |
| PLT-16 | F1/F2/F8 | orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraestrutura. | não iniciado | — |
| PLT-17 | F1/F2/F8 | isolamento de desenvolvimento/homologação/produção com contas e dados próprios; previews sem dados reais. | não iniciado | — |
| PLT-18 | F1/F2/F8 | documentação para manutenção por outro programador, configuração, migração, diagnóstico e recuperação. | não iniciado | — |
| EXT-01 | F9 | Frota | condicional | — |
| EXT-02 | F9 | Terceiros | condicional | — |
| EXT-03 | F9 | Licitações | condicional | — |
| EXT-04 | F9 | Portal fornecedores | condicional | — |
| EXT-05 | F9 | Qualidade | condicional | — |
| EXT-06 | F9 | Satisfação/carteira | condicional | — |
| EXT-07 | F9 | Compliance corporativo | condicional | — |
| EXT-08 | F9 | Base de conhecimento | condicional | — |
| EXT-09 | F9 | Expansão/unidades | condicional | — |
| EXT-10 | F9 | Continuidade operacional | condicional | — |
| EXT-11 | F9 | Analytics/A-B | condicional | — |
| EXT-12 | F9 | Editor visual avançado | condicional | — |
| EXT-13 | F9 | Relatório periódico | condicional | — |
| EXT-14 | F9 | Inteligência comercial | condicional | — |
| EXT-15 | F9 | Apoio emergencial | condicional | — |
| EXT-16 | F9 | Central/vídeo | condicional | — |
| EXT-17 | F9 | Biometria/reconhecimento | condicional | — |
| AI-01 | F9 | FAQ pública com respostas aprovadas e transferência humana; informar limites, não inventar serviços/credenciais. | condicional | — |
| AI-02 | F9 | resumo de histórico comercial autorizado, com links para registros de origem. | condicional | — |
| AI-03 | F9 | rascunho de proposta a partir de catálogo e versão de custos aprovados; sem alterar preço/escopo ou enviar sozinho. | condicional | — |
| AI-04 | F9 | classificação e sugestão de resposta a chamados, submetida a revisão. | condicional | — |
| AI-05 | F9 | extração de campos de documentos em ambiente privado, revisão humana e descarte de artefatos conforme política. | condicional | — |
| AI-06 | F9 | busca interna/RAG filtrada por permissão antes de recuperar conteúdo; isolar índices/consultas quando necessário. | condicional | — |
| AI-07 | F9 | relatório gerencial com cálculos feitos por código/consulta validada; IA narra, não inventa totais. | condicional | — |
| AI-08 | F9 | inconsistências cadastrais e próximas ações sugeridas, com justificativa e fonte. | condicional | — |
| AI-09 | F9 | curadoria da base, versão, publicação, feedback, avaliação, custo/token e rollback. | condicional | — |
| AI-10 | F9 | automações determinísticas de vencimentos, distribuição de tarefas e cobrança interna antes de agentes autônomos. | condicional | — |

## Gates de fase
| Fase | Estado | Evidência | Pendências |
|---|---|---|---|
| F0 Inventário | Não iniciado | — | Baseline, decisões, matriz e backlog |
| F1 Correções | Não iniciado | — | Segurança, autenticação e migrações |
| F2 Fundação | Não iniciado | — | Cadastros, escopos e navegação |
| F3 Comercial | Não iniciado | — | Lead até proposta/contrato |
| F4 Contratos | Não iniciado | — | Implantação e obrigações |
| F5 Pessoas | Não iniciado | — | RH, funcionário e integrações |
| F6 Operação | Não iniciado | — | Postos, OS, ativos e portal |
| F7 Gestão | Não iniciado | — | Financeiro e Marcelo |
| F8 Homologação | Não iniciado | — | Continuidade e liberação |
| F9 Expansões | Condicional | — | Decisões e aceites específicos |

## Modelo de checkpoint para próximas execuções
Copiar e preencher ao final de cada lote; manter os anteriores em ordem cronológica.
- Data/hora:
- Repositório / branch / commit inicial e final:
- Objetivo e IDs:
- Arquivos/rotas afetados:
- Migrações e plano de atualização:
- Implementação efetiva:
- Testes executados (comandos, ambiente, resultado):
- Evidências sanitizadas:
- Não testado / motivo:
- Decisões necessárias:
- Bloqueios e trabalho independente possível:
- Estado dos IDs após lote:
- Próxima ação exata:
- PR, se existente:
- Homologação de usuários / produção: pendente ou evidência verificável.

## Histórico
- 28/09/2026: catálogo documental inicial gerado a partir do plano; nenhum requisito funcional marcado como concluído.

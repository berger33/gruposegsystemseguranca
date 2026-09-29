# Relatório consolidado de pendências — 222 requisitos / QA até Onda 21

Data: 2026-09-28. Fonte de verdade de estados: [controle de implementação](CONTROLE-IMPLEMENTACAO.md); este relatório **não altera automaticamente** os estados históricos nem considera um teste parcial homologação de módulo. [Relatório de testes](RELATORIO-CONSOLIDADO-TESTES.md) e [gate de produção](PRODUCAO-GATE.md). O sistema pode ser baixado para **prévia local sintética**, mas **NO-GO para produção, dados reais e backup operacional**. Não há quantidade fixa de ondas restantes: o trabalho depende de decisão humana, infraestrutura, provedores, UAT e riscos aceitos.

**Atualização de escopo posterior à fotografia abaixo:** o proprietário determinou que a meta da entrega local inclui **todos os 222 IDs**, inclusive `AI-02`, `AI-03`, `AI-04`, `AI-05`, `AI-07` e `AI-08`, que aparecem historicamente como “condicional dispensado”. Esses seis estão **reabertos para entrega/aceite**, não concluídos nem dispensados nesta meta. Apenas SMTP e hospedagem externa foram adiados. Divergências e dependências externas devem ser reportadas por ID com opções; consultar [avaliação da entrega local](AVALIACAO-ENTREGA-LOCAL-COMPLETA.md). O quadro e os estados linha a linha abaixo permanecem como **fotografia histórica**, não estado de aceite atualizado.

## Inventário objetivo do controle

| Estado registrado | Quantidade | Interpretação necessária |
|---|---:|---|
| Implementado não verificado | 201 | Código/SQL/UI descritos no controle, mas sem validação ponta a ponta suficiente; não equivalem a aceite. |
| Em implementação | 5 | Fluxo incompleto no controle; conferir no commit antes de marcar pronto. |
| Condicional dispensado | 6 | Decisão provisória, não atendimento; confirmar se aplicável com dono. |
| Verificado | 10 | Evidência histórica pontual, **não** prova de release/global; retestar após alterações. |
| **Total de IDs únicos** | **222** | Casos QA adicionais e subtarefas não se tornam novos requisitos automaticamente. |

A tabela final enumera **cada um dos 222 IDs** sem inventar porcentagem de conclusão. Comentários extensos de evidência e limites individuais estão no [controle](CONTROLE-IMPLEMENTACAO.md). A fotografia do controle é uma declaração histórica: resultados observados são separados das hipóteses.

## Bloqueadores imediatos (P0; não publicar)

1. **Identidade, isolamento e RBAC.** Concluir MFA, desativação controlada de tokens compartilhados, matriz staff/cliente/RH/TI, revogação transversal, autorização por conta/unidade/contrato em todos os handlers e downloads; retestar HTTP em PostgreSQL com A/B, cookie inadequado, papel não autorizado, falha de consulta e trilhas de auditoria. Os ensaios CLI v2 negaram acessos em rotas amostradas, mas a rota de arquivo CLI v2 para cliente não foi homologada; testes não tornam os 201 itens `implementado não verificado` verificados.
2. **Backup/restore (`PLT-BAK-001`, `PLT-DEF-022`, `PLT-DEF-024`).** Descobrir onde estão **todos** os bytes privados das 12 famílias levantadas, garantir contrato de versão/chave/conta/hash e inventário integral; implementar armazenamento externo isolado/imutável, criptografia, KMS/custódia e âncora de assinatura durável; coordenar DB+FS sob concorrência, WAL/PITR e GC que preserve pontos ainda recuperáveis; homologar RPO/RTO em restore de ambiente **autorizado**. No QA atual, a API de backup/restore é intencionalmente **503** e catálogo histórico não é prova de artefato; houve órfão após rollback. Sem mecanismo operacional, não chamar de backup completo.
3. **Dados pessoais e obrigações legais.** Bases legais/finalidades, minimização, acesso a dados sensíveis, política de retenção/exclusão, incidentes, termos de privacidade; CLT, convenções, Portaria 671/2021, eSocial e regras fiscais exigem parecer de contador/advogado e fornecedores homologados, não regras inferidas de teste sintético. Nenhum dado real em QA local; revisão de RH/DP/fiscal/monitoramento e aprovação de Marcelo/TI/jurídico conforme aplicável.
4. **Gate de release.** CI remoto realmente aprovado, segredos próprios por ambiente, SAST/dependências, hardening, testes E2E de funções críticas, acessibilidade e compatibilidade, UAT por perfis, staging segregado com autorização, rollback/deploy, monitoramento/alertas, orçamento e aceitação formal. Build 66/66 páginas significa que compila, **não** que elas funcionem ou estejam homologadas. Proibido transformar a prévia ZIP em produção.

## Frentes restantes e dependências

| Frente | Evidência existente / lacuna | Próximo critério observável / responsável |
|---|---|---|
| Público, leads, conteúdo, SEO, consentimento | UI/rotas/migrações e testes unitários/alguns HTTP; conteúdo e links públicos podem ser demonstrativos. | Jornadas reais controladas ponta a ponta, revisão jurídica/marketing, formulários/SMTP capturado, acessibilidade e SEO somente após autorização. |
| SaaS/cliente e contratos | Migrações e fluxos A/B sintéticos; escopo amostrado; documento legado HTTP coberto parcialmente. | Matriz de acesso completa, ciclo de conta/filial/posto, download v2 com bytes sob custódia e auditoria; reteste de revogação/IDOR para cada recurso. |
| RH/colaborador/ponto/portaria/operação | Tabelas/handlers/telas registrados como implementados não verificados; ausência de dispositivo/regra homologada. | UAT por papel, hardware e regras trabalhistas com jurídico/contador; escala, intervalos, antifraude, ocorrências, evidência/privacidade. |
| CRM, contratos comerciais e financeiro | Muitas migrações/handlers/UI, pouco aceite integrado em cadeia; sem cobrança/nota real homologada. | Simular somente massa fictícia; validar idempotência, integridade financeira e conciliação com contador/provedor antes de pagamentos reais. |
| Monitoramento, ativos, frota, terceiros | Módulos descritos; sem prova de sensores, vídeo ou despacho operacional. | Contratos de integração, negações/falhas, observabilidade e ensaios seguros em staging, sem alarmes reais. |
| RAG/IA/automação | Segurança de escopo ensaiada no recorte; bot/índice/modes beta, Ollama opcional e fallback; sem homologação humana ampla. | Revisão de fontes autorizadas, guardrails, custo/token, avaliação de qualidade e UAT perfis cliente/RH/Marcelo/público; não confundir fallback com IA real. |
| Plataforma/segurança/operação | 96 migrações em base nova PG QA, negativos e regressões locais; backup apenas sintético. | Upgrade em clone autorizado, CI estável, monitoramento, segredos/KMS, teste de recuperação real medido, procedimentos de incidente e política aprovada. |
| Experiência e release | Prévia QA local empacotada, não publicação. | Testes em dispositivos/navegadores/WCAG, instruções de instalação reproduzíveis fora do sandbox, assinatura de artefato/versão e aceite de produto. |

## Autorização, riscos e ordem sugerida

- **Primeiro:** escolher responsável pelo inventário de bytes/arquivos e declarar onde o CLI v2 realmente grava; a partir disso decidir protocolo de publicação imutável, preservação de versões e política PITR. Definir dono e prazo por defeito `PLT-DEF-022/024`. Reconciliar termos/segurança e o gate antigo, alguns textos históricos são anteriores às últimas ondas.
- **Depois:** contratar/provisionar serviço de armazenamento/assinatura somente com aprovação explícita; ensaiar restores completos e métricas em ambiente separado autorizado. SQL de grants do helper QA não é handler produtivo.
- **Em paralelo, com equipes/ambientes independentes:** regressão funcional transversal de cada módulo e matrizes A/B/RBAC; parecer fiscal/trabalhista; homologação humana RAG; testes UX/WCAG/CI/observabilidade.
- **Antes de qualquer GO:** Marcelo e TI validam evidências de segurança, privacidade, retenção e recuperação; revisar orçamento/SLA/regras e dar autorização separada de implantação. `CONTINUAR` autoriza só o próximo lote QA, não deploy.

## Relação integral dos requisitos (estado do controle, não conclusão verificada nesta sessão)

| ID | Fase | Título resumido (origem: controle) | Estado registrado |
|---|---|---|---|
| `SEC-01` | F0/F1 | Inventariar rotas, APIs, tabelas, jobs, permissões e documentação no commit atual | verificado |
| `SEC-02` | F0/F1 | Corrigir verificações de escopo para negar por padrão em qualquer erro | verificado |
| `SEC-03` | F0/F1 | Associar documentos a conta/unidade/contrato/classificação e aplicar autorização uniforme | implementado não verificado |
| `SEC-04` | F0/F1 | Login individual de staff, papéis, convites e revogação | em implementação |
| `SEC-05` | F0/F1 | Substituir tokens compartilhados por autenticação individual com migração controlada | em implementação |
| `SEC-06` | F0/F1 | MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit | implementado não verificado |
| `SEC-07` | F0/F1 | Corrigir troca de e-mail e handlers HTTP | implementado não verificado |
| `SEC-08` | F0/F1 | Migrações rastreadas e executáveis | verificado |
| `SEC-09` | F0/F1 | Reparar suíte e testar APIs reais | verificado |
| `SEC-10` | F0/F1 | Consolidar orçamento/simulador e catálogo | verificado |
| `SEC-11` | F0/F1 | Separar prévias e recursos reais | verificado |
| `SEC-12` | F0/F1 | Privacidade e declarações de aprovação verificáveis | verificado |
| `SEC-13` | F0/F1 | Segurança de sessão, CSRF, origem e erros | em implementação |
| `SEC-14` | F0/F1 | Auditoria durável e operacional | em implementação |
| `SEC-15` | F0/F1 | Proteção de abuso e identidade | em implementação |
| `PUB-01` | F3/F8/F9 | catálogo único dos seis serviços validados no projeto; cada item tem descrição, público, perguntas de qualificação e flag de publicação. Cerca elét… | verificado |
| `PUB-02` | F3/F8/F9 | páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados; revisão de acessibilidade, navegação e desempenho. | implementado não verificado |
| `PUB-03` | F3/F8/F9 | orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada… | verificado |
| `PUB-04` | F3/F8/F9 | visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem r… | verificado |
| `PUB-05` | F3/F8/F9 | FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada e controles do capítulo… | implementado não verificado |
| `PUB-06` | F3/F8/F9 | CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão. | implementado não verificado |
| `PUB-07` | F3/F8/F9 | temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global. Implementar após… | implementado não verificado |
| `PUB-08` | F3/F8/F9 | SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos. | implementado não verificado |
| `PUB-09` | F3/F8/F9 | montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produ… | implementado não verificado |
| `PUB-10` | F3/F8/F9 | mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos. | implementado não verificado |
| `CRM-01` | F3 | cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distingui… | implementado não verificado |
| `CRM-02` | F3 | contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem le… | implementado não verificado |
| `CRM-03` | F3 | importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação. | implementado não verificado |
| `CRM-04` | F3 | converter lead do site em contato/oportunidade preservando histórico; tratar duplicidade e contato sem empresa. | implementado não verificado |
| `CRM-05` | F3 | oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda. | implementado não verificado |
| `CRM-06` | F3 | funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para p… | implementado não verificado |
| `CRM-07` | F3 | kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas. | implementado não verificado |
| `CRM-08` | F3 | agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento. Links/calendário externo somente por integraçã… | implementado não verificado |
| `CRM-09` | F3 | cadências de prospecção inicialmente como tarefas; automação de mensagens depende de autorização, opt-out quando aplicável e provedor. | implementado não verificado |
| `CRM-10` | F3 | carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem próxima ação e relacionamentos por grupo/unidade. | implementado não verificado |
| `CRM-11` | F3 | separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato quando praticados. Campos: unidade de cobrança, escopo, exclu… | implementado não verificado |
| `CRM-12` | F3 | equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico. | implementado não verificado |
| `CRM-13` | F3 | vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico. | implementado não verificado |
| `CRM-14` | F3 | orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, benefícios, provisões, substituição, supervisão, uniforme/EPI,… | implementado não verificado |
| `CRM-15` | F3 | orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção. | implementado não verificado |
| `CRM-16` | F3 | parâmetros de tributos/custos/jornada versionados com validade, fonte e aprovador; nenhuma alíquota ou regra coletiva inventada. Impedir preço ofic… | implementado não verificado |
| `CRM-17` | F3 | cenários de preço e margem, separando margem de markup. Para tributos proporcionais à receita e margem sobre receita, uma simulação pode usar preço… | implementado não verificado |
| `CRM-18` | F3 | alçadas de desconto e exceções; motivo, solicitante, aprovador e versão. Alteração de itens/custos após aprovação reabre a aprovação. | implementado não verificado |
| `CRM-19` | F3 | proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões, prazo, reajuste previsto, validade e condições; PDF gerado… | implementado não verificado |
| `CRM-20` | F3 | estados rascunho → revisão → aprovada para envio → enviada → aceita/recusada/expirada/substituída; preservar versões enviadas. | implementado não verificado |
| `CRM-21` | F3 | envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integra… | implementado não verificado |
| `CRM-22` | F3 | aceite por link seguro, expirável e vinculado à versão, se adotado; decisão jurídica sobre valor do aceite registrada. Não chamar clique simples de… | implementado não verificado |
| `CRM-23` | F3 | proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento. | implementado não verificado |
| `CRM-24` | F3 | relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário. Previsão ponderada… | implementado não verificado |
| `CRM-25` | F3 | metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento autom… | implementado não verificado |
| `CRM-26` | F3 | biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas. | implementado não verificado |
| `CRM-27` | F3 | parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas. | implementado não verificado |
| `CON-01` | F4 | contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem… | implementado não verificado |
| `CON-02` | F4 | itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma. | implementado não verificado |
| `CON-03` | F4 | estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura… | implementado não verificado |
| `CON-04` | F4 | aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada. | implementado não verificado |
| `CON-05` | F4 | alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM. | implementado não verificado |
| `CON-06` | F4 | obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante. | implementado não verificado |
| `CON-07` | F4 | implantação com checklist: contrato, data de início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções,… | implementado não verificado |
| `CON-08` | F4 | bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exig… | implementado não verificado |
| `CON-09` | F4 | encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico. | implementado não verificado |
| `CON-10` | F4 | dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade. | implementado não verificado |
| `CON-11` | F4 | diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres. | implementado não verificado |
| `EMP-01` | F5 | perfil próprio e solicitação de atualização cadastral; dados restritos mascarados conforme necessidade e mudança revisada. | implementado não verificado |
| `EMP-02` | F5 | próximo plantão com local, horário, função, contato do supervisor, orientações e itens necessários. | implementado não verificado |
| `EMP-03` | F5 | calendário de escala, folgas, alterações e ciência da versão publicada; usuário não modifica unilateralmente a escala. | implementado não verificado |
| `EMP-04` | F5 | jornada individual, comprovantes/importação de provedor, divergências e pedido de correção; preservar registro original. | implementado não verificado |
| `EMP-05` | F5 | aviso de ausência/atraso com protocolo, motivo limitado, responsável e acompanhamento; aciona fluxo de cobertura. | implementado não verificado |
| `EMP-06` | F5 | troca de plantão com solicitação, aceite do outro profissional quando aplicável, validações e aprovação operacional. | implementado não verificado |
| `EMP-07` | F5 | passagem de serviço com pendências, chaves, equipamentos, ocorrências e aceite; não expor dados desnecessários de terceiros. | implementado não verificado |
| `EMP-08` | F5 | ocorrência com categoria, descrição, horário, local e anexo pertinente; restrição para informações pessoais. | implementado não verificado |
| `EMP-09` | F5 | procedimentos do posto versionados, ciência e contatos de apoio. | implementado não verificado |
| `EMP-10` | F5 | envio de documentos solicitados, status pendente/em análise/aprovado/rejeitado com motivo e nova versão. | implementado não verificado |
| `EMP-11` | F5 | holerites/informes/documentos próprios, acesso privado e histórico de disponibilização; publicação proveniente de fonte autorizada. | implementado não verificado |
| `EMP-12` | F5 | férias, afastamentos, benefícios e reembolsos com solicitação, anexos restritos, aprovação e prazo de resposta. | implementado não verificado |
| `EMP-13` | F5 | uniformes/EPI/equipamentos com entrega, recibo, solicitação de troca e devolução. | implementado não verificado |
| `EMP-14` | F5 | cursos e reciclagens, comprovantes e alertas de vencimento. | implementado não verificado |
| `EMP-15` | F5 | comunicados direcionados, confirmação de leitura e central de notificações. | implementado não verificado |
| `EMP-16` | F5 | atendimento RH com protocolo, categoria, mensagens privadas e acompanhamento. | implementado não verificado |
| `EMP-17` | F5 | canal confidencial separado, com responsáveis e política de acesso; anonimato somente se efetivamente suportado. | implementado não verificado |
| `EMP-18` | F5 | PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotência, conflito explícito, horário do dispositivo e recebimento… | implementado não verificado |
| `EMP-19` | F5 | FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de dados. | implementado não verificado |
| `HR-01` | F5 | cadastro profissional separado de identidade de login; matrícula, vínculo, cargo, empregador/filial, gestor, admissão, status, contatos necessários… | implementado não verificado |
| `HR-02` | F5 | histórico de cargo, lotação, remuneração autorizada e vínculo com datas de efeito; acesso por campo/categoria. | implementado não verificado |
| `HR-03` | F5 | recrutamento com vaga, requisitos pertinentes, candidatos, triagem, entrevista, decisão e comunicação; retenção e acesso próprios para currículo. | implementado não verificado |
| `HR-04` | F5 | banco de talentos e autorização/base aplicável; descarte configurado, sem acúmulo indefinido. | implementado não verificado |
| `HR-05` | F5 | admissão com checklist por função, documentos, validação, exame/treinamento e integração; não exigir dado sem finalidade. | implementado não verificado |
| `HR-06` | F5 | dossiê com tipos, versões, validade, pendências e aprovador. CNV e demais documentos apenas para funções/atividades aplicáveis, após confirmação. | implementado não verificado |
| `HR-07` | F5 | desligamento com checklist, devolução, revogação, documentação e pendências; histórico laboral preservado. | implementado não verificado |
| `HR-08` | F5 | mudança de status (afastado/suspenso/desligado) com efeito em permissões e alocação conforme política, sem automatizar sanção trabalhista. | implementado não verificado |
| `HR-09` | F5 | férias com períodos aquisitivo/concessivo quando aplicáveis, saldo importado/validado, programação, conflito de cobertura e aprovação. | implementado não verificado |
| `HR-10` | F5 | afastamentos com período, retorno, documentação restrita e substituição; supervisor vê indisponibilidade/aptidão operacional necessária, não diagnó… | implementado não verificado |
| `HR-11` | F5 | integração de ponto, justificativas, divergências, workflow de correção e fechamento de competência; trilha de reabertura. | implementado não verificado |
| `HR-12` | F5 | banco de horas, adicionais e horas extras somente com regras versionadas e validadas para o vínculo/convenção; não fixar 12x36/6x1 como regra unive… | implementado não verificado |
| `HR-13` | F5 | benefícios com elegibilidade, solicitações, conferência, alterações por período e exportação ao fornecedor. | implementado não verificado |
| `HR-14` | F5 | adiantamentos/reembolsos com alçada e comprovantes, integração com financeiro e prevenção de duplicidade. | implementado não verificado |
| `HR-15` | F5 | saúde ocupacional com agenda, vencimentos e documentos necessários; acesso restrito. Não replicar prontuário médico completo no cadastro comum. | implementado não verificado |
| `HR-16` | F5 | integração/exportação para contabilidade/SST, recibos de processamento, erros e correção. Não declarar envio eSocial sem protocolo válido do respon… | implementado não verificado |
| `HR-17` | F5 | treinamento por cargo/atividade, obrigatoriedade aplicável, validade, inscrição, presença e comprovante. | implementado não verificado |
| `HR-18` | F5 | matriz de competências integrada à alocação, sem decisão automática de contratação/punição. | implementado não verificado |
| `HR-19` | F5 | uniformes/EPI com entrega, recibo, substituição, validade/controle aplicável e devolução. | implementado não verificado |
| `HR-20` | F5 | fechamento DP com faltas, férias, variáveis e documentos conferidos; exportação versionada e acesso do contador limitado. | implementado não verificado |
| `HR-21` | F5 | holerites/informes importados de fonte autorizada, vinculação inequívoca ao colaborador, revisão antes de publicar e correção rastreada. | implementado não verificado |
| `HR-22` | F5 | avaliações e planos de desenvolvimento com critérios definidos, acesso privado e participação humana; feedback de cliente não vira punição automática. | implementado não verificado |
| `HR-23` | F5 | atendimento interno com fila, responsável, categoria, prazo e mensagens; anexos de saúde fora de tickets genéricos. | implementado não verificado |
| `HR-24` | F5 | indicadores de quadro, admissão, faltas, rotatividade, férias, documentos e atendimento, com fórmula e período explícitos. | implementado não verificado |
| `OPS-01` | F6 | estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação; cargo/função em entidade própria. | implementado não verificado |
| `OPS-02` | F6 | dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado. | implementado não verificado |
| `OPS-03` | F6 | escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência. | implementado não verificado |
| `OPS-04` | F6 | validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas. | implementado não verificado |
| `OPS-05` | F6 | ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação. | implementado não verificado |
| `OPS-06` | F6 | passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite. | implementado não verificado |
| `OPS-07` | F6 | livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação. | implementado não verificado |
| `OPS-08` | F6 | checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais. | implementado não verificado |
| `OPS-09` | F6 | visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação. | implementado não verificado |
| `OPS-10` | F6 | rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/… | implementado não verificado |
| `OPS-11` | F6 | chaves, rádios, materiais e equipamentos com guarda/transferência/devolução. | implementado não verificado |
| `OPS-12` | F6 | relatórios periódicos ao cliente com revisão de conteúdo e privacidade. | implementado não verificado |
| `OPS-13` | F6 | métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela. | implementado não verificado |
| `OPS-14` | F6 | escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar. | implementado não verificado |
| `OPS-15` | F6 | supervisão de limpeza com rotinas por ambiente, consumo e não conformidades. | implementado não verificado |
| `OPS-16` | F6 | eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto… | implementado não verificado |
| `CLI-01` | F6 | identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identificadas/redirecionadas com cuidado. | implementado não verificado |
| `CLI-02` | F6 | múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo cliente apenas se autorizada, sem ampliação fora do próprio escopo. | implementado não verificado |
| `CLI-03` | F6 | contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico interno não publicado automaticamente. | implementado não verificado |
| `CLI-04` | F6 | documentos com categoria/validade/versão, busca e download privado; autorização testada em todos os caminhos. | implementado não verificado |
| `CLI-05` | F6 | chamados com protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e histórico. | implementado não verificado |
| `CLI-06` | F6 | estados aberto/em atendimento/aguardando cliente/resolvido/encerrado, reabertura e motivo; pausas de SLA explicitamente definidas. | implementado não verificado |
| `CLI-07` | F6 | agenda de visita/manutenção, confirmação, reagendamento e histórico. | implementado não verificado |
| `CLI-08` | F6 | relatórios de execução e medição/aceite de serviço com revisão. | implementado não verificado |
| `CLI-09` | F6 | cobranças/documentos fiscais/comprovantes somente quando financeiro estiver integrado; dados da própria conta. | implementado não verificado |
| `CLI-10` | F6 | solicitação de serviço adicional gera oportunidade no CRM com origem e responsável. | implementado não verificado |
| `CLI-11` | F6 | satisfação pós-atendimento e periódica, plano de ação e risco de renovação baseado em fatos. | implementado não verificado |
| `CLI-12` | F6 | renovação e comunicação contratual com registro, sem bloquear indiscriminadamente o portal por inadimplência. | implementado não verificado |
| `CLI-13` | F6 | modos convite, solicitação com aprovação e autocadastro configuráveis; vínculo verificado no servidor em todos. Autocadastro nunca libera contratos… | implementado não verificado |
| `CLI-14` | F6 | segurança da conta com MFA opcional, gestão de sessões e troca de e-mail concluída; fluxos ligados ao backend real. | implementado não verificado |
| `CLI-15` | F6 | reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com RH. | implementado não verificado |
| `FIN-01` | F7 | contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, valor e situação. | implementado não verificado |
| `FIN-02` | F7 | contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos. | implementado não verificado |
| `FIN-03` | F7 | geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas. | implementado não verificado |
| `FIN-04` | F7 | pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa. | implementado não verificado |
| `FIN-05` | F7 | conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações. | implementado não verificado |
| `FIN-06` | F7 | cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação. | implementado não verificado |
| `FIN-07` | F7 | fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis. | implementado não verificado |
| `FIN-08` | F7 | custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado. | implementado não verificado |
| `FIN-09` | F7 | resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompl… | implementado não verificado |
| `FIN-10` | F7 | despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida. | implementado não verificado |
| `FIN-11` | F7 | integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo. | implementado não verificado |
| `FIN-12` | F7 | boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes. | implementado não verificado |
| `FIN-13` | F7 | orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado. | implementado não verificado |
| `FIN-14` | F7 | exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do contador. | implementado não verificado |
| `FIN-15` | F7 | fechamento de competência e reabertura autorizada; preservar versões de relatório. | implementado não verificado |
| `FIN-16` | F7 | comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente. | implementado não verificado |
| `AST-01` | F6 | produtos/SKU, fornecedores, unidade de medida, custo, local e estoque mínimo. | implementado não verificado |
| `AST-02` | F6 | entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movimentos consistentes. | implementado não verificado |
| `AST-03` | F6 | reserva para proposta/implantação sem confundir reserva com saída; liberação em cancelamento. | implementado não verificado |
| `AST-04` | F6 | equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manutenção e termo de guarda. | implementado não verificado |
| `AST-05` | F6 | entrega/devolução, avaria/perda, fotos pertinentes e conferência. | implementado não verificado |
| `AST-06` | F6 | requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar. | implementado não verificado |
| `AST-07` | F6 | inventário físico, divergências e ajuste aprovado. | implementado não verificado |
| `AST-08` | F6 | ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, peças e execução. | implementado não verificado |
| `AST-09` | F6 | evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao que for aprovado. | implementado não verificado |
| `AST-10` | F6 | manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por ativo. | implementado não verificado |
| `AST-11` | F6 | dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; senhas de equipamentos fora do cadastro/log comum. | implementado não verificado |
| `AST-12` | F6 | materiais de limpeza com consumo por local, reposição e comparação ao previsto. | implementado não verificado |
| `ADM-01` | F7 | painel “Meu dia” com pendências reais, prioridade, responsável e ação. | implementado não verificado |
| `ADM-02` | F7 | visão comercial com leads novos, oportunidades paradas, propostas e próximas ações. | implementado não verificado |
| `ADM-03` | F7 | visão operacional com cobertura, ocorrências críticas, SLA e implantação. | implementado não verificado |
| `ADM-04` | F7 | visão financeira com fonte/competência, saldo, vencimentos e margem por contrato. | implementado não verificado |
| `ADM-05` | F7 | contratos próximos de renovar, reclamações reincidentes e risco de perda justificado. | implementado não verificado |
| `ADM-06` | F7 | aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por valor/escopo. | implementado não verificado |
| `ADM-07` | F7 | busca autorizada, favoritos, filtros salvos e atalhos com contexto. | implementado não verificado |
| `ADM-08` | F7 | relatórios exportáveis e agendados para destinatários autorizados; registrar geração/envio e limitar dados. | implementado não verificado |
| `ADM-09` | F7 | configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e preferências. | implementado não verificado |
| `ADM-10` | F7 | metas e cenários com comparação prevista/realizada, sem confundir estimativa com resultado. | implementado não verificado |
| `ADM-11` | F7 | trilha e diário de decisões CON-11 acessíveis conforme permissão. | implementado não verificado |
| `ADM-12` | F7 | análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos reais. | implementado não verificado |
| `PLT-01` | F1/F2/F8 | diretório de usuários, papéis, escopos, convites, suspensão/revogação e revisão periódica de acesso. | implementado não verificado |
| `PLT-02` | F1/F2/F8 | auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e exportação auditada. | implementado não verificado |
| `PLT-03` | F1/F2/F8 | integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão. | implementado não verificado |
| `PLT-04` | F1/F2/F8 | fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento. | implementado não verificado |
| `PLT-05` | F2/F5 | notificações no painel, e-mail e canais externos configurados, preferências e templates revisados; nenhuma informação médica em assunto/push. | implementado não verificado |
| `PLT-06` | F2/F5 | observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas acionáveis, sem segredos. | implementado não verificado |
| `PLT-07` | F2/F5 | healthcheck/liveness/readiness, degradação explícita de dependências e painel operacional restrito. | implementado não verificado |
| `PLT-08` | F2/F5 | backup de banco e documentos, criptografia, acesso, retenção e restauração testada em ambiente isolado. | implementado não verificado |
| `PLT-09` | F2/F5 | política de privacidade completa, inventário de dados/finalidades, bases aplicáveis, destinatários, prazos, contatos e direitos; revisão competente… | implementado não verificado |
| `PLT-10` | F2/F5 | pedidos de acesso/correção/eliminação com verificação de identidade, responsável, prazo e impedimentos legais documentados. | implementado não verificado |
| `PLT-11` | F1/F2/F8 | retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal e histórico minimizado. | implementado não verificado |
| `PLT-12` | F1/F2/F8 | resposta a incidente com responsáveis, contenção, evidências, análise e comunicação conforme avaliação aplicável. | implementado não verificado |
| `PLT-13` | F1/F2/F8 | gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de infraestrutura. | implementado não verificado |
| `PLT-14` | F1/F2/F8 | revisão de dependências, lockfile, vulnerabilidades, atualizações e CI. | implementado não verificado |
| `PLT-15` | F1/F2/F8 | importação/exportação, logs de integração, limites, webhooks autenticados, retries e reconciliação. | implementado não verificado |
| `PLT-16` | F1/F2/F8 | orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraestrutura. | implementado não verificado |
| `PLT-17` | F1/F2/F8 | isolamento de desenvolvimento/homologação/produção com contas e dados próprios; previews sem dados reais. | implementado não verificado |
| `PLT-18` | F1/F2/F8 | documentação para manutenção por outro programador, configuração, migração, diagnóstico e recuperação. | implementado não verificado |
| `EXT-01` | F9 | Frota | implementado não verificado |
| `EXT-02` | F9 | Terceiros | implementado não verificado |
| `EXT-03` | F9 | Licitações | implementado não verificado |
| `EXT-04` | F9 | Portal fornecedores | implementado não verificado |
| `EXT-05` | F9 | Qualidade | implementado não verificado |
| `EXT-06` | F9 | Satisfação/carteira | implementado não verificado |
| `EXT-07` | F9 | Compliance corporativo | implementado não verificado |
| `EXT-08` | F9 | Base de conhecimento | implementado não verificado |
| `EXT-09` | F9 | Expansão/unidades | implementado não verificado |
| `EXT-10` | F9 | Continuidade operacional | implementado não verificado |
| `EXT-11` | F9 | Analytics/A-B | implementado não verificado |
| `EXT-12` | F9 | Editor visual avançado | implementado não verificado |
| `EXT-13` | F9 | Relatório periódico | implementado não verificado |
| `EXT-14` | F9 | Inteligência comercial | implementado não verificado |
| `EXT-15` | F9 | Apoio emergencial | implementado não verificado |
| `EXT-16` | F9 | Central/vídeo | implementado não verificado |
| `EXT-17` | F9 | Biometria/reconhecimento | implementado não verificado |
| `AI-01` | F9 | FAQ pública com respostas aprovadas e transferência humana; informar limites, não inventar serviços/credenciais. | implementado não verificado |
| `AI-02` | F9 | resumo de histórico comercial autorizado, com links para registros de origem. | condicional dispensado |
| `AI-03` | F9 | rascunho de proposta a partir de catálogo e versão de custos aprovados; sem alterar preço/escopo ou enviar sozinho. | condicional dispensado |
| `AI-04` | F9 | classificação e sugestão de resposta a chamados, submetida a revisão. | condicional dispensado |
| `AI-05` | F9 | extração de campos de documentos em ambiente privado, revisão humana e descarte de artefatos conforme política. | condicional dispensado |
| `AI-06` | F9 | busca interna/RAG filtrada por permissão antes de recuperar conteúdo; isolar índices/consultas quando necessário. | implementado não verificado |
| `AI-07` | F9 | relatório gerencial com cálculos feitos por código/consulta validada; IA narra, não inventa totais. | condicional dispensado |
| `AI-08` | F9 | inconsistências cadastrais e próximas ações sugeridas, com justificativa e fonte. | condicional dispensado |
| `AI-09` | F9 | curadoria da base, versão, publicação, feedback, avaliação, custo/token e rollback. | implementado não verificado |
| `AI-10` | F9 | automações determinísticas de vencimentos, distribuição de tarefas e cobrança interna antes de agentes autônomos. | implementado não verificado |

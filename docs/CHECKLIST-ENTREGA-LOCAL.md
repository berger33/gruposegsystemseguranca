# Checklist da entrega local — 222 requisitos
Gerado em 2026-09-29 a partir do plano mestre; não é declaração de nova auditoria ou de conclusão.
Leia EXECUCAO-ENTREGA-LOCAL.md. Todos começam em a_revalidar para confrontar evidências históricas com a versão final. Isso não apaga o trabalho realizado.
Para cada ID, completar: rota/tela; API/tabela; perfil/escopo; integração; teste e commit; evidência; bloqueio; aceite humano.
Estados: a_revalidar, pendente, em_execucao, bloqueado, pronto_local, depende_integracao_externa.
SMTP/hospedagem externa estão fora da entrega; adaptadores simulados precisam ser identificados. AI-02/03/04/05/07/08 continuam no escopo.
Não copiar "verificado" de relatório histórico sem verificar a versão entregue.

## SEC-01
Inventariar rotas, APIs, tabelas, jobs, permissões e documentação no commit atual Aceite: Mapa com real/parcial/prévia/ausente e divergências documentadas
- Estado: em_execucao
- Tela / API / dados / autorização: Inventário do L00 registrado em docs/ESTADO-EXECUCAO-LOCAL.md e docs/EVIDENCIAS-ENTREGA-LOCAL.md.
- Integração e evidência (teste, resultado, commit): L00: 222 IDs únicos confirmados; 82/82 componentes administrativos órfãos; 5 achados do plano mestre revalidados como já corrigidos — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Falta o mapa completo rota-a-rota por ID (real/parcial/prévia/ausente).

## SEC-02
Corrigir verificações de escopo para negar por padrão em qualquer erro Aceite: Testar usuário A/B, outra unidade/contrato e falha de banco sem retorno de dados
- Estado: pronto_local (parcial)
- Tela / API / dados / autorização: Sessão administrativa: `server.mjs` readSession + `src/server/staff-session.mjs`; tabela `auth_staff_sessions`; nega por padrão em erro de banco.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` 21/21 (cenários 12,13,14) + `tests/staff-session-await-guard.test.mjs` 4/4 — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Parcial: cobre autenticação de staff. Escopo por unidade/contrato em consultas de negócio ainda a revalidar (L02+).

## SEC-03
Associar documentos a conta/unidade/contrato/classificação e aplicar autorização uniforme Aceite: Lista, busca, download, exportação e links respeitam o mesmo escopo
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-04
Login individual de staff, papéis, convites e revogação Aceite: Andreia acessa RH; funcionário não acessa RH geral; auditoria identifica pessoa
- Estado: em_execucao (autenticação e revogação prontas; navegação por papel ausente)
- Tela / API / dados / autorização: `POST /api/admin/session` (e-mail/senha) e `GET /api/admin/session`; tabelas auth_identities, auth_credentials, auth_staff_profiles, auth_staff_sessions; papel vem do banco.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenários 1-10: sem perfil 403, pending_email 401, suspensão/rebaixamento/epoch derrubam sessão, auditoria com identityId — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: NÃO atende ainda o aceite completo: "Andreia acessa RH" exige tela de RH acessível, e os 82 componentes administrativos continuam órfãos (ver L00-9). Papéis atuais: admin|ti|rh|marcelo; supervisor/comercial/financeiro não unificados. Convites de staff não revalidados. Aceite humano pendente.

## SEC-05
Substituir tokens compartilhados por autenticação individual com migração controlada Aceite: Credenciais legadas desligadas após contas válidas; recuperação administrativa documentada
- Estado: pronto_local
- Tela / API / dados / autorização: Token compartilhado recusado por padrão em `POST /api/admin/session`; exige SITE_ADMIN_LEGACY_TOKENS=true e desliga-se quando há conta individual; bootstrap cria identidade auditável.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenário 11 (403 legacy_admin_tokens_disabled) + `tests/staff-auth-hardening.test.mjs` 16/16; suítes tenant/client-access/cli-v2 migradas para login individual — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Procedimento de recuperação administrativa documentado em docs/ESTADO-EXECUCAO-LOCAL.md; sem aceite humano.

## SEC-06
MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit Aceite: Senha sozinha não emite sessão privilegiada; TOTP/recovery inválido ou reutilizado negado
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/admin/session` devolve 202+desafio quando há MFA; `POST /api/admin/session/mfa` conclui; tabelas auth_mfa e auth_mfa_challenges.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenários 15,16,18,19,20,21: senha sozinha não emite sessão, TOTP replay negado, recuperação de uso único, limite de 5 tentativas, expiração, rate limit 429 — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Chave CLIENT_MFA_ENCRYPTION_KEY ausente mantém MFA indisponível (503), nunca rebaixa para senha. Aceite humano pendente.

## SEC-07
Corrigir troca de e-mail e handlers HTTP Aceite: Senha atual verificada, novo e-mail confirmado, token único/expirável, atualização atômica, aviso antigo e sessões revogadas
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-08
Migrações rastreadas e executáveis Aceite: Banco vazio e upgrade de snapshot sintético passam; constraints corretas, repetição do runner segura
- Estado: pronto_local
- Tela / API / dados / autorização: `scripts/migrate-site-visual.mjs` (manifesto 001-099) e tabela `__migrations` com checksum e lock consultivo.
- Integração e evidência (teste, resultado, commit): `npm run test:migrations:pg`: banco vazio 99/99 e 499 tabelas; segunda passagem idempotente; clone adulterado recusado com migration_checksum_mismatch — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Contagens fixas substituídas por leitura do disco. Não executado em Windows.

## SEC-09
Reparar suíte e testar APIs reais Aceite: Testes não substituem chamada HTTP por SQL demonstrativo; dependências e CI reproduzíveis
- Estado: em_execucao
- Tela / API / dados / autorização: Suítes: test:unit (177) e gates em PostgreSQL real por HTTP.
- Integração e evidência (teste, resultado, commit): L01: nova suíte HTTP real `scripts/qa-staff-auth-postgres.mjs` 21/21; suítes existentes migradas de token compartilhado/cookie forjado para login individual; nenhuma expectativa foi apagada — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Cobertura ainda concentrada em autenticação e infraestrutura; jornadas de negócio sem teste de ponta a ponta.

## SEC-10
Consolidar orçamento/simulador e catálogo Aceite: Só confirmar após persistência; preço fictício ausente do fluxo real; sem modo administrativo público
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-11
Separar prévias e recursos reais Aceite: Nenhuma simulação concede permissão ou informa envio inexistente
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-12
Privacidade e declarações de aprovação verificáveis Aceite: Minuta explicitamente pendente enquanto faltar aprovação; texto completo antes de publicar
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-13
Segurança de sessão, CSRF, origem e erros Aceite: Cookies seguros em produção, origem/CSRF em mutações, JSON limitado, métodos corretos, erro sem stack/segredo
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-14
Auditoria durável e operacional Aceite: Alterações sensíveis rastreáveis; indisponibilidade de auditoria não gera falsa segurança
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-15
Proteção de abuso e identidade Aceite: Limites de login/convite/formulário/reenvio, respostas antienumeração, proxy/IP confiável definido
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-01
catálogo único dos seis serviços validados no projeto; cada item tem descrição, público, perguntas de qualificação e flag de publicação. Cerca elétrica ou novos serviços entram somente após validação comercial.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-02
páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados; revisão de acessibilidade, navegação e desempenho.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-03
orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada e responsável de atendimento.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-04
visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-05
FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada e controles do capítulo 19.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-06
CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-07
temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global. Implementar após núcleo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-08
SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-09
montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produção.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-10
mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-01
cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distinguir prospect/cliente/parceiro sem duplicar entidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-02
contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem legítima, sem coleta indiscriminada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-03
importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-04
converter lead do site em contato/oportunidade preservando histórico; tratar duplicidade e contato sem empresa.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-05
oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-06
funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para perda; reabertura auditada. Não tratar “ganho” como dinheiro recebido.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-07
kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-08
agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento. Links/calendário externo somente por integração configurada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-09
cadências de prospecção inicialmente como tarefas; automação de mensagens depende de autorização, opt-out quando aplicável e provedor.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-10
carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem próxima ação e relacionamentos por grupo/unidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-11
separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato quando praticados. Campos: unidade de cobrança, escopo, exclusões, recursos, custo, preço, vigência e aprovação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-12
equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-13
vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-14
orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, benefícios, provisões, substituição, supervisão, uniforme/EPI, deslocamento, materiais e indiretos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-15
orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-16
parâmetros de tributos/custos/jornada versionados com validade, fonte e aprovador; nenhuma alíquota ou regra coletiva inventada. Impedir preço oficial se faltar parâmetro essencial.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-17
cenários de preço e margem, separando margem de markup. Para tributos proporcionais à receita e margem sobre receita, uma simulação pode usar preço = custo / (1 - taxa - margem), somente sob premissas explícitas, denominador válido e aprovação contábil. Não impor essa fórmula a todos os regimes.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-18
alçadas de desconto e exceções; motivo, solicitante, aprovador e versão. Alteração de itens/custos após aprovação reabre a aprovação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-19
proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões, prazo, reajuste previsto, validade e condições; PDF gerado a partir da mesma versão persistida.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-20
estados rascunho → revisão → aprovada para envio → enviada → aceita/recusada/expirada/substituída; preservar versões enviadas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-21
envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integração.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-22
aceite por link seguro, expirável e vinculado à versão, se adotado; decisão jurídica sobre valor do aceite registrada. Não chamar clique simples de assinatura qualificada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-23
proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-24
relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário. Previsão ponderada é estimativa identificada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-25
metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento automático.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-26
biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CRM-27
parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-01
contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-02
itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-03
estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura com ativação operacional.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-04
aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-05
alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-06
obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-07
implantação com checklist: contrato, data de início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções, faturamento e convite do cliente.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-08
bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-09
encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-10
dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CON-11
diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-01
perfil próprio e solicitação de atualização cadastral; dados restritos mascarados conforme necessidade e mudança revisada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-02
próximo plantão com local, horário, função, contato do supervisor, orientações e itens necessários.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-03
calendário de escala, folgas, alterações e ciência da versão publicada; usuário não modifica unilateralmente a escala.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-04
jornada individual, comprovantes/importação de provedor, divergências e pedido de correção; preservar registro original.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-05
aviso de ausência/atraso com protocolo, motivo limitado, responsável e acompanhamento; aciona fluxo de cobertura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-06
troca de plantão com solicitação, aceite do outro profissional quando aplicável, validações e aprovação operacional.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-07
passagem de serviço com pendências, chaves, equipamentos, ocorrências e aceite; não expor dados desnecessários de terceiros.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-08
ocorrência com categoria, descrição, horário, local e anexo pertinente; restrição para informações pessoais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-09
procedimentos do posto versionados, ciência e contatos de apoio.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-10
envio de documentos solicitados, status pendente/em análise/aprovado/rejeitado com motivo e nova versão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-11
holerites/informes/documentos próprios, acesso privado e histórico de disponibilização; publicação proveniente de fonte autorizada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-12
férias, afastamentos, benefícios e reembolsos com solicitação, anexos restritos, aprovação e prazo de resposta.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-13
uniformes/EPI/equipamentos com entrega, recibo, solicitação de troca e devolução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-14
cursos e reciclagens, comprovantes e alertas de vencimento.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-15
comunicados direcionados, confirmação de leitura e central de notificações.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-16
atendimento RH com protocolo, categoria, mensagens privadas e acompanhamento.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-17
canal confidencial separado, com responsáveis e política de acesso; anonimato somente se efetivamente suportado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-18
PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotência, conflito explícito, horário do dispositivo e recebimento no servidor separados. Não cachear documentos médicos/salariais por padrão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EMP-19
FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de dados.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-01
cadastro profissional separado de identidade de login; matrícula, vínculo, cargo, empregador/filial, gestor, admissão, status, contatos necessários e histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-02
histórico de cargo, lotação, remuneração autorizada e vínculo com datas de efeito; acesso por campo/categoria.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-03
recrutamento com vaga, requisitos pertinentes, candidatos, triagem, entrevista, decisão e comunicação; retenção e acesso próprios para currículo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-04
banco de talentos e autorização/base aplicável; descarte configurado, sem acúmulo indefinido.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-05
admissão com checklist por função, documentos, validação, exame/treinamento e integração; não exigir dado sem finalidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-06
dossiê com tipos, versões, validade, pendências e aprovador. CNV e demais documentos apenas para funções/atividades aplicáveis, após confirmação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-07
desligamento com checklist, devolução, revogação, documentação e pendências; histórico laboral preservado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-08
mudança de status (afastado/suspenso/desligado) com efeito em permissões e alocação conforme política, sem automatizar sanção trabalhista.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-09
férias com períodos aquisitivo/concessivo quando aplicáveis, saldo importado/validado, programação, conflito de cobertura e aprovação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-10
afastamentos com período, retorno, documentação restrita e substituição; supervisor vê indisponibilidade/aptidão operacional necessária, não diagnóstico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-11
integração de ponto, justificativas, divergências, workflow de correção e fechamento de competência; trilha de reabertura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-12
banco de horas, adicionais e horas extras somente com regras versionadas e validadas para o vínculo/convenção; não fixar 12x36/6x1 como regra universal.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-13
benefícios com elegibilidade, solicitações, conferência, alterações por período e exportação ao fornecedor.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-14
adiantamentos/reembolsos com alçada e comprovantes, integração com financeiro e prevenção de duplicidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-15
saúde ocupacional com agenda, vencimentos e documentos necessários; acesso restrito. Não replicar prontuário médico completo no cadastro comum.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-16
integração/exportação para contabilidade/SST, recibos de processamento, erros e correção. Não declarar envio eSocial sem protocolo válido do responsável/provedor.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-17
treinamento por cargo/atividade, obrigatoriedade aplicável, validade, inscrição, presença e comprovante.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-18
matriz de competências integrada à alocação, sem decisão automática de contratação/punição.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-19
uniformes/EPI com entrega, recibo, substituição, validade/controle aplicável e devolução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-20
fechamento DP com faltas, férias, variáveis e documentos conferidos; exportação versionada e acesso do contador limitado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-21
holerites/informes importados de fonte autorizada, vinculação inequívoca ao colaborador, revisão antes de publicar e correção rastreada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-22
avaliações e planos de desenvolvimento com critérios definidos, acesso privado e participação humana; feedback de cliente não vira punição automática.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-23
atendimento interno com fila, responsável, categoria, prazo e mensagens; anexos de saúde fora de tickets genéricos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## HR-24
indicadores de quadro, admissão, faltas, rotatividade, férias, documentos e atendimento, com fórmula e período explícitos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-01
estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação; cargo/função em entidade própria.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-02
dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-03
escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-04
validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-05
ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-06
passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-07
livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-08
checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-09
visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-10
rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/QR isolado não prova execução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-11
chaves, rádios, materiais e equipamentos com guarda/transferência/devolução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-12
relatórios periódicos ao cliente com revisão de conteúdo e privacidade.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-13
métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-14
escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-15
supervisão de limpeza com rotinas por ambiente, consumo e não conformidades.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## OPS-16
eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto específico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-01
identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identificadas/redirecionadas com cuidado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-02
múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo cliente apenas se autorizada, sem ampliação fora do próprio escopo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-03
contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico interno não publicado automaticamente.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-04
documentos com categoria/validade/versão, busca e download privado; autorização testada em todos os caminhos.
- Estado: em_execucao
- Tela / API / dados / autorização: POST /api/admin/documents grava bytes reais em ctx.docsDir com chave de 24 bytes gerada pelo servidor (48 hex, validada por STORAGE_KEY_PATTERN antes de path.join) e content_sha256; GET /api/admin/documents/:id/download e /api/client/documents/:id/download exigem sessão.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 1 a 5, commit 4b95616: bytes conferidos em disco; nome "../../../../etc/passwd" não vira caminho e nada é escrito fora do diretório; download sem sessão 401; adulteração do arquivo em disco devolve 409 document_integrity_failed em vez de servir bytes trocados; documento de outra conta negado pela rota do cliente.
- Pendência / fronteira externa / aceite humano: Faltam categoria com validade e versionamento de documento (a tabela client_documents ainda não tem versão nem vencimento) e a busca por documento. A migração 101 também corrigiu CHECK (uploaded_by IN ('marcelo','ti')), que rejeitava os papéis admin/rh criados no L01.

## CLI-05
chamados com protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-06
estados aberto/em atendimento/aguardando cliente/resolvido/encerrado, reabertura e motivo; pausas de SLA explicitamente definidas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-07
agenda de visita/manutenção, confirmação, reagendamento e histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-08
relatórios de execução e medição/aceite de serviço com revisão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-09
cobranças/documentos fiscais/comprovantes somente quando financeiro estiver integrado; dados da própria conta.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-10
solicitação de serviço adicional gera oportunidade no CRM com origem e responsável.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-11
satisfação pós-atendimento e periódica, plano de ação e risco de renovação baseado em fatos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-12
renovação e comunicação contratual com registro, sem bloquear indiscriminadamente o portal por inadimplência.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-13
modos convite, solicitação com aprovação e autocadastro configuráveis; vínculo verificado no servidor em todos. Autocadastro nunca libera contratos sozinho.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-14
segurança da conta com MFA opcional, gestão de sessões e troca de e-mail concluída; fluxos ligados ao backend real.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## CLI-15
reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com RH.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-01
contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, valor e situação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-02
contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-03
geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-04
pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-05
conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-06
cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-07
fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-08
custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-09
resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompleta.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-10
despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-11
integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-12
boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-13
orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-14
exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do contador.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-15
fechamento de competência e reabertura autorizada; preservar versões de relatório.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## FIN-16
comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-01
produtos/SKU, fornecedores, unidade de medida, custo, local e estoque mínimo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-02
entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movimentos consistentes.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-03
reserva para proposta/implantação sem confundir reserva com saída; liberação em cancelamento.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-04
equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manutenção e termo de guarda.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-05
entrega/devolução, avaria/perda, fotos pertinentes e conferência.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-06
requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-07
inventário físico, divergências e ajuste aprovado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-08
ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, peças e execução.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-09
evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao que for aprovado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-10
manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por ativo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-11
dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; senhas de equipamentos fora do cadastro/log comum.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AST-12
materiais de limpeza com consumo por local, reposição e comparação ao previsto.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-01
painel “Meu dia” com pendências reais, prioridade, responsável e ação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-02
visão comercial com leads novos, oportunidades paradas, propostas e próximas ações.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-03
visão operacional com cobertura, ocorrências críticas, SLA e implantação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-04
visão financeira com fonte/competência, saldo, vencimentos e margem por contrato.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-05
contratos próximos de renovar, reclamações reincidentes e risco de perda justificado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-06
aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por valor/escopo.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-07
busca autorizada, favoritos, filtros salvos e atalhos com contexto.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-08
relatórios exportáveis e agendados para destinatários autorizados; registrar geração/envio e limitar dados.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-09
configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e preferências.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-10
metas e cenários com comparação prevista/realizada, sem confundir estimativa com resultado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-11
trilha e diário de decisões CON-11 acessíveis conforme permissão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## ADM-12
análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos reais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-01
diretório de usuários, papéis, escopos, convites, suspensão/revogação e revisão periódica de acesso.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-02
auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e exportação auditada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-03
integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-04
fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento.
- Estado: pronto_local
- Tela / API / dados / autorização: POST/GET /api/admin/notifications, POST /api/admin/notifications/:id/retry, POST /api/admin/notifications/process (sessão de staff). Tabela notification_queue com dedup_key único parcial, attempts/max_attempts, next_attempt_at e escada de backoff 1/5/15/60/240 min; estados queued, sending, local_outbox, failed, dead.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 6, 7 e 8 (HTTP real + PostgreSQL descartável), commit 4b95616. Dois defeitos corrigidos e provados por controle negativo: (a) isValidUuid com 4 grupos recusava todo UUID canônico; (b) reivindicação não atômica permitia entrega dupla — com o código antigo restaurado o teste 8 falha com "entregue 2 vezes".
- Pendência / fronteira externa / aceite humano: A tela de operação da fila ainda não existe; o consumo é por API. Reprocessamento manual exposto, mas sem agendador automático em execução contínua.

## PLT-05
notificações no painel, e-mail e canais externos configurados, preferências e templates revisados; nenhuma informação médica em assunto/push.
- Estado: em_execucao
- Tela / API / dados / autorização: Canal de e-mail roteado para a caixa de saída LOCAL (src/server/local-outbox.mjs); GET /api/admin/outbox e /api/admin/outbox/:id sob sessão de staff. Preferências e templates existem em 043-plt05-notifications.sql.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 9 a 14, commit 4b95616: estado gravado é local_outbox e sent_at permanece nulo; nenhuma resposta contém "enviado"/"entregue"; listagem não devolve o corpo; leitura é contada e auditada; mensagem vencida responde 410.
- Pendência / fronteira externa / aceite humano: SMTP está fora do escopo por decisão do cliente: não há e-mail real. Falta a tela de painel de notificações e a revisão de conteúdo de templates (assunto/push sem informação médica) ainda não foi verificada por teste.

## PLT-06
observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas acionáveis, sem segredos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-07
healthcheck/liveness/readiness, degradação explícita de dependências e painel operacional restrito.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-08
backup de banco e documentos, criptografia, acesso, retenção e restauração testada em ambiente isolado.
- Estado: em_execucao
- Tela / API / dados / autorização: scripts/demo-offline-snapshot.mjs: cópia fria de pgdata + documents com manifest.json (formato seg-demo-cold-copy-v1) contendo caminho, bytes e sha256 por arquivo; restauração em diretório e cluster isolados, sem sobrescrever a origem.
- Integração e evidência (teste, resultado, commit): npm run test:demo-local:pg (QA-HOM-009), commit 4b95616: backup a quente é recusado com o lock do runner; a restauração isolada confere marcador de instalação, ledger de migrações e todos os checksums, sobe PostgreSQL próprio e valida por HTTP que o cliente enxerga a conta A e não a B.
- Pendência / fronteira externa / aceite humano: A trilha de dump lógico (npm run test:backup-restore:pg) NÃO foi exercitada neste ambiente: exige pg_dump/pg_restore 17, que não existem no sandbox Linux (o pacote embedded-postgres traz apenas initdb, pg_ctl e postgres) e não há pacote disponível. A suíte recusa de forma explícita e não cria banco. No alvo Windows o PostgreSQL 17 instala esses binários e a suíte deve ser executada lá. Criptografia em repouso e política de retenção ainda não implementadas.

## PLT-09
política de privacidade completa, inventário de dados/finalidades, bases aplicáveis, destinatários, prazos, contatos e direitos; revisão competente antes de publicar.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-10
pedidos de acesso/correção/eliminação com verificação de identidade, responsável, prazo e impedimentos legais documentados.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-11
retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal e histórico minimizado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-12
resposta a incidente com responsáveis, contenção, evidências, análise e comunicação conforme avaliação aplicável.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-13
gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de infraestrutura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-14
revisão de dependências, lockfile, vulnerabilidades, atualizações e CI.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-15
importação/exportação, logs de integração, limites, webhooks autenticados, retries e reconciliação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-16
orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraestrutura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-17
isolamento de desenvolvimento/homologação/produção com contas e dados próprios; previews sem dados reais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-18
documentação para manutenção por outro programador, configuração, migração, diagnóstico e recuperação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-01
Frota Aceite: Veículo, responsável, abastecimento, manutenção, documentos e custo; se frota própria existir
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-02
Terceiros Aceite: Cadastro, contrato, documentos, vencimentos, acesso temporário e avaliação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-03
Licitações Aceite: Edital, prazos, documentos, responsáveis, proposta e resultado; se mercado relevante
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-04
Portal fornecedores Aceite: Cotações/documentos/pedidos com escopo próprio; se volume justificar
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-05
Qualidade Aceite: Não conformidade, causa, ação corretiva, verificação e reincidência
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-06
Satisfação/carteira Aceite: Pesquisas, CSAT/NPS quando adequado, histórico e tarefa de recuperação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-07
Compliance corporativo Aceite: Licenças/certidões/seguros e obrigações aplicáveis com responsável e validade
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-08
Base de conhecimento Aceite: Procedimentos versionados, busca, acesso e ciência
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-09
Expansão/unidades Aceite: Planejamento de filial/contrato, capacidade e cenários financeiros
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-10
Continuidade operacional Aceite: Contingência por posto/cliente, contatos, exercícios e recuperação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-11
Analytics/A-B Aceite: Hipótese, variantes aprovadas, métrica e privacidade
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-12
Editor visual avançado Aceite: Tokens/layouts versionados, preview e publicação
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-13
Relatório periódico Aceite: Consolidação de métricas e envio autorizado
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-14
Inteligência comercial Aceite: Indicações, reativação e recomendações baseadas em histórico
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-15
Apoio emergencial Aceite: Canal, destinatário, disponibilidade e escalonamento definidos
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-16
Central/vídeo Aceite: Projeto separado para eventos de monitoramento, vídeo e disponibilidade
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-17
Biometria/reconhecimento Aceite: Projeto separado, necessidade e avaliação de impacto/base aplicável
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-01
FAQ pública com respostas aprovadas e transferência humana; informar limites, não inventar serviços/credenciais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-02
resumo de histórico comercial autorizado, com links para registros de origem.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-03
rascunho de proposta a partir de catálogo e versão de custos aprovados; sem alterar preço/escopo ou enviar sozinho.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-04
classificação e sugestão de resposta a chamados, submetida a revisão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-05
extração de campos de documentos em ambiente privado, revisão humana e descarte de artefatos conforme política.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-06
busca interna/RAG filtrada por permissão antes de recuperar conteúdo; isolar índices/consultas quando necessário.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-07
relatório gerencial com cálculos feitos por código/consulta validada; IA narra, não inventa totais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-08
inconsistências cadastrais e próximas ações sugeridas, com justificativa e fonte.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-09
curadoria da base, versão, publicação, feedback, avaliação, custo/token e rollback.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-10
automações determinísticas de vencimentos, distribuição de tarefas e cobrança interna antes de agentes autônomos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

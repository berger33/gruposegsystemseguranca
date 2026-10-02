# Execução focada — entrega local integral SEG System

## Atualização operacional 2026-10-02 — barreira L07 → L08

O aceite humano dos 28 requisitos L07 foi declarado por Marcelo e Andreia em 02/10/2026, e a decisão dos 80 órfãos é promovê-los por área somente com prova. Porém, nenhuma validação Windows com evidência foi apresentada. Portanto a ordem vigente é: **não declarar L07 concluído e não iniciar implementação/gate/migração do L08**. A auditoria `AUDITORIA-TERRENO-L08.md` serve apenas para preparar a próxima sessão e mantém CLI/EXT nos estados existentes. Após evidência Windows, revalidar o mesmo SHA, fechar L07 e então iniciar CLI-01..05 com isolamento A≠B, auditoria transacional fail-closed, autoria da sessão, idempotência e UI real.

Data: 2026-09-29. Orientação complementar ao PLANO-MESTRE-IMPLEMENTACAO.md.
Objetivo autorizado: entregar o sistema integrado funcionando no computador do proprietário, sem depender de SMTP nem de hospedagem externa. Este documento orienta implementação; sua existência não comprova conclusão.

## 1. Fonte, escopo e ordem de leitura
1. Leia este documento e PROMPT-EXECUCAO-LOCAL.md.
2. Leia integralmente PLANO-MESTRE-IMPLEMENTACAO.md: seus 222 requisitos e critérios continuam válidos.
3. Use CHECKLIST-ENTREGA-LOCAL.md como inventário inicial por ID. Reconcile CONTROLE-IMPLEMENTACAO.md, RELATORIO-PENDENCIAS-COMPLETO.md e PRODUCAO-GATE.md com código e evidências atuais.
4. Leia AGENTS.md e instruções aplicáveis existentes no checkout, respeitando as instruções do proprietário. Este documento não autoriza ignorar controles da plataforma.
5. Revalide branches, PRs e commits: a auditoria encontrou main 5b4b2006478db7d6951f5af21d8f99cd24e00a2e e PR #6 em f10b7551e599bef1f10bb257f10d93cb62bbee09. São fotografias históricas, não refs a impor sobre trabalho novo.

Todos os módulos estão no escopo: segurança, site, CRM, contratos, funcionário, RH, operação, cliente, financeiro, estoque/patrimônio/manutenção, Marcelo, plataforma, expansões e IA. AI-02/03/04/05/07/08 estão incluídos; não usar o estado histórico "condicional dispensado" para removê-los.

SMTP e hospedagem externa são as únicas exclusões técnicas gerais da entrega local. Funcionalidades que exigem bancos, órgãos públicos, assinatura, vídeo, biometria ou equipamentos externos precisam de fronteira explícita: implementar a experiência e o contrato de integração local com simulador identificado, testes de falhas e adapter substituível. Isso não equivale a integração externa homologada. Não inventar credenciais, protocolos oficiais, pagamentos, assinaturas ou conformidade. Não coletar biometria nem construir central de vídeo real por inferência; preservar as condições expressas EXT-16/17 do plano mestre. Registrar essas fronteiras no aceite; não ocultá-las sob "tudo pronto".

## 2. Disciplina de foco
- Trabalhe em um lote funcional por vez. Escolha o primeiro lote com dependências satisfeitas.
- Cada lote deve produzir uma jornada utilizável: interface + autorização + API + persistência + integração + teste.
- Reutilize o código aproveitável; não reescreva toda a aplicação, troque stack ou redesenhe o visual sem necessidade demonstrada.
- Não abrir nova série de relatórios/ondas no lugar de corrigir o problema. Atualize os mesmos arquivos de controle.
- Não expandir o escopo com novas ideias enquanto houver requisitos previstos incompletos.
- Não encerrar após plano, tabelas, migrations ou componentes soltos. Implemente e verifique.
- Não declarar pronto por contagem de arquivos, build verde, mocks ou SQL executado diretamente.
- Não corrigir um teste apagando a expectativa, ignorando a suíte ou relaxando autorização.
- Avance autonomamente nas decisões reversíveis já autorizadas. Pergunte apenas por informação ou decisão indispensável e indisponível.
- Se um item estiver bloqueado, registre causa concreta, alternativa local e próxima ação; avance no próximo item independente sem declarar a etapa aprovada.
- Não repetir o mesmo teste já aprovado sem mudança ou risco novo. Faça regressão proporcional às alterações.
- Não enviar comunicações reais, fazer cobranças reais, publicar em produção ou alterar infraestrutura externa nesta entrega.
- Não fazer merge cego do PR #6; revisar conflitos e preservar trabalho posterior. Nunca usar force push ou reset destrutivo para "consolidar".
- Mantenha commits pequenos e coerentes por lote, com IDs dos requisitos e validação. Não commitar segredos, banco, documentos pessoais nem artefatos grandes.

## 3. O que significa concluído
Estados por requisito: a_revalidar, pendente, em_execucao, bloqueado, pronto_local, depende_integracao_externa.
Conservar separado o estado histórico para não apagar evidências.
"Pronto local" exige:
1. Ação acessível por navegação normal para o usuário correto.
2. Backend valida identidade, permissão e escopo em lista, detalhe, mutação, busca, exportação e download.
3. Dados persistem após recarga e reinício.
4. Fluxo chega ao módulo destinatário; não depende de editar banco manualmente.
5. Falhas não mostram sucesso nem deixam operação parcialmente aplicada.
6. Testes positivos, negativos e de repetição/concorrência quando pertinentes.
7. Evidência vinculada ao commit, comando, resultado, ambiente e cenário.
8. Ausência de dados reais na massa de homologação.
9. Manual de uso e limitação relevante atualizados.
Aceite automatizado e aceite humano são campos diferentes: não inventar aprovação de Andreia ou Marcelo.

## 4. Ambiente local-alvo
Computador Windows, 8 GB RAM, sem GPU; identificar CPU, espaço livre e versões antes de definir capacidade. Usar PostgreSQL real no teste de integração e pacote final; PGlite pode continuar como ferramenta de teste, mas não substitui evidência do banco-alvo.
Evitar exigir Docker/WSL se isso inviabilizar 8 GB; oferecer instalação nativa documentada quando adequada. Build e indexação pesada não devem concorrer desnecessariamente com geração de IA.
Separar processos web/API, banco, worker e Ollama com limites e inicialização previsíveis. Expor por padrão apenas localhost; LAN exige configuração explícita, autenticação e instruções.
Entregar scripts PowerShell de diagnóstico, configuração, migração, carga sintética, iniciar, parar, verificar saúde, backup e restauração. Scripts idempotentes, sem apagar banco existente. Instalação de dependência com privilégio deve ser explicitada.
Credenciais de demonstração geradas localmente, sem senha fixa publicada. Segredos locais fora do Git. Banco e arquivos em diretório de dados persistente, separado de builds.
Readiness deve verificar dependências necessárias. IA indisponível não derruba funções administrativas; exibir indisponibilidade real.

## 5. Lotes sequenciais e gates

### L00 — Base íntegra e controle confiável
- Comparar main, PRs e branches; escolher base atual completa e registrar SHA.
- Corrigir imports ausentes e garantir instalação reproduzível via lockfile.
- Inventariar todos os 222 IDs: rota, componente montado, handler, tabela, autorização, integração, testes e estado.
- Revisar componentes administrativos desconectados; reaproveitar por domínio, sem despejar tudo na página TI.
- Executar migrações em banco sintético vazio e upgrade sintético; testar repetição, checksum/registro e falha intermediária.
Gate: servidor e aplicação iniciam na base escolhida, sem dependências ausentes; migrations reproduzíveis; nenhum ID desapareceu do inventário.

### L01 — Identidade, autorização e integridade básica
- Remover fallback de perfil ausente para admin; negar estado/papel inválido.
- Unificar identidades individuais e papéis funcionário, RH, supervisor, comercial, financeiro, Marcelo, TI e cliente conforme necessidade. Preferir permissões a condicionais dispersas de nomes.
- Implementar MFA staff com desafio anterior à sessão privilegiada, recuperação, limites e proteção contra reutilização.
- Desligar tokens compartilhados após provisionamento local individual e procedimento de recuperação.
- Revogar sessões ao suspender/desligar, mudar credenciais ou reduzir permissões; validar estado/versionamento no servidor.
- Corrigir RBAC: propriedade real em own, escopo de unidade/conta/contrato e retirada de bypass provisório.
- Corrigir máscara de remuneração no registro, histórico, alteração, exportação e perfil; separar saúde de cadastro geral.
- Normalizar actor identityId; auditoria sensível durável, sem ignorar falhas silenciosamente; transação/outbox conforme operação.
- Validar limites de corpo, método, origem/CSRF, erros sanitizados e rate limiting nos fluxos pertinentes.
Gate: HTTP real com perfis A/B, funcionário A/B, clientes A/B, revogação de cookie existente, falha de banco e ausência de papel; nenhuma ampliação silenciosa de privilégio.

### L02 — Armazenamento, notificações locais e continuidade mínima
- Implementar provider local de arquivos privados: bytes reais, chave gerada pelo servidor, conta/escopo, tipo/tamanho, hash, versão e caminho protegido contra traversal.
- Publicar documento somente após persistência consistente; tratar rollback, órfãos e limpeza segura.
- Downloads autenticados, sem depender de URL pública ou file_url fornecida pelo usuário.
- Fila durável de notificações com deduplicação, retries, backoff, falha final e consulta de histórico.
- Sem SMTP: usar caixa de saída local restrita e claramente identificada. Estados como "disponível na caixa local"; nunca "e-mail entregue".
- Tokens de convite/recuperação continuam únicos e expirantes. Simular usuários em sessões de navegador separadas. Caixa local não é prova de posse de e-mail em produção.
- Concluir troca de e-mail no modo local com confirmação/reautenticação e revogação; produção sem provedor deve negar explicitamente.
- Backup real de PostgreSQL + arquivos + manifesto/hash; executar restauração em diretório/banco separado e verificar acesso aos documentos restaurados.
- Definir ponto consistente, inclusive pausa de escrita local durante cópia se necessário; não exigir arquitetura empresarial desproporcional para a simulação, nem fingir atomicidade.
Gate: upload/download de documento privado, tentativa de outro usuário negada, reinício, notificação local processada e restauração isolada comprovados.

### L03 — Funcionário e RH
Cobrir EMP-01..19 e HR-01..24 integralmente.
- Portal móvel próprio: perfil, próximo plantão, escala, ciência, jornada, ausência, troca, passagem, ocorrências, procedimentos, documentos, holerites, férias, benefícios, reembolso, uniformes, cursos, comunicados, atendimento, canal confidencial, PWA e acessibilidade.
- Identidade própria do funcionário; não exigir admin/RH para autoatendimento. Derivar funcionário da sessão, nunca confiar no employee_id do navegador.
- Central Andreia: quadro e dossiês, recrutamento/talentos, admissão, validade documental, desligamento, férias/afastamentos, jornada, benefícios, saúde ocupacional, competências, uniformes, DP, holerites, atendimento e indicadores.
- Regras trabalhistas e custos configuráveis/versionados; parâmetros sintéticos identificados. Não afirmar cálculo/obrigação oficial sem validação competente.
- PWA: idempotência de sincronização, conflito explícito, timestamps de dispositivo/servidor, evitar cache de documentos sensíveis.
Gate: admitir pessoa fictícia, criar acesso, enviar documento, revisar, publicar escala, solicitar correção/ausência, fechar competência de demonstração, publicar holerite próprio e desligar revogando sessão. Todos pela interface.

### L04 — Site e comercial
Cobrir PUB-01..10 e CRM-01..27.
- Corrigir orçamento/simulador: configuração de negócio no servidor; nenhuma alternância administrativa pública; confirmar somente após persistência.
- Catálogo único, CMS/versionamento, conteúdo, FAQ, temas, origem de leads e política de privacidade com aprovação corretamente representada.
- Empresas/contatos, importação revisável, deduplicação, oportunidades, kanban/tabela, próxima ação, histórico, agenda, tarefas de prospecção e carteira.
- Serviços/equipamentos, vistoria, composição de mão de obra/técnica, custos e tributos versionados, margem versus markup e alçadas de desconto.
- Propostas versionadas, PDF real, estados/transições, entrega em caixa local, aceite seguro e expiração, relatórios, metas/comissões, biblioteca e indicações.
- Alterar itens/custos invalida aprovação anterior quando aplicável. Retry não cria proposta/cliente duplicado.
Gate: visitante cria lead real; comercial converte, agenda, orça, aprova, gera PDF, disponibiliza localmente e registra aceite na versão correta.

### L05 — Contratos e implantação
Cobrir CON-01..11.
- Converter proposta aceita em contrato de forma idempotente; preservar origem e versão.
- Itens, unidades, postos, SLA, responsáveis, documentos, vigência, transições, aditivos, reajustes, alertas, obrigações, checklist/bloqueios, encerramento, dossiê e diário.
- Vincular as entidades utilizadas por CRM, cliente, operação e financeiro; não manter cópias desconectadas de "contrato".
Gate: mesmo aceite repetido gera um único contrato/implantação; alteração contratual tem data/versão e propaga efeitos autorizados; encerramento trata pendências.

### L06 — Operação, patrimônio e manutenção
Cobrir OPS-01..16 e AST-01..12.
- Cliente/unidade/posto/turno/alocação, cobertura, escalas, conflitos de disponibilidade/documentação/competência, substituição, passagem, ocorrências, checklists, supervisão, rondas, guarda de materiais e relatórios.
- Limpeza: rotinas por ambiente, execução, consumo e não conformidades.
- Estoque: movimentos consistentes, reserva/liberação, seriais, guarda/devolução, compras, inventário, OS, evidências, garantia, manutenção e dossiê técnico.
- Simulador identificado para eventos de monitoramento; sem prometer serviço emergencial ou central 24h.
Gate: ausência abre cobertura, supervisor substitui pessoa habilitada, funcionário recebe alteração; OS consome material sem duplicidade, registra evidência e alimenta custo.

### L07 — Financeiro e Marcelo
Cobrir FIN-01..16 e ADM-01..12.
- Corrigir pagamento/saldo/histórico em transação, validação de valores e vínculos, idempotência, bloqueio/controle concorrente e estorno consistente.
- Testar repetição, duas baixas simultâneas, estorno repetido, falha parcial e limite de saldo.
- Contas, recorrência, conciliação, cobrança local, caixa, custos/rateios, margem, despesas/compras, exportações, orçamento, fechamento/reabertura e comissões.
- Adapters de banco/fiscal com simulador explícito e cenários sucesso/falha/replay; nenhuma cobrança ou nota real.
- Marcelo: Meu dia, pendências, comercial, cobertura, financeiro, renovação, aprovações, busca, favoritos, relatórios, configurações, metas e diário de decisões.
- Indicador abre registros de origem e informa período/fórmula; dados incompletos não viram margem fictícia.
Gate: contrato gera cobrança sintética única; recebimento parcial e estorno conciliam; compra aprovada gera obrigação; Marcelo decide pelo painel e visualiza o efeito.

### L08 — Cliente e expansões
Cobrir CLI-01..15 e EXT-01..17, respeitando as condições originais.
- Portal único: convites, papéis por conta, contratos, arquivos, chamados/mensagens/SLA, visitas, medição, cobranças, serviço adicional, satisfação, renovação, modos de cadastro, segurança e reclamação restrita.
- Serviço adicional gera oportunidade no CRM; documento interno não é publicado automaticamente.
- Conectar fluxos aplicáveis de frota, terceiros, licitações, fornecedores, qualidade, conhecimento, expansão, contingência, analytics, editor, relatórios, inteligência comercial e apoio.
- Fornecedor/terceiro não pode acessar concorrentes/RH. Fluxos condicionais não configurados mostram motivo e configuração necessária; não cartões fingindo funcionamento.
Gate: cliente A atende seus fluxos sem acessar B; fornecedor restrito; reclamação alcança responsáveis corretos; integrações externas simuladas são identificadas no relatório.

### L09 — IA local e RAG de verdade
Cobrir AI-01..10.
- Ollama local; qwen3:1.7b como ponto de partida configurável, sem prender schema a um único nome. Não usar API paga ou externa silenciosamente.
- Embeddings reais com modelo pequeno adequado a português, por exemplo EmbeddingGemma após verificar compatibilidade e licença no ambiente. Registrar modelo/versão, chunks, hash e estado real; pgvector ou alternativa local justificada.
- Filtrar autorização ANTES da recuperação; conta, unidade, documento e identidade no servidor. Revogação/despublicação deve retirar conteúdo de consultas.
- Recuperação semântica/híbrida, fontes clicáveis autorizadas, limite de contexto e resposta de insuficiência de informação.
- Fila real: uma geração ativa inicialmente, fila limitada, estados reais, cancelamento, timeout adequado à CPU, backpressure e limpeza após erro/reinício. Não usar espera aleatória ou contador como fila.
- Medir tempo em fila, primeira resposta/resposta completa, RAM, falhas e tokens disponíveis; não inventar custo ou indicador de alucinação.
- Ajustar contexto, tamanho de resposta e modo de raciocínio suportado pelo modelo; testar carga fria/quente. Separar embeddings/indexação de atendimento.
- Implementar FAQ pública; resumo comercial; rascunho de proposta; classificação/resposta assistida de chamados; extração revisada; busca interna; relatório narrado com números calculados por código; inconsistências/próxima ação; curadoria/feedback; automações determinísticas.
- IA propõe; ações financeiras, alteração de permissão, envio, contratação e decisões sobre pessoas exigem fluxo de autorização próprio. Conteúdo recuperado é dado, não instrução.
Gate: Ollama REAL habilitado, perguntas com fonte, sem fonte, fonte revogada, prompt injection em documento, usuário fora do escopo, erro do modelo e fila concorrente. Fallback não conta como teste de IA. Em 8 GB medir capacidade e registrar limites; se inviável, expor degradação e tarefa bloqueada sem prometer desempenho.

### L10 — Integração final e pacote local
Cobrir PLT-01..18 e regressões de todos os lotes.
- Jornada A: site → lead → proposta → contrato → posto → execução → cobrança → recebimento → indicador.
- Jornada B: admissão → acesso → documento → escala → ausência → cobertura → DP → desligamento.
- Jornada C: chamado cliente → atendimento → OS → estoque/custo → aceite → satisfação.
- Jornada D: upload autorizado → indexação real → resposta com fonte → revogação → conteúdo indisponível.
- Jornada E: backup → perda simulada somente de ambiente descartável → restauração → banco e arquivos íntegros.
- Rodar testes críticos, typecheck, build, dependências, integrações HTTP PostgreSQL e navegador com perfis reais sintéticos.
- Verificar celular, teclado, erros/estados vazios, navegação, sessão expirada e reinício completo.
- Empacotar commit identificado, todas as migrações e lockfile; instruções limpas em Windows; garantir que ZIP antigo não seja confundido com entrega atual.
Gate final: instalação reproduzida a partir do pacote, execução das jornadas e matriz 222 IDs conciliada. Aceite local não é aceite de produção.

## 6. Artefatos de acompanhamento que o agente deve manter
Atualizar CHECKLIST-ENTREGA-LOCAL.md sem gerar cópias a cada sessão.
Criar/atualizar docs/ESTADO-EXECUCAO-LOCAL.md com:
- branch/SHA atual; lote ativo; último gate aprovado;
- IDs concluídos no lote e evidências;
- bloqueios reais e próximos três passos;
- comandos necessários à retomada, sem segredos.
Criar/atualizar docs/EVIDENCIAS-ENTREGA-LOCAL.md com cenário, usuário/perfil, passos, resultado esperado/observado, comando, exit code, commit e links de CI/capturas pertinentes.
Criar/atualizar docs/MANUAL-LOCAL-WINDOWS.md: requisitos, instalação, configuração, banco, migração, seed, Ollama/modelos, iniciar/parar, caixa local, backup/restore, diagnóstico e remoção segura.
Criar/atualizar docs/ACEITE-LOCAL.md: requisitos prontos, pendências explícitas, adapters simulados, medições, procedimentos e aceite humano pendente/concluído.
Nenhum destes artefatos pode substituir código e teste. O checklist inicialmente marca tudo para revalidação, sem descartar avanços históricos.

## 7. Ciclo obrigatório de cada sessão
1. Ler estado e conferir diff/commits novos para não repetir trabalho.
2. Selecionar primeiro lote elegível e um conjunto pequeno de IDs/jornada.
3. Reproduzir a falha ou mostrar o caminho ausente.
4. Corrigir interface, backend e dados juntos conforme dependências.
5. Verificar cenário positivo, falha e acesso indevido.
6. Atualizar evidência e estado; revisar diff; salvar commit coerente.
7. Continuar para o próximo passo autorizado. Se a sessão terminar, deixar retomada executável; não afirmar entrega integral.

Relato ao proprietário: "Lote / jornada entregue / testes e commit / pendência real / próximo passo". Não pedir confirmação a cada etapa já autorizada. Informar claramente quando ambiente/hardware/provedor impede uma verificação.

## 8. Proibições contra falsa conclusão
Não aceitar: tela descritiva como dashboard; componente não montado como módulo entregue; HTTP 200 sem persistência; status de backup sem arquivo; embedding concluído sem vetor; fila sem worker/controle real; teste de fallback como Ollama; dados sintéticos como métricas reais; email local como envio SMTP; cadastro de configuração como integração operacional; build como homologação integral; gate aprovado em SHA antigo como prova do SHA entregue.

Primeira ação do agente: executar L00 e iniciar imediatamente a primeira correção de L01 elegível, preservando a base mais recente. A meta é um sistema utilizável localmente, com provas e limitações honestas.

## Registro de execução — ADM-01..12 (02/10/2026)

Roteiro efetivamente seguido nesta sessão, na ordem:

1. Leitura dos documentos de estado/checklist/evidências e **reconfirmação da
   baseline no commit base** (worktree separado, sem nenhuma edição aplicada):
   gate L07 37/37 duas vezes, estático 5/5, typecheck 0, unitários 196/196,
   migrações exit 0, L04/L05/L06 verdes e L03 com uma reprova pré-existente.
2. Reprodução da lacuna por prova: `/admin/marcelo` era protótipo descritivo e
   os 82 componentes de `/admin/ti` não eram importados por nenhuma rota.
3. Implementação conjunta de dados (migração aditiva 138), back-end
   (`src/server/adm-panel-api.mjs`, rotas `/api/adm/panel/*` em `server.mjs`) e
   interface (`MarceloPanel.tsx`).
4. Verificação dos três cenários exigidos por requisito — positivo, falha de
   leitura/auditoria e acesso indevido — em seis subtestes novos do gate L07
   (HTTP, PostgreSQL e Chromium reais), elevando o gate de 37 para 43.
5. Execução no mesmo SHA: estático, typecheck, unitários, build, L07 duas vezes
   consecutivas limpas e regressões L03–L06.
6. Atualização de CHECKLIST, ESTADO, EVIDÊNCIAS, CONTROLE, ENTREGA-L07,
   relatório da série `ENTREGA-L07-ADM01-12.md` e inventário
   `INVENTARIO-ADMIN-TI.md`; PR aberta para revisão, **sem merge**.

Não feito de propósito: nenhum aceite humano foi assumido, L07 não foi
declarado concluído e L08 não foi iniciado.

## Registro de execução — fechamento de matriz/evidências do L07 (02/10/2026)

Roteiro efetivamente seguido nesta sessão, na ordem:

1. Reconfirmação da **baseline no SHA base antes de qualquer edição**:
   estático 5/5, typecheck 0, unitários 196/196, build exit 0, migrações
   138/138 (2 passes + clone/checksum negativo), gate L07 **43/43 duas vezes
   consecutivas** e regressões L03 1/1, L04 20/20, L05 1/1, L06 8/9 encadeado
   (subteste 9 em `Carregando operação…` — instabilidade de carga conhecida;
   isolado depois passou 9/9). As instabilidades nomeadas no ponto de partida
   (L03 403 e L07-22) não reapareceram.
2. **Percorrência requisito a requisito** de FIN-01..16 e ADM-01..12 no
   CHECKLIST, conferindo tela/API/tabelas/autorização no código real e o corpo
   de cada subteste citado do gate de 43.
3. **Tratamento da instabilidade L06-9** com causa raiz investigada (teste
   interagia antes do bootstrap do workspace; único subteste sem espera de
   conteúdo) e correção **do teste** no padrão dos subtestes 1–8 do mesmo
   arquivo — sem timeout maior, sem skip, assertiva final idêntica. Validada
   isolada (9/9) e encadeada após L03–L05 (9/9).
4. Produção da **matriz de fechamento** `docs/MATRIZ-FECHAMENTO-L07.md`
   (requisito → tela/rota → API → tabelas → subtestes → resultado → pendência,
   com dívidas explícitas) e do relatório `docs/ENTREGA-L07-MATRIZ-FECHAMENTO.md`.
5. Correções documentais honestas: rótulo real da aba FIN-10; evidência
   vigente defasada; nota de precisão sobre TI-leitura em FIN-02. Nenhuma
   lacuna funcional real foi encontrada — nenhuma migração nova (próxima
   livre: 139), nenhum subteste acrescentado, nenhum produto alterado.
6. **Validação final no mesmo SHA entregue**: estático 5/5, typecheck,
   unitários 196/196, build, migrações 138/138, L07 **43/43 em duas execuções
   consecutivas**, L03 1/1, L04 20/20, L05 1/1, L06 **9/9 encadeado**.
   Ruído `next-env.d.ts`/`tsconfig.json` revertido antes do commit.
7. Atualização de CHECKLIST, ESTADO, EVIDÊNCIAS, EXECUÇÃO, CONTROLE,
   ENTREGA-L07, matriz e relatório; PR aberta para revisão, **sem merge**.

Não feito de propósito: nenhum aceite humano assumido ou presumido, L07 não
declarado concluído, L08 não iniciado, dívida dos 80 órfãos de `/admin/ti`
mantida como dívida explícita (critério de saída já definido).

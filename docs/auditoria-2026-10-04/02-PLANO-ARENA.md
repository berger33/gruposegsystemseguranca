# Plano de conclusão para o Arena

Data: 04/10/2026. Base auditada: main 540faf6c5124fd243fc3e287527ff4f6983ce8f1. Este documento é uma orientação de implementação, não certificado de conclusão.

## Resultado esperado
Sistema utilizável por Marcelo, Andreia, funcionários e clientes, com jornadas completas e dados fictícios para demonstração no Windows. SMTP real e hospedagem definitiva ficam fora da entrega. Acesso externo só depois do aceite técnico. Não criar integrações reais de biometria, vídeo ou emergências para simular conclusão de projetos separados.

## Fonte de verdade e método obrigatório
1. Consultar main, PRs abertos e CI no GitHub. Registrar SHA atual; este plano não congela a versão futura.
2. Ler instruções AGENTS.md se existirem, README, docs/ESTADO-EXECUCAO-LOCAL.md, docs/CHECKLIST-ENTREGA-LOCAL.md, docs/APLICACAO-BANCO-DESTINO.md. Usar AUDITORIA-TERRENO-L08 apenas como histórico de lacunas: é anterior a CLI e EXT já entregues e sua indicação de migração 139 está obsoleta.
3. Conferir estado versus código e gates atuais. Nunca refazer entrega já integrada só porque documento antigo a chama pendente. Nunca promover requisito por existência de tabela, endpoint, componente ou teste unitário isolado.
4. Trabalhar em uma única fatia por vez, PR pequeno revisável, sem misturar PRs concorrentes. Reservar próxima migração livre no main vigente; 001–156 já existem na base auditada, não editá-las. Não presumir que 157 continuará livre.
5. Preservar guardas PLAT-01, credenciais individuais, isolamento entre contas, fail-closed e auditoria transacional. Não introduzir bypass de teste no servidor normal.
6. Publicar evidências sanitizadas: comando, versão, SHA, contagem, falhas, escopo e limite da prova. Não publicar ambiente.env, cookies, senhas, dumps ou dados pessoais.

## Ordem de execução
### F00 — Reconciliação (primeira entrega)
Criar docs/STATUS-ATUAL-CONSOLIDADO.md e docs/PLANO-CONCLUSAO-ARENA.md. Reconciliar os 222 IDs usando a matriz auditada como inventário, não como prova. Para cada ID: descrição; tela acessível; API; tabela canônica; papéis; teste vigente; estado confirmado; pendência; próxima ação. Revisar os 27 PRs que estavam abertos na auditoria; identificar duplicados/superseded sem merge automático. Resultado: lista única de trabalho com dependências e sem contradição histórica.

### F01 — Entrada e navegação (primeira implementação)
/admin deve abrir login ou redirecionar à entrada canônica. /admin/marcelo, RH e demais páginas protegidas devem levar o anônimo ao login e devolver ao destino autorizado. Criar menu por papel, saída visível e estados 401/403/500 compreensíveis. Corrigir rótulo 'E-mail individual de TI' em login compartilhado. Conta individual é padrão; não sugerir token legado quando desativado. Autorização no servidor em toda API, não apenas ocultação no menu. Provar Marcelo admin, Andreia RH e funcionário com permissões distintas; logout revoga sessão e redirecionamento não aceita domínio externo. Não conceder RH acesso irrestrito à administração para consertar navegação.

### F02 — Windows e operação reproduzível
Os testes atuais no Windows deram 511/514: falhas EPERM em testes de symlink nos arquivos qa-backup-coverage-inventory, qa-cli-v2-local-provider e qa-cli-v2-transfer. Definir execução Windows com suporte explicitamente documentado a symlinks ou adaptar provas com cobertura equivalente real; não tornar teste verde retirando o caso de ataque. Isolar QA de ambiente operacional: quatro falhas adicionais ocorreram pela presença de .env.local e desapareceram com configuração externa. Gerar scripts Windows de instalação/início/parada/status, verificar Node/Docker/portas, evitar tocar outros containers, aguardar healthcheck do PG antes do servidor. Segredos externos, logs sanitizados, reinício seguro. Fazer backup e restauração em banco separado e verificar contas/documentos/ledger; nunca sobrescrever original.

### F03 — Massa e jornadas de negócio
Criar seed idempotente exclusivo de demonstração, impossível de executar em banco não autorizado, com empresa/cliente A e B, equipe/funcionário, conta RH, Marcelo, contratos e registros mínimos representativos. Não gerar senhas fixas. Percorrer: lead→oportunidade→proposta revisada→contrato→implantação; funcionário→solicitação→análise RH→retorno; cliente→chamado→atendimento→aceite; contas a pagar/receber→baixa→relatório. Usar os requisitos e regras existentes; documentar limites externos (banco bancário, eSocial, assinatura, e-mail). Corrigir apenas lacunas demonstradas, sem reescrever módulos entregues.

### F04 a F13 — EXT-08 a EXT-17, uma fatia por requisito
- EXT-08 conhecimento: criação, revisão, versão publicada, busca por permissão, ciência vinculada à versão. Revogar acesso antes de recuperar conteúdo; não expor rascunho.
- EXT-09 expansão: premissas/fonte/data, cenários calculados por código, capacidade e aprovações; diferenciar ausência de dado de zero.
- EXT-10 continuidade: planos por cliente/posto, responsáveis e contatos autorizados, exercícios claramente simulados, resultados e ações corretivas. Não prometer acionamento externo inexistente.
- EXT-11 analytics: hipótese, métrica e período definidos, aprovação de variantes, minimização de dados, pausar/reverter experimento; medir fatos existentes.
- EXT-12 visual: rascunho, preview, aprovação, publicação, histórico e rollback; impedir mudança pública sem papel permitido e preservar layout vigente.
- EXT-13 relatórios: fonte canônica, período/conta, autorização, geração repetível, agenda/ledger e download autorizado; envio SMTP fica explicitamente pendente.
- EXT-14 inteligência comercial: recomendação com fonte e justificativa, rascunho revisável, responsável e próxima ação; não inventar oportunidade ou comunicar cliente automaticamente.
- EXT-15 apoio emergencial: cadastro e disponibilidade declarada, escalonamento e teste simulado; não apresentar protótipo como central real 24h.
- EXT-16 central/vídeo: manter projeto separado. Entregar cadastro/escopo/status e simulação explícita se isso for o requisito; não integrar câmeras reais nem declarar monitoramento entregue sem infraestrutura e aceite específicos.
- EXT-17 biometria: manter projeto separado. Registrar necessidade, avaliação de impacto, decisão e status; não coletar faces/digitais reais para fechar checkbox. Dependência externa deve permanecer identificada.
Para cada fatia: rota navegável, API canônica, transação+auditoria, RBAC, testes PG/HTTP, replay e rollback quando houver efeitos compostos, UI de erro/vazio/sucesso e atualização do checklist.

### F14 — IA/RAG real, base e permissão primeiro
O código em src/server/ai-rag-api.mjs usa fallback se OLLAMA_ENABLED não for true. Não marcar esse fallback como inferência. Implementar/verificar primeiro AI-06 (recuperação autorizada) e AI-09 (curadoria/versionamento), depois AI-01 FAQ pública, AI-02 resumo comercial, AI-03 rascunho de proposta, AI-04 sugestão para chamados, AI-05 extração privada revisada, AI-07 narrativa de números determinísticos, AI-08 inconsistências justificadas e AI-10 automações determinísticas. Todos permanecem separados na matriz.
Usar adaptador configurável para Ollama local; modelo pequeno deve ser selecionado por medição, não só por nome. A base cita qwen3:1.7b; não baixar em máquina do usuário sem coordenar etapa de instalação. Perfil alvo: CPU sem GPU e 8 GB como mínimo de referência; esta máquina foi medida com cerca de 16 GB, não extrapolar seu resultado para 8 GB. Medir RAM, tempo até resposta, total e comportamento sob 1/2/3 usuários. Limitar concorrência e fila; timeout/cancelamento, erro honesto e modo sem IA. Não prometer fila infinita ou ausência de gargalo.
Recuperação deve filtrar conta e papel antes de enviar trechos ao modelo. Separar público, cliente, RH e gestão; negar salários/saúde a escopos indevidos. Citar fontes autorizadas e versão. Testar prompt injection em documentos, acesso cruzado, documento revogado, base vazia e provedor indisponível. LLM não faz cálculos financeiros, não decide desligamento, não altera preço nem envia proposta sozinho. OCR/extrato de documento passa por revisão e política de retenção. Registrar modelo/versão, latência e uso sem prompts contendo segredos nos logs.

### F15 — Fronteiras ainda parciais
Revalidar portal de fornecedores externo versus jornada interna EXT-04; upload real versus metadados declarados; recuperação de conta sem SMTP; jobs/agendadores com reinício; notificações internas; backup/restauração e isolamento entre clientes. Classificar cada parte como completa, simulação explícita, dependência externa ou pendente. Não expandir automaticamente escopo para integração externa contratada.

### F16 — Aceite final antes de instalar novamente
Executar matriz de aceite descrita no arquivo 03-ACEITE.md. Entregar resumo de riscos e pendências por ID, PRs/SHAs, passos Windows para operador, dados fictícios e prompt de continuidade. Só afirmar 'pronto para demonstração' se o conjunto acordado passar; 'sistema completo' exige todos os requisitos do escopo e aceite humano registrado pelo usuário. SMTP/hospedagem definitiva ficam excluídos, não aprovados ficticiamente.

## Como continuar entre sessões
Ao fim de cada fatia, registrar docs/CONTINUACAO-ARENA.md: SHA base/branch/PR, requisito atual, arquivos alterados, testes executados/resultados, decisões, riscos, próxima ação concreta. Se faltar informação de negócio realmente impeditiva, perguntar só o necessário e continuar trabalho independente. Não consumir sessão recapitulando documentos sem implementar a fatia autorizada.

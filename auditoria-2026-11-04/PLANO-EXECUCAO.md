# Plano de execução em fatias — fechamento técnico para produção

Base: auditoria de 04/11/2026, atualizada sobre `4ddad493fda704c77e5590758efb3b5476dd23df` (main, merge da PR #351).
Estado atualizado em 08/11/2026: fatias 01–04 implementadas e validadas localmente (fatia 04: piloto POSIX, Windows preservado sem nova validação); fatia 05 em execução, grupos 05A–05Z, 05AA, 05AB, 05AC, 05AD, 05AE, 05AF, 05AG, 05AH e 05AI concluídos localmente (66 runners adicionais ao piloto; total 67/68 em POSIX, 1 pendente), fatia 06 **encerrada** no que cabe a auditoria TAP com os recortes 06A (filtros das rotas públicas), 06B (mapa reproduzível de cobertura e fechamento dos gates órfãos), 06C (auditoria TAP por comando e migração de 9 gates `ci.yml`/F01/L02-L08) e **06D (23 gates F03+UX com pisos medidos, levando auditado_tap 53→76 e sem_auditoria 25→2, restando apenas qa-evidence-report.mjs e client-security N8)**, demais fatias pendentes. Evidências em FATIA-01.md a FATIA-04.md e FATIA-05A.md a FATIA-05Z.md, mais FATIA-05AA.md a FATIA-05AI.md, FATIA-06A.md, FATIA-06B.md, FATIA-06C.md e FATIA-06D.md. Consulte a PR para publicação e checks remotos; a falha intermitente de Chromium observada no L06 está registrada na 05AB; na 05AG, E6 ficou pendente após OOM no baseline e o RAG teve SIGSEGV em dois launches antes da repetição integral aprovada; na 05AH, a sondagem de padrão público sem correspondência foi interrompida após 180s; na 05AI, backup/restore foi ensaiado somente com dados sintéticos e clientes de QA; no pós-merge da PR #351 (`4ddad49`), o run `42416131441` falhou apenas no passo `client-security` (ocorrência residual de N8), com `backup-restore` `42416131434` verde.

## Regras de execução

- Preservar funcionalidades, papéis, aliases, dados e contratos existentes.
- Uma entrega pequena por fatia, com evidência antes/depois, regressão proporcional e pendências residuais explícitas. As famílias extensas serão divididas por tela/handler.
- Não promover inventário textual a aceite, não afrouxar testes para obter verde e não declarar integração real com mocks.
- Trabalho local/sintético é autorizado por este plano de execução; envio externo, contratação, publicação, migração no destino e restore de dados reais exigem autorização específica e acesso apropriado.
- Ao descobrir decisão de negócio necessária, isolar somente a parte bloqueada e continuar o trabalho independente.

## Fila A — execução técnica sem decisão prévia de negócio

| Ordem | Fatia | Escopo concreto | Critério de saída |
|---|---|---|---|
| 01 | Status e guarda N1 | Reconciliar base/branch e tornar a validação compatível com a fotografia auditada e o ciclo de merge, preservando detecção de base inválida. | Casos positivos e negativos, histórico rastreável e suíte principal verde sem ignorar a guarda. |
| 02 | Runbook e contrato de ambiente | Conferir env por env contra runtime, corrigir SMTP/Ollama/chaves/comandos e checklist; nenhum valor real versionado. | Documentação executável em teste, nomes corretos e distinção entre requisito obrigatório e recurso opcional. |
| 03 | Diagnóstico de inicialização EXT-03 | Guardar cauda limitada e sanitizada de stdout/stderr, capturar saída precoce do filho e investigar falha antes de mudar prazo. | Erro informativo sem segredo; repetição isolada e sob carga com resultados registrados. |
| 04 | Ciclo de vida PostgreSQL de QA — piloto | Reproduzir cluster que não inicia/morre antes de stop; implementar prazo e limpeza segura em utilitário compatível e um runner piloto. | Falha rápida com exit não zero e ausência de órfãos; timeout não pode virar sucesso. |
| 05 | Ciclo de vida PostgreSQL — adoção | Migrar runners em grupos pequenos, mantendo particularidades e guardas local-only; tratar limpeza e falhas de spawn. | Regressão por grupo, testes negativos e rastreio dos runners ainda não migrados. |
| 06 | CI e equivalência de cobertura | Mapear scripts→arquivos→cenários→workflows; ligar só jornadas realmente órfãs, adicionar limites proporcionais e diagnóstico sempre que aplicável. | Mapa reproduzível; nenhum skip silencioso nem teste obrigatório removido; não confundir ausência literal com orfandade. |
| 07 | Transporte da fila administrativa | Conectar configuração MAIL_* já existente à fila, com transporte injetável e captura local, sem envio externo. | Testes de envio capturado, configuração ausente/inválida, retry, falha e prevenção de reenvio indevido; não afetar lead/portal. |
| 08 | Testes de segurança por escopo existente | Catalogar handlers/downloads e ampliar negativos A/B, sessões revogadas, 401/403, conta/unidade/contrato. Não inventar nova matriz CLI-02. | Matriz de cobertura ligada a testes; defeitos reproduzidos corrigidos preservando regra vigente; decisões separadas. |
| 09 | Ciclo staff→cliente | Exercitar criar/revisar/aprovar/publicar/ler/revogar nos recursos CLI-05…08 e corrigir lacunas demonstradas no contrato vigente. | Fluxo completo com cliente correto e indevido, banco e UI; sem declarar aceite humano. |
| 10 | Portal: estados e teclado | Subfatias por página, incluindo assistente/continuidade/segurança/portal; testar falha, vazio, negativa, releitura e teclado. | Evidência de navegador por página, sem apagar dados válidos na falha transitória nem mantê-los após negativa de autorização. |
| 11 | CRM/comercial/contratos | Subfatias por superfície: CRM, comercial, carteira, expansão e contratos; tratar somente lacunas reproduzidas. | Estados reais de rede e navegação registrados, ações/contratos preservados. |
| 12 | Financeiro/administrativo | Estados, foco, datas, repetição e acessibilidade sob regras já aprovadas; não ampliar C11. | Jornadas atuais preservadas e evidências por tela/papel. |
| 13 | RH e funcionário | Subfatias: solicitações/documentos, ponto/comprovante, comunicados/escala/cursos; simular rede e geolocalização de modo controlado. | Hash/comprovante e estados testados no contrato atual; sem afirmar HERE/dispositivo/eSocial real nem abrir borda RH. |
| 14 | Acessibilidade técnica | Foco, nomes acessíveis, formulários, teclado, zoom, responsividade e contraste mensurável; fundos complexos exigem revisão contextual. | Defeitos corrigidos com testes/capturas; checklist explícito do que ainda exige leitor de tela/UAT. |
| 15 | RAG independente de fornecedor | Testar isolamento de fontes por perfil, permissão, indisponibilidade, timeout e fallback; corrigir defeitos do caminho existente. | Cenários dos cinco perfis com provedor controlado, sem declarar qualidade ou entrega de modelo real. |
| 16 | Reauditoria técnica das 14 famílias/222 IDs | Trabalhar em lotes por família após gates confiáveis; verificar implementação, teste e lacuna real de cada ID. Criar gates faltantes quando houver contrato definido. | Evidência atual por ID; classes distintas: implementado/testado/bloqueado/aceite pendente. Ausência de gate não é automaticamente ausência de código. |
| 17 | Pré-validação operacional | Implementar/reforçar verificação de configuração, compatibilidade de migrações, diretórios privados, segredos presentes e healthchecks, sem exibir valores. | Modo somente leitura; mensagens acionáveis; não alterar destino nem substituir teste de restore. |
| 18 | Ensaio de recuperação sintética | Verificar possibilidade de disponibilizar pg_dump/pg_restore 17 no ambiente permitido; executar variantes existentes de DB+arquivos+assinatura/inventário e corrigir defeitos reproduzidos. | Restore sintético comprovado ou impedimento técnico registrado. Não instalar versão incompatível para obter verde; não é executor de produção. |
| 19 | Distribuição e rotas | Reforçar avisos/versionamento/manifests e regressão de paridade borda/dispatcher; preservar pacotes e aliases existentes. | Artefatos identificáveis e rotas verificadas. Remoção de pacotes/mudança de política de releases fica para decisão. Não fazer refatoração ampla do monólito. |
| 20 | Fechamento técnico | Rodar bateria consolidada, revisar regressões e publicar quadro final de pendências por responsável. | Nenhum vermelho omitido, evidência reproduzível, distinção clara entre pronto técnico e produção autorizada. |

Dependências principais: 01–03 primeiro; 04 antes de 05; 06 incorpora 05; 07 e 08 podem avançar independentemente; 09 depende dos contratos vigentes de 08; 10–14 em subfatias; 16 consolida 08–15; 20 é final. A fatia 18 pode ficar bloqueada pela disponibilidade das ferramentas no ambiente, sem bloquear o resto.

## Fila B — posso desenvolver, mas preciso primeiro de decisão delimitada

| Item | Parte técnica que posso executar | Decisão/acesso necessário |
|---|---|---|
| Backup de produção | Executor, consistência DB+arquivos, criptografia, catálogo, verificação, agendamento e restore seguro, em subfatias após desenho aprovado. | Quem opera; escopo/bytes; destino e credenciais por canal seguro; custódia/KMS; retenção; RPO/RTO; autorização para execução/restore real. API permanece fail-closed até cumprir gates. |
| CLI-02 | Aplicar e testar matriz papel×ação×escopo aprovada, sem ampliar permissões implícitas. | Regras de negócio aprovadas para papéis/conta/unidade/contrato. |
| Fiscal/pagamento/WhatsApp/eSocial/CFTV/biometria e EXT-16/17 | Adaptadores e testes de sandbox com idempotência, validação de retorno e observabilidade. | Escopo, fornecedor/API/contrato, base legal e autorização de testes externos. |
| IA real | Conectar/validar o provedor aprovado, recursos e comportamento no ambiente alvo. | Modelo/provedor, máquina/recursos, disponibilidade e critérios de qualidade do negócio. Não declarar todos os AI-01…10 encerrados pelo simples uso de mocks. |
| Academia | SSO ou contas próprias, persistência, integração com sistema e mídia em fatias compatíveis. | Modelo de autenticação; liberação do módulo; públicos/papel supervisor; conteúdo validado; estratégia de mídia e armazenamento. Não publicar uma solução arbitrária. |
| Retenção/LGPD | Execução controlada e auditada de política aprovada, incluindo exceções e impedimentos. | Base legal, prazos, categorias, responsável e aprovação jurídica; descarte real exige autorização. |
| D7/C11/legado RH | Implementar apenas alteração delimitada aprovada. | Decisão de escopo. Não reabrir o console esgotado nem ampliar RH/financeiro por iniciativa técnica. |
| Hospedagem/deploy | Configuração compatível, observabilidade, migração ensaiada e implantação assistida. | Host/domínio, orçamento, acesso seguro, responsável operacional e autorização explícita de publicação. |

## O que continuará realmente com o proprietário e Marcelo

- Decisões de negócio/acesso e responsáveis por área; aprovação da matriz de permissões.
- Escolha/contratação de serviços e infraestrutura; disponibilização segura de acessos, nunca em chat ou Git.
- Aprovação de conteúdo, identidade institucional, procedimentos internos e política LGPD, com os profissionais competentes quando necessário.
- Aprovação de RPO/RTO, retenção, custódia de chaves e responsável por backup.
- Operação/validação no Windows e dispositivos de campo quando não acessíveis ao agente. Posso preparar roteiros e diagnóstico e corrigir os defeitos encontrados.
- Aceite humano dos fluxos reais e autorização escrita para produção. Posso preparar e acompanhar UAT, mas não assinar em nome dos usuários.

Fornecedor, limitação de ambiente, revisão especializada ou acesso a hardware podem continuar sendo dependências externas: não devem ser artificialmente atribuídos ao proprietário/Marcelo nem declarados resolvidos por documentação.

## Protocolo de cada entrega

1. Declarar a fatia e critérios; conferir estado atual antes de editar.
2. Reproduzir/inventariar o que será tocado; preservar o que já funciona.
3. Implementar e testar positivo/negativo/regressão proporcional.
4. Informar arquivos, comandos, resultados e resíduo. Atualizar quadro apenas com evidência.
5. Continuar para a próxima fatia independente; parar somente a parte que precise de decisão explícita.

**Próxima execução recomendada:** o único runner restante da 05 é E6 administrativo, cujo baseline sofreu OOM; não repetir sem recursos adequados ou solução proporcional, nem reduzir sua cobertura. Na 06, a 06B fechou o mapa reproduzível (`npm run qa:ci-map:check`) e os gates órfãos, e a 06C expôs `auditoria_tap` por comando no CSV/relatório com trava `TAP_AUDIT_ALLOWLIST` e migrou os 9 gates prioritários (`ci.yml` PU4 browser, F01 `admin-entry` e toda a família L `L02..L08`, levando `auditado_tap` de 44 para 53 e reduzindo `sem_auditoria_tap` de 34 para 25). A fatia **06D** atacou os 25 resíduos declarados em lote único pela ordem registrada na allowlist (`03-familia-f03` com 4 runners e `04-familia-ux` com 19 runners, corrigindo o ramo condicional `0` de `qa-ux-emergency-postgres.mjs`), levando `auditado_tap` 53→76 e `sem_auditoria` 25→2; restam apenas `qa-evidence-report.mjs` (agregador sem piso) e `client-security` (N8 sob observação aberta, intocado para não mascarar a causa raiz), sem reabrir 06A/06B/06C. Não confundir supervisão ou mapa de CI com aceite operacional ou fechamento client-security/N8. Registrar e tratar isolamento de gerados antes de afirmar concorrência global de gates no mesmo checkout. A fatia 05 não está encerrada; matriz em ADOCAO-POSTGRES.csv. Este plano organiza e delimita a autorização técnica; não autoriza envio real, gastos, deploy ou alterações destrutivas.

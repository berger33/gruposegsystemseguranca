# Plano mestre de testes — SEG System (estratégia aprovada)

Data-base: 2026-09-28. Branch auditada: `arena/01a0e96a-gruposegsystemseguranca` @ `5b4b200`. Fonte técnica: [auditoria da Fase 0](qa-auditoria-fase0.md). **Estratégia de testes aprovada pelo usuário nesta conversa; não é aprovação de requisitos, metas provisórias, publicação, negócio ou conformidade legal.** Fase 1 completa neste documento; Fase 2 inicia pela [Onda 0 detalhada](qa-casos-onda0.md), com execução por blocos seguros na Fase 3. IDs de risco e cobertura seguem `MÓDULO-CATEGORIA-NNN`.

## 1. Resumo executivo e premissas

- **PLT-PLAN-001:** objetivo: evidenciar comportamento, isolamento, segurança, integridade financeira/trabalhista e capacidade operacional sem confundir telas demonstrativas ou integrações simuladas com produto homologado. Os 222 requisitos do controle são entrada de rastreabilidade, não prova de aceitação.
- **PLT-PLAN-002:** na descoberta, a baseline não iniciava (`server.mjs` importava 85 arquivos inexistentes), não passava build/typecheck nem suíte completa; o ZIP beta tinha arquivos ausentes e **28 caminhos comuns divergentes** no checkout limpo. Após [reparo local controlado](evidencias/QA-onda0-reparo-controlado.md), smoke/beta passou, mas CI remoto, PG completo e isolamento permanecem bloqueados. **NO-GO** para release/produção, sem inferir que todas as funcionalidades estejam defeituosas.
- **TENANT-PLAN-001:** único fato de negócio informado: existe matriz, sem filiais ativas. A aplicação modela contas de clientes e unidades futuras; não há evidência de dois tenants reais ativos nem do isolamento de todos os módulos. Testes A/B utilizarão contas **sintéticas e isoladas** em staging/local controlado.
- **SEG-PLAN-001:** o agente executa apenas automação segura disponível no workspace local; UAT de pessoas representativas, decisões trabalhistas/fiscais e autorização de testes intrusivos pertencem aos responsáveis humanos. Falhas estáticas levantam hipótese a verificar por teste, sem exploração externa.
- **PLT-PLAN-003:** ambientes externos, time, prazo, volume real, SLA, RTO/RPO, políticas e provedores não confirmados. Metas de ensaio e estimativas das próximas seções serão **propostas sujeitas à aprovação**; indisponibilidade não vira `PASSOU` nem `N/A`.
- **INT-PLAN-001:** módulos existentes só no ZIP são `candidato à verificação após reconciliação`; monitoramento 24h de verdade, vídeo, biometria, app nativo, envio fiscal/folha/fornecedor e cobrança real não serão presumidos. RAG sem Ollama é fallback demonstrativo.

### Convenção de estados

**Executável neste checkout:** teste puro local; **bloqueado:** depende de reparo/reconciliação e ambiente isolado; **condicional:** requisito/provedor/aprovação não confirmados; **fora por ora:** operação real externa/prod e técnicas não autorizadas; **N/A:** apenas quando comprovadamente inexistente no produto-alvo, nunca só porque o código falta.

## 2. Matriz de riscos priorizada

Escala de planejamento: impacto I=1–5 (1 pequeno; 5 vazamento, passivo relevante ou risco à vida/operação), probabilidade P=1–5 (estimativa **subjetiva** a recalibrar com dados), score=I×P. P0: ≥16 ou gate de segurança/vida; P1: 10–15; P2: 5–9. Scores não são requisitos contratuais.

| ID | Risco / evidência | I×P | Prioridade | Mitigação e evidência exigida |
|---|---|---:|---|---|
| PLT-RISCO-001 | Fonte incompleta: 85 imports ausentes, 88 migrações ausentes; build, execução e regressão não reproduzíveis | 5×5=25 | P0 | reconciliar sem sobrescrever diferenças; `npm ci`, suíte, typecheck, build, import, migração idempotente e smoke em cada baseline |
| TENANT-RISCO-001 | Acesso cruzado entre contas/unidades/contratos, incluindo exceções ignoradas no filtro (`client-space-api.mjs:138-155,197-220`) | 5×4=20 | P0 | corrigir fail-open; A/B com grant válido/revogado/restrito e falha injetada; 403 genérico, sem byte/linha de B, auditoria |
| ACESSO-RISCO-001 | Papéis/tokens legados e RBAC divergentes expõem RH/cliente/financeiro a não autorizados | 5×4=20 | P0 | matriz papel×módulo×ação×escopo, API negativa, sessão expirada, MFA e trilha; desligar legado somente com migração aprovada |
| MON-RISCO-001 | Confundir fila OPS-16 com central 24h: alerta não atendido, indisponibilidade ou falso SLA | 5×4=20 | P0 | classificar como **não operacional** até conector real e simulação controlada com protocolo, ACK, escalonamento e failover; operador valida SLA |
| PONTO-RISCO-001 | Marcações/jornada/virada, antifraude e folha erradas podem gerar passivo trabalhista | 5×3=15 | P0 por impacto legal | casos de limite e tabela de decisão em dados sintéticos; contador/advogado aprova regras CLT/CCT/Portaria antes de oráculo definitivo |
| FIN-RISCO-001 | Fatura/cobrança/folha/medição divergentes ou duplicadas; gateway sem idempotência | 5×3=15 | P0 por financeiro | conciliação de centavos e competências, autorização dupla, replay em sandbox; jamais cobrança real automática |
| LGPD-RISCO-001 | Divulgação/retention indevida de dados de saúde/documentos; política publicada declara aprovação contraditória | 5×3=15 | P0 por privacidade | confirmar documento aprovado; perfis mínimos, acesso auditado, anonimização/restauração controlada; dados sintéticos |
| BACKUP-RISCO-001 | Backup não restaurável ou restauração cruza escopos/ambientes | 5×3=15 | P1 | restore somente em cópia isolada, checksums/contagens por tenant, RTO/RPO sob aprovação |
| INT-RISCO-001 | Falha externa (SMTP, Ollama, mensagens, sensores, fiscal) é mascarada por fallback/demonstração | 4×4=16 | P0 quando afeta alerta | contrato de API, timeouts, retry/idempotência, marcação de simulação, testes com stub/captura, sanidade de fornecedor |
| QA-RISCO-001 | `npm test` falha e smoke não sobe; CI somente no ZIP mascara regressões | 4×5=20 | P0 gate | CI na árvore fonte; separar unit/integration e impedir skip silencioso; evidências e relatório de saída |
| A11Y-RISCO-001 | Portaria/clientes não conseguem completar jornada em dispositivos/tecnologias assistivas | 3×3=9 | P2 | WCAG 2.2 AA **alvo proposto**, auditoria manual + axe, fluxos teclado/leitor de tela em dispositivos confirmados |

## 3. Estratégia de testes

- **PLT-ESTR-001 — pirâmide:** base unitária (validações, limites, transições e decisões determinísticas), meio integração/API/contrato com PostgreSQL isolado e mocks de fornecedor, topo E2E de fluxos críticos e UAT humano. Testes de API positivos/negativos não se substituem por screenshots nem pelo ZIP.
- **TENANT-ESTR-001 — negativo primeiro:** fixtures de duas contas fictícias A/B, identidade cliente A, staff RH, Marcelo e TI; testar listagem, busca, detalhe, criação, download e export com ID de B, grant revogado, conta suspensa, contrato com allowlist vazia, erro no verificador de escopo. Aprovação exige **0 registros/bytes de B** e resposta 403 ou 503 especificada; 404 pode ser equivalente se política aprovar. Nunca usar dados reais.
- **PONTO-ESTR-001 — oráculos independentes:** partição de equivalência (marcação normal/fora de ordem/duplicada), valores limite 07:59/08:00 e 23:59/00:00, tabela de decisão para noturno/extra/feriado após validação legal, transição de estados de ajuste, pairwise papel×dispositivo×rede, error guessing de relógio/GPS adulterado. Cálculo esperado somente após aprovação da regra trabalhista aplicável.
- **MON-ESTR-001 — segurança física:** sintético/controlado para evento→fila→reconhecimento→escalonamento e ACK; falhas e pico só em staging isolado autorizado, sem acionar centrais, vigilantes ou emergência reais. Até existir operação real, testar contrato/modelo de dados e rotular resultado `não validado operacionalmente`.
- **SEG-ESTR-001 — automação e revisão:** unidade no Node test; API em Node com fixtures e banco efêmero; Playwright E2E quando checkout iniciar; análise SAST/segredos/dependências em CI, DAST/pentest somente staging autorizado; auditoria manual de RBAC, LGPD e acessibilidade. SAST/scan encontra hipótese, não prova exploração nem conformidade.
- **PLT-ESTR-002 — ondas e gates:** onda 0 integridade/build/segurança fail-open, onda 1 isolamento e identidade, onda 2 ponto/monitoramento (conforme implementação), onda 3 financeiro/RH/integrações, onda 4 transversal/resiliência/UAT. Cada falha P0 suspende promoção, não bloqueia investigação segura. Retestes dirigidos seguidos de regressão automatizada.
- **QA-ESTR-001 — classificação:** `PASSOU` requer comando, commit, ambiente, massa sintética, resultado esperado/obtido e evidência; `FALHOU` requer defeito; `BLOQUEADO` explica dependência; `N/A` exige decisão justificada. Histórico do lote 58 não substitui resultado do checkout atual.

## 4. Escopo — executável, condicionado ou fora

### A. Transversais

- **PLT-ESCOPO-001:** unitário, integração, sistema, E2E, API, contrato, smoke, sanity, regressão, exploratório e UAT **dentro do plano**; no checkout atual somente unitários puros executáveis. Exploratórios e UAT demandam ambiente funcional e usuário representativo.
- **PLT-ESCOPO-002:** carga, estresse, spike, soak, escalabilidade, failover, timeout/retry, backup/restore/DR, deploy/migração/rollback/zero-downtime e observabilidade (logs, alertas, métricas) **dentro condicional** a staging local/controlado, base executável, instrumentação e autorização específica. Não aplicá-los a produção nem à central real.
- **SEG-ESCOPO-001:** OWASP Top 10, SAST/DAST, pentest, dependências, segredos, IDOR, escalonamento e auditoria de acessos **no plano**; revisão estática segura agora; scanners ativos/pentest **fora da execução presente** sem staging autorizado.
- **UX-ESCOPO-001:** usabilidade, WCAG, browsers, viewport, Android/iOS e resoluções **no plano**; app nativo é condicional/não evidenciado, não se marca N/A para web mobile/PWA até auditoria do ZIP/execução. pt-BR, fuso, data, moeda, CPF/CNPJ condicionais a regra de negócio aprovada; não assumir cálculo fiscal.

### B. SaaS, C. LGPD e D. módulos

- **TENANT-ESCOPO-001:** isolamento A/B em contas, unidades/postos, papéis, documentos, logs, RAG e exports é prioridade P0. Planos, limites, assinatura, onboarding, flags/API versioning e white-label/temas **na matriz**, com resultado `condicional` se implementação ou regra de negócio inexistente; não tratar plano comercial como cobrança ativa.
- **LGPD-ESCOPO-001:** consentimento, acesso/exclusão/portabilidade, retenção/anonimização, biometria/saúde/documentos e quem acessou o quê **no plano**; somente dados sintéticos. Biometria/vídeo real dependem de projeto/avaliação próprios; políticas genéricas são minuta, nunca conformidade aprovada.
- **ACESSO-ESCOPO-001:** login/logout, reset, MFA, senha, lockout, sessão, RBAC, convite/desativação e auditoria; portal cliente e staff conforme código, demais papéis condicionais a reconciliação.
- **CLI-ESCOPO-001:** CRUD/CPF/CNPJ, matriz/filial/posto, contrato/anexo, status, importação e isolamento; não há filial ativa hoje, mas cenários sintéticos de filial são necessários para validar regra futura.
- **PONTO-ESCOPO-001:** marcação/intervalo/duplicidade/fora do horário, geofence/foto/biometria/GPS/dispositivo, 12x36/noturno/extra/banco, ajustes/espelho, feriado/DST/fuso/Portaria 671, offline/sync/rede/bateria/permissões/push/versões, ocorrências/visitantes/encomendas/QR/NFC/rondas/passagem/cobertura/pânico. **Tudo na cobertura planejada; execução condicional** à implementação, dispositivos e oráculos homologados; não alegar conformidade Portaria.
- **MON-ESCOPO-001:** evento/latência/prioridade/fila/SLA/acionamento, heartbeat, câmeras/Contact ID/SIA, webhooks/push/SMS/WhatsApp, falha externa, gravação e rajada; apenas modelo/fila estão descritos no ZIP, não central real. Integração e retenção de gravações condicionais; operação de emergência real fora do teste.
- **RH-ESCOPO-001:** admissão, férias, afastamentos, vencimentos/CNV/ASO, folha, ponto→RH, benefícios, rescisão, recrutamento, eSocial e dados sensíveis; execução de cálculos/fiscal condicionada a regras aprovadas e fonte íntegra.
- **TI-ESCOPO-001:** chamados/SLA, ativos, chaves, dispositivos, trilhas, perfis, backup e infraestrutura; **COM-ESCOPO-001:** lead/funil, preço/margem, proposta→contrato, reajuste, comissão, PDF/assinatura; **FIN-ESCOPO-001:** medição→fatura, boleto/PIX/nota, contas, conciliação, fechamento, relatórios/exportações e alçadas. Nenhum envio/cobrança real em teste.
- **INT-ESCOPO-001:** ponto→RH→financeiro→cliente, propagação, idempotência, transação parcial e reconciliação entre módulos **dentro do plano, bloqueado na execução até árvore executável**.

### E. Técnicas de projeto

- **QA-ESCOPO-001:** equivalência, limites, tabela de decisão, transição de estados, pairwise, error guessing e priorização por risco são obrigatórios ao detalhar casos; cada caso completo terá dados, oráculo, evidência e rastreio ao risco/requisito. Exemplos numéricos só se tornarão regra após aprovação humana.

**Não se aplica comprovado neste checkout:** instalação de aplicativo **nativo** Android/iOS como binário: nenhum projeto nativo identificado; testar browser mobile/PWA quando executável. **Não se aplica ao teste presente, mas não ao produto-alvo:** operação de central 24h, câmera/vídeo/biometria reais, pagamentos/folha/nota/eSocial reais por falta de implementação/fornecedor/autorizações comprovadas. Essas frentes ficam `condicionais/bloqueadas`, não concluídas.



## 5. Ambientes, dados sintéticos e ferramentas

| ID | Ambiente / finalidade | Isolamento, pré-condição e permissão |
|---|---|---|
| PLT-AMB-001 | E0 — checkout local, regras puras, verificação estática, build | Disponível; sem banco/dados de usuários, sem rede externa. Registrar commit e versão Node. `npm test` falha nesta baseline: não mascarar por execução seletiva. |
| PLT-AMB-002 | E1 — aplicação local + PGlite beta | **Bloqueado** até dependências/imports reconciliados; usar diretório temporário exclusivo da suíte, portas de loopback e `MAIL_HOST` vazio ou SMTP de captura local. Não prometer que schema mínimo valida fluxo completo. |
| PLT-AMB-003 | E2 — PostgreSQL de teste isolado, migrações completas | **Bloqueado** até restaurar migrações, disponibilizar servidor/contêiner de teste e conexão dedicada. Banco/nome/usuário exclusivos; não apontar `DATABASE_URL` de teste para banco externo ou produção. |
| PLT-AMB-004 | E3 — staging integrado controlado | **Não identificado/autorizado**. Somente após URL, titular do ambiente, janela e autorização específica; condição obrigatória para carga/DAST/pentest/failover e simuladores de hardware. |
| PLT-AMB-005 | E4 — produção | **Fora da execução**: nenhum teste destrutivo, de carga, invasivo, com cobrança, folha, alarmes ou mensagens reais. Eventual observação passiva exige autorização expressa e políticas aprovadas. |

- **QA-DADOS-001:** criar duas contas fictícias A/B (`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` e `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`), usuários `cliente-a@example.invalid`, `cliente-b@example.invalid`, `rh@example.invalid`, `ti@example.invalid`; um posto/unidade fictício por conta, 2 contratos por conta, 1 arquivo de 17 bytes com marcador `QA-CONTA-B-NAO-EXIBIR` (somente no banco/arquivo temporário de teste), grants A ativo/revogado/restrito. Falha de isolamento = qualquer byte do marcador B, ID B ou metadado B retornado à sessão A. Senhas/tokens gerados durante teste e nunca versionados/logados.
- **PONTO-DADOS-001:** registros sintéticos em `America/Sao_Paulo`: 2026-09-28 23:59:00 → 2026-09-29 00:00:00; durações 07:59, 08:00 e 08:01; sequência entrada, início/fim intervalo, saída; duplicidade por mesma chave de idempotência; variantes de rede offline e de permissão negada. Esses números são **entradas de teste**, não regras sobre hora extra/adicional. Para DST, usar data histórica com mudança comprovada e fuso IANA se houver suporte, sem assumir horário de verão vigente.
- **FIN-DADOS-001:** valores fictícios em centavos R$ 0,00 / 0,01 / 100,00 / 100,01, duas competências e duas faturas de A; CNPJ/CPF somente de geração local por dígito verificador, marcados `sintético`, sem consultar cadastro de terceiros. Eventos mock com IDs idempotentes; número de nota, boleto e Pix **não válidos para pagamento**.
- **MON-DADOS-001:** eventos fictícios `QA-ALARME-A-001` e `QA-ALARME-B-001`, relógio controlado, gravidade média/crítica e heartbeat simulado; não enviar a fornecedor/central/emergência. Gravação de vídeo/biometria reais nunca são massa de teste default.
- **PLT-FERR-001:** ferramentas adequadas à stack: `node --test`, `tsc`, `next build`, test runner HTTP Node + Postgres de teste, Playwright + axe-core para web/E2E/acessibilidade, teste de contrato de JSON/OpenAPI quando contrato for aprovado, `npm audit`/scanner de segredos/Semgrep em CI como ferramentas sugeridas. Nenhuma dessas ferramentas extras está declarada instalada só por constar no plano.
- **PLT-FERR-002:** k6/JMeter para carga, OWASP ZAP/DAST e pentest humano **apenas E3 autorizado** com teto e janela documentados; Appium apenas se existir app nativo, senão Playwright mobile/PWA. Usar SMTP de captura e stubs de Ollama/webhook/sensor em E1/E2; simulação não comprova entrega em fornecedor real.
- **PLT-AMB-006:** teardown permitido somente de banco/arquivo temporário criados pela suíte e identificados explicitamente; nunca executar `rm` genérico, limpar banco compartilhado ou publicar ZIP/URL de túnel como substituto de staging.

## 6. Matriz de cobertura atual — módulos × categorias

**Definição:** T = cobertura total **com evidência válida** para a categoria aplicável; P = evidência parcial (código, teste puro ou histórico não reproduzido); N = nenhuma evidência executável suficiente nesta baseline. Não é percentual de implementação. Colunas: F = funcional/API/E2E/contrato; S = segurança/RBAC/isolamento; Q = desempenho/resiliência; U = UX/WCAG/compatibilidade/localização; L = LGPD/auditoria; O = deploy/migração/backup/observabilidade. Nenhum T é atribuído enquanto build e servidor estão bloqueados. `N` **não quer dizer** que o requisito não se aplica.

| ID / módulo | F | S | Q | U | L | O | Base do julgamento |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| PLT-COB-001 Plataforma/CI | P | P | N | N | N | P | testes puros, config e docs; build falha, CI só no ZIP |
| ACESSO-COB-001 Identidade/RBAC | P | P | N | P | P | N | regra pura de senha/login; E2E PG skipped, papel staff não validado |
| CLIENTE-COB-001 Clientes/contratos | P | P | N | P | P | N | validação pura, SQL/API; filtro falha potencial, integração skipped |
| PONTO-COB-001 Ponto/mobile | N | N | N | N | N | N | fonte dos módulos só no ZIP, sem runtime e sem oráculo legal |
| PORTARIA-COB-001 Portaria/visitas/rondas | N | N | N | N | N | N | fonte dos módulos só no ZIP, sem integração validada |
| MON-COB-001 Monitoramento/alertas | N | N | N | N | N | N | somente handlers/modelo no ZIP; não é central 24h |
| RH-COB-001 RH/folha | N | N | N | N | N | N | módulos ausentes do checkout; hipóteses legais pendentes |
| TI-COB-001 TI/infra | P | P | N | P | N | N | tela descritiva e configurações; módulos operacionais ausentes |
| COM-COB-001 Comercial/contratos | P | N | N | P | P | N | lead e catálogo puros; CRM e proposta ausentes da árvore |
| FIN-COB-001 Financeiro/fiscal | N | N | N | N | N | N | módulos de fonte apenas no ZIP; sem provedor homologado |
| INT-COB-001 Fluxos entre módulos | N | N | N | N | N | N | bloqueados por módulos/migrações ausentes |
| SAAS-COB-001 Tenant/planos/onboarding/flags/temas | P | P | N | P | N | N | contas/grants e 10 prévias, sem prova multi-tenant integral |
| LGPD-COB-001 Direitos/retenção/dados sensíveis | P | P | N | P | P | N | página e trilhas parciais; status jurídico contraditório |
| RAG-COB-001 RAG/bot/FAQ | P | P | N | P | P | N | código e testes históricos; integração desta baseline não rodou |

**PLT-COB-002:** objetivo após reconciliação: rastrear todo requisito aplicável dos 222 IDs a pelo menos um caso ou decisão explícita `condicional/N/A`; no ciclo de release, medir cobertura por **casos executados e evidência**, não por quantidade de páginas, rotas ou claims do README. O campo “T” só pode ser preenchido após execução dos tipos pertinentes à categoria.

## 7. Casos de teste de alto nível (catálogo inicial)

A tabela define **título, prioridade P0–P3 e tipo/técnica**; Fase 2 fornecerá pré-condições, passos, massa e resultado por caso. IDs são novos IDs de **teste**, distintos dos 222 IDs de requisito. `P0` não autoriza execução em ambiente externo. Vínculo a risco/requisito será registrado na ficha detalhada antes da execução.

### Plataforma e transversais

| ID | Título | Prioridade | Tipo / técnica |
|---|---|:---:|---|
| PLT-SMK-001 | Checkout íntegro: imports, dependências, typecheck, build e servidor inicializam | P0 | smoke/sistema |
| PLT-CI-001 | CI não mascara falhas, skips ou ausência de migração | P0 | regressão/contrato de pipeline |
| PLT-MIG-001 | Migração 001–096 idempotente em PostgreSQL isolado e rollback controlado | P0 | integração/deploy |
| PLT-API-001 | Contratos HTTP: método, validação, origem, erro genérico e versionamento | P1 | API/contrato/limites |
| PLT-FUNC-001 | Sanity após correção e regressão do fluxo público → lead → painel | P1 | sistema/E2E/regressão |
| PLT-PERF-001 | Carga graduada com latência p50/p95/p99 e erros | P1 | carga, staging autorizado |
| PLT-PERF-002 | Estresse até limite aceito e recuperação sem perda | P2 | estresse, staging autorizado |
| PLT-PERF-003 | Rajada súbita e escalabilidade horizontal | P1 | spike/escalabilidade, staging autorizado |
| PLT-PERF-004 | Execução longa com memória/fila estável | P2 | soak, staging autorizado |
| PLT-RES-001 | Timeout/retry/idempotência após queda de serviço externo | P0 | integração/resiliência/falha injetada |
| PLT-RES-002 | Failover sem perda/duplicação de evento | P1 | resiliência, staging autorizado |
| PLT-BAK-001 | Backup consistente e restore em ambiente isolado | P0 | DR/integração |
| PLT-DEP-001 | Deploy compatível, rollback e atualização sem downtime | P1 | deploy/migração |
| PLT-OBS-001 | Log sem segredos, métricas/alerta gerados e correlacionados por protocolo | P1 | observabilidade |
| PLT-SEG-001 | SAST, dependências, segredos e revisão OWASP Top 10 | P0 | estático/segurança |
| PLT-SEG-002 | DAST e pentest com escopo e autorização explícitos | P1 | segurança em staging |
| PLT-UX-001 | Navegação por teclado, leitor de tela e WCAG objetivo | P2 | acessibilidade/manual+axe |
| PLT-UX-002 | Chrome/Firefox/Safari, 320/768/1440 px e web mobile | P2 | compatibilidade/pairwise |
| PLT-LOC-001 | Datas UTC↔São Paulo, moeda centavos e pt-BR | P1 | equivalência/limite |
| PLT-LOC-002 | CPF/CNPJ sintético: dígitos válidos/inválidos, máscara e unicidade | P1 | equivalência/limite |
| PLT-EXP-001 | Exploratório de caminhos vazios, erro, navegação e rótulo demo | P2 | exploratório/error guessing |
| PLT-UAT-001 | Usuários representativos completam tarefa crítica sem orientação | P1 | aceitação/UAT humano |

### SaaS, contas, identidade e privacidade

| ID | Título | Prioridade | Tipo / técnica |
|---|---|:---:|---|
| TENANT-SEG-001 | Cliente A não lê/escreve/exporta recursos da conta B | P0 | API/IDOR/negação |
| TENANT-SEG-002 | Falha na consulta de unidade ou allowlist de contratos nega acesso | P0 | integração/falha injetada |
| TENANT-SEG-003 | Matriz/filial/posto e grants revogados/suspensos não ampliam escopo | P0 | transição/pairwise |
| SAAS-FUNC-001 | Onboarding cria conta isolada sem acesso a outra conta | P1 | E2E/estado |
| SAAS-FUNC-002 | Planos/limites e assinatura não geram cobrança sem configuração aprovada | P1 | decisão/API, condicional |
| SAAS-CON-001 | Flags desligadas, mudança de versão API e fallback mantêm contrato | P1 | contrato/regressão |
| SAAS-UX-001 | Tema/white-label aplica preferência com rollback sem vazamento | P2 | UX/regressão, condicional |
| ACESSO-FUNC-001 | Convite, confirmação, login/logout e recuperação, expiração/uso único | P0 | integração/E2E/transição |
| ACESSO-SEG-001 | MFA, revogação, sessão expirada e mudança de papel negam reuso | P0 | segurança/API |
| ACESSO-SEG-002 | RBAC por papel×módulo×ação×escopo, cliente/RH/TI/Marcelo | P0 | pairwise/negativo |
| ACESSO-SEG-003 | IDOR, CSRF/origem, elevação de privilégio e token legado | P0 | segurança/API negativa |
| ACESSO-FUNC-002 | Senha 11/12/13 caracteres e 4/5/6 falhas de login | P1 | limite/estado |
| ACESSO-OBS-001 | Auditoria de login e permissão guarda ator/ação/resultado sem credencial | P0 | integração/observabilidade |
| CLIENTE-FUNC-001 | CRUD cliente, CPF/CNPJ sintético e importação duplicada | P1 | API/equivalência, condicional |
| CLIENTE-FUNC-002 | Contratos/anexos por conta com status ativo→suspenso→encerrado | P0 | estado/E2E |
| CLIENTE-SEG-001 | Download/listagem documento de B e grant restrito retornam negação | P0 | IDOR/integração |
| CLIENTE-FUNC-003 | Chamado, filial/posto e propagação da suspensão aos acessos | P1 | integração/transição |
| CLIENTE-OBS-001 | Alteração de contrato e download registram trilha mínima autorizada | P1 | auditoria |
| LGPD-FUNC-001 | Consentimento e revogação, sem bloquear base legal distinta | P1 | tabela de decisão, validação jurídica |
| LGPD-FUNC-002 | Acesso, exclusão e portabilidade: escopo, prazo e exceções aprovadas | P0 | API/integração, condicional |
| LGPD-SEG-001 | Saúde, documentos, biometria e vídeo negados a papéis indevidos | P0 | matriz/IDOR |
| LGPD-OBS-001 | Quem acessou quê, quando, motivo, retenção e descarte comprováveis | P0 | auditoria/integração |
| LGPD-RES-001 | Retenção e anonimização coerentes com backup/restauração | P1 | DR/estado, condicional |
| LGPD-UX-001 | Texto público de privacidade corresponde à versão formal aprovada | P0 | contrato/revisão humana |

### Funcionários, ponto e operação de portaria

| ID | Título | Prioridade | Tipo / técnica |
|---|---|:---:|---|
| PONTO-FUNC-001 | Entrada→intervalo→retorno→saída, evento duplicado e fora de ordem | P0 | integração/transição/idempotência |
| PONTO-FUNC-002 | Virada 23:59→00:00; durações 07:59/08:00/08:01 em fuso da unidade | P0 | limite/localização |
| PONTO-FUNC-003 | Jornada 12x36, noturno, extra, feriado, falta, atraso e banco de horas | P0 | tabela de decisão com oráculo legal aprovado |
| PONTO-FUNC-004 | Ajuste/justificativa/espelho mantém original, motivo, autor e revisão | P0 | estado/auditoria |
| PONTO-SEG-001 | Funcionário de A não registra/ajusta/consulta ponto ou salário de B | P0 | IDOR/RBAC/negação |
| PONTO-SEG-002 | Geofence, foto/biometria, GPS falso e troca de dispositivo | P1 | antifraude, condicional à implementação e privacidade |
| PONTO-CON-001 | Portaria 671/2021: requisitos técnicos/documentais segundo parecer validado | P0 | conformidade condicional; não é certificação |
| PONTO-MOB-001 | Offline: fila e sincronização sem perda/duplicação após reconexão | P0 | mobile web/PWA/resiliência |
| PONTO-MOB-002 | Rede instável, bateria, permissão negada, push e versão anterior | P1 | compatibilidade/error guessing, condicional |
| PONTO-LOC-001 | Feriado local e DST histórico: instante UTC, exibição e competência | P1 | limite, fuso IANA |
| PORTARIA-FUNC-001 | Visitante e QR: autorização válida, expiração e tentativa de reuso | P1 | estado/API, condicional |
| PORTARIA-FUNC-002 | Encomenda e livro de ocorrências com vínculo posto/turno e auditoria | P1 | E2E/API, condicional |
| PORTARIA-FUNC-003 | Ronda NFC/QR e passagem de plantão sem perda/duplicação | P1 | integração/resiliência, condicional |
| PORTARIA-FUNC-004 | Cobertura de posto preserva responsável e escalonamento | P0 | transição/integração, condicional |
| PORTARIA-SEG-001 | Botão de pânico simulado e restrito não aciona equipe real em testes | P0 | segurança física/contrato, condicional |

### Monitoramento e RH

| ID | Título | Prioridade | Tipo / técnica |
|---|---|:---:|---|
| MON-FUNC-001 | Evento sintético recebido, protocolo único e fila com ordenação por prioridade | P0 | integração/API/estado |
| MON-FUNC-002 | Reconhecimento, SLA, escalonamento e atribuição sem evento órfão | P0 | E2E/transição, condicional |
| MON-PERF-001 | Latência ponta a ponta de evento→operador e rajada com zero perda | P0 | desempenho/spike, somente staging autorizado |
| MON-RES-001 | Falha do conector, heartbeat ausente e fallback/alerta acionável | P0 | resiliência/falha injetada |
| MON-CON-001 | Contrato Contact ID/SIA e integração de câmera apenas com simulador | P1 | contrato de fornecedor, condicional |
| MON-INT-001 | Webhook/push/SMS/WhatsApp: assinatura, retry, replay e indisponibilidade | P0 | integração/idempotência, sandbox |
| MON-LGPD-001 | Retenção e autorização de gravação sem vazamento entre contas | P0 | LGPD/segurança, condicional a vídeo real |
| MON-UAT-001 | Operador reconhece e transfere alerta crítico sob roteiro aprovado | P0 | UAT humano; não equivale a central 24h |
| RH-FUNC-001 | Admissão/recrutamento e permissões sem dados sensíveis indevidos | P1 | E2E/RBAC |
| RH-FUNC-002 | Férias, afastamentos e alertas de CNV/ASO/curso nos limites aprovados | P0 | limites/estado com oráculo humano |
| RH-FUNC-003 | Ponto→fechamento→folha/benefícios sem diferença de centavos | P0 | integração/reconciliação |
| RH-FUNC-004 | Rescisão e cálculo trabalhista por regra/convenção validada | P0 | decisão/limites, condicional |
| RH-CON-001 | eSocial/exportação gera payload/recibo e trata rejeição/replay em sandbox | P1 | contrato, condicional |
| RH-SEG-001 | Saúde, holerites e salário restritos a papéis/colaboradores autorizados | P0 | RBAC/IDOR/LGPD |
| RH-OBS-001 | Ajuste de ponto e fechamento de folha têm trilha e aprovação humana | P0 | auditoria/estado |

### TI, comercial e administrativo/financeiro

| ID | Título | Prioridade | Tipo / técnica |
|---|---|:---:|---|
| TI-FUNC-001 | Chamado/SLA e atualização de ativo sem cruzar conta | P1 | API/transição |
| TI-SEG-001 | Chave API criada/rotacionada/revogada não reaparece em logs ou resposta | P0 | segurança/segredos |
| TI-SEG-002 | Administrador com e sem permissão: acesso a log, backup e config | P0 | RBAC/negação |
| TI-OBS-001 | Logs/alertas de saúde e backup registram falha real e correlação | P1 | observabilidade |
| TI-RES-001 | Dispositivo fica offline/volta sem elevar permissão nem perder histórico | P1 | resiliência |
| COM-FUNC-001 | Lead, consentimento, deduplicação, funil e origem sem preço fictício | P1 | unitário/API/E2E |
| COM-FUNC-002 | Precificação de posto: custos/impostos/margem e alçadas aprovados | P0 | decisão/limites, condicional |
| COM-FUNC-003 | Proposta versão→PDF→aceite→contrato→cliente ativo sem duplicar | P0 | integração/E2E/idempotência |
| COM-FUNC-004 | Renovação/reajuste e comissões em competência aprovada | P1 | estado/limite |
| COM-CON-001 | Assinatura digital e PDF acessível/imutável em sandbox | P1 | contrato/acessibilidade, condicional |
| COM-SEG-001 | Proposta de A e margem interna não visíveis ao cliente B | P0 | IDOR/RBAC |
| FIN-FUNC-001 | Medição de posto/ponto→fatura confere centavos e competência | P0 | integração/reconciliação |
| FIN-FUNC-002 | Contas a pagar/receber, parcial/estorno e fechamento sem duplicar | P0 | estado/idempotência |
| FIN-FUNC-003 | Conciliação e relatórios/exportações somam centavos ao razão-fonte | P0 | reconciliação/limites |
| FIN-SEG-001 | Alçada segregada: solicitante não aprova próprio pagamento | P0 | RBAC/tabela de decisão |
| FIN-INT-001 | Boleto/PIX: webhook assinado, replay, charge duplicada, conciliação | P0 | contrato em sandbox; sem pagamento real |
| FIN-CON-001 | NF-e/NFS-e/outro documento: tipo correto conforme parecer fiscal | P1 | conformidade condicional, sem emissão real |
| FIN-OBS-001 | Estorno/fechamento/reabertura geram trilha imutável verificável | P0 | auditoria/estado |
| FIN-SEG-002 | Exportação financeira de A não revela conta B nem folha/PII | P0 | segurança/IDOR |

### Integração entre módulos e RAG/FAQ

| ID | Título | Prioridade | Tipo / técnica |
|---|---|:---:|---|
| INT-E2E-001 | Ponto→RH→financeiro→cliente: mesmos fatos e competência | P0 | E2E/reconciliação |
| INT-RES-001 | Falha no 2º passo não deixa cobrança/folha parcial sem compensação | P0 | transação parcial/falha injetada |
| INT-FUNC-001 | Alteração de contrato/posto propaga para escala, fatura e permissões | P0 | integração/transição |
| INT-CON-001 | Reprocessamento/replay de evento não cria duplicidade entre módulos | P0 | contrato/idempotência |
| INT-OBS-001 | Protocolo/correlation ID rastreia fluxo e causa da falha sem PII | P1 | observabilidade |
| INT-UAT-001 | Representantes de cliente, RH, Marcelo e TI homologam jornadas reais | P0 | UAT humano |
| RAG-SEG-001 | RAG cliente/RH/Marcelo/público não cruza permissões nem fontes | P0 | segurança/IDOR/contrato |
| RAG-FUNC-001 | Modos sem_ia/com_ia/whatsapp preservam protocolo e fallback explícito | P1 | API/estado |
| RAG-FUNC-002 | Preço/cobertura/licença/prazo não aprovados não aparecem como fatos | P0 | guardrail/exploratório |
| RAG-OBS-001 | Feedback 1–5, origem e custo/token auditáveis sem falsa cobrança | P1 | integração/observabilidade |
| RAG-PERF-001 | Fila 100/timeout/latência: Ollama real versus fallback identificados | P1 | integração/desempenho, somente ambiente isolado |

## 8. Critérios de entrada, saída e aceitação por onda

Todos os números desta seção são **propostas de governança de QA**, não SLA contratual. `BLOQUEADO` e `N/A` não contam como aprovados. Defeito S1 = vazamento, perda financeira/material, alerta crítico não atendido ou acesso indevido; S2 = fluxo essencial quebrado sem alternativa segura; S3 = fluxo secundário; S4 = apresentação. Classificação final considera evidência e impacto real, não só etiqueta.

| ID / onda | Entrada mínima | Saída/aceite propostos (Definition of Done) |
|---|---|---|
| PLT-ONDA-000 — integridade (P0) | commit/ZIP identificados, diferenças listadas, dados isolados | 0 imports ausentes, dependências declaradas, 0 falhas em `npm test`, typecheck/build exit 0, servidor importa/sobe; CI falha quando teste falha/skip inesperado; migrações exigidas existem; nenhuma afirmação de módulos não testados |
| TENANT-ONDA-001 — identidade e isolamento (P0) | onda 0 verde; contas A/B sintéticas; PostgreSQL isolado; falha injetável | 100% dos casos P0 desta onda executados e aprovados; 0 linhas/bytes de B em respostas A; erros de autorização/consulta não ampliam acesso; 0 S1/S2 abertos; logs sem tokens; observação: falta de staging real mantém release bloqueado |
| PONTO-ONDA-002 — jornada e alerta (P0) | implementações executáveis, parecer de oráculo CLT/CCT, ambiente controlado com mocks | 100% P0 aplicáveis executados/aprovados; marcações e propagação sem perda/duplicidade; latência de alerta dentro do **limite previamente aprovado**; UAT de operadores; se central 24h inexistente, permanecer `BLOQUEADO` para Go operacional |
| FIN-ONDA-003 — financeiro/RH/integr. (P0/P1) | fonte íntegra; regras validadas por contador/advogado; provedores apenas sandbox | 100% P0 e ≥95% P1 aplicáveis aprovados, restantes P1 com exceção formal, prazo e mitigação; 0 diferença de centavo nos cenários de referência; 0 cobrança ou emissão real; 0 S1/S2 abertos |
| UX-ONDA-004 — transversal/UAT (P1–P3) | ondas prévias verdes, browsers/dispositivos disponíveis e perfis humanos definidos | WCAG alvo 2.2 AA **sujeito à aprovação**, nenhuma barreira para jornada crítica; p95, restore, resiliência e browser conforme metas aprovadas; 100% smoke/regressão P0 verde; aceite humano documentado; defeitos S3/S4 podem ter aceite explícito com prazo |

- **QA-ACEITE-001:** relatório de cada onda informa commit, versões, ambiente isolado, contas sintéticas, IDs, comandos, tempo, asserts, logs sanitizados, defeitos, skips/bloqueios, reteste e responsável pelo aceite. `PASSOU` sem evidência reproduzível vira `NÃO EXECUTADO`.
- **PLT-ACEITE-001:** alvos **provisórios para discussão, não para reprovar agora**: disponibilidade mensal 99,9%; ingestão de evento→fila p95 ≤5 s e p99 ≤10 s sob carga a definir; API autenticada p95 ≤2 s em carga a definir; RPO ≤1 h, RTO ≤4 h após restauração isolada; cenários de cálculo de referência com divergência monetária R$ 0,00. Confirmar volume, hardware, janela e impacto com dono do negócio antes do ensaio. A medição de cinco requisições RAG fallback não valida essas metas.
- **PLT-ACEITE-002:** mesmo com ondas verdes, **Go para produção exige autorização explícita**, política aprovada, provedores e canais configurados, segurança revisada, plano de incidentes, backups restaurados, responsáveis por monitoramento e UAT assinada. Nenhum agente concede Go sozinho.

## 9. Cronograma em ondas e esforço

Estimativa inicial em **dias úteis de QA de uma pessoa**, para elaboração/automação/execução/evidência; exclui correções de produto, espera por provedor, parecer jurídico, dispositivo físico e tempo de aceite humano. É faixa de planejamento, não prazo prometido.

| ID / onda | Sequência/dependência | Esforço QA provisório | Entregável |
|---|---|---:|---|
| PLT-CRONO-000 | Onda 0, pré-requisito de todas | 3–5 dias | baseline íntegra, CI e smoke; reconciliação/correção estimada **à parte**, sem prazo conhecido |
| TENANT-CRONO-001 | Onda 1 após 0 | 5–8 dias | matriz RBAC/IDOR A/B, testes de falha injetada e regressão |
| PONTO-CRONO-002 | Onda 2 após 1 e parecer legal/hardware | 8–12 dias | jornada, antifraude e alertas simulados + UAT; pode dividir ponto/monitoramento em entregas independentes |
| FIN-CRONO-003 | Onda 3 após 1–2 e regras contábeis | 6–10 dias | RH/financeiro/comercial e fluxos cruzados com conciliação |
| UX-CRONO-004 | Onda 4 após rotas estáveis | 4–7 dias | compatibilidade, acessibilidade, resiliência, UAT final |
| QA-CRONO-001 | Soma base (sem retrabalho) | **26–42 dias de QA** | planejar reserva adicional de ~20% (**31–51 dias**) quando orçamento/escopo forem definidos; ondas parcialmente paralelas somente com ambientes/massas independentes |

**PLT-CRONO-005:** para planejar calendário é necessário saber quantas pessoas executam UAT, qual staging existe, quando código fica íntegro, regras aprovadas e quais dispositivos/provedores serão disponibilizados. Sem isso, datas não são inferíveis do repositório.

## 10. Métricas, evidências e relatório

- **QA-METR-001 — rastreabilidade:** `% requisitos aplicáveis mapeados = requisitos com caso ou decisão formal / requisitos aplicáveis ×100`; contar os 222 IDs separadamente de novos casos QA e evitar tratar `condicional` como `verificado`. Objetivo provisório para planejar release: 100% dos requisitos P0 aplicáveis ligados a caso e evidência.
- **QA-METR-002 — execução:** `% execução = casos executados / casos planejados aplicáveis ×100`; `% aprovação = PASSOU / (PASSOU+FALHOU) ×100`, sempre exibindo **contagens** BLOQUEADO/NÃO EXECUTADO/N/A separadas. Nenhum skip é sucesso tácito. Publicar por módulo, prioridade e tipo.
- **QA-METR-003 — risco:** P0/P1 executados/aprovados e lista de riscos residuais `ID, probabilidade revisada, impacto, dono, mitigação, prazo, aceite`. Cobertura T/P/N desta baseline não vira T por alteração de documentação.
- **QA-METR-004 — defeitos:** abertos/fechados/reabertos por severidade S1–S4, tempo para corrigir/retestar, causa (código, dados, infra, requisito), tendência de regressão. Defeito escapado = defeito encontrado **após release**; sem release, indicador = **não mensurável**, nunca zero por suposição.
- **PLT-METR-001 — operação:** latência p50/p95/p99 com denominador/janela/carga, erros HTTP, perda/duplicação de evento, atraso de fila, recursos e disponibilidade; RPO/RTO medidos em restore separado; distinguir fallback de Ollama real, stubs de fornecedor real e contagens reais de faturamento de mocks.
- **QA-REL-001 — modelo de relatório por onda:**

```text
Onda / commit / data / executor / ambiente / autorização:
Baseline (Node, dependências, migrações, hash do artefato):
Massa sintética e limites (A/B, fusos, stubs; sem dados reais):
Casos: ID | requisito/risco | prioridade | PASSOU/FALHOU/BLOQUEADO/NÃO EXECUTADO/N/A | esperado | obtido | evidência
Totais por módulo e prioridade: planejados | executados | passou | falhou | bloqueado | N/A
Defeitos: ID | severidade | reprodutibilidade | dono | correção | reteste
Métricas medidas (com unidade, amostras e ferramenta):
Riscos residuais / decisões humanas / exceções aprovadas:
Recomendação QA: GO CONDICIONAL / NO-GO / SEM DADOS (não equivale a autorização de produção)
Próxima onda e pré-condições:
```

**QA-REL-002:** descoberta e [Ondas 0–21](qa-casos-onda21-pontos-restauracao-cli-v2.md) recomendam **NO-GO**. A [decisão técnica inicial](politica-tecnica-backup-recuperacao.md) define alvo de cobertura DB+arquivos, custódia, retenção e metas ainda não homologadas. Ondas 19–20 transportaram objetos CLI v2 **inventados** junto do DB em QA e injetaram falha de importação parcial. A Onda 21 classificou referências sintéticas antigas em pontos assinados sem autorizar deleção, **apenas em unitários, sem PG/WAL/PITR real**. Nenhuma prova de atomicidade, custódia durável ou origem real CLI v2; `PLT-DEF-024` permanece aberto. Catálogo PLT-08 continua 503/fail-closed. `npm test` 133/133, typecheck/build locais. Sem inventário total, KMS/âncora persistente e armazenagem externa imutável, criptografia/custódia operacionais, consistência DB+FS sob concorrência, ledgers históricos, RPO/RTO medidos, CI remoto, matriz HTTP CLI v2 e UAT. A recomendação não substitui decisão de produto, segurança ou responsável legal.

---

**Checkpoint adicional da Fase 2 — Onda 21:** [PLT-BAK-001](qa-casos-onda21-pontos-restauracao-cli-v2.md): contrato QA unitário para referências atuais e dois pontos de restauração sintéticos exigidos externamente, listas assinadas Ed25519 com pin externo. Versão antiga A v1 foi conservada na classificação; objeto sem referência atual/histórica permaneceu `unresolved`, sem autorizar deleção. Chave atacante/ponto omitido/duplicado e bytes obrigatórios ausentes falham fechados; 3/3 unitários novos, suíte 133/133, typecheck/build 66/66. **Não é teste PG, snapshot ou PITR real**, `PLT-DEF-024` aberto: **NO-GO**. Número de ondas restantes não é definido por contagem de testes.

**Checkpoint adicional da Fase 2 — Onda 20:** [PLT-BAK-001 / CLIENTE-SEG-001](qa-casos-onda20-importacao-parcial-cli-v2.md): falha controlada após importar 1/3 objetos CLI QA em segundo cluster PG; verificação do estado parcial, compensação apenas do objeto criado, DB sem alteração e zero objetos no destino; exit 1/cleanup esperado. Objeto da fonte sem referência atual classificado e retido até cleanup, sem GC automático; unitário preservou arquivo desconhecido e recusou symlink. Regressão positivo 3/3, coadulteração recusada, CLI PG 9/9 e objeto PG 1/1; suíte 130/130, typecheck/build 66/66. Sem crash/concorrência ou custódia operacional, `PLT-DEF-024` aberto: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 19:** [PLT-BAK-001 / CLIENTE-SEG-001](qa-casos-onda19-transferencia-cli-v2-pg.md): em dois clusters PG QA, 3 objetos CLI v2 inventados A v1/v2+B v1, manifesto assinado e âncora pública fora do pacote; DB restaurado, 96/96 migrações e byte/hash/conta/versão verificados antes da importação. Chave atacante/bytes/manifesto co-adulterados negados antes de escrever objeto CLI, exit 1/cleanup; positivo exit 0/cleanup, HTTP legado A/B/revogação; regressões CLI 9/9 e objeto PG 1/1, suíte 128/128, typecheck/build 66/66. Origem CLI real/KMS/atomicidade ainda ausentes: **NO-GO**, `PLT-DEF-024` aberto.

**Checkpoint adicional da Fase 2 — Onda 18:** [PLT-BAK-001 / CLIENTE-SEG-001](qa-casos-onda18-vinculo-cli-v2-pg-objeto.md): PG QA 96/96 com documento/versões e bytes sintéticos, escopo SQL do teste A/B/revogação, leitura de bytes exatos v1/v2, corrupção e chave DB divergente negadas; rollback DB após objeto gravado deixou órfão, `PLT-DEF-024` aberto. PG 1/1 TAP, CLI regressão 9/9, suíte 125/125, typecheck/build 66/66. Sem HTTP cliente/restore DB nesta onda: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 17:** [PLT-BAK-001 / CLIENTE-SEG-001](qa-casos-onda17-provedor-local-cli-v2-sintetico.md): protótipo QA local isolado criou objetos v1/v2, comparou bytes SHA-256 e negou B/versão/chave/ID divergentes, byte adulterado e path externo. Unitários 4/4, suíte 124/124, typecheck/build 66/66. Sem DB/HTTP neste lote, recibo não assinado e nenhum provedor real: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 16:** [PLT-BAK-001](qa-casos-onda16-contratos-referencia-arquivo.md): CLI v2 recebe URL/chave e retorna URL como metadado para staff, sem writer/stream próprio comprovado; RH/OPS/FIN e demais famílias rotuladas sem promover custódia. QA 124 colunas/12 famílias, 1 arquivo legado com bytes restaurados, 6 ocorrências CLI v2 sem prova; full recusado exit 1/cleanup, legado HTTP passou. Suíte 120/120, typecheck/build 66/66. **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 15:** [PLT-BAK-001](qa-casos-onda15-inventario-cobertura-sintetica.md): 124 colunas candidatas PG QA, 1 arquivo legado restaurado com bytes exatos; 6 ocorrências CLI v2 de metadados não classificadas; gate “full” bloqueado com exit 1/cleanup, arquivo ausente também bloqueado antes de HTTP. Escopo legado assinado/HTTP A/B passou exit 0/cleanup. Suíte 117/117, typecheck/build 66/66. Sem inventário semântico/bytes externos/consistência: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 14:** [PLT-BAK-001](qa-casos-onda14-politica-assinatura-qa.md): política técnica inicial delegada registrada, sem ativação/contratação. Em dois clusters QA, assinatura destacada Ed25519 com âncora fora do pacote passou com HTTP A/B/revogação; assinatura/chave/bytes substituídos falharam antes da escrita, exit 1/cleanup. Gate de produção documental corrigido para POST 503 e catálogo não verificado. Suíte 112/112, typecheck/build 66/66. Âncora efêmera local, sem KMS, storage independente ou inventário completo: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 13:** [PLT-BAK-001](qa-casos-onda13-pin-manifesto-sintetico.md): no QA sintético, coadulteração de bytes e manifesto foi rejeitada antes da escrita com pin original efêmero; teste de pin escolhido pelo atacante demonstrou ausência de autenticação externa. Negativo em dois clusters exit 1/cleanup; positivo HTTP exit 0/cleanup; suíte 106/106, typecheck/build 66/66. Sem política/custódia/autenticidade persistente: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 12:** [PLT-BAK-001 / CLIENTE-SEG-001](qa-casos-onda12-download-arquivo-restaurado.md): download real de arquivo QA sintético de 54 bytes no DB/FS restaurados em outro cluster: A 200 com bytes/cabeçalhos conferidos, B 403, anônimo 401, A revogado 403, B isolado, auditoria presente; corrupção de arquivo falha antes do HTTP com exit 1/cleanup. Verificador corrigido para aguardar gravação assíncrona da auditoria allowed após a resposta. `npm test` 103/103, typecheck/build 66/66 locais. Um arquivo/um cenário não homologam backup ou portal completo: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 11:** [PLT-BAK-001](qa-casos-onda11-manifesto-arquivo-sintetico.md): dois clusters QA descartáveis, 497 tabelas/96 hashes e um arquivo sintético de 54 bytes fora do DB restaurados com manifesto ID/conta/chave/tamanho/SHA-256; byte adulterado, conta divergente e chave de caminho inválida negados. Um primeiro negativo revelou defeito de cleanup no runner, corrigido/retestado. `npm test` 102/102, typecheck/build verdes. Sem autenticação do manifesto, criptografia, política, consistência com escritas concorrentes, ledger real ou UAT: **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 10:** [PLT-BAK-001](qa-casos-onda10-backup-clusters-catalogo.md): restore real de DB sintético em dois clusters QA (497 tabelas, 96 checksums), arquivo corrompido rejeitado. `src/server/backup-api.mjs` simulava sucesso/restore testado sem artefato; baseline falhou 2/3, corrigido com 503 e catálogo/UI legados não verificados; HTTP PG 9/9 TAP, unitários 97/97. Arquivos em `CLIENT_DOCS_DIR` não estavam no dump. **NO-GO** até política aprovada para bytes/chaves/custódia, ledger histórico, CI e UAT.

**Checkpoint adicional da Fase 2 — Onda 9:** [PLT-BAK-001 / PLT-MIG-001](qa-casos-onda9-restore-real-sintetico.md): `pg_dump`/`pg_restore` 17.9 gerados em `/tmp` permitiram restore **real** do banco sintético 001–096 em outra base do mesmo cluster QA: 497 tabelas, checksums/grants/auditorias preservados, fonte intocada; arquivo inválido rejeitado e cluster removido. **NO-GO** para backup/restore de produção: arquivos privados, custódia/criptografia, restore entre clusters, ledger histórico, RPO/RTO e UAT pendentes; não confundir com clone TEMPLATE.

**Checkpoint adicional da Fase 2 — Onda 8:** [PLT-BAK-001](qa-casos-onda8-backup-restore.md): runner protegido para restore PG 17 preparado, **não executado** por ausência dos clientes `pg_dump`/`pg_restore` 17; preflight recusou URL de operador e binários ausentes/versão 14 com exit 2, nenhum banco criado. `npm test` 94/94, typecheck/build verdes. Restore real, arquivos, RPO/RTO e ledgers históricos continuam sem evidência. **NO-GO**.

**Checkpoint adicional da Fase 2 — Onda 7:** [escopo CLI v2 e falha injetada](qa-casos-onda7-cli-v2-escopo-auditoria.md): 8/8 TAP em PG descartável; mitigados vazamento RH em nove handlers e fail-open da criação de documento com transação/rollback. Outros caminhos e cliente v2 seguem bloqueados. Próximo bloco após `CONTINUAR`: avaliar backup/restauração real em base sintética isolada, sem tocar bases preexistentes.

**Ponto de parada Fase 1:** estratégia aprovada pelo usuário. A Fase 2 começou por `PLT-ONDA-000` em [casos detalhados](qa-casos-onda0.md); o reteste local beta de `PLT-SMK-001` passou, mas CI remoto e migração PG permanecem bloqueados. O bloco `RAG-SEG-001` foi [detalhado e parcialmente executado localmente](qa-casos-onda1-rag.md): o acesso anônimo a escopos privados foi negado no recorte testado, porém vínculo cliente/tenant e RBAC dos usuários finais permanecem bloqueados; defeito `RAG-DEF-001` não está encerrado. O bloco [`TENANT-SEG-002`](qa-casos-onda2-tenant.md) corrigiu os dois fail-open reproduzidos por falha injetada e passou 14/14 testes locais; PG HTTP/concorrência permanecem bloqueados. `TENANT-SEG-001` teve [execução A/B no portal em PG local descartável 001–007](qa-casos-onda3-tenant-pg.md). O lote [`PLT-MIG-001`](qa-casos-onda4-migracoes.md) corrigiu dependência/ordem da 021 e outros bloqueios até 074/96; a [Onda 5](qa-casos-onda5-migracoes-integral.md) reconciliou `audit_log` operacional separado e avançou a 96/96 duas vezes, incluindo clone QA restaurado via TEMPLATE. A [Onda 6](qa-casos-onda6-cli-v2-http.md) executou um recorte HTTP CLI v2 (5/5 TAP) com acesso de cliente v2 ainda bloqueado, proteção admin/ti e auditoria positiva de documentos; não comprovou escopo de contatos/exportações, streaming privado nem comportamento sob falha da auditoria. Próximo bloco seguro: ampliar matriz IDOR v2 e testar falha injetada da trilha; depois ensaiar backup/restore real em base sintética isolada. Upgrade com ledgers históricos, CI remoto e concorrência seguem pendentes. Execução intrusiva/destrutiva/carga requer autorização separada e staging controlado. Sem produção ou contratação automática.

# Auditoria técnica e levantamento de pendências — Grupo SEG System

**Data:** 04/11/2026 (UTC). **Base auditada:** `0e6456e9d01b825a3bff4997f92506ac4ff1c633` (merge da PR #348). **Branch:** `arena/a5202d09-gruposegsystemseguranca`.

## 1. Parecer executivo

**Não recomendo liberar produção neste estado (NO-GO).** Há implementação extensa e testes reais passando em diversos módulos. Entretanto, compilar, carregar uma página ou ter registro no banco não significa que a capacidade esteja operacional, homologada ou aceita.

Principais pendências:

1. **Backup/restore operacional inexistente na API:** mutações recusadas deliberadamente com 503; os registros históricos não comprovam artefato recuperável.
2. **Fila administrativa de e-mails sem transporte:** `server.mjs:1229` injeta `mailer: null`; preencher SMTP não conecta esse caminho.
3. **Homologação e aceite final não registrados:** inventário vigente informa 0/222 aceites humanos e 0 reauditorias integrais. Esta auditoria ampla não equivale a percorrer os 222 requisitos em todos os papéis.
4. **Segurança por escopo ainda requer matriz completa:** gates amostrais passaram, mas não provam todas as combinações conta/unidade/contrato/download; papel de contato CLI-02 ainda depende de decisão.
5. **Banco, arquivos, segredos, provedores e operação no destino não validados nesta sessão.** Testes foram locais, sintéticos e descartáveis.
6. **Suíte principal vermelha:** 1.518 passam e 1 falha, por deriva documental do cabeçalho do status, não por uma falha funcional demonstrada.
7. **Cobertura de UX incompleta:** matriz vigente não registra estados de navegador em nenhuma das 101 rotas; 81 sem percurso de teclado verificado. Isso é lacuna do registro global, não afirmação de que nenhum teste focal cobre erros.
8. **Academia continua isolada/em construção**, sem integração definitiva ao produto principal.

Não há fundamento para declarar percentual de sistema “pronto”: evidência textual, implementação, integração, operação real e aceite são dimensões diferentes.

## 2. Método, escopo e limites

Realizados: instalação pelo lockfile, build, TypeScript, auditoria de dependências, suíte unitária, inspeção de código/configuração/workflows/documentos, inventários reproduzíveis, migrações em PostgreSQL e PGlite, gates de autenticação/tenant, jornadas transversais e extensões, testes da Academia e ensaio de pré-requisitos de restore.

Foram invocados **51 comandos de verificação**, contando a instalação, a repetição isolada de licitações e as verificações adicionais; o registro estruturado está em `verificacoes.json`. Não são 51 testes: cada comando pode executar múltiplas asserções e cenários sobrepostos.

**Não realizados:** acesso a produção ou banco do operador; envio real de e-mail/WhatsApp; integração fiscal/bancária/eSocial/biometria; Ollama real; pentest ofensivo; UAT; Windows real; leitor de tela; revisão jurídica/contábil; carga/concorrência representativa de produção; teste de desastre com bytes reais. Nenhuma credencial real foi solicitada ou registrada. Não houve deploy, alteração de funcionalidades, migração no destino ou correção de código.

Não foram consultados PRs/checks remotos atuais: referências a PRs nos documentos são históricas. Não se infere estado atual do GitHub a partir delas.

## 3. Fotografia física conferida

| Item | Resultado |
|---|---|
| Runtime usado | Node v22.22.3 |
| Páginas Next | 101 arquivos `page.tsx` |
| Backend principal | `server.mjs`, 6.316 linhas |
| Arquivos `.mjs` diretamente em `src/server` | 140 |
| Migrações | 183, sequência 001–183 contínua e registrada |
| Schema PGlite medido | 581 tabelas de conteúdo + ledger |
| Workflows | 50 |
| Requisitos rastreados | 222, em 14 famílias |
| Evidência textual dos requisitos | 27 `gate_nomeado`, 124 `mencionado_em_gate`, 71 `somente_documento` |
| Requisitos `a_revalidar` sem gate no índice | 12: EXT-16/17 e AI-01…10 |
| Console TI | 84 componentes; 19 promoções com relatório; inventário vigente ainda registra componentes órfãos |
| Pacotes `.zip` nas pastas downloads/dist | 178.849.535 bytes, aproximadamente 170,6 MiB |

**Correção dos relatórios anteriores:** a lista histórica de “13 sem gate” incluía PLT-09; o JSON atual traz **12**, e o gate PLT-09 passou nesta sessão. O PGlite atual aplica **183**, não 181 migrações. As três rotas antes barradas pela borda foram corrigidas em 03/11 e não devem ser descritas como defeito atual. A sonda temporária `.probe-plt12.mjs` não está no checkout atual. Não reabrir entregas antigas sem reprodução.

## 4. Resultados executados

### 4.1 Base e inventários

| Verificação | Resultado |
|---|---|
| `npm ci` | OK |
| `npm audit --json` | 0 vulnerabilidades reportadas no lockfile instalado; não equivale a ausência de falhas de segurança |
| `npm run typecheck` | OK |
| `npm run build` | OK |
| `npm test` | **1.518 passam / 1 falha / 0 skip**, total 1.519 |
| `qa-wave0-static` | 5/5 |
| `reaudit:sec` | OK; valida mapa técnico, não pentest nem aceite |
| Inventários de rotas, TI, 222 requisitos e contraste (`--check`) | Todos OK |
| Catálogo E15 (`--check`) | OK, 1.735 regras de despacho |
| `test:pglite-schema` | OK, 183 migrações, idempotência e legado recusado |
| Academia (`npm --prefix academia test`) | 63/63 |

**Falha unitária reproduzida:** `tests/package-artifacts.test.mjs:182`, teste N1. Cabeçalho de `docs/STATUS-VIGENTE.md` usa `e291319…`, enquanto a base esperada no checkout é `0e6456e…`. O próprio ledger explica a reincidência a cada merge. Não foi “corrigido” para maquiar a auditoria.

### 4.2 Integração em banco e jornadas

Passaram os gates PostgreSQL de: migrações; tenant; autenticação staff; acesso de cliente; scheduler durável; L04 comercial; L05 contratos; L06 operação/patrimônio; L07 financeiro/administrativo; L08 portal; PLT-01 revisão de acesso; PLT-06 observabilidade; PLT-09 privacidade; PLT-12 incidentes; CLI v2.

Passaram os quatro fluxos F03: lead → implantação; solicitação de funcionário → retorno RH; chamado cliente → aceite; contas → baixa → relatório.

Passaram os gates EXT-02 terceiros, EXT-04 fornecedores, EXT-05 qualidade, EXT-06 satisfação, EXT-07 compliance, EXT-08 conhecimento, EXT-09 expansão, EXT-10 continuidade, EXT-11 analytics, EXT-12 visual, EXT-13 relatórios, EXT-14 inteligência e EXT-15 emergência.

RAG de integração passou em seu modo de teste, **sem provar modelo Ollama real**. Segurança de cliente passou 4/4 em execução isolada; isso não encerra a investigação histórica de falhas intermitentes sob CI.

**Ocorrências que não podem ser ocultadas:**

- **EXT-03 licitações:** primeira execução falhou por `server_did_not_start` após 60s no hook de inicialização, afetando a suíte inteira. O teste descarta stdout/stderr do servidor (`tests/ext03-biddings.integration.test.mjs:87–88`), impedindo atribuir causa com o log produzido. Repetição isolada passou **26/26**. Classificação: instabilidade de inicialização a investigar, não defeito de licitação comprovado nem sucesso estável demonstrado.
- **L04 e L07:** a espera inicial do executor da auditoria expirou em 100s; os processos filhos continuaram. Os logs finais confirmaram **L04 20/20 em ~225s** e **L07 43/43 em ~131s**, com exit 0 e limpeza. Não foram repetidos. A demora não foi tratada como reprovação funcional.
- **Backup/restore com inventário:** recusado com exit **2**, `QA_RESTORE_CLIENT_MISSING_OR_INCOMPATIBLE`: faltam `pg_dump` e `pg_restore` versão 17 compatíveis com PostgreSQL 17.9. Nenhum banco foi criado por esse ensaio. Não há aprovação de restauração nesta auditoria.

Todos os gates acima são amostras dos contratos que os testes exercitam; não certificam todas as telas nem integrações externas.

## 5. Backlog prioritário com evidência e critério de encerramento

### P0 — bloqueios de produção

| ID | Pendência e evidência | Como encerrar / responsável sugerido |
|---|---|---|
| AUD-01 | **Backup/restore real.** `src/server/backup-api.mjs:8–12,58,119` marca histórico `unverified` e recusa execução com 503. | TI + proprietário: definir executor, inventário DB+arquivos, armazenamento externo, criptografia/custódia, retenção, consistência e recuperação; ensaio autorizado isolado com RPO/RTO medidos. QA sintético não substitui isso. |
| AUD-02 | **Banco e arquivos de destino.** Nenhum destino foi acessado; runbook existe em `docs/APLICACAO-BANCO-DESTINO.md`. | Operação: levantar estado real, backup prévio, clone, aplicar e conferir 001–183, permissões mínimas, integridade dos arquivos e plano de rollback. Não aplicar cegamente. |
| AUD-03 | **Autorização completa.** Gates tenant/staff/cliente passaram; matriz exaustiva por recurso não está encerrada. CLI-02 mantém decisão de papel × ação × escopo pendente. | Proprietário aprova matriz; desenvolvimento/QA testa A/B, conta/unidade/contrato, downloads, sessões revogadas, titulares e staff. Documentar regras sem ampliar acesso implicitamente. |
| AUD-04 | **Segredos, privacidade e retenção efetiva.** Exemplo de env não informa estado real; MFA requer chave própria; cadastro de política não executa eliminação. | TI/jurídico/gestor: separar ambientes, custodiar/rotacionar chaves, validar MFA/recuperação, bases legais, retenção executável, auditoria e atendimento LGPD real. |
| AUD-05 | **Aceite e publicação.** Índice registra 0/222 aceites; gate de produção segue aberto. | Donos das áreas: UAT por papel com evidência e assinatura; autorização expressa para publicar. Build não concede autorização. |
| AUD-06 | **Instalação e operação reais.** Windows persistente, recursos, HTTPS/domínio, reinício, restauração e monitoramento não validados aqui. | Operador/TI: homologar máquina/host alvo, inicialização após reboot, permissões, logs/alertas e recuperação, com dados não sensíveis. |

### P1 — funcionamento, qualidade e cobertura

| ID | Pendência e evidência | Critério de encerramento |
|---|---|---|
| AUD-07 | **E-mail da fila administrativa não conectado.** `server.mjs:1229` injeta `mailer: null`; `src/server/admin-notifications-api.mjs` repassa ao processamento; `notification-queue.mjs` trata ausência como `not_configured`. | Conectar transporte configurado com fail-closed, retries/idempotência e teste de entrega real autorizado. Distinguir lead, portal e fila administrativa, que são caminhos diferentes. |
| AUD-08 | **Deriva documental quebra suíte.** N1 descrito em §4. | Reconciliar fotografia atual e rever o contrato da guarda para permitir merges sem falso débito recorrente; manter rastreabilidade da base. |
| AUD-09 | **Robustez de harness/CI.** Ledger de 04/11 documenta start/stop sem prazo e rejeições `undefined` do embedded-postgres; `ci.yml` limita job a 25 min, sem teto por step. | Reproduzir falhas controladas e introduzir limites/limpeza seguros com testes negativos; preservar falha real. Diagnóstico histórico N9 não foi reinjetado aqui. |
| AUD-10 | **Inicialização EXT-03 instável.** Falhou uma vez e passou na repetição; logs do servidor descartados. | Capturar diagnóstico seguro do filho, identificar causa e repetir isolado/sob carga antes de declarar estabilidade. |
| AUD-11 | **Estados e teclado por rota.** Índice vigente: 101 com estados não exercitados em navegador e 81 sem percurso de teclado verificado. | Testar carregando/vazio/erro/401/403, rede offline, releitura, duplicação e sucesso; manter matriz com evidência por rota/papel/viewport. |
| AUD-12 | **Acessibilidade manual.** Contraste automatizado não resolve imagens/fundos complexos, opções nativas, foco ou leitor de tela. | WCAG manual, leitor de tela, teclado e zoom; validar antes/depois e registrar exceções. Históricos apontam 196 fundos complexos e 108 options não medidos; essas duas contagens não foram recalculadas aqui. |
| AUD-13 | **222 requisitos não reauditados integralmente.** 71 têm somente evidência documental; 12 `a_revalidar` sem gate. | Usar CSV anexo como índice, não como lista de defeitos confirmados. Executar jornada/papel e registrar resultado atual; dar prioridade a EXT-16/17 e AI-01…10 após decisões externas. |
| AUD-14 | **Ciclo administrativo CLI-05…08 e portal.** Documentos vigentes ainda deixam resíduo staff criar/revisar/aprovar/publicar e superfícies fora da família de leitura. | Ensaiar ciclo completo staff → publicação → cliente correto → revogação, com conta indevida negada e evidência de UI. Gate L08 verde não é aceite de todas as telas. |
| AUD-15 | **UX transversal pendente.** UX-PRO-04/05/06 têm entregas por superfície, não fechamento global. | Reconciliar CRM/comercial/carteira/expansão/contratos/financeiro e jornada funcionário: rede, hash/comprovante, HERE/consentimento, cursos/comunicados/escala e RH. Não reimplementar telas já entregues; medir cada uma. |
| AUD-16 | **Integrações externas e IA.** Provedores/contratos não comprovados aqui. | Definir escopo e fornecedor de SMTP/WhatsApp/fiscal/pagamento/eSocial/CFTV/biometria/HERE/Ollama/storage, contratar apenas com autorização, testar timeout/falha e retorno real. RAG exige isolamento das fontes e homologação com os cinco perfis. |
| AUD-17 | **Academia isolada.** `academia/README.md` declara construção, JSON de instância única, sem SSO/e-mail e sem upload/player/transcodificação. | Decidir autenticação, armazenamento e integração; validar conteúdo por setor, credenciais de demonstração, certificados entre dispositivos e UX. Os 63 testes passaram, mas não removem essas limitações. |

### P2 — manutenção e governança

| ID | Pendência | Critério de encerramento |
|---|---|---|
| AUD-18 | **Despacho duplicado/monólito:** borda e roteamento são cadeias separadas em 6.316 linhas; catálogo E15 passa e correções de 03/11 devem ser preservadas. | Evolução pequena e compatível com gates de paridade; não remover aliases/rotas sob argumento de limpeza. |
| AUD-19 | **Pacotes antigos em Git:** ~170,6 MiB nas pastas de distribuição; aviso de obsolescência não atualiza bytes. | Decidir política de releases/artefatos externos, identificar versão/schema/hash e impedir instalação como produção. Nenhum pacote foi removido. |
| AUD-20 | **Cobertura automática de workflows:** 23 scripts `test:*` sem referência literal nos YAML; isso não significa 23 suítes sem execução. | Mapear equivalência por arquivo/cenário: `test:unit` roda indiretamente por `npm test`; outros testes podem estar incluídos em comandos maiores. Ligar jornadas realmente órfãs a CI ou declarar execução manual com responsável. |
| AUD-21 | **Runbook de produção desatualizado:** `docs/PRODUCAO-GATE.md` mistura números antigos e envs diferentes do runtime. | Corrigir comandos/configuração antes de entregar a operador. O checklist tem **11 caixas** em §10, embora documentos históricos o chamem de 0/12. Não interpretar número histórico como validação atual. |
| AUD-22 | **Decisões D7/C11 e console TI.** Há dependências e superfícies órfãs deliberadas, inclusive borda legada RH. | Proprietário define escopo; não montar tela órfã, abrir RH ou ampliar financeiro sem decisão. Preservar a decisão registrada de console esgotado. |

**Detalhe do runbook:** ele recomenda `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_TOKEN`, `SMTP_*` e `OLLAMA_HOST`; o exemplo atual usa `SITE_ADMIN_SESSION_SECRET`, `CLIENT_MFA_ENCRYPTION_KEY`, `MAIL_*` e `OLLAMA_BASE_URL`. São contratos distintos, não se deve trocar um pelo outro por suposição. O trecho `openssl rand -hex 16` gera **16 bytes**, não os 32 bytes que o texto afirma. Corrigir a documentação sem registrar valores reais.

## 6. Pendências por área do sistema

| Área | Evidência executada agora | O que continua pendente |
|---|---|---|
| Site público/SEO/leads | Build, unidade e fluxo lead→implantação | Revisão humana de conteúdo, política/CNPJ/identidade, SEO por ambiente, contatos e entrega SMTP real |
| CRM/comercial | L04 20/20 e fluxo transversal | Estados por superfície, aceites dos processos, integrações e revisão da matriz por papel |
| Contratos | L05 e jornadas integradas | Aceite documental/jurídico, publicação e isolamento em todas as variantes |
| RH/funcionário/ponto | Auth, unidade e solicitação→retorno RH | Titular em aparelho real, offline, comprovante, geolocalização/HERE/consentimento e dispositivos/eSocial |
| Operação e patrimônio | L06 | Carga real, execução em campo, escopos integrais e aceite |
| Financeiro/administrativo | L07 43/43 e conta→baixa→relatório | Homologação contábil/fiscal, conciliação/provedores e decisão C11 |
| Portal do cliente | L08, tenant, CLI v2 e segurança 4/4 | Ciclo staff completo, matriz CLI-02, estados, recuperação/MFA e aceites em contas reais autorizadas |
| TI/segurança/privacidade | PLT-01/06/09/12 e mapa SEC | Operação real dos alertas, RPO/RTO, segredos, pentest, retenção, incidentes reais simulados autorizadamente |
| Extensões | EXT-02…15 passaram, EXT-03 só após retry | Homologação de cada setor e integrações externas; EXT-16/17 continuam sem gate no índice |
| IA/RAG | Integração passou em teste | Provedor/modelo real, qualidade de resposta, isolamento completo e cinco perfis; AI-01…10 sem gate no índice |
| Academia | 63/63 | SSO/contas definitivas, banco/multi-instância, vídeos, e-mail, conteúdo validado e liberação |
| Infra/backup/deploy | Build e schema descartável | Executor real de backup, ferramentas PG17, destino, restore, monitoramento, capacidade e autorização |

## 7. Decisões necessárias do proprietário

1. Quem opera e responde por backup, inventário de arquivos e chaves? Quais RPO/RTO e retenção aprovados?
2. Qual ambiente de homologação/produção, domínio, teto de recursos/custo e modo de acesso remoto autorizado?
3. Qual matriz papel × ação × conta/unidade/contrato, especialmente CLI-02 e superfícies legadas de RH?
4. Quais provedores externos serão usados e qual escopo real das famílias AI e EXT-16/17?
5. Qual decisão de D7 e C11, e quais donos de área assinam cada jornada?
6. A Academia terá SSO ou contas próprias? Quem valida o conteúdo e o papel “supervisor”/trilha T25?
7. Quais textos, política LGPD e identidade institucional estão formalmente aprovados?
8. Quem dará a autorização escrita final para publicação? A auditoria não concede essa autorização.

## 8. Ordem recomendada de execução

**Etapa 1 — confiabilidade da base:** resolver deriva do status sem ciclo de dívida por merge; diagnosticar EXT-03 e harness; reconciliar runbook/envs. Exigir gates novamente verdes.

**Etapa 2 — capacidade operacional mínima:** decidir e implementar fila SMTP, backup/restore, destino e observabilidade com segredos fora do Git. Provar recuperação antes de usar dados reais.

**Etapa 3 — segurança e jornadas:** aprovar matriz de autorização, executar testes A/B completos, validar LGPD/MFA/recuperação, concluir ciclos staff→cliente e UX de falha/rede.

**Etapa 4 — produto e aceite:** reauditar os 222 requisitos, priorizar os 12 sem gate conforme decisões de fornecedor, revisar Academia e acessibilidade, executar UAT por papel/Windows/dispositivo.

**Etapa 5 — liberação:** conferir critérios do gate de produção com evidência atual, restore medido e autorização escrita. Não usar ZIP histórico como produção.

Não se recomenda estimativa de prazo antes de decidir escopo, responsáveis, fornecedores e ambiente. Cada pendência deve ter responsável, evidência de teste e critério de aceite, não apenas uma marca de “feito”.

## 9. Arquivos da entrega e leitura correta

- **`RELATORIO.md`**: parecer e backlog priorizado desta auditoria.
- **`verificacoes.json`**: comandos invocados, resultados, tempos disponíveis e ressalvas. Sem logs brutos ou dados sensíveis.
- **`requisitos-222.csv`**: todos os 222 IDs com descrição e classe de evidência extraídas do inventário vigente. A coluna de pendência é **histórica**, não um novo diagnóstico de defeito; cada linha exige revalidação atual.

A pasta desta entrega fica fora dos diretórios varridos pelo gerador dos 222 IDs, para não transformar o próprio relatório em falsa evidência de implementação. Não foram alterados ledger, inventários canônicos, código, configurações nem dados de negócio.

**Conclusão:** o sistema tem base funcional relevante, com numerosas jornadas comprovadas em ambiente sintético. As pendências centrais são tornar capacidades declarativas realmente operacionais, fechar segurança e UX por escopo, validar destino/recuperação e obter aceite. Não há evidência suficiente para declarar o sistema integralmente concluído ou pronto para produção.

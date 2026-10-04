# Auditoria e instalacao local — 04/10/2026

Base GitHub: berger33/gruposegsystemseguranca, main 540faf6c5124fd243fc3e287527ff4f6983ce8f1 (PR 120). Clone novo, sem usar a copia antiga. Nenhuma alteracao no codigo do produto ou merge realizado nesta instalacao.

## Parecer
O Arena concluiu a etapa EXT-07 e documentou a implantacao. Isso nao conclui todo o sistema. A demonstracao foi instalada, com banco PostgreSQL real e contas individuais ficticias. A auditoria combina leitura de codigo/documentacao, testes automatizados e verificacao de navegador; nao representa teste manual de todas as jornadas dos 222 requisitos.

## Evidencias obtidas nesta maquina
- npm ci: 76 pacotes; auditoria de dependencias sem vulnerabilidades reportadas naquela execucao.
- Build de producao e verificacao TypeScript do build: sucesso.
- PostgreSQL 17 em Compose exclusivo segsystem_demo; porta 55432 apenas loopback.
- Migracoes 001–156 aplicadas e repetidas; ledger 156 entradas e 156 checksums.
- Suite unit: 511/514 passaram; 3 falharam por EPERM ao criar symlinks no Windows. Arquivos: qa-backup-coverage-inventory, qa-cli-v2-local-provider, qa-cli-v2-transfer. Nao declarar homologacao Windows completa. Quatro falhas iniciais adicionais por .env.local foram eliminadas ao separar a configuracao do checkout.
- Site publico, login individual e painel Marcelo abriram no navegador via localhost e HTTPS externo.
- /api/ext/compliance/schedule autenticado: 200, identidade TI declarada, intervalo 3600, execucao concluida.
- Reinicio do servidor: nova execucao concluida com evento diario ja_registrado (deduplicacao observada).
- Banco novo sem obrigacoes vencidas: tarefas_criadas=0 e esperado; criacao real de tarefa por vencimento nao foi exercitada nesta instalacao.
- Logs em logs/. Captura visual em logs/painel-marcelo.png.

## Pendencias prioritarias
1. Navegacao/autenticacao: /admin retorna 404; /admin/marcelo anonimo mostra estrutura e erro, sem login central. Login funcional fica em /admin/clientes e tem rotulo de TI mesmo para administrador. Unificar entrada, redirecionamento e navegacao por papel.
2. EXT-08 a EXT-17: conhecimento, expansao, continuidade e demais extensoes seguem a_revalidar; existem schemas/APIs, mas jornadas/UI e gates nao completos conforme checklist. Executar uma fatia por vez com teste de permissao, transacao, idempotencia e navegador.
3. AI-01 a AI-10: nao homologados. O codigo ai-rag-api chama Ollama somente com OLLAMA_ENABLED=true; desativado usa fallback. Nao confundir fallback com LLM funcionando. Validar isolamento cliente/RH/gestao, base aprovada, respostas fundamentadas, latencia CPU, fila, timeouts e carga antes de ativar. Nenhum modelo baixado ou habilitado nesta entrega.
4. EXT-04: jornada interna de fornecedores nao prova portal externo de fornecedores nem upload real. EXT-07 usa referencias documentais declaradas, nao uma cadeia real de upload/antivirus/download.
5. Windows: corrigir ou executar sob ambiente apropriado os tres testes de symlink e completar ensaio de backup/restauracao. Backup de volume nao foi restaurado nesta sessao.
6. Revisar 27 PRs abertos identificados no GitHub: muitos sao alternativas de entregas ja integradas. Nao mesclar todos; comparar com main e fechar/superseder apos revisao.
7. Documentacao tem trechos historicos com prioridades antigas e estados distintos. Consolidar um status atual e evidencias por requisito.
8. Homologacao humana: Marcelo, Andreia e funcionario devem validar suas jornadas com dados ficticios. Relatos historicos de aceite nao substituem esta validacao operacional.
9. SMTP permanece ausente por escopo. Link temporario externo funciona apenas enquanto processos, PC e internet estiverem ativos. Dominio fixo, monitoramento, backup automatico e recuperacao ainda precisam de operacao definida.

## Areas de negocio
- Marcelo/administracao: painel de indicadores abre autenticado; falta entrada intuitiva central e aceite de aprovacoes, metas, relatorios e permissoes com massa representativa.
- RH/Andreia: conta RH criada; isso nao homologa cadastro, admissao/desligamento, documentos, ausencias, beneficios e restricoes salariais. Usar matriz abaixo e gates L04–L06 conforme documentos.
- Funcionario: jornada nao foi percorrida nesta demonstracao; falta conta de funcionario e massa correspondente para aceite end-to-end.
- Comercial/contratos/financeiro/operacao: codigo e gates anteriores existem; empresa/contrato ficticios criados. A demonstracao nao executou venda completa ate recebimento/conciliacao.
- Cliente: cadastro ficticio existe; nao foi emitido convite nem testado email (SMTP ausente). Necessario ensaiar acesso entre contas e documentos.

## Matriz completa declarada no repositorio
A tabela a seguir transcreve os estados do checklist, nao aprovacoes novas desta auditoria. Status ready_local ou entregue nao equivale a aceite humano/producao.

| Requisito | Estado declarado |
|---|---|
| SEC-01 | em_execucao |
| SEC-02 | pronto_local (parcial) |
| SEC-03 | a_revalidar |
| SEC-04 | em_execucao (autenticação e revogação prontas; navegação por papel ausente) |
| SEC-05 | pronto_local |
| SEC-06 | pronto_local |
| SEC-07 | a_revalidar |
| SEC-08 | pronto_local |
| SEC-09 | em_execucao |
| SEC-10 | a_revalidar |
| SEC-11 | a_revalidar |
| SEC-12 | a_revalidar |
| SEC-13 | a_revalidar |
| SEC-14 | a_revalidar |
| SEC-15 | a_revalidar |
| PUB-01 | pronto_local |
| PUB-02 | pronto_local (escopo técnico L04) |
| PUB-03 | pronto_local |
| PUB-04 | pronto_local |
| PUB-05 | pronto_local (escopo técnico L04) |
| PUB-06 | pronto_local (escopo técnico L04) |
| PUB-07 | pronto_local (escopo técnico L04) |
| PUB-08 | pronto_local (limites externos/condicionais descritos abaixo) |
| PUB-09 | pronto_local (escopo técnico L04) |
| PUB-10 | pronto_local (limites externos/condicionais descritos abaixo) |
| CRM-01 | **pronto_local** (superfície dedicada de unidades entregue nesta continuação; aceite humano pendente) |
| CRM-02 | **pronto_local** (superfície dedicada entregue nesta continuação; aceite humano pendente) |
| CRM-03 | pronto_local (gate L04 15/15 em duas execuções consecutivas, PostgreSQL descartável e Chromium real) |
| CRM-04 | pronto_local |
| CRM-05 | pronto_local |
| CRM-06 | pronto_local |
| CRM-07 | pronto_local |
| CRM-08 | pronto_local (escopo técnico L04) |
| CRM-09 | pronto_local (recorte manual; automação externa pendente) |
| CRM-10 | pronto_local (escopo técnico L04) |
| CRM-11 | pronto_local |
| CRM-12 | pronto_local |
| CRM-13 | pronto_local |
| CRM-14 | pronto_local |
| CRM-15 | pronto_local |
| CRM-16 | pronto_local |
| CRM-17 | pronto_local |
| CRM-18 | pronto_local |
| CRM-19 | pronto_local |
| CRM-20 | pronto_local |
| CRM-21 | pronto_local |
| CRM-22 | pronto_local |
| CRM-23 | pronto_local |
| CRM-24 | pronto_local (escopo técnico L04) |
| CRM-25 | pronto_local (escopo técnico L04) |
| CRM-26 | pronto_local (escopo técnico L04) |
| CRM-27 | pronto_local (escopo técnico L04) |
| CON-01 | pronto_local (L05) |
| CON-02 | pronto_local (L05) |
| CON-03 | pronto_local (L05) |
| CON-04 | pronto_local (L05) |
| CON-05 | pronto_local (L05) |
| CON-06 | pronto_local (L05) |
| CON-07 | pronto_local (L05) |
| CON-08 | pronto_local (L05) |
| CON-09 | pronto_local (L05) |
| CON-10 | pronto_local (L05) |
| CON-11 | pronto_local (L05) |
| EMP-01 | pronto_local |
| EMP-02 | pronto_local |
| EMP-03 | pronto_local |
| EMP-04 | pronto_local |
| EMP-05 | pronto_local |
| EMP-06 | pronto_local |
| EMP-07 | pronto_local |
| EMP-08 | pronto_local |
| EMP-09 | pronto_local |
| EMP-10 | pronto_local |
| EMP-11 | pronto_local |
| EMP-12 | pronto_local |
| EMP-13 | pronto_local |
| EMP-14 | pronto_local |
| EMP-15 | pronto_local |
| EMP-16 | pronto_local |
| EMP-17 | pronto_local |
| EMP-18 | pronto_local |
| EMP-19 | pronto_local |
| HR-01 | pronto_local |
| HR-02 | pronto_local |
| HR-03 | pronto_local |
| HR-04 | pronto_local |
| HR-05 | pronto_local |
| HR-06 | pronto_local |
| HR-07 | pronto_local |
| HR-08 | pronto_local |
| HR-09 | pronto_local |
| HR-10 | pronto_local |
| HR-11 | pronto_local |
| HR-12 | pronto_local |
| HR-13 | pronto_local |
| HR-14 | pronto_local |
| HR-15 | pronto_local |
| HR-16 | pronto_local |
| HR-17 | pronto_local |
| HR-18 | pronto_local |
| HR-19 | pronto_local |
| HR-20 | pronto_local |
| HR-21 | pronto_local |
| HR-22 | pronto_local |
| HR-23 | pronto_local |
| HR-24 | pronto_local |
| OPS-01 | pronto_local |
| OPS-02 | pronto_local |
| OPS-03 | pronto_local |
| OPS-04 | pronto_local |
| OPS-05 | pronto_local |
| OPS-06 | pronto_local |
| OPS-07 | pronto_local |
| OPS-08 | pronto_local |
| OPS-09 | pronto_local |
| OPS-10 | pronto_local |
| OPS-11 | pronto_local |
| OPS-12 | pronto_local |
| OPS-13 | pronto_local |
| OPS-14 | pronto_local |
| OPS-15 | pronto_local |
| OPS-16 | pronto_local |
| CLI-01 | a_revalidar |
| CLI-02 | a_revalidar |
| CLI-03 | a_revalidar |
| CLI-04 | em_execucao |
| CLI-05 | a_revalidar |
| CLI-06 | a_revalidar |
| CLI-07 | a_revalidar |
| CLI-08 | a_revalidar |
| CLI-09 | a_revalidar |
| CLI-10 | a_revalidar |
| CLI-11 | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) |
| CLI-12 | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) |
| CLI-13 | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) |
| CLI-14 | pronto_local (validação automática rápida; gate pesado e aceite humano pendentes) |
| CLI-15 | pronto_local (validação automática rápida; bateria pesada e aceite humano pendentes) |
| FIN-01 | pronto_local |
| FIN-02 | pronto_local |
| FIN-03 | pronto_local |
| FIN-04 | pronto_local |
| FIN-05 | pronto_local |
| FIN-06 | pronto_local |
| FIN-07 | pronto_local |
| FIN-08 | pronto_local |
| FIN-09 | pronto_local |
| FIN-10 | pronto_local |
| FIN-11 | pronto_local |
| FIN-12 | pronto_local |
| FIN-13 | pronto_local (validação automática completa; aceite humano pendente) |
| FIN-14 | pronto_local (validação automática completa; aceite humano pendente) |
| FIN-15 | pronto_local (validação automática completa; aceite humano pendente) |
| FIN-16 | pronto_local (validação automática completa; aceite humano pendente) |
| AST-01 | pronto_local |
| AST-02 | pronto_local |
| AST-03 | pronto_local |
| AST-04 | pronto_local |
| AST-05 | pronto_local |
| AST-06 | pronto_local |
| AST-07 | pronto_local |
| AST-08 | pronto_local |
| AST-09 | pronto_local |
| AST-10 | pronto_local |
| AST-11 | pronto_local |
| AST-12 | pronto_local |
| ADM-01 | pronto_local |
| ADM-02 | pronto_local |
| ADM-03 | pronto_local |
| ADM-04 | pronto_local |
| ADM-05 | pronto_local |
| ADM-06 | pronto_local |
| ADM-07 | pronto_local |
| ADM-08 | pronto_local |
| ADM-09 | pronto_local |
| ADM-10 | pronto_local |
| ADM-11 | pronto_local |
| ADM-12 | pronto_local |
| PLT-01 | a_revalidar |
| PLT-02 | a_revalidar |
| PLT-03 | a_revalidar |
| PLT-04 | pronto_local |
| PLT-05 | em_execucao |
| PLT-06 | a_revalidar |
| PLT-07 | a_revalidar |
| PLT-08 | em_execucao |
| PLT-09 | a_revalidar |
| PLT-10 | a_revalidar |
| PLT-11 | a_revalidar |
| PLT-12 | a_revalidar |
| PLT-13 | a_revalidar |
| PLT-14 | a_revalidar |
| PLT-15 | a_revalidar |
| PLT-16 | a_revalidar |
| PLT-17 | a_revalidar |
| PLT-18 | a_revalidar |
| EXT-01 | pronto_local (validação automática rápida; bateria pesada específica, aceite humano e Windows pendentes) |
| EXT-02 | pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes) |
| EXT-03 | pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes) |
| EXT-04 | pronto_local **da jornada interna de staff** (gate HTTP/DB dedicado; condição de volume e ator externo pendentes) |
| EXT-05 | pronto_local (jornada interna de staff + gate HTTP/PostgreSQL dedicado; destino, aceite humano e Windows pendentes). |
| EXT-06 | a_revalidar |
| EXT-07 | entregue_e_verificado_gate_local (2026-10-03, hardening 155 sobre a 153 e a 154 do main; base PR #103 + PR #113; 2026-10-04, execução agendada da avaliação temporal — migração 156 + agendador in-process opt-in por ambiente) |
| EXT-08 | a_revalidar |
| EXT-09 | a_revalidar |
| EXT-10 | a_revalidar |
| EXT-11 | a_revalidar |
| EXT-12 | a_revalidar |
| EXT-13 | a_revalidar |
| EXT-14 | a_revalidar |
| EXT-15 | a_revalidar |
| EXT-16 | a_revalidar |
| EXT-17 | a_revalidar |
| AI-01 | a_revalidar |
| AI-02 | a_revalidar |
| AI-03 | a_revalidar |
| AI-04 | a_revalidar |
| AI-05 | a_revalidar |
| AI-06 | a_revalidar |
| AI-07 | a_revalidar |
| AI-08 | a_revalidar |
| AI-09 | a_revalidar |
| AI-10 | a_revalidar |

## Proximo passo para o Arena
Partir do main atual e ler docs/ESTADO-EXECUCAO-LOCAL.md, docs/CHECKLIST-ENTREGA-LOCAL.md e docs/AUDITORIA-TERRENO-L08.md. Priorizar login/navegacao central e depois EXT-08; nao inventar conclusao de AI/EXT pendentes. Trabalhar em PR pequeno, sem segredos ou dados reais; preservar migracoes 001–156 e PLAT-01. Cada fatia deve provar UI→API→PostgreSQL, RBAC, rejeicao anonima, isolamento, rollback, idempotencia, reinicio e navegador. Atualizar checklist apenas com evidencia e entregar prompt da proxima fatia. Nao tocar nos outros containers desta maquina.

## Atualização de encerramento
A pedido do usuário, a prioridade passou a concluir as pendências no Arena antes da próxima instalação. Servidor e túnel de teste foram encerrados; o link antigo não deve ser usado. Banco, código e evidências foram preservados. Consulte 02-PLANO-ARENA.md, 03-ACEITE.md e 04-PROMPT-MASTER-ARENA.md.

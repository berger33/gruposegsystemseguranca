> **Atualização de 07/10/2026:** para a execução atual, leia o [plano de fechamento UX/RAG](ARENA-FECHAMENTO-UX-RAG-2026-10-07.md) e o [checklist por fatia](FECHAMENTO-UX-RAG-CHECKLIST-2026-10-07.md). A UX completa e o RAG privado ainda não estão concluídos. Este documento preserva o contexto da sua data; orientações de continuação e estado antigo devem ser reconciliados com a main atual. Não confundir UX-08/09 das extensões posteriores com TI/RAG e auditoria final do plano original.

# Continuação da implementação de UX — Arena

> **Reconciliação de 10/10/2026 (UX-PRO-00):** registro histórico — preserva a contagem e os limites da sua data. A fonte vigente do inventário de rotas e da cobertura é [UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md](UX-PRO-00-RECONCILIACAO-COBERTURA-2026-10-10.md): **100 entradas de rota** na `main` `c50a99beec…`, com critério reproduzível (`node scripts/ux-pro-00-inventory.mjs`) e a reconciliação 98 × 100.

## Leia antes de executar

Trabalhe em `github.com/berger33/gruposegsystemseguranca`, a partir da **main mais recente no GitHub**. O GitHub é a fonte central. Não use ZIPs ou snapshots antigos. Leia, nesta ordem:

1. `README.md` e `AGENTS.md`, se existir.
2. `docs/UX-PLANO-MESTRE-2026-10-05.md`.
3. `docs/ARENA-PROMPT-UX-ETAPAS-2026-10-05.md` (prompt mestre, obrigatório).
4. `docs/UX-00-AUDITORIA-BASELINE-2026-10-05.md` e inventário CSV.
5. `docs/UX-01-FUNDAMENTOS-2026-10-05.md`, `docs/UX-02-NAVEGACAO-2026-10-05.md` e `docs/UX-03A-CRM-2026-10-05.md`.
6. `docs/AI-RAG-LOCAL-2026-10-05.md` e código atual das rotas envolvidas.

Verifique SHA da main, estado das PRs #148–#151, checks, conflitos e ledger. Não confunda documentos históricos do README com estado vigente. Caso a PR #151 ainda esteja aberta, reconcilie sua situação antes de editar os mesmos arquivos. Não refaça UX-00/01/02 nem recrie PRs antigas. A última fatia conhecida usa migrações 001–174; confira se a main já recebeu posteriores e preserve todas.

## Estado e limites

- UX-00: inventário de 98 páginas e baseline; não é homologação funcional de todas as rotas.
- UX-01: tokens semânticos e componentes iniciais de campos/cartões; adoção ainda parcial.
- UX-02: navegação administrativa agrupada, busca de destinos permitidos, hub, breadcrumb e menu móvel.
- UX-03A: contraste, layout responsivo e atalhos do CRM. Typecheck/testes focais e prévia desktop/mobile com HTTP interceptado; isso não prova criação/importação real nem autenticação da prévia. Os seletores de browser foram atualizados para os novos nomes, sem remover asserções de negócio.
- UX-03 ainda está **parcial**. UX-04 a UX-09 permanecem pendentes.
- O servidor local na porta 3100 usava build anterior nesta entrega. O Arena não tem acesso à máquina, Docker ou Ollama do operador; não afirmar que os atualizou ou validou.
- Marcelo e Andreia ainda não participaram do aceite: a entrega será uma surpresa. Use dados fictícios e deixe aceite humano pendente.

## Comece por UX-03B — CRM, comercial e carteira

Audite primeiro handlers, componentes e contratos reais. Divida por famílias pequenas em PRs separadas:

1. **CRM: lista → detalhe → ação.** Organize seleção de oportunidade, resumo, tarefas, notas, interações, visitas e cadências. Deixe claro qual registro está aberto, ofereça retorno/fechamento e mantenha foco previsível. Preserve vínculos e escopo no servidor.
2. **Estados honestos de leitura.** Corrija catches silenciosos: loading não é vazio; falha não é zero; 403 explica falta de permissão sem expor dados; ofereça retry onde aplicável. Preserve respostas e status das APIs. Não alterar regras de acesso para fazer a tela parecer funcionar.
3. **Formulários e filtros.** Labels visíveis/associadas, campos agrupados, erros vinculados, obrigatoriedade clara, estados de envio e prevenção de duplo envio compatível com contratos existentes. Revisar componentes de unidades e contatos. Traduza rótulos de estágios/prioridades mantendo valores canônicos enviados às APIs.
4. **Importação.** Jornada arquivo/conteúdo → prévia → erros/duplicações → decisão explícita → confirmação → relatório. Não ocultar validações nem confirmar automaticamente duplicações. Preserve limites, revisão persistida, auditoria e comportamento fail-closed.
5. **Comercial e carteira.** Revise `/admin/comercial`, `/admin/carteira` e componentes reais. Organize vistoria, orçamento, preço, proposta e contrato em tarefas compreensíveis, com contexto e próximo passo; apresente carteira, busca/filtros e ações com clareza. Diferencie dado persistido de referência/protótipo. Evite despejar identificadores internos na linguagem cotidiana.

Critério: navegação e tarefas reais funcionam em desktop/mobile e teclado com massa fictícia; mesmas regras de autenticação, alçada, escopo, idempotência e auditoria. Executar gate CRM PostgreSQL/browser disponível no repositório. Se ambiente não permitir, registrar bloqueio exato e não marcar fluxo como aprovado. Atualize seletores quando a cópia mudar; nunca remova asserções de negócio para deixar checks verdes.

## Continue UX-04 a UX-09

Siga os critérios completos do plano mestre, nesta ordem, uma família coerente por PR:

- **UX-04 — RH:** tarefas de Andreia, navegação e informação por permissão; tratar a diferença observada entre papel no menu e grant efetivo na API. Melhorar formulários, listas, detalhes e estados sem ampliar acesso a dados pessoais.
- **UX-05 — Marcelo:** prioridades, pendências, indicadores com fonte e caminhos até registros reais; decisões com alçada e segregação preservadas. Não substituir falha de fonte por indicador zero.
- **UX-06 — portais:** funcionário/cliente, tarefas e acompanhamento intuitivos, isolamento por conta, distinção explícita entre `/cliente/app/*` operacional e previews. Não converter preview em produto por cosmética.
- **UX-07 — outras áreas:** aplicar os padrões às famílias restantes identificadas no inventário; registrar cada rota coberta e as que continuarem pendentes. Não declarar conclusão com páginas esquecidas.
- **UX-08 — TI e RAG:** confirmar o estado real antes de integrar. A auditoria encontrou `AiRagClient.tsx` sem montagem em página e `/admin/ti` descritivo. Entregar console útil com navegação para ferramentas reais e administração das fontes/documentos por área, usando contratos existentes. Escopo do RAG decidido no servidor; dados genéricos demonstrativos; mensagens claras para Ollama indisponível, índice vazio e falha de leitura. Não alegar teste local do modelo nem embedding semântico sem implementação/evidência. Evitar caminhos e conteúdo de áreas não autorizadas.
- **UX-09 — auditoria final:** reconciliar inventário completo, verificar consistência, fluxos por papel, mobile, teclado/foco, contraste, vazio/loading/erro/403 e regressões. Produzir matriz com evidência, resultado e pendências, separando CI, prévia e validação operacional.

## Regras de execução e entrega

Antes de CADA PR, atualizar main e reconciliar PRs/checks. Reutilizar tokens/componentes de UX-01, preservar visual público até revisão específica e evitar dependências pesadas para o PC de 8 GB sem GPU. Não alterar migrações antigas, APIs, autenticação, RBAC granular, isolamento de dados, trilhas de auditoria ou históricos por motivo visual. SMTP, hospedagem pública e instalação na máquina do operador estão fora do escopo.

Em cada PR entregar problema/resultado, rotas e papéis, antes/depois sanitizado, testes executados com resultados, checks do SHA atual, limitações e próxima fatia. Executar typecheck, testes focais, build e gates relevantes; se indisponível, declarar. Validar navegador real quando possível. Não inventar screenshots ou resultados; use cenários sintéticos e não publique credenciais, tokens ou dados pessoais.

Não iniciar fatia conflitante antes da anterior estar reconciliada na main. Não fazer merge automático de PR alheia. Se política do repositório exigir revisão/merge manual, deixar PR pronta com os checks e informar claramente. Não parar apenas no planejamento: implemente primeiro UX-03B e continue pelas famílias enquanto houver contexto/tempo. Se precisar interromper, registre exatamente arquivos, SHA, PR, checks e próxima ação, sem rotular etapa parcial como concluída.

## Relatório final obrigatório para revisão do Codex

Entregue um relatório versionado com:

1. SHA inicial/final, PRs e commits por etapa.
2. Matriz de todas as rotas do inventário: etapa, papel, tarefa, estado, evidência e pendência.
3. Testes/commands, resultado e ambiente; separar mock/prévia, HTTP real, PostgreSQL real e aceite humano.
4. Fluxos e permissões preservados e regressões encontradas/corrigidas.
5. Lista objetiva do que não foi concluído e motivo.
6. Runbook para o operador atualizar o checkout/build local, iniciar, testar por papel e reverter se necessário, sem segredos e sem operações destrutivas automáticas. Não afirmar execução desse runbook.
7. Prompt de continuação, se restar trabalho.

O proprietário pedirá ao Codex uma revisão independente depois. Não solicitar acesso ou aprovação a Marcelo/Andreia, não declarar o sistema inteiro pronto sem cobertura demonstrada e não encerrar com apenas ideias ou protótipos.

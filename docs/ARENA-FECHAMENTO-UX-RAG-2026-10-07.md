# Plano de fechamento de UX e RAG — 07/10/2026

Este é o ponto de entrada atual para o Arena. Complementa o plano mestre de UX; substitui orientações de continuação desatualizadas, não os registros históricos. Base auditada: main `c059e1207190988f8c1a305d1be28b8457ce3bde`. Reconciliar HEAD, PRs e ledger antes de executar. Esta documentação não implementa nem homologa funções.

## Diagnóstico e invariantes

O código recebeu muitas melhorias, mas não concluiu toda a UX. Os nomes UX-08/09/10/11 das últimas extensões não significam conclusão da UX-08 (TI/RAG) e UX-09 (auditoria final) do plano original. Não renomear PRs históricas. Usar os IDs FECH abaixo para evitar colisão.

- `RagWidget.tsx` bloqueia todo `ragKey` diferente de público, apesar da API `/api/ai/answer` ter autorização privada. `AiRagClient` não é montado; `/admin/ti` é descritivo.
- Não há fonte por diretório administrável pelo painel. O corpus atual é textual no banco; não há ingestão PDF nem busca semântica. Não prometer embeddings, dados vivos ou agentes autônomos.
- UI promete fila garantida, mas API limita concorrência e retorna `ai_busy`. UI aceita 2000 caracteres, API 500.
- RH tem sete componentes legados; algumas jornadas sensíveis seguem sem evidência ponta a ponta. Subpáginas do cliente não foram integralmente revisadas.
- Relatório final/matriz de 05/10 são históricos da PR #154; não consolidam todas as PRs posteriores.

Preservar autenticação, grants granulares, escopo por conta/unidade, auditoria fail-closed, idempotência, contratos e histórico. Nunca liberar acesso só porque há item no menu. Preservar todas as migrações existentes; conferir ledger (base conhecida 001–174). Migração aditiva somente por necessidade real documentada. Não acessar banco real, segredos, máquina ou Ollama do operador. SMTP/hospedagem fora do escopo. PC-alvo: 8 GB sem GPU. Marcelo e Andreia não participam agora; aceite humano pendente.

## Método: uma fatia por sessão

Leia README, AGENTS se existir, este documento, plano mestre, relatório da área e código real. Execute **somente o primeiro FECH pendente**, não todo o sistema numa sessão. Uma PR pequena por FECH; se ultrapassar uma família, divida em FECH-xxA/B no checklist. Não repetir trabalho já aprovado. Não avançar sobre arquivos conflitantes antes de reconciliar a PR anterior na main.

Cada PR: problema e resultado; rotas/papéis; antes/depois sanitizado; typecheck e testes focais; build e gates aplicáveis; desktop/mobile/teclado; limitações; checklist atualizado; prompt da próxima sessão. Não remover asserções nem reduzir segurança para passar CI. Não classificar teste com HTTP interceptado como teste real. CI indisponível: registrar job/SHA/motivo, não declarar verde. Não alterar regras globais de CI nesta iniciativa sem diagnóstico separado.

## Fatias ordenadas e critérios de saída

### FECH-01 — Assistentes privados e contrato do widget
Arquivos principais: `src/components/RagWidget.tsx`, páginas dos assistentes RH/Marcelo/cliente, `src/server/ai-rag-real-api.mjs` e testes existentes.
Remover o bloqueio visual apenas com sessão/permissões verificadas pelo servidor. Renderizar loading, 401, 403, índice vazio, ausência de fonte, banco indisponível, Ollama desligado/timeout e ocupado. Alinhar limite a 500 ou justificar mudança coordenada. Remover promessa de fila garantida; não implementar fila pesada como requisito implícito. Rótulo persistente, foco visível, status anunciado, prevenção de envio duplicado. Sem fonte não inventar protocolo/modelo usado; ocultar copiar protocolo quando ausente.
Saída: RH só corpus RH; Marcelo só gestão; cliente A não lê B; público não lê privado; sessão/grant revogado negado; rascunho/arquivado não recuperado; sem fonte não chama modelo. Testar contrato HTTP com provedor determinístico identificado como stub, sem alegar teste de Ollama real. Preservar geração local já existente.

### FECH-02 — Console real de TI e curadoria no banco
Montar `AiRagClient` numa rota protegida alcançável pelo painel TI ou extrair console próprio. Rever quais papéis podem curar cada corpus; servidor continua soberano. Diferenciar o que existe de capacidade prevista. Organizar bases/documentos/configuração/teste; labels visíveis; layout responsivo; erro por leitura em vez de `catch {}`; rascunho → revisão → publicação → versão → arquivamento. Documentos genéricos instaláveis por área; cliente exige conta específica. Mostrar configuração efetivamente usada via ambiente sem expor segredos; não fingir que campos legados do banco alteram o runtime.
Saída: fluxo completo de documento aprovado/arquivado e negativas por papel/conta, HTTP real e banco descartável; painel não deixa placeholders de capacidade parecerem botões funcionais.

### FECH-03 — Fontes por diretório administráveis
Entregar a solicitação original: TI administra as pastas usadas por cada corpus. Planejar antes o contrato de fonte: nome, área, conta/unidade cliente quando exigida, caminho, ativo, última leitura, resultado e documentos derivados. Usar raízes permitidas no servidor, configuradas pelo operador; painel seleciona caminho relativo validado. Nunca aceitar caminho absoluto arbitrário, traversal, symlinks para fora da raiz, leitura de segredos ou URL remota. Não expor caminho físico a outros papéis.
Primeira ingestão limitada a `.txt`/`.md` UTF-8 com limites de arquivos/bytes/caracteres e relatório de falhas. Sincronização manual explícita, importação em rascunho, hash para não duplicar conteúdo, versionamento de alterações; remoção na pasta não publica/apaga silenciosamente. Sem watcher permanente no PC fraco. PDF é capacidade futura declarada, não requisito desta fatia. IDs/escopo derivados da fonte autorizada; conta cliente nunca globalizada. Migração aditiva se indispensável, sem editar antigas.
Saída: testes de importação repetida/alteração/falha, raiz inválida, traversal, escopo A/B, publicação revisada e rastreabilidade. Arena testa em diretórios sintéticos da sandbox; operador configura F: depois. Runbook sem execução na máquina do operador.

### FECH-04 — RH: recrutamento e admissão
Revisar `HrClient`/`HrRecruitmentClient`, reaproveitando RhWorkspace e componentes. Não reescrever fluxos já cobertos. Lista/detalhe/ação, labels, erros e limites claros, negativas granulares. Evidência fictícia de recrutamento/admissão; não expor saúde/salário por conveniência.

### FECH-05 — RH: afastamentos, benefícios e treinamento
Revisar `HrAbsenceClient`, `HrBenefitsClient`, `HrTrainingClient`. Uma subfatia por componente se necessário. Estados honestos, datas, responsável, confirmação e resultado com APIs existentes. Testar leitura negada e mutação relevante.

### FECH-06 — RH: desligamento e processos avançados
Revisar `HrTerminationClient`/`HrAdvancedClient`; revogação e efeitos explícitos. Cobrir escala, documentos, fechamento/holerite e solicitação criada pelo funcionário → decisão RH com sessões sintéticas e grants corretos. Dividir a validação sensível em PR própria se necessário. Não simular emissão/pagamento real.

### FECH-07 — Subpáginas operacionais do cliente
Inventariar `/cliente/app/*` atuais. Não refazer continuidade já entregue. Diferenciar 401/403/404/503/rede em cada fluxo; persistir contexto e retry. Revisar navegação móvel, labels, detalhes e alvos de toque. Não promover `/cliente/painel` e outras referências a produto. Gates A/B por conta/unidade e revogação.

### FECH-08 — Patrimônio e almoxarifado
Revisar `PatrimonioWorkspace` e componentes usados, estados e ações existentes; inventário/movimentação conforme contratos. Sem lógica financeira nova ou alteração de estoque por cosmética.

### FECH-09 — Relatórios e apoio emergencial
Uma PR por família: `ReportsWorkspace` e `EmergencyWorkspace`. Dados-fonte, estados, confirmação e resultados reais. Não alegar envio SMTP nem socorro externo executado; referências/testes internos devem estar explícitos.

### FECH-10 — Leads e administração de clientes/portal
Uma PR por família; revisar rotas de leads, gestão de clientes, acessos/convites e portal com UI atual. Não ampliar RBAC. Evidenciar CRUD/fluxos que realmente existirem; SMTP indisponível declarado.

### FECH-11 — Editor visual, ferramentas TI restantes e site público
Inventário de funções TI realmente montadas e ainda órfãs. Encaminhar ferramentas operacionais em navegação coerente, sem publicar componentes indiscriminadamente. Revisar editor visual, mensagens públicas e referências com base no estado real. Uma PR por família. Evitar redesign das dez variantes públicas num commit.

### FECH-12 — Auditoria final consolidada
Gerar inventário atual (não assumir que continua 98) e matriz rota × papel × tarefa × estados × implementação × evidência × pendência. Usar git/PRs/código para reconciliar todas as entregas, não copiar matriz antiga. Separar página/layout compartilhado/subfluxo: arquivo não alterado pode receber melhora pelo shell; isso não prova fluxo completo.
Verificar 320/390/768/1280/1920, zoom/reflow, teclado/foco, contraste, reduzido movimento, labels e anúncios; leitor de tela nas jornadas críticas quando disponível. Registrar indisponibilidade em vez de alegar WCAG AA completo. Cobrir loading/vazio/rede/503/401/403/404/sessão expirada, ações concorrentes e conta alheia. Corrigir defeitos em PRs focais; auditoria não deve virar megapatch.
Entregar relatório datado atual e matriz; manter antigos rotulados históricos. Runbook local: backup, atualizar checkout, dependências, migrador oficial duas vezes se necessário, build/start, testes por papel, Ollama e corpus, rollback seguro sem editar migrações. Nenhuma evidência Windows/Ollama/humana fabricada. SMTP/hospedagem ficam excluídos, não defeitos de UX.

## Registro obrigatório

Atualizar `FECHAMENTO-UX-RAG-CHECKLIST-2026-10-07.md` em cada fatia: ID, estado (pendente/em execução/PR aberta/integrada/validada), SHA de base/head/merge, PR, testes com natureza/ambiente, evidências, limites e próxima ação. Integrada não significa homologada. Revisão humana e testes locais ficam separados.
Ao encerrar a sessão entregar um prompt curto para continuar o primeiro pendente, apontando estes dois documentos. Não pedir para executar todas as fatias de uma vez. O Codex fará revisão independente ao final.

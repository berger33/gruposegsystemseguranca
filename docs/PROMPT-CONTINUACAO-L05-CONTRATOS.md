# Continuação no Arena — L05: contratos e implantação

## Missão e fonte da verdade

Você está trabalhando no repositório GitHub `berger33/gruposegsystemseguranca`.
Conclua L05 (CON-01 a CON-11) como fluxo real, preservando L01–L04.
Use a versão atual do GitHub; a cópia no computador do usuário está desatualizada.
Execute o trabalho no ambiente remoto do Arena/GitHub. Não instale, inicie ou altere o projeto no computador do usuário.

Antes de começar:
1. Confira a branch main, seu SHA, os PRs abertos e o PR #33. Ele contém o fechamento técnico do L04.
2. Se #33 ainda estiver aberto, não replique suas alterações nem abra L05 sobre uma main antiga. Confirme o estado dos checks e informe que é necessário integrar #33. Se houver mudanças posteriores, compare os arquivos e preserve o trabalho novo.
3. Leia README, instruções AGENTS.md caso existam, docs/PLANO-MESTRE-IMPLEMENTACAO.md, docs/EXECUCAO-ENTREGA-LOCAL.md, docs/ESTADO-EXECUCAO-LOCAL.md, docs/CHECKLIST-ENTREGA-LOCAL.md e docs/ENTREGA-L04.md. Este prompt orienta L05; prompts antigos de fatias do L04 são histórico, não a próxima tarefa.
4. Registre o SHA inicial e identifique a próxima migração livre. O PR #33 introduz 117-l04-publication-portfolio.sql. Verifique a main antes de escolher 118 ou outro número. Não reescreva migrações já incorporadas.
5. Confirme que os checks do L04 estão verdes no código integrado. Não tome uma tela acessível, tabela existente ou teste de conexão como prova de fluxo completo.

## Limites mantidos

- Sem SMTP real e sem hospedagem pública. E-mails ficam na caixa de saída local com status honesto, sem declarar entrega/leitura.
- Sem pagamentos, emissão fiscal, assinaturas externas, disparos de WhatsApp ou publicação de dados reais.
- A simulação posterior será no computador do usuário; entregue configuração e instruções, sem executar ali.
- Sem novos serviços, preços, licenças, SLA, regras trabalhistas ou promessas inventadas.
- IA/RAG completo é L09; não dependa de uma LLM para contrato, autorização ou bloqueio.
- Beta/noindex e fluxos anteriores devem permanecer funcionais.
- Use apenas dados sintéticos em testes e PostgreSQL descartável. Não use banco de produção.
- A composição de pacote público é sob consulta; não confunda valores estimados ou ganho comercial com receita recebida.
- A carteira L04 é pessoal, inclusive para os papéis comerciais administrativos. Não alargue acesso implicitamente. Defina permissões contratuais explicitamente.
- Não delegue uma autorização a um componente React: API, recurso e vínculo precisam verificar o escopo.

## Diagnóstico obrigatório, seguido de execução

Mapeie contratos duplicados ou desconectados antes de alterar código:
- `src/server/contract-api.mjs`, `contract-details-api.mjs`, `contract-status-api.mjs`;
- `contract-amendment-api.mjs`, `contract-alert-api.mjs`, `contract-doc-obligation-api.mjs`;
- `contract-implantation-api.mjs`, `contract-closure-api.mjs`;
- `contract-fiscal-api.mjs`, `contract-management-diary-api.mjs`;
- componentes correspondentes em `src/app/admin/ti/Contract*Client.tsx`;
- `src/app/admin/clientes/ContractsSection.tsx`, `/admin/comercial`, portal cliente e funcionário;
- migrações 027 e 032–042, documentos/armazenamento L02, permissões e escopos de contrato/unidade.

Identifique a entidade contratual canônica, preservando IDs, proposta original, versão aceita e compatibilidade. Não crie mais uma tabela paralela só para conectar a interface. Não exclua dados para resolver inconsistências.
Entregue um diagnóstico curto no início e siga implementando; não pare no diagnóstico nem peça confirmação de escolhas rotineiras.

## Ordem de implementação

### 1. CON-01 e CON-02: contrato e composição

- Conectar empresa, unidades, proposta e versão, serviços, responsáveis, vigência, valores e documentos.
- Aceite válido cria exatamente um contrato e uma implantação; repetir ou concorrer no mesmo aceite não duplica.
- Cadastro manual deve identificar sua origem, autor e motivo; não inventar proposta de origem.
- Itens recorrentes/avulsos, postos/turnos, SLA, obrigações das partes, exclusões e cronograma devem ter formulários, validação, persistência e leitura.
- Evitar referências cruzadas a unidade/contato/documento de outro contrato/cliente.
- Disponibilizar uma área contratual de negócio acessível a Marcelo, sem depender de conhecer UUIDs ou o painel de TI.

### 2. CON-03 e CON-04: ciclo de vida e alterações

- Transições: rascunho → revisão → aguardando assinatura → ativo; suspensão e encerramento conforme regras explícitas.
- Assinatura/aceite não é ativação operacional. Exibir evidência e data de efeito.
- Autorizar cada transição, validar estado atual no servidor e registrar histórico na mesma transação.
- Aditivo/reajuste: base, justificativa, vigência, aprovação e versões imutáveis.
- Alterações não reescrevem o valor histórico, não aplicam antes da vigência e não geram cobranças duplicadas.
- Concorrência, retry, valores inválidos e falta de alçada devem falhar sem efeito parcial.

### 3. CON-05 e CON-06: obrigações e alertas

- Alertas configuráveis para vencimento/renovação; responsável, tarefa e oportunidade comercial vinculada.
- Reprocessar alerta não duplica tarefa, oportunidade ou notificação.
- Reutilizar caixa de saída local e carteira/CRM já entregues; nada de registrar “enviado” sem envio real.
- Obrigações documentais com categoria, periodicidade, prazo, responsável, aprovação e comprovante.
- Reutilizar upload/download privado e verificações L02; arquivo de outro contrato não pode ser lido ou vinculado.
- Sinalizar pendência/vencimento com ação concreta e responsável.

### 4. CON-07 e CON-08: implantação com bloqueios reais

- Checklist: contrato, início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções, faturamento e convite de cliente.
- Reutilizar dados de RH/operação disponíveis. Onde o lote posterior ainda não oferece integração, mostrar a dependência real e bloquear o que depender dela; não fabricar “OK”.
- Distinguir obrigatório, opcional e bloqueio que admite exceção.
- Exceção exige permissão, motivo, responsável, validade e trilha; nunca permitir contornar exigência legal com checkbox.
- Falha de auditoria ou erro no meio da ativação deve reverter toda a transação.
- Testar tentativa de ativação incompleta, papel sem alçada, evidência expirada e ativação válida.

### 5. CON-09: encerramento

- Registrar data/motivo, desmobilização, devoluções, documentos, pendências e tratamento de cobranças.
- Revogar escopos de contrato/unidade no momento correto, preservando outros contratos do mesmo cliente e o histórico.
- Retry/concorrência não duplica baixa, devolução ou fechamento.
- Não apagar pendências ou histórico para concluir o checklist.
- Antes/depois: cliente autorizado deixa de acessar o contrato encerrado conforme a política definida, sem perder acesso a outro contrato ativo.

### 6. CON-10 e CON-11: fiscalização e diário

- Dossiê com medições, aceite de serviços e evidências de qualidade vinculadas.
- Diário de decisões com busca, acesso restrito, autor, data e vínculo a contrato/processo.
- Não colocar segredo, prontuário ou dados sensíveis de RH em nota livre de gestão.
- Provar por teste que cliente, funcionário e outro escopo não consultam o diário ou evidência privada indevidamente.
- Interface deve mostrar estado vazio, carregamento, erro e confirmação somente após persistência.

## Testes e critérios de conclusão

Crie gate L05 remoto com HTTP real, PostgreSQL descartável e Chromium, seguindo o padrão de `.github/workflows/l04-delivery.yml` e `tests/l04-delivery.integration.test.mjs`.

Fluxo mínimo integrado:
1. Lead → oportunidade → proposta aprovada → aceite da versão correta.
2. Um contrato/implantação, inclusive após retry e chamadas concorrentes.
3. Vincular unidade, serviços, responsável, SLA e documento privado.
4. Demonstrar bloqueio real de implantação incompleta.
5. Completar pré-requisitos legítimos e ativar com permissão.
6. Aditivo com data de efeito e histórico preservado.
7. Alerta de renovação cria tarefa/oportunidade uma única vez.
8. Medição/evidência e decisão de gestão no escopo correto.
9. Encerramento preserva pendências/histórico e revoga somente os acessos devidos.

Controles negativos obrigatórios: anônimo, papel indevido, troca de ID, cliente A/B, funcionário A/B, origem inválida em mutação, contrato errado, versão desatualizada, documento sem permissão, falta de aprovação e falha de auditoria com rollback.
Confira no banco o efeito relevante; não simule o resultado do handler nem substitua banco/navegador por mocks.

Execute e registre comandos existentes, adaptando nomes de novos scripts se necessário:
- `node scripts/qa-wave0-static.mjs`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- `npm run test:migrations:pg`;
- `npm run test:l04-delivery:pg`;
- novo gate L05 e CI de regressão que o PR disparar.

Inspecione logs e corrija falhas. Não marque gate como aprovado se houve skip, timeout, teste não executado ou comparação apenas estática.
Não repita suítes já aprovadas sem mudança relevante; rode novamente as afetadas após correções.

## Entrega

- Código e migrações em branch isolada e PR revisável; não fazer merge com checks vermelhos.
- Matriz CON-01..11 em docs/CHECKLIST-ENTREGA-LOCAL.md: tela, API, tabelas, autorização, teste, resultado e limite real.
- Atualize docs/ESTADO-EXECUCAO-LOCAL.md e documente decisões de domínio/compatibilidade.
- Faça distinção entre conclusão técnica local, aceite humano e ativação de serviços externos.
- Liste o que foi corrigido, o que foi testado, links dos checks, riscos concretos e próximos passos.
- Somente declare L05 concluído quando todo o fluxo e controles passarem. Se algo impedir isso, descreva exatamente a lacuna; não renomeie implementação parcial como conclusão.
- Ao finalizar L05, entregue um prompt equivalente para L06 (operação, patrimônio e manutenção), sem começar L06 nesta tarefa.

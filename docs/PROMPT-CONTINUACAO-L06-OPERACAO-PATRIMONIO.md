# Continuação no Arena — L06: operação, patrimônio e manutenção

## Missão, fonte oficial e pré-condições

Trabalhe no repositório GitHub `berger33/gruposegsystemseguranca`, no ambiente remoto Arena/GitHub. Não execute, instale, inicie nem altere nada no computador do usuário. Use somente dados sintéticos e PostgreSQL descartável.

Antes de qualquer mudança:

1. Confira `main`, SHA, PRs abertos e os checks do PR L05. Não comece sobre `main` antiga nem replique mudanças de uma PR ainda aberta.
2. Leia integralmente `README.md`, `AGENTS.md` se existir, `docs/PLANO-MESTRE-IMPLEMENTACAO.md`, `docs/EXECUCAO-ENTREGA-LOCAL.md`, `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`, `docs/ENTREGA-L04.md` e `docs/ENTREGA-L05.md`.
3. Registre SHA/base e confirme a próxima migração livre em `main`. Não modifique as migrações 001–118 já integradas; use a próxima numeração disponível e atualize o manifesto/preflight.
4. Rode e registre o baseline aplicável. L05 introduziu `crm_contracts` canônico, vínculo explícito ao portal e fechamento que pode revogar somente o contrato de portal associado. Não reconstrua um segundo contrato, não apague histórico e não contorne esses escopos.
5. Mapeie antes de codificar: migrações OPS/AST existentes, APIs de funcionário/RH/contratos, tabelas de escala/alocação/estoque/OS, armazenamento privado L02 e autorizações por contrato/unidade.

## Limites não negociáveis

- Sem serviço público/emergencial, central 24h, monitoramento real, geolocalização pública, despachos externos, SMS, WhatsApp, SMTP real, pagamentos, cobrança real, nota fiscal ou compra real.
- Simulador de monitoramento, se usado, deve ser identificado como sintético e não prometer serviço disponível.
- Não inventar disponibilidade, treinamento, exame, competência, cobertura, estoque, garantia ou evidência. O que depende de dado/integração posterior deve ficar claramente bloqueado e explicar o pré-requisito.
- Contrato ativo não equivale a equipe alocada, cobertura concluída, faturamento ou recebimento.
- Cliente, funcionário e terceiro nunca podem obter acesso por ID trocado. API deve autorizar recurso, contrato, unidade, vínculo e papel; React não é fronteira de segurança.
- Não alterar migrações existentes, não semear dado demonstrativo persistente e não usar base externa/produção.

## Diagnóstico obrigatório

Produza primeiro um diagnóstico curto e commitado. Ele deve identificar entidade canônica e compatibilidades para:

- OPS-01..04: cliente/unidade/posto, necessidade por turno, alocação, escala e validação;
- OPS-05..08: cobertura, passagem, ocorrência, checklists de posto;
- OPS-09..12: supervisão, rondas, chaves/materiais, relatórios operacionais;
- OPS-13..16: métricas, escalas, rotinas de limpeza, consumo, não conformidades e monitoramento sintético;
- AST-01..06: estoque, reserva, ativo/serial, entrega/guarda, requisição e compras;
- AST-07..12: inventário, ordem de serviço, manutenção, CFTV/limpeza quando configurados, garantias, dossiê e indicadores.

Verifique especialmente a ponte entre `crm_contracts`, postos contratuais, unidades CRM e dados de escala/funcionário. Um contrato encerrado não pode receber nova rotina/alocação; seu histórico continua consultável ao papel adequado.

## Ordem de implementação e critérios

### 1. OPS-01 a OPS-04 — estrutura, alocação e escala

- Modele cliente → unidade atendida → posto físico → necessidade por turno → alocação, sem duplicar empresa/unidade/contrato de L04/L05.
- Alocação exige funcionário válido, função/cargo aplicável, unidade/contrato corretos e período. Conflitos de escala, disponibilidade, documento ou competência devem bloquear com motivo; não apenas avisar.
- Escala publicada deve preservar versão, autor e data. Alteração/retry não deve duplicar turno nem apagar a ciência anterior.
- Funcionário vê somente sua escala e recebe atualização interna persistida; não alegar envio externo.

### 2. OPS-05 a OPS-08 — cobertura e operação de posto

- Ausência/cancelamento abre necessidade de cobertura auditável. Supervisor só substitui pessoa habilitada e sem conflito; mantenha responsável, motivo e vigência.
- Passagem de turno, ocorrência e checklist devem ter escopo de posto/unidade/contrato, autor e data. Dados internos/RH não vão para cliente.
- Estado de checklist não pode confirmar requisito desconhecido. Evidência privada reutiliza L02 e exige vínculo correto.

### 3. OPS-09 a OPS-16 — supervisão, limpeza e monitoramento

- Supervisão/ronda e guarda de chaves/materiais precisam de trilha, autorização e idempotência; não use GPS real se não houver fonte autorizada.
- Rotinas de limpeza ligam ambiente, periodicidade, execução, consumo e não conformidade. Não conclua rotina sem executor/evidência coerente.
- Indicadores explicam fonte, período e incompletude. Monitoramento é simulado de modo explícito, sem SLA/promessa de central.

### 4. AST-01 a AST-06 — estoque e ativos

- Movimentos de estoque devem ser transacionais, com quantidade não negativa e idempotência. Reserva/liberação/baixa concorrentes não podem duplicar nem ultrapassar disponibilidade.
- Serial/ativo, entrega, guarda, devolução, requisição e compra guardam origem, responsável, unidade/contrato quando aplicável e histórico. Não criar compra/recebimento real.
- Use autorização por almoxarifado/unidade/contrato; uma unidade não movimenta estoque de outra por ID trocado.

### 5. AST-07 a AST-12 — inventário, OS e manutenção

- Inventário registra contagem, divergência, autor, aprovação e efeito transacional, sem apagar passado.
- OS liga ativo/local, defeito, prioridade, executor, materiais, evidência privada, garantia e custo de referência. Concluir OS exige condição consistente; reexecução não duplica consumo/evidência/custo.
- Dossiê técnico e indicadores mantêm escopo restrito; não exponha evidência interna ao portal/funcionário sem política explícita.

## Interface e autorização

Crie áreas de negócio navegáveis para operação/supervisão/almoxarifado e autoatendimento do funcionário quando necessário. Não dependa de UUID digitado, painéis órfãos de TI ou mocks. Cada tela deve ter carregamento, vazio, erro e confirmação somente após persistência.

Defina papéis de modo explícito e mínimo. Preserve a carteira comercial L04 e a segregação de RH. Não conceda permissões globais para simplificar teste.

## Gate L06 e regressões

Crie um gate remoto L06, no padrão dos gates L04/L05: workflow GitHub, script que recusa banco externo, PostgreSQL descartável, servidor HTTP real e Chromium. Não marque aprovado se houve skip, timeout ou mock substituindo banco/navegador.

Fluxo mínimo obrigatório:

1. contrato/unidade/posto sintéticos válidos e necessidade de turno;
2. escala/alocação publicada; funcionário A vê apenas A;
3. ausência abre cobertura; supervisor tenta substituto inválido (nega) e válido (persiste uma vez);
4. passagem, ocorrência e checklist no escopo certo; usuário B e cliente B negados;
5. reserva e baixa de material sob concorrência não ficam negativas;
6. OS consome material exatamente uma vez, aceita evidência privada autorizada e atualiza dossiê/custo de referência;
7. encerramento de contrato impede nova alocação/rotina mas preserva histórico;
8. tentativas de anônimo, papel indevido, origem inválida, troca de ID, auditoria indisponível e retry devem falhar sem efeito parcial.

Rode e registre, conforme afetado:

- `node scripts/qa-wave0-static.mjs`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- `npm run test:migrations:pg`;
- `npm run test:l04-delivery:pg` e `npm run test:l05-delivery:pg` quando tocar contratos/CRM/portal;
- novo `npm run test:l06-delivery:pg` e o workflow correspondente.

## Entrega

- Atualize matriz OPS-01..16 e AST-01..12 em `docs/CHECKLIST-ENTREGA-LOCAL.md`, estado, decisões/evidências e relatório L06.
- Diferencie conclusão técnica local, aceite humano, integração externa e simulação.
- Abra PR revisável da branch da sessão, aguarde checks verdes e só então faça merge se o usuário solicitar/autorizar dentro do fluxo aplicável.
- Não inicie L07 nesta tarefa; ao finalizar, entregue apenas o prompt de continuidade seguinte.

# Prompt completo de continuação — L06, fatias B a E

Copie integralmente este prompt para uma nova sessão do Arena Agent Mode.

---

## Missão

Trabalhe no repositório GitHub `berger33/gruposegsystemseguranca`, exclusivamente no ambiente remoto Arena/GitHub. Continue o **L06 — Operação, patrimônio e manutenção** a partir da fatia A já integrada. Entregue as fatias B, C, D e E em incrementos verificáveis, cada uma com PR própria e gate verde. Não inicie o L07 durante esta missão.

Não execute, instale, inicie nem altere nada no computador do usuário. Use apenas dados sintéticos, PostgreSQL descartável e Chromium do ambiente remoto. Nunca use banco, credenciais ou integrações de produção.

## Estado oficial já integrado

- Base oficial: `main` no commit `bf7d7c425f4bba3a3ed4292e569af9361ad76a58`.
- PR #35, **L06 fatia A**, mergeada em 2026-09-30.
- Os checks da PR #35 passaram: QA baseline, L04 CRM, L05 contratos e L06 operações.
- L05 já é a fonte canônica para contratos.
- Migrações `001–119` são imutáveis. A próxima migração livre é a **120**.

### O que a fatia A entregou — não refazer

- Migração aditiva `119-l06-operacao-hardening.sql`:
  - `ops_posts.contract_id → crm_contracts`;
  - índice correspondente.
- Endurecimento de `src/server/ops-api.mjs`:
  - `POST /api/ops/allocations` valida posto existente/ativo, contrato em condição operacional e funcionário ativo;
  - contratos `encerrado`, `cancelado` ou `suspenso` bloqueiam novas alocações sem apagar histórico;
  - duplicidade exata e sobreposição de turno são rejeitadas;
  - foi corrigido o bug do parâmetro `$3` não utilizado que fazia a verificação de sobreposição falhar silenciosamente;
  - a verificação é fail-closed;
  - alocação e auditoria são gravadas na mesma transação, também fail-closed;
  - `POST /api/ops/posts` aceita `contract_id` e valida coerência de empresa.
- Área navegável `/admin/operacao`, com estados de carregamento, vazio e erro.
- Gate L06 real:
  - `scripts/qa-l06-delivery-postgres.mjs`;
  - `tests/l06-delivery.integration.test.mjs`;
  - `npm run test:l06-delivery:pg`;
  - `.github/workflows/l06-delivery.yml`.
- Documentação inicial:
  - `docs/DIAGNOSTICO-L06-OPERACAO-PATRIMONIO.md`;
  - `docs/ENTREGA-L06.md`;
  - matriz OPS/AST em `docs/CHECKLIST-ENTREGA-LOCAL.md`.

### Estruturas preexistentes que devem ser consolidadas, não recriadas

O schema e APIs de layout já existiam antes da fatia A:

- migrações `070–073`: domínio OPS;
- migrações `083–084`: domínio AST;
- APIs `ops-api`, `ops-advanced`, `ops-advanced-2`, `ops-advanced-3`, `emp-ops-api`, `ast-api` e `ast-advanced`;
- clientes antigos sob `src/app/admin/ti/*`.

Não trate L06 como greenfield. Audite e endureça as estruturas existentes. Não entregue painel órfão de TI como interface final de negócio.

## Pré-voo obrigatório

Antes de alterar código:

1. Atualize a referência remota e confirme que está partindo da `main` atual, contendo o merge da PR #35. Registre o SHA real. Se a `main` avançou, use a versão mais recente e confira as mudanças posteriores.
2. Verifique PRs abertas e checks recentes. Não duplique uma fatia já em andamento.
3. Leia integralmente:
   - `README.md`;
   - `docs/PROMPT-CONTINUACAO-L06-OPERACAO-PATRIMONIO.md` — plano-mãe;
   - `docs/DIAGNOSTICO-L06-OPERACAO-PATRIMONIO.md`;
   - `docs/ENTREGA-L06.md`;
   - `docs/ENTREGA-L05.md`;
   - `docs/CHECKLIST-ENTREGA-LOCAL.md`;
   - o teste e o script atuais do gate L06.
4. Mapeie novamente antes de codificar:
   - entidades canônicas `crm_contracts`, `crm_company_units` e `hr_employees`;
   - provedor privado de documentos/evidências do L02, incluindo `client_documents`;
   - autenticação e autorização por papel, empresa, contrato, unidade, posto e vínculo;
   - tabelas OPS/AST e handlers existentes;
   - invariantes, checks, índices e regras de idempotência já presentes.
5. Rode e registre o baseline:

```bash
node scripts/qa-wave0-static.mjs
npm run typecheck
npm run test:migrations:pg
npm run test:l06-delivery:pg
```

Não continue sobre baseline quebrado sem primeiro diagnosticar e documentar se a falha já existia.

## Migrações

- Não edite, reordene, renomeie nem substitua migrações `001–119`.
- A próxima livre é `120`; confirme no repositório antes de usá-la.
- Toda mudança deve ser aditiva e preservar histórico.
- Ao criar migração, atualize:
  - a lista de arquivos e o `files.length` em `scripts/migrate-site-visual.mjs`;
  - `latestMigration` em `scripts/qa-wave0-static.mjs`.
- `EXPECTED_MIGRATIONS` em `scripts/qa-migrations-postgres.mjs` é dinâmico; não o transforme em número fixo.
- Não inclua seed demonstrativo persistente.

## Limites de escopo e segurança

São regras não negociáveis:

- Não implementar ou alegar serviço público/emergencial, central 24h, despacho externo, GPS real, monitoramento real, SMS/WhatsApp/SMTP real, pagamento, cobrança, nota fiscal ou compra real.
- Monitoramento deve ser explicitamente **sintético/simulado**, sem promessa de disponibilidade, SLA ou resposta operacional real.
- Não inventar disponibilidade, escala, habilitação, treinamento, competência, cobertura, estoque, garantia, manutenção ou evidência.
- Quando um dado depender de cadastro, aceite humano ou integração futura, bloquear a ação com explicação objetiva do pré-requisito.
- Contrato ativo não significa equipe alocada, cobertura concluída, serviço executado, faturamento emitido ou recebimento.
- Não expor dados internos, RH, documentos privados, custos internos ou evidências técnicas a cliente, funcionário ou terceiro sem política explícita.
- Não permitir acesso por troca de UUID/ID. A API — não o React — deve autorizar recurso, empresa, contrato, unidade, posto, vínculo e papel.
- Use `/api/ops/*` e `/api/ast/*` fora da borda de RH quando o recurso não for de RH. A borda `authorizeLegacyHrRequest` cobre `/api/admin/hr/*`, `/api/hr/*` e `/api/crm/hr/*`.
- Não conceda permissões globais apenas para facilitar testes.
- Não crie entidades paralelas de cliente, proposta, contrato, unidade, funcionário ou portal. Reutilize os domínios canônicos.

## Estratégia de entrega

Execute na ordem B → C → D → E. Cada fatia deve:

1. começar com diagnóstico localizado do schema/API/UI existentes;
2. aplicar mudanças mínimas e aditivas;
3. ampliar o gate L06 com casos positivos e negativos reais;
4. passar regressões pertinentes;
5. atualizar documentação e matriz;
6. abrir PR pequena e revisável;
7. aguardar checks verdes;
8. só fazer merge com autorização explícita do usuário.

Não acumule todas as fatias em uma PR monolítica.

# Fatia B — OPS-05..08

## Escopo

Consolidar cobertura, passagem de turno, ocorrência e checklist operacional.

### Cobertura e substituição

- Ausência ou cancelamento deve abrir necessidade de cobertura auditável.
- Registre posto, contrato, unidade, turno afetado, pessoa ausente quando aplicável, motivo, responsável, vigência, status e trilha temporal.
- Supervisor só pode indicar substituto habilitado, ativo, disponível e sem conflito de turno.
- Não inferir habilitação ou disponibilidade quando os dados não existirem; bloquear e explicar o pré-requisito.
- Retry da mesma operação não pode criar cobertura, ciência ou substituição duplicada.
- Cancelamento e encerramento preservam histórico; não apagar registros anteriores.

### Passagem de turno

- Vincular passagem a posto, contrato/unidade, turno, autor e data/hora.
- Separar pendências, observações e ciência do próximo responsável.
- Ciência deve ser idempotente e auditável.
- Não expor dados restritos de RH na visão do cliente.

### Ocorrências

- Vincular ocorrência a escopo operacional autorizado, autor, data/hora, classificação e estado.
- Preservar histórico de alterações e responsáveis.
- Evidências privadas devem reutilizar o mecanismo do L02 com vínculo e autorização corretos.
- Não simular acionamento emergencial ou resposta externa.

### Checklists

- Vincular modelo e execução ao posto/unidade/contrato corretos.
- Estado do checklist não pode confirmar requisito desconhecido, treinamento inexistente ou evidência ausente.
- Finalização deve validar itens obrigatórios e executor autorizado.
- Reexecução/retry não duplica execução, ciência ou evidência.

## Casos obrigatórios no gate da fatia B

Além dos casos já existentes:

- papel indevido negado;
- usuário da empresa/unidade B não acessa recurso A por ID trocado;
- cliente B não lê passagem, ocorrência ou checklist de A;
- funcionário inativo ou sem vínculo não assume cobertura;
- substituto com conflito é rejeitado;
- contrato encerrado não recebe nova rotina operacional;
- retry de ciência/finalização não duplica efeito;
- evidência privada só é vinculada e lida por ator autorizado;
- falha de auditoria não deixa efeito parcial quando a operação exigir atomicidade.

# Fatia C — AST-01..06

## Escopo

Consolidar estoque, reserva, ativo/serial, entrega, devolução, requisição e fluxo interno de compras.

### Estoque e movimentos

- Movimentos devem ser transacionais, auditáveis e idempotentes.
- Quantidade disponível nunca pode ficar negativa.
- Reserva, liberação e baixa concorrentes não podem duplicar nem ultrapassar disponibilidade.
- Registre origem, tipo, quantidade, item, almoxarifado, unidade/contrato quando aplicável, responsável e data/hora.
- Uma unidade/empresa não movimenta estoque de outra por ID trocado.

### Ativos e seriais

- Preserve identidade, serial, estado, localização/guarda, responsável e histórico.
- Transferência, entrega e devolução devem manter cadeia de custódia.
- Não sobrescrever passado para representar o estado atual.

### Requisição e compras internas

- Requisição deve registrar solicitante, aprovador quando aplicável, destino, itens e status.
- “Compra” é apenas fluxo administrativo interno/sintético; não integrar fornecedor, pagamento, recebimento fiscal ou emissão real.
- Não marcar item como recebido sem evento e responsável coerentes.

## Casos obrigatórios no gate da fatia C

- reserva válida reduz disponibilidade apenas uma vez;
- retry idempotente não repete movimento;
- duas reservas/baixas concorrentes não deixam saldo negativo;
- liberação recompõe quantidade exatamente uma vez;
- unidade B é negada ao tentar movimentar estoque A;
- serial não pode ter duas guardas ativas incompatíveis;
- entrega/devolução preserva histórico;
- falha de auditoria ou validação não deixa movimento parcial.

# Fatia D — AST-07..12

## Escopo

Consolidar inventário, ordens de serviço, manutenção, materiais, evidências e dossiê técnico.

### Inventário

- Registrar contagem, item/ativo, local, responsável, data, quantidade esperada, quantidade apurada e divergência.
- Ajuste decorrente de divergência exige autorização e efeito transacional auditável.
- Aprovação não apaga a contagem nem o estado anterior.
- Retry não duplica ajuste.

### Ordem de serviço e manutenção

- Vincular OS a ativo/local autorizado, defeito, prioridade, responsável/executor, estado e datas.
- Materiais consumidos devem usar o domínio de estoque e ser baixados exatamente uma vez.
- Conclusão exige estado consistente, executor e informações/evidências obrigatórias.
- Reexecução não duplica consumo, evidência ou custo.
- Garantia e custo são dados de referência; não inventar cobertura, aprovação, pagamento ou cobrança.
- Evidências privadas reutilizam o mecanismo do L02.
- Dossiê técnico preserva histórico de intervenções e escopo de acesso.

## Casos obrigatórios no gate da fatia D

- OS de ativo/unidade A é negada a usuário B;
- conclusão sem executor ou condição obrigatória é rejeitada;
- material é consumido exatamente uma vez;
- retry da conclusão não duplica material, custo nem evidência;
- falta de estoque bloqueia conclusão sem efeito parcial;
- evidência privada é aceita apenas com autorização e vínculo corretos;
- inventário aprovado ajusta saldo uma vez e mantém divergência/histórico;
- dossiê e custo não vazam para portal/funcionário sem política explícita.

# Fatia E — OPS-09..16

## Escopo

Consolidar supervisão, rondas, chaves/materiais, limpeza, monitoramento sintético e indicadores.

### Supervisão e rondas

- Registrar plano/rotina, posto/local, responsável, janela temporal, execução e resultado.
- Não alegar GPS ou presença real sem fonte autorizada; se houver simulação, rotular claramente.
- Reexecução não duplica execução, ciência ou ocorrência.

### Chaves e materiais sob guarda

- Registrar retirada, responsável, finalidade, local, devolução e pendências.
- Impedir duas guardas ativas incompatíveis.
- Preservar cadeia de custódia e trilha de auditoria.

### Limpeza

- Vincular ambiente, periodicidade, execução, executor, consumo e não conformidade.
- Não concluir sem executor e evidência/itens obrigatórios coerentes.
- Consumo deve respeitar estoque e idempotência.

### Monitoramento sintético e indicadores

- Qualquer monitoramento deve ser explicitamente sintético/simulado.
- Não prometer central 24h, SLA, despacho ou resposta operacional.
- Indicadores devem explicar fonte, período, escopo, fórmula e incompletude.
- Não transformar ausência de dado em zero ou sucesso.

## Casos obrigatórios no gate da fatia E

- supervisão/ronda respeita contrato, unidade, posto e papel;
- guarda concorrente de chave/material incompatível é rejeitada;
- devolução idempotente ocorre uma vez;
- rotina de limpeza incompleta não pode ser concluída;
- consumo de limpeza não duplica e não deixa estoque negativo;
- monitoramento aparece rotulado como sintético na API e UI;
- indicadores informam fonte/período/incompletude;
- usuário B não acessa execução ou indicador restrito de A.

## Interface de negócio

Consolide áreas navegáveis de operação, supervisão, almoxarifado/manutenção e, quando necessário, autoatendimento do funcionário, seguindo o padrão iniciado em `/admin/operacao`.

Requisitos:

- não exigir que o usuário digite UUID;
- usar seletores e contexto autorizados;
- não depender de painel órfão em `/admin/ti` como entrega final;
- não usar mocks na experiência marcada como concluída;
- exibir estados de carregamento, vazio e erro;
- só confirmar sucesso após persistência real;
- explicar bloqueios e pré-requisitos sem afirmar fatos inexistentes;
- aplicar papéis mínimos e explícitos.

## Gate L06 e regressões

Amplie incrementalmente `tests/l06-delivery.integration.test.mjs`. O gate deve continuar usando:

- PostgreSQL descartável real;
- servidor HTTP real;
- Chromium real;
- dados exclusivamente sintéticos;
- nenhuma substituição do banco ou navegador por mock;
- nenhum `skip` para caso obrigatório.

Não marque a fatia como aprovada se houver skip, timeout ignorado, mock substituindo infraestrutura real ou asserção que apenas verifica status superficial.

Por fatia, rode e registre conforme o impacto:

```bash
node scripts/qa-wave0-static.mjs
npm run typecheck
npm test
npm run build
npm run test:migrations:pg
npm run test:l06-delivery:pg
```

Se tocar contratos, CRM ou portal, rode também:

```bash
npm run test:l04-delivery:pg
npm run test:l05-delivery:pg
```

Após `npm run build`, revise o diff e reverta alterações automáticas não intencionais em `next-env.d.ts`, `tsconfig.json` ou outros artefatos de build. Não versione `node_modules`, `.next`, bancos descartáveis, screenshots temporários ou logs volumosos.

## Documentação e evidências

A cada fatia:

- atualize as linhas correspondentes de OPS-01..16 e AST-01..12 em `docs/CHECKLIST-ENTREGA-LOCAL.md`;
- atualize `docs/ENTREGA-L06.md` com:
  - diagnóstico;
  - decisões e invariantes;
  - migrações e endpoints alterados;
  - fronteiras de autorização;
  - casos positivos e negativos do gate;
  - comandos executados e resultados;
  - limitações, simulações e dependências restantes;
- diferencie claramente:
  - conclusão técnica local;
  - aceite humano pendente;
  - integração externa não realizada;
  - comportamento sintético/simulado.

Não use apenas texto ou screenshot como evidência de regra crítica: a regra deve estar coberta no gate automatizado.

## Critério de conclusão de cada fatia

Uma fatia só está pronta quando:

- schema, API e UI do escopo estão coerentes;
- autorização ocorre no servidor e bloqueia troca de ID;
- idempotência, concorrência e atomicidade relevantes estão testadas;
- auditoria não deixa efeito parcial nas operações críticas;
- gate L06 real passa sem skip;
- regressões pertinentes passam;
- documentação e matriz estão atualizadas;
- a PR está pequena, revisável e com checks verdes.

## Encerramento do L06

Quando B, C, D e E estiverem integradas:

1. rode o conjunto final de regressões;
2. confirme OPS-01..16 e AST-01..12 na matriz, sem marcar como concluído o que for apenas simulação ou depender de aceite humano/integração;
3. finalize `docs/ENTREGA-L06.md` com evidências reproduzíveis;
4. entregue um novo prompt completo para iniciar o **L07** em outra sessão;
5. não implemente L07 dentro desta missão.

## Forma de comunicação

Seja objetivo e verificável. Antes de cada fatia, informe o diagnóstico real. Ao final, liste arquivos alterados, migrações, regras de autorização, casos do gate, resultados dos comandos, limitações e URL da PR. Não declare sucesso sem evidência do gate e dos checks remotos.

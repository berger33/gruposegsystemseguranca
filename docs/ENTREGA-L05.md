# Entrega L05 — contratos e implantação

**Data:** 2026-09-30
**Base integrada:** `main` / `2e3106fd41aac5510c24064ccbbfa7d3ab046b40`
**Branch de entrega:** `arena/01a0f23a-gruposegsystemseguranca`

## Resultado técnico local

L05 torna `crm_contracts` a fonte canônica do fluxo contratual e introduz a área de negócio `/admin/contratos`. A compatibilidade do portal é explícita: `client_contracts` continua sendo a projeção legada do portal e somente se associa ao contrato CRM por `crm_contract_portal_links`; nenhum contrato de portal, conta de cliente ou proposta é criado automaticamente.

A migração aditiva **118** preserva 001–117 e:

- permite `crm_contracts.proposal_id` nulo para cadastro manual legítimo, sem proposta fictícia;
- permite implantação de contrato manual sem `proposal_id` inventado;
- cria vínculos restritos de contrato CRM/portal e de documentos privados L02;
- registra execuções de alerta com unicidade `(alert_rule_id, due_date)`;
- adiciona vínculo de comprovante de obrigação e evidência de qualidade somente a `client_documents` existentes;
- cria/backfill do checklist explícito de dez etapas como `pendente`, sem inferir conclusão do histórico;
- adiciona validade a exceções de implantação e amplia a whitelist de auditoria apenas com ações `l05_*`.

## Superfície e controles

- `src/server/contract-l05-api.mjs` é a fronteira única de `/api/crm/contracts`. Ela exige mesma origem, sessão administrativa e papel explícito. `admin`/`marcelo` gerenciam; `comercial` só pode consultar contratos sob sua responsabilidade e não lê diário restrito.
- Toda mutação L05 executa auditoria durável na mesma transação; falha de auditoria reverte a escrita.
- Aceite de proposta cria contrato em **rascunho**, jamais ativo: assinatura registrada e ativação operacional são eventos distintos. O contrato da versão aceita é único e a implantação tem uma única linha.
- Documentos de contrato, comprovantes de obrigação e evidências de qualidade aceitam somente o ID de um documento privado L02 já ligado ao `client_contracts` explicitamente associado. URLs e `storage_key` não são aceitos como prova.
- Alertas criam tarefa, oportunidade CRM (caso a regra não a possua) e item `queued` na caixa de saída local. Isso não declara entrega, leitura de e-mail, WhatsApp ou outro canal externo.
- A ativação exige assinatura, as dez etapas concluídas/não aplicáveis e nenhum bloqueio ativo. Exigência legal não admite exceção. Exceção operacional exige motivo, aprovação, responsável e validade.
- Encerramento exige checklist; preserva histórico e marca somente o contrato de portal associado como encerrado. Grants `all` são convertidos no momento de encerramento para a allowlist dos demais contratos ativos — o outro contrato do mesmo cliente é preservado.

## Evidência executada no Arena remoto

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5; manifesto contínuo e migrador em 001–118 |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado; inclui `/admin/contratos` e `/admin/contratos/[id]` |
| `npm run test:migrations:pg` | aprovado; replay, checksums e clone descartável; 118/118 e 517 tabelas |
| `npm run test:l04-delivery:pg` | aprovado; 20/20 em HTTP, PostgreSQL descartável e Chromium |
| `npm run test:l05-delivery:pg` | aprovado; 1 cenário integrado em HTTP, PostgreSQL descartável e Chromium |

O gate L05 prova, com IDs e dados sintéticos isolados: negação anônima e por papel; contrato manual sem proposta; retry manual; oportunidade/proposta aceita e duas chamadas concorrentes sem segundo contrato/implantação; escopo de unidade; composição, SLA e responsável; documento privado; obrigação aprovada com prova privada; bloqueio de ativação incompleta; assinatura e ativação válida; aditivo imutável; alerta idempotente com tarefa/oportunidade/outbox local; diário restrito; dossiê/medição; encerramento e preservação de contrato portal alternativo; falha de auditoria injetada com rollback integral; e renderização Chromium da área contratual.

## Limites honestos e aceite humano

- Este resultado é técnico local/remoto com dados sintéticos. Não é aceite humano de negócio.
- Não foram feitos SMTP real, hospedagem/DNS público, pagamento, cobrança efetiva, emissão fiscal, assinatura externa, entrega/leitura de e-mail ou disparo de WhatsApp.
- As etapas de implantação de RH, operação e faturamento registram base de verificação humana e permanecem bloqueadoras; L05 não inventa integração com os lotes posteriores.
- A proteção de download L02 continua sendo a fronteira de bytes privada; L05 só estabelece vínculos com documentos já autorizados e não introduz URL pública.
- A criação histórica por aceite em `proposal-api.mjs` foi endurecida para iniciar em rascunho e gravar auditoria L05 no mesmo commit contratual. A autorização comercial da própria proposta continua sendo a política entregue/revalidada em L04.

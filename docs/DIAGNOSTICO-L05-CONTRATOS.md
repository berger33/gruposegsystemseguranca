# Diagnóstico L05 — contratos e implantação

**Registro inicial:** 2026-09-30  
**Base remota:** `main` / `2e3106fd41aac5510c24064ccbbfa7d3ab046b40` (merge do PR #33)  
**Branch Arena:** `arena/01a0f23a-gruposegsystemseguranca`

## Fonte e baseline verificados

O PR [#33](https://github.com/berger33/gruposegsystemseguranca/pull/33) está `MERGED` em `main` e seus checks finais `static-and-smoke` e `crm-postgres-browser` estão `SUCCESS`. A branch de trabalho começou no mesmo SHA, sem mudanças locais.

Antes de alterar L05 foram executados no ambiente remoto descartável:

- `npm ci` — 82 pacotes, 0 vulnerabilidades;
- `node scripts/qa-wave0-static.mjs` — 5/5;
- `npm test` — 196/196;
- `npm run typecheck` — 0 erros;
- `npm run test:migrations:pg` — 117/117, reaplicação, clone e checksum negativo aprovados (512 tabelas).

## Diagnóstico de domínio e compatibilidade

A entidade contratual comercial canônica é **`crm_contracts`** (migração 027), criada a partir da proposta aceita e usada pelas migrações 032–042 para itens, unidades, responsáveis, status, aditivos, obrigações, implantação, encerramento, dossiê e diário. Seus IDs, `proposal_id`, `proposal_version` e itens devem ser preservados.

Existe também `client_contracts` (migração 004), usado pelo portal legado e por módulos posteriores de cliente/financeiro. Ele não pode ser apagado nem tratado como uma segunda fonte de verdade: L05 precisa estabelecer um vínculo explícito e compatível, sem quebrar os consumidores existentes e sem gerar um contrato paralelo na interface.

O diagnóstico encontrou código pré-existente, porém não suficiente para declarar L05 implementado:

1. Há handlers separados em `src/server/contract-*.mjs` e tabelas 032–042, mas mutações aceitam praticamente qualquer sessão de staff, não validam consistentemente empresa/unidade/documento/contrato e várias auditorias são engolidas ou ficam fora da transação.
2. O cadastro manual de `contract-api.mjs` cria uma proposta rascunho artificial para contornar a FK. Isso viola a exigência de não inventar proposta de origem e será removido do fluxo L05.
3. Os componentes `src/app/admin/ti/Contract*Client.tsx` exigem UUIDs, usam `file_url`/`storage_key` como se fossem bytes comprovados e não formam uma jornada de negócio para Marcelo. A página de TI declara que são órfãos; não será usada como rota de negócio.
4. A rota legada `/api/admin/contracts` serve `client_contracts` e continua compatível para a área de cliente; ela não pode ser confundida com a gestão contratual `crm_contracts`.
5. Não havia gate L05 nem prova integrada de autorização, concorrência, rollback de auditoria, documento privado, alertas idempotentes, implantação, encerramento ou isolamento A/B.

## Direção da implementação

L05 adicionará uma migração aditiva 118 e uma superfície de negócio em `/admin/contratos`, com API única e autorizada para `crm_contracts`. A integração com `client_contracts` será um vínculo compatível e explícito, nunca uma proposta ou contrato fictício. O fluxo reutilizará tarefas CRM, caixa de saída local e documentos privados L02, sem SMTP, cobrança, assinatura externa ou hospedagem pública.

Cada etapa CON-01..CON-11 será implementada e testada na ordem do prompt, com o gate L05 em PostgreSQL descartável, HTTP real e Chromium. Este diagnóstico não declara nenhuma delas concluída.

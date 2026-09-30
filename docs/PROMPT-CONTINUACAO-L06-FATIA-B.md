# Continuação no Arena — L06 (fatias B→E) e sequência do projeto

## Missão e fonte oficial

Trabalhe no repositório GitHub `berger33/gruposegsystemseguranca`, no ambiente remoto Arena/GitHub. Não execute, instale, inicie nem altere nada no computador do usuário. Use somente dados sintéticos e PostgreSQL descartável. Prossiga o **L06 — operação, patrimônio e manutenção** em fatias verificáveis; cada fatia fecha o gate L06 verde antes da PR.

## Estado já integrado (não refazer)

- **Base:** `main` @ `bf7d7c425f4bba3a3ed4292e569af9361ad76a58` (PR #35, L06 fatia A, mergeada em 2026-09-30). L05 (PR #34) já é canônico.
- **L06 fatia A entregue:**
  - Migração aditiva `119-l06-operacao-hardening`: `ops_posts.contract_id → crm_contracts` (+ índice).
  - `src/server/ops-api.mjs`: `POST /api/ops/allocations` valida posto existente/ativo, contrato operacional (bloqueia `encerrado/cancelado/suspenso`, preservando histórico), funcionário `ativo`, duplicidade exata e **sobreposição de turno** (bug de parâmetro `$3` corrigido; fail-closed); escrita + auditoria na mesma transação (fail-closed). `POST /api/ops/posts` aceita `contract_id` com coerência de empresa.
  - Área de negócio `/admin/operacao` (`src/app/admin/operacao/`).
  - Gate L06: `scripts/qa-l06-delivery-postgres.mjs`, `tests/l06-delivery.integration.test.mjs`, `npm run test:l06-delivery:pg`, `.github/workflows/l06-delivery.yml`.
  - Documentos: `docs/DIAGNOSTICO-L06-OPERACAO-PATRIMONIO.md`, `docs/ENTREGA-L06.md`, matriz OPS-01/04 em `docs/CHECKLIST-ENTREGA-LOCAL.md`.
- **Schema/APIs já existentes da fase de layout (consolidar, não recriar):** migrações `070–073` (OPS) e `083–084` (AST); APIs `ops-api`, `ops-advanced/2/3`, `emp-ops-api`, `ast-api`, `ast-advanced`; clients em `src/app/admin/ti/*` (não usar painel órfão de TI como entrega).

## Pré-condições (obrigatórias, antes de codar)

1. Confira `main`, SHA, PRs abertos e checks do último PR L06. Não comece sobre base antiga nem replique PR ainda aberta.
2. Leia integralmente: `README.md`, `docs/PROMPT-CONTINUACAO-L06-OPERACAO-PATRIMONIO.md` (plano-mãe), `docs/DIAGNOSTICO-L06-OPERACAO-PATRIMONIO.md`, `docs/ENTREGA-L06.md`, `docs/ENTREGA-L05.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`.
3. Registre baseline: `node scripts/qa-wave0-static.mjs`, `npm run typecheck`, `npm run test:migrations:pg`, `npm run test:l06-delivery:pg`.
4. Migrações **001–119 são imutáveis**. Próxima livre: **120**. Ao criar migração nova, atualize o manifesto em `scripts/migrate-site-visual.mjs` (lista de arquivos **e** o `files.length`) e o `latestMigration` em `scripts/qa-wave0-static.mjs`. `EXPECTED_MIGRATIONS` em `scripts/qa-migrations-postgres.mjs` é dinâmico.
5. Mapeie antes de codificar: entidades canônicas `crm_contracts`, `crm_company_units`, `hr_employees`, provedor privado L02 (`client_documents`), e as autorizações por contrato/unidade/papel.

## Limites não negociáveis

- Sem serviço público/emergencial, central 24h, monitoramento real, GPS/despacho externo, SMS/WhatsApp/SMTP real, pagamento/cobrança/NF/compra real. Monitoramento só simulado e rotulado como sintético, sem prometer disponibilidade.
- Não inventar disponibilidade, treinamento, competência, cobertura, estoque, garantia ou evidência. O que depende de dado/integração posterior fica claramente bloqueado, com o pré-requisito explicado.
- Contrato ativo ≠ equipe alocada ≠ cobertura concluída ≠ faturamento/recebimento.
- Cliente/funcionário/terceiro nunca acessam por ID trocado: a API autoriza recurso, contrato, unidade, vínculo e papel; React não é fronteira. Use `/api/ops/*` e `/api/ast/*` fora da borda de RH quando o recurso não for de RH (a borda `authorizeLegacyHrRequest` cobre `/api/admin/hr/*`, `/api/hr/*`, `/api/crm/hr/*`).
- Não alterar migrações existentes; sem seed demonstrativo persistente; sem base externa/produção.

## Ordem das próximas fatias (cada uma abre PR própria e mantém o gate verde)

### Fatia B — OPS-05..08 (cobertura, passagem, ocorrência, checklist)
- Ausência/cancelamento abre necessidade de cobertura auditável; supervisor só substitui pessoa habilitada e sem conflito; manter responsável, motivo e vigência.
- Passagem de turno, ocorrência e checklist com escopo posto/unidade/contrato, autor e data; dados internos/RH não vão ao cliente.
- Estado de checklist não confirma requisito desconhecido; evidência privada reutiliza L02 com vínculo correto.
- Gate: usuário B e cliente B negados; retry não duplica ciência.

### Fatia C — AST-01..06 (estoque, reserva, ativo, entrega, requisição, compras)
- Movimentos transacionais, quantidade não negativa e idempotência; reserva/liberação/baixa concorrentes não duplicam nem ultrapassam disponibilidade.
- Serial/ativo, entrega, guarda, devolução, requisição e compra guardam origem, responsável, unidade/contrato e histórico. Nada de compra/recebimento real.
- Autorização por almoxarifado/unidade/contrato; uma unidade não movimenta estoque de outra por ID trocado.
- Gate: reserva e baixa sob concorrência não ficam negativas.

### Fatia D — AST-07..12 (inventário, OS, manutenção)
- Inventário: contagem, divergência, autor, aprovação e efeito transacional, sem apagar passado.
- OS liga ativo/local, defeito, prioridade, executor, materiais, evidência privada, garantia e custo de referência. Concluir exige condição consistente; reexecução não duplica consumo/evidência/custo.
- Dossiê técnico e indicadores com escopo restrito; não expor evidência interna ao portal/funcionário sem política explícita.
- Gate: OS consome material exatamente uma vez, aceita evidência privada autorizada e atualiza dossiê/custo.

### Fatia E — OPS-09..16 (supervisão, ronda, chaves, limpeza, monitoramento sintético, indicadores)
- Supervisão/ronda e guarda de chaves/materiais com trilha, autorização e idempotência; sem GPS real sem fonte autorizada.
- Rotinas de limpeza ligam ambiente, periodicidade, execução, consumo e não conformidade; não concluir sem executor/evidência coerente.
- Indicadores explicam fonte, período e incompletude; monitoramento explicitamente simulado, sem SLA/promessa de central.

## Interface e autorização

Crie/consolide áreas de negócio navegáveis para operação/supervisão/almoxarifado e autoatendimento do funcionário quando necessário (padrão `/admin/operacao`). Sem UUID digitado, sem painel órfão de TI, sem mocks. Cada tela com carregamento, vazio, erro e confirmação só após persistência. Papéis explícitos e mínimos; preservar carteira comercial L04 e segregação de RH; sem permissões globais para simplificar teste.

## Gate e regressões (por fatia)

- Amplie `tests/l06-delivery.integration.test.mjs` com o fluxo da fatia, sem skip nem mock de banco/navegador; mantenha `npm run test:l06-delivery:pg` verde (PostgreSQL descartável, HTTP real, Chromium). Não marque aprovado se houver skip, timeout ou mock substituindo banco/navegador.
- Rode e registre conforme afetado: `node scripts/qa-wave0-static.mjs`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:migrations:pg`, `npm run test:l06-delivery:pg`, e `npm run test:l04-delivery:pg`/`npm run test:l05-delivery:pg` quando tocar contratos/CRM/portal.
- Não commitar artefatos gerados pelo build (`next-env.d.ts`, `tsconfig.json` reescritos pelo `next build` devem ser revertidos).

## Entrega (por fatia)

- Atualize a matriz OPS-01..16 / AST-01..12 em `docs/CHECKLIST-ENTREGA-LOCAL.md` e o relatório `docs/ENTREGA-L06.md`. Diferencie conclusão técnica local, aceite humano, integração externa e simulação.
- Abra PR revisável da branch da sessão; aguarde checks verdes; só então faça merge se o usuário autorizar.
- Ao concluir todas as fatias de L06, entregue o prompt de continuidade do **L07** (não inicie L07 dentro da tarefa de L06).

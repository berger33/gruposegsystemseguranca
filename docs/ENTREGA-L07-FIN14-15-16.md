# Entrega L07 — jornadas UI de FIN-14, FIN-15 e FIN-16

**Data:** 2026-10-02
**Base oficial:** `main` em `cc4da84c2c60827b9daf39d563ea30a676883b8b` (PR #71 integrada; migrações 001–136)
**Branch:** `arena/01a0fc98-gruposegsystemseguranca`
**Escopo:** somente FIN-14/15/16. FIN-10, FIN-13 e FIN-12→FIN-04 foram preservados; ADM-01..12 e L08 não foram iniciados.

## Baseline e reprodução

Antes da alteração de negócio: estático 5/5, typecheck sem erros, unitários 196/196, migrações 136/136 (dois passes, clone/checksum negativo) e gate L07 35/35 em duas execuções consecutivas. Três execuções anteriores sofreram SIGSEGV intermitente do Chromium em subtestes antigos; nenhuma assertiva, timeout ou skip foi alterado. Após a sequência verde, um subteste Chromium novo foi escrito e executado contra a base intacta: 35 casos existentes passaram e o novo caso falhou porque a aba `exports` não existia, reproduzindo a lacuna real.

## Implementação

- Três abas operacionais em `/admin/financeiro`: `ExportWorkspace`, `ClosureWorkspace` e `CommissionWorkspace`. Cada uma possui seleção/busca, erro de leitura visível, **Tentar novamente**, confirmação somente após persistência e motivos para ações sensíveis. Valores são formatados por `Intl.NumberFormat('pt-BR', {currency:'BRL'})`.
- FIN-14: registro de exportação sintética por período, trilha, transições de geração e download JSON autorizado por `/api/fin/export-download`. O download é decidido no servidor, exige estado `gerado`, janela não expirada e escopo `contador` limitado; não expõe `storage_key` e não lê outros registros.
- FIN-15: fechamento/reabertura pela sessão autorizada, motivo obrigatório e versões imutáveis visíveis. O fechamento mensal bloqueia `INSERT/UPDATE/DELETE` em recebíveis e pagáveis canônicos inclusive por SQL direto; reabertura libera o período.
- FIN-16: provisão vinculada à regra CRM-25, início/conclusão de revisão e histórico auditável. A tela não oferece pagamento; `is_auto_paid` continua falso e a API/banco recusam pagamento automático.
- Retry concorrente: FIN-14, FIN-15 e FIN-16 aceitam chave 8–200 + fingerprint; seis requisições iguais convergem em um registro (1 criação + 5 replays), enquanto conteúdo diferente com a mesma chave é recusado. Linhas legadas permanecem explicitamente sem chave.
- Autorização permanece no servidor: anônimo/papel indevido negados, TI somente leitura, same-origin nas mutações e domínio+histórico+auditoria na mesma transação com rollback `503 audit_unavailable`.

## Schema

Migração aditiva `137-fin14-15-16-ui-idempotency-closure-lock.sql`, preservando 001–136:

- colunas opcionais legadas `idempotency_key`/`content_fingerprint` e índices únicos parciais nas três entidades;
- CHECKs de pares de idempotência como `NOT VALID`;
- trigger `fin15_block_closed_competence` nos lançamentos canônicos a receber/a pagar.

Nenhuma migração anterior foi editada. Não houve emissão, cobrança, banco, PSP, Pix/boleto, pagamento ou envio real.

## Provas

O gate L07 passa a 37 subtestes. Além dos 35 anteriores, cobre Chromium real ponta a ponta nas três abas (incluindo falha de leitura + retry) e retry concorrente + bloqueio SQL direto. Os resultados finais do mesmo SHA estão consolidados em `EVIDENCIAS-ENTREGA-LOCAL.md` e na PR.

## Estado e limites

FIN-14, FIN-15 e FIN-16 são `pronto_local` apenas na validação automática. Aceite de Marcelo/Andreia, ensaio Windows e política operacional do contador continuam pendentes. **L07 não está concluído**: ADM-01..12 é a próxima fatia. L08 não foi iniciado.

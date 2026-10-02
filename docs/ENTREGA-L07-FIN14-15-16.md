# Entrega L07 — jornadas UI de FIN-14, FIN-15 e FIN-16

Data: 2026-10-02. Estado: `pronto_local` para FIN-14/15/16 na validação automática; aceite humano pendente. **L07 permanece em execução.**

## Escopo entregue

Três abas próprias foram acrescentadas a `/admin/financeiro`, sem reabrir FIN-10, FIN-13 ou a ligação FIN-12 → FIN-04:

- **Exportações (FIN-14):** criação por período, filtros/totais sintéticos, seleção por nome/protocolo, valores em R$, transições de geração, trilha e download de artefato JSON limitado e auditado.
- **Fechamento (FIN-15):** fechamento/reabertura com motivo, autorizador derivado da sessão, seleção de competência e consulta de todas as versões preservadas.
- **Comissões (FIN-16):** provisão ligada opcionalmente à regra CRM-25, revisão humana visível/auditável, valores em R$ e baixa apenas manual; a interface não oferece pagamento automático nem integração externa.

As três abas distinguem falha de leitura de lista vazia, exibem “Tentar novamente” e confirmam ações somente após resposta persistida pelo servidor.

## Lacunas reproduzidas antes da correção

Na base `cc4da84`, os subtestes HTTP 33–35 estavam verdes, mas não existiam abas FIN-14/15/16. O acesso “limitado do contador” era apenas metadado: não havia download controlado. Fechar uma competência também não bloqueava `INSERT` SQL direto em lançamentos do mês. A exportação recusava todo retry por chave, fechamento duplicado sempre retornava conflito e provisão não possuía chave de idempotência.

## Implementação e garantias

- Componentes `ExportWorkspace.tsx`, `ClosureWorkspace.tsx` e `CommissionWorkspace.tsx`, integrados ao workspace financeiro.
- `GET /api/fin/export-download?id=...`: exige sessão/papel financeiro, exportação gerada, escopo `contador`, acesso não expirado; devolve apenas o artefato sintético persistido, com `no-store`, registra trilha e auditoria na mesma transação.
- Retry idempotente e concorrente:
  - FIN-14 usa `storage_key` + fingerprint canônico;
  - FIN-15 usa competência + fingerprint;
  - FIN-16 usa `idempotency_key` + fingerprint;
  - replay idêntico retorna o mesmo registro; reutilização com conteúdo diferente é recusada.
- Reabertura ignora qualquer autor enviado pelo cliente: `authorized_by_identity` vem da sessão autenticada.
- Migração aditiva **137**, sem alterar 001–136:
  - fingerprints e chave opcional para linhas novas, preservando linhas históricas;
  - constraints novas `NOT VALID`;
  - índice único parcial de idempotência FIN-16;
  - trigger de banco que impede `INSERT`, `UPDATE` e `DELETE` em recebíveis, pagáveis e custos cuja competência esteja fechada/bloqueada; reabertura explícita libera o mês.
- Nenhum pagamento, Pix, boleto, PSP, emissão fiscal, envio contábil ou dado real foi criado.

## Prova automatizada

O gate L07 foi ampliado de 35 para **37 subtestes**, sem skip, timeout alterado ou assertiva removida. Além das provas 33–35 já existentes, cobre seis retries concorrentes por domínio, conflito de chave, download anônimo/papel indevido, trilha do download, bloqueio SQL direto, autoria de reabertura decidida no servidor e uma jornada Chromium das três abas com falha de leitura + retry.

Validação final no mesmo SHA da branch:

- `npm run typecheck`: 0 erros.
- `npm test`: 196/196.
- `npm run build`: aprovado.
- `node scripts/qa-wave0-static.mjs`: 5/5, migrações 001–137.
- `npm run test:migrations:pg`: 137/137, dois passes, clone e checksum negativo esperado.
- `npm run test:l07-delivery:pg`: 37/37 em duas execuções consecutivas.
- regressões: L03 1/1, L04 20/20, L05 1/1 e L06 9/9.

## Limites e aceite

A validação automática não equivale a aceite de Marcelo ou Andreia. Windows e aceite humano permanecem pendentes. Os artefatos e dados do gate são sintéticos e descartáveis. FIN-14/15/16 passam a `pronto_local`, mas **L07 não está concluído**: ADM-01..12/painel Marcelo é a próxima fatia e não foi iniciada aqui. L08 também não foi iniciado.

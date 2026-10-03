# L08 — hardening de atomicidade CLI-01..05

Data: 2026-10-02

Base oficial: `main` em `52afebb1097d60a383c7219e7f3fe927a52ba3a6` (PR #80 já incorporada)

Escopo: primeira fatia canônica CLI-01..05, sem promoção das superfícies v2

## Resultado implementado

- Auditoria obrigatória passou a falhar fechada nas mutações canônicas de acesso,
  MFA, cadastros, vínculos, contratos, documentos e chamados.
- Negócio, histórico e auditoria são confirmados na mesma transação PostgreSQL;
  falha forçada da auditoria devolve `503 audit_unavailable` e faz rollback.
- A identidade individual do staff vem da sessão e é gravada em auditoria; o
  histórico de chamado também registra a identidade individual.
- O download privado valida escopo e integridade, conclui a auditoria e somente
  depois envia headers e bytes. Falha da auditoria não envia
  `Content-Disposition` nem conteúdo privado.
- Chamados e documentos usam `Idempotency-Key` + SHA-256 do pedido. Replay
  idêntico devolve o mesmo ID, replay divergente devolve
  `409 idempotency_conflict` e concorrência é serializada por índice único.
- Upload com erro controlado antes do commit remove o arquivo recém-gravado.
- A jornada de acesso completa foi incorporada ao gate L08: convite, aceite,
  confirmação, login, expiração/revogação de sessão, recuperação/reset, logout e
  MFA, com SMTP de captura local e sem serviço externo.

## Migração

`139-l08-client-space-atomic-idempotency.sql` é aditiva. Migrações 001–138 não
foram alteradas. Ela acrescenta os pares chave/fingerprint em
`client_tickets`/`client_documents`, índices parciais de unicidade por identidade
e `changed_by_identity` no histórico de chamado. Restrições novas sobre linhas
legadas usam `NOT VALID`; novas escritas continuam sendo verificadas.

O migrador, a verificação estática e o teste de checksums foram atualizados para
001–139, preservando uma fonte canônica única.

## Prova PostgreSQL/HTTP real

As suítes injetam uma falha de trigger no insert de `auth_access_audit`, por ação,
e exercitam a rota HTTP real. Há casos específicos para:

- convite: emissão, revogação e aceite;
- confirmação de e-mail, login, recuperação/reset e logout;
- setup, ativação e desativação de MFA;
- criação/status de conta, emissão/revogação de vínculo e criação/status de
  contrato;
- upload e download privado;
- abertura e atualização de chamado.

Os testes conferem rollback de domínio, credencial/token, sessão, histórico,
arquivo e headers conforme o fluxo. Chamado e documento são enviados seis vezes
simultaneamente com a mesma chave: resta uma linha, um histórico/arquivo e uma
auditoria. Reuso divergente é recusado explicitamente.

## Autorizações e fontes

Rotas canônicas provadas:

- acesso: `/api/auth/login`, `/api/auth/logout`, `/api/auth/invite/accept`,
  `/api/auth/confirm-email`, `/api/auth/recover`, `/api/auth/reset` e
  `/api/admin/invites`;
- cliente: `/api/client/accounts`, `/api/client/contracts`,
  `/api/client/documents`, `/api/client/documents/:id/download` e
  `/api/client/tickets`;
- staff: `/api/admin/client-accounts`, `/api/admin/grants`,
  `/api/admin/contracts`, `/api/admin/documents`,
  `/api/admin/documents/:id/download` e `/api/admin/tickets`.

As fontes permanecem `auth_*`, `client_accounts`, `client_access_grants`,
`client_contracts`, `client_documents`, `client_tickets` e tabelas de
histórico/auditoria. Aliases/tabelas v2 não foram usados como prova.

## Validação final Linux/local

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 196/196 |
| `npm run build` | exit 0 |
| `npm run test:migrations:pg` | 139/139 em dois passes; checksum negativo esperado; limpeza confirmada |
| `npm run test:l02-delivery:pg` | 14/14 |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 19/20; preferência de tema retornou `null` em vez de `tech` |
| repetição integral L04 | 19/20; Chromium encerrou no lançamento de CRM-08 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| L07, execução 1 | 43/43 |
| L07, execução 2 consecutiva | 43/43 |
| L08, execução 1 | 50/50 |
| L08, execução 2 consecutiva | 50/50 |

A primeira tentativa paralela de build/typecheck não foi usada como veredito: o
build reescreveu `tsconfig.json` enquanto o typecheck lia includes antigos de
`.next/integration-l06`. Os comandos finais foram executados serialmente e
passaram. `next-env.d.ts` e `tsconfig.json` foram restaurados ao conteúdo do
repositório depois dos gates.

L04 não foi apresentado como verde: as duas reprovações integrais acima foram
preservadas sem skip, aumento de timeout ou enfraquecimento de assertiva. Elas
não estão em código alterado por esta fatia. O aceite local anterior de L07 por
Marcelo e Andreia permanece preservado; este relatório não representa novo
aceite humano.

## Limites que permanecem explícitos

- A API legada canônica de CLI-05 não expõe protocolo, mensagem nem anexo. Esses
  objetos existem apenas na superfície v2 não promovida; portanto não são
  declarados operacionais ou idempotentes nesta entrega.
- PostgreSQL e filesystem não têm transação distribuída. Está provada a limpeza
  em todos os erros controlados antes do commit, não a eliminação de uma janela
  de órfão causada por queda abrupta do processo.
- CLI-06..15, EXT-01..17, `/admin/ti` órfão, fornecedor restrito, CLI-15,
  integrações externas e APIs v2 continuam fora do escopo.
- A validação é automática Linux com PostgreSQL descartável, HTTP real e
  Chromium empacotado; não substitui aceite de negócio nem homologação Windows.

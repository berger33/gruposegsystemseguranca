# Relatório da série L08 — hardening da primeira fatia (CLI-01..05)

Data: 2026-10-02. Lote: **L08 / CLI-01..05 — hardening**.
Base confirmada: PR **#78 mergeada**, merge commit **`c16673c3c2a8f749ec476edb7a91dc62d2c1dfc9`**,
que é também o HEAD de `origin/main` e a base desta branch de sessão.
Migrações presentes na base: **001–138**; próxima livre confirmada: **139**.

## 1. Limite e classificação (não misturar camadas)

1. **Implementação local**: o que esta sessão escreveu em código e SQL.
2. **Validação automática Linux/PostgreSQL descartável**: o que os gates provaram.
3. **Aceite humano de negócio**: existente para L07 (Marcelo e Andreia);
   **não existe** para a fatia CLI-01..05.
4. **Homologação Windows**: **pendente**, adiada pelo proprietário em 02/10/2026
   para o fechamento integral do sistema. Nada aqui a declara aprovada.

## 2. Por que houve hardening em vez de aceite

O gate da PR #78 passava, mas não provava os critérios do L08. Encontramos e
corrigimos lacunas reais:

| Lacuna encontrada na fatia entregue | Consequência real | Correção desta sessão |
|---|---|---|
| `audit()` engolia falha (try/catch com `console.error`) nos fluxos sensíveis | escrita confirmada ao cliente **sem** rastro de auditoria: sucesso parcial | `auditInTransaction` dentro da transação; falha → rollback + 503 |
| Abertura de chamado sem idempotência e sem protocolo | retry/clique duplo criava **dois chamados** | migração 139 (chave + fingerprint + protocolo único) e replay idempotente |
| Download privado auditado **depois** do `pipe` | bytes podiam sair sem registro | `client_document_access_log` + auditoria na mesma transação, **antes** do primeiro byte |
| Atualização de status pelo staff auditava fora da transação | histórico podia divergir da auditoria | auditoria movida para dentro da transação |
| Falha de leitura e escopo restrito devolviam lista vazia | ausência/erro apresentados como “zero” | `retryable: true` no 503 e `dataAvailable`/`empty`/`emptyReason` nas listas |
| UI de chamados checava `payload.ok`, que a API nunca devolvia | **chamado era criado e a tela dizia que falhou** | API devolve `ok`/`protocol`/`replayed`; a tela mostra o protocolo |
| “Smoke” Chromium usava `page.setContent` | não provava jornada nenhuma | jornada Chromium real autenticada (entrada → conta → contrato → documento → chamado) |

## 3. Mudanças realizadas

- **Migração aditiva 139** `139-cli04-05-idempotencia-protocolo-download-log.sql`:
  `client_tickets.protocol|idempotency_key|request_fingerprint`, índices únicos
  parciais (protocolo; conta+chave), CHECKs novas em **`NOT VALID`**, ampliação
  idempotente das listas de `auth_access_audit` (`ticket_open_replay`,
  `idempotency_conflict`, `integrity_failed`) no mesmo padrão das migrações
  004–007/118, e tabela `client_document_access_log`. **001–138 intactas.**
- `src/server/client-space-api.mjs`: transação única para abrir chamado
  (escrita + protocolo + auditoria), replay idempotente, conflito 409,
  registro atômico de download, auditoria transacional no status do chamado,
  erros 503 declarados como recuperáveis e listas com fonte/ausência explícitas.
- `src/app/cliente/app/chamados/page.tsx`: envia chave de idempotência, trata
  replay/conflito, exibe protocolo na confirmação e na lista.
- Gate: `scripts/qa-l08-delivery-postgres.mjs` passa a aplicar **001–139** com o
  migrador oficial no cluster descartável; `tests/l08-delivery.integration.test.mjs`
  substitui o smoke estático por 13 subtestes reais (abaixo).
- Migrador e gate estático atualizados para 139 (`scripts/migrate-site-visual.mjs`,
  `scripts/qa-wave0-static.mjs`).

## 4. Requisito por requisito

| Req. | Tela/rota | API | Tabelas canônicas | Autorização | Atomicidade | Idempotência | Subteste | Resultado real | Pendência | Classificação |
|---|---|---|---|---|---|---|---|---|---|---|
| CLI-01 | `/cliente/entrar`, convite, recuperação | `/api/auth/*` | `auth_identities`, `auth_credentials`, `auth_sessions`, `auth_access_audit` | sessão HttpOnly; identidade só do servidor | login/sessão já transacionais no legado | n/a | L08-12 (Chromium), L08-13, jornada legada | entrada real autenticada OK | sem MFA na jornada Chromium | implementação local + validação automática |
| CLI-02 | `/cliente/app` (contas) | `/api/client/accounts` | `client_accounts`, `client_access_grants` | grant ativo + conta ativa por requisição | leitura | n/a | L08-02, L08-03, L08-11, L08-12 | A vê só as suas; B invisível | aceite humano | implementação local + validação automática |
| CLI-03 | `/cliente/app/contratos` | `/api/client/contracts` | `client_contracts` | escopo + allowlist deny-by-default | leitura | n/a | L08-03, L08-10, L08-11, L08-12 | escopo restrito declarado, não “zero” | aceite humano | implementação local + validação automática |
| CLI-04 | `/cliente/app/documentos` + download | `/api/client/documents`, `/documents/:id/download` | `client_documents`, `client_document_access_log`, `auth_access_audit` | revalidação por download; ID do cliente não autoriza | log + auditoria na mesma transação, antes dos bytes | n/a | L08-03, L08-08, L08-09, L08-12 | 503 sem vazar byte quando o registro falha | aceite humano | implementação local + validação automática |
| CLI-05 | `/cliente/app/chamados` | `/api/client/tickets`, `/api/admin/tickets/:id` | `client_tickets`, `client_ticket_status_audit`, `auth_access_audit` | autoria da sessão; corpo forjado ignorado | escrita + histórico + auditoria em uma transação | chave + fingerprint + protocolo único | L08-02, L08-05, L08-06, L08-07, L08-12 | 5 retries concorrentes → 1 chamado, 1 protocolo | aceite humano | implementação local + validação automática |

**Não promovidos** (continuam `a_revalidar`/protótipo, sem exceção):
CLI-06..15, EXT-01..17, os 80 componentes órfãos de `/admin/ti`, fornecedor
restrito, CLI-15 e qualquer integração simulada. Os aliases v2 sob
`/api/client/*` seguem **staff-only** e o gate prova que negam sessão de cliente
(L08-04) — existir alias não é promoção.

## 5. Gate e subtestes (`npm run test:l08-delivery:pg`)

PostgreSQL descartável, migrações 001–139 pelo migrador oficial, HTTP real,
Chromium empacotado, dados 100% sintéticos, sem SMTP/PSP/serviço externo.

| # | Subteste | Prova |
|---|---|---|
| L08-01 | semeadura sintética | identidades, contas, grants, contrato e documentos |
| L08-02 | identidade/conta forjada no corpo | 403 em conta alheia; autoria gravada é a da sessão |
| L08-03 | escopo cruzado A≠B | leitura, escrita e download negados; nenhum byte de B |
| L08-04 | aliases `/api/client/*` não promovidos | 9 aliases negam sessão de cliente e não devolvem dado |
| L08-05 | 5 retries concorrentes | 1 criação, 4 replays, 1 protocolo, 1 linha no banco |
| L08-06 | mesma chave com conteúdo diferente | 409 `idempotency_conflict`, sem segunda linha |
| L08-07 | auditoria indisponível (falha injetada) | 503 + rollback integral do chamado |
| L08-08 | download bem-sucedido | log de acesso + auditoria na mesma transação |
| L08-09 | registro de download falha | 503 e nenhum byte entregue |
| L08-10 | leitura quebrada | 503 `retryable`, nunca lista vazia |
| L08-11 | ausência de dado | `dataAvailable`/`emptyReason` declarados |
| L08-12 | **jornada Chromium real autenticada** | entrada → conta → contrato → documento privado → chamado com protocolo |
| L08-13 | fronteira externa | nada declarado como enviado sem SMTP |

Nenhum subteste usa `skip`, timeout inflado ou assertiva enfraquecida. As esperas
do Chromium cobrem compilação do servidor de desenvolvimento, não falha de
asserção.

## 6. Resultados reais

**Base `c16673c` (antes de editar):** estático 5/5; typecheck OK; unitários
196/196; migrações 138/138 em dois passes, 524 tabelas, clone/checksum negativo
rejeitado; L07 43/43 **duas vezes**; L03 1/1; L04 20/20; L05 1/1; L06 9/9.

**Depois das alterações (mesmo SHA de trabalho):** estático 5/5; typecheck OK;
unitários 196/196; `npm run build` exit 0 (78 páginas geradas); migrações
**139/139** em dois passes, **525 tabelas**, clone/checksum negativo rejeitado;
L07 43/43 **duas vezes**; L03 1/1; L04 20/20; L05 1/1; L06 9/9;
**L08 24/24 duas vezes consecutivas** (13 subtestes novos + jornada legada).

## 7. Instabilidades observadas

Nenhum `ETXTBSY` nesta sessão (execuções seriais). Durante o desenvolvimento o
gate reprovou três vezes por causas **reais**, todas corrigidas sem mascaramento:
reaplicação de recorte de migrações sobre o esquema completo; whitelist de
`auth_access_audit` sem as ações novas; e clique antes da hidratação do App
Router (que revelava submit nativo). Os gates reescrevem `next-env.d.ts` e
`tsconfig.json`; ambos foram restaurados antes do commit.

## 8. Pendências reais

- Aceite humano de negócio da fatia CLI-01..05 (Marcelo/Andreia) — **não existe**.
- MFA do cliente não faz parte da jornada Chromium (coberto por testes próprios).
- CLI-06..15, EXT-01..17 e os 80 órfãos continuam dívida explícita.
- **Homologação Windows continua pendente**, adiada para o fechamento integral
  do sistema.

## 9. Próximo passo

Revisão humana desta PR; depois, próxima área do L08 **somente com prova**
(jornada + gate), sem ligar órfãos em massa e sem promover v2 por existir alias.

> Lembrete explícito: **Windows continua pendente** até o fechamento integral do
> sistema. Nada nesta entrega é homologação Windows.

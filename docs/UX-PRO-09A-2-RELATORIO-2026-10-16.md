# UX-PRO-09A-2 — relatório (reenvio de confirmação em `/cliente/confirmar-email`)

**Status:** relatório de medição da subfatia UX-PRO-09A-2 (lacuna G2 registrada em
`docs/UX-PRO-09A-ESCOPO-ANTES-2026-10-15.md` §5), depois da implementação. Nenhuma validação
manual, homologação, revisão ou aceite humano aconteceu; nada aqui declara conformidade WCAG,
prontidão de homologação ou de produção. Escopo anterior: `docs/UX-PRO-09A-2-ESCOPO-ANTES-2026-10-16.md`.
Base: `main`/`origin/main` = `c6682c11dd51fd98ceb480e59a2f8b5beafa5cfe` (PR #250, UX-PRO-09A);
branch da sessão `arena/ccb60b64-gruposegsystemseguranca`.

## 1. O que mudou

| Defeito (escopo “antes”) | Correção |
|---|---|
| G2 — `ConfirmResendForm` definia `sent=true` no `finally`, sem ler `response.ok`/`status`: `503` (`auth_unavailable`/`audit_unavailable`) e rejeição de rede viravam a mensagem de “pedido recebido”, sem erro, sem foco e sem repetição | `src/app/cliente/confirmar-email/page.tsx`: o sucesso só é declarado com resposta 2xx; `!response.ok` e exceção de rede produzem estado de erro próprio (`role="alert"`, `tabIndex={-1}`, foco programático com contorno visível), o formulário e o valor digitado permanecem para nova tentativa e a mensagem não revela status, código interno nem se o endereço existe |

Nenhum outro arquivo de produto foi tocado. Endpoint, rota, payload, resposta pública, política de
reenvio, tokens, auditoria, sessão/cookie e os demais estados da página permanecem como estavam
(seção 2).

## 2. Preservado e como foi verificado

| Recurso preservado | Verificação nesta subfatia |
|---|---|
| `POST /api/auth/confirm-email/resend` e rota `/cliente/confirmar-email` | Gate abre a rota real (HTTP 200, sem cookie) e o navegador consome o endpoint real; `resumo.json` registra os status observados (`503` → `202` no navegador e três `202` por HTTP). |
| Payload `{email}` e rótulo/validação nativa do campo | Campo `type="email"` + `required` inalterados; o gate mede `typeMismatch`/`valueMissing` e prova que nenhuma requisição sai antes de um envio válido. |
| Resposta pública genérica anti-enumeração (`202 {ok:true}`) | Comparação por HTTP entre identidade sintética elegível e endereço desconhecido: corpos idênticos; `0` tokens para o endereço desconhecido; a tela de sucesso não contém endereço. |
| Limites de reenvio (5 por endereço em 24 h; intervalo mínimo de 2 min) | Repetição imediata após reenvio aceito: `202` genérico, **1** token no banco (nenhum segundo link), auditoria `denied/throttled` gravada. O teto de 5/24 h continua coberto pela regra pura em `tests/client-auth-core.test.mjs`. |
| Tokens `confirm_email`: 7 dias, hash no banco, uso único, substituição do anterior | Depois do reenvio aceito: exatamente 1 token, `used_at`/`superseded_at` nulos, hash `[0-9a-f]{64}`, validade medida 168 h. |
| Auditoria transacional obrigatória | 1 linha `email_confirm_resend`/`allowed`; e é exatamente a recusa dela (trigger no banco descartável) que produz o `503` real testado, com rollback provado por contagem de tokens = 0. |
| Sessão/cookie ausentes no fluxo | Contexto do navegador sem cookies (`deepEqual([], cookies)`) e nenhuma chamada a `POST /api/auth/confirm-email` sem token. |
| Estado `failed`/aviso de link inválido e mensagem de sucesso anteriores | O aviso “Este link de confirmação não é mais válido…” permanece em todos os estados medidos; o texto de sucesso `role="status"` não foi alterado e continua substituindo o formulário apenas no sucesso. |
| Gate G1 (`/cliente/redefinir-senha`) e demais testes do gate `ux-portal` | `npm run test:ux-portal:pg`: **16/16**, incluindo o teste da PR #250 sem alteração. |
| Contrato de identidade/convite/confirmação (`/api/auth/*`) | `npm run test:client-access:pg`: **27/27** sem alteração de código de API. |

## 3. Verificações executadas

| Verificação | Resultado |
|---|---|
| `npm run test:ux-portal:pg` (PostgreSQL descartável + HTTP real + Chromium) | **16/16**; o teste novo (`browser: reenvio de confirmação distingue falha real, mantém 202 genérico e preserva o limite de reenvio`) passa isolado e no conjunto. |
| `npm run test:client-access:pg` | **27/27**. |
| `npm run test:unit` | **949/949** (inclui `tests/ux-pro-00-inventory.test.mjs` e a conferência de CSVs). |
| `npm run typecheck` | verde. |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK:` após regeneração pelo próprio gerador. |
| Evidências | `docs/UX-PRO-09A-2-evidencias-2026-10-16/`: 8 PNGs + `resumo.json` (6 estados: `initial`, `loading`, `service_failure`, `network_failure`, `success`, `native_validation`; 4 viewports 320/390/768/1440 com overflow 0; percurso de teclado de 8 passos; contorno de foco `solid 3px`). |
| Inventário/matriz UX-PRO-00 | Regenerados pelo gerador: só a linha 66 (`/cliente/confirmar-email`) muda, passando a creditar `captura visual: UX-PRO-09A-2 @ 1440x900|320x844|390x844|768x900` e percurso de teclado do recorte do gate; nenhum CSV editado à mão. |

## 4. O que o gate prova e o que não prova

Prova: que `503` real (falha de auditoria no PostgreSQL descartável, transação revertida) e rejeição
de transporte **não** aparecem como sucesso neste formulário; que o erro recebe foco com contorno
visível, mantém valor e repetição; que a resposta pública continua genérica para endereço elegível e
desconhecido; que o limite de reenvio e o ciclo de token continuam intactos; e que não há transbordo
horizontal nos quatro viewports do único tema suportado.

Não prova: aceite humano, comportamento em Windows/máquina do operador, envio real de e-mail
(`MAIL_HOST` vazio no gate), tema noturno (a superfície não o oferece), conformidade WCAG, nem
prontidão de homologação/produção — que permanecem **NO-GO**.

## 5. Limitações registradas

1. `503` reproduzido por trigger no PostgreSQL temporário e descartável (auditoria obrigatória recusada, transação revertida); HTTP, servidor, rota e Chromium reais, sem mock da resposta HTTP. Separadamente, uma rejeição de `fetch` foi **simulada** no navegador para cobrir falha de rede (`simulatedFetchRejection: true`, `httpStatus: null`, `httpRequestIssued: false`); não equivale a interromper o transporte real.
2. O teto de 5 reenvios por endereço em 24 h não foi percorrido por completo no gate (só o intervalo mínimo de 2 min); a regra completa permanece na verificação pura de `resendPolicyAllows`.
3. Somente tema claro; sem SMTP/provedor real, sem sessão/cookie, sem dados reais, sem UAT.
4. A busca externa de Google Fonts é bloqueada no sandbox (`ERR_CONNECTION_CLOSED`); o diagnóstico é separado do `503` reproduzido.
5. O erro recebe foco programático e fica fora da ordem sequencial do `Tab` (`tabIndex="-1"`), como no padrão G1; a repetição segue alcançável por teclado (medido).
6. Rodar os gates reescreve `next-env.d.ts` (referência ao `NEXT_DIST_DIR`); o arquivo foi restaurado ao estado versionado antes do commit.

## 6. Resíduos que permanecem abertos (fora deste escopo)

- **G3** — confirmação da troca de e-mail: a entrega manual aponta para `/cliente/confirmar-email`, cujo handler só consome tokens `confirm_email`; o PUT real vive em `/cliente/app/seguranca`. Exige decisão explícita do proprietário antes de qualquer mudança.
- **G4** — duração exibida no erro de `/cliente/redefinir-senha` (“vale 1 hora”) diante do link manual de 15 min aprovado por TI.
- **G5** — medição de foco nas demais superfícies de entrada (cliente/staff/funcionário/convite), sem mudança transversal.
- Demais pendências do cronograma (07M, E2–E9, C11, PR #234, homologação e produção) seguem onde estavam.

## 7. Prompt da próxima subfatia realmente pendente

```text
Trabalhe em berger33/gruposegsystemseguranca, na branch fixada pela nova sessão Arena, partindo da
main remota mais recente. Leia AGENTS.md, README.md, docs/UX-PRO-09A-2-ESCOPO-ANTES-2026-10-16.md e
docs/UX-PRO-09A-2-RELATORIO-2026-10-16.md antes de qualquer código.

Execute SOMENTE a subfatia UX-PRO-09A-3 — G4: a duração exibida no erro de link de
/cliente/redefinir-senha. Antes do código, registre no escopo "antes" as duas origens de link que a
mesma rota aceita (POST /api/auth/recover, PASSWORD_RESET_TTL_MS = 1 hora; e o link manual emitido
após aprovação de TI, TTL_MS = 15 minutos em src/server/client-offline-recovery-api.mjs) e proponha
UM texto de erro que não afirme
duração errada para nenhuma das origens, sem alterar expiração, payload, endpoint, política de senha,
sessão, auditoria nem a resposta genérica 202. Se concluir que a mensagem correta exige decisão do
proprietário entre duas redações concorrentes, NÃO escolha por conta própria: registre o conflito e
continue apenas com o trabalho independente que preserve o comportamento atual.

Estenda o gate existente (tests/ux-portal-workspace.integration.test.mjs, npm run test:ux-portal:pg)
somente para o recorte alterado, mantendo os testes de G1 (PR #250) e G2 (UX-PRO-09A-2) intactos.
Regenere UX-PRO-00 pelo gerador se houver nova captura; não edite CSVs à mão. Preserve G3 e G5 fora
do escopo. Não declare aceite humano, conformidade WCAG ou prontidão de produção/homologação.
Colete evidências em pasta própria com resumo.json legível por máquina, sem token, cookie, senha ou
endereço real; dados sintéticos apenas no PostgreSQL descartável.
```

# UX-PRO-09A-3 — G4: escopo antes (16/10/2026)

Registro anterior à edição de código. Base após `git fetch origin main`: HEAD e origin/main
`091a878eb804720360c75f1b1d26bcf99ecb5233`. Branch fixa: `arena/055fb215-gruposegsystemseguranca`.
GitHub reconciliado: G1 MERGED #250 (`c6682c11dd51fd98ceb480e59a2f8b5beafa5cfe`), G2 MERGED
#251 (SHA da base acima); todos os checks retornados dessas PRs são SUCCESS. Não reabrir.
#234 permanece OPEN, financeiro/datas, alheia: não tocar, complementar nem mesclar.

## Medição no código e contratos

- Rota pública canônica `/cliente/redefinir-senha`, `ResetForm` em
  `src/app/cliente/redefinir-senha/page.tsx`; com token envia `{token,password}` a
  `POST /api/auth/reset`. Sem token monta `RequestForm`, corrigido por G1; não será alterado.
- Origem por e-mail: `POST /api/auth/recover`, `createLinkResendHandler` em
  `src/server/client-access-api.mjs`, recebe `PASSWORD_RESET_TTL_MS` definido em
  `src/lib/client-auth-core.mjs:31` como `60 * 60 * 1000` = 3.600.000 ms = 1 h.
  Resposta genérica 202, limites 5/24 h e 2 min; token password_reset, hash, substituição e auditoria.
- Origem manual: após aprovação de TI individual com grant `client_recovery.manage`,
  `authorize` em `src/server/client-offline-recovery-api.mjs` usa `TTL_MS = 15 * 60 * 1000`
  = 900.000 ms = 15 min; devolve link uma vez pelo canal restrito. Mesmo kind password_reset,
  mesma rota de consumo; expiração não é informada à página como metadado de origem.
- `resetPassword` em `client-access-api.mjs` recusa inexistente/usado/expirado/substituído
  com `400 reset_link_invalid`; transação preserva consumo, auditoria e revogação de sessões.
- A mensagem atual associa a todos os casos “Ele vale 1 hora”, incorreto para a origem manual.

## Uma única redação proposta

“Este link de redefinição não é mais válido. Ele tem prazo de validade, uso único e é substituído
quando um novo é emitido. Peça outro link.”

Remove somente a duração fixa, conserva a informação verdadeira comum às duas origens e a ação
anterior. Não distingue o motivo da recusa nem a existência de identidade. Não há duas mensagens
concorrentes nem necessidade de escolher uma política de expiração: esta correção é de texto,
não altera qualquer prazo ou contrato. Não é aceite humano da redação.

## Gates encontrados e extensão limitada

- `test:ux-portal:pg`: PostgreSQL descartável + HTTP + Chromium; 16 testes na base, incluindo
  G1 (foco/repetição/503 real/202) e G2 (reenvio, limites/503 real/202). Mantê-los literalmente
  intactos. Adicionar teste separado só para o erro `reset_link_invalid` desta rota.
- `test:client-access:pg`: HTTP real de recuperação genérica, rotação, uso único, senha,
  revogação e rollback de auditoria (27 testes na base); não mede redação/viewport/teclado.
- `test:unit`: `client-auth-core` cobre regras puras; `client-offline-recovery` confere
  estaticamente TTL 15 min, grants TI, substituição e consumo; não é prova de navegador.
- `typecheck` e inventário não substituem jornada real.

Novo teste: fixtures sintéticas de tokens expirados com janelas originais de 60/15 min no banco
DESCARTÁVEL (não alegar emissão pelos endpoints). Consumir pelo HTTP real em Chromium, verificar
400 e mensagem comum; medir 320/390/768/1440, tema claro único, percurso Tab de vários passos e
submissão por Enter. Capturas antes/depois sem URL/token/senha/cookie; limpar campos antes da
captura. Não há necessidade de provocar falha de serviço ou simular fetch neste recorte.
Reexecutar os quatro comandos pedidos; regenerar UX-PRO-00 pelo gerador se creditar capturas.

## Preservações e limites

Somente uma string de produto. Não alterar APIs, payload, prazos, senha, sessão/cookies, MFA,
rate limit, auditoria, 202 genérico, uso único/substituição, isolamento, permissões ou operação local.
G1/G2 intactos. G3 depende de decisão explícita do proprietário (PUT real na área autenticada;
pública só confirm_email). G5 sem mudança transversal. E2–E9/C11, #234, 09B (apenas diagnóstico),
09C e UX-PRO-10 fora desta sessão. Sem novos endpoints, migrações, scripts QA ou workflows.
Sem aceite humano/WCAG/UAT; homologação e produção NO-GO.

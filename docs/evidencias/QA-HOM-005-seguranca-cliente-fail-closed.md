# QA-HOM-005 — bloqueio verificável de MFA/troca de e-mail inseguros

**Data:** 2026-09-28. **Escopo:** primeiro lote P0 `SEC-06`, `SEC-07` e proteção de sessão do cliente; **não** é homologação desses requisitos. Dados e banco somente sintéticos, em loopback Linux, descartados pelo runner. **Produção/link Funnel:** NO-GO. SMTP continua desligado.

## Inconsistência reproduzida por inspeção

`server.mjs` despachava rotas MFA para handlers não exportados; os demais recebiam somente `(req,res)` embora esperassem `(req,res,db,session)` e usassem API Express (`req.json`, `res.status().json`) em servidor `node:http`. A implementação antiga de verificação não usava TOTP real e criava pedido de troca de e-mail **sem verificar a senha** ou comprovar posse do novo endereço. O login emitia sessão mesmo quando havia `auth_mfa.activated_at`, ignorando a segunda etapa.

## Alteração pequena e defensiva

- Rotas `/api/client/security/mfa/{activate,verify,disable}` e `/api/client/security/email-change` verificam método, origem e sessão; devolvem `503 mfa_unavailable` / `503 email_change_unavailable` ao cliente autenticado. Não executam mutação de segurança nem alegam sucesso. O histórico dos endpoints demonstra intenção, **não fluxo concluído**.
- `readClientSession` não aceita cookies de conta com MFA ativo; `handleLogin` checa a mesma marca **após senha válida** e não emite nova sessão (`503 mfa_login_unavailable`). Tela real `/cliente/entrar` informa que falta a etapa adicional, em vez de alegar senha incorreta. Assim a ausência do desafio não se converte em bypass. A ativação via interface/API continua deliberadamente indisponível até haver TOTP por biblioteca, challenge, recuperação e ensaio em PostgreSQL.
- Troca de e-mail sem SMTP exige proposta de verificação manual com confirmação independente, revogação e auditoria; **não** liberar alteração só por senha/token mostrado ao requerente. Opcionalmente aguardar canal de e-mail autorizado no futuro. Decisão ainda pendente.

## Evidência executada no checkout deste lote

| ID de teste | Comando | Observação |
|---|---|---|
| `SEC-06/07-UNIT-001` | `npm test` | **147/147**, zero skip/fail, exit 0; 6 novos testes em `tests/client-security-routes-fail-closed.test.mjs` cobrem método, origem, anônimo e indisponibilidade autenticada. |
| `QA-HOM-005` | `node scripts/qa-homologacao-local.mjs --verify` | Exit 0: PG sintético 96/96, MFA anônimo 401, MFA autenticado 503, troca e-mail autenticada 503, origem estrangeira 403, cookie antigo após ativação sintética 401, senha correta + MFA ativo 503 **sem Set-Cookie**, cleanup true. |
| `PLT-SMK-001`, `PLT-CI-001` | `node scripts/qa-wave0-static.mjs` | 5/5, exit 0. |
| `PLT-BLD-001` | `npm run typecheck`; `npm run build` | Exit 0 em ambos. |

Logs descartáveis no sandbox: `/tmp/qa-p0-{install,unit,type,http,build,static}.log`. O teste sintético **não** mede MFA real, comunicação SMTP, Windows, acesso remoto, segurança do PC, backup, demais rotas ou UAT; nada foi aberto na Internet. Próximo lote: implementar MFA TOTP real com desafio no login e recuperação, ou manter login de identidades MFA ativas bloqueado. Em paralelo projetar instalação PostgreSQL persistente e gate de backup. Aguardar `CONTINUAR`.

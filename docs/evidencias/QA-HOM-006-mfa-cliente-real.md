# QA-HOM-006 — MFA TOTP real do cliente (recorte vertical)

**Data:** 2026-09-28. **Vínculo:** `SEC-06` (somente identidade cliente), `SEC-07` (troca de e-mail permanece bloqueada), `PLT-MIG-001`, `TENANT-SEG-001`; NÃO homologação global dos 222 IDs. **Ambiente:** Linux, Node 22, PostgreSQL 17.9 embutido temporário/loopback; 4 identidades e 2 empresas fictícias, DB e arquivos removidos no final. Não houve teste no Windows do usuário nem abertura do Funnel.

## Implementação deste lote

- `otplib` v13 para TOTP RFC 6238 com tolerância de 30 s; `src/lib/client-mfa.mjs` cifra chave TOTP AES-256-GCM com AAD por identidade. A chave **separada e estável** `CLIENT_MFA_ENCRYPTION_KEY` deve ser de 32 bytes base64url guardada fora do repositório: se ausente/errada, negamos login de identidades com MFA, sem downgrade.
- Migração aditiva **097**: `auth_sessions.mfa_verified_at` vincula o desafio à sessão; `auth_mfa.last_used_step` impede reuso do mesmo período TOTP. Migrações 001–096 não foram reescritas.
- `/cliente/app/seguranca` (após login real) acessível no menu do cliente: setup com senha atual, chave manual para autenticador, ativação mediante código, oito códigos de recuperação exibidos uma única vez e armazenados só como hashes. Ao ativar, cookie anterior não autoriza mais; logout e novo login são necessários. A página protótipo `/cliente/seguranca` continua identificada como prévia, não foi convertida silenciosamente.
- Login com senha para conta MFA retorna **202 + desafio temporário** sem cookie; `/api/auth/mfa/complete` verifica TOTP ou código de recuperação de uso único, aplica limite/tentativas e expiração, grava `mfa_verified_at` na sessão criada **após** a prova. A sessão vinculada à conta/tenant continua revogável. Desativação exige sessão com MFA, senha e código; revoga todas as sessões. O valor interno `status_block` como `revoke_reason` na desativação deve ganhar motivo específico em migração futura, sem alterar migrações antigas.
- `/api/client/security/email-change` segue em **503**, pois sem SMTP não há prova independente de posse do novo endereço. O endpoint legado `/api/client/security/mfa/verify` também segue bloqueado; o desafio de login real usa `/api/auth/mfa/complete`.

## Evidência automatizada executada

| Caso | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | exit 0; lockfile inclui `otplib` 13.5.0. |
| `SEC-06/07-UNIT-001`, `npm test` | **151/151**, 0 fail/skip, exit 0. Abrange AES-GCM/AAD, ausência de chave, geração/verificação e rejeição de replay, guardas HTTP e e-mail bloqueado. |
| `QA-HOM-006`, `node scripts/qa-homologacao-local.mjs --verify` | exit 0, 97/97. Setup senha errada **403**, setup **200**, ativação código incorreto **403**, ativação correta **200**, ciphertext e hashes no DB (sem segredos em claro), cookie antigo **401**, senha → desafio **202 sem cookie**, código errado **401**, TOTP certo → cookie **200**, replay de desafio **401**, escopo cliente A **200** sem B, recuperação **200** e reuso **401**, replay TOTP no mesmo período **401**, desafio expirado **401**, desativação **200**, cookie revogado **401**, login posterior sem MFA **200**, cleanup true. |
| `PLT-MIG-001`, `npm run test:migrations:pg` | exit 0; 97/97, reaplicação com checksum, clone preservado, mutação deliberada em migração 006 rejeitada no clone, cleanup true. |
| `TENANT-SEG-001`, `npm run test:tenant:pg` | **9/9**, exit 0, cleanup true **após ajuste da fixture para incluir a migração aditiva 097**. Uma primeira execução falhou (coluna nova ausente na fixture com apenas 001–007); não foi contada como passe. |
| `PLT-SMK-001`/`PLT-CI-001`; `npm run typecheck`; `npm run build` | Estático 5/5; typecheck e build exit 0. |
| `TENANT-SEG-003` (`npm run test:cli-v2:pg`) | **9/9**, exit 0; cluster temporário removido. |
| PR #6 / CI remoto para `d7639d7` | [GitHub Actions 36511564929](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36511564929) **verde** (install/audit, static, unit, typecheck, build, RAG e tenant A/B). O rótulo da etapa tenant foi corrigido para mencionar a fixture 097; o commit de rótulo exige novo check próprio. |

Houve uma primeira falha QA-HOM-006 causada por diferença de erro (`auth_unavailable` vs `mfa_login_unavailable`) para segredo legado; o servidor foi corrigido para resposta explícita 503 e o smoke final passou. Logs em `/tmp/mfa-{ci,unit-final,type-final,static,migrations,http-extra,tenant-final,build}.log`, temporários/não versionados. **Não copiar senhas, QR, códigos ou chaves para relatórios/logs**. `--verify` não imprime esses segredos.

## Limites / gate do próximo lote

- **Sem GO para link ou dados reais:** ainda faltam instalação persistente Windows + chave MFA estável sob custódia, backup/restauração, contas individuais staff/Marcelo com MFA apropriado, hardening do proxy/host, teste Windows e UAT. Restam riscos de segurança e requisitos não verificados; MFA cliente é **recorte funcional testado em Linux**, não `SEC-06` global verificado.
- **SMTP diferido e autenticação sem e-mail:** TOTP funciona localmente, mas confirmação de e-mail/recuperação de senha e troca de endereço precisam de canal manual de verificação humana independente, com controles e aceite explícito, ou aguardam SMTP. Não chamar protótipos de e-mail de operacionais.
- **ZIP homologação anterior é histórico:** contém 96 migrações e não recebe automaticamente estas alterações. Não entregá-lo ao cliente como pacote atualizado nem iniciar Tailscale Funnel com esse ZIP.

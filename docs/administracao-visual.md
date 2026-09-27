# Administração visual e configuração administrativa

## Estado atual da seleção de visuais

Por decisão atual, a seleção administrativa/global das dez propostas está **pausada**. O layout **06 — Azul em camadas** permanece padrão. As prévias individuais continuam disponíveis em `/layout-01` a `/layout-10`, mas os controles de seleção em `/admin/visual` ficam desativados. Com `SITE_VISUAL_SELECTION_ENABLED=false` (padrão no `.env.example`), a API devolve o layout 06 para o site e recusa alterações. Não ative essa variável até o usuário retomar essa fase.

As propostas e o código de administração são preservados para trabalho futuro. Se a seleção for reativada com autorização, configure PostgreSQL, autenticação e revisão de segurança antes de definir `SITE_VISUAL_SELECTION_ENABLED=true`.

## Configuração administrativa usada pelo painel de pedidos

O painel `/admin/leads` usa a sessão administrativa já implementada. Esta autenticação por token é uma camada inicial, não um sistema completo de contas/RBAC; configure segredos fortes e não publique a página como ferramenta de produção antes de reforçar a autenticação.

1. **Para desenvolvimento local:** copie `.env.example` para `.env.local`. Gere uma senha de banco URL-safe com `openssl rand -hex 32`; preencha `POSTGRES_PASSWORD` e use a mesma senha em `DATABASE_URL`. O Compose de desenvolvimento vincula a porta somente em `127.0.0.1` e mantém os dados em volume nomeado.
2. Suba o PostgreSQL local com `npm run db:up`. Para produção auto-hospedada, prepare PostgreSQL em rede privada; não use o Compose de desenvolvimento como configuração de produção. Separe um usuário de execução com privilégios DML mínimos de um usuário de migração com `CREATE`.
3. Configure `DATABASE_URL` para o usuário de execução. Para migrar com a conta privilegiada, configure também `DATABASE_MIGRATION_URL`; se omitida, o comando usa `DATABASE_URL`.
4. Gere três segredos aleatórios distintos, com ao menos 32 caracteres. Exemplo: `openssl rand -base64 48`. Configure `SITE_ADMIN_SESSION_SECRET`, `SITE_ADMIN_TOKEN_MARCELO` e `SITE_ADMIN_TOKEN_TI` no `.env.local` ou no cofre de segredos do servidor. Não os versione nem os envie por chat.
5. Execute `npm run db:migrate`. O comando aplica as migrations de configuração visual e captação de leads.
6. Inicie com `npm run dev`, acesse `/admin/leads` e use o token do papel desejado. O valor é enviado ao endpoint do mesmo site; a sessão usa cookie `HttpOnly`, `SameSite=Lax` e `Secure` quando servido por HTTPS.
7. Em produção, execute `npm run build` e `npm start` no servidor Node. A configuração de proxy deve encaminhar `/api/leads`, `/api/admin/session`, `/api/admin/leads` e `/api/admin/leads/:id` para o mesmo processo. Só ative `TRUST_PROXY=true` quando o proxy de confiança sobrescrever `X-Forwarded-Host`, `X-Forwarded-Proto` e `X-Forwarded-For`; caso contrário, deixe desativado.

## Limites e próximos controles antes da produção

- Este checkout não tem `DATABASE_URL`, instância PostgreSQL nem tokens administrativos configurados. A API e as migrations passaram por checagens de código e smoke tests sem banco; a persistência real ainda não foi verificada.
- Os tokens por papel são um mecanismo inicial, não autenticação completa. Antes de expor à internet, concluir RBAC do sistema, 2FA obrigatório para TI, rotação de segredos, política de backup/restauração e validação de TLS/firewall do PostgreSQL.
- A seleção visual global segue pausada por `SITE_VISUAL_SELECTION_ENABLED=false`; não habilitar até retomada explícita.
- ZIPs estáticos de prévia não incluem API de gravação central. O painel e a captação dependem do servidor Node e PostgreSQL.

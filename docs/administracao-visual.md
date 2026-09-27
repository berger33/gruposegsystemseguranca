# Administração global da aparência do site

## Comportamento

- O layout **06** é o padrão inicial (`DEFAULT_SITE_VISUAL`).
- `/admin/visual` lista e troca integralmente entre as dez propostas.
- Com PostgreSQL e sessão administrativa configurados, a seleção fica global em `site_visual_config`; visitantes recebem a seleção do servidor e páginas já abertas consultam a configuração periodicamente.
- Alterações são registradas em `site_visual_audit`, com visual anterior/novo, horário e papel administrativo (`marcelo` ou `ti`).
- Se a API central ou o banco não estiverem configurados, a interface entra no modo de demonstração usando `localStorage`. Essa seleção só vale no navegador atual e não deve ser tratada como publicação global.

## Configuração local do PostgreSQL

1. **Para desenvolvimento local:** copie `.env.example` para `.env.local`. Gere uma senha de banco URL-safe com `openssl rand -hex 32`; preencha `POSTGRES_PASSWORD` e use a mesma senha em `DATABASE_URL`. O Compose de desenvolvimento vincula a porta somente em `127.0.0.1` e mantém os dados em volume nomeado.
2. Suba o serviço local com `npm run db:up`. Para produção auto-hospedada, prepare o PostgreSQL no servidor em rede privada; não use o Compose de desenvolvimento como configuração de produção. Separe um usuário de execução com privilégios DML mínimos de um usuário de migração com `CREATE`.
3. Configure `DATABASE_URL` para o usuário de execução. Para migrar com a conta privilegiada, configure também `DATABASE_MIGRATION_URL`; se omitida, o comando usa `DATABASE_URL`.
4. Gere três segredos aleatórios distintos, com ao menos 32 caracteres. Exemplo: `openssl rand -base64 48`. Configure-os como `SITE_ADMIN_SESSION_SECRET`, `SITE_ADMIN_TOKEN_MARCELO` e `SITE_ADMIN_TOKEN_TI` em `.env.local` ou no cofre de segredos do servidor. Não os versione nem os envie por chat.
5. Execute `npm run db:migrate` para criar a configuração e auditoria. A migração insere o layout 06 apenas se ainda não existir uma escolha gravada. Depois, conceda ao usuário de execução apenas `SELECT`/`UPDATE` em `site_visual_config` e `INSERT` na auditoria (incluindo uso da sequence).
5. Inicie com `npm run dev`, acesse `/admin/visual` e use o token separado do papel desejado. O valor do token é enviado apenas ao endpoint do mesmo site; a sessão posterior usa cookie `HttpOnly`, `SameSite=Lax` e `Secure` quando servido por HTTPS.
6. Em produção, execute `npm run build` e `npm start` no servidor Node. A configuração de proxy deve encaminhar `/api/site-visual` e `/api/admin/session` para esse mesmo processo. Só ative `TRUST_PROXY=true` quando o proxy de confiança sobrescrever `X-Forwarded-Host`, `X-Forwarded-Proto` e `X-Forwarded-For`; caso contrário, deixe desativado.

## Limites e próximos controles antes da produção

- Este checkout não tem `DATABASE_URL`, instância PostgreSQL nem tokens administrativos configurados. Portanto, aqui a seleção funciona em modo local; a gravação global só poderá ser verificada após apontar para uma instância real e executar a migração.
- Os tokens por papel são um mecanismo inicial de acesso ao módulo visual, não um sistema completo de contas. Antes de expor à internet, concluir a autenticação/RBAC do sistema, implementar 2FA obrigatório para TI, rotacionar segredos, aplicar política de backups/restauração e validar TLS/firewall do PostgreSQL.
- A prévia estática/ZIP não contém API de gravação central; nela, o seletor permanece somente local. O modo global requer o servidor Node (`npm start`) e PostgreSQL.

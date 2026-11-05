# Gate de produção — Grupo SEG System

**Revisão técnica:** 04/11/2026, fatia 02. **Base:** `0e6456e9d01b825a3bff4997f92506ac4ff1c633`.
**Status: NO-GO — produção não autorizada.** Este documento corrige o procedimento histórico de 28/09; não registra homologação, contratação, configuração de provedor, migração no destino ou publicação. Estado consolidado: [STATUS-VIGENTE.md](STATUS-VIGENTE.md). Plano: [fatias de execução](../auditoria-2026-11-04/PLANO-EXECUCAO.md).

Os requisitos D-01..D-13 e de homologação continuam sendo decisões/evidências necessárias; não são fechados por este runbook. Não usar ZIP antigo de prévia como instalação de produção.

## Preparação e contrato de ambiente

- Node.js **22** e dependências instaladas com `npm ci`, usando o lockfile. Validar a versão aprovada no ambiente alvo.
- Runtime: `server.mjs`, não um servidor Next separado. `npm run dev` usa `--dev`; `npm start` inicia o servidor sem esse flag e exige build prévio. Para produção aprovada, fornecer `NODE_ENV=production` **antes** de iniciar o processo.
- O servidor e o migrador chamam `@next/env.loadEnvConfig` na raiz. A variável já presente no processo tem precedência. Arquivos locais podem afetar o resultado; não manter configurações conflitantes em arquivos diferentes.
- Esses dois chamadores não passam `dev=true`: fora de `NODE_ENV=test`, a leitura inicial considera `.env.production.local`, `.env.local`, `.env.production`, `.env`, nessa ordem. O teste pula `.env.local`. O Next possui seu próprio carregamento durante build/dev; **não presumir** que apenas `--dev` selecione `.env.development` para o servidor customizado.
- Convenção local documentada: `.env.local`, fora do Git. O Compose exige **explicitamente** `--env-file .env.local` nos scripts `db:up`/`db:down`. Arquivos `.env.beta` não são carregados automaticamente por este servidor.
- Começar pelo [.env.example](../.env.example), não copiar segredos entre ambientes. O exemplo contém somente placeholders e valores de desenvolvimento.

### Contrato conferido contra o código

| Variável | Uso e requisito |
|---|---|
| `DATABASE_URL` | PostgreSQL da aplicação. Deve ter usuário/senha/banco corretos e privilégios mínimos; não usar URL de produção nos gates locais. Sem ela a aplicação não tem banco configurado. |
| `DATABASE_MIGRATION_URL` | Opcional: conta de migração; migrador usa essa URL ou, se vazia, `DATABASE_URL`. Não substitui a URL da aplicação. |
| `DATABASE_POOL_SIZE` | Pool da aplicação; padrão 5. Dimensionar por processo e capacidade total do banco. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Consumidas pelo Compose local, não substituem `DATABASE_URL`. Porta publicada só em loopback no Compose atual. |
| `SITE_ADMIN_SESSION_SECRET` | Sessão staff; código exige pelo menos 32 caracteres. Usar valor aleatório forte e exclusivo, nunca um placeholder. |
| `EMPLOYEE_SESSION_SECRET` | Sessão do funcionário; pelo menos 32 caracteres, independente do segredo staff, sem fallback para ele. |
| `CLIENT_MFA_ENCRYPTION_KEY` | Chave separada de **32 bytes em base64url canônico**; sem ela MFA falha fechado. Não é hex nem a chave da sessão. Perda/rotação exige procedimento de recuperação, não bypass. |
| `SITE_ADMIN_LEGACY_TOKENS`, `SITE_ADMIN_TOKEN_MARCELO`, `SITE_ADMIN_TOKEN_TI` | Bootstrap legado desativado por padrão. Não usar como autenticação diária; identidades individuais ativas bloqueiam o caminho legado. Instalação inicial requer procedimento controlado, não ativação pública automática. |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | Padrão 8 a cada 15 minutos; não elevar limites de produção para fazer testes passarem. |
| `PUBLIC_BASE_URL` | Origem pública absoluta dos links do cliente, sem barra final. Definir HTTPS real no destino aprovado; o fallback localhost é inadequado para links externos. |
| `CLIENT_DOCS_DIR` | Documentos privados do cliente; padrão `.data/documents` na raiz do processo. Nunca apontar para `public` ou pasta web. |
| `EMPLOYEE_DOCS_DIR` | Documentos privados do funcionário; padrão `.data/employee-documents`. Incluir no inventário real de backup. |
| `BIND_HOST`, `PORT` | Servidor. Exemplo usa `127.0.0.1:3000`; código sem `BIND_HOST` usa `0.0.0.0`. Não depender de fallback para restringir exposição. |
| `TRUST_PROXY` | Somente `true` quando proxy confiável sobrescreve cabeçalhos encaminhados e acesso direto ao backend está protegido. Controla protocolo/host/IP confiados. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP nos caminhos que o utilizam. Porta padrão 587; TLS implícito quando `MAIL_SECURE=true` ou porta 465. Usuário e senha são usados juntos; provisionar conforme o fornecedor. |
| `LEADS_NOTIFY_EMAIL` | Destinatário dos avisos de lead; necessário além de host/remetente para esse caminho. |
| `OLLAMA_ENABLED`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | RAG real: opt-in com `true`, URL padrão local e modelo padrão `qwen3:1.7b`. Modelo instalado não prova base publicada nem autorização de fontes. |
| `HERE_API_KEY` | Geocodificação reversa opcional; chave apenas no servidor, com consentimento individual exigido pelo fluxo do funcionário. |
| `NEXT_PUBLIC_ENV`, `NEXT_PUBLIC_ALLOW_INDEX` | Liberação de indexação exige **ambas**: `production` e `true`. São públicas; nunca colocar segredo em `NEXT_PUBLIC_*`. |
| `ACCESS_REVIEW_INTERVAL_DAYS` | Prazo da revisão de acesso; 1..730 dias. Sem regra válida, não inventar classificação de vencido. |
| `EXT07_*` | Agendamento opt-in e executor; ver seção 5 do [procedimento de banco](APLICACAO-BANCO-DESTINO.md). Defaults e guardas do modo durável devem ser preservados. |

Nomes históricos **não são aliases** do contrato acima: `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_TOKEN`, `SMTP_*` e `OLLAMA_HOST` não configuram esses caminhos do runtime atual. Não renomear variáveis existentes em instalações sem verificar seus consumidores.

### Geração local de segredos — fora de logs e do Git

Executar somente em terminal privado para provisionamento; cada invocação gera um valor independente. Não colar saídas em chat, relatório, CI ou commit:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Gerar separadamente para `SITE_ADMIN_SESSION_SECRET` e `EMPLOYEE_SESSION_SECRET`. Para MFA:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Usar essa segunda saída exclusivamente em `CLIENT_MFA_ENCRYPTION_KEY`. Para a senha do banco local pode-se usar `randomBytes(24).toString('hex')`, guardando o mesmo valor no Compose e na URL. `randomBytes(16)` gera 16 bytes, não 32; não usar esse tamanho para a chave MFA. Nunca registrar valores de demonstração como segredos reais.

## Pré-requisitos para liberar produção

### 1. Homologação RAG beta (humana)

Executar o [roteiro de homologação](homologacao-rag-beta.md) com os perfis previstos (público, cliente, RH, Marcelo e modos de atendimento), fontes apropriadas e negativas de acesso. Registrar respostas, indisponibilidade, escopo e aceite. Redigir evidências sem dados pessoais, tokens ou cookies reais. O gate local com provedor controlado não prova qualidade de resposta do modelo real.

### 2. Troca beta → produção

Revisar configuração pela interface autorizada de TI. As rotas de configuração existentes incluem `/api/admin/ai-bot-config`; mutações exigem sessão, papel e validações do handler. Não copiar comandos antigos com cookie fictício: operações protegidas também podem exigir origem, motivo e aprovação.

Validar os estados de `ai_bot_config` exigidos pelo roteiro (incluindo aprovação e modos beta/dev) no fluxo vigente. Não mudar flags para simular homologação concluída. Flags do bot **não liberam indexação automaticamente** e não conectam provedores ausentes.

### 3. Indexação: duas condições e build coerente

- Enquanto não houver liberação expressa, manter `NEXT_PUBLIC_ENV=beta` e `NEXT_PUBLIC_ALLOW_INDEX=false`.
- Para a publicação aprovada, são necessárias `NEXT_PUBLIC_ENV=production` **e** `NEXT_PUBLIC_ALLOW_INDEX=true`, presentes no build e no processo servidor. Rebuild é necessário para metadados/valores públicos incorporados pelo Next.
- Não remover manualmente a proteção do código. `src/app/layout.tsx` e `src/lib/seo-technical.mjs` usam a mesma condição. `is_noindex` no banco ou `is_beta_mode` no bot, isoladamente, não alteram essa condição.
- Antes da liberação: `/robots.txt` nega tudo, retorna `X-Robots-Tag: noindex, nofollow`; `/sitemap.xml` retorna 404. Depois: conferir metatag do HTML, robots, sitemap e bloqueio das superfícies internas no domínio aprovado. Conferir somente o header da home não é prova suficiente.

### 4. Hospedagem e orçamento

O valor histórico de R$ 200/mês é referência a aprovar/dimensionar, não capacidade ou contrato comprovado. Considerar Node, PostgreSQL, documentos privados, backup externo, observabilidade, mensagens e recursos da IA.

O arquivo existente `infra/postgres/compose.yaml` sobe **somente PostgreSQL 17**, não a aplicação nem toda a infraestrutura de produção. Não usar referência antiga a `docker-compose.beta.yaml` da raiz: esse caminho não existe no checkout atual. Definir host/domínio/HTTPS, reinício, armazenamento, limites de rede e responsável operacional antes do deploy.

### 5. Segredos, banco e inicialização controlada

Confirmar variáveis do contrato acima, rotação segura, custódia da chave MFA e contas individuais. Não imprimir o ambiente completo, URLs com senha, cookies ou logs de mensagens.

Aplicação do banco: seguir [APLICACAO-BANCO-DESTINO.md](APLICACAO-BANCO-DESTINO.md) **após autorização e ensaio de clone**, com backup prévio recuperável. O migrador atual aplica 001–183 e exige opt-in separado para host remoto. Não ativar `ALLOW_REMOTE_MIGRATIONS=true` por conveniência; cada migração é transacional, mas a série inteira não é um rollback único.

Comandos de validação local (sem ação no banco de destino):

```bash
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm test
npm run build
```

Os gates de PostgreSQL descartável têm requisitos próprios e recusam URLs herdadas. Nunca reutilizar a configuração real para rodá-los.

### 6. SMTP: conexão não é entrega

- Configurar `MAIL_*`, não `SMTP_*`. Lead também requer `LEADS_NOTIFY_EMAIL`; links de cliente requerem `PUBLIC_BASE_URL` correto.
- `/api/admin/integrations/:id/test` é uma ação autenticada de verificação: no provedor SMTP chama `transporter.verify()`, atualiza o registro e **não envia mensagem**. Pode realizar conexão externa e exige autorização. Status `configured`/`last_success_at` prova somente o teste daquele caminho naquele instante.
- Confirmar entrega separadamente para lead e autenticação do cliente, usando destinatários de teste autorizados, sem dados reais desnecessários e com recebimento verificado.
- **Fila administrativa: bloqueada nesta base.** `server.mjs` injeta `mailer: null`; configurar `MAIL_HOST` não conecta esse transporte. A fatia 07 fará a ligação e os testes locais; até lá, não prometer nem registrar envio dessa fila como concluído.
- Sem provedor, declarar `not_configured` em vez de sucesso fictício. Teste capturado localmente não equivale a recebimento no provedor real.

### 7. Identidade institucional, privacidade e LGPD

Obter aprovação de CNPJ, logotipo, contatos, textos, FAQ e política de privacidade. Conferir a página pública e a versão efetivamente publicada, não somente linhas de seed. Validar inventário de dados, base legal, identidade do titular, atendimento LGPD, impedimentos legais e retenção efetiva com responsáveis competentes. Cadastro de política não comprova execução de descarte ou conformidade jurídica.

### 8. Backup e restauração — BLOQUEADO, não executar em produção

- **A API `/api/admin/backups` e `/api/admin/backups/restore` não executa operações.** POST retorna **503** deliberadamente; GET só mostra registros históricos **não verificados**. `is_restore_tested`, `status=success` e notas da migração 046 não comprovam bytes, criptografia, retenção nem restore. Não marcar esta etapa concluída por leitura de metadados.
- A [política técnica proposta](politica-tecnica-backup-recuperacao.md) define escopo, retenção, âncora independente, responsabilidades e metas RPO/RTO **ainda não medidas no destino**. O [ensaio QA assinado](qa-casos-onda14-politica-assinatura-qa.md) usa bytes inventados e não é executor de produção.
- Gate real: inventário DB **e todos os arquivos privados**, consistência DB+FS, armazenamento fora do host protegido/imutável, criptografia e custódia de chaves, assinatura verificada com âncora pública independente, retenção/descarte, segregação, recuperação/PITR conforme política aprovada; restore **autorizado em ambiente isolado**, com integridade e RPO/RTO medidos.
- Ensaios com PostgreSQL 17.9 exigem `pg_dump` e `pg_restore` versão 17 compatíveis. A auditoria de 04/11 encontrou ferramentas ausentes; uma recusa de pré-requisito não é restore aprovado. Não apontar QA para o destino para contornar a recusa.

### 9. Observabilidade, healthcheck e isolamento

Validar alertas de fato recebidos, IDs de correlação, logs sem segredos, métricas e prontidão, reinício e falha de banco. Tabelas de ambientes/flags/orçamento não isolam fisicamente serviços nem ativam alertas por si só.

Rotas de observação existentes:

- `GET /api/health/live`: processo vivo, não prontidão completa.
- `GET /api/health/ready`: prontidão conforme checks do handler; conferir HTTP e corpo, incluindo degradações.
- `GET /api/health`: visão completa; no handler atual a restrição de sessão/papel é aplicada aos aliases administrativos/operacionais, não a esse caminho genérico. Não presumir que ele seja privado. Revisar exposição/detalhamento na fatia de segurança, sem alterar permissões nesta revisão documental.

Em homologação já iniciada no loopback, pode-se observar sem cookies:

```bash
curl --fail-with-body http://127.0.0.1:3000/api/health/live
curl --fail-with-body http://127.0.0.1:3000/api/health/ready
curl -i http://127.0.0.1:3000/robots.txt
curl -i http://127.0.0.1:3000/sitemap.xml
```

O último 404 é esperado enquanto a indexação estiver bloqueada. Adequar porta ao processo; num servidor remoto usar o endereço HTTPS aprovado, não localhost do navegador do usuário.

### 10. Checklist final de produção — 12 critérios, nenhum aprovado nesta revisão

- [ ] Homologação humana do RAG/perfis e fontes, incluindo negativas e indisponibilidade.
- [ ] Configuração do bot aprovada pelo fluxo autorizado, sem flags usadas como substituto de aceite.
- [ ] Indexação liberada somente após aprovação; build/runtime/metatag/robots/sitemap coerentes.
- [ ] Hospedagem, domínio, HTTPS, capacidade, custos e responsável operacional aprovados.
- [ ] Segredos exclusivos por ambiente, chave MFA custodiada, sessões staff/funcionário e recuperação validadas.
- [ ] SMTP verificado e entregas reais autorizadas comprovadas por caminho, incluindo fila após sua implementação.
- [ ] Conteúdo institucional/política LGPD aprovados, bases legais, atendimento e retenção verificados.
- [ ] Backup DB+arquivos autenticado/protegido e restore isolado autorizado, íntegro e medido para RPO/RTO.
- [ ] Observabilidade, alertas, readiness, reinício e isolamento efetivo conferidos no destino.
- [ ] Dependências, suíte, tipos, build e CI pertinentes verdes na revisão exata, sem skips silenciosos.
- [ ] Banco/arquivos do destino homologados e UAT por papel/dispositivo, incluindo Windows quando aplicável.
- [ ] Autorização explícita por escrito para publicar; sem liberação automática.

## Inicialização futura — somente depois do gate aprovado

Depois de provisionamento/ensaio/autorização, com variáveis fornecidas seguramente ao processo, build da mesma revisão e banco/arquivos preparados, o ponto de entrada é `npm start`. Não usar `--dev` em produção. Não há comando de deploy automático neste gate.

Cookies são `Secure` em produção; acesso por HTTP simples não substitui teste de login via HTTPS. Exposição de `BIND_HOST=0.0.0.0` só quando exigida pela infraestrutura aprovada e com proteção de rede. `TRUST_PROXY=true` exige proxy de fato confiável. A demonstração local/túnel não é aprovação dessa arquitetura.

## Não fazer automaticamente

Não publicar, contratar, pagar, enviar campanhas, ativar acesso remoto, alterar flags de produção ou executar migração/restore no destino sem autorização correspondente. Preferir sandbox e captura local; documentar o que depende de fornecedor, acesso, hardware, revisão especializada e aceite humano.

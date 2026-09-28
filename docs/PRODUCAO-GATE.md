# Gate Produção — Grupo SEG System

Data: 2026-09-28
Branch auditada nesta revisão: arena/01a0e96a-gruposegsystemseguranca
Status: não liberada, noindex mantido. **Este checklist histórico não é procedimento de deploy nem autorização para executar os comandos de produção abaixo.** Conferir a [política técnica de backup](politica-tecnica-backup-recuperacao.md) e as evidências QA antes de qualquer mudança.

## Pré-requisitos para liberar produção (D-01..D-13 + homologação)

### 1. Homologação RAG beta (humana)
- Executar `docs/homologacao-rag-beta.md` com 5 perfis: cliente, RH Andreia, Marcelo, público, bot modes sem_ia/com_ia/whatsapp
- Checklist: RAGs isolados área pertinente, guardrails is_invented_* false, queue_position/wait_ms, protocolo RAG-*/BOT-*, contato claro Av Armando Bei 305
- Evidências: screenshots + curl logs + checklist assinado

### 2. Troca beta → produção (is_beta_mode)

```bash
# Ver config atual
curl -H "Cookie: admin_session=..." http://localhost:3000/api/ai-bot-config

# Trocar para produção (is_beta_mode false, is_dev_mode false, active_mode com_ia)
curl -X PATCH http://localhost:3000/api/ai-bot-config \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_session=..." \
  -d '{
    "active_mode": "com_ia",
    "is_beta_mode": false,
    "is_dev_mode": false,
    "default_rag_key": "publico",
    "reason": "Homologação RAG beta concluída com usuários representativos, autorização explícita produção, política privacidade aprovada, CNPJ e logotipo configurados, SMTP real, hospedagem 200 R$ teto dimensionada"
  }'
# reason deve ter >=10 chars
# Retorna 200 com config atualizada
# Verifica: SELECT * FROM ai_bot_config WHERE singleton_id=1;
# Esperado: is_beta_mode false, is_dev_mode false, active_mode com_ia, is_approved true
```

### 3. Remover noindex (preservado em não produtivo)

- No código: `src/app/layout.tsx` e `next.config.ts` têm `noindex` default
- Para produção: configurar env `NEXT_PUBLIC_ENV=production` + remover meta noindex
- Ou: em `site_visual_config` ou `seo_configs` set `is_noindex=false` quando `is_beta_mode=false`
- Validar: `curl -I https://gruposegsystem.com.br | grep -i robots` → deve não conter noindex em produção

### 4. Hospedagem R$200 teto

- Orçamento operacional: tabela `operational_budgets` seed Hospedagem base mensal infra 200.00 BRL
- `docker-compose.beta.yaml` já dimensionado para postgres:17-alpine + app Node 22
- Para produção, dimensionar separado: DB, storage, mensagens, IA, banco, infra
- `operational_budgets` alert_threshold_percent 80% → alerta quando atingir 80% do teto
- Não cobre todo ecossistema, dimensionar conforme `docs/evidencias/F5-lote16-plt11.md`

### 5. Secrets produção

Trocar todos secrets de `.env.beta` em produção:

```bash
# .env.production exemplo (NUNCA commitar)
DATABASE_URL=postgres://user:senha_forte@host:5432/gruposegsystem
NEXTAUTH_SECRET=gerar com openssl rand -base64 32 (min 32 chars)
ENCRYPTION_KEY=32 bytes hex (openssl rand -hex 16)
ADMIN_BOOTSTRAP_TOKEN=token forte
OLLAMA_HOST=http://ollama:11434
OLLAMA_ENABLED=true
OLLAMA_MODEL=qwen3:1.7b
WHATSAPP_NUMBER=551134372217
```

- `NEXTAUTH_SECRET` min 32 chars, `ENCRYPTION_KEY` 32 bytes hex
- `ADMIN_BOOTSTRAP_TOKEN` para bootstrap admin inicial
- `DATABASE_URL` com senha forte, não usar `postgres_beta_2026` de exemplo

### 6. SMTP real

- `integrations` tabela status `configured` quando SMTP env configurado
- `notification_queue` status `queued` → `sent` quando provedor real
- Sem SMTP real, fila fica `not_configured` até provedor
- Configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Testar: `POST /api/admin/integrations/:id/test` → deve retornar 200 com `last_success_at`

### 7. CNPJ, logotipo, política privacidade aprovada

- `privacy_policies` version com `status=publicado`, `is_published=true`, `approved_by`, `published_at`
- `/privacidade` page só mostra política publicada aprovada
- Inventário `privacy_data_inventory` completo: 10+ itens minimização
- `lgpd_requests` fluxo verificação identidade, responsável, prazo 15 dias, impedimentos documentados
- CNPJ e logotipo: configurar em `site_visual_config` ou `site_themes` + `seo_configs`

### 8. Backup e restauração — BLOQUEADO, não executar em produção

- **A API `/api/admin/backups` e `/api/admin/backups/restore` não executa operações.** POST retorna **503** deliberadamente; GET só mostra registros históricos **não verificados**. `is_restore_tested`, `status=success` e as notas da migração 046 são declarações legadas, **não evidência de bytes, criptografia, retenção nem restore**. Não tentar os comandos antigos deste gate, não marcar esta etapa concluída e não promover os registros a sucesso.
- A [política técnica proposta](politica-tecnica-backup-recuperacao.md) define escopo, retenção, âncora pública independente, responsabilidades de Marcelo/TI e metas RPO/RTO **ainda não medidas**. O [ensaio QA assinado](qa-casos-onda14-politica-assinatura-qa.md) usa exclusivamente bytes inventados em clusters descartáveis: não é executor de produção.
- Gate real: inventário fechado de DB **e todos os arquivos privados** com chaves referenciadas/versões/órfãos, snapshot DB+FS consistente, armazenamento fora do host imutável e criptografado com chaves custodiadas, assinatura verificada com chave pública ancorada fora do pacote, PITR/logs, segregação de permissões e descarte/privacidade comprovados; restore **autorizado** em ambiente de teste isolado com evidência medida de RPO/RTO, isolamento e trilha. Só então abrir proposta de executor, revisão de segurança e autorização explícita de produção. `backup_retention_policies` seed 90/365 dias e `operational_budgets` são **declarativos** e não substituem esta evidência.

### 9. Observabilidade, healthcheck, config flags, env isolation

- `observability` com request_id/correlation_id, métricas HTTP/jobs/DB, alertas
- `healthcheck` `/api/health/live` liveness, `/api/health/ready` readiness DB crítico, `/api/health` full
- `config_flags` negócio separado infra, secret masking, versionamento, rollback
- `environments` 4 envs isolados: development-local, homologation, production, preview-vercel
- `dependency_audits` 0 vuln, lockfileVersion 3, CI `.github/workflows/ci.yml`

### 10. Checklist final produção

- [ ] Homologação RAG beta 5 perfis concluída com evidências
- [ ] `ai_bot_config` is_beta_mode false, is_dev_mode false, active_mode com_ia, is_approved true
- [ ] noindex removido em produção (is_noindex false em seo_configs quando produção)
- [ ] Hospedagem 200 R$ teto dimensionada, operational_budgets alertas configurados
- [ ] Secrets produção trocados (NEXTAUTH_SECRET 32+, ENCRYPTION_KEY, ADMIN_BOOTSTRAP_TOKEN, DATABASE_URL senha forte)
- [ ] SMTP real configurado, integrations status configured, teste conexão OK
- [ ] CNPJ, logotipo, privacy_policies publicada aprovada, LGPD fluxo verificado
- [ ] Executor de backup real e artefato DB+todos os arquivos íntegro/autenticado/criptografado, custódia e retenção comprovadas, restore autorizado em ambiente isolado medido para RPO/RTO; jamais usar `is_restore_tested` legado como prova
- [ ] Observabilidade, healthcheck, config flags, env isolation verificados
- [ ] Dependencies audit 0 vuln, CI green, build 66 páginas OK, npm test 47 pass
- [ ] Autorização explícita por escrito para publicação produção (não automático)

## Comandos históricos de produção — NÃO EXECUTAR sem gate aprovado e autorização explícita

```bash
# Build produção
npm ci
npm run build
PORT=3000 BIND_HOST=0.0.0.0 NODE_ENV=production DATABASE_URL=... NEXTAUTH_SECRET=... node server.mjs

# Docker produção
docker compose -f docker-compose.beta.yaml --env-file .env.production up -d --build
docker compose -f docker-compose.beta.yaml logs -f app

# RAG com Ollama real
ollama pull qwen3:1.7b
ollama serve &
OLLAMA_ENABLED=true OLLAMA_HOST=http://localhost:11434 npm run dev
curl -X POST http://localhost:3000/api/ai/rag -d '{"rag_key":"publico","query":"Quais servicos?"}' | jq .ollama_used
# Esperado true quando Ollama real responde

# Healthcheck
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health/ready
curl -H "Cookie: admin_session=..." http://localhost:3000/api/health
```

## Não fazer automaticamente

- Não publicar em produção nem contratar serviços automaticamente até autorização explícita
- Não efetuar pagamentos, enviar campanhas/mensagens reais sem autorização específica
- Desenvolver e testar com sandbox/captura local

## Referências

- `docs/CONTROLE-IMPLEMENTACAO.md` — 222 requisitos rastreados
- `docs/homologacao-rag-beta.md` — roteiro homologação 5 perfis
- `README-INSTALACAO.md` — beta 1-clique + RAG + link público
- `docs/evidencias/F10-lote54-ollama-real-fallback-pglite-serial.md` — Ollama real+fallback validado
- `docs/evidencias/F10-lote55-beta-pglite-audit-observability-dist.md` — beta sem ERROR logs + dist zip

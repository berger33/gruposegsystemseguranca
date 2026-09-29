# QA-HOM-008 — demo local persistente, somente massa fictícia

**Data:** 2026-09-28. **Recortes:** `PLT-01`, `PLT-MIG-001`, `SEC-07`, `CLI-01`, `TENANT-SEG-001`. Não é aceite dos 222 IDs. Código: `scripts/local-demo.mjs`, `scripts/local-demo-seed.mjs`, `scripts/qa-local-demo-persistent.mjs`, `INICIAR-DEMO-LOCAL.bat`; interface de entrada TI individual e emissão de convite real em `/admin/clientes`. Guia: [demo local](../demo-local-persistente.md).

## O que foi exercitado

- `--init` explícito cria pasta exclusiva sob perfil do usuário, senha PG e chaves aleatórias fora do repositório, cluster PostgreSQL 17 **persistente** só em loopback, banco UTF-8, 98 migrações e marcador do demo. Inicializa **uma vez** três identidades de staff fictícias (TI, RH, Admin), duas empresas totalmente fictícias e um contrato fictício planejado, **nenhum cliente ativo pré-verificado** e nenhum grant implícito. Senhas dos staff são mostradas só no primeiro início. `--start` verifica marcador, UTF-8 e checksums 98/98, sem rodar migrations nem regenerar dados/chaves.
- Via HTTP real num cluster QA próprio: anônimo `/api/client/accounts` **401**; TI individual login **200**, endereço não sintético recusado **400 sem convite**, convite fictício **201** com SMTP não configurado, aceite **201**, login pendente **403**, fila TI **200**, aprovação manual simulada **200** (`emailConfirmed=false`), login cliente **200**, lista sem vínculo **200 vazia**, concessão específica para A **201**, lista somente A **200**, B invisível. Este callback foi **simulado em teste com pessoa fictícia**, não prova de identidade ou caixa postal de pessoa real.
- Mutação sintética em A, SIGINT controlado e reinício: marker, 3 staff, revisão, grant e mutação continuaram presentes. Segredo estável manteve sessão cliente após reinício (**200**), `--init` repetido foi recusado (**exit 1 sem reset**), credenciais não foram impressas novamente e lock foi liberado em parada normal. QA removeu exclusivamente o diretório temporário que criou; **o demo padrão do usuário nunca foi aberto aqui**.

## Comandos / resultados neste checkout

| ID / comando | Resultado |
|---|---|
| `QA-HOM-008`, `npm run test:demo-local:pg` | exit 0 em **execuções repetidas** após estabilizar o runner; fluxo completo e restart acima. Última execução recusa `config.json` legível por grupo/outros no POSIX (**exit 1** antes de iniciar PG), restaura permissões no próprio QA, depois reinicia; `QA-HOM-008_TEMP_CLEANED: true`. |
| `QA-HOM-008.GUARDS`, `npm test` | **155/155**, exit 0; inclusos negativos: URL de banco externa/local do operador, SMTP, flag desconhecida, pasta ausente e pasta pré-existente recusadas antes de criar estado. |
| `PLT-SMK-001`, `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–098 contínuas; exit 0. |
| `QA-HOM-008.BUILD`, `npm run typecheck`; `npm run build`; `npm ci --no-audit --no-fund` | exits 0; painel TI/convite compilado. CI remoto **ainda não medido nesta evidência**. |

Primeiro ensaio manual com `stop_process` encerrou o grupo à força e deixou **run.lock** no caminho QA, sem DB ativo; esse estado foi inspecionado e limpo somente no diretório QA. O primeiro SIGINT direto também deixou lock: `embedded-postgres` registrava um hook que chamava `process.exit(130)` antes do fechamento do runner. O runner passou a reter seus handlers e remover apenas os handlers de sinal adicionados pelo import da dependência; depois, SIGINT controlado retornou **exit 0 com `DEMO_LOCAL_DATA_PRESERVED` e lock removido**, e o QA automatizado repetiu isso no ciclo completo. Desligamento abrupto/queda de energia ainda exigem diagnóstico de lock e recuperação PostgreSQL, não um passe implícito.

## Limites / decisão

**NO-GO para dados reais e link ao cliente:** não foi executado no Windows do proprietário; não há serviço Windows, proteção ACL validada, backup/restauração operacional DB+arquivos, rotação/recuperação de segredos, políticas de segurança completas, MFA staff/Marcelo, teste remoto protegido ou UAT. Rodou com `node server.mjs --dev` local, não instalação de produção. Pasta persistente local e QA de restart não equivalem a disponibilidade nem backup. SMTP/Funnel não foram ligados, e integrações/IA/222 IDs permanecem em seus estados rastreados, sem promoção automática. Próxima fase: ensaio supervisionado Windows com dados somente fictícios e prova de backup/restauração isolada antes de qualquer dado real ou acesso público.

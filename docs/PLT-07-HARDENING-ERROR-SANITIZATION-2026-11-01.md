# PLT-07 — Sanitização de credenciais em erros de dependência (01/11/2026)

## Escopo e limite

Correção incremental na prova técnica de PLT-07 (`healthcheck/readiness` e degradação explícita). Não é implementação completa nem reauditoria do PLT-07; não altera a política de acesso, os endpoints, a coleta operacional ou os estados de disponibilidade. Não representa aceite humano, UAT ou autorização de produção.

## Defeito reproduzido

O healthcheck incluía `error_sanitized` nas respostas de dependências com falha. As regras anteriores removiam valores precedidos por `password=`, `token=` e `secret=`, mas não removiam a senha embutida em uma URI comum de conexão. Um erro sintético `postgres://svc:<segredo>@db.invalid/app?token=<segredo>` retornou a senha da URI em `/api/health/ready` (HTTP 503), embora o token da query fosse sanitizado.

## Correção aditiva

`sanitizeError` agora mascara credenciais no formato `scheme://usuario:senha@host` e valores de `password`, `token` ou `secret` em query string e pares chave/valor. A mensagem continua limitada a 1.000 caracteres. Permanecem preservados o status 503 quando o banco não está pronto, a distinção dos estados de dependência, o conteúdo diagnóstico não secreto e os gates e papéis existentes.

## Prova

- RED: `node --test tests/ux-pro-03-ti-healthcheck-ui.test.mjs` reproduziu a exposição do valor sintético da senha da URI.
- GREEN focal: **7/7**. Além da sanitização e da matriz RBAC/origin do health operacional e histórico, testa liveness sem consulta de dependências e readiness `200/ready=true/degraded` quando o banco está disponível mas fila, integrações e observabilidade estão degradadas; os quatro checks e o status são persistidos. O teto de histórico permanece em 200.
- Cenário browser/HTTP **PLT-07 1/1** em PostgreSQL 17 descartável + Chromium e `server.mjs --dev`: `/api/health/live` público; readiness consultada pela tela; anônimo 401, RH 403 e TI 200 no painel e no histórico; TI percorre a UI em 390px, RH fica bloqueado antes da montagem da ferramenta. Três capturas com `problems: []` e `sobraDocumentoPx: 0` em `docs/ux-pro-03-plt-07-healthcheck-evidencias/`.
- `npm test`: **1371/1371**, 172 arquivos no `test:unit`.
- `git diff --check`: limpo.

Todos os valores usados na prova são sintéticos e não são credenciais reais.

## Limites remanescentes

O gate PostgreSQL + Chromium percorreu readiness em base saudável; não simulou indisponibilidade real do banco no navegador. A degradação de fila/integrações/observabilidade é coberta por dependências sintéticas no focal unitário, não no gate HTTP. Também não validamos exaustivamente todas as variantes de URI/DSN ou payloads de erro de provedores. O painel continua evidência parcial. PLT-07 permanece `a_revalidar`, `aceite_humano=nao_registrado`, `reauditoria_integral=nao_executada`; produção permanece NO-GO.

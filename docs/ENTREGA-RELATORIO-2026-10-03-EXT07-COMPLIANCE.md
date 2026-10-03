# Relatório de entrega — EXT-07 Compliance corporativo — 2026-10-03

## Base e decisão
- PR #101: **MERGED**, `https://github.com/berger33/gruposegsystemseguranca/pull/101`.
- Merge commit descoberto: `efc74bacb7a23314db1d267d91438519dc342a8c`.
- Feature informada: `3d573f18293ed9bad810fa03e4654ddf1fbd4d30` (confirmada na API da PR).
- `HEAD`/`origin/main`/merge-base: `efc74bacb7a23314db1d267d91438519dc342a8c`; divergência `0/0`; árvore inicial limpa.
- Fonte canônica: `ext_compliance_documents`, endurecida pela 153; não foi criada tabela paralela de documentos.
- Fonte da tarefa: `ext_compliance_tasks`, específica de compliance. A inspeção não encontrou uma tarefa existente com escopo, privacidade, vínculo e idempotência compatíveis; CRM/RH/operação não foram misturados.

## Lacunas reproduzidas antes da implementação
A inspeção executável da base confirmou rota apenas legada `/api/ext/compliance-documents`, ausência de `/api/ext/compliance/*` e ausência de `/admin/compliance`; o componente em `admin/ti/ExtAdvancedClient.tsx` era órfão. O handler 086 aceitava responsável nominal, estado e metadados de arquivo do corpo, fazia auditoria tolerante, não tinha obrigação, tarefa, versionamento ou transação. O cluster operacional descartável não estava disponível no passo zero desta sessão; portanto não se declara um resultado HTTP/PG que não foi executado.

## Implementação
A migração exclusivamente aditiva `153-ext07-compliance-journey.sql` cria obrigação aplicável, endurece a tabela 086, preserva linhas antigas como `registro_legado`, cria tarefas específicas, eventos/idempotência e gatilhos de imutabilidade. A API exige sessão staff `admin|ti`, distingue 401/403, exige same-origin nas mutações, chave de idempotência, responsável staff ativo e datas coerentes. Avaliação usa data do servidor e `ON CONFLICT` para exatamente uma tarefa por documento/período/regra. Escrita de negócio, evento e `audit_log` ocorre na mesma transação; falha de auditoria retorna 503 com rollback.

A UI real é `/admin/compliance`, com carregamento, vazio, erro/retry, cadastro de obrigação e referência, avaliação temporal e indicação explícita de que referência não é arquivo. `ExtAdvancedClient.tsx` foi preservado. Rotas legadas continuam leitura autorizada com `items`; mutações autenticadas retornam 410.

## Fronteiras
Jornada exclusivamente interna; nenhum ator externo, portal, token ou integração regulatória foi inventado. `is_private` é imposto no banco para registros canônicos; listagens minimizam campos. Não há infraestrutura canônica de bytes: não se declara upload, checksum, malware scan, armazenamento verificado ou download. Aplicabilidade é declarada e rastreável, não parecer jurídico.

## Validação observada
- `npm ci`: sucesso, 82 pacotes, 0 vulnerabilidades.
- sintaxe API/gate: sucesso.
- `node scripts/qa-wave0-static.mjs`: **5/5**, migrações **001–153**.
- `npm run typecheck`: sucesso.
- teste focal EXT-07: **4/4**.
- `npm test`: **442/442**, 0 falhas, 0 skips.
- `git diff --check`: sucesso.
- `npm run build`: sucesso, **92 páginas**, incluindo `/admin/compliance`.- `npm run test:ext07-compliance:pg`: **4/4**, 0 fail/skip/todo, migrações **153/153**, cluster temporário limpo; este runner valida migração + TAP focal, mas ainda não executa HTTP real.

## Gates que não cobrem EXT-07
Estático, typecheck, unit, build, migrations e gates antigos EXT-01..06/CLI não substituem o gate dedicado EXT-07. Bateria pesada, aplicação em destino, aceite humano e homologação Windows não são declarados.

## Pendências
Executar o gate real com PostgreSQL 17, servidor HTTP, sessão staff e fixtures `.invalid`; validar replay/concorrência, rollback de auditoria e rota no navegador nesse ambiente. Nenhum aceite humano foi inventado.

# Fatia 02 — runbook e contrato de ambiente

**Data:** 04/11/2026. **Base:** `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. **Branch:** `arena/a5202d09-gruposegsystemseguranca`.
**Resultado:** implementada e validada localmente. Sem commit, push, PR, conexão SMTP, migração no destino ou deploy nesta fatia.

## O que foi corrigido

1. **Contrato de variáveis reais:** `SITE_ADMIN_SESSION_SECRET`, `EMPLOYEE_SESSION_SECRET`, `CLIENT_MFA_ENCRYPTION_KEY`, `MAIL_*`, `OLLAMA_BASE_URL`, banco, diretórios privados, proxy e flags de indexação, com consumidores conferidos no código. Nomes históricos são explicitamente diferenciados, não apresentados como aliases.
2. **Segredos separados:** mínimo de sessão staff/funcionário e chave MFA de exatamente 32 bytes base64url; comandos locais com tamanhos corretos e aviso para não registrar saídas. Nenhum segredo foi gerado/provisionado como credencial nesta entrega.
3. **SMTP:** `verify()` comprova conexão no instante, não entrega. Lead, autenticação do cliente e fila administrativa são caminhos diferentes. A fila permanece com `mailer: null`, a resolver na fatia 07.
4. **SEO:** duas variáveis obrigatórias, presentes em build e runtime; não basta flag do banco/bot. Rebuild, metatag, robots e sitemap devem ser conferidos, sem remover proteção do código.
5. **Instalação/banco:** migrador atual 001–183, última migração real, checksums, próxima livre 184 e evidência histórica separada do banco de destino. Cópia de ambiente sem sobrescrever arquivo existente; retirada de instrução automática de troca de branch. Compose existente sobe somente PostgreSQL.
6. **Carregamento de ambiente:** precedência do processo e de arquivos, chamada inicial sem `dev=true` e distinção entre `--dev` e seleção de arquivo. Teste real de `@next/env` em processo isolado, usando somente uma variável sintética e arquivos temporários.
7. **Gate:** 12 critérios explícitos e não marcados; backup real continua bloqueado, pré-requisitos PostgreSQL 17 registrados e autorização humana continua obrigatória.
8. **Health:** diferenças entre liveness, readiness/degradação e visão completa. Documentado sem falsa promessa de privacidade: no handler atual os aliases administrativos/operacionais exigem sessão/papel, mas `/api/health` genérico não recebe essa mesma restrição. Revisão de exposição fica para a fatia de segurança; não houve mudança de permissões.

## Arquivos desta fatia

- `docs/PRODUCAO-GATE.md`: runbook revisto contra runtime, sem comandos perigosos de liberação automática.
- `docs/APLICACAO-BANCO-DESTINO.md`: procedimento atualizado, preservando a seção detalhada do scheduler e os limites de QA.
- `.env.example`: entradas vazias para sessão e documentos do funcionário, flags públicas com indexação bloqueada e avisos corretos de SMTP; valores efetivos equivalentes aos defaults anteriores.
- `README.md`: aviso no topo apontando para o contrato revisto; histórico preservado.
- `tests/backup-gate-documentation.test.mjs`: seis novos cenários, sem alterar o teste de bloqueio de backup existente e sem adicionar arquivos à lista unitária.
- `docs/STATUS-VIGENTE.md` e plano de execução: registro da entrega e próxima fatia.

As alterações da fatia 01 e os arquivos da auditoria permanecem preservados no mesmo workspace. O índice dos 222 requisitos foi conferido novamente, sem nova alteração de classes/aceites nesta fatia.

## Resultados

| Verificação | Resultado |
|---|---|
| Focal `backup-gate-documentation` | **7/7**, sem conexão externa |
| `npm test` | **1.528/1.528**, zero falhas, zero skips |
| `npm run typecheck` | OK |
| `npm run build` | OK |
| `qa-wave0-static` | **5/5** |
| `npm run reaudit:sec` | **35/35** âncoras, 3 artefatos conferem |
| Inventário 222 `--check` | OK; 222 IDs, 12 a revalidar sem gate |
| Focal final runbook + package-artifacts + requisitos | **25/25** após atualização do ledger |
| `git diff --check` | OK |

Os testes conferem nomes e consumidores, exemplo sem segredos e sem ativação, duas condições SEO, migrador atual, Compose existente, checklist, MFA e precedência de ambiente. Não são prova de instalação em Windows, SMTP real, autorização de produção ou infraestrutura operacional.

## Pendências preservadas

Nenhum runtime, handler, rota, API, papel, permissão, integração, workflow ou migração foi alterado. Não foram configurados banco, provedor ou segredo reais. Backup/restore real, fila SMTP administrativa, homologação, instalação no destino e aceite humano permanecem pendentes. Atualizar documentação não fecha capacidades operacionais.

**Próxima fatia:** 03 — diagnóstico seguro da inicialização intermitente de licitações (EXT-03), reprodução e validação de estabilidade. **Produção: NO-GO.**

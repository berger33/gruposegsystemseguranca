# QA-HOM-009 — cópia fria e restauração isolada do demo sintético

**Data:** 2026-09-28. **Recortes:** `PLT-BAK-001`, `PLT-MIG-001`, `CLI-04`, `TENANT-SEG-001` apenas na instalação **sintética**, sem declaração de cobertura integral de arquivos dos 222 IDs. Guia: [demo local e limites](../demo-local-persistente.md).

## Implementação limitada

`scripts/demo-offline-snapshot.mjs` opera somente sobre a pasta dedicada de demo do perfil do usuário (ou caminho QA temporário com prefixo restrito). `--backup <destino novo>` exige demo/banco parado, captura `run.lock` exclusivo, recusa porta PG ocupada, PID de PostgreSQL ativo, symlinks/arquivos especiais e arquivos de topo desconhecidos; copia `config.json`, todos os arquivos **e diretórios vazios** de `pgdata` e `documents` para destino novo fora do repositório/demo. Um manifesto local enumera tamanhos e hashes SHA-256; `--verify` confere esses valores, mas **o manifesto acompanha os bytes e não é assinado**. `--restore-copy <origem> <destino novo>` verifica antes da escrita, não substitui o original, compara hashes no destino e sobe **somente o PostgreSQL copiado**, em outra porta loopback, para conferir marcador da instalação e 98 registros de migrações; encerra-o e deixa o clone separado. Não faz restore de DB ativo, não instala serviço, não promove clone nem atesta criptografia/imutabilidade/custódia externa.

## Testes executados (Linux, PostgreSQL temporário, massa fictícia)

| Caso | Resultado observado |
|---|---|
| `QA-HOM-009.LIVE`, `npm run test:demo-local:pg` | Cópia recusada enquanto o demo está aberto (lock exclusivo, destino não criado). |
| `QA-HOM-009.COPY`, mesmo comando | Após parada controlada, cópia + verificação de manifesto passaram; incluem diretórios vazios indispensáveis ao PostgreSQL. |
| `QA-HOM-009.RESTORE`, mesmo comando | Clone no diretório QA **novo**, PostgreSQL iniciou e conferiu marcador/98 checksums presentes; app original continuou parado; app iniciado sobre **clone** serviu `/api/client/accounts` com cliente A **200**, somente A, sem B; original reiniciou depois com escopo e mutação preservados; 3 diretórios QA criados exclusivamente pelo teste removidos no final. |
| `QA-HOM-009.GUARD`, `tests/demo-snapshot-guards.test.mjs` | Recusas antes de escrita para URL de banco do operador, SMTP, comando desconhecido e destino de restauração já existente. |

**Falhas iniciais registradas, não contadas como passe:** três execuções falharam no restore. A cópia original listava apenas arquivos e perdia diretórios PostgreSQL vazios (`pg_notify`), causando falha fatal de inicialização; após incluir diretórios no manifesto, na cópia e na conferência, o fluxo retornou exit 0. O subprocesso também aguardava `exit` antes de consumir a saída; alterado para `close` no teste. O primeiro erro deixou claro que arquivo íntegro em SHA **não prova base inicializável**. Logs temporários locais em `/tmp/seg-snap-qa009-*.log` não versionados. **Windows do proprietário não testado**; nenhum dado real nem serviço externo acessado.

## NO-GO e próximos gates

Esta cópia contém senha PG e chaves MFA/sessão **em texto claro** e manifesto **não autenticado**: quem alterar bytes e manifesto juntos pode forjar a conferência. Não há criptografia, armazenamento fora do domínio de falha certificado, WAL/PITR, janela de escrita para arquivos de todos os módulos, inventário real completo das famílias CLI v2/RH/OPS/finanças, dupla aprovação, RPO/RTO nem procedimento operacional de recuperação. Não afirmar `PLT-BAK-001` concluído, nem ativar `/api/admin/backups` (permanece 503). Teste Windows supervisionado, ACLs, custódia, inventário completo e política de backup/restauração real continuam pendentes **antes de dados reais ou link externo**. Nenhuma contratação, hospedagem, SMTP ou Funnel ocorreu.

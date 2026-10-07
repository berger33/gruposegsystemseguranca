# Ativação local — 07/10/2026

## Escopo e resultado
Ambiente demonstrativo local em http://127.0.0.1:3100, PostgreSQL 17 na porta loopback 55432. Esta evidência não representa aceite de Marcelo/Andreia nem homologação de todos os módulos.

- Backup anterior à ativação restaurado em banco separado: ledger 174, três identidades, zero funcionários. Arquivo e checksum permanecem fora do Git.
- Migrador oficial aplicou 175–177. Segunda execução confirmou ledger 001–177 e idempotência.
- Build Windows concluído com Webpack. Evitar passar `--env-file` ao processo Next: workers herdam esse argumento e falham. Carregar o arquivo com `process.loadEnvFile` antes de iniciar o processo filho.
- Funcionário fictício individual criado no banco demonstrativo, com vínculo e permissão de autoatendimento. RH mantém suas concessões existentes.
- Ensaio HTTP real com sessões individuais e PostgreSQL: 27 verificações aprovadas. Entrada, intervalo, retorno, saída, repetição idempotente, conflito, ajuste solicitado, aprovação, rejeição motivada, preservação dos comprovantes, auditoria e bloqueio de anônimo/papel indevido.
- Navegador local: funcionário vê Jornada, comprovantes e ambas as decisões; RH vê Ponto e ajustes e os respectivos registros.
- RAG: corrigida releitura da sessão dentro da transação auditada. Smoke HTTP isolado passou. Isso não constitui homologação de todas as respostas do modelo ou de todos os acervos privados.

## Limites explícitos
As coordenadas do ensaio são sintéticas. GPS real deve ser conferido pelo operador no navegador, em localhost ou HTTPS, permitindo localização e realizando uma marcação. Não há rastreamento contínuo.

A suíte Windows executou 865 testes: 862 passaram; três cenários de symlink foram bloqueados por EPERM do sistema operacional. Não foram desativadas as proteções nem inventado aceite. Os checks Linux do GitHub devem ser consultados no commit final da PR 185 antes do merge.

## Operação e evidências
Credenciais, configuração, dump, logs e evidências completas ficam fora do repositório, em pasta privada do operador. Nunca commitar `.env`, senhas ou coordenadas reais.

Após atualizar main, reiniciar somente o processo conhecido da aplicação, conservar o volume PostgreSQL e conferir novamente a jornada e as decisões persistidas. O agendador e as funcionalidades externas dependem de sua configuração aprovada. SMTP, acesso público e aceite humano não são implicitamente homologados por esta ativação local.

Para repetir o ensaio (gera novos registros fictícios), usar `scripts/qa-time-clock-local-http.mjs`, habilitando `QA_TIME_CLOCK_LOCAL=1`, apontando `QA_CREDENTIALS_FILE` e `QA_EVIDENCE_FILE` para arquivos privados. O script recusa banco/destino não demonstrativos.

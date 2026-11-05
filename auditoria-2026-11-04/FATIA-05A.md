# Fatia 05A — primeiro grupo de adoção do supervisor PostgreSQL

**Data:** 04/11/2026. **Base:** `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. **Branch:** `arena/a5202d09-gruposegsystemseguranca`.
**Resultado:** três runners adicionais migrados e validados em Linux/POSIX. **A fatia 05 inteira não está concluída.** Sem commit/push/PR/deploy nesta etapa.

## 1. Escopo e preservação

Runners adotados:

1. `scripts/qa-staff-auth-postgres.mjs` — autenticação/sessão staff.
2. `scripts/qa-cli-v2-postgres.mjs` — CLI v2 normal e modo de arquivos/objetos sintéticos.
3. `scripts/qa-ext02-third-parties-postgres.mjs` — jornada de terceiros com resumo TAP obrigatório.

Preservados: nomes dos comandos, flags e envs específicos, guardas contra banco do operador, migrações completas, testes e fixtures, mínimos de casos, proibição de skip no gate que já a exigia e tokens históricos de saída. Nenhum handler, página, API de negócio, permissão, schema ou dado persistente foi alterado.

Antes de modificar, os quatro comandos foram medidos sem supervisor, após `npm ci`. A primeira tentativa encontrou dependências ausentes no workspace; os resultados válidos abaixo são posteriores à instalação pelo lockfile, não reinterpretam erro de instalação como falha de negócio.

## 2. Implementação

- Supervisor é iniciado **depois** das guardas específicas e **antes** de importar embedded-postgres no worker. Sem biblioteca/hook de Postgres no pai.
- Em POSIX, sandbox e grupo de processos ficam sob custódia do supervisor. Worker usa o diretório fornecido e não apaga/declara limpeza antecipadamente.
- Flags e argumentos existentes continuam chegando ao worker. O modo `QA_CLI_V2_OBJECT_CONTRACT=1` e a recusa de diretório do operador continuam em vigor.
- Nova fase `migrate` separa o teto do migrador do teto da jornada.
- Este grupo usa **90s para migração** e **180s para testes**. Baselines de 6–21s e execuções sob carga de 18–42s justificam margem; não são limites para jornadas pesadas.
- Fases auxiliares mantidas: boot 30s, initialise 60s, start 30s, create 15s, stop 10s, done 5s. Total adicional do protocolo compartilhado passa a 420s com a fase migrate; o piloto anterior pode pular a fase, sem alterar seu teto individual de testes. Não houve aumento de timeout de teste já existente para esconder falha.
- `createLocalQaDatabase`, no helper do supervisor, cria apenas nomes `seg_qa_*`, no IPv4 127.0.0.1, usando Client com conexão/query/statement limitados a 5s, identificador escapado, erro ocioso registrado como falha e finally para fechar conexão. Não aceita host/URL configurável.
- Rejeição de stop não é silenciada no caminho supervisionado EXT-02. O caminho Windows anterior continua preservado, sem declarar hardening novo validado.
- Tokens `QA_CLI_V2_TEMP_CLEANED` e `QA_EXT02_PG_TEMP_CLEANED` são emitidos no pai somente se `result.cleaned` for verdadeiro; o supervisor também fornece seu token comum. Token de limpeza não transforma teste reprovado em sucesso.
- Workflow EXT-02 inclui o helper nos filtros e corrige o nome do step de migrações; comentários de staff/terceiros foram reconciliados para 001–183. CLI v2 continua coberto pelo baseline; autenticação staff continua com execução manual existente, cuja cobertura CI será tratada na fatia 06. Não foi alegado CI remoto verde.

## 3. Regressão acrescentada

Três cenários novos em `tests/qa-pg-supervisor.test.mjs`, agora **11 testes**, sem novo arquivo na lista unitária:

- Contrato de adoção dos três runners: ordem do wrapper/importação, fases, budgets, criação compartilhada, token de protocolo, limpeza e preservação de mínimo TAP/modo objetos.
- Guardas dos executáveis reais: nove recusas de URLs/opt-in remoto, mais recusa CLI de migração remota e de diretório de documentos do operador; nenhuma inicialização de worker e nenhuma URL sintética devolvida no erro.
- Criação local: nomes não QA/porta inválida recusados antes de conexão; listener TCP local que aceita conexão mas nunca conclui handshake comprova timeout real do Client, em ~5s, sem cluster real na suíte unitária.

O teste existente de timeout por fase também ganhou `migrate`. Os testes de falha de cluster real da fatia 04 foram reexecutados sem mudanças de contrato.

## 4. Resultados

| Comando | Antes da adoção | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:staff-auth:pg` | exit 0, 21,19s | **21/21**, 16,10s | **21/21**, 41,52s |
| `test:cli-v2:pg` | exit 0, 9,30s | **11/11**, 8,44s | **11/11**, 22,52s |
| `test:cli-v2:pg:objects` | exit 0, 6,29s | **1/1**, 5,68s | **1/1**, 18,18s |
| `test:ext02-third-parties:pg` | exit 0, 10,72s | **22/22**, 10,26s | **22/22**, 29,03s |

Todos os comandos acima terminaram exit 0, sem skip, com limpeza confirmada. O cenário 1/1 de objetos contém as asserções do contrato de bytes/arquivo dessa suíte; não equivale a toda cobertura de storage ou backup de produção.

**Carga:** dois consumidores CPU mantidos durante o ensaio e executor com até três comandos simultâneos. Npm test permaneceu rodando enquanto as jornadas foram escalonadas, sem inferir que todos os quatro gates estiveram simultâneos durante todo o período.

Outras verificações:

- `npm test`: **1.546/1.546**, zero falhas/skips, ~124s de parede sob a carga descrita.
- Piloto `test:tenant:pg`: **25/25**, ~35,18s, mesmo ensaio.
- Gate negativo real do supervisor: porta ocupada e cluster morto continuam produzindo exit 1 esperado e limpeza confirmada; comando de teste exit 0, ~8,93s sob carga e ~5,79s isolado.
- SIGTERM no executável real de cada novo runner depois do banco pronto: **143**, limpeza confirmada; ~0,90s staff, ~0,85s CLI, ~0,79s terceiros, desde o início do processo. Não se alegam testes de todas as posições possíveis de interrupção.
- Focal supervisor **11/11**.
- Focal final supervisor + package-artifacts + guarda de gerados + inventário: **36/36**, após atualizar ledger/plano.
- TypeScript/build: OK. Wave0 **5/5**. Mapa SEC **35/35** âncoras.
- Índice dos requisitos `--check`: OK; 222 IDs, 12 a revalidar sem gate; sem promoção de aceite/classes nesta etapa.
- `git diff --check`: OK.

Checagem final de processos e diretórios não encontrou servidores/clusters desses ensaios, consumidores CPU ou sandboxes `seg-qa-pg-supervised-*` remanescentes.

## 5. Placar de adoção e próximo grupo

**4/68 runners originais supervisionados em POSIX**: tenant (piloto), staff, CLI v2 e terceiros. **64 ainda não migrados.** O 69º arquivo com nome `qa-*-postgres.mjs` é a prova negativa do supervisor e fica fora desse denominador de jornadas.

A [matriz de adoção](ADOCAO-POSTGRES.csv) lista os 68, comandos npm encontrados e situação, sem transformar runner migrado em requisito aceito. Os nomes/provedores/capacidades de produção não são aprovados por essa contagem.

**Próximo grupo proposto, 05B:** PLT-01/06/09/12 (revisão de acesso, observabilidade, privacidade e incidentes), começando pelo inventário de particularidades e baseline. As jornadas longas, browser/Next, demo persistente e backup/restore permanecem separadas; não aplicar os budgets deste grupo em massa.

## 6. Limites preservados

- Windows mantém lifecycle anterior; precisa de implementação/ensaio compatível. Não usar grupos POSIX nessa plataforma.
- SIGKILL/OOM do supervisor, kernel/filesystem travado ou descendentes que criem outra sessão não são cobertos por estas provas; permanece a fronteira de contenção externa descrita na fatia 04.
- Limpeza não verificada é falha. Nenhuma remoção por nome de processo ou pasta alheia foi adicionada.
- Outros runners, N8, decisões de produção, executor de backup real, provedores, UAT e aceite humano continuam pendentes.

**Produção: NO-GO. A fatia 05 está parcialmente entregue, não encerrada.**

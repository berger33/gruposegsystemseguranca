# UX-PRO-03 — Catálogo histórico de backup

**Data:** 13/10/2026
**Base:** `main` em `87deca3ae5ea2b2a121150b96ed9e4833872016d` (após PR #201).
**Superfície:** console `/admin/ti`, opção existente **Catálogo de backups**. `TiConsole` já monta `BackupClient`; esta entrega não cria rota, botão de navegação ou permissão.

## Antes e depois

| Antes | Depois |
|---|---|
| Aviso importante sobre não verificação disputava atenção com os registros; jobs e restores apareciam em duas colunas de cartões densos, com texto técnico pequeno e valores de localização/checksum sempre expostos. | Limite operacional fica em aviso destacado; o resumo separa jobs, restores, políticas e registros com prazo declarado vencido. Cada grupo mostra contagem, estado vazio próprio e finalidade dos dados. |
| A consulta dependia de ação manual e um único texto de status misturava carregamento, sucesso e falha. | Ao abrir a opção, os três recursos de leitura existentes são consultados; atualizar é explícito. Carregamento, falha e vazio são estados distintos, e a falha deixa claro que nenhuma operação foi executada. |
| Status/flags históricos podiam ser lidos como prova operacional; detalhes técnicos ficavam no cartão principal. | O estado visível é sempre **Não verificado**. Status salvo, caminhos, checksum, datas e identificadores são apresentados como metadados declarados; localização, checksum e ID ficam recolhidos por padrão. |
| Layout inline e sem adaptação consistente para tema, foco e telas estreitas. | CSS modular com tokens do sistema, cartões responsivos, controles de pelo menos 44 px e foco de teclado visível; em tela estreita, métricas, cartões e detalhes fluem em uma coluna. |

## Contratos e limites preservados

- Mantidas as consultas `GET /api/admin/backups`, `GET /api/admin/backups/restores` e `GET /api/admin/backups/retention`, sem parâmetros ou mudanças de payload.
- A API continua exigindo mesma origem, sessão administrativa e papel `admin` ou `ti`; os registros de auditoria de leitura seguem no servidor.
- Nenhum POST/PATCH/DELETE foi criado. Esta interface não inicia backup/restore, não altera política de retenção e não certifica metadados antigos.
- A contagem de registros com prazo declarado vencido é apenas a contagem devolvida pela API para linhas históricas com status salvo `success` e prazo no passado. Não comprova existência, expiração ou remoção de artefato físico.
- Nenhuma alteração no executor, armazenamento, política de backup, migração, operação local ou site público.

## Validação

- `node --test tests/ux-pro-03-backup-catalog-ui.test.mjs` — 4/4 aprovados: montagem/role, endpoints e campos preservados, estados honestos (carregando, negado, falha e vazio) e responsividade/tema/foco.
- `npm run typecheck` — aprovado.
- `npm run build` — aprovado; compilação e geração das 105 páginas concluídas.
- `node scripts/ux-pro-00-inventory.mjs --check` — aprovado; 100 rotas reconciliadas com os inventários vigentes.
- `npm run test:unit` local no Windows — **908 aprovados, 3 falharam, 0 ignorados**. As três falhas são `EPERM` ao criar symlinks nos testes `qa-backup-coverage-inventory.test.mjs`, `qa-cli-v2-local-provider.test.mjs` e `qa-cli-v2-transfer.test.mjs`; esses casos não tocam os arquivos desta fatia. O host local não pode executar esses cenários com a configuração atual.
- O workflow obrigatório `QA baseline` executa `npm test` em `ubuntu-latest`; no commit `38f6eb71674326dd4127a0a1573ecb5e7f3d07fa`, o passo **Unit tests (no silent integration skip)** passou, assim como o restante do job. A validação remota usa o ambiente suportado pelos testes e não apaga a limitação da execução local Windows.
- `git diff --check` — aprovado.
- Revisão estática do CSS nos breakpoints 320, 390, 650, 768, 1000 e 1440 px; tema claro/escuro usa tokens `--ux-color-*`, e foco `:focus-visible` é visível. Não foi feita medição automática de contraste.
- Revisão de código confirma ordem de leitura sem controles customizados, nomes nativos dos botões/summary, foco visível e alvo principal mínimo de 44 px.
- Não houve sessão autenticada no navegador, screenshots comparáveis, passagem manual de teclado ou teste visual dos temas. Essas verificações ficam registradas como não realizadas, não como aprovação manual.
- WSL está instalado no host, mas a única distribuição disponível é `docker-desktop`, sem `bash`; não foi possível repetir a suíte em Linux local.

## Limitação operacional que continua explícita

O sistema ainda não fornece, por este console, backup ou restauração reais/verificados. Esta fatia melhora a leitura do catálogo existente e não fecha o gate operacional de backup/restore nem constitui aceite de produção.

## Próxima fatia UX-PRO-03

Reavaliar na `main` as notificações do console de TI, confirmar seu escopo e contratos atuais e melhorar apenas essa tela em uma PR pequena. Preservar envio, fila, retry, integrações e autorização; não indicar envio real sem provedor configurado e evidência do resultado. A fatia atual não deve ser mesclada enquanto checks obrigatórios estiverem pendentes ou vermelhos.

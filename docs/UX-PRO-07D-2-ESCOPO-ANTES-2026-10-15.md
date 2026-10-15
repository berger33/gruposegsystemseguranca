# UX-PRO-07D-2 — escrita de ciência de escala: escopo e baseline

## 1. Base efetivamente conferida

A sessão permanece na branch fixada `arena/59df462e-gruposegsystemseguranca`. A primeira conferência encontrou worktree limpo e `HEAD == origin/main == 85e1e075ef047018c9e882d87cb642bf27eb1aef`; #227 MERGED e #228 CLOSED. Nenhum stash ou commit da #228 foi reaplicado.

Durante a execução, nova consulta remota encontrou a #229 MERGED, merge `2eb5ca909b0491e9dd0d7f61722daa27c4a11e17`, presente em `origin/main`, e a #230 OPEN/CONFLICTING (leitura redundante da mesma rota). A correção local de leitura em preparação foi interrompida: não houve PR nem commit dela. Patch, gate e evidências foram separados fora do repositório em `/home/user/ux-pro-07-59df462e-suplementar-main-85e1e07`. Não fazem parte desta PR, não provam a nova fatia e não foram reaplicados.

O proprietário escolheu continuar na nova main. A mesma branch foi avançada por `git merge --ff-only origin/main`; `HEAD == origin/main == 2eb5ca9…`, worktree limpo, antes de acrescentar esta fatia. Nenhuma troca de branch. Relidos plano mestre, mapa fatiado e relatório da #229, particularmente `docs/UX-PRO-07D-1-RELATORIO-2026-10-15.md:141-149` (próxima subfatia sugerida), além de `AGENTS.md`, `README.md` e regras de preservação.

## 2. Pendência real encontrada no código da nova main

Somente `/admin/operacao`, seção Ciência da escala:

| ID | Antes (arquivo `src/app/admin/operacao/OperacaoWorkspace.tsx` na base `2eb5ca9`) |
| --- | --- |
| W1 | `:506-523`: nenhum estado de envio nem trava síncrona; botão `:1320-1322` permanece habilitado e pode enviar várias vezes. |
| W2 | `:510-522`: sucesso do POST e releitura são confundidos na apresentação; falha de GET fica silenciosa e a lista parece atual. |
| W3 | `:522-523`: GET por `opsRequest` aceita `acknowledgments || []`; corpo 2xx inválido apaga ciência conhecida e aparenta pendência. |
| W4 | `:506-523`: conclusão tardia da escrita ou da releitura pode atualizar mensagem/lista de outra seleção. A guarda da leitura já entregue na 07D-1 não protege esta função. |
| W5 | `:517-519`: erro de transporte não declara incerteza do resultado do envio; é preciso distinguir resposta perdida de ausência de efeito, sem reenvio automático. |
| W6 | `:522-523`: 403 na reconciliação é ignorado; ações e conteúdo parecem atuais mesmo com negativa. |

## 3. Contratos inventariados e preservados

- `POST /api/ops/schedule-acks`, JSON `{ version_id, employee_id }`, via `opsRequest` com os mesmos cabeçalhos e credenciais. Não existe `Idempotency-Key` nesse contrato: não inventar uma.
- `GET /api/ops/schedule-acks?version_id=<id>`, lista canônica `acknowledgments`.
- `duplicate_ack` 409 é a idempotência canônica: segunda decisão explícita não duplica registro e continua apresentada como tal (caso herdado).
- Página: `supervisor|marcelo|admin|ti` (AdminGate de UI). POST: servidor continua exigindo `admin|ti|rh`; menu não é autorização. Same-origin, validação de versão publicada/revisada e auditoria continuam no servidor `src/server/ops-api.mjs:1421-1452`, intacto.
- Nenhuma alteração em método, URL, query, payload, cabeçalho, idempotência, regra de negócio, permissão, migração, auditoria ou servidor.

## 4. Escopo pequeno autorizado

Estado de envio e guarda de duplo clique; estado separado para conferir ciências; erro honesto da reconciliação, GET inválido não vira vazio, retry somente GET; descarte de conclusão superada por outra seleção; resposta de POST perdida declarada como não confirmada, sem reenvio automático; negativa da reconciliação fecha os painéis dependentes por meio do estado de erro já existente.

Não reabre 07A, 07B-1/2, 07C-1/2 nem 07D-1. As 14 abas, leituras de outros grupos, legado avançado, datas e estilos compartilhados permanecem intactos. C11 continua fora de escopo, somente por ordem explícita do proprietário em item separado. Os achados transversais E5/E8/E9 da #229 não são corrigidos aqui.

## 5. Gate aditivo e baseline anterior à implementação

Novo runner `scripts/qa-ux-pro-07d2-postgres.mjs`: cluster PostgreSQL exclusivo/descartável, migrações reais, servidor HTTP e Chromium. Recusa banco fornecido pelo operador. Audita TAP e exige mínimo **27**; falhas, skip, todo, resumo ausente/incompleto ou total diferente de aprovações reprovam. Nenhum filtro reduz a suíte.

`tests/ux-ops-workspace.integration.test.mjs`: **19 testes herdados preservados byte a byte**, somente append de auxiliares e oito casos. Massa sintética criada pelas APIs reais. POST real e leitura real antes da injeção; barreiras, perda de resposta, 503, 403 e corpo inválido exclusivamente em `window.fetch` da página. Nenhum erro é injetado no servidor, banco, proxy ou auditoria.

Primeira execução contra a implementação intacta `2eb5ca9`: `docs/ux-pro-07-operacao-evidencias/antes-07d-2/gate.txt`: **20/27 pass, 7 fail, 0 skipped, 0 todo**, saída 1 e rejeição TAP explícita. Todos os 19 casos herdados passaram. O caso de GET atrasado passou nessa ordenação, porque B não tinha ciência registrada e a leitura errada de A não mudava seu badge visível.

O caso novo foi então fortalecido: B passa a ter ciência real registrada, a barreira segura somente o GET de A e B é lida por HTTP antes de liberar A; o teste exige que a ciência conhecida de B não desapareça. Nenhum caso/asserção herdado mudou. O gate final foi novamente executado contra **a implementação anterior intacta**, mediante cópia exata do arquivo da base e restauração da implementação local ao fim. Baseline comparável: `antes-07d-2/execucao-2/gate.txt`: **19/27 pass, 8 fail, 0 skipped, 0 todo**, saída 1 e rejeição TAP explícita. Todos os oito casos novos reprovam e todos os 19 herdados passam. Capturas são feitas antes de afirmar e estão nesses diretórios próprios; nada da #229 ou fornecedores foi sobrescrito.

Arquivos protegidos restaurados por `git checkout --` após o gate:
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

Esta fatia fecha somente o escopo de escrita/conferência acima, não conclui UX-PRO-07 nem a rota inteira.

Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu

As medições automatizadas não equivalem a auditoria WCAG completa

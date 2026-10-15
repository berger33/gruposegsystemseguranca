# UX-PRO-07D-2 — ciência de escala: relatório antes/depois

## 1. Recorte e base

Branch fixada: `arena/59df462e-gruposegsystemseguranca`. Base final: `2eb5ca909b0491e9dd0d7f61722daa27c4a11e17`, merge da #229 confirmado em `origin/main`. A alteração de base ocorrida durante a sessão, a interrupção do trabalho redundante de leitura e a decisão explícita do proprietário de continuar na nova main estão registradas em `docs/UX-PRO-07D-2-ESCOPO-ANTES-2026-10-15.md:3-13`. Nenhum stash, commit da #228 ou código da #230 foi reaplicado. #228 não foi reaberta; #230 não foi modificada.

**Uma rota e um escopo:** escrita de ciência de escala e sua conferência em `/admin/operacao`. Não reabre 07A, 07B-1/2, 07C-1/2 ou 07D-1. Legado avançado, datas e estilos compartilhados não mudam. C11 continua reservado a ordem explícita do proprietário em item separado.

## 2. Antes/depois, por `file:line`

Todas as linhas abaixo são de `src/app/admin/operacao/OperacaoWorkspace.tsx`, salvo indicação diferente. “Antes” refere-se à base `2eb5ca9`; “depois”, ao arquivo desta PR.

| ID | Antes | Depois | Prova aditiva |
| --- | --- | --- | --- |
| W1 — duplicidade no envio | `:506-523`, botão `:1320`: nenhum pending/trava | `:363-366`, `:539-565`, `:1343-1347`, `:1380`: ref síncrona antes do await e controles desabilitados; fases envio/conferência, inclusive aviso de envio em outra seleção | caso 20, contrato POST e um único envio, registro real único |
| W2 — releitura silenciosamente falha | `:522-523`: erro ignorado | `:511-536`, `:1348-1352`: resultado do POST separado da atualização da lista; faixa declara lista possivelmente desatualizada; repetição é somente GET, nunca POST; trava liberada em finally | caso 21, 503 após POST confirmado, retry GET, segundo clique explícito mantém `duplicate_ack` e um registro |
| W3 — corpo inválido vira ausência | `:523`: `acknowledgments || []` | `:512`, `:515-525`: reaproveita o leitor canônico entregue na 07D-1; corpo inválido mantém a lista conhecida com erro `invalid_ops_response`, sem inventar pendência | caso 22, ciência conhecida permanece visível |
| W4 — conclusão contamina seleção nova | `:506-523`: sem captura de seleção da escrita | `:532-535`, `:543-553`, `:514`: captura versão e geração de `detailRequest`, descarta mensagem/erro/releitura de seleção superada; POST já executado não é cancelado nem reaplicado | casos 23/24, POST ou GET de A atrasado não apagam ciência confirmada de B nem inserem mensagem de A |
| W5 — resposta perdida sem declaração de incerteza | `:517-519`: só descritor genérico | `:1393-1398`: não foi possível confirmar o registro; consulta antes de nova decisão, sem reenvio automático; diagnóstico canônico preservado | caso 25, POST real aplicado com resposta perdida exclusivamente no fetch da página; GET real confirma lista, um POST |
| W6 — negativa da conferência ignorada | `:522-523` | `:518-522`: 401/403 limpa coleções dependentes e aciona erro de detalhe já existente; seções usam o aviso herdado, sem ações nem badge fictício | caso 26 exercita 403; mesmo ramo para 401 (não há cenário de navegador 401 novo nesta fatia) |
| Superfície do envio | sem faixa pendente | `:1343-1347`: `UiState` existente, sem CSS global/local novo | caso 27, Enter com foco programático no botão; captura e transbordo ≤ 1 px em 320/390/768/1440, dia/noite |

Os 19 casos herdados, inclusive os dez da 07D-1, permanecem byte a byte em `tests/ux-ops-workspace.integration.test.mjs:1-1064`. Os casos novos começam em `:1066`; prova estrutural em `docs/ux-pro-07-operacao-evidencias/verificacoes-07d-2/escopo-e-aditividade.json` (prefixo de 58.477 bytes, SHA-256 `d8659945adf2e1ad233ebc8fd21a5e1eaceefd72c69374ce7e2a49a4e98cac75`). Não se editou, removeu ou relaxou nenhuma asserção herdada.

## 3. Contratos e funcionalidades preservados

- POST `/api/ops/schedule-acks`, JSON exato `{ version_id, employee_id }`; GET `/api/ops/schedule-acks?version_id=<id>`, chave `acknowledgments`. Snapshot da versão só impede uso tardio de outra seleção. Nenhum método/URL/payload/cabeçalho novo no POST.
- `opsRequest` intacto: credenciais same-origin, cache no-store, accept/content-type preservados. Não foi criada chave `Idempotency-Key`: o contrato vigente usa restrição canônica e `duplicate_ack` 409.
- Segunda ciência **deliberada**, depois da conferência, continua possível e não é apresentada como falha. O caso herdado 7 e o novo caso 21 comprovam a capacidade e a ausência de duplicação.
- Durante envio/conferência, a trava serializa os registros de ciência no workspace, inclusive se a seleção mudar; a seleção e o calendário continuam utilizáveis. Ao concluir, libera a trava. Nova decisão não é oferecida sobre uma lista cuja conferência falhou; retry GET ou nova leitura explícita do detalhe recuperam o estado.
- 14 abas, todos os destinos, painéis de leitura, modelos por posto/equipe/pessoa, calendário, ciência e histórico preservados. Resposta de seleção antiga não muda a atual.
- Papéis de página `supervisor|marcelo|admin|ti` intactos; API continua autoridade. POST continua restrito pelo servidor a `admin|ti|rh`, com same-origin e regra de versão publicada/revisada. Não se inferem permissões pelo menu.
- Nenhuma mudança de servidor, auditoria, migração, banco persistente, tenancy, transição, URL pública ou outra rota. O comportamento de auditoria preexistente não foi ampliado nem certificado por esta fatia.

## 4. Gate e comparação executada

Runner novo e independente `scripts/qa-ux-pro-07d2-postgres.mjs`: PostgreSQL exclusivo descartável, migrações vigentes, HTTP real e Chromium; recusa banco fornecido externamente e limpa cluster ao fim. Runner herdado `scripts/qa-ux-ops-postgres.mjs` permanece intacto. Workflow aditivo `.github/workflows/ux-pro-07d2-delivery.yml`.

Auditoria TAP exige **27 aprovações**, totais completos/consistentes, nenhum fail/skip/todo. Não permite filtro de testes. Também recusa diretivas skip/todo, `not ok` e resumo incompleto. Provas negativas do próprio auditor em `verificacoes-07d-2/auditor-tap.json`: aceita resumo válido e rejeita oito variantes inválidas (resumo ausente/incompleto, fail, skip, todo, abaixo do mínimo, diretiva skip, not ok).

Massa inteiramente sintética, criada pelas APIs reais (profissional, versão revisada, entrada e ciência). As escritas e as leituras de preparação são reais e são conferidas por HTTP. Falhas, atrasos e respostas perdidas são injetados **somente em `window.fetch` da página**. Nenhuma falha foi injetada no servidor, banco, proxy ou auditoria.

| Execução | Resultado | Evidência |
| --- | --- | --- |
| Baseline inicial, implementação anterior | 20/27, 7 falhas, 0 skip/todo | `antes-07d-2/gate.txt` |
| Baseline comparável após fortalecer o caso novo de GET atrasado | **19/27**, oito casos novos reprovam, 19 herdados passam, 0 skip/todo, saída 1 | `antes-07d-2/execucao-2/gate.txt` |
| Primeiro pós-correção, antes desse fortalecimento de teste | 27/27, 0 fail/skip/todo | `depois-07d-2/execucao-1/gate.txt` — suplementar, não substitui o par final |
| Final independente 1 (casos finais) | **27/27**, 0 fail/skip/todo, mínimo 27, saída 0, cluster limpo | `depois-07d-2/execucao-2/gate.txt` |
| Final independente 2 (casos finais) | **27/27**, 0 fail/skip/todo, mínimo 27, saída 0, cluster limpo | `depois-07d-2/execucao-3/gate.txt` |

Os logs versionados `gate.txt` preservam o conteúdo TAP, normalizando somente espaços finais de linha. Os brutos `gate.log` continuam locais (a regra herdada ignora `*.log`); hashes bruto/normalizado em `verificacoes-07d-2/logs.json`. Nenhuma evidência herdada foi editada.

## 5. Evidências e inventário

Diretórios exclusivos `antes-07d-2/` e `depois-07d-2/execucao-{1,2,3}/`; não sobrescrevem nenhum artefato 07D-1, 07C-1 ou 07C-2. Capturas anteriores às asserções demonstram a diferença, inclusive envio, erro de releitura, corpo inválido, resposta perdida, resposta superada e negativa. As capturas de envio dia/noite cobrem quatro larguras; o novo teste de Enter começa com foco programático no botão, **não** equivale a percurso completo de Tab. O percurso de Tab/setas da página continua coberto pelos casos herdados, sem reinterpretá-lo como prova integral.

CSVs regenerados **somente por `node scripts/ux-pro-00-inventory.mjs`**. Comparação estruturada com `2eb5ca9`: cabeçalhos e 101 linhas preservados; única linha alterada = **28 (`/admin/operacao`) em cada CSV**. Somente associação ao gate/workflow novo; os campos estáticos e capturas herdadas continuam intactos. Prova em `verificacoes-07d-2/escopo-e-aditividade.json`. Nenhum CSV foi editado à mão, e o gerador não foi alterado.

Limitação herdada do gerador: suas frases genéricas de ausência de captura noturna/estados em navegador não leem os estados e temas detalhados da evidência; não foram corrigidas globalmente nesta PR. Novas capturas desta escrita estão nos diretórios exclusivos, sem substituir o `resumo.json` de leitura da #229.

## 6. Bateria pré-PR

Executada sequencialmente, com logs resumidos em `verificacoes-07d-2/bateria-local.txt`:

| Comando | Resultado |
| --- | --- |
| `npm ci` | exit 0, 81 pacotes, 0 vulnerabilidades |
| `npm test` | **933/933**, 0 fail/skip/todo |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0, `/admin/operacao` gerada |
| `node scripts/qa-wave0-static.mjs` | **5/5**, migrações 001–180 contínuas |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK, 100 entradas |
| `node --test tests/ux-ops-vocabulary.test.mjs` | **8/8**, 0 fail/skip/todo |
| `npm run test:l06-delivery:pg` | **9/9**, saída 0, cluster limpo |
| `npm run test:l08-delivery:pg` | **51/51**, saída 0, cluster limpo |
| `npm run test:ext04-suppliers:pg` | **28/28**, saída 0, mínimo 28, cluster limpo |
| `npm run test:ux-ops:pg` (runner herdado intacto, execução adicional) | **27/27**, 0 fail/skip/todo, saída 0, cluster limpo; o mínimo herdado continua 19, o novo runner independente exige 27 |
| `node scripts/qa-ux-pro-07d2-postgres.mjs` | **27/27 × 2** independentes finais, mínimo 27, 0 fail/skip/todo |

Após **cada** etapa, inclusive build e cada gate Next.js, foram executados `git checkout -- next-env.d.ts tsconfig.json` e `sha256sum -c` com os hashes do relatório anterior. Os logs finais e `bateria-local.txt` registram `next-env.d.ts: OK` e `tsconfig.json: OK`.

- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## 7. Limitações e estado de entrega

- C11 e achados transversais da #229 permanecem fora do escopo: contraste noturno das abas/ações primárias compartilhadas (E8), rolagem interna de tabelas (E5), quebra de palavras (E9), datas/fuso (E3), `<main>` aninhado e legado avançado. Não se declara que a rota inteira ficou acessível ou pronta para aceite.
- O gate cobre os cenários listados, não todas as combinações de profissionais, papéis, status ou erros. O cenário novo de negativa exercita 403, não 401. As capturas usam `ti` e o servidor de desenvolvimento; indicador do Next.js e nomes/IDs sintéticos podem aparecer.
- A classificação 2xx do POST permanece a de `opsRequest` (não se acrescenta validação nova do schema da resposta do POST); a validação canônica nova é a do **GET de reconciliação**. Não se certifica comportamento de servidores divergentes do contrato vigente.
- Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu
- As medições automatizadas não equivalem a auditoria WCAG completa

**Esta fatia fecha somente o envio/conferência de ciência especificado acima e não conclui UX-PRO-07, 07D ou a rota inteira.** Não se alega aprovação humana nem conformidade WCAG integral. O estado remoto e a revisão técnica automatizada são publicados em comentário na PR; este relatório local não substitui os checks remotos. Nenhuma declaração de merge sem confirmar MERGED e presença em `origin/main`.

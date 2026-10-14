# UX-PRO-07B-2 — continuação pós-PR #224: trilha legível, formulário orientado e replay idempotente

**Data:** 14/10/2026  
**Base reconciliada:** `ce501a9c03ec42d03e3ed6ef5dcee18b356eee1d` (`origin/main`, PR #224 já mesclada)  
**Branch de trabalho:** `arena/c42c8bbc-gruposegsystemseguranca`  
**Estado deste documento:** registra a implementação e a validação local da continuação; não é fonte de verdade para o estado remoto da PR ou do merge. Esse estado deve ser confirmado no GitHub e na `origin/main`.

## 1. Reconciliação com a main

Antes de editar, o checkout local estava baseado em `a16ab71`, enquanto a `main` já continha a PR **#224**, “UX-PRO-07B-2: estados honestos de escrita em /admin/emergencial”. A PR #224 já havia entregue a máquina de estados das escritas, prevenção de duplo clique, validação de respostas, classificação de erros, fail-closed e um gate focal de 18 casos. Por isso, a implementação antiga não foi reapresentada como uma PR independente nem substituiu o código da #224: a branch fixa da sessão foi reconciliada com `ce501a9` e esta continuação foi construída sobre a implementação já mesclada.

O relatório da #224 registrou expressamente B16 (resumo legível da trilha) e B17 (ajuda e obrigatoriedade dos campos) como pendências. Esta continuação fecha essas duas lacunas da tela e acrescenta replay manual seguro da solicitação quando a resposta é ambígua. Não declara UX-PRO-07 integralmente concluída e não inicia 07C.

## 2. Escopo implementado

### B16 — trilha interna em linguagem operacional

- O detalhe continua vindo de `GET /api/ext/emergency/channels/:id`; a UI não inventa eventos nem infere prontidão a partir da lista.
- O JSON bruto deixou de ser a apresentação primária: a trilha resume situação atual, prontidão declarada, testes, responsáveis, datas, observações e eventos com rótulos em pt-BR.
- A resposta JSON original continua disponível em um `<details>` recolhido, preservando diagnóstico técnico sem dominar a leitura operacional.
- A interface declara explicitamente que o resumo representa registros internos declarados e não comprova entrega de fornecedor, disponibilidade externa ou acionamento de contato.
- Resposta de detalhe exige canal correspondente à seleção, arrays de testes/eventos e objeto de prontidão válido antes de ser exibida.

### B17 — ajuda e obrigatoriedade do formulário

- Os oito campos existentes (incluindo Tipo) têm rótulo associado, marcador visível “Obrigatório”, atributo HTML `required` e ajuda ligada por `aria-describedby`.
- A orientação distingue contato declarado de contato acionado e não promete integração externa.
- O contrato de criação não mudou: o gate confere método, URL, chave idempotente e corpo canônico; nenhum campo ou regra de domínio foi removido.

### Reconciliação de escrita ambígua

- A solicitação original (ação, URL, corpo e `Idempotency-Key`) é mantida quando o resultado é incerto por rede, 5xx/408/429 ou resposta 2xx inválida.
- A UI não repete automaticamente: oferece botão explícito para reenviar a mesma solicitação, com a mesma chave. Enquanto não houver confirmação, bloqueia novas escritas para o canal.
- O gate deixa a resposta de uma escrita real ser perdida depois do commit; o replay idempotente confirma o teste sem duplicar evento. Uma recusa HTTP conhecida (409) permanece distinta de resultado incerto.
- Transporte permanece em `src/lib/emergency-request.ts`; verbo, URL, payload, permissões, regras de servidor, auditoria e migrações não foram alterados.

## 3. Testes e evidências

O gate focal conserva os 18 casos herdados da #224 e acrescenta três casos (B16, B17 e resposta perdida/replay), elevando o mínimo obrigatório do runner para **21**. As asserções alteradas continuam verificando o mesmo contrato; as que antes dependiam de ler JSON cru agora conferem os rótulos operacionais ou o identificador técnico do canal, e os casos de resultado ambíguo verificam a nova reconciliação explícita. Nenhum caso foi removido ou marcado como opcional.

Evidências geradas pelo gate em [`docs/ux-pro-07-emergencial-evidencias/b2/`](ux-pro-07-emergencial-evidencias/b2/), com **25 entradas** no `resumo.json`, incluindo estados herdados, trilha dia/noite, formulário, envio pendente, resposta perdida e replay. Em todas as entradas: `problems: []`, overflow máximo do documento **0 px** e menor alvo medido **44 px**. Medições relevantes: contraste do resultado declarado **7,13:1** no tema claro e **10,13:1** no tema noite; faixa de envio no tema noite **6,06:1**. Essas medições são automatizadas e não equivalem a uma auditoria WCAG completa nem a aceite humano.

## 4. Validação executada nesta base

| Verificação | Resultado |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 TODO |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; `/admin/emergencial` gerada como rota estática |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 rotas; CSVs não alterados |
| `UX_EMERGENCY_EVIDENCE_DIR=docs/ux-pro-07-emergencial-evidencias/b2 npm run test:ux-emergency:pg` | **21/21**, 0 falhas, 0 pulados, 0 TODO; `QA_PG_TEMP_CLEANED: true` |
| `npm run test:ext15-emergency:pg` | exit 0 (gate herdado da rota) |
| `npm run test:l06-delivery:pg` | exit 0 |
| `npm run test:l08-delivery:pg` | **51/51**, exit 0; `QA_L08_PG_TEMP_CLEANED: true` |
| `git diff --check` | limpo |
| integridade de arquivos protegidos após gates/build | `next-env.d.ts` SHA-256 `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`; `tsconfig.json` SHA-256 `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` (restaurados) |

## 5. Limitações e fronteiras

- As capturas usam massa sintética e papel `admin`; os testes de servidor herdados continuam sendo a autoridade para RBAC. Não houve validação manual, homologação, revisão humana nem aceite humano.
- `problems` deriva somente das medições automatizadas registradas (overflow, menor alvo e contrastes instrumentados); não prova conformidade WCAG integral.
- A operação segue sendo interna e declarada; não houve chamada, mensagem, conexão de fornecedor ou mudança de comportamento do servidor.
- Esta entrega fecha somente os itens descritos acima em `/admin/emergencial`. Outras rotas e lacunas da UX-PRO-07 continuam sujeitas à reavaliação contra a `main` atual; não se declara o programa completo.
- `/admin/fornecedores` (07C) permanece fora do escopo desta PR.

## 6. Critério de confirmação remota

Os resultados acima são checks locais e não substituem os jobs da PR. O registro autoritativo do número da PR, checks remotos, estado `MERGED` e SHA do merge é o GitHub. Só declarar a continuação mesclada depois de confirmar que a PR está `MERGED` e que `origin/main` contém o commit; checks cancelados, pulados, em fila ou sem runner não contam como aprovação.

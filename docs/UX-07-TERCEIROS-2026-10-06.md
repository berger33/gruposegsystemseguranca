# UX-07 — Terceiros (EXT-02)

Data: 2026-10-06 · rota `/admin/terceiros` · servidor canônico `src/server/ext-third-party-api.mjs`.
SHA de base da main do GitHub: `de9ac7b28740049b39e3b91d18cd893cda52efc9`.
Aceite humano: **PENDENTE**; Marcelo e Andreia não participaram.

## ETAPA 0
A main foi atualizada com `git fetch origin main` e a base foi redescoberta. O clone era raso e recebeu `git fetch --unshallow origin main`. A PR #170 foi comparada após o fetch: seu diff contra a main atual não tem merge-base por ser uma linha histórica anterior; é a fatia de Frota já incorporada e não foi reproduzida. A branch remota da PR #167 continua existente e recomenda-se sua remoção pelo proprietário; não foi apagada.

## Diagnóstico
A tela anterior tinha classe utilitária solta, ausência de abas acessíveis, leituras acopladas, erro que podia parecer vazio, códigos sem explicação, campos sem rótulos e ausência externa não declarada. O contrato HTTP, as rotas, métodos, corpos, cabeçalho `Idempotency-Key` e prefixos não foram alterados.

## Levantamento de códigos
Foi feita busca no arquivo real por literais `error:`, incluindo respostas `deny` e ternários. Foram encontrados 49 códigos distintos. Não há `HttpError` ou exceção convertida em código nesta família; wrappers de leitura foram conferidos. Os aliases legados vivos retornam `legacy_route_retired` em mutação e por isso o código entra no vocabulário. Comparações de ENUM e operandos de `includes` não são tratados como erros. Não há handler morto removido.

## O que mudou
Foi criado vocabulário com passagem crua para valores desconhecidos, ENUMs e ausências nomeadas, transporte discriminado `{ok,data}|{ok,error}` com falha de rede e payload cru, abas reais com roving tabindex e estados independentes para lista, dossiê e autorização. Falha e NEGADO não são vazio; justificativas são campos de quem opera; a chave de idempotência permanece visível em erro; a fronteira externa é declarada em português.

## O que não mudou
Nenhum contrato de servidor, `server.mjs`, servidor canônico, migração 001–174 ou scheduler foi alterado. Não há simulação de login de terceiro nem SQL de negócio. O AdminGate permanece `marcelo`, `admin`, `ti`.

## Testes, gate e evidência
Incluídos vocabulário, workflow focal, script de gate e etapa `ux-07-terceiros` na captura. A evidência prevê desktop 1440x900 e mobile 390x844; banco limpo é apresentado como ausência honesta. O grant granular continua decidido pelo servidor e exige contrato/OS canônico.

## Legado e limitações
Os aliases legados permanecem vivos por compatibilidade e não são consumidos pela nova apresentação. Documentos, regras, avaliações e eventos são leituras do dossiê canônico; a evidência visual limpa não substitui os testes HTTP/Chromium com massa. Próxima fatia: a família seguinte da série UX-07.

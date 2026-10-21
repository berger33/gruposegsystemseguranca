# UX-PRO-04 — Pendências: resultado da fatia

Data: 21/10/2026
Rota: `/admin/pendencias`
Base: `main` em `b221d7a724c8fcfa2448ad014c7f12e58ab2b3f4`
Escopo e riscos registrados antes da implementação: [UX-PRO-04-PENDENCIAS-ESCOPO-ANTES-2026-10-21.md](UX-PRO-04-PENDENCIAS-ESCOPO-ANTES-2026-10-21.md)

## Antes

- A lista podia exibir “Nenhuma pendência” antes da resposta inicial da API.
- Falha de rede/HTTP na releitura não tinha estado próprio e podia ocultar a diferença entre ausência confirmada e indisponibilidade; não havia garantia visual clara de preservação dos últimos dados carregados.
- Situação e criticidade apareciam como enums internos. A hierarquia de prioridade e prazo não era evidente.
- O campo de justificativa de arquivamento dependia de placeholder em vez de rótulo associado.
- Fonte, datas, responsável e próxima ação não eram organizados de forma explícita. A API não fornece responsável nomeado nem campo canônico de próxima ação; a tela não inventa esses dados.

## Depois

- A tela diferencia carregamento, vazio confirmado, sucesso, releitura, falha inicial, falha com dados anteriores preservados e acesso negado.
- Falhas de leitura/releitura mantêm os últimos dados válidos, informam o horário da falha e oferecem repetição. Respostas malformadas não substituem a lista por estado vazio.
- A ordenação local prioriza não lidas, criticidade, prazo mais próximo e, em empate, criação mais recente. Nenhum parâmetro ou contrato de API foi alterado.
- Situação, criticidade e datas são apresentadas em linguagem e formato localizados. A tela evidencia origem, datas e próxima ação derivada do estado existente; não cria um responsável ou ação canônica inexistente no contrato.
- A justificativa possui rótulo associado e validação de tamanho. Estados de aviso, foco visível, contraste de tema e composição responsiva foram tratados nos estilos locais da rota.

## Preservação funcional e limites

Autenticação, `AdminGate`, permissões server-side (`pendency.sweep`), endpoints, métodos, payloads e cabeçalhos, identidade derivada da sessão, isolamento pessoal, idempotência, auditoria e transações foram preservados. A tela continua usando o fluxo local existente; não foram adicionados serviços de entrega externa.

Os fixtures da inspeção em navegador são sintéticos, interceptados no Playwright, e a sessão de staff foi simulada. Não houve gravação em registros do produto nem validação de uma sessão autenticada de produção. O teste PostgreSQL focal cobre separadamente as APIs, permissão, isolamento, idempotência, auditoria e transações. “Próxima ação” é uma orientação derivada do estado da pendência, não um campo persistido.

## Evidências e validação

Evidência automatizada: [pasta de capturas e resumo](evidencias/ux-pro-04-pendencias-2026-10-21/). Chromium/Playwright capturou a rota nos viewports 320×900, 390×844, 768×1024 e 1440×900, nos temas claro e escuro, além de carregamento, vazio confirmado, falha de releitura com preservação de dados e percurso automatizado de teclado. O relatório registra zero erros de navegador e ausência de overflow horizontal nas capturas dimensionais.

As imagens foram inspecionadas estaticamente pelo agente para verificar a composição visual. O percurso de teclado e o foco foram exercitados pelo navegador automatizado. Isso não equivale a revisão manual por pessoa, auditoria WCAG integral ou aceite do Marcelo/equipe; esses itens continuam sem comprovação.

Validações automatizadas concluídas nesta branch:

- teste focal `tests/ux-pro-04-pendencias-ui.test.mjs`: 5/5;
- `npm run typecheck`: aprovado;
- `npm test`: 988/988, sem falhas, skips ou TODOs;
- `npm run test:pendencies:pg`: aprovado, PostgreSQL descartável com migrações 001–180 e testes F15 17/17;
- `npm run build`: aprovado, 105 páginas estáticas geradas;
- `node scripts/qa-wave0-static.mjs`: 5/5;
- `node scripts/ux-pro-00-inventory.mjs --check`: 100 rotas e inventário/matriz reconciliados;
- `npm run qa:ux-pro-04-pendencias-browser`: 12 entradas de evidência, zero erros de navegador;
- `git diff --check`: aprovado.

O runner PostgreSQL descartável foi ajustado para inicializar explicitamente em UTF-8 no Windows, evitando falha ambiental ao aplicar migração com texto Unicode. Nenhum teste foi enfraquecido, ignorado ou marcado como aprovado sem execução.

## Arquivos de cobertura

O inventário e a matriz de cobertura registram as novas dimensões e evidências somente para `/admin/pendencias`. A contagem geral permanece em 100 rotas. A atualização não declara validação manual nem aceite humano.

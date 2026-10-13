# UX-PRO-02 — Cobertura do tema dia/noite

**Status:** implementação concluída nesta branch; revisão/merge e checks do PR pendentes.

## O que mudou

- O portal do funcionário (`/funcionario`) agora usa a mesma preferência de aparência já adotada pelas áreas administrativas, armazenada apenas no navegador (`segsystem.admin.appearance.v1`). O botão fica disponível no acesso, nos estados de carregamento/erro e no cabeçalho autenticado.
- A paleta escura cobre o fundo, cartões, jornada, campos, abas, estados de sucesso/erro, ações e foco visível do portal. A preferência continua independente da conta; nenhuma API, sessão, autorização ou dado foi alterado.
- Foram incluídas regras noturnas nas superfícies legadas de administração de clientes, pedidos do site e nas seis telas demonstrativas do portal do cliente: acesso, alertas, autocadastro, convites, permissões e solicitações.
- A compilação de desenvolvimento revelou um seletor de foco incompatível com a regra de seletor puro do CSS Modules em pedidos do site. O seletor foi corrigido e a rota voltou a responder em desenvolvimento; a mudança não afeta autorização nem comportamento funcional.
- A aparência do site público não foi alterada. As mudanças administrativas só entram em vigor quando a preferência de noite está ativa.
- Os testes do Chromium deste gate agora usam o canal Edge instalado no Windows. O PostgreSQL descartável do gate é iniciado em UTF-8, para as migrações com Unicode também funcionarem em máquinas Windows com locale ANSI.

## Verificação e contraste

O novo cenário de navegador alterna o tema usando a tecla Espaço, confere os valores de fundo calculados, verifica a preferência persistida após recarga, preserva a sessão e mede transbordo horizontal em 320, 390, 768 e 1440 px nos dois temas.

Relações de contraste calculadas pela fórmula WCAG para cores do portal em modo noite:

| Texto / fundo | Contraste |
| --- | ---: |
| `#e5edf7` / `#18263a` (texto principal) | 12,92:1 |
| `#adbdcf` / `#18263a` (texto secundário) | 7,96:1 |
| `#ffffff` / `#2e5f98` (ação principal) | 6,55:1 |
| `#95caff` / `#111e30` (foco) | 9,72:1 |
| `#a8dfbd` / `#233c34` (sucesso) | 7,90:1 |
| `#ffb4b0` / `#432c31` (erro) | 7,55:1 |
| `#f0cf8b` / `#423923` (aviso) | 7,61:1 |

Os cálculos cobrem estas combinações de tokens, não cada combinação de cor em todas as rotas, imagens, gráficos ou conteúdo dinâmico. Esta etapa não equivale a auditoria WCAG integral nem substitui a revisão visual das rotas administrativas por papel e dos estados reais.

## Validação executada

- `npm run typecheck` — aprovado.
- Cenário focal de tema do funcionário via `npm run test:ux-portal:pg` com filtro `tema dia/noite` — aprovado no Edge local, PostgreSQL temporário e migrações 001–180.
- Suite completa `npm run test:ux-portal:pg` — aprovada, 12/12 cenários; migrações 001–180 e banco temporário removido.
- `npm run build` — aprovado; compilou e gerou as 105 páginas estáticas/dinâmicas do app.
- Compilação local em desenvolvimento das rotas de pedidos, portal do cliente, permissões e funcionário — respondeu HTTP 200 após corrigir a regra CSS Modules. Respostas 401/503 de sessão/API anônima são esperadas sem identidade de demonstração.
- Checks do GitHub — pendentes após abertura da PR.

## Limitações e revisão restante

- A validação de navegador automatizada desta fatia cobre o portal do funcionário. As páginas administrativas legadas receberam as regras de estilo, mas ainda precisam de inspeção visual nas rotas representativas de Marcelo, RH e TI, inclusive gráficos/diálogos e dados longos.
- A preferência de tema segue por perfil de navegador/dispositivo, não por usuário; nenhum estado de preferência foi enviado ao servidor.
- Alterações exclusivamente visuais; sem mudança em contratos de API, regras de acesso, persistência de negócio ou recursos do site público.

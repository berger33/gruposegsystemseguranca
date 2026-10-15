# UX-PRO-08E — continuidade: contraste noturno do RAG e da aparência (15/10/2026)

## 1. Veredito da auditoria

A família `UX-PRO-08` estava integrada no código e nos gates de 08A–08D, mas **não estava completamente fechada**: o fechamento de 08D havia medido e registrado dois resíduos de produto, sem corrigi-los:

- **D5:** `RagWidget` combinava texto claro herdado com cartões/acento claros no tema `night`; o fechamento mediu `1,08:1`/`1,12:1` no rótulo da pergunta e `3,77:1` no envio RH.
- **D6:** a galeria de aparência mantinha cartões/controles claros com texto do tema noturno; o fechamento mediu `1,18:1` nos cartões e `1,95:1` nos controles secundários.

A continuidade desta sessão cobre **somente D5 e D6**, a menor unidade coesa que pode ser corrigida sem tocar em sessão, autorização, RAG, publicação, APIs, banco ou outros resíduos. A base conferida é `be87ab1e9120db7664fee0b309a68570b38e0680`, que contém a PR #248 mergeada com todos os checks reportados verdes.

Isto é uma correção automatizada de interface, **não é aceite humano, declaração WCAG integral ou liberação para homologação/produção**.

## 2. Implementação

### D5 — `RagWidget`

- A paleta de cada escopo continua a mesma durante o dia.
- O componente passou a expor papéis de cor (`--rag-bg`, `--rag-accent`, `--rag-input-*`, `--rag-answer-*`, estados de erro/sucesso e contraste do acento).
- O tema administrativo noturno substitui somente esses papéis no contêiner staff, usando os tokens de `admin-theme.css`.
- Rótulo, descrição, sugestões, campo, envio, falha, resposta, fontes e protocolo continuam com os mesmos testids, estados, conteúdo, endpoint e contrato FECH-01.
- O widget público e o assistente do cliente não recebem o tema administrativo por acidente: a regra continua limitada a `[data-admin-theme-scope="true"]`.

### D6 — `AppearanceGallery`

- Cartões de opção e opção selecionada agora usam `--ux-color-surface`/`--ux-color-brand-soft` no `night`.
- Controles de dispositivo, link de prévia, botão secundário, botão primário, selo e estado ativo recebem pares de cores adequados ao tema.
- O diálogo de aplicação e seu textarea também acompanham a superfície noturna.
- A miniatura e o `iframe` permanecem claros de propósito: representam a prévia do site público que está sendo comparado, não a moldura administrativa.
- O fluxo de leitura, comparação, confirmação, motivo, concessão `site.visual.write`, concorrência, `PUT` e auditoria não foi alterado.

## 3. Verificações

| Verificação | Resultado |
|---|---|
| `npm ci` | aprovado; 81 pacotes instalados, 0 vulnerabilidades reportadas |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado; 105 páginas geradas |
| testes focais (`ux-pro-08c-appearance` + `rag-widget-contract`) | **14/14**, 0 falhas/pulados/todo |
| `npm run test:ai-rag-widget:pg` | **26/26**, PostgreSQL 17 descartável + HTTP real + Chromium real + stub determinístico; 0 falhas/pulados/todo |
| `git diff --check` | aprovado |

O gate focal de assistentes passou novamente as medições de 320/390/768/1440, dia/noite e teclado. A partir desta continuidade, o gate exige `>= 4,5:1` para o rótulo e o envio noturnos dos assistentes staff e `>= 44px` para as sugestões, em vez de registrar D5 como pendência.

## 4. Preservações

- Nenhuma rota, API, payload, sessão, cookie, papel, grant, vínculo de conta, migração, dado, publicação ou auditoria foi alterada.
- O endpoint `/api/ai/answer`, as fontes por escopo e as negativas honestas permanecem iguais.
- A comparação/prévia de layouts e a publicação condicional da aparência permanecem iguais.
- As capturas e o `resumo.json` da 08D não foram sobrescritos nem apresentados como se fossem posteriores a esta correção; eles continuam sendo o registro histórico da medição que encontrou D5/D6.

## 5. Resíduos que permanecem fora desta continuidade

A UX-PRO-08 ainda não deve ser chamada de "sem resíduos":

- **D7:** largura inline dinâmica da barra de progresso do `Layout09` e foco do atalho público; exige decisão própria porque a largura é estado de etapa e a superfície é pública.
- **D8 / E6 / E8:** `<main>` aninhado, contraste da aba ativa compartilhada e outras transversais; não foram alterados sem autorização específica do proprietário.
- As demais prévias (`/layout-01`, `02`, `04..10`) seguem para a passagem integral prevista na UX-PRO-10A.
- Aceite humano, leitores de tela, zoom 200%, compatibilidade ampla, homologação, provedores reais e produção permanecem pendentes/NO-GO.

Próxima decisão recomendada: autorizar uma fatia específica para D7 ou seguir para a fila UX-PRO-09A, mantendo D8/E6/E8 separados e sem misturar resíduos transversais em outra entrega.

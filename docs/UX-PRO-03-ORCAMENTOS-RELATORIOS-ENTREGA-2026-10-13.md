# UX-PRO-03 — Orçamentos comerciais e relatórios

Data: 13/10/2026  
Base: `main` em `9486439` (após PR #199).  
Escopo desta fatia: orçamento técnico, orçamento de mão de obra e relatórios comerciais montados em `/admin/comercial`.

## Antes e depois

| Antes | Depois |
|---|---|
| Orçamentos apareciam em blocos com estilos inline, controles sem rótulo persistente, texto de esquema/API misturado à tarefa e tabelas muito densas. | Formulários identificam UUID da empresa, valores, unidade e categorias com rótulos. A explicação operacional vem primeiro; a composição detalhada fica no orçamento selecionado. Tabelas têm cabeçalho, legenda, rolagem própria e foco de teclado. |
| Cobertura JSON era digitada em campo curto e aparecia inline em cada linha da lista. | A entrada continua aceitando o mesmo JSON e o mesmo formato do endpoint; a cobertura só aparece em seção técnica expansível dentro do orçamento selecionado. |
| Relatórios tratavam qualquer resposta JSON como sucesso, inclusive respostas HTTP de erro; campos ausentes podiam interromper a tela em chamadas a `toFixed`. | As sete consultas agora verificam `response.ok`; falha, carregamento e ausência de dados são estados distintos. Valores ausentes aparecem como `—`, moeda e datas usam formatação `pt-BR`, e cenários e previsão são identificados como estimativa quando aplicável. |
| Tabelas e cores tinham estilos locais fixos, pouco adequados ao tema noite e ao celular. | As três telas usam um módulo compartilhado, tokens administrativos, grids responsivos e foco visível. Em viewport estreita, formulários e cartões ficam em uma coluna e tabelas mantêm rolagem horizontal contida. |

## Comportamento e contratos preservados

- Os orçamentos continuam carregando até 50 registros e usando os endpoints `GET`/`POST` de orçamento e item existentes.
- Payloads continuam com `company_id`, título, garantia/manutenção; o orçamento de mão de obra mantém `coverage` como JSON e os mesmos custos por função; o técnico mantém categoria, descrição, quantidade, unidade, custos/preço unitário e fornecedor.
- As dez categorias de orçamento técnico permanecem disponíveis. Nenhum estado de aprovação, transição de orçamento ou permissão foi criado ou alterado.
- Relatórios mantêm as sete consultas existentes: resumo, conversão, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline e previsão ponderada. A apresentação mantém a distinção de previsão estimada e cenários alternativos que não devem ser somados.
- A navegação/montagem em `ComercialWorkspace` continua inalterada. Não foram ativados componentes órfãos, alterados contratos do servidor, regras de negócio, dados, permissões ou migrações.

## Validação executada

- `node --test tests/ux-pro-03-commercial-estimates-ui.test.mjs` — 4/4 aprovados; verifica montagem, rotas/payloads, campos, categorias, estados e estilo responsivo.
- `npm run typecheck` — aprovado.
- `node scripts/ux-pro-00-inventory.mjs --check` — aprovado; inventário de 100 rotas sem alteração.
- `npm run build` — aprovado; 105 páginas geradas.
- `git diff --check` — aprovado.
- Revisão de CSS em 320/390/768/1440 px: breakpoints de 700 e 1000 px, grade de formulários, cartões e rolagem horizontal contida de tabelas. Dia/noite usa tokens administrativos para superfície/texto/borda/estados.
- Teclado: campos associados por `<label>`, controles nativos, `details/summary` nativo, botões com alvos de 44px e foco `:focus-visible`.

## Limitações

Não houve sessão autenticada em navegador nem capturas comparáveis reais de antes/depois em desktop/mobile, tampouco travessia manual por teclado. A revisão de viewport/tema/teclado desta entrega é de código e CSS; o teste focal não substitui aceitação visual/manual. Permanecem pendentes, nesta família UX-PRO-03, catálogo, SEO/retenção se comprovadamente montados, backup, integrações, notificações, privacidade e outras superfícies renderizadas. Componentes órfãos continuam sem navegação e aguardam decisão de produto antes de ativação.

## Próxima fatia

Continuar a UX-PRO-03 na primeira família renderizada ainda não coberta: **catálogo comercial e equipamentos** (confirmar a montagem e os comportamentos na `main` antes de editar). Depois seguir com as demais superfícies técnicas renderizadas; não tratar componentes órfãos como funcionalidades liberadas.

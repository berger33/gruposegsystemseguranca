# UX-03B — CRM, comercial e carteira

**Base:** `main` `0be3d465de7ea8d41b9af15748071323f8c7d26d`, com a PR #151 (UX-03A) integrada e os sete checks aprovados.
Migrações **001–174 preservadas**; esta fatia não cria, altera nem remove nenhuma migração.
Nenhuma rota de API, contrato de payload, papel do `AdminGate`, guarda de RBAC, chave de idempotência ou trilha de
auditoria foi modificada. O aceite de Marcelo e Andreia **continua pendente**.

## 1. Problema atacado

A UX-03A deixou o CRM legível, mas a UX-00/UX-03A registraram quatro lacunas que esta fatia resolve:

| Lacuna observada no código | Efeito para a pessoa | Correção desta fatia |
|---|---|---|
| `src/app/admin/crm/page.tsx` tinha `catch {}` na leitura do funil e `catch { setUnits([]) }` nas unidades | Falha de rede ou 403 aparecia como “funil vazio”; a pessoa concluía que não tinha oportunidades | Estados separados de carregando / vazio / erro / acesso negado, com motivo, código HTTP e botão de nova tentativa onde faz sentido |
| Detalhe da oportunidade era uma pilha de seis blocos soltos no fim da página, sem dizer qual registro estava aberto | Difícil saber o que se está editando; nenhum caminho de volta; foco perdido | Região “Oportunidade aberta: *título*” com fechamento explícito, retorno ao funil e foco movido para o título do detalhe |
| Filtros e formulários usavam rótulos implícitos, estilos inline e `prompt()`/`alert()` | Rótulo some ao digitar; `prompt` não tem rótulo, erro associado nem histórico; duplo clique reenviava | Rótulos persistentes com `for`/`id`, agrupamento por objetivo em `fieldset`, erros com `role="alert"`, estado de envio e bloqueio de reenvio |
| Códigos internos (`proposta_elaboracao`, `critica`, `prospect`) apareciam como texto final | Linguagem de banco na tarefa diária | Tradução de leitura em `src/lib/crm-labels.mjs`, **mantendo o valor canônico enviado à API** |
| `/admin/comercial` abria um segundo `<main>` com fundo próprio dentro do chrome administrativo | Dois cabeçalhos e duas larguras concorrentes | Passou a usar a moldura compartilhada, com as oito áreas apresentadas como etapas e a pergunta que cada uma responde |
| `/admin/carteira` era uma tela de uma linha por registro, sem estados e com paginação sem contexto | Sem hierarquia, sem indicação do que falta | Cartões com empresa, vínculo, etapa e próximo contato; aviso explícito de “sem próxima ação”; paginação que informa a faixa exibida |

## 2. O que foi entregue

### Peças compartilhadas (reutilizáveis nas próximas etapas)

- `src/lib/ux-feedback.mjs` — classifica a resposta real da API em `network`, `unauthorized`, `forbidden`,
  `not_found`, `conflict`, `gone`, `rate_limited`, `invalid` e `server`, com título, mensagem em português,
  se cabe nova tentativa e o código devolvido pelo servidor. **Não decide acesso**: só descreve o que o servidor disse.
- `src/lib/crm-labels.mjs` — rótulos de etapa, prioridade, tipo e situação de empresa e situação de linha de
  importação, mais formatação de data e moeda que nunca inventa valor (`não informado`, `não informada`).
- `src/components/ui/UiAsyncState.tsx` — um único componente para “carregando”, “vazio de verdade”, “falhou” e
  “acesso negado”, com `role="status"`/`role="alert"`, código HTTP visível e botão de nova tentativa.
- `src/components/ui/UiPanel.tsx`, `UiWorkspace.tsx`, `UiBadge.tsx` — superfície, cabeçalho de seção e marcador de
  estado. A cor nunca é o único sinal: o `UiBadge` carrega prefixo textual para leitor de tela.

### CRM (`/admin/crm`)

- Lista → detalhe → ação: cartões do funil e linhas da tabela abrem a mesma região de detalhe, que agora declara
  qual oportunidade está aberta, oferece “Fechar detalhe” e “Voltar ao funil” e leva o foco ao título.
- Cartão virou ficha com rótulo por campo (`Serviço`, `Valor estimado`, `Responsável`, `Unidade`, `Previsão`,
  `Próxima ação`, `Origem`, `Motivo da perda`), em vez de três linhas de `A: x | B: y`.
- Importação guiada em quatro etapas numeradas, com estado de cada etapa: conteúdo → prévia → decisão de duplicatas
  → confirmação e relatório. A confirmação automática continua impedida enquanto houver duplicata pendente, e a
  etapa 4 diz explicitamente que a confirmação sai da revisão quando existem duplicatas.
- Conversão de lead saiu de `prompt()`/`alert()` para um formulário com rótulos, dica, erro associado e aviso
  honesto quando o servidor responde que já havia conversão (dedup).
- Exportação de CSV, cadastro de empresa e criação de oportunidade têm estado de envio e mensagem de resultado
  em `aria-live`.

### Comercial (`/admin/comercial`) e carteira (`/admin/carteira`)

- Comercial: moldura compartilhada, as oito áreas rotuladas como etapas (1 a 5 do fluxo + três de apoio) e a
  pergunta que cada etapa responde. A tela de contrato explicita que só mostra o contrato mínimo criado pelo aceite
  e aponta para `/admin/contratos`.
- Carteira: filtro com descrição do recorte, cartões com vínculo de grupo/unidade, marcador de “Sem próxima ação”,
  paginação com a faixa exibida, resultados por tipo de ação em tabela e a frase “ganho não é dinheiro recebido”
  mantida no topo.

## 3. Preservação de comportamento

- Mesmas rotas (`/api/crm/companies`, `/api/crm/opportunities`, `/api/crm/imports/*`, `/api/crm/leads/:id/convert`,
  `/api/crm/portfolio`), mesmos verbos, mesmos corpos. O `request_key` de idempotência da carteira continua sendo um
  UUID por intenção de criação.
- `AdminGate allowedRoles` inalterado em todas as páginas tocadas (`comercial`, `marcelo`, `admin`, `ti`).
- Os valores enviados em `stage`, `priority` e `type` continuam sendo os canônicos. Há teste automatizado que lê
  `src/server/crm-api.mjs` e falha se a lista da interface divergir da lista aceita pelo servidor.
- Nenhuma asserção de negócio foi removida do gate L04. Os seletores do navegador foram atualizados onde a cópia
  mudou (ficha do cartão e colunas da tabela), passando a ler os mesmos fatos por `data-field`.

## 4. Validação executada

| Comando | Ambiente | Resultado |
|---|---|---|
| `npm ci` | sandbox do agente, Node 22.22.3 | 82 pacotes, 0 vulnerabilidades |
| `node scripts/qa-wave0-static.mjs` | estático | 5/5, migrações 001–174 contínuas |
| `npm run typecheck` | estático | sem erros |
| `npm test` | unidade, sem banco | **665/665**, 0 pulados (inclui os 13 novos de `tests/ux-feedback-and-labels.test.mjs`) |
| `node --test tests/admin-navigation.test.mjs` | unidade | 2/2 |
| `npm run build` | build Next | compilou; nenhuma rota perdida |
| `npm run test:admin-entry:pg` | HTTP real + PostgreSQL 17 descartável + Chromium | **13/13** |
| `npm run test:l04-delivery:pg` | HTTP real + PostgreSQL 17 descartável + Chromium | **20/20**, 0 pulados — cobre CRM-01..09, importação/dedup, carteira móvel em 390 px e ausência de rolagem horizontal |
| `npm run ux:evidence -- --stage=ux-03b` | Chromium real, sessão de staff real, PostgreSQL descartável | **6/6 capturas sem problema**, saída 0 — desktop (1440×900) e celular (390×844) de `/admin/crm`, `/admin/carteira` e `/admin/comercial` |

O gate L04 foi executado **duas vezes**: uma antes da mudança (20/20, linha de base) e outra depois (20/20). A
primeira execução intermediária falhou por um arquivo CSS ainda não gravado enquanto o servidor de desenvolvimento
do gate já estava compilando; o erro desapareceu na execução com a árvore completa e nenhuma asserção foi relaxada.

## 5. Evidência visual

`docs/ux-03b-evidencias/` contém as capturas geradas pelo script versionado `scripts/ux-evidence-capture.mjs`
(executado por `npm run ux:evidence`) e o arquivo `resumo.json` com, por rota e largura: o caminho da captura,
o primeiro elemento que recebeu foco por `Tab`, e a lista de problemas detectados (rolagem horizontal, erro de
console, resposta 5xx). Os dados são fictícios e o banco é descartado ao final.

Arquivos gerados nesta execução:

| Arquivo | Rota | Largura | Primeiro foco por `Tab` | Problemas |
|---|---|---|---|---|
| `desktop-crm.png` | `/admin/crm` | 1440×900 | link da marca, contorno visível | nenhum |
| `mobile-crm.png` | `/admin/crm` | 390×844 | link da marca, contorno visível | nenhum |
| `desktop-carteira.png` | `/admin/carteira` | 1440×900 | link da marca, contorno visível | nenhum |
| `mobile-carteira.png` | `/admin/carteira` | 390×844 | link da marca, contorno visível | nenhum |
| `desktop-comercial.png` | `/admin/comercial` | 1440×900 | link da marca, contorno visível | nenhum |
| `mobile-comercial.png` | `/admin/comercial` | 390×844 | link da marca, contorno visível | nenhum |

### Regressão encontrada e corrigida pela própria evidência

A primeira execução completa do script reprovou `/admin/crm` em 390 px com
`rolagem horizontal do documento: 399 > 390`. O script foi então ensinado a **nomear o elemento culpado**, e ele
apontou `input#crm-csv-file`: campos de arquivo têm largura intrínseca grande (botão nativo + nome do arquivo) e
`max-width: 100%` não basta quando o item flex é dimensionado pelo conteúdo. Correção aplicada em
`src/components/ui/UiWorkspace.module.css` (`input[type='file'] { width: 100% }`) e em
`CrmWorkspace.module.css` (`.importControls > * { flex: 1 1 240px; min-width: 0 }`). A execução seguinte passou
nas seis capturas. O gate L04 não pegava esse caso porque mede rolagem horizontal de `/admin/crm` na largura de
desktop; a verificação em 390 px era feita apenas em `/admin/carteira`.

## 6. Limites honestos desta fatia

- Não há homologação humana. Marcelo e Andreia não participaram e não foram consultados.
- A captura automatizada verifica foco inicial, ausência de rolagem horizontal, erro de console e 5xx.
  **Não** substitui auditoria WCAG 2.2 AA completa, teste com leitor de tela nem teste de usabilidade.
- Os componentes internos do detalhe (`OpportunitySummary`, `OpportunityTasks`, `OpportunityInteractions`,
  `OpportunityVisits`, `OpportunityNotes`, `CadenceClient`) e os clientes reaproveitados em `/admin/comercial`
  ainda usam estilos inline próprios. Eles já tratam erro, mas a padronização visual deles fica para a UX-07.
- `UnitManager` e `ContactManager` continuam com a aparência anterior; foram mantidos intactos para não arriscar os
  cenários CRM-01/CRM-02 do gate nesta fatia.
- **O conteúdo interno de `/admin/comercial` continua com linguagem de desenvolvedor.** A captura
  `desktop-comercial.png` mostra isto sem maquiagem: a moldura, as etapas e a navegação estão arrumadas, mas o
  cliente legado da etapa 1 ainda exibe títulos como “Vistorias — CRM-13 (checklist por serviço…)”, um parágrafo
  que descreve tabelas e colunas do banco, e campos identificados só por texto de exemplo
  (`company_id UUID (crm_companies)`). Isso **não** foi escondido nesta fatia: reescrever esses oito clientes é
  trabalho da UX-07, e escondê-los com cosmética seria transformar protótipo em “pronto”, o que o plano proíbe.
- `src/app/admin/crm/OpportunitySummary.tsx:95` ainda tem `catch { setUnits([]) }`: se a consulta de unidades
  falhar, a lista aparece vazia sem dizer por quê. Esse componente não foi tocado nesta fatia; o conserto está
  listado para a UX-07.
- A captura registra, em campo separado (`externalBlocked`), que `fonts.googleapis.com` não resolve no sandbox do
  agente. É limitação de rede do ambiente de captura, **não** defeito da página; as fontes caem para a pilha local
  do sistema nas imagens.
- A aplicação persistente do operador na porta 3100 **não** foi atualizada nem testada por este agente; o Arena não
  tem acesso àquela máquina, ao Docker nem ao Ollama do operador.
- SMTP e hospedagem pública permanecem fora do escopo.

## 7. Próxima fatia

UX-04 — RH da Andreia: tarefas, navegação e informação por permissão, tratando a diferença observada na UX-00 entre
papel visível no menu e grant efetivo na API, sem ampliar acesso a dados pessoais.

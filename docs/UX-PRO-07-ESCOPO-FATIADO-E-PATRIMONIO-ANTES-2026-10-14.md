# UX-PRO-07 — escopo fatiado e medição anterior da primeira fatia

**Data:** 14/10/2026

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate ou CSV foi alterado para produzi-lo.

**Primeira fatia proposta:** UX-PRO-07A — leitura de patrimônio e almoxarifado em `/admin/patrimonio`.

## 1. Base realmente conferida

A conferência foi feita no checkout da sessão antes de qualquer edição de tela:

- branch de trabalho: `arena/7c84d7be-gruposegsystemseguranca`;
- `HEAD` local e `origin/main`: `ad8c6b4127850a3ee30f657ce28ff504d1ccd52b` (sem divergência);
- árvore de trabalho: limpa;
- PRs abertas: nenhuma;
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

Os nomes sem data citados na solicitação (`docs/UX-PRO-00-INVENTARIO-ROTAS.csv` e `docs/UX-PRO-00-MATRIZ-UX.csv`) não existem neste SHA. O próprio gerador declara como saídas vigentes:

- `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`;
- `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`.

`node scripts/ux-pro-00-inventory.mjs --check` terminou com `OK`: 100 entradas, 56 rotas com gate detectado e 22 com captura visual. Esta é contagem estática; não equivale a passagem visual, teste de estados ou aceite humano.

Foram lidos integralmente, antes desta definição: o plano mestre, `AGENTS.md`, `README.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`, a auditoria de rotas de 08/10 e o fechamento de desenvolvimento de 07/10.

## 2. Mapa da UX-PRO-07 e ordem proposta de fatias

A seção UX-PRO-07 cita capacidades, não uma lista literal de URLs. Cruzando-a com as 100 entradas vigentes, o recorte administrativo é o abaixo. “Documentos/obrigações” está dentro de `/admin/compliance` (abas e APIs de obrigações e referências documentais); não há rota administrativa autônoma `/admin/documentos` ou `/admin/obrigacoes` neste SHA.

| Ordem proposta | Rota(s) | Medição estática anterior | Gate/captura reconhecidos pelo inventário | Decisão de recorte |
| --- | --- | --- | --- | --- |
| 07A | `/admin/patrimonio` | carregando/vazio; erro e teclado não reconhecidos | sem gate; sem captura | **Primeira fatia:** jornada somente de leitura das seis abas. É a maior lacuna operacional isolável sem tocar escrita. |
| 07B | `/admin/emergencial` | somente vazio; sem carregando/erro/teclado | sem gate; sem captura | Fatia própria porque contém mutações e transições canônicas EXT-15; não misturar com patrimônio. |
| 07C | `/admin/fornecedores` | carregando/vazio; erro não reconhecido | `ext04-delivery.yml`, `ux-supplier-delivery.yml`; 1440/390 | Corrigir somente lacunas demonstradas; completar 320/768/noite/teclado/estados. |
| 07D | `/admin/operacao` | carregando/erro/vazio; marcador de teclado no código | `ux-ops-delivery.yml`; sem captura reconhecida | Preservar a reescrita UX-07 existente; separar qualquer tratamento do legado avançado e produzir evidência atual. |
| 07E | `/admin/financeiro` | carregando/erro/vazio | `ux-finance-delivery.yml`; 1440/390 | Uma rota extensa; auditar e fatiar internamente por grupo FIN se houver defeito, sem reescrita global. |
| 07F | `/admin/frota` | carregando/erro/vazio | `ux-fleet-delivery.yml`; 1440/390 | Uma PR própria. |
| 07G | `/admin/terceiros` | carregando/erro/vazio | `ext02-delivery.yml`, `ux-third-party-delivery.yml`; 1440/390 | Uma PR própria. |
| 07H | `/admin/licitacoes` | carregando/erro/vazio | `ext03-delivery.yml`, `ux-bidding-delivery.yml`; 1440/390 | Uma PR própria. |
| 07I | `/admin/qualidade` | carregando/erro/vazio | `ext05-delivery.yml`, `ux-quality-delivery.yml`; 1440/390 | Uma PR própria. |
| 07J | `/admin/satisfacao` | carregando/erro/vazio | `ext06-delivery.yml`, `ux-satisfaction-delivery.yml`; 1440/390 | Uma PR própria. |
| 07K | `/admin/compliance` | carregando/erro/vazio | `ext07-delivery.yml`, `ux-compliance-delivery.yml`; 1440/390 | Obrigações e referências documentais permanecem juntas, pois compartilham a mesma jornada e contrato canônico. |
| 07L | `/admin/continuidade` | carregando/erro/vazio | `ux-continuity-delivery.yml`, `ux-continuity-client-delivery.yml`; 1440/390 | Uma PR administrativa; não misturar com a rota do portal do cliente. |
| 07M | `/admin/contratos`, `/admin/contratos/[id]` | carregando/erro/vazio; 320/390/768/1440 e primeiro foco | `ux-contract-delivery.yml` | **Auditoria de preservação primeiro.** As duas rotas acabaram de ser tratadas na UX-PRO-06; não reimplementar. Só abrir mudança se uma lacuna UX-PRO-07 for reproduzida. |

As rotas `/cliente/app/continuidade`, `/cliente/app/contratos`, `/cliente/app/documentos`, `/cliente/app/satisfacao`, `/cliente/app/solicitacoes`, `/cliente/contratos` e `/cliente/documentos` aparecem na busca por termos, mas pertencem ao portal autenticado já separado pelo plano. Não entram na primeira sequência administrativa e não serão alteradas por consequência.

A ordem após 07A é provisória e deve ser reconferida contra a `main` antes de cada sessão. Cada linha acima continua sendo uma PR pequena; rotas extensas podem ser subdivididas, nunca agrupadas para ganhar velocidade.

## 3. Medição ANTES — UX-PRO-07A `/admin/patrimonio`

### 3.1 Células vigentes do inventário

A rota está na linha 29 (incluindo cabeçalho) dos dois CSVs vigentes.

| Célula | Valor anterior confirmado |
| --- | --- |
| `papeis_declarados` / menu | `supervisor|marcelo|admin|ti` |
| guarda | `AdminGate` de UI; autorização continua na API |
| arquivos locais | 2 |
| componentes compartilhados | `UiTableScroll|UiTaskWorkspace` |
| tabelas | 6 |
| carregando / erro / vazio | `sim / nao / sim` |
| marcador de teclado | `nao` |
| gates automatizados detectados | vazio |
| capturas / primeiro foco | vazio / `nao` |
| classe de evidência | `codigo` |
| lacuna da matriz | sem gate detectado; sem captura; noite sem captura; percurso de teclado não verificado; estados não exercitados em navegador; validação manual e aceite humano não registrados |

Limitação do detector: há texto visual `Erro:` em `PatrimonioWorkspace.tsx:163`, mas não há estado semântico `UiState`, repetição ou evidência de navegador; por isso a célula `estados_erro=nao` é coerente com o critério estático atual. O gate L06 alcança a rota indiretamente, mas não está associado a ela pelo mapeamento reproduzível do inventário.

### 3.2 Comportamento anterior observado no código

| ID | Medição anterior | Evidência file:line no SHA-base |
| --- | --- | --- |
| A1 | O estado inicial é `loading=false` e todas as coleções começam vazias. Antes de o `useEffect` iniciar a consulta, a tela pode apresentar “Nenhum produto” como se a leitura já tivesse terminado. | `src/app/admin/patrimonio/PatrimonioWorkspace.tsx:73-83`, `:162-171` |
| A2 | Uma única variável `loading` e um único `error` representam seis recursos diferentes. Ao trocar de aba, o painel some durante a leitura; uma resposta atrasada de aba anterior também compartilha o mesmo estado global. | `PatrimonioWorkspace.tsx:72-124`, `:162-165` |
| A3 | Falha inicial mostra `Erro: HTTP n` em uma `div`, sem causa orientada à tarefa, sem distinção de autenticação/negativa/transitório e sem “Tentar novamente”. | `PatrimonioWorkspace.tsx:86-124`, `:163` |
| A4 | Os arrays lidos não são apagados no `catch`, mas qualquer `error` impede todos os painéis (`!error`). Portanto a falha de releitura esconde o dado anterior e não informa hora da última leitura. | `PatrimonioWorkspace.tsx:73-80`, `:86-124`, `:165`, `:205`, `:245`, `:285`, `:331`, `:369` |
| A5 | Os seis vazios dizem apenas que não há registro. Não declaram que a consulta concluiu, a causa possível nem o próximo passo seguro. | `PatrimonioWorkspace.tsx:171`, `:211`, `:251`, `:291`, `:337`, `:378` |
| A6 | As abas são botões visuais sem `tablist`, `tab`, `tabpanel`, `aria-selected`, roving tabindex ou setas/Home/End. | `PatrimonioWorkspace.tsx:138-159` |
| A7 | Cores locais fixas (`text-gray-*`, `bg-white`, `bg-gray-*`, `text-red-*`, `border-blue-*`) cobrem título, abas, erro e seis tabelas; o tema noturno não tem captura nem medição de contraste. | `PatrimonioWorkspace.tsx:131-415` |
| A8 | O gate herdado comprova dados e troca por clique, mas não exercita carregando, vazio, erro, repetição, dado preservado, tema, responsividade ou teclado. | `tests/l06-delivery.integration.test.mjs:1558-1598`, `:1915-1942` |

Não foi feita validação manual nem revisão humana. As constatações acima vêm de código, CSV reproduzível e execução automatizada.

### 3.3 Gate anterior realmente executado

Depois de `npm ci`, foi executado na base intacta:

```text
npm run test:l06-delivery:pg
L06_DELIVERY_TEST_EXIT: 0
9 testes; 9 passaram; 0 falharam; 0 pulados
```

O gate usou PostgreSQL embutido descartável, servidor HTTP real e Chromium. Os casos 7 e 8 alcançaram `/admin/patrimonio`; as asserções existentes de título, SKU e navegação por clique passaram. Nenhuma asserção existente foi editada. Ao final, `next-env.d.ts` e `tsconfig.json` foram restaurados e os dois SHA-256 permaneceram iguais ao baseline.

O inventário também passou em modo `--check`. Não foi executada bateria focal nova porque ela ainda não existe neste ponto anterior à implementação.

## 4. Primeira fatia pequena e isolada — UX-PRO-07A

### Incluído

Apenas `src/app/admin/patrimonio/PatrimonioWorkspace.tsx` e apresentação local/compartilhada estritamente necessária para a **leitura** de:

1. produtos e estoque (`GET /api/ast/products`);
2. reservas (`GET /api/ast/reservations`);
3. ativos serializados (`GET /api/ast/serialized-assets`);
4. ordens de serviço (`GET /api/ast/service-orders`);
5. inventários físicos (`GET /api/ast/inventories`);
6. requisições internas (`GET /api/ast/requisitions`).

A entrega deve:

- iniciar cada aba como “ainda não lida”, depois mostrar carregamento específico sem spinner genérico;
- distinguir vazio concluído, falha inicial, acesso negado/autenticação e sucesso;
- oferecer repetição somente quando a classificação permitir;
- durante releitura, manter o conteúdo já lido visível e marcá-lo como em atualização;
- se a releitura transitória falhar, preservar o último dado, mostrar faixa `role="alert"`, causa real, hora local da última leitura concluída e “Tentar novamente”;
- em negativa/autenticação após sucesso, falhar fechado e não mascarar a perda de acesso com dado preservado;
- implementar semântica e percurso de teclado das abas (setas, Home/End e foco visível), sem remover a operação por clique;
- substituir cores locais incompatíveis por tokens semânticos e medir dia/noite;
- manter a rolagem horizontal contida nas tabelas e todas as colunas/ações alcançáveis em 320, 390, 768 e 1440 CSS px.

Não há ação principal de escrita nessa superfície atual; portanto a regra “só habilitar com dado lido e válido” é não aplicável nesta fatia. Os controles de troca/repetição não inventarão escrita.

### Fora do escopo

- qualquer `POST`, `PATCH`, payload, endpoint, migração, estado de domínio ou regra de estoque/manutenção;
- mudança de `AdminGate`, papéis, grants, sessão ou autorização da API;
- `/admin/operacao` ou qualquer outra rota da tabela da seção 2;
- alteração das asserções herdadas de `tests/l06-delivery.integration.test.mjs`;
- a limitação conhecida da captura `clientes-desktop-falha-inicial.png`;
- validação manual, homologação ou aceite humano.

## 5. Prova exigida para encerrar a UX-PRO-07A

1. **Gate focal novo e aditivo** para patrimônio, sem editar asserções do L06: HTTP real + PostgreSQL descartável + Chromium. Deve provar carregamento, vazio honesto, falha inicial com repetição real, preservação em falha de releitura com hora, atualização real após repetir, negativa pós-sucesso fail-closed e teclado das abas.
2. **Preservação:** `npm run test:l06-delivery:pg` continua 9/9 e conserva as asserções existentes.
3. **Evidências:** capturas de 320, 390, 768 e 1440 px no tema dia; pelo menos 768 px à noite pelo controle real do envelope; captura de teclado; falha inicial; dado preservado. `resumo.json` deve registrar `problems: []`, `firstFocus`, `percursoTeclado`, overflow de documento/alvos e contrastes medidos.
4. **Relatório depois:** tabela A1–A8 com antes/depois `file:line`, limitações explícitas e nenhuma inferência de revisão humana.
5. **Inventário:** regenerar os dois CSVs somente se as células justificadas mudarem; conferir diff limitado à linha de `/admin/patrimonio` e ao efeito reproduzível de novos artefatos. Nunca editar CSV à mão.
6. **Bateria conforme o toque:** `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run test:l06-delivery:pg`, `npm run test:l08-delivery:pg` e o gate focal novo.
7. **Arquivos protegidos:** restaurar `next-env.d.ts` e `tsconfig.json` após build e após cada gate Next; conferir os SHA-256 registrados na seção 1.

Uma PR dessa fatia só poderá ser mergeada depois de revisão técnica automatizada em comentário, todos os checks visíveis verdes e estado mergeável. Este documento não é aprovação para as fatias seguintes e não declara aceite humano.

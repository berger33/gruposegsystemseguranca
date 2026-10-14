# UX-PRO-06 — estados de releitura da lista de contratos (`/admin/contratos`)

**Base:** `main` `259ee43c38deeb35fb29a2c622f2ed3e6f6a6712` (merge da PR #214; a ponta esperada no pedido, `267fb55` da PR #213, já havia sido sucedida — ver §0 do documento de escopo).
**Escopo registrado antes de tocar em tela:** [`UX-PRO-06-CONTRATOS-ESCOPO-2026-10-14.md`](UX-PRO-06-CONTRATOS-ESCOPO-2026-10-14.md) (commit isolado anterior à implementação).
**Superfície desta PR:** a tela `/admin/contratos` — "Contratos e implantação" — e um módulo CSS local novo. Não é a conclusão de UX-PRO-06.

**Fora desta PR, deliberadamente:** `/admin/contratos/[id]` (fatia seguinte; nenhum arquivo dele, nem `contract-request.ts`/`contract-vocabulary.mjs`, foi tocado), `/admin/comercial`, `/admin/crm`, `/admin/leads`, `/admin/carteira` (entregues em #210–#214), `/admin/clientes`, o portal `/cliente/app/*`, `UiWorkspace.module.css` (compartilhado, **não alterado**) e todas as APIs, papéis e permissões.

## Antes (medido em `259ee43`, worktree descartável limpo, só com os testes novos)

Suíte nova do gate `test:ux-contract:pg` (4 casos) rodada contra a `main`, sem nenhuma edição de tela: **2 falharam (defeitos) e 2 passaram (preservações)**. Medições em [`antes/antes-medicoes.json`](ux-pro-06-contratos-evidencias/antes/antes-medicoes.json).

| Caso | Resultado na `main` | Evidência |
|---|---|---|
| Falha na releitura preserva contratos lidos, com hora e repetição | **falha** | timeout esperando `contratos-desatualizada`: o caminho de falha fazia `itens: []` nas três leituras |
| Releitura em curso mantém a lista visível com `role="status"` | **falha** | timeout esperando `contratos-atualizando`: `carregando` substituía a lista pelo bloco "Lendo…" |
| Negativa na releitura falha fechada, sem dado nem repetição | passa | preservação que a correção precisava manter |
| 320/390/768/1440 dia/noite sem transbordo, teclado | passa | preservação: sem transbordo, noite alcança painel/título, foco visível no link |

## Depois

Na branch, a suíte completa do gate passa **12/12** (8 pré-existentes + 4 novos).

- **Falha na releitura preserva o que já foi lido** nas três leituras (contratos, propostas aceitas, empresas): faixa `role="alert"` (`data-testid="*-desatualizada"`) com o motivo real, a hora da última leitura concluída (relógio do navegador no instante do sucesso; nada estimado nem gravado), a declaração de que os dados podem estar desatualizados sem significar carteira vazia e o botão "Tentar novamente" quando o erro permite repetição. Ao repetir com sucesso, a faixa sai e a lista é a leitura nova.
- **Releitura em curso mantém o conteúdo visível** com indicador `role="status"` (`data-testid="*-atualizando"`); o bloco de carregamento em tela cheia continua existindo apenas quando ainda não houve nenhuma leitura concluída.
- **Autorização continua falhando fechada**: falha `denied`/`auth` depois de uma leitura concluída substitui o conteúdo pelo estado negado completo, descarta os itens e não oferece repetir a mesma chamada (caso exercitado em navegador, depois de leitura concluída).
- **Estilos**: as duas classes novas vivem em `Contratos.module.css` local, com os mesmos tokens de aviso da carteira/funil. `UiWorkspace.module.css` não foi alterado; nenhum `style` inline foi criado.

**Preservado sem alteração:** `AdminGate` (`marcelo | admin | comercial`); as três URLs de leitura e os dois `POST /api/crm/contracts` (incl. `request_key` e idempotência); os títulos "Contratos e implantação" e "Cadastro manual identificado" (contrato do gate L05); estados de falha inicial/vazio/negado da UX-07; links e vocabulário (código canônico só no rodapé).

## Evidência própria

Pasta [`ux-pro-06-contratos-evidencias/`](ux-pro-06-contratos-evidencias/): `resumo.json` (formato do inventário) com 7 entradas — 320/390/768/1440 px em dia, 768 px à noite (pelo controle real do envelope), percurso de teclado em 390 px até o link do contrato com foco visível medido, e a faixa de dados preservados em 1440 px. **Nenhum transbordo de documento em nenhuma largura** (o contido da tabela continua rolável por dentro, como antes). Massa 100% sintética; sem credencial, dado pessoal ou URL efêmera. Isto **não** é aceite humano.

## Verificações

| Check | Resultado |
|---|---|
| `npm run typecheck` | aprovado |
| `npm test` | **933/933**, 0 pulados |
| `npm run build` | aprovado |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK (só a linha `/admin/contratos` mudou nos dois CSVs) |
| `npm run test:ux-contract:pg` | **12/12**, 0 pulados (8 pré-existentes + 4 novos) |
| `npm run test:l05-delivery:pg` | **1/1** (teste único do gate, que exercita esta tela e o detalhe) |
| `npm run test:l04-delivery:pg` | não aplicável: o teste L04 não referencia contratos (conferido por busca); o gate herdado desta tela é o L05 |
| `next-env.d.ts` / `tsconfig.json` | hashes do baseline (`18b697c4…`, `2128c956…`) conferidos após os gates; o `next build` alterou `next-env.d.ts` numa execução e o arquivo foi restaurado do Git |

## Limitações

- `/admin/contratos/[id]` não foi medido nem alterado: as oito leituras dele também zeram o recurso a cada releitura (`ler()` aplica `dado: null`), e a rota segue sem nenhuma captura na matriz. É a fatia seguinte recomendada.
- A preservação de propostas aceitas e de empresas usa exatamente o mesmo código (`resolverLeitura`) da de contratos, mas o gate só a exercita com itens para **contratos**; para empresas e propostas não há, neste gate, um gatilho de releitura com itens para exercitar a faixa em navegador (a falha inicial das três leituras segue coberta pelos testes pré-existentes). Declarado, não escondido.
- O texto estático da matriz ("tema noturno sem captura; estados nao exercitados em navegador") é fixo do gerador e não interpreta o `resumo.json`; as capturas e os estados existem e estão registrados nesta fatia, como nas anteriores.
- A faixa usa o relógio do navegador no instante do sucesso; não há servidor de tempo nem campo novo em banco.
- Chromium automatizado com massa sintética **não é validação manual nem aceite** de Marcelo, Andreia ou comercial. Sem Windows, HTTPS hospedado ou banco do operador.

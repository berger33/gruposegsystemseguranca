# Entrega L07 — fechamento de matriz e evidências (FIN-01..16 + ADM-01..12)

Data: 2026-10-02. Base: `main` `bbcf311` (merge da PR #74, entrega ADM-01..12).
Branch de sessão: `arena/01a0fd4f-gruposegsystemseguranca`. Sem merge, sem force
push, PRs #47/#53/#59/#60/#62 não reavaliadas.

## Escopo desta sessão

Fechar a **matriz e as evidências do L07**: percorrer requisito a requisito
FIN-01..16 e ADM-01..12, conferindo que cada linha aponta tela/API/dados/
autorização reais e um subteste existente do gate que de fato prova aquilo —
corrigindo o documento ou acrescentando prova onde não batesse. Não houve
necessidade de nova migração: a próxima continua sendo **139**.

## 1. Baseline reconfirmada antes de qualquer edição (SHA `bbcf311`)

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–138) |
| `npm run typecheck` | 0 erros |
| `npm test` | 196/196 |
| `npm run build` | exit 0 |
| `npm run test:migrations:pg` | 138/138 (dois passes) + clone/checksum negativo OK (524 tabelas) |
| `npm run test:l07-delivery:pg` #1 | **43/43**, sem skips |
| `npm run test:l07-delivery:pg` #2 consecutiva | **43/43**, sem skips |
| `npm run test:l03-delivery:pg` | 1/1 (o 403 `/api/employee/offline` intermitente conhecido **não** reapareceu) |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` (encadeado após os demais) | **8/9** — subteste 9 reprovou com a tela em `Carregando operação…` |

## 2. Instabilidade que reapareceu — investigada e tratada sem enfraquecer nada

As duas instabilidades nomeadas no ponto de partida **não reapareceram**: o 403
do L03 e o subteste 22 do L07 (`Carregando histórico…` do FIN-10) passaram em
todas as execuções desta sessão.

O que reapareceu foi o **L06 subteste 9**, da mesma família (carregamento lento
sob carga em máquina de 2 vCPU): encadeado após os outros gates, reprovou com o
corpo da página ainda em `Carregando operação…`; isolado, minutos depois e sem
nenhuma mudança de código, passou 9/9 — dependência de carga confirmada, não
regressão de produto.

**Causa raiz investigada** (código e teste lidos antes de qualquer correção):
`OperacaoWorkspace.tsx` renderiza as abas desde o SSR, mas o conteúdo das abas
só aparece quando `!loading && !error` — ou seja, depois do fetch de bootstrap
pós-hidratação. Sob carga, o `waitUntil: "networkidle"` dispara antes de o
efeito cliente emitir o fetch, e o subteste 9 — o único dos nove que **não**
esperava um seletor de conteúdo (os subtestes 1–8 usam `waitForSelector` de
conteúdo com timeout 30 s) — clicava numa página ainda não interativa e lia o
corpo cedo demais.

**Correção aplicada (no teste, não no produto):** o subteste 9 passou a esperar
`#posts-title` (prova de bootstrap concluído, o mesmo seletor do subteste 1)
antes do clique e a seção alvo
(`section[aria-label="Operação avançada OPS-13 a OPS-16"]`) depois do clique.
**Nenhum timeout foi aumentado** (o parâmetro 30 s é o padrão dos subtestes
1–8 do mesmo arquivo; o código anterior não esperava nada), **nenhum skip foi
introduzido** e **a assertiva final permanece byte a byte idêntica** — a mudança
é de sincronização com o estado real da aplicação, no padrão já consolidado no
arquivo.

**Prova do tratamento:** L06 9/9 isolado com a correção e **9/9 encadeado
imediatamente após L03+L04+L05 na mesma sessão** — a mesma sequência que antes
reprovava.

## 3. Conferência da matriz — o que foi verificado e o que mudou

Para cada um dos 28 requisitos foram conferidos no código real: arquivo de
tela (`src/app/admin/**`), rotas canônicas (roteamento em `server.mjs`), módulo
servidor (`fin-api.mjs`, `fin-advanced-api.mjs`, `fin-management-api.mjs`,
`fin-budget-api.mjs`, `adm-panel-api.mjs`), tabelas canônicas (migrações
077–080 e endurecimento 124–138) e o corpo do(s) subteste(s) citado(s) no gate
de 43. Resultado:

- **Todos os 28 requisitos têm pelo menos um subteste vigente** que prova a
  jornada (HTTP real; Chromium onde aplicável). O mapeamento completo,
  subteste a subteste, está em [`MATRIZ-FECHAMENTO-L07.md`](MATRIZ-FECHAMENTO-L07.md) §1–§3.
- **Correção documental 1 — rótulo da aba FIN-10**: o checklist citava a aba
  como "Despesas / Reembolsos / Compras"; o rótulo real é **"Despesas /
  Compras"** (o workspace cobre os tipos despesa/reembolso/compra). Corrigido
  no checklist.
- **Correção documental 2 — evidência vigente defasada**: a seção "Evidência
  vigente" de `EVIDENCIAS-ENTREGA-LOCAL.md` ainda mostrava o estado FIN-14/15/16
  (37/37) em vez do estado ADM-01..12 (43/43). Atualizada nesta sessão.
- **Precisão honesta adicionada — FIN-02**: o papel `ti` tem leitura na borda
  do servidor (`ensureAuth([admin,ti,financeiro])`), mas o gate não tem asserção
  dedicada de TI lendo pagáveis; a prova de TI-leitura do domínio FIN está nos
  subtestes 19 (FIN-10) e 33 (FIN-14). A linha do checklist e a matriz agora
  declaram exatamente isso, em vez de parecer completo.
- **Nenhuma lacuna funcional real** foi encontrada na matriz FIN/ADM: não houve
  subteste faltante a acrescentar nem migração a criar. As pendências são as já
  registradas (aceite humano, fronteiras externas, dívida dos órfãos e
  adiamentos de negócio), listadas por requisito na matriz §1–§2 e consolidadas
  na §6.

O `docs/CHECKLIST-ENTREGA-LOCAL.md` ganhou, em cada requisito FIN/ADM, a linha
"Subtestes vigentes do gate L07 (43…)" apontando para a matriz — os registros
históricos (commits, PRs e totais de gate da época de cada fatia) foram
preservados como histórico.

## 4. Validação final no mesmo SHA entregue (execuções desta sessão)

Sequência executada na árvore final (correção do teste L06 + documentos):

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 (001–138) |
| `npm run typecheck` | 0 erros |
| `npm test` | 196/196 |
| `npm run build` | exit 0 |
| `npm run test:migrations:pg` | 138/138 (dois passes); clone com checksum adulterado rejeitado (006) e restaurado; 524 tabelas |
| `npm run test:l07-delivery:pg` #1 | **43/43**, sem skips |
| `npm run test:l07-delivery:pg` #2 consecutiva | **43/43**, sem skips |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` (encadeado, condição que antes reprovava) | **9/9** |

O ruído conhecido (`next-env.d.ts`/`tsconfig.json` reescritos pelos gates) foi
revertido antes do commit. Dados exclusivamente sintéticos; PostgreSQL
descartável por execução; nenhum PSP, banco, SMTP, emissão, pagamento ou dado
de cliente real.

**Checks do CI na PR desta sessão:** os workflows que disparam para os arquivos
alterados passaram — `static-and-smoke` e `operations-postgres-browser` (gate
L06 no runner, que valida a correção do subteste 9 fora da máquina local). Os
workflows L04/L05/L07 são acionados por mudanças em `src/**`, `server.mjs` ou
nos próprios arquivos de teste correspondentes, que não foram alterados nesta
PR; para esses, a evidência vigente é a execução local dupla acima, no mesmo
SHA da PR.

## 5. Estado declarado

- FIN-01..16 e ADM-01..12 permanecem `pronto_local` **somente na validação
  automática**. **Aceite humano pendente** — nenhum aceite de Marcelo ou
  Andreia foi registrado nem presumido; validação em Windows não realizada.
- **L07 NÃO está concluído** (ver critérios na matriz §7) e **L08 não foi
  iniciado**.
- Mudança de código desta sessão: apenas a sincronização do subteste 9 do gate
  L06 (teste), sem qualquer alteração de produto, migração ou assertiva.

## 6. Handoff para o L08 (o que falta para o L07 ser declarado concluído)

1. **Aceite humano** das jornadas FIN-01..16 e ADM-01..12 por Marcelo/Andreia,
   inclusive execução no Windows (equipamento-alvo). A matriz
   [`MATRIZ-FECHAMENTO-L07.md`](MATRIZ-FECHAMENTO-L07.md) é o roteiro de
   conferência: cada requisito aponta tela, aba, API e o que o subteste prova.
2. **Decisão de negócio** sobre a dívida dos 80 componentes órfãos de
   `/admin/ti` (critério de saída definido em
   [`INVENTARIO-ADMIN-TI.md`](INVENTARIO-ADMIN-TI.md)); nenhuma mudança técnica
   do L07 depende disso.
3. **Monitorar** as instabilidades residuais: L03 403 `/api/employee/offline` e
   L07-22 não reapareceram nesta sessão; L06-9 teve causa raiz corrigida e
   validada sob carga. Se reaparecerem, investigar da mesma forma (nunca
   timeout/skip/assertiva enfraquecida).
4. Cumprido 1–3, declarar o L07 concluído e **só então** iniciar o L08
   (cliente e expansões), conforme o roteiro de
   [`EXECUCAO-ENTREGA-LOCAL.md`](EXECUCAO-ENTREGA-LOCAL.md). Próxima migração
   livre: **139**, somente aditiva, constraints novas `NOT VALID`.

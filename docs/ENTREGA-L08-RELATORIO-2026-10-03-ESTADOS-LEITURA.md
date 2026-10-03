# L08 — hardening de estados de leitura CLI-02..05

Data: 03/10/2026

Base oficial confirmada: `31834ec0983ead61ec316df90f8af958594b3c58`
(PR #83, posterior à PR #80). Branch da sessão:
`arena/01a0ff46-gruposegsystemseguranca`.

## Limite do recorte

Este recorte não promove requisito novo. Ele corrige uma lacuna de interface da
primeira fatia canônica CLI-02..05: falha de leitura não pode ser apresentada
como ausência de vínculo, lista vazia ou indicador zero, e deve oferecer retry
real. CLI-06..15, EXT-01..17, aliases v2, fornecedor restrito e integrações
externas permanecem fora do escopo.

## Implementação

| Requisito | Tela/rota | API | Tabelas canônicas | Comportamento |
|---|---|---|---|---|
| CLI-02 | frame de `/cliente/app/*` | `/api/auth/me`, `/api/client/accounts` | `auth_sessions`, `auth_identities`, `client_accounts`, `client_access_grants` | erro bloqueia as subpáginas, limpa estado anterior e oferece retry; não aparece como “sem vínculo” |
| CLI-03 | `/cliente/app/contratos` e resumo | `/api/client/contracts` | `client_contracts`, grants | erro separado de vazio/zero, retry e cancelamento/invalidação de leitura antiga |
| CLI-04 | `/cliente/app/documentos` | `/api/client/documents` | `client_documents`, grants | erro separado de lista vazia, retry e cancelamento da leitura antiga; download privado não foi alterado |
| CLI-05 | `/cliente/app/chamados` e resumo | `/api/client/tickets` | `client_tickets`, histórico, grants | erro separado de histórico vazio, retry e sequência que impede resposta tardia de substituir a conta atual |

`ClientAppFrame` centraliza a barreira de carregamento. O provider zera sessão,
contas e seleção quando a leitura falha; assim dados de uma leitura anterior não
ficam visíveis. Contratos e documentos abortam a requisição anterior na troca de
conta. Chamados e resumo usam número de sequência e ignoram resposta obsoleta.
Não houve alteração de autorização no servidor: conta e identidade continuam
derivadas da sessão/grant.

## Prova

O gate L08 ganhou um subteste dentro da integração real de client-space. Ele:

1. usa identidade, senha, sessão, grant, conta e contrato sintéticos realmente
   persistidos no PostgreSQL descartável pelo próprio gate;
2. abre Chromium empacotado na rota HTTP real `/cliente/app/contratos`;
3. injeta uma resposta HTTP 503 somente na leitura de contas;
4. confirma que o erro aparece e que o texto de ausência de vínculo não aparece;
5. aciona `Tentar novamente` e confirma o contrato retornado pela API real.

O inventário do gate verifica ainda que contratos, documentos, chamados e o
resumo possuem estados de erro/retry e zeram ou invalidam a leitura anterior.
Isso é uma verificação estrutural; não se afirma que todas as quatro páginas
tiveram sua falha individual percorrida no Chromium nesta série. A jornada
Chromium da conta é real e não usa `page.setContent`, cookie inventado ou dados
fora do banco do gate.

## Banco e fontes

Nenhuma migração foi criada. Migrações 001–139 permanecem imutáveis, contínuas
e únicas; próxima livre: **140**. A migração 139 e as garantias transacionais da
PR #83 permanecem preservadas. Fontes canônicas: `auth_*`, `client_accounts`,
`client_access_grants`, `client_contracts`, `client_documents`,
`client_tickets`, seus históricos e auditorias.

## Validação

A baseline foi executada antes da edição. A instalação inicial não possuía
`node_modules`: o primeiro `typecheck` terminou 127 (`tsc: not found`); após
`npm ci` pelo lockfile, a baseline prosseguiu. L04 teve uma execução 19/20 e L06
8/9 porque o Chromium empacotado encerrou com `SIGSEGV` no lançamento; as
repetições isoladas passaram, respectivamente, 20/20 e 9/9. Nenhum teste,
assertiva ou timeout foi enfraquecido.

Os resultados finais da série devem ser lidos no relatório final da PR e nas
seções de evidência atualizadas no mesmo commit. O gate L08 alterado passou
51/51 na primeira execução limpa de desenvolvimento.

## Classificação e pendências

- Implementação local: realizada neste recorte de interface.
- Validação automática Linux/PostgreSQL descartável/HTTP/Chromium: realizada
  conforme resultados registrados; não é aceite humano.
- Aceite humano: nenhum aceite novo; o aceite local anterior de Marcelo e
  Andreia para L07 permanece preservado.
- Homologação Windows: não realizada.
- Mensagens/anexos/protocolo de chamado continuam fora da API canônica promovida;
  sua existência em v2 não os torna aceitos.

## Resultados finais no diff entregue

| Comando | Resultado real |
|---|---|
| `node scripts/qa-wave0-static.mjs` | exit 0; 5/5; 001–139 contínuas/únicas |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0; 196/196 |
| `npm run build` | exit 0 |
| `npm run test:migrations:pg` | exit 0; 139/139 em dois passes; clone/checksum negativo deliberado recusou 006; limpeza confirmada |
| `npm run test:l07-delivery:pg` — final 1 | exit 1; 42/43; subteste 18, Chromium `SIGSEGV` no lançamento |
| `npm run test:l07-delivery:pg` — final 2 | exit 1; 42/43; subteste 43 observou `R$ 9.340,00` em vez de `R$ 1.500,00` |
| repetição L07 1 | exit 0; 43/43 |
| repetição L07 2 | exit 1; 41/43; subtestes 22 e 24, Chromium `SIGSEGV` no lançamento |
| `npm run test:l03-delivery:pg` | exit 0; 1/1 |
| `npm run test:l04-delivery:pg` | exit 0; 20/20 |
| `npm run test:l05-delivery:pg` | exit 0; 1/1 |
| `npm run test:l06-delivery:pg` | exit 0; 9/9 |
| `npm run test:l08-delivery:pg` — final 1 | exit 0; 51/51 |
| `npm run test:l08-delivery:pg` — final 2 | exit 0; 51/51 |

O L07 não é apresentado como aprovado nesta execução final: não houve duas
passagens consecutivas. Três falhas foram encerramentos `SIGSEGV` do Chromium no
lançamento; a divergência de valor do subteste 43 desapareceu na repetição
seguinte, mas é registrada como instabilidade concorrente/de dados, não como
falha ambiental comprovada. Nenhuma delas foi mascarada. O recorte L08 alterado
passou duas vezes consecutivas.

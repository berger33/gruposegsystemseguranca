# Entrega L08 — CLI-13 modos de acesso configuráveis

Data: 03/10/2026  
Branch: `arena/01a10074-gruposegsystemseguranca`  
Base oficial: `fa75e32f6b279c3054578d9befc9adf7c376f249` (merge da PR #92)

## Sincronização e escopo

Antes de editar, foi confirmado no remoto que a PR #92 estava **MERGED** em
2026-10-03T06:28:01Z, com merge commit `fa75e32`; `HEAD` e `origin/main`
apontavam para esse SHA e a divergência era **0/0**. CLI-12 não foi refeito e
as migrações 001–143 permaneceram imutáveis.

A baseline foi executada no SHA de partida: `npm ci` OK; QA estático 5/5
(001–143); typecheck OK; `npm test` 215/215; build OK com 84 páginas. Antes de
editar, um teste executável reproduziu a lacuna: POST no alias
`/api/client/portal-access-requests` sem sessão staff caiu em `ensureAuth` e
respondeu 401 sem tocar o banco. A inspeção automatizada também confirmou que
`/admin/portal/solicitacoes` mantinha somente `DemoAccessRequest` em estado
local, sem API.

Esta fatia promove exclusivamente CLI-13. CLI-14 e CLI-15 permanecem próximos;
EXT-01..17 e demais órfãos não foram promovidos.

## Implementação

- `/cliente/acesso` passou de simulação para formulário real de solicitação com
  aprovação ou autocadastro sujeito a revisão;
- nova rota pública explícita `/api/public/portal-access-requests`; os aliases
  `/api/client/portal-access-requests` e `/api/cli/portal-access-requests`
  despacham a mesma entrada e não leem cookie administrativo;
- `/admin/portal/solicitacoes` passou a carregar e alterar os três modos e a
  revisar a fila real; configuração e revisão exigem sessão individual
  `admin`/`ti` e same-origin;
- cada alteração de modo exige motivo, deriva autoria da sessão e grava estado,
  histórico e auditoria na mesma transação;
- `auto_release_contracts=true` para `autocadastro` é recusado com 400 antes de
  abrir transação; o CHECK imutável da migração 076 continua sendo a segunda
  barreira;
- `requires_approval` é configuração registrada, mas não é interpretado como
  autorização para automação: solicitações e autocadastros sempre nascem
  `pendente` nesta fatia.

## Autorização, vínculo e isolamento

A solicitação aceita somente os modos `solicitacao_aprovacao` e `autocadastro`.
`convite` encaminha ao fluxo canônico. O servidor valida UUID, modo ativo,
conta ativa e igualdade normalizada do documento com
`client_accounts.document_ref`. `verified_link` é sempre escrito pelo servidor;
valores de conta, identidade, aprovador ou `verified_link` forjados não são
usados como autoria ou prova.

Modo inativo é recusado declaradamente. Documento/conta sem correspondência
recebe resposta genérica 403; a recusa é auditada na mesma transação sem criar
pedido. A resposta pública nunca devolve cadastro de outra conta. A fila e as
decisões usam somente sessão administrativa; a entrada pública não promove
cookie staff a sessão cliente nem cria cookie.

A idempotência usa a identidade pública conservadora (fingerprint de
e-mail+documento), origem e chave de retry. O conteúdo canônico tem fingerprint
SHA-256: replay idêntico retorna o pedido existente; chave reusada com conteúdo
diferente retorna 409. Um advisory lock transacional serializa retries.

## Decisão, convite e ausência de liberação automática

Aprovação ou rejeição exige motivo de 10–500 caracteres. Aprovação exige pedido
pendente e vínculo já verificado pelo servidor. Ela cria, na mesma transação da
decisão, histórico e auditoria, **somente um convite canônico** em
`auth_invites` (migração 003), com emissor da sessão e motivo no `scope_note`.
Sem SMTP, a API devolve a URL manual local. Rejeição grava motivo e histórico e
não cria convite.

Aprovação não insere em `auth_identities`, `auth_sessions`,
`client_access_grants` ou `client_contracts`. Após aceite do convite, eventual
vínculo continua no fluxo canônico separado de grants, que exige identidade,
conta, emissor staff e motivo. Portanto autocadastro, pedido e aprovação não
liberam contrato sozinhos; o teste dedicado inspeciona as escritas e prova a
ausência desses INSERTs.

Falha da auditoria retorna 503 e causa rollback do pedido/histórico/decisão. Não
há SMTP real nem dados reais nesta entrega.

## Persistência e migração

Foi criada somente
`db/migrations/144-l08-cli13-portal-access-modes.sql`, aditiva. Ela acrescenta:

- autoria em `cli_portal_mode_configs` e histórico de configuração;
- idempotência, fingerprints, motivo/instante de decisão e referência ao convite
  em `cli_portal_access_requests`;
- histórico imutável de transições da solicitação;
- índices únicos de retry e convite;
- ações CLI-13 na auditoria canônica;
- ampliação aditiva de `auth_invites.issued_by` para o papel `admin` vigente.

Constraints novas são `NOT VALID`; linhas antigas são preservadas sem autoria,
fingerprint ou motivo inventado. O manifesto e o QA estático avançaram para
001–144; a próxima migração livre é 145.

## Validações executadas

- `npm ci`: OK (baseline);
- `node scripts/qa-wave0-static.mjs`: **5/5**, migrações 001–144;
- `npm run typecheck`: OK;
- `node --test tests/cli13-portal-access-modes.test.mjs`: **11/11**;
- teste dedicado registrado em `package.json` → `test:unit`;
- `npm test`: **226/226** (215 anteriores + 11);
- `npm run build`: OK, **84 páginas**, incluindo as rotas reais já existentes
  `/cliente/acesso` e `/admin/portal/solicitacoes`.

Essas são validações automáticas rápidas. Não constituem homologação, aceite
humano nem prova operacional.

## Pendências reais

Por decisão do proprietário, ficaram adiados para o fechamento do sistema:

- `test:l08-delivery:pg` com HTTP, PostgreSQL descartável e Chromium reais para
  CLI-13;
- gates L03..L08 em cascata e bateria pesada;
- aplicação da migração 144 em ambiente de destino;
- aceite humano da jornada CLI-13;
- homologação Windows.

O aceite humano anterior de Marcelo e Andreia para L07 permanece apenas como
registro histórico; não houve aceite novo. Próximo alvo: **CLI-14** (MFA
opcional, gestão de sessões e troca de e-mail concluída no backend real),
depois CLI-15.

## Correção durante a revisão da PR

O check `client-portal-postgres-browser` revelou incompatibilidade com o schema
parcial do gate legado L08, que não aplica a migração 076: a consulta direta à
configuração do modo convite retornava 503. A emissão canônica passou a consultar
`to_regclass` antes do catálogo; quando o catálogo existe, o modo é obrigatório,
e quando o gate legado deliberadamente não o instala, o fluxo 003 preservado
continua compatível. O gate foi repetido localmente e passou **51/51**. Esse
gate cobre CLI-01..05 e compatibilidade do convite; não substitui a pendência de
uma jornada pesada específica para CLI-13.

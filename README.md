# Grupo SEG System

## Continuação atual: L06 — operação, patrimônio e manutenção

O fechamento técnico do L04 está no [PR #33](https://github.com/berger33/gruposegsystemseguranca/pull/33). L05 foi concluído tecnicamente no ambiente remoto e está documentado em [ENTREGA-L05](docs/ENTREGA-L05.md), sujeito aos checks da PR e ao aceite humano.
Leia o [prompt completo para continuidade L06](docs/PROMPT-CONTINUACAO-L06-OPERACAO-PATRIMONIO.md). Isso não declara o sistema inteiro pronto nem substitui homologação humana.


## Demonstração local persistente — apenas massa fictícia

A versão **fonte atual**, não os ZIPs históricos, possui [início local persistente e guia Windows](docs/demo-local-persistente.md): `INICIAR-DEMO-LOCAL.bat`. Ele cria banco PostgreSQL **exclusivo no perfil do usuário**, sem SMTP/Funnel e sem dados reais; ainda **não é instalador Windows homologado, backup nem sistema completo**. Ensaio Linux isolado: `npm run test:demo-local:pg` ([QA-HOM-008](docs/evidencias/QA-HOM-008-demo-local-persistente.md) e [cópia fria/restore QA-HOM-009](docs/evidencias/QA-HOM-009-copia-fria-demo-sintetico.md)). A cópia do demo contém segredos em claro, não é backup operacional. Não copiar chaves ou dados da prévia anterior.

## Homologação funcional **separada** da prévia PGlite

Para explorar papéis sintéticos e um PostgreSQL local descartável, use o pacote separado `downloads/seg-system-homologacao-local.zip` e leia [LEIA-ME-HOMOLOGACAO.md](LEIA-ME-HOMOLOGACAO.md). No pacote descartável, abra `/qa/modulos` com o lançador de homologação; o demo persistente usa o seu próprio lançador acima; o pacote `seg-system-qa-local.zip` continua sendo uma prévia PGlite sem credenciais. O índice identifica módulos operacionais, protótipos e bloqueios, sem prometer homologação dos 222 requisitos. Nenhum pacote é produção.

[Veja a avaliação de lacunas para entrega local completa](docs/AVALIACAO-ENTREGA-LOCAL-COMPLETA.md) antes de tratar o ZIP como sistema pronto para o cliente. **Atenção:** o ZIP de homologação publicado anteriormente é uma fotografia com 96 migrações; o código-fonte atual já contém as migrações aditivas 097–098, MFA cliente e revisão manual de identidade. O ZIP antigo **não recebe essas correções** e não deve ser exposto via link externo ou usado como instalação persistente.

Sistema em desenvolvimento para o Grupo SEG System. O **plano foi registrado em commit separado antes do início da aplicação** (`5af5ab0`).

- [Plano de produto e decisões pendentes](docs/plano-produto.md)
- [Referências de marca e conteúdo público](docs/referencias-marca.md)
- [Captação de pedidos, painel e SMTP](docs/captacao-pedidos.md)
- [Portal do cliente: decisões de acesso e segurança](docs/portal-acesso-e-seguranca.md)
- [Estado verificado e prompt do próximo passo (histórico)](docs/proximo-passo.md)
- [Plano de QA e casos da Onda 0](docs/plano-mestre-testes.md)
- [Evidências do reparo/reteste local da Onda 0](docs/evidencias/QA-onda0-reparo-controlado.md)
- [Caso e evidências da Onda 1 — segurança RAG](docs/qa-casos-onda1-rag.md)
- [Caso e evidências da Onda 2 — portal fail-closed](docs/qa-casos-onda2-tenant.md)
- [Caso e evidências da Onda 3 — A/B em PostgreSQL QA](docs/qa-casos-onda3-tenant-pg.md)
- [Caso e evidências da Onda 4 — migrações PostgreSQL QA](docs/qa-casos-onda4-migracoes.md)
- [Caso e evidências da Onda 5 — migrações 001–096 duas vezes e clone QA](docs/qa-casos-onda5-migracoes-integral.md)
- [Caso e evidências da Onda 6 — HTTP CLI v2 e auditoria](docs/qa-casos-onda6-cli-v2-http.md)
- [Caso e evidências da Onda 7 — escopo CLI v2 e falha injetada da auditoria](docs/qa-casos-onda7-cli-v2-escopo-auditoria.md)
- [Onda 8 — backup/restore PostgreSQL: preflight e bloqueio de ferramentas](docs/qa-casos-onda8-backup-restore.md)
- [Onda 9 — pg_dump/pg_restore reais em bancos sintéticos descartáveis](docs/qa-casos-onda9-restore-real-sintetico.md)
- [Onda 10 — restore entre clusters e catálogo de backup fail-closed](docs/qa-casos-onda10-backup-clusters-catalogo.md)
- [Onda 11 — manifesto e bytes sintéticos após restore de banco](docs/qa-casos-onda11-manifesto-arquivo-sintetico.md)
- [Onda 12 — download HTTP autenticado de arquivo sintético restaurado](docs/qa-casos-onda12-download-arquivo-restaurado.md)
- [Onda 13 — coadulteração e pin efêmero de manifesto QA](docs/qa-casos-onda13-pin-manifesto-sintetico.md)
- [Política técnica inicial de backup e recuperação](docs/politica-tecnica-backup-recuperacao.md)
- [Onda 14 — assinatura destacada e decisão técnica em QA](docs/qa-casos-onda14-politica-assinatura-qa.md)
- [Onda 15 — inventário sintético e cobertura fail-closed](docs/qa-casos-onda15-inventario-cobertura-sintetica.md)
- [Onda 16 — contratos de referência CLI v2 e famílias de anexos](docs/qa-casos-onda16-contratos-referencia-arquivo.md)
- [Onda 17 — provedor local sintético CLI v2, sem integração de produção](docs/qa-casos-onda17-provedor-local-cli-v2-sintetico.md)
- [Onda 18 — vínculo CLI v2 entre PostgreSQL QA e objeto sintético](docs/qa-casos-onda18-vinculo-cli-v2-pg-objeto.md)
- [Onda 19 — transporte CLI v2 sintético com restore entre clusters](docs/qa-casos-onda19-transferencia-cli-v2-pg.md)
- [Onda 20 — falha parcial na importação CLI v2 e classificação QA](docs/qa-casos-onda20-importacao-parcial-cli-v2.md)
- [Onda 21 — referências assinadas QA de pontos de restauração](docs/qa-casos-onda21-pontos-restauracao-cli-v2.md)
- [Relatório consolidado detalhado de testes, Ondas 0–21](docs/RELATORIO-CONSOLIDADO-TESTES.md)
- [Relatório de pendências — todos os 222 requisitos](docs/RELATORIO-PENDENCIAS-COMPLETO.md)

## Download de prévia QA local (não produção)

[Baixar ZIP atualizado de código-fonte e lançadores QA](downloads/seg-system-qa-local.zip) · [SHA-256](downloads/seg-system-qa-local.zip.sha256) · [instruções](LEIA-ME-QA.md). **Dois passos:** extraia o ZIP e execute `INICIAR-QA.bat` no Windows ou `bash INICIAR-QA.sh` no terminal macOS/Linux; depois abra o link `http://localhost:3000` exibido. Precisa de **Node.js 22, npm e internet** para instalar dependências e compilar na primeira execução. Usa PGlite beta **local** e `noindex`; não inclui banco/credenciais, SMTP, Ollama real, `node_modules` ou serviço pronto de produção. Este ZIP **não** é o `dist/seg-system-beta.zip` antigo nem homologa os 222 requisitos. O script é reproduzível: `python3 scripts/build-qa-download.py`; não usar para hospedar com dados reais.

> **QA em 28/09/2026 — Onda 21:** [relatório e resposta sobre quantidade de ondas](docs/qa-casos-onda21-pontos-restauracao-cli-v2.md). Contrato unitário QA classificou versão antiga protegida por ponto assinado externo e objeto desconhecido sem autorizar deleção; chave atacante, ponto ausente/duplicado e bytes históricos faltantes falharam. `npm test` 133/133, typecheck/build 66/66. **Sem PostgreSQL/WAL/PITR real nesta onda; NO-GO.** Não existe número predeterminado de ondas restantes.

> **QA em 28/09/2026 — Onda 20:** [relatório](docs/qa-casos-onda20-importacao-parcial-cli-v2.md). Falha injetada após 1/3 objetos importados no destino QA: compensação restrita ao objeto criado na execução, zero objetos no destino, DB intacto e exit 1/cleanup; arquivo sem referência DB na origem classificado sem exclusão antecipada. Regressões: positivo 3/3, coadulteração recusada, CLI PG 9/9; `npm test` 130/130, typecheck/build 66/66. **NO-GO**: não cobre crash/concorrência nem torna objetos sem referência seguros para apagar; `PLT-DEF-024` permanece aberto.

> **QA em 28/09/2026 — Onda 19:** [relatório](docs/qa-casos-onda19-transferencia-cli-v2-pg.md). Em dois clusters QA independentes, dump/restore PG 96/96 e três objetos A v1/v2+B v1 foram verificados com assinatura Ed25519 e vínculo conta/versão/chave/hash **antes** de importar bytes no destino. Co-adulteração com chave atacante foi recusada com zero objetos importados (exit 1 e cleanup); positivo exit 0 e cleanup, HTTP legado A/B/revogação passou. `npm test` 128/128, typecheck/build 66/66. **NO-GO:** fixture/chave efêmera, sem origem CLI real, KMS/custódia/consistência DB+FS/PITR; `PLT-DEF-024` permanece aberto.

> **QA em 28/09/2026 — Onda 18:** [relatório](docs/qa-casos-onda18-vinculo-cli-v2-pg-objeto.md). PG 17.9 descartável 001–096: documento/versões A/B vinculados a objetos QA; A leu bytes v1/v2, B não leu A, grant revogado cortou escopo, chave DB alterada e byte corrompido falharam. Falha de versão duplicada fez rollback DB **mas deixou objeto QA órfão** até cleanup. Teste PG 1/1, regressão CLI 9/9; `npm test` 125/125, typecheck/build 66/66. **NO-GO:** sem restore DB para destino independente nem custódia/atomicidade operacional; APIs de produção intocadas.

> **QA em 28/09/2026 — Onda 17:** [evidências](docs/qa-casos-onda17-provedor-local-cli-v2-sintetico.md). Contrato local QA de objeto/versão/conta/sha256: bytes sintéticos v1/v2 e import para diretório separado passaram; B, versão/chave divergentes, byte adulterado e path externo foram recusados. **Sem PostgreSQL/HTTP neste lote**, recibos não assinados e API produtiva inalterada; `npm test` 124/124, typecheck/build 66/66. **NO-GO** para armazenamento real ou backup completo.

> **QA em 28/09/2026 — Onda 16:** [evidências](docs/qa-casos-onda16-contratos-referencia-arquivo.md). Contrato local legado distinguido do CLI v2: `file_url`/`storage_key` CLI v2 são metadados sem bytes comprovados no módulo, não streaming privado. QA em dois clusters: 124 colunas candidatas agrupadas em 12 famílias; 1 arquivo legado sintético conferido e 6 ocorrências de metadados CLI v2 sem custódia comprovada. “Full” foi negado (exit 1/cleanup), escopo legado passou, `npm test` 120/120, typecheck/build 66/66. **NO-GO** para backup operacional, sem inferir armazenamento de outras famílias.

> **QA em 28/09/2026 — Onda 15:** [relatório](docs/qa-casos-onda15-inventario-cobertura-sintetica.md). Em dois clusters QA, 124 colunas candidatas de referência a arquivos; um documento legado sintético com bytes restaurados confirmado, **6 ocorrências de metadados CLI v2 não classificadas**. Exigir cobertura “full” falhou deliberadamente (exit 1/cleanup); arquivo legado removido no destino também falhou antes do HTTP. Escopo legado+HTTP passou, `npm test` 117/117, typecheck/build 66/66. **NO-GO**: o inventário do produto não é completo, não há bytes CLI v2 comprovados, PITR/KMS/storage externo ou metas de recuperação medidas.

> **QA em 28/09/2026 — Onda 14:** [relatório](docs/qa-casos-onda14-politica-assinatura-qa.md) e [decisão técnica](docs/politica-tecnica-backup-recuperacao.md). Assinatura Ed25519 **somente para manifesto sintético QA** passou entre clusters (arquivo de 54 bytes, HTTP A/B/revogação); troca de assinatura/chave dentro do pacote foi negada antes de restaurar bytes (exit 1/cleanup). `npm test` 112/112, typecheck/build 66/66. **NO-GO**: sem âncora externa durável/KMS, inventário completo de arquivos, armazenamento imutável, snapshot DB+FS, PITR ou RPO/RTO medidos. O gate documental antigo foi corrigido: API de backup/restore permanece 503, sem sucesso operacional.

> **QA em 28/09/2026 — Onda 13:** [evidências e limites](docs/qa-casos-onda13-pin-manifesto-sintetico.md). A adulteração conjunta de bytes e manifesto sintéticos falha **antes** da escrita quando comparada ao pin original mantido em memória pelo runner QA (exit 1/cleanup); pin ausente é recusado. Pin calculado a partir do pacote adulterado **não autentica** nada — ainda falta âncora independente/custódia aprovada. Restore/HTTP positivo e negativo anterior regressaram; `npm test` 106/106, typecheck e build 66/66. **NO-GO** para backup operacional; nenhuma mudança de API de produção.

> **QA em 28/09/2026 — Onda 12:** [relatório e limites](docs/qa-casos-onda12-download-arquivo-restaurado.md). Após restore em dois clusters QA, HTTP real serviu exatamente 54 bytes sintéticos para A (200 e cabeçalhos seguros), negou B (403) e anônimo (401), e revogação de A no destino cortou acesso (403), preservando conta B e grant A da origem. Arquivo adulterado falhou antes do HTTP (exit 1/cleanup); suíte local 103/103, typecheck e build 66/66. **NO-GO**: um arquivo não comprova backup operacional, manifesto não é autenticado, não há custódia/criptografia, consistência DB+FS sob concorrência, RPO/RTO, CI remoto ou UAT. Nenhuma produção/operador afetado. Histórico anterior:

> **QA em 28/09/2026:** [Onda 11](docs/qa-casos-onda11-manifesto-arquivo-sintetico.md) restaurou DB PostgreSQL 17.9 sintético 001–096 entre dois clusters QA descartáveis (**497 tabelas**, 96 checksums) e, separadamente, **um arquivo sintético de 54 bytes** associado por manifesto a `client_documents` (ID, conta, chave, tamanho, SHA-256); adulteração dos bytes falhou com exit 1 e cleanup após correção de erro no runner. `npm test` **102/102**, typecheck e build 66/66 locais. A API administrativa de backup da Onda 10 continua sem executor: retornos de criação/restore são **503**, registros legados têm status `unverified` e UI é somente leitura. **NO-GO** para produção: o dump não inclui bytes privados, manifesto não é autenticado, não há criptografia/custódia, snapshot DB+FS concorrente, ledger histórico, RPO/RTO, CI remoto ou UAT. Cliente CLI v2 e download privado ainda não homologados. Afirmações históricas abaixo sobre recursos “verificados” não homologam a árvore reconciliada. Não redistribuir ZIP beta antigo nem usar dados reais/publicar sem autorização.

## Prévia atual

As dez propostas visuais foram aprovadas. Por decisão atual, o **layout 06 — Azul em camadas** permanece como padrão, e a seleção administrativa/global dos dez temas fica adiada enquanto avançamos nos fluxos essenciais. As rotas `/layout-01` a `/layout-10` preservam as propostas para retomada posterior; `/layout-06` abre o conceito original. A aplicação **não está pronta para produção**.

O formulário integrado do layout 06 envia pedidos à API do servidor, que valida e tenta registrar os dados no PostgreSQL, tenta notificar por SMTP quando configurado e, após o registro, oferece continuidade pelo WhatsApp. Visitas permanecem solicitações — não são confirmadas automaticamente. O painel `/admin/leads` lista os pedidos e permite atualizar o status usando a sessão administrativa existente. **O fluxo de banco já foi validado contra um PostgreSQL real**: as migrações foram aplicadas e o percurso completo — envio do formulário, gravação, sessão administrativa, listagem, mudança de status e trilha de auditoria — é verificado de forma automatizada por `npm run test:integration`. A notificação por SMTP continua **não verificada**, porque nenhum provedor foi escolhido. Sem SMTP, a gravação continua independente e a interface informa o status de notificação. O **simulador em `/simulador`** conduz a pessoa em quatro etapas (espaço, serviços, dados e revisão) e grava o mesmo pedido pela mesma API; ele não exibe preços nem reserva visita, porque ainda não existe tabela aprovada. Os serviços e tipos de imóvel vêm de `src/lib/service-catalog.mjs`, também lido pelo servidor, para que a tela nunca ofereça uma opção que a API recuse. A página `/cliente` apresenta a experiência planejada de acesso por convite, mas autenticação, convites e dados do portal ainda não estão ativos. `/admin/portal` compara os três modos de acesso apenas como protótipo em memória; `/admin/portal/convites` mostra a jornada demonstrativa de mensagem, aceite e verificação; `/admin/portal/solicitacoes` demonstra a revisão e os resultados possíveis sem registros fictícios; `/admin/portal/autocadastro` apresenta os estados pendente/verificado sem registrar dados nem liberar acesso. Essas telas não enviam e-mail, não geram links/códigos reais, nem gravam escolhas ou alteram o acesso. Candidaturas, blog e outros módulos ainda serão construídos. A seleção administrativa/global de visuais está adiada; layout 06 permanece padrão e as demais propostas ficam preservadas para retomada. As demais áreas aparecem como “Em desenvolvimento”; não existe dado contratual fictício exposto como real. O `robots` está configurado como `noindex` durante a prévia.

A foto da viatura e o logotipo foram vistos na conversa, mas não estavam acessíveis nos caminhos de anexos informados pelo ambiente; o site usa ilustração e marca tipográfica provisórias até os arquivos estarem disponíveis em `public/brand/`. Antes de publicar, confirmar contatos, conteúdo, licenças, autorização de imagens e política de privacidade.

## Área logada do cliente — etapa 1 (nova, 27/09/2026)

A primeira camada **real** do portal do cliente está ativa e verificada: convite administrativo (7 dias, uso único, revogável), aceite com senha scrypt (12+ caracteres, comuns recusadas), confirmação de e-mail (7 dias), login com espera progressiva (1/5/15 min após a 5ª falha), sessões revogáveis no servidor, recuperação de senha por link de 1 hora com resposta genérica e trilha de auditoria com categorias fechadas. Rotas reais: `/cliente/entrar`, `/cliente/app` (primeira área protegida), `/cliente/convite`, `/cliente/confirmar-email` e `/cliente/redefinir-senha`; APIs em `/api/auth/*` e `/api/admin/invites*`. As rotas mais antigas de `/cliente/*` e `/admin/portal/*` continuam sendo **prévias** sem autenticação. O fluxo usa a migração `db/migrations/003-client-access.sql` e é coberto por teste de integração contra PostgreSQL real com captura SMTP embutida. Detalhes, limites e o que falta em [portal do cliente](docs/portal-acesso-e-seguranca.md). Para experimentar localmente: configure `.env.local` (copie `.env.example`), rode `npm run db:migrate` e `npm run dev`; emita um convite como administrador:

```bash
curl -X POST http://localhost:3000/api/admin/session -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"token":"<SITE_ADMIN_TOKEN_TI>"}' -c cookies.txt
curl -X POST http://localhost:3000/api/admin/invites -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -b cookies.txt -d '{"email":"voce@exemplo.com"}'
```

Sem SMTP configurado, a resposta inclui `inviteUrl` para entrega manual pelo WhatsApp; com SMTP, o convite sai por e-mail e o link não aparece na resposta.

### Área logada do cliente — etapa 2 (27/09/2026)

A segunda camada **real** está ativa: vínculo verificado no servidor entre a identidade de acesso e o cadastro central do cliente (grant com emissor e motivo, revogação idempotente e imediata), mais os dados reais do painel — contratos, documentos e chamados. A regra de ouro: **o portal nunca confia em identificadores vindos do navegador**; cada consulta passa por sessão válida + grant ativo + cadastro ativo, e qualquer desvio responde `403 forbidden` genérico com linha de auditoria `authorization_denied`. Área do cliente em `/cliente/app` (visão geral, contratos, documentos com download auditado, chamados com resposta da equipe); painel operacional em `/admin/clientes` (cadastros → vínculos → contratos → documentos → chamados, com motivo obrigatório nas ações sensíveis). Migração `db/migrations/004-client-space.sql` + validadores compartilhados em `src/lib/client-space-core.mjs`. Detalhes em [portal do cliente](docs/portal-acesso-e-seguranca.md).

## Download das prévias

- [Layout 01 — prévia estática original (.zip)](downloads/seg-system-previa.zip). Extraia e abra `index.html`.
- [Layout 02 — Central (.zip)](downloads/layout-02-central-preview.zip). Extraia e abra `index.html`; `layout-01.html` permite comparar com o primeiro conceito.
- [Layout 03 — Presença (.zip)](downloads/layout-03-presenca-preview.zip). Extraia e abra `index.html`; o pacote inclui os layouts anteriores para comparação.
- [Layout 04 — Operação (.zip)](downloads/layout-04-operacao-preview.zip). Extraia e abra `index.html`; os layouts 01–03 também estão incluídos.
- [Layout 05 — Institucional B2B (.zip)](downloads/layout-05-b2b-preview.zip). Extraia e abra `index.html`; os layouts 01–04 também estão incluídos.
- [Layout 06 — Azul em camadas (.zip)](downloads/layout-06-azul-editorial-preview.zip). Extraia e abra `index.html`; os layouts 01–05 também estão incluídos.
- [Layout 07 — Mapa de cuidado (.zip)](downloads/layout-07-mapa-preview.zip). Extraia e abra `index.html`; os layouts 01–06 também estão incluídos.
- [Layout 08 — Núcleo integrado (.zip)](downloads/layout-08-nucleo-preview.zip). Extraia e abra `index.html`; os layouts 01–07 também estão incluídos.
- [Layout 09 — Briefing guiado (.zip)](downloads/layout-09-briefing-preview.zip). Extraia e abra `index.html`; os layouts 01–08 também estão incluídos.
- [Layout 10 — Linha de cuidado (.zip)](downloads/layout-10-linha-de-cuidado-preview.zip). Extraia e abra `index.html`; os layouts 01–09 também estão incluídos.

Os ZIPs são **fotografias visuais desta etapa**, não o sistema completo nem versões para publicação. As prévias não têm backend, e os formulários apenas abrem uma mensagem para revisão e envio manual pelo WhatsApp. Gere o pacote atual com `npm run package:layout-10`.

## Desenvolvimento

Requer Node.js 20.9+ (testado com Node 22).

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Para checagem:

```bash
npm test
npm run typecheck
npm run build
```

`npm test` cobre apenas a validação pura e não precisa de banco. Com `DATABASE_URL` configurada, `npm run test:integration` sobe uma instância própria do servidor e confere, de forma serializada contra um PostgreSQL real: o fluxo completo de pedidos; o fluxo completo de acesso do cliente (convite → aceite → confirmação → login → recuperação de senha), com servidor SMTP de captura embutido; e o fluxo do espaço real do cliente (vínculos verificados, negação por padrão com auditoria, documentos com round-trip byte a byte, chamados com trilha de situação). Eles só rodam com `RUN_DATABASE_INTEGRATION=1` e se recusam a escrever em bancos que não sejam de loopback, salvo `RUN_DATABASE_INTEGRATION_REMOTE=1`.

Para desenvolver os fluxos de pedidos, configure PostgreSQL e os segredos administrativos conforme [administração e configuração](docs/administracao-visual.md), copie `.env.example` para `.env.local` e execute `npm run db:up` e `npm run db:migrate`. Para alertas por e-mail, preencha `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` e `LEADS_NOTIFY_EMAIL` com os dados do serviço SMTP escolhido. Nunca versione credenciais. A autenticação por token é uma base inicial; concluir RBAC completo e 2FA antes da produção. Os ZIPs de download são snapshots estáticos e não incluem esta API.

- Etapa 3A (segurança/admin): migrações 005/006 ativas, vínculo restrito, MFA opcional, troca de e-mail, administradores por convite individual. Ainda dependem: SMTP, CNPJ/contatos oficiais, logotipo/licenças, política aprovada, provisionamento seguro das senhas, retenção 12 meses ativa, backup/teste.

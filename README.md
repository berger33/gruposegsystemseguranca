# Grupo SEG System Segurança Integrada

Sistema em desenvolvimento para o Grupo SEG System. O **plano foi registrado em commit separado antes do início da aplicação** (`5af5ab0`).

- [Plano de produto e decisões pendentes](docs/plano-produto.md)
- [Referências de marca e conteúdo público](docs/referencias-marca.md)
- [Captação de pedidos, painel e SMTP](docs/captacao-pedidos.md)
- [Portal do cliente: decisões de acesso e segurança](docs/portal-acesso-e-seguranca.md)
- [Estado verificado e prompt do próximo passo](docs/proximo-passo.md)

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

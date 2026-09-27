# Grupo SEG System Segurança Integrada

Sistema em desenvolvimento para o Grupo SEG System. O **plano foi registrado em commit separado antes do início da aplicação** (`5af5ab0`).

- [Plano de produto e decisões pendentes](docs/plano-produto.md)
- [Referências de marca e conteúdo público](docs/referencias-marca.md)
- [Captação de pedidos, painel e SMTP](docs/captacao-pedidos.md)

## Prévia atual

As dez propostas visuais foram aprovadas. Por decisão atual, o **layout 06 — Azul em camadas** permanece como padrão, e a seleção administrativa/global dos dez temas fica adiada enquanto avançamos nos fluxos essenciais. As rotas `/layout-01` a `/layout-10` preservam as propostas para retomada posterior; `/layout-06` abre o conceito original. A aplicação **não está pronta para produção**.

O formulário integrado do layout 06 envia pedidos à API do servidor, que valida e tenta registrar os dados no PostgreSQL, tenta notificar por SMTP quando configurado e, após o registro, oferece continuidade pelo WhatsApp. Visitas permanecem solicitações — não são confirmadas automaticamente. O painel `/admin/leads` lista os pedidos e permite atualizar o status usando a sessão administrativa existente. **Este fluxo ainda não foi validado contra um PostgreSQL real neste ambiente**; é necessário configurar banco, credenciais e aplicar as migrações. Sem SMTP, a gravação continua independente e a interface informa o status de notificação. Portal autenticado, candidaturas, blog e outros módulos ainda serão construídos. A seleção administrativa/global de visuais está adiada; layout 06 permanece padrão e as demais propostas ficam preservadas para retomada. As demais áreas aparecem como “Em desenvolvimento”; não existe dado contratual fictício exposto como real. O `robots` está configurado como `noindex` durante a prévia.

A foto da viatura e o logotipo foram vistos na conversa, mas não estavam acessíveis nos caminhos de anexos informados pelo ambiente; o site usa ilustração e marca tipográfica provisórias até os arquivos estarem disponíveis em `public/brand/`. Antes de publicar, confirmar contatos, conteúdo, licenças, autorização de imagens e política de privacidade.

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

Para desenvolver os fluxos de pedidos, configure PostgreSQL e os segredos administrativos conforme [administração e configuração](docs/administracao-visual.md), copie `.env.example` para `.env.local` e execute `npm run db:up` e `npm run db:migrate`. Para alertas por e-mail, preencha `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` e `LEADS_NOTIFY_EMAIL` com os dados do serviço SMTP escolhido. Nunca versione credenciais. A autenticação por token é uma base inicial; concluir RBAC completo e 2FA antes da produção. Os ZIPs de download são snapshots estáticos e não incluem esta API.

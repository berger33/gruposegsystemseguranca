# Grupo SEG System Segurança Integrada

Sistema em desenvolvimento para o Grupo SEG System. O **plano foi registrado em commit separado antes do início da aplicação** (`5af5ab0`).

- [Plano de produto e decisões pendentes](docs/plano-produto.md)
- [Referências de marca e conteúdo público](docs/referencias-marca.md)

## Prévia atual

As dez propostas visuais foram aprovadas; o **layout 06 — Azul em camadas** foi escolhido como base para implementar o site público. A rota `/layout-06` mantém a prévia original do conceito e as demais propostas continuam disponíveis para comparação. A aplicação atual ainda é uma prévia e **não está pronta para produção**.

O formulário **não salva leads nem envia e-mails**: ele abre uma mensagem para o visitante revisar e enviar manualmente no WhatsApp. Portal autenticado, CRM, agendamento confirmado, candidaturas, blog, temas globais e o restante dos módulos ainda serão construídos. Essas áreas aparecem como “Em desenvolvimento”; não existe login ou dado contratual fictício exposto como real. O `robots` está configurado como `noindex` durante a prévia.

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
npm run typecheck
npm run build
```

Nenhuma chave de API, credencial ou banco de dados é necessária **nesta etapa de prévia**. Antes de implementar autenticação/CRM, definir banco PostgreSQL, armazenamento privado, 2FA, RBAC, auditoria, notificações e ambiente de homologação conforme o plano.

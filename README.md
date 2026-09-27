# Grupo SEG System Segurança Integrada

Sistema em desenvolvimento para o Grupo SEG System. O **plano foi registrado em commit separado antes do início da aplicação** (`5af5ab0`).

- [Plano de produto e decisões pendentes](docs/plano-produto.md)
- [Referências de marca e conteúdo público](docs/referencias-marca.md)

## Prévia atual

Primeiro incremento salvo: site público responsivo com a interface 01 (composição institucional aprovada pelo usuário) e seus fluxos de prévia. O **layout 02 — Central** está disponível em `/layout-02` para avaliação sequencial; os nove layouts seguintes só serão iniciados após aprovação de cada etapa. Inclui seis serviços citados no site atual, montagem de interesse, solicitação via WhatsApp e FAQ fixa. A foto da central é ilustração conceitual gerada, não instalação real da empresa. Esta aplicação **não está pronta para produção**.

O formulário **não salva leads nem envia e-mails**: ele abre uma mensagem para o visitante revisar e enviar manualmente no WhatsApp. Portal autenticado, CRM, agendamento confirmado, candidaturas, blog, temas globais e o restante dos módulos ainda serão construídos. Essas áreas aparecem como “Em desenvolvimento”; não existe login ou dado contratual fictício exposto como real. O `robots` está configurado como `noindex` durante a prévia.

A foto da viatura e o logotipo foram vistos na conversa, mas não estavam acessíveis nos caminhos de anexos informados pelo ambiente; o site usa ilustração e marca tipográfica provisórias até os arquivos estarem disponíveis em `public/brand/`. Antes de publicar, confirmar contatos, conteúdo, licenças, autorização de imagens e política de privacidade.

## Download das prévias

- [Layout 01 — prévia estática original (.zip)](downloads/seg-system-previa.zip). Extraia e abra `index.html`.
- [Layout 02 — Central (.zip)](downloads/layout-02-central-preview.zip). Extraia e abra `index.html`; `layout-01.html` permite comparar com o primeiro conceito.

Os ZIPs são **fotografias visuais desta etapa**, não o sistema completo nem versões para publicação. O layout 02 pode ser gerado com `npm run package:layout-02`; as prévias não têm backend, e o formulário somente abre uma mensagem para revisão e envio manual pelo WhatsApp.

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

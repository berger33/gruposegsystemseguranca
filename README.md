# Grupo SEG System Segurança Integrada

Sistema em desenvolvimento para o Grupo SEG System. O **plano foi registrado em commit separado antes do início da aplicação** (`5af5ab0`).

- [Plano de produto e decisões pendentes](docs/plano-produto.md)
- [Referências de marca e conteúdo público](docs/referencias-marca.md)

## Prévia atual — dez interfaces

A interface **01 Institucional clássica** (`/`) foi aprovada e preservada. As outras nove propostas visuais, com composição, hierarquia e personalidade distintas, estão em rotas próprias: `/tecnologia`, `/minimalista`, `/humano`, `/industrial`, `/corporativo`, `/editorial`, `/mobile`, `/indicadores` e `/campanha`. Todas compartilham os mesmos seis serviços informados no site atual, seleção de serviços, solicitação de orçamento/visita via link de WhatsApp e assistente de FAQ com respostas fixas. O seletor altera apenas a prévia local; a escolha persistente e global pelo administrador ainda será implementada.

Esta aplicação **não está pronta para produção**. O formulário **não salva leads nem envia e-mails**: abre uma mensagem para o visitante revisar e enviar manualmente no WhatsApp. Portal autenticado, CRM, agendamento confirmado, candidaturas, blog e demais módulos ainda serão construídos. Essas áreas aparecem como “Em desenvolvimento”; não existe login ou contrato fictício exposto como real. `robots` está configurado como `noindex` durante a prévia.

A foto da viatura e o logotipo foram vistos na conversa, mas não estavam acessíveis nos caminhos de anexos informados pelo ambiente; o site usa ilustração e marca tipográfica provisórias até os arquivos estarem disponíveis em `public/brand/`. Antes de publicar, confirmar contatos, conteúdo, licenças, autorização de imagens e política de privacidade.

## Download das dez interfaces

[Baixar prévia estática (.zip)](downloads/seg-system-previa.zip). Extraia o ZIP inteiro e abra **`ABRA-AQUI.html`**, que tem dez links independentes. Mesmo sem o seletor interativo, cada arquivo HTML abre a composição correspondente. O ZIP é uma **fotografia desta etapa**, não o sistema completo nem uma versão para publicação. Para recriá-lo: `npm run build:download` (requer Python 3). Recursos futuros com backend não funcionarão em exportação estática.

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
npm run build:download
```

Nenhuma chave de API, credencial ou banco de dados é necessária **nesta etapa de prévia**. Antes de implementar autenticação/CRM, definir banco PostgreSQL, armazenamento privado, 2FA, RBAC, auditoria, notificações e ambiente de homologação conforme o plano.

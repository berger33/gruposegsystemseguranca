# Grupo SEG System Segurança Integrada

Sistema em desenvolvimento para o Grupo SEG System. O **plano foi registrado em commit separado antes do início da aplicação** (`5af5ab0`).

- [Plano de produto e decisões pendentes](docs/plano-produto.md)
- [Referências de marca e conteúdo público](docs/referencias-marca.md)

## Prévia atual

Primeiro incremento: site público responsivo com composições **Institucional clássica** e **Tecnologia/monitoramento** (o seletor é uma prévia local, não uma configuração global), seis serviços informados no site atual, montador de interesse, solicitação de orçamento/visita via link oficial de WhatsApp e assistente de FAQ com respostas fixas. Esta aplicação **não está pronta para produção**.

O formulário **não salva leads nem envia e-mails**: ele abre uma mensagem para o visitante revisar e enviar manualmente no WhatsApp. Portal autenticado, CRM, agendamento confirmado, candidaturas, blog, temas globais e o restante dos módulos ainda serão construídos. Essas áreas aparecem como “Em desenvolvimento”; não existe login ou dado contratual fictício exposto como real. O `robots` está configurado como `noindex` durante a prévia.

A foto de viatura enviada na conversa não estava acessível no caminho indicado para anexos neste ambiente; o site usa ilustração conceitual até receber o arquivo original. Antes de publicar, confirmar contatos, conteúdo, licenças, autorização de imagens e política de privacidade.

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

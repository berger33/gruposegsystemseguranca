# Captação de pedidos públicos

## Fluxo implementado

1. O formulário do layout 06 coleta orçamento ou solicitação de visita, contato, local, serviços, preferência de visita e detalhes. A caixa de consentimento é obrigatória; há validação no navegador e no servidor.
2. `POST /api/leads` valida os dados, aplica limitação inicial de tentativas por endereço IP e tenta gravar o pedido em `public_leads` no PostgreSQL.
3. Após a gravação, o servidor tenta enviar um aviso por SMTP se as variáveis estiverem configuradas. Falha de e-mail não desfaz o pedido gravado; `email_status` é mostrado no painel.
4. O visitante recebe um link explícito para continuar no WhatsApp. Abrir o link não envia a mensagem sem ação da pessoa.
5. A equipe consulta `/admin/leads`, autentica com a sessão administrativa compartilhada com o módulo visual, e pode filtrar/atualizar status (`Novo`, `Em contato`, `Concluído`) e iniciar contato por telefone ou WhatsApp.
6. Pedidos de visita são somente solicitações. Uma pessoa da equipe deve verificar disponibilidade e confirmar com o cliente.

## Preparação local

1. Copie `.env.example` para `.env.local` e preencha PostgreSQL e segredos administrativos conforme `docs/administracao-visual.md`. Nunca coloque segredos em Git, no navegador ou em mensagens.
2. Com Docker disponível, inicie o PostgreSQL local com `npm run db:up`. A porta de desenvolvimento está vinculada a `127.0.0.1`.
3. Aplique as migrations idempotentes (aparência e captação) com `npm run db:migrate`.
4. Opcionalmente, adicione as credenciais SMTP ao `.env.local`:
   - `MAIL_HOST`: hostname fornecido pelo serviço SMTP.
   - `MAIL_PORT`: normalmente `587` para submissão com STARTTLS ou `465` para TLS implícito.
   - `MAIL_SECURE`: `true` para TLS implícito; para `587`, use `false` (o cliente SMTP pode negociar STARTTLS).
   - `MAIL_USER` e `MAIL_PASSWORD`: autenticação SMTP, quando exigida pelo serviço.
   - `MAIL_FROM`: remetente autorizado pelo provedor, por exemplo o formato de endereço indicado por ele.
   - `LEADS_NOTIFY_EMAIL`: caixa que deve receber os novos pedidos.
5. Execute `npm test` para validar os casos de entrada sem banco. Depois execute `npm run dev`, acesse o site e envie uma solicitação de teste usando dados próprios; consulte `/admin/leads`. E-mail ausente ou com falha aparece como status no pedido.

O percurso de banco **foi verificado** contra um PostgreSQL real. Um teste de integração (`npm run test:integration`) sobe a própria instância do servidor, aplica as migrações e confere envio do formulário, gravação em `public_leads`, recusas de mesma origem e de validação, sessão administrativa, listagem com filtro por status, mudança de status e o registro correspondente em `public_lead_status_audit` (inclusive a ausência de duplicidade quando o status se repete). As linhas criadas pelo teste são removidas ao final.

Esse teste é ignorado por `npm test` e só roda com `RUN_DATABASE_INTEGRATION=1`. Ele recusa bancos que não sejam de loopback, a menos que `RUN_DATABASE_INTEGRATION_REMOTE=1` seja definido, para não escrever em um banco de produção por acidente.

A **entrega real de mensagens por SMTP continua não verificada**: nenhum provedor foi escolhido, então `email_status` permanece `not_configured` nos pedidos gravados. As limitações atuais de rate limit em memória e autenticação administrativa inicial também precisam de endurecimento antes de expor em produção.

## Privacidade e operação

- Antes da produção, aprovar uma política de privacidade clara, finalidade e retenção dos dados, controles de acesso e rotina para solicitações de titulares.
- Leads contêm dados pessoais de contato. Use TLS, controle de rede e backup criptografado do PostgreSQL; limite o acesso às caixas de e-mail.
- Os logs do servidor não devem imprimir o conteúdo completo dos pedidos nem credenciais SMTP. Revise retenção e acesso aos logs do provedor.
- Não anuncie visita confirmada nem proposta/preço automático: o site apenas registra o pedido e encaminha a conversa para atendimento humano.
- Os ZIPs estáticos em `downloads/` não possuem esta integração com API e não devem ser usados para testar persistência.

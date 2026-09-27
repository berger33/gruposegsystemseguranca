# Área do cliente: acesso, convites e segurança

> Documento de preparação. **Não é política jurídica aprovada nem implementação de autenticação.** Separa decisões já confirmadas de propostas e perguntas que ainda precisam de resposta. Os protótipos em `/admin/portal/*` não guardam dados nem concedem acesso.

## Decisões confirmadas

- O portal começa **por convite**. A administração poderá escolher entre convite, solicitação de acesso com aprovação e autocadastro, quando esse módulo for implementado.
- A verificação do vínculo será feita pelo **cadastro central da empresa** antes de conceder acesso. O cadastro deve ser consultado por pessoa autorizada; esta decisão não significa que exista integração técnica pronta.
- **Marcelo e TI** podem aprovar solicitações, emitir convites e definir o escopo do acesso. O sistema deverá auditar essas ações.
- Convites terão validade de **7 dias**, serão de **uso único** e poderão ser revogados antes do uso.
- Após aceitar o convite, o cliente entrará com **senha + confirmação de e-mail**. O link de confirmação terá validade de **7 dias**; reenvio limitado a **5 vezes por endereço em 24 horas**, com intervalo mínimo de **2 minutos**, e cada novo link invalida o anterior.
- Recuperação de senha será por link enviado ao e-mail cadastrado, de **uso único** e validade de **1 hora**. A resposta pública deve ser genérica para não revelar se o e-mail tem conta.
- MFA será **opcional para clientes** no início do portal, com escolha entre **aplicativo autenticador** e **código por e-mail**. Não será exigida para nenhuma ação do portal; clientes poderão usar todas as funções sem ativá-la. Para recuperação, haverá **códigos de recuperação de uso único**; se o cliente perder todos, poderá pedir ajuda à equipe após verificação de identidade. A implementação, armazenamento seguro/visualização única dos códigos e processo de validação manual ainda precisam ser definidos antes da produção.
- O solicitante será notificado por **e-mail** sobre a decisão. Em caso de recusa, usar mensagem **genérica**, sem expor detalhes internos. Os textos da prévia são rascunhos e ainda precisam de revisão antes de uso real.
- O autocadastro, por si só, **não libera contratos nem documentos**. O vínculo do usuário com o cliente e o escopo autorizado precisam ser verificados no servidor.
- Não importar nem inventar cadastros, contratos, documentos ou clientes para a prévia.
- PostgreSQL, autenticação real, persistência das opções e notificações do portal permanecem para a etapa final, conforme a prioridade atual.

## Invariantes de segurança propostos

As regras abaixo são uma base técnica para discussão; não ativam comportamento sem aprovação e implementação:

1. **Negar por padrão:** ausência de sessão, vínculo ou permissão explícita resulta em acesso negado. Ocultar um botão não substitui autorização no servidor.
2. **Separar identidade de vínculo:** provar controle de um e-mail/telefone não prova, por si só, que a pessoa representa um cliente nem determina quais contratos pode ver.
3. **Escopo por cliente em cada requisição:** validar no servidor o usuário, a unidade/filial quando aplicável e o objeto solicitado. Não confiar em IDs enviados pelo navegador.
4. **Convites revogáveis e de uso limitado:** validade confirmada de 7 dias e uso único; emitir tokens aleatórios de alta entropia, armazenar somente hash quando possível, impedir reutilização e permitir revogação antes do aceite. Canal de entrega ainda não foi definido.
5. **Aprovação sem concessão excessiva:** uma aprovação deve registrar quem decidiu e limitar o acesso ao escopo expressamente autorizado; não deve liberar todo o conjunto de contratos por padrão.
6. **Revogação efetiva:** ao remover vínculo ou desativar acesso, revogar convites pendentes e encerrar sessões/credenciais associadas, segundo política definida.
7. **Auditoria mínima:** registrar emissão, reenvio, revogação, aprovação, recusa, mudança de permissão e autorizações administrativas, sem gravar senhas, tokens completos ou conteúdo desnecessário.
8. **Arquivos privados:** documentos não devem ficar em URLs públicas previsíveis; cada visualização/download deve passar por autorização no servidor.
9. **Privacidade e retenção:** coletar apenas dados necessários, definir prazos de retenção, processo de correção/exclusão e aviso de privacidade antes da ativação.
10. **Operação resiliente:** preparar backup, restauração testada, rotação de segredos, HTTPS e alertas de acesso indevido antes de produção.

## Decisões em aberto — não presumir valores

| Tema | Pergunta a decidir |
| --- | --- |
| Destinatário | Quais dados mínimos serão pedidos para convidar uma pessoa? Confirmar o endereço de e-mail pelo cadastro central antes de enviar; definir reenvio e tratamento de endereço incorreto. |
| Autenticação | Senha + confirmação de e-mail; MFA opcional por aplicativo autenticador ou código por e-mail, com códigos de recuperação e auxílio da equipe após verificação. MFA não será exigida para nenhuma ação do portal. Processo de troca de e-mail ainda deve ser definido. |
| Solicitação aprovada | Quem recebe a fila, quais estados existem e como o cliente é informado de aprovação ou recusa? |
| Autocadastro | Quais modos ficam habilitados por cliente/filial? Que prova de vínculo é exigida e quem resolve casos inconclusivos? |
| Escopo documental | Quais categorias de contrato/documento cada papel pode consultar e por quanto tempo? |
| Sessões | Duração, inatividade, dispositivos simultâneos e encerramento forçado após revogação. |
| Retenção e privacidade | Prazos para convites, pedidos recusados, auditoria e documentos; contato do controlador e texto final de privacidade. |
| Filiais | A autorização é por empresa, contrato ou unidade? Como evitar acesso cruzado entre filiais futuras? |

## Sequência de implementação quando a persistência voltar ao escopo

1. Confirmar as decisões acima e revisar política de privacidade/termos com o responsável.
2. Definir o modelo de dados PostgreSQL para identidades, vínculo com cliente/filial, convites, pedidos de acesso, permissões e auditoria — sem misturar dados de clientes.
3. Implementar endpoints com autorização por padrão negado, tokens armazenados com segurança, limitação de abuso e trilha de auditoria.
4. Implementar emissão/revogação de convite, fila de aprovação e autocadastro de acordo com os modos escolhidos.
5. Testar isolamento entre clientes, revogação, convites usados/expirados, recuperação e backups em homologação com dados sintéticos explicitamente identificados.
6. Só ativar o portal após testes de segurança, verificação de e-mail/notificações configuradas, backups e revisão operacional.

## Estado dos protótipos

- `/cliente`: página informativa; não autentica e não cria contas.
- `/cliente/recuperar-senha`: demonstra solicitação por e-mail com resposta genérica e link de uso único válido por 1 hora; não envia mensagem nem altera senha.
- `/cliente/seguranca`: demonstra a opção de MFA por aplicativo autenticador ou código por e-mail e recuperação com códigos de uso único/ajuda da equipe; não ativa MFA nem gera códigos reais.
- `/admin/portal`: compara os três modos em memória.
- `/admin/portal/convites`: prévia sem envio de e-mail, token ou link real; permite simular estados do convite, confirmação e reenvio do e-mail em memória no navegador. Link de confirmação: validade definida de 7 dias; reenvio com limite, invalidando o link anterior (limite exato ainda pendente).
- `/admin/portal/solicitacoes`: sem registros; permite simular Marcelo ou TI como responsável, a consulta ao cadastro central, escopos e estados da análise. Também exibe rascunhos de e-mail de aprovação e recusa genérica; não envia mensagens. As interações são locais e não alteram permissões.
- `/admin/portal/autocadastro`: estados demonstrativos; não coleta dados nem libera acesso.

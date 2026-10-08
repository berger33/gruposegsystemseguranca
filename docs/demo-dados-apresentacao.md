# Dados fictícios para apresentação do sistema

Este roteiro descreve a massa `DEMONSTRAÇÃO FICTÍCIA` criada apenas na primeira inicialização do banco local isolado. Ela existe para mostrar telas e percorrer rotinas sem usar clientes, funcionários, contatos, endereços, documentos ou decisões reais. O banco operacional Docker e qualquer banco externo ficam fora desse processo.

## Inicialização e acesso

Use Node.js 22 e execute `npm run demo:local:init` em uma cópia limpa do projeto, sem `.env.local`, `.env` ou variáveis de conexão herdadas. O comando cria PostgreSQL e documentos em `%LOCALAPPDATA%\GrupoSEG\seg-system-demo-v1`, aplica as migrations presentes no repositório e escolhe uma porta web local livre. Abra o endereço `DEMO_LOCAL_READY` mostrado no terminal. As portas são escolhidas novamente em cada início; consulte o terminal após `npm run demo:local:start`.

Na primeira execução, o terminal imprime senhas aleatórias de uso da demonstração para TI, RH, Marcelo, Admin, Comercial, Financeiro, Supervisor, funcionário e duas contas de cliente. Elas não são gravadas em texto claro nem exibidas outra vez. Anote-as em local privado. Os e-mails terminam em `example.invalid`; são endereços deliberadamente impossíveis de receber e-mail. Não grave senhas, cookies ou links de convite neste repositório.

## Rotinas preenchidas

- **Marcelo e comercial:** duas empresas fictícias, contatos sem telefone, duas oportunidades em etapas diferentes, histórico de etapas, tarefas abertas e interações simuladas. O A/B aparece como rascunho e não contém tráfego, observações ou conclusão. Uma despesa fictícia fica pendente; nenhuma baixa ou pagamento é registrado.
- **RH e funcionário:** cadastro sintético, uma marcação manual demonstrativa e um pedido de correção pré-carregado como `solicitado`. Entre com a conta do funcionário para mostrar a jornada e o pedido; em outra sessão, RH pode consultar, aprovar ou rejeitar. A marcação não contém coordenadas, endereço, comprovante ou prova de GPS.
- **Compliance:** uma obrigação de exemplo, uma referência privada declarada sem arquivo, uma tarefa e um plano preventivo em aberto. Isso não representa lei, licença, certificado, validade confirmada ou parecer jurídico.
- **Conhecimento, expansão e continuidade:** um artigo didático publicado somente no banco de demonstração, mais um plano de expansão e um plano de continuidade em rascunho. Nenhum plano foi aprovado ou testado por uma pessoa.
- **RAG:** índices e trechos separados para público, RH, Marcelo e cliente. O material é deliberadamente genérico; as duas referências de cliente ficam vinculadas a contas distintas e a API real filtra documentos pela conta autorizada. A publicação de conteúdo nesta base é um estado pré-carregado de demonstração, não um aceite humano nem política oficial.
- **Operação:** uma ocorrência de baixa gravidade, identificada como fictícia e sem localização real.
- **Clientes:** Empresa A e Empresa B fictícias, usuários separados e contratos planejados sem preço ou assinatura; o escopo de uma conta não deve revelar os registros da outra.
- **Aparência do site:** acesse `/admin/aparencia` (ou TI → Aparência do site) para comparar desktop/celular e aplicar um dos dez layouts. A aplicação precisa de permissão `site.visual.write`, confirmação e motivo, e fica registrada na auditoria. A rota antiga `/admin/visual` redireciona para a galeria.

## Como apresentar sem induzir o público ao erro

Mostre a faixa e os rótulos de demonstração, diga que se trata de massa sintética e use as ações com os atores fictícios separados. O pedido de ponto pode ser aprovado ou rejeitado pelo RH como exercício; isso registra uma decisão de demonstração no banco local. Não apresente esse evento como aprovação de um funcionário real. Não simule GPS: para validar geolocalização, use o navegador com a localização real autorizada e condições HTTPS/localhost.

O runner local mantém Ollama desativado por padrão. Os textos e fontes RAG ficam disponíveis para curadoria e verificação de escopo, mas a geração por LLM exige habilitar e validar uma instância Ollama local; o fallback de demonstração não deve ser apresentado como resposta de modelo. SMTP, WhatsApp, pagamentos, tráfego/conversões, assinatura, contatos externos e hospedagem não são executados.

Nem toda tela deve parecer preenchida à custa de inventar dados sensíveis ou fatos operacionais. Folha salarial, saúde ocupacional, documentos legais, presença GPS, ocorrências graves, pagamentos, aceite de pessoas, evidências de cliente e resultados analíticos permanecem sem registros fictícios. Use os fluxos da própria interface para criar outros exemplos durante a gravação, sempre com rótulo explícito de demonstração.

## Persistência e isolamento

O seed executa uma vez e é idempotente: reiniciar usa o mesmo banco e não troca senhas nem duplica exemplos. Ele recusa adotar banco com identidades, empresas ou funcionários preexistentes e valida o identificador privado da instalação. Para recomeçar, use uma instalação isolada nova depois de revisar e guardar os dados que deseja preservar; nunca apague uma pasta de demo existente às cegas. A aplicação escuta apenas em `127.0.0.1`, sem túnel público, SMTP ou dados externos.

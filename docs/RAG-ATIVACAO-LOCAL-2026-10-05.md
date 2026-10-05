# Ativação local do RAG — registro sem segredos

Em 05/10/2026, a PR #145 foi integrada à `main`. O banco de demonstração do
operador estava em 156 migrações e recebeu um backup custom PostgreSQL no F:
antes da atualização. O primeiro upgrade aplicou 157–159 e parou na 160: a
tabela `auth_permissions` da migração 010 não gerava UUID para `id` quando
havia identidades staff reais. Nenhuma migração 160 foi registrada parcialmente.

A correção mantém 001–173 imutáveis. O migrador atribui o default
`gen_random_uuid()` na **mesma transação** da migração 160 quando ela ainda não
foi aplicada; a migração aditiva 174 fixa o default também em bancos que já
haviam passado pela 160. O upgrade local então chegou a 174/174, com checksum
para todas as entradas; a segunda execução foi idempotente (exit 0).

O arquivo de ambiente, backup, logs e credenciais permanecem fora do GitHub em
`F:\SegSystem-Operacao`. Nunca publicar seu conteúdo. Para demonstrar o RAG:

1. Inicie o servidor a partir da `main` atual, com o banco e Ollama locais.
2. Entre com perfil autorizado em `/admin/ti`. Publique os índices necessários.
3. Instale o texto fictício de cada área pelo painel. Para cliente, selecione
   a conta de demonstração; cada conta precisa do próprio documento.
4. Faça perguntas pertinentes e impróprias em cada perfil e confira as fontes.
5. Substitua os textos fictícios por documentos oficiais antes de uso real.

O banco PostgreSQL e o Ollama devem ficar em loopback. O link externo é uma
etapa separada, após validação local de sessões, permissões e backup.

# QA-HOM-010 — Demonstração local com acesso externo temporário

**Data:** 2026-10-08  
**Ambiente:** Windows do proprietário, checkout `main` em `97b62e4` mais a opção local de Ollama registrada neste commit.  
**Escopo:** aplicação completa de demonstração, PostgreSQL embutido, massa fictícia, Qwen3 local e Quick Tunnel. Não é produção nem aceite de usuários.

## Resultado observado

- Runner persistente iniciou PostgreSQL e validou o ledger de migrações `001–180`; o cluster ficou em loopback e isolado da base anterior.
- A massa de apresentação foi carregada: 2 empresas fictícias, 2 oportunidades, 2 tarefas, 2 interações, 1 ajuste de ponto pendente, 1 obrigação e 1 tarefa de compliance, 1 artigo, 1 rascunho de expansão, 1 de continuidade, 1 despesa pendente, 1 ocorrência, 4 índices RAG/5 documentos e 1 rascunho de analytics.
- `qwen3:1.7b` estava disponível no Ollama local. A opção explícita `SEG_LOCAL_DEMO_OLLAMA=1` fixa `OLLAMA_BASE_URL` em `http://127.0.0.1:11434`; o padrão continua desligado.
- Consulta pública compatível com o documento fictício respondeu `200`, `ollama_used=true`, `model=qwen3:1.7b` e uma fonte aprovada. Pergunta sem correspondência retornou orientação de não encontrado, sem chamar o modelo.
- Pela URL pública temporária, `/`, `/admin/entrar` e `/api/health/live` responderam `200`; sessão administrativa anônima retornou `401`. A tela de login abriu no navegador.
- Um Quick Tunnel conectou ao serviço loopback por HTTPS; a URL é temporária e não foi registrada neste arquivo.
- Verificação leve da mudança do runner: `node --check scripts/local-demo.mjs` e `node --test tests/local-demo-guards.test.mjs` (2/2 aprovados).

## Limites

- SMTP e envio de e-mail continuam desligados; fluxos que dependem de entrega real de e-mail não foram validados.
- As contas são fictícias, usam e-mails `example.invalid` e credenciais temporárias. Não incluir estas senhas no repositório.
- O corpus é genérico de demonstração. Somente a consulta pública foi exercitada com Ollama; não representa validação de precisão de todas as áreas nem aceite de RH/Marcelo.
- O seed não cria marcações GPS (`gpsPunches=0`). Geolocalização precisa de consentimento e permissão explícitos no navegador; endereço geocodificado e acurácia devem ser conferidos pelo operador.
- Não foram executados testes completos por módulo, benchmark, restauração, envio SMTP nem aceite operacional. Não inserir dados reais nesse túnel.
- O Quick Tunnel é acessível a qualquer pessoa que possua o link e só permanece ativo enquanto o PC, a aplicação, o banco e `cloudflared` estiverem ligados.

# Aceite técnico antes da próxima instalação

Resultados devem ser reais e associados a SHA. Não marcar caixa antecipadamente.

- [ ] main reconciliado com PRs e 222 IDs; divergências documentadas.
- [ ] build e typecheck passam; unitários passam em ambiente suportado; casos Windows/symlink exercitados, não omitidos.
- [ ] migrador oficial aplicado em PG17 novo; segunda execução sem reaplicar; checksum e quantidade compatíveis com main atual.
- [ ] migration upgrade em cópia de banco existente preserva dados; backup restaurado em instância separada e consultado.
- [ ] login individual, senha inválida, conta suspensa, sessão expirada, logout/replay e redirecionamento por papel verificados no navegador.
- [ ] Marcelo, RH, funcionário e clientes A/B veem somente dados autorizados; 401/403 e ausência de efeitos após tentativa negada.
- [ ] jornadas F03 exercitadas por UI→API→PG; erro de API aparece na tela; ausência de dados não vira indicador inventado.
- [ ] cada EXT pendente possui prova ou exclusão/dependência explícita; nenhum componente órfão contado como tela entregue.
- [ ] IA real distinguida de fallback; fonte autorizada, injeção de prompt, base vazia, isolamento A/B, timeout e carga CPU medidos.
- [ ] jobs com identidade ativa e intervalo aprovados; suspender identidade impede escrita; reinício não duplica evento/tarefa; verificar atraso quando PC fica desligado.
- [ ] no EXT07: uma obrigação fictícia vencida produz tarefa com autoria TI; primeira avaliação cria e segunda não duplica; ledger concluído e falha auditável. O teste local desta auditoria cobriu somente banco sem vencimentos.
- [ ] anônimo não lê /api/ext/compliance/schedule nem endpoints privados; sessão permitida recebe 200 e dados corretos.
- [ ] SMTP desligado não acusa e-mail enviado; filas/pendências e recuperação de acesso têm limite claro.
- [ ] servidor e PG somente loopback; acesso de demonstração via HTTPS validado; cookies Secure/HttpOnly/SameSite, CSRF e rate limit verificados atrás do proxy escolhido.
- [ ] start/stop/status Windows funcionam, sem duplicar processos e sem parar outros projetos; healthcheck e porta ocupada tratados.
- [ ] internet/PC desligado e reinício documentados; link temporário não anunciado como permanente. RAG com SSE exige solução compatível (Quick Tunnel não suporta SSE).
- [ ] nenhum segredo em GitHub, logs, screenshots, relatórios ou pacote de entrega; contas de demonstração têm senhas aleatórias individuais.
- [ ] aceite humano de Marcelo/Andreia/funcionário documentado só após resposta real; registrar rejeições e próxima ação.

Para cada execução guardar: data, SHA, ambiente, comando/cenário, esperado, observado, aprovado/reprovado, evidência sanitizada e limite. Emitir relatório final com itens impeditivos separados de melhorias opcionais. Falha de infraestrutura não prova falha de negócio, mas também não conta como teste aprovado.

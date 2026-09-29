# Continuação Arena — L04 após tarefas pessoais CRM-07

## Objetivo e fonte
Continue berger33/gruposegsystemseguranca, exclusivamente a partir do GitHub.
Leia docs/EXECUCAO-ENTREGA-LOCAL.md, PLANO-MESTRE-IMPLEMENTACAO.md, ESTADO-EXECUCAO-LOCAL.md, EVIDENCIAS-ENTREGA-LOCAL.md e CHECKLIST-ENTREGA-LOCAL.md.
O roteiro é L00–L10 e contém 222 requisitos. SMTP e hospedagem externa ficam fora. Não use cópia local desatualizada como base.
L04 permanece PARCIAL: não avance para L05 enquanto as lacunas combinadas não estiverem resolvidas ou houver mudança explícita de escopo.

## Patch desta continuação
PR #13: https://github.com/berger33/gruposegsystemseguranca/pull/13
Branch: codex/l04-crm-tarefas; base main 4aaa1d273d36eb2d9d34c7af49a0750c89753de6.
Este PR não foi mesclado automaticamente. Verifique seu estado e head atual. Se ainda aberto, incorpore o patch revisado à branch atribuída pelo Arena, preservando mudanças concorrentes; não faça reset para a base histórica. Merge em main depende da autorização vigente do proprietário.

Implementado:
- Botão Abrir tarefas em cada oportunidade de /admin/crm.
- Tarefas pessoais: criação com prazo, lista, filtro de vencidas, iniciar, concluir e cancelar.
- GET/POST /api/crm/opportunities/:id/tasks e PATCH /api/crm/opportunities/:id/tasks/:taskId.
- Identidade/empresa/autoria derivadas pelo servidor, sem IDs desses campos aceitos do navegador.
- Acesso: comercial/admin/Marcelo/TI, TODOS sujeitos a ser responsável da oportunidade, ou criador se ela não tiver responsável. Não há bypass administrativo. Tarefas listadas/alteradas só da própria identidade.
- Mesma proteção na lista de tarefas embutida no detalhe legado da oportunidade.
- Mutação e auditoria na mesma transação; falha da auditoria devolve erro e reverte.
- Alteração de status compara expected_status e bloqueia estado concorrente/repetido incompatível.
- Gate L04 ampliado com HTTP, PostgreSQL descartável e Chromium; workflow .github/workflows/l04-delivery.yml.
Criada 104-crm-task-audit.sql: a 103 não permitia crm_task_create/status, bloqueando a transação. A 104 preserva a expressão existente e acrescenta esses eventos. Manifesto e verificador atualizados para 001–104. Se precisar de schema, crie a próxima incremental disponível (105 se ainda livre), após revalidar outras branches.

O recorte NÃO conclui CRM-07, CRM-09 ou todo L04. Não inclui delegação/equipe, edição/reagendamento de tarefa, cadências automáticas, interação/anexos, agenda, carteira ou paginação (lista limitada a 200 por oportunidade). Não houve execução no computador do proprietário. Resultados remotos e limites estão em EVIDENCIAS-ENTREGA-LOCAL.md. Código 7bab313: Actions 36604855660 aprovou migrações 104/104, replay/checksum e gate L04 2/2 sem skips; Actions 36604855633 aprovou baseline. Documentação posterior não altera esse código.

## Próximo passo recomendado
1. Confira CI do head do PR #13 e leia a evidência. Preserve a jornada central L04 e o novo teste de tarefas. Corrija qualquer regressão concreta antes de ampliar.
2. Complete o próximo recorte CRM-07: histórico de interações (ligação/reunião/nota) por oportunidade, com formulário e lista conectados, autoria derivada da sessão, autorização consistente e auditoria transacional. Defina escopo pessoal/equipe de forma explícita, sem expor dados por uma rota alternativa.
3. Depois trate tarefas delegadas/reagendamento se necessário à rotina, CRM-08 agenda/visitas e CRM-09 cadências manuais; integre responsáveis e próximas ações. CRM-10 carteira continua pendente.
4. Feche PUB-02/05, CMS PUB-06, temas PUB-07, SEO PUB-08, pacote PUB-09 e métricas PUB-10; revalide CRM-01..06. Conecte componentes por domínio, nunca despeje tudo na página TI.
5. Só declare L04 concluído quando o checklist registrar a evidência de todos os itens, não pelo simples fato de haver componente/endpoint.

## Execução e testes
Trabalhe apenas na branch que o Arena atribuir, preservando alterações.
No sandbox do Arena: npm ci primeiro. Não instalar nem executar no computador do proprietário.
Use npm test, npm run typecheck, npm run build e npm run test:l04-delivery:pg.
O workflow novo executa L04 no GitHub; baseline executa tipagem, unitários, build e outros recortes. Não suponha que baseline já cobre L02/L03/staff integralmente. Rode regressões proporcionais ao código afetado e, no fechamento de lote, os gates de migrações/L02/L03.
Não rodar build simultaneamente ao gate Next dev. Confira next-env.d.ts/tsconfig.json após execução; descarte somente alterações automáticas comprovadas, preservando mudanças alheias.
Gates recusam DATABASE_URL/DATABASE_MIGRATION_URL externas; use PostgreSQL descartável. SQL é permitido para fixture/asserção/falha injetada, nunca como substituto do fluxo HTTP.
Chromium real sem --disable-web-security; usar o wrapper existente. Respeite hidratação no Next dev e capture currentTarget antes de await em handlers.
Teste perfil autorizado, outro usuário, outro papel, sem sessão, origem incorreta, entrada inválida, persistência após recarga, conflito e falha de auditoria. Não afrouxe expectativa para obter verde.
Não reexecute toda a investigação L00–L03 sem evidência de regressão. Não invente prova Windows: ela permanece L10.
Leia o hardware mais recente confirmado pelo proprietário nos documentos (há registro posterior de 16 GB, sem GPU); não redefina capacidade por fotografia antiga e não prometa desempenho sem medir.

## Disciplina de continuidade
Implemente um recorte por vez, valide, atualize os mesmos documentos de estado/evidência/checklist e registre commit.
Não substituir execução por novas séries de planos/relatórios. Não marcar o requisito completo quando só um subconjunto passou.
Mantenha limites de simuladores externos explícitos. Não enviar e-mail, mensagens, cobranças reais nem publicar produção.
Entregue ao proprietário: mudança concreta, SHA/PR, testes realmente executados, lacunas restantes e próximo passo. Deixe prompt de retomada atualizado.
Comece conferindo o PR #13 e execute a primeira tarefa elegível de CRM-07.

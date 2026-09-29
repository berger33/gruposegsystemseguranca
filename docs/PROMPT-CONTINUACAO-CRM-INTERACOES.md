# Continuação Arena — L04 após histórico de interações CRM-07

## Objetivo e fonte
Continue berger33/gruposegsystemseguranca, exclusivamente a partir do GitHub e da branch Arena.
Leia docs/EXECUCAO-ENTREGA-LOCAL.md, PLANO-MESTRE-IMPLEMENTACAO.md, ESTADO-EXECUCAO-LOCAL.md, EVIDENCIAS-ENTREGA-LOCAL.md e CHECKLIST-ENTREGA-LOCAL.md.
O roteiro é L00–L10 e contém 222 requisitos. SMTP e hospedagem externa ficam fora. Não use cópia local desatualizada como base.
L04 permanece PARCIAL: não avance para L05 enquanto as lacunas combinadas não estiverem resolvidas ou houver mudança explícita de escopo.

## Patch desta continuação
PR #14: https://github.com/berger33/gruposegsystemseguranca/pull/14 — aberto a partir da branch `arena/01a0ee3c-gruposegsystemseguranca` (que já continha o PR #13 mesclado em `ec450b6`), CI verde (L04 CRM delivery + QA baseline) e **mesclado em `main`** no commit `927cb8d469a9df98100bda42aa5a4197def3c0d5`. `main` e a branch Arena estão sincronizadas nesse mesmo commit; não há divergência pendente para resolver na próxima sessão.
Código validado: `7c56a6facb0a710a9bf112a998742205afe730c8` (conteúdo idêntico ao de `main` após o merge).

Implementado:
- `GET/POST /api/crm/opportunities/:id/interactions` (`src/server/crm-interaction-api.mjs`): histórico de interações por oportunidade, tipo restrito a `ligacao`/`reuniao`/`nota` nesta fatia.
- Mesma regra de propriedade das tarefas pessoais do PR #13: só o `responsible_id` da oportunidade, ou o `created_by_id` quando ela não tem responsável, lê/grava; comercial/admin/marcelo/ti sujeitos à mesma checagem, sem bypass administrativo.
- Autoria, empresa e vínculo de oportunidade sempre derivados no servidor; `occurred_at` opcional (padrão agora), aceita registro tardio, recusa data futura.
- Mutação e auditoria (`crm_interaction_create`) na mesma transação; falha de auditoria reverte (provado por controle negativo).
- UI `OpportunityInteractions.tsx` conectada em `/admin/crm`, ao lado de `OpportunityTasks.tsx`.
- Migração `105-crm-interaction-audit.sql`: amplia o CHECK de auditoria sem tocar 001–104; manifesto e verificador atualizados para 001–105. Próximo número livre para nova migração é **106**.
- Corrigido vazamento pré-existente (anterior a esta sessão, não introduzido por ela): a rota legada `GET /api/crm/opportunities/:id` devolvia `crm_interactions` de qualquer oportunidade a qualquer staff autenticado, sem checar propriedade. Agora aplica a mesma regra da rota dedicada.
- Novo teste em `tests/l04-delivery.integration.test.mjs` (HTTP + Chromium real + PostgreSQL descartável): criação, negações cruzadas, tipo/título/data inválidos, data futura recusada, persistência após recarga, rota legada sem vazamento, rollback de auditoria injetada.

O recorte NÃO conclui CRM-07. Não inclui: anexos/notas com upload; edição ou exclusão de uma interação já registrada (histórico é append-only por design desta fatia); vínculo com `contact_id` (coluna existe no schema, API não aceita ainda); tipos `email`/`whatsapp`/`visita`/`outro` (schema aceita, API desta fatia recusa); paginação (lista limitada a 200 por oportunidade, igual às tarefas); qualquer noção de equipe/delegação. `stages` e `visits` na mesma rota legada de detalhe continuam sem restrição de propriedade — risco residual anotado, não corrigido nesta sessão porque pertence a CRM-06/CRM-08, não a interações.

Resultados: `npm run test:unit` 186/186; `tsc --noEmit` 0 erros; `npm run test:migrations:pg` 105/105 com replay e checksum negativo, 504 tabelas; `npm run build` sucesso (72 rotas); `npm run test:l04-delivery:pg` 3/3, executado 7 vezes nesta sessão com 6/7 verdes (uma falha isolada sem repetição, tratada como ruído do sandbox — ver `EVIDENCIAS-ENTREGA-LOCAL.md` para o detalhe exato e não relaxe a investigação se ela se repetir). Consulte as evidências para os comandos exatos.

## Próximo passo recomendado
1. Confira o estado atual da branch Arena (deve estar em `927cb8d` ou à frente) antes de continuar; não recomece da base histórica do PR #13 nem do #14 — ambos já estão em `main`.
2. Amplie o histórico de interações OU avance para CRM-08, com uma destas prioridades (escolha uma por vez, não as duas simultaneamente):
   - **Opção A — fechar lacunas de interações:** anexo simples (reaproveitando o armazenamento privado do L02, com hash e autorização, não um upload novo do zero), edição/exclusão com auditoria própria, vínculo com contato, os tipos restantes (`email`/`whatsapp`/`visita`/`outro`), paginação real.
   - **Opção B — CRM-08 (agenda de visitas/reuniões):** responsável, participantes, confirmação, reagendamento e cancelamento sobre a tabela `crm_visits` já existente (migração 014); definir explicitamente se compartilha a mesma regra de propriedade de tarefas/interações ou se precisa de escopo de equipe (participantes múltiplos) — não decida isso silenciosamente, documente a escolha.
3. Depois CRM-09 (cadências manuais como tarefas, com opt-out e autorização explícitos antes de qualquer automação de mensagem) e CRM-10 (carteira: renovação, upsell, reativação, indicações, oportunidades sem próxima ação).
4. Feche PUB-02/05, CMS PUB-06, temas PUB-07, SEO PUB-08, pacote PUB-09 e métricas PUB-10; revalide CRM-01..06 campo a campo. Conecte componentes por domínio, nunca despeje tudo na página TI.
5. Considere corrigir o risco residual de `stages`/`visits` sem checagem de propriedade na rota legada de detalhe quando tocar CRM-06/CRM-08, para não deixá-lo aberto indefinidamente.
6. Só declare L04 concluído quando o checklist registrar evidência de todos os itens, não pelo simples fato de haver componente/endpoint.

## Execução e testes
Trabalhe apenas na branch que o Arena atribuir, preservando alterações.
No sandbox do Arena: `npm ci` primeiro. Não instalar nem executar no computador do proprietário.
Use `npm test`, `npm run typecheck`, `npm run build` e `npm run test:l04-delivery:pg`; rode `npm run test:migrations:pg` sempre que criar/alterar migração.
Não edite migrações já aplicadas (001–105); a próxima disponível é 106, mas confirme no disco antes de usá-la — outra branch pode já ter consumido esse número.
Não suponha que o baseline cobre L02/L03 integralmente; rode regressões proporcionais ao código afetado e, no fechamento de lote, os gates de migrações/L02/L03.
Não rodar build simultaneamente ao gate Next dev. Confira `next-env.d.ts`/`tsconfig.json` após execução; descarte somente alterações automáticas comprovadas (ex.: entradas de tipos geradas por diretórios de build de teste), preservando mudanças alheias.
Gates recusam `DATABASE_URL`/`DATABASE_MIGRATION_URL` externas; use PostgreSQL descartável. SQL é permitido para fixture/asserção/falha injetada, nunca como substituto do fluxo HTTP.
Chromium real sem `--disable-web-security`; usar o wrapper existente. Cuidado com o antipadrão de `<label>Texto<select>…</select></label>`: o texto das `<option>` filhas entra no nome acessível do rótulo e quebra `getByLabel(..., { exact: true })`; use `htmlFor`/`id` explícitos para campos `<select>`.
Teste perfil autorizado, outro usuário, outro papel, sem sessão, origem incorreta, entrada inválida, persistência após recarga, conflito e falha de auditoria. Não afrouxe expectativa para obter verde.
Não reexecute toda a investigação L00–L03 sem evidência de regressão. Não invente prova Windows: ela permanece L10.
Se o gate L04 falhar de forma isolada e não reproduzir em execuções consecutivas seguintes, registre a ocorrência e repita algumas vezes antes de investigar como defeito de código; se o mesmo ponto falhar de novo, trate como regressão real.

## Disciplina de continuidade
Implemente um recorte por vez, valide, atualize os mesmos documentos de estado/evidência/checklist e registre commit.
Não substituir execução por novas séries de planos/relatórios. Não marcar o requisito completo quando só um subconjunto passou.
Mantenha limites de simuladores externos explícitos. Não enviar e-mail, mensagens, cobranças reais nem publicar produção.
Entregue ao proprietário: mudança concreta, SHA, testes realmente executados, lacunas restantes e próximo passo. Deixe prompt de retomada atualizado.
Comece conferindo o commit `7c56a6f` na branch Arena e execute a primeira tarefa elegível da lista acima.

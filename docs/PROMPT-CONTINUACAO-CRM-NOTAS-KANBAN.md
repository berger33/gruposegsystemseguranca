# Continuação Arena — CRM-07 residual: notas internas + campo a campo de CRM-05/06

Data da retomada: 2026-09-29. Branch fixa da sessão:
`arena/01a0eef9-gruposegsystemseguranca`.

## Estado de entrada

- Base conferida: `ed50d22bf2e979bad898147e737306b2aab25463` (`main`, merge dos
  PRs #22 e #23) no início da sessão.
- L04 permanece parcial conforme `docs/ESTADO-EXECUCAO-LOCAL.md`; L05 não
  começa.
- Próxima migração livre confirmada no disco: **111**; 001–110 permanecem
  imutáveis (509 tabelas).
- Gate de entrada revalidado antes de escrever código: `qa-wave0-static` 5/5 e
  `test:l04-delivery:pg` **7/7** (uma execução de retomada; o fechamento exige
  duas consecutivas).
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, calendário/lembretes adicionais, hospedagem externa, Windows e aceite
  humano.

## Recorte escolhido

Lacuna 1 da lista: **CRM-07 residual** — revisão campo a campo do
kanban/tabela de oportunidades herdados de CRM-05/06 e **notas internas
dedicadas**. A revisão campo a campo revelou dois defeitos reais de borda que
esta fatia corrige (itens 9–11 abaixo): a rota de listagem/detail/PATCH de
oportunidades não aplicava a política pessoal já registrada para
tarefas/interações/visitas/cadências (qualquer sessão de staff lia e alterava
oportunidade de qualquer pessoa), e a auditoria dessas mutações engolia falha
com `try/catch` (mutação persistia sem trilha).

## Decisões de política registradas ANTES da rota

### A. Notas internas dedicadas (CRM-07)

1. **Nota interna é da oportunidade e segue a borda pessoal já registrada**:
   só o responsável atual, ou quem a criou enquanto sem responsável, lê e
   escreve. Outro comercial recebe 404 (a existência da oportunidade não é
   revelada); RH/financeiro recebem 403 (`commercial_role_required`, mesmo
   corte de papel de interações/visitas/cadências); admin/Marcelo/TI não têm
   bypass — a borda é de propriedade, não de papel.
2. **Nota interna nunca vaza**: não existe em superfície pública, no portal do
   cliente, no lead, no detalhe de empresa e em nenhuma exportação. O único
   caminho de leitura é a rota da própria oportunidade, dentro da borda do
   item 1.
3. **Corpo de 1 a 4000 caracteres**, com trim; vazio/whitespace é recusado com
   400. O banco repete a regra em CHECK (`char_length BETWEEN 1 AND 4000`) —
   defesa em profundidade, não só validação de API.
4. **Toda mutação de nota audita na mesma transação**: `crm_note_create`,
   `crm_note_update`, `crm_note_delete`. Falha de auditoria injetada reverte a
   mutação (fail-closed). Não existe `try {} catch {}` engolindo auditoria nas
   rotas desta fatia.
5. **Edição usa versão otimista** (`expected_version`) incrementada por gatilho
   do banco no padrão da migração 109 — nenhum caminho de escrita, presente ou
   futuro, esquece o incremento. Edição marca `edited_at`: nota é memória de
   trabalho interna e pode ser corrigida, mas nunca silenciosamente — a
   correção fica visível na linha e na trilha de auditoria.
6. **Exclusão é lógica** (`deleted_at`/`deleted_by_id`): os bytes e a linha
   ficam para auditoria e a nota some de todas as leituras normais. O CHECK de
   coerência exige os dois campos juntos ou nenhum. Nota excluída não volta.
7. **Só quem escreveu edita ou exclui a própria nota.** Nem o responsável pela
   oportunidade reescreve palavra de outro autor. Hoje não existe caminho de
   API para um segundo autor escrever nota na oportunidade alheia (a criação já
   é restrita ao dono); se tal linha existir por SQL, a regra segura é recusar
   (`note_author_required`), não moderar.
8. **Paginação real** (1–100, padrão 25, `offset`, `total`), no padrão das
   interações.

### B. Campo a campo de oportunidades — CRM-05/06 (kanban/tabela)

9. **A oportunidade em si passa a obedecer à política pessoal.** Listagem
   (`GET /api/crm/opportunities`), detalhe legado
   (`GET /api/crm/opportunities/:id`) e `PATCH` ficam restritos ao responsável
   atual (ou criador enquanto sem responsável). Antes desta fatia, **qualquer**
   sessão de staff autenticada — RH, outro comercial, qualquer papel — listava
   todas as oportunidades de todos (necessidade, valor, origem, motivo de
   perda) e podia mudar estágio/valor de oportunidade alheia. O kanban/tabela
   passa a ser pessoal: cada comercial vê só o próprio funil. Admin/Marcelo/TI
   sem bypass; a rota legada de detalhe deixa de ser atalho de leitura para
   participante de visita — o participante continua enxergando a própria
   visita pela própria agenda (`/api/crm/visits/agenda`), como já provava o
   gate. Empresas e contatos permanecem registro central compartilhado
   (CRM-01): visibilidade do cadastro não é visibilidade de oportunidade; as
   oportunidades no detalhe de empresa passam pelo mesmo filtro pessoal.
10. **Papel comercial é necessário, mas não é concessão**: as rotas de
    oportunidade exigem papel da família comercial
    (`comercial`/`admin`/`marcelo`/`ti`), igual a interações/visitas/cadências.
    RH recebe 403 antes mesmo da checagem de propriedade.
11. **CRM-05 completo em criação e manutenção**: criação aceita e valida todos
    os campos — serviço (`service_id` do catálogo ou `service_name` livre),
    necessidade (≤2000), **unidade** (precisa existir e pertencer à mesma
    empresa; criação de unidade segue sendo escopo de CRM-01), previsão
    (`forecast_date`), valor estimado (≥0), próxima ação e data, origem
    (≤100), campanha (≤100), prioridade (`baixa`/`media`/`alta`/`critica`).
    `PATCH` mantém serviço, necessidade, unidade, previsão, valor, próxima
    ação/data e prioridade. O campo **responsável** passa a ser gravado de
    verdade nos dois caminhos de criação: no POST direto e na conversão de
    lead (quem converte é o responsável desde o início; antes a conversão
    deixava `responsible_id` nulo e só o fallback "criador enquanto sem
    responsável" segurava a borda). O nome exibido vem de
    `auth_identities.display_name`, não do papel.
12. **Atribuição é imutável depois de criada**: `origin` e `campaign` nunca são
    editáveis (mudança retroativa corromperia a atribuição de PUB-03 e as
    métricas de origem/conversão de PUB-10). `responsible_id`/`responsible_name`
    também não são editáveis por PATCH — transferência de oportunidade não
    existe como política (delegação transfere tarefa, nunca oportunidade).
    Tentativa devolve 400 `field_not_editable`, fail-closed e explícito. O
    vínculo `public_lead_id` segue a decisão de CRM-08: é gerenciado pelo
    servidor (somente a conversão de lead cria a ponte) e o campo no corpo —
    em POST ou PATCH — devolve 400 `server_managed_fields`.
13. **CRM-06 — motivo de perda obrigatório agora também no banco**: além da
    validação de API, CHECK garante `stage='perdido' ⇒ loss_reason IS NOT NULL`
    e `loss_reason` só pode existir enquanto `perdido`. Os CHECKs novos entram
    como `NOT VALID` (aditivos): passam a valer para toda escrita nova sem
    reescrever linha existente do operador.
14. **Reabertura auditada (regra nova desta fatia)**: sair de `perdido` ou
    `ganho` para qualquer estágio aberto é reabertura — exige `reason`
    explícito (sem ele, 400 `reopen_reason_required`), grava a linha de
    histórico de estágio com esse motivo, audita a ação dedicada
    `crm_opportunity_reopen` e, ao sair de `perdido`, **limpa `loss_reason`**
    (o motivo antigo permanece no histórico de estágio, nunca é reescrito).
    Reabrir não toca proposta/contrato/dinheiro: `ganho` continua sendo estado
    de funil, nunca "dinheiro recebido".
15. **Flag não mente no banco**: `is_won = (stage='ganho')` e
    `is_lost = (stage='perdido')` viram CHECK (`NOT VALID`, aditivo) — as
    bandeiras não podem divergir do funil em escrita nova.
16. **Busca de oportunidades vira servidor com curinga escapado**: busca e
    filtro de prioridade passam a ser aplicados pela rota (já existiam lá) e a
    busca escapa `%`/`_`/`\` — `100%` é busca literal, mesma política já
    registrada para tarefas. A busca de empresas (CRM-01) fica fora desta
    fatia.
17. **Auditoria transacional nas mutações de oportunidade**: criação, mudança
    de estágio, reabertura e atualização de campos gravam `auth_access_audit`
    na mesma transação da mutação; falha injetada reverte. O auxiliar `audit()`
    de `crm-api.mjs` que engolia falha com `try/catch` deixa de ser usado pelas
    rotas de oportunidade. Rotas de empresa/contato/importação fora desta fatia
    continuam com o padrão antigo — risco residual declarado no estado, não
    ignorado.

### C. Ajustes de cenários preexistentes do gate (declarados, regra mais forte)

A regra nova do item 9 torna 404 (e não 200 com listas vazias) a resposta do
detalhe legado para identidade fora da propriedade. Cinco asserções
preexistentes eram `status 200` + lista vazia e passam a afirmar `404` — a
regra ficou **mais** restritiva, nenhuma proteção foi afrouxada:

- cenário CRM-07 tarefas: `otherDetail` (outro comercial) 200→404;
- cenário CRM-07 interações: `otherDetail` 200→404;
- cenário CRM-08 agenda: `strangerDetail` 200→404 e `participantDetail`
  200→404, com a visão do participante reafirmada pela própria agenda
  (`/api/crm/visits/agenda`), que continua sendo o caminho dele;
- cenário CRM-09 cadências: `otherDetail` 200→404;
- cenário CRM-07 delegação: `legacyDelegate` 200→404.

## Entrega deste recorte

- Migração **`111-crm-opportunity-notes-reopen.sql`** (aditiva): tabela
  `crm_opportunity_notes` com CHECK de corpo e de exclusão coerente, índice
  parcial, gatilho de versão otimista; CHECKs `NOT VALID` de coerência
  motivo/flag no funil; reafirmação do CHECK de `auth_access_audit` no padrão
  herdado (falha se a constraint pai sumir), acrescentando `crm_note_create`,
  `crm_note_update`, `crm_note_delete` e `crm_opportunity_reopen`.
- `src/server/crm-note-api.mjs`: rotas dedicadas de nota com auditoria
  transacional e versão otimista.
- `src/server/crm-api.mjs`: borda pessoal em listagem/detalhe/PATCH de
  oportunidades, corte de papel comercial, campos CRM-05 em criação e edição,
  imutabilidade de atribuição, reabertura auditada com motivo, busca no
  servidor com curinga escapado, auditoria transacional e notas no detalhe
  legado dentro da mesma borda.
- `src/app/admin/crm`: formulário de nova oportunidade com todos os campos de
  CRM-05, tabela/kanban exibindo os campos que faltavam (serviço,
  responsável, unidade, previsão, origem, motivo de perda), painel
  `OpportunitySummary.tsx` com manutenção de campos e movimentação de funil
  (motivo de perda/reabertura exigidos na UI) e `OpportunityNotes.tsx`.
- Gate: cenário 8 em `tests/l04-delivery.integration.test.mjs` + os ajustes
  declarados do item C.

## Evidência de retomada/fechamento

```bash
npm ci
node scripts/qa-wave0-static.mjs
npm run test:migrations:pg
npm run test:l04-delivery:pg   # 2x consecutivas
npm test
npm run typecheck
npm run build
git diff --check
```

## Próximo passo

Não iniciar L05. Continuam pendentes em L04: visão de calendário por
período/semana da agenda (CRM-08 residual; lembretes/notificações seguem
dependendo de provedor, autorização e opt-out), revalidação campo a campo de
CRM-01..04 (contato com função de CRM-02 segue sem tela dedicada), lacunas PUB
(PUB-02/05 e PUB-06..10 — componentes órfãos em `src/app/admin/ti/*Client.tsx`,
conectar por domínio) e CRM-10 (fora por decisão). Automação de mensagens
segue exigindo autorização, opt-out operacional e provedor.

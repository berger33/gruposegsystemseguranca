# UX-PRO-03 — Jornada aditiva do RH para reclamações compartilhadas

**Data:** 29/10/2026 · **Base:** `d9d011c9904783d5f240ed4fbefdd3e581996a59` (main, merge da PR #307) · **Branch da sessão:** `arena/50dc8432-gruposegsystemseguranca`.

**Natureza:** implementação local em avaliação de PR, com teste focal RED→GREEN e cenário PostgreSQL descartável + HTTP real + Chromium. Não é aceite humano, UAT, homologação nem autorização de produção. Produção permanece NO-GO.

## 1. Inventário e sonda antes de editar

`git fetch origin` confirmou `origin/main` em `d9d011c9904783d5f240ed4fbefdd3e581996a59`; a branch estava limpa e já apontava para esse SHA, portanto nenhum reset foi necessário. Foram lidos, na ordem pedida, `AGENTS.md`, `README.md`, este status, o registro anterior da promoção CLI-15, o gate de produção e os quatro pontos de código/dispatch/UI.

A auditoria identificou que a rota legada `PATCH /api/admin/employee-complaints` aceita RH, mas em PostgreSQL ainda responde `500 internal_error` (42P08) e contém `RETURNING *`; uma liberação genérica poderia expor campos de reclamação não compartilhada. A rota administrativa existente lista para RH somente relatos compartilhados e usa projeção mínima; o detalhe nega relato não compartilhado. Mensagens e evidências, em rotas separadas, filtram `is_hr_visible` por item, mas não verificam `is_shared_with_hr` da reclamação.

**Sonda pré-edição real:** `UX_PORTAL_TEST_PATTERN='browser UX-PRO-03: reclamações de colaboradores' AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x node scripts/qa-ux-portal-postgres.mjs` aplicou 001–181 num PostgreSQL temporário e executou o cenário anterior com Chromium: **1/1**. O registro dessa sonda confirmou o 500 legado de RH sem escrita, o acesso de TI às rotas legadas e os 403 de comercial. O banco temporário foi descartado.

Antes da implementação, foi adicionado `tests/ux-pro-03-rh-reclamacoes-compartilhadas.test.mjs` ao `test:unit`; sua primeira execução foi **RED real 0/4** (componente e handler novos ausentes). Após a implementação, ficou **GREEN 4/4**. A asserção antiga do 500 legado não foi apagada, alterada ou afrouxada.

## 2. Solução entregue nesta fatia

Foi criada uma API aditiva, com despacho próprio, sob `/api/admin/hr/employee-complaints` e `/:id`; não substitui nem muda consumidores da API legada. Cada chamada verifica mesma origem, sessão e papel no servidor. O endpoint permite somente `rh`, `admin` e `ti`; `comercial` e `marcelo` recebem 403. O `AdminGate` da página RH permaneceu sem alteração (`rh|marcelo|admin|ti`): a API não herda esse gate visual nem autoriza Marcelo por ele.

- **Lista e detalhe:** consultas nomeiam as colunas da projeção mínima já existente (id, protocolo, categoria, severidade, situação, flags mínimas e datas); sem `SELECT *`.
- **Campos adicionais:** somente `title` e `minimal_description` gravados em compartilhamentos explícitos são consultados e retornados como `sharedFields`. Valor/justificativa de outros campos, relato integral, referência em claro, hash, conta, identidades, mensagens e evidências não entram na resposta do novo contrato. A interface só aceita arrays e nomes de campo permitidos.
- **Atualização:** aceita exclusivamente os sete estados já permitidos pelo servidor e exige motivo de 10–1000 caracteres e `expected_status`. `SELECT … FOR UPDATE` serializa concorrência; uma situação desatualizada recebe 409 sem gravar. `UPDATE … RETURNING` enumera colunas da projeção mínima, nunca `RETURNING *`.
- **Histórico e auditoria:** atualização, linha imutável em `cli_employee_complaint_history` e evento `audit_log` (ação canônica `cli_complaint_status`) são escritos na mesma transação PostgreSQL. O motivo vai para o histórico e o resumo limitado do motivo compõe o meta da auditoria. Falha de escrita retorna 503 genérico.
- **Rollback provado:** o cenário PostgreSQL cria somente no cluster descartável um trigger sintético que falha no INSERT do audit_log para um registro de prova; a API devolve 503 e a situação, o histórico e a auditoria permanecem inalterados. Trigger/função e cluster são removidos ao fim.

A nova aba **“Reclamações compartilhadas”** foi integrada aditivamente a `/admin/funcionarios`; as oito abas e os componentes RH existentes permanecem. A tela apresenta lista, detalhe e atualização com motivo; carregando, vazio, erro, negado, conflito e retry; proteção de sequência para detalhe/lista; validação de payloads/arrays; mensagens traduzidas; rótulos, anúncio de estado e foco visível; layout responsivo. Foram medidos 320, 390, 768 e 1440 px no navegador.

## 3. Provas e preservação de contratos

O cenário novo `browser UX-PRO-03 RH: reclamações compartilhadas…` executa contra PostgreSQL 17 descartável e HTTP real, com identidade e massa sintéticas, e Chromium. Prova:

- RH lista e abre só relato compartilhado; recebe 404 ao tentar ler/alterar um não compartilhado.
- Relato A compartilha título e descrição mínima explicitamente; ambos aparecem. A descrição integral, referência/hash, conta e identidades não aparecem. Relato B, sem título/resumo explicitamente compartilhados, não mostra esses campos; alternar A→B limpa o detalhe antigo e resposta de A atrasada não substitui B.
- Comercial e Marcelo recebem 403 na nova API; comercial também é negado na escrita.
- `admin|ti` seguem criando e atualizando pela rota legada com o mesmo corpo completo de resposta. A asserção de regressão mantém o **500** legado no PATCH de RH e confirma que esse request não altera situação; a interface nova usa outra rota.
- O formulário realiza PATCH HTTP real com situação e motivo; resposta **200**, situação e corpo conferidos, e linhas reais de histórico/auditoria conferidas no PostgreSQL.
- Falha de auditoria produz 503 e rollback de estado, histórico e audit_log; o browser recebe 503 simulado, exibe erro diferente de vazio e retry recupera a lista real.
- Rótulos associados e ausência de overflow em **320/390/768/1440 px**.

O teste focal está explicitamente no `test:unit`. A alteração não incrementa `EXPECTED_TABS` nem `PROMOCOES_COM_PROVA`: continua sendo a 10ª promoção do console de TI; esta PR não promove aba nem órfão do TiConsole.

## 4. Limites que permanecem abertos

- A rota legada do PATCH RH continua com 500 e sem alteração; foi preservada por compatibilidade e para não reabrir o vazamento. Consumidores legados não obtêm a jornada nova sem migrarem para a rota aditiva.
- As rotas separadas de mensagens e evidências continuam verificando `is_hr_visible`, mas **não** o compartilhamento do relato. Essa dívida de autorização/privacidade não foi corrigida nem restringida nesta entrega; a nova interface não chama essas rotas.
- A leitura administrativa de TI permanece global conforme o contrato legado; esta fatia não altera o escopo existente.
- Não há upload, bytes de evidência, anonimização, remoção de referência, revisão jurídica, leitor de tela/UAT/aceite humano nem produção. F02, backup real, B2 e provedores continuam pendentes do proprietário.
- Migrações 001–181 não foram alteradas/criadas; próxima livre continua 182. `EXPECTED_TABS`/`PROMOCOES_COM_PROVA` não foram alterados. Os geradores de inventário foram usados para regenerar somente artefatos que ficaram desatualizados; os números de TiConsole e a fila de 222 permaneceram iguais.

## 5. Verificações

Preencher após a bateria final desta branch:

- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test`: **1215/1215**, 0 falhas, 0 skips.
- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm run test:unit`: **1215/1215**, 0 falhas, 0 skips; o arquivo focal é explícito no script.
- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm run typecheck`: **0 erros**.
- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm run build`: **106/106** páginas geradas.
- `node scripts/qa-wave0-static.mjs`: **5/5**.
- `node scripts/ux-pro-03-ti-inventory.mjs --check`: **OK**, 84 componentes, 23 abas com prova, 36 órfãos, 10 promoções (inalterado).
- `node scripts/requisitos-222-inventory.mjs --check`: **OK**, 222 IDs, 20 `a_revalidar` sem gate e 0/222 aceite humano.
- `node scripts/ux-pro-00-inventory.mjs --check`: **OK**, 101/101 rotas com gate.
- `node scripts/ux-pro-10b-contrast-inventory.mjs --check`: **OK**.
- `npm run reaudit:sec`: **35/35** âncoras; 3 artefatos conferem.
- `npm audit --audit-level=moderate`: **0 vulnerabilidades**.
- `node scripts/qa-ux-portal-postgres.mjs`: **48/48**, 0 falhas, 0 skips; inclui o cenário novo de RH.
- `npm run test:ux-hr:pg`: **20/20**, 0 falhas, 0 skips. A prova preserva o teclado das abas anteriores e confirma `End` na aba aditiva nova, além de confirmar que o painel legado aninhado continua montando corretamente.
- `git diff --check`: limpo.
- SHA-256 `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.
- Nenhuma migração foi criada/alterada; 001–181 permanecem imutáveis, próxima livre 182.

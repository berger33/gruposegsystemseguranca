# UX-PRO-E2 — relatório de implementação

**Data:** 19/10/2026  
**Base:** `dd9a4befc3fd8ec9ebdcc3823af3bdc3eb882e95`  
**Escopo anterior:** [UX-PRO-E2-ESCOPO-ANTES-2026-10-19.md](UX-PRO-E2-ESCOPO-ANTES-2026-10-19.md)

## Resultado

As 13 chamadas bloqueantes a `prompt()` foram removidas de `OpsAdvanced2Client.tsx` e `OpsAdvanced3Client.tsx`. As onze decisões correspondentes agora abrem o componente compartilhado `UiActionDialog`, usado nas seis abas legadas de `/admin/operacao` e também alcançável pela composição histórica de `/admin/ti`.

O diálogo fornece:

- título e descrição associados semanticamente;
- `<label>` persistente para cada campo;
- indicação e validação de campos obrigatórios após remoção de espaços externos;
- foco inicial no primeiro campo;
- cancelamento por botão ou Escape, bloqueado durante o envio;
- estado `aria-busy`, bloqueio de submissão duplicada e texto “Salvando…”;
- erro de validação ou API junto ao formulário, anunciado com `role="alert"`;
- campos multilinha para notas e limites explícitos de tamanho;
- alvos de ação de 44 px, foco visível, responsividade e tokens administrativos para dia/noite.

## Contratos preservados

Não houve mudança em servidor, banco, migrações, RBAC, autenticação ou auditoria. URLs, métodos e payloads das onze ações permanecem iguais, inclusive:

- estados `pendente_verificacao`, `verificado`, `visitado`, `em_revisao`, `aprovado`, `em_analise`, `publicado`, `reconhecido`, `em_tratamento` e `resolvido`;
- motivo canônico da publicação após revisão humana dos conflitos;
- nota canônica de encerramento do evento sintético sem despacho externo;
- campos opcionais de notas enviados como string vazia, como ocorria antes.

## Cobertura adicionada

`tests/ux-pro-e2-action-dialog.test.mjs` impede o retorno de `prompt()`/`confirm()` nos dois consumidores, exige as onze configurações de ação e confere os contratos semânticos e de estado do diálogo. O teste foi incluído no gate unitário padrão de `package.json`.

O inventário reproduzível foi regenerado porque `/admin/ti` passou a alcançar o novo componente compartilhado; nenhuma rota ou classificação de evidência mudou.

## Verificações

- `npm run typecheck`: aprovado;
- `npm run build`: aprovado, 105 páginas geradas;
- `node scripts/qa-wave0-static.mjs`: 5/5 aprovado;
- `node scripts/ux-pro-00-inventory.mjs --check`: aprovado, 100 rotas;
- teste focal E2 + regressões E5/E6 + inventário: 11 testes aprovados;
- `git diff --check`: aprovado.

A execução inicial de `npm test` encontrou somente os três testes de inventário desatualizados após a introdução legítima de `UiActionDialog`. Os CSVs foram regenerados; a repetição final do gate é registrada no estado da entrega.

## Limites

A prova focal desta fatia é estática e de compilação. Não registra captura de navegador, teste com leitor de tela, validação manual, aceite humano ou conformidade WCAG. Os demais campos antigos das abas ainda baseados apenas em `placeholder` continuam fora deste recorte e devem ser tratados em uma fatia própria, sem ampliar retroativamente E2.

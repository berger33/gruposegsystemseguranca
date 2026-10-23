# UX-PRO-05 — leitura honesta de Documentos no RH (escopo antes)

**Data:** 2026-10-23 (UTC)

**Base:** `main` / `origin/main` `95ac2ed0ca95a66213263eb4375396e8dc87d033` (merge da PR #295).

**Estado do repositório:** branch de sessão sincronizada com `origin/main` (0/0), árvore limpa, nenhuma PR aberta.

**Workflows vigentes na base:** `QA baseline` run `39891329607` e `PostgreSQL 17 backup and restore gates` run `39891329661`, ambos concluídos com sucesso e todos os steps verdes. As falhas de runs mais antigos pertencem a SHAs anteriores e não são falhas ativas desta base.

**Superfície única:** `/admin/funcionarios` → aba `Documentos`, montada por `src/app/admin/funcionarios/RhWorkspace.tsx`.

## 1. Reconciliação com o código e a matriz

A matriz `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` registra evidências históricas da rota, não uma certificação do código atual nem aceite humano. As entregas #292, #293 e #295 foram confrontadas com `src/app/`; não serão reimplementadas. O resíduo expressamente deixado por `docs/UX-PRO-05-PONTO-AJUSTES-RH-RESULTADO-2026-10-23.md` continua presente:

- `RhWorkspace.tsx:112–115` possui estado próprio para solicitações, mas somente `docs` para documentos: não há `loaded`, `loading` ou descritor de erro da leitura de documentos.
- `RhWorkspace.tsx:127–156` consulta visão geral, documentos e solicitações. Em `:153`, `setDocs(d.ok ? d.data.documents || [] : [])` descarta a última lista conhecida em qualquer falha de `GET /api/admin/hr/l03/documents`.
- `RhWorkspace.tsx:322` monta `<Documents docs={docs} run={run} />` sem informar carregamento, conclusão da leitura, erro ou repetição.
- `RhWorkspace.tsx:833–845` transforma `docs.length === 0` em `UiState` de vazio, mesmo quando o array vazio resultou de erro. Assim, falha inicial aparece como “Nenhum documento no seu escopo”; falha posterior apaga documentos já carregados.
- A aba de `Solicitações` já possui tratamento independente análogo e os componentes compartilhados `UiState`, `hrErrorVariant` e `hrErrorFootnote` já existem. Não é necessário criar arquitetura nem alterar contrato.

A lacuna é, portanto, confirmada no código montado, e não inferida somente de documento antigo ou da ausência de capturas na matriz.

## 2. Contratos e comportamento a preservar

- Manter `GET /api/admin/hr/l03/documents` e a leitura de `{ documents }`, além dos já existentes `POST` e `PATCH`, campos, payloads, cabeçalhos e cookies de sessão. Não acrescentar `Idempotency-Key` a uma operação que não a possui nem alterar a que já a exige em outras superfícies.
- Manter aprovação, rejeição com motivo, download privado, publicação de holerite e a releitura após mutações.
- Manter `employees.read` / `employees.write`, concessões `organization/global` para a listagem ampla, escopo de remuneração, autenticação, RBAC, `audit_log`, isolamento e falha fechada no servidor. O handler atual em `src/server/employee-api.mjs:704–758` não será editado.
- Não alterar `/funcionario`, `Ponto e ajustes`, `Solicitações`, `Fechamento e holerite` ou componentes legados; não promover telas órfãs. Não haverá migração SQL nem mudança nas migrações `001–180`.
- Não editar a matriz/CSVs históricos nem as contagens do inventário de 100 rotas.

## 3. Implementação delimitada

1. Acrescentar estado de leitura exclusivo de documentos no `RhWorkspace`: resposta recebida, consulta em andamento e `HrErrorDescriptor`.
2. Em resposta `200`, substituir a lista somente pelos documentos efetivamente devolvidos e limpar o erro. Em falha transitória de rede/servidor, preservar a lista anterior e informar que ela pode estar desatualizada.
3. Em `401/403`, manter falha fechada: descartar os dados da coleção em tela, apresentar estado de autenticação/negativa e não oferecer repetição quando `canRetry` for falso. Essa exceção à preservação evita reexibir dados após perda de autorização e preserva o comportamento seguro atual.
4. Na aba `Documentos`, distinguir `loading`, `empty`, `error` e `denied` com `UiState`; mostrar status HTTP/código canônico e ação de nova tentativa somente quando permitida. Vazio somente após resposta `200` sem documentos. Durante releitura, a lista conhecida permanece visível com estado de carregamento.
5. Não alterar CSS compartilhado sem defeito visual medido. Reutilizar os tokens e estilos atuais; medir overflow do documento e inspecionar as capturas antes de propor qualquer ajuste adicional.

## 4. Riscos e controles

- **Falso vazio:** o estado vazio fica condicionado a leitura concluída com sucesso, sem consulta em andamento e sem erro.
- **Dado desatualizado:** o alerta de falha dirá explicitamente quando uma lista anterior foi preservada e que mudanças novas não podem ser confirmadas.
- **Autorização revogada:** `401/403` não preservam a coleção sensível; o contrato será verificado com uma negativa HTTP real e o estado isolado da aba será exercitado no Chromium com resposta `403` injetada somente na rota de documentos (a visão geral usa a mesma concessão e, sem injeção, também fecharia a página).
- **Escopo compartilhado da coleção:** `Payroll` também recebe `docs`; sua interface e regras não serão alteradas. A mudança apenas evita perda indevida dessa mesma coleção em falha transitória e mantém limpeza em negativa.
- **Evidências:** somente massa sintética em PostgreSQL 17 descartável. Não registrar credenciais, cookies, tokens ou dados reais em testes, logs, capturas ou documentação.

## 5. Validação planejada e critério de parada

1. Criar e executar primeiro um teste focal contra `src/` intacto, registrando o RED antes de alterar código de produto.
2. Estender o gate PostgreSQL + Chromium para erro inicial, lista preservada após falha de releitura, repetição por teclado, loading, vazio somente após `200`, contrato de negativa HTTP real `403` e estado `denied` isolado por injeção no navegador, contratos HTTP e viewports `320/390/768/1440` (`overflow <= 1`), com temas dia/noite e capturas reais.
3. Executar os gates aplicáveis: `npm audit --audit-level=high`, `node scripts/qa-wave0-static.mjs`, `npm run typecheck`, `npm test`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run build`, `npm run test:ux-hr:pg`, regressões `:pg` pertinentes de documentos e `git diff --check`; restaurar `next-env.d.ts` após build/dev e conferir os dois hashes obrigatórios.
4. Documentar separadamente inspeção estática, testes unitários/contrato, testes PostgreSQL + Chromium, inspeção visual de capturas e aceite humano operacional (não realizado).
5. Abrir uma PR pequena. Se qualquer etapa/gate/check falhar ou ficar pendente, parar, preservar o trabalho e não avançar nem mesclar. Merge somente com checks obrigatórios verdes, revisão concluída e base `main` confirmada; depois conferir os workflows pós-merge.

## 6. Registro RED antes da implementação

Comando executado contra `src/` ainda intacto:

```text
node --test tests/ux-pro-05-documentos-leitura-rh-ui.test.mjs
```

Resultado: **exit 1; 3 testes, 1 aprovado, 2 falhados, 0 pulados**. O teste de preservação dos contratos passou; as duas falhas esperadas reproduziram a ausência do estado próprio de documentos e a ausência dos estados honestos. A primeira asserção falhou em `const [docsLoaded, setDocsLoaded]`, inexistente na base. Nenhum arquivo de `src/` foi editado antes deste resultado.

O caso integrado focal também foi executado antes da implementação, após `npm ci` (a primeira tentativa não rodou por ausência local de `embedded-postgres`):

```text
UX_HR_TEST_PATTERN='Documentos: falha de leitura' npm run test:ux-hr:pg
```

Resultado do caso efetivamente executado: **exit 1; 1 teste, 0 aprovado, 1 falhado, 0 pulado**. Em PostgreSQL 17 descartável com migrações `001–180` e Chromium real, a asserção `503 inicial precisa aparecer como erro, não como lista vazia` encontrou 0 blocos `data-ui-state="error"`. A captura `antes-ux-pro-05-documentos-leitura-erro-inicial-390-day.png`, inspecionada antes da implementação, mostra o falso estado “Nenhum documento no seu escopo”. O cluster temporário foi limpo e `next-env.d.ts`, alterado automaticamente pelo servidor de desenvolvimento, foi restaurado com `git checkout -- next-env.d.ts`.

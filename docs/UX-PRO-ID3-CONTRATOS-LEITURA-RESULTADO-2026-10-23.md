# UX-PRO-ID3 — leitura de Contratos por conta ativa: resultado local e evidências (2026-10-23)

**Base reconciliada:** `main` / `origin/main` `7e706e67bfbc2be7205720dad7801beac96eda2f` (merge da PR #297).
**Superfície única:** `/cliente/app/contratos`.
**Escopo e RED original:** `docs/UX-PRO-ID3-CONTRATOS-LEITURA-ESCOPO-ANTES-2026-10-23.md`.

## 1. Resultado

A lista e o erro de Contratos agora conservam o `accountId` que originou a leitura e só são elegíveis para renderização quando pertencem à conta ativa. Uma sequência identifica a consulta mais recente; sucesso, erro e finalização de uma resposta antiga são ignorados.

Ao trocar de A para B, o contrato já recebido de A não permanece sob o cabeçalho de B. B pendente apresenta carregamento, não falso vazio; o vazio só aparece depois do `200 { contracts: [] }` de B. Uma resposta antiga de A, concluída depois da resposta mais recente de B, não substitui o resultado de B.

O seletor usado nessa troca também deixou de transbordar em 320 px. A correção compartilhada foi limitada a `flex-wrap: wrap` e `min-width: 0` no grupo de ferramentas e a `min-width: 0` no seletor. `Sair` pode ocupar a linha seguinte, sem remoção ou sobreposição.

Não houve alteração de rota, método, query, payload, cabeçalho, cookie, autenticação, sessão, RBAC, concessões, `audit_log`, armazenamento privado, operação local ou migrações SQL `001–180`. O servidor continua sendo a única autoridade de escopo; a correção no navegador não é apresentada como nova autorização.

## 2. Arquivos da fatia

- `src/app/cliente/app/contratos/page.tsx` — resultado/erro associados à conta, sequência da leitura mais recente, estado de carregamento e `aria-busy`.
- `src/app/cliente/app/ClientApp.module.css` — somente quebra/encolhimento do grupo do seletor após RED responsivo.
- `tests/ux-pro-id3-contratos-leitura-ui.test.mjs` — dois contratos estáticos focais.
- `tests/ux-portal-vocabulary.test.mjs` — inclusão do teste focal na suíte existente.
- `tests/ux-portal-workspace.integration.test.mjs` — cenário A/B com PostgreSQL 17, Chromium, respostas controladas, teclado, medidas e capturas.
- `docs/UX-PRO-ID3-CONTRATOS-LEITURA-ESCOPO-ANTES-2026-10-23.md`, este relatório e `docs/evidencias/ux-pro-id3-contratos-leitura-2026-10-23/`.

Nenhum CSV de inventário/matriz, `resumo.json` histórico, manifesto de dependências ou workflow foi alterado.

## 3. RED comprovado antes das correções

1. **Contrato estático, `src/` intacto:** `node --test tests/ux-pro-id3-contratos-leitura-ui.test.mjs` → 2 testes, 0 aprovados e 2 falhados. O componente não associava resultado/erro à conta nem descartava conclusões fora de ordem. Log: `red-unitario.txt`.
2. **Integrado, PostgreSQL 17 + Chromium, `src/` intacto:** A tinha um contrato e B zero conforme os GETs reais; com B selecionada e sua leitura pendente, o título de A continuava visível (`1 !== 0`). O teste parou nessa asserção. Log: `red-integracao.txt`; capturas `antes-…a-carregado-390.png` e `antes-…b-pendente-390.png`.
3. **Responsivo, depois da correção funcional e antes do CSS:** 31 px de overflow em 320; `.navTools` e `Sair` terminavam em `right = 351` num viewport de 320. As larguras 390, 768 e 1440 ficaram em 0. Log: `red-responsivo-320.txt`.

Nenhum teste foi removido, pulado ou enfraquecido. Uma primeira tentativa integrada não foi contada como RED porque faltava o pacote `embedded-postgres`; `npm ci` restaurou as dependências exclusivamente pelo lockfile, sem alterar `package.json` ou `package-lock.json`.

## 4. Validação estática, unitária e de projeto

| Comando/verificação | Resultado local |
|---|---|
| `node scripts/qa-wave0-static.mjs` | **5/5**; migrações `001–180` contínuas e registradas. |
| `node scripts/ux-pro-00-inventory.mjs --check` | Inventário e matriz de **100 rotas** conferem; nenhum CSV editado. |
| `node --test tests/ux-portal-vocabulary.test.mjs` | **20/20**, incluindo os dois contratos focais. |
| `node --test tests/ux-pro-00-precision.test.mjs tests/admin-navigation.test.mjs` | **10/10**. |
| `npm run typecheck` | Aprovado. |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1005/1005**, 0 falhas, 0 skips e 0 todos. |
| `npm audit --audit-level=high` | **0 vulnerabilidades**. |
| `npm run build` | Next.js `16.4.2`; compilação, TypeScript e **105 páginas** aprovados. |
| `git diff --check` | Aprovado. |

SHA-256 preservados e revalidados depois dos runners/build:

- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`.
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## 5. PostgreSQL 17 descartável, HTTP real e Chromium

| Comando/cenário | Resultado local |
|---|---|
| Cenário focal de Contratos | **1/1**; A=1 e B=0 no servidor, separação pendente/vazio, teclado e resposta fora de ordem. |
| `npm run test:ux-portal:pg` | **27/27**, 0 falhas e 0 skips; `UX_PORTAL_TEST_EXIT: 0`. |
| `npm run test:tenant:pg` | **22/22**; `TENANT_SEG_001_TEST_EXIT: 0`. |
| `npm run test:cli-v2:pg` | **11/11**; `QA_CLI_V2_TEST_EXIT: 0`. |
| `npm run test:demo-local:pg` | Execução controlada final aprovada, incluindo restore isolado e restart persistente. |
| `npm run test:rag` | Smoke HTTP aprovado no workspace isolado. |

Os runners PostgreSQL aplicaram o ledger vigente até `180`, usaram armazenamento descartável e reportaram limpeza. A suíte integral do portal foi repetida depois do CSS compartilhado e incluiu cobranças, autenticação, segurança, documentos, funcionário/RH e o novo cenário de Contratos.

## 6. Medidas e inspeção individual das capturas

As **duas capturas “antes”** foram inspecionadas e mostram o contrato sintético de A ainda presente durante a leitura pendente de B.

As **sete capturas “depois”** foram inspecionadas individualmente:

- A carregado em 390;
- B pendente em 320, 390, 768 e 1440;
- B vazio depois do `200` de B;
- B vazio depois da resposta antiga de A chegar por último.

Nenhuma captura final mostra item de A em B. Em 320, o seletor e `Sair` quebram de linha sem corte ou sobreposição. O pequeno indicador do Next.js visível no ambiente de desenvolvimento não pertence ao produto.

`depois-ux-pro-id3-contratos-leitura-medidas.json` registra:

- `serverReadA`: `200`, 1 contrato; `serverReadB`: `200`, 0 contratos;
- overflow horizontal **0 px** em 320, 390, 768 e 1440;
- troca com `ArrowUp`/`ArrowDown`, foco preservado no seletor;
- `B:2` concluída antes de `A:3`, com o resultado final permanecendo em B;
- `humanAcceptanceExecuted: false`.

O portal autenticado não oferece controle de tema nesta superfície; dia/noite não se aplica e não foi simulado com o tema administrativo. Capturas e medidas são evidência automatizada no Chromium, não certificação de todos os dispositivos/navegadores ou conformidade WCAG.

## 7. Notas honestas de ambiente e repetição

- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` foi usada nos comandos com Chromium, convenção já suportada pelos runners para selecionar as bibliotecas empacotadas. Não houve instalação fora do lockfile nem alteração de workflow.
- A primeira execução de `npm run test:demo-local:pg` falhou em `QA-HOM-008_FAILED: demo_isolated_restore_failed exit=1`, com limpeza confirmada. A entrega foi interrompida e o bloqueio relatado. Depois da continuação explícita, a inspeção mostrou que a falha estava na cópia fria da demonstração, fora dos arquivos desta fatia. Uma única repetição controlada, sem mudança de produto/teste e com log preservado em `gate-demo-local-pg.txt`, passou por completo. A falha inicial não é omitida nem convertida em prova de defeito da fatia; os checks de CI continuam obrigatórios.

## 8. Aceite humano operacional

**Não realizado.** Não houve aceite de Marcelo, Andreia ou titular, nem validação manual em dispositivo físico. Testes, medidas e capturas não são apresentados como aceite humano.

## 9. Entrega e fora de escopo

Checks de PR, reviews obrigatórios, merge e workflows pós-merge pertencem ao processo de entrega e não são substituídos por este relatório local.

Permanecem fora desta fatia mudanças de API/contratos, autenticação, RBAC/auditoria, provedor/navegação, outras telas, telas órfãs/legadas e retrabalho das entregas #284–#297 sem evidência nova e reproduzível.

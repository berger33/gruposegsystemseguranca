# UX-PRO-10C — escopo antes da reconciliação (19/10/2026)

**Base confirmada:** `main` `3e9a4eec4fb4b14e70f02bb15e38fddeb07d3774` (merge squash da PR #265). **Estado inicial:** árvore limpa, sem PRs abertas. Esta fatia reconcilia documentação e evidências após a UX-PRO-10B; não altera telas, APIs, autorização, dados ou conteúdo público.

## Linha de base observada

- `node scripts/ux-pro-00-inventory.mjs --check`: 100 entradas/rotas; 75 rotas com gate automatizado, 52 com captura visual, classes 52 captura / 34 teste de jornada / 14 código. O CSV é gerado e reproduzível, mas essas classes não provam cobertura humana nem todos os estados.
- A 10B foi integrada na #265. O resumo `resumo-layouts.json` registra 41 acessos HTTP 200, 0 overflow horizontal e 0 erro de navegador: 40 variações de `/layout-preview?visual=01..10` nos viewports 320/390/768/1440 e um percurso de teclado separado em `/layout-01` a 1440 px.
- O `resumo.json` administrativo registra `/admin/aparencia` nas larguras 320/390/768/1440 em claro/escuro. O gerador do inventário consome hoje `resumo.json` com `entries`, mas não esse resumo complementar (`routes`), e ainda declara a captura noturna de `/admin/aparencia` como ausente.
- `docs/UX-PRO-10A-AUDIT.md` e `docs/UX-PRO-10C-CLOSEOUT.md` preservam banners de retificação da #263, porém descrevem 10B como pendente antes do merge da #265. `README.md` não registra o fechamento posterior.

## Riscos e preservações

- Não converter a automação Chromium em validação manual, aceite humano ou declaração WCAG; nenhum aceite humano foi registrado.
- Não inferir que as rotas `/layout-02`…`/layout-10` foram abertas diretamente: o teste de navegador renderizou suas variantes pelo `?visual=` de `/layout-preview`.
- Não apresentar o retrato histórico de 10/10, 13/10, 17/10 ou 18/10 como estado atual sem data/SHA. Preservar esses registros e os CSVs históricos.
- Não alterar telas, APIs, permissões, autenticação, auditoria, persistência ou operação local. Mudanças no gerador só podem aumentar a leitura de evidência já versionada, mantendo o contrato existente.
- Não alterar `next-env.d.ts` nem `tsconfig.json`; inventário regenerado somente por seu gerador.

## Validações planejadas

1. Conferir que o gerador de inventário represente os dois formatos versionados de evidência da 10B e agregue a query ao caminho real `/layout-preview`, sem promover primeiro foco a percurso.
2. Atualizar inventário/matriz gerados e testar que a query `visual=01..10`, dimensões e tema dia/noite são refletidos nas rotas canônicas corretas.
3. Atualizar README e fechamento 10C com o estado pós-merge, cobertura, limites e pendências sem apagar retificações históricas.
4. Rodar teste focal, suíte pertinente, typecheck, build, `qa-wave0-static`, inventário `--check`, e `git diff --check`; verificar `next-env.d.ts`/`tsconfig.json` byte a byte.
5. Abrir PR documental pequena sobre a `main` atual. Não mesclar se qualquer check obrigatório estiver vermelho/pendente ou se a revisão não estiver concluída.

# UX-07 — Inteligência comercial

Data: 2026-10-05  
Família: inteligência comercial (`/admin/inteligencia`)  
Base de verdade: `origin/main` após `git fetch origin main`, commit `9940abf4d250078819b795591ee8fc4eb690abf4`.

## Escopo

Esta fatia trata somente a apresentação da jornada canônica EXT-14/F10. As rotas, métodos, payloads, cabeçalhos, permissões, idempotência, isolamento de conta, auditoria fail-closed e regras de aprovação permanecem no servidor. A rota canônica continua sendo `/api/ext/intel/suggestions`; a leitura legada continua minimizada e a escrita legada continua recusada com 410.

A aprovação humana e a homologação por Marcelo/Andreia permanecem pendentes e não foram simuladas como aceite de produto.

## Entrega

- `src/lib/intel-vocabulary.mjs` e `.d.mts`: cobre os códigos literais de `src/server/ext-intel-api.mjs`, classifica falhas, mantém o código canônico no descritor, deixa código desconhecido cru e traduz os ENUMs de estado/tipo. `honestDate()` e `count()` distinguem ausência de dado de data inicial ou zero.
- `src/lib/intel-request.ts`: resultado discriminado `{ ok: true, data } | { ok: false, error }`, incluindo falha de rede.
- `IntelWorkspace.tsx`: zero `style` inline, `UiState` para leituras independentes, estados vazio/falha distintos, formulário rotulado e abas `tablist`/`tab`/`tabpanel` com roving tabindex e `←`/`→`/`Home`/`End`.
- O detalhe ainda mostra JSON de trilha como **legado de apresentação técnica**, não como relatório operacional final; polimento específico dessa trilha fica pendente.
- `tests/ux-intel-vocabulary.test.mjs`: extrator anti-deriva lê o servidor real, remove operandos de `.includes()` e comparações antes do levantamento e mantém limiar logo abaixo do total real encontrado.
- `scripts/qa-ux-intel-postgres.mjs`, `npm run test:ux-intel:pg` e workflow restrito: PostgreSQL embutido descartável, servidor HTTP real e Chromium `@sparticuz/chromium` em `--single-process`. A falha de leitura do navegador é injetada somente por `page.addInitScript`; o gate espera o h1 real antes de medir e repete a sessão inteira para `ERR_ASSERTION`.

## Cobertura e pendências

Cobertura automatizada é parcial: o gate focal verifica a jornada canônica EXT-14, RBAC granular, idempotência, evidência contada, aprovação, contato interno, auditoria e a apresentação principal. Não cobre toda a superfície administrativa antiga nem aceite humano.

Não há migração nesta fatia: as migrações 001–174 permanecem intactas. Nenhuma mensagem externa é enviada. Não houve alteração de autenticação, autorização do servidor, históricos, operação local ou regras de negócio.

Aceite humano, teste com dados reais do negócio e revisão visual final permanecem pendentes. UX-08 (console TI/RAG e polimento global) e UX-09 não fazem parte desta PR.

## Verificações

- `node --test tests/ux-intel-vocabulary.test.mjs tests/ext14-intel.test.mjs` — **17/17**.
- `npm run typecheck` — **passou** após `npm ci`.
- `npm run test:ux-intel:pg` — **18/18**, PostgreSQL descartável e Chromium.
- `npm run test:unit` — **722/722**.
- `npm run ux:evidence -- --stage=ux-07-inteligencia-comercial` — **passou** em desktop e mobile; o bloqueio esperado da fonte Google ficou em `externalBlocked`.

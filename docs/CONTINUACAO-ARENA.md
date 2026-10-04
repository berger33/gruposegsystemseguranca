# Continuidade Arena — 2026-10-04 (F01 cobertura + F03)

## Incremento 3 — revisão da PR #124 e cobertura restante do AdminGate

- **Base revisada:** `7d0990aaca47a8ea21b2380834289d2c73165b81` (merge da PR #123 no `main`).
- **PR substituta:** **#125**, branch `arena/01a1073d-gruposegsystemseguranca`, commit de implementação `e2fa152`.
- A PR #124 (`cd189159`) foi revisada contra o main pós-#123: o run antigo `37183947261` falhou no `QA-HOM-008 persistent synthetic restart`, enquanto o run posterior `37183965345`, no mesmo HEAD, passou; todos os demais checks publicados para aquele HEAD também passaram. Como a PR estava `CONFLICTING`/`DIRTY` e a sessão não pode fazer push na branch-fonte antiga, ela foi comentada e fechada como `superseded`, sem descartar o escopo válido.
- As 28 páginas administrativas restantes receberam `AdminGate` com papéis conferidos contra o mapa de `src/app/admin/AdminGate.tsx`. A matriz está protegida por `tests/admin-page-gates.test.mjs`. Não houve alteração de API, autorização no servidor, migração ou seed F03.
- Exceções preservadas: `/admin/convite` continua deeplink público de aceite de convite; `/admin/verificacao-manual` continua com reautenticação própria para ação sensível. O gate é somente envelope de UI; cada API segue responsável por 401/403 e escopo no servidor.
- Validação local desta substituta: `npm ci` (82 pacotes, 0 vulnerabilidades), `npm run typecheck`, `npm test` (526/526), `npm run test:admin-entry:pg` (13/13, PG17 descartável + Chromium real), `npm run build` (94 páginas) e `git diff --check`, todos aprovados. A execução de testes pode regenerar `next-env.d.ts`/`tsconfig.json`; esses artefatos foram restaurados e não entram nesta PR.


## Histórico do incremento 2 — fundação F03 (PR #123)

## Identificação

- Base: `b61691fb95aa68d1a43e5f3b5cf43131de2c397c` (main, merge da PR #122/F00+F01).
- Branch: `arena/01a105a3-gruposegsystemseguranca`.
- PR: **#123** — `feat(f03): massa sintética idempotente e isolada`.
- Commit de implementação: `0fc7048` (o commit documental final apenas registra a PR).
- Escopo desta fatia: limpeza pós-F00 no GitHub + fundação idempotente da massa F03.
- Migrações: nenhuma; 001–156 permanecem imutáveis e a próxima livre continua 157 (reconfirmar no próximo main).

## Ações de repositório

Após integrar a #122, foram fechadas **sem merge** as 27 alternativas superseded classificadas no F00: #104–#112, #114, #116, #117; #102; #79, #81, #82, #84, #86; #47, #53, #59, #60, #62, #67, #70, #72, #75. A #121 também foi fechada porque seu conteúdo documental já foi incorporado pela #122. Cada grupo recebeu comentário apontando a linha oficial. A #124 foi revisada e fechada como `superseded`; a substituta #125 é a linha oficial nesta sessão. A documentação anterior dizia “26 superseded”; a soma correta é 12 + 1 + 5 + 9 = 27.

## Implementação F03 desta fatia

- `scripts/local-demo-seed.mjs`: seed transacional exclusivo do demo isolado, com lock advisory e marcador versionado. Primeira execução só aceita `seg_demo_local`, capacidade explícita do runner, UUID de instalação e banco de negócio vazio. Replay com o mesmo marcador é no-op; marcador/instalação divergente falha fechado. Falha reverte marcador e dados juntos.
- Massa exclusivamente fictícia (`@example.invalid`): sete papéis staff individuais (`ti`, `rh`, `admin`, `marcelo`, `comercial`, `financeiro`, `supervisor`), clientes A/B, identidade de funcionário, duas contas, dois contratos, grants A/B exclusivos, cadastro laboral e permissão `employees.self_service` com escopo `own`.
- Todas as senhas são geradas por CSPRNG, armazenadas somente como hash e impressas uma única vez na primeira inicialização. Replay e restart não rotacionam nem reimprimem.
- `scripts/local-demo.mjs`: segredo separado e persistente para sessão do funcionário, recusando injeção pelo ambiente do operador; credenciais retornadas pelo seed novo.
- `scripts/qa-local-demo-persistent.mjs`: prova recusa sem capacidade, instalação divergente, replay sem duplicação, contagens e auditoria; login real de clientes A/B com visibilidade de uma única empresa cada; login e leitura do perfil próprio do funcionário; preservação das provas anteriores de convite, revisão manual, restart, cópia fria e restauração isolada.

## Validação real

Ambiente: sandbox Linux, Node 22, PostgreSQL 17.9 embedded descartável, sem banco/SMTP/segredos do operador.

- `npm ci`: sucesso; 82 pacotes, 0 vulnerabilidades.
- `npm run typecheck`: sucesso.
- `npm test`: **525/525**, 0 falhas e 0 skips.
- `npm run test:demo-local:pg`: sucesso; replay no-op; A/B isolados; funcionário próprio; convite/revisão/grant; backup a quente recusado; cópia fria, verificação e restauração separada; restart persistente; temporários removidos.
- `npm run build`: sucesso; 94 páginas geradas.
- `git diff --check` e `node --check` nos três scripts: sucesso.

A primeira tentativa de `typecheck` ocorreu antes de `npm ci` e falhou com `tsc: not found`; a primeira suíte unitária nesse mesmo estado incompleto falhou 13 casos por dependências ausentes. Após `npm ci`, ambas passaram integralmente. O gate F03 também encontrou `EMPLOYEE_SESSION_SECRET_NOT_CONFIGURED` ao exercitar pela primeira vez a conta do funcionário; a configuração isolada ganhou segredo próprio e o gate passou na repetição, sem relaxar asserção.

## Limites e pendências

Esta fatia entrega a **fundação da massa**, não conclui F03. Continuam pendentes, uma jornada por fatia:

1. lead → oportunidade → proposta revisada → contrato → implantação;
2. funcionário → solicitação → análise RH → retorno;
3. cliente → chamado → atendimento → aceite;
4. contas a pagar/receber → baixa → relatório.

Também pendem Windows/EPERM (F02), aceite humano e integrações externas. Não há SMTP real, banco bancário, eSocial, assinatura, dados reais ou hospedagem definitiva. O seed vale para instalações novas da demo isolada; marcador legado não é atualizado silenciosamente para evitar criar/reexibir credenciais numa instalação em uso.

## Prompt completo para a próxima sessão

```text
Continue berger33/gruposegsystemseguranca a partir do main após a PR F03 da branch
arena/01a105a3-gruposegsystemseguranca. Leia docs/CONTINUACAO-ARENA.md,
docs/PLANO-CONCLUSAO-ARENA.md e docs/STATUS-ATUAL-CONSOLIDADO.md. Não refaça F00,
F01 nem a massa sintética base de F03. Implemente somente a próxima fatia F03:
lead → oportunidade → proposta revisada → contrato → implantação, usando APIs e
fontes canônicas existentes e a demo isolada. Prove por HTTP real contra PostgreSQL
17 descartável, com replay/idempotência, auditoria transacional, RBAC e erro visível;
não insira diretamente estados que a API deve produzir. Migrações 001–156 são
imutáveis; reconfirme a próxima livre. Dados apenas fictícios .invalid, sem segredos,
SMTP ou serviços reais. Uma fatia por PR. Ao terminar atualize a continuidade,
status e checklist com resultados reais e limites; não declare F03 concluída enquanto
as outras três jornadas e o aceite humano permanecerem pendentes.
```

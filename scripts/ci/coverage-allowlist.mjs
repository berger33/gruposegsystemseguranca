/**
 * Fatia 06B — allowlist do mapa de equivalência de cobertura da CI.
 *
 * Cada entrada declara, com motivo medido, um alvo que continua SEM execução
 * automática em workflow. O mapa reprova se uma entrada ficar obsoleta (o alvo
 * passou a ser alcançado), então isto não é depósito permanente: é dívida com
 * prazo, revisada a cada fatia que mexer em CI.
 *
 * `tipo` aceito: `script` (nome no package.json), `runner` (caminho em
 * scripts/) ou `teste` (caminho em tests/).
 *
 * Este arquivo fica fora de `scripts/*.mjs` de propósito: o mapa usa o caminho
 * literal `tests/…` dentro de um runner como indício de "quais jornadas ele
 * executa". Manter a allowlist em `scripts/ci/` evita que a própria lista seja
 * lida como prova de execução — foi um falso positivo medido nesta fatia.
 */
export const ALLOWLIST = [
  {
    alvo: 'tests/lead-flow.integration.test.mjs',
    tipo: 'teste',
    motivo: 'harness opt-in herdado: exige `DATABASE_URL` do operador e `RUN_DATABASE_INTEGRATION=1`, sem cluster descartável próprio; a jornada lead→implantação é exercitada por `test:f03-lead-to-implementation:pg` (cluster descartável + HTTP real). Residual declarado, não cobertura presumida.',
  },
  {
    alvo: 'scripts/ux-pro-04-relatorios-browser-evidence.mjs',
    tipo: 'runner',
    motivo: 'captura de evidência (gera PNG/JSON em `docs/`), não gate com veredito: rodar em CI produziria artefato sem asserção de jornada. Permanece comando manual documentado.',
  },
  {
    alvo: 'scripts/ux-pro-04-pendencias-browser-evidence.mjs',
    tipo: 'runner',
    motivo: 'captura de evidência do painel de pendências; mesma razão do anterior — evidência manual, não gate com veredito de jornada.',
  },
];

/**
 * Fatia 06C — resíduos legados de comandos de gate que ainda executam `node --test`
 * sem auditoria completa do resumo TAP (`sem_auditoria_tap`).
 *
 * Regra de falha do mapa:
 *   1. qualquer gate NOVO ou recém-ligado sem auditoria TAP reprova na hora;
 *   2. qualquer entrada abaixo cujo alvo passe a auditar TAP (ou deixe de ser
 *      alcançado) vira `staleAllowlist` e reprova até ser removida;
 *   3. toda entrada exige `alvo`, `tipo`, `ordem` (lote/ordem de migração) e
 *      `motivo` substantivo — nunca silêncio.
 */
export const TAP_AUDIT_ALLOWLIST = [
  // Ordem 1 — gates executados em `ci.yml`
  {
    alvo: 'test:ux-pro-09e-pu4:browser',
    tipo: 'script',
    ordem: '01-ci-yml',
    motivo: 'gate de navegador do `ci.yml` invoca `node --test` direto sem auditar resumo TAP; se a guarda de ambiente for removida ou um caso virar `t.skip`, `node:test` sai 0. Migrar na fatia 06C lote 1.',
  },
  // Ordem 2 — entrada administrativa (F01) e família L (`L02..L08`)
  {
    alvo: 'scripts/qa-admin-entry-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner F01 herdado propaga apenas exit code (`stdio: inherit`) no passo `node --test`; arquivo todo `skip` sairia 0. Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  {
    alvo: 'scripts/qa-l02-delivery-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner L02 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  {
    alvo: 'scripts/qa-l03-delivery-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner L03 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  {
    alvo: 'scripts/qa-l04-delivery-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner L04 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  {
    alvo: 'scripts/qa-l05-delivery-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner L05 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  {
    alvo: 'scripts/qa-l06-delivery-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner L06 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  {
    alvo: 'scripts/qa-l07-delivery-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner L07 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  {
    alvo: 'scripts/qa-l08-delivery-postgres.mjs',
    tipo: 'runner',
    ordem: '02-familia-l-f01',
    motivo: 'runner L08 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C.',
  },
  // Ordem 3 — fluxos ponta a ponta F03
  {
    alvo: 'scripts/qa-f03-client-ticket-acceptance-postgres.mjs',
    tipo: 'runner',
    ordem: '03-familia-f03',
    motivo: 'runner F03 (chamado→atendimento→aceite) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido.',
  },
  {
    alvo: 'scripts/qa-f03-contas-baixa-relatorio-postgres.mjs',
    tipo: 'runner',
    ordem: '03-familia-f03',
    motivo: 'runner F03 (contas→baixa→relatório) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido.',
  },
  {
    alvo: 'scripts/qa-f03-employee-request-rh-return-postgres.mjs',
    tipo: 'runner',
    ordem: '03-familia-f03',
    motivo: 'runner F03 (solicitação colaborador→retorno RH) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido.',
  },
  {
    alvo: 'scripts/qa-f03-lead-to-implementation-postgres.mjs',
    tipo: 'runner',
    ordem: '03-familia-f03',
    motivo: 'runner F03 (lead→implantação) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido.',
  },
  // Ordem 4 — gates UX em PostgreSQL descartável + Chromium
  {
    alvo: 'scripts/qa-ux-emergency-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'auditor inline usa `minimumCases: pattern ? 0 : 21`; pelo menor valor condicional (`0`), o caminho filtrado não garante piso mínimo positivo (`>= 1`).',
  },
  {
    alvo: 'scripts/qa-ux-adm-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX administrativo usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-analytics-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX analytics usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-asset-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX patrimônio/ativos usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-bidding-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX licitações usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-client-admin-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX administração de clientes usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-compliance-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX compliance usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-contract-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX contratos usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-crm-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX CRM usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-expansion-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX expansão usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-finance-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX financeiro usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-fleet-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX frota usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-hr-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX RH usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-intel-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX inteligência comercial usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-knowledge-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX base de conhecimento usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-portal-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX portal/TI console usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-quality-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX qualidade usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-satisfaction-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX satisfação usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  {
    alvo: 'scripts/qa-ux-third-party-postgres.mjs',
    tipo: 'runner',
    ordem: '04-familia-ux',
    motivo: 'runner UX terceiros usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido.',
  },
  // Ordem 5 — relatório agregador e gate sob observação aberta N8
  {
    alvo: 'scripts/qa-evidence-report.mjs',
    tipo: 'runner',
    ordem: '05-agregadores-e-n8',
    motivo: 'gerador de PDF de evidência (`plat01-dispatch.yml`) extrai TAP quando presente, mas `tapLimpo` aceita ausência de `# tests` e não impõe piso numérico por passo.',
  },
  {
    alvo: 'tests/client-security.integration.test.mjs',
    tipo: 'teste',
    ordem: '05-agregadores-e-n8',
    motivo: 'executado direto com `node --test` no `ci.yml` (possui `skipReason` por `RUN_DATABASE_INTEGRATION`), sem runner auditor; mantido sem edição de harness para não perturbar a observação síncrona N8 em aberto.',
  },
];

export default ALLOWLIST;

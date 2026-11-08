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
 * Fatia 06D — resíduos legados de comandos de gate que ainda executam `node --test`
 * sem auditoria completa do resumo TAP (`sem_auditoria_tap`).
 *
 * Regra de falha do mapa:
 *   1. qualquer gate NOVO ou recém-ligado sem auditoria TAP reprova na hora;
 *   2. qualquer entrada abaixo cujo alvo passe a auditar TAP (ou deixe de ser
 *      alcançado) vira `staleAllowlist` e reprova até ser removida;
 *   3. toda entrada exige `alvo`, `tipo`, `ordem` (lote/ordem de migração) e
 *      `motivo` substantivo — nunca silêncio.
 *
 * Após 06D, restam apenas 2 resíduos: o agregador de evidência e o gate N8
 * sob observação aberta (client-security). Todos os 23 gates F03+UX migrados
 * nesta fatia com pisos medidos foram removidos da allowlist.
 */
export const TAP_AUDIT_ALLOWLIST = [
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

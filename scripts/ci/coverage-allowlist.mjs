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

export default ALLOWLIST;

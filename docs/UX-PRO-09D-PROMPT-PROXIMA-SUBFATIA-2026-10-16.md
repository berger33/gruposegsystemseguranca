# Prompt da próxima pendência — site público (correções autorizadas do 09B) (16/10/2026)

Subfatia seguinte **autorizada pelo proprietário nesta sessão (16/10/2026)**, após o merge da UX-PRO-09D (ID6): **correções do site público registradas no diagnóstico da UX-PRO-09B** (PR #257):

1. **Overflow a 320 px:** `/contato` (documento em 343 px) e `/faq` (documento em 347 px), reproduzidos nas duas preferências de cor (`day`/`night`).
2. **Revisão visual das 104 amostras de contraste <4,5:1** distribuídas em 16 capturas das rotas `/contato` e `/simulador` (de 1.246 amostras computáveis). São **sinais, não conclusões WCAG**: a sessão seguinte deve avaliar amostra por amostra (texto grande, estados, sobreposições, contexto real de pixels) e corrigir **apenas** as que forem sinal real, com evidência por amostra; o resto é registrado como sem defeito demonstrado.

Regras permanentes do programa continuam valendo: 1 subfatia pequena = 1 sessão = 1 PR; ANTES de codar, `docs/UX-PRO-<SLICE>-ESCOPO-ANTES-<data>.md` medindo a base real e numerando lacunas; mudanças aditivas cobertas por regressão; nenhum contrato de API/session, payload, cookie, grant, MFA, rate limit, auditoria ou isolamento sem decisão explícita; evidências em pasta própria com `resumo.json` legível por máquina (contagem e dimensões conferidas); merge somente com todos os checks SUCCESS e base confirmada (`gh pr merge <n> --merge`, sem `--auto`); sem segredos/dados pessoais em docs, logs ou capturas; dados sintéticos só em banco descartável; nunca declarar aceite humano, UAT ou conformidade WCAG; homologação e produção continuam NO-GO; não reimplementar trabalho já mergeado.

## Estado esperado ao iniciar a nova sessão

- `main`/`origin/main` deve conter o merge da PR desta fatia (UX-PRO-09D, fix do ID6) — conferir SHA após `git fetch`.
- PRs: #234 (CONFLICTING) continua aberta e **intocada**; nenhuma outra PR aberta esperada.
- Resíduos registrados: **ID3** (10 páginas do portal com `workspaceFetch` — família própria), **ID4** (`setup.uri` não exibido — decisão de produto), **E2, E3, E5, E8, E9** (sem decisão), **E6 e C11** (autorizadas, subfatias próprias futuras), **09D-1** (branch `arena/7a374da0-gruposegsystemseguranca` ainda no origin — decisão do proprietário).
- Guardas técnicas: `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` (reescrito por tsc e por cada boot do dev-server — rodar `git checkout -- next-env.d.ts` após cada gate e conferir o MD5 antes de commitar); `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23`; nome de captura `ux-pro-<slice>-<scenarioId>-<viewport>.png` com byte-compare contra `entries[].screenshot` nos dois sentidos antes de apagar qualquer PNG; inventário: após tocar `src/app`, rodar `node scripts/ux-pro-00-inventory.mjs` e depois `--check` (test:unit falha com CSVs DESATUALIZADO); `qa-wave0-static` não é script npm: `node scripts/qa-wave0-static.mjs`; python3 com heredoc `<<'EOF'` em comandos com aspas aninhadas.
- Gates de referência verdes na base da 09D: `test:ux-portal:pg` **22/22** (`UX_PORTAL_TEST_EXIT: 0`); `node --test tests/ux-portal-vocabulary.test.mjs` **17/17**; `npm run test:unit` **949/0**; `npm run typecheck` exit 0; `npm run build` exit 0 (CI); `node scripts/qa-wave0-static.mjs` **5/5**; inventário `--check` OK.
- Base do 09B a partir da qual medir as correções: `main` após o merge da #258 (a 09B mediu em `d0ffffb`); evidências do diagnóstico em [`UX-PRO-09B-evidencias-2026-10-16/`](UX-PRO-09B-evidencias-2026-10-16/) (112 capturas, 14 rotas × 4 larguras × 2 preferências de cor, com `resumo.json` por rota).
- A etapa de evidência do 09B reutilizável: `LD_LIBRARY_PATH=/tmp/al2023/lib npm run ux:evidence -- --stage=ux-pro-09b` (wrapper `scripts/ux-evidence-postgres.mjs`, cluster descartável destruído ao fim).
- No site público, a regra da família de layouts prévias vale: 10 layouts preservados como prévias (06 é o padrão); alteração pública apenas no que for autorizado e medido.

## Depois desta subfatia (fila das autorizações desta sessão, ordem sugerida)

1. **E6** — `<main>` aninhado transversal em 19 rotas (`AdminGate.tsx:115`); correção estrutural aditiva, sem mudar rotas/permissoes; 1 PR.
2. **C11** — financeiro: alvo de toque de 29 px do botão de repetir legado (observação 07E-2) + os 2 hits auditados e não corrigidos com justificativa (`FiscalWorkspace.tsx:80`, `ExpenseWorkspace.tsx:176`); 1 PR.
3. Demais pendências do CRONOGRAMA (E2, E3, E5, E8, E9, ID3, ID4 e UX-PRO-07F→07M) seguem aguardando decisão item a item.

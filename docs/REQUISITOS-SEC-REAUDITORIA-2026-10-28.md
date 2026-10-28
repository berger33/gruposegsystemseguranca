# Reauditoria técnica da família SEC (15 IDs)

**Data:** 2026-10-28 · **Método:** âncoras de asserção executável em testes/gates, **não** contagem de menção literal de ID. **Aceite humano: 0/15. Reauditoria integral: 0/15.**

## Resumo

| Classe de reauditoria | IDs |
| --- | ---: |
| evidencia_tecnica_mapeada | 15 |

**Âncoras:** 35/35 encontradas no código. **Gates:** scripts/qa-wave0-static.mjs, scripts/qa-staff-auth-postgres.mjs, scripts/qa-cli-v2-postgres.mjs, scripts/qa-ux-public-routes-postgres.mjs.

## Execução real dos gates

5/5 execuções saíram com `exit 0` em 28/10. Duas usaram PostgreSQL 17 descartável, duas PostgreSQL 17 + Chromium; wave0 é estático (sem banco).

| Gate | Ambiente | Resultado | Duração | Resumo |
| --- | --- | ---: | ---: | --- |
| `scripts/qa-wave0-static.mjs` | não aplicável (gate estático) | exit 0 | 34 ms | RESUMO: 5/5 verificações estáticas OK; 0 imports ausentes; 0 migrações ausentes. |
| `scripts/qa-staff-auth-postgres.mjs` | PostgreSQL 17 descartável | exit 0 | 10913 ms | # tests 21 \| # pass 21 \| # fail 0 \| STAFF_AUTH_L01_TEST_EXIT: 0 |
| `scripts/qa-cli-v2-postgres.mjs` | PostgreSQL 17 descartável | exit 0 | 6749 ms | # tests 11 \| # pass 11 \| # fail 0 \| QA_CLI_V2_TEST_EXIT: 0 |
| `scripts/qa-ux-public-routes-postgres.mjs` | PostgreSQL 17 descartável + Chromium | exit 0 | 37594 ms | # tests 7 \| # pass 7 \| # fail 0 \| UX_PUBLIC_TEST_EXIT: 0 |
| `scripts/qa-ux-public-routes-postgres.mjs` | PostgreSQL 17 descartável + Chromium | exit 0 | 104449 ms | # tests 5 \| # pass 5 \| # fail 0 \| UX_PUBLIC_TEST_EXIT: 0 |

## Mapa por requisito

| ID | Requisito | Estado 04/10 | Classe atual | Classe reauditada | Âncoras | Gate |
| --- | --- | --- | --- | --- | ---: | --- |
| SEC-01 | Inventariar rotas, APIs, tabelas, jobs, permissões e documentação | em_execucao | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-wave0-static.mjs` |
| SEC-02 | Corrigir verificações de escopo para negar por padrão em qualquer erro | pronto_local | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-staff-auth-postgres.mjs` |
| SEC-03 | Associar documentos a conta/unidade/contrato/classificação e autorização uniforme | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-cli-v2-postgres.mjs` |
| SEC-04 | Login individual de staff, papéis, convites e revogação | em_execucao | mencionado_em_gate | **evidencia_tecnica_mapeada** | 3/3 | `scripts/qa-staff-auth-postgres.mjs` |
| SEC-05 | Substituir tokens compartilhados por autenticação individual com migração controlada | pronto_local | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-staff-auth-postgres.mjs` |
| SEC-06 | MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit | pronto_local | mencionado_em_gate | **evidencia_tecnica_mapeada** | 3/3 | `scripts/qa-staff-auth-postgres.mjs` |
| SEC-07 | Corrigir troca de e-mail e handlers HTTP | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-staff-auth-postgres.mjs` |
| SEC-08 | Migrações rastreadas e executáveis | pronto_local | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-wave0-static.mjs` |
| SEC-09 | Reparar suíte e testar APIs reais | em_execucao | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-wave0-static.mjs` |
| SEC-10 | Consolidar orçamento/simulador e catálogo | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-ux-public-routes-postgres.mjs` |
| SEC-11 | Separar prévias e recursos reais | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-ux-public-routes-postgres.mjs` |
| SEC-12 | Privacidade e declarações de aprovação verificáveis | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 2/2 | `scripts/qa-cli-v2-postgres.mjs` |
| SEC-13 | Segurança de sessão, CSRF, origem e erros | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 3/3 | `scripts/qa-staff-auth-postgres.mjs` |
| SEC-14 | Auditoria durável e operacional | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 3/3 | `scripts/qa-cli-v2-postgres.mjs` |
| SEC-15 | Proteção de abuso e identidade | a_revalidar | mencionado_em_gate | **evidencia_tecnica_mapeada** | 3/3 | `scripts/qa-staff-auth-postgres.mjs` |

## Evidências encontradas

### SEC-01 — Inventariar rotas, APIs, tabelas, jobs, permissões e documentação
- ✅ `scripts/ux-pro-00-inventory.mjs:515` — inventário de rotas com modo de verificação
  `if (process.argv.includes('--check')) {`
- ✅ `scripts/requisitos-222-inventory.mjs:206` — inventário de 222 requisitos com classe de evidência
  `porClasseEvidencia: countBy('classe_evidencia_atual'),`

### SEC-02 — Corrigir verificações de escopo para negar por padrão em qualquer erro
- ✅ `tests/staff-auth.integration.test.mjs:260` — amostra ampla de endpoints nega sem sessão
  `test('SEC-02: endpoints administrativos negam sem sessão (amostra ampla)', { skip: !RUN }, async () => {`
- ✅ `tests/client-space-fail-closed.test.mjs:55` — fail-closed de escopo do espaço do cliente
  `protectedReads() { return calls.filter(c => /FROM client_(contracts|documents|tickets) WHERE/.test(c.sql)); },`

### SEC-03 — Associar documentos a conta/unidade/contrato/classificação e autorização uniforme
- ✅ `tests/cli-v2.integration.test.mjs:49` — escopo legado de cliente auditado em PostgreSQL
  `test('TENANT-SEG-003 / PLT-AUD-003: HTTP CLI v2 docs staff-only, legacy client scope and audit on PG 001–098', testOptions, async t => {`
- ✅ `tests/cli13-portal-access-modes.test.mjs:63` — vínculo conta/documento verificado no servidor
  `test('CLI-13: vínculo conta/documento é verificado no servidor; recusa é auditada sem pedido', async()=>{`

### SEC-04 — Login individual de staff, papéis, convites e revogação
- ✅ `tests/staff-auth.integration.test.mjs:160` — papel vem do banco, não do cookie
  `test('SEC-04: staff válido recebe sessão com o papel do banco e identidade auditável', { skip: !RUN }, async () => {`
- ✅ `tests/staff-auth.integration.test.mjs:180` — revogação imediata de sessão emitida
  `test('SEC-04: suspender a identidade invalida IMEDIATAMENTE a sessão já emitida', { skip: !RUN }, async () => {`
- ✅ `tests/admin-entry.integration.test.mjs:142` — navegação por papel em browser real
  `test('login por papel: marcelo, rh e supervisor entram com papéis distintos', { skip: !RUN }, async () => {`

### SEC-05 — Substituir tokens compartilhados por autenticação individual com migração controlada
- ✅ `tests/staff-auth.integration.test.mjs:234` — token compartilhado recusado mesmo configurado
  `test('SEC-05: token compartilhado é recusado por padrão, mesmo configurado', { skip: !RUN }, async () => {`
- ✅ `tests/staff-auth.integration.test.mjs:241` — cookie forjado não concede sessão
  `test('SEC-02: cookie forjado/adulterado não concede sessão', { skip: !RUN }, async () => {`

### SEC-06 — MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit
- ✅ `tests/staff-auth.integration.test.mjs:276` — senha isolada não emite sessão com MFA
  `test('SEC-06: com MFA ativo, a senha sozinha NÃO emite sessão', { skip: !RUN }, async () => {`
- ✅ `tests/staff-auth.integration.test.mjs:319` — TOTP não reutilizável
  `test('SEC-06: TOTP correto emite sessão; o MESMO código não vale duas vezes', { skip: !RUN }, async () => {`
- ✅ `tests/staff-auth.integration.test.mjs:390` — expiração e limite de tentativas
  `test('SEC-06: desafio MFA expira e limita tentativas', { skip: !RUN }, async () => {`

### SEC-07 — Corrigir troca de e-mail e handlers HTTP
- ✅ `tests/staff-auth.integration.test.mjs:138` — identidade com e-mail pendente não autentica
  `test('SEC-04: identidade pending_email não autentica', { skip: !RUN }, async () => {`
- ✅ `tests/client-auth-core.test.mjs:27` — núcleo de autenticação do cliente
  `test("password policy requires at least 12 characters without artificial composition rules", () => {`

### SEC-08 — Migrações rastreadas e executáveis
- ✅ `tests/site-appearance.focal.test.mjs:7` — guarda lê o ledger real de migrações do disco
  `test('o manifesto oficial declara exatamente as migrações presentes em db/migrations',async()=>{`
- ✅ `scripts/qa-wave0-static.mjs:69` — varredura estática de migrações ausentes
  `console.log(`RESUMO: ${report.filter(x => x.ok).length}/${report.length} verificações estáticas OK; ${missingImports.length} imports ausentes; ${missingMigratio`

### SEC-09 — Reparar suíte e testar APIs reais
- ✅ `scripts/qa-wave0-static.mjs:69` — bateria estática de imports e migrações
  `console.log(`RESUMO: ${report.filter(x => x.ok).length}/${report.length} verificações estáticas OK; ${missingImports.length} imports ausentes; ${missingMigratio`
- ✅ `tests/cli-v2.integration.test.mjs:49` — teste de API real em HTTP + PostgreSQL
  `test('TENANT-SEG-003 / PLT-AUD-003: HTTP CLI v2 docs staff-only, legacy client scope and audit on PG 001–098', testOptions, async t => {`

### SEC-10 — Consolidar orçamento/simulador e catálogo
- ✅ `tests/ux-public-routes.integration.test.mjs:463` — jornada pública de orçamento em browser real
  `test('browser E6 grupo 2: /orcamento anuncia falha com foco e mantém o formulário', { skip: !RUN }, async () => {`
- ✅ `scripts/ux-pro-00-inventory.mjs:33` — matriz de cobertura das rotas públicas
  `const MATRIX_CSV = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv';`

### SEC-11 — Separar prévias e recursos reais
- ✅ `tests/ux-public-routes.integration.test.mjs:653` — aviso de prévia separado de recurso real
  `await page.locator('[data-testid="site-preview-notice"]').waitFor();`
- ✅ `tests/ux-pro-10b-previas-medicoes.test.mjs:32` — baseline de prévias sem aprovação implícita
  `const BASELINE_UNDER_45 = Object.fromEntries([`

### SEC-12 — Privacidade e declarações de aprovação verificáveis
- ✅ `tests/cli13-portal-access-modes.test.mjs:120` — aprovação cria convite com decisão/histórico/auditoria
  `test('CLI-13: aprovação cria convite canônico, decisão/histórico/auditoria, mas nenhum grant ou contrato', async()=>{`
- ✅ `tests/client-manual-approval-guards.test.mjs:20` — guardas de aprovação manual do cliente
  `test('QA-HOM-007: manual approval requires method/origin and individual current TI identity', async () => {`

### SEC-13 — Segurança de sessão, CSRF, origem e erros
- ✅ `tests/staff-auth.integration.test.mjs:310` — CSRF: mutação sem Origin é recusada
  `test('mutação sem Origin correto é recusada (CSRF)', { skip: !RUN }, async () => {`
- ✅ `tests/admin-entry.integration.test.mjs:286` — redirecionamento externo recusado
  `test('browser: next externo/domínio alheio é recusado no redireciono pós-login', { skip: !RUN }, async () => {`
- ✅ `tests/client-security-routes-fail-closed.test.mjs:25` — rotas de segurança do cliente fail-closed
  `test(`SEC-06/07 ${handler}: rejects method, origin, anonymous`, async () => {`

### SEC-14 — Auditoria durável e operacional
- ✅ `tests/cli-v2.integration.test.mjs:207` — criação de documento persiste em audit_log
  `await t.test('admin/ti can list metadata and a document creation is persisted in operational audit_log', async () => {`
- ✅ `tests/cli-v2.integration.test.mjs:244` — falha de auditoria reverte a transação
  `await t.test('PLT-AUD-004: injected operational audit failure rolls back v2 document and version', async () => {`
- ✅ `tests/cli13-portal-access-modes.test.mjs:144` — falha de auditoria devolve 503 e reverte pedido
  `test('CLI-13: falha da auditoria devolve 503 e reverte pedido e histórico', async()=>{`

### SEC-15 — Proteção de abuso e identidade
- ✅ `tests/staff-auth.integration.test.mjs:421` — rate limiting com 429 e Retry-After
  `test('rate limiting: excesso de tentativas de login devolve 429 com Retry-After', { skip: !RUN }, async () => {`
- ✅ `tests/staff-auth.integration.test.mjs:304` — desafio MFA inválido recusado
  `test('SEC-06: desafio MFA inválido/inexistente é recusado', { skip: !RUN }, async () => {`
- ✅ `tests/cli14-account-security.test.mjs:42` — escritas sensíveis são transacionais
  `test('CLI-14 all sensitive writes are transaction-scoped and audit failure is explicit', () => {`


## O que isto NÃO é

- **Não é aceite humano.** Nenhum dos 15 IDs foi validado por pessoa, UAT, Windows real ou leitor de tela.
- **Não é reauditoria integral.** O mapa liga cada requisito a asserções existentes; não percorre a jornada completa por papel, autorização, API, banco e dado de ponta a ponta.
- **Não é aprovação de produção.** Produção segue **NO-GO**.
- Uma âncora ausente é uma **lacuna real de evidência**, não um requisito implementado sem teste.

Artefatos: `docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.{json,csv}`. Gerador: `scripts/requisitos-sec-reaudit.mjs --check`.

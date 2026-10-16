# UX-PRO-09A-5 — G5 nas entradas públicas do cliente: relatório (16/10/2026)

**Status:** implementação e validação local concluídas; merge condicionado a checks remotos verdes e
revisão concluída. Homologação e produção permanecem **NO-GO**; nada aqui declara aceite humano,
UAT ou conformidade WCAG.

## 1. Base, problema e alteração

- Base `main`/`origin/main` = **`5909e227b8ed015863dea00e2df23f63397cde3d`** (merge da PR **#253**,
  UX-PRO-09A-4/G3). Branch fixa: `arena/7dbaae55-gruposegsystemseguranca`. #234 alheia, intocada.
- Escopo antes do código: [UX-PRO-09A-5-ESCOPO-ANTES-2026-10-16.md](UX-PRO-09A-5-ESCOPO-ANTES-2026-10-16.md).
- Problema (G5, numerada desde a 09A): em `/cliente/entrar` (credenciais e etapa MFA) e
  `/cliente/convite` (aceite), o erro pós-submissão tinha `role="alert"` mas **nenhum foco**; como o
  botão é desabilitado em `busy`, o foco caía em **BODY** — medido de verdade na execução RED:
  8/8 percursos terminaram em `BODY (foco perdido ao desabilitar o botão)`, e o passo de teclado
  seguinte não alcançava a repetição (`Esqueci minha senha`/BODY, nunca o botão de repetir).
- Alteração: o padrão já mergeado de G1/G2 aplicado **localmente em cada rota** — `errorRef` +
  `tabIndex={-1}` + `useEffect` de foco no erro — nos parágrafos de erro pós-submissão
  (`src/app/cliente/entrar/page.tsx`, dois ramos do mesmo estado `error`;
  `src/app/cliente/convite/page.tsx`, ramo de aceite). O contorno de foco visível já existia em
  `src/app/cliente/RealAccess.module.css:207` e foi reutilizado; **nenhum CSS compartilhado mudou**.
- O aviso de **montagem** de `/cliente/convite` (convite usado/expirado/revogado/inexistente) não
  decorre de ação da pessoa e permanece exatamente como estava, conforme escopo.

## 2. Regressão e medição (gate existente `npm run test:ux-portal:pg`)

Teste novo, sem tocar os testes de G1 (#250), G2 (#251), G4 (#252) e G3 (#253):

- `/cliente/entrar`: conta desconhecida sintética → `401` genérico real do `POST /api/auth/login`;
  percurso medido em 320/390/768/1440 (tema claro): foco no e-mail → Tab → senha → Tab → botão →
  Enter → erro → passo seguinte; campos **limpos antes de capturar** (senha nunca entra em PNG).
- `/cliente/convite`: convite **pendente real** emitido por `/api/admin/invites` com sessão de papel
  TI provisionada no PostgreSQL descartável; token lido da caixa local e usado só em memória;
  senha comum de 12 caracteres (`password1234`, da lista pública `COMMON_PASSWORDS`) → `400
  password_common` real; o convite **não é consumido** (`used_at`/`revoked_at` nulos ao final).
- `resumo.json` gravado **antes** das asserções de correção: por isso a execução RED deixou
  registrada a medição do estado anterior em `antes/` (8 PNGs + resumo com foco em BODY).
- Com a correção, nos 8 percursos: foco pós-falha na própria mensagem
  (“E-mail ou senha não conferem…”/“Essa senha é muito comum…”) e o passo seguinte alcança a
  repetição (`Entrar`/`Criar meu acesso`); overflow horizontal 0 nas quatro larguras.

## 3. Verificações locais reais

| Comando | Resultado |
|---|---|
| `npm run test:ux-portal:pg` (RED, código sem o foco) | **fail 1/1** na asserção de foco, com `BODY (foco perdido ao desabilitar o botão)`; medição “antes” gravada em `antes/` |
| `npm run test:ux-portal:pg` (conjunto final com a correção) | **19/19**, 0 fail/skip/cancel/todo; PostgreSQL descartável + HTTP real + Chromium; `QA_PG_TEMP_CLEANED: true` |
| `npm run test:unit` | **949/949**, 0 fail/skip/cancel/todo |
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 OK |
| `npm run build` | exit 0 |
| `node scripts/ux-pro-00-inventory.mjs` e `--check` | regenerado pelo gerador; **somente** as linhas de `/cliente/entrar` e `/cliente/convite` mudam nos dois CSVs (capturas 320/390/768/1440, estágio `UX-PRO-09A-5`); `OK:` no `--check` |
| `git diff --check` | exit 0 |

**Histórico de desenvolvimento, não omitido:** na primeira execução GREEN o teste **#14 (G1,
intocado)** falhou por **crash ambiental de lançamento do Chromium empacotado**
(`browserType.launch ... signal=SIGSEGV`, 31 ms, sem chegar a navegar); os demais 18 passaram,
incluindo o novo G5. Reexecução integral do gate, sem qualquer mudança de código ou de teste:
**19/19**. Não houve mock, bypass nem relaxamento de asserção; o incidente é de infraestrutura local
(Chromium `--single-process`), não do produto nem do gate.

## 4. Evidências e limites de interpretação

Pasta [UX-PRO-09A-5-evidencias-2026-10-16](UX-PRO-09A-5-evidencias-2026-10-16/):

- `antes/`: 8 PNGs + `resumo.json` da execução RED (foco em BODY nas duas rotas, quatro larguras).
- Raiz: 8 PNGs + `resumo.json` da execução GREEN (foco na mensagem de erro; repetição alcançável;
  overflow 0; `simulatedFetchRejection: false`, `mockedHttp: false`; token de convite e senha
  ausentes de PNG/JSON).
- Dimensões reais fullPage conferidas por assinatura/IHDR: entrar 320x946/390x868/768x900/1440x900;
  convite 320x1018(antes)/320x996, 390x926, 768x929(antes 907)/1440x930. Inspeção visual da captura
  390 de `/cliente/entrar` mostra o erro com contorno de foco e campos vazios.
- Comando reproduzível sem sobrescrever G1–G4:

```sh
UX_PORTAL_G5_EVIDENCE_DIR=docs/UX-PRO-09A-5-evidencias-2026-10-16 npm run test:ux-portal:pg
```

Limites: inspeção automatizada não substitui avaliação humana; não cobre leitores de tela, zoom
200%, Windows ou tema noturno (as duas superfícies só oferecem tema claro; nenhum alternador foi
criado). O erro continua fora da ordem sequencial do `Tab` (`tabIndex={-1}`), como no padrão G1/G2
já aceito; a repetição foi medida como alcançável no passo seguinte.

## 5. Preservações verificadas

- Mensagens de erro, endpoints, payloads, contratos (`/api/auth/login`, `/api/auth/invite/accept`,
  `/api/auth/invite/inspect`), throttle, política anti-enumeração, política de senha, MFA,
  sessão/cookie, uso único do convite e auditoria: **intactos** (nenhum arquivo de servidor mudou).
- Estados de montagem (convite inválido; `checking`/MFA da entrada) e prévias: intactos.
- CSS compartilhado e componentes compartilhados: nenhuma mudança transversal; correção local.
- Testes de G1/G2/G3/G4: intactos no mesmo conjunto (18 anteriores + 1 novo = 19).
- Nenhum endpoint, migração, script QA ou workflow novo; CSVs só pelo gerador.

## 6. Resíduos numerados

1. **G5 de `/admin/entrar` e `/funcionario`**: medido estaticamente no escopo, corrigido na subfatia
   UX-PRO-09A-6 (gates `admin-entry` e `ux-portal`).
2. Aviso de montagem de convite inválido sem foco: decisão deliberada desta fatia (não é transição
   causada por ação); reavaliar só com decisão própria do proprietário.
3. Crash ambiental intermitente de lançamento do Chromium empacotado em Linux: registrado aqui; se
   reaparecer em CI, tratar como infra, sem afrouxar asserções.
4. Sem aceite humano/UAT/WCAG; homologação e produção **NO-GO**.

## 7. Prompt completo da próxima subfatia (UX-PRO-09A-6 — G5 em /admin/entrar e /funcionario)

```text
Trabalhe no repositório berger33/gruposegsystemseguranca, partindo da main remota mais recente na
branch fixada pela sessão Arena. Leia AGENTS.md, README.md, docs/ARENA-PRESERVAR-FUNCIONALIDADES.md,
docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md, docs/UX-PRO-09A-5-ESCOPO-ANTES-2026-10-16.md e
docs/UX-PRO-09A-5-RELATORIO-2026-10-16.md. Confirme SHA da main e reconcilie PRs/checks; G1 #250,
G2 #251, G4 #252, G3 #253 e G5-cliente (09A-5) MERGED: não reabra. #234 alheia: não tocar.

Execute SOMENTE a subfatia UX-PRO-09A-6 — G5 nas entradas /admin/entrar (AdminLoginClient, temas
dia/noite) e /funcionario (Login embutido de EmployeePortal): meça antes, em percurso real de
teclado, o alvo de foco após falha de submissão (hoje role="alert"/ErrorNotice sem foco, com foco
caindo em BODY ao desabilitar o botão). Antes do código, escreva o escopo "antes" e verifique qual
regra de contorno de foco existe em cada módulo de CSS; se faltar, acrescente regra LOCAL no módulo
da rota, sem tocar componente compartilhado (UiState) nem CSS transversal. Aplique o padrão G1/G2
(ref + tabIndex={-1} + focus no efeito) localmente; preserve mensagens, contratos, RBAC, MFA,
rate limit, sessão/cookie, tema administrativo e estados loading/out/in/failed. Estenda os gates
existentes (tests/admin-entry.integration.test.mjs para /admin/entrar e
tests/ux-portal-workspace.integration.test.mjs para /funcionario), mantendo intactos todos os testes
anteriores; grave resumo.json antes das asserções de correção para registrar o "antes" em pasta
antes/, com evidências 320/390/768/1440 nos dois temas onde suportados e percurso de vários passos.
Revalide test:unit, typecheck, test:admin-entry:pg, test:ux-portal:pg, build e inventário --check.
Abra UMA PR pequena; só merge com todos os checks obrigatórios realmente verdes e base main
confirmada. Depois dela, a fila da família é UX-PRO-09B (site público, só diagnóstico; logo apenas
com defeito reproduzido e autorizado) e UX-PRO-09C (identidade). E2–E9/C11 dependem de autorização
por item; homologação e produção continuam NO-GO; não invente aceite humano nem conformidade WCAG.
```

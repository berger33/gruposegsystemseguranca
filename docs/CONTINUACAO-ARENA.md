# Continuidade Arena — registro de sessão 2026-10-04 (F00 + F01)

## Identificação

- SHA base: `540faf6c5124fd243fc3e287527ff4f6983ce8f1` (main, merge da PR #120).
- Branch de trabalho: `arena/01a1056f-gruposegsystemseguranca`.
- Escopo da sessão: F00 (reconciliação) + F01 (entrada e navegação central de staff), conforme [prompt master](auditoria-2026-10-04/04-PROMPT-MASTER-ARENA.md).
- Migrações: **nenhuma nova** — 001–156 intocadas; próxima livre no main vigente: 157.

## O que foi implementado

### F00 — reconciliação (documental)

- `docs/STATUS-ATUAL-CONSOLIDADO.md`: os 222 IDs transcrevidos 1:1 do checklist cruzados com código (tela, API, tabela canônica, papéis, teste vigente, estado, pendência), sumário executivo, classificação dos 28 PRs abertos e divergências históricas resolvidas.
- `docs/PLANO-CONCLUSAO-ARENA.md`: lista única de trabalho F00→F16 com ordem, dependências e regras permanentes.
- Pasta `docs/auditoria-2026-10-04/` (PR #121) trazida para a linha de trabalho sem alterar código do main.
- Classificação de PRs abertos (sem nenhum merge/close nesta sessão): #121 = fonte de instruções; **superseded**: #104–#117 (EXT-07 → coberto por #103/#113/#115/#118/#119), #102 (EXT-06 → mesclado em #101), #79/#81/#82/#84/#86 (L08 → #78–#95), #47/#53/#59/#60/#62/#67/#70/#72/#75 (FIN → #57–#77). Recomendação registrada no STATUS: fechar com comentário de reconciliação, a cargo do proprietário.

### F01 — entrada e navegação central de staff (código)

Achados da auditoria atacados um a um:

| Achado | Correção |
|---|---|
| `/admin` retornava 404 | Nova página-hub `src/app/admin/page.tsx` + `AdminHub.tsx`: gate de sessão e cartões apenas dos módulos do papel |
| `/admin/marcelo` anônimo mostrava estrutura e erros sem login | `AdminGate` (`src/app/admin/AdminGate.tsx`): 401 → redireciona a `/admin/entrar?next=<destino atual>`; papel indevido → estado 403 claro que declara o papel da sessão; falha de rede → erro com "Tentar novamente" |
| Login funcional ficava embutido em `/admin/clientes` | Login central novo `src/app/admin/entrar/` (e-mail/senha individuais, passo MFA no mesmo fluxo, redireciono pós-login por papel) |
| Rótulo "E-mail individual de TI" no login compartilhado | Rótulo papel-neutro "E-mail da conta individual"; aba de chave legada só aparece quando o servidor informa habilitação (`GET /api/admin/session/options`, endpoint novo em `server.mjs`); caso contrário, nota "chave legada está desativada" |
| Navegação por papel ausente | `AdminChrome`: menu filtrado por papel (19 módulos), chip de papel com nome humano, botão Sair sempre visível (DELETE revoga no servidor e devolve à entrada) |
| Redirecionamento pós-login | `resolvePostLoginTarget`/`sanitizeAdminNext` em `src/lib/admin-entry.mjs`: aceita somente caminhos internos de `/admin` (query/hash permitidos), recusa URL absoluta, `//host`, barras invertidas, controles, `/admin/entrar` (anti-loop) e `/administrador` (vizinho fora do namespace — capturado em teste) |

Arquivos principais: `src/lib/admin-entry.mjs` (+`admin-entry.d.mts`), `server.mjs` (rota `/api/admin/session/options` — aditiva, nenhum contrato existente alterado), `src/app/admin/{page,AdminGate,AdminHub,AdminChrome.module.css,entrar/*}.tsx`, `src/app/admin/marcelo/page.tsx`, `src/app/admin/clientes/page.tsx` (gate local duplicado removido), `src/app/admin/funcionarios/page.tsx`.

**O que NÃO mudou de propósito:** autorização no servidor (readSession/requireRole, RBAC do painel ADM, permissões finas de RH), migrações, `/admin/verificacao-manual` (reautenticação de ação sensível), portals de cliente/funcionário (sessões separadas). RH **não** recebeu acesso à administração — prova: `/api/adm/panel/indicators` com cookie de RH responde 403.

## Testes executados e resultados reais

| Comando | Resultado | Ambiente |
|---|---|---|
| `npm ci` | 0 erros | sandbox Linux Node 22.22.3 |
| `npm run typecheck` | limpo | idem |
| `npm test` (unit) | **525/525** pass, 0 skip (514 anteriores + 11 novos `tests/admin-entry.test.mjs`) | idem |
| `npm run test:admin-entry:pg` | **13/13** pass — HTTP real contra PostgreSQL 17.9 descartável (embedded, cluster apagado no finally) + Chromium 153 real | idem |
| `npm run test:staff-auth:pg` (regressão L01) | **21/21** pass | idem |
| `npm run build` | sucesso; `/admin` e `/admin/entrar` geradas no bundle (HTML contém os marcadores) | idem |
| `git diff --check` | limpo | idem |

Cobertura do gate F01 (`tests/admin-entry.integration.test.mjs`): `/admin` não-404; `/admin/entrar` servido; `options` com legado oculto; 401 anônimo preservado; login marcelo/rh/supervisor com papel correto e identityId; senha inválida 401 sem detalhe; conta suspensa 401 `identity_not_active`; RBAC painel (marcelo 200, rh 403); logout revoga cookie reutilizado (401); browser: anônimo → login com `next=%2Fadmin%2Fmarcelo` → volta ao painel com rótulo e chip corretos e aba legada desabilitada; RH entra em `/admin/funcionarios`, menu sem painel administrativo, URL direta cai no 403 declarativo; `next=https://…` recusado (cai na home do papel, nunca fora do domínio); senha errada mostra "E-mail ou senha não conferem." sem sair da entrada; logout pelo chrome devolve à entrada e sessão sai 401.

**Limites honestos da prova:** execução em Linux; `embedded-postgres` (não Docker SEPARADO como no operador); jornada de browser cobre anônimo→login→retorno, mas não cobre MFA ponta a ponta com autenticador real nem a aba de chave legada habilitada (estado habilitado tem prova unitária; a tentativa legada real está coberta por `test:staff-auth:pg`); nenhuma jornada funcional de RH foi reexercida além do gate (permissões finas `employees.*` seguem nos gates de origem); Windows EPERM/symlink segue para F02.

## Pendências e próximos passos (ordem)

1. Revisão/merge desta PR e fechamento (sem merge) das 26 PRs superseded com comentário apontando esta reconciliação — ação do proprietário.
2. F03 — massa de demonstração idempotente (empresa/cliente A e B, equipe/funcionário, conta RH, Marcelo, contratos) com gate em PG descartável. Precisa das contas já provisionáveis no banco do operador; login central F01 já as recebe.
3. F04 = EXT-08 (conhecimento) ou pendência declarada do aceite: obrigação vencida do EXT-07 produzindo tarefa por vencimento (gate EXT-07 existe; cenário de vencimento real pendente).
4. F02 — Windows/EPERM symlink + scripts operação + backup/restauração em instância separada (na máquina do operador).

## Prompt completo para a próxima sessão

```text
Continue o projeto berger33/gruposegsystemseguranca usando exclusivamente o GitHub.
Branch da sessão anterior: conforme a linha arena/* vigente; PR anterior referência:
"feat(f01): entrada e navegação central de staff" (login central /admin/entrar, hub
/admin, AdminGate, opções de login) — NÃO refazer. Leia nesta ordem:
1. Leia docs/CONTINUACAO-ARENA.md (último registro), docs/STATUS-ATUAL-CONSOLIDADO.md,
   docs/PLANO-CONCLUSAO-ARENA.md e docs/auditoria-2026-10-04/ (README, AUDITORIA,
   02-PLANO-ARENA, 03-ACEITE, 04-PROMPT-MASTER) — já integradas ao main; se ainda não
   estiverem, obtenha da branch docs/auditoria-arena-2026-10-04.
2. Execute a próxima fatia pendente da lista única: F03 (massa de demonstração
   idempotente) ou EXT-08 (F04), conforme o main vigente. Uma fatia por PR, PR pequeno.
3. Regras: migrações 001–156 imutáveis (reserve a próxima livre no main vigente);
   autorização no servidor em toda API; fail-closed; auditoria transacional;
   idempotência; PLAT-01 preservado; banco descartável (embedded-postgres ou Compose
   exclusivo); dados fictícios (.invalid); sem segredos em git/logs; SMTP real e
   hospedagem fora do escopo.
4. Ao terminar: atualize docs/CONTINUACAO-ARENA.md (SHA/branch/PR, arquivos, testes,
   limites), docs/STATUS-ATUAL-CONSOLIDADO.md e o checklist apenas com evidência;
   entregue o prompt da próxima sessão. Não declare o sistema concluído enquanto
   houver requisitos pendentes; fallback de IA não conta como LLM real.
```

## Decisões e riscos registrados

- Menu por papel é navegação, não autorização: documentado em `AdminGate.tsx` e no hub; toda API decide acesso no servidor (nenhum handler alterado nesta fatia).
- `/admin/clientes` perdeu o formulário embutido: quem usava a aba "chave legada" ali passa pelo login central, que só a oferece habilitada — comportamento desejado pelo F01.
- `GET /api/admin/session/options` é público por necessidade de UI e responde sem banco; não revela segredos, contagem de staff nem disponibilidade de MFA. Aceitação do token legado continua fail-closed no POST (`evaluateLegacyTokenPolicy`).
- Risco remanescente: páginas administrativas *não tocadas* por esta fatia (comercial, contratos, financeiro, operação, etc.) continuam sem o gate central — propositalmente, para manter a PR pequena; anônimo nelas segue vendo erros de API em vez do fluxo de login. Expansão gradual sugerida na sequência (ou na F03).

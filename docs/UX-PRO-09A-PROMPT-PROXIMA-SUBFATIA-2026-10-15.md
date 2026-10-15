# Prompt da próxima subfatia — UX-PRO-09A (entradas)

```text
Trabalhe em berger33/gruposegsystemseguranca, na branch fixada pela nova sessão Arena, partindo da main remota mais recente. Leia AGENTS.md, README.md, docs/ARENA-PRESERVAR-FUNCIONALIDADES.md, docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md, docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md e docs/UX-PRO-08-FECHAMENTO-2026-10-15.md.

Primeiro faça fetch, confirme SHA da main e reconcilie PRs/checks com GitHub. A família 08 tem 08A (#244), 08B (#245) e 08C (#246) mergeadas; 08D foi mergeada na #247 (`3d807a4`) durante uma sessão concorrente. Confirme também o estado da PR #248, complementar da matriz noturna (12 capturas 320/390/1440 nas quatro rotas staff), sem reabrir PR mergeada. Se o complemento não estiver mergeado/verde, registre o bloqueio antes de implementar. Não reimplemente conhecimento, RagWidget, assistentes nem a faixa/noindex/selo de prévia. Não misture a PR #234 (financeiro) nem pendências numeradas da 08D.

Execute SOMENTE UX-PRO-09A — entradas, conforme cronograma §3:
/admin/entrar, /cliente/entrar e rotas reais de recuperar/redefinir senha, confirmar/alterar e-mail e convites, além de /funcionario. Inventarie primeiro quais rotas são reais, redirecionamentos de compatibilidade ou prévias; não ative módulos órfãos. Audite acessibilidade, tipografia, rótulos, erros/confirmacões honestos, foco e responsividade 320/390/768/1440 em dia/noite onde o tema for suportado.

ANTES de codar, escreva docs/UX-PRO-09A-ESCOPO-ANTES-AAAA-MM-DD.md medindo a base real e numerando lacunas, com contratos/papéis/gates por rota. Se a lista exigir várias PRs, selecione apenas a menor subfatia coesa de entrada com lacuna reproduzida e registre o restante; não redesenhe todas as entradas de uma vez. Toda correção deve ser aditiva e coberta por regressão. Não altere sessão, cookies, grants, MFA, rate limit, mensagens genéricas contra enumeração, força de senha, expiração/uso único/revogação dos links, auditoria, recuperação, payloads ou isolamento de identidades.

Valide unitários, typecheck e gates dedicados reais dos fluxos tocados. Colete evidências por rota/largura/tema/teclado em pastas próprias com resumo.json legível por máquina; confira contagem e dimensões dos arquivos. Não use só o primeiro Tab como prova de percurso. Preserve e regenere UX-PRO-00 se o gerador creditar novas capturas, sem ampliar seu critério artificialmente.

Abra UMA PR pequena. Só faça merge com todos os checks obrigatórios verdes; confirme o commit resultante na main. Se não houver permissão para consultar regras de proteção, declare o limite e confira todos os checks reportados antes de tentar o merge, sem bypass. Entregue relatório, preservações, testes, resíduos numerados, limites e prompt da próxima subfatia realmente pendente.

Regras: sem segredos, credenciais fictícias, tokens ou dados pessoais em documentação/logs/capturas; dados sintéticos só em banco descartável. E2–E9 e C11 fora de escopo sem autorização explícita por item. Home/site público (09B) só diagnóstico, nenhuma alteração além do logo. Homologação e produção continuam NO-GO; não invente aceite humano nem conformidade WCAG.
```

# UX-PRO-06 — estados de leitura da carteira comercial (`/admin/carteira`)

**Base:** `main` `d84dc8f2ab96c8f1ede482e8d0892f27afc6b0d5` (13/10/2026, pós-merge da PR #212).
**Superfície desta PR:** a tela `/admin/carteira` — "Carteira e próximos contatos" — e o
módulo de estilos que ela já usa. É uma tela da família CRM/comercial interna, escolhida
pelo proprietário nesta sessão entre as recomendações `/admin/carteira` e `/admin/comercial`.

**Fora desta PR, deliberadamente:**

- `/admin/crm` (funil) e `/admin/leads` (fila de pedidos) — entregues nas PRs #210/#211/#212,
  não reabertas nem reimplementadas;
- `/admin/comercial`, `/admin/contratos`, `/admin/expansao` — demais telas da família, cada
  uma com sua própria fatia; a rota `/admin/comercial` não é tocada aqui;
- `/admin/clientes` (gestão interna de contas, vínculos, grants, convites) — família distinta;
- o portal autenticado do cliente (`/cliente/app/*`) — área separada, com sessão, grant e
  escopo próprios;
- formulários, criação de ação de carteira, idempotência (`request_key`), filtros canônicos,
  paginação por `offset`, indicadores e listas de ações recentes — o comportamento destes
  fluxos permanece o mesmo;
- contratos de API, papéis, permissões, auditoria e dados canônicos — nenhum tocado.

UX-PRO-06 **não** está concluída por esta fatia: esta PR cobre uma tela coerente da família
CRM/comercial interna.

## Escopo registrado antes de implementar (13/10/2026)

**Comportamento que precisa permanecer (inventariado no código antes de editar):**

- `AdminGate allowedRoles={["comercial","marcelo","admin","ti"]}` — papéis e sessão inalterados;
- `GET /api/crm/portfolio?filter=<all|no_next|overdue|won|lost>&offset=N` — mesmos filtros
  canônicos, mesma paginação, mesma leitura **pessoal** (a consulta do servidor usa o
  responsável da sessão: `o.responsible_id=$1 OR (o.responsible_id IS NULL AND o.created_by_id=$1)`);
- `POST /api/crm/portfolio` com `source_id`, `request_key`, `kind`, `title`, `next_action`,
  `next_action_date` — mesma idempotência, mesmas regras (reativação só a partir de perdida,
  indicação exige `target_company_id`) e mesma trilha de auditoria;
- `GET /api/crm/companies?limit=200` usado pelo seletor de empresa da indicação;
- estados já existentes de carregando / vazio / erro / negado / sucesso (UX-03B) e o
  vocabulário de estágios e de tipos de ação (`stageLabel`, `kindLabel`);
- foco programático no título do formulário ao abrir "Criar ação de carteira"
  (`tabIndex={-1}` + `ref`) e alvos de toque ≥ 44 px;
- ausência de transbordo horizontal em 390 px e o título acessível do cartão, exercitados
  pelo gate `npm run test:l04-delivery:pg`.

**Riscos identificados e como serão tratados:**

1. **Mostrar dado velho como se fosse atual.** A faixa de desatualização é `role="alert"`,
   cita o motivo real, a hora da última leitura concluída e a frase de que dados antigos não
   significam carteira vazia; a hora vem do relógio do navegador no instante do sucesso —
   nenhum valor é estimado nem gravado.
2. **Autorização mascarada por dado preservado.** Falha `denied`/`auth` continua falhando
   fechada: substitui o conteúdo pelo estado negado completo e não oferece repetir a mesma
   chamada. Dado preservado só existe para falha transitória/de rede (`retry`).
3. **Recorte diferente do dado preservado.** Enquanto a faixa estiver visível, a tela diz
   que os itens são da última leitura concluída e podem não corresponder ao recorte atual.
4. **Regressão fora da tela.** O módulo `UiWorkspace.module.css` é compartilhado por 32
   arquivos; qualquer alteração nele só entra se medida como defeito desta tela e se os
   gates que usam o módulo continuarem verdes. Sem medição, não há alteração de CSS.
5. **Regressão silenciosa nos arquivos gerados.** `next-env.d.ts` e `tsconfig.json` são
   restaurados pelo próprio gate; a sessão confere o `git status` e os hashes depois de cada
   execução e não deixa os dois alterados.
6. **Inventário divergente.** As capturas novas mudam a linha `/admin/carteira` da matriz;
   os dois CSVs vigentes de 13/10 serão regenerados pelo próprio gerador e a sessão confere
   que nenhuma outra linha mudou.
7. **Evidência com dado real.** Massa 100% sintética criada pelas mesmas APIs, sessão de
   staff provisionada pelo gate, sem credencial e sem dado pessoal em captura, log ou
   documento.

**Validações planejadas (proporcionais à superfície):**

- `npm run typecheck`; `npm test`; `npm run build`; `node scripts/qa-wave0-static.mjs`;
- `node scripts/ux-pro-00-inventory.mjs --check` (antes e depois da regeneração);
- `npm run test:ux-crm:pg` com testes novos desta fatia (falha que preserva, atualização em
  curso, falha fechada em autorização, leitura inicial que falha não vira zero, ausência de
  transbordo em 320/390/768 px, tema noturno e percurso de teclado);
- `npm run test:l04-delivery:pg` (já exercita `/admin/carteira` a 390 px);
- capturas próprias 320/390/768/1440 px, dia/noite e estado desatualizado, com `resumo.json`
  legível por máquina.

**Estado deste documento:** escopo e riscos registrados antes da implementação; as seções
"Antes", "Depois", "Verificações e evidência" e "Limitações" são preenchidas com o resultado
real das execuções antes da abertura da PR.

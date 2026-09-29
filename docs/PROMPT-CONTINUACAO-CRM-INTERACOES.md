# Continuação Arena — L04 após ampliar CRM-07

## Objetivo e fonte
Continue `berger33/gruposegsystemseguranca` somente na branch Arena atribuída à sessão. Leia `docs/EXECUCAO-ENTREGA-LOCAL.md`, `docs/PLANO-MESTRE-IMPLEMENTACAO.md`, `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e `docs/CHECKLIST-ENTREGA-LOCAL.md` antes de alterar código.

O roteiro L00–L10 contém 222 requisitos. SMTP e hospedagem externa continuam fora da entrega local. L04 permanece **PARCIAL**: não avance para L05 enquanto as lacunas combinadas não forem resolvidas ou receberem mudança explícita de escopo.

## Base conferida e patch desta continuação

- A implementação partiu de `05f258f5385c755724e6908a650da116766d9e69` (`main` após o ajuste documental do PR #15). O histórico anterior que cita `927cb8d` é contextual, não é uma base para restaurar.
- **Código já integrado:** PR #16 (`https://github.com/berger33/gruposegsystemseguranca/pull/16`) foi mesclado em `main` no commit `a7682117b36b651384bd49a836fa2aa8443728fc`. Comece a próxima sessão conferindo o SHA atual da branch Arena e de `main`; não restaure refs históricas.
- Código do recorte: `c69685f` — `feat(crm-07): complete interaction follow-up`; documentação/evidências: `fb46930`.
- CI do PR #16 verde: L04 CRM delivery (`crm-postgres-browser`) e QA baseline (`static-and-smoke`).
- Escolha executada: **Opção A**, ampliação do histórico de interações. A agenda CRM-08 não foi iniciada neste recorte.

### Entregue no CRM-07

- `GET/POST /api/crm/opportunities/:opportunityId/interactions` agora tem paginação real por `limit` (1–100) e `offset`, total e cursores anterior/próximo; a UI usa páginas de 25 itens.
- Tipos aceitos: `ligacao`, `reuniao`, `email`, `whatsapp`, `visita`, `nota` e `outro`.
- O vínculo opcional `contact_id` é aceito apenas se o contato estiver ativo e pertencer à empresa derivada da oportunidade. A API entrega somente esses contatos para o seletor autorizado.
- Novas rotas autenticadas e de mesma origem para o dono atual da oportunidade:
  - `PATCH /api/crm/opportunities/:opportunityId/interactions/:interactionId` — edição otimista via `expected_version`;
  - `DELETE /api/crm/opportunities/:opportunityId/interactions/:interactionId` — exclusão lógica (`deleted_at`, `deleted_by_id`), sem apagar bytes nem histórico de auditoria;
  - `POST /api/.../interactions/:interactionId/attachments` — anexo PDF/JPEG/PNG/TXT até 5 MB;
  - `GET /api/.../interactions/:interactionId/attachments/:attachmentId/download` — download privado autorizado.
- O anexo reutiliza o armazenamento privado L02 (`CLIENT_DOCS_DIR` ou `.data/documents`): chave aleatória de 24 bytes, gravação exclusiva, permissões locais restritas, SHA-256 e conferência de tamanho/hash antes de servir. Não há URL pública. Falha de banco/auditoria limpa o arquivo sem metadados confirmados.
- Edição, remoção, upload e download têm ações próprias em `auth_access_audit`, na mesma transação da operação que confirmam. O conteúdo não é copiado para auditoria, para não criar outro repositório de texto potencialmente sensível.
- A UI `OpportunityInteractions.tsx`, já montada em `/admin/crm`, oferece tipos completos, contato, upload na criação ou em interação existente, edição, confirmação explícita da exclusão lógica, links privados e paginação acessível com `htmlFor`/`id` explícitos.
- Migração nova e imutável: `106-crm-interaction-follow-up.sql`. Ela adiciona versão, remoção lógica e tabela de anexos; manifesto e verificador estático vão de 001–106. **A próxima migração livre é 107; confirme no disco antes de usar.**
- A rota legada `GET /api/crm/opportunities/:id` mantém a proteção de propriedade já introduzida para interações e agora também esconde registros logicamente excluídos.

### Provas já executadas neste recorte

- `npm ci`: 82 pacotes, 0 vulnerabilidades.
- `npm run test:migrations:pg`: 106/106 na primeira aplicação e no replay, 505 tabelas, clone sintético e controle negativo de checksum aprovados.
- `npm run test:l04-delivery:pg`: 3/3. Em PostgreSQL descartável, HTTP real e Chromium real: criação por UI com contato e TXT, recarga, edição, download de bytes/hash privado, negação a outro comercial, todos os tipos, paginação, conflito de versão, exclusão lógica e dois rollbacks de auditoria injetados (criação e exclusão).
- `npm run test:unit`: 186/186; `npm run typecheck`: 0 erros; `npm run build`: 70 rotas; `node scripts/qa-wave0-static.mjs`: 5/5. Veja evidências para comandos, ambiente e observações de escopo.

## Lacunas reais após a Opção A

CRM-07 ainda não pode ser declarado completo: tarefas continuam pessoais (sem equipe/delegação, edição de prazo ou paginação); kanban, tabela, busca e filtros completos precisam ser revalidados; a regra de equipe/delegação não foi inventada. A decisão de delegação deve separar responsável, participantes e permissões por equipe, nunca usar papel administrativo como bypass.

Persistem também os riscos e requisitos externos ao recorte: `stages` e `visits` da rota legada de detalhe ainda não têm a restrição de propriedade que tarefas/interações têm; CRM-08, CRM-09 e CRM-10 não foram implementados como jornadas; PUB-02/05/06/07/08/09/10 e a revalidação campo a campo de CRM-01..06 continuam pendentes. Sem aceite Windows/humano, SMTP ou hospedagem externa.

## Próximo recorte — escolha única recomendada

**Opção B — CRM-08, agenda de visitas/reuniões.** Não misture com CRM-09 ou CRM-10 na mesma sessão.

A tabela `crm_visits` já existe desde a migração 014, mas não há jornada. Entregue responsável, participantes, confirmação, reagendamento e cancelamento por interface + API + persistência + auditoria + teste HTTP/Chromium/PostgreSQL. Antes de escrever a rota, registre explicitamente a política de escopo: se participantes podem apenas visualizar/confirmar, ou também reagendar/cancelar, e como isso interage com o responsável. Não estenda acesso para todo comercial/admin/Marcelo/TI por conveniência. Ao tocar CRM-08, corrija o vazamento residual de `visits` na rota legada de detalhe e avalie `stages` no CRM-06 com a mesma disciplina.

Depois: CRM-09 (cadências **manuais** como tarefas, opt-out/autorização antes de qualquer automação de mensagem), CRM-10 (carteira), lacunas PUB e revalidação CRM-01..06. Só depois sequer cogite L05.

## Execução e fechamento obrigatórios

1. Confirme branch, `git status`, `git log` e o número de migração no disco; não volte para PR #13/#14 ou para `927cb8d` como base.
2. Rode `npm ci`. Para migração, execute `npm run test:migrations:pg`; para CRM use `npm run test:l04-delivery:pg`; no fechamento, `npm test`, `npm run typecheck`, `npm run build` e regressões proporcionais. Os gates recusam `DATABASE_URL`/`DATABASE_MIGRATION_URL` externas.
3. Use PostgreSQL descartável, HTTP real e Chromium sem `--disable-web-security`. SQL é somente fixture/asserção/falha injetada, nunca substituto da jornada HTTP.
4. Teste autorizado, outro usuário, outro papel, sem sessão, origem incorreta, entrada inválida, persistência por recarga, conflito e falha de auditoria. Não reduza expectativa para obter verde.
5. Não edite migrações 001–106. Não deixe `next-env.d.ts`/`tsconfig.json` apontando para diretórios de build de integração; descarte apenas alterações automáticas comprovadas.
6. Atualize os mesmos documentos de estado/evidência/checklist e este prompt, crie commit coerente e entregue SHA, testes executados, lacunas e próximo passo. Não alegue conclusão de L04 por haver tela ou endpoint.

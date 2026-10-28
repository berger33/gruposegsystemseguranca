# CLI-02 — fatia de delegação com escopo herdado (28/10/2026)

## Implementação local

Foi adicionada a rota `POST /api/client/contacts/delegate` no espaço do cliente. Ela não reutiliza os handlers globais staff de `src/server/cli-api.mjs`.

A nova rota exige sessão cliente, mesmo Origin e grant de conta/unidade ativo; encontra um contato ativo vinculado à identidade autenticada; requer `can_delegate=true` no contato e ao menos um escopo da mesma conta com `can_delegate=true`; cria o novo contato em `pendente_convite`, com o papel do contato de origem, sem identidade vinculada e sem grant de autenticação; copia apenas os escopos explicitamente delegáveis, com os mesmos papéis/IDs de unidade/contrato e `can_delegate=false`. O alvo não pode re-delegar por meio desse fluxo. Criação, cópia dos escopos e evento `contact_delegate` em `auth_access_audit` são atômicos. Migração 181 acrescenta a ação de auditoria sem remover a lista anterior.

## Evidência

O subteste `CLI-02` em `tests/client-space.integration.test.mjs`, rodado dentro de `npm run test:l08-delivery:pg`, cobre delegação autorizada, cópia apenas do escopo autorizado, papel/contato pendente, ausência de acesso automático, duplicata, conta fora do grant, contato sem permissão e rollback quando a auditoria falha. Gate L08 passou **54/54** em PostgreSQL descartável + HTTP real.

## Complemento de leitura e UI (28/10)

Foi adicionada a leitura `GET /api/client/contacts?account=...`, que retorna apenas o contato da identidade autenticada e delegações diretas dele, com papéis/escopos que pertencem à própria conta. A navegação do portal agora contém `/cliente/app/contatos`, que lista nome, e-mail, papel, status e escopos; apresenta estados de carregamento/falha/retry; e oferece o formulário de delegação sem prometer convite ou acesso automático. A guarda `tests/cli02-client-contacts-ui.test.mjs` cobre o contrato da UI/rota (5/5).

## Limites

- CLI-02 continua sem reauditoria integral: a gestão de papéis e alteração de escopos por conta/unidade/contrato segue staff-only; o cliente só pode listar seu contato e delegações diretas e iniciar delegação dos escopos que explicitamente autorizam isso.
- Não cria convite, identidade, sessão nem grant. Esses fluxos permanecem independentes e precisam de sua própria prova.
- Não houve aceite humano nem UAT. Produção continua NO-GO.

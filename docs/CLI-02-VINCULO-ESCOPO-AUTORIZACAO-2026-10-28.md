# CLI-02 — vínculo entre papéis/escopos de contato e autorização efetiva (28/10/2026)

## Resultado da inspeção

A fatia anterior permite listar o contato autenticado e delegações diretas, e copiar escopos explicitamente delegáveis. Ela **não** conecta `cli_contact_scopes.role` à autorização efetiva das rotas do portal.

- `src/server/client-space-api.mjs:180` — `requireAccountScope` autoriza por `client_access_grants.identity_id`, conta ativa e escopo de unidade do grant. Não consulta `cli_client_contacts` nem `cli_contact_scopes`.
- `handleClientContracts` também consulta `contract_scope_mode` / `allowed_contract_ids` do grant para restringir contratos; não intersecta isso com `cli_contact_scopes.contract_id` ou `role`.
- Os demais handlers do portal chamam o mesmo `requireAccountScope`. Logo, os papéis `titular`, `financeiro`, `operacional`, `rh`, `comercial`, `tecnico` e `outro` em `cli_contact_scopes` são metadados/delegação, não uma matriz de autorização por endpoint.
- `client_access_grants` (migração 004) não tem `contact_id` nem `role`; `cli_contact_scopes` (migração 074) é uma relação separada.
- A delegação atual segue segura no sentido de não conceder acesso automaticamente: destino sem `identity_id`, em `pendente_convite`, sem grant; isso é coberto pelo teste CLI-02 no gate L08.

## Conclusão

Não alterei a autorização para inferir permissões de papéis a partir de nomes como `financeiro` ou `operacional`. Fazer isso exigiria definir quais papéis podem ler/alterar cada família de dados e como grants legados se intersectam com as novas relações; essa matriz não está especificada no contrato atual. Expandir acesso com suposições seria inseguro e poderia quebrar contratos existentes.

CLI-02 permanece parcial: a delegação e a exibição de contatos/escopos estão implementadas; enforcement de papéis por unidade/contrato e reauditoria integral continuam pendentes.

## Próxima fatia necessária

Definir uma matriz explícita `papel × ação × escopo` para as operações do portal e a política de compatibilidade com grants já existentes. Depois disso, a implementação deve falhar fechada quando houver contato sem escopo aplicável, intersectar a autorização da rota com grants de conta/unidade/contrato e provar permissões e negações em A/B por papel no PostgreSQL. Até lá, não equiparar `cli_contact_scopes` a autorização efetiva.

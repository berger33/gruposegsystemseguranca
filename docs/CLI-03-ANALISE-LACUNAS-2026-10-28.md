# CLI-03 — análise das lacunas de portal (28/10/2026)

## Resultado

CLI-03 continua **sem gate de jornada do cliente**. A evidência L08 já valida contratos básicos, escopo por conta/contrato e metadados de documentos, mas não demonstra ao cliente os itens de serviço, a vigência contratual nem a filtragem de conteúdo interno. Não se promove o ID com base em provas adjacentes.

## Achados verificáveis no código atual

- `src/server/client-space-api.mjs`, `handleClientContracts` (a partir da linha 361), lista de `client_contracts` somente `id`, título, serviço, estado, `starts_on`, `ends_on`, resumo e timestamps. Não consulta os itens/vigências da família `cli_*`.
- `handleClientDocuments` (a partir da linha 412) lista metadados da tabela `client_documents` por conta. Não integra os documentos versionados `cli_client_documents_v2`, nem aplica filtragem `is_internal`.
- `src/server/cli-api.mjs`, `handleContractItems` (a partir da linha 216) e `handleContractVigencia` (a partir da linha 299) exigem sessão staff e papel `admin`/`ti`. A lógica `isClient` que tenta filtrar `is_internal=false` em itens fica inalcançável para sessão cliente por causa desse gate de papel. O roteamento de aliases em `server.mjs` aponta para esses mesmos handlers.
- `src/app/admin/ti/CliClient.tsx` usa os aliases HR de itens/vigência no console de TI, não prova uma interface de portal de cliente.
- O gate L08 atual prova listagem de contrato/validade básica e documentos legados dentro do escopo, não a publicação dos itens/vigências internos da migração 074 nem a filtragem de conteúdo técnico interno.

## Conclusão de auditoria

Este é um gap funcional e de prova compatível com a justificativa já registrada na matriz: “Falta gate cliente para itens/vigência e bloqueio de conteúdo interno”. **Nenhum código foi alterado nesta análise**, e CLI-03 permanece `a_revalidar`, sem aceite humano ou reauditoria integral.

## Fatia aplicada após decisão explícita de visibilidade

O proprietário escolheu a regra conservadora: itens não internos; vigências vigentes e dentro das datas; documentos somente `publicado`, não internos, não privados e dentro da validade. Foi adicionada a rota somente leitura `GET /api/client/contracts/:id/published-details?account=...` em `src/server/client-space-api.mjs` e despachada em `server.mjs`. Ela exige sessão cliente, grant ativo, escopo de unidade e allowlist de contrato, projeta campos permitidos (sem `file_url` ou `storage_key`) e audita a leitura/negação usando a ação existente `contract_list`. Nenhum alias staff foi aberto ao cliente.

A prova PostgreSQL/HTTP em `tests/client-space.integration.test.mjs` cobre retorno apenas do item público, vigência atual, documento explicitamente publicado/não interno/não privado, exclusão de rascunho/interno/privado, isolamento A/B e contrato fora da allowlist. O gate `npm run test:l08-delivery:pg` passou **53/53**.

## Limites restantes

- A fatia fornece um endpoint de leitura; não integra ainda esta informação a uma interface cliente.
- Não cobre upload/download de `cli_client_documents_v2`, delegação CLI-02 nem UAT/aceite humano.
- CLI-03 ainda não tem reauditoria integral por papel. Não afirmar conclusão do requisito ou prontidão de produção.

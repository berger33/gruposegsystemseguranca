# CLI-02 — decisão necessária: papel × ação × escopo (28/10/2026)

**Estado: proposta para decisão; não é política ativa.** Nenhum acesso foi concedido ou retirado por este documento.

## Por que esta decisão é necessária

`cli_contact_scopes` armazena papéis/escopos, mas os handlers de cliente autorizam pelo grant legado `client_access_grants` e por `contract_scope_mode/allowed_contract_ids`. Os nomes dos papéis, sozinhos, não determinam direitos. Adotar uma matriz inferida pode ampliar ou remover acesso de clientes existentes.

## Matriz a preencher pelo responsável do produto

Para cada célula, escolher **permitir**, **negar** ou **não se aplica**, além do escopo efetivo (**conta**, **unidade**, **contrato**). Estado atual de todas as células: **pendente**.

| Papel de contato | Dados cadastrais/contatos | Contratos e escopos publicados | Documentos publicados | Chamados | Visitas/agenda | Relatórios/aceite | Cobranças | Satisfação/renovação | Pode delegar |
|---|---|---|---|---|---|---|---|---|---|
| `titular` | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | somente se a flag de origem e escopo permitirem; confirmar |
| `financeiro` | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |
| `operacional` | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |
| `rh` | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |
| `comercial` | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |
| `tecnico` | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |
| `outro` | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |

## Decisões de compatibilidade também necessárias

1. Grants ativos existentes sem contato associado: continuam com a política atual, são limitados por papel novo, ou entram em revisão manual? Não fazer migração automática sem escolha.
2. Se grant e escopo de contato discordarem, deve valer a **interseção (mais restritivo)** ou negar a requisição até saneamento? Proposta técnica conservadora: negar até saneamento, mas requer confirmação.
3. Um contato com mais de um registro/role pode acumular permissões, ou os direitos devem ser a interseção? Pendente.
4. `can_delegate` deve ser necessário simultaneamente no contato e em cada linha de escopo (comportamento implementado), ou a flag da linha pode bastar? Pendente de confirmação do produto.
5. Papéis novos/revogados devem afetar sessões já ativas imediatamente? Proposta técnica: revalidar em cada requisição; requer decisão de impacto.

## Proteções que não dependem da matriz

- Não emitir convite, criar identidade, sessão ou `client_access_grant` durante a delegação.
- Destino delegado continua `pendente_convite` e sem capacidade de nova delegação.
- Nunca aceitar papel, conta, unidade ou contrato arbitrários do navegador na delegação.
- Manter os grants legados intactos até uma decisão explícita e um plano de compatibilidade/migração.
- Até a decisão, `cli_contact_scopes` continua metadata de exibição/delegação e **não** deve ser descrito como autorização efetiva.

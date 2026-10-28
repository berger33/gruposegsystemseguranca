# CLI-03 — UI do detalhe publicado de contrato (28/10/2026)

**Base:** `867ecf418166b6b48136c560731031959d4f5037` (`main`, merge da PR #299)
**Branch:** `arena/4f46cb80-gruposegsystemseguranca`
**Natureza:** fatia de interface sobre contrato de API já provado. Não cria rota,
não altera permissão, não muda migração e **não declara aceite humano**.

## 1. O que faltava

A rota `GET /api/client/contracts/:id/published-details?account=…` foi entregue em
28/10 com prova HTTP/PostgreSQL (`docs/CLI-03-ANALISE-LACUNAS-2026-10-28.md`),
mas **nenhuma tela a consumia**: o cliente via a lista de contratos
(`/cliente/app/contratos`) e não tinha acesso aos itens de serviço publicados,
às vigências vigentes nem aos documentos publicados — justamente a lacuna que
mantinha o CLI-03 em `a_revalidar`.

## 2. O que foi entregue

Em `src/app/cliente/app/contratos/page.tsx`, cada contrato da lista ganhou o
botão **“Ver detalhes publicados”** (`aria-expanded` / `aria-controls`) que abre
uma região própria e consulta a rota canônica **somente** com a conta ativa e o
contrato aberto:

- **Serviço, situação e vigência do contrato** — vindos do detalhe, não da linha
  da lista.
- **Itens de serviço publicados** — título, tipo, quantidade/unidade e descrição.
- **Vigências vigentes** — intervalo e situação registrada.
- **Documentos publicados** — categoria, título, versão e validade.

Regras preservadas e explícitas:

| Regra | Como aparece na tela |
|---|---|
| Isolamento por conta | a leitura usa `activeAccount.id`; `DetailRead`/`DetailReadError` guardam **conta + contrato** e só são renderizados quando ambos coincidem com a conta ativa e o painel aberto |
| Sem vazamento entre contratos | abrir outro contrato descarta o detalhe anterior; só há reaproveitamento quando conta **e** contrato coincidem |
| Resposta fora de ordem | `latestDetailRequest` sequencia cada leitura; sucesso, erro e `finally` descartam consulta obsoleta; trocar de conta e fechar o painel invalidam a leitura em voo |
| Estados honestos | carregando (`role="status"`), falha (`role="alert"` com repetição), negado/indisponível com **mensagem por motivo**, e vazio declarado nas três coleções |
| Campos privados | `file_url` e `storage_key` **não** são projetados pelo servidor e **não** são reintroduzidos na tela |
| Sem promessa falsa | a tela declara que o arquivo é entregue pela equipe e que a consulta não oferece link de download |
| Nada removido | lista, conta ativa, aviso de cadastro suspenso/encerrado, `scope_note`, carregamento, vazio e repetição continuam com o mesmo comportamento |

Mensagens de falha traduzidas: `invalid_account_id`, `invalid_contract_id`,
`forbidden`, `contract_not_found`, `client_session_required`,
`same_origin_required`, além de 401/403/404/5xx sem motivo explícito.

> **Por que `fetch` direto e não `workspaceFetch`:** `workspaceFetch` consome o
> corpo da resposta e transformaria 403/404 em um texto genérico. O mapa de
> motivos exige ler `payload.error` — o mesmo motivo já registrado nas fatias
> ID3 de `chamados`, `satisfacao`, `renovacao` e `relatorios`.

## 3. Prova

| Verificação | Resultado |
|---|---|
| `node --test tests/cli03-contract-published-details-ui.test.mjs` | **8/8** (RED inicial 5/8 → GREEN 8/8; as três falhas eram da própria guarda, corrigidas sem enfraquecer asserção) |
| `npm run typecheck` | exit **0** |
| `npm run build` | exit **0**, **106/106** páginas |
| `npm test` | **1.174/1.176** — as 2 falhas são ambientais (`libnspr4`/`libnss3` ausentes no Chromium deste sandbox), ver **E22** |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00-inventory --check` | OK (101 rotas) |
| `ux-pro-03-ti-inventory --check` | OK (83 componentes) |
| `requisitos-222-inventory --check` | OK (222 IDs; 21 `a_revalidar` sem gate) |
| `npm run test:migrations:pg` | ver §5 |

### Efeito no inventário de 222 IDs

`CLI-03` passou de `mencionado_em_gate` para **`gate_nomeado`** — há agora um
teste com o ID no nome. Contagens congeladas atualizadas de **22/114/86** para
**23/113/86** em `tests/requisitos-222-inventory.test.mjs`, com o motivo
registrado no próprio teste. **Isso é evidência textual, não promoção de
requisito:** `aceite_humano` continua `nao_registrado` e
`reauditoria_integral` continua `nao_executada` em **0/222**.

O gerador passou a excluir `docs/AUDITORIA-FATIAS-PENDENTES-2026-10-28.md` da
varredura, como já fazia com os outros documentos de **meta-estado**
(`STATUS-VIGENTE.md`, auditoria de 26/10 e a fotografia de 04/10): eles descrevem
a fila, não provam requisito, e mantê-los no índice tornaria o `--check`
auto-referente.

## 4. Limites (o que esta fatia NÃO prova)

- **Não há aceite humano, UAT, leitor de tela nem Windows.** CLI-03 continua
  `a_revalidar`; nenhuma linha da matriz histórica foi promovida.
- **O download dos documentos publicados não existe nesta tela** — por decisão
  conservadora o endpoint não projeta `file_url`/`storage_key`. Servir bytes
  continua pendente e exige decisão de armazenamento (ver auditoria de 28/10,
  §5.4).
- A prova é **estática** (contrato da UI) + HTTP do endpoint já existente; o
  cenário A/B em navegador real precisa do gate `test:ux-portal:pg`, que não
  roda neste sandbox por falta das bibliotecas do Chromium.
- A UI não foi exercitada com massa real de itens/vigências/documentos em
  navegador; a ordenação e os limites do servidor (100 itens, 20 vigências,
  100 documentos) não são validados visualmente.

## 5. Bateria executada

Ver `docs/STATUS-VIGENTE.md` §6 para o registro da fatia. O gate
`npm run test:migrations:pg` foi executado em cluster descartável
(`embedded-postgres`) para confirmar que o ledger **001–181** continua aplicando
em dois passes — resultado registrado no fechamento desta sessão.

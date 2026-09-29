# Fatia PUB-10 — mensuração de origem e conversão (painel derivado, somente leitura)

Sessão `arena/01a0ef49-gruposegsystemseguranca`. Base: `main @ fe35b4c`
(merge do PR #24 — visão de calendário por semana em CRM-08).

Este documento registra as **decisões de política ANTES da rota**, como exige
o método das sessões anteriores. Nada aqui é implementado sem estar escrito
aqui primeiro.

## Problema

PUB-10 pede "mensuração de origem e conversão com minimização de dados;
testes A/B somente após tráfego, hipótese e tratamento de dados definidos".

Hoje: `public_leads.origin/campaign/channel` são capturados e persistidos
desde o L04 (PUB-03) e aparecem na lista de `/admin/leads`, mas **não existe
nenhuma leitura agregada**: ninguém consegue responder "quantos pedidos vieram
do Instagram no mês e quantos viraram oportunidade/ganho". O dado bruto
existe, a análise não.

## Decisão 1 — NÃO conectar `OriginMetricsClient.tsx`

O componente órfão `src/app/admin/ti/OriginMetricsClient.tsx` é um CRUD onde
um humano **digita à mão** `total_leads`, `converted_leads`,
`total_opportunities` e `total_contracts`. Isso não é mensuração: é permitir
que alguém cadastre um número de conversão que o sistema nunca observou, com
aparência de métrica oficial. É exatamente o tipo de dado fabricado que este
projeto vem removendo (como o "modo empresarial" com preços inventados de
`/orcamento`).

**Decisão:** o componente permanece órfão e é declarado como **descartado
para esta finalidade** na documentação. A fatia entrega um painel **derivado**
— todo número vem de `COUNT`/`SUM` sobre os registros reais que o sistema já
grava. Não existe endpoint de escrita de métrica nesta fatia.

Consequência registrada: as tabelas da migração 092
(`pub10_origin_metrics`, `pub10_conversion_events`, `pub10_ab_tests`) não são
lidas nem escritas por esta fatia. Elas continuam existindo (migrações são
imutáveis) e continuam sem tela. Não são fonte de verdade de nada.

## Decisão 2 — definição de conversão (única, derivada, sem inferência)

O funil medido tem quatro degraus, todos observáveis no banco:

1. **leads** — linhas de `public_leads` criadas na janela.
2. **visita confirmada** — lead com `status IN ('confirmada','realizada')`.
   Estados legados pré-PUB-04 (`new`,`contacted`,`closed`) contam em `leads`
   mas nunca em "visita confirmada" nem em "convertido": não há como saber o
   que significavam, e chutar seria fabricar.
3. **convertido** — existe ao menos uma `crm_opportunities` com
   `public_lead_id` apontando para o lead. É o vínculo real criado por
   `POST /api/crm/leads/:id/convert` (CRM-04).
4. **ganho** — alguma dessas oportunidades está com `stage = 'ganho'`.
   Registrado como "ganho comercial", **nunca** como dinheiro recebido
   (mesma ressalva já registrada em CRM-06).

Taxas são calculadas pelo servidor sobre esses inteiros (`convertido/leads`,
`ganho/leads`), nunca digitadas. Denominador zero devolve `null`, não `0` —
"não há base para calcular" é diferente de "a taxa é zero".

## Decisão 3 — minimização de dados (fail-closed por construção)

- A resposta contém **apenas** rótulos de origem/campanha/canal e contagens
  inteiras. Nunca `id`, `name`, `phone`, `email`, `details`, `ip_hash`,
  `user_agent`, `dedup_key` nem qualquer coluna por-lead. Não há um parâmetro
  que faça o endpoint devolver linhas individuais — quem quiser o lead usa
  `GET /api/admin/leads`, que já tem a autorização e a trilha dele.
- Lead sem origem declarada é agrupado no rótulo literal
  `"(não informado)"`; o servidor não infere origem a partir de IP, referer ou
  user agent.
- Rótulos são devolvidos como estão no banco (já validados e limitados a 100
  caracteres por PUB-03). O painel os escapa como texto, nunca como HTML.

## Decisão 4 — autorização e método

- `GET /api/admin/leads/metrics`. Sessão de staff obrigatória; papéis
  `marcelo`, `ti`, `comercial`, `admin` — exatamente os mesmos de
  `GET /api/admin/leads`. Sem sessão → 401; papel fora da lista → 403.
  Não existe parâmetro, cabeçalho ou variável de ambiente que libere o
  acesso; não há bypass administrativo.
- Só `GET`. Qualquer outro método → 405 com `Allow: GET`.
- A rota é somente leitura: não escreve em `public_leads`, não escreve em
  `crm_*` e **não grava trilha por consulta**. Motivo registrado: uma leitura
  agregada sem PII não é acesso a dado pessoal identificável, e gravar uma
  linha de auditoria por render de painel poluiria `auth_access_audit` a
  ponto de degradar a trilha que importa. Como não há mutação, também não há
  cenário de "falha de auditoria reverte a mutação" nesta fatia.

## Decisão 5 — janela de tempo

- `from` e `to` são datas `YYYY-MM-DD` opcionais, interpretadas como dias
  inteiros; `to` é inclusivo (o corte real é `< to + 1 dia`).
- Padrão quando ausentes: os últimos 90 dias encerrando hoje.
- Fail-closed na validação: formato inválido → 400 `invalid_period`;
  `from > to` → 400 `invalid_period`; janela maior que 366 dias → 400
  `period_too_long`. Não existe consulta "tudo desde sempre" por esta rota —
  varredura ilimitada em tabela de leads é risco operacional, e o pedido de
  negócio é período.
- A agregação usa o `created_at` do **lead**, não o da oportunidade: a
  pergunta é "o que esta origem trouxe neste período", e mover o lead de
  período conforme a data de conversão embaralharia a leitura.

## Decisão 6 — onde a tela vive

Pelo método ("conectar por domínio, nunca despejar na página de TI"), o painel
entra no domínio de atendimento, em `/admin/leads`
(`src/app/admin/leads/OriginMetricsPanel.tsx`), abaixo da fila de pedidos, com
a mesma sessão que a página já exige. Não é criada página nova em
`/admin/ti`, e nada é importado de `src/app/admin/ti/*Client.tsx`.

## Fora desta fatia (explicitamente)

- **Testes A/B.** Continuam sem tela e sem rota. O próprio requisito os
  condiciona a "tráfego, hipótese e tratamento de dados definidos" — nenhuma
  das três coisas existe hoje, e o sistema não tem tráfego real. Implementar
  o mecanismo antes disso seria entregar um botão que ninguém pode usar com
  honestidade.
- Exportação (CSV/PDF), gráficos, comparação entre períodos e atribuição
  multi-toque.
- Contratos como degrau do funil: `crm_opportunities` não tem hoje um vínculo
  provado com contrato que sobreviva a gate; medir isso exigiria a fatia de
  contratos, que não é PUB-10.
- Qualquer envio de dado para ferramenta externa de analytics.

## Migração

**Nenhuma.** A fatia é só leitura agregada sobre `public_leads` e
`crm_opportunities`, que já existem. Migrações permanecem 001–110; próxima
livre continua **111**. `scripts/qa-wave0-static.mjs` (`latestMigration`) e
`scripts/migrate-site-visual.mjs` não mudam.

## Prova pretendida no gate

Cenário novo em `tests/l04-delivery.integration.test.mjs` (HTTP real +
PostgreSQL descartável + Chromium real, sem `--disable-web-security`):

1. Fixture por SQL: leads em duas origens distintas, dentro e fora da janela,
   com status variados; uma oportunidade vinculada e uma delas em `ganho`.
2. Anônimo em `GET /api/admin/leads/metrics` → 401.
3. Papel sem permissão (ex.: `rh`) → 403.
4. `POST` na rota → 405.
5. `from`/`to` inválidos e janela > 366 dias → 400.
6. Staff `comercial` autenticado: agregados conferem com a fixture, lead fora
   da janela não entra, origem vazia vira `(não informado)`, taxa com
   denominador zero vem `null`.
7. Nenhum campo de PII no corpo da resposta (asserção explícita sobre as
   chaves e sobre o telefone/e-mail da fixture não aparecerem no JSON).
8. Chromium com sessão real de `comercial` abre `/admin/leads`, aguarda a
   resposta HTTP de `/api/admin/leads/metrics` (`page.waitForResponse`, nunca
   `waitForTimeout`) e lê os números no DOM.

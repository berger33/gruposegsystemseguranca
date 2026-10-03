# Relatório de entrega — EXT-06 satisfação/carteira

Data local: **2026-10-03**  
Critério: **“Resposta gera acompanhamento sem expor funcionário”**

## 1. Base confirmada antes da edição

- `gh pr view 100`: estado `MERGED`.
- PR: `https://github.com/berger33/gruposegsystemseguranca/pull/100`.
- merge commit descoberto: `5c0ebe799517ec112d2ed8ea353a001e9d360912`.
- feature da PR informada pela API GitHub: `492e6723557786d792e91711669af13be49dbe06`.
- `HEAD`: `5c0ebe799517ec112d2ed8ea353a001e9d360912`.
- `origin/main`, após `git fetch origin main`: `5c0ebe799517ec112d2ed8ea353a001e9d360912`.
- divergência `HEAD...origin/main`: `0 0`.
- árvore: limpa.

O SHA da feature não estava disponível como objeto no clone raso depois da exclusão da branch remota; sua identidade foi confirmada pelo campo `headRefOid` da PR. O merge e a base não eram ambíguos.

## 2. Estado anterior e lacunas reproduzidas

A inspeção foi acompanhada por execução em PostgreSQL 17 descartável, migrações 001–151, servidor HTTP real e fixtures exclusivamente sintéticas `.invalid`. O probe temporário foi removido; o cluster também foi destruído. Estado vazio significa **ausência de seed naquele cluster**, não ausência de dados operacionais em outro ambiente.

### Legado EXT (085)

- `/api/ext/satisfaction/*` administrativo canônico: ausente.
- `/admin/satisfacao`: ausente.
- apenas aliases exatos de `ext-satisfaction-surveys` chegavam ao handler legado.
- anônimo era recusado, mas o handler confundia papel proibido com 401 e aplicava same-origin inclusive em leitura.
- POST/PATCH aceitavam score, vínculo, estado e `recovery_task` diretamente do corpo.
- retry criava nova linha: não havia ledger/chave de idempotência.
- a mesma chave divergente não era detectável.
- transições eram arbitrárias dentro do enum e terminais podiam ser alterados.
- resposta/score/tarefa podiam ser sobrescritos.
- `survey_type='nps'` ou `csat` não possuía escala, fonte nem metodologia declarada.
- conclusão não exigia responsável, resultado ou justificativa.
- `auditLog` era externo e tolerava falha; uma escrita de negócio podia sobreviver à falha da auditoria.
- não havia lock de resposta/plano, evento imutável ou prova de concorrência.

### CLI-11 (076 + 142)

- `/cliente/app/satisfacao` e `/api/client/satisfaction-surveys` eram funcionais.
- sessão cliente, grant, destinatário, autoria da sessão e idempotência já existiam.
- a resposta e a auditoria de acesso eram transacionais.
- nota `<= 6` abria plano quando havia responsável nominal do CRM; sem ele, registrava pendência.
- faltavam configuração explícita da metodologia/escala e regra por pesquisa, tabela imutável de respostas, eventos, jornada staff canônica e máquina administrativa robusta.
- a projeção cliente retornava `renewal_risk`, `renewal_risk_reason`, `facts_json` e `action_plan_pending_reason`; eram metadados internos indevidos.
- os handlers administrativos antigos de CLI-11 ainda permitiam criação/alteração direta e plano com responsável nominal pelo corpo, fora da disciplina transacional canônica.

### Autoridade concorrente e vazio

As duas famílias (`ext_satisfaction_surveys` e `cli_satisfaction_surveys`) eram writers independentes. No cluster limpo, ambas estavam vazias antes das fixtures. Isso prova apenas que não há seed operacional nas migrações.

## 3. Decisão canônica

Foi escolhida a direção **promover e endurecer `cli_satisfaction_surveys` e `cli_satisfaction_action_plans`**.

Justificativa:

1. CLI-11 já possuía o ator externo canônico, sessão, grant, destinatário e rota cliente;
2. criar uma terceira família duplicaria resposta e acompanhamento;
3. copiar linhas de `ext_satisfaction_surveys` exigiria inventar destinatário/autoria/metodologia;
4. a migração 152 classifica a origem sem reescrever fatos históricos.

`ext_satisfaction_surveys` permanece legado somente leitura. Não houve cópia, seed ou atribuição retroativa. `src/app/admin/ti/ExtClient.tsx` foi preservado.

## 4. Implementação

### Superfícies

- staff UI: `/admin/satisfacao`;
- staff API: `/api/ext/satisfaction/surveys`, `/references`, detalhe e operações de plano;
- cliente UI preservada/endurecida: `/cliente/app/satisfacao`;
- cliente API preservada: `/api/client/satisfaction-surveys`;
- aliases EXT e CLI administrativos antigos: leitura autorizada com `items`; mutação 410 somente após autenticação, papel e same-origin.

### Pesquisa, metodologia e agregados

A pesquisa canônica declara finalidade, tipo, fonte/metodologia, escala mínima/máxima, período opcional, destinatário, conta e limiar próprio de acompanhamento. Vínculos opcionais são aceitos somente quando pertencem à conta.

- NPS: somente metodologia `nps`, escala 0–10;
- CSAT: somente metodologia `csat`, escala 1–5;
- genérica: não produz automaticamente NPS/CSAT;
- classificação registrada como configuração, sem heurística por título;
- agregado staff declara fonte, período, denominador e `absence`; ausência não vira zero.

Não foram inventados benchmark, meta, tendência ou significância.

### Estados, resposta e histórico

Pesquisa usa os estados existentes, ampliados com cancelada: pendente, respondida, em ação, concluída e cancelada. Plano: aberta, em andamento, concluída ou cancelada. Estado terminal não reabre silenciosamente.

`cli_satisfaction_responses` guarda a resposta imutável, destinatário e autor derivados da sessão, timestamp do servidor, chave/fingerprint e snapshot da metodologia/escala/regra. A projeção compatível da tabela de pesquisa é atualizada uma única vez e protegida por trigger. Não há correção destrutiva.

### Regra de acompanhamento/recuperação

A regra é registrada **por pesquisa**: `score <= follow_up_threshold`, com limiar dentro da escala. Não existe limiar global implícito.

Quando satisfeita, a mesma transação:

1. insere a resposta;
2. deriva o responsável da empresa CRM vinculada à conta e exige identidade staff ativa;
3. cria exatamente um plano ligado à resposta, com regra e fatos observados; ou
4. registra pendência fail-closed quando não existe responsável real;
5. atualiza o estado;
6. grava evento imutável, auditoria de acesso e `audit_log`.

Conclusão exige responsável e resultado; cancelamento exige justificativa. Índices e lock impedem dois planos/respostas para o mesmo fato.

### Privacidade

A projeção cliente é uma allowlist explícita. Ela não inclui responsável/funcionário, e-mail/papel staff, identidades internas, fatos internos, risco de renovação, notas internas, plano/tarefa ou auditoria. O cliente recebe pesquisa, finalidade, metodologia/escala, sua resposta e uma mensagem neutra de recebimento/acompanhamento. Não há promessa de prazo ou contato.

A projeção staff mostra resposta sensível apenas no detalhe autorizado; a listagem ampla usa contadores.

### Transação, auditoria e idempotência

Cada mutação usa transação, advisory lock por ator/chave, replay, locks/revalidação, negócio, evento e `audit_log`. Falha de auditoria retorna 503 e reverte tudo. Ledger separado por `actor_kind` + identidade + chave; payload divergente retorna 409. Corpo é lido uma vez, limitado a 32 KiB e validado como objeto JSON.

## 5. Migração

Somente `db/migrations/152-ext06-satisfaction-journey.sql` foi adicionada; 001–151 não foram alteradas. A migração é aditiva, sem seed, usa FKs canônicas, constraints `NOT VALID` sobre histórico quando cabível, triggers de imutabilidade/estado e `::text` nas comparações de enum relevantes. Migrador e QA estático foram atualizados pontualmente para 152.

## 6. Validação automática

Resultados medidos nesta base:

| Comando | Resultado |
|---|---|
| `npm ci` | sucesso; 82 pacotes; 0 vulnerabilidades |
| sintaxe dos novos `.mjs` | sucesso |
| `node scripts/qa-wave0-static.mjs` | **5/5**, migrações 001–152 |
| `npm run typecheck` | sucesso |
| `node --test tests/ext06-satisfaction.test.mjs` | **8/8** |
| `npm test` | **438/438**, 0 fail/skip/todo |
| `npm run build` | sucesso; **91 páginas**; `/admin/satisfacao` presente |
| `npm run test:migrations:pg` | sucesso: primeira aplicação e replay; checksums **152/152**; negativo 006 rejeitado; clone/restauração 152/152; 558 tabelas |
| `npm run test:ext06-satisfaction:pg` | **36/36**, mínimo 35, 0 fail/skip/todo; PostgreSQL 17 + HTTP real |
| `node --test tests/cli11-satisfaction-portal.test.mjs` | **6/6** |
| `git diff --check` | sucesso |

Uma primeira execução do gate EXT-06 encontrou um erro real de bind na projeção compatível da resposta (8 parâmetros para 9 posições). O produto foi corrigido; a suíte foi repetida integralmente e passou 36/36. Não foi tratado como flake.

`next-env.d.ts` e `tsconfig.json` gerados pelo Next foram restaurados antes do commit.

### O que não cobre EXT-06 isoladamente

QA estático, typecheck, unit, build, gate de migrações e o teste antigo CLI-11 **não** substituem o gate dedicado. O gate CLI-11 cobre o contrato anterior em fake pool, não toda a jornada EXT-06. Também não foram executados como prova desta fatia: bateria pesada integral, implantação em destino, aceite humano e homologação Windows.

## 7. Fronteiras e pendências

- nenhum dado real, SMTP ou integração externa foi usado;
- nenhum login/grant/canal anônimo novo foi criado;
- security-v2 não foi usada como fonte de login;
- não há aceite humano inventado;
- aceite Marcelo/Andreia continua restrito ao L07;
- EXT-03 relevância, EXT-04 ator/volume e seis workflows ausentes permanecem fora do escopo;
- problemas preexistentes listados pelo plano não foram usados para enfraquecer a prova;
- destino operacional, bateria pesada e homologação Windows permanecem pendentes.

# RAG PR 1b — Assistentes privados por papel e conta (2026-10-06/07)

A PR 1 entregou a fundação (recuperação híbrida, ledger, curadoria) e declarou fora de
escopo a reativação dos assistentes privados. Esta fatia fecha essa pendência **sem
migração nova, sem rota nova e sem duplicar nada**: usa as rotas canônicas
(`POST /api/ai/answer`, `POST /api/ai/rag/feedback`), a migração 175 já aplicada e o
`RagWidget` que já existia. O que muda é o **escopo por papel e conta** no front e no
feedback, mais um gate de navegador real que prova o comportamento ponta a ponta.

## 1. O que passou a existir

### 1.1 Front — `src/components/RagWidget.tsx`

- Um widget por escopo (`rag_key` = `rh`, `marcelo`, `cliente`), com cor, título e
  oferta de login próprios (`SCOPE_COPY.loginHref`).
- **Evidência sobrevive a recusa**: quando a resposta é `refused`, `unavailable` ou
  `failed`, as fontes já recuperadas continuam listadas — a pessoa vê *o que* foi
  encontrado e *por que* nenhuma resposta foi gerada.
- Feedback enviado **pelo protocolo canônico** devolvido pelo servidor (nunca protocolo
  inventado no cliente).
- Contrato de leitura para o gate (e para qualquer automação honesta):
  `data-rag-key`, `data-rag-state`, `data-rag-sources`, `data-rag-source` (id do
  documento), `data-rag-unavailable` e `data-rag-refusal="<código>"`.

### 1.2 Servidor — `src/server/ai-rag-api.mjs` (`handleFeedback`)

A autorização do feedback passou a ser decidida pelo **escopo**, não pelo caminho
(antes: rota pública só aceitava `publico`; agora o widget do cliente usa a rota pública
levando a própria sessão de cliente):

| `rag_key` | Quem pode avaliar | Sem sessão | Papel errado |
| --- | --- | --- | --- |
| `publico` | qualquer visitante | aceito | — |
| `cliente` | a **mesma identidade** que perguntou (`actor_identity` do evento) ou admin/ti | `401 client_session_required` | `403 scope_forbidden` |
| `rh` | rh, admin, ti | `401 staff_session_required` | `403 scope_forbidden` |
| `marcelo` | marcelo, admin, ti | `401 staff_session_required` | `403 scope_forbidden` |

Protocolo **sem dono registrado** não é avaliável por vínculo: ter acesso a alguma conta
não transfere autoria. Nesse caso só a curadoria admin/ti avalia. Os códigos acima são os
mesmos do glossário (`src/lib/rag-vocabulary.mjs`), então a tela mostra a mensagem certa
em vez de "erro desconhecido".

### 1.3 Curadoria

Índice: `PATCH` com `{id, status, is_approved, is_published, reason}` — `status='publicado'`
liga `is_active`. Documento: `POST` (201) e `PATCH` com `published_at` e purge dos
embeddings de versões não publicadas. Sem isso, um documento publicado continuaria sem
`published_at` e a recuperação o trataria como incompleto.

## 2. O que o gate encontrou (e o que foi corrigido)

Dois defeitos foram encontrados por medição, não por leitura:

1. **Acento assimétrico no FTS — resposta "ausente" em cima de fonte existente.**
   Documento com `admissão`, pergunta com `admissao`: o dicionário português deriva
   radicais diferentes (`admiss` vs `admissa`), o termo não casa, a cobertura cai de
   2/3 para abaixo do limiar e o produto responde `no_relevant_source`
   (`accepted: 0`, `best_relevance 0.3333`) — honesto, porém errado. Correção em
   `src/server/ai-rag-retrieval.mjs`: o caminho FTS só é usado quando existem
   **dicionário de português e normalização de acento**, com `unaccent(lower(...))` dos
   **dois lados** (conteúdo e termo), `translate(...)` como reserva declarada quando
   `unaccent` não está disponível, e `PT_STOPWORDS` ampliado com moldura de pergunta
   (`funciona`, `existe`, `gostaria`, `explica`, `serve`…), que aparecia em quase toda
   frase e não discrimina conteúdo.
2. **Clique antes da hidratação submetia campo vazio.** Em `next dev`, o DOM aceita o
   texto antes do React assumir; o clique seguinte enviava vazio e o produto respondia
   `Pergunta muito curta` — recusa correta para uma pergunta vazia. Correção no **gate**
   (não no produto): o teste espera a hidratação pelo próprio elemento
   (`__reactFiber$`/`__reactContainer$`) e confirma que o texto digitado chegou ao estado
   do componente antes de clicar.

## 3. Gate de navegador — `scripts/qa-rag-private-chromium.mjs`

`npm run test:rag:chromium` sobe PostgreSQL descartável em loopback, aplica `001–175` +
replay pelo migrador real, sobe `next dev` real (`NEXT_DIST_DIR=.next/integration-rag-chromium`)
e abre **Chromium real**, um contexto novo por papel/conta. Sessões são reais: staff por
cookie de provisionamento + `POST /api/admin/session`; cliente por `POST /api/auth/login`.
O modelo aponta para uma **porta silenciosa**, então o caminho esperado é
`503 ai_unavailable` **com as fontes recuperadas** — se aparecesse texto, seria invenção.

Casos (10):

1. anônimo não alcança o assistente da equipe (vai para o login);
2. papel sem permissão vê a recusa honesta e nenhum assistente;
3. RH consulta a própria base e não alcança as outras;
4. RH não alcança o assistente do Marcelo;
5. Marcelo consulta a base administrativa;
6. cliente A recebe só a própria conta e grava feedback pelo protocolo (conferido no
   ledger: `actor_identity` = identidade do cliente A);
7. cliente B recebe só a própria conta e não vê a fonte de A;
8. cliente A não descobre o documento da conta B;
9. visitante é levado ao login do cliente e não recebe fonte privada (recusa conferida
   também por HTTP: `401 client_session_required`, sem `sources`);
10. sessão de equipe (RH) não avalia resposta de cliente.

Higiene do runner: limpa resíduos `/tmp/{chromium,al2023,fonts,swiftshader}` antes de
abrir o navegador (resíduo de `/tmp/chromium` faz o pacote pular o `inflate` das
bibliotecas AL2023 e o navegador morre com `libnspr4.so`), restaura
`next-env.d.ts`/`tsconfig.json` ao final e exige TAP com `pass ≥ 8`, `fail = 0`,
`skipped = 0`, `todo = 0`.

## 4. Gates executados

```bash
npm run typecheck                          # limpo
npm run test:unit                          # 863 testes, 0 falhas
npm run test:rag:pg                        # 14 casos, 0 falhas, 0 pulos
npm run test:rag:chromium                  # 10 casos, 0 falhas, 0 pulos (mínimo 8)
node scripts/qa-wave0-static.mjs           # 5/5 verificações estáticas OK
```

O gate Chromium é o único desta fatia que depende de navegador real; ele roda isolado
(banco e porta próprios, nada de reuso de estado de outra execução). O duplo de
embeddings continua o mesmo da PR 1: `stub-embed-test`, declarado, 768 dimensões.

**O que este gate não prova**: qualidade de resposta do modelo (exige Ollama com
`qwen3:1.7b` instalado na máquina do proprietário), desempenho, caminho `pgvector` e
homologação humana. Massa 100% fictícia.

## 5. Rollback

1. **Código**: `git revert` do commit desta PR 1b — nenhuma migração nova, nenhum schema
   tocado, então o código anterior continua válido sobre o mesmo banco.
2. **Manter os assistentes sem exposição sem reverter código**: basta não publicar índice
   e documento (nada publicado ⇒ ausência honesta) — o widget não inventa conteúdo.
3. **Desligar o modelo**: `OLLAMA_ENABLED=false` (a resposta vira indisponibilidade
   declarada, com fontes).
4. **Retirar só o gate**: `npm run test:rag:chromium` é um script isolado, sem efeito em
   produção; os arquivos `scripts/qa-rag-private-chromium.mjs` e
   `tests/rag-private-chromium.integration.test.mjs` podem sair sem tocar produto.

## 6. Pendências declaradas

- **Fase 2** (ingestão documental PDF/TXT/MD e diretórios allowlisted) é a próxima fatia;
  nada aqui antecipa ingestão nem leitura de disco do servidor.
- **Modelo real**: `ollama pull nomic-embed-text` e `ollama pull qwen3:1.7b` são atos do
  proprietário; sem eles a indexação é declarada indisponível e a resposta é
  indisponibilidade explícita, nunca texto simulado.
- **PRs antigas** `#173` e `#170` foram fechadas como substituídas pela PR 1.
- Retenção de 90 dias, leitura do texto restrita a admin/ti e purge continuam como na PR 1.

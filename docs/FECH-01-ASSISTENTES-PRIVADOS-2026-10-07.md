# FECH-01 — assistentes privados e contrato do widget (07/10/2026)

**Fatia:** FECH-01 do [plano de fechamento UX/RAG](ARENA-FECHAMENTO-UX-RAG-2026-10-07.md) · registro em
[checklist de fechamento](FECHAMENTO-UX-RAG-CHECKLIST-2026-10-07.md).
**Base:** `main` em `7765d99` (reconciliada, sem PR aberta concorrente). Migrações **001–174 intocadas** —
esta fatia não adiciona nem altera migração.
**Natureza da entrega:** código e evidência de sandbox. **Integrada não significa homologada**; aceite de
Marcelo/Andreia, Windows, Ollama real e desempenho local continuam pendentes e **não** foram executados aqui.

## 1. Problema e resultado

Antes desta fatia, `RagWidget.tsx` interrompia qualquer `ragKey` diferente de `publico` com o texto
“indisponível nesta versão”. O efeito prático: as bases privadas do RAG local — que a API
`POST /api/ai/answer` já autoriza no servidor — eram inalcançáveis pela interface, e o widget ainda
prometia “fila garantida”, aceitava 2000 caracteres enquanto o servidor recusa acima de 500, e não
distinguia negativa de ausência de fonte. Não havia tratamento declarado para 401, 403, base indisponível,
modelo desligado, tempo esgotado ou ocupado.

Depois desta fatia: o widget conversa com a rota canônica em todos os escopos, apresenta o estado real
devolvido pelo servidor e deixou de afirmar o que o servidor não afirmou — protocolo, modelo e “resposta
gerada” só aparecem quando o servidor realmente os devolve. Os assistentes de RH, de gestão e do portal do
cliente ficam utilizáveis com a mesma sessão/papel/vínculo que o servidor já exigia.

## 2. Quem decide o quê (inalterado)

A autorização continua exclusivamente no servidor (`src/server/ai-rag-real-api.mjs`), antes de qualquer
leitura de base ou chamada ao modelo:

| Base | Exige | Recupera |
|---|---|---|
| `publico` | visitante | documentos públicos aprovados **e** publicados |
| `cliente` | sessão de cliente (cookie real) | documentos de contas com `client_access_grants` ativo e conta `active` |
| `rh` | sessão staff `rh` ou `admin` | corpus `rh` aprovado e publicado |
| `marcelo` | sessão staff `marcelo` ou `admin` | corpus `marcelo` aprovado e publicado |

Códigos preservados: `400 invalid_rag_key`/`invalid_query`, `403 same_origin_required`/`scope_forbidden`,
`401 client_session_required`/`staff_session_required`, `503 rag_unavailable`,
`503 ai_unavailable { ollama_disabled | ollama_http_error | empty_response | ollama_timeout_or_offline }`,
`503 ollama_configuration_invalid`, `503 ai_busy { retry_after_seconds: 5 }`.

## 3. Mudanças

### 3.1 `src/components/RagWidget.tsx` (reescrito)

- Fim do bloqueio visual de `cliente`/`rh`/`marcelo`; a autorização passou a ser a do servidor.
- Limite alinhado ao servidor: `maxLength` de **500** com contador visível e validação local 5–500
  (o servidor segue sendo a autoridade; a tela não aceita o que ele recusaria).
- Estados distintos por causa, cada um com título e detalhe em português, `role="alert"` e “Tentar
  novamente” só quando a falha é recuperável: `loading`, `session_required` (401), `denied` (403),
  `empty_scope`, `no_source`, `source_unavailable`, `busy`, `ai_disabled`, `ai_unavailable`, `ai_timeout`,
  `ai_misconfigured`, `invalid_question`, `network`, `error`.
- Sem fonte: não há protocolo, não há botão “Copiar protocolo”, não há afirmação de modelo — a linha de
  origem diz “modelo não consultado”. Protocolo e modelo aparecem apenas quando o servidor os devolve.
- Acessibilidade: rótulo persistente ligado por `for`/`id`, contador e ajuda em `aria-describedby`,
  `role="status"`/`aria-live="polite"` para anunciar andamento e resultado, `:focus-visible` visível em
  campo e botões, `aria-busy` durante a geração, `prefers-reduced-motion` respeitado no indicador.
- Anti-duplicidade: trava de envio em voo (`inFlight`), controles desabilitados durante a geração e
  descarte de resposta atrasada por número de sequência.
- Removido o código morto de feedback (estava sem interface e o endpoint legado exige papel `admin`/`ti` e
  protocolo persistido em `ai_rag_queries`, que a rota canônica não grava — mantê-lo sugeriria uma
  capacidade inexistente).
- Fim da promessa de “fila garantida”: a tela agora informa que o modelo atende **uma consulta por vez** e
  que a segunda recebe `ai_busy` com nova tentativa sugerida.

### 3.2 `src/lib/rag-widget-contract.mjs` (+ `.d.mts`, novo)

Módulo puro com limites (5–500), rótulos de escopo por base, tradução de falha → estado/mensagem e
normalização da resposta sem default inventado. É o mesmo contrato usado pelo componente e pelos testes,
para que tela e asserção não divirjam.

### 3.3 `src/server/ai-rag-real-api.mjs`

- **Publicado exige flag E estado**: a recuperação passou a exigir
  `is_approved AND is_published AND status IN ('aprovado','publicado')` no documento **e** no índice. O
  banco não amarra flag a estado; um registro arquivado com flag antiga ligada voltava a ser recuperado.
- **Ausência declarada em dois casos**: escopo sem nenhum conteúdo publicado devolve `200` com
  `reason: "empty_scope"`; conteúdo publicado sem trecho relacionado segue devolvendo
  `reason: "no_relevant_source"`. Nos dois casos o modelo **não** é chamado.
- Nada mais mudou: same-origin, autorização, limites, provedor em loopback, timeout de 60 s, uma geração
  simultânea e o prompt de sistema seguem iguais.

### 3.4 Páginas dos assistentes

`/admin/rh/assistente`, `/admin/marcelo/assistente` e `/cliente/app/assistente` continuam com os mesmos
gates (`AdminGate` por papel; `RealAccessShell` + `ClientSpaceProvider` no portal) e ganharam texto
honesto: a sessão/papel/vínculo é conferida a cada pergunta, o assistente avisa quando a sessão expira e
outra base privada é negada. Em `/contato`, o rodapé deixou de prometer “fila” e passou a declarar que a
base pública só responde conteúdo público aprovado e que as bases privadas exigem sessão com escopo no
servidor.

## 4. Testes executados nesta sessão

| Suíte | Natureza | Ambiente | Resultado |
|---|---|---|---|
| `node --test tests/rag-widget-contract.test.mjs tests/ai-rag-real-scope.test.mjs` | contrato puro + **pool simulado** e `fetch` stub determinístico (sem HTTP/banco) | Node 22 | 19/19, 0 skip/todo |
| `npm run test:ai-rag-widget:pg` | **PostgreSQL 17 descartável real + HTTP real + Chromium real**, com provedor de modelo **stub determinístico** identificado como stub | sandbox Linux, 2 vCPU | 25/25, 0 skip/todo (piso TAP 20) |
| `npm run test:rag` (herdado) | PGlite beta, rota canônica, 401 privado, rascunho oculto | sandbox | executar antes do merge/CI |
| `npm run typecheck` | estático | sandbox | OK |
| `npm run build` | build beta noindex | sandbox | executar antes do merge (ver §6) |

O gate cobre: RH lê só corpus RH; gestão só o corpus de gestão; cliente A não lê a conta B; público não vê
conteúdo privado; vínculo revogado deixa de recuperar; registro arquivado/rascunho **com flag antiga
ligada** não é recuperado nem vaza; sem fonte o modelo não é chamado; contexto autorizado é o único que
chega ao provedor; limite 500 aceito e 501 recusado; resposta vazia e erro do provedor viram 503 explícito;
`ai_busy` quando já há uma geração; e, no navegador, a tela apresenta resposta com protocolo, ausência,
negativa real (403), sessão revogada (401), base indisponível, ocupado, provedor falhando, tempo esgotado,
foco visível por teclado, rótulo persistente, anúncio de status e bloqueio de envio duplicado — em 1440×900
e 390×844, sem transbordo horizontal.

**Diferenciação exigida pelo plano:** os testes de `tests/ai-rag-real-scope.test.mjs` usam **mock de pool**
(não são teste de banco real); o provedor de modelo do gate é **stub determinístico**, não Ollama; **nenhum
teste desta fatia falou com Ollama real** e nenhum resultado aqui mede modelo, latência real ou RAM.

## 5. Evidências

As imagens em `docs/fech-01-assistentes-evidencias/` foram produzidas pelo gate acima (Chromium real,
PostgreSQL descartável, documento e sessão fictícios). O `README.md` da pasta lista arquivo → cenário →
limite.

## 6. Limitações e pendências desta fatia

1. **Não executado nesta sessão:** `npm run build` completo e a suíte `npm test` integral (bateria longa);
   registrar o resultado no PR/CI antes do merge. `npm run test:rag` (PGlite) deve rodar no CI ou
   localmente para confirmar que o smoke herdado continua verde com o novo `empty_scope`.
2. **Ollama real, Windows, desempenho em 8 GB sem GPU e aceite de Marcelo/Andreia permanecem pendentes.**
   O gate prova o contrato e a apresentação, não o modelo.
3. **403 fora da navegação normal:** com o menu por papel e o trigger da migração 102 (que revoga sessões
   ao mudar o papel), um 403 `scope_forbidden` não é alcançável navegando. O gate o apresenta com um
   cenário explícito e rotulado — sessão nova emitida pelo login canônico para papel rebaixado — e **não**
   afirma que esse caminho é navegável.
4. **`cliente` sem conteúdo publicado** aparece como `empty_scope`; a tela não distingue “conta sem
   documento” de “vínculo revogado”, de propósito, para não vazar existência de conteúdo de outra conta.
5. **Curadoria segue em `/admin/ti` apenas descritiva** (painel `AiRagClient` ainda não montado): é a
   fatia FECH-02. Sem ela, publicar conteúdo revisado continua sendo uma jornada de TI incompleta.
6. **Sem busca semântica, sem PDF, sem fonte por diretório** (FECH-03): a busca é lexical sobre chunks e o
   campo `embedding_status` não representa embedding real.
7. **Feedback do assistente** não existe nesta fatia; a rota legada de feedback continua exigindo
   `admin`/`ti` e protocolo persistido, que a rota canônica não grava — por isso a interface não oferece
   esse caminho.

## 7. Próxima ação

FECH-02 — montar o console real de TI/curadoria no banco, conforme o plano de fechamento, sem reabrir
FECH-01. Antes de começar: reconciliar `main`, conferir o ledger (001–174) e ler o checklist atualizado.

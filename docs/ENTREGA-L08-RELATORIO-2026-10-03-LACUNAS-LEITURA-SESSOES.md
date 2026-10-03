# Relatório L08 — Auditoria de Lacunas Residuais, Resiliência de Interface e Separação de Sessões

- **Data:** 2026-10-03
- **Lote:** L08 / CLI-01..05
- **Branch da sessão:** `arena/01a0fffd-gruposegsystemseguranca`
- **Base oficial confirmada:** `8eae38ae7ce84b9a824a63d469d36e03a3b0a5c0` (merge da PR #85)
- **Estado remoto das PRs antecedentes:**
  - PR #85: `MERGED` em `2026-10-03T01:47:27Z` (merge commit `8eae38ae7ce84b9a824a63d469d36e03a3b0a5c0`)
  - PR #83: `MERGED` em `2026-10-03T00:31:58Z` (merge commit `31834ec0983ead61ec316df90f8af958594b3c58`)
  - PR #80: `MERGED` em `2026-10-02T23:24:28Z` (merge commit `52afebb1097d60a383c7219e7f3fe927a52ba3a6`)
- **Migrações:** 001–139 imutáveis e contínuas; nenhuma migração nova necessária; próxima livre permanece **140**.

---

## 1. Contexto e Diretriz do Proprietário

O proprietário instruiu foco na execução e implementação das capacidades do sistema e na resiliência de interface, evitando ciclos excessivos de execução de testes de integração pesados em cascata que provoquem timeouts desnecessários. Testes estruturados de longa duração permanecem para etapas de homologação consolidada.

Esta sessão realizou a auditoria detalhada de lacunas residuais da fatia CLI-01..05 pós-PR #85 e implementou um recorte mínimo, seguro e demonstrável sem promover indevidamente superfícies não autorizadas.

---

## 2. Lacunas Auditadas e Recorte Implementado

### Lacuna 1 (G1) — Resiliência de Interface: Erros de Leitura com Retry Explícito

**Diagnóstico:**
Nas telas de leitura do portal do cliente (`/cliente/app`, `/contratos`, `/documentos`, `/chamados` e `/seguranca`), falhas transitórias de conexão ou indisponibilidade de API apresentavam mensagens estáticas informando o usuário para "recarregar a página" (F5 completo) ou, no caso de falha do provedor de contas, exibiam a mensagem ambígua "identidade não vinculada" em vez de indicar erro real de leitura com ação de recuperação. Além disso, o método `reload()` do `ClientSpaceProvider` não resetava avisos residuais no início do retry.

**Implementação realizada:**
1. `src/app/cliente/app/ClientSpaceProvider.tsx`:
   - `reload()` passa a limpar `notice` (`setNotice("")`) e ativar `loading` (`setLoading(true)`) no início de cada tentativa.
2. `src/app/cliente/app/ClientApp.module.css`:
   - Adicionada classe `.retryButton` com estilo padronizado e hover para ações de retry em alertas e caixas de estado.
3. `src/app/cliente/app/page.tsx` (Visão geral):
   - Adicionado botão `"Tentar novamente"` no alerta de notice do provedor.
   - Refatorada a busca de estatísticas para `loadStats(accountId)` via `useCallback` e adicionado botão `"Tentar novamente"` quando `statsFailed` ocorre.
4. `src/app/cliente/app/contratos/page.tsx`:
   - Refatorada a busca para `loadContracts(accountId)` via `useCallback`.
   - Adicionado botão `"Tentar novamente"` no bloco de erro da listagem.
   - Quando `!activeAccount` decorre de falha no provedor (`notice` presente), renderiza bloco de erro explícito com botão de retry em vez de mensagem de ausência de vínculo.
5. `src/app/cliente/app/documentos/page.tsx`:
   - Refatorada a busca para `loadDocuments(accountId)` via `useCallback`.
   - Adicionado botão `"Tentar novamente"` no bloco de erro da listagem.
   - Tratamento explícito de falha do provedor com retry no estado sem conta ativa.
6. `src/app/cliente/app/chamados/page.tsx`:
   - Adicionado botão `"Tentar novamente"` no `loadError` da lista chamando `loadTickets(activeAccount.id)`.
   - Tratamento explícito de falha do provedor com retry no estado sem conta ativa.
7. `src/app/cliente/app/seguranca/page.tsx`:
   - Quando a verificação de sessão falha e `spaceNotice` está presente, renderiza bloco de erro explícito com botão `"Tentar novamente"`.

---

### Lacuna 2 (G2) — Prova de Separação Estrita de Sessões Staff × Cliente

**Diagnóstico:**
Embora a separação seja garantida por construção (cookies distintos `seg_client_session` e cookie administrativo), não havia subteste explícito no gate exercitando a rejeição cruzada de cookies nos endpoints canônicos.

**Implementação realizada:**
- Adicionado subteste em `tests/client-space.integration.test.mjs`:
  - Sessão staff contra rotas de cliente (`/api/client/accounts`, `/contracts`, `/documents`, `/documents/:id/download`, `/tickets`, `/security/mfa/setup`, `/api/auth/me`) é recusada com `401 client_session_required`.
  - Sessão cliente contra rotas administrativas (`/api/admin/client-accounts`, `/identities`, `/grants`, `/contracts`, `/documents`, download, `/tickets`, `/invites`) é recusada com `401 admin_session_required`.
  - Tentativas negadas de mutação administrativa com sessão de cliente comprovadamente não alteram registros no banco (`count` inalterado).
  - Papel administrativo não autorizado (ex: `rh`) em rotas administrativas de clientes é recusado com `403 forbidden`.

---

## 3. Validação Executada nesta Sessão

- **Estático:** `node scripts/qa-wave0-static.mjs` → 5/5 verificações aprovadas.
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`) → 0 erros de tipagem.
- **Testes Unitários:** `npm test` → 196/196 testes aprovados em 4.2s.
- **Build de Produção:** `npm run build` (`next build` Turbopack) → 78 páginas compiladas com sucesso em 40s.

---

## 4. Classificação e Próximos Passos

- **Classificação:** Implementação local + validação estática/unitária/build.
- **Aceite Humano:** O aceite de Marcelo e Andreia sobre o L07 permanece preservado no escopo local.
- **Homologação Windows:** A homologação final Windows continua pendente e adiada até o fechamento integral do sistema.
- **Não promovidos:** CLI-06..15, EXT-01..17, APIs v2 não promovidas, componentes órfãos de `/admin/ti`, fornecedor restrito e integrações externas.

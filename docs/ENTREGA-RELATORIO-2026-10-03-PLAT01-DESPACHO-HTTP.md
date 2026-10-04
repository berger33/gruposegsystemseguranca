# Entrega PLAT-01 — despacho HTTP à prova de rejeição assíncrona

Base: `main` `8c4d71a46215c0d775c4a7880a6e95bc01b9ea00` (merge da PR #115 / EXT-07 migração 155, confirmado por `gh pr view 115`: head `bd96d3f`, mesclada em 04/10/2026). Branch da sessão `arena/01a104ae-gruposegsystemseguranca`, divergência inicial 0/0 e árvore limpa. Migrações 001–155 intocadas; **nenhuma migração nova** — a próxima livre continua sendo a 156.

Esta entrega executa a pendência de plataforma declarada no relatório da 155: o despacho de API não aguardava a promise do handler.

## 1. O defeito

`server.mjs` despachava rotas com o padrão abaixo, repetido para 677 handlers:

```js
try {
  return handler(req, res);   // promise NÃO aguardada
} catch (e) { /* 500 fail-closed */ }
finally { /* observabilidade */ }
```

Em função assíncrona, `return <promise>` dentro de `try` **não** aguarda a promise: o `catch` associado nunca observa a rejeição. Três consequências, todas reproduzidas antes de qualquer alteração:

1. **Sem resposta.** A requisição ficava aberta até o timeout do cliente.
2. **Queda do processo.** A rejeição subia para o callback `async` de `createServer`, que ninguém aguarda, virando `unhandledRejection`. O repositório não registrava nenhum listener (`grep` em todo o código: zero ocorrências de `unhandledRejection`/`uncaughtException`), e o padrão do Node encerra o processo. **Uma única requisição com falha assíncrona derrubava o servidor inteiro**, sem necessidade de autenticação.
3. **Observabilidade falseada.** O `finally` rodava antes do handler terminar e gravava `status 200`, `duration_ms` ~0 e `error: null` para requisições que falharam — o erro sumia do ledger.

### Probe (temporário, apagado; sem banco e sem dado real)

Réplica fiel do padrão em servidor HTTP isolado, com rotas sintéticas:

| Rota sintética | Antes | Depois |
|---|---|---|
| `/ok` | HTTP 200 | HTTP 200 (inalterado) |
| `/sync-throw` | HTTP 500 fail-closed | HTTP 500 fail-closed (inalterado) |
| `/async-reject` | **sem resposta**; cliente abortou em 2503 ms; **processo encerrado (`exit 1`)** | HTTP 500 em 13 ms; processo vivo |
| `/reject-apos-headers` | conexão pendurada 2505 ms, corpo truncado | conexão encerrada em 13 ms, erro registrado |
| `/lento-ok` (120 ms) | — | HTTP 200 em 125 ms (requisição lenta legítima não é abortada) |
| Ledger de observabilidade | `200 / 0 ms / error null` nas falhas | status, duração e erro reais |

A queda do processo foi isolada executando a mesma réplica **sem** listener de `unhandledRejection` — exatamente o estado do repositório: `exit_code=1`, com o stack da rejeição no stderr.

## 2. A correção

### `src/server/route-dispatch.mjs` (novo)

Módulo autocontido — sem banco, rede, Next ou qualquer `import` — com três exportações:

- **`dispatchGuarded({ run, res, requestId, label, onError })`** — executa `run` com `await`, de modo que exceção síncrona e rejeição assíncrona percorrem o mesmo caminho. Nunca relança: devolve desfecho estruturado (`ok`, `failed_closed`, `failed_after_headers`, `failed_unreported`), o erro original e o status.
- **`guardedRequestHandler(handler, opções)`** — embrulha um handler `(req, res)` para o callback de `createServer`.
- **`installProcessSafetyNet()`** — segunda camada, idempotente: `unhandledRejection` passa a ser registrado **sem derrubar o processo**; `uncaughtException` é registrado de forma estruturada e **mantém** a falha rápida (`exit 1`), porque o estado do processo passa a ser desconhecido — a diferença em relação ao padrão é a evidência, não a permissividade.

Regras de resposta:

- **Fail-closed**: se nada foi escrito, responde 500 com corpo mínimo (`error: "internal_error"` + `request_id`). O corpo **não** vaza mensagem, stack, SQL ou nome de tabela — há teste dedicado.
- **Resposta parcial**: se os headers já saíram, o status não pode ser corrigido; a conexão é encerrada via `destroySoon` (esvazia o buffer antes de fechar) para o cliente não pendurar.
- **Resposta íntegra que falha depois**: quando o handler concluiu a resposta (`end` chamado) e só então falhou, **o socket não é tocado** — destruí-lo truncaria bytes em buffer e transformaria resposta válida em corrompida. Há teste HTTP real com corpo de ~360 KB provando integridade.
- Falha do próprio registrador (`onError`) não impede o 500.

### `server.mjs`

- O corpo de rotas de `routeApi` passou a ser executado por `dispatchGuarded` com `await`, **preservando as 677 rotas sem reescrita** (o corpo virou o `run` do guard; o diff é de poucas linhas).
- O erro do desfecho alimenta `routeError`/`statusForObs`, de modo que o `finally` volta a registrar status, duração e erro reais.
- O callback de `createServer` foi embrulhado por `guardedRequestHandler`, protegendo também `seoTechnicalApi.resolveRedirect` e o handler do Next — ambos assíncronos e, até aqui, igualmente capazes de derrubar o processo.
- `installProcessSafetyNet()` é chamado antes de o servidor subir.

Nenhum contrato de API mudou: status, corpos e rotas do caminho feliz seguem idênticos.

## 3. Testes

| Arquivo | Natureza | Asserções |
|---|---|---|
| `tests/route-dispatch.test.mjs` | unitário + **HTTP real** (porta efêmera de loopback, sem banco) | 18 |
| `tests/route-dispatch-guard.test.mjs` | guarda estática sobre `server.mjs` (mesmo espírito de `staff-session-await-guard`) | 7 |
| `tests/qa-evidence-report.test.mjs` | o próprio artefato de evidência (estrutura do PDF, quebra de linha, acentuação, leitura de TAP) | 12 |

Cobertura relevante: rejeição assíncrona vira 500; corpo de falha não vaza interno; conexão parcial encerra em vez de pendurar; resposta íntegra não é truncada; rajada de 25 falhas seguidas não degrada nem derruba o servidor; nenhuma `unhandledRejection` escapa durante a suíte; rede de segurança idempotente; `uncaughtException` preserva falha rápida.

### Prova negativa (mutação)

Uma guarda estática que nunca falha não protege nada. O `await` do despacho foi removido temporariamente de `server.mjs`: a guarda **reprovou** (`not ok 2`, 6 pass / 1 fail). O arquivo foi restaurado e conferido por `sha256sum -c` antes de qualquer outra execução, voltando a 7/7.

## 4. Validação executada

Bateria **integral** nesta máquina, com resultado consolidado em PDF e ledger JSON versionados:

| Prova | Resultado |
|---|---|
| `npm ci` | 0 vulnerabilidades |
| Wave 0 estático | 5/5 (001–155) |
| `npm run typecheck` | OK |
| Focal PLAT-01 | 25/25 |
| Focal EXT-07 | 19/19 |
| `npm test` | **494/494**, zero skip/todo |
| `npm run build` | 92 páginas, `/admin/compliance` presente |
| `test:migrations:pg` | 155/155 ×2 + clone negativo (checksum divergente rejeitado, sem rebaseline) |
| `test:ext07-compliance:pg` | 37/37, zero skip/todo (mínimo 35) |
| `test:ext06-satisfaction:pg` | 36/36 |
| `test:ext05-quality:pg` | 33/33 |
| `test:ext04-suppliers:pg` | 28/28 |
| `git diff --check` | limpo |

Os quatro gates de jornada HTTP real foram executados como **regressão de vizinhança**: eles sobem servidor HTTP real contra PostgreSQL descartável e atravessam o despacho alterado ponta a ponta. Nenhum deles cobre o defeito PLAT-01 em si — essa cobertura é dos testes focais.

## 5. Ferramenta de evidência (novo)

`npm run qa:evidence` executa a bateria declarada, registra o resultado real de cada passo (código de saída, duração, resumo TAP, recorte da saída) e emite:

- `docs/evidencias/<slug>.pdf` — relatório paginado para apresentação;
- `docs/evidencias/<slug>.json` — ledger estruturado, versionável;
- `docs/evidencias/logs/<id>.log` — saída integral por passo (fora do git por `*.log`).

O PDF é gerado por `scripts/lib/pdf-report.mjs`, **sem dependência nova**: segue o padrão artesanal já presente em `src/server/proposal-api.mjs`, agora com múltiplas páginas, tabelas com cabeçalho repetido, blocos monoespaçados, rodapé numerado e `WinAnsiEncoding` para acentuação. Sem Chromium, sem rede, sem binário externo.

Critério de aprovação por passo: código de saída 0 e, sob `node:test`, zero falha, zero skip, zero todo e zero cancelado. Um passo com `skip` é **reprovado** — há teste garantindo essa regra. Nenhum valor do relatório é transcrito à mão: tudo vem da execução.

Flags: `--list`, `--only=`, `--skip=`, `--rotulo=`, `--slug=`, `--from-ledger=` (re-renderiza o PDF sem reexecutar).

## 6. CI

`.github/workflows/plat01-dispatch.yml` (novo, `on: pull_request` com `paths`, YAML validado por parser): `npm ci` → wave 0 → bateria leve via `qa-evidence-report` → publicação do PDF/ledger/logs como artefato (`if: always()`, inclusive em falha). Como `server.mjs` consta dos `paths` do workflow EXT-07, aquela esteira de PostgreSQL real também dispara nesta mudança.

## 7. Fronteiras preservadas

- Nenhuma migração nova; 001–155 intocadas.
- Nenhum contrato de API, rota, status ou corpo alterado no caminho feliz.
- `src/app/admin/ti/ExtAdvancedClient.tsx` e os handlers EXT-08..12 não foram tocados.
- Sem dado real, SMTP real, armazenamento externo ou integração inventada. O probe usou apenas rotas sintéticas e foi apagado.
- Gates de banco continuam **falhando**, e não pulando, quando o PostgreSQL não está disponível; nenhuma asserção foi reduzida.
- Sem auto-merge: a PR fica aguardando autorização explícita do proprietário.

## 8. Pendências declaradas (não cobertas aqui)

- Execução agendada/contínua da avaliação temporal do EXT-07 — `POST /api/ext/compliance/evaluate` segue sendo operação administrativa explícita.
- Aplicação das migrações em banco de destino e validação no ambiente real do operador.
- Aceite humano e validação em Windows.

Evidência consolidada: [`docs/evidencias/qa-evidencia-2026-10-03-plat01-despacho-http.pdf`](evidencias/qa-evidencia-2026-10-03-plat01-despacho-http.pdf) e o ledger JSON de mesmo nome.

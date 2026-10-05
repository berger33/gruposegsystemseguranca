# F14 / AI-01 — FAQ pública com Ollama local real

Estado: **implementada, aguardando execução do gate focal no Windows do operador**. Não declarar homologada antes de `AI01_GATE_OK`.

## Decisões aprovadas

- Modelo local autorizado: `qwen3:1.7b`.
- Corpus do gate: exclusivamente sintético e público, criado pela API administrativa.
- Retenção: pergunta, prompt e resposta não são persistidos. O banco guarda protocolo, fontes públicas, métricas reais e hash SHA-256 da pergunta para auditoria sem logar seu conteúdo.
- Limites: entrada 1.000 caracteres; saída 512 tokens; três chunks de 500 caracteres; concorrência 1; fila 4; timeout 30 segundos.
- Sem ferramentas, escrita de negócio, envio externo ou ação autônoma.

## Pré-condição comprovada pelo operador em 2026-10-05

- Ollama `0.35.1`.
- `qwen3:1.7b`, ID curto `8f68893c685c`, tamanho informado 1,4 GB.
- Inferência local retornou `OLLAMA_REAL_OK`, `done_reason=stop`, `prompt_eval_count=31`, `eval_count=5`.

Essa prova confirma Ollama/modelo no PC, mas não substitui o gate HTTP + PostgreSQL da aplicação.

## Gate focal

No clone desta branch, com Ollama ativo somente em `127.0.0.1:11434`:

```powershell
npm ci
npm run test:ai01:pg
```

O gate recusa `DATABASE_URL`, cria PostgreSQL 17 descartável em UTF-8, aplica 001–172, executa o build de produção, inicia HTTP real e exige o endpoint Ollama real. Ele cria e publica corpus sintético pela API canônica e verifica:

- modelo e tokens retornados pelo Ollama;
- fontes recuperadas na resposta;
- ausência de resposta sem fonte;
- filtragem de tentativa de prompt injection no documento;
- bloqueio dos escopos cliente, RH e Marcelo na rota pública;
- indisponibilidade explícita em falha e com Ollama desligado;
- cancelamento com liberação do slot de concorrência;
- não retenção de pergunta/resposta;
- zero `skip` e zero `todo`.

Sucesso termina com:

```text
AI01_GATE_OK: ... PostgreSQL=descartavel HTTP=real Ollama=real model=qwen3:1.7b
AI01_PG_TEMP_CLEANED: true
```

## Limites da prova

O gate não homologa conteúdo comercial real, produção, acesso remoto, escopos privados, AI-02..10, hardware diferente, aceite humano ou banco do operador. O corpus sintético é descartado com o cluster temporário. A porta 11434 não deve ser exposta à internet.

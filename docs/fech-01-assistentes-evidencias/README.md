# Evidências visuais — FECH-01 assistentes privados e contrato do widget

Todos os arquivos desta pasta foram produzidos em **07/10/2026** por uma única execução de
`npm run test:ai-rag-widget:pg`, com **PostgreSQL 17 descartável**, **servidor HTTP canônico
(`server.mjs --dev`)**, **sessões emitidas pelos endpoints reais de login** e **Chromium real**.
A massa é inteiramente fictícia; o banco é destruído ao final.

**Fronteira declarada — leia antes de citar estas imagens:** o provedor de modelo usado nesta execução é um
**stub determinístico em loopback**, identificado por `stub-deterministico-fech01` na própria imagem. Ele
prova o contrato HTTP (quando o modelo é chamado, com qual contexto autorizado, o que a tela faz com cada
resposta e cada negativa). **Não é Ollama real**, não mede qualidade de resposta, latência, RAM nem
comportamento em Windows. Nenhuma imagem desta pasta é homologação ou aceite humano.

| Arquivo | Cenário provado | Limite declarado |
|---|---|---|
| `desktop-rh-resposta-com-fonte.png` | `/admin/rh/assistente` em 1440×900: pergunta sobre marcador do corpus RH, resposta com 1 fonte publicada, protocolo exibido e botão de cópia | o texto da resposta é do stub, não do modelo local |
| `desktop-marcelo-resposta.png` | `/admin/marcelo/assistente`: corpus de gestão respondendo com `RAG-MAR-…` | idem |
| `desktop-sem-fonte.png` | pergunta sem trecho publicado: ausência declarada, sem protocolo e sem botão de cópia | não mede qualidade de busca |
| `desktop-negado-403.png` | `scope_forbidden` real: papel rebaixado no perfil, sessão nova emitida pelo login canônico, tela mostrando NEGADO | cenário explicitamente montado pelo gate; esse caminho **não** é navegável (o menu por papel e o trigger 102 revogam a sessão antes) |
| `desktop-sessao-revogada.png` | sessão de staff revogada por `DELETE /api/admin/session` com a página aberta: estado de sessão necessária | não cobre expiração natural por tempo |
| `desktop-base-indisponivel.png` | tabela de chunks renomeada no banco descartável: `rag_unavailable` como falha recuperável | falha injetada só no ambiente do gate |
| `desktop-ocupado.png` | segunda consulta com uma geração em andamento: `ai_busy` com retry sugerido | concorrência real de 1 slot por processo |
| `desktop-modelo-falhou.png` | provedor respondendo erro HTTP: `ai_unavailable`/`ollama_http_error`, sem resposta inventada | stub, não Ollama |
| `desktop-modelo-indisponivel.png` | provedor desligado: tempo esgotado, sem resposta e sem protocolo | idem |
| `desktop-teclado-foco-visivel.png` | foco visível no campo e no envio, ordem de tabulação rótulo → campo → envio | teclado, não leitor de tela |
| `mobile-390-publico-sem-fonte.png` | `/contato` em 390×844: base pública sem conteúdo publicado e sem vazamento de título/trecho privado, sem transbordo horizontal | um viewport |
| `mobile-390-cliente-resposta.png` | `/cliente/app/assistente` em 390×844: resposta da conta vinculada e ausência para a conta alheia | não cobre todos os dispositivos |

## Reprodução

```bash
npm ci
FECH01_EVIDENCE_DIR=docs/fech-01-assistentes-evidencias npm run test:ai-rag-widget:pg
```

O gate **não** grava imagens por padrão (só com `FECH01_EVIDENCE_DIR`); ele exige PostgreSQL real
(`QA_AI_RAG_WIDGET_REQUIRE_DB=1`), piso TAP de 20 casos e zero `fail`/`skipped`/`todo`.

## Limites gerais

Estas provas não constituem homologação humana, aceite de Marcelo ou Andreia, auditoria WCAG integral nem
observação de produção. Windows, Ollama real, desempenho em PC de 8 GB sem GPU e SMTP continuam fora do que
esta pasta comprova.

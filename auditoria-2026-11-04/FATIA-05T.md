# Fatia 05T — UX licitações e fornecedores

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch de main confirmado; HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05: 47/68 runners adotados; 21 pendentes. Produção NO-GO.**

## 1. Contratos inventariados e preservados

Lidos AGENTS, README, status/plano/matriz, runners, integrações/workflows e documentos históricos UX-08/UX-09. Não se reimplementaram capacidades já entregues.

- **Licitações `/admin/licitacoes`: 28 testes.** Gate de presença do banco; sessão/papel/origem/chave; autoria/protocolo canônicos; idempotência/reuso conflitante; edital duplicado; janela de proposta/prazo registrado; prazos substituídos imutáveis; retirada preservada no histórico; terminal não reabre; resultado somente após encerramento e imutável; responsável canônico; checklist derivado; versão documental; antecedência explícita; auditoria indisponível sem persistência; histórico apenas-acréscimo; fonte/data-base/fronteira; filtros declarados; leitura legada com mutação 410; apresentação/negativa/falha/mobile e resposta inválida/releitura preservada/negativa fail-closed no browser.
- **Fornecedores `/admin/fornecedores`: 20 testes.** Contratos estáticos e C11; quatro leituras e nove mutações com sessão/papel; carregamento distinto de vazio; falha inicial com repetição real; releitura preserva dados/hora; negativa descarta dados protegidos; 2xx malformado não vira ausência; detalhe da cotação independente das listas; cinco abas/teclado/campos preservados; viewports 320/390/768/1440 e tema noturno; envio pendente/duplo clique/reconciliação; payload e chave canônicos; falha transitória sem repetição automática e com mesma chave na repetição explícita; conflito distinto sem retry; 403 fail-closed; resposta inválida na escrita não vira sucesso.

**Integrações, APIs, páginas, schema, fixtures e permissões inalterados nesta fatia.** Massa sintética; falhas de browser restritas a window.fetch. Sem decisão real de edital/cotação/compra, canal/login externo de fornecedor, upload real, pagamento ou envio. Os testes não equivalem a aceite humano, WCAG integral ou reauditoria global por requisito/papel.

Gates independentes preservados, sem editar seus runners/integrações: **EXT-03 26/26**, mínimo 25; **EXT-04 28/28**, mínimo 28. Ambos reexecutados localmente, exit 0, zero fail/skip/todo e limpeza confirmada. Workflow de fornecedores continua chamando EXT-04 antes do focal; o de licitações mantém seu desenho anterior, sem acrescentar chamada EXT-03. Corrigido somente o nome errado do arquivo herdado em comentário do wrapper fornecedor (`ext04`, não `ext03`).

## 2. Migração e diferenças de resultado

Wrappers `scripts/qa-ux-bidding-postgres.mjs` e `scripts/qa-ux-supplier-postgres.mjs` usam supervisor POSIX após recusas de URL/opt-in e antes do import de embedded-postgres/efeitos nativos. Pai libera handlers concorrentes; worker recebe sandbox/TMP/IPC, criação local limitada e fases monotônicas. Pai confirma término e remoção antes do token genérico de limpeza; logs legados de temporário limpo ficam somente no caminho não supervisionado.

Helper compartilhado **inalterado**. Windows mantém lifecycle anterior, sem homologação nova. Mantidos LD_LIBRARY_PATH/symlinks, heap de 1024MB e **UTF8 + locale C de fornecedores**, sem mudar flags de licitações. Patterns opcionais e evidências de fornecedores preservados; nenhum diretório opcional de capturas usado nestas provas. SMTP/Ollama desligados, Chromium local, sem provedor externo/AWS operacional.

- **Licitações:** stdio/exit code herdado, sem auditor TAP mínimo novo. Pattern pode selecionar subconjunto; ensaios integrais com pattern vazio.
- **Fornecedores:** captura/auditor TAP **mínimo 20**, rejeição de falha/parcial/skip/todo/ausência de resumo mantida. Pattern continua disponível, mas não desativa esse piso. Preservados result = executed.code e reprovação adicional pelo auditor.

Budgets em ambos: **migrate 90s / test agregado 900s**; soma de limites do protocolo **1140s**, além das margens limitadas de TERM/KILL/remoção existentes. Bootstrap original **60s licitações / 120s fornecedores** e todos os limites internos mantidos. Fornecedores conserva recuperação de crash de browser e executável opcional herdados; ERR_ASSERTION continua lançado imediatamente. Licitações não ganhou retry de browser/gate. Nenhum retry novo ou relaxamento de asserção. Budget agregado com margem para as jornadas, não garantia de todos os máximos internos simultaneamente.

Políticas de diretórios Next/evidências mantidas; nenhuma promessa nova de isolamento global de gerados.

## 3. CI e regressões

Workflows existentes reforçados com filtros supervisor/guarda/teste/migrador, unitários antes de PG e env local/patterns explicitamente vazios; contents read explícito. Mantidos typecheck, vocabulários/testes EXT, `npm audit --audit-level=moderate`, acionamento manual de fornecedores, EXT-04 e jobs **35min licitações / 30min fornecedores**. **CI remoto e auditoria npm remota não executados nesta entrega**; preservação do comando no workflow não é resultado verde desse comando.

Supervisor: **50/50**, três regressões novas: contratos dos wrappers/fases/limites/locale/resultados, execução do auditor real via VM contra falha/parcial/skip/todo e CI preservando gates/comandos/tempos. Guardas reais ampliadas: **46 × 3 recusas + 3 específicas = 141 execuções negativas**, sem abrir cluster; piloto tenant separado.

## 4. Ensaios e resultados

Tempos de parede do comando completo; patterns vazios, zero fail/skip/todo nos seis ensaios.

| Jornada | Antes | Pós isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| Licitações | **28/28**, 25,42s | **28/28**, 22,83s | **28/28**, 35,88s |
| Fornecedores | **20/20**, 82,11s | **20/20**, 79,99s | **20/20**, 108,88s |

Todos exit 0 e limpos; sem BROWSER_RETRY observado. Datas dos cenários continuam derivadas do servidor, sem fixar calendário no teste.

- Negativo PG sob CPU: overall exit 0 em **6,30s**, detectando duas falhas esperadas exit 1 com limpeza (porta ocupada/cluster morto). Não são clusters aprovados.
- `npm test` após jornadas Next, ainda sob dois consumidores CPU: **1588/1588**, zero falhas/skips/todos, exit 0, **89,00s**. Sequenciar não resolve a corrida global de gerados registrada na 05B.
- Gates herdados: EXT-03 **26/26**, **8,89s**; EXT-04 **28/28**, **16,14s**.

### Seis cancelamentos reais

Sinal único só ao supervisor, depois do gatilho confirmado. Árvore observada por ancestralidade /proc; sandbox lido no worker, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Licitações | Banco pronto / TERM | **143** | 0,74s |
| Licitações | Servidor ativo / INT | **130** | 5,12s |
| Licitações | Chromium ativo / TERM | **143** | 10,49s |
| Fornecedores | Banco pronto / TERM | **143** | 0,75s |
| Fornecedores | Servidor ativo / INT | **130** | 5,22s |
| Fornecedores | Chromium ativo / TERM | **143** | 16,59s |

Nos seis: sandbox removido, limpeza confirmada, hashes next-env.d.ts/tsconfig.json iguais aos de entrada, nenhum descendente observado ativo. Browser ativo não significa assertions/navegação concluídas. Sessões destacadas do Playwright, browser travado/escapado e morte abrupta do supervisor continuam fora desta prova.

### Complementares

- Focal final de 12 arquivos: **229/229**, zero fail/skip/todo; supervisor, vocabulários, EXT-03/04 unitários, cliente fail-closed, SEC, índices, gerados e package-artifacts.
- Typecheck/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices oficiais regenerados/conferidos: **60 workflows / 1740 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero. Sem promoção de classe/rota por adoção de wrapper.
- Gerados sem diff; higiene e processos/sandboxes conferidos no fechamento.

Logs/harness sintéticos `/tmp/f05t-*` não versionados; resultados persistentes neste relatório.

## 5. Continuidade e limites

[Matriz](ADOCAO-POSTGRES.csv): **47/68 adotados; 21 pendentes**. Prova negativa é 69º arquivo, fora do denominador. Próximo grupo proposto **05U — UX qualidade e satisfação**, após inventário/baseline, preservando gates herdados.

Permanecem isolamento global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, CI remoto, Windows/UAT/WCAG manual e restore real. Não declara volume real, homologação integral por papel ou fechamento client-security/N8.

**Fatia 05 e N8/N9 abertos. Produção NO-GO. Sem commit/push/PR/deploy, dados reais, contratação ou envio externo.**

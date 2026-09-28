# Homologação RAG Beta — Cliente / RH / Marcelo / Público + Bot modes

Data: 2026-09-28
Branch: arena/01a0e621
Build: 66 páginas, 46 rotas API, PGlite lite + Docker full

## Objetivo
Validar com usuários representativos que os 3 RAGs isolados + público + bot modes atendem aos requisitos de área pertinente, sem invenção preço/cobertura/licença/prazo, fila Ollama Qwen3 1.7B, link público para Marcelo.

## Pré-requisitos homologação
- Pacote beta: `dist/seg-system-beta.zip` ou `start.sh` / `start.bat`
- Node 20+ instalado
- Sem necessidade de configurar DB manualmente (PGlite fallback)
- Para link público: `expor.sh` / `expor.bat` (localtunnel)

## Roteiro por perfil

### 1. Usuário Cliente (portal cliente)
**Quem:** cliente representativo com conta ativa
**RAG:** `cliente` — contratos/documentos/chamados/agenda/financeiro quando habilitado, sem RH/saúde/salário

Tarefas:
1. Acessar http://localhost:3000/cliente/app/assistente
2. Perguntar: "Meus contratos e documentos?"
   - Esperado: resposta com "Portal cliente com entrada única, contratos itens vigência escopo claro, documentos categoria validade versão busca download privado autorização testada"
   - Não deve conter: salário detalhado, dados RH, CPF de outros clientes
3. Perguntar: "Como abrir chamado?"
   - Esperado: protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA
4. Verificar guardrails: perguntar "Quanto custa?" → deve responder "[preço sob consulta]" ou "sem preço fictício", `is_invented_price=false`
5. Verificar fila: resposta deve conter `queue_position`, `queue_wait_ms`, `model qwen3:1.7b`

Critério aceite:
- [ ] RAG cliente só retorna área pertinente cliente
- [ ] Sem dados RH/saúde/salário
- [ ] Protocolo `RAG-CLI-YYYYMMDD-XXXX` gerado
- [ ] `is_invented_* false`

### 2. Usuário RH Andreia (módulo RH)
**Quem:** RH Andreia representativa
**RAG:** `rh` — admissão/férias/benefícios/treinamentos/ponto/folha, sem cliente PII

Tarefas:
1. Acessar http://localhost:3000/admin/rh/assistente
2. Perguntar: "Como funciona admissão e férias?"
   - Esperado: "RH cadastro profissional separado de login, admissão checklist por função, férias períodos aquisitivo/concessivo, benefícios elegibilidade"
   - Não deve conter: "dados cliente", "CPF cliente", dados contratuais de cliente
3. Perguntar: "Como solicitar benefício?"
   - Esperado: elegibilidade, solicitações, conferência
4. Verificar que não expõe salário detalhado fora escopo: perguntar "Salário detalhado do funcionário X" → deve responder sem expor ou "acesso restrito"
5. Verificar fila: `queue_position`, `queue_wait_ms`

Critério aceite:
- [ ] RAG RH só área pertinente RH
- [ ] Sem cliente PII
- [ ] Protocolo `RAG-RH-...`
- [ ] Guardrails

### 3. Usuário Marcelo (administração)
**Quem:** Marcelo administrador
**RAG:** `marcelo` — gestão negócio indicadores aprovações comercial operacional financeiro, sem segredos técnicos/saúde irrestrita

Tarefas:
1. Acessar http://localhost:3000/admin/marcelo/assistente
2. Perguntar: "Quais pendências comerciais e operacionais?"
   - Esperado: "Administração Marcelo visão geral meu dia pendências reais prioridade responsável ação, visão comercial leads novos oportunidades paradas propostas próximas ações, visão operacional cobertura ocorrências críticas SLA implantação, visão financeira fonte competência saldo vencimentos margem por contrato"
   - Não deve conter: segredos técnicos, prontuário médico completo, dados pessoais sensíveis irrestritos
3. Perguntar: "Contratos próximos renovar?"
   - Esperado: contratos próximos renovar, reclamações reincidentes, risco perda justificado
4. Verificar busca autorizada: RAG deve respeitar permissão
5. Verificar fila e bot config: `active_mode com_ia`, `is_beta_mode true`

Critério aceite:
- [ ] RAG Marcelo visão gestão, sem segredos técnicos/saúde
- [ ] Protocolo `RAG-MAR-...`
- [ ] Bot config singleton `com_ia` padrão beta

### 4. Usuário Público (site)
**Quem:** visitante site
**RAG:** `publico` — serviços/segmentos/FAQ/contato claro, sem preço fictício

Tarefas:
1. Acessar http://localhost:3000/faq e http://localhost:3000/contato (com AiBotWidget)
2. Perguntar: "Quais serviços vocês oferecem?"
   - Esperado: "6 serviços validados: segurança desarmada, monitoramento 24h, CFTV, portaria/controle acesso, limpeza conservação, supervisão ronda"
   - Contato claro: "Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000, tel (11) 3437-2217"
   - Sem: preço fictício, cobertura/licença/prazo inventado
3. Perguntar: "Como solicitar orçamento?"
   - Esperado: protocolo persistido, mesma API leads, origem/campanha, antispam
4. Verificar transferência humana: quando não encontra, sugere humano
5. Verificar bot modes:
   - `sem_ia`: deve usar `pub_faq_assisted_rules` (contato_claro, servicos_validados, orcamento_visita)
   - `com_ia`: deve usar RAG público + Ollama Qwen3 1.7B fila
   - `whatsapp`: deve redirecionar para `551134372217` com template `Olá, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}.`

Critério aceite:
- [ ] RAG público só serviços validados, segmentos, FAQ, contato claro
- [ ] Sem preço fictício, sem cobertura/licença/prazo inventado
- [ ] Protocolo `RAG-PUB-...` e `BOT-PU-...`
- [ ] Guardrails `is_invented_* false`

### 5. Bot modes — desenvolvedor altera dinâmica
**Quem:** TI / admin
**Tarefas:**
1. Acessar TI 21 clients (ou via API com sessão admin): `GET /api/ai-bot-config` com `Origin`
2. Verificar config: `singleton_id=1`, `active_mode=com_ia`, `whatsapp_number=551134372217`, `is_dev_mode=true`, `is_beta_mode=true`, `default_rag_key=publico`, `model_name=qwen3:1.7b`, `max_queue_size=100`
3. Alterar modo:
   - `PATCH /api/ai-bot-config {active_mode:sem_ia, reason:"Teste modo sem IA - base aprovada sem LLM"}`
   - Testar bot: deve usar regras FAQ, sem Ollama
   - `PATCH {active_mode:whatsapp, reason:"Teste redirect WhatsApp"}`
   - Testar bot: deve retornar `is_whatsapp_redirect=true`, `whatsapp_number=551134372217`, mensagem com protocolo
   - Voltar para `com_ia`
4. Verificar histórico: `ai_bot_config_history` deve registrar `previous_mode/next_mode`, `reason`

Critério aceite:
- [ ] 3 modos existem e são alternáveis
- [ ] Padrão beta `com_ia`
- [ ] WhatsApp template com `{protocol} {query}`
- [ ] Histórico imutável

## Testes automatizados RAG
```bash
# Terminal 1: server PGlite
rm -rf .data/pglite
PORT=3002 node server.mjs

# Terminal 2: integração
RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs
# Esperado: 7 testes pass, 4 RAGs isolados, queue_position, guardrails false
```

Evidências coletadas 2026-09-28:
- `rm -rf .data/pglite && getPGlitePool()` → `ai_rag_indexes cnt 4 model_name qwen3:1.7b max_queue_size 100`
- `POST /api/ai/rag publico` → 6 serviços validados, queue_position 1
- `POST /api/ai/rag cliente/rh/marcelo` → área pertinente apenas, sem vazamento
- `POST /api/ai/bot publico` → modo com_ia, Ollama Qwen3 1.7B fila, protocolo BOT-PU-...
- Build 66 páginas, `npm test` 46 pass

## Link público para Marcelo
```bash
# Terminal 1: app rodando
./start.sh  # ou npm ci + npm run build + node server.mjs

# Terminal 2: expor
./expor.sh  # ou npx localtunnel --port 3000
# Copiar URL https://xxxx.loca.lt e enviar para Marcelo
# Acessar URL deve abrir site com RAG funcionando
```

## Checklist final homologação
- [ ] Cliente validou RAG cliente sem RH/saúde/salário
- [ ] RH Andreia validou RAG RH sem cliente PII
- [ ] Marcelo validou RAG Marcelo gestão sem segredos técnicos/saúde irrestrita
- [ ] Público validou RAG público serviços validados contato claro sem preço fictício
- [ ] Bot modes sem_ia/com_ia/whatsapp alternáveis, padrão com_ia beta
- [ ] Guardrails `is_invented_* false`, sem R$ inventado
- [ ] Fila Ollama Qwen3 1.7B `queue_position/wait_ms` garantindo atendimento
- [ ] Link público funciona para Marcelo
- [ ] Pacote 1-clique `start.sh/bat` sem configurar DB manualmente
- [ ] Autorização explícita para produção pendente (não publicar automaticamente)

## Próximos passos pós-homologação
- Configurar Ollama real: `ollama pull qwen3:1.7b`, `OLLAMA_HOST=http://localhost:11434`
- Trocar secrets `.env.beta` em produção
- Remover noindex quando política aprovada e hospedagem 200 R$ teto configurada
- Backup restauração testada ambiente isolado `is_restore_tested is_isolated`
- Observabilidade healthcheck config flags env isolation maintenance docs

Não publicar em produção nem contratar serviços automaticamente até autorização explícita.

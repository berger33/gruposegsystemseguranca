# RAG local por área — preparação e limites

Esta fatia usa Ollama instalado no **mesmo computador do servidor**, com o modelo
`qwen3:1.7b`. A chamada é local por `/api/chat`; não há provedor externo nem
fallback que se apresente como resposta gerada. O modelo foi encontrado nesta
máquina em 05/10/2026 por `ollama list` e `/api/tags`. Isso não prova uma resposta
completa, desempenho ou funcionamento em outra máquina.

## Antes de ativar

1. Atualize o código para o commit que contém esta fatia. Faça backup do banco.
2. Aplique o migrador oficial; ele inclui a migração 173. Execute novamente para
   verificar o ledger. Não edite migrações anteriores nem aplique a 173 sozinha.
3. Instale Ollama e obtenha o modelo com `ollama pull qwen3:1.7b`, caso ainda não
   esteja disponível. `ollama list` deve mostrá-lo. Mantenha a API em loopback.
4. No arquivo de ambiente **fora do GitHub**, configure:

   ```text
   OLLAMA_ENABLED=true
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=qwen3:1.7b
   ```

5. Reinicie o servidor. Nenhuma senha ou prompt deve ser enviada ao GitHub.

## Conteúdo e permissões

Na seção de bases de IA de `/admin/ti`, um perfil autorizado cria um índice para
`publico`, `cliente`, `rh` ou `marcelo`. Cria documentos em rascunho, revisa e
publica explicitamente índice e documento. Um documento do cliente exige o UUID
da conta. Conteúdo não publicado ou índice não publicado não é recuperado.
O painel de TI só pode curar bases pública e de clientes; RH só a base RH;
admin pode curar todas. O conteúdo deve ter origem identificável e aprovada.

A nova rota `POST /api/ai/answer` decide o escopo **no servidor**:

| Área | Acesso | Recuperação |
|---|---|---|
| público | visitante | documentos públicos aprovados |
| cliente | sessão de cliente | documentos de contas com vínculo ativo e escopo de unidade válido |
| RH | sessão staff RH ou admin | documentos RH aprovados |
| Marcelo | sessão staff Marcelo ou admin | documentos de gestão aprovados |

Se a pergunta não tiver trecho relacionado, a resposta informa ausência de
fonte e **não chama** o modelo. Se Ollama falhar/desligar, retorna erro explícito.
A busca é **lexical** sobre chunks revisados; o campo legado
`embedding_status` não representa embedding real. Não há busca semântica,
consulta automática a dados vivos de RH/CRM/financeiro, nem agentes autônomos.
Para informações atuais, use as telas oficiais; curadores precisam publicar
documentos atualizados. Perguntas e respostas dessa rota não são gravadas no
ledger beta de custo/token, evitando alegar contagem ou custo inexistentes.

## Testes a executar pelo operador após o merge

- Em banco **descartável**, aplicar 001–173 duas vezes e verificar ledger 173/173.
- Publicar um documento fictício por área. Criar clientes A/B com acessos
  separados; cada cliente só deve obter a fonte da própria conta. Revogar o
  vínculo A e confirmar que a fonte some antes de chamar Ollama.
- Confirmar 401 para cliente sem sessão; 403 para RH perguntando à base Marcelo
  e para visitante tentando base privada. Confirmar que documento em rascunho
  não aparece.
- Confirmar uma resposta Ollama real com `ollama_used=true` e fonte correta;
  depois desligar Ollama e confirmar `ai_unavailable`, sem texto simulado.
- Testar documento com instrução maliciosa e pergunta sem fonte. Verificar que
  a resposta não muda de papel nem cita documento de outra área.
- Medir tempo e RAM com uma e duas pessoas. A implementação admite uma geração
  simultânea; a segunda recebe `ai_busy` e pode tentar novamente.
- Rodar os testes globais do projeto, build, navegador e validação Windows antes
  de publicar a demonstração. Esta fatia recebeu apenas testes leves locais.

Os endpoints beta de perguntas retornam 410 e apontam para a rota canônica.
O formulário público de contato e os três assistentes usam a rota nova. A seção
histórica de configuração de modos do bot permanece no painel técnico apenas
para referência; ela não controla o novo RAG.

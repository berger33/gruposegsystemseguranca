# Atualização local — desenvolvimento de fechamento

Não executado nesta sessão. Operador: usar `F:\SegSystem-Local`, não o snapshot antigo. Arquivo de ambiente e credenciais permanecem fora do GitHub. O servidor 3100 não foi atualizado aqui.

1. Registrar SHA atual e fazer backup validado do banco/dados usando o procedimento operacional existente. Se não houver backup/restauração confiável, não migrar banco com dados necessários.
2. Parar o servidor pelos scripts existentes; preservar Docker, volumes, Ollama e pastas de dados. Não apagar `.env`, banco ou modelos.
3. Atualizar checkout limpo para a main que contém esta entrega, preservando alterações próprias. Instalar dependências com o lockfile (`npm ci`).
4. Apontar o migrador oficial ao banco correto com variáveis locais. `npm run db:migrate` deve aplicar 175 após 001–174; repetir e verificar idempotência/ledger. Não executar somente uma SQL avulsa nem editar antigas. Este fluxo exige PostgreSQL; a nova fonte não foi adaptada ao init beta de PGlite.
5. Configurar `OLLAMA_ENABLED`, `OLLAMA_BASE_URL` loopback e `OLLAMA_MODEL` no ambiente local. Não supor que editar configuração legada no banco altera esses valores.
6. Para pastas, adicionar `RAG_DOCUMENT_ROOTS_JSON` como JSON numa linha. Exemplo estrutural para bases genéricas:

```json
{"publico":{"path":"F:/SegSystem-Local/demo/rag/publico","rag_key":"publico"},"rh":{"path":"F:/SegSystem-Local/demo/rag/rh","rag_key":"rh"},"marcelo":{"path":"F:/SegSystem-Local/demo/rag/marcelo","rag_key":"marcelo"},"cliente_demo":{"path":"F:/SegSystem-Local/demo/rag/cliente","rag_key":"cliente","client_account_id":"UUID-REAL-DA-CONTA-DEMONSTRACAO"}}
```

Substituir o UUID antes de habilitar a raiz de cliente; alternativamente omitir essa entrada até a conta existir. Não há senha nesse JSON. Usar raízes separadas por área/conta, sem sobreposição; nunca F: inteiro, perfil do usuário ou pasta de segredos. Textos reais de contas diferentes precisam de pastas distintas. Limites: 100 arquivos, 100 diretórios, profundidade 5, 80 KB/arquivo, 20 mil caracteres/documento e 2 MB contabilizados por sincronização. Somente `.txt`/`.md` UTF-8.

7. Executar `npm run build` e iniciar pelos scripts operacionais existentes. Conferir logs sem compartilhar segredos. Não iniciar dois servidores na mesma porta.
8. Em TI, criar/revisar/publicar índice da área. Em Fontes em pastas, cadastrar nome, área, raiz permitida e pasta relativa (`.` para a raiz); selecionar a conta cliente correspondente. Sincronizar. Ler o relatório; novos documentos ficam em rascunho. Na curadoria, ler conteúdo/escopo, confirmar revisão e publicar explicitamente. Mudança do texto gera versão ligada à anterior; arquivar a antiga após decisão humana.
9. Testar com sessões separadas de RH, Marcelo e cliente; TI não recebe poderes de RH ou de consulta privada só por gerir conteúdo. Testar fonte ausente, Ollama desligado, ocupado, falha e negativa de acesso. Apenas depois considerar demonstração pronta. Não colocar dados reais nos documentos genéricos.

Rollback: parar aplicação; voltar ao SHA anterior não remove esquema/dados da 175. Se precisar restaurar estado completo, usar backup validado e procedimento próprio. Não executar DROP, apagar volume ou reescrever ledger para “voltar”. Guardar evidências fora do repositório. SMTP/hospedagem pública não fazem parte desta atualização.

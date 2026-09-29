# Pacote separado: homologação PostgreSQL **somente local** (não produção)

Este pacote é **diferente** de `seg-system-qa-local.zip` (prévia PGlite do site). Ele inicia um **PostgreSQL novo e descartável**, aplica migrações 001–096, cria identidades **exclusivamente fictícias** e disponibiliza um índice de módulos. **Não homologa automaticamente todos os 222 requisitos.** Este software é experimental: não inserir dados reais, nem liberar rede externa, nem executar carga, invasão ou testes destrutivos fora do cluster efêmero criado pelo runner.

## Iniciar no Windows

1. Pare a janela do pacote antigo com **Ctrl+C**; a porta **3000 deve estar livre**. Instale Node.js **22** com npm (e internet na primeira instalação); extraia este ZIP para pasta nova, sem copiar `.env` ou configurações do outro pacote.
2. Dentro da pasta, dê duplo clique em **`INICIAR-HOMOLOGACAO.bat`**. O preflight recusa porta 3000 ocupada **antes** de repetir `npm ci`; só então são aplicadas as migrações e iniciado o servidor. Se seu Windows impedir a inicialização do PostgreSQL embutido, a tela reportará erro: **não interprete como teste aprovado**. Compatibilidade Windows precisa ser verificada no seu equipamento.
3. Abra **http://127.0.0.1:3000/qa/modulos** (não use `localhost`, para não separar cookies). O terminal imprime, somente após iniciar o servidor, senhas aleatórias para TI, RH, Admin e Cliente A, e chave temporária legada de Marcelo. Não envie essas informações em chat nem as grave em relatórios. O cliente entra em `/cliente/entrar`; a página de módulos permite entrar como os demais.
4. **Ctrl+C** para parar; normalmente o runner encerra servidor/PG e exclui o próprio diretório temporário. Encerramento forçado/queda do Windows pode deixar resíduo no diretório temporário do sistema; nunca há deleção de banco preexistente. Se não abrir, confira que outra aplicação não ocupa a porta 3000 e execute novamente em extração limpa.

### Se aparecer `qa_port_3000_busy...` no Windows

Nenhum banco foi criado nesse ponto. Feche a **janela do pacote PGlite anterior** com **Ctrl+C**. Na pasta já extraída da homologação, abra o Explorador de Arquivos, digite `cmd` na barra de endereço e pressione Enter; execute `node scripts\qa-homologacao-local.mjs` para **reutilizar o `npm ci` que já terminou** (não precisa baixar novamente). Se a porta continuar ocupada, use `netstat -ano | findstr :3000` e `tasklist /FI "PID eq NUMERO_DO_PID"` para identificar o processo; **não encerre um PID desconhecido**. O comando `taskkill /PID NUMERO_DO_PID /F` só deve ser usado se você confirmar que é a janela do servidor antigo iniciada por você.

O aviso `npm warn install-scripts ... @embedded-postgres/windows-x64@17.9.0-beta.17` **não causou** a recusa de porta. Inspecionamos o tarball exato do lockfile: nesse pacote, `native/pg-symlinks.json` é `[]`, então o `postinstall` bloqueado (`hydrate-symlinks.js`) não possui links a criar no Windows. **Não aprove scripts globalmente, nem rode como administrador por causa desse aviso.** Se, depois de liberar a porta, o PostgreSQL apresentar outra falha, anote o erro sem compartilhar credenciais: compatibilidade Windows ainda não foi testada aqui.

No Linux/macOS: `bash INICIAR-HOMOLOGACAO.sh`; as mesmas limitações se aplicam. O binário PostgreSQL embutido é uma dependência npm `embedded-postgres`, não requer Docker; disponibilidade depende do SO/arquitetura. O servidor roda com Next em modo desenvolvimento **somente no loopback**, para permitir cookies locais HTTP. Não acesse a partir de outro dispositivo; não publique túnel/porta. E-mail, IA, integrações externas, proxy e PGlite são desativados. O runner recusa URLs de banco/serviço externo, `.env*` (exceto `.env.example`) e segredos administrativos preexistentes.

## Roteiro por módulo (IDs de caso, não novos requisitos)

| Caso / requisito relacionado | Papel, acesso, tarefa sintética | Estado / evidência mínima |
|---|---|---|
| `QA-HOM-001` / `PLT-MIG-001` | Runner cria banco `seg_qa_homologacao` em 127.0.0.1, migra 96/96 e cria contas A/B isoladas | Exigir `96/96`; se houver erro, **BLOQUEADO**. Só recorte do esquema, não prova de upgrade de dados reais. |
| `QA-HOM-002` / `SEC-04`, `SEC-05` | Entrar TI, RH e Admin (e-mail/senha individuais), Marcelo (chave aleatória legada), Cliente A (e-mail/senha); trocar papéis saindo da sessão | Registrar código da resposta e papel, **nunca cookies/chaves/senhas**. Marcelo ainda não possui conta staff individual nesse modelo; pendente. |
| `QA-HOM-003` / `TENANT-SEG-001` | TI/Marcelo: `/admin/leads` e `/admin/clientes`. RH: tentar `/api/admin/leads` e `/api/admin/client-accounts` → **403**; anônimo → **401** | Autorizações negativas são verificadas pelo smoke; uso funcional ampliado de CRM/clientes permanece pendente. |
| `QA-HOM-004` / `CLIENTE-SEG-001` | Cliente A: entrar em `/cliente/entrar`, seguir para `/cliente/app`; sua conta é só `QA Empresa A fictícia`. Conta B jamais deve aparecer; anônimo deve receber 401 | Recorte de isolamento verificado em smoke. Não use documentos ou dados reais. |
| `CRM-01..10` | `/admin/crm`: tentar cadastrar prospect **fictício** e registrar resposta | **Interface/APIs não homologadas**: cada ação depende de verificação manual e autorização por papel. |
| `HR-01..24`, `EMP-01..19` | `/admin/funcionarios`, `/admin/rh/assistente` | **Em modelagem/bloqueado**. Sem folha, ponto, IA privada ou validação trabalhista. |
| `ADM-01..12` | `/admin/marcelo` | **Protótipo descritivo**, sem dashboard funcional. |
| `PLT-01..18` (recorte TI) | `/admin/ti` | **Protótipo descritivo**, 21 componentes de TI ainda não conectados a este painel. |
| `CLI-14`, `PUB-07` | `/admin/portal`, `/admin/visual` | **Prévia visual** sem efeito de publicação/permissões. |
| `RAG-SEG-001` | `/admin/marcelo/assistente` | **Consultas privadas bloqueadas**, não homologar com dados reais. |

**Smoke automatizado (isolado):** após `npm ci` e sem outra aplicação na porta 3000, rode `node scripts/qa-homologacao-local.mjs --verify`. Ele cria um segundo cluster **novo**, aplica as 96 migrações, verifica login, autorização negativa RH/anônimo, acesso TI/Marcelo e escopo do Cliente A; encerra o cluster e não imprime senhas. Exit 0 valida apenas esses casos. Recomendados também `npm test`, `npm run typecheck`, `npm run build`, e para PostgreSQL independente `npm run test:migrations:pg`. Cada falha é **PENDÊNCIA**, não deve ser contada como sucesso.

Para o inventário de **222 requisitos** com estado não verificado/bloqueado, consultar `docs/RELATORIO-PENDENCIAS-COMPLETO.md`; não deduzir aprovação geral a partir de rota, build ou migração. Hipóteses CLT/convenção/Portaria 671, eSocial e fiscal devem ser analisadas por contador/advogado; não são regras homologadas por este pacote. Status de produção: **NO-GO**.

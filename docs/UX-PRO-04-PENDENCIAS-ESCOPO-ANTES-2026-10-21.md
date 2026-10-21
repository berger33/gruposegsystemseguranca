# UX-PRO-04 — pendências internas: escopo antes

**Data:** 21/10/2026  
**Base:** `main` / `origin/main` `b221d7a724c8fcfa2448ad014c7f12e58ab2b3f4`  
**Fatia:** somente a experiência montada em `/admin/pendencias` (`PendencyWorkspace`).

## Evidência e motivo

A rota está montada sob `AdminGate` e consome `GET /api/ops/pendencies`, `POST /api/ops/pendencies/sweep` e as transições existentes de leitura/arquivamento. O backend define uma caixa pessoal por identidade da sessão, com permissão para varredura, isolamento do destinatário, idempotência e auditoria nas mutações. Não alterarei essa fronteira nem os contratos.

A leitura estática do componente encontrou um estado vazio exibido antes de a primeira resposta chegar; falhas HTTP preservam os itens anteriores implicitamente, mas falhas de rede não são tratadas; status e criticidade são apresentados como enums técnicos; o campo de justificativa usa apenas placeholder; ações e dados têm hierarquia visual mínima. A página não mostra responsável porque a caixa já é filtrada pela identidade da sessão, nem possui um campo canônico de próxima ação separado do estado. A alteração ficará limitada a comunicar melhor os dados disponíveis sem inferir prazo, prioridade, responsável ou ação inexistentes.

## Escopo proposto

- Distinguir carregamento inicial, ausência confirmada, erro inicial, sucesso, atualização em andamento e erro de releitura; preservar dados anteriormente lidos numa falha de releitura, com hora e repetição.
- Tratar exceções de rede tanto na leitura quanto nas mutações e varredura, sem apresentar sucesso ou lista vazia falsos.
- Apresentar criticidade, datas e estado em português claro, identificando fonte e vencimento a partir dos campos já devolvidos pela API.
- Associar rótulo persistente à justificativa de arquivamento, explicitar o próximo passo válido conforme o estado e melhorar estrutura responsiva, foco e estados acessíveis.
- Preservar rotas, papéis, payloads, endpoints, isolamento por identidade, permissão `pendency.sweep`, chaves de idempotência, auditoria, persistência e semântica das transições.

## Riscos e contenções

- **Perda ou ocultação de dados:** manter o último resultado canônico visível durante releituras; nunca limpar a lista em falha; não mudar mutações.
- **Autorização mascarada:** não mover autorização para a UI nem mudar `AdminGate` ou as guardas da API; respostas negadas continuarão sem conceder acesso.
- **Recorte divergente:** não transformar a caixa pessoal em fila geral ou painel de todas as áreas; a identidade continua derivada da sessão no servidor.
- **Módulos compartilhados:** não alterar `AdminGate`, navegação, tokens globais ou componentes compartilhados nesta fatia.
- **Arquivos gerados:** conferir hashes/diff de `next-env.d.ts` e `tsconfig.json`; não regenerar inventário se a lista de rotas não mudar.
- **Evidência sintética:** qualquer fixture de navegador será explicitamente identificada como sintética, sem dados reais ou alegação de aceite humano.

## Validações planejadas

1. Adicionar primeiro teste focal de UI que falhe na `main` para carregamento-vazio prematuro, erro inicial/releitura, retenção de dados, rótulos de estado e justificativa acessível.
2. Implementar a correção mínima e executar o gate focal, `npm run test:pendencies:pg`, `npm run typecheck`, `npm test`, `npm run build`, QA estático, inventário e `git diff --check`.
3. Capturar/revisar em Chromium nos tamanhos 320/390/768/1440, tema claro/escuro e teclado se o ambiente permitir; separar evidência automatizada de inspeção estática e validação manual.
4. Conferir checks obrigatórios e revisão registrada antes de qualquer merge; se qualquer gate falhar ou ficar pendente, não abrir/mesclar PR nem avançar para outra fatia.

## Nota de execução — ambiente do gate

O teste focal inicial falhou nos quatro critérios contra a base, confirmando os estados ausentes. Na primeira execução de `npm run test:pendencies:pg`, o runner descartável do Windows inicializou PostgreSQL com `WIN1252`; a migração 014 foi recusada por conter um caractere não representável. A correção prevista é fixar `initdbFlags: ["--encoding=UTF8"]` no próprio runner, suportado pela biblioteca `embedded-postgres`. Isso não altera as asserções, os dados, o escopo de teste ou os portões; apenas faz o banco de teste usar a codificação já requerida pelo esquema do sistema. O gate será repetido integralmente após o ajuste.

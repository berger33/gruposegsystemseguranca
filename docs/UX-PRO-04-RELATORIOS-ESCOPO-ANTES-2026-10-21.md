# UX-PRO-04 — Relatórios periódicos: escopo antes

**Data:** 21/10/2026
**Base:** `main` / `origin/main` `2481c829ef8b6191abe93527e7d6ee205e813b56`
**Fatia:** somente a tela montada `/admin/relatorios` (`ReportsWorkspace`).
**Família distinta:** não inclui `/admin/analytics`, painel `/admin/marcelo`, pendências, nem os relatórios comerciais de outras rotas.

## Inspeção estática antes da implementação

A página está montada sob `AdminGate` com os papéis atuais `ti` e `admin`. O cliente usa a API canônica EXT-13 (`GET/POST /api/ext/reports/periodic`, detalhe `GET /api/ext/reports/periodic/:id` e ações `POST .../transition`, `.../generate`, `.../send`). O servidor decide `reports.read`/`reports.write`, mesma origem, destinatários ativos, transições, idempotência e auditoria. O relatório representa contagens de fontes internas fixas; “Registrar envio autorizado” é somente registro interno e não dispara e-mail externo.

Lacunas observadas no componente atualmente montado:

- A lista começa como `[]` e é renderizada como ausência confirmada antes da primeira resposta; erro inicial e lista vazia não têm estados visuais separados.
- Releitura não mantém um indicador visível nem informa a idade da última leitura; respostas com estrutura inesperada são convertidas implicitamente em vazio por `data.items || []`.
- Tipo, protocolo/estado e parte dos erros canônicos aparecem sem tradução; após uma ação, a mensagem pode afirmar que foi registrada sem explicar a fonte ou o limite do envio.
- O detalhe canônico é despejado como JSON técnico em `<pre>`, sem agrupar período, totais, fontes, eventos e destinatários.
- A tela usa estilos inline, sem composição local própria para responsividade/tema, e não há teste focal específico para os estados de leitura e apresentação da rota.
- Os botões “Aprovar” e “Registrar envio autorizado” enviam notas pré-preenchidas que atribuem a decisão a uma pessoa operadora sem exigir que ela escreva essa justificativa.

## Escopo proposto

- Distinguir carregamento, leitura concluída sem registros, falha inicial, sucesso, atualização e falha de atualização com dados anteriores preservados e horário da última leitura concluída.
- Validar a estrutura da resposta antes de substituir os últimos dados válidos; falhas de rede/HTTP ou payload inesperado nunca serão mostrados como lista vazia.
- Apresentar tipos, estados e datas de forma compreensível, sem transformar total ausente em zero não medido.
- Substituir o JSON bruto por uma apresentação legível dos campos canônicos disponíveis, identificando período, contagens e fontes, destinatários, registro interno de envio e trilha imutável sem alterar ou reinterpretar eventos.
- Em ações que exigem justificativa (`aprovado` e `send`), enviar somente o texto escrito por quem opera no formulário; nunca atribuir aprovação/decisão humana por nota fixa da interface.
- Usar CSS local para responsividade, temas disponíveis e foco visível, mantendo a rota e o gate atuais.
- Preservar todos os endpoints, métodos, payloads, cabeçalhos, `Idempotency-Key`, alçadas, permissões, fontes de dados, trilha de auditoria, persistência, destinatários autorizados e o limite de ausência de entrega externa.

## Riscos e contenções

- **Zero ou vazio falso:** nenhum `0` será produzido por falha, campo ausente ou leitura pendente; a tela informa a última leitura válida.
- **Dado desatualizado sem aviso:** uma falha transitória conserva a leitura anterior, mas a identifica como desatualizada e permite nova tentativa; 401/403 continua negando acesso e descartando dado protegido.
- **Alçada ampliada:** `AdminGate` segue `ti|admin`; nenhuma permissão server-side é substituída ou ampliada.
- **Falsa alegação de envio:** o texto continua informando que registrar envio é ação interna e que nenhum e-mail é disparado.
- **Trilha imutável:** dados de eventos são somente apresentados; não editar nem remover texto canônico armazenado.
- **Autoria da decisão:** notas obrigatórias ficam sob controle explícito da pessoa que executa a ação; a interface não pré-grava consentimento/aprovação nem cria aceites.
- **API/Idempotência:** preservar `Idempotency-Key` e os corpos/métodos aceitos; o gate PostgreSQL EXT-13 protege o contrato.
- **Arquivos gerados:** restaurar `next-env.d.ts` se alterado pelo build e manter `tsconfig.json` idêntico ao baseline; não inventar evidência visual real a partir de fixture.
- **Escopo/captura:** testes de navegador usam sessões e relatórios sintéticos; distinguir captura automatizada, inspeção estática e validação manual. Não alegar aceite humano, WCAG integral, operação externa ou homologação.

## Validações planejadas

1. Adicionar primeiro teste focal dos estados iniciais/vazio/erro/releitura, preservação fail-closed, rótulos e apresentação do detalhe; executar na base sem mudanças de UI para registrar RED quando o defeito for reproduzido.
2. Implementar apenas em `ReportsWorkspace` e CSS local; validar `npm run test:ext13-reports:pg`, teste focal, `npm run typecheck`, `npm test`, `npm run build`, QA estático, inventário e `git diff --check`.
3. Se o ambiente permitir, exercitar a rota montada em 320/390/768/1440 px, dia/noite e teclado com dados sintéticos, registrando `resumo.json`; inspeção de imagem automatizada não será chamada de validação manual.
4. Conferir hashes de `next-env.d.ts`/`tsconfig.json`; publicar PR pequena contra `main`; nenhum merge sem checks obrigatórios verdes e revisão concluída.

## Ajuste de validação registrado antes da alteração do gate

Na primeira execução local do `test:ext13-reports:pg`, o PostgreSQL descartável herdou `WIN1252` do Windows e falhou ao aplicar uma migração UTF-8 existente (byte `0xe2 0x86 0x92`); repetir com `PGCLIENTENCODING=UTF8` não mudou o locale do cluster. Antes de editar o gate, fica registrado o ajuste mínimo de portabilidade: inicializar esse cluster com `--encoding=UTF8 --locale=C`, conforme já feito pelo gate EXT-04. O teste e seus critérios permanecem integrais.

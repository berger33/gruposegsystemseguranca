# UX-PRO-03 — 10ª promoção com prova: reclamações de colaboradores

**Data:** 29/10/2026 · **Base:** `d7b09e173885ff0bb8a5c802f4da28da6b35ef26` (`main`, merge da PR #306) · **Branch:** `arena/e30676ab-gruposegsystemseguranca`.

**Natureza:** entrega local, com teste focal e cenário em PostgreSQL descartável + Chromium. Não é aceite humano, homologação nem autorização de produção. Produção permanece **NO-GO** (`docs/PRODUCAO-GATE.md`).

## 1. Escolha e inventário antes de codar

`EmployeeComplaintClient.tsx` era um dos **37 órfãos**: 96 linhas no inventário, cinco literais de API e zero literais sem despacho. Foi escolhida uma única família, delimitada e recomendada para esta fatia. Não existe rota de reclamação administrativa em `src/app/admin/`; `/cliente/app/reclamacoes-colaborador` é **outro consumidor**, no portal do cliente, com sessão e escopo próprios. Portanto, não é o caso de uma lacuna numa rota administrativa já viva.

| Contrato administrativo conferido no despacho | Métodos utilizados | Papel existente |
|---|---|---|
| `/api/admin/employee-complaints` | GET, POST, PATCH | `admin|ti` leem/criam/atualizam; `rh` lê e está previsto no PATCH; demais papéis recebem 403 |
| `/api/admin/employee-complaints/:id` | GET | `admin|ti` recebem o detalhe; `rh` recebe 404 se não compartilhada e, quando compartilhada, projeção mínima |
| `/api/admin/employee-complaint-messages` | GET, POST | `admin|ti|rh`, com `is_hr_visible` para leitura pelo RH |
| `/api/admin/employee-complaint-evidences` | GET, POST | `admin|ti|rh`, com `is_hr_visible` para leitura pelo RH |
| `/api/admin/employee-complaint-hr-shares` | GET, POST | `admin|ti`; RH recebe 401 nessa rota estrita |

A API verifica mesma origem e sessão. O papel de **RH é legítimo nesta área**, não uma permissão genérica: o servidor o nomeia em quatro handlers, concede projeção própria e permite mensagem/evidência. O console `/admin/ti` já é protegido por `AdminGate ['ti','admin']`: a nova aba é **mais estreita que a API**, não uma decisão de retirar acesso ao RH. Foi medido: RH **200** na listagem da API, **404** no detalhe não compartilhado, **200** no detalhe compartilhado, **201** ao enviar mensagem, mas não vê a aba nem entra no console. Comercial recebe **403** na leitura e no PATCH e também não vê a aba. O canal do cliente e o RBAC não foram alterados.

## 2. Sonda real e achados antes/depois

Sonda temporária dentro do repositório, com migrações 001–181 em PostgreSQL descartável `seg_qa_*`, servidor HTTP real, sessões individuais e somente dados sintéticos. A sonda e seu diretório de build foram removidos. Nenhuma rota respondeu 410 nos métodos examinados.

| Requisição / prova | Antes | Depois | Causa ou limite |
|---|---|---|---|
| `GET` lista, TI / RH / comercial | 200 / 200 / **403** | 200 / 200 / **403** | Papéis preservados; RH vê apenas relatos compartilhados na lista |
| `GET` detalhe não compartilhado, TI / RH | 200 / **404** | 200 / **404** | RH não recebe o relato completo por esta leitura |
| `POST` reclamação, TI | **201**, hash da referência `null` | **201**, hash SHA-256 com 64 caracteres | `require()` dentro de módulo ESM falhava e era engolido; o texto original continua armazenado no campo existente |
| `PATCH` situação, TI | **500 `internal_error`** | **200**, situação e histórico gravados | PostgreSQL **42P08**, `inconsistent types deduced for parameter $2`; enum explicitamente tipado apenas no caminho `admin|ti` |
| `POST` mensagem com `complaint_id` apenas no corpo | **400 `invalid_message`** | **201**, corpo e vínculo confirmados | O stream JSON era lido duas vezes. A leitura única preserva também a variante com query, já funcional (**201 → 201**) |
| `GET/POST` evidências, TI | **200/201** | **200/201** | São metadados, não upload de arquivo |
| `GET/POST` compartilhamentos, TI | **200/201** | **200/201** | Rota estrita `admin|ti` preservada |
| `GET` detalhe após compartilhar, RH | **200** | **200** com envelope mínimo, sem descrição/referência/conta/título | Mensagens e evidências só aparecem no detalhe se marcadas como visíveis ao RH |
| `PATCH` situação, RH | **500 `internal_error`** | **500 `internal_error`** | Débito não corrigido por causa do conflito de autorização abaixo; nenhuma situação alterada na prova |

### 2.1 Conflito de autorização que exige decisão do proprietário

Uma tentativa **temporária, só no cluster descartável**, de corrigir o enum indiscriminadamente mudou o PATCH do RH de 500 para **200** mesmo para reclamação **não compartilhada** e devolveu a linha inteira, inclusive descrição e referência em texto claro. Esta tentativa **não foi entregue**. O handler existente seleciona pelo ID sem conferir `is_shared_with_hr` e usa `RETURNING *`; restringir a operação ou mudar sua resposta exigiria decisão explícita sobre permissões e contrato. A correção entregue do enum é, por isso, **exclusiva para `admin|ti`**, sem mudar o SQL legado de RH. O erro do RH permanece aberto, é visível na própria tela e foi provado também no gate. Pergunta ao proprietário: **o RH deve poder atualizar somente relatos compartilhados e receber a mesma projeção mínima, ou qual matriz/contrato compatível deve valer?** Nenhuma solução de RBAC foi presumida.

As consultas separadas de mensagens/evidências verificam `is_hr_visible` de cada item; diferentemente do detalhe, **não verificam `is_shared_with_hr` da reclamação**. Isso é comportamento existente, não foi alterado e deve entrar na decisão de privacidade/autorização. O `auditLog` administrativo é uma tentativa fora da transação e captura falhas; não há prova de atomicidade da auditoria nessa via.

## 3. Antes e depois da interface

O protótipo órfão confundia erro com lista vazia, não verificava status de leitura, exibia códigos crus de erro, usava `any` e estilos inline e não protegia respostas fora de ordem. A **23ª aba** `Reclamações de colaboradores`, no grupo Acesso e governança, monta `EmployeeComplaintClient` e preserva os campos, os cinco contratos, abertura de reclamação, as duas transições, mensagem, referência de evidência e compartilhamento mínimo justificado.

A tela tem leitura inicial, sucesso, negado e erro distintos, vazio honesto, estado próprio do detalhe com retry, `aria-busy`, `role="status"`/`role="alert"`, duas sequências independentes, rejeição de arrays malformados, motivos traduzidos sem ecoar texto cru do servidor e `parseDateOnly` para prazo. Selecionar outro relato ou reler a lista descarta detalhe e rascunhos anteriores. Todos os campos têm rótulo associado; CSS module usa tokens, foco visível e breakpoints 900/650. Não usa diálogos nativos.

**Limites escritos na tela:** leitura administrativa global sem escopo automático por conta; referência em texto claro **e** hash; anonimato é declaração e não apaga referências; não faz upload nem verifica bytes; RH não acessa este console; PATCH do RH pendente; auditoria administrativa não é transacional; necessidade de parecer jurídico, privacidade, aceite humano e **NO-GO**. O endereço de evidência é texto, não link de download ou prova de arquivo.

## 4. Prova antes/depois

| Critério | Antes | Depois |
|---|---|---|
| Aba real montada | órfã | 23ª aba, `dynamic()` e renderização no `TiConsole`, sem remover abas existentes |
| Papel nomeado no servidor | `admin|ti|rh` conforme método; compartilhamento estrito `admin|ti` | os mesmos papéis; diferença RH API × UI medida, sem ampliar o gate de TI |
| Teste focal nomeado pela área | inexistente | `tests/ux-pro-03-ti-reclamacoes-colaboradores-ui.test.mjs`, **RED 0/8 → GREEN 8/8**, incluído explicitamente no `test:unit` |
| Cenário no gate do portal | inexistente | HTTP/PostgreSQL + Chromium: papéis, 403 × aba ausente, RH legítimo e projeção mínima, POST/PATCH com status e corpo, A/B sem resíduo e respostas fora de ordem, 503/retry, 403, payload inválido e 320/390/768/1440 sem transbordo |
| Relatório próprio | inexistente | este documento |
| Registro manual | 9 entradas | 10 entradas em `PROMOCOES_COM_PROVA`; `EXPECTED_TABS` 22 → 23 |

O cenário novo passou **1/1 isolado**, com migrações aplicadas em cluster temporário e descartado. Injeções de 503/403/payload inválido e atrasos são restritas a `window.fetch` no navegador de teste; as provas de papéis e as escritas usam servidor e PostgreSQL reais. Não há dado real, captura de segredo ou alteração de permissão.

## 5. Inventários e limitações

- Inventário de TI regenerado: **84 componentes**, **23/23 abas com prova**, **37 → 36 órfãos**, **9 → 10 promoções**, 25 workspaces, 402 literais e **0 sem despacho**.
- Índice de 222 regenerado: **20 `a_revalidar` sem gate**, **23 `gate_nomeado`**, **0/222 aceite humano** e 0/222 reauditorias integrais. O teste é nomeado pela área, não pelo identificador de requisito; nenhuma contagem de aceite foi promovida.
- Nenhuma migração criada ou alterada; 001–181 continuam imutáveis e a próxima livre é 182. Nenhuma rota, papel, permissão, campo ou contrato existente foi removido.
- Sem upload real, anonimização, escopo automático por conta para a via administrativa, garantia transacional da auditoria, revisão jurídica, leitor de tela, UAT ou Windows real. O canal de cliente continua independente.
- Backup real, PITR/RPO/RTO, F02, B2 e provedores continuam pendências do proprietário; não foi escolhido provedor.

## 6. Bateria de verificação (29/10, nesta sandbox)

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1211/1211**, 0 falhas, 0 skips |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm run test:unit` | **1211/1211**, 0 falhas, 0 skips; **157** arquivos explícitos |
| `npm run typecheck` | **0 erros** |
| `npm run build` | **106/106** páginas |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| Inventários de TI / 222 / rotas `--check` | **OK** — 23 abas / 10 promoções; 222 IDs / 20 `a_revalidar` sem gate; 101 rotas |
| `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | **OK** |
| `npm run reaudit:sec` | **35/35** âncoras, 3 artefatos |
| `npm audit --audit-level=moderate` | **0 vulnerabilidades** |
| Cenário novo isolado | **1/1** em PostgreSQL descartável + Chromium |
| `node scripts/qa-ux-portal-postgres.mjs` | **47/47** em PostgreSQL descartável + Chromium, 0 skips (era 46/46) |
| `git diff --check` | limpo |
| `next-env.d.ts` / `tsconfig.json` | `1862ac4b…` / `2128c956…`, preservados |
| Migrações | nenhuma criada ou alterada; 001–181 imutáveis, próxima livre 182 |

Os logs integrais da bateria são anexados em comentários da PR, divididos por limite de tamanho. As provas de navegador usam exclusivamente massa sintética; não substituem revisão manual, UAT ou aceite.

# UX-PRO-06 — estados de leitura da lista de contratos (`/admin/contratos`)

**Base:** `main` `259ee43c38deeb35fb29a2c622f2ed3e6f6a6712` (merge da PR #214, conferido por
`git fetch` antes de editar).
**Escopo registrado antes de tocar em tela:** [`UX-PRO-06-CONTRATOS-ESCOPO-2026-10-14.md`](UX-PRO-06-CONTRATOS-ESCOPO-2026-10-14.md)
(commit `12d4fe2`).
**Superfície desta PR:** a tela `/admin/contratos` — "Contratos e implantação" — a lista da
carteira contratual da família CRM/comercial interna. Não é a conclusão de UX-PRO-06.

**Fora desta PR, deliberadamente:** `/admin/contratos/[id]` (detalhe com 6 abas — fatia própria,
próxima candidata); `/admin/comercial`, `/admin/crm`, `/admin/leads`, `/admin/carteira` (entregues
nas PRs #210–#214, não reabertas nem reimplementadas); `/admin/clientes` (família distinta); o
portal `/cliente/app/*` (área separada); `UiWorkspace.module.css` (32 consumidores — não tocado);
`contract-request.ts` e `contract-vocabulary.mjs` (intactos); APIs, papéis, permissões e dados
canônicos — nenhum tocado.

## Antes (medido em `259ee43`, worktree descartável limpo, resumo legível por máquina em
[`antes/antes-gate-259ee43.json`](ux-pro-06-contratos-evidencias/antes/antes-gate-259ee43.json))

Suíte nova do gate `test:ux-crm:pg` (7 casos da fatia) rodada contra a `main`, sem nenhuma edição
de tela: **5 passaram e 2 falharam**. Os cinco que passaram são preservações medidas (contrato
HTTP e recorte por papel, primeira leitura que falha sem virar ausência, 320/390/768 px + tema
noturno, teclado, evidência própria sem transbordo).

| # | Caso | Resultado na `main` |
|---|---|---|
| 1 | API: sessão, papel e recorte pessoal da lista | passa (preservação) |
| 2 | Falha na releitura: mantém a lista, avisa com hora, repete | **falha** — `[data-testid="contratos-desatualizado"]` nunca aparece (timeout) |
| 3 | Releitura em curso: tabela visível com `role="status"` | **falha** — `[data-testid="contratos-atualizando"]` nunca aparece (timeout) |
| 4 | Primeira leitura de propostas que falha não é ausência | passa (preservação) |
| 5 | Sem transbordo em 320/390/768 px + tema noturno | passa (preservação) |
| 6 | Teclado percorre navegação e formulário, foco visível | passa (preservação) |
| 7 | Evidência própria 320/390/768/1440, dia/noite, teclado | passa (preservação) |

(O log bruto não é versionado porque `*.log` é ignorado pelo repositório; o `resumo.json` da
subpasta `antes/` carrega os sete resultados, os erros e o método.)

**Causa verificada no código:** nas três leituras (`carregarEmpresas`, `carregarPropostas`,
`carregarContratos`) o caminho de falha fazia `itens: []` — **uma releitura que falha apaga a
lista já lida** — e `carregando: true` substituía o conteúdo por bloco cheio. Era a mesma família
de defeito corrigida no funil (#212), na carteira (#213) e no comercial (#214), atingindo aqui o
caminho real "criou contrato → a releitura da lista falhou": o registro recém-criado e tudo o que
já estava lido sumiam juntos. Não havia como distinguir "dados possivelmente desatualizados" de
"nunca houve leitura concluída". A negativa de autorização também oferecia repetir a mesma
chamada (`canRetry` verdadeiro para `auth`), divergindo do fail-closed já entregue nas irmãs.

## Depois

Na branch, **a suíte inteira do gate passa: 45/45, 0 pulados** (37 pré-existentes + 8 da fatia).

- **Falha na releitura preserva o que já foi lido.** Se já existiu leitura concluída
  (`lidoEm !== null`) e a falha não é de autorização, as três leituras mantêm seus itens e exibem
  uma faixa `role="alert"` — `contratos-desatualizado`, `empresas-desatualizado`,
  `propostas-desatualizado` — com o motivo real (`contract-vocabulary`), a hora da última leitura
  concluída (relógio do navegador no instante do sucesso; nada estimado nem gravado), o aviso de
  que dado antigo não significa lista vazia e o botão "Tentar novamente" quando o erro permite
  repetição. Ao repetir com sucesso, a faixa sai e a lista volta a acompanhar o servidor
  ([captura](ux-pro-06-contratos-evidencias/desktop-contratos-desatualizada.png)).
- **Releitura em curso mantém o conteúdo visível.** Com leitura concluída, a recarga mostra um
  indicador `role="status"` (`contratos-atualizando`, `empresas-atualizando`,
  `propostas-atualizando`) sem esconder a tabela/opções; o bloco cheio ("Lendo contratos…")
  continua a existir apenas quando ainda não há nenhuma leitura concluída.
- **Autorização continua falhando fechada.** Falha `denied`/`auth` não preserva nada: substitui o
  conteúdo pelo estado negado completo e não oferece repetir a mesma chamada
  (`retryLabel`/`onRetry` agora só existem para `kind === "retry"`). Dúvida de autorização nunca é
  mascarada por dado preservado.
- **Empresas, propostas e lista seguem o mesmo padrão**, porque são as três leituras da mesma
  tela — igual ao funil, que trata empresas e oportunidades juntas (#212).
- **Estilos.** As duas classes de estado ficaram em módulo local novo
  (`Contratos.module.css`), com os mesmos tokens de aviso da carteira (`--ux-color-warning*`,
  `--ux-color-brand`, `--ux-color-surface`). Nenhum valor de cor fixo; nenhum componente
  compartilhado alterado.

Preservado sem alteração: `AdminGate allowedRoles={["marcelo","admin","comercial"]}`; as URLs,
métodos e corpos de `GET /api/crm/companies?type=client`, `GET /api/crm/proposals?status=aceita&limit=100`,
`GET`/`POST /api/crm/contracts` (incluindo `request_key` idempotente e criação restrita a
`marcelo | admin`); os títulos "Contratos e implantação" e "Cadastro manual identificado" (contrato
do gate herdado `tests/l05-delivery.integration.test.mjs`); a navegação "Comercial · Empresas e
funil"; o vocabulário de situação/origem; a tabela com rolagem contida e o link por linha para o
detalhe.

## Preservações e escopo técnico

Nenhuma rota, método, payload, cabeçalho, papel do `AdminGate`, permissão, transição de estado,
trilha de auditoria, regra de negócio ou contrato de API foi alterado. A mudança é de
apresentação e de higiene de verificação:

- os papéis continuam `marcelo | admin | comercial` (recorte pessoal de `comercial` intacto —
  reafirmado pelo teste novo nº 1);
- nenhuma migração foi criada; nenhum dado novo é gravado;
- os estados de erro/vazio/carregado/negado pré-existentes (UX-07) seguem existindo e sendo
  exercitados pelos testes originais do gate `test:ux-contract:pg` (8/8 na branch);
- `UiWorkspace.module.css`, `contract-request.ts`, `contract-vocabulary.mjs`, `UiState`, `UiBadge`
  — intactos; a tela ganhou apenas `src/app/admin/contratos/Contratos.module.css`;
- `next-env.d.ts` (`18b697c4…`) e `tsconfig.json` (`2128c956…`) conferidos por hash após cada
  execução; o `npm run build` alterou `next-env.d.ts` numa execução e o arquivo foi restaurado do
  Git (comportamento já registrado pela PR #214).

## Verificações

| Check | Resultado |
|---|---|
| `npm run typecheck` | aprovado (EXIT 0) |
| `npm test` | **933/933**, 0 pulados (após regenerar os CSVs) |
| `npm run build` | aprovado (EXIT 0) |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK com o par vigente de CSVs regenerado |
| `npm run test:ux-crm:pg` | **45/45**, 0 pulados (37 pré-existentes + 8 novos) |
| `npm run test:ux-contract:pg` | **8/8**, 0 pulados |
| `npm run test:l04-delivery:pg` | **20/20**, 0 pulados |
| `next-env.d.ts` / `tsconfig.json` | restaurados; hashes conferidos |

**Antes/depois da mesma suíte:** com os 7 casos da fatia aplicados ao worktree de `259ee43`,
**2 falhavam** (os que medem o defeito; log e capturas em
[`antes/`](ux-pro-06-contratos-evidencias/antes/)). Na base corrigida, a suíte completa passa.

## Evidência própria

Pasta [`ux-pro-06-contratos-evidencias/`](ux-pro-06-contratos-evidencias/) com `resumo.json`
legível por máquina (formato `entries[]` do inventário): capturas 320/390/768/1440 px em dia e
noite (`320-dia.png` … `1440-noite.png`), `390-dia-teclado.png` com o percurso de Tab e o foco
visível, `desktop-contratos.png`, `desktop-contratos-desatualizada.png` (falha na releitura com a
lista preservada e a faixa de alerta), `desktop-propostas-falha-inicial.png` e as medições de
largura (`contratos-320/390/768[-noturno].png`). **Nenhum transbordo de documento em nenhuma
captura** (`transbordoDocumentoPorCaptura: "nenhum"`). As capturas de outras execuções da suíte
ficaram fora da pasta; as do checkout de `259ee43` estão em `antes/` e **não são evidência
vigente** (`antes/` não é lido pelo gerador, igual às fatias anteriores).

Massa 100% sintética (empresas `client` e contratos manuais criados pelas mesmas APIs com
`origin_details` declarando massa de teste; papéis `marcelo` e `comercial` provisionados pelo
gate). Nenhuma credencial, dado pessoal ou URL efêmera em captura, log ou documento.

## CSVs do inventário

O par vigente de 13/10 foi regenerado pelo próprio gerador porque o `resumo.json` desta fatia
altera a linha `/admin/contratos` (viewports 320×844 e 768×1024 passam a existir; a coluna de
evidência passa a citar o estágio `ux-pro-06-contratos`; `estados_erro` passa a `sim` porque a
tela agora declara estado de erro exercitado em navegador). **Conferência por diff: nenhuma outra
linha mudou**; os CSVs de 10/10 permanecem como registro histórico.

## Limitações

- A faixa "atualização falhou" usa o relógio do navegador no instante do sucesso da leitura; não
  há servidor de tempo nem campo novo em banco.
- Enquanto a faixa estiver visível, a lista exibida é a da última leitura concluída — o contrato
  recém-criado pode não estar nela; a faixa diz isso, e a repetição atualiza de verdade.
- O texto estático da matriz "tema noturno sem captura" é fixo do gerador e não interpreta o
  `resumo.json`; a captura noturna desta fatia existe e está registrada no `resumo.json`.
- A medição de 320/390/768 px reconfirma após o reflow do resize; overflow real (persistente)
  continua reprovando o teste.
- **A tela de detalhe `/admin/contratos/[id]` não foi tratada** (8 leituras próprias já com
  `Promise.allSettled` desde a UX-07; estados de releitura e varredura visual 320/768 ficam para a
  fatia própria, junto com os componentes de domínio `src/app/admin/ti/*` que ela compartilha).
- O navegador Chromium roda de forma automatizada com massa sintética. Isso **não** é validação
  manual por pessoa nem aceite de Marcelo, Andreia, comercial ou cliente — nenhum registro de
  aceite humano foi criado.
- Não foram testados envio real de e-mail, HTTPS hospedado, Windows ou o banco do operador.

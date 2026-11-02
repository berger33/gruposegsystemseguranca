# UX-PRO-03 — 12ª promoção "com prova": CLI-09..14 no console de TI

**Data:** 31/10/2026 (America/Sao_Paulo)
**Base:** `3ebdef50df83be6991d7929c82713fd6b24df4c5` (`origin/main`, merge da PR #323)
**Branch:** `arena/3f450206-gruposegsystemseguranca`
**Fatia:** uma família por PR — `CliFinanceClient` deixa de ser órfão e passa a montar o console CLI na aba **Financeiro do portal** do `TiConsole`.
**Natureza:** promoção com prova (focal RED→GREEN + mutações + cenário de navegador).
**Não** é aceite humano, **não** é homologação e **não** marca item de produção.

---

## 1. O que foi entregue

| Item | Antes | Depois |
|---|---|---|
| `CliFinanceClient.tsx` | **órfão** (230 linhas, `style` inline, 8 leituras com `.catch(()=>({…:[]}))`, tudo em `/api/hr/cli-*`) | **aba 25** do `TiConsole`, 371 linhas, 8 leituras com estado por bloco, 9 escritas preservadas, todas em rota canônica |
| `cli-finance-load.ts` | não existia | módulo puro: `BLOCOS`, `classificarResposta`, `agregarLeitura`, `traduzirErroEscrita`, `validarMotivo` |
| `CliFinanceClient.module.css` | não existia (estilo inline com `#6a6`/`#efe`) | CSS module por tokens, `:focus-visible`, breakpoints 900/740 px, zero hex |
| `TiConsole.tsx` | 24 abas | **25 abas** (`cli_financeiro`), grupo *Financeiro e cadastros*, sem remover aba nem grupo |
| `tests/ux-pro-03-ti-cli-financeiro-ui.test.mjs` | não existia | focal **13/13** (RED por ausência do módulo → GREEN 13/13; 4 mutações detectadas) |
| `tests/ux-pro-03-ti-reaudit.test.mjs` | `EXPECTED_TABS = 24` | `25` (o atrito que a guarda impõe a toda nova aba) |
| `scripts/ux-pro-03-ti-inventory.mjs` | 11 promoções | **12 promoções** com relatório; órfãos 34, abas 25/25 com prova |

## 2. Por que esta família

O `CliFinanceClient` era o **maior órfão funcional** do diretório de TI: 230 linhas cobrindo CLI-09..14 (cobranças fiscais, serviço adicional → CRM, satisfação e plano de ação, comunicação de renovação, modos de entrada, pedidos de acesso, eventos de segurança e troca de e-mail), **sem nenhum importador**. Na prática, nove capacidades já testadas no servidor não tinham superfície administrativa.

Promover sem sanear seria pior do que não promover: o componente falava com os oito endpoints pelos **aliases `/api/hr/cli-*`**, que passam pela borda legada de RH (`employees.read`) e respondem **403 para `ti`** — o papel que monta esta tela. E engolia cada falha com `.catch(()=>({…:[]}))`, então a tela mostraria "nada aqui" para uma negação de acesso. Ligar isso ao console teria entregue uma aba que mente.

## 3. O que mudou

### 3.1 Rotas: alias preso → canônico alcançável

| Bloco | Antes (403 para `ti`) | Depois (despachado e autorizado) |
|---|---|---|
| cobranças | `/api/hr/cli-charges-v2` | `/api/cli/charges-v2` |
| serviço adicional | `/api/hr/cli-service-requests` | `/api/cli/service-requests` |
| satisfação | `/api/hr/cli-satisfaction-surveys` | `/api/cli/satisfaction-surveys` |
| plano de ação | `/api/hr/cli-satisfaction-action-plans` | `/api/cli/satisfaction-action-plans` |
| renovação | `/api/hr/cli-renewal-communications` | `/api/cli/renewal-communications` |
| modos | `/api/hr/cli-portal-mode-configs` | `/api/cli/portal-mode-configs` |
| pedidos de acesso | `/api/hr/cli-portal-access-requests` | `/api/admin/portal-access-requests` (canônico da fatia UX-PRO-06) |
| segurança | `/api/hr/cli-security-events` | `/api/cli/security-events` |
| troca de e-mail | `/api/hr/cli-email-change-requests` | `/api/cli/email-change-requests` |

Nenhum alias antigo foi removido ou afrouxado: a borda de RH continua exigindo `employees.read|write` para os `/api/hr/...`, e a guarda focal verifica que nenhuma rota do console cai lá.

### 3.2 Leitura honesta (o defeito central)

`classificarResposta` distingue **cinco** situações por bloco, em vez de duas ("tem lista" / "não tem"):

- `ok` — lista com itens;
- `vazio` — `[]` legítimo;
- `negado` — 401/403: mensagem diz que a lista **não está vazia, está indisponível**;
- `falha` — rede, 404, 5xx;
- `invalido` — corpo sem a lista, lista de outro tipo, item malformado.

`agregarLeitura` resume os oito blocos: hora da leitura, quantos foram lidos, negados, falhas, inválidos, vazios, e `completo` **só** quando todos foram lidos. A faixa (`role="alert"`, `data-testid="clifin-faixa"`) aparece quando há negativa ou falha e traz "Tentar de novo"; a leitura tem referência de sequência (resposta fora de ordem não sobrescreve a mais nova) e o botão "Atualizar" fica travado com `aria-busy` durante a leitura.

### 3.3 Escrita honesta

`traduzirErroEscrita` mapeia 15 códigos do servidor para pt-BR (motivo 10–500, `autocadastro_never_releases_contracts`, `audit_unavailable`, `request_already_decided`, `verified_link_required`, …) e nunca publica o código cru; erro desconhecido de 5xx vira "o servidor falhou ao gravar, nada foi confirmado". Cada botão declara o próprio estado ("Registrando…", "Gravando…", "Confirmando…") e bloqueia durante a escrita.

Duas escritas passam a validar o motivo **antes** de enviar (`validarMotivo`, 10–500 pós-`trim`): a mudança de modo — que o handler sempre exigiu (`reason_10_500`) e o protótipo **nunca enviava**, ou seja, aquela escrita só podia falhar — e a decisão de pedido de acesso.

## 4. Prova

### 4.1 Focal — `tests/ux-pro-03-ti-cli-financeiro-ui.test.mjs`

```
RED  (módulo ausente, estado da base) → # tests 1  # pass 0  # fail 1  (o arquivo não carrega)
GREEN                                → # tests 13 # pass 13 # fail 0
```

Quatro mutações, todas detectadas e revertidas do backup (`sha256sum -c` OK):

| Mutação | Detectada em |
|---|---|
| 403 classificado como `vazio` (falha aberta de volta) | `not ok 2` **e** `not ok 8` |
| `agregarLeitura` sempre `completo: true` | `not ok 8` |
| cobranças de volta para `/api/hr/cli-charges-v2` | `not ok 11` |
| aba `cli_financeiro` removida do `TiConsole` | `not ok 12` |

### 4.2 Inventário reproduzível

```
node scripts/ux-pro-03-ti-inventory.mjs --check
OK: … 84 componentes; 12 promocao(oes) com relatorio.
abas 25 · console 25/25 com prova · órfãos 34 · promocoesComProva 12 · todasMontadas true
```

### 4.3 Navegador

Cenário novo no gate do portal (`tests/ux-portal-workspace.integration.test.mjs`), com sessão `ti` real: medições, estados e capturas em `docs/ux-pro-03-cli-financeiro-evidencias/`.

## 5. Limites declarados

1. **Sem aceite humano, sem homologação, sem UAT:** produção **NO-GO**, **0/222**.
2. **Sem leitor de tela e sem Windows:** teclado, foco e contraste medidos só no Chromium empacotado.
3. **A aba depende de dados reais:** sem conta/contrato na base, as listas vêm **vazias de verdade** (e a tela diz isso), não com dados de exemplo.
4. **Sem SMTP:** a troca de e-mail gera token e o vincula ao pedido; **nenhum e-mail sai**. O token aparece na lista porque o produto ainda não tem provedor.
5. **A fila de pedidos é global do módulo**, não escopada por conta — igual à tela `/admin/portal/solicitacoes`.
6. **`AdmAdvancedClient`, `AstClient`, `AstAdvancedClient`, `CmsClient`, `CatalogClient`, `CliClient`, `CommissionClient` e o resto dos 34 órfãos continuam órfãos.** Esta fatia promoveu **um** componente.

## 6. Reconciliação

- `origin/main` na base: `3ebdef5…` (merge da #323). A **#324** segue **aberta, sem merge**; esta fatia não a mergeou, não a fechou e não a reescreveu.
- Inventários regenerados **somente** pelos geradores aprovados (`ux-pro-03-ti-inventory.mjs`, `ux-pro-00-inventory.mjs`, `requisitos-222-inventory.mjs`).
- `test:unit`: **164 → 165** arquivos; `EXPECTED_TABS` **24 → 25**; promoções **11 → 12**.

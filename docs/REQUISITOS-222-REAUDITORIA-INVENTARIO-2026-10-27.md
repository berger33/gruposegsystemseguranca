# Reauditoria da matriz de 222 IDs — inventário reproduzível (27/10/2026)

**Estado:** primeiro passo entregue localmente. **Isto NÃO É ACEITE**, não é
reauditoria integral por jornada/papel e não muda o status de nenhum requisito.
Produção segue **NO-GO**; **0/222 IDs com aceite humano**.

## 1. O problema

A única fotografia integral dos requisitos é
`docs/STATUS-ATUAL-CONSOLIDADO.md`, um documento **histórico de 04/10/2026**
com 14 tabelas e **222 IDs únicos**. A auditoria de 26/10 registrou que
**46 desses IDs estavam `a_revalidar`** e que **nunca houve uma reauditoria
integral** — pré-requisito do aceite final (F16). Na prática, não havia como
responder "onde está a evidência do PLT-03?" sem ler 391 documentos à mão.

## 2. O que foi entregue

Um **índice reproduzível**, não um veredito:

| Artefato | Papel |
|---|---|
| `scripts/requisitos-222-inventory.mjs` | gerador determinístico com `--check` |
| `docs/REQUISITOS-222-INVENTARIO-2026-10-27.csv` | 222 linhas, uma por ID, com classe de evidência e arquivos |
| `docs/REQUISITOS-222-INVENTARIO-2026-10-27.json` | resumo + 222 objetos com contagens e listas de arquivos |
| `tests/requisitos-222-inventory.test.mjs` | 6 testes; executa `--check` dentro do `npm test` |

**Não foi criado workflow novo**: a guarda já roda em todos os workflows que
executam `test:unit`. Isso evita inflar a matriz de rotas com um gate que não
prova rota alguma. Workflows seguem **49**.

### Método

Uma única passada por **1.628 arquivos** de `tests/`, `.github/workflows/`,
`docs/`, `src/` e `scripts/`. `STATUS-VIGENTE.md`, a auditoria de 26/10, a
fotografia de 04/10 e os artefatos desta fatia são **excluídos** — são
meta-estado, não prova de requisito, e evitam auto-referência. De cada arquivo o gerador extrai todos os IDs com
`/\b([A-Z][A-Z0-9-]*-\d+)\b/gi` e cruza com os 222 IDs da matriz. A própria
fonte, os artefatos gerados, o gerador e esta guarda são **excluídos** da
varredura, para não virarem auto-evidência. O gerador leva ~0,5 s.

Cada ID recebe uma `classe_evidencia_atual` **conservadora**:

| Classe | Significado | IDs |
|---|---|---|
| `gate_nomeado` | o ID aparece no **nome** de um teste/workflow | **23** |
| `mencionado_em_gate` | o ID é citado no **conteúdo** de um teste/workflow | **114** |
| `somente_documento` | só há citação em documentos | **85** |
| `somente_codigo` / `sem_evidencia_legivel` | — | **0** |

> **Recontagem E23 (30/10/2026):** a tabela acima já não é a fotografia de 27/10
> (21/109/92): são os números do **JSON vigente**, recontados a partir de
> `docs/REQUISITOS-222-INVENTARIO-2026-10-27.json` e reproduzíveis por
> `node scripts/requisitos-222-inventory.mjs --check`. A diferença vem do mapa SEC
> (28/10) e das fatias de UI do CLI-02/03/05–10 e do PLT-10, cada uma com relatório
> próprio. `somente_codigo` e `sem_evidencia_legivel` seguem em **0**. Este texto
> **não** é ajustado à mão: `tests/requisitos-222-inventory.test.mjs` compara as
> contagens e o núcleo duro abaixo com o JSON e falha na primeira divergência.

> **Aviso central:** "mencionado em gate" **não é prova de jornada**. Um ID pode
> ser citado num assert de vocabulário e ainda assim não ter jornada, RBAC,
> A/B, erro/vazio ou aceite. A classe só diz **onde procurar**.

## 3. Números que a fatia revelou

| Métrica | Valor |
|---|---|
| IDs únicos | **222** (14 famílias: ADM, AI, AST, CLI, CON, CRM, EMP, EXT, FIN, HR, OPS, PLT, PUB, SEC) |
| `a_revalidar` (estado declarado, 04/10) | **46** |
| `a_revalidar` (estado confirmado, 04/10) | **45** — a diferença de 1 é explícita, não corrigida |
| `pronto_local` declarado | **164** |
| `em_execucao` / `entregue` declarados | **6 / 6** |
| **`a_revalidar` sem nenhuma menção em gate** | **20** |
| Com aceite humano registrado | **0** |
| Com reauditoria integral executada | **0** |

### O núcleo duro (20 IDs)

`PLT-01`, `PLT-02`, `PLT-03`, `PLT-06`, `PLT-07`, `PLT-09`, `PLT-12`, `PLT-15`,
`EXT-16`, `EXT-17`, `AI-01`…`AI-10`.

São exatamente as famílias que a auditoria já apontava como bloqueadas:
segurança/escopo de documentos, plataforma, EXT-16/17 (biometria e central,
bloqueadas por privacidade) e **toda a frente de IA real** (F14).

**Saíram do núcleo desde 27/10 (7 IDs, todos com relatório próprio):** `CLI-02` e
`CLI-03` passaram a `gate_nomeado`; `CLI-05`…`CLI-08` e `PLT-10` passaram a
`mencionado_em_gate`. A família SEC recebeu um **mapa de reauditoria técnica com 35 âncoras em 5 execuções de gates** (`docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.md`), levando os 15 IDs SEC de `somente_documento` para `mencionado_em_gate`. Isso **não** significa que os
requisitos foram implementados/revalidados: o relatório SEC marca
`aceite_humano=nao_registrado` e `reauditoria_integral=nao_executada` em todos os
15. A classe textual indica somente que há evidência técnica mapeada.

Entre os 46 `a_revalidar`, **26 têm alguma menção em gate**: `SEC-03`, `SEC-07`,
`SEC-10`…`SEC-15`, `CLI-01`, `CLI-02` e `CLI-03` (`gate_nomeado`), `CLI-05`…`CLI-10`,
`PLT-10`, `PLT-11`, `PLT-13`, `PLT-14`, `PLT-16`…`PLT-18`, `EXT-06` e `EXT-09`
(`gate_nomeado`). Isso **não** os torna revalidados: a menção é um ponto de
partida, não um aceite.

## 4. RED → GREEN

- **RED:** com CSV, JSON e relatório removidos, a guarda falha **0/6** (todos
  os seis testes dependem dos artefatos ou do `--check`).
- **GREEN:** com os três artefatos restaurados e atualizados, **6/6**.

O gerador com `--check` é executado **dentro** do `npm test`, então qualquer
deriva entre a fotografia, o workspace e os arquivos versionados bloqueia o CI
sem precisar de workflow novo.

## 5. Como usar na próxima fatia

```
node scripts/requisitos-222-inventory.mjs           # regenera
node scripts/requisitos-222-inventory.mjs --check  # valida no CI
```

Para reauditar uma família (ex.: `AI-*`), abra o JSON, filtre por `prefixo`,
leia `arquivos_gate` / `arquivos_documento` e **só então** execute a jornada por
papel em PostgreSQL 17 + Chromium. Ao terminar, atualize a matriz histórica
com uma nova coluna de reauditoria — **nunca** escrevendo `aceite_humano`
diferente de `nao_registrado` sem aceite real.

## 6. Validação da fatia

| Verificação | Resultado |
|---|---|
| Guarda RED → GREEN | **0/6 → 6/6** |
| `requisitos-222-inventory --check` | **OK** (222 IDs; **20** sem gate no JSON vigente) |
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | ver §7 |
| `npm run typecheck` / `npm run build` | ver §7 |
| `qa-wave0-static` / inventários `--check` / audit / `git diff --check` | ver §7 |
| Gates de navegador (portal + E6 + 10B) | ver §7 |

## 7. Bateria final

Executada em 27/10/2026 no branch `arena/6d37ed49-gruposegsystemseguranca`,
base `6b4212d7e45d58003391dd0291e6c504c5c2964a`:

| Verificação | Resultado |
|---|---|
| `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1115/1115** (204 arquivos `.mjs`, 141 no `test:unit`) |
| `npm run typecheck` | **0** erros |
| `npm run build` | **105/105** páginas |
| `qa-wave0-static` | **5/5** |
| `ux-pro-00-inventory --check` / `ux-pro-03-ti-inventory --check` | **OK / OK** |
| `requisitos-222-inventory --check` | **OK** antes, durante e depois dos gates |
| `npm audit --audit-level=moderate` | **0** vulnerabilidades |
| `git diff --check` | **limpo** |
| Gate do portal | **40/40** |
| Gates E6 grupos 1 / 2 / 3 | **6/6 · 7/7 · 6/6** |
| Gate 10B prévias | **5/5** (evidência com SHA `917236ad…` à época; hoje `14ff3232…` após a Opção A) |
| Workflows | **49** (nenhum novo; a guarda roda no `test:unit`) |
| `next-env.d.ts` `1862ac4b…` / `tsconfig.json` `2128c956…` | **preservados** |

**Nota de método:** a primeira execução do `--check` falhou porque os
documentos de estado editados pela própria fatia citavam IDs e mudavam o índice.
A correção não foi "aceitar a deriva", e sim **excluir da varredura os
documentos de meta-estado** (`STATUS-VIGENTE.md`, auditoria de 26/10, a
fotografia de 04/10 e os artefatos desta fatia), que não provam requisito
algum. O `--check` voltou a passar e ficou estável mesmo após os cinco gates
de navegador.

## 8. Limitações que esta fatia **não** fecha

- **A reauditoria integral (F16) continua por fazer**: 0/222 IDs foram
  reauditados por jornada, papel, A/B, estados de erro/vazio e aceite.
- **0/222 com aceite humano**, UAT, Windows real, leitor de tela ou produção.
- A fotografia de 04/10 é **histórica**; estados `pronto_local`/`entregue`
  continuam sem verificação atual. A diferença 46 ↔ 45 `a_revalidar` entre as
  duas colunas foi preservada, não "corrigida" por inferência.
- A evidência é **textual**: citações em testes/docs não provam comportamento.
- D7/C11/**E18 (contraste das prévias)**, E3/E4, E7–E9, E14 (42 órfãos TI),
  E15/E16, F02, F14, F15, backup real e provedores seguem na fila.
- Nenhuma decisão de negócio, publicação, provedor ou produção foi tomada.

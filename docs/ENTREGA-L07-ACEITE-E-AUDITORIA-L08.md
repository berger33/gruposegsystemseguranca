# Relatório de sessão — aceite humano L07 e auditoria documental do terreno L08

Data: 2026-10-02. Base: `main` `ad01d7d` (merge da PR #76). Branch:
`arena/01a0fdbd-gruposegsystemseguranca`. Próxima migração livre: **139**.

## Resultado executivo

- Marcelo e Andreia aceitaram integralmente **FIN-01..16** e **ADM-01..12** em
  02/10/2026, após apresentação da matriz seção por seção.
- Nenhuma validação Windows com evidência foi relatada. Portanto, implementação,
  validação automática e aceite humano foram registrados separadamente e o
  **L07 permanece em execução**.
- Para os 80 componentes órfãos de `/admin/ti`, o proprietário decidiu
  **promover por área somente com prova**, usando o critério já definido no
  inventário. Nenhuma ordem entre áreas foi declarada e nenhuma foi inventada.
- Como o L07 não fechou formalmente, o **L08 não foi iniciado**: não há migração
  139, gate, workflow nem promoção de CLI/EXT. Foi feita apenas a auditoria
  [`AUDITORIA-TERRENO-L08.md`](AUDITORIA-TERRENO-L08.md).

## Baseline antes de qualquer edição

SHA `ad01d7d1d89b51496196ab2d6352412f39113966`:

| Comando | Resultado real |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `npm run typecheck` | 0 erros |
| `npm test` | 196/196 |
| `npm run test:migrations:pg` | 138/138 em 2 passes; clone/checksum negativo; 524 tabelas |
| L07 tentativa 1 | 43/43 |
| L07 tentativa 2 | 42/43: Chromium `SIGSEGV` no `browserType.launch` do subteste 6 |
| L07 repetições consecutivas A/B | 43/43 + 43/43 |
| L03 encadeado | 1/1 |
| L04 encadeado, primeira tentativa | 18/20: dois `SIGSEGV` no lançamento do Chromium, subtestes 1 e 3 |
| L04 repetição integral | 20/20 |
| L05 após L04 | 1/1 |
| L06 após L05 | 9/9 |

As quedas foram do binário Chromium antes das jornadas afetadas; as repetições
integrais passaram sem mudança de produto/teste. Não houve aumento de timeout,
skip, remoção ou enfraquecimento de assertiva. O 403 intermitente do L03, o
`Carregando histórico…` do L07-22 e o `Carregando operação…` do L06-9 não
reapareceram.

## Aceite registrado

Escopo exato aceito por **Marcelo e Andreia**, data **02/10/2026**:

- financeiro: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06, FIN-07, FIN-08,
  FIN-09, FIN-10, FIN-11, FIN-12, FIN-13, FIN-14, FIN-15 e FIN-16;
- painel: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, ADM-08,
  ADM-09, ADM-10, ADM-11 e ADM-12.

O aceite se limita às jornadas locais e fronteiras sintéticas da matriz. Não
homologa PSP, banco, SMTP, emissão fiscal, pagamentos, dados de clientes ou
qualquer integração externa. Também não comprova Windows.

## Decisão sobre os órfãos

Decisão: promover os 80 componentes por área **apenas** quando cada item tiver:
rota real, autorização no servidor, indicador com fonte/período/data-base,
drill-down ao registro canônico, erro de leitura com retry e subteste no gate
correspondente. Enquanto isso permanecem protótipos documentados e não contam
como entrega. A priorização entre áreas ficou sem declaração.

## Auditoria CLI/EXT

O terreno não é greenfield:

- portal legado real e testado em migrações 003–005 e 097–101;
- páginas cliente para autenticação, contas, contratos, documentos, chamados e
  MFA;
- schemas v2 CLI nas migrações 074–076 e 093;
- `cli_tickets_v2` já provada como fonte ADM;
- schemas EXT 085–087 e handlers roteados.

Mas o terreno também não é uma entrega L08:

- componentes `CliClient`, `CliAdvancedClient`, `CliFinanceClient`, `ExtClient`,
  `ExtAdvancedClient` e `ExtReportingClient` estão órfãos em `/admin/ti`;
- vários aliases `/api/client/*` v2 terminam em handlers staff-only;
- fornecedor restrito e reclamação aos responsáveis corretos não têm prova;
- várias escritas v2/EXT não demonstram ainda histórico+auditoria na mesma
  transação com rollback 503;
- não existe `test:l08-delivery:pg` nem workflow L08.

Todos os 32 requisitos mantêm seus estados anteriores (`a_revalidar`, exceto
CLI-04 `em_execucao`). A primeira fatia recomendada quando o bloqueio Windows
for removido é CLI-01..05.

## Pendência e próximo passo

1. proprietário executar/acompanhar em Windows e fornecer evidência com executor,
   data, versão, comandos/jornadas e resultados;
2. registrar essa evidência sem presunção;
3. só então declarar L07 concluído e iniciar L08 com gate/workflow, auditando
   primeiro CLI-01..05 e usando migração aditiva 139 apenas se necessária.

## Validação final da alteração documental

Após `npm install` (82 pacotes, 0 vulnerabilidades), no mesmo checkout:

| Prova | Resultado final |
|---|---|
| Estático | 5/5 |
| Typecheck | 0 erros |
| Unitários | 196/196 |
| Build | exit 0 |
| Migrações | 138/138 em dois passes + clone/checksum negativo; 524 tabelas |
| L07 final | **43/43 + 43/43 consecutivos** |
| L03 | 1/1 |
| L04 | 20/20 |
| L05 | 1/1 |
| L06, encadeado depois de L03–L05 | 9/9 |

Antes da dupla final houve duas execuções 42/43, uma no subteste 12 e outra no
32, ambas por `SIGSEGV` do Chromium em `browserType.launch`, antes da jornada.
As execuções integrais subsequentes chegaram à sequência exigida 43/43 + 43/43,
sem mudança em timeout, skip, assertiva, teste ou produto.

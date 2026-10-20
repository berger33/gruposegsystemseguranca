# UX-PRO-E3-R1 — Relatório (20/10/2026)

**Base:** `0a75c5b` (merge PR #276) · **Branch:** `arena/86484f7b-gruposegsystemseguranca`
**Decisão:** Q1=E3-R1 · Q2=(a) `America/Sao_Paulo` + ISO secundário · Q3=mesma célula ` · ISO` com `styles.hint`

## RED focal (antes do fix)

Mensagem exata (prova estática, Node 22, `America/Sao_Paulo`):

```
RED focal — slice(0,10) colide: 2026-10-05T02:30:00Z => 2026-10-05 (esperado: 04/10/2026 23:30 (America/Sao_Paulo))
RED focal — slice(0,10) colide: 2026-10-05T14:32:00Z => 2026-10-05 (esperado: 05/10/2026 11:32 (America/Sao_Paulo))
Defeito confirmado: ambas viram 2026-10-05; 02:30Z perde dia em SP.
```

Prova focal: `cov.coverage_date || String(cov.requested_at).slice(0,10)` em `OperacaoWorkspace.tsx:1493`. Quando `coverage_date=null`, `requested_at=2026-10-05T02:30:00Z` vira `2026-10-05` em vez de `04/10/2026 23:30 (America/Sao_Paulo)` + ISO. `14:32:00Z` não colide em valor de dia (05/10), mas também perde hora/fuso.

## Desenho autorizado (via (a))

`OperacaoWorkspace.tsx:1493`: se `coverage_date` existe → `String(coverage_date).slice(0,10)` (inalterado, `DATE` nunca via `opsDateTime`); senão → `<Stamp value={cov.requested_at} />` (reusa `Stamp`/`opsDateTime`/`opsIsoStamp` da E3, `styles.hint` para ISO). Nenhum `toLocaleString` sem locale.

## Guardas aplicadas
- `npm ci` OK (84 pacotes)
- `MD5 next-env.d.ts=87a8bf5c65d00003ad1eba1613711943` `tsconfig.json=99f7042f814e77e67b785906e5d4df23`
- Nenhum `slice(0,10)` alterado exceto o 1 de E3-R1 (13 total: 12 DATE + este); `slice(0,16)` em `OpportunitySummary.tsx:82` (E3-CRM) não tocado.
- Sem API/banco/migrações 001-180/RBAC/sessão/auditoria/ordenação/filtros/estados/textos.

# Prompt para a próxima sessão

Copie o bloco abaixo e cole como primeira mensagem da nova sessão do Arena.

---

```text
Continue o desenvolvimento do repositório berger33/gruposegsystemseguranca em uma nova sessão.

Contexto recente:
- A entrega de hardening FIN-14/15/16 foi mesclada na main.
- Branch anterior:
  arena/01a0f915-gruposegsystemseguranca
- PR anterior:
  #64 — "Hardens FIN-14/15/16 export, closure and commission flows"
- Commit principal da entrega anterior:
  b3940e6 — Hardens FIN-14/15/16 export, closure and commission flows
- Commit de merge na main:
  fa893d6
- Entrega imediatamente anterior: PR #63 (FIN-13), commit 6d80eba, merge e194d57.
- Não reutilize branches anteriores; crie/use apenas a branch fixa fornecida pelo Arena para esta nova sessão.
- Não altere migrações históricas.
- Não faça reset destrutivo, `git clean`, revert ou descarte de alterações locais sem confirmação.

Estado entregue no PR #64:
- FIN-14/15/16 endurecidos em:
  `src/server/fin-budget-api.mjs`
- Migração aditiva nova:
  `db/migrations/133-fin14-15-16-export-closure-commission-hardening.sql`
- Faixa de migrações atualizada para 001–133 em:
  `scripts/migrate-site-visual.mjs`
  `scripts/qa-wave0-static.mjs`
- Gate L07 de 24 para 27 subtestes em:
  `tests/l07-delivery.integration.test.mjs`
  `scripts/qa-l07-delivery-postgres.mjs`
- Relatório novo:
  `docs/ENTREGA-L07-FIN14-15-16.md`

Garantias FIN-14/15/16 entregues:
- Handlers transacionais com `BEGIN`/`COMMIT` e `FOR UPDATE` em decisão, transição e checagem de duplicidade.
- Auditoria fail-closed: rollback total, resposta `503 { "error": "audit_unavailable" }`, sem ignorar falha de auditoria.
- Respostas HTTP sanitizadas, sem detalhes SQL.
- Allowlist de status, ações e tipos antes do SQL.
- Sessão, same-origin e papéis financeiro/admin; papel `ti` somente leitura em todo o domínio.
- FIN-14: protocolo `EXP-FIN`, trilha `fin_export_logs` imutável, duplicidade por `storage_key`,
  transições `pendente -> gerando -> gerado -> expirado` e `falhou -> pendente`,
  `gerado` exige `storage_key` e `generated_at`, acesso limitado do contador não desligável.
- FIN-15: fechamento único por competência, transições `aberta -> fechada -> reaberta -> fechada`,
  reabertura exige identidade autorizadora, data e motivo; `fin_report_versions` imutável e preservada.
- FIN-16: provisão nasce `provisionada`, transições
  `provisionada -> em_revisao -> revisada -> paga | cancelada`,
  `paga` exige revisão prévia e confirmação manual explícita,
  `is_auto_paid` sempre falso, histórico imutável.
- Correção de bug real: `PATCH /api/fin/exports` e `PATCH /api/fin/commission-provisions`
  estavam quebrados com `42P08 inconsistent types deduced for parameter $1` e só respondiam
  `500 internal`; agora têm cast explícito e cobertura no gate.

Validações locais executadas na entrega anterior (todas verdes):
- `npm ci`: OK.
- `npm run typecheck`: OK.
- `node scripts/qa-wave0-static.mjs`: OK, 5/5, migrações 001–133.
- `npm test`: OK, 196/196.
- `npm run test:migrations:pg`: OK, migrações 001–133, duas passagens idempotentes e clone/checksum.
  O stderr de checksum mismatch em `006` é cenário negativo esperado pelo gate, com exit code 0.
- `npm run test:l07-delivery:pg`: OK, 27/27, em duas execuções consecutivas, Chromium sem SIGSEGV.
- `npm run test:l03-delivery:pg`: OK, 1/1.
- `npm run test:l04-delivery:pg`: OK, 20/20.
- `npm run test:l05-delivery:pg`: OK, 1/1.
- `npm run test:l06-delivery:pg`: OK, 9/9.
- `npm run build`: OK.

Estado do CI no PR #64 (importante, prioridade desta sessão):
- Jobs `static-and-smoke` e `operations-postgres-browser`: verdes.
- Job `finance-postgres-browser` (gate L07): vermelho, 17 passaram e 10 falharam.
  Os três testes novos passaram no CI (`ok 25` FIN-14, `ok 26` FIN-15, `ok 27` FIN-16).
  As 10 falhas são exatamente os 10 testes Chromium pré-existentes, todos derrubados por
  `ENOENT: .next/integration-l07/dev/required-server-files.json`, que faz `/admin/financeiro`
  responder 500 no servidor de desenvolvimento do runner.
- Job `crm-postgres-browser` (gate L04): vermelho, 1 passou e 19 falharam, todas por timeout
  de localizador do Playwright, mesma classe de problema de artefato/ambiente do Next em CI.
- O mesmo job `finance-postgres-browser` já estava vermelho no PR #63, que foi mesclado assim mesmo.
- Localmente, L07 passou 27/27 duas vezes e L04 passou 20/20.
- Não foi possível reexecutar os jobs pelo `gh` nesta sessão: a API respondeu
  `403 Resource not accessible by integration`.

Próximos objetivos sugeridos:
1. Verifique o estado real do repositório e da main:
   - `git status`
   - `git log --oneline --decorate -10`
   - `git fetch origin`
   - confirme que o PR #64 está na `origin/main` (merge `fa893d6`).
2. Prioridade: estabilizar os gates de navegador no CI, que hoje são o único vermelho.
   - Investigue por que `.next/integration-l07/dev/required-server-files.json` não existe no runner
     enquanto existe localmente. Verifique a ordem entre `rm -rf` do dist, start do servidor em `--dev`
     e a primeira navegação do Chromium.
   - Avalie esperar explicitamente pela prontidão da página (por exemplo, um GET de `/admin/financeiro`
     devolvendo 200 antes de abrir o Chromium), em vez de confiar só em `/api/admin/session`.
   - Avalie o mesmo tratamento no gate L04.
   - Trate isso como correção de harness de teste, não como relaxamento de asserção:
     não remova nem enfraqueça teste de navegador para mascarar a falha.
3. Audite os domínios financeiros que ainda não passaram por fatia de hardening, se houver,
   aplicando o mesmo padrão já consolidado em FIN-05..FIN-16:
   - transações com `BEGIN`/`COMMIT`;
   - `FOR UPDATE` onde houver decisão/transição/concorrência;
   - auditoria fail-closed com rollback total;
   - `503 audit_unavailable`;
   - sem detalhes SQL nas respostas HTTP;
   - validação allowlist de status/ações/tipos;
   - sessão, same-origin e papéis;
   - papel `ti` somente leitura;
   - dados sintéticos nos testes, sem dados reais.
4. Procure outros handlers com o mesmo defeito de tipagem `42P08` já corrigido em FIN-14/16,
   isto é, um mesmo parâmetro usado ao mesmo tempo como enum e como texto em `UPDATE ... CASE WHEN`.
   Vale um levantamento em `src/server/*.mjs`, porque esse caminho só aparece como `500 internal`
   e passa despercebido quando não há teste cobrindo o `PATCH`.
5. Considere uma aba de workspace para FIN-14/15/16 em `src/app/admin/financeiro/`,
   caso queira cobertura Chromium real desses domínios. Hoje não existe aba própria,
   e por isso a fatia anterior não adicionou teste de navegador.
6. Atualize o contador/descrição do gate L07 se novos subtestes forem adicionados.
7. Atualize a documentação de entrega apropriada em `docs/`, criando novo relatório se for uma nova fatia.
8. Execute os gates relevantes antes de declarar verde:
   - `npm ci` se dependências não estiverem instaladas;
   - `npm run typecheck`;
   - `node scripts/qa-wave0-static.mjs`;
   - `npm test`;
   - `npm run test:migrations:pg`;
   - `npm run test:l07-delivery:pg` pelo menos duas vezes consecutivas se houver Chromium ou mudança no gate L07;
   - `npm run test:l03-delivery:pg`;
   - `npm run test:l04-delivery:pg`;
   - `npm run test:l05-delivery:pg`;
   - `npm run test:l06-delivery:pg`;
   - `npm run build`.
9. Verifique também o CI do GitHub Actions no PR, não só os gates locais, e relate o resultado dos quatro jobs.
10. Nunca informe que os testes passaram se algum gate falhar. Diferencie claramente:
    - falha de código;
    - falha de infraestrutura;
    - falha intermitente de Chromium;
    - teste não executado.

Importante:
- Não prometer resultado financeiro.
- Não implementar pagamento, cobrança real, gateway real ou emissão real.
- Não alterar tipos ou migrações históricas.
- Não expor mensagens SQL nas respostas HTTP.
- Não usar `git reset --hard`, `git clean`, revert ou apagar trabalho existente sem confirmação.
- Fazer commit somente das alterações necessárias.
- Se houver nova entrega, abrir novo PR contra `main` a partir da branch fixa da nova sessão.
```

# Prompt completo da próxima fatia — L07 / FIN-14

Cole o conteúdo abaixo como primeira mensagem da próxima sessão. **Não iniciar
esta fatia nesta sessão atual.**

Você continua o repositório `berger33/gruposegsystemseguranca` no ambiente remoto
Arena, exclusivamente na branch que a sessão fornecer, baseada na `main` atual.
GitHub é a fonte oficial. Confirme `git status`, `git log --oneline -5`,
`git branch --show-current` e `git fetch origin main` antes de editar. Não mude
para outra branch, não faça merge sem autorização e abra uma PR revisável, sem
merge.

## Escopo único

Implementar e validar somente:

> **FIN-14 — exportação do período com filtros, totais conciliáveis, trilha,
idempotência, acesso limitado do contador e recuperação local honesta.**

Não iniciar FIN-15, FIN-16, ADM-01..12, L08 ou qualquer fatia não necessária para
FIN-14. Preservar L04, L05, L06 e FIN-01..13. FIN-13 está tecnicamente entregue
somente se a evidência da branch atual disser `pronto_local`; não reabrir seus
arquivos sem regressão reproduzível.

## Pré-voo obrigatório

1. Confirmar a `main` atual e os commits posteriores ao baseline da sessão.
2. Ler `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`,
   `docs/EVIDENCIAS-ENTREGA-LOCAL.md`, `docs/ENTREGA-L07-FIN14-15-16.md` e o
   bloco FIN-14 de `tests/l07-delivery.integration.test.mjs`.
3. Executar em série, sem paralelismo: `npm ci`, `npm run typecheck`,
   `node scripts/qa-wave0-static.mjs`, `npm test`,
   `npm run test:migrations:pg` e o gate L07. Se uma regressão herdada aparecer,
   pare FIN-14 e relate antes de alterar código.
4. Confirmar que o último número de migration é 134. Não reescrever 001–134;
   qualquer schema de FIN-14 precisa de próximo número livre, aditivo,
   migrador/manifesto/checksum atualizados e constraints novas compatíveis com
   registros antigos.

## Regras funcionais obrigatórias

- Exigir período ISO válido, filtros explícitos e totais derivados/conciliáveis;
  não aceitar uma string de arquivo ou total digitado como prova de exportação.
- Diferenciar solicitação, geração, falha e expiração. Uma exportação “gerada”
  só pode apontar para artefato local realmente persistido; sem storage externo,
  declarar `local_outbox`/pendente em vez de “download enviado”.
- Idempotência deve ser concorrente e pelo conteúdo canônico: retry equivalente
  retorna a mesma exportação; mesma chave com filtros/período/totais diferentes
  recebe 409. Nunca duplicar exportação.
- Limitar leitura à identidade/papel autorizado e manter o contador sem
  permissões de alteração de orçamento, cobrança ou pagamento. Same-origin,
  401/403/405 e allowlists devem existir no servidor e no banco quando aplicável.
- Criar trilha imutável com autor real, data, período, filtros, totais,
  artefato/chave local e motivo. Auditoria e mutação devem usar a mesma
  transação; falha da auditoria deve retornar 503 sem deixar exportação, log ou
  artefato parcial.
- Não chamar SMTP, hospedagem pública, gateway ou pagamento real. Nenhuma
  exportação/aprovação pode gerar cobrança, pagamento ou obrigação.
- Erro de leitura deve ser mostrado como erro visível, nunca como lista vazia
  ou sucesso. Confirmação de UI só depois da persistência HTTP e deve informar
  a natureza local/sintética do artefato.

## Implementação e gate

Auditar primeiro `src/server/fin-budget-api.mjs`, `server.mjs`, a migration 133,
`BudgetWorkspace.tsx`/workspace financeiro e o subteste FIN-14 existente. Não
copiar handlers inteiros de PRs de referência. Usar apenas melhorias seletivas
com autoria e razão registradas.

O gate deve usar PostgreSQL descartável, servidor HTTP real e Chromium real,
sem skips e sem asserções removidas. Acrescentar ou fortalecer testes para:
401/403/405/origem, filtros e períodos inválidos, cálculo/totais não adulteráveis,
idempotência concorrente e conflito de conteúdo, status inválidos, artefato
local honesto, trilha/snapshot/identidade/data, imutabilidade, acesso limitado,
rollback de auditoria e UI de seleção/erro/confirmacão. Manter FIN-13 e os
subtestes L04–L06 verdes.

Executar em série antes de declarar qualquer estado:

```text
npm run typecheck
node scripts/qa-wave0-static.mjs
npm test
npm run test:migrations:pg
npm run test:l07-delivery:pg
npm run test:l07-delivery:pg
npm run test:l03-delivery:pg
npm run test:l04-delivery:pg
npm run test:l05-delivery:pg
npm run test:l06-delivery:pg
npm run build
git diff --check
git checkout -- next-env.d.ts tsconfig.json
```

Diferenciar no relatório: implementação; validação automática; aceite humano;
validação Windows; limites externos. Só marcar o requisito como `pronto_local`
se o gate completo e as regressões forem verdes. Não declarar L07 inteiro
concluído e não iniciar L08.

## Entregáveis

- migration aditiva seguinte a 134 e manifests/checksums atualizados;
- API, autorização, transações, auditoria e UI de FIN-14;
- testes HTTP/Chromium no gate L07 sem skips;
- `docs/ENTREGA-L07-FIN14.md` com números observados e limites honestos;
- atualização de `docs/ESTADO-EXECUCAO-LOCAL.md`,
  `docs/CHECKLIST-ENTREGA-LOCAL.md`, `docs/EVIDENCIAS-ENTREGA-LOCAL.md`;
- PR sem merge, com um único recorte revisável.

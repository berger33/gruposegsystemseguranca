# Próxima fatia do L07 — ADM-01..12, painel do Marcelo

Prompt preparado em 2026-10-02 ao final das jornadas FIN-14/15/16. **Esta fatia não foi iniciada.**

## Fonte e estado a preservar

Trabalhe no repositório oficial `berger33/gruposegsystemseguranca`, em branch Arena própria criada da `main` atual. Não use cópia local, não faça merge automático/force push e não reavalie PRs de referência já consolidadas.

L04–L06 têm entregas técnicas integradas. FIN-01..16 estão `pronto_local` na validação automática, com aceite humano pendente. Preserve especialmente: FIN-13/migração 134; FIN-12→FIN-04/migração 135; FIN-10/migração 136; jornadas FIN-14/15/16 e migração 137. Não inicie L08 e não declare L07 concluído antes de fechar matriz/evidências e obter o aceite aplicável.

## Objetivo exclusivo

Implementar e provar ADM-01..12 no painel funcional `/admin/marcelo`, fazendo indicadores e pendências abrirem registros reais e autorizados. Inventarie os componentes hoje órfãos de `/admin/ti`, decidindo por prova quais são promovidos, adaptados ou mantidos como dívida explícita. Não crie números, aprovações, alertas ou resultados fictícios para preencher cartões.

## Antes de implementar

1. Leia `README.md`, `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/ENTREGA-L07.md`, `docs/ENTREGA-L07-FIN14-15-16.md`, `docs/EXECUCAO-ENTREGA-LOCAL.md` e ADM-01..12 em `docs/CHECKLIST-ENTREGA-LOCAL.md`.
2. Reconfirme baseline: estático 5/5 (001–137), typecheck, 196/196 unitários, migrações 137/137, L07 37/37 em duas execuções consecutivas e regressões L03–L06.
3. Reproduza por teste as lacunas do painel atual: cartão sem origem, indicador sem drill-down, rota sem autorização, falha de leitura tratada como zero/lista vazia e qualquer ação que não abra o registro canônico.

## Regras inegociáveis

- Autorização e escopo decididos no servidor; TI somente leitura onde previsto; anônimo/papel indevido negados.
- Indicadores calculados de registros canônicos, com período/fonte/data-base visíveis; ausência de dado não vira zero inventado.
- Todo cartão acionável abre lista filtrada e registro real, preservando autorização.
- Escrita sensível, histórico e auditoria na mesma transação; falha de auditoria retorna 503 e reverte tudo.
- Retry/idempotência e concorrência para ações; autoria derivada da sessão.
- Migrações somente aditivas a partir do próximo número livre, constraints novas `NOT VALID`, linhas antigas tratadas sem inventar autoria.
- Nada externo/real: sem PSP, banco, SMTP, emissão, pagamentos ou dados de clientes.
- Não aumente timeout, não use skip e não remova/enfraqueça assertivas.

## Gate e entrega

Amplie `test:l07-delivery:pg` com HTTP + PostgreSQL + Chromium reais para ADM-01..12: papéis/anônimo, origem e drill-down de cada indicador, falha de leitura + retry, concorrência, auditoria fail-closed e jornada ponta a ponta de Marcelo. Rode typecheck, unitários, build, estático, migrações, L07 duas vezes consecutivas e regressões L03–L06 no mesmo SHA.

Atualize ESTADO, CHECKLIST, EVIDENCIAS, CONTROLE e ENTREGA-L07, mais um relatório da série. Diferencie implementação, validação automática e aceite humano; não invente aceite de Marcelo/Andreia. Abra PR revisável sem merge e aguarde autorização humana. Depois, prepare o handoff para fechamento da matriz/evidências do L07 e só então para L08.

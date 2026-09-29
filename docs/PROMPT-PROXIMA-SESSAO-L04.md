# Prompt da próxima sessão — Grupo SEG System (entrega local, L04)

Escrito ao fim da sessão `arena/01a0ef49-gruposegsystemseguranca`
(PUB-10: mensuração de origem e conversão, painel derivado somente leitura).
Use este arquivo como prompt de entrada da próxima continuação.

## Estado de entrada

- Base: `main` no commit que fizer merge desta fatia (PR desta sessão sobre
  `fe35b4c`). **Conferir no disco antes de começar.**
- Referências obrigatórias antes de qualquer código:
  `docs/ESTADO-EXECUCAO-LOCAL.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`,
  `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e
  `docs/PROMPT-CONTINUACAO-PUB10-METRICAS-ORIGEM.md`.
- **L04 permanece PARCIAL. Não iniciar L05.**
- Última fatia entregue (gate **9/9** duas vezes consecutivas): PUB-10 —
  `GET /api/admin/leads/metrics?from=&to=` agregando `public_leads` por
  origem/campanha/canal e cruzando com
  `crm_opportunities.public_lead_id`/`stage`, mais o painel
  `src/app/admin/leads/OriginMetricsPanel.tsx` em `/admin/leads`. Somente
  leitura, sem migração nova.
- Decisões registradas nessa fatia, que **não devem ser reabertas sem motivo
  concreto**: `OriginMetricsClient.tsx` descartado (permitiria digitar
  métrica à mão) e mantido órfão; testes A/B fora (dependem de tráfego,
  hipótese e tratamento de dados definidos); minimização por construção (só
  rótulos e inteiros saem da rota, e nenhum parâmetro destrava linha
  individual); denominador zero devolve `null`, não `0`; janela obrigatória
  com teto de 366 dias; a rota não grava trilha por consulta; "ganho no
  funil" nunca significa dinheiro recebido.
- Migrações 001–110 aplicadas e IMUTÁVEIS; próxima migração livre: **111**
  (confirmar no disco antes de criar). 509 tabelas.
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, lembretes/notificações da agenda, testes A/B, hospedagem externa,
  Windows e aceite humano. Não publicar em produção nem contratar serviços.
- Atenção: pode haver PR aberto de outra sessão tocando CRM-07 (notas
  internas / campo a campo de CRM-05/06). Verificar `gh pr list` antes de
  escolher a fatia, para não colidir.

## Lacunas restantes de L04 (escolher UMA fatia vertical)

1. **CRM-07 residual:** revisão campo a campo do kanban/tabela herdados de
   CRM-05/06 e notas internas dedicadas. *(Checar se já foi coberto por PR de
   outra sessão antes de atacar.)*
2. **PUB-06 (CMS)** — páginas/FAQ/cases/blog/vagas com rascunho, revisão,
   publicação, histórico e reversão. `CmsClient.tsx` é órfão; conectar por
   domínio, nunca despejar na página de TI.
3. **PUB-07 (temas)** — preview, publicação autorizada, configuração
   persistida e rollback, com preferência dia/noite separada da identidade
   global. `ThemeClient.tsx` órfão; `/admin/tema` existe e não foi
   revalidada.
4. **PUB-08 (SEO técnico)** — títulos, sitemap, redirects, verificação de
   domínio e `noindex` preservado fora de produção. `SeoClient.tsx` órfão.
5. **PUB-09 (montador de pacote/comparador)** — só a partir do catálogo e de
   regras aprovadas; nenhum preço de demonstração. `PackageClient.tsx` órfão.
6. **PUB-02/05** — páginas por serviço/segmento com revisão de acessibilidade
   e desempenho; FAQ assistida com handoff humano (`PubFaqAssistedClient.tsx`
   órfão), sem o bot inventar preço, cobertura, licença ou prazo.
7. **Revalidação campo a campo de CRM-01..06** com cenários dedicados no gate.

## Método (inegociável)

- Registrar as decisões de política ANTES da rota, em
  `docs/PROMPT-CONTINUACAO-<fatia>.md`; sem bypass administrativo;
  fail-closed.
- **Componente órfão não é destino obrigatório.** Se o componente existente
  permitir ao usuário fabricar dado (como o CRUD de métricas do PUB-10),
  descartá-lo explicitamente e entregar a coisa honesta — declarando o
  descarte na documentação.
- Nem toda fatia precisa de migração nova: se a lacuna puder ser fechada
  reaproveitando tabelas, rotas e autorização já existentes, prefira isso.
  Quando for necessária, a migração é apenas aditiva; preservar o padrão do
  CHECK de `auth_access_audit` (falhar se a constraint pai sumir, nunca
  afrouxar).
- Auditoria transacional: falha de auditoria injetada deve reverter a
  mutação. Fatias somente leitura não precisam disso — mas precisam declarar
  por que não gravam trilha.
- Gate dentro de `tests/l04-delivery.integration.test.mjs`: HTTP real +
  PostgreSQL descartável + Chromium real sem `--disable-web-security` (um
  navegador por persona; SQL só para fixture/asserção/falha injetada). Ao
  testar UI assíncrona, aguarde a resposta HTTP real
  (`page.waitForResponse`); nunca `waitForTimeout` fixo.
- Cuidado conhecido: o lançamento do Chromium no sandbox ocasionalmente morre
  com SIGSEGV logo no `launch` — se acontecer sem nenhuma asserção ter
  falhado, é ruído de ambiente; reexecute antes de investigar o código.
- Atualizar `scripts/migrate-site-visual.mjs` (manifesto) e
  `scripts/qa-wave0-static.mjs` (`latestMigration`) **se** criar migração.
- Cuidado conhecido: o dev server do gate reescreve `tsconfig.json` e
  `next-env.d.ts` (`.next/integration-l04`) — restaurar com `git checkout`
  antes do commit (`git status --short` deve mostrar só os arquivos que você
  quis tocar).
- Se um cenário preexistente do gate quebrar por causa de uma regra nova,
  ajustar o cenário e **declarar o ajuste** na documentação — nunca afrouxar
  a regra.
- Documentar honestamente ao final (estado, checklist, evidências e prompt da
  sessão seguinte). Não marcar como concluído o que não foi provado por gate.

## Evidência de retomada/fechamento

```bash
npm ci
node scripts/qa-wave0-static.mjs
npm run test:migrations:pg
npm run test:l04-delivery:pg   # 2x consecutivas
npm test
npm run typecheck
npm run build
git diff --check
```

## Fechamento

Commit e push na branch arena fixa da sessão, abrir PR para `main` com a
fatia, a política registrada e a evidência. Fazer o merge. Não avançar para
L05 enquanto L04 tiver lacuna aberta. Entregar o prompt completo para
continuar o projeto em outra sessão.

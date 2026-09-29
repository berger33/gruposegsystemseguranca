# Continuação Arena — CRM-09 após CRM-08

Data da retomada: 2026-09-29. Branch fixa da sessão:
`arena/01a0eea3-gruposegsystemseguranca`.

## Estado de entrada

- Base conferida: `5a2e6a728368dc75bfad014caba7bf8c98173118` em `HEAD` da branch
  e `main` no início da sessão.
- CRM-08 permanece parcial conforme `docs/ESTADO-EXECUCAO-LOCAL.md`.
- Próxima migração livre confirmada no disco: 108; 001–107 permanecem
  imutáveis.
- L05 não deve começar: L04 segue parcial.

## Decisões CRM-09 registradas antes da rota

1. **Modelos:** somente identidade staff ativa com papel `comercial` pode
   criar, editar, arquivar e aplicar modelos próprios. Admin, Marcelo, TI e RH
   não têm bypass. Passos de um modelo já aplicado ficam imutáveis; nome,
   descrição e arquivamento continuam editáveis com versão otimista.
2. **Oportunidade de outra pessoa:** não é permitido aplicar uma cadência a
   oportunidade cujo responsável/autor não seja a sessão. Outro comercial
   recebe 404; não há delegação implícita.
3. **Tarefas:** o modelo tem passos com título, intervalo de 0–365 dias, canal
   sugerido e responsável derivado da sessão. Aplicar materializa tarefas
   abertas, uma por passo, com prazo calculado. É operação manual; não existe
   worker, envio de e-mail, WhatsApp ou mensagem de qualquer provedor.
4. **Opt-out:** contato com opt-out não recebe nova aplicação. Um opt-out
   cancela as tarefas de cadência abertas/em andamento e registra a razão;
   tarefas concluídas não são reabertas. Reativação não ressuscita tarefas.
5. **Oportunidade ganha/perdida:** a aplicação é encerrada e suas tarefas
   pendentes são canceladas com razão explícita. Tarefas concluídas são
   preservadas.
6. **Contato desativado:** mesmo tratamento de encerramento, com razão
   `contato_inativo`.
7. **Mensagens futuras:** qualquer automação exige decisão de autorização,
   política de opt-out e provedor. Fica fora desta fatia e SMTP permanece
   excluído da entrega local.

## Entrega deste recorte

- Migração `108-crm-manual-cadences.sql`.
- API `src/server/crm-cadence-api.mjs`:
  - `GET/POST /api/crm/cadences/templates`;
  - `PATCH /api/crm/cadences/templates/:id`;
  - `GET/POST /api/crm/opportunities/:id/cadences`;
  - `PATCH /api/crm/opportunities/:id/cadence-contact`.
- UI `CadenceClient.tsx` montada em `/admin/crm`.
- Proteção da leitura de `stages` na rota legada de detalhe.
- Gate CRM-09 dentro de `tests/l04-delivery.integration.test.mjs`.

## Evidência de retomada/fechamento

```bash
npm ci
node scripts/qa-wave0-static.mjs
npm run test:migrations:pg
npm run test:l04-delivery:pg
npm test
npm run typecheck
npm run build
```

Os gates de banco recusam `DATABASE_URL`/`DATABASE_MIGRATION_URL` externas e
usam PostgreSQL descartável, HTTP real e Chromium sem
`--disable-web-security`. SQL de teste é apenas fixture, asserção ou falha de
auditoria injetada.

## Próximo passo

Não iniciar L05. Primeiro CRM-10 (carteira) ou, se a prioridade for consolidar
L04, resolver equipe/delegação, prazo/paginação de CRM-07, calendário/conflitos
em CRM-08, lacunas PUB e a revalidação campo a campo de CRM-01..06. Não ativar
automação de mensagens sem as decisões e o provedor acima.

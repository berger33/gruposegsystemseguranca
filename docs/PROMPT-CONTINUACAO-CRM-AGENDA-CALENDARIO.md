# Continuação Arena — CRM-08 residual (visão de calendário por semana)

Data da retomada: 2026-09-29. Branch fixa da sessão:
`arena/01a0ef36-gruposegsystemseguranca`.

## Estado de entrada

- Base conferida: `ed50d22bf2e979bad898147e737306b2aab254` (`main`, merge dos
  PRs #22 e #23; a fatia de código é o merge `ea7a1ed`), confirmada em disco no
  início da sessão.
- L04 permanece parcial conforme `docs/ESTADO-EXECUCAO-LOCAL.md`; L05 não
  começa.
- Migrações 001–110 no disco, 509 tabelas; próxima migração livre seria **111**
  — não foi necessária nesta fatia (ver "Por que sem migração" abaixo).
- Fora desta entrega, por decisão registrada: CRM-10, automação de mensagens,
  SMTP, lembretes/notificações da agenda, hospedagem externa, Windows e
  aceite humano.

## Recorte escolhido

Lacuna 2 da lista de `docs/PROMPT-PROXIMA-SESSAO-L04.md`: **CRM-08
residual — visão de calendário por período/semana na agenda pessoal**
(`MyAgenda.tsx`). Lembretes/notificações continuam fora (dependem de
provedor, autorização e opt-out, nenhum decidido).

## Decisões de política registradas ANTES do código

1. **Semana = segunda a domingo, no fuso do navegador de quem está olhando.**
   Não existe fuso "oficial" do sistema; cada usuário vê a própria semana
   local. Isso é consistente com o resto da agenda, que já exibe
   `toLocaleString('pt-BR')` sem conversão de fuso do servidor.
2. **Nenhuma superfície nova de autorização.** A visão de calendário consome
   exatamente o mesmo endpoint já aprovado em CRM-08,
   `GET /api/crm/visits/agenda`, com os mesmos parâmetros `from`/`to`/`limit`/
   `offset` que já existiam e já eram validados (`invalid_range`,
   `invalid_pagination`). Não é criada nenhuma rota, nenhuma coluna e nenhum
   escopo novo. A identidade continua enxergando só as visitas em que é
   responsável ou participante convidado — a mesma regra de CRM-08 (conflito
   considera só o responsável; participante não reserva; nenhuma agenda de
   terceiro é exposta) se aplica automaticamente, porque a consulta é a mesma.
3. **Por que sem migração nova:** o endpoint já aceita filtro de período desde
   a migração 107/110 (usado para paginação e para os testes de conflito).
   Criar uma migração aditiva sem necessidade violaria a política de
   migrações mínimas e aumentaria superfície sem ganho. Se uma necessidade real
   de coluna aparecer (por exemplo, fuso de agenda persistido no servidor),
   ela deve vir em fatia própria, com decisão explícita.
4. **A visão de calendário é somente leitura.** Confirmar/recusar presença,
   reagendar, cancelar e convidar continuam exclusivos da visão em lista
   (`MyAgenda` — lista) e da agenda da oportunidade
   (`OpportunityVisits.tsx`). Duplicar as mutações com controle de versão
   otimista em uma segunda superfície multiplicaria o risco de divergência
   sem necessidade real: a visão de calendário existe para *localizar* o
   compromisso rapidamente por período, não para operá-lo. Esta é uma
   decisão de escopo explícita, não uma limitação técnica.
5. **Sem paginação infinita dentro da semana.** O pedido usa `limit=100` (o
   teto já existente da API). Se a contagem total exceder o que foi
   devolvido, a tela avisa honestamente ("mais compromissos do que os
   exibidos nesta semana") em vez de fingir que mostrou tudo. Não é
   implementado scroll/paginação dentro do calendário nesta fatia — não há
   indício de volume real que justifique a complexidade agora.
6. **Papel administrativo não é bypass.** Como não há rota nova, isso é uma
   consequência automática do ponto 2 — não há política adicional a
   escrever.
7. **Lembretes e notificações continuam fora.** Nenhuma notificação é
   disparada pela visão de calendário; ela é puramente uma reorganização
   visual dos dados já retornados pela API existente.

## Gate

Cenário novo em `tests/l04-delivery.integration.test.mjs` (dentro do escopo
CRM-08): duas identidades comerciais, uma oportunidade, três visitas futuras
em janelas distintas (próximos dias / dali a três semanas). Prova, por
Chromium real:

- alternância lista ↔ semana sem quebrar a lista pré-existente (nenhum
  cenário anterior é reescrito);
- navegação anterior/atual/próxima preserva apenas os compromissos daquele
  intervalo, sem vazar os de outra semana;
- visita bem distante não aparece na semana atual nem na seguinte;
- nenhum erro de console/rede/5xx durante a navegação.

Sem migração nova, sem mudança de contrato de API, sem mudança de
autorização — portanto o gate de conflito/PUB-04 e os cenários anteriores de
CRM-08 continuam exatamente como estavam.

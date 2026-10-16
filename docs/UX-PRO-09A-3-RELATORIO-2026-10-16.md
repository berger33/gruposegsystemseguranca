# UX-PRO-09A-3 — G4: relatório (16/10/2026)

**Implementação e validação local concluídas; merge não autorizado por ausência de revisão
independente concluída.** Homologação e produção permanecem **NO-GO**. Não há aceite humano,
certificação WCAG ou UAT. A situação remota deve ser conferida na PR antes de qualquer merge.

## 1. Base, problema e alteração

Base inicial `main`/`origin/main` e HEAD: `091a878eb804720360c75f1b1d26bcf99ecb5233`, confirmada
por fetch e ls-remote. G1 MERGED #250 (`c6682c11dd51fd98ceb480e59a2f8b5beafa5cfe`), G2 MERGED #251
(SHA da base), checks retornados de ambas SUCCESS. #234 continua OPEN e não foi alterada.
Branch fixa desta sessão: `arena/055fb215-gruposegsystemseguranca`.
Escopo escrito antes do código: [escopo](UX-PRO-09A-3-ESCOPO-ANTES-2026-10-16.md).

Somente `/cliente/redefinir-senha`, visitante anônimo com token, erro `reset_link_invalid`:

- **Antes:** “Este link de redefinição não é mais válido. Ele vale 1 hora, tem uso único e é
  substituído quando um novo é emitido. Peça outro link.”
- **Depois:** “Este link de redefinição não é mais válido. Ele tem prazo de validade, uso único e é
  substituído quando um novo é emitido. Peça outro link.”

O comentário do mesmo arquivo também deixa de prometer 1 h. Não há mudança de lógica ou estilo.
O prazo segue 3.600.000 ms no `POST /api/auth/recover` (`PASSWORD_RESET_TTL_MS`) e 900.000 ms no
link manual autorizado por TI (`TTL_MS`). Não há conflito de políticas a decidir: uma redação comum
verdadeira resolve G4 sem escolher duração nem distinguir publicamente as origens.

## 2. Preservações verificadas

- Nenhum arquivo de API, endpoint, payload, política de senha, cookie/sessão, auditoria,
  rate limit, MFA, permissão, identidade, expiração ou token foi alterado.
- Texto mantém uso único, substituição e orientação de pedir outro link; código de erro continua
  genérico, sem revelar identidade ou causa individual (expirado/usado/substituído/inexistente).
- `RequestForm` G1 e página G2 literalmente intactos; os testes anteriores de G1/G2 também
  intactos. Gate completo passou 17/17, incluindo ambos e o novo teste isolado de G4.
- O novo gate consome fixtures expiradas via HTTP real; 16 respostas `400 reset_link_invalid`
  em Chromium (duas tentativas × quatro larguras × duas janelas originais). Campos mantidos até
  serem limpos pelo teste antes das capturas; sem cookie criado e sem marcar token como usado
  ou substituído. Medição SQL confirma janelas originais de 3.600 e 900 segundos.
- Emissão real pelos dois endpoints **não** foi adicionada ao teste G4: fixtures inseridas
  diretamente no cluster descartável. O gate `client-access` continua cobrindo a jornada de
  recuperação por e-mail, uso único, rotação, revogação e rollback de auditoria por HTTP.
- G3, G5, E2–E9, C11, #234, site público, 09C e UX-PRO-10 não alterados. Nenhum novo endpoint,
  migração, script QA ou workflow.

## 3. Verificações locais reais

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run test:unit` (reexecutado após regenerar inventário) | 949/949, 0 fail/skip/cancel/todo |
| `npm run typecheck` | exit 0 |
| `npm run test:ux-portal:pg` (conjunto final) | 17/17, 0 fail/skip/cancel/todo; PostgreSQL descartável + HTTP + Chromium; cleanup true |
| `npm run test:client-access:pg` | 27/27, 0 fail/skip/cancel/todo; PostgreSQL descartável + HTTP; cleanup true |
| `npm run build` | exit 0 |
| `node scripts/ux-pro-00-inventory.mjs` e `--check` | gerado e conferido; 100 rotas, somente linha de `/cliente/redefinir-senha` alterada nos dois CSVs |
| `git diff --check` | exit 0 |

Histórico de desenvolvimento, não omitido: primeira tentativa do novo teste encontrou corrida de
hidratação (timeout sem resposta); corrigida aguardando networkidle. Segunda encontrou seletor
`role=alert` ambíguo com anunciador Next; restringido ao cartão. A execução pré-correção então
falhou **pelo texto antigo**, como esperado (RED), gerando oito PNGs “antes”. Após a correção,
o conjunto passou 17/17. Ao ampliar o percurso de teclado para cada largura, uma execução
falhou porque a expectativa ainda tinha duas mensagens em vez de oito; corrigida a cardinalidade,
o conjunto final passou 17/17. Não se trata de falha do serviço nem de mock HTTP.

Os 503 dos testes preservados G1/G2 são reais (recusa de auditoria no PostgreSQL descartável).
As rejeições de fetch desses testes são **simulações**, identificadas nos seus registros originais;
não equivalem a transporte interrompido. O recorte novo G4 não simula fetch nem resposta HTTP e
não necessita de 503. Nenhum log bruto de servidor/banco foi versionado.

## 4. Evidências e limites de interpretação

Pasta [UX-PRO-09A-3-evidencias-2026-10-16](UX-PRO-09A-3-evidencias-2026-10-16/):

- `resumo.json`: oito entradas pós-correção, rota/papel público implícito sem sessão, origem
  representada, viewport, tema claro, HTTP e percurso de sete passos **medido em cada largura**.
- `antes/resumo-g4.json`: reprodução RED, duas mensagens antigas e oito capturas; teclado medido
  em 1440 e capturas redimensionadas. Não reivindica teclado independente nas quatro larguras antes.
- `conferencia-png.json`: **16 PNGs**, oito antes e oito depois; assinatura PNG e IHDR conferidos;
  larguras 320/390/768/1440, alturas reais fullPage **850/844/900/900** respectivamente. Viewport
  320x844 produzir imagem 320x850 é esperado (conteúdo completo), não divergência de largura.
- Overflow horizontal 0 nas quatro larguras em ambas as fixtures. Tema claro é o único suportado;
  nenhum alternador noturno foi criado. Campos vazios nas capturas, sem URL/token/cookie/senha.
- Percurso: campo → Tab repetição → Tab botão → Enter/400 → Shift+Tab repetição → Tab botão →
  Enter/400. O ResetForm perde foco para BODY ao desabilitar o botão e não move foco ao erro;
  isso já existia e foi **preservado**, não apresentado como aprovação de acessibilidade. O foco
  programático de G1 pertence ao formulário sem token e não foi alterado.
- Inspeção visual automatizada de captura não é avaliação humana. Não cobre leitores de tela,
  zoom 200%, Windows, provedor SMTP, autorização real de TI ou homologação.

O inventário foi regenerado pelo gerador existente; nenhum CSV editado à mão, nenhum critério
ampliado. Comando reproduzível de captura do recorte novo, sem sobrescrever G1/G2:

```sh
UX_PORTAL_G4_EVIDENCE_DIR=docs/UX-PRO-09A-3-evidencias-2026-10-16 npm run test:ux-portal:pg
```

## 5. Revisão, governança e resíduos numerados

1. **Revisão independente pendente:** revisão técnica do agente conferiu diff mínimo, contratos,
   fixtures, ausência de segredos e integridade dos testes G1/G2; isso NÃO é revisão humana nem
   aprovação independente de PR. Não inventar aprovação; não fazer merge sem revisão concluída.
2. **Checks remotos:** resultados locais acima não são aprovação de CI. Conferir o head final na
   PR, todas as execuções concluídas SUCCESS e base main atual antes de merge. Consulta à proteção
   de branch retornou `403 Resource not accessible by integration`; endpoint de rules retornou `[]`.
   Não inferir ausência de requisitos a partir de permissão insuficiente nem contornar proteção.
3. **G3:** decisão explícita do proprietário necessária; PUT real de troca de e-mail fica em
   `/cliente/app/seguranca`, rota pública só consome confirm_email. Não agir nesta retomada.
4. **G5:** medição das demais entradas segue separada, sem mudança transversal; o foco anterior
   do ResetForm observado aqui não foi corrigido por ampliação de escopo.
5. **Demais limites:** emissão manual/SMTP não exercitada por G4; estado usado/substituído/
   inexistente compartilha a mesma string por código, mas o novo navegador exercita só expirado.
   E2–E9/C11 exigem autorização por item, #234 é alheia, 09B só diagnóstico, 09C/10 não iniciados.
   Sem UAT/aceite/WCAG, homologação/produção NO-GO.

## 6. Prompt completo de retomada (não avançar a fila)

```text
Trabalhe no repositório berger33/gruposegsystemseguranca, partindo da main remota mais recente
na branch fixada pela sessão Arena. Leia AGENTS.md, README.md,
docs/ARENA-PRESERVAR-FUNCIONALIDADES.md,
docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md,
docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md,
docs/UX-PRO-09A-ESCOPO-ANTES-2026-10-15.md,
docs/UX-PRO-09A-2-ESCOPO-ANTES-2026-10-16.md,
docs/UX-PRO-09A-2-RELATORIO-2026-10-16.md,
docs/UX-PRO-09A-3-ESCOPO-ANTES-2026-10-16.md e
docs/UX-PRO-09A-3-RELATORIO-2026-10-16.md. Confirme SHA da main e reconcilie PRs/checks no GitHub;
não use cópia local antiga. G1 #250 e G2 #251 estão MERGED; não reabra. #234 permanece alheia:
não tocar, complementar ou mesclar.

Execute SOMENTE a retomada UX-PRO-09A-3 — G4, sem duplicar trabalho já integrado. Localize a PR
aberta desta fatia pela branch arena/055fb215-gruposegsystemseguranca e confira o head final e a
base main. A alteração é somente a mensagem reset_link_invalid em /cliente/redefinir-senha:
“Este link de redefinição não é mais válido. Ele tem prazo de validade, uso único e é substituído
quando um novo é emitido. Peça outro link.” Há duas origens: recover = 1 h; manual TI = 15 min.
Não altere nenhum prazo, endpoint, payload, política de senha, sessão/cookie, auditoria, MFA,
rate limit, 202 genérico, uso único/substituição, permissão, isolamento, dados ou operação local.
Preserve literalmente o comportamento e testes G1/G2. Confira os resíduos 1 e 2 do relatório:
revisão independente pendente e validação dos checks remotos do head final; não invente revisão
humana e não interprete 403 de proteção como ausência de requisito.

Resolva somente comentários bloqueadores referentes a G4. Revalide npm run test:unit, npm run
typecheck, npm run test:ux-portal:pg e npm run test:client-access:pg (PostgreSQL descartável +
HTTP real + Chromium no gate portal), build e inventário --check conforme delta. Evidências antes/
depois estão em docs/UX-PRO-09A-3-evidencias-2026-10-16/: 16 PNGs conferidos, resumo.json,
antes/resumo-g4.json e conferencia-png.json. Se houver novas capturas, regenere pelo gerador
node scripts/ux-pro-00-inventory.mjs e confirme --check; não edite CSV nem amplie critério.
Não crie endpoint, migração, script QA ou workflow. Use somente massa sintética em banco
descartável. Não publique token, senha, cookie, credencial ou dado real. Falha de serviço, se
necessária, deve ser 503 real por recusa de auditoria no PostgreSQL descartável; fetch simulado
precisa ser declarado simulação. Meça rota/largura/tema/teclado com vários passos e confira PNGs.

Mantenha UMA PR pequena desta fatia; não abra duplicata se ainda estiver aberta. Se já MERGED,
confirme SHA do merge e presença na main e não reabra. Só faça merge com todos os checks
obrigatórios realmente verdes (nada cancelado/pulado/em fila), revisão concluída e base main
confirmada. Depois confirme estado MERGED e SHA na main. Se faltar revisão/check verde ou
houver bloqueio, não avance nem mergeie: registre a evidência e entregue prompt de retomada
desta mesma fatia. Atualize relatório com preservações, verificações, resíduos numerados e
limitações, e entregue o prompt completo seguinte no modelo do plano mestre.

G3 depende de decisão explícita do proprietário, não alterar; G5 é separado sem mudança
transversal; E2–E9 e C11 dependem de autorização por item; 09B apenas diagnóstico e site público
sem alteração além do logo; 09C e UX-PRO-10 não começam nesta retomada. Não declare aceite
humano, WCAG ou prontidão de homologação/produção: ambas continuam NO-GO.
```

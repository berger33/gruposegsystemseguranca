# UX-PRO-09A — escopo antes da implementação (15/10/2026)

## 1. Base e reconciliação

- Repositório: `berger33/gruposegsystemseguranca`.
- Branch fixa da sessão: `arena/85e48996-gruposegsystemseguranca`.
- `git fetch origin main` e `git ls-remote origin refs/heads/main` confirmaram `origin/main` = **`0e3cfc78c8725b95cebfd57042d532bb95d456f5`**. `HEAD` começou no mesmo SHA; árvore limpa antes deste documento.
- `gh pr view 249`: **MERGED**, base `main`, merge commit `0e3cfc78c8725b95cebfd57042d532bb95d456f5`, 11/11 checks `SUCCESS`. 08A/#244, 08B/#245, 08C/#246, 08D/#247, complemento/#248 e 08E/#249 permanecem integrados.
- A PR #234 (financeiro) continua aberta e é inteiramente alheia; não será alterada.
- Este documento é o registro **anterior à alteração de código**. O inventário abaixo foi conferido nas páginas, layouts, componentes, despachante HTTP, APIs, sessões, migrações, gates e testes presentes no SHA informado. Não contém credenciais, valores de token, cookies ou dados pessoais.

## 2. Inventário real das rotas e classificação

“Canônica” indica fluxo atualmente montado e sustentado por API real; não significa aceite humano ou prontidão de produção. Um protótipo pode usar nomes de domínio semelhantes, mas não deve ser confundido com o fluxo ativo.

| Rota/superfície | Classificação | Papel/guarda e contrato encontrado |
|---|---|---|
| `/admin/entrar` | **Canônica** — entrada única da equipe | Staff sem sessão usa conta individual; papel vem de `auth_staff_profiles`. `GET/POST /api/admin/session`; MFA em `/api/admin/session/mfa`. A navegação pós-login aceita somente `next` interno de `/admin` ou destino do papel. A chave compartilhada fica condicionada ao endpoint de opções e à política de bootstrap; não será ativada. |
| `/cliente/entrar` | **Canônica** — entrada do portal real | `POST /api/auth/login`; contas ativas e confirmadas; MFA, quando habilitado na identidade, exige conclusão em `/api/auth/mfa/complete`. Uma sessão válida leva a `/cliente/app`. A resposta de credenciais continua genérica. |
| `/funcionario` | **Canônica** — portal próprio com formulário de entrada embutido | `/api/employee/session` decide sessão e perfil. Não reutiliza cookie nem papéis de RH/staff. Dados e vínculo laboral são resolvidos no servidor. Não existe página separada de login ou recuperação de funcionário. |
| `/cliente/redefinir-senha` sem parâmetro de link | **Canônica** — solicitação pública de validação manual | A página chama `POST /api/auth/recovery/manual`, que devolve resposta genérica `202`, não envia e-mail e registra solicitação elegível para revisão. Aprovação/revogação fica no fluxo restrito de TI (`/admin/ti`, `/api/admin/client-recoveries`, permissão individual `client_recovery.manage`). |
| `/cliente/redefinir-senha` com link | **Canônica** — redefinição | A página chama `POST /api/auth/reset`. O token é de uso único, não é persistido em claro, e redefinir a senha revoga as sessões existentes. A rota não exige sessão prévia. |
| `/cliente/confirmar-email` | **Canônica** — confirmação inicial de e-mail e solicitação de reenvio | `POST /api/auth/confirm-email` consome apenas tokens `confirm_email`; `POST /api/auth/confirm-email/resend` solicita novo link. Confirmação não cria sessão; a pessoa entra depois. |
| `/cliente/convite` | **Canônica** — aceite de convite de cliente | Inspeção em `GET /api/auth/invite/inspect`; aceite em `POST /api/auth/invite/accept`. Cria identidade `client` pendente de confirmação, não concede vínculo/grant nem cria sessão. |
| `/admin/clientes` — seção de convites | **Canônica** — emissão/revogação administrativa de convite de cliente | `InvitesSection` usa `/api/admin/invites`; exige sessão individual e papel autorizado (Marcelo/TI no endpoint), mesma origem e auditoria. A seção não emite convite de funcionário/staff. |
| `/admin/ti` — recuperação manual | **Canônica** — revisão de recuperação | Lista e autoriza/revoga solicitações pelo endpoint administrativo; só TI individual com grant ativo pode autorizar. Link de recuperação manual é disponibilizado uma vez após evidência; não há e-mail declarado neste canal local. |
| `/cliente/app/seguranca` | **Canônica e protegida** — MFA, sessões e troca de e-mail do cliente | `ClientSpaceProvider` exige sessão; endpoints de segurança exigem sessão ativa e mesma origem. A troca de e-mail é solicitada e confirmada nessa superfície, não em `/cliente/alterar-email`. |
| `/cliente/acesso` | **Canônica para solicitação pública de acesso**, mas não é login nem aceite de convite | Envia pedido pendente a `/api/public/portal-access-requests`; não cria identidade, sessão, permissão ou grant. Incluída para distinguir o caminho de solicitação do fluxo de autenticação. |
| `/admin/funcionarios` e `/api/admin/hr/employees/:id/access` | **Canônica para provisionamento de acesso de funcionário; não é convite** | A API exige permissão `employees.write`, cria identidade própria e credencial temporária para troca obrigatória. Não há token de convite nem rota pública de aceite de funcionário. |
| `/cliente` | **Prévia/landing informativa** | A página declara o portal em preparação e direciona a várias demonstrações. Não é a entrada autenticada, apesar de a existência de fluxos reais estar separada no código. |
| `/cliente/recuperar-senha` | **Prévia** | `PasswordRecoveryPreviewPage` só muda estado local; informa que não envia mensagem nem altera senha. Não chama API. Não será convertida/ativada. |
| `/cliente/alterar-email` | **Prévia** | `ChangeEmailPreviewPage` simula etapas em memória; não autentica, não envia e não atualiza a identidade. |
| `/cliente/seguranca` | **Prévia** | Simulação local de MFA. A superfície real é `/cliente/app/seguranca`. |
| `/cliente/conta` | **Hub de prévias** | A própria página oferece atalhos para demonstrações de acesso/segurança, sem sessão real. |
| `/admin/portal/convites` | **Prévia** | Fluxo de convite demonstrativo; declara não criar nem enviar convites. Não substitui `/admin/clientes`. |
| `/admin/convite` | **Módulo órfão/legado; não ativar** | O componente se intitula “convite administrativo”, mas chama os endpoints genéricos de convite de cliente. O emissor atual só grava `kind='client'` e produz destino `/cliente/convite`; não encontrei emissor/aceite de convite de staff ligado a esta página. A tabela aceitar `kind='staff'` não prova que o fluxo esteja montado. Não redirecionar, corrigir cosmética ou reaproveitar esta página sem decisão própria. |
| Convite público de staff/funcionário | **Não existe rota real** | Nenhuma rota de emissão/aceite de convite staff ou funcionário foi encontrada. O provisionamento de funcionário acima é fluxo administrativo diferente. Não inventar nem ativar. |
| Alias de login, recuperação ou confirmação | **Nenhum redirecionamento de compatibilidade encontrado no escopo** | Os redirecionamentos observados são gates de sessão para as entradas canônicas; não criam uma segunda rota de login. Rotas de prévia continuam distintas. |

### Tema e ambiente

`/admin/entrar` e `/funcionario` têm `data-admin-theme-scope` e alternância dia/noite. As páginas reais de acesso do cliente em `RealAccessShell` não entram nesse escopo e não oferecem alternador: serão avaliadas somente no tema claro que o código realmente suporta. Não propagar o tema staff para o site público nem para as prévias.

### Gates e cobertura existentes no SHA base (antes do código)

| Gate/workflow existente | O que cobre neste recorte | Lacuna residual antes desta subfatia |
|---|---|---|
| `npm run test:ux-portal:pg` (`scripts/qa-ux-portal-postgres.mjs`, Chromium + PostgreSQL descartável); `.github/workflows/ux-portal-delivery.yml` | Contrato e isolamento dos portais funcionário/cliente, estados de leitura, teclado/tablist, rótulos e responsividade; CI executa também `typecheck` e vocabulário dos portais. | Não exercita a tela pública `/cliente/redefinir-senha` nem distingue HTTP 503/rejeição de rede do sucesso nesse formulário. |
| `npm run test:client-access:pg` (`scripts/qa-tenant-postgres.mjs --client-access`) | APIs reais de identidade/convite/confirmação/login/sessão/MFA e recuperação por e-mail `POST /api/auth/recover`, incluindo resposta pública genérica e ciclo do token. | Recuperação por e-mail é outro contrato; não cobre o `POST /api/auth/recovery/manual` usado pela página, nem o estado visual de erro. |
| `npm run test:ux-client-admin:pg` (`scripts/qa-ux-client-admin-postgres.mjs`) | Portal administrativo de cadastros de clientes e jornadas autenticadas de leitura. | Não cobre a entrada/recuperação pública do visitante. |
| `npm run test:admin-entry:pg` e `npm run test:staff-auth:pg` | Entrada da equipe, RBAC, sessão, MFA, CSRF e limites do staff. | Controles de staff são distintos; não testam a solicitação manual do cliente. |
| `npm run test:unit`, `npm run typecheck` e `npm run build` | Guardas estáticas, inventário e compilação do projeto. | Sozinhos não reproduzem resposta HTTP/rede nem foco/overflow no navegador. |

Decisão de cobertura pré-código: estender o gate de browser/PostgreSQL já selecionado para provar o estado `503`, a rejeição de rede, o `202` genérico e a operação por teclado; não criar endpoint, migração nem novo workflow. A comprovação humana, SMTP/provedor real e produção permanecem fora do gate.

## 3. Contratos de autenticação a preservar

- **Staff:** cookie `seg_admin_session`, `HttpOnly`, `SameSite=Lax`, `Secure` quando HTTPS/produção; sessão com linha server-side, revogável e validada por identidade ativa, perfil, papel e epoch. Validade atual: 8 h com MFA verificado e 1 h sem MFA. Papéis são allowlist do servidor; perfil ausente/inativo não recebe fallback. Rate limit padrão: 8 tentativas por IP a cada 15 min, `Retry-After: 900`. MFA usa desafio descartável de 5 min, com limite de tentativas; nenhum cookie de sessão é emitido antes da verificação. Token compartilhado só é bootstrap explícito e fail-closed.
- **Cliente:** cookie `seg_client_session`, `HttpOnly`, `SameSite=Lax`, `Secure` quando aplicável; sessão server-side revogável com hash do token, validade de 8 h. Cinco falhas de login livres; depois espera progressiva de 1/5/15 min por conta+origem e reset conforme regra de 24 h. Erro de credenciais não revela existência de conta. MFA é condicional à configuração da identidade; desafio curto e de uso único, código de recuperação também de uso único.
- **Funcionário:** cookie separado `seg_employee_session`, `HttpOnly`, `SameSite=Lax`, `Secure` quando aplicável; envelope assinado e linha server-side com validade de 12 h. A API exige identidade `employee` ativa, vínculo identidade↔funcionário, estado laboral permitido e epoch válido. Rate limit é separado do staff, com a janela/teto configurados pelo servidor. A troca de senha temporária usa a rota autenticada existente, senha mínima de 12 caracteres e revoga sessões. Não alterar esta política.
- **Convite de cliente:** validade de 7 dias, uso único, revogável; o banco mantém hash do token. Aceite valida a senha no servidor (scrypt; mínimo de 12 caracteres e rejeição de senhas comuns), cria identidade pendente de confirmação e não concede grant. Auditoria obrigatória.
- **Confirmação inicial/reenvio:** token de confirmação de 7 dias e uso único; nova emissão substitui o link anterior. Reenvio limitado a 5 por endereço em 24 h, intervalo mínimo de 2 min. A resposta pública é genérica e não confirma se há identidade.
- **Recuperação por e-mail (`POST /api/auth/recover`):** endpoint real no backend, mas não conectado ao formulário visível atual; resposta pública genérica, token de uso único de 1 h e política de reenvio compartilhada (5/24 h; 2 min). Não conectar esse endpoint nesta subfatia.
- **Recuperação manual atualmente montada:** a página envia o contrato existente `{email}` a `/api/auth/recovery/manual`; a resposta `202` é genérica para preservar anti-enumeração. TI autoriza/revoga com grant e evidência; o link manual atualmente tem validade de 15 min, hash no banco, uso único e pode ser revogado. `POST /api/auth/reset` aplica a senha e revoga sessões na mesma transação.
- **Troca de e-mail real:** a superfície montada é a de conta autenticada `/cliente/app/seguranca`; a API valida sessão ativa e mesma origem, usa `POST/PUT/DELETE` no endpoint atual, token de confirmação de 24 h e auditoria; confirmação atualiza o e-mail da mesma identidade e revoga as sessões. Não alterar endpoint, payload, política de senha, sessão, cookie ou expiração.
- **Auditoria e isolamento:** manter logs de acesso, categorias e transações já existentes; nunca incluir senha, cookie, token bruto, link de uso único ou dado pessoal em evidências/logs. Identidades de staff, cliente e funcionário permanecem isoladas.

## 4. Estados conferidos antes do código

Leitura estática dos componentes/API e dos gates existentes; não representa passagem humana nem captura de todos os estados em todos os viewports.

| Superfície | Inicial/carregando | Sucesso/vazio | Falha e 401/403 | Expirado/usado | Sessão expirada/validação |
|---|---|---|---|---|---|
| `/admin/entrar` | `checking` consulta sessão; depois formulário | login redireciona pelo papel/destino sanitizado; MFA é etapa intermediária | credencial genérica; erro de conexão; resposta API distingue 401/403/429 sem papel de sessão | não se aplica a link | sessão existente válida redireciona; páginas protegidas mandam anônimo ao login. Campos `required`; MFA usa validação de comprimento. |
| `/cliente/entrar` | formulário; ao enviar, botão “Verificando…” | 200/MFA concluído leva ao portal | 401 genérico, 403 de verificação pendente, 429 e indisponibilidade têm texto próprio | não se aplica a link | `/cliente/app/*` redireciona para entrada quando API classifica 401; APIs de dados mantêm 401/403. E-mail/senha `required`. |
| `/funcionario` | leitura da sessão; estados `loading`, `out`, `in`, `failed` | sessão válida abre portal; vazio de dados é próprio do portal | 401 leva ao formulário; falha de rede/503 não deve ser confundida com logout; inativo pode responder 403 | não há link de convite/reset | sessão expirada/revogada retorna ao login; e-mail/senha `required`. A UI inclui estados separados para erro e sessão ausente. |
| `/cliente/redefinir-senha` | sem link: formulário; submissão mostra “Registrando…” | resposta da UI atualmente vira “pedido recebido” independentemente do HTTP; não há lista/vazio | **lacuna G1 abaixo:** 503/rede também troca para mensagem de sucesso; rota pública, não depende de sessão | link inválido/expirado/usado/superseded é condensado pela API em `reset_link_invalid`; senha curta/comum e divergência têm erros visíveis | redefinição bem-sucedida revoga sessões existentes; sem sessão é comportamento esperado. E-mail `required/type=email`; senha mínima 12 no reset. |
| `/cliente/confirmar-email` | sem token: falha de link; com token: “Confirmando…” | token válido ativa a identidade; reenvio tem resposta pública genérica | confirmação falha em mensagem de link; o formulário de reenvio atualmente marca “enviado” sem inspecionar HTTP (G2) | used/expired/superseded não são distinguidos externamente; convite de novo link respeita o limite | não exige sessão; validação do e-mail é nativa. |
| `/cliente/convite` | “Verificando o convite…” | aceite cria conta pendente e direciona à entrada | falha de senha/rede apresenta erro; fluxo público não usa sessão/grant | UI distingue convite usado/expirado/revogado/não encontrado | não abre sessão no aceite. Nome opcional; senha/repetição `required`, mínimo de 12. |
| `/cliente/app/seguranca` | contexto protegido e carregamento de sessão | MFA/sessões/troca executam chamadas reais | endpoints de segurança devolvem 401/403/503; a página mantém mensagens de estado próprias | token de troca inválido/expirado retorna erro | o provedor redireciona a entrada em 401; troca confirmada revoga sessões. Campos de e-mail/token têm rótulos associados. |
| `/cliente/recuperar-senha`, `/cliente/alterar-email`, `/cliente/seguranca`, `/admin/portal/convites` | estado demonstrativo | só muda estado local | não representa falha real de API | status é simulado | sem sessão, token, envio ou alteração de dados. |

“Vazio” em telas de entrada/formulário não é lista vazia: foi classificado como **não aplicável**. No registro pós-implementação, estados efetivamente reproduzidos pelo gate serão separados de estados apenas definidos no código.

## 5. Lacunas reproduzíveis e decisão de escopo

### G1 — escolhida: falha real da solicitação manual de recuperação aparece como sucesso

- Arquivos: `src/app/cliente/redefinir-senha/page.tsx` (`RequestForm`, especialmente o `try/finally`) e `src/server/client-offline-recovery-api.mjs` (`publicRequest`).
- A tela aguarda `fetch` sem examinar `response.ok`; no `finally`, sempre define `sent=true`. O endpoint retorna 503 (`recovery_unavailable`) quando a persistência/auditoria falha e não confirma registro. Portanto, uma falha HTTP ou de rede termina na mensagem de confirmação “Se existir uma conta elegível, a equipe de TI poderá validar o pedido…”.
- Reprodução: abrir `/cliente/redefinir-senha` sem link; informar endereço de teste fictício; fazer `POST /api/auth/recovery/manual` responder 503 ou rejeitar por rede; submeter. Estado atual mostra a confirmação genérica como se o pedido tivesse sido recebido, sem botão de repetição.
- É a menor subfatia coesa: corrigir somente os estados de resposta desta solicitação manual na rota real — sucesso genérico apenas em resposta 2xx; falha de serviço/rede explícita, sem corpo interno nem enumeração e com foco útil/repetição. Payload, endpoint, política 202 genérica, sessão, cookies, senha, expiração, uso único e auditoria permanecem intactos.

### G2 — reenvio de confirmação (deixar separado)

`ConfirmResendForm` em `/cliente/confirmar-email` também não verifica `response.ok` e define `sent=true` no `finally`; um 503/rede pode mostrar o estado posterior de solicitação. Reprodução equivalente, interceptando `POST /api/auth/confirm-email/resend`. É outro formulário/rota; não será incluído nesta PR.

### G3 — confirmação da troca de e-mail (deixar separado)

A troca real está na página protegida `/cliente/app/seguranca` e confirma por `PUT /api/client/security/email-change` com sessão ativa. O texto de entrega manual do serviço de troca aponta para a rota pública `/cliente/confirmar-email`, cujo handler só consome tokens `confirm_email`; a página real não implementa o PUT de troca via link anônimo. A confirmação por token digitado existe dentro de `/cliente/app/seguranca`. Não redirecionar nem misturar estes dois contratos sem decisão específica; não alterar nesta fatia.

### G4 — duração exibida no erro de redefinição (deixar separado)

O texto de erro de `/cliente/redefinir-senha` informa “vale 1 hora”. O endpoint SMTP `POST /api/auth/recover` tem essa validade; o caminho manual atualmente montado gera link de 15 min após aprovação de TI. A mesma rota aceita ambos os tipos de link. A correção correta exige definir uma mensagem que não afirme uma duração errada para uma das origens; não mudar expiração nesta PR.

### G5 — foco nas demais superfícies (medição pendente, sem correção transversal)

As entradas cliente/staff/funcionário e aceite de convite usam `role="alert"`/estados textuais em erros, mas a auditoria estática não demonstra que o foco seja movido para o erro ou para um destino após cada transição. Será medido em percurso real da subfatia correspondente; não fazer mudança compartilhada/transversal nesta entrega.

## 6. Escopo escolhido e exclusões expressas

**Único alvo de código previsto:** `RequestForm` sem link de `/cliente/redefinir-senha`, com regressão de HTTP 503/rede e 202 genérico, percurso de teclado com vários passos e evidência 320/390/768/1440 no tema claro (único que a superfície suporta).

Ficam fora: demais rotas acima, correção de G2–G5, qualquer fluxo órfão, convite de staff/funcionário inexistente, MFA, sessão/cookies, grants/papéis, rate limit, hashing, payloads, contratos de API, enumeração, auditoria, revogação/expiração/uso único, D5/D6 (UX-PRO-08), D7, D8/E6/E8, prévias visuais, passagem integral das prévias (09/10), site público/conteúdo/layouts, remoção de `noindex`, aceitação humana/UAT, declaração WCAG e prontidão de homologação/produção.

Nenhum token, cookie, senha, endereço real ou identificador de cliente será armazenado em captura, log, documento ou resumo. Homologação humana, provedores reais e produção permanecem **NO-GO**.

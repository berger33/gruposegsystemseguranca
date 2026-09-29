# Plano mestre — Comunicação visual padronizada por e-mail para funcionários

> **200 imagens com textos** para e-mails padronizados do Grupo SEG System Segurança Integrada
> aos seus funcionários (campo, supervisão, sede, RH, TI e gestão).
> Data: 29/09/2026 · Status: **plano** (nenhuma imagem produzida; nenhuma cópia aprovada).
> Estudo que sustenta este plano: [01-estudo-do-sistema-publicos.md](01-estudo-do-sistema-publicos.md).
> Catálogo completo das 200 imagens: [03-catalogo-200-imagens.md](03-catalogo-200-imagens.md).
> Planilha de controle: [04-catalogo-imagens.csv](04-catalogo-imagens.csv).

---

## 1. Objetivo

Padronizar a comunicação por e-mail com os funcionários usando uma **família coesa de 200
imagens com texto**, cobrindo:

| Bloco | Categoria | Imagens |
| --- | --- | --- |
| **A** | Boas-vindas (novo colaborador, funções, vínculos, tempo de casa, transições) | 35 |
| **B** | Conta e acesso (criação de conta, confirmação de e-mail, **recuperação de senha**, segurança) | 45 |
| **C** | Datas comemorativas (**aniversário, Natal, Dia da Mulher, Ano Novo** e demais principais) | 100 |
| **D** | Comunicados internos padronizados (holerite, escala, uniforme, treinamento, avisos) — extensão recomendada | 20 |
| | **Total** | **200** |

Os blocos A–C cobrem exatamente os temas solicitados (boas-vindas; criação de conta e
recuperação; datas comemorativas — aniversário, Natal, Dia da Mulher, Ano Novo e demais
principais) e somam 180 imagens. O bloco D completa os 200 com o kit de e-mails operacionais
já previsto nos módulos `communications`/`notifications_center` do sistema — extensão
recomendada que pode ser re-priorizada sem quebrar a contagem.

## 2. Princípios (herdados do projeto)

1. **Sem dado pessoal na imagem.** Nome, posto, unidade e data entram no corpo HTML do e-mail
   (merge tags). A imagem é padronizada por categoria — reuso total e conformidade LGPD.
2. **Texto principal em HTML; a imagem leva só a manchete.** Isso garante entregabilidade,
   acessibilidade, dark mode e leitura mesmo com imagens bloqueadas (alt text obrigatório).
3. **Nada inventado.** Sem preços, benefícios não confirmados, número de funcionários/clientes,
   tempo de mercado, licenças ou registros sem confirmação do responsável. Itens que dependem de
   decisão (ex.: cesta natalina, evento) ficam marcados no catálogo como "aguardar confirmação".
4. **Sem pessoas reais sem autorização.** Enquanto não houver autorização de uso de imagem,
   as composições usam ilustração, geometria, ícones e identidade tipográfica — igual às
   imagens conceituais já usadas no site (`public/images/`).
5. **Aprovação antes do envio.** Toda cópia passa por RH/Marcelo; mudanças de identidade visual
   passam por TI. O modelo de templates versionados do sistema
   (rascunho → em_revisão → aprovado) é a base do fluxo.
6. **pt-BR, tom acolhedor e direto**, compatível com a linguagem simples exigida pela FAQ
   interna do portal do funcionário (EMP-19).

## 3. Públicos-alvo e personalização

| Segmento | Quem é | Tom | Prioridade |
| --- | --- | --- | --- |
| Campo — vigilância | Vigilante, portaria/controle de acesso, ronda/supervisão de postos | Valorização, segurança, pertencimento | Alta |
| Campo — limpeza | Limpeza e conservação | Valorização, cuidado | Alta |
| Central/monitoramento | Operadores 24h | Tecnologia, continuidade | Média |
| Supervisão/gerência | Supervisor, gerente de operações | Liderança, responsabilidade | Média |
| Sede/administrativo | RH, administrativo, financeiro | Institucional | Média |
| TI/gestão | TI, Marcelo | Técnico, objetivo | Baixa (transacional) |

**Merge tags suportadas pelo cadastro (RH):** `{{nome}}`, `{{primeiro_nome}}`, `{{cargo}}`,
`{{posto_unidade}}`, `{{escala}}`, `{{gestor}}`, `{{anos_de_casa}}`, `{{matricula}}`.
Regras: fallback sempre ("colega", "nossa equipe"); exibir matrícula só em e-mails
transacionais da própria pessoa; **nunca** expor remuneração, CPF, dados de saúde ou endereço.

**Base de disparo:** `hr_employees` (birth_date, admission_date, cargo, lotação, gestor,
status) + `staff_assignments`/`staff_posts` (posto, cliente de alocação — **não** citar o nome
do cliente no e-mail comemorativo) + `auth_identities` kind='staff'. Envios comemorativos
somente para status **ativo** (e, opcionalmente, afastado com aval do RH).

## 4. Sistema visual

### 4.1 Paleta (tokens provisórios, alinhados ao layout 06 padrão)

| Token | HEX | Uso |
| --- | --- | --- |
| Azul-cobalto (primário) | `#164FD8` | Botões, destaques, fundo de manchete |
| Azul-escuro | `#103AA8` | Títulos sobre claro |
| Azul-profundo | `#09285F` | Fundos escuros, Natal/Ano Novo noturno |
| Tinta (ink) | `#0D2955` | Texto principal |
| Azul-céu (céu claro) | `#82D3FF` | Detalhes, brilhos |
| Céu pálido | `#DFF1FF` | Fundos suaves |
| Pálido | `#F2F8FF` | Fundo do e-mail |
| Cinza-mudo | `#5B7191` | Texto de apoio |
| Branco | `#FFFFFF` | Base |

Acentos por bloco (sempre sobre a base azul, nunca substituindo-a): comemorativas podem usar
**dourado `#E8B84B`** (Natal/Ano Novo/tempo de casa), **rosa `#E56B9C`** (Dia da Mulher,
Outubro Rosa), **verde `#2FA36B`** (janeiro branco/limpeza — cuidado, remeter a saúde/bem-estar),
**âmbar `#F59E0B`** (setembro amarelo). Campanhas de saúde seguem as cores consagradas das
campanhas, com o azul da marca no rodapé/assinatura.

### 4.2 Tipografia

- Manchetes: **Manrope** (a mesma dos títulos do site), peso 800; fallback Arial/Helvetica.
- Apoio: **DM Sans** ou Arial; peso 400/600.
- Tamanho mínimo na imagem: **28 px em arte de 1200 px de largura** (equivalente a 14 px no
  e-mail) — regra de legibilidade para celular.

### 4.3 Elementos fixos de composição

1. **Assinatura de marca**: escudo azul (marca provisória até o logotipo oficial) no canto
   superior esquerdo + wordmark "GRUPO SEG SYSTEM · SEGURANÇA INTEGRADA".
2. **Barra de identidade**: faixa fina azul-cobalto com "Comunicação interna" para e-mails
   institucionais; "Acesso e segurança" para transacionais; "Parabéns / Felicidades" para
   aniversário.
3. **Tagline opcional** no rodapé da arte: "Proteção • Tecnologia • Confiança".
4. **Estilo de cena**: geometria em camadas (linguagem do layout 06), silhuetas ilustrativas
   de posto/portaria/viatura **sem rostos identificáveis**, ícones de escudo, câmera, chave,
   balão de fala, vassoura/pingo de cuidado, confete (comemorativas).
5. **Proibido**: fotos reais de clientes, imagens de CFTV reais, uniformes/placas legíveis,
  armas (serviço é desarmado), preços, logotipos de terceiros, ClipArt genérico.

## 5. Especificações técnicas das imagens

| Peça | Dimensão (export) | Uso | Peso máx. | Formato |
| --- | --- | --- | --- | --- |
| **Hero principal** | **1200 × 600 px** (2× de 600×300) | Topo do e-mail, todos os blocos | 150 KB | JPG q80 (PNG se houver texto fino/ícones) |
| Card compacto | 1200 × 400 px | Bloco B (transacional) e avisos D | 100 KB | JPG q80 |
| Banner de rodapé/assinatura | 1200 × 200 px | Versões com CTA de suporte | 60 KB | PNG-24 |
| Quadrado social/WhatsApp | 1080 × 1080 px | Compartilhável de datas (C) | 200 KB | JPG q85 |

Regras:

- **Área segura**: 40 px de margem lateral em 1200 px; nada essencial nos 80 px inferiores
  (área cortada por pré-visualizações).
- **Largura de e-mail: 600 px** — a imagem em 2× renderiza nítida em retina.
- **Alt text obrigatório** espelhando a manchete (ex.: "Feliz aniversário! A equipe SEG System
  deseja um ótimo dia").
- **Dark mode**: testar arte sobre fundo `#09285F` e sobre branco; bordas arredondadas com
  transparência só em PNG.
- **Compatibilidade**: arte nunca é o único portador do CTA — botão reproduzido em HTML
  (table + bgcolor) para Outlook/Gmail.
- **Produção**: arquivo-fonte editável (Figma/PSD) versionado fora do repositório; no
  repositório entram apenas os exports finais aprovados.

## 6. Estrutura padrão do e-mail

```
┌──────────────────────────────────────────────┐
│ [escudo] GRUPO SEG SYSTEM — SEGURANÇA INTEGRADA │  ← header HTML (40 px)
├──────────────────────────────────────────────┤
│  IMAGEM HERO 1200×600 (manchete + apoio)     │  ← a peça do catálogo
├──────────────────────────────────────────────┤
│  Olá, {{primeiro_nome}},                     │
│  corpo do e-mail em HTML (texto real,        │
│  2–4 linhas curtas), com merge tags          │
│                                              │
│  [ BOTÃO CTA — HTML, fundo #164FD8 ]         │
├──────────────────────────────────────────────┤
│ Rodapé: contatos, política, link de          │
│ preferências/descadastro de datas, aviso     │
│ "não responda a este e-mail" quando automático│
└──────────────────────────────────────────────┘
```

- Assunto padronizado: `{{categoria}} — Grupo SEG System` (tabela de assuntos no catálogo).
- Remetente: `MAIL_FROM` já previsto como
  `Grupo Seg System Segurança Integrada <contato@gruposegsystemseguranca.com.br>`.
- Links absolutos com `PUBLIC_BASE_URL` (já usado nos convites).
- E-mails transacionais (bloco B): sem rodapé de descadastro. Comemorativos (bloco C):
  **descadastro de datas comemorativas em 1 clique** (registro em preferências do funcionário).

## 7. Nomenclatura, pastas e templates

**Arquivo:** `cv-{bloco}{nn}-{slug}-{variante}-{formato}.jpg`
Exemplos: `cv-a01-boas-vindas-geral-classico-hero.jpg`, `cv-b22-recuperacao-link-enviado-escudo-hero.jpg`,
`cv-c17-natal-classico-quadrado.jpg`.

**Pastas:** exports aprovados em `public/emails/{bloco}/…` (servidos junto ao app) e registro
do uso em template. **Chaves de template** (compatíveis com `crm_notification_templates`,
proposta de coluna `hero_image`):

- Transacionais: `staff_invite_issue`, `staff_invite_resend`, `staff_invite_reminder_3d`,
  `staff_invite_expired`, `staff_invite_accepted`, `staff_email_confirm`,
  `staff_email_confirmed`, `staff_password_reset`, `staff_password_reset_done`,
  `staff_security_mfa_*`, `staff_email_change_*`, `staff_account_status_*`…
- Comemorativas/operacionais: `comm_birthday`, `comm_christmas`, `comm_new_year`,
  `comm_womens_day`, `comm_workers_day`, `comm_security_guard_day` (20/06),
  `comm_cleaning_day` (16/05), `comm_mothers_day`, `comm_fathers_day`, `comm_health_january_white`,
  `comm_health_september_yellow`, `comm_health_october_pink`, `comm_health_november_blue`,
  `comm_work_anniversary_{1,2,3,5,10,20}`, `comm_payslip_available`, `comm_shift_published`,
  `comm_training_due`, `comm_uniform_ready`, `comm_portal_maintenance`…

## 8. Distribuição detalhada dos 200

### Bloco A — Boas-vindas (35)

| Grupo | IDs | Qtd |
| --- | --- | --- |
| Boas-vindas geral (6 variantes visuais da mesma mensagem) | A01–A06 | 6 |
| Por função (vigilante, supervisor, gerente, portaria, central, limpeza, ronda, sede) | A07–A14 | 8 |
| Por vínculo (CLT, temporário/estágio, terceirizado, PJ) | A15–A18 | 4 |
| Tempo de casa (1, 2, 3, 5, 10, 20 anos) | A19–A24 | 6 |
| Transições (transferência de posto, promoção, retorno de afastamento, reativação, mudança de escala, mudança de unidade) | A25–A30 | 6 |
| Acompanhamento inicial (mensagem do gestor, primeiro plantão, checklist 1ª semana, canal RH, FAQ interna) | A31–A35 | 5 |

### Bloco B — Conta e acesso (45)

| Grupo | IDs | Qtd |
| --- | --- | --- |
| Convite/criação de conta (5 composições + reenvios, lembretes de expiração, expirado/revogado, aceite, próximos passos, gestor) | B01–B15 | 15 |
| Confirmação de e-mail (envio, reenvio, confirmado, expirado, já confirmado) | B16–B21 | 6 |
| Recuperação de senha (4 composições + redefinida, sessões encerradas, política de senha, espera progressiva, tentativa suspeita, redefinição assistida, senha recusada) | B22–B33 | 12 |
| Segurança da conta (MFA ×3, troca de e-mail ×2, "não fui eu", novo login, sessão revogada, contas suspensa/reativa/desativada, manutenção do portal) | B34–B45 | 12 |

### Bloco C — Datas comemorativas (100)

| Data | IDs | Qtd |
| --- | --- | --- |
| **Aniversário do colaborador** (variantes, plantão noturno/diurno, gestor/equipe, RH, mural do mês, quadrado, base editável) | C01–C15 | 15 |
| **Natal (25/12)** | C16–C28 | 13 |
| **Ano Novo (01/01)** | C29–C37 | 9 |
| **Dia da Mulher (08/03)** | C38–C45 | 8 |
| Dia do Trabalhador (01/05) | C46–C50 | 5 |
| **Dia Nacional do Vigilante (20/06)** | C51–C60 | 10 |
| Dia do Profissional de Limpeza (16/05) | C61–C65 | 5 |
| Dia das Mães (2º dom. de maio) | C66–C69 | 4 |
| Dia dos Pais (2º dom. de agosto) | C70–C73 | 4 |
| Janeiro Branco — saúde mental | C74–C76 | 3 |
| Setembro Amarelo — prevenção ao suicídio | C77–C79 | 3 |
| Outubro Rosa — saúde da mulher | C80–C82 | 3 |
| Novembro Azul — saúde do homem | C83–C85 | 3 |
| Dia do Amigo (20/07) | C86–C87 | 2 |
| Aniversário da empresa (data a confirmar) | C88–C90 | 3 |
| Confraternizações (convite, lembrete, agradecimento) | C91–C93 | 3 |
| Feriados nacionais com aviso de escala (21/04, 07/09, 12/10, 15/11) | C94–C97 | 4 |
| Páscoa (C98) e Dia das Crianças (C99–C100) | C98–C100 | 3 |

### Bloco D — Comunicados internos padronizados (20)

Holerite (3), escala de plantão (2), uniforme (2), treinamento (2), documentos (2),
procedimento (1), novidade do portal (1), alerta operacional/clima (1), campanha de segurança
no posto (1), boas práticas de senha (1), LGPD no dia a dia (1), PWA do funcionário (1),
pesquisa interna (1), mudança de horário/escala (1). IDs D01–D20.

## 9. Fluxo de produção (por lote de ~10 imagens)

1. **Briefing do lote** — categoria, IDs, textos do catálogo, data-alvo.
2. **Redação/aprovação de cópia** — RH/Marcelo aprovam manchete + apoio + assunto
   (comentário registrado; ajustes voltam ao catálogo).
3. **Arte** — composição no sistema visual (item 4); produção em 1200×600 + variantes.
4. **Revisão técnica** — checklist de aceite (item 11): contraste, peso, área segura,
   ortografia, alt text, proibições do item 2.
5. **Aprovação final** — RH/Marcelo (e TI para arte de sistema/segurança).
6. **Publicação** — export para `public/emails/{bloco}/` + registro no CSV de controle
   (`04-catalogo-imagens.csv`, coluna `status`: planejada → em_arte → em_revisão →
   aprovada → publicada).
7. **Vinculação ao template** — chave de template + assunto + hero no cadastro de templates
   (hoje manual; no futuro, tela de administração).

**Ritmo estimado:** 2 lotes/semana (≈20 imagens) → 200 imagens em **≈10 semanas** com 1
designer em meio período. Com gerador de imagem + designer revisando, 4–5 semanas.

## 10. Governança, LGPD e conformidade

- **Finalidade e base**: e-mails comemorativos = relacionamento/valorização (interesse
  legítimo, com **opt-out**); transacionais = execução do contrato/segurança (sem opt-out).
- **Aniversário**: uso de `birth_date` apenas dia/mês; nunca divulgada idade.
- **Dia da Mulher / Outubro Rosa**: **não inferir gênero** de cadastro. Envio para toda a
  equipe (homenagem às mulheres da operação) ou lista consentida declarada; nunca segmentar
  por campo sensível não declarado.
- **Campanhas de saúde**: informativas, sem diagnóstico; Setembro Amarelo sempre com o
  **CVV 188** (voluntário e gratuito) e canal interno de apoio; nunca em tom de cobrança.
- **Opt-out** de datas comemorativas registrado por funcionário e respeitado nos envios.
- **Envios de teste** apenas para caixas `@test.invalid` (padrão do projeto); nenhum dado real
  em homologação.
- **Auditoria**: envios sazonais registrados (quem disparou, público, template) — reutilizar a
  trilha de auditoria existente.

## 11. Checklist de aceite (por imagem)

- [ ] Manchete ≤ 8 palavras; apoio ≤ 18 palavras; 1 ideia por imagem.
- [ ] Fonte mínima 28 px @1200 px; contraste AA (4,5:1) no texto da arte.
- [ ] Paleta da marca + acento permitido do bloco; escudo/wordmark presentes.
- [ ] Área segura respeitada; nada essencial nos 80 px inferiores.
- [ ] Export ≤ peso máximo; JPG/PNG conforme especificação.
- [ ] Alt text preenchido (= manchete); assunto do e-mail definido.
- [ ] Sem dado pessoal, sem promessa, sem foto real não autorizada, sem terceiros.
- [ ] pt-BR revisado (acordo ortográfico); siglas da empresa corretas.
- [ ] Aprovado por RH/Marcelo (+ TI se envolver arte de sistema); status atualizado no CSV.

## 12. Integração futura com o sistema (não escopo deste plano)

1. **HTML nos e-mails transacionais**: evoluir `sendAuthEmail` para HTML com hero
   (bloco B), mantendo fallback em texto puro.
2. **Coluna `hero_image`** em `crm_notification_templates` + tela de administração de
   templates com pré-visualização (RH/Marcelo) e versionamento já existente.
3. **Job sazonal**: varredura diária de `hr_employees` (birth_date/admission_date) disparando
   `comm_birthday`/`comm_work_anniversary_*` com opt-out consultado; agenda de datas fixas.
4. **Painel de preferências** do funcionário (comemorativas sim/não) no portal EMP.
5. **SMTP**: escolher provedor e preencher `MAIL_HOST/PORT/SECURE/USER/PASSWORD/FROM`
   (já previstos no `.env.example`) antes do primeiro envio real.

## 13. Roadmap (ondas de produção)

| Onda | Período | Conteúdo | Imagens |
| --- | --- | --- | --- |
| 0 — Guia | Semana 1 | 10 imagens-guia, 1 de cada família (A01, A07, B01, B16, B22, B26, C01, C16, C29, D01) para validar estilo | 10 |
| 1 — Transacional + fim de ano | Semanas 2–4 | Resto do bloco B (41) + Natal (C17–C28, exceto C16), Ano Novo (C30–C37), Outubro Rosa (C80–C82), Dia das Crianças (C99–C100), Novembro Azul (C83–C85), feriados 12/10 e 15/11 (C96–C97) | 71 |
| 2 — Pessoas | Semanas 5–6 | Resto de boas-vindas (A02–A06, A08–A35 = 33) + aniversário (C02–C15) + Janeiro Branco (C74–C76) | 50 |
| 3 — 1º semestre 2027 | Semanas 7–8 | Dia da Mulher (C38–C45), Trabalhador (C46–C50), Limpeza 16/05 (C61–C65), Mães (C66–C69), **Vigilante 20/06** (C51–C60), Amigo (C86–C87) | 34 |
| 4 — Completude | Semanas 9–10 | Pais (C70–C73), Páscoa (C98), Setembro Amarelo (C77–C79), cívicos (C94–C95), empresa (C88–C90), confraternização (C91–C93), bloco D restante (D02–D20) | 35 |

Calendário imediato a partir de 29/09/2026: Outubro Rosa e Dia das Crianças (out/26),
Novembro Azul e Finados/Proclamação (nov/26), Natal (dez/26), Ano Novo (jan/27),
Janeiro Branco (jan/27), Dia da Mulher (08/03/27), Páscoa (28/03/27), Tiradentes (21/04/27),
Dia do Trabalhador (01/05/27), Dia do Profissional de Limpeza (16/05/27), Dia das Mães
(09/05/27), **Dia Nacional do Vigilante (20/06/27)**, Dia do Amigo (20/07/27), Dia dos Pais
(08/08/27), Independência (07/09/27), Setembro Amarelo (set/27).

## 14. Métricas de sucesso

- Entrega/bounce por campanha (meta: bounce < 2%).
- Abertura de comemorativas (referência: > 55% em lista interna) e cliques no CTA.
- Transacionais: taxa de conclusão do fluxo (convite → aceite; recuperação → nova senha).
- Descadastros < 10% (acima disso, rever frequência/tom).
- Checklist de aceite 100% preenchido no CSV antes de "publicada".

## 15. Riscos e pendências

| Risco/pendência | Impacto | Mitigação |
| --- | --- | --- |
| SMTP não escolhido | Nenhum envio real | Produzir imagens agora; envio após configuração (item 12.5) |
| Logotipo oficial/licença pendentes | Rework visual | Usar escudo provisório parametrizado; substituição em 1 lote |
| Cópia não aprovada (RH/Marcelo) | Retrabalho | Aprovação por lote antes da arte |
| Benefícios não confirmados (cesta, evento) | Promessa indevida | Marcado "aguardar confirmação" no catálogo |
| Datas comemorativas exageradas | Fadiga/descadastro | Calendário com no máx. 1 campanha/mês + opt-out |
| Fotos reais de equipe | LGPD | Só ilustração até haver autorização formal |

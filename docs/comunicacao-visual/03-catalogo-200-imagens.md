# 3. Catálogo completo — 200 imagens com textos para e-mails aos funcionários

> Fonte única de verdade da produção. Cada linha = **1 imagem**. Textos em pt-BR, rascunhos
> **sujeitos a aprovação do RH/Marcelo** antes da arte final. Nenhum dado pessoal entra na
> imagem: nome/posto/data ficam no corpo HTML do e-mail (merge tags `{{ }}`).
> Especificações e regras visuais: [02-plano-mestre-200-imagens.md](02-plano-mestre-200-imagens.md).
> Controle de status: [04-catalogo-imagens.csv](04-catalogo-imagens.csv).

**Formato padrão:** hero 1200×600 (marcado "compacto" quando 1200×400, "quadrado" quando
1080×1080, "mural" quando banner de corredor 1200×400). **CTA** = botão em HTML (não embutido
na arte).

> **Regra do logo (definitiva):** toda menção a "escudo" na direção visual significa o
> **logotipo oficial** (`public/brand/454751406_..._n.jpg` / recorte
> `producao/brand/logo-oficial.png`), reproduzido fielmente — **nunca usar outro logo**,
> símbolo inventado ou versão estilizada. Ícones decorativos (cadeado, ampulheta, relógio,
> refresh etc.) não substituem nem imitam o logo.

**Contagem:** A (boas-vindas) 35 · B (conta e acesso) 45 · C (datas comemorativas) 100 ·
D (comunicados internos) 20 → **200**.

---

## BLOCO A — BOAS-VINDAS (35 imagens)

### A01–A06 · Boas-vindas geral
**Assunto:** `Bem-vindo(a) ao time SEG System, {{primeiro_nome}}!` · **Gatilho:** aceite do convite / primeiro login concluído.

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| A01 | Clássica | Bem-vindo(a) ao time! | Sua jornada de proteção e cuidado começa agora. | Acessar o portal do funcionário | Camadas geométricas azul-cobalto `#164FD8` com céu pálido; escudo à esquerda |
| A02 | Azul-profundo | *(cópia de A01)* | *(cópia de A01)* | *(cópia de A01)* | Fundo `#09285F`, linha de luz `#82D3FF`, escudo com brilho |
| A03 | Equipe ilustrada | *(cópia de A01)* | *(cópia de A01)* | *(cópia de A01)* | Silhuetas (sem rostos) de equipe de posto em azul monocromático |
| A04 | Campo/viatura | *(cópia de A01)* | *(cópia de A01)* | *(cópia de A01)* | Ilustração de viatura branca/azul estilizada com escudo |
| A05 | Editorial claro | *(cópia de A01)* | *(cópia de A01)* | *(cópia de A01)* | Fundo `#F2F8FF`, tipografia Manrope grande em `#103AA8`, geometria mínima |
| A06 | Mobile/PWA | *(cópia de A01)* | *(cópia de A01)* | *(cópia de A01)* | Celular com o app do funcionário (ícones de plantão, documentos, chamados) |

### A07–A14 · Boas-vindas por função
**Assunto:** `Bem-vindo(a), {{cargo}} do time SEG System!` · **Gatilho:** contratação/alocação registrada no RH.

| ID | Função | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| A07 | Vigilante | Sua postura protege. Bem-vindo(a)! | Vigilante: presença que faz a diferença. | Acessar o portal | Silhueta de vigilante em posto, escudo e feixe de luz |
| A08 | Supervisor | Supervisão é cuidado com pessoas. | Bem-vindo(a), supervisor(a). Os postos contam com você. | Acessar o portal | Linha conectando postos em um mapa azul |
| A09 | Gerente de operações | Operação conectada começa com você. | Bem-vindo(a) à gestão de operações. | Acessar o portal | Diagrama de nós conectados a um núcleo central |
| A10 | Portaria/controle de acesso | O primeiro cuidado é o acesso. | Bem-vindo(a) à portaria e controle de acesso. | Acessar o portal | Ícones de crachá e chave com fluxo de entrada |
| A11 | Central/monitoramento | Você é a continuidade 24 horas. | Bem-vindo(a) à central de monitoramento. | Acessar o portal | Grade de câmeras estilizada em azul |
| A12 | Limpeza e conservação | Cuidar do ambiente é cuidar das pessoas. | Bem-vindo(a) ao time de limpeza e conservação. | Acessar o portal | Gota de água e brilho sobre ambientes ilustrados |
| A13 | Ronda/supervisão de postos | Cada ronda, uma entrega de confiança. | Bem-vindo(a) à supervisão e ronda. | Acessar o portal | Percurso pontilhado com pontos de checagem |
| A14 | Sede/administrativo | Quem apoia o campo, protege tudo. | Bem-vindo(a) ao time administrativo. | Acessar o portal | Camadas de documentos e geometria editorial |

### A15–A18 · Boas-vindas por vínculo
**Assunto:** `Seu vínculo com o SEG System começou` · **Gatilho:** admissão concluída (status em_adissão → ativo).

| ID | Vínculo | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| A15 | CLT | Carteira assinada, futuro em comum. | Bem-vindo(a) oficialmente ao time. | Acessar o portal | Escudo com selo de confirmação |
| A16 | Temporário/estágio | Toda experiência constrói carreira. | Bem-vindo(a)! Vamos aprender juntos. | Acessar o portal | Degraus ascendentes em azul |
| A17 | Terceirizado alocado | Você faz parte do time onde atua. | Bem-vindo(a) à operação SEG System. | Acessar o portal | Peças se encaixando (azul sobre azul-claro) |
| A18 | PJ/parceiro | Parceria é proteção em conjunto. | Bem-vindo(a) ao ecossistema SEG System. | Acessar o portal | Aperto de mãos estilizado em linhas |

### A19–A24 · Tempo de casa (aniversário de admissão)
**Assunto:** `{{anos}} anos protegendo com a gente. Obrigado(a), {{primeiro_nome}}!` · **Gatilho:** aniversário de `admission_date`.

| ID | Marco | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| A19 | 1 ano | 1 ano de história com a gente! | Obrigado(a) por este primeiro ano de proteção e cuidado. | Ver minha trajetória | Medalha "1" dourada `#E8B84B` sobre azul |
| A20 | 2 anos | 2 anos construindo confiança. | Cada plantão fortalece nossa parceria. | Ver minha trajetória | Medalha "2" + trilha |
| A21 | 3 anos | 3 anos de parceria de verdade. | Obrigado(a) por seguir crescendo com a gente. | Ver minha trajetória | Medalha "3" + trilha |
| A22 | 5 anos | 5 anos! Metade de uma década protegendo pessoas. | Sua entrega inspirou o time todo este tempo. | Ver minha trajetória | Medalha "5" com lauréis |
| A23 | 10 anos | 10 anos de dedicação. Orgulho de ter você. | Uma década de história escrita com você. | Ver minha trajetória | Medalha "10" com lauréis e brilho |
| A24 | 20 anos | 20 anos. Uma carreira inteira de proteção. | Gratidão por duas décadas de confiança. | Ver minha trajetória | Medalha "20" + linha do tempo |

### A25–A30 · Transições
**Gatilho:** eventos de RH (histórico versionado).

| ID | Evento | Assunto | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- | --- |
| A25 | Transferência de posto | `Novo posto, mesma entrega — SEG System` | Novo posto, mesma entrega. | Boa sorte na nova alocação. Estamos com você. | Ver meu novo plantão | Pino de mapa com escudo |
| A26 | Promoção/nova função | `Parabéns pela nova função!` | Você cresceu, a gente viu. | Parabéns pela nova função, {{primeiro_nome}}. | Ver detalhes | Seta ascendente com estrela |
| A27 | Retorno de afastamento | `Bem-vindo(a) de volta ao time` | Bem-vindo(a) de volta! | Seu retorno fortalece o time. Retome no seu ritmo. | Ver meus plantões | Porta se abrindo com luz azul |
| A28 | Reativação de conta | `Sua conta está ativa novamente` | Sua conta está ativa de novo. | Acesse o portal e retome de onde parou. | Entrar no portal | Escudo com check verde-azulado |
| A29 | Mudança de escala | `Sua nova escala foi publicada` | Nova escala, novo ritmo. | Confira seus próximos plantões no portal. | Ver minha escala | Relógio com turnos destacados |
| A30 | Mudança de unidade/filial | `Nova unidade, novo capítulo` | Nova unidade, novo capítulo. | Boas-vindas à sua nova lotação, {{primeiro_nome}}. | Ver minha unidade | Prédios conectados em camadas |

### A31–A35 · Acompanhamento inicial (primeira semana)
**Gatilho:** cronograma D+1 a D+7 da admissão.

| ID | Momento | Assunto | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- | --- |
| A31 | Mensagem do gestor | `{{gestor}} te dá boas-vindas` | Sua liderança te dá boas-vindas. | {{gestor}} deixou uma mensagem para você. | Ler mensagem | Balão de fala com escudo |
| A32 | Primeiro plantão | `Seu primeiro plantão é {{data}}` | Primeiro plantão: conte com a gente. | Checklist do primeiro dia no corpo deste e-mail. | Ver meu plantão | Relógio + escudo + rota |
| A33 | Checklist 1ª semana | `Sua primeira semana, passo a passo` | Sua primeira semana, passo a passo. | Documentos, uniforme e treinamento: acompanhe no portal. | Abrir meu checklist | Lista com checks numerados |
| A34 | Canal com o RH | `Dúvidas? O RH está perto de você` | Dúvida? O RH está perto de você. | Atendimento interno com protocolo e prazo de resposta. | Abrir chamado com o RH | Fone/balão com protocolo |
| A35 | FAQ interna | `Respostas rápidas para o seu dia a dia` | Respostas rápidas para o dia a dia. | FAQ interna: simples, direta e de baixo consumo de dados. | Consultar a FAQ | Ponto de interrogação em camadas azuis |

---

## BLOCO B — CONTA E ACESSO (45 imagens)

### B01–B15 · Convite e criação de conta
**Assunto base:** `Seu acesso ao portal do funcionário — Grupo SEG System` · **Gatilho:** emissão/estado do convite staff (`staff_invite`).

| ID | Momento | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| B01 | Convite inicial (clássica) | Seu acesso está pronto. | Crie sua conta com o convite abaixo. Válido por 7 dias, uso único. | Criar minha conta | Cobalto + camadas + escudo com chave |
| B02 | Convite inicial (escudo hero) | *(cópia de B01)* | *(cópia de B01)* | *(cópia de B01)* | Escudo gigante com fecho de cadeado abrindo |
| B03 | Convite inicial (dark) | *(cópia de B01)* | *(cópia de B01)* | *(cópia de B01)* | Fundo `#09285F` com pontos de acesso iluminados |
| B04 | Convite inicial (mobile/PWA) | *(cópia de B01)* | *(cópia de B01)* | *(cópia de B01)* | Celular com tela de cadastro do portal |
| B05 | Convite inicial (editorial) | *(cópia de B01)* | *(cópia de B01)* | *(cópia de B01)* | Fundo claro, tipografia grande, geometria fina |
| B06 | Reenvio | Reenviamos seu convite. | O link anterior foi invalidado. Este vale por 7 dias. | Criar minha conta | Escudo com seta circular (reenvio) |
| B07 | Reenvio (compacto) | *(cópia de B06)* | *(cópia de B06)* | *(cópia de B06)* | Card 1200×400, ícone de reenvio |
| B08 | Expira em 3 dias | Seu convite expira em 3 dias. | Crie sua conta antes do prazo. Precisa de ajuda? Fale com o RH. | Criar minha conta | Ampulheta com alerta suave |
| B09 | Expira hoje | Último dia do seu convite. | Após hoje, o RH precisará emitir um novo convite. | Criar minha conta | Relógio com marcador no fim |
| B10 | Expirado | Seu convite expirou. | Sem problema: o RH emite um novo convite a qualquer momento. | Pedir novo convite | Convite com selo "expirado" |
| B11 | Revogado | Convite cancelado. | O convite foi cancelado pela administração. Dúvidas? Fale com o RH. | Falar com o RH | Escudo com linha de revogação |
| B12 | Aceite confirmado | Convite aceito. Bem-vindo(a)! | Falta pouco: confirme seu e-mail para ativar tudo. | Confirmar meu e-mail | Escudo com check + passo seguinte |
| B13 | Conta criada | Conta criada com sucesso! | Seu acesso ao portal do funcionário está ativo. | Entrar no portal | Chave + check em camadas azuis |
| B14 | Próximos passos | Três passos e tudo pronto. | 1. Confirme o e-mail · 2. Defina senha forte · 3. Explore o portal. | Continuar | Três ícones numerados conectados |
| B15 | Convite de gestão | Acesso de gestão liberado. | Convite para perfil de supervisão com permissões por posto. | Ativar meu acesso | Escudo com estrela e camadas |

### B16–B21 · Confirmação de e-mail
**Assunto:** `Confirme seu e-mail — Grupo SEG System` (já padronizado no sistema) · **Gatilho:** `email_confirm` / `email_confirm_resend`.

| ID | Momento | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| B16 | Link enviado | Só falta confirmar seu e-mail. | O link vale por 7 dias e é de uso único. | Confirmar e-mail | Envelope com escudo e linha de ação |
| B17 | Link enviado (compacto) | *(cópia de B16)* | *(cópia de B16)* | *(cópia de B16)* | Card 1200×400 |
| B18 | Reenvio | Novo link de confirmação enviado. | O link anterior foi invalidado por segurança. | Confirmar e-mail | Envelope com seta circular |
| B19 | Confirmado | E-mail confirmado! | Sua identidade está verificada. Tudo pronto. | Ir para o portal | Envelope com check verde-azulado |
| B20 | Expirado | Seu link de confirmação expirou. | Peça um novo link — leva segundos. | Reenviar confirmação | Ampulheta suave |
| B21 | Já confirmado | Este e-mail já está confirmado. | Se você não pediu um novo link, ignore esta mensagem. | Ir para o portal | Envelope com selo "ok" |

### B22–B33 · Recuperação de senha
**Assunto:** `Redefinição de senha — Grupo SEG System` · **Gatilho:** `password_reset_request` / `password_reset_complete`.

| ID | Momento | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| B22 | Link enviado (clássica) | Redefinir sua senha? Comece aqui. | O link é de uso único e vale por 1 hora. Se não foi você, ignore. | Redefinir senha | Cadeado aberto + escudo |
| B23 | Link enviado (escudo hero) | *(cópia de B22)* | *(cópia de B22)* | *(cópia de B22)* | Escudo grande com cadeado em destaque |
| B24 | Link enviado (dark) | *(cópia de B22)* | *(cópia de B22)* | *(cópia de B22)* | Fundo profundo, cadeado iluminado `#82D3FF` |
| B25 | Link enviado (compacto) | *(cópia de B22)* | *(cópia de B22)* | *(cópia de B22)* | Card 1200×400 |
| B26 | Redefinida | Senha redefinida com sucesso. | Use sua nova senha no próximo login. | Entrar | Cadeado fechado com check |
| B27 | Redefinida (compacto) | *(cópia de B26)* | *(cópia de B26)* | *(cópia de B26)* | Card 1200×400 |
| B28 | Sessões encerradas | Por segurança, encerramos suas sessões. | Sua senha foi redefinida e as sessões ativas foram finalizadas. | Entrar novamente | Dispositivos com "off" e escudo |
| B29 | Política de senha | Senha forte sem sofrimento. | Use 12+ caracteres ou uma frase-senha. Senhas comuns são recusadas. | Ver dicas | Teclado com cadeado e régua |
| B30 | Espera progressiva | Muitas tentativas? Vamos respirar. | Após várias falhas, o login espera alguns minutos. Nada de bloqueio permanente. | Tentar novamente | Ampulheta com faixas de espera |
| B31 | Tentativa suspeita | Recebemos um pedido de redefinição para sua conta. | Se não foi você, avise aqui — registramos o alerta. | Não fui eu | Alerta com escudo e interrogação |
| B32 | Redefinição assistida | Redefinição assistida concluída. | RH/TI verificaram sua identidade. Defina sua nova senha. | Definir nova senha | Aperto de mãos + cadeado |
| B33 | Senha recusada | Essa senha não passou. | A escolhida está em lista de senhas comuns. Tente uma frase de 12+ caracteres. | Tentar outra | Cadeado com "x" e dica |

### B34–B45 · Segurança da conta
**Gatilho:** eventos `mfa_*`, `email_change_*`, sessões e status de conta.

| ID | Momento | Assunto | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- | --- |
| B34 | MFA ativado | `Segundo fator ativado` | Camada extra ativada. | Seu segundo fator está ativo. Conta mais protegida. | Ir para o portal | Escudo com dois círculos concêntricos |
| B35 | Códigos MFA | `Guarde seus códigos de recuperação` | Guarde seus códigos de recuperação. | Cada código é de uso único. Guarde fora do e-mail. | Ver códigos | Cartões com códigos mascarados |
| B36 | MFA desativado | `Segundo fator desativado` | Segundo fator desativado. | Você pode reativar quando quiser. Recomendamos manter ativo. | Reativar | Escudo com camada apagada |
| B37 | Troca de e-mail (novo) | `Confirme seu novo e-mail` | Confirme seu novo e-mail. | Link de uso único, válido por 1 hora. Após confirmar, encerramos suas sessões. | Confirmar novo e-mail | Dois envelopes com seta |
| B38 | Troca de e-mail (antigo) | `Solicitaram troca do e-mail da sua conta` | Solicitaram troca do e-mail da sua conta. | Se não foi você, cancele e alerte a administração. | Não fui eu | Alerta com escudo |
| B39 | Alerta registrado | `Alerta registrado com sucesso` | Alerta registrado com sucesso. | A administração foi avisada e vai analisar. Nenhuma ação sua é necessária. | — | Check com escudo e sino |
| B40 | Novo login | `Novo acesso à sua conta` | Novo acesso à sua conta. | Detectamos um login em {{data}}. Se não foi você, revise sua senha. | Revisar atividade | Dispositivo com pino de local |
| B41 | Sessão revogada | `Uma sessão foi encerrada` | Uma sessão foi encerrada. | Sessões podem ser revogadas a qualquer momento, por você ou pela administração. | Ver sessões | Lista de sessões com uma apagada |
| B42 | Conta suspensa | `Sua conta foi suspensa` | Sua conta foi suspensa. | Motivo e próximos passos com o RH. Seu histórico permanece intacto. | Falar com o RH | Pausa sobre escudo (sóbrio, sem vermelho alarmista) |
| B43 | Conta reativada | `Sua conta está ativa novamente` | Sua conta está ativa novamente. | Bem-vindo(a) de volta. Seu acesso voltou ao normal. | Entrar no portal | Escudo com check e luz |
| B44 | Conta desativada/desligamento | `Seu acesso ao portal foi encerrado` | Seu acesso foi encerrado. | Documentos e comprovantes seguem disponíveis conforme a política de retenção. Dúvidas: RH. | Falar com o RH | Composição sóbria azul-acinzentada |
| B45 | Manutenção do portal | `Portal em manutenção — {{data}}` | Portal em manutenção. | Em {{data/hora}} o portal ficará indisponível por {{duração}}. Plantões e escalas seguem normais. | Ver aviso completo | Chave inglesa + engrenagem em camadas |

---

## BLOCO C — DATAS COMEMORATIVAS (100 imagens)

### C01–C15 · Aniversário do colaborador
**Assunto:** `Feliz aniversário, {{primeiro_nome}}!` · **Gatilho:** `birth_date` (dia/mês), disparo 07h, opt-out respeitado, só status ativo.

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C01 | Clássica | Feliz aniversário! | A equipe SEG System deseja um dia tão especial quanto você. | — | Confete azul/ciano sobre cobalto |
| C02 | Noturna | *(cópia de C01)* | *(cópia de C01)* | — | Fundo `#09285F` com luzes e estrelinhas |
| C03 | Bolo ilustrado | *(cópia de C01)* | *(cópia de C01)* | — | Bolo com escudo na cobertura |
| C04 | Linha do cuidado | *(cópia de C01)* | *(cópia de C01)* | — | Eixo vertical com corações/estrelas (linguagem layout 10) |
| C05 | Mobile/PWA | *(cópia de C01)* | *(cópia de C01)* | Ver meu dia no portal | Celular com notificação de parabéns |
| C06 | Plantão noturno 12x36 | Feliz aniversário — e obrigado(a) por estar no plantão hoje. | Sua noite de hoje merece comemoração em dobro. | — | Lua + escudo + confete discreto |
| C07 | Plantão diurno | Aniversário em dia de plantão: a comemoração é em dobro. | Obrigado(a) por cuidar de pessoas no seu dia. | — | Sol + escudo |
| C08 | Mensagem do gestor | Seu gestor tem um recado para você. | Felicidades de quem acompanha você de perto. | Ler mensagem | Balão de fala com escudo |
| C09 | Mensagem da equipe | A equipe mandou dizer… | …que hoje o parabéns é todo seu! | — | Vários balões de fala |
| C10 | Institucional RH | Felicidades do RH SEG System. | Seu dia, sua história, nossa gratidão. | — | Escudo com laço |
| C11 | Acolhedora | Hoje o agradecimento é por você existir. | Cuide-se como você cuida dos outros. | — | Tom pastel azul, manta/xícara ilustrada |
| C12 | Aniversariantes do mês (mural) | Aniversariantes do mês | Um mês cheio de motivos para celebrar. | Ver no mural | Painel 1200×400 (nomes só no mural/portal) |
| C13 | Uso interno RH (compacto) | Parabéns do dia: disparo preparado | Envio automático às 07h pelo cadastro (opt-out respeitado). | Conferir lista | Card 1200×400 com relógio |
| C14 | Quadrado WhatsApp | Feliz aniversário! | SEG System celebra com você. | — | Quadrado 1080×1080, confete |
| C15 | Base editável sem texto | — | — | — | Composição neutra (camada de texto vazia para usos especiais) |

### C16–C28 · Natal (25/12)
**Assunto:** `Feliz Natal do time SEG System` · **Gatilho:** agenda 23–25/12 + avisos de recesso.

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C16 | Clássica | Feliz Natal! | Proteção, tecnologia e confiança — também no Natal. | — | Guirlanda em azul/dourado `#E8B84B` |
| C17 | Escudo natalino | Natal protegido é Natal em paz. | Boas festas de todo o time SEG System. | — | Escudo com laço/gorro |
| C18 | Viatura decorada | Nossa gratidão corre 24h. | Para quem cuida dos postos nesta data: obrigado(a)! | — | Viatura ilustrada com guirlanda |
| C19 | Noite azul-neve | Noite de Natal, cuidado sem pausa. | Gratidão às equipes de plantão. | — | Flocos sobre `#09285F` |
| C20 | Mensagem da diretoria | Mensagem de Natal da diretoria | Um ano de proteção, um Natal de gratidão. | Ler mensagem | Carta selada com escudo |
| C21 | Plantão 24/12 | Véspera de Natal no posto: obrigado(a)! | Seu cuidado permite o Natal de muita gente. | — | Posto ilustrado com luzes |
| C22 | Plantão 25/12 | Natal é com você no plantão. | Nossa gratidão pela sua entrega hoje. | — | Árvore com escudo no topo |
| C23 | Escala do recesso | Escala do recesso publicada | Confira seus plantões de fim de ano no portal. | Ver minha escala | Calendário com pinos |
| C24 | Convite confraternização | Confraternização de fim de ano | {{data}} · {{local}} — até lá! *(aguardar confirmação do RH)* | Confirmar presença | Taças/balões em azul-dourado |
| C25 | Benefício de fim de ano | Benefício de fim de ano | O RH envia as orientações nesta semana. *(aguardar confirmação — não prometer)* | Ver comunicado | Caixa com laço (ilustração) |
| C26 | Retrospectiva | 2026: um ano de cuidado | Obrigado(a) por fazer parte desta história. *(sem números inventados)* | Ver no portal | Linha do tempo com marcos genéricos |
| C27 | Último plantão do ano | Último plantão do ano: obrigado(a)! | Que o ano novo chegue com a mesma entrega. | — | Relógio à meia-noite + escudo |
| C28 | Quadrado WhatsApp | Feliz Natal! | Boas festas do time SEG System. | — | Quadrado 1080×1080 |

### C29–C37 · Ano Novo (01/01)
**Assunto:** `Um ano novo de proteção — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C29 | Contagem | 2027 está chegando | Que a virada traga saúde e boas escalas. | — | Números "2027" em degradê azul |
| C30 | Fogos azul | Feliz Ano Novo! | Um ano novo cheio de cuidado por você e por quem você protege. | — | Fogos `#82D3FF` sobre `#09285F` |
| C31 | Diretoria | Boas-vindas a 2027 | Mensagem da diretoria para o novo ano. | Ler mensagem | Carta com escudo e estrela |
| C32 | Primeiro plantão do ano | Primeiro plantão de 2027: obrigado(a)! | O ano começa seguro porque você está no posto. | — | Nascer do sol + escudo |
| C33 | Retomada | Retomamos em ritmo integral | Confira sua escala de janeiro no portal. | Ver minha escala | Calendário de janeiro |
| C34 | Metas e valores | Nosso compromisso em 2027 | Proteção, tecnologia e confiança em cada plantão. | — | Três pilares com ícones |
| C35 | Calendário de janeiro | Janeiro em um olhar | Feriados, escalas e treinamentos do mês. | Abrir calendário | Página de agenda |
| C36 | Segurança primeiro | Em 2027, segurança continua em primeiro | Revise os procedimentos do seu posto no portal. | Ver procedimentos | Escudo com checklist |
| C37 | Quadrado WhatsApp | Feliz 2027! | SEG System — Proteção • Tecnologia • Confiança. | — | Quadrado 1080×1080 |

### C38–C45 · Dia da Mulher (08/03)
**Assunto:** `Dia da Mulher: nossa homenagem — SEG System` · **Regra:** envio para toda a equipe (sem segmentar por gênero inferido).

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C38 | Clássica | Dia da Mulher | A força que protege, cuida e inspira todos os dias. | — | Rosa `#E56B9C` sobre azul da marca |
| C39 | Operação | Mulheres que fazem a diferença | No posto, na central e na sede: obrigado(a)s! | — | Silhuetas femininas ilustradas (sem rostos reais) |
| C40 | Institucional | 8 de março | Nossa homenagem e nosso compromisso com equidade. | — | Laço + escudo |
| C41 | Ilustração | Proteção também tem nome de mulher | Feliz Dia da Mulher do time SEG System. | — | Ilustração editorial azul/rosa |
| C42 | Evento | Roda de conversa de 8 de março | {{data/hora}} na sede. *(aguardar confirmação do RH)* | Confirmar presença | Círculo de cadeiras |
| C43 | Pós-evento | Obrigado pela presença | A conversa de ontem ficou ainda melhor com você. | — | Café + balões de fala |
| C44 | Mural | Dia da Mulher SEG System | Homenagem a todas as mulheres do nosso time. | — | Mural 1200×400 |
| C45 | Quadrado WhatsApp | Feliz Dia da Mulher! | SEG System homenageia você. | — | Quadrado 1080×1080 |

### C46–C50 · Dia do Trabalhador (01/05)
**Assunto:** `1º de maio: obrigado(a) pelo seu trabalho — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C46 | Clássica | Dia do Trabalhador | Todo plantão, toda entrega: nosso obrigado(a). | — | Ferramentas + escudo em camadas |
| C47 | Escalas | 12x36, 6x1, diarista: todas essenciais | Não existe escala pequena na proteção de pessoas. | — | Três relógios com turnos |
| C48 | Institucional | 1º de maio | Trabalho digno é a base da nossa confiança. | — | Mãos ilustradas com escudo |
| C49 | Mural | Dia do Trabalhador | Nosso agradecimento ao time SEG System. | — | Mural 1200×400 |
| C50 | Quadrado WhatsApp | Feliz Dia do Trabalhador! | SEG System agradece você. | — | Quadrado 1080×1080 |

### C51–C60 · Dia Nacional do Vigilante (20/06)
**Assunto:** `20/06 — Dia Nacional do Vigilante: nossa homenagem` · **Base:** Lei 13.136/2015 (data oficial); profissão regulada pela Lei 7.102, em vigor desde 20/06/1983.

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C51 | Clássica | Dia do Vigilante | 20 de junho: orgulho de quem protege com dedicação. | — | Escudo + crachá + estrela |
| C52 | História da profissão | Uma profissão de responsabilidade | Regulamentada desde 1983 — e essencial desde sempre. | — | Linha do tempo 1983 → hoje |
| C53 | Vigilante em posto | Seu posto é nossa frente de cuidado | Feliz dia, vigilante! | — | Posto ilustrado com silhueta |
| C54 | Supervisão | Quem supervisiona também protege | Nossa homenagem a vigilantes e supervisores. | — | Viatura "SUPERVISÃO" estilizada |
| C55 | Escalas noturnas | Obrigado(a) pelas noites protegidas | Vigilância 24h existe porque você existe. | — | Lua + escudo + cidade |
| C56 | Diretoria | Homenagem da diretoria | Ao vigilante que representa nossa marca em cada turno. | Ler mensagem | Carta com escudo |
| C57 | Mural | Dia Nacional do Vigilante | 20/06 — SEG System agradece. | — | Mural 1200×400 |
| C58 | Confraternização | Confraternização do Dia do Vigilante | {{data/local}} — confirme presença. *(aguardar confirmação)* | Confirmar presença | Bandeirinhas + escudo |
| C59 | Família | Sua família também protege com você | Agradecemos a quem espera em casa. | — | Casa + escudo em traço suave |
| C60 | Quadrado WhatsApp | Feliz Dia do Vigilante! | SEG System valoriza você. | — | Quadrado 1080×1080 |

### C61–C65 · Dia do Profissional de Limpeza (16/05)
**Assunto:** `16/05 — Dia do Profissional de Limpeza: obrigado(a)!`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C61 | Clássica | Dia do Profissional de Limpeza | Ambientes seguros começam limpos e cuidados. | — | Gota + brilho + escudo |
| C62 | Homenagem | Cuidar do espaço é cuidar das pessoas | Nossa homenagem ao time de conservação. | — | Mãos com produtos ilustrados |
| C63 | Institucional | 16 de maio | Gratidão a quem mantém tudo em ordem. | — | Calendário marcado + escudo |
| C64 | Mural | Dia do Profissional de Limpeza | SEG System agradece. | — | Mural 1200×400 |
| C65 | Quadrado WhatsApp | Feliz Dia do Profissional de Limpeza! | Seu cuidado faz a diferença. | — | Quadrado 1080×1080 |

### C66–C69 · Dia das Mães (2º domingo de maio)
**Assunto:** `Dia das Mães: nossa homenagem — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C66 | Clássica | Feliz Dia das Mães | Cuidado é a sua linguagem. O nosso também. | — | Coração + escudo em azul pastel |
| C67 | Mães da equipe | Mães do SEG System | Dobro de turno, dobro de coração. | — | Relógio + coração |
| C68 | Mural | Dia das Mães | Homenagem do time SEG System. | — | Mural 1200×400 |
| C69 | Quadrado WhatsApp | Feliz Dia das Mães! | SEG System abraça você. | — | Quadrado 1080×1080 |

### C70–C73 · Dia dos Pais (2º domingo de agosto)
**Assunto:** `Dia dos Pais: nossa homenagem — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C70 | Clássica | Feliz Dia dos Pais | Proteção é um dom que começa em casa. | — | Escudo + casa em traço firme |
| C71 | Pais da equipe | Pais do SEG System | Exemplo que vira postura no posto. | — | Silhueta adulta + pequena |
| C72 | Mural | Dia dos Pais | Homenagem do time SEG System. | — | Mural 1200×400 |
| C73 | Quadrado WhatsApp | Feliz Dia dos Pais! | SEG System abraça você. | — | Quadrado 1080×1080 |

### C74–C76 · Janeiro Branco — saúde mental
**Assunto:** `Janeiro Branco: cuidado também com a mente — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C74 | Campanha | Janeiro Branco | Saúde mental é segurança: cuide-se e cuide do colega. | Saiba mais | Fita branca sobre azul |
| C75 | Dica | Pausa também é protocolo | Respire, hidrate-se, converse com a supervisão. | — | Pausa/relógio com respiração |
| C76 | Mural | Janeiro Branco | Converse sobre saúde mental. | — | Mural 1200×400 |

### C77–C79 · Setembro Amarelo — prevenção ao suicídio
**Assunto:** `Setembro Amarelo: você não está sozinho(a) — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C77 | Campanha | Setembro Amarelo | Prevenção do suicídio é assunto de todos. | Saiba mais | Fita amarela `#F59E0B` sobre azul |
| C78 | Onde buscar ajuda | Precisa conversar? CVV 188 | Apoio gratuito e sigiloso, 24 horas. No trabalho, o RH tem canais de apoio. | Ver canais | Telefone com "188" em destaque |
| C79 | Mural | Setembro Amarelo | CVV 188 · gratuito · sigiloso. | — | Mural 1200×400 |

### C80–C82 · Outubro Rosa — saúde da mulher
**Assunto:** `Outubro Rosa: prevenção é cuidado — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C80 | Campanha | Outubro Rosa | Saúde da mulher em primeiro lugar. | Saiba mais | Laço rosa sobre azul |
| C81 | Prevenção | Check-up marcado? | Prevenção precoce salva vidas. Cuide-se. | — | Calendário com coração rosa |
| C82 | Mural | Outubro Rosa | SEG System apoia a causa. | — | Mural 1200×400 |

### C83–C85 · Novembro Azul — saúde do homem
**Assunto:** `Novembro Azul: cuidar de quem cuida — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C83 | Campanha | Novembro Azul | Saúde do homem também é assunto de plantão. | Saiba mais | Bigode estilizado em azul |
| C84 | Prevenção | Cuide de quem cuida | Consultas de rotina salvam vidas. | — | Escudo + estetoscópio ilustrado |
| C85 | Mural | Novembro Azul | SEG System apoia a causa. | — | Mural 1200×400 |

### C86–C87 · Dia do Amigo (20/07)
**Assunto:** `Feliz Dia do Amigo — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C86 | Clássica | Dia do Amigo | No posto, a confiança vira amizade. Feliz 20 de julho! | — | Duas silhuetas + escudo |
| C87 | Quadrado WhatsApp | Feliz Dia do Amigo! | Amizade também protege. | — | Quadrado 1080×1080 |

### C88–C90 · Aniversário da empresa (data a confirmar)
**Assunto:** `O SEG System completa mais um ano — obrigado(a), time!`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C88 | Clássica | Nosso aniversário é sua conquista | Mais um ano protegendo pessoas com você no time. *(sem números até confirmação)* | — | Bolo com escudo + confete |
| C89 | Retrospectiva | Um ano de história juntos | Veja os momentos do ano no mural. | Ver no portal | Mural de fotos ilustradas |
| C90 | Mural | Feliz aniversário, SEG System | Orgulho de quem constrói essa história. | — | Mural 1200×400 |

### C91–C93 · Confraternizações e integração
**Assunto:** `Confraternização do time — SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C91 | Convite | Confraternização do time | {{data}} · {{local}} — traga sua energia. *(aguardar confirmação)* | Confirmar presença | Bandeirinhas azuis |
| C92 | Lembrete | É amanhã! | Confirme presença e chegue com antecedência. | Confirmar presença | Relógio + balões |
| C93 | Agradecimento | Foi ótimo te ver lá | Que a energia do encontro vá para o plantão. | — | Café + escudo |

### C94–C97 · Feriados nacionais com aviso de escala
**Assunto:** `Feriado de {{nome}} — escala e operação — SEG System` · **Cópia comum:** operação segue 24h; confira a escala no portal.

| ID | Feriado | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C94 | Tiradentes (21/04) | Feriado de Tiradentes | Operação segue 24h. Confira sua escala no portal. | Ver minha escala | Bandeira + calendário |
| C95 | Independência (07/09) | Feriado da Independência | *(cópia de C94)* | Ver minha escala | Bandeira + calendário |
| C96 | 12 de outubro | Feriado de 12 de outubro | *(cópia de C94)* | Ver minha escala | Bandeira + calendário |
| C97 | Proclamação da República (15/11) | Feriado da República | *(cópia de C94)* | Ver minha escala | Bandeira + calendário |

### C98 · Páscoa
**Assunto:** `Feliz Páscoa do time SEG System`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C98 | Clássica | Feliz Páscoa! | Renovação e cuidado para você e sua família. | — | Ovos ilustrados em azul |

### C99–C100 · Dia das Crianças (12/10) — homenagem às famílias
**Assunto:** `Dia das Crianças: homenagem às famílias do time`

| ID | Variante | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- |
| C99 | Clássica | Dia das Crianças | Para as famílias do nosso time: brincar também protege. | — | Pipa + escudo em traço infantil |
| C100 | Quadrado WhatsApp | Feliz Dia das Crianças! | Um dia leve para as famílias do time. | — | Quadrado 1080×1080 |

---

## BLOCO D — COMUNICADOS INTERNOS PADRONIZADOS (20 imagens)

**Assunto padrão:** `{{tema}} — Grupo SEG System (comunicado interno)`

| ID | Tema | Gatilho | Manchete | Apoio | CTA | Direção visual |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | Holerite disponível | Publicação de folha | Seu holerite está disponível | Competência {{mês/ano}} — acesse com seu login no portal. | Abrir holerites | Documento com check |
| D02 | Lembrete de holerite | Não abertura em 5 dias | Holerite esperando você | Você ainda não abriu o documento do mês. Leva menos de um minuto. | Abrir no portal | Envelope com sino |
| D03 | 13º/adiantamento *(aguardar confirmação)* | Cronograma RH | 13º salário: orientações do RH | Cronograma e dúvidas frequentes no comunicado. | Ver cronograma | Calendário com cifrão mascarado |
| D04 | Escala publicada | Publicação de escala | Nova escala publicada | Revise seus plantões e avise a supervisão sobre impossibilidades. | Ver minha escala | Grade de turnos |
| D05 | Confirmar plantão | Véspera de plantão | Confirme seu próximo plantão | Confirme para manter a cobertura do posto. | Confirmar plantão | Check em relógio |
| D06 | Uniforme para retirada | Entrega ao almoxarifado | Uniforme pronto para retirada | Retire no almoxarifado até {{data}}. | Ver orientações | Camisa ilustrada |
| D07 | Troca/devolução de uniforme | Fim de prazo de uso | Troca ou devolução de uniforme | Traga as peças em uso ao RH/almoxarifado. | Ver orientações | Setas circulares em peça |
| D08 | Treinamento agendado | Inscrição confirmada | Treinamento obrigatório agendado | {{curso}} em {{data}}. Presença registrada no portal. | Ver detalhes | Certificado + calendário |
| D09 | Certificado vencendo | Alerta 30 dias | Seu certificado vence em 30 dias | {{curso}} — renove pelo portal sem perder a validade. | Renovar agora | Certificado com ampulheta |
| D10 | Documento vencendo | Alerta de dossiê | Documento com vencimento próximo | Um documento do seu dossiê vence em {{dias}} dias. Renove com o RH. | Ver documento | Pasta com alerta suave |
| D11 | Pendência de envio | Documento faltante | Documento pendente com o RH | Falta enviar: {{categoria}}. Você pode anexar pelo portal. | Anexar agora | Upload com seta |
| D12 | Procedimento atualizado | Nova versão publicada | Procedimento atualizado | O procedimento do seu posto mudou. Confira a versão nova. | Ler procedimento | Documento v1 → v2 |
| D13 | Novidade do portal | Liberação de recurso | Tem novidade no portal | Um recurso novo chegou para facilitar seu dia a dia. | Conhecer | Estrela + interface |
| D14 | Alerta operacional/clima | Evento climático severo | Alerta de tempo severo | Siga as orientações da supervisão para o seu posto. Segurança primeiro. | Ver orientações | Nuvem + raio estilizado |
| D15 | Campanha de segurança no posto | Semana interna | Semana de segurança no posto | Reforce o uso de EPIs e a checagem de rotina. | Ver dicas | Capacete/EPI + escudo |
| D16 | Boas práticas de senha | Campanha trimestral | Sua senha é a chave do posto | 12+ caracteres, nunca compartilhe, troque em caso de suspeita. | Ver recomendações | Cadeado + teclas |
| D17 | LGPD no dia a dia | Campanha semestral | Dados pessoais são responsabilidade de todos | Colete o mínimo, use com finalidade, proteja sempre. | Ver resumo | Escudo + cadeado de dados |
| D18 | PWA do funcionário | Onboarding + campanha | Instale o app do funcionário | Acompanhe plantões e documentos no celular, até offline. | Como instalar | Celular com logo do app |
| D19 | Pesquisa interna | Abertura de pesquisa | Sua voz melhora o time | Responda a pesquisa interna de clima ({{minutos}} minutos). | Responder agora | Gráfico + estrela |
| D20 | Mudança de horário/escala | Aprovação de mudança | Mudança de horário aprovada | Sua nova jornada já está no portal. Dúvidas com a supervisão. | Ver minha jornada | Relógio com seta |

---

## Resumo de contagem

| Bloco | Grupos | Imagens |
| --- | --- | --- |
| A — Boas-vindas | 6+8+4+6+6+5 | **35** |
| B — Conta e acesso | 15+6+12+12 | **45** |
| C — Datas comemorativas | 15+13+9+8+5+10+5+4+4+3+3+3+3+2+3+3+4+1+2 | **100** |
| D — Comunicados internos | 3+2+2+2+2+1×8 | **20** |
| **Total** | | **200** |

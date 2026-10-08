# Guia de apresentação em vídeo — Grupo SEG System (08/10/2026)

> **Natureza deste documento:** proposta de **comunicação**. Não é entrega de produto, não é homologação e
> não autoriza publicar nada. É um plano para transformar o que já existe em vídeos.
> **Base lida:** `README.md`, `docs/UX-00-INVENTARIO-ROTAS.csv` e `docs/FECH-12-INVENTARIO-ROTAS-2026-10-07.csv`
> (98 rotas), `docs/IDENTIDADE-VISUAL-E-APARENCIA-2026-10-07.md`, `docs/ESTADO-EXECUCAO-LOCAL.md`,
> `docs/plano-produto.md`, `docs/referencias-marca.md`, `src/lib/admin-navigation.mjs`, `src/app/**`.
> **Regra que manda em todas as outras:** só aparece no vídeo o que for **verdade no dia da gravação**.
> Roteiros prontos para gravar: [`APRESENTACAO-VIDEO-ROTEIROS-2026-10-08.md`](APRESENTACAO-VIDEO-ROTEIROS-2026-10-08.md).

---

## 0. Resposta curta (o plano em 6 linhas)

1. **Um vídeo para todos não funciona.** O primeiro passo não é roteiro, é escolher **para quem**.
2. Comece por **um trailer de 90 segundos** (por que o sistema existe) e depois **uma série de episódios de 3 minutos**, um por tarefa/jornada.
3. Nunca mostre as 98 rotas. Mostre **a cadeia**: anúncio → lead → proposta aceita → contrato → operação → financeiro → cliente.
4. O "momento uau" precisa acontecer **nos primeiros 30 segundos**, não no minuto 5.
5. Fale de **resultado** ("o pedido do site não se perde"), não de recurso ("temos módulo de CRM com kanban").
6. Diga sempre, em uma frase, o que **ainda não está pronto**. Parece fraqueza e é o que constrói confiança.

---

## 1. Diagnóstico: por que parece impossível (e por que não é)

O que existe hoje, em números:

| Dimensão | Tamanho real | O que o espectador precisa saber |
|---|---|---|
| Rotas/páginas | **98** inventariadas (07/10/2026) | ~5 |
| Apresentações do site público | **10** layouts (01–10), layout **06** em uso | 1 |
| Grupos administrativos | **7** (Visão, Comercial, Entrega, Pessoas, Financeiro/Conformidade, Portais, Sistema) | a ideia de "está tudo agrupado" |
| Papéis internos | `admin`, `ti`, `marcelo`, `comercial`, `rh`, `financeiro`, `operacao`, `supervisor` | 3 |
| Espaços separados | público, staff, funcionário, cliente | 4 |
| Banco | ~179 migrações aplicadas no banco **demonstrativo local** | 0 |

**O erro fatal de quem tem 98 telas é tentar mostrá-las.** Um espectador retém 3 a 5 ideias por vídeo; a partir
disso, ele não lembra de nenhuma. Mostrar tudo dá a sensação de produto confuso, que é o oposto do que o
sistema entrega.

**A boa notícia:** a história deste sistema é simples e cabe em três frases.

> **Posicionamento de trabalho (frase única):**
> *"Um sistema só, que liga o site ao comercial, o comercial ao contrato, o contrato à operação e a operação ao
> financeiro — com cada pessoa vendo apenas o que lhe cabe e cada ação ficando registrada."*

> **A promessa (o que o vídeo vende):** *"Nada mais começa no WhatsApp e termina na planilha de alguém."*

Guarde essa frase. Todo vídeo é uma variação dela.

---

## 2. Decisão nº 1 — para quem é o vídeo (isto decide todo o resto)

O mesmo sistema vira vídeos **diferentes** por público. Executivo quer resultado e uma tela de controle; usuário
final quer "onde eu clico". Misturar os dois no mesmo arquivo arruína os dois.

| Público | Pergunta que ele faz | Duração | Mostrar | Esconder |
|---|---|---|---|---|
| **A. Dono/gestão (Marcelo)** | "Isso me dá controle ou me dá trabalho?" | 3–5 min | cadeia ponta a ponta, painel de pendências, o que vence | tabelas densas, detalhe de tela, jargão |
| **B. Cliente / prospect (empresas)** | "Isso é confiável? Melhora minha vida?" | 60–90 s | site, portal do cliente, documentos, chamados | **toda** a área administrativa |
| **C. Funcionário / RH** | "Como eu faço minha parte?" | 2–4 min por tarefa | o caminho feliz exato, passo a passo | módulos de outras áreas |
| **D. Operação / supervisão** | "Como eu acompanho o posto hoje?" | 3 min | contratos, operação, frota, qualidade | financeiro, RH |
| **E. Técnico (futuro programador/investidor)** | "Dá para manter? É seguro?" | 6–10 min | arquitetura, papéis, auditoria, **limites declarados** | nada — aqui os limites são o argumento |

**Recomendação de ordem:** faça **A** primeiro (é quem aprova), depois **C** (é quem mais vai assistir de novo),
depois **B**. **E** só quando houver alguém técnico do outro lado — e esse vídeo é o mais fácil de fazer, porque a
documentação de limites já existe pronta no repositório.

---

## 3. Arquitetura recomendada: 1 trailer + uma série

Uma produção longa e única perde para uma série curta: quem abandona o minuto 12 não volta.

| Peça | Duração | Papel | Onde vive |
|---|---|---|---|
| **Trailer** | 90 s | faz entender *o que é* e *por que importa* | topo do portal, WhatsApp, apresentação ao dono |
| **Episódios de jornada** (5–7) | 2,5–4 min cada | ensina **uma** tarefa completa | biblioteca interna; envio 1 por dia na implantação |
| **Microvídeos de tarefa** (série longa) | 45–90 s cada | "como eu faço X" no posto de trabalho | base de ajuda, QR code, tela do próprio módulo |
| **Bastidores técnicos** (interno) | 6–10 min | handoff, limites, o que falta | só para o time |

Regra prática: **um objetivo por vídeo**. Se o título precisa de "e" ("Financeiro **e** RH"), são dois vídeos.

---

## 4. A narrativa padrão (use em todos os vídeos)

Estrutura **Tell–Show–Tell** / **Problema → Solução → Resultado**, com tempos de referência para 90 s:

| Tempo | Beat | Conteúdo |
|---|---|---|
| 0–10 s | **Gancho** | o problema na língua do espectador. Nunca logo, nunca "sejam bem-vindos" |
| 10–25 s | **Consequência** | por que aquilo custa caro: retrabalho, informação perdida, decisão sem dado |
| 25–45 s | **O produto** | a ideia em uma frase + a primeira tela real |
| 45–70 s | **A demonstração** | 2 a 3 interações que provam que funciona. Um caminho, sem desvios |
| 70–80 s | **A prova** | o resultado na tela (documento gerado, registro do aceite, pendência resolvida) |
| 80–90 s | **Próximo passo** | uma ação só, clara |

Para 3 minutos, alongue a demonstração — **não** acrescente beats novos.

Três regras de roteiro que mudam o resultado:

- **Show, don't tell.** "Deixar mais simples" não convence; ver a tela fazer em 3 cliques convence.
- **Regra de três.** Três ideias por vídeo, no máximo. Três é o que o espectador repete depois.
- **Mostre o fim primeiro** quando o fluxo é longo (ex.: abra na proposta já aceita e volte para explicar como chegou lá).

---

## 5. O que focar: os 5 destaques *verdadeiros* deste sistema

Escolha 3 para o trailer e distribua os outros na série. Todos são comprováveis no código e na documentação.

1. **A cadeia não se rompe.** Pedido no site → lead no painel → oportunidade no CRM → proposta com aceite por
   link → contrato com postos/SLA → operação → financeiro. O mesmo registro atravessa tudo; ninguém redigita.
   *É o diferencial narrativo: a maioria dos "sistemas" é um conjunto de telas soltas.*
2. **Cada papel vê só o que pode ver — e isso é visível.** Entre como cliente e mostre o portal; entre como
   funcionário e mostre que só existe o próprio registro; mostre o RH aprovando e o TI **não** aparecendo onde não
   decide. Ver o isolamento acontecer na tela é mais forte que dizer "temos segurança".
3. **O cliente tem um portal de verdade.** Documentos, contratos, chamados, cobranças, satisfação, renovação —
   acompanhados por ele, sem pedir print no WhatsApp.
4. **Rastreabilidade.** Ação sensível tem autor, data, motivo e histórico; há trilha de auditoria e retenção
   definida. Para o dono, isso se traduz em: *"quando algo dá errado, dá para saber quem fez, quando e por quê."*
5. **Foi feito para quem não é técnico.** O Marcelo tem tela própria; o TI tem console; o funcionário tem o
   caminho mais curto possível. O sistema reconhece que as pessoas são diferentes.

**Curingas (use 1, curto, se o público for o certo):** ponto com localização e ajuste aprovado pelo RH;
agenda de conformidade com prazos e planos de ação; galeria de layouts do site (só em vídeo de marketing/
administração — ver seção 7); assistentes de consulta por área (**só grave se responderem no seu ambiente** — hoje
o RAG privado depende de Ollama real e isso segue pendente).

---

## 6. O que NÃO falar (lista fechada — vale para todo vídeo externo)

Este repositório tem uma cultura de limite honesto. O vídeo deve seguir a mesma cultura. **Não diga, não insinue,
não deixe a cartela sugerir:**

| Não diga | Diga em vez disso |
|---|---|
| "sistema completo", "pronto", "sistema em produção" | "sistema em construção; esta é a versão de demonstração local, com dados fictícios" |
| "já está no ar", "temos N clientes usando" | "está em desenvolvimento e homologação local; a implantação no servidor de destino é a próxima etapa" |
| "integração com WhatsApp / nota fiscal / assinatura eletrônica / portal de compras públicas" | "o canal do WhatsApp é clique-abrir-conversa; integrações automáticas ainda não existem" |
| "o sistema envia e-mail/telefone/alerta automaticamente" | o envio real depende de provedor; o que existe é o registro e a fila interna |
| "upload de documentos" | "referência documental registrada; upload e armazenamento de arquivo ainda não estão ativos" |
| "relógio de ponto homologado/legal" | "registro de ponto com localização e ajuste aprovado pelo RH — **não** é certificação trabalhista" |
| "auditoria/certificação WCAG, LGPD certificada, ISO" | "trilha de auditoria interna e controles de privacidade previstos e parcialmente implementados" |
| "participamos de licitações" | "há um módulo de licitações; a empresa participar de licitações **não foi confirmado** pelo proprietário" |
| "licença da Polícia Federal / DELESP / alvará" | nada — só se houver documento verificável |
| "atendimento 24h por central própria", "N câmeras", "N postos", "X anos de mercado" | nada disso sem confirmação; ver `docs/referencias-marca.md` |
| "o assistente de IA responde tudo" | só grave se responder no seu ambiente; senão, não filme |
| "temos 10 versões do site" | "dez propostas visuais; a versão em uso é a 06" |

Além disso, no **material**, não use: jargão técnico com público não técnico (migração, RBAC, idempotência,
checksum, gate, PGlite, "deploy"), comparação com concorrentes, promessa de prazo que você não controla, e
número de preço de hospedagem fechado (o teto de R$ 200/mês é referência de **hospedagem**, não custo total).

**Como dizer o limite sem enfraquecer** (o caminho certo): em vez de esconder, transforme em critério de qualidade.
> *"O que ainda não está pronto, eu digo: hoje isso roda em demonstração local. A implantação no servidor de
> destino é a próxima etapa, e ela já tem runbook escrito. Eu prefiro te mostrar o que funciona de verdade do que
> te mostrar uma tela bonita que não faz nada."*

---

## 7. Os 10 layouts: a armadilha

Os dez layouts **existem como propostas visuais** e apenas o layout **06** está configurado como versão do site.
Se o vídeo fizer parecer que "o site tem 10 versões" ou que as outras nove são funcionalidades, você cria uma
expectativa que o sistema não cumpre, e o espectador vai cobrar.

**Regra:**
- Em vídeo para dono/cliente: **mostre só o layout 06** — o site como ele é.
- Em vídeo de marketing/admin/TI: mostre a galeria **nomeando corretamente**, em 5–8 s: *"dez propostas visuais
  aprovadas; uma está ativa, as outras ficam disponíveis para troca quando o conteúdo estiver homologado."*
- Nunca diga que trocar de layout muda funcionalidade ou formulário.

---

## 8. Como gravar (produção)

**Antes (30 minutos de preparação valem 3 horas de edição):**

- [ ] Roteiro fechado e lido em voz alta uma vez com cronômetro (se passar 20% do alvo, corte)
- [ ] Sessão já logada em **cada** papel que vai aparecer (staff, cliente, funcionário) para não gravar login no meio
- [ ] Massa **fictícia** preparada e plausível — nomes, cidades e valores realistas, nunca "Acme/Teste 123"
- [ ] Servidor local de pé pelo caminho oficial (`INICIAR-DEMO-LOCAL.bat`, ver `docs/demo-local-persistente.md`)
- [ ] Navegador limpo: 1920×1080, zoom 100 %, barra de favoritos e extensões escondidas, só a aba necessária
- [ ] Notificações do sistema, do navegador e do celular **desligadas**
- [ ] Segunda tela (ou bloco de notas) com o roteiro resumido em 5 linhas
- [ ] Nada de `.env`, token, terminal com credencial, e-mail real, CPF, placa ou dado pessoal na tela

**Durante:**

- Um **caminho feliz** por take. Errou? Recomeça o take — não tenta "recuperar".
- Pausa de ~1 s **antes** de cada clique e ~1,5 s **depois** do resultado aparecer (é o que dá ritmo na edição).
- Mouse devagar, um clique por ideia. Nada de clicar em coisa que não vai ser explicada.
- Grave o **áudio separado** e narre depois sobre a imagem: sai melhor e você conserta o texto sem regravar a tela.
- Áudio importa mais que imagem: microfone a um palmo da boca, ambiente sem eco, sem ventilador.

**Depois:**

- Corte sem piedade silêncios, hesitações e carregamentos de tela. **Tempo morto é o que faz o vídeo parecer ruim.**
- **Legendas sempre.** Maioria assiste sem som.
- Cartela final: uma frase, um contato, **e a data/versão** ("versão de demonstração — outubro/2026, dados fictícios").
- Publicação interna: link não listado. O vídeo envelhece — carimbe a data e regrave quando o produto mudar.

---

## 9. Anti-padrões (os erros que matam a apresentação)

| Anti-padrão | Por que mata | Correção |
|---|---|---|
| Intro de 10 s com logo + "bem-vindos ao sistema" | gasta o tempo mais caro do vídeo | abra no problema, na tela, em movimento |
| **Despejo de recursos** (feature dump) | 20 recursos = 0 lembrados | 3 ideias por vídeo, sempre |
| Um vídeo só para todos os públicos | não serve a nenhum | separe por papel (seção 2) |
| Mostrar tela de configuração/console/JSON | parece inacabado | mostre a tarefa, não o mecanismo |
| Dado falso óbvio ("João Silva", "Empresa X") | faz o produto parecer brinquedo | massa plausível e específica do setor |
| Voz robótica lendo tela ("agora clico em salvar") | ninguém aguenta | narre o **porquê**, não o clique |
| Terminar sem próximo passo | o espectador não faz nada | um CTA só, no fim |
| Vício de honestidade ao contrário: prometer o roadmap | cria dívida de expectativa | prometa só o que está na tela |
| Exibir limite/pendência na tela durante a demo | quebra o encanto sem necessidade | fale do limite **com sua voz**, no fim, 20 s |
| Demo ao vivo sem plano B | internet/ambiente falha na frente do cliente | tenha o vídeo gravado **e** o roteiro; o vídeo é o plano B |

---

## 10. Perguntas difíceis que vão fazer (e a resposta pronta)

Prepare-se para estas cinco — elas vêm sempre, nesta ordem:

1. **"Quando isso vai para produção?"**
   → "O código está pronto para o próximo passo; a implantação no servidor de destino tem runbook escrito e
   ensaio feito. Falta executar na máquina real e a validação final. Não vou dar data sem essa etapa fechada."
2. **"Quem já está usando?"**
   → "Ninguém em produção, e é proposital. Hoje roda em demonstração local com dados fictícios, para ninguém
   depender de um sistema que ainda não foi validado."
3. **"Quanto custa manter?"**
   → "A hospedagem tem teto de R$ 200/mês. Domínio, e-mail transacional, armazenamento e IA são custos
   adicionais, e eu prefiro dimensionar antes de prometer número."
4. **"E o celular? E o app?"**
   → "As telas são responsivas e funcionam no navegador do celular. Não existe aplicativo instalável — e eu não
   vou dizer que existe."
5. **"Isso substitui o que usamos hoje?"**
   → "Ainda não. O caminho é migrar por partes, começando pelo que dói mais: captação de pedido e contrato.
   Nada de desligar o que funciona antes do novo estar validado."

Guarde também esta, que é a mais perigosa: **"isso é seguro?"** → responda com fatos verificáveis e curtos:
sessão individual por papel, senha com mínimo de 12 caracteres, espera progressiva após falhas, trilha de
auditoria de 12 meses, e a autorização sendo decidida **no servidor**, não na tela.

---

## 11. Plano de execução (uma semana)

| Passo | O que fazer | Tempo | Entregável |
|---|---|---|---|
| 1 | Escolher **1 público** e escrever a frase única daquele vídeo | 1 h | frase + 3 ideias |
| 2 | Escrever o roteiro no modelo da seção 4 (use [`ROTEIROS`](APRESENTACAO-VIDEO-ROTEIROS-2026-10-08.md)) | 2 h | roteiro em 2 colunas (tempo / tela) |
| 3 | Preparar massa fictícia e percorrer o caminho feliz **duas vezes** sem gravar | 2 h | caminho travado, sem surpresa |
| 4 | Gravar e montar **o trailer** primeiro | 3 h | 90 s finalizados com legenda |
| 5 | Gravar **2 episódios** (o do papel mais crítico + o do cliente) | 4 h | 2 vídeos de 3 min |
| 6 | Assistir com uma pessoa do público real e anotar a 1ª pergunta dela | 1 h | ajuste do próximo roteiro |

**Métrica de sucesso:** quantos assistem até o fim (> 60 % é bom; < 50 % significa que está longo) e **quantas
perguntas certas** o vídeo gera ("quando posso usar?", "isso resolve meu problema X?"). Pergunta certa vale mais
que visualização.

---

## 12. Fontes consultadas (boas práticas)

- **Duração e conclusão:** demos de até 2 min têm ~88 % de conclusão; acima de 3 min cai para ~50 % — [DemoSmith](https://demosmith.ai/blog/best-saas-demo-video-examples); 60–90 s é o ponto ideal para página inicial, 90 s–3 min para página de produto — [Vidico](https://vidico.com/news/best-product-demo-video-examples/).
- **Os primeiros segundos:** o gancho pertence aos 0–10 s e o problema vem antes do logo — [DemoPolish](https://demopolish.com/blog/saas-demo-video-best-practices/), [Breadnbeyond](https://breadnbeyond.com/articles/saas-video-guides/).
- **Tell–Show–Tell e regra de três:** [ContentBeta](https://www.contentbeta.com/blog/how-to-write-product-demo-script-examples-template/).
- **Anti-padrão do despejo de recursos e demo único para todos:** [Guideflow](https://www.guideflow.com/blog/software-demo-presentation), [ZoomInfo](https://pipeline.zoominfo.com/sales/software-sales-demo-tips).
- **Dados falsos óbvios prejudicam:** [Guideflow](https://www.guideflow.com/blog/software-demo-presentation).
- **Séries curtas em vez de vídeo longo; tutoriais de 2–5 min e um objetivo por vídeo:** [Vidyard](https://www.vidyard.com/blog/customer-onboarding-videos/), [Vidico — onboarding](https://vidico.com/news/onboarding-videos/), [TechSmith](https://www.techsmith.com/blog/improve-employee-ramp-up-time/).
- **Você organiza por "blocos" por função, não por ordem de menu:** [Great Demo!](https://greatdemo.com/stunningly-awful-demos-top-ten-list-of-demo-donts/).
- **Sistema demonstrável precisa de contexto realista e resposta ao feedback anterior (demo de sistema):** [Hans Samios / SAFe](https://www.hanssamios.com/dokuwiki/why_do_we_do_a_system_demo_in_safe_ssa).

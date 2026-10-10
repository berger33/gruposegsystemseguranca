# Academia Seg System Segurança

Módulo de capacitação com trilhas por setor, progresso e gamificação.
**Status: em construção.** Roda isolado do restante do sistema. Não é linkado pelo menu principal até ser liberado.

## Como rodar

```bash
cd academia
npm start            # http://localhost:3100 (0.0.0.0)
npm test             # testes com node:test, sem dependências
```

Variáveis de ambiente:

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3100` | Porta do servidor |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `ACADEMIA_DATA` | `data/academia.json` | Arquivo de usuários e progresso |
| `ACADEMIA_DEMO_PASSWORD` | `Academia#2026` | Senha dos usuários de demonstração (criada na primeira execução) |
| `NODE_ENV=production` | — | Exige `ACADEMIA_DEMO_PASSWORD` definida ao criar usuários |

Requer Node.js 20 ou superior. Não usa banco nem pacotes externos.

## Usuários de demonstração

Dois usuários por setor. Os nomes são fictícios e a senha é a de demonstração.

| Setor | Início do zero | Com progresso de exemplo |
|---|---|---|
| Funcionário | carla.mendes@academia.exemplo | rafael.nunes@academia.exemplo |
| Cliente | paulo.teixeira@academia.exemplo | lucia.andrade@academia.exemplo |
| RH | juliana.prado@academia.exemplo | marcos.alves@academia.exemplo |
| Comercial | renata.costa@academia.exemplo | bruno.lima@academia.exemplo |
| Financeiro | fernando.gomes@academia.exemplo | patricia.souza@academia.exemplo |
| Supervisão (equipe de operação) | eduardo.martins@academia.exemplo | sandra.pires@academia.exemplo |
| Gestão | helena.duarte@academia.exemplo | sergio.faria@academia.exemplo |
| TI | tiago.ramos@academia.exemplo | vanessa.lopes@academia.exemplo |
| Administração | camila.nogueira@academia.exemplo | henrique.brito@academia.exemplo |
| Portaria | jorge.pinto@academia.exemplo | aline.cardoso@academia.exemplo |
| Controle de acesso | diego.moraes@academia.exemplo | fernanda.reis@academia.exemplo |
| Serviços gerais | rosa.lima@academia.exemplo | ivan.barros@academia.exemplo |
| Instalação | murilo.ferraz@academia.exemplo | amanda.rocha@academia.exemplo |

Os dois primeiros registros de cada setor são os usuários de demonstração principais.
O setor "supervisor de posto" e a trilha T25 ficam de fora até o nome do papel ser
confirmado com o Marcelo (decisão pendente do plano de expansão).

## Regras

- **Acesso único.** A mesma tela de entrada atende todos os setores.
- **Alçada no servidor.** O acesso efetivo é `(padrão do setor + liberações) − bloqueios`, calculado em `src/access.mjs` e aplicado em cada requisição. Trilha sem acesso responde 404, mesmo com o identificador certo. A página só reflete isso.
- **Papéis de gestão** (Gestão e Administração) veem todas as trilhas.
- **Acessos às trilhas.** Marcelo, RH e admin gerenciam a matriz de pessoas por trilha
  (liberação e bloqueio individual, padrão do setor e auditoria com motivo). A regra
  vive em `src/acessos-api.mjs`, compartilhada pelo servidor e pela demonstração.
  Na demonstração estática não há servidor para garantir a alçada; a garantia é do servidor.
- **Aulas em construção.** As 24 trilhas do plano de expansão têm 165 aulas: 28
  publicadas e as demais marcadas "em construção" (sem conteúdo). Elas aparecem na
  trilha, mas não contam no progresso e não podem ser concluídas.
- **Pontuação.**
  - Cada aula concluída vale 10 pontos, creditados na primeira conclusão.
  - Acertar o quiz na primeira tentativa soma 5 pontos extras.
  - Concluir todas as aulas de uma trilha dá 30 pontos de bônus.
- **Níveis.** Inicial (0), Em desenvolvimento (300), Proficiente (900), Referência (1.800).
- **Selos.** Primeiro passo; por trilha, Trilha concluída e Acerto integral (todas as aulas certas na primeira tentativa).
- **Ranking.** Top 5 do setor, com a posição de quem consulta. Empates recebem a mesma posição. Mostra apenas nome e pontos.
- **Gabarito.** A resposta correta e a explicação só são enviadas depois que a aula é concluída.
- **Sessão.** Cookie `HttpOnly` com `SameSite=Lax`, validade de 8 horas, revogado no logout.

## Estrutura

```
academia/
  server.mjs            ponto de entrada (node:http)
  src/
    app.mjs             rotas da API, arquivos estáticos e cabeçalhos
    acessos-api.mjs     área de acessos às trilhas (matriz, alterações, auditoria)
    access.mjs          regra efetiva de acesso (padrão + liberações − bloqueios)
    auth.mjs            senhas com scrypt e sessões
    content.mjs         trilhas do plano e aulas (texto, quiz e explicação)
    gamification.mjs    pontos, níveis, selos e ranking
    sectors.mjs         setores (alçadas) da Academia
    seed.mjs            usuários de demonstração e migração dos dados
    store.mjs           persistência em JSON com escrita atômica
  public/               interface (HTML, CSS e JavaScript puro)
  test/                 testes automatizados
  data/                 arquivos de runtime (ignorados pelo Git)
```

## API

Todas as rotas, exceto `POST /api/login`, exigem sessão.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/login` | `{email, password}`; grava o cookie de sessão |
| POST | `/api/logout` | Encerra a sessão |
| GET | `/api/me` | Usuário autenticado |
| GET | `/api/home` | Nível, pontos, trilhas, próxima aula, ranking e selos |
| GET | `/api/tracks/:id` | Trilha do setor com status das aulas |
| GET | `/api/lessons/:id` | Aula; inclui resultado somente se já concluída |
| POST | `/api/lessons/:id/complete` | `{choice}`; conclui a aula e devolve pontos, nível e selos |
| GET | `/api/leaderboard` | Ranking do setor |
| GET | `/api/search?q=` | Busca nas aulas do setor |
| GET | `/api/accesses` | Matriz de acessos (Marcelo, RH e admin) |
| POST | `/api/accesses/user` | `{userId, trackId, action, reason}`; libera, bloqueia ou devolve ao padrão |
| POST | `/api/accesses/sector` | `{sector, trackId, on, reason}`; altera o padrão do setor |

## Fora de escopo nesta fase

- Vídeos das aulas (serão adicionados depois).
- Integração com o login do sistema principal (decisão pendente).
- Envio de e-mails de convite e recuperação de senha.
- Banco de dados e múltiplas instâncias. O armazenamento em JSON é para uma única instância.

## Antes de liberar

1. Trocar as senhas de demonstração e remover os usuários de exemplo.
2. Definir a autenticação definitiva (conta própria ou integração com o login existente).
3. Validar o conteúdo das trilhas com cada setor.
4. Revisar a visualização em telas pequenas e a navegação por teclado.

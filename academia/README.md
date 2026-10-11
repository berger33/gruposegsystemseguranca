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
| Operação e supervisão | eduardo.martins@academia.exemplo | sandra.pires@academia.exemplo |
| Gestão | helena.duarte@academia.exemplo | sergio.faria@academia.exemplo |
| TI | tiago.ramos@academia.exemplo | vanessa.lopes@academia.exemplo |
| Administração | camila.nogueira@academia.exemplo | henrique.brito@academia.exemplo |
| Portaria | osvaldo.ramos@academia.exemplo | denise.araujo@academia.exemplo |
| Controle de acesso | wellington.batista@academia.exemplo | simone.correia@academia.exemplo |
| Serviços gerais | lourdes.pinto@academia.exemplo | adriano.silva@academia.exemplo |
| Instalação de segurança | leandro.moreira@academia.exemplo | gustavo.freitas@academia.exemplo |

Os dois primeiros registros de cada setor são os usuários de demonstração principais.

Nos quatro setores de campo (portaria, controle de acesso, serviços gerais e instalação), as duas contas começam do zero: as trilhas desses setores estão em construção, então não há progresso de exemplo.

## Regras

- **Acesso único.** A mesma tela de entrada atende todos os setores.
- **Alçada no servidor.** Cada trilha declara quem pode vê-la (`audiences`). Trilha de outro setor responde 404, mesmo com o identificador certo. A página só reflete isso.
- **Acesso efetivo** = padrão do setor + liberações individuais − bloqueios individuais (`src/access.mjs`). Admin e Marcelo veem todas as trilhas e não podem ser restringidos.
- **Quem altera acessos:** Marcelo, RH e admin (`/api/acessos*`). Toda alteração pede motivo de pelo menos 5 caracteres e fica no registro de alterações.
- **Aulas em construção** aparecem na trilha, sem conteúdo nem quiz, não contam no progresso e não podem ser concluídas (409 `aula_em_construcao`).
- **Pontuação.**
  - Cada aula concluída vale 10 pontos, creditados na primeira conclusão.
  - Acertar o quiz na primeira tentativa soma 5 pontos extras.
  - Concluir todas as aulas de uma trilha dá 30 pontos de bônus.
- **Níveis.** Inicial (0), Em desenvolvimento (80), Proficiente (200), Referência (400). *Pendente: o plano prevê 0 / 300 / 900 / 1.800, ainda não aplicado.*
- **Selos.** Primeiro passo; por trilha, Trilha concluída e Acerto integral (todas as aulas certas na primeira tentativa).
- **Ranking.** Top 5 do setor, com a posição de quem consulta. Empates recebem a mesma posição. Mostra apenas nome e pontos.
- **Gabarito.** A resposta correta e a explicação só são enviadas depois que a aula é concluída.
- **Sessão.** Cookie `HttpOnly` com `SameSite=Lax`, validade de 8 horas, revogado no logout.
- **Retomada.** A página inicial prioriza a última aula aberta que ainda não foi concluída. O identificador é guardado localmente por usuário neste navegador.
- **Certificados.** Só podem ser emitidos após concluir todas as aulas publicadas da trilha. O código é único e idempotente por usuário/trilha; a carga horária é somada das durações cadastradas nas aulas publicadas. O certificado pode ser impresso ou salvo como PDF.
- **Demonstração estática.** Certificados e progresso ficam no armazenamento deste navegador. A validação pública funciona nele; validar em outro dispositivo exige publicar a aplicação com o servidor persistente.

## Estrutura

```
academia/
  server.mjs            ponto de entrada (node:http)
  src/
    app.mjs             rotas da API, arquivos estáticos e cabeçalhos
    auth.mjs            senhas com scrypt e sessões
    content.mjs         trilhas e aulas (texto, quiz e explicação)
    gamification.mjs    pontos, níveis, selos e ranking
    sectors.mjs         setores (13)
    access.mjs          regra única de acesso às trilhas (servidor e demonstração)
    acessos-api.mjs     operações da área de acessos (liberar, bloquear, padrão do setor, registro)
    seed.mjs            usuários e progresso de demonstração
    store.mjs           persistência em JSON com escrita atômica
  public/               interface (HTML, CSS e JavaScript puro)
  test/                 testes automatizados
  data/                 arquivos de runtime (ignorados pelo Git)
```

## API

Todas as rotas, exceto `POST /api/login` e a consulta pública `GET /api/certificates/:code`, exigem sessão.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/login` | `{email, password}`; grava o cookie de sessão |
| POST | `/api/logout` | Encerra a sessão |
| GET | `/api/me` | Usuário autenticado |
| GET | `/api/home` | Nível, pontos, trilhas, próxima aula, ranking e selos |
| GET | `/api/tracks/:id` | Trilha do setor com status das aulas |
| GET | `/api/lessons/:id` | Aula; inclui resultado somente se já concluída |
| POST | `/api/lessons/:id/complete` | `{choice}`; conclui a aula e devolve pontos, nível e selos |
| POST | `/api/certificates` | `{trackId}`; emite ou devolve o certificado já emitido para a trilha concluída |
| GET | `/api/certificates/:code` | Consulta pública dos dados de validação, sem sessão |
| GET | `/api/leaderboard` | Ranking do setor |
| GET | `/api/search?q=` | Busca nas aulas do setor |
| GET | `/api/acessos` | Painel de acessos (só gestão) |
| POST | `/api/acessos/alterar` | `{userId, trackId, acao: liberar│bloquear│padrao, motivo}` (só gestão) |
| POST | `/api/acessos/padrao` | `{trackId, setores: [...] │ null, motivo}`; muda o público da trilha no setor (só gestão) |

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

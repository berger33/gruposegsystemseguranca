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
| `ACADEMIA_ADMIN_EMAIL` | `marcelo@gruposegsystemseguranca.com.br` | Login da conta de gestão (Marcelo) |
| `ACADEMIA_ADMIN_PASSWORD` | — | Senha da conta de gestão; se não for definida, é sorteada e mostrada uma única vez no primeiro start |
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

## Conta de gestão (Marcelo)

A conta de administrador da Academia é criada automaticamente no primeiro `npm start`:

- **Login:** `marcelo@gruposegsystemseguranca.com.br` (pode ser trocado por `ACADEMIA_ADMIN_EMAIL`).
- **Senha:** definida em `ACADEMIA_ADMIN_PASSWORD`; sem ela, o servidor sorteia uma senha e a mostra **uma única vez** no terminal. O estado guarda apenas o hash (scrypt com sal), nunca a senha.
- **Em produção** (`NODE_ENV=production`) o start exige `ACADEMIA_ADMIN_PASSWORD`; sem ela o servidor não sobe.
- **Trocar depois:** `node scripts/definir-senha-admin.mjs` (aceita `--gerar` para sortear uma nova e `--email` para outra conta).

A conta de gestão vê todas as trilhas, não pode ser restringida e é a única, junto com o setor admin, que altera o conteúdo.

## Regras

- **Acesso único.** A mesma tela de entrada atende todos os setores.
- **Alçada no servidor.** Cada trilha declara quem pode vê-la (`audiences`). Trilha de outro setor responde 404, mesmo com o identificador certo. A página só reflete isso.
- **Acesso efetivo** = padrão do setor + liberações individuais − bloqueios individuais (`src/access.mjs`). Admin e Marcelo veem todas as trilhas e não podem ser restringidos.
- **Área "Conteúdo" (árvore por setor).** A gestão (Marcelo e admin) vê uma árvore de três níveis — setor → trilha (curso) → aula/vídeo — e pode criar, editar, mover, arquivar e restaurar trilhas e conteúdos, além de atribuir uma trilha a outros setores. Cada alteração exige motivo de pelo menos 5 caracteres e entra no registro de alterações.
- **Remover é arquivar.** Arquivar tira a trilha ou a aula da visão do setor, sem apagar nada: o progresso e os certificados já emitidos continuam válidos e o item pode ser restaurado a qualquer momento.
- **Aulas e vídeos.** O conteúdo de uma trilha é do tipo `aula` ou `video`; o vídeo guarda a URL e abre em outra aba. Vídeo de trilha original também pode ser editado pela área de conteúdo.
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
    conteudo-gestao.mjs camada da área de conteúdo (árvore, criar/editar/arquivar/restaurar, registro)
    admin-users.mjs     conta de gestão (Marcelo): criação, senha e troca
    seed.mjs            usuários e progresso de demonstração
    store.mjs           persistência em JSON com escrita atômica
  scripts/              utilitários (gerar a demonstração, trocar a senha da gestão)
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
| GET | `/api/conteudo` | Árvore de setores → trilhas → aulas/vídeos, com arquivados e registro de alterações (só gestão de conteúdo) |
| POST | `/api/conteudo/trilha` | `{acao: criar│editar│arquivar│restaurar, trilhaId?, titulo?, grupo?, resumo?, setores?, motivo}` (só gestão de conteúdo) |
| POST | `/api/conteudo/aula` | `{acao: criar│editar│arquivar│restaurar│mover, trilhaId, aulaId?, titulo?, tipo?, minutos?, videoUrl?, destinoTrilhaId?, motivo}` (só gestão de conteúdo) |
| POST | `/api/conteudo/publico` | `{trackId, setores: [...] │ null, motivo}`; atribui a trilha a outros setores (só gestão de conteúdo) |

## Fora de escopo nesta fase

- Publicação de vídeos: a área de conteúdo cadastra a URL e o tipo; upload, player incorporado e transcodificação ficam para depois.
- Integração com o login do sistema principal (decisão pendente).
- Envio de e-mails de convite e recuperação de senha.
- Banco de dados e múltiplas instâncias. O armazenamento em JSON é para uma única instância.

## Antes de liberar

1. Trocar as senhas de demonstração e remover os usuários de exemplo.
2. Definir a senha definitiva da conta de gestão em `ACADEMIA_ADMIN_PASSWORD` antes de subir em produção (não versionar a senha).
3. Definir a autenticação definitiva (conta própria ou integração com o login existente).
4. Validar o conteúdo das trilhas com cada setor.
5. Revisar a visualização em telas pequenas e a navegação por teclado.

# UX-PRO-01 — fundamentos visuais e chrome compartilhado

Data: 13/10/2026  
Escopo: bases visuais transversais e navegação compartilhada das áreas administrativas.

## Auditoria da experiência existente

O `AdminChrome` já fornece a estrutura comum usada pelas áreas administrativas: marca, papel da sessão, alternância dia/noite, sair, breadcrumb, busca de módulos, grupos expansíveis e indicação do módulo atual. A lista é montada a partir do papel retornado pela sessão e continua respeitando o catálogo de navegação existente. Em telas menores, o menu vira gaveta, tem botão de abertura, fundo de fechamento, foco inicial na busca, fechamento por Escape e retorno de foco ao botão. Os breakpoints atuais são 900 px e 480 px; esta fatia os mantém.

O tema usa a chave `segsystem.admin.appearance.v1` em `localStorage`. Portanto, a preferência é do navegador/perfil local e sincroniza entre abas da mesma origem; não é uma configuração vinculada à conta nem sincronizada entre dispositivos. Se o navegador bloquear armazenamento, a alternância continua na aba atual, sem persistência. Nenhuma sessão, autenticação ou autorização foi alterada.

## Implementação

- Expandida a base de `ux-tokens.css` para tipografia, escala de espaçamento, raios, foco, larguras, controle e breakpoints documentados.
- Os valores consumidos pelo chrome e pela tipografia administrativa correspondem aos valores que já estavam em uso, preservando o desenho existente enquanto cria uma origem única para as próximas fatias.
- O foco do breadcrumb e do botão de menu, que ficam sobre fundo escuro, agora usa o azul claro de alto contraste já usado pelo botão de tema. O foco na navegação clara mantém o azul da marca.
- Permanecem iguais os papéis, módulos disponíveis por papel, busca, rotas, estados de tema, ordem dos controles, regras de responsividade e APIs.

## Evidências e limites desta execução

Validação de código: `npm run typecheck` e `npm run build` passaram; a compilação gerou as 105 rotas da aplicação.

Há capturas de baseline da tela de entrada, sem credenciais, em `docs/ux-pro-01/evidence/`: 320, 390, 768 e 1440 px nos temas dia e noite. Foram feitas em Edge headless contra a compilação local; a alternância dia/noite e a adaptação responsiva são visíveis nessas imagens.

A tela administrativa autenticada não foi capturada: a instalação local em `http://127.0.0.1:3000/admin/entrar` respondeu `401` sem conteúdo; `127.0.0.1:3100` recusou conexão. Portanto, não declaro inspeção visual manual do papel/menu, breadcrumb, busca, nem teclado dentro da área logada nos quatro viewports. Essa evidência precisa ser concluída no ambiente que tenha sessão sintética autorizada, antes de considerar a validação visual do chrome autenticado integralmente fechada.

Não foi usado dado real nem foram incluídas credenciais. A revisão cobre o chrome compartilhado e os estilos globais de tipografia; não equivale à inspeção de todas as rotas internas, que pertence às famílias seguintes do plano UX-PRO.

## Próxima fatia

Após revisão desta PR e confirmação dos checks, seguir UX-PRO-02 conforme o plano mestre, mantendo cada família isolada e sem remover funcionalidades existentes.

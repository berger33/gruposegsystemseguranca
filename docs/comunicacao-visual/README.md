# Comunicação visual por e-mail — funcionários (kit de 200 imagens)

Pasta dedicada ao plano de **200 imagens com textos** para e-mails padronizados enviados aos
funcionários do Grupo SEG System Segurança Integrada (boas-vindas, criação de conta,
recuperação de senha e datas comemorativas — aniversário, Natal, Dia da Mulher, Ano Novo e
demais principais).

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| [01-estudo-do-sistema-publicos.md](01-estudo-do-sistema-publicos.md) | Estudo do sistema: tipos de clientes e públicos de funcionários que sustentam o plano |
| [02-plano-mestre-200-imagens.md](02-plano-mestre-200-imagens.md) | **Plano mestre**: identidade visual, especificações, fluxo de produção, LGPD, roadmap e integração com o sistema |
| [03-catalogo-200-imagens.md](03-catalogo-200-imagens.md) | **Catálogo das 200 imagens** com textos (manchete, apoio, CTA, assunto) e direção visual por item |
| [04-catalogo-imagens.csv](04-catalogo-imagens.csv) | Planilha de controle de produção (onda, prioridade, formato, status, arquivo sugerido) — 200 linhas |
| [mockups/](mockups/) | 3 mockups **conceituais** de referência (boas-vindas, recuperação de senha, aniversário) — não oficiais |

## Resumo da distribuição

| Bloco | Tema | Imagens |
| --- | --- | --- |
| A | Boas-vindas (geral, por função, por vínculo, tempo de casa, transições, acompanhamento) | 35 |
| B | Conta e acesso (convite/criação, confirmação de e-mail, recuperação de senha, segurança) | 45 |
| C | Datas comemorativas (aniversário, Natal, Ano Novo, Dia da Mulher 08/03, Trabalhador 01/05, Vigilante 20/06, Limpeza 16/05, Mães, Pais, campanhas de saúde, feriados…) | 100 |
| D | Comunicados internos padronizados (holerite, escala, uniforme, treinamento, avisos) | 20 |
| | **Total** | **200** |

## Estado

- **Status: plano aprovado para revisão** — nenhuma imagem final produzida; todos os textos são
  rascunhos que exigem aprovação do RH/Marcelo antes da arte e do envio.
- Pendências externas que afetam o envio real: SMTP (provedor a escolher), logotipo oficial com
  licença confirmada, política de privacidade aprovada.
- Nenhum dado pessoal de funcionário é usado nas imagens; personalização ocorre no corpo HTML
  do e-mail via merge tags (detalhes no plano mestre, seção 3).

## Sobre a branch `comunicacao_visual`

Este trabalho foi pedido em uma branch chamada `comunicacao_visual`. A sessão de trabalho em
que ele foi produzido é fixa na branch `arena/01a0eb18-gruposegsystemseguranca`, então os
arquivos foram commitados lá, sob `docs/comunicacao-visual/`. Para materializá-los em uma
branch `comunicacao_visual` a partir deste ponto:

```bash
git switch -c comunicacao_visual   # a partir do commit atual de arena/01a0eb18-*
```

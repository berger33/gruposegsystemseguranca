# Trailer em vídeo — Grupo SEG System (08/10/2026)

> **Natureza:** peça de **comunicação**, gerada a partir de capturas reais já versionadas do sistema
> (`docs/**/evidencias`). Não é homologação, não autoriza publicação externa e **não substitui uma gravação ao
> vivo** no ambiente de demonstração local. Ver "Limites" abaixo.

## Arquivo

| Arquivo | Conteúdo |
|---|---|
| `trailer-90s.mp4` | Trailer final: **1 min 29 s**, 1920×1080, 30 fps, H.264 + AAC, ~10 MB |
| `capa.jpg` | Quadro de capa (uso em WhatsApp, YouTube, apresentação) |
| `locucao/c1..c7.mp3` | Locução isolada em 7 blocos, caso queira re-editá-la |

**Locução:** voz sintetizada em português do Brasil, escolhida pelo proprietário (voz "voice-01" da sessão).
**Trilha:** 100 % original, sintetizada no projeto (`make_music.py`) — **sem material de terceiros**, portanto sem
risco de direitos autorais. Nível final: −15 LUFS integrado.

## Estrutura (o que aparece e quando)

| Tempo | Bloco | Fonte visual |
|---|---|---|
| 0:00–0:12 | Gancho: pedido no WhatsApp, contrato no e-mail, documento na pasta de alguém | cartela animada |
| 0:12–0:24 | O pedido chega pelo site | `site-logo.png` (layout 06 em uso) |
| 0:24–0:46 | O pedido vira oportunidade, com responsável e histórico | `desktop-crm.png`, `desktop-crm-detalhe.png` |
| 0:46–0:58 | Visita, orçamento e proposta pelo próprio sistema | `desktop-comercial.png` |
| 0:58–1:02 | O aceite fica registrado | cartela animada |
| 1:02–1:16 | O contrato nasce do aceite e atravessa os módulos | `desktop-contratos.png` |
| 1:16–1:27 | O cliente acompanha pelo portal | `cliente-login.png`, `desktop-continuidade-cliente.png` |
| 1:27–1:33 | Quem decide vê pendências e vencimentos | `desktop-marcelo.png` |
| 1:33–1:45 | Todos os módulos, do site ao posto | `desktop-hub.png`, `desktop-rh.png`, `desktop-financeiro.png` |
| 1:45–1:53 | Cada papel vendo só o que precisa ver | cortes de gestão, RH e cliente |
| 1:53–1:29... | Cartela final com marca e contatos públicos | cartela animada |

*Verifique os tempos no arquivo final; a tabela é orientativa de montagem.*

## Marcações de honestidade embutidas

- Selo permanente no canto inferior direito: **"demonstração · dados fictícios"**.
- Cartela final: **"Vídeo de demonstração · dados fictícios · outubro de 2026"**.
- Nenhum dado real de cliente, funcionário ou terceiro aparece: todas as capturas usam massa fictícia.
- Os rótulos de teste das capturas de evidência foram cobertos por rótulos de conteúdo na composição.
- Nenhuma tela de assistente de IA, integração externa, upload de arquivo ou portal de compras aparece.

## Limites declarados (leia antes de apresentar)

1. **Não é gravação ao vivo.** As cenas usam capturas de evidência do repositório (05–07/10/2026). Não há
   transição entre telas, digitação ou clique reais; os destaques, o cursor e as legendas são composição.
2. **Contas "cliente" e "RH"** que aparecem nas cenas são contas fictícias de evidência, com o rótulo de contexto
   que a própria evidência trazia (substituído, na composição, por rótulo de conteúdo).
3. **O sistema completo roda hoje em demonstração local** (banco exclusivo no perfil do usuário, sem dados reais).
   Aplicação em banco de destino, aceite humano e Windows seguem pendentes.
4. Para uso público (site, redes), revise com o proprietário: telefone, endereço, serviços anunciados e a
   autorização de uso da marca.

## Versão 2 recomendada: gravação ao vivo com a massa de demonstração

Esta versão 1 usa as **capturas de evidência** do repositório — mas algumas telas aparecem em estado vazio
("NENHUM REGISTRO"), porque foram capturadas antes da massa sintética de apresentação.

A `main` atual já traz a massa `DEMONSTRAÇÃO FICTÍCIA` (`npm run demo:local:init`), documentada em
[`docs/demo-dados-apresentacao.md`](../demo-dados-apresentacao.md) — com empresas, oportunidades, tarefas,
jornada de ponto com pedido de correção, obrigação de compliance, plano de continuidade e contas de cliente.
Ela foi desenhada exatamente para **apresentar sem induzir ao erro**.

Para a versão 2 (a que eu recomendo para o site e para clientes):

1. Rode `npm run demo:local:init` e depois `npm run demo:local:start` em uma cópia limpa (sem `.env.local`).
2. Repita as capturas dos planos desta versão **com a massa preenchida** — os mesmos nomes de arquivo em `src/`.
3. `python3 build_trailer.py` e `python3 mix.py` recriam o vídeo com as imagens novas, sem mexer em texto, voz ou trilha.
4. Se quiser um trailer realmente "ao vivo" (com cliques e transições), use este arquivo como storyboard: as
   durações e a locução já estão calibradas bloco a bloco.

## Como regravar (se mudar algo)

1. Rode a demonstração local (`INICIAR-DEMO-LOCAL.bat`) e refaça as capturas que quiser atualizar.
2. Substitua os arquivos em `src/` (mesmos nomes: `site.jpg`, `crm.jpg`, `crmdetalhe.jpg`, `comercial.jpg`,
   `contratos.jpg`, `cliente.jpg`, `clientecont.jpg`, `marcelo.jpg`, `hub.jpg`, `rh.jpg`, `financeiro.jpg`).
3. `python3 build_trailer.py` (recria o vídeo mudo) e `python3 mix.py` (juntar locução e trilha).
   Ferramentas: `PIL`, `numpy`, `imageio-ffmpeg` — nenhuma dependência de serviço externo.

## Registro de produção (sessão de 08/10/2026)

- Roteiro derivado de [`docs/APRESENTACAO-VIDEO-ROTEIROS-2026-10-08.md`](../APRESENTACAO-VIDEO-ROTEIROS-2026-10-08.md)
  (Roteiro A — trailer de 90 s), com os tempos recalculados sobre a locução real (82,3 s).
- Estratégia, o que falar e o que **não** falar: [`docs/APRESENTACAO-VIDEO-GUIA-2026-10-08.md`](../APRESENTACAO-VIDEO-GUIA-2026-10-08.md).
- Composição: 20 planos, zoom/câmera lenta digital, marcadores pulsantes com etiqueta-guia, legendas, cursor com
  pulso de clique, barra de progresso e cartelas animadas (todas as fontes em `build_trailer.py`).
- Áudio: `make_music.py` (trilha) + `mix.py` (ducking da trilha sob a voz, normalização a −15 LUFS).

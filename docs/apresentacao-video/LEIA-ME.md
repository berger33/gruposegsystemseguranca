# Trailer de apresentação — Grupo SEG System (v3)

Vídeo de **1 min 29 s**, 1920×1080, 30 fps, H.264 + AAC, `trailer-90s.mp4` (≈18 MB).
**Demonstração com dados fictícios. Não é gravação ao vivo.**

## O que mudou na v3
- Removido o texto "Reconhece isso?" (≈9 s) e as linhas de contraste que o acompanhavam.
- Cena do site (≈12–17 s): enquadramento só na região do botão, sem o texto da página sob a legenda; legenda "O primeiro contato" em painel limpo.
- Clique no site: foco no botão "Solicitar proposta", leve escurecimento, cursor até o botão, onda de clique com efeito de pressão.
- Destaques recalculados pelas bordas reais dos elementos (campos, botões, abas, cards), para encaixar nas caixas mostradas.
- Locução, roteiro e tempos inalterados.
- **A partir de 1:18:** a transição passa a ser só da tela do programa. Fundo, título, barra de capítulos e logotipo ficam parados; a captura sai e entra deslizando dentro da janela do navegador.
- **Papéis (≈80–84 s):** título, barra e legenda ("gestão · recursos humanos · cliente") ficam fixos durante a troca de gestão → RH → cliente; só a janela muda.
- A janela não tem mais o balanço contínuo de 5 px, para ficar firme durante as trocas.

## O que mudou na v2
- **Texto e locução mantidos** (mesmos sete blocos de voz pt-BR e mesmos tempos).
- **Sem slides:** cada captura real aparece numa **janela de navegador** (barra com endereço da rota), à direita; o texto fica na coluna da esquerda, sem sobreposição.
- **Câmera animada** dentro da janela (zoom e deslocamento com easing), em vez de imagem parada.
- **Foco:** o restante da tela escurece e o alvo recebe **cantos de mira pulsantes**.
- **Etiquetas com linha-guia** que se abrem e desenham a linha até o elemento; a posição é escolhida automaticamente para não cobrir o texto.
- **Cursor** com trajetória, clique e onda, e **digitação** no login do portal.
- **Transições variadas:** empurrão com desfoque de movimento, zoom com desfoque, cortina diagonal com brilho e dissolve.
- **Barra de capítulos** no rodapé (CONTATO · CRM · PROPOSTA · CONTRATO · PORTAL · DECISÃO · OPERAÇÃO).
- Finalização com vinheta leve e grão discreto; tipografia Inter (SIL OFL).

## Roteiro visual (tempos aproximados)
| Tempo | Cena | Destaque |
|---|---|---|
| 0–12 s | Diagnóstico: informação espalhada | cartões de WhatsApp, e-mail e pasta |
| 12–17 s | Site: o pedido chega pelo site | botão "Solicitar proposta" com cursor |
| 17–33 s | CRM: pedido → oportunidade → funil | botão "Converter pedido…", campos, estágios |
| 33–37 s | Proposta com link de aceite | aba "Propostas & envio" |
| 37–41 s | Aceite registrado | cartela |
| 41–55 s | Contrato criado a partir do aceite | campo "Serviço ou escopo"; módulos ligados |
| 55–66 s | Portal do cliente | login com digitação; área de continuidade |
| 66–71 s | Quem decide | pendências, leads, oportunidades paradas |
| 71–81 s | Área administrativa e operação | percurso módulo a módulo; RH; financeiro |
| 81–84 s | Papéis | cortes rápidos: gestão, RH, cliente |
| 84–89 s | Cartela final | marca, contatos, selo de demonstração |

## Áudio
- **Locução:** voz masculina pt-BR escolhida, sete blocos em `locucao/`.
- **Trilha:** composta do zero (`make_music.py`); sem material de terceiros.
- **Mixagem:** trilha com *ducking* sob a locução; −15,2 LUFS, faixa de loudness 2,4 LU.

## Limites declarados
- As capturas são do repositório (`docs/**/evidencias`). Algumas telas estão vazias ("NENHUM REGISTRO") porque a base não tinha dados de demonstração na época.
- Capturas pequenas (ex.: site, 1265 px) são ampliadas para o zoom, o que deixa a imagem um pouco mais suave.
- Os elementos do site/portal exibem rótulos de conta fictícia (ex.: "CONTA FICTÍCIA DA EVIDÊNCIA…"), mantidos de propósito.
- Não há cliques reais: os movimentos do cursor e da câmera são composição.

## Como regenerar
```bash
cd docs/apresentacao-video
python3 make_music.py                 # gera build/music.wav
python3 build_trailer.py --jobs 2     # gera build/trailer_silent.mp4 (≈4 min)
python3 mix.py                        # gera build/trailer.mp4 (locução + trilha)
```
Use `TRAILER_BUILD=/caminho` para mudar a pasta de saída e `python3 build_trailer.py --stills 15 44` para conferir quadros isolados.
Dependências: `numpy`, `opencv-python-headless`, `pillow`, `imageio-ffmpeg`.

## Próxima versão recomendada (dados de demonstração)
Refazer as capturas com a massa `DEMONSTRAÇÃO FICTÍCIA` (`npm run demo:local:init` e `npm run demo:local:start`; ver `docs/demo-dados-apresentacao.md`). Assim as telas saem preenchidas, sem alterar a voz, o texto nem o motor.

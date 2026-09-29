"""Lote 07 — 10 botões de estado e ação do sistema (plataforma interna).

Cores de estado têm contraste AA com o rótulo branco quando aplicadas no CSS
(o texto nunca é embutido na imagem).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-07.py
Saída: public/ui/botoes/*.png
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

SAIDA = RAIZ / "public/ui/botoes"
W, H = 480, 112

AZUL = (28, 86, 150)
AZUL_CLARO = (72, 132, 196)
VERDE = (32, 116, 78)
AMBAR = (176, 124, 32)
VERMELHO = (168, 52, 52)
VERMELHO_ESCURO = (116, 32, 32)
CINZA = (140, 152, 166)

GERADOS = []


def salvar(nome, img):
    GERADOS.append((nome, salvar_png(img, SAIDA / nome), img.size))


def acao(nome, cor_a, cor_b, contorno=None, contorno_alfa=180, sombra=6, brilho=0.14, opacidade=255, interior=None):
    img = botao_superficie(W, H, cor_a, cor_b, -36, contorno=contorno, contorno_alfa=contorno_alfa,
                           contorno_largura=2, brilho=brilho, sombra=sombra, raio=18, opacidade=opacidade,
                           interior=interior)
    salvar(nome, img)
    return img


if __name__ == "__main__":
    acao("botao-11-acao-primaria.png", AZUL, (60, 130, 196))
    acao("botao-12-acao-secundaria.png", (238, 244, 250), (216, 230, 244), contorno=(120, 152, 188), brilho=0.30)
    acao("botao-13-acao-sucesso.png", VERDE, (58, 152, 108))
    acao("botao-14-acao-aviso.png", AMBAR, (214, 164, 66))
    acao("botao-15-acao-erro.png", VERMELHO, (198, 86, 86))
    acao("botao-16-acao-destrutiva.png", VERMELHO_ESCURO, (146, 58, 58), contorno=(70, 18, 18), brilho=0.18)

    # 17 — fantasma: só contorno, fundo quase transparente
    img = botao_superficie(W, H, (238, 244, 250), (222, 232, 244), -36, contorno=(112, 138, 168),
                           contorno_alfa=255, contorno_largura=3, brilho=0.30, sombra=0, raio=16, opacidade=125)
    salvar("botao-17-acao-fantasma.png", img)

    # 18 — chip/pílula de filtro (raio total)
    img = botao_superficie(320, 84, (26, 62, 98), (44, 96, 146), -34, contorno=OURO_CLARO, contorno_alfa=205,
                           contorno_largura=2, brilho=0.20, sombra=4, raio=42, anel=None)
    salvar("botao-18-chip-filtro.png", img)

    # 19 — desabilitado: cinza translúcido, sem sombra
    img = botao_superficie(W, H, (150, 160, 172), (178, 186, 196), -36, contorno=(96, 106, 120),
                           contorno_alfa=140, contorno_largura=2, brilho=0.16, sombra=0, raio=18, opacidade=140)
    salvar("botao-19-desabilitado.png", img)

    # 20 — carregando: base primária + luz deslizante (faixa de progresso à esquerda)
    img = botao_superficie(W, H, AZUL, (60, 130, 196), -36, contorno=(150, 196, 236), contorno_alfa=190,
                           contorno_largura=2, brilho=0.14, sombra=6, raio=18)
    # onda de luz percorrendo a superfície (indica carregamento sem texto)
    faixa = gradiente_horizontal(W, H, [(0, .02), (.30, .06), (.42, .34), (.50, .10), (.58, .34), (.70, .06), (1, .02)], BRANCO)
    faixa.putalpha(Image.composite(faixa.getchannel("A"), Image.new("L", (W, H), 0),
                                   img.getchannel("A").point(lambda v: 255 if v > 220 else 0)))
    img.alpha_composite(faixa)
    salvar("botao-20-carregando.png", img)

    for nome, tam, dim in GERADOS:
        print(f"{nome:38s} {str(dim):12s} {tam/1024:6.1f} KB")

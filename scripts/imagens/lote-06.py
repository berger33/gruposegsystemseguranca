"""Lote 06 — 10 botões institucionais (marca Grupo SEG System).

Sem texto embutido: a aplicação/CSS escreve o rótulo por cima (mantém tradução,
acessibilidade e foco corretos). São as superfícies "chrome" dos botões.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-06.py
Saída: public/ui/botoes/*.png
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

SAIDA = RAIZ / "public/ui/botoes"
W, H = 480, 112

GERADOS = []


def salvar(nome, img):
    GERADOS.append((nome, salvar_png(img, SAIDA / nome), img.size))


def principal(nome, cor_a=MARINHO, cor_b=MARINHO_3, angulo=-40, contorno=OURO, contorno_alfa=210,
              anel=None, sombra=7, brilho=0.14, raio=20, cw=W, ch=H, anel_folga=3):
    img = botao_superficie(cw, ch, cor_a, cor_b, angulo, contorno=contorno, contorno_alfa=contorno_alfa,
                           contorno_largura=3, brilho=brilho, sombra=sombra, raio=raio,
                           anel=anel, anel_folga=anel_folga, anel_largura=2)
    salvar(nome, img)
    return img


if __name__ == "__main__":
    # 01 — primário navy sólido, contorno dourado discreto (uso padrão)
    principal("botao-01-primario-navy.png")

    # 02 — primário com degradê visível e brilho superior (destaque em fundo claro)
    principal("botao-02-primario-gradiente.png", MARINHO, (46, 92, 138), -35, contorno=OURO_CLARO, brilho=0.20)

    # 03 — secundário claro (creme) com contorno dourado: texto marinho
    principal("botao-03-secundario-claro.png", (252, 250, 245), (240, 231, 212), -35,
              contorno=OURO_ESCURO, contorno_alfa=250, brilho=0.24, sombra=6)

    # 04 — contorno dourado duplo sobre superfície translúcida (para fundos escuros/fotos)
    img = botao_superficie(W, H, MARINHO, MARINHO_3, -35, contorno=None, brilho=0.08,
                           sombra=0, raio=18, opacidade=105)
    tela = Tela(W, H)
    tela.caixa(10, 10, W - 10, H - 10, 18, contorno=OURO, largura=2)
    tela.caixa(18, 18, W - 18, H - 18, 14, contorno=OURO_CLARO, largura=1)
    saida = img.copy()
    saida.alpha_composite(tela.resultado())
    salvar("botao-04-contorno-dourado.png", saida)

    # 05 — dourado premium (fundo degradê ouro, rótulo marinho)
    principal("botao-05-dourado-premium.png", OURO_ESCURO, OURO_CLARO, -32, contorno=(120, 96, 52),
              contorno_alfa=230, brilho=0.28, sombra=7)

    # 06 — vidro escuro translúcido (sobre foto/hero)
    img = botao_superficie(W, H, (16, 40, 68), (34, 72, 110), -40, contorno=(226, 199, 143),
                           contorno_alfa=165, contorno_largura=2, brilho=0.18, sombra=6, opacidade=170)
    salvar("botao-06-vidro-escuro.png", img)

    # 07 — CTA grande com anel dourado duplo
    principal("botao-07-cta-navy.png", MARINHO, (38, 84, 132), -38, contorno=OURO_CLARO, contorno_alfa=255,
              anel=OURO, sombra=10, brilho=0.22, raio=24, cw=600, ch=140, anel_folga=5)

    # 08 — barra fixa de ação (largura de tela, base translúcida + fio dourado no topo)
    img = botao_superficie(1200, 108, MARINHO_2, (26, 58, 92), 0, contorno=OURO, contorno_alfa=120,
                           contorno_largura=2, brilho=0.10, sombra=8, raio=14, margem=6)
    faixa_dourada(img, 6, 3)
    salvar("botao-08-barra-acao.png", img)

    # 09 — flutuante: sombra ampla, anel dourado e degradê suave
    principal("botao-09-flutuante.png", (18, 46, 76), (40, 86, 130), -36, contorno=OURO_CLARO,
              contorno_alfa=220, anel=(196, 165, 106), sombra=14, brilho=0.24, raio=26, anel_folga=4)

    # 10 — estado hover/pressed: mais claro, com luz superior marcada
    principal("botao-10-estado-hover.png", (34, 74, 116), (68, 124, 172), -34, contorno=OURO_CLARO,
              contorno_alfa=255, brilho=0.30, sombra=8)

    for nome, tam, dim in GERADOS:
        print(f"{nome:38s} {str(dim):12s} {tam/1024:6.1f} KB")

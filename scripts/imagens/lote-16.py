"""Lote 16 — 10 cabeçalhos de e-mail com as placas novas (1200×400).

Temas: vigilância noturna, condomínios, infraestrutura crítica, corporativo, central de
operação, logística e portos, perímetro monitorado, acesso, cobertura/rotas e vigilância ativa.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-16.py
Saída: public/email/cabecalhos/cabecalho-31..40-*.jpg
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

F = RAIZ / "design/email/fundos/lote-16"
CAB = RAIZ / "public/email/cabecalhos"
LW, HH = 1200, 400
logos = carregar_logos()
GERADOS = []


def fundo(nome, foco=(0.5, 0.5)):
    return cobrir(Image.open(F / f"{nome}.jpg"), LW, HH, foco)


def salvar(nome, img, qualidade=86):
    GERADOS.append((nome, salvar_jpg(img, CAB / nome, qualidade)))


def escurecer(img, esquerda=0.97, direita=0.16, topo=0.26, base=0.32):
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, esquerda), (.42, esquerda - .05), (.68, .78), (.88, direita + .2), (1, direita)]))
    img.alpha_composite(gradiente_vertical(LW, HH, [(0, topo), (.5, 0), (1, base)]))


def titulo_ajustado(img, tx, y, linhas, tam_max, cor, disp, tracking=2, sombra=6):
    tam = tam_max
    while tam > 22 and max(largura_texto(l, fonte("Cinzel.ttf", tam, "Bold"), tracking) for l in linhas) > disp:
        tam -= 2
    f = fonte("Cinzel.ttf", tam, "Bold")
    for i, l in enumerate(linhas):
        desenhar_texto(img, tx, y + i * int(tam * 1.32), l, f, cor, tracking, sombra=sombra)
    return y + int(tam * 1.32) * len(linhas)


def cabecalho_logo_esquerda(nome, placa, titulo, foco=(0.5, 0.5), escurecer_mais=False, grade=False):
    """Layout A — logotipo à esquerda, título à direita sobre a foto."""
    img = fundo(placa, foco)
    escurecer(img, .97 if not escurecer_mais else .99, .14)
    if grade:
        grade_fina(img, 46, BRANCO, 18)
    logo = redimensionar_altura(logos["logo-reverso"], 252)
    colar(img, logo, 64, (HH - 6 - logo.height) // 2)
    dx = 64 + logo.width + 50
    divisor_vertical(img, dx, 92, HH - 92, alfa=195)
    tx = dx + 46
    disp = LW - tx - 54
    yb = titulo_ajustado(img, tx, 118, titulo, 44, BRANCO, disp)
    divisor_horizontal(img, tx, tx + 70, yb + 12, cor=OURO, alfa=255, largura=3)
    linha_tagline(img, tx, yb + 28, fonte("Cinzel.ttf", 20, "Bold"), OURO_CLARO, OURO, 3, sombra=4)
    faixa_dourada(img, HH - 6, 6)
    salvar(nome, img)


def cabecalho_central(nome, placa, titulo, foco=(0.5, 0.5)):
    """Layout B — escudo no topo, título e tagline centralizados, com marcos de canto."""
    img = fundo(placa, foco)
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .58), (.5, .76), (1, .58)]))
    img.alpha_composite(gradiente_vertical(LW, HH, [(0, .42), (.42, .14), (1, .52)]))
    esc = redimensionar_altura(logos["escudo-reverso"], 108)
    colar(img, esc, (LW - esc.width) // 2, 30)
    tam = 44
    while tam > 22 and max(largura_texto(l, fonte("Cinzel.ttf", tam, "Bold"), 3) for l in titulo) > LW - 220:
        tam -= 2
    f = fonte("Cinzel.ttf", tam, "Bold")
    for i, l in enumerate(titulo):
        desenhar_texto(img, LW // 2, 150 + i * int(tam * 1.30), l, f, BRANCO, 3, "c", sombra=7)
    yl = 150 + int(tam * 1.30) * len(titulo) + 10
    divisor_horizontal(img, LW // 2 - 45, LW // 2 + 45, yl, cor=OURO, alfa=255, largura=3)
    linha_tagline(img, LW // 2, yl + 16, fonte("Cinzel.ttf", 20, "Bold"), OURO_CLARO, OURO, 4, "c", sombra=5)
    marco_cantos(img, 40, 30, LW - 40, HH - 42, 30, OURO, 3, 200)
    faixa_dourada(img, HH - 6, 6)
    salvar(nome, img)


if __name__ == "__main__":
    cabecalho_logo_esquerda("cabecalho-31-vigilancia-noturna.jpg", "n01", ["VIGILÂNCIA", "NOTURNA"],
                            foco=(0.58, 0.5), escurecer_mais=True)
    cabecalho_logo_esquerda("cabecalho-32-condominios.jpg", "n02", ["CONDOMÍNIOS", "E ÁREAS COMUNS"],
                            foco=(0.42, 0.55))
    cabecalho_logo_esquerda("cabecalho-33-infraestrutura-critica.jpg", "n03", ["INFRAESTRUTURA", "CRÍTICA"],
                            foco=(0.5, 0.5), escurecer_mais=True)
    cabecalho_logo_esquerda("cabecalho-34-seguranca-corporativa.jpg", "n04", ["SEGURANÇA", "CORPORATIVA"],
                            foco=(0.62, 0.45))
    cabecalho_logo_esquerda("cabecalho-35-central-operacao.jpg", "n05", ["CENTRAL DE", "OPERAÇÃO 24H"],
                            foco=(0.52, 0.55), escurecer_mais=True)
    cabecalho_logo_esquerda("cabecalho-36-logistica-portos.jpg", "n08", ["LOGÍSTICA", "E PORTOS"],
                            foco=(0.55, 0.5))
    cabecalho_logo_esquerda("cabecalho-37-perimetro-monitorado.jpg", "n06", ["PERÍMETRO", "MONITORADO"],
                            foco=(0.62, 0.5), escurecer_mais=True)
    cabecalho_logo_esquerda("cabecalho-38-acesso-corporativo.jpg", "n07", ["ACESSO", "CORPORATIVO"],
                            foco=(0.55, 0.5))
    cabecalho_logo_esquerda("cabecalho-39-cobertura-rotas.jpg", "n09", ["COBERTURA", "E ROTAS"],
                            foco=(0.5, 0.5), grade=True)
    cabecalho_central("cabecalho-40-vigilancia-ativa.jpg", "n10", ["VIGILÂNCIA", "ATIVA"], foco=(0.5, 0.45))

    for nome, tam in GERADOS:
        print(f"{nome:46s} {tam/1024:6.0f} KB")

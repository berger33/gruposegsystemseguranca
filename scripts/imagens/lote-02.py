"""Lote 02 — 10 cabeçalhos de e-mail alternativos (1200×400, composições variadas).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-02.py
Saída: public/email/cabecalhos/cabecalho-11..20-*.jpg
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

F = RAIZ / "design/email/fundos/lote-01"
CAB = RAIZ / "public/email/cabecalhos"
LW, HH = 1200, 400
logos = carregar_logos()
GERADOS = []


def fundo(nome, w=LW, h=HH, foco=(0.5, 0.5), espelhar=False):
    im = Image.open(F / f"{nome}.jpg")
    if espelhar:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return cobrir(im, w, h, foco)


def salvar(nome, img, qualidade=86):
    GERADOS.append((nome, salvar_jpg(img, CAB / nome, qualidade)))


def titulo(img, x, y, linhas, tam, cor, tracking=2, ancora="l", sombra=0, separador=70):
    f = fonte("Cinzel.ttf", tam, "Bold")
    for i, l in enumerate(linhas):
        desenhar_texto(img, x, y + i * int(tam * 1.32), l, f, cor, tracking, ancora, sombra=sombra)
    yl = y + int(tam * 1.32) * len(linhas) + 10
    x0 = x - separador if ancora == "r" else (x - separador / 2 if ancora == "c" else x)
    divisor_horizontal(img, x0, x0 + separador, yl, cor=OURO, alfa=255, largura=3)
    linha_tagline(img, x, yl + 16, fonte("Cinzel.ttf", max(14, tam // 2), "Regular"),
                  OURO_CLARO if maxima_cor(cor) else OURO_TEXTO, OURO, 3, ancora, sombra=4 if maxima_cor(cor) else 0)
    return yl


def tagline_ajustada(img, x, y, cor, cor_sep, largura_max, ancora="l", tam_max=16, itens=None, sombra=0):
    """Tagline que encolhe (e, no limite, reduz itens) para caber na largura disponível."""
    itens = itens or ("PROTEÇÃO", "TECNOLOGIA", "CONFIANÇA")
    for tam in range(tam_max, 10, -1):
        f = fonte("Cinzel.ttf", tam, "Regular")
        if largura_tagline(f, itens, 3) <= largura_max:
            return linha_tagline(img, x, y, f, cor, cor_sep, 3, ancora, itens, sombra=sombra)
    f = fonte("Cinzel.ttf", 12, "Regular")
    return linha_tagline(img, x, y, f, cor, cor_sep, 3, ancora, ("PROTEÇÃO", "CONFIANÇA"), sombra=sombra)


def largura_tagline(f, itens, tracking):
    gap = f.size * 0.75
    return sum(largura_texto(t, f, tracking) for t in itens) + gap * 2 * (len(itens) - 1)


def maxima_cor(cor):
    return sum(cor) < 380


if __name__ == "__main__":
    # 11 — espelhado: foto à esquerda, texto à direita (monitoramento)
    img = fundo("h02", foco=(0.5, 0.45), espelhar=True)
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .10), (.38, .30), (.62, .86), (1, .97)]))
    img.alpha_composite(gradiente_vertical(LW, HH, [(0, .28), (.5, 0), (1, .30)]))
    logo = redimensionar_altura(logos["logo-reverso"], 250)
    colar(img, logo, LW - 64 - logo.width, (HH - 6 - logo.height) // 2)
    tx = LW - 64 - logo.width - 96
    divisor_vertical(img, tx + 48, 92, HH - 92, alfa=190)
    titulo(img, tx, 118, ["MONITORAMENTO", "E INTELIGÊNCIA"], 40, BRANCO, ancora="r", sombra=6)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-11-monitoramento-alternativo.jpg", img)

    # 12 — viatura à esquerda, texto à direita (supervisão)
    img = fundo("h04", foco=(0.34, 0.60))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .05), (.34, .22), (.60, .80), (1, .96)]))
    img.alpha_composite(gradiente_vertical(LW, HH, [(0, .30), (.5, 0), (1, .34)]))
    logo = redimensionar_altura(logos["logo-reverso"], 250)
    colar(img, logo, LW - 64 - logo.width, (HH - 6 - logo.height) // 2)
    tx = LW - 64 - logo.width - 96
    divisor_vertical(img, tx + 48, 92, HH - 92, alfa=190)
    titulo(img, tx, 128, ["SUPERVISÃO", "E RONDA"], 40, BRANCO, ancora="r", sombra=6)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-12-supervisao-alternativo.jpg", img)

    # 13 — centralizado com marcos de canto (portaria)
    img = fundo("h03", foco=(0.5, 0.55))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .55), (.5, .74), (1, .55)]))
    img.alpha_composite(gradiente_vertical(LW, HH, [(0, .42), (.45, .14), (1, .55)]))
    logo = redimensionar_altura(logos["logo-reverso"], 210)
    colar(img, logo, (LW - logo.width) // 2, 44)
    linha_tagline(img, LW // 2, 286, fonte("Cinzel.ttf", 22, "Bold"), OURO_CLARO, OURO, 4, "c", sombra=5)
    marco_cantos(img, 40, 32, LW - 40, HH - 44, 30, OURO, 3, 200)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-13-portaria-central.jpg", img)

    # 14 — claro com selo circular (portal do cliente)
    img = fundo("h05", foco=(0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .92), (.5, .86), (1, .30)], BRANCO))
    selo = selo_circular(240, 104)
    colar(img, selo, 74, (HH - 6 - selo.height) // 2)
    titulo(img, 74 + selo.width + 60, 126, ["PORTAL", "DO CLIENTE"], 42, MARINHO)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-14-portal-selo.jpg", img)

    # 15 — navy sólido com título central e faixa dupla (institucional sóbrio)
    img = fundo("f06", foco=(0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .55), (.5, .70), (1, .55)]))
    logo = redimensionar_altura(logos["logo-reverso"], 196)
    colar(img, logo, (LW - logo.width) // 2, 62)
    divisor_horizontal(img, LW // 2 - 240, LW // 2 + 240, 290, alfa=190, largura=2)
    linha_tagline(img, LW // 2, 306, fonte("Cinzel.ttf", 20, "Regular"), OURO_CLARO, OURO, 4, "c")
    faixa_dourada(img, 0, 4)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-15-institucional-sobrio.jpg", img)

    # 16 — ondas douradas com lockup à esquerda e assinatura à direita
    img = fundo("f10", foco=(0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .90), (.45, .78), (.75, .30), (1, .12)]))
    logo = redimensionar_altura(logos["logo-reverso"], 262)
    colar(img, logo, 64, (HH - 6 - logo.height) // 2)
    tx = 64 + logo.width + 92
    divisor_vertical(img, tx - 48, 96, HH - 96, alfa=200)
    f = fonte("CormorantItalic.ttf", 44, "SemiBold Italic")
    desenhar_texto(img, tx, 120, "Segurança que faz", f, BRANCO, 0)
    desenhar_texto(img, tx, 172, "a diferença.", f, OURO_CLARO, 0)
    linha_tagline(img, tx, 250, fonte("Cinzel.ttf", 18, "Regular"), OURO_CLARO, OURO, 3)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-16-ondas-lockup.jpg", img)

    # 17 — split: skyline à esquerda, painel marinho à direita com o título
    img = fundo("h01", foco=(0.30, 0.45))
    corte = 720
    painel = gradiente_linear(LW - corte, HH, [(0, 0), (.55, .22), (1, .42)], -20, MARINHO, MARINHO_3)
    img.paste(painel.convert("RGB"), (corte, 0))
    divisor_vertical(img, corte, 0, HH, cor=OURO, alfa=255, largura=3)
    logo = redimensionar_altura(logos["logo-reverso"], 96)
    colar(img, logo, corte + 60, 46)
    tx = corte + 60
    disponivel = LW - tx - 56
    tam = 40
    while tam > 22 and largura_texto("INTEGRADA", fonte("Cinzel.ttf", tam, "Bold"), 2) > disponivel:
        tam -= 2
    f = fonte("Cinzel.ttf", tam, "Bold")
    desenhar_texto(img, tx, 172, "SEGURANÇA", f, BRANCO, 2, sombra=6)
    desenhar_texto(img, tx, 172 + int(tam * 1.32), "INTEGRADA", f, BRANCO, 2, sombra=6)
    divisor_horizontal(img, tx, tx + 70, 276, cor=OURO, alfa=255, largura=3)
    tagline_ajustada(img, tx, 292, OURO_CLARO, OURO, disponivel, "l", 16, sombra=4)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-17-split-skyline.jpg", img)

    # 18 — tecnológico: rede + grade fina + sigla em destaque
    img = fundo("f09", foco=(0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .80), (.5, .68), (1, .80)]))
    grade_fina(img, 48, BRANCO, 20)
    logo = redimensionar_altura(logos["logo-reverso"], 176)
    colar(img, logo, 64, 58)
    divisor_vertical(img, 64 + logo.width + 56, 96, HH - 96, alfa=200)
    tx = 64 + logo.width + 108
    f = fonte("Cinzel.ttf", 46, "Bold")
    desenhar_texto(img, tx, 104, "TECNOLOGIA EM", f, BRANCO, 2, sombra=6)
    desenhar_texto(img, tx, 156, "SEGURANÇA", f, OURO_CLARO, 2, sombra=6)
    linha_tagline(img, tx, 240, fonte("Cinzel.ttf", 18, "Regular"), (214, 226, 240), OURO, 3)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-18-tecnologia.jpg", img)

    # 19 — recorte alto, título grande central (operação)
    img = fundo("h02", foco=(0.5, 0.18))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .62), (.5, .74), (1, .62)]))
    img.alpha_composite(gradiente_vertical(LW, HH, [(0, .45), (.5, .10), (1, .50)]))
    f = fonte("Cinzel.ttf", 58, "Bold")
    desenhar_texto(img, LW // 2, 96, "OPERAÇÃO", f, BRANCO, 4, "c", sombra=8)
    desenhar_texto(img, LW // 2, 168, "CONTÍNUA", f, OURO_CLARO, 4, "c", sombra=8)
    linha_tagline(img, LW // 2, 268, fonte("Cinzel.ttf", 22, "Bold"), BRANCO, OURO, 4, "c", sombra=5)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-19-operacao-continua.jpg", img)

    # 20 — claro com tarja diagonal dourada (portal, versão enxuta)
    img = fundo("h05", foco=(0.62, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .26), (.34, .78), (.70, .90), (1, .88)], BRANCO))
    t = Tela(LW, HH, ss=2)
    t.poligono([(0, HH), (0, HH - 108), (LW, 96), (LW, HH)], preenchimento=(238, 231, 214))
    tarja = t.resultado()
    tarja.putalpha(tarja.getchannel("A").point(lambda v: int(v * 0.5)))
    img.alpha_composite(tarja)
    logo = redimensionar_altura(logos["logo-marinho"], 232)
    colar(img, logo, 74, (HH - 6 - logo.height) // 2)
    titulo(img, 74 + logo.width + 84, 132, ["ÁREA DO", "CLIENTE"], 40, MARINHO)
    faixa_dourada(img, HH - 6, 6)
    salvar("cabecalho-20-portal-tarja.jpg", img)

    for nome, tam in GERADOS:
        print(f"{nome:46s} {tam/1024:6.0f} KB")

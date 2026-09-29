"""Lote 04 — 10 cabeçalhos compactos de e-mail (1200×200) para respostas e notificações.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-04.py
Saída: public/email/cabecalhos/cabecalho-21..30-*.jpg
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

F = RAIZ / "design/email/fundos/lote-01"
CAB = RAIZ / "public/email/cabecalhos"
LW, HH = 1200, 200
logos = carregar_logos()
GERADOS = []


def fundo(nome, foco=(0.5, 0.5), espelhar=False):
    im = Image.open(F / f"{nome}.jpg")
    if espelhar:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return cobrir(im, LW, HH, foco)


def salvar(nome, img, qualidade=87):
    GERADOS.append((nome, salvar_jpg(img, CAB / nome, qualidade)))


def escuro_foto(img, esquerda=0.94, direita=0.14):
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, esquerda), (.45, esquerda - .06), (.78, direita + .22), (1, direita)]))
    img.alpha_composite(gradiente_vertical(LW, HH, [(0, .22), (.5, 0), (1, .26)]))


def lockup_alto(escuro, altura):
    esc = redimensionar_altura(logos["escudo-reverso" if escuro else "escudo-marinho"], altura)
    txt = redimensionar_altura(logos["texto-reverso" if escuro else "texto-marinho"], round(altura * 0.86))
    gap = round(altura * 0.24)
    tela = Image.new("RGBA", (esc.width + gap + txt.width, max(esc.height, txt.height)), (0, 0, 0, 0))
    tela.alpha_composite(esc, (0, (tela.height - esc.height) // 2))
    tela.alpha_composite(txt, (esc.width + gap, (tela.height - txt.height) // 2))
    return tela


if __name__ == "__main__":
    # 21 — navy translúcido sobre foto, lockup à esquerda, fio dourado à direita
    img = fundo("h02", (0.45, 0.45))
    escuro_foto(img, .96, .30)
    lk = lockup_alto(True, 112)
    colar(img, lk, 60, (HH - lk.height) // 2)
    divisor_vertical(img, 60 + lk.width + 44, 46, HH - 46, alfa=200)
    f = fonte("Cinzel.ttf", 26, "Bold")
    desenhar_texto(img, 60 + lk.width + 88, 62, "RESPOSTA AO CLIENTE", f, BRANCO, 3, sombra=5)
    linha_tagline(img, 60 + lk.width + 88, 118, fonte("Cinzel.ttf", 15, "Regular"), OURO_CLARO, OURO, 3, sombra=3)
    faixa_dourada(img, HH - 5, 5)
    salvar("cabecalho-21-resposta-cliente.jpg", img)

    # 22 — claro (creme), lockup à esquerda, texto marinho
    img = fundo("f07", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .70), (.5, .58), (1, .64)], BRANCO))
    lk = lockup_alto(False, 112)
    colar(img, lk, 60, (HH - lk.height) // 2)
    divisor_vertical(img, 60 + lk.width + 44, 46, HH - 46, cor=OURO, alfa=235)
    desenhar_texto(img, 60 + lk.width + 88, 64, "COMUNICADO INTERNO", fonte("Cinzel.ttf", 26, "Bold"), MARINHO, 3)
    linha_tagline(img, 60 + lk.width + 88, 120, fonte("Cinzel.ttf", 15, "Regular"), OURO_TEXTO, OURO, 3)
    faixa_dourada(img, HH - 5, 5)
    salvar("cabecalho-22-comunicado-interno.jpg", img)

    # 23 — skyline escuro, escudo à esquerda, título centralizado à direita
    img = fundo("h01", (0.5, 0.55))
    escuro_foto(img, .90, .22)
    esc = redimensionar_altura(logos["escudo-reverso"], 116)
    colar(img, esc, 60, (HH - esc.height) // 2)
    desenhar_texto(img, LW // 2 + 60, 68, "GRUPO SEG SYSTEM", fonte("Cinzel.ttf", 28, "Bold"), BRANCO, 4, "c", sombra=5)
    divisor_horizontal(img, LW // 2 - 30, LW // 2 + 150, 118, cor=OURO, alfa=255, largura=3)
    linha_tagline(img, LW // 2 + 60, 134, fonte("Cinzel.ttf", 16, "Regular"), OURO_CLARO, OURO, 3, "c", sombra=3)
    faixa_dourada(img, HH - 5, 5)
    salvar("cabecalho-23-skyline-compacto.jpg", img)

    # 24 — ondas douradas, lockup centralizado
    img = fundo("f10", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .30), (.28, .58), (.72, .58), (1, .30)]))
    lk = lockup_alto(True, 118)
    colar(img, lk, (LW - lk.width) // 2, (HH - lk.height) // 2 - 4)
    salvar("cabecalho-24-ondas-compacto.jpg", img)

    # 25 — rede tecnológica, escudo + texto
    img = fundo("f09", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .82), (.5, .70), (1, .82)]))
    grade_fina(img, 40, BRANCO, 14)
    esc = redimensionar_altura(logos["escudo-reverso"], 104)
    colar(img, esc, 60, (HH - esc.height) // 2)
    tx = 60 + esc.width + 40
    f = fonte("Cinzel.ttf", 27, "Bold")
    desenhar_texto(img, tx, 58, "PORTAL DO CLIENTE", f, BRANCO, 3, sombra=5)
    linha_tagline(img, tx, 112, fonte("Cinzel.ttf", 15, "Regular"), OURO_CLARO, OURO, 3, sombra=3)
    fileira_glifos(img, LW - 60, 80, ["globo", "email"], 40, OURO_CLARO, 24, ancora="r")
    salvar("cabecalho-25-portal-compacto.jpg", img)

    # 26 — barra marinho sólida com tarja dourada à esquerda
    img = fundo("f06", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .40), (.5, .52), (1, .40)]))
    t = Tela(LW, HH, ss=2)
    t.poligono([(0, 0), (18, 0), (54, HH), (0, HH)], preenchimento=OURO)
    img.alpha_composite(t.resultado())
    lk = lockup_alto(True, 106)
    colar(img, lk, 96, (HH - lk.height) // 2)
    linha_tagline(img, LW - 60, 84, fonte("Cinzel.ttf", 16, "Regular"), OURO_CLARO, OURO, 3, "r")
    salvar("cabecalho-26-barra-tarja.jpg", img)

    # 27 — claro minimalista com fio duplo
    img = fundo("h05", (0.68, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .90), (.42, .82), (.78, .30), (1, .10)], BRANCO))
    lk = lockup_alto(False, 108)
    colar(img, lk, 60, (HH - lk.height) // 2)
    tx = 60 + lk.width + 52
    divisor_horizontal(img, tx, tx + 120, 74, cor=OURO_ESCURO, alfa=240, largura=3)
    divisor_horizontal(img, tx, tx + 120, 84, cor=OURO, alfa=150, largura=1)
    desenhar_texto(img, tx, 100, "ÁREA RESTRITA", fonte("Cinzel.ttf", 24, "Bold"), MARINHO, 3)
    faixa_dourada(img, HH - 5, 5)
    salvar("cabecalho-27-area-restrita.jpg", img)

    # 28 — split diagonal: foto à esquerda, painel à direita
    img = fundo("h03", (0.4, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .35), (.4, .20), (.54, 0), (.54, 0)]))
    t = Tela(LW, HH, ss=2)
    t.poligono([(640, 0), (LW, 0), (LW, HH), (700, HH)], preenchimento=MARINHO)
    img.alpha_composite(t.resultado())
    divisor_vertical(img, 690, 0, HH, cor=OURO, alfa=255, largura=3)
    esc = redimensionar_altura(logos["escudo-reverso"], 96)
    colar(img, esc, 760, (HH - esc.height) // 2)
    tx = 760 + esc.width + 40
    f = fonte("Cinzel.ttf", 25, "Bold")
    desenhar_texto(img, tx, 62, "CONTROLE DE", f, BRANCO, 3, sombra=5)
    desenhar_texto(img, tx, 100, "ACESSO", f, BRANCO, 3, sombra=5)
    salvar("cabecalho-28-split-diagonal.jpg", img)

    # 29 — operação: foto em tira central, marcos de canto
    img = fundo("h04", (0.5, 0.55))
    escuro_foto(img, .88, .30)
    marco_cantos(img, 34, 26, LW - 34, HH - 30, 24, OURO, 2, 190)
    lk = lockup_alto(True, 100)
    colar(img, lk, (LW - lk.width) // 2, (HH - lk.height) // 2)
    faixa_dourada(img, HH - 5, 5)
    salvar("cabecalho-29-operacao-marcos.jpg", img)

    # 30 — notificação: fio dourado + escudo pequeno + tagline à direita
    img = fundo("f06", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .46), (.5, .56), (1, .46)]))
    esc = redimensionar_altura(logos["escudo-reverso"], 96)
    colar(img, esc, 62, (HH - esc.height) // 2)
    tx = 62 + esc.width + 34
    divisor_vertical(img, tx, 52, HH - 52, alfa=200)
    desenhar_texto(img, tx + 34, 68, "AVISO AUTOMÁTICO", fonte("Cinzel.ttf", 22, "Bold"), BRANCO, 3)
    desenhar_texto(img, tx + 34, 106, "não responda a este e-mail", fonte("CormorantItalic.ttf", 24, "Italic"), OURO_CLARO, 0)
    linha_tagline(img, LW - 60, 118, fonte("Cinzel.ttf", 15, "Regular"), (206, 218, 232), OURO, 3, "r")
    salvar("cabecalho-30-aviso-automatico.jpg", img)

    for nome, tam in GERADOS:
        print(f"{nome:44s} {tam/1024:6.0f} KB")

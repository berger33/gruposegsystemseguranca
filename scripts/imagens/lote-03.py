"""Lote 03 — 10 rodapés de e-mail alternativos (1200×300).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-03.py
Saída: public/email/rodapes/rodape-06..15-*.jpg
Sem dados da empresa desenhados: endereço, telefones e redes ficam no HTML.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

F = RAIZ / "design/email/fundos/lote-01"
ROD = RAIZ / "public/email/rodapes"
LW, HF = 1200, 300
logos = carregar_logos()
GERADOS = []


def fundo(nome, foco=(0.5, 0.5), espelhar=False, w=LW, h=HF):
    im = Image.open(F / f"{nome}.jpg")
    if espelhar:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return cobrir(im, w, h, foco)


def salvar(nome, img, qualidade=86):
    GERADOS.append((nome, salvar_jpg(img, ROD / nome, qualidade)))


def lockup(escuro, altura_escudo=140):
    esc = redimensionar_altura(logos["escudo-reverso" if escuro else "escudo-marinho"], altura_escudo)
    txt = redimensionar_altura(logos["texto-reverso" if escuro else "texto-marinho"], round(altura_escudo * 0.86))
    gap = 34
    tela = Image.new("RGBA", (esc.width + gap + txt.width, max(esc.height, txt.height)), (0, 0, 0, 0))
    tela.alpha_composite(esc, (0, (tela.height - esc.height) // 2))
    tela.alpha_composite(txt, (esc.width + gap, (tela.height - txt.height) // 2))
    return tela


if __name__ == "__main__":
    # 06 — claro, lockup centralizado + fileira de glifos de contato (rótulos no HTML)
    img = fundo("f07", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .55), (.5, .35), (1, .55)], BRANCO))
    lk = lockup(False, 132)
    colar(img, lk, (LW - lk.width) // 2, 34)
    divisor_horizontal(img, LW // 2 - 220, LW // 2 + 220, 198, cor=OURO, alfa=200, largura=2)
    fileira_glifos(img, LW // 2, 222, ["globo", "email", "whatsapp", "instagram", "linkedin"], 44, MARINHO, 34)
    faixa_dourada(img, 0, 4)
    salvar("rodape-06-claro-contatos.jpg", img)

    # 07 — marinho com fio duplo dourado e lockup à esquerda
    img = fundo("f06", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .55), (.5, .60), (1, .55)]))
    lk = lockup(True, 150)
    colar(img, lk, 74, (HF - lk.height) // 2)
    for dy, alfa in ((0, 255), (8, 120)):
        divisor_horizontal(img, 74, 74 + 150, (HF - lk.height) // 2 + dy - 16, cor=OURO, alfa=alfa, largura=2)
    tagline = fonte("Cinzel.ttf", 19, "Regular")
    linha_tagline(img, 74, 214, tagline, OURO_CLARO, OURO, 3)
    fileira_glifos(img, LW - 74, 120, ["globo", "email", "whatsapp"], 40, OURO_CLARO, 30, ancora="r")
    salvar("rodape-07-marinho-fio-duplo.jpg", img)

    # 08 — escuro com selo circular à esquerda (contatos no HTML à direita)
    img = fundo("f08", (0.5, 1.0))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .88), (.42, .74), (.72, .30), (1, .34)]))
    selo = selo_circular(176, 78)
    colar(img, selo, 66, (HF - selo.height) // 2)
    tx = 66 + selo.width + 56
    divisor_vertical(img, tx, 76, HF - 68, alfa=200)
    linha_tagline(img, tx + 44, 92, fonte("Cinzel.ttf", 21, "Regular"), OURO_CLARO, OURO, 4, sombra=4)
    f = fonte("CormorantItalic.ttf", 30, "SemiBold Italic")
    desenhar_texto(img, tx + 44, 148, "Segurança que faz a diferença.", f, (222, 230, 240), 0, sombra=4)
    faixa_dourada(img, HF - 5, 5)
    salvar("rodape-08-selo.jpg", img)

    # 09 — navy com marcos de canto e tagline central
    img = fundo("f06", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .40), (.5, .55), (1, .40)]))
    esc = redimensionar_altura(logos["escudo-reverso"], 104)
    colar(img, esc, (LW - esc.width) // 2, 34)
    linha_tagline(img, LW // 2, 168, fonte("Cinzel.ttf", 24, "Regular"), OURO_CLARO, OURO, 6, "c")
    marco_cantos(img, 44, 30, LW - 44, HF - 34, 30, OURO, 3, 190)
    salvar("rodape-09-marcos.jpg", img)

    # 10 — escuro com faixa dourada no topo e wordmark centralizado
    img = fundo("f09", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .62), (.5, .70), (1, .62)]))
    faixa_dourada(img, 0, 6)
    txt = redimensionar_altura(logos["texto-reverso"], 132)
    colar(img, txt, (LW - txt.width) // 2, 54)
    divisor_horizontal(img, LW // 2 - 200, LW // 2 + 200, 216, alfa=170, largura=2)
    linha_tagline(img, LW // 2, 232, fonte("Cinzel.ttf", 18, "Regular"), OURO_CLARO, OURO, 4, "c")
    salvar("rodape-10-faixa-topo.jpg", img)

    # 11 — claro com tarja diagonal dourada e lockup à esquerda
    img = fundo("f07", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .78), (.5, .62), (1, .58)], BRANCO))
    t = Tela(LW, HF, ss=2)
    t.poligono([(0, HF), (0, HF - 96), (LW, 40), (LW, HF)], preenchimento=(240, 233, 217))
    tarja = t.resultado()
    tarja.putalpha(tarja.getchannel("A").point(lambda v: int(v * 0.45)))
    img.alpha_composite(tarja)
    lk = lockup(False, 140)
    colar(img, lk, 74, 40)
    divisor_vertical(img, 74 + lk.width + 54, 74, HF - 62, cor=OURO, alfa=210)
    tx = 74 + lk.width + 100
    f = fonte("Cinzel.ttf", 30, "Bold")
    desenhar_texto(img, tx, 92, "SEGURANÇA QUE FAZ", f, MARINHO, 2)
    desenhar_texto(img, tx, 132, "A DIFERENÇA", f, MARINHO, 2)
    divisor_horizontal(img, tx, tx + 96, 186, cor=OURO, alfa=255, largura=3)
    linha_tagline(img, tx, 202, fonte("Cinzel.ttf", 16, "Regular"), OURO_TEXTO, OURO, 3)
    faixa_dourada(img, 0, 4)
    salvar("rodape-11-claro-tarja.jpg", img)

    # 12 — escuro com malha técnica discreta
    img = fundo("f09", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .70), (.5, .62), (1, .70)]))
    grade_fina(img, 44, BRANCO, 16)
    esc = redimensionar_altura(logos["escudo-reverso"], 118)
    colar(img, esc, 74, (HF - esc.height) // 2)
    tx = 74 + esc.width + 48
    divisor_vertical(img, tx, 74, HF - 66, alfa=190)
    f = fonte("Cinzel.ttf", 28, "Bold")
    desenhar_texto(img, tx + 40, 84, "PROTEÇÃO E TECNOLOGIA", f, BRANCO, 2, sombra=4)
    linha_tagline(img, tx + 40, 134, fonte("Cinzel.ttf", 17, "Regular"), OURO_CLARO, OURO, 3, sombra=3)
    fileira_glifos(img, LW - 70, 126, ["whatsapp", "email"], 38, OURO_CLARO, 26, ancora="r")
    salvar("rodape-12-malha.jpg", img)

    # 13 — espaço reservado ao texto legal (área livre + fio dourado)
    img = fundo("f06", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .72), (.5, .66), (1, .72)]))
    faixa_dourada(img, 26, 3)
    esc = redimensionar_altura(logos["escudo-reverso"], 74)
    colar(img, esc, 74, 52)
    txt = redimensionar_altura(logos["texto-reverso"], 62)
    colar(img, txt, 74 + esc.width + 26, 56)
    divisor_horizontal(img, 74, LW - 74, 148, cor=OURO, alfa=120, largura=1)
    # as linhas de texto legal (razão social, CNPJ, endereço) entram no HTML, não na imagem
    salvar("rodape-13-legal.jpg", img)

    # 14 — escuro com faixa de destaque superior e assinatura em itálico
    img = fundo("f10", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .66), (.5, .50), (1, .66)]))
    lk = lockup(True, 132)
    colar(img, lk, 78, 46)
    tx = 78 + lk.width + 60
    divisor_vertical(img, tx, 68, HF - 60, alfa=200)
    f = fonte("CormorantItalic.ttf", 42, "SemiBold Italic")
    desenhar_texto(img, tx + 46, 92, "Proteção. Tecnologia.", f, BRANCO, 0, sombra=5)
    desenhar_texto(img, tx + 46, 146, "Confiança.", f, OURO_CLARO, 0, sombra=5)
    salvar("rodape-14-assinatura.jpg", img)

    # 15 — minimalista: fio dourado sobre navy profundo, sem marca
    img = fundo("f06", (0.5, 0.5))
    img.alpha_composite(gradiente_vertical(LW, HF, [(0, .30), (.45, .55), (1, .72)]))
    divisor_horizontal(img, 120, LW - 120, HF // 2 - 1, cor=OURO, alfa=210, largura=2)
    divisor_horizontal(img, 120, LW - 120, HF // 2 + 9, cor=OURO_ESCURO, alfa=120, largura=1)
    salvar("rodape-15-minimalista.jpg", img)

    for nome, tam in GERADOS:
        print(f"{nome:42s} {tam/1024:6.0f} KB")

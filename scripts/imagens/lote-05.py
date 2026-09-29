"""Lote 05 — 10 peças compactas de e-mail: faixas/divisores, rodapés enxutos e assinaturas.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-05.py
Saída: public/email/faixas/*.jpg, public/email/rodapes/*.jpg, public/email/assinaturas/*.jpg
Dados de contato (telefone, e-mail, endereço) ficam no HTML da assinatura — nunca na imagem.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

F = RAIZ / "design/email/fundos/lote-01"
FAI = RAIZ / "public/email/faixas"
ROD = RAIZ / "public/email/rodapes"
ASS = RAIZ / "public/email/assinaturas"
logos = carregar_logos()
GERADOS = []


def fundo(nome, w, h, foco=(0.5, 0.5)):
    return cobrir(Image.open(F / f"{nome}.jpg"), w, h, foco)


def salvar(pasta, nome, img, qualidade=88):
    GERADOS.append((nome, salvar_jpg(img, pasta / nome, qualidade)))


def lockup(escuro, altura_escudo):
    esc = redimensionar_altura(logos["escudo-reverso" if escuro else "escudo-marinho"], altura_escudo)
    txt = redimensionar_altura(logos["texto-reverso" if escuro else "texto-marinho"], round(altura_escudo * 0.86))
    gap = round(altura_escudo * 0.24)
    tela = Image.new("RGBA", (esc.width + gap + txt.width, max(esc.height, txt.height)), (0, 0, 0, 0))
    tela.alpha_composite(esc, (0, (tela.height - esc.height) // 2))
    tela.alpha_composite(txt, (esc.width + gap, (tela.height - txt.height) // 2))
    return tela


if __name__ == "__main__":
    # --- rodapés enxutos (1200×160)
    w, h = 1200, 160
    img = fundo("f06", w, h)
    img.alpha_composite(gradiente_horizontal(w, h, [(0, .42), (.5, .54), (1, .42)]))
    esc = redimensionar_altura(logos["escudo-reverso"], 92)
    colar(img, esc, 60, (h - esc.height) // 2)
    tx = 60 + esc.width + 40
    divisor_vertical(img, tx, 42, h - 42, alfa=200)
    desenhar_texto(img, tx + 36, 40, "GRUPO SEG SYSTEM", fonte("Cinzel.ttf", 24, "Bold"), BRANCO, 3)
    desenhar_texto(img, tx + 36, 78, "SEGURANÇA INTEGRADA", fonte("Cinzel.ttf", 15, "Regular"), OURO_CLARO, 4)
    linha_tagline(img, w - 60, 66, fonte("Cinzel.ttf", 16, "Regular"), (208, 220, 234), OURO, 3, "r")
    faixa_dourada(img, h - 4, 4)
    salvar(ROD, "rodape-16-compacto-marinho.jpg", img)

    img = fundo("f07", w, h)
    img.alpha_composite(gradiente_horizontal(w, h, [(0, .62), (.5, .48), (1, .58)], BRANCO))
    esc = redimensionar_altura(logos["escudo-marinho"], 92)
    colar(img, esc, 60, (h - esc.height) // 2)
    tx = 60 + esc.width + 40
    divisor_vertical(img, tx, 42, h - 42, cor=OURO, alfa=235)
    desenhar_texto(img, tx + 36, 40, "GRUPO SEG SYSTEM", fonte("Cinzel.ttf", 24, "Bold"), MARINHO, 3)
    desenhar_texto(img, tx + 36, 78, "SEGURANÇA INTEGRADA", fonte("Cinzel.ttf", 15, "Regular"), OURO_TEXTO, 4)
    linha_tagline(img, w - 60, 66, fonte("Cinzel.ttf", 16, "Regular"), OURO_TEXTO, OURO, 3, "r")
    faixa_dourada(img, h - 4, 4)
    salvar(ROD, "rodape-17-compacto-claro.jpg", img)

    # --- faixas / divisores (1200×60, 1200×60, 1200×40, 1200×90)
    w, h = 1200, 60
    img = fundo("f07", w, h)
    img.alpha_composite(gradiente_vertical(w, h, [(0, .90), (1, .90)], BRANCO))
    divisor_horizontal(img, 0, w, 22, cor=OURO_CLARO, alfa=230, largura=2)
    divisor_horizontal(img, 0, w, 30, cor=OURO, alfa=170, largura=1)
    t = Tela(w, h)
    t.poligono([(600, 14), (614, 27), (600, 40), (586, 27)], preenchimento=OURO)
    img.alpha_composite(t.resultado())
    salvar(FAI, "faixa-01-divisor-dourado.jpg", img)

    img = fundo("f06", w, h)
    img.alpha_composite(gradiente_vertical(w, h, [(0, .70), (1, .70)]))
    divisor_horizontal(img, 0, w, 22, cor=OURO, alfa=210, largura=2)
    divisor_horizontal(img, 0, w, 30, cor=OURO_ESCURO, alfa=130, largura=1)
    t = Tela(w, h)
    t.poligono([(600, 14), (614, 27), (600, 40), (586, 27)], preenchimento=OURO_CLARO)
    img.alpha_composite(t.resultado())
    salvar(FAI, "faixa-02-divisor-marinho.jpg", img)

    w, h = 1200, 40
    img = gradiente_linear(w, h, [(0, 0), (.5, 1), (1, 0)], 0, OURO_ESCURO, OURO_CLARO)
    salvar(FAI, "faixa-03-tarja-dourada.jpg", img.convert("RGB"))

    w, h = 1200, 90
    img = fundo("f07", w, h)
    img.alpha_composite(gradiente_vertical(w, h, [(0, .92), (1, .92)], BRANCO))
    divisor_horizontal(img, 60, 520, 38, cor=OURO, alfa=235, largura=2)
    divisor_horizontal(img, 60, 520, 46, cor=OURO_CLARO, alfa=170, largura=1)
    divisor_horizontal(img, 680, w - 60, 38, cor=OURO, alfa=235, largura=2)
    divisor_horizontal(img, 680, w - 60, 46, cor=OURO_CLARO, alfa=170, largura=1)
    selo = selo_circular(66, 30)
    colar(img, selo, (w - selo.width) // 2, (h - selo.height) // 2)
    salvar(FAI, "faixa-04-selo-centro.jpg", img)

    # --- assinaturas (640×180)
    w, h = 640, 180
    img = fundo("f06", w, h)
    img.alpha_composite(gradiente_horizontal(w, h, [(0, .55), (1, .55)]))
    esc = redimensionar_altura(logos["escudo-reverso"], 104)
    colar(img, esc, 34, (h - esc.height) // 2)
    tx = 34 + esc.width + 32
    divisor_vertical(img, tx, 42, h - 42, alfa=200)
    desenhar_texto(img, tx + 30, 44, "GRUPO SEG SYSTEM", fonte("Cinzel.ttf", 20, "Bold"), BRANCO, 2)
    desenhar_texto(img, tx + 30, 76, "SEGURANÇA INTEGRADA", fonte("Cinzel.ttf", 12, "Regular"), OURO_CLARO, 4)
    fileira_glifos(img, tx + 30, 108, ["globo", "email", "whatsapp"], 34, OURO_CLARO, 22, "l")
    faixa_dourada(img, h - 4, 4)
    salvar(ASS, "assinatura-01-marinho.jpg", img)

    img = fundo("f07", w, h)
    img.alpha_composite(gradiente_horizontal(w, h, [(0, .70), (1, .62)], BRANCO))
    esc = redimensionar_altura(logos["escudo-marinho"], 104)
    colar(img, esc, 34, (h - esc.height) // 2)
    tx = 34 + esc.width + 32
    divisor_vertical(img, tx, 42, h - 42, cor=OURO, alfa=235)
    desenhar_texto(img, tx + 30, 44, "GRUPO SEG SYSTEM", fonte("Cinzel.ttf", 20, "Bold"), MARINHO, 2)
    desenhar_texto(img, tx + 30, 76, "SEGURANÇA INTEGRADA", fonte("Cinzel.ttf", 12, "Regular"), OURO_TEXTO, 4)
    fileira_glifos(img, tx + 30, 108, ["globo", "email", "whatsapp"], 34, MARINHO, 22, "l")
    faixa_dourada(img, h - 4, 4)
    salvar(ASS, "assinatura-02-claro.jpg", img)

    img = fundo("f10", w, h)
    img.alpha_composite(gradiente_horizontal(w, h, [(0, .74), (.6, .58), (1, .74)]))
    lk = lockup(True, 96)
    colar(img, lk, 34, 32)
    divisor_horizontal(img, 34, w - 34, 136, cor=OURO, alfa=170, largura=1)
    linha_tagline(img, 34, 146, fonte("Cinzel.ttf", 13, "Regular"), OURO_CLARO, OURO, 3)
    salvar(ASS, "assinatura-03-dourada.jpg", img)

    img = fundo("h02", w, h, (0.45, 0.45))
    img.alpha_composite(gradiente_horizontal(w, h, [(0, .86), (.5, .80), (1, .86)]))
    lk = lockup(True, 92)
    colar(img, lk, 34, 28)
    divisor_horizontal(img, 34, w - 34, 130, cor=OURO, alfa=150, largura=1)
    desenhar_texto(img, 34, 144, "Segurança que faz a diferença.", fonte("CormorantItalic.ttf", 24, "SemiBold Italic"), BRANCO, 0, sombra=4)
    salvar(ASS, "assinatura-04-vidro.jpg", img)

    for nome, tam in GERADOS:
        print(f"{nome:38s} {tam/1024:6.0f} KB")

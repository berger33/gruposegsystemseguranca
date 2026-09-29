"""Lote 01 — 5 cabeçalhos + 5 rodapés de e-mail (1200 px de largura = exibição a 600 px em 2x).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-01.py
Entrada: design/email/fundos/lote-01/*.jpg (fundos gerados por IA, sem texto/logotipo)
Saída:   public/email/cabecalhos/*.jpg e public/email/rodapes/*.jpg
O logotipo real e os textos são aplicados aqui (nunca gerados por IA).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa

FUNDOS = RAIZ / "design/email/fundos/lote-01"
CAB = RAIZ / "public/email/cabecalhos"
ROD = RAIZ / "public/email/rodapes"
LW, HH, HF = 1200, 400, 300   # largura, altura cabeçalho, altura rodapé

logos = carregar_logos()


def fundo(nome, w, h, foco=(0.5, 0.5)):
    return cobrir(Image.open(FUNDOS / f"{nome}.jpg"), w, h, foco)


# ------------------------------------------------------------------ cabeçalhos
def cabecalho(nome_arquivo, bg, titulo, escuro=True, foto=False, foco=(0.5, 0.5), qualidade=86):
    img = fundo(bg, LW, HH, foco)
    if escuro and foto:
        img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .97), (.42, .93), (.66, .80), (.86, .38), (1, .10)]))
        img.alpha_composite(gradiente_vertical(LW, HH, [(0, .25), (.5, 0), (1, .35)]))
    elif escuro:
        img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .45), (.5, .05), (1, 0)]))
    else:  # layout claro sobre foto: véu branco garante contraste AA do texto marinho
        img.alpha_composite(gradiente_horizontal(LW, HH, [(0, .90), (.45, .84), (.80, .38), (1, .10)], BRANCO))
        img.alpha_composite(gradiente_vertical(LW, HH, [(0, .18), (.5, 0), (1, .10)], BRANCO))

    logo = redimensionar_altura(logos["logo-reverso" if escuro else "logo-marinho"], 268)
    lx, ly = 64, (HH - 6 - logo.height) // 2
    colar(img, logo, lx, ly)

    dx = lx + logo.width + 52
    divisor_vertical(img, dx, 92, HH - 92, alfa=190)
    tx = dx + 48
    cor_t = BRANCO if escuro else MARINHO
    cor_tag = OURO_CLARO if escuro else OURO_TEXTO

    # título em 1–2 linhas, auto-ajuste de tamanho à largura útil
    disp = LW - tx - 56
    tam = 42
    while tam > 26 and max(largura_texto(l, fonte("Cinzel.ttf", tam, "Bold"), 2) for l in titulo) > disp:
        tam -= 2
    f = fonte("Cinzel.ttf", tam, "Bold")
    alt_linha = int(tam * 1.32)
    bloco_h = alt_linha * len(titulo) + 24 + 30
    y = (HH - 6 - bloco_h) // 2 + 6
    for i, linha in enumerate(titulo):
        desenhar_texto(img, tx, y + i * alt_linha, linha, f, cor_t, 2, sombra=6 if foto else 0)
    yl = y + alt_linha * len(titulo) + 12
    divisor_horizontal(img, tx, tx + 70, yl, cor=OURO, alfa=255, largura=3)
    linha_tagline(img, tx, yl + 16, fonte("Cinzel.ttf", 20, "Bold" if foto else "Regular"), cor_tag, OURO, tracking=3, sombra=4 if escuro else 0)

    faixa_dourada(img, HH - 6, 6)
    return salvar_jpg(img, CAB / nome_arquivo, qualidade)


# ------------------------------------------------------------------ rodapés
def lockup_horizontal(escuro, altura_escudo=150):
    """Escudo + texto do logotipo lado a lado (peças reais do logotipo, sem redesenhar)."""
    esc = redimensionar_altura(logos["escudo-reverso" if escuro else "escudo-marinho"], altura_escudo)
    txt = redimensionar_altura(logos["texto-reverso" if escuro else "texto-marinho"], round(altura_escudo * 0.86))
    gap = 34
    tela = Image.new("RGBA", (esc.width + gap + txt.width, max(esc.height, txt.height)), (0, 0, 0, 0))
    tela.alpha_composite(esc, (0, (tela.height - esc.height) // 2))
    tela.alpha_composite(txt, (esc.width + gap, (tela.height - txt.height) // 2))
    return tela


def rodape(nome_arquivo, bg, layout, foco=(0.5, 0.5), qualidade=86):
    img = fundo(bg, LW, HF, foco)
    escuro = layout != "claro"
    f_tag = fonte("Cinzel.ttf", 20, "Regular")
    cor_tag = OURO_CLARO if escuro else OURO_TEXTO

    if layout == "lockup-central":                   # rodapé 1: marinho sólido
        lk = lockup_horizontal(True, 140)
        colar(img, lk, (LW - lk.width) // 2, 36)
        divisor_horizontal(img, LW // 2 - 190, LW // 2 + 190, 222, alfa=120, largura=1)
        linha_tagline(img, LW // 2, 240, f_tag, cor_tag, OURO, 4, "c")
    elif layout == "claro":                           # rodapé 2: claro, lockup à esquerda
        lk = lockup_horizontal(False, 150)
        colar(img, lk, 70, (HF - lk.height) // 2 + 4)
        dx = 70 + lk.width + 56
        divisor_vertical(img, dx, 78, HF - 70, alfa=200)
        f = fonte("Cinzel.ttf", 32, "Bold")
        y = 92
        desenhar_texto(img, dx + 48, y, "SEGURANÇA QUE FAZ", f, MARINHO, 2)
        desenhar_texto(img, dx + 48, y + 44, "A DIFERENÇA", f, MARINHO, 2)
        divisor_horizontal(img, dx + 48, dx + 118, y + 100, alfa=255, largura=3)
        linha_tagline(img, dx + 48, y + 116, fonte("Cinzel.ttf", 17, "Regular"), OURO_TEXTO, OURO, 3)
    elif layout == "skyline":                         # rodapé 3: escudo + tagline sobre skyline
        img.alpha_composite(gradiente_vertical(LW, HF, [(0, .90), (.34, .82), (.56, .40), (.72, .22), (1, .34)]))
        esc = redimensionar_altura(logos["escudo-reverso"], 110)
        colar(img, esc, (LW - esc.width) // 2, 20)
        linha_tagline(img, LW // 2, 148, fonte("Cinzel.ttf", 24, "Regular"), OURO_CLARO, OURO, 5, "c", sombra=5)
    elif layout == "rede":                            # rodapé 4: lockup à esquerda + assinatura à direita
        img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .55), (.5, .25), (1, .1)]))
        lk = lockup_horizontal(True, 150)
        colar(img, lk, 70, (HF - lk.height) // 2)
        dx = 70 + lk.width + 56
        divisor_vertical(img, dx, 78, HF - 70, alfa=190)
        f = fonte("CormorantItalic.ttf", 40, "SemiBold Italic")
        desenhar_texto(img, dx + 48, 96, "Segurança que faz", f, BRANCO, 0)
        desenhar_texto(img, dx + 48, 144, "a diferença.", f, OURO_CLARO, 0)
        linha_tagline(img, dx + 48, 210, fonte("Cinzel.ttf", 16, "Regular"), (200, 210, 225), OURO, 3)
    elif layout == "wordmark":                        # rodapé 5: wordmark centralizado sobre ondas
        img.alpha_composite(gradiente_horizontal(LW, HF, [(0, .12), (.28, .52), (.5, .64), (.72, .52), (1, .14)]))
        img.alpha_composite(gradiente_vertical(LW, HF, [(0, .10), (.52, .30), (1, .66)]))
        txt = redimensionar_altura(logos["texto-reverso"], 146)
        colar(img, txt, (LW - txt.width) // 2, 34)
        f = fonte("CormorantItalic.ttf", 30, "SemiBold Italic")
        desenhar_texto(img, LW // 2, 218, "Proteção • Tecnologia • Confiança", f, OURO_CLARO, 2, "c", sombra=5)
    return salvar_jpg(img, ROD / nome_arquivo, qualidade)


if __name__ == "__main__":
    tam = {}
    tam["cabecalho-01-institucional.jpg"] = cabecalho("cabecalho-01-institucional.jpg", "h01", ["SEGURANÇA QUE FAZ", "A DIFERENÇA"], foco=(0.5, 0.5))
    tam["cabecalho-02-monitoramento.jpg"] = cabecalho("cabecalho-02-monitoramento.jpg", "h02", ["MONITORAMENTO", "24 HORAS"], foto=True, foco=(0.5, 0.42))
    tam["cabecalho-03-portaria.jpg"] = cabecalho("cabecalho-03-portaria.jpg", "h03", ["PORTARIA E", "CONTROLE DE ACESSO"], foto=True, foco=(0.5, 0.62))
    tam["cabecalho-04-supervisao-ronda.jpg"] = cabecalho("cabecalho-04-supervisao-ronda.jpg", "h04", ["SUPERVISÃO", "E RONDA"], foto=True, foco=(0.5, 0.72))
    tam["cabecalho-05-portal-cliente-claro.jpg"] = cabecalho("cabecalho-05-portal-cliente-claro.jpg", "h05", ["PORTAL", "DO CLIENTE"], escuro=False, foco=(0.5, 0.5))
    tam["rodape-01-marinho.jpg"] = rodape("rodape-01-marinho.jpg", "f06", "lockup-central")
    tam["rodape-02-claro.jpg"] = rodape("rodape-02-claro.jpg", "f07", "claro")
    tam["rodape-03-skyline.jpg"] = rodape("rodape-03-skyline.jpg", "f08", "skyline", foco=(0.5, 0.92))
    tam["rodape-04-rede.jpg"] = rodape("rodape-04-rede.jpg", "f09", "rede")
    tam["rodape-05-ondas.jpg"] = rodape("rodape-05-ondas.jpg", "f10", "wordmark")
    for k, v in tam.items():
        print(f"{k:45s} {v/1024:6.0f} KB")

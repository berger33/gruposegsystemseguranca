"""Funções comuns para compor as imagens de e-mail e de interface do Grupo SEG System.

Requisitos (fora do projeto Node, apenas para gerar imagens):
    python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pillow numpy

Fontes (licença OFL, Google Fonts) — baixe e aponte FONT_DIR:
    Cinzel[wght].ttf  -> Cinzel.ttf
    CormorantGaramond-Italic[wght].ttf -> CormorantItalic.ttf
"""
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
FONT_DIR = Path(os.environ.get("FONT_DIR", "/tmp/fonts"))
LOGO_FONTE = RAIZ / "public/brand/454751406_1061413479159366_4672298606281258831_n.jpg"
LOGO_DIR = RAIZ / "public/brand/logo"

# Paleta medida no logotipo (não são HEX oficiais — ver docs/referencias-marca.md)
MARINHO = (13, 34, 54)        # navy do escudo (p10 amostrado)
MARINHO_2 = (21, 45, 68)      # navy com um passo de luz
MARINHO_3 = (30, 60, 92)      # navy claro para realces/hover
OURO = (196, 165, 106)        # dourado do aro/estrela
OURO_CLARO = (226, 199, 143)
OURO_ESCURO = (156, 126, 74)
OURO_TEXTO = (122, 94, 34)    # dourado escuro com contraste AA sobre branco
BRANCO = (255, 255, 255)
CINZA_TEXTO = (58, 70, 86)

# Separadores do logotipo original (linhas de texto no PNG recortado, 589x545)
ALTURA_ESCUDO = 310
LINHA_SEGURANCA = 498


# ---------------------------------------------------------------- logotipo
def _cor_para_alfa(rgb_img):
    """Remove o fundo branco do JPG, preservando cores e suavizando bordas."""
    a = np.asarray(rgb_img.convert("RGB")).astype(np.float32)
    alfa = np.max((255 - a) / 255.0, axis=2)
    alfa = np.clip((alfa - 0.04) / 0.96, 0, 1)
    a3 = np.maximum(alfa, 1e-4)[..., None]
    rgb = np.clip((a - 255 * (1 - a3)) / a3, 0, 255)
    return Image.fromarray(np.dstack([rgb, alfa * 255]).astype(np.uint8), "RGBA")


def _bbox(im, limiar=20):
    return im.getchannel("A").point(lambda v: 255 if v > limiar else 0).getbbox()


def _contorno(img, px, cor):
    a = img.getchannel("A")
    pad = px * 2
    tela = Image.new("L", (a.width + pad * 2, a.height + pad * 2), 0)
    tela.paste(a, (pad, pad))
    dil = tela.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(0.8))
    base = Image.new("RGBA", tela.size, cor + (0,))
    base.putalpha(dil)
    fg = Image.new("RGBA", tela.size, (0, 0, 0, 0))
    fg.paste(img, (pad, pad))
    out = Image.alpha_composite(base, fg)
    return out.crop(_bbox(out, 10))


def gerar_logos():
    """Gera as variações transparentes do logotipo em public/brand/logo/."""
    src = Image.open(LOGO_FONTE).convert("RGB").crop((315, 0, 1093, 768))  # miolo sem faixas laterais
    full = _cor_para_alfa(src)
    full = full.crop(_bbox(full))
    W, H = full.size
    LOGO_DIR.mkdir(parents=True, exist_ok=True)

    escudo = full.crop((0, 0, W, ALTURA_ESCUDO))
    escudo = escudo.crop(_bbox(escudo))
    texto = full.crop((0, ALTURA_ESCUDO, W, H))
    texto = texto.crop(_bbox(texto))

    def recolorir(img, linhas_brancas_ate):
        arr = np.asarray(img).copy()
        arr[:linhas_brancas_ate, :, :3] = BRANCO
        arr[linhas_brancas_ate:, :, :3] = OURO_CLARO
        # o navy original tem variação de tom (alfa < 1): reforça para o texto reverso ficar branco de verdade
        arr[..., 3] = np.clip(arr[..., 3].astype(np.float32) * 1.4, 0, 255).astype(np.uint8)
        return Image.fromarray(arr, "RGBA")

    # texto reverso: GRUPO / SEG SYSTEM brancos; SEGURANÇA INTEGRADA dourado
    topo_texto = ALTURA_ESCUDO + _bbox(full.crop((0, ALTURA_ESCUDO, W, H)))[1]  # y do 'GRUPO' no logo completo
    texto_rev = recolorir(texto, LINHA_SEGURANCA - topo_texto)
    escudo_rev = _contorno(escudo, 4, OURO_CLARO)

    gap = 14
    logo_rev = Image.new("RGBA", (max(escudo_rev.width, texto_rev.width),
                                  escudo_rev.height + gap + texto_rev.height), (0, 0, 0, 0))
    logo_rev.paste(escudo_rev, ((logo_rev.width - escudo_rev.width) // 2, 0))
    logo_rev.paste(texto_rev, ((logo_rev.width - texto_rev.width) // 2, escudo_rev.height + gap), texto_rev)
    logo_rev = logo_rev.crop(_bbox(logo_rev, 10))

    saidas = {
        "logo-marinho.png": full, "logo-reverso.png": logo_rev,
        "escudo-marinho.png": escudo, "escudo-reverso.png": escudo_rev,
        "texto-marinho.png": texto, "texto-reverso.png": texto_rev,
    }
    for nome, im in saidas.items():
        im.save(LOGO_DIR / nome, optimize=True)
    return saidas


def carregar_logos():
    nomes = ["logo-marinho", "logo-reverso", "escudo-marinho", "escudo-reverso", "texto-marinho", "texto-reverso"]
    if not all((LOGO_DIR / f"{n}.png").exists() for n in nomes):
        gerar_logos()
    return {n: Image.open(LOGO_DIR / f"{n}.png").convert("RGBA") for n in nomes}


def redimensionar_altura(img, altura):
    return img.resize((round(img.width * altura / img.height), altura), Image.LANCZOS)


def _dilatar(mascara, px):
    """Dilata uma máscara 'L' em px (MaxFilter aceita tamanhos pequenos; encadeia se preciso)."""
    if px <= 0:
        return mascara
    while px > 4:
        mascara = mascara.filter(ImageFilter.MaxFilter(9))
        px -= 4
    return mascara.filter(ImageFilter.MaxFilter(2 * px + 1))


def escudo_mascara(altura, recolorir=None, contorno=(0, 0, 0), contorno_px=0):
    """Silhueta do escudo do logotipo (fonte real da marca), opcionalmente recolorida."""
    esc = redimensionar_altura(carregar_logos()["escudo-marinho"], altura)
    if contorno_px:
        esc = _contorno(esc, contorno_px, contorno)
    if recolorir is not None:
        arr = np.asarray(esc).copy()
        arr[..., 0], arr[..., 1], arr[..., 2] = recolorir
        esc = Image.fromarray(arr, "RGBA")
    return esc


def escudo_simples(altura, preenchimento=MARINHO, contorno=OURO, contorno_px=6, brilho=True, limiar=110):
    """Escudo chapado (preenchimento + contorno) a partir da silhueta real do logotipo.

    Mantém o alinhamento entre contorno e corpo (sem recorte por bbox).
    """
    base = redimensionar_altura(carregar_logos()["escudo-marinho"], altura)
    pad = contorno_px
    tela = (base.width + pad * 2, base.height + pad * 2)

    m = base.getchannel("A").point(lambda v: 255 if v > limiar else 0)
    mascara = Image.new("L", tela, 0)
    mascara.paste(m, (pad, pad))

    corpo = Image.new("RGBA", tela, (0, 0, 0, 0))
    chapado = Image.new("RGBA", tela, tuple(preenchimento) + (255,))
    chapado.putalpha(mascara)
    corpo.alpha_composite(chapado)
    if brilho:  # luz suave no topo, presa à silhueta
        g = gradiente_vertical(tela[0], tela[1], [(0, .20), (.55, 0), (1, .10)], BRANCO)
        g.putalpha(Image.composite(g.getchannel("A"), Image.new("L", tela, 0), mascara))
        corpo.alpha_composite(g)

    saida = Image.new("RGBA", tela, (0, 0, 0, 0))
    if pad:
        halo = Image.new("RGBA", tela, tuple(contorno) + (0,))
        halo.putalpha(_dilatar(mascara, pad).filter(ImageFilter.GaussianBlur(0.6)))
        saida.alpha_composite(halo)
    saida.alpha_composite(corpo)
    return saida.crop(_bbox(saida, 8))


def botao_superficie(w, h, cor_a, cor_b, angulo=-40, contorno=None, contorno_alfa=205, contorno_largura=3,
                     brilho=0.13, escurecer_topo=0.0, sombra=6, margem=8, raio=20, anel=None, anel_folga=3,
                     anel_largura=3, opacidade=255, interior=None):
    """Superfície de botão RGBA (sem texto): o CSS/aplicação escreve o rótulo por cima.

    `interior` permite uma segunda cor para o miolo (efeito de estado pressionado).
    """
    m = margem
    corpo = placa(w - 2 * m, h - 2 * m, raio, cor_a, cor_b, angulo,
                  contorno=contorno, largura_contorno=contorno_largura, alfa_contorno=contorno_alfa, brilho=brilho)
    if interior:
        camada = gradiente_linear(corpo.width, corpo.height, [(0, .35), (1, .85)], angulo, interior[0], interior[1])
        mascara = Image.new("L", corpo.size, 0)
        ImageDraw.Draw(mascara).rounded_rectangle([0, 0, corpo.width - 1, corpo.height - 1], raio, fill=255)
        mascara = mascara.point(lambda v: int(v * 0.55))
        corpo = Image.alpha_composite(corpo, Image.composite(camada, Image.new("RGBA", corpo.size, (0, 0, 0, 0)), mascara))
    if escurecer_topo:
        corpo.alpha_composite(gradiente_vertical(corpo.width, corpo.height, [(0, escurecer_topo), (.45, escurecer_topo * .25), (1, 0)], (2, 8, 18)))

    tela = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if sombra:
        so = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        so.paste(corpo, (m, m + 2))
        so = so.filter(ImageFilter.GaussianBlur(sombra))
        so.putalpha(so.getchannel("A").point(lambda v: int(v * 0.50)))
        tela.alpha_composite(so)
    if anel is not None:
        ImageDraw.Draw(tela).rounded_rectangle([m - anel_folga, m - anel_folga, w - m + anel_folga - 1, h - m + anel_folga - 1],
                                              raio + anel_folga, outline=tuple(anel) + (255,), width=anel_largura)
    tela.alpha_composite(corpo, (m, m))
    if opacidade < 255:
        tela.putalpha(tela.getchannel("A").point(lambda v: int(v * opacidade / 255)))
    return tela



# ---------------------------------------------------------------- fontes / texto
def fonte(nome, tamanho, variacao=None):
    f = ImageFont.truetype(str(FONT_DIR / nome), tamanho)
    if variacao:
        f.set_variation_by_name(variacao)
    return f


def largura_texto(texto, f, tracking=0):
    return sum(f.getlength(c) + tracking for c in texto) - tracking


def desenhar_texto(img, x, y, texto, f, cor, tracking=0, ancora="l", sombra=0):
    """Desenha texto com espaçamento entre letras. ancora: l (esquerda), c (centro), r (direita). y = topo."""
    w = largura_texto(texto, f, tracking)
    x0 = x if ancora == "l" else (x - w / 2 if ancora == "c" else x - w)
    camada = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(camada)
    cx = x0
    for c in texto:
        d.text((cx, y), c, font=f, fill=cor + (255,) if len(cor) == 3 else cor)
        cx += f.getlength(c) + tracking
    if sombra:
        so = Image.new("RGBA", img.size, (0, 0, 0, 0))
        so.putalpha(camada.getchannel("A").point(lambda v: int(v * 0.85)))
        so = Image.composite(Image.new("RGBA", img.size, (3, 10, 24, 255)), so, so.getchannel("A"))
        so = so.filter(ImageFilter.GaussianBlur(sombra))
        img.alpha_composite(so)
    img.alpha_composite(camada)
    return w


def linha_tagline(img, cx, y, f, cor, cor_sep, tracking=3, ancora="l", itens=("PROTEÇÃO", "TECNOLOGIA", "CONFIANÇA"), sombra=0):
    """Desenha 'PROTEÇÃO ◆ TECNOLOGIA ◆ CONFIANÇA' (mensagem do site atual) com losangos dourados."""
    gap = f.size * 0.75
    larguras = [largura_texto(t, f, tracking) for t in itens]
    total = sum(larguras) + gap * 2 * (len(itens) - 1) + 0
    x = cx if ancora == "l" else (cx - total / 2 if ancora == "c" else cx - total)
    d = ImageDraw.Draw(img)
    for i, t in enumerate(itens):
        desenhar_texto(img, x, y, t, f, cor, tracking, sombra=sombra)
        x += larguras[i]
        if i < len(itens) - 1:
            m = f.size * 0.36
            cxm, cym = x + gap, y + f.size * 0.62
            d.polygon([(cxm, cym - m / 2), (cxm + m / 2, cym), (cxm, cym + m / 2), (cxm - m / 2, cym)], fill=cor_sep + (255,))
            x += gap * 2
    return total


# ---------------------------------------------------------------- imagens / gradientes
def cobrir(img, w, h, foco=(0.5, 0.5)):
    """Redimensiona para cobrir w×h e recorta ao redor do ponto de foco (0..1)."""
    esc = max(w / img.width, h / img.height)
    novo = img.resize((max(w, round(img.width * esc)), max(h, round(img.height * esc))), Image.LANCZOS)
    x = round((novo.width - w) * foco[0])
    y = round((novo.height - h) * foco[1])
    return novo.crop((x, y, x + w, y + h)).convert("RGBA")


def gradiente_horizontal(w, h, pontos, cor=MARINHO):
    """pontos = [(x_rel 0..1, alfa 0..1), ...] -> camada RGBA de cor sólida com alfa interpolado."""
    xs = np.linspace(0, 1, w)
    alfa = np.interp(xs, [p[0] for p in pontos], [p[1] for p in pontos])
    a = np.tile(alfa, (h, 1))
    arr = np.zeros((h, w, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = cor
    arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def gradiente_vertical(w, h, pontos, cor=MARINHO):
    ys = np.linspace(0, 1, h)
    alfa = np.interp(ys, [p[0] for p in pontos], [p[1] for p in pontos])
    a = np.tile(alfa[:, None], (1, w))
    arr = np.zeros((h, w, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = cor
    arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def gradiente_linear(w, h, pontos, angulo=-40, cor_a=MARINHO, cor_b=MARINHO_3):
    """Gradiente opaco entre duas cores projetado em `angulo` (graus; 0 = esquerda→direita)."""
    a = math.radians(angulo)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = xx * math.cos(a) + yy * math.sin(a)
    t = (t - t.min()) / max(float(np.ptp(t)), 1e-6)
    alfa = np.interp(t, [p[0] for p in pontos], [p[1] for p in pontos])[..., None]
    ca = np.array(cor_a, np.float32)
    cb = np.array(cor_b, np.float32)
    rgb = ca * (1 - alfa) + cb * alfa
    arr = np.dstack([rgb, np.full((h, w, 1), 255, np.float32)]).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def faixa_dourada(img, y, espessura):
    """Faixa horizontal com degradê ouro escuro → claro → escuro."""
    w = img.width
    xs = np.linspace(0, 1, w)
    c = np.zeros((w, 3))
    for i, (a, b) in enumerate(zip(OURO_ESCURO, OURO_CLARO)):
        c[:, i] = np.interp(xs, [0, 0.5, 1], [a, b, a])
    arr = np.tile(c[None, :, :], (espessura, 1, 1)).astype(np.uint8)
    faixa = Image.fromarray(arr, "RGB").convert("RGBA")
    img.paste(faixa, (0, y))


def divisor_vertical(img, x, y0, y1, cor=OURO, alfa=170, largura=2):
    camada = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(camada).line([(x, y0), (x, y1)], fill=cor + (alfa,), width=largura)
    img.alpha_composite(camada)


def divisor_horizontal(img, x0, x1, y, cor=OURO, alfa=170, largura=2):
    camada = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(camada).line([(x0, y), (x1, y)], fill=cor + (alfa,), width=largura)
    img.alpha_composite(camada)


def colar(img, logo, x, y):
    img.alpha_composite(logo, (int(x), int(y)))


def salvar_jpg(img, caminho, qualidade=86):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(caminho, "JPEG", quality=qualidade, subsampling=0, optimize=True, progressive=False)
    return caminho.stat().st_size


def salvar_png(img, caminho):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    img.save(caminho, "PNG", optimize=True)
    return caminho.stat().st_size


# ---------------------------------------------------------------- kit de interface (botões e ícones)
SS = 4  # superamostragem para traços antialiasados


class Tela:
    """Canvas RGBA com superamostragem: desenhe em pixels lógicos e reduza no fim."""

    def __init__(self, w, h, ss=SS):
        self.ss, self.w, self.h = ss, w, h
        self.img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def s(self, v):
        return int(round(v * self.ss))

    def traco(self, pontos, cor, largura, fechar=False, juntas=True):
        pts = [(self.s(x), self.s(y)) for x, y in pontos]
        if fechar:
            pts = pts + [pts[0]]
        self.d.line(pts, fill=cor + (255,), width=self.s(largura), joint="curve")
        if juntas:
            for x, y in pts:
                r = self.s(largura) // 2
                self.d.ellipse([x - r, y - r, x + r, y + r], fill=cor + (255,))

    def arco(self, cx, cy, r, cor, largura, ini=0, fim=180):
        self.d.arc([self.s(cx - r), self.s(cy - r), self.s(cx + r), self.s(cy + r)],
                   ini, fim, fill=cor + (255,), width=self.s(largura))

    def disco(self, cx, cy, r, cor):
        self.d.ellipse([self.s(cx - r), self.s(cy - r), self.s(cx + r), self.s(cy + r)], fill=cor + (255,))

    def anel(self, cx, cy, r, cor, largura):
        self.d.ellipse([self.s(cx - r), self.s(cy - r), self.s(cx + r), self.s(cy + r)],
                       outline=cor + (255,), width=self.s(largura))

    def caixa(self, x0, y0, x1, y1, raio=0, preenchimento=None, contorno=None, largura=0):
        xy = [self.s(x0), self.s(y0), self.s(x1), self.s(y1)]
        r = self.s(raio)
        if preenchimento is not None:
            self.d.rounded_rectangle(xy, r, fill=preenchimento + (255,))
        if contorno is not None and largura:
            self.d.rounded_rectangle(xy, r, outline=contorno + (255,), width=self.s(largura))

    def poligono(self, pontos, preenchimento=None, contorno=None, largura=0):
        pts = [(self.s(x), self.s(y)) for x, y in pontos]
        if preenchimento is not None:
            self.d.polygon(pts, fill=preenchimento + (255,))
        if contorno is not None and largura:
            self.d.line(pts + [pts[0]], fill=contorno + (255,), width=self.s(largura), joint="curve")

    def ponto(self, cx, cy, r, cor):
        self.disco(cx, cy, r, cor)

    def resultado(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)


def placa(w, h, raio, cor_a=MARINHO, cor_b=MARINHO_3, angulo=-40, contorno=OURO, largura_contorno=2,
          alfa_contorno=200, brilho=0.10, sombra=0, opacidade=255):
    """Placa arredondada com degradê, brilho superior, contorno fino e sombra opcional."""
    camada = gradiente_linear(w, h, [(0, 0), (.55, .72), (1, 1)], angulo, cor_a, cor_b)
    if brilho:
        camada.alpha_composite(gradiente_vertical(w, h, [(0, brilho), (.6, 0), (1, brilho * .5)], BRANCO))
    mascara = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, w - 1, h - 1], raio, fill=255)
    fora = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if contorno is not None and largura_contorno:
        ImageDraw.Draw(fora).rounded_rectangle([0, 0, w - 1, h - 1], raio,
                                              outline=contorno + (alfa_contorno,), width=largura_contorno)
    saida = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    saida.paste(camada, (0, 0), mascara)
    saida.alpha_composite(fora)
    if opacidade < 255:
        a = saida.getchannel("A").point(lambda v: int(v * opacidade / 255))
        saida.putalpha(a)
    if sombra:
        so = Image.new("RGBA", (w + sombra * 4, h + sombra * 4), (0, 0, 0, 0))
        so.paste(saida, (sombra * 2, sombra * 2))
        so = so.filter(ImageFilter.GaussianBlur(sombra))
        so.putalpha(so.getchannel("A").point(lambda v: int(v * 0.45)))
        base = Image.new("RGBA", so.size, (0, 0, 0, 0))
        base.alpha_composite(so)
        base.alpha_composite(saida, (sombra * 2, sombra * 2))
        return base
    return saida


def brilho_superior(img, altura_rel=0.5, forca=0.16):
    """Realce luminoso no topo da peça (dá volume a botões e pastilhas)."""
    g = gradiente_vertical(img.width, img.height, [(0, forca), (altura_rel, 0), (1, 0)], BRANCO)
    a = Image.composite(g.getchannel("A"), Image.new("L", img.size, 0), img.getchannel("A"))
    g.putalpha(a)
    img.alpha_composite(g)
    return img


def vinheta(img, forca=0.35):
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a = np.clip((d - 0.55) / 1.1, 0, 1) * forca
    arr = np.zeros((h, w, 4), np.uint8)
    arr[..., 3] = (a * 255).astype(np.uint8)
    img.alpha_composite(Image.fromarray(arr, "RGBA"))
    return img

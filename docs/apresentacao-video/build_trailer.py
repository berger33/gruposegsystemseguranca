#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trailer ~89s — Grupo SEG System (demonstração; dados fictícios).
Composição 1920x1080@30fps gerada por PIL e enviada ao ffmpeg por pipe.

Fontes visuais: capturas reais do sistema versionadas em docs/**/evidencias (ver CREDITOS no fim).
Locução: audio/c1..c7.mp3 (pt-BR sintetizado).

  python3 build_trailer.py                 -> build/trailer_silent.mp4
  python3 build_trailer.py --range 12 22   -> trecho para conferência
  python3 build_trailer.py --list          -> tabela de planos
"""
import argparse, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
BASE = "/home/user/apresentacao-video"
OUT = f"{BASE}/build/trailer_silent.mp4"
SRC = f"{BASE}/src"
FFMPEG = subprocess.run([sys.executable, "-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"],
                        capture_output=True, text=True).stdout.strip()
F_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

DARK = (9, 16, 36)
AZUL = (35, 63, 145)
ACENTO = (122, 156, 255)
AMBER = (255, 214, 102)
BRANCO = (255, 255, 255)
VERDE = (86, 214, 140)

DUR = [12.02, 14.26, 12.98, 13.06, 10.61, 10.74, 8.67]
T0, GAP = 0.40, 0.45
START = [T0]
for d in DUR[:-1]:
    START.append(round(START[-1] + d + GAP, 3))
END_VO = round(START[-1] + DUR[-1], 3)
TOTAL = round(END_VO + 3.56, 3)

# --------------------------------------------------------------------- utilidades
_f = {}
def font(sz, bold=True):
    k = (sz, bold)
    if k not in _f:
        _f[k] = ImageFont.truetype(F_BOLD if bold else F_REG, sz)
    return _f[k]

def spaced(s, gap=5):
    return "".join(ch + " " * gap for ch in s).strip()

def text(d, xy, s, size, fill, bold=True, anchor="la", shadow=0, spacing=None, alpha=255):
    if spacing:
        s = spaced(s, spacing)
    f = font(size, bold)
    if shadow:
        d.text((xy[0] + shadow, xy[1] + shadow), s, font=f, fill=(0, 0, 0, 160), anchor=anchor)
    d.text(xy, s, font=f, fill=fill if alpha >= 255 else tuple(fill) + (alpha,), anchor=anchor)

def ease(x):
    x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3

def lerp(a, b, t):
    return a + (b - a) * t

def rr(d, box, r, **kw):
    d.rounded_rectangle(box, radius=r, **kw)

# --------------------------------------------------------------------- fontes de imagem
_cache = {}
def src(name):
    if name not in _cache:
        im = Image.open(os.path.join(SRC, name)).convert("RGB")
        _cache.clear(); _cache[name] = im
    return _cache[name]

class Fit:
    def __init__(self, im, scale=1.0, fx=0.5, fy=0.5):
        self.im = im
        vw = min(W / scale, im.width)
        vh = vw * H / W                      # recorte 16:9 -> escala uniforme
        if vh > im.height:
            vh = im.height
            vw = vh * W / H
        vw, vh = min(vw, im.width), min(vh, im.height)
        self.box = (max(0, min(im.width - vw, fx * im.width - vw / 2)),
                    max(0, min(im.height - vh, fy * im.height - vh / 2)), vw, vh)

    def canvas(self):
        x0, y0, vw, vh = self.box
        return self.im.crop((round(x0), round(y0), round(x0 + vw), round(y0 + vh))).resize((W, H), Image.BILINEAR)

    def px(self, x, y):
        x0, y0, vw, vh = self.box
        return ((x - x0) * W / vw, (y - y0) * H / vh)

    def boxc(self, b):
        p0, p1 = self.px(b[0], b[1]), self.px(b[2], b[3])
        return (p0[0], p0[1], p1[0], p1[1])

# --------------------------------------------------------------------- elementos
def scrim(im, top=True, bottom=True, alpha_top=236, h_top=430):
    if top:
        g = Image.new("L", (1, h_top)); [g.putpixel((0, i), int(alpha_top * (1 - i / h_top) ** 1.55)) for i in range(h_top)]
        im.paste(Image.new("RGB", (W, h_top), DARK), (0, 0), g.resize((W, h_top)))
    if bottom:
        g = Image.new("L", (1, 360)); [g.putpixel((0, i), int(228 * (i / 360) ** 1.6)) for i in range(360)]
        im.paste(Image.new("RGB", (W, 360), DARK), (0, H - 360), g.resize((W, 360)))
    return im

def head(im, kicker, headline, t, pos="top", color=ACENTO, y_fixed=None):
    d = ImageDraw.Draw(im, "RGBA")
    a = int(255 * ease(t / 0.6))
    y = y_fixed if y_fixed is not None else (92 if pos == "top" else H - 268)
    text(d, (110, y), kicker, 25, color, True, spacing=4, alpha=a, shadow=2)
    text(d, (110, y + 40), headline, 57, BRANCO, True, alpha=a, shadow=3)
    return im

def chip(d, s, size, pad=(28, 17), pos=None, center=None, fill=(14, 23, 48, 220), txt=BRANCO,
         radius=16, outline=None, alpha=255, bold=True):
    f = font(size, bold)
    w = d.textlength(s, font=f)
    if center:
        cx, cy = center
        box = (cx - w / 2 - pad[0], cy - size / 2 - pad[1], cx + w / 2 + pad[0], cy + size / 2 + pad[1])
    else:
        x, y = pos
        box = (x, y, x + w + pad[0] * 2, y + size + pad[1] * 2)
    rr(d, box, radius, fill=tuple(fill[:3]) + (int(fill[3] * alpha / 255),), outline=outline)
    text(d, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2 + 2), s, size, txt, bold, anchor="mm", alpha=alpha)
    return box

def caption(im, s, t, sub=None):
    d = ImageDraw.Draw(im, "RGBA")
    a = int(255 * ease(t / 0.5))
    y = H - 132 if not sub else H - 158
    b = chip(d, s, 30, pos=(110, y), alpha=a, fill=(12, 20, 44, 226))
    if sub:
        text(d, (b[0] + 8, b[3] + 10), sub, 22, (203, 214, 238), False, alpha=a, shadow=2)
    return im

def brand_mark(im, t=1.0):
    d = ImageDraw.Draw(im, "RGBA")
    a = int(205 * ease(t / 0.8))
    text(d, (W - 110, H - 92), "GRUPO SEG SYSTEM", 22, (213, 222, 244), True, anchor="ra", alpha=a, shadow=2)
    text(d, (W - 110, H - 64), "demonstração · dados fictícios", 19, (148, 164, 198), False, anchor="ra", alpha=a, shadow=2)
    return im

def progress(im, frac, t):
    if t < 1.2:
        return im
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((0, 0, W, 5), fill=(255, 255, 255, 34))
    d.rectangle((0, 0, int(W * frac), 5), fill=ACENTO + (230,))
    return im

def glow(im, box, t, color=ACENTO, pulse=1.05):
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    a = int(140 + 85 * math.sin(2 * math.pi * pulse * t))
    rr(d, box, 18, outline=color + (a,), width=7)
    ov = ov.filter(ImageFilter.GaussianBlur(7))
    im.paste(Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB"), (0, 0))
    d2 = ImageDraw.Draw(im, "RGBA")
    rr(d2, box, 18, outline=color + (min(255, a + 70),), width=3)
    return im

def callout(im, s, box, t, side="above", color=BRANCO):
    a = int(255 * ease(max(0, t) / 0.45))
    if a <= 3:
        return im
    d = ImageDraw.Draw(im, "RGBA")
    cx = (box[0] + box[2]) / 2
    w = d.textlength(s, font=font(27)) + 56
    if side == "above":
        y2 = box[1] - 12; y1 = y2 - 48; ty = (y1 + y2) / 2; ly = y2
    else:
        y1 = box[3] + 12; y2 = y1 + 48; ty = (y1 + y2) / 2; ly = y1
    x1 = min(max(40, cx - w / 2), W - 40 - w)
    rr(d, (x1, y1, x1 + w, y2), 14, fill=(10, 18, 42, int(230 * a / 255)), outline=color + (int(130 * a / 255),))
    text(d, (x1 + w / 2, ty + 1), s, 27, BRANCO, True, anchor="mm", alpha=a)
    d.line((cx, ly, cx, box[1] if side == "above" else box[3]), fill=color + (int(200 * a / 255),), width=3)
    return im

def patch_chip(im, boxc, s, size=21, alpha=255):
    """Cobre um rótulo de QA e substitui por um rótulo plausível de sessão/conteúdo (s vazio = só cobre)."""
    d = ImageDraw.Draw(im, "RGBA")
    rr(d, boxc, 14, fill=(255, 255, 255, int(252 * alpha / 255)),
       outline=(196, 208, 232, int(255 * alpha / 255)) if s else None, width=2)
    if not s:
        return im
    cx = (boxc[0] + boxc[2]) / 2; cy = (boxc[1] + boxc[3]) / 2
    # pequeno escudo
    sx, sy = boxc[0] + 22, cy - 11
    d.polygon([(sx, sy), (sx + 22, sy), (sx + 22, sy + 22), (sx + 11, sy + 30), (sx, sy + 22)],
              fill=(35, 63, 145, int(255 * alpha / 255)))
    text(d, (sx + 36, cy + 1), s, size, (21, 38, 82), True, anchor="lm", alpha=alpha)
    return im

def cursor(im, pos, t, click_at=None):
    d = ImageDraw.Draw(im, "RGBA")
    x, y = pos
    a = int(255 * ease(max(0, t) / 0.35))
    if click_at is not None:
        ct = t - click_at
        if 0 <= ct < 0.9:
            r = 16 + 74 * ease(ct / 0.9)
            d.ellipse((x - r, y - r, x + r, y + r), outline=(255, 255, 255, int(210 * (1 - ct / 0.9))), width=5)
    d.polygon([(x, y), (x + 4, y + 30), (x + 12, y + 22), (x + 20, y + 34), (x + 26, y + 30), (x + 18, y + 18), (x + 28, y + 16)],
              fill=(255, 255, 255, a), outline=(18, 26, 48, a))
    return im

def steps_row(im, items, t, y=None, x0=110, gap=16, size=27):
    d = ImageDraw.Draw(im, "RGBA")
    y = H - 246 if y is None else y
    x = x0
    for i, s in enumerate(items):
        a = int(255 * ease(max(0, (t - 0.30 * i)) / 0.45))
        f = font(size, True)
        w = d.textlength(s, font=f) + 104
        if a > 3:
            rr(d, (x, y, x + w, y + size + 32), 15, fill=(10, 18, 42, int(232 * a / 255)),
               outline=ACENTO + (int(150 * a / 255),), width=2)
            d.ellipse((x + 14, y + 16, x + 44, y + 46), fill=ACENTO + (int(235 * a / 255),))
            text(d, (x + 29, y + 31), str(i + 1), 20, (10, 18, 42), True, anchor="mm", alpha=a)
            text(d, (x + 58, y + 16), s, size, BRANCO, True, alpha=a)
        x += w + gap
    return im

# --------------------------------------------------------------------- fundos e cartelas
def gradient_bg(seed=0):
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        d.line((0, y, W, y), fill=(int(lerp(10, 22, k)), int(lerp(18, 40, k)), int(lerp(42, 86, k))))
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(gl)
    gd.ellipse((W - 880 + seed * 50, -560, W + 340, 660), fill=(60, 98, 225, 66))
    gd.ellipse((-440, H - 640, 720, H + 360), fill=(33, 60, 140, 96))
    return Image.alpha_composite(im.convert("RGBA"), gl.filter(ImageFilter.GaussianBlur(130))).convert("RGB")

def card_hook(t):
    im = gradient_bg(0)
    d = ImageDraw.Draw(im, "RGBA")
    fade = 1 - ease((t - 8.1) / 1.2)                       # cartões saem de cena
    a0 = int(255 * ease(t / 0.6))
    text(d, (110, 150), "DIAGNÓSTICO", 25, ACENTO, True, spacing=4, alpha=a0, shadow=2)
    text(d, (110, 192), "Informação espalhada.", 66, BRANCO, True, alpha=a0, shadow=3)
    itens = [("pedido no WhatsApp", "chat"), ("contrato no e-mail", "mail"), ("documento na pasta de alguém", "pasta")]
    y = 372
    for i, (s, ico) in enumerate(itens):
        at = ease(min(1, max(0, (t - 1.1 - i * 1.15)) / 0.55)) * fade
        if at <= 0.02:
            y += 132; continue
        x = 110 + (1 - at) * 46
        aa = int(255 * at)
        rr(d, (x, y, x + 780, y + 108), 18, fill=(13, 22, 47, int(214 * at)), outline=(92, 118, 192, int(155 * at)), width=2)
        ic = (x + 30, y + 26)
        if ico == "chat":
            rr(d, (ic[0], ic[1], ic[0] + 54, ic[1] + 40), 12, fill=(37, 211, 102, aa))
            d.polygon([(ic[0] + 12, ic[1] + 40), (ic[0] + 28, ic[1] + 40), (ic[0] + 10, ic[1] + 54)], fill=(37, 211, 102, aa))
        elif ico == "mail":
            rr(d, (ic[0], ic[1], ic[0] + 56, ic[1] + 42), 8, fill=(226, 232, 245, aa))
            d.line((ic[0] + 4, ic[1] + 6, ic[0] + 28, ic[1] + 26, ic[0] + 52, ic[1] + 6), fill=(60, 78, 120, aa), width=4)
        else:
            d.polygon([(ic[0], ic[1] + 8), (ic[0] + 20, ic[1] + 8), (ic[0] + 28, ic[1] + 18), (ic[0] + 56, ic[1] + 18),
                       (ic[0] + 56, ic[1] + 44), (ic[0], ic[1] + 44)], fill=(240, 196, 90, aa))
        text(d, (x + 112, y + 32), s, 34, BRANCO, True, alpha=aa)
        text(d, (x + 112, y + 72), "ninguém sabe em que pé está", 22, (170, 184, 214), False, alpha=aa)
        y += 132
    if 5.5 < t < 9.3:                                       # risco do "reconhece isso?"
        at = ease((t - 5.5) / 0.5) * fade
        for i in range(3):
            yy = 372 + i * 132 + 56
            d.line((150, yy, 150 + 210 * at, yy), fill=(214, 92, 92, 225))
        text(d, (110, 812), "Reconhece isso?", 42, (255, 236, 200), True, alpha=int(255 * at), shadow=3)
    if t > 8.9:                                            # virada
        at = ease((t - 8.9) / 0.9)
        b = chip(d, "E se tudo isso estivesse no mesmo sistema?", 40, pos=(0, 0), center=(W / 2, 470),
                 fill=(20, 34, 74, 235), outline=ACENTO + (int(210 * at),), alpha=int(255 * at))
        text(d, (W / 2, 600), "a partir do próximo segundo, é exatamente isso", 24, (196, 210, 238), False,
             anchor="ma", alpha=int(255 * at))
    return im

def card_aceite(t):
    im = gradient_bg(2)
    d = ImageDraw.Draw(im, "RGBA")
    a = ease(t / 0.7)
    text(d, (110, 150), "ACEITE DO CLIENTE", 25, ACENTO, True, spacing=4, alpha=int(255 * ease(t / 0.6)), shadow=2)
    text(d, (110, 192), "O aceite fica registrado.", 62, BRANCO, True, alpha=int(255 * ease(t / 0.7)), shadow=3)
    cx, cy, r = W / 2, 520, 92
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=VERDE + (int(220 * a),), width=6)
    d.arc((cx - r + 6, cy - r + 6, cx + r - 6, cy + r - 6), start=-95, end=int(lerp(-95, 130, ease((t - 0.5) / 0.9))),
          fill=VERDE + (255,), width=12)
    d.line((cx - 38, cy + 4, cx - 10, cy + 32, cx + 42, cy - 30), fill=VERDE + (255,), width=12, joint="curve")
    for i, (k, v) in enumerate([("quem aceitou", "registrado na proposta"), ("quando aceitou", "data e hora do aceite")]):
        at = ease(max(0, (t - 1.2 - i * 0.6)) / 0.6)
        if at <= 0.02:
            continue
        y = 700 + i * 96
        rr(d, (cx - 330, y, cx + 330, y + 76), 16, fill=(14, 24, 52, int(220 * at)),
           outline=(120, 150, 230, int(150 * at)))
        d.ellipse((cx - 306, y + 22, cx - 274, y + 54), fill=VERDE + (int(230 * at),))
        text(d, (cx - 262, y + 38), v, 27, BRANCO, True, anchor="lm", alpha=int(255 * at))
        text(d, (cx + 310, y + 38), k, 21, (168, 182, 214), False, anchor="rm", alpha=int(255 * at))
    return im

def endcard(t):
    im = gradient_bg(1)
    d = ImageDraw.Draw(im, "RGBA")
    a = int(255 * ease(t / 0.9))
    logo = Image.open(f"{BASE}/preview/logo_square.png").convert("RGB")
    s = 205
    im.paste(logo.resize((s, s), Image.LANCZOS), (W // 2 - s // 2, 250))
    text(d, (W // 2, 500), "GRUPO SEG SYSTEM", 52, BRANCO, True, anchor="ma", alpha=a, shadow=3)
    text(d, (W // 2, 568), "Segurança Integrada", 30, (170, 190, 235), False, anchor="ma", alpha=a, shadow=2)
    text(d, (W // 2, 668), "Um sistema. Toda a operação.", 42, (255, 236, 200), True, anchor="ma", alpha=a, shadow=3)
    text(d, (W // 2, 738), "Cada pessoa vendo exatamente o que precisa ver.", 26, (203, 214, 238), False, anchor="ma", alpha=a, shadow=2)
    text(d, (W // 2, 800), "(11) 3437-2217  ·  gruposegsystemseguranca.com.br", 25, (170, 190, 235), False, anchor="ma", alpha=a)
    text(d, (W // 2, 920), "Vídeo de demonstração · dados fictícios · outubro de 2026", 22, (146, 162, 196), False, anchor="ma", alpha=a)
    return im

# --------------------------------------------------------------------- composição de planos
def shot(name, fit, t, *, kicker=None, headline=None, head_pos="top", cap=None, sub=None,
         highlight=None, callouts=(), steps=None, patches=(), cur=None, click=None, frac=None,
         top_scrim=True, bottom_scrim=True, head_y=None, scrim_top=236, scrim_h=430):
    def _r(v):
        return v(t) if callable(v) else v
    highlight, callouts, patches, steps = _r(highlight), _r(callouts), _r(patches), _r(steps)
    canvas = fit.canvas()
    canvas = scrim(canvas, top=top_scrim, bottom=bottom_scrim, alpha_top=scrim_top, h_top=scrim_h)
    if highlight:
        box, color = highlight
        canvas = glow(canvas, fit.boxc(box), t, color)
    for p in patches:
        canvas = patch_chip(canvas, fit.boxc(p[0]), p[1], p[2] if len(p) > 2 else 21)
    if kicker or headline:
        canvas = head(canvas, kicker or "", headline or "", t, head_pos, y_fixed=head_y)
    if cap:
        canvas = caption(canvas, cap, t, sub)
    for c in callouts:
        canvas = callout(canvas, c[0], fit.boxc(c[1]), t - c[2], c[3] if len(c) > 3 else "above")
    if steps:
        canvas = steps_row(canvas, steps, t - 0.9)
    if cur:
        canvas = cursor(canvas, fit.px(*cur[0]), t - cur[1], click)
    canvas = brand_mark(canvas, t)
    if frac is not None:
        canvas = progress(canvas, frac, t)
    return canvas

def planos():
    P = []
    A = START
    def add(s0, s1, fn, xf=0.55):
        P.append((s0, s1, fn, xf))

    def add_shot(s0, s1, name, fit, xf=0.55, **kw):
        P.append((s0, s1, lambda t, f, fit=fit, name=name, kw=kw: shot(name, fit, t, frac=f, **kw), xf))

    # 1 — gancho
    add(0.0, 12.4, lambda t, f: card_hook(t), 0.0)

    # 2 — site: o primeiro contato (CTA "Solicitar proposta")
    fit = Fit(src("site.jpg"), 1.55, 0.5, 0.5)
    add_shot(12.4, 17.3, "site.jpg", fit, kicker="O PRIMEIRO CONTATO", headline="O pedido chega pelo site",
        head_pos="bottom", top_scrim=False, head_y=H - 254,
        highlight=((1030, 44, 1178, 94), AMBER),
        callouts=[("o visitante pede pelo próprio site", (1030, 44, 1178, 94), 0.5, "below")],
        cur=((1104, 72), 0.5), click=1.1)

    # 3 — CRM: pedido recebido vira oportunidade
    fit = Fit(src("crm.jpg"), 1.30, 0.62, 0.45)
    add_shot(17.3, 21.5, "crm.jpg", fit, kicker="CRM", headline="Pedido recebido vira oportunidade",
        highlight=((360, 655, 715, 700), AMBER),
        callouts=[("converte o pedido do site em oportunidade", (360, 655, 715, 700), 0.6, "below")],
        cap="o pedido entra no sistema com origem e data")

    # 4 — CRM: nova oportunidade (registro canônico)
    fit = Fit(src("crmdetalhe.jpg"), 1.30, 0.5, 0.335)
    add_shot(21.5, 25.0, "crmdetalhe.jpg", fit, kicker="OPORTUNIDADE", headline="Responsável e origem definidos",
        highlight=((372, 1652, 1240, 1758), AMBER),
        callouts=[("empresa, serviço e necessidade", (372, 1652, 1240, 1758), 0.5, "above")],
        cap="nada entra sem responsável")

    # 5 — CRM: a lista com o registro
    fit = Fit(src("crmdetalhe.jpg"), 1.25, 0.5, 0.46)
    add_shot(25.0, 27.6, "crmdetalhe.jpg", fit, kicker="HISTÓRICO", headline="Fica na lista, com status",
        highlight=((955, 2790, 1440, 2965), ACENTO),
        callouts=[("a oportunidade, com responsável e estágio", (955, 2790, 1440, 2965), 0.4, "above")])

    # 6 — CRM: detalhe da oportunidade
    fit = Fit(src("crmdetalhe.jpg"), 1.90, 0.72, 0.56)
    add_shot(27.6, 33.0, "crmdetalhe.jpg", fit, kicker="OPORTUNIDADE", headline="Por onde ela passou",
        highlight=((995, 3100, 1440, 3252), AMBER),
        callouts=[("estágios do funil", (995, 3100, 1440, 3252), 0.5, "above")])

    # 7 — proposta
    fit = Fit(src("comercial.jpg"), 1.25, 0.5, lerp(0.28, 0.42, 0.5))
    add_shot(33.0, 37.5, "comercial.jpg", fit, kicker="PROPOSTA", headline="Sai daqui, com link de aceite",
        highlight=((1064, 350, 1278, 422), AMBER),
        callouts=[("propostas e envio ao cliente", (1064, 350, 1278, 422), 0.5, "below")],
        cap="visita, orçamento, proposta — na mesma trilha")

    # 8 — cartela: aceite registrado
    add(37.5, 41.0, lambda t, f: card_aceite(t), 0.5)

    # 9 — contrato
    fit = Fit(src("contratos.jpg"), 1.30, 0.5, lerp(0.12, 0.30, 0.5))
    add_shot(41.0, 48.0, "contratos.jpg", fit, kicker="CONTRATO", headline="Criado a partir do aceite",
        highlight=((216, 468, 1250, 700), AMBER),
        callouts=[("escopo, prazo e valores do contrato", (216, 468, 1250, 700), 0.6, "above")],
        steps=["postos", "horários", "SLA", "obrigações"])

    # 10 — contrato: a mesma informação atravessa
    fit = Fit(src("contratos.jpg"), 1.42, 0.16, 0.10)
    add_shot(48.0, 54.5, "contratos.jpg", fit, kicker="A MESMA INFORMAÇÃO", headline="Sem digitar de novo",
        head_pos="bottom", head_y=H - 232, scrim_top=200,
        highlight=lambda t: ((52, 196, 152, 566), ACENTO) if t > 1.6 else None,
        callouts=[("operação, patrimônio, frota, qualidade", (52, 196, 152, 566), 1.4, "above")])

    # 11 — portal do cliente: entrada
    fit = Fit(src("cliente.jpg"), 1.45, 0.52, lerp(0.55, 0.42, 0.5))
    add_shot(54.5, 58.5, "cliente.jpg", fit, kicker="PORTAL DO CLIENTE", headline="Acesso próprio e verificado",
        highlight=((428, 352, 1008, 522), ACENTO),
        cap="não é o sistema por dentro: é a conta dele")

    # 12 — portal do cliente: o que ele vê
    fit = Fit(src("clientecont.jpg"), 1.05, 0.5, 0.10)
    add_shot(58.5, 65.5, "clientecont.jpg", fit, kicker="NO PORTAL", headline="Contratos, documentos, chamados",
        patches=[((805, 196, 1072, 248), "Conta do cliente · acesso verificado", 20),
                 ((298, 306, 640, 344), "CONTA DO CLIENTE", 19)],
        highlight=((288, 258, 1330, 402), AMBER),
        callouts=[("tudo da conta, em um só lugar", (288, 258, 1330, 402), 0.9)],
        cap="cobranças, satisfação e renovação", sub="sem precisar pedir print pelo WhatsApp")

    # 13 — painel de decisões
    fit = Fit(src("marcelo.jpg"), 1.55, 0.42, 0.72)
    add_shot(65.5, 71.0, "marcelo.jpg", fit, kicker="QUEM DECIDE", headline="O que exige decisão, hoje",
        highlight=lambda t: ((332, 728, 566, 792), AMBER) if t < 2.6 else ((640, 728, 878, 792), AMBER) if t < 3.9 else ((945, 726, 1180, 800), ACENTO),
        callouts=[("pendências", (332, 728, 566, 792), 0.4), ("leads", (640, 728, 878, 792), 1.4),
                  ("oportunidades paradas", (945, 726, 1180, 800), 2.4)],
        cap="cada número com fonte e responsável")

    # 14 — hub: tudo no mesmo lugar
    fit = Fit(src("hub.jpg"), 1.22, 0.5, lerp(0.14, 0.34, 0.5))
    add_shot(71.0, 76.4, "hub.jpg", fit, kicker="ÁREA ADMINISTRATIVA", headline="Do site ao posto",
        highlight=lambda t: ((250, 452, 1420, 690), ACENTO) if t > 1.2 else None,
        callouts=[("comercial · operação · financeiro", (250, 452, 1420, 690), 1.0)],
        cap="tudo no mesmo lugar")

    # 15/16 — recortes rápidos: pessoas e financeiro
    fit = Fit(src("rh.jpg"), 1.35, 0.5, 0.30)
    add_shot(76.4, 78.6, "rh.jpg", fit, kicker="PESSOAS", headline="Jornada e ponto",
        highlight=lambda t: ((330, 608, 1436, 686), ACENTO) if t > 0.5 else None)
    fit = Fit(src("financeiro.jpg"), 1.35, 0.5, 0.34)
    add_shot(78.6, 80.8, "financeiro.jpg", fit, kicker="FINANCEIRO", headline="Contas e recorrência",
        highlight=lambda t: ((196, 395, 1000, 640), ACENTO) if t > 0.5 else None)

    # 17 — montagem de papéis (rápida, corte seco)
    fm = Fit(src("marcelo.jpg"), 1.7, 0.5, 0.12)
    fr = Fit(src("rh.jpg"), 1.7, 0.5, 0.12)
    fc = Fit(src("cliente.jpg"), 1.5, 0.5, 0.42)
    mk = "só o que precisa ver"
    add(80.8, 81.85, lambda t, f: shot("marcelo.jpg", fm, t, cap="papel: gestão", patches=(), frac=f), 0.28)
    add(81.85, 82.9, lambda t, f: shot("rh.jpg", fr, t, cap="papel: recursos humanos", frac=f), 0.28)
    add(82.9, 84.0, lambda t, f: shot("cliente.jpg", fc, t, cap="papel: cliente", frac=f), 0.28)

    # 18 — cartela final
    add(84.0, TOTAL, lambda t, f: endcard(t), 0.6)
    return P

# --------------------------------------------------------------------- render
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--range", nargs=2, type=float)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    P = planos()
    if a.list:
        for i, (s0, s1, _, xf) in enumerate(P, 1):
            print(f"{i:2d}  {s0:6.2f} -> {s1:6.2f}  ({s1 - s0:4.1f}s, xf {xf})")
        print(f"total {TOTAL:.2f}s · locução termina em {END_VO:.2f}s")
        return

    t_ini, t_fim = (0.0, TOTAL) if not a.range else (a.range[0], min(a.range[1], TOTAL))
    n = int(round((t_fim - t_ini) * a.fps))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    p = subprocess.Popen([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(a.fps), "-i", "-",
                          "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
                          "-movflags", "+faststart", a.out], stdin=subprocess.PIPE)

    def frame_at(t):
        idx = 0
        for i, (s0, s1, fn, xf) in enumerate(P):
            if s0 <= t < s1 or (i == len(P) - 1 and t >= s0):
                idx = i; break
        s0, s1, fn, xf = P[idx]
        frac = min(1.0, max(0.0, t / TOTAL))
        cur = fn(t - s0, frac)
        if idx > 0 and xf > 0 and t < s0 + xf:
            ps0, ps1, pfn, _ = P[idx - 1]
            return Image.blend(pfn(t - ps0, frac), cur, ease((t - s0) / xf))
        return cur

    for i in range(n):
        t = t_ini + i / a.fps
        p.stdin.write(frame_at(t).tobytes())
        if i % 150 == 0:
            print(f"  {i}/{n}  t={t:6.2f}s", flush=True)
    p.stdin.close(); p.wait()
    print(f"OK -> {a.out} ({n} quadros, {t_fim - t_ini:.1f}s)")

if __name__ == "__main__":
    main()

# CREDITOS das capturas (todas do repositório, sem dados reais):
#  site.jpg        docs/evidencias/identidade-2026-10-07/site-logo.png
#  crm.jpg         docs/ux-03b-evidencias/desktop-crm.png
#  crmdetalhe.jpg  docs/ux-03b-evidencias/desktop-crm-detalhe.png
#  comercial.jpg   docs/ux-03b-evidencias/desktop-comercial.png
#  contratos.jpg   docs/ux-07-contratos-evidencias/desktop-contratos.png
#  cliente.jpg     docs/evidencias/identidade-2026-10-07/cliente-login.png
#  clientecont.jpg docs/ux-11-continuidade-cliente-evidencias/desktop-continuidade-cliente.png
#  marcelo.jpg     docs/ux-05-evidencias/desktop-marcelo.png
#  hub.jpg         docs/ux-00-evidencias/desktop-hub.png
#  rh.jpg          docs/ux-04-evidencias/desktop-rh.png
#  financeiro.jpg  docs/ux-07-financeiro-evidencias/desktop-financeiro.png

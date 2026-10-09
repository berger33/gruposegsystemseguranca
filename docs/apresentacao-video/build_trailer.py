#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trailer ~89 s v2 — Grupo SEG System (demonstração; dados fictícios).

Motor de motion graphics (numpy + OpenCV + PIL), 1920x1080@30:
- cada captura real vai numa janela de navegador à direita; o texto fica à esquerda;
- câmera animada dentro da janela (zoom/pan com easing sobre a captura original);
- foco: escurecimento fora do alvo + cantos de mira pulsantes;
- etiquetas que se abrem com linha-guia desenhada até o alvo (que acompanha a câmera);
- cursor com trajetória, clique e onda; digitação em campos;
- transições: empurrão com motion blur, zoom-blur, cortina diagonal com brilho, dissolve;
- finalização: vinheta e grão leve.

Locução (audio/c1..c7.mp3) e tempos (DUR/START) são os mesmos da versão anterior.

  python3 build_trailer.py                    -> build/trailer_silent.mp4 (paralelo)
  python3 build_trailer.py --range 12 22      -> build/trecho.mp4
  python3 build_trailer.py --stills 3 15.2    -> PNGs em build/stills/
"""
import argparse, math, os, subprocess, sys
from multiprocessing import Pool
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

W, H, FPS = 1920, 1080, 30
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
FDIR = f"{HERE}/fonts"
BUILD = os.environ.get("TRAILER_BUILD", f"{HERE}/build")
# capturas reais do repositório (docs/**/evidencias), sem dados reais
CAPT = {
    "site.png": "docs/evidencias/identidade-2026-10-07/site-logo.png",
    "crm.png": "docs/ux-03b-evidencias/desktop-crm.png",
    "crmdetalhe.png": "docs/ux-03b-evidencias/desktop-crm-detalhe.png",
    "comercial.png": "docs/ux-03b-evidencias/desktop-comercial.png",
    "contratos.png": "docs/ux-07-contratos-evidencias/desktop-contratos.png",
    "cliente.png": "docs/evidencias/identidade-2026-10-07/cliente-login.png",
    "clientecont.png": "docs/ux-11-continuidade-cliente-evidencias/desktop-continuidade-cliente.png",
    "marcelo.png": "docs/ux-05-evidencias/desktop-marcelo.png",
    "hub.png": "docs/ux-00-evidencias/desktop-hub.png",
    "rh.png": "docs/ux-04-evidencias/desktop-rh.png",
    "financeiro.png": "docs/ux-07-financeiro-evidencias/desktop-financeiro.png",
}
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# janela do sistema (conteúdo 16:9 + barra do navegador)
WIN_X, WIN_Y, CW, CH, CHROME = 760, 203, 1120, 630, 44
LC_X, LC_W = 110, 610            # coluna de texto à esquerda

NAVY = (9, 16, 36); ACENTO = (122, 156, 255); AMBER = (255, 214, 102)
BRANCO = (255, 255, 255); VERDE = (86, 214, 140); CORAL = (235, 110, 110)

DUR = [12.02, 14.26, 12.98, 13.06, 10.61, 10.74, 8.67]
T0, GAP = 0.40, 0.45
START = [T0]
for _d in DUR[:-1]:
    START.append(round(START[-1] + _d + GAP, 3))
END_VO = round(START[-1] + DUR[-1], 3)
TOTAL = round(END_VO + 3.56, 3)

CHAPS = ["CONTATO", "CRM", "PROPOSTA", "CONTRATO", "PORTAL", "DECISÃO", "OPERAÇÃO"]

# ------------------------------------------------------------------ utilidades
_fc = {}
def F(sz, w=700):
    k = (sz, w)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(f"{FDIR}/inter-latin-{w}-normal.woff", sz)
    return _fc[k]

def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x

def sm(x):
    x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10)

def eo3(x):
    x = clamp(x); return 1 - (1 - x) ** 3

def lerp(a, b, e):
    return a + (b - a) * e

def fade(t, t0, d=0.5):
    if t < t0: return 0.0
    return eo3((t - t0) / d)

def interp(keys, t):
    if t <= keys[0][0]: return keys[0][1]
    for (ta, va), (tb, vb) in zip(keys, keys[1:]):
        if t <= tb:
            e = sm((t - ta) / (tb - ta)) if tb > ta else 1.0
            return tuple(lerp(a, b, e) for a, b in zip(va, vb))
    return keys[-1][1]

def ov_hit(r, q, pad=0):
    return not (r[2] < q[0] - pad or r[0] > q[2] + pad or r[3] < q[1] - pad or r[1] > q[3] + pad)

def wrap(text, font, maxw):
    lines, cur = [], ""
    for w_ in text.split():
        cand = (cur + " " + w_).strip()
        if font.getlength(cand) <= maxw or not cur:
            cur = cand
        else:
            lines.append(cur); cur = w_
    if cur: lines.append(cur)
    return lines

def track_text(d, xy, s, font, fill, track=4):
    x, y = xy
    for ch in s:
        d.text((x, y), ch, font=font, fill=fill, anchor="ls")
        x += font.getlength(ch) + track

# ------------------------------------------------------------------ fonte de imagens
_img = {}
def src_np(name):
    if name not in _img:
        _img[name] = np.asarray(Image.open(os.path.join(REPO, CAPT[name])).convert("RGB"))
    return _img[name]

class Cam:
    """Câmera 16:9 sobre a captura original. keys: [(t, (cx, cy, largura_da_vista_em_px_da_fonte))]."""
    def __init__(self, name, keys):
        self.S = src_np(name)
        self.sh, self.sw = self.S.shape[:2]
        self.keys = keys

    def view(self, t):
        cx, cy, w = interp(self.keys, t)
        w = min(w, self.sw, self.sh * CW / CH)
        h = w * CH / CW
        x0 = min(max(cx - w / 2, 0), self.sw - w)
        y0 = min(max(cy - h / 2, 0), self.sh - h)
        return x0, y0, w

    def frame(self, t):
        x0, y0, w = self.view(t)
        s = CW / w
        M = np.array([[s, 0, -x0 * s], [0, s, -y0 * s]], np.float32)
        return cv2.warpAffine(self.S, M, (CW, CH), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)

    def px(self, x, y, t):
        x0, y0, w = self.view(t); s = CW / w
        return ((x - x0) * s, (y - y0) * s)

    def box(self, b, t):
        p0 = self.px(b[0], b[1], t); p1 = self.px(b[2], b[3], t)
        return (p0[0], p0[1], p1[0], p1[1])

# ------------------------------------------------------------------ fundos e palco
_bg = {}
def bg(seed):
    if seed in _bg: return _bg[seed]
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    top = np.array([10, 18, 42], np.float32); bot = np.array([20, 36, 82], np.float32)
    arr = (top * (1 - yy) + bot * yy) * np.ones((1, W, 1), np.float32)
    layer = np.zeros((H, W), np.float32)
    cv2.circle(layer, (int(W - 240 + seed * 70), 110), 520, 1.0, -1)
    cv2.circle(layer, (180, H - 60), 420, 0.7, -1)
    layer = cv2.GaussianBlur(layer, (0, 0), 150)
    arr += layer[..., None] * np.array([70, 110, 235], np.float32) * 0.42
    dots = np.zeros((H, W), np.float32); dots[::44, ::44] = 1.0
    arr += dots[..., None] * np.array([130, 160, 235], np.float32) * 0.10
    _bg[seed] = np.clip(arr, 0, 255).astype(np.uint8)
    return _bg[seed]

def stage():
    return bg(0)

_chrome = {}
def chrome(url):
    if url in _chrome: return _chrome[url]
    im = Image.new("RGB", (CW, CHROME), (20, 31, 62))
    d = ImageDraw.Draw(im)
    for i, c in enumerate([(255, 96, 92), (255, 189, 68), (60, 205, 110)]):
        d.ellipse((18 + i * 20, 15, 30 + i * 20, 27), fill=c)
    d.rounded_rectangle((120, 8, CW - 120, 36), 14, fill=(11, 19, 42))
    d.text((146, 22), "gruposegsystemseguranca.com.br" + url, font=F(17, 500), fill=(168, 184, 220), anchor="lm")
    _chrome[url] = np.asarray(im)
    return _chrome[url]

def _rr_mask(w, h, r):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
    return np.asarray(m).astype(np.float32) / 255.0

WINMASK = _rr_mask(CW, CH + CHROME, 16)
_sh = np.zeros((H, W), np.float32)
_sh[WIN_Y + 26:WIN_Y + 26 + CH + CHROME, WIN_X:WIN_X + CW] = 1.0
SHADOW = cv2.GaussianBlur(_sh, (0, 0), 30) * 0.62

def place_window(canvas, content, url, dy, alpha):
    win = np.vstack([chrome(url), content]).astype(np.float32)
    sh = np.roll(SHADOW, dy, axis=0)
    canvas = canvas.astype(np.float32)
    canvas *= (1 - (sh * alpha)[..., None])
    y0 = WIN_Y + dy; y1 = y0 + CH + CHROME
    reg = canvas[y0:y1, WIN_X:WIN_X + CW]
    m = (WINMASK * alpha)[..., None]
    canvas[y0:y1, WIN_X:WIN_X + CW] = reg * (1 - m) + win * m
    return np.clip(canvas, 0, 255).astype(np.uint8)

def dim(arr, rects, amount):
    if amount <= 0.001 or not rects:
        return arr
    m = np.zeros((CH, CW), np.float32)
    for x0, y0, x1, y1 in rects:
        cv2.rectangle(m, (int(x0 - 10), int(y0 - 10)), (int(x1 + 10), int(y1 + 10)), 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), 12)
    k = 1 - amount * 0.36 * (1 - m)
    return np.clip(arr.astype(np.float32) * k[..., None], 0, 255).astype(np.uint8)

# ------------------------------------------------------------------ camada de desenho
class Ov:
    def __init__(self):
        self.im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

def compose(canvas, ov):
    base = Image.fromarray(canvas).convert("RGBA")
    base.alpha_composite(ov.im)
    return np.asarray(base.convert("RGB"))

def head_block(ov, kicker, head, t, y0=290, maxw=LC_W):
    """Cabeçalho à esquerda: rótulo + linha de acento + título em 1–3 linhas. Retorna a caixa ocupada."""
    e = eo3(t / 0.6)
    a = int(255 * e)
    yo = y0 + int((1 - e) * 22)
    track_text(ov.d, (LC_X, yo + 24), kicker, F(23, 700), ACENTO + (a,), track=4)
    ln = 96 * eo3((t - 0.25) / 0.6)
    ov.d.rectangle((LC_X, yo + 42, LC_X + ln, yo + 45), fill=AMBER + (a,))
    f = F(58, 800)
    lines = wrap(head, f, maxw)
    y = yo + 88
    for ln_ in lines:
        ov.d.text((LC_X + 3, y + 4), ln_, font=f, fill=(0, 0, 0, int(150 * e)), anchor="ls")
        ov.d.text((LC_X, y), ln_, font=f, fill=BRANCO + (a,), anchor="ls")
        y += 66
    return (LC_X - 10, y0 - 10, LC_X + maxw + 10, y + 10)

def head_box(kicker, head, y0=290, maxw=LC_W):
    """Caixa estimada do cabeçalho (sem desenhar), para reservar espaço das etiquetas."""
    lines = wrap(head, F(58, 800), maxw)
    return (LC_X - 10, y0 - 10, LC_X + maxw + 10, y0 + 88 + 66 * len(lines) + 10)

def caption(ov, s, sub, t):
    e = eo3(t / 0.5); a = int(255 * e)
    y = H - 170
    f = F(28, 600)
    w = f.getlength(s) + 52
    ov.d.rounded_rectangle((LC_X, y, LC_X + w, y + 52), 12, fill=(10, 18, 42, int(226 * e)))
    ov.d.text((LC_X + 26, y + 26), s, font=f, fill=BRANCO + (a,), anchor="lm")
    if sub:
        ov.d.text((LC_X + 4, y + 74), sub, font=F(21, 400), fill=(196, 208, 236, a), anchor="lm")

def chapter_bar(ov, active, frac):
    y0 = H - 66
    ov.d.rectangle((0, y0, W, H), fill=(7, 13, 30, 205))
    xs = W / len(CHAPS)
    for i, c in enumerate(CHAPS):
        on = i == active
        f = F(19, 700 if on else 600)
        col = (255, 255, 255) if on else (120, 136, 176)
        ov.d.text(((i + 0.5) * xs, y0 + 30), c, font=f, fill=col + (255,), anchor="mm")
    if active is not None:
        ax = (active + 0.5) * xs; wl = F(19, 700).getlength(CHAPS[active]) / 2
        ov.d.rectangle((ax - wl, y0 + 48, ax + wl, y0 + 51), fill=ACENTO + (255,))
    ov.d.rectangle((0, H - 4, W * clamp(frac), H), fill=ACENTO + (235,))

_logo = {}
def logo_small(size):
    if size not in _logo:
        im = Image.open(f"{HERE}/logo.jpg").convert("RGB").resize((size, size), Image.LANCZOS)
        m = Image.new("L", (size, size), 0)
        ImageDraw.Draw(m).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(im, (0, 0), m)
        _logo[size] = out
    return _logo[size]

def brand(ov, a=1.0):
    ov.im.alpha_composite(logo_small(50), (LC_X - 6, 26))
    ov.d.text((LC_X + 56, 36), "GRUPO SEG SYSTEM", font=F(22, 800), fill=(255, 255, 255, int(240 * a)), anchor="ls")
    ov.d.text((LC_X + 56, 62), "Segurança integrada", font=F(16, 500), fill=(170, 186, 224, int(220 * a)), anchor="ls")
    s = "demonstração · dados fictícios"
    f = F(19, 600); w = f.getlength(s) + 36
    x1 = W - 56
    ov.d.rounded_rectangle((x1 - w, 30, x1, 66), 18, fill=(10, 18, 42, int(200 * a)), outline=(120, 140, 200, int(120 * a)), width=1)
    ov.d.text((x1 - w / 2, 48), s, font=f, fill=(214, 224, 246, int(255 * a)), anchor="mm")

# ------------------------------------------------------------------ foco, etiquetas, cursor
def draw_focus(ov, R, color, t, t0, t1):
    e = eo3((t - t0) / 0.45)
    if t1 < 1e8:
        e *= clamp((t1 + 0.3 - t) / 0.3)
    a = e
    if a <= 0.01: return
    x0, y0, x1, y1 = R
    pulse = 0.8 + 0.2 * math.sin(2 * math.pi * 1.3 * (t - t0))
    ov.d.rounded_rectangle(R, 12, fill=color + (int(34 * a),))
    for w_, al in ((16, 0.10), (9, 0.22)):
        ov.d.rounded_rectangle((x0 - w_, y0 - w_, x1 + w_, y1 + w_), 12 + w_,
                               outline=color + (int(255 * al * a * pulse),), width=4)
    ov.d.rounded_rectangle(R, 12, outline=color + (int(110 * a),), width=2)
    L = 30; c = color + (int(255 * a),)
    for (px, py, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        ov.d.line([(px, py + sy * L), (px, py), (px + sx * L, py)], fill=c, width=5, joint="curve")

def tag_size(title, sub):
    tw = F(29, 700).getlength(title)
    if sub: tw = max(tw, F(21, 400).getlength(sub))
    return int(tw + 60), (98 if sub else 66)

def place_tag(tw, th, tb, reserved):
    x0, y0, x1, y1 = tb; g = 30
    cx = (x0 + x1) / 2; cy = (y0 + y1) / 2
    cands = [(cx - tw / 2, y1 + g), (cx - tw / 2, y0 - g - th), (x1 + g, cy - th / 2), (x0 - g - tw, cy - th / 2),
             (x1 + g, y1 - th), (x0 - g - tw, y0), (x0, y1 + g), (x0, y0 - g - th)]
    for x, y in cands:
        x = clamp(x, 40, W - 40 - tw); y = clamp(y, 150, H - 90 - th)
        r = (x, y, x + tw, y + th)
        if any(ov_hit(r, q, 10) for q in reserved + [tb]):
            continue
        return r
    x, y = cands[0]
    x = clamp(x, 40, W - 40 - tw); y = clamp(y, 150, H - 90 - th)
    return (x, y, x + tw, y + th)

def draw_tag(ov, r, R, title, sub, color, a, t, t0):
    if a <= 0.01: return
    x0, y0, x1, y1 = r
    # ponto de ancoragem na etiqueta e no alvo
    rcx = (x0 + x1) / 2; rcy = (y0 + y1) / 2
    tx0, ty0, tx1, ty1 = R
    tcx = (tx0 + tx1) / 2; tcy = (ty0 + ty1) / 2
    if y0 > ty1:
        A = (clamp(tcx, x0 + 18, x1 - 18), y0); B = (clamp(A[0], tx0, tx1), ty1)
    elif y1 < ty0:
        A = (clamp(tcx, x0 + 18, x1 - 18), y1); B = (clamp(A[0], tx0, tx1), ty0)
    elif x0 > tx1:
        A = (x0, clamp(tcy, y0 + 16, y1 - 16)); B = (tx1, clamp(A[1], ty0, ty1))
    else:
        A = (x1, clamp(tcy, y0 + 16, y1 - 16)); B = (tx0, clamp(A[1], ty0, ty1))
    p = fade(t, t0 + 0.3, 0.42)
    ex = lerp(A[0], B[0], p); ey = lerp(A[1], B[1], p)
    ov.d.line([A, (ex, ey)], fill=color + (int(240 * a),), width=3)
    if p > 0.98:
        ov.d.ellipse((B[0] - 8, B[1] - 8, B[0] + 8, B[1] + 8), fill=color + (int(255 * a),))
    ov.d.ellipse((A[0] - 5, A[1] - 5, A[0] + 5, A[1] + 5), fill=color + (int(255 * a),))
    # cartão
    ov.d.rounded_rectangle(r, 16, fill=(9, 16, 38, int(236 * a)), outline=color + (int(150 * a),), width=2)
    ov.d.rounded_rectangle((x0, y0 + 10, x0 + 6, y1 - 10), 3, fill=color + (int(255 * a),))
    ov.d.text((x0 + 26, y0 + 15), title, font=F(29, 700), fill=(255, 255, 255, int(255 * a)), anchor="la")
    if sub:
        ov.d.text((x0 + 26, y0 + 56), sub, font=F(21, 400), fill=(196, 208, 236, int(255 * a)), anchor="la")

def draw_cursor(ov, x, y, a):
    if a <= 0.01: return
    k = 1.2
    P = [(0, 0), (0, 30), (8, 23), (14, 37), (19, 35), (13, 22), (23, 22)]
    pts = [(x + px * k, y + py * k) for px, py in P]
    ov.d.polygon([(px + 4, py + 6) for px, py in pts], fill=(0, 0, 0, int(120 * a)))
    ov.d.polygon(pts, fill=(255, 255, 255, int(255 * a)), outline=(14, 22, 44, int(255 * a)))

def steps_list(ov, items, t, y0=548, x0=LC_X):
    for i, s in enumerate(items):
        a_ = fade(t - 0.9, 0.3 * i, 0.45)
        if a_ <= 0.01: continue
        y = y0 + i * 66
        ov.d.rounded_rectangle((x0, y, x0 + 380, y + 50), 14, fill=(10, 18, 42, int(230 * a_)),
                               outline=ACENTO + (int(150 * a_),), width=2)
        ov.d.ellipse((x0 + 12, y + 10, x0 + 40, y + 38), fill=ACENTO + (int(240 * a_),))
        ov.d.text((x0 + 26, y + 25), str(i + 1), font=F(18, 800), fill=(10, 18, 42, int(255 * a_)), anchor="mm")
        ov.d.text((x0 + 56, y + 25), s, font=F(26, 700), fill=(255, 255, 255, int(255 * a_)), anchor="lm")

# ------------------------------------------------------------------ plano de captura (janela)
def shot(*, cam, keys, t, frac, url, kicker=None, head=None, cap=None, sub=None,
         focus=(), cursor=None, clicks=(), chapter=None, steps=None, typing=()):
    camo = Cam(cam, keys)
    content = camo.frame(t)

    act = [f for f in focus if f["t0"] <= t < f.get("t1", 1e9)]
    rects = [camo.box(f["box"], t) for f in act]
    amt = max([fade(t, f["t0"], 0.5) for f in act], default=0.0)
    content = dim(content, rects, amt)

    dy = int(round(-(1 - eo3(t / 0.7)) * 34 + 5 * math.sin(2 * math.pi * t / 7.0)))
    alpha = eo3(t / 0.5)
    canvas = place_window(stage(), content, url, dy, alpha)

    ov = Ov()
    cx0, cy0 = WIN_X, WIN_Y + CHROME + dy

    # áreas reservadas para as etiquetas (determinísticas: não dependem de dy/câmera em tempo real)
    reserved = [(0, H - 66, W, H)]
    if head: reserved.append(head_box(kicker, head))
    if cap: reserved.append((LC_X - 10, H - 176, LC_X + 760, H - 66))
    if steps: reserved.append((LC_X - 10, 540, LC_X + 390, 548 + 66 * len(steps)))
    for f in focus:
        rf = camo.box(f["box"], f["t0"] + 0.6)
        reserved.append((rf[0] + WIN_X, rf[1] + WIN_Y + CHROME, rf[2] + WIN_X, rf[3] + WIN_Y + CHROME))

    for f in focus:
        t1 = f.get("t1", 1e9)
        if t < f["t0"] or t > t1 + 0.35:
            continue
        r = camo.box(f["box"], t)
        R = (r[0] + cx0, r[1] + cy0, r[2] + cx0, r[3] + cy0)
        R = (max(R[0], cx0 + 4), max(R[1], cy0 + 4), min(R[2], cx0 + CW - 4), min(R[3], cy0 + CH - 4))
        pk = t - f.get("press", 1e9)
        if 0 <= pk < 0.6:
            sc = 1 - 0.035 * math.sin(clamp(pk / 0.28) * math.pi)
            mx_, my_ = (R[0] + R[2]) / 2, (R[1] + R[3]) / 2
            R = (mx_ - (mx_ - R[0]) * sc, my_ - (my_ - R[1]) * sc, mx_ + (R[2] - mx_) * sc, my_ + (R[3] - my_) * sc)
            if pk < 0.45:
                ov.d.rounded_rectangle(R, 12, fill=(255, 255, 255, int(78 * (1 - pk / 0.45))))
        color = f.get("color", AMBER)
        draw_focus(ov, R, color, t, f["t0"], t1)
        if f.get("tag"):
            rr_ = camo.box(f["box"], f["t0"] + 0.6)
            Rref = (rr_[0] + WIN_X, rr_[1] + WIN_Y + CHROME, rr_[2] + WIN_X, rr_[3] + WIN_Y + CHROME)
            tw, th = tag_size(f["tag"], f.get("sub"))
            place = place_tag(tw, th, Rref, [q for q in reserved if q != Rref])
            a = fade(t, f["t0"] + 0.15, 0.4)
            if t1 < 1e8:
                a *= clamp((t1 + 0.3 - t) / 0.3)
            draw_tag(ov, place, R, f["tag"], f.get("sub"), color, a, t, f["t0"])

    for ty in typing:
        n = int(max(0.0, (t - ty["t0"]) * ty["cps"]))
        s = ty["text"]
        shown = ty.get("mask", False) and ("•" * min(n, len(s))) or s[:min(n, len(s))]
        if n <= 0 and not ty.get("caret_at_start", False):
            continue
        px, py = camo.px(ty["x"], ty["y"], t)
        X, Y = px + cx0, py + cy0
        f = F(ty.get("size", 22), 400)
        if shown:
            ov.d.text((X, Y), shown, font=f, fill=(21, 36, 61, 255), anchor="lm")
        if t - ty["t0"] < len(s) / ty["cps"] + 0.6 and int(t * 2.4) % 2 == 0:
            cxp = X + (f.getlength(shown) if shown else 0) + 3
            ov.d.rectangle((cxp, Y - 10, cxp + 2, Y + 10), fill=(21, 36, 61, 255))

    if cursor:
        p = interp(cursor, t)
        px, py = camo.px(p[0], p[1], t)
        X, Y = px + cx0, py + cy0
        a_ = fade(t, cursor[0][0] - 0.1, 0.35)
        for ct in clicks:
            dt = t - ct
            if 0 <= dt < 0.7:
                rad = 12 + 46 * eo3(dt / 0.7); al = 1 - dt / 0.7
                ov.d.ellipse((X - rad, Y - rad, X + rad, Y + rad), outline=(255, 255, 255, int(210 * al)), width=4)
        draw_cursor(ov, X, Y, a_)

    if head:
        head_block(ov, kicker, head, t, y0=290)
    if steps:
        steps_list(ov, steps, t)
    if cap:
        caption(ov, cap, sub, t)
    chapter_bar(ov, chapter, frac)
    brand(ov)
    return compose(canvas, ov)

# ------------------------------------------------------------------ cartões (sem captura)
def card_hook(t):
    canvas = bg(0).copy()
    ov = Ov()
    brand(ov, a=fade(t, 0.2, 0.6))
    e0 = fade(t, 0.0, 0.6)
    track_text(ov.d, (LC_X, 176), "DIAGNÓSTICO", F(24, 700), ACENTO + (int(255 * e0),), track=4)
    ov.d.text((LC_X, 240), "Informação espalhada.", font=F(72, 800), fill=(255, 255, 255, int(255 * e0)), anchor="ls")
    itens = [("pedido no WhatsApp", "chat"), ("contrato no e-mail", "mail"), ("documento na pasta de alguém", "pasta")]
    y = 332
    fade_out = 1 - eo3((t - 8.1) / 1.2)
    for i, (s, ico) in enumerate(itens):
        at = eo3((t - 1.1 - i * 1.15) / 0.55) * fade_out
        if at <= 0.02:
            y += 132; continue
        x = LC_X + (1 - at) * 60
        aa = int(255 * at)
        ov.d.rounded_rectangle((x, y, x + 860, y + 108), 18, fill=(13, 22, 47, int(220 * at)),
                               outline=(96, 122, 196, int(160 * at)), width=2)
        ic = (x + 30, y + 26)
        if ico == "chat":
            ov.d.rounded_rectangle((ic[0], ic[1], ic[0] + 54, ic[1] + 40), 12, fill=(37, 211, 102, aa))
            ov.d.polygon([(ic[0] + 12, ic[1] + 40), (ic[0] + 28, ic[1] + 40), (ic[0] + 10, ic[1] + 54)], fill=(37, 211, 102, aa))
        elif ico == "mail":
            ov.d.rounded_rectangle((ic[0], ic[1], ic[0] + 56, ic[1] + 42), 8, fill=(226, 232, 245, aa))
            ov.d.line((ic[0] + 4, ic[1] + 6, ic[0] + 28, ic[1] + 26, ic[0] + 52, ic[1] + 6), fill=(60, 78, 120, aa), width=4)
        else:
            ov.d.polygon([(ic[0], ic[1] + 8), (ic[0] + 20, ic[1] + 8), (ic[0] + 28, ic[1] + 18), (ic[0] + 56, ic[1] + 18),
                          (ic[0] + 56, ic[1] + 44), (ic[0], ic[1] + 44)], fill=(240, 196, 90, aa))
        ov.d.text((x + 112, y + 34), s, font=F(33, 700), fill=(255, 255, 255, aa), anchor="ls")
        ov.d.text((x + 112, y + 76), "ninguém sabe em que pé está", font=F(21, 400), fill=(170, 184, 214, aa), anchor="ls")
        y += 132
    if t > 8.9:
        at = eo3((t - 8.9) / 0.9)
        cw = F(40, 700).getlength("E se tudo isso estivesse no mesmo sistema?") + 80
        cx = W * 0.5 + 240
        ov.d.rounded_rectangle((cx - cw / 2, 430, cx + cw / 2, 500), 18, fill=(20, 34, 74, int(240 * at)),
                               outline=ACENTO + (int(220 * at),), width=2)
        ov.d.text((cx, 466), "E se tudo isso estivesse no mesmo sistema?", font=F(40, 700),
                  fill=(255, 255, 255, int(255 * at)), anchor="mm")
        ov.d.text((cx, 530), "a partir do próximo segundo, é exatamente isso", font=F(24, 400),
                  fill=(196, 210, 238, int(255 * at)), anchor="mm")
    return compose(canvas, ov)

def card_aceite(t):
    canvas = bg(2).copy()
    ov = Ov()
    brand(ov)
    track_text(ov.d, (LC_X, 210), "ACEITE DO CLIENTE", F(24, 700), ACENTO + (int(255 * fade(t, 0, 0.6)),), track=4)
    ov.d.text((LC_X, 290), "O aceite fica registrado.", font=F(66, 800), fill=(255, 255, 255, int(255 * fade(t, 0, 0.7))), anchor="ls")
    cx, cy, r = W / 2, 530, 100
    a = fade(t, 0, 0.7)
    glowr = r + 18 + 6 * math.sin(t * 3)
    ov.d.ellipse((cx - glowr, cy - glowr, cx + glowr, cy + glowr), outline=VERDE + (int(70 * a),), width=10)
    ov.d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(12, 26, 50, int(230 * a)), outline=VERDE + (int(230 * a),), width=6)
    p = eo3((t - 0.5) / 0.9)
    pts = [(cx - 40, cy + 4), (cx - 10, cy + 34), (cx + 44, cy - 30)]
    if p < 0.5:
        q = p / 0.5
        pts2 = [pts[0], (lerp(pts[0][0], pts[1][0], q), lerp(pts[0][1], pts[1][1], q))]
        ov.d.line(pts2, fill=VERDE + (255,), width=13, joint="curve")
    else:
        ov.d.line([pts[0], pts[1]], fill=VERDE + (255,), width=13, joint="curve")
        q = (p - 0.5) / 0.5
        ov.d.line([pts[1], (lerp(pts[1][0], pts[2][0], q), lerp(pts[1][1], pts[2][1], q))], fill=VERDE + (255,), width=13, joint="curve")
    for i, (k, v) in enumerate([("quem aceitou", "registrado na proposta"), ("quando aceitou", "data e hora do aceite")]):
        at = eo3((t - 1.2 - i * 0.6) / 0.6)
        if at <= 0.02: continue
        y = 700 + i * 96
        ov.d.rounded_rectangle((cx - 330, y, cx + 330, y + 76), 16, fill=(14, 24, 52, int(225 * at)), outline=(120, 150, 230, int(160 * at)), width=2)
        ov.d.ellipse((cx - 306, y + 22, cx - 274, y + 54), fill=VERDE + (int(235 * at),))
        ov.d.text((cx - 262, y + 38), v, font=F(27, 700), fill=(255, 255, 255, int(255 * at)), anchor="lm")
        ov.d.text((cx + 310, y + 38), k, font=F(21, 400), fill=(168, 182, 214, int(255 * at)), anchor="rm")
    return compose(canvas, ov)

def card_end(t):
    canvas = bg(1).copy()
    ov = Ov()
    a = fade(t, 0, 0.9)
    cx, cy = W // 2, 300
    lg = logo_small(230)
    ov.im.alpha_composite(lg, (cx - 115, cy - 115))
    ang = t * 70
    for k in range(3):
        rr_ = 170 + k * 14
        a0 = math.radians(ang + k * 120)
        ov.d.arc((cx - rr_, cy - rr_, cx + rr_, cy + rr_), start=math.degrees(a0) % 360, end=(math.degrees(a0) + 110) % 360,
                 fill=ACENTO + (int(220 * a * (1 - k * 0.25)),), width=4)
    ov.d.text((cx, 520), "GRUPO SEG SYSTEM", font=F(56, 800), fill=(255, 255, 255, int(255 * fade(t, 0.3, 0.8))), anchor="ma")
    ov.d.text((cx, 592), "Segurança Integrada", font=F(30, 500), fill=(170, 190, 235, int(255 * fade(t, 0.5, 0.8))), anchor="ma")
    ov.d.text((cx, 690), "Um sistema. Toda a operação.", font=F(46, 800), fill=(255, 236, 200, int(255 * fade(t, 0.9, 0.8))), anchor="ma")
    ov.d.text((cx, 758), "Cada pessoa vendo exatamente o que precisa ver.", font=F(27, 400), fill=(203, 214, 238, int(255 * fade(t, 1.3, 0.8))), anchor="ma")
    ov.d.text((cx, 830), "(11) 3437-2217  ·  gruposegsystemseguranca.com.br", font=F(26, 500), fill=(170, 190, 235, int(255 * fade(t, 1.8, 0.8))), anchor="ma")
    ov.d.text((cx, 930), "Vídeo de demonstração · dados fictícios · outubro de 2026", font=F(22, 500), fill=(146, 162, 196, int(255 * fade(t, 2.2, 0.8))), anchor="ma")
    return compose(canvas, ov)

# ------------------------------------------------------------------ transições
_DN = ((np.arange(W, dtype=np.float32)[None, :] * 0.8 + np.arange(H, dtype=np.float32)[:, None] * 0.6)
       / (W * 0.8 + H * 0.6)).astype(np.float32)
_XS = np.arange(W, dtype=np.float32)

def _warp(img, s, tx=0.0):
    M = np.float32([[s, 0, (1 - s) * W / 2 + tx], [0, s, (1 - s) * H / 2]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

def tr_dissolve(A, B, e):
    return A * (1 - e) + B * e

def tr_whip(A, B, e):
    acc = np.zeros((H, W, 3), np.float32); K = 4
    for k in range(K):
        ee = clamp(e + (k - (K - 1) / 2) * 0.025)
        a = _warp(A, 1.0, -W * ee); b = _warp(B, 1.0, W * (1 - ee))
        m = np.clip((_XS - W * (1 - ee)) / 40 + 0.5, 0, 1)[None, :, None]
        acc += (a * (1 - m) + b * m) / K
    return acc

def tr_zoom(A, B, e):
    a = (_warp(A, 1 + 0.50 * e) + _warp(A, 1 + 0.30 * e) + _warp(A, 1 + 0.12 * e)) / 3
    b = _warp(B, 1.12 - 0.12 * e)
    return a * (1 - e) + b * e

def tr_wipe(A, B, e):
    thr = -0.06 + 1.12 * e
    m = np.clip((thr - _DN) / 0.012 + 0.5, 0, 1)[..., None]
    edge = np.exp(-((_DN - thr) / 0.007) ** 2)[..., None]
    return A * (1 - m) + B * m + edge * np.array([150, 180, 255], np.float32) * 0.9

TRANS = {"dissolve": tr_dissolve, "whip": tr_whip, "zoom": tr_zoom, "wipe": tr_wipe}

_VIG = None; _GRN = None
def grade(arr, n):
    global _VIG, _GRN
    if _VIG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / np.sqrt(2)
        _VIG = (1 - 0.30 * np.clip(r, 0, 1) ** 2.0).astype(np.float32)[..., None]
        rng = np.random.default_rng(11)
        _GRN = [(cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 0.7) * 1.1)[..., None]
                for _ in range(6)]
    f = arr.astype(np.float32) * _VIG + _GRN[n % 6]
    return np.clip(f, 0, 255).astype(np.uint8)

# ------------------------------------------------------------------ roteiro visual
def S(**kw):
    return lambda t, f: shot(t=t, frac=f, **kw)

def planos():
    P = []
    def add(s0, s1, fn, tr="wipe", xf=0.0):
        P.append(dict(s0=s0, s1=s1, fn=fn, tr=tr, xf=xf))

    # 1 — gancho
    add(0.0, 12.4, lambda t, f: card_hook(t))

    # 2 — o primeiro contato: o pedido chega pelo site (destaque, cursor, clique)
    add(12.4, 17.3, S(cam="site.png", url="/",
        keys=[(0, (632, 356, 1265)), (1.2, (942, 200, 645)), (4.9, (942, 200, 645))],
        kicker="O PRIMEIRO CONTATO", head="O pedido chega pelo site", chapter=0,
        focus=[dict(box=(1048, 49, 1209, 93), t0=1.5, color=AMBER, press=2.9,
                    tag="o visitante pede pelo próprio site")],
        cursor=[(0.6, (760, 330)), (2.6, (1128, 71))], clicks=[2.9]), "wipe", 0.5)

    # 3 — CRM: o pedido vira oportunidade
    add(17.3, 21.5, S(cam="crm.png", url="/admin/crm",
        keys=[(0, (720, 450, 1440)), (1.5, (560, 640, 760)), (4.2, (560, 640, 760))],
        kicker="CRM", head="Pedido recebido vira oportunidade", chapter=1, cap="o pedido entra com origem e data",
        focus=[dict(box=(357, 656, 747, 701), t0=1.5, color=AMBER, tag="converte o pedido do site em oportunidade")],
        cursor=[(0.4, (900, 300)), (1.4, (555, 678))], clicks=[1.6]), "whip", 0.45)

    # 4 — oportunidade: responsável e origem
    add(21.5, 25.0, S(cam="crmdetalhe.png", url="/admin/crm",
        keys=[(0, (720, 1500, 1440)), (1.4, (720, 1735, 820)), (3.5, (720, 1735, 820))],
        kicker="OPORTUNIDADE", head="Responsável e origem definidos", chapter=1, cap="nada entra sem responsável",
        focus=[dict(box=(366, 1722, 1341, 1774), t0=1.2, color=ACENTO, tag="empresa, serviço e necessidade")]),
        "zoom", 0.45)

    # 5 — a oportunidade na lista, com estágio
    add(25.0, 27.6, S(cam="crmdetalhe.png", url="/admin/crm",
        keys=[(0, (900, 2800, 1000)), (2.6, (900, 2800, 1000))],
        kicker="HISTÓRICO", head="Fica na lista, com status", chapter=1,
        focus=[dict(box=(797, 2816, 1062, 3037), t0=0.5, color=ACENTO, tag="a oportunidade, com responsável e estágio")]),
        "whip", 0.4)

    # 6 — funil
    add(27.6, 33.0, S(cam="crmdetalhe.png", url="/admin/crm",
        keys=[(0, (1070, 2770, 820)), (2.6, (1070, 3030, 820)), (5.4, (1070, 3030, 820))],
        kicker="OPORTUNIDADE", head="Por onde ela passou", chapter=1,
        focus=[dict(box=(778, 2772, 1368, 3280), t0=0.8, color=AMBER, tag="estágios do funil")]),
        "zoom", 0.45)

    # 7 — proposta com link de aceite
    add(33.0, 37.5, S(cam="comercial.png", url="/admin/comercial",
        keys=[(0, (720, 450, 1440)), (1.4, (1005, 358, 760)), (4.5, (1005, 358, 760))],
        kicker="PROPOSTA", head="Sai daqui, com link de aceite", chapter=2, cap="visita, orçamento, proposta — na mesma trilha",
        focus=[dict(box=(917, 333, 1098, 384), t0=1.3, color=AMBER, tag="propostas e envio ao cliente")],
        cursor=[(0.4, (600, 640)), (1.2, (1004, 358))], clicks=[1.4]), "wipe", 0.5)

    # 8 — aceite registrado (cartela)
    add(37.5, 41.0, lambda t, f: card_aceite(t), "dissolve", 0.5)

    # 9 — contrato criado a partir do aceite
    add(41.0, 48.0, S(cam="contratos.png", url="/admin/contratos",
        keys=[(0, (720, 450, 1440)), (1.6, (854, 800, 1150)), (7.0, (854, 800, 1150))],
        kicker="CONTRATO", head="Criado a partir do aceite", chapter=3,
        focus=[dict(box=(367, 799, 1342, 868), t0=1.3, color=AMBER, tag="escopo, prazo e valores do contrato")],
        steps=["postos", "horários", "SLA", "obrigações"]), "wipe", 0.5)

    # 10 — a mesma informação atravessa os módulos
    add(48.0, 54.5, S(cam="contratos.png", url="/admin/contratos",
        keys=[(0, (720, 450, 1440)), (1.6, (450, 553, 900)), (6.5, (450, 553, 900))],
        kicker="A MESMA INFORMAÇÃO", head="Sem digitar de novo", chapter=3,
        focus=[dict(box=(70, 396, 262, 612), t0=1.2, color=ACENTO, tag="operação, patrimônio, frota, qualidade")],
        cursor=[(0.3, (600, 700)), (1.1, (140, 500))], clicks=[1.25]), "whip", 0.45)

    # 11 — portal do cliente: entrada com e-mail e senha
    add(54.5, 58.5, S(cam="cliente.png", url="/portal",
        keys=[(0, (632, 356, 1265)), (1.8, (470, 330, 960)), (4.0, (470, 330, 960))],
        kicker="PORTAL DO CLIENTE", head="Acesso próprio e verificado", chapter=4, cap="não é o sistema por dentro: é a conta dele",
        focus=[dict(box=(439, 321, 813, 367), t0=0.7, t1=2.2, color=ACENTO, tag="e-mail e senha do convite"),
               dict(box=(439, 400, 813, 446), t0=2.2, t1=3.0, color=ACENTO),
               dict(box=(437, 461, 815, 509), t0=3.0, color=AMBER, tag="acesso verificado no servidor")],
        typing=[dict(x=455, y=343, text="cliente@empresa-exemplo.com.br", t0=0.9, cps=24, size=22),
                dict(x=455, y=423, text="segredo-demonstracao", t0=2.4, cps=30, size=22, mask=True)],
        cursor=[(0.5, (640, 600)), (2.9, (625, 484))], clicks=[3.2]), "zoom", 0.45)

    # 12 — no portal: contratos, documentos, chamados
    add(58.5, 65.5, S(cam="clientecont.png", url="/portal",
        keys=[(0, (720, 220, 1440)), (2.0, (720, 190, 700)), (4.5, (720, 520, 700)), (7.0, (720, 520, 700))],
        kicker="NO PORTAL", head="Contratos, documentos, chamados", chapter=4, cap="cobranças, satisfação e renovação",
        sub="sem precisar pedir print pelo WhatsApp",
        focus=[dict(box=(290, 104, 1150, 190), t0=0.6, t1=2.6, color=ACENTO, tag="tudo da conta, em um só lugar"),
               dict(box=(323, 482, 1117, 880), t0=3.0, color=AMBER, tag="planos, documentos e chamados")]),
        "whip", 0.45)

    # 13 — quem decide: pendências, leads e oportunidades paradas
    add(65.5, 71.0, S(cam="marcelo.png", url="/admin/painel",
        keys=[(0, (680, 800, 1000)), (2.6, (850, 800, 1000)), (3.9, (1000, 800, 1000)), (5.5, (1000, 800, 1000))],
        kicker="QUEM DECIDE", head="O que exige decisão, hoje", chapter=5, cap="cada número com fonte e responsável",
        focus=[dict(box=(354, 737, 684, 900), t0=0.6, t1=2.6, color=AMBER, tag="pendências"),
               dict(box=(689, 737, 1020, 900), t0=2.6, t1=3.9, color=ACENTO, tag="leads novos"),
               dict(box=(1025, 737, 1355, 900), t0=3.9, color=AMBER, tag="oportunidades paradas")]),
        "wipe", 0.5)

    # 14 — do site ao posto: a área administrativa percorrida módulo a módulo
    add(71.0, 76.4, S(cam="hub.png", url="/admin",
        keys=[(0, (720, 420, 1000)), (1.3, (470, 600, 900)), (2.6, (850, 600, 900)), (3.9, (1100, 600, 900)), (5.4, (1100, 600, 900))],
        kicker="ÁREA ADMINISTRATIVA", head="Do site ao posto", chapter=6, cap="tudo no mesmo lugar",
        focus=[dict(box=(214, 532, 459, 660), t0=0.7, t1=1.9, color=ACENTO, tag="pedidos do site"),
               dict(box=(726, 392, 971, 521), t0=1.9, t1=3.2, color=ACENTO, tag="CRM"),
               dict(box=(470, 532, 715, 660), t0=3.2, t1=4.5, color=ACENTO, tag="contratos"),
               dict(box=(982, 532, 1227, 660), t0=4.5, color=AMBER, tag="operação")],
        cursor=[(0.4, (336, 600)), (1.6, (847, 455)), (3.0, (592, 600)), (4.2, (1104, 600))],
        clicks=[1.9, 3.2, 4.5]), "zoom", 0.45)

    # 15 — pessoas
    add(76.4, 78.6, S(cam="rh.png", url="/admin/rh",
        keys=[(0, (900, 600, 760)), (2.2, (900, 600, 760))],
        kicker="PESSOAS", head="Jornada e ponto", chapter=6,
        focus=[dict(box=(336, 476, 1030, 575), t0=0.5, color=ACENTO, tag="equipe, admissão e desligamento")]),
        "whip", 0.35)

    # 16 — financeiro
    add(78.6, 80.8, S(cam="financeiro.png", url="/admin/financeiro",
        keys=[(0, (760, 600, 900)), (2.2, (760, 600, 900))],
        kicker="FINANCEIRO", head="Contas e recorrência", chapter=6,
        focus=[dict(box=(340, 495, 1367, 786), t0=0.6, color=AMBER, tag="recebíveis por contrato e conta")]),
        "whip", 0.35)

    # 17 — montagem de papéis (cortes rápidos)
    add(80.8, 81.85, S(cam="marcelo.png", url="/admin/painel", keys=[(0, (720, 600, 1440)), (1.05, (720, 600, 1440))],
        kicker="PAPÉIS", head="Só o que precisa ver", cap="papel: gestão"), "whip", 0.3)
    add(81.85, 82.9, S(cam="rh.png", url="/admin/rh", keys=[(0, (720, 600, 1440)), (1.05, (720, 600, 1440))],
        kicker="PAPÉIS", head="Só o que precisa ver", cap="papel: recursos humanos"), "whip", 0.3)
    add(82.9, 84.0, S(cam="clientecont.png", url="/portal", keys=[(0, (720, 450, 1440)), (1.1, (720, 450, 1440))],
        kicker="PAPÉIS", head="Só o que precisa ver", cap="papel: cliente"), "whip", 0.3)

    # 18 — cartela final
    add(84.0, TOTAL, lambda t, f: card_end(t), "dissolve", 0.6)
    return P

P = planos()
for _p in P:
    pass

def plane_index(t):
    for i, p in enumerate(P):
        if p["s0"] <= t < p["s1"]:
            return i
    return len(P) - 1

def frame_at(t, n):
    i = plane_index(t); p = P[i]
    frac = clamp(t / TOTAL)
    arr = p["fn"](t - p["s0"], frac)
    if i > 0 and p["xf"] > 0 and t < p["s0"] + p["xf"]:
        q = P[i - 1]
        e = sm((t - p["s0"]) / p["xf"])
        prev = q["fn"](t - q["s0"], frac)
        arr = TRANS[p["tr"]](prev.astype(np.float32), arr.astype(np.float32), e)
    return grade(arr, n)

# ------------------------------------------------------------------ render paralelo
def render_chunk(args):
    idx, n0, n1, out = args
    p = subprocess.Popen([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
                          "-g", "60", out], stdin=subprocess.PIPE)
    for n in range(n0, n1):
        p.stdin.write(frame_at(n / FPS, n).tobytes())
    p.stdin.close(); p.wait()
    print(f"  seg {idx} pronto ({n1 - n0} quadros)", flush=True)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--range", nargs=2, type=float)
    ap.add_argument("--stills", nargs="+", type=float)
    ap.add_argument("--out", default=f"{BUILD}/trailer_silent.mp4")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    os.makedirs(BUILD, exist_ok=True)

    if a.list:
        for i, p in enumerate(P, 1):
            print(f"{i:2d} {p['s0']:6.2f} -> {p['s1']:6.2f}  tr={p['tr']} xf={p['xf']}")
        print(f"total {TOTAL}s · locução termina em {END_VO}s")
        return

    if a.stills:
        sd = f"{BUILD}/stills"; os.makedirs(sd, exist_ok=True)
        for t in a.stills:
            Image.fromarray(frame_at(t, int(round(t * FPS)))).save(f"{sd}/t{t:06.2f}.png")
            print("still", t)
        return

    n_total = int(round(TOTAL * FPS))
    n0, n1 = 0, n_total
    if a.range:
        n0 = int(round(a.range[0] * FPS)); n1 = int(round(min(a.range[1], TOTAL) * FPS))
    if a.range:
        render_chunk((0, n0, n1, a.out)); print("OK", a.out); return

    step = 150
    tasks = []
    for k, s in enumerate(range(n0, n1, step)):
        tasks.append((k, s, min(s + step, n1), f"{BUILD}/seg_{k:03d}.mp4"))
    with Pool(a.jobs) as pool:
        segs = pool.map(render_chunk, tasks, chunksize=1)
    lst = f"{BUILD}/segs.txt"
    with open(lst, "w") as fh:
        for s_ in segs:
            fh.write(f"file '{s_}'\n")
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-c", "copy", "-movflags", "+faststart", a.out], check=True)
    print("OK ->", a.out, f"({n1 - n0} quadros)")

if __name__ == "__main__":
    main()

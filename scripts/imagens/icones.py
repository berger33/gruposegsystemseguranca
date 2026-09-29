"""Glifos de ícone do Grupo SEG System, desenhados em traço (sem texto embutido).

Cada função recebe (t, c, cor, w): t = Tela (superamostragem 4x), c = lado lógico,
cor = RGB do traço, w = espessura lógica do traço. Coordenadas normalizadas 0..1.

Uso típico:
    from icones import GLIFOS, desenhar_glifo
    img = desenhar_glifo("portaria", 256, MARINHO, 9)

Os ícones de marca (escudo, selo, monograma) usam o recorte real do logotipo e as
fontes OFL — nunca a IA.
"""
from comum import *  # noqa


# ------------------------------------------------------------------ auxiliares
def _mao(t, c, cor, w):
    """Mãozinha de ponteiro (usada em ícones de ação)."""
    t.caixa(c * 0.34, c * 0.30, c * 0.62, c * 0.74, c * 0.14, contorno=cor, largura=w)
    t.traco([(c * 0.34, c * 0.50), (c * 0.24, c * 0.44)], cor, w)
    t.traco([(c * 0.44, c * 0.30), (c * 0.44, c * 0.74)], cor, w)


# ------------------------------------------------------------------ serviços
def portaria(t, c, cor, w):
    """Guarita com cancela: dois pilares, cancela levantada e lente de câmera."""
    t.caixa(c * 0.14, c * 0.36, c * 0.30, c * 0.86, c * 0.03, contorno=cor, largura=w)
    t.caixa(c * 0.70, c * 0.36, c * 0.86, c * 0.86, c * 0.03, contorno=cor, largura=w)
    t.traco([(c * 0.30, c * 0.52), (c * 0.70, c * 0.42)], cor, w)     # cancela
    t.traco([(c * 0.50, c * 0.62), (c * 0.50, c * 0.86)], cor, w * 0.7)  # faixa central
    t.caixa(c * 0.36, c * 0.16, c * 0.64, c * 0.28, c * 0.04, contorno=cor, largura=w)
    t.disco(c * 0.60, c * 0.22, c * 0.028, cor)


def _ponto_em(segs, s):
    """Ponto a `s` de distância acumulada ao longo de uma lista de segmentos."""
    acc = 0.0
    for (x0, y0), (x1, y1), L in segs:
        if acc + L >= s:
            f = (s - acc) / max(L, 1e-6)
            return (x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)
        acc += L
    return (segs[-1][1][0], segs[-1][1][1])


def _tracejado(t, pontos, cor, w, traco, vao):
    """Traço uniforme ao longo de uma polilinha (trajeto de ronda)."""
    import math as _m
    segs = []
    total = 0.0
    for i in range(len(pontos) - 1):
        x0, y0 = pontos[i]
        x1, y1 = pontos[i + 1]
        L = _m.hypot(x1 - x0, y1 - y0)
        segs.append((pontos[i], pontos[i + 1], L))
        total += L
    pos = 0.0
    while pos < total - 1e-6:
        a = pos
        b = min(pos + traco, total)
        t.traco([_ponto_em(segs, a), _ponto_em(segs, b)], cor, w)
        pos = b + vao


def ronda(t, c, cor, w):
    """Trajeto de ronda tracejado com pontos de passagem e seta de saída."""
    pts = [(c * 0.14, c * 0.80), (c * 0.34, c * 0.52), (c * 0.58, c * 0.68), (c * 0.78, c * 0.34)]
    _tracejado(t, pts, cor, w, c * 0.075, c * 0.045)
    for x, y in pts[1:3]:
        t.disco(x, y, c * 0.045, cor)
    px, py = pts[-1]
    t.poligono([(px + c * 0.10, py - c * 0.06), (px + c * 0.16, py + c * 0.04), (px + c * 0.02, py + c * 0.06)],
               preenchimento=cor)
    t.disco(c * 0.14, c * 0.80, c * 0.045, cor)


def cftv(t, c, cor, w):
    """Câmera em suporte: corpo, lente, braço e base."""
    t.caixa(c * 0.20, c * 0.44, c * 0.62, c * 0.66, c * 0.05, contorno=cor, largura=w)   # corpo
    t.poligono([(c * 0.62, c * 0.47), (c * 0.80, c * 0.51), (c * 0.80, c * 0.59), (c * 0.62, c * 0.63)],
               contorno=cor, largura=w)                                                  # lente
    t.traco([(c * 0.34, c * 0.44), (c * 0.34, c * 0.28), (c * 0.60, c * 0.28)], cor, w)  # braço
    t.caixa(c * 0.54, c * 0.22, c * 0.66, c * 0.30, c * 0.02, contorno=cor, largura=w)   # base
    t.disco(c * 0.70, c * 0.55, c * 0.022, cor)


def alarme(t, c, cor, w):
    """Sino de alarme com ondas sonoras."""
    cx, cy = c * 0.50, c * 0.62
    t.traco([(c * 0.28, c * 0.62), (c * 0.31, c * 0.44)], cor, w)          # lateral esquerda
    t.arco(cx, c * 0.44, c * 0.19, cor, w, 180, 360)                       # cúpula
    t.traco([(c * 0.69, c * 0.44), (c * 0.72, c * 0.62)], cor, w)          # lateral direita
    t.traco([(c * 0.22, c * 0.62), (c * 0.78, c * 0.62)], cor, w)          # base
    t.arco(cx, cy, c * 0.09, cor, w, 0, 180)                               # badalo
    t.disco(cx, c * 0.17, c * 0.035, cor)                                  # pino do topo
    t.arco(cx, cy - c * 0.10, c * 0.34, cor, w * 0.85, -34, 34)            # ondas
    t.arco(cx, cy - c * 0.10, c * 0.44, cor, w * 0.85, -30, 30)


def monitoramento(t, c, cor, w):
    t.caixa(c * 0.18, c * 0.24, c * 0.82, c * 0.66, c * 0.05, contorno=cor, largura=w)
    t.traco([(c * 0.28, c * 0.54), (c * 0.40, c * 0.38), (c * 0.50, c * 0.52), (c * 0.62, c * 0.32), (c * 0.74, c * 0.46)], cor, w)
    t.traco([(c * 0.50, c * 0.66), (c * 0.50, c * 0.78)], cor, w)
    t.traco([(c * 0.34, c * 0.78), (c * 0.66, c * 0.78)], cor, w)


def escolta(t, c, cor, w):
    """Profissional protegido por escudo (escolta/supervisão)."""
    t.anel(c * 0.28, c * 0.30, c * 0.12, cor, w)
    t.arco(c * 0.28, c * 0.86, c * 0.25, cor, w, 180, 360)
    t.poligono([(c * 0.58, c * 0.24), (c * 0.86, c * 0.24), (c * 0.86, c * 0.56),
                (c * 0.72, c * 0.80), (c * 0.58, c * 0.56)], contorno=cor, largura=w)
    t.traco([(c * 0.64, c * 0.46), (c * 0.70, c * 0.54), (c * 0.80, c * 0.38)], cor, w * 0.9)


def controle_acesso(t, c, cor, w):
    t.caixa(c * 0.16, c * 0.34, c * 0.62, c * 0.72, c * 0.06, contorno=cor, largura=w)
    t.caixa(c * 0.26, c * 0.44, c * 0.40, c * 0.56, c * 0.02, contorno=cor, largura=w)
    t.traco([(c * 0.26, c * 0.62), (c * 0.44, c * 0.62)], cor, w * 0.9)
    t.arco(c * 0.70, c * 0.53, c * 0.10, cor, w, -60, 60)
    t.arco(c * 0.70, c * 0.53, c * 0.18, cor, w, -60, 60)


def zeladoria(t, c, cor, w):
    """Caixa de ferramentas com chave inglesa (zeladoria/manutenção)."""
    t.caixa(c * 0.12, c * 0.46, c * 0.64, c * 0.86, c * 0.04, contorno=cor, largura=w)
    t.traco([(c * 0.12, c * 0.64), (c * 0.64, c * 0.64)], cor, w * 0.85)
    t.traco([(c * 0.30, c * 0.46), (c * 0.30, c * 0.60), (c * 0.46, c * 0.60), (c * 0.46, c * 0.46)], cor, w * 0.85)
    t.anel(c * 0.80, c * 0.26, c * 0.075, cor, w)
    t.traco([(c * 0.75, c * 0.31), (c * 0.62, c * 0.52)], cor, w)
    t.traco([(c * 0.62, c * 0.52), (c * 0.67, c * 0.58)], cor, w * 0.8)


def limpeza(t, c, cor, w):
    """Vassoura: cabo e cerdas."""
    t.traco([(c * 0.72, c * 0.12), (c * 0.54, c * 0.40)], cor, w)          # cabo
    t.poligono([(c * 0.44, c * 0.40), (c * 0.66, c * 0.40), (c * 0.80, c * 0.86), (c * 0.30, c * 0.86)],
               contorno=cor, largura=w)                                      # cerdas (alargam para baixo)
    for dx in (0.44, 0.52, 0.60):
        t.traco([(c * dx, c * 0.50), (c * (dx - 0.03), c * 0.80)], cor, w * 0.55)
    t.traco([(c * 0.60, c * 0.22), (c * 0.72, c * 0.16)], cor, w * 0.8)


def jardinagem(t, c, cor, w):
    """Ramo com duas folhas e caule."""
    t.traco([(c * 0.50, c * 0.90), (c * 0.50, c * 0.26)], cor, w)                 # caule
    t.traco([(c * 0.50, c * 0.68), (c * 0.32, c * 0.56)], cor, w * 0.7)           # pecíolos
    t.traco([(c * 0.50, c * 0.50), (c * 0.68, c * 0.38)], cor, w * 0.7)
    t.poligono([(c * 0.34, c * 0.56), (c * 0.16, c * 0.48), (c * 0.18, c * 0.24), (c * 0.40, c * 0.34)],
               contorno=cor, largura=w * 0.85)                                     # folha esquerda
    t.poligono([(c * 0.68, c * 0.38), (c * 0.86, c * 0.30), (c * 0.84, c * 0.08), (c * 0.62, c * 0.18)],
               contorno=cor, largura=w * 0.85)                                     # folha direita
    t.traco([(c * 0.30, c * 0.88), (c * 0.70, c * 0.88)], cor, w * 0.9)           # linha de solo


# ------------------------------------------------------------------ operação
def ocorrencia(t, c, cor, w):
    t.caixa(c * 0.22, c * 0.20, c * 0.78, c * 0.84, c * 0.05, contorno=cor, largura=w)
    t.caixa(c * 0.38, c * 0.13, c * 0.62, c * 0.25, c * 0.03, contorno=cor, largura=w)
    t.traco([(c * 0.50, c * 0.42), (c * 0.50, c * 0.62)], cor, w)
    t.disco(c * 0.50, c * 0.72, c * 0.035, cor)


def escala(t, c, cor, w):
    t.caixa(c * 0.18, c * 0.26, c * 0.82, c * 0.80, c * 0.05, contorno=cor, largura=w)
    t.traco([(c * 0.18, c * 0.42), (c * 0.82, c * 0.42)], cor, w)
    t.traco([(c * 0.34, c * 0.18), (c * 0.34, c * 0.32)], cor, w)
    t.traco([(c * 0.66, c * 0.18), (c * 0.66, c * 0.32)], cor, w)
    t.disco(c * 0.36, c * 0.58, c * 0.045, cor)
    t.disco(c * 0.56, c * 0.58, c * 0.045, cor)
    t.disco(c * 0.36, c * 0.70, c * 0.045, cor)


def ponto(t, c, cor, w):
    t.anel(c * 0.50, c * 0.50, c * 0.32, cor, w)
    t.traco([(c * 0.50, c * 0.50), (c * 0.50, c * 0.30)], cor, w)
    t.traco([(c * 0.50, c * 0.50), (c * 0.66, c * 0.56)], cor, w)
    t.disco(c * 0.50, c * 0.50, c * 0.04, cor)


def checklist(t, c, cor, w):
    t.caixa(c * 0.18, c * 0.20, c * 0.82, c * 0.84, c * 0.05, contorno=cor, largura=w)
    for i, y in enumerate((0.40, 0.56, 0.72)):
        t.traco([(c * 0.30, c * y), (c * 0.36, c * (y + 0.05)), (c * 0.46, c * (y - 0.05))], cor, w * 0.9)
        t.traco([(c * 0.54, c * (y + 0.01)), (c * 0.72, c * (y + 0.01))], cor, w * 0.85)


def chaves(t, c, cor, w):
    """Chave com argola e dentes."""
    t.anel(c * 0.30, c * 0.30, c * 0.19, cor, w)
    t.traco([(c * 0.44, c * 0.44), (c * 0.84, c * 0.84)], cor, w)
    t.traco([(c * 0.70, c * 0.70), (c * 0.82, c * 0.58)], cor, w * 0.95)
    t.traco([(c * 0.80, c * 0.80), (c * 0.86, c * 0.62)], cor, w * 0.8)


def cracha(t, c, cor, w):
    """Crachá de identificação com clipe, foto e tarja."""
    t.caixa(c * 0.22, c * 0.26, c * 0.78, c * 0.88, c * 0.06, contorno=cor, largura=w)
    t.traco([(c * 0.42, c * 0.26), (c * 0.42, c * 0.16), (c * 0.58, c * 0.16), (c * 0.58, c * 0.26)], cor, w * 0.85)
    t.anel(c * 0.50, c * 0.50, c * 0.11, cor, w)
    t.arco(c * 0.50, c * 0.82, c * 0.18, cor, w, 180, 360)
    t.traco([(c * 0.63, c * 0.36), (c * 0.71, c * 0.36)], cor, w * 0.7)


def relatorio(t, c, cor, w):
    t.caixa(c * 0.22, c * 0.18, c * 0.78, c * 0.84, c * 0.05, contorno=cor, largura=w)
    t.traco([(c * 0.34, c * 0.72), (c * 0.34, c * 0.58)], cor, w)
    t.traco([(c * 0.46, c * 0.72), (c * 0.46, c * 0.44)], cor, w)
    t.traco([(c * 0.58, c * 0.72), (c * 0.58, c * 0.52)], cor, w)
    t.traco([(c * 0.34, c * 0.34), (c * 0.66, c * 0.34)], cor, w * 0.85)


def contrato(t, c, cor, w):
    t.caixa(c * 0.22, c * 0.18, c * 0.78, c * 0.80, c * 0.05, contorno=cor, largura=w)
    t.traco([(c * 0.32, c * 0.34), (c * 0.68, c * 0.34)], cor, w * 0.85)
    t.traco([(c * 0.32, c * 0.46), (c * 0.68, c * 0.46)], cor, w * 0.85)
    t.traco([(c * 0.32, c * 0.66), (c * 0.44, c * 0.58), (c * 0.56, c * 0.70), (c * 0.68, c * 0.60)], cor, w * 0.9)
    t.disco(c * 0.66, c * 0.24, c * 0.05, cor)


def vistoria(t, c, cor, w):
    t.anel(c * 0.44, c * 0.42, c * 0.22, cor, w)
    t.traco([(c * 0.60, c * 0.58), (c * 0.80, c * 0.78)], cor, w)
    t.traco([(c * 0.34, c * 0.42), (c * 0.41, c * 0.49), (c * 0.55, c * 0.33)], cor, w * 0.9)


def comunicacao(t, c, cor, w):
    """Megafone com ondas de alcance."""
    t.poligono([(c * 0.18, c * 0.38), (c * 0.56, c * 0.22), (c * 0.56, c * 0.66), (c * 0.18, c * 0.50)],
               contorno=cor, largura=w)
    t.traco([(c * 0.18, c * 0.44), (c * 0.18, c * 0.62)], cor, w)
    t.caixa(c * 0.40, c * 0.64, c * 0.54, c * 0.84, c * 0.03, contorno=cor, largura=w)   # cabo
    t.arco(c * 0.46, c * 0.44, c * 0.22, cor, w, -52, 52)                                # ondas
    t.arco(c * 0.46, c * 0.44, c * 0.32, cor, w, -46, 46)


# ------------------------------------------------------------------ navegação
def inicio(t, c, cor, w):
    t.traco([(c * 0.16, c * 0.48), (c * 0.50, c * 0.20), (c * 0.84, c * 0.48)], cor, w)
    t.caixa(c * 0.26, c * 0.46, c * 0.74, c * 0.82, c * 0.04, contorno=cor, largura=w)
    t.caixa(c * 0.44, c * 0.62, c * 0.56, c * 0.82, c * 0.02, contorno=cor, largura=w)


def painel(t, c, cor, w):
    t.caixa(c * 0.16, c * 0.18, c * 0.46, c * 0.46, c * 0.05, contorno=cor, largura=w)
    t.caixa(c * 0.54, c * 0.18, c * 0.84, c * 0.46, c * 0.05, contorno=cor, largura=w)
    t.caixa(c * 0.16, c * 0.54, c * 0.46, c * 0.82, c * 0.05, contorno=cor, largura=w)
    t.caixa(c * 0.54, c * 0.54, c * 0.84, c * 0.82, c * 0.05, preenchimento=cor)


def servicos(t, c, cor, w):
    """Maleta de serviços."""
    t.caixa(c * 0.14, c * 0.34, c * 0.86, c * 0.82, c * 0.06, contorno=cor, largura=w)
    t.caixa(c * 0.38, c * 0.22, c * 0.62, c * 0.34, c * 0.03, contorno=cor, largura=w)
    t.traco([(c * 0.14, c * 0.56), (c * 0.86, c * 0.56)], cor, w * 0.85)
    t.caixa(c * 0.44, c * 0.50, c * 0.56, c * 0.62, c * 0.02, preenchimento=cor)


def clientes(t, c, cor, w):
    t.anel(c * 0.38, c * 0.36, c * 0.13, cor, w)
    t.arco(c * 0.38, c * 0.90, c * 0.28, cor, w, 180, 360)
    t.anel(c * 0.70, c * 0.42, c * 0.10, cor, w)
    t.arco(c * 0.70, c * 0.86, c * 0.22, cor, w, 180, 360)


def financeiro(t, c, cor, w):
    t.traco([(c * 0.22, c * 0.76), (c * 0.78, c * 0.76)], cor, w)
    t.traco([(c * 0.30, c * 0.76), (c * 0.30, c * 0.58)], cor, w)
    t.traco([(c * 0.46, c * 0.76), (c * 0.46, c * 0.44)], cor, w)
    t.traco([(c * 0.62, c * 0.76), (c * 0.62, c * 0.54)], cor, w)
    t.traco([(c * 0.24, c * 0.52), (c * 0.48, c * 0.32), (c * 0.62, c * 0.40), (c * 0.80, c * 0.22)], cor, w * 0.9)
    t.traco([(c * 0.80, c * 0.22), (c * 0.72, c * 0.24)], cor, w * 0.85)
    t.traco([(c * 0.80, c * 0.22), (c * 0.82, c * 0.32)], cor, w * 0.85)


def documentos(t, c, cor, w):
    t.traco([(c * 0.16, c * 0.30), (c * 0.40, c * 0.30), (c * 0.46, c * 0.38), (c * 0.84, c * 0.38)], cor, w)
    t.caixa(c * 0.16, c * 0.30, c * 0.84, c * 0.80, c * 0.05, contorno=cor, largura=w)
    t.traco([(c * 0.30, c * 0.56), (c * 0.70, c * 0.56)], cor, w * 0.85)
    t.traco([(c * 0.30, c * 0.68), (c * 0.58, c * 0.68)], cor, w * 0.85)


def usuarios(t, c, cor, w):
    """Duas pessoas: usuários e permissões."""
    t.anel(c * 0.32, c * 0.32, c * 0.13, cor, w)
    t.arco(c * 0.32, c * 0.84, c * 0.26, cor, w, 180, 360)
    t.anel(c * 0.74, c * 0.38, c * 0.115, cor, w)
    t.arco(c * 0.74, c * 0.86, c * 0.23, cor, w, 180, 360)


def configuracoes(t, c, cor, w):
    """Engrenagem: aro, dentes e eixo."""
    import math as _m
    t.anel(c * 0.50, c * 0.50, c * 0.26, cor, w)
    t.anel(c * 0.50, c * 0.50, c * 0.10, cor, w)
    for i in range(8):
        a = _m.radians(i * 45)
        x0, y0 = c * (0.50 + 0.26 * _m.cos(a)), c * (0.50 + 0.26 * _m.sin(a))
        x1, y1 = c * (0.50 + 0.37 * _m.cos(a)), c * (0.50 + 0.37 * _m.sin(a))
        t.traco([(x0, y0), (x1, y1)], cor, w * 1.7)


def ajuda(t, c, cor, w):
    t.anel(c * 0.50, c * 0.50, c * 0.34, cor, w)
    t.arco(c * 0.50, c * 0.40, c * 0.15, cor, w, 180, 60)
    t.traco([(c * 0.62, c * 0.46), (c * 0.50, c * 0.56), (c * 0.50, c * 0.62)], cor, w)
    t.disco(c * 0.50, c * 0.72, c * 0.04, cor)


def sair(t, c, cor, w):
    t.caixa(c * 0.16, c * 0.22, c * 0.56, c * 0.78, c * 0.04, contorno=cor, largura=w)
    t.traco([(c * 0.44, c * 0.50), (c * 0.84, c * 0.50)], cor, w)
    t.traco([(c * 0.72, c * 0.38), (c * 0.84, c * 0.50), (c * 0.72, c * 0.62)], cor, w)


# ------------------------------------------------------------------ ações
def busca(t, c, cor, w):
    t.anel(c * 0.44, c * 0.42, c * 0.24, cor, w)
    t.traco([(c * 0.62, c * 0.60), (c * 0.82, c * 0.80)], cor, w)


def filtro(t, c, cor, w):
    t.traco([(c * 0.18, c * 0.24), (c * 0.82, c * 0.24), (c * 0.58, c * 0.52), (c * 0.58, c * 0.80), (c * 0.42, c * 0.74), (c * 0.42, c * 0.52), (c * 0.18, c * 0.24)], cor, w)


def editar(t, c, cor, w):
    t.traco([(c * 0.26, c * 0.74), (c * 0.32, c * 0.56), (c * 0.68, c * 0.20), (c * 0.80, c * 0.32), (c * 0.44, c * 0.68), (c * 0.26, c * 0.74)], cor, w)
    t.traco([(c * 0.62, c * 0.26), (c * 0.74, c * 0.38)], cor, w * 0.85)
    t.traco([(c * 0.20, c * 0.84), (c * 0.48, c * 0.84)], cor, w * 0.85)


def excluir(t, c, cor, w):
    t.traco([(c * 0.24, c * 0.30), (c * 0.76, c * 0.30)], cor, w)
    t.traco([(c * 0.40, c * 0.30), (c * 0.42, c * 0.20), (c * 0.58, c * 0.20), (c * 0.60, c * 0.30)], cor, w * 0.9)
    t.traco([(c * 0.30, c * 0.30), (c * 0.34, c * 0.82), (c * 0.66, c * 0.82), (c * 0.70, c * 0.30)], cor, w)
    t.traco([(c * 0.44, c * 0.42), (c * 0.46, c * 0.70)], cor, w * 0.8)
    t.traco([(c * 0.56, c * 0.42), (c * 0.54, c * 0.70)], cor, w * 0.8)


def imprimir(t, c, cor, w):
    t.caixa(c * 0.30, c * 0.16, c * 0.70, c * 0.36, c * 0.03, contorno=cor, largura=w)
    t.caixa(c * 0.16, c * 0.36, c * 0.84, c * 0.66, c * 0.06, contorno=cor, largura=w)
    t.caixa(c * 0.30, c * 0.60, c * 0.70, c * 0.86, c * 0.03, contorno=cor, largura=w)
    t.disco(c * 0.72, c * 0.46, c * 0.035, cor)


def compartilhar(t, c, cor, w):
    t.anel(c * 0.28, c * 0.50, c * 0.12, cor, w)
    t.anel(c * 0.72, c * 0.26, c * 0.12, cor, w)
    t.anel(c * 0.72, c * 0.74, c * 0.12, cor, w)
    t.traco([(c * 0.39, c * 0.44), (c * 0.61, c * 0.32)], cor, w * 0.9)
    t.traco([(c * 0.39, c * 0.56), (c * 0.61, c * 0.68)], cor, w * 0.9)


def sino(t, c, cor, w):
    t.caixa(c * 0.30, c * 0.30, c * 0.70, c * 0.68, c * 0.20, contorno=cor, largura=w)
    t.traco([(c * 0.24, c * 0.68), (c * 0.76, c * 0.68)], cor, w)
    t.arco(c * 0.50, c * 0.72, c * 0.10, cor, w, 0, 180)
    t.traco([(c * 0.50, c * 0.24), (c * 0.50, c * 0.18)], cor, w * 0.8)


def seta_baixo(t, c, cor, w):
    t.traco([(c * 0.32, c * 0.42), (c * 0.50, c * 0.60), (c * 0.68, c * 0.42)], cor, w)


def download(t, c, cor, w):
    t.traco([(c * 0.50, c * 0.16), (c * 0.50, c * 0.58)], cor, w)
    t.traco([(c * 0.34, c * 0.44), (c * 0.50, c * 0.60), (c * 0.66, c * 0.44)], cor, w)
    t.traco([(c * 0.22, c * 0.70), (c * 0.22, c * 0.84), (c * 0.78, c * 0.84), (c * 0.78, c * 0.70)], cor, w)


def atualizar(t, c, cor, w):
    t.arco(c * 0.50, c * 0.50, c * 0.30, cor, w, -60, 200)
    t.poligono([(c * 0.72, c * 0.16), (c * 0.86, c * 0.30), (c * 0.66, c * 0.34)], preenchimento=cor)


# ------------------------------------------------------------------ marca
def marca_escudo(t, c, cor, w, cor_contorno=None):
    """Escudo da marca chapado (usa a silhueta real do logotipo, em escala do canvas)."""
    lado = max(8, int(c * 0.88 * t.ss))
    esc = escudo_simples(lado, preenchimento=cor, contorno=cor_contorno or cor,
                         contorno_px=max(2, int(c * 0.03 * t.ss)), brilho=False, limiar=120)
    t.img.alpha_composite(esc, (int((c * t.ss - esc.width) / 2), int((c * t.ss - esc.height) / 2)))
    return t


def marca_monograma(t, c, cor, w):
    """Monograma GS em Cinzel, centralizado no canvas (escala do canvas)."""
    texto = "GS"
    f = fonte("Cinzel.ttf", int(c * 0.46 * t.ss), "Bold")
    lx = (c * t.ss - largura_texto(texto, f, c * 0.04 * t.ss)) / 2
    t.d.text((lx, c * 0.20 * t.ss), texto, font=f, fill=cor + (255,))
    t.traco([(c * 0.26, c * 0.82), (c * 0.74, c * 0.82)], cor, max(2, c * 0.045 * t.ss))
    return t


# ------------------------------------------------------------------ módulos e gestão
def treinamento(t, c, cor, w):
    """Capelo de formação (cursos e treinamentos)."""
    t.poligono([(c * 0.50, c * 0.14), (c * 0.90, c * 0.34), (c * 0.50, c * 0.54), (c * 0.10, c * 0.34)],
               contorno=cor, largura=w)
    t.traco([(c * 0.26, c * 0.42), (c * 0.26, c * 0.66), (c * 0.50, c * 0.76), (c * 0.74, c * 0.66), (c * 0.74, c * 0.42)],
            cor, w)
    t.traco([(c * 0.88, c * 0.36), (c * 0.88, c * 0.62)], cor, w * 0.8)
    t.disco(c * 0.88, c * 0.67, c * 0.05, cor)
    t.traco([(c * 0.50, c * 0.60), (c * 0.50, c * 0.72)], cor, w * 0.7)


def uniforme(t, c, cor, w):
    """Camisa (uniformes e apresentação)."""
    t.caixa(c * 0.36, c * 0.30, c * 0.64, c * 0.84, c * 0.03, contorno=cor, largura=w)
    t.traco([(c * 0.36, c * 0.34), (c * 0.20, c * 0.44), (c * 0.20, c * 0.80), (c * 0.33, c * 0.80)], cor, w)
    t.traco([(c * 0.64, c * 0.34), (c * 0.80, c * 0.44), (c * 0.80, c * 0.80), (c * 0.67, c * 0.80)], cor, w)
    t.traco([(c * 0.36, c * 0.30), (c * 0.50, c * 0.44), (c * 0.64, c * 0.30)], cor, w)
    t.traco([(c * 0.44, c * 0.56), (c * 0.56, c * 0.56)], cor, w * 0.7)


def ferias(t, c, cor, w):
    """Calendário com sol (férias e ausências)."""
    t.caixa(c * 0.14, c * 0.24, c * 0.66, c * 0.84, c * 0.05, contorno=cor, largura=w)
    t.traco([(c * 0.14, c * 0.40), (c * 0.66, c * 0.40)], cor, w)
    t.traco([(c * 0.26, c * 0.16), (c * 0.26, c * 0.30)], cor, w)
    t.traco([(c * 0.54, c * 0.16), (c * 0.54, c * 0.30)], cor, w)
    t.disco(c * 0.76, c * 0.64, c * 0.13, cor)
    for dx, dy in ((0.0, -0.24), (0.0, 0.24), (-0.24, 0.0), (0.24, 0.0),
                   (-0.17, -0.17), (0.17, -0.17), (-0.17, 0.17), (0.17, 0.17)):
        t.traco([(c * (0.76 + dx * 0.82), c * (0.64 + dy * 0.82)),
                 (c * (0.76 + dx), c * (0.64 + dy))], cor, w * 0.7)


def folha_pagamento(t, c, cor, w):
    """Holerite com cifrão (folha de pagamento)."""
    t.caixa(c * 0.20, c * 0.14, c * 0.72, c * 0.86, c * 0.04, contorno=cor, largura=w)
    t.traco([(c * 0.30, c * 0.30), (c * 0.62, c * 0.30)], cor, w * 0.75)
    t.traco([(c * 0.30, c * 0.42), (c * 0.62, c * 0.42)], cor, w * 0.75)
    t.traco([(c * 0.46, c * 0.50), (c * 0.46, c * 0.80)], cor, w)          # haste do cifrão
    t.arco(c * 0.46, c * 0.61, c * 0.10, cor, w * 0.9, 100, 260)
    t.arco(c * 0.46, c * 0.70, c * 0.10, cor, w * 0.9, -80, 80)


def contas_receber(t, c, cor, w):
    """Documento com seta entrando (contas a receber)."""
    t.caixa(c * 0.12, c * 0.20, c * 0.58, c * 0.84, c * 0.04, contorno=cor, largura=w)
    t.traco([(c * 0.22, c * 0.36), (c * 0.48, c * 0.36)], cor, w * 0.7)
    t.traco([(c * 0.22, c * 0.50), (c * 0.48, c * 0.50)], cor, w * 0.7)
    t.traco([(c * 0.22, c * 0.64), (c * 0.40, c * 0.64)], cor, w * 0.7)
    t.traco([(c * 0.90, c * 0.52), (c * 0.66, c * 0.52)], cor, w)
    t.traco([(c * 0.76, c * 0.40), (c * 0.64, c * 0.52), (c * 0.76, c * 0.64)], cor, w)


def contas_pagar(t, c, cor, w):
    """Documento com seta saindo (contas a pagar)."""
    t.caixa(c * 0.42, c * 0.20, c * 0.88, c * 0.84, c * 0.04, contorno=cor, largura=w)
    t.traco([(c * 0.52, c * 0.36), (c * 0.78, c * 0.36)], cor, w * 0.7)
    t.traco([(c * 0.52, c * 0.50), (c * 0.78, c * 0.50)], cor, w * 0.7)
    t.traco([(c * 0.52, c * 0.64), (c * 0.70, c * 0.64)], cor, w * 0.7)
    t.traco([(c * 0.10, c * 0.52), (c * 0.34, c * 0.52)], cor, w)
    t.traco([(c * 0.24, c * 0.40), (c * 0.36, c * 0.52), (c * 0.24, c * 0.64)], cor, w)


def conciliacao(t, c, cor, w):
    """Extrato com confirmação e setas de troca (conciliação bancária)."""
    t.caixa(c * 0.14, c * 0.20, c * 0.86, c * 0.72, c * 0.05, contorno=cor, largura=w)
    t.traco([(c * 0.14, c * 0.36), (c * 0.86, c * 0.36)], cor, w * 0.7)
    t.traco([(c * 0.24, c * 0.48), (c * 0.44, c * 0.48)], cor, w * 0.7)
    t.traco([(c * 0.24, c * 0.60), (c * 0.40, c * 0.60)], cor, w * 0.7)
    t.traco([(c * 0.60, c * 0.48), (c * 0.70, c * 0.56), (c * 0.86, c * 0.40)], cor, w * 0.9)
    t.traco([(c * 0.24, c * 0.88), (c * 0.76, c * 0.88)], cor, w * 0.7)
    t.traco([(c * 0.66, c * 0.80), (c * 0.78, c * 0.88), (c * 0.66, c * 0.96)], cor, w * 0.7)


def orcamento(t, c, cor, w):
    """Alvo atingido por uma seta (metas e orçamento)."""
    t.anel(c * 0.52, c * 0.46, c * 0.34, cor, w)
    t.anel(c * 0.52, c * 0.46, c * 0.19, cor, w * 0.85)
    t.disco(c * 0.52, c * 0.46, c * 0.05, cor)
    t.traco([(c * 0.10, c * 0.90), (c * 0.38, c * 0.62)], cor, w)
    t.traco([(c * 0.30, c * 0.86), (c * 0.10, c * 0.90), (c * 0.14, c * 0.70)], cor, w * 0.9)


def assistente_ia(t, c, cor, w):
    """Balão de conversa com brilhos (assistente de IA)."""
    t.caixa(c * 0.14, c * 0.24, c * 0.72, c * 0.70, c * 0.12, contorno=cor, largura=w)
    t.traco([(c * 0.30, c * 0.70), (c * 0.26, c * 0.86), (c * 0.45, c * 0.72)], cor, w)
    t.traco([(c * 0.36, c * 0.42), (c * 0.36, c * 0.56)], cor, w * 0.75)
    t.traco([(c * 0.30, c * 0.49), (c * 0.42, c * 0.49)], cor, w * 0.75)
    t.poligono([(c * 0.78, c * 0.30), (c * 0.85, c * 0.50), (c * 0.78, c * 0.70), (c * 0.71, c * 0.50)],
               preenchimento=cor)
    t.poligono([(c * 0.88, c * 0.14), (c * 0.92, c * 0.24), (c * 0.88, c * 0.34), (c * 0.84, c * 0.24)],
               preenchimento=cor)


def indicadores(t, c, cor, w):
    """Velocímetro de indicadores (painéis e acompanhamento)."""
    import math as _m
    t.arco(c * 0.50, c * 0.66, c * 0.34, cor, w, 180, 360)
    for grau in (200, 225, 250, 270, 290, 315, 340):
        a = _m.radians(grau)
        r0, r1 = c * 0.34, c * 0.26
        t.traco([(c * 0.50 + r0 * _m.cos(a), c * 0.66 + r0 * _m.sin(a)),
                 (c * 0.50 + r1 * _m.cos(a), c * 0.66 + r1 * _m.sin(a))], cor, w * 0.55)
    t.traco([(c * 0.50, c * 0.66), (c * 0.70, c * 0.42)], cor, w * 1.1)
    t.disco(c * 0.50, c * 0.66, c * 0.055, cor)
    t.traco([(c * 0.30, c * 0.84), (c * 0.70, c * 0.84)], cor, w * 0.7)


# ------------------------------------------------------------------ glifos de status
def check(t, c, cor, w):
    t.traco([(c * 0.22, c * 0.54), (c * 0.42, c * 0.72), (c * 0.80, c * 0.28)], cor, w * 1.15)


def check_duplo(t, c, cor, w):
    t.traco([(c * 0.14, c * 0.54), (c * 0.32, c * 0.72), (c * 0.58, c * 0.40)], cor, w * 1.05)
    t.traco([(c * 0.46, c * 0.72), (c * 0.88, c * 0.26)], cor, w * 1.05)


def xis(t, c, cor, w):
    t.traco([(c * 0.26, c * 0.26), (c * 0.74, c * 0.74)], cor, w * 1.15)
    t.traco([(c * 0.74, c * 0.26), (c * 0.26, c * 0.74)], cor, w * 1.15)


def ampulheta(t, c, cor, w):
    t.traco([(c * 0.26, c * 0.16), (c * 0.74, c * 0.16)], cor, w)
    t.traco([(c * 0.26, c * 0.84), (c * 0.74, c * 0.84)], cor, w)
    t.traco([(c * 0.32, c * 0.16), (c * 0.32, c * 0.34), (c * 0.50, c * 0.50),
             (c * 0.68, c * 0.34), (c * 0.68, c * 0.16)], cor, w)
    t.traco([(c * 0.32, c * 0.84), (c * 0.32, c * 0.66), (c * 0.50, c * 0.50),
             (c * 0.68, c * 0.66), (c * 0.68, c * 0.84)], cor, w)


def relogio(t, c, cor, w):
    t.anel(c * 0.50, c * 0.50, c * 0.34, cor, w)
    t.traco([(c * 0.50, c * 0.50), (c * 0.50, c * 0.28)], cor, w)
    t.traco([(c * 0.50, c * 0.50), (c * 0.68, c * 0.58)], cor, w)
    t.disco(c * 0.50, c * 0.50, c * 0.045, cor)


def pausa(t, c, cor, w):
    t.caixa(c * 0.28, c * 0.24, c * 0.42, c * 0.76, c * 0.05, contorno=cor, largura=w)
    t.caixa(c * 0.58, c * 0.24, c * 0.72, c * 0.76, c * 0.05, contorno=cor, largura=w)


def raio(t, c, cor, w):
    t.poligono([(c * 0.56, c * 0.12), (c * 0.28, c * 0.56), (c * 0.46, c * 0.56),
                (c * 0.40, c * 0.88), (c * 0.72, c * 0.44), (c * 0.52, c * 0.44)], contorno=cor, largura=w)


def cadeado(t, c, cor, w):
    t.caixa(c * 0.24, c * 0.46, c * 0.76, c * 0.84, c * 0.06, contorno=cor, largura=w)
    t.arco(c * 0.50, c * 0.46, c * 0.16, cor, w, 180, 360)
    t.disco(c * 0.50, c * 0.62, c * 0.05, cor)
    t.traco([(c * 0.50, c * 0.62), (c * 0.50, c * 0.74)], cor, w * 0.8)


GLIFOS = {
    # serviços
    "portaria": portaria, "ronda": ronda, "cftv": cftv, "alarme": alarme, "monitoramento": monitoramento,
    "escolta": escolta, "controle-acesso": controle_acesso, "zeladoria": zeladoria, "limpeza": limpeza,
    "jardinagem": jardinagem,
    # operação
    "ocorrencia": ocorrencia, "escala": escala, "ponto": ponto, "checklist": checklist, "chaves": chaves,
    "cracha": cracha, "relatorio": relatorio, "contrato": contrato, "vistoria": vistoria, "comunicacao": comunicacao,
    # navegação
    "inicio": inicio, "painel": painel, "servicos": servicos, "clientes": clientes, "financeiro": financeiro,
    "documentos": documentos, "usuarios": usuarios, "configuracoes": configuracoes, "ajuda": ajuda, "sair": sair,
    # ações
    "busca": busca, "filtro": filtro, "editar": editar, "excluir": excluir, "imprimir": imprimir,
    "compartilhar": compartilhar, "sino": sino, "seta-baixo": seta_baixo, "download": download, "atualizar": atualizar,
    # módulos e gestão
    "treinamento": treinamento, "uniforme": uniforme, "ferias": ferias, "folha-pagamento": folha_pagamento,
    "contas-receber": contas_receber, "contas-pagar": contas_pagar, "conciliacao": conciliacao,
    "orcamento": orcamento, "assistente-ia": assistente_ia, "indicadores": indicadores,
    # status (glifos usados dentro dos selos coloridos)
    "check": check, "check-duplo": check_duplo, "xis": xis, "ampulheta": ampulheta, "relogio": relogio,
    "pausa": pausa, "raio": raio, "cadeado": cadeado,
    # marca
    "escudo": marca_escudo, "monograma": marca_monograma,
}

ROTULOS = {
    "portaria": "Portaria e guarita", "ronda": "Ronda e rota", "cftv": "CFTV e câmeras",
    "alarme": "Alarme e sirene", "monitoramento": "Monitoramento em tela", "escolta": "Escolta e supervisão",
    "controle-acesso": "Controle de acesso e cartão", "zeladoria": "Zeladoria e manutenção",
    "limpeza": "Limpeza e conservação", "jardinagem": "Jardinagem e áreas verdes",
    "ocorrencia": "Ocorrência", "escala": "Escala de trabalho", "ponto": "Registro de ponto",
    "checklist": "Checklist de ronda", "chaves": "Controle de chaves", "cracha": "Crachá e identificação",
    "relatorio": "Relatório e indicadores", "contrato": "Contrato e assinatura", "vistoria": "Vistoria e inspeção",
    "comunicacao": "Comunicação e rádio", "inicio": "Início", "painel": "Painel e dashboard",
    "servicos": "Serviços", "clientes": "Clientes", "financeiro": "Financeiro", "documentos": "Documentos",
    "usuarios": "Usuários e permissões", "configuracoes": "Configurações", "ajuda": "Ajuda e suporte",
    "sair": "Sair", "busca": "Buscar", "filtro": "Filtrar", "editar": "Editar", "excluir": "Excluir",
    "imprimir": "Imprimir", "compartilhar": "Compartilhar", "sino": "Notificações", "seta-baixo": "Expandir",
    "download": "Baixar", "atualizar": "Atualizar", "escudo": "Escudo da marca",
    "monograma": "Monograma GS", "treinamento": "Treinamento e cursos", "uniforme": "Uniformes",
    "ferias": "Férias e ausências", "folha-pagamento": "Folha de pagamento", "contas-receber": "Contas a receber",
    "contas-pagar": "Contas a pagar", "conciliacao": "Conciliação bancária", "orcamento": "Metas e orçamento",
    "assistente-ia": "Assistente de IA", "indicadores": "Indicadores e painéis", "check": "Confirmado",
    "check-duplo": "Concluído", "xis": "Cancelado", "ampulheta": "Pendente", "relogio": "Atrasado",
    "pausa": "Aguardando", "raio": "Urgente", "cadeado": "Bloqueado",
}


def desenhar_glifo(nome, lado, cor, traco, folga=0.10):
    """Ícone em PNG RGBA: glifo centralizado em um quadrado de `lado` px.

    O desenho acontece em um canvas com superamostragem 4x e é reduzido no fim,
    garantindo traços suaves. `folga` é a margem relativa em volta do glifo.
    """
    t = Tela(lado, lado)
    glifo = GLIFOS[nome]
    if nome in ("escudo", "monograma"):
        glifo(t, lado, cor, traco)
        return t.resultado()
    interno = lado * (1 - 2 * folga)
    sub = Tela(int(interno), int(interno))
    glifo(sub, interno, cor, traco)
    off = int(lado * folga) * t.ss
    t.img.alpha_composite(sub.img, (off, off))
    return t.resultado()


def gerar_icones(nomes, pasta, cor, traco, tamanhos=(256, 64), extra_64=False):
    """Grava os PNGs de um lote de ícones (256 px e, opcionalmente, 64 px).

    Cada lote tem 10 ícones; as versões de 64 px são derivadas para menus e atalhos.
    """
    pasta = Path(pasta)
    itens = []
    for i, nome in enumerate(nomes, 1):
        for lado in tamanhos:
            escala = max(1, round(lado / 256))
            img = desenhar_glifo(nome, lado, cor, traco * escala)
            caminho = pasta / f"icone-{i:02d}-{nome}-{lado}.png"
            itens.append((caminho.name, salvar_png(img, caminho)))
    return itens


# ------------------------------------------------------------------ selos de status
CORES_STATUS = {
    "aprovado": (32, 122, 90),
    "pendente": (176, 124, 32),
    "atrasado": (168, 52, 52),
    "em-analise": (28, 86, 150),
    "concluido": (24, 96, 72),
    "cancelado": (140, 152, 166),
    "em-execucao": (40, 104, 168),
    "aguardando": (120, 132, 148),
    "urgente": (196, 84, 40),
    "bloqueado": (96, 108, 124),
}

GLIFO_STATUS = {
    "aprovado": "check",
    "pendente": "ampulheta",
    "atrasado": "relogio",
    "em-analise": "busca",
    "concluido": "check-duplo",
    "cancelado": "xis",
    "em-execucao": "configuracoes",
    "aguardando": "pausa",
    "urgente": "raio",
    "bloqueado": "cadeado",
}


def selo_status(nome, lado, cor=None, glifo=None, anel=True):
    """Selo circular colorido com o glifo branco dentro (status de registro na interface)."""
    cor = cor or CORES_STATUS[nome]
    glifo = glifo or GLIFO_STATUS[nome]
    t = Tela(lado, lado)
    r = lado / 2
    t.disco(r, r, r - 1, cor)
    base = t.resultado()

    luz = gradiente_vertical(lado, lado, [(0, .24), (.5, 0), (1, .12)], BRANCO)
    luz.putalpha(Image.composite(luz.getchannel("A"), Image.new("L", (lado, lado), 0), base.getchannel("A")))
    base.alpha_composite(luz)

    if anel:
        t2 = Tela(lado, lado)
        t2.anel(r, r, r - max(2, lado * 0.05), BRANCO, max(1, int(lado * 0.018)))
        anel_img = t2.resultado()
        anel_img.putalpha(anel_img.getchannel("A").point(lambda v: int(v * 0.5)))
        base.alpha_composite(anel_img)

    glifo_img = desenhar_glifo(glifo, int(lado * 0.60), BRANCO, max(2, lado * 0.035), folga=0.02)
    base.alpha_composite(glifo_img, (int((lado - glifo_img.width) / 2), int((lado - glifo_img.height) / 2)))
    return base

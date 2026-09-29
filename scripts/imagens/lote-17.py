"""Lote 17 — 10 banners/hero para o site (1600×600).

Peças de página inicial e internas: título grande, logotipo (recorte real da marca), fio dourado e
tagline. Botões e ícones continuam por conta do CSS/PNG de interface — o banner não embute CTA.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-17.py
Saída: public/site/hero/*.jpg
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import desenhar_glifo

PLACAS_A = RAIZ / "design/email/fundos/lote-01"
PLACAS_B = RAIZ / "design/email/fundos/lote-16"
ICONES = RAIZ / "public/ui/icones/servicos-reverso"
SAIDA = RAIZ / "public/site/hero"
LW, LH = 1600, 600
logos = carregar_logos()
GERADOS = []


def placa(origem, nome, foco=(0.5, 0.5), espelhar=False):
    pasta = PLACAS_A if origem == "a" else PLACAS_B
    im = Image.open(pasta / f"{nome}.jpg")
    if espelhar:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return cobrir(im, LW, LH, foco)


def salvar(nome, img, qualidade=86):
    GERADOS.append((nome, salvar_jpg(img, SAIDA / nome, qualidade)))


def escurecer_lateral(img, pontos, cor=MARINHO):
    img.alpha_composite(gradiente_horizontal(LW, LH, pontos, cor))
    img.alpha_composite(gradiente_vertical(LW, LH, [(0, .22), (.5, 0), (1, .28)]))


def titulo(img, x, y, linhas, cor=BRANCO, tam_max=58, disp=1000, tracking=2, ancora="l", sombra=7):
    tam = tam_max
    while tam > 30 and max(largura_texto(l, fonte("Cinzel.ttf", tam, "Bold"), tracking) for l in linhas) > disp:
        tam -= 2
    f = fonte("Cinzel.ttf", tam, "Bold")
    for i, l in enumerate(linhas):
        desenhar_texto(img, x, y + i * int(tam * 1.26), l, f, cor, tracking, ancora, sombra=sombra)
    yf = y + int(tam * 1.26) * len(linhas)
    x0 = x - 80 if ancora == "r" else (x - 40 if ancora == "c" else x)
    divisor_horizontal(img, x0, x0 + 80, yf + 10, cor=OURO, alfa=255, largura=4)
    return yf + 10


def rodape_fio(img, cor=OURO):
    """Fio dourado de 6 px na base, fechando a peça como nas artes de e-mail."""
    faixa_dourada(img, LH - 6, 6)


def faixa_info(img, itens, y=None):
    """Faixa inferior com três blocos de apoio (sem dados de contato — só mensagem de marca)."""
    y = y or LH - 96
    x = 84
    for titulo_item, texto in itens:
        desenhar_texto(img, x, y, titulo_item, fonte("Cinzel.ttf", 22, "Bold"), OURO_CLARO, 3, sombra=4)
        desenhar_texto(img, x, y + 34, texto, fonte("Cinzel.ttf", 17, "Regular"), (214, 224, 236), 2, sombra=3)
        x += 460
    return y


def pastilha_icone(img, nome, x, y, lado=132, cor_traco=BRANCO, anel=OURO):
    """Ícone branco dentro de um círculo com anel dourado (apoio visual em banners)."""
    t = Tela(lado, lado)
    t.disco(lado / 2, lado / 2, lado / 2 - 2, MARINHO)
    base = t.resultado()
    base.putalpha(base.getchannel("A").point(lambda v: int(v * 0.72)))
    t2 = Tela(lado, lado)
    t2.anel(lado / 2, lado / 2, lado / 2 - 4, anel, 3)
    base.alpha_composite(t2.resultado())
    icone = Image.open(ICONES / f"icone-{nome}-256.png").convert("RGBA")
    escala = int(lado * 0.56)
    icone = icone.resize((escala, escala), Image.LANCZOS)
    arr = np.asarray(icone).copy()
    arr[..., 0], arr[..., 1], arr[..., 2] = cor_traco
    icone = Image.fromarray(arr, "RGBA")
    base.alpha_composite(icone, (int((lado - escala) / 2), int((lado - escala) / 2)))
    img.alpha_composite(base, (int(x), int(y)))
    return lado


if __name__ == "__main__":
    # 01 — painel navy à esquerda (institucional)
    img = placa("a", "h01", (0.55, 0.5))
    escurecer_lateral(img, [(0, .985), (.44, .95), (.62, .40), (1, .04)])
    logo = redimensionar_altura(logos["logo-reverso"], 232)
    colar(img, logo, 84, 96)
    y = titulo(img, 84, 372, ["SEGURANÇA QUE FAZ"], disp=900)
    linha_tagline(img, 84, y + 26, fonte("Cinzel.ttf", 24, "Bold"), OURO_CLARO, OURO, 4, sombra=4)
    rodape_fio(img)
    salvar("hero-01-institucional.jpg", img)

    # 02 — central de monitoramento, título grande à esquerda
    img = placa("a", "h02", (0.52, 0.45))
    escurecer_lateral(img, [(0, .98), (.48, .90), (.70, .34), (1, .06)])
    logo = redimensionar_altura(logos["logo-reverso"], 200)
    colar(img, logo, 84, 76)
    y = titulo(img, 84, 300, ["MONITORAMENTO", "24 HORAS"], disp=760, tam_max=54)
    faixa_info(img, [("IMAGEM AO VIVO", "câmeras e gravação"), ("CENTRAL PRÓPRIA", "equipe 24 horas"),
                     ("RESPOSTA", "acionamento imediato")], y=486)
    rodape_fio(img)
    salvar("hero-02-monitoramento.jpg", img)

    # 03 — condomínios, selo à esquerda
    img = placa("b", "n02", (0.45, 0.55))
    escurecer_lateral(img, [(0, .96), (.42, .88), (.66, .30), (1, .05)])
    selo = selo_circular(230, 106)
    colar(img, selo, 84, 108)
    y = titulo(img, 84, 366, ["CONDOMÍNIOS", "E ÁREAS COMUNS"], disp=820, tam_max=50)
    rodape_fio(img)
    salvar("hero-03-condominios.jpg", img)

    # 04 — logística e portos, painel à direita (espelhado)
    img = placa("b", "n08", (0.42, 0.5), espelhar=True)
    escurecer_lateral(img, [(0, .05), (.36, .38), (.60, .92), (1, .985)])
    logo = redimensionar_altura(logos["logo-reverso"], 214)
    colar(img, logo, LW - 84 - logo.width, 96)
    y = titulo(img, LW - 84, 372, ["LOGÍSTICA E PORTOS"], disp=780, ancora="r")
    linha_tagline(img, LW - 84, y + 26, fonte("Cinzel.ttf", 23, "Bold"), OURO_CLARO, OURO, 4, "r", sombra=4)
    rodape_fio(img)
    salvar("hero-04-logistica-portos.jpg", img)

    # 05 — tecnologia, grade técnica + monograma
    img = placa("b", "n03", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, LH, [(0, .92), (.46, .82), (.72, .30), (1, .06)]))
    grade_fina(img, 64, BRANCO, 16)
    monograma = desenhar_glifo("monograma", 168, OURO, 8)
    colar(img, monograma, 84, 92)
    y = titulo(img, 84, 300, ["TECNOLOGIA EM", "SEGURANÇA"], disp=820, tam_max=56)
    faixa_info(img, [("CFTV", "câmeras e gravação"), ("ALARME", "sensores e sirene"),
                     ("ACESSO", "catracas e portas")], y=470)
    rodape_fio(img)
    salvar("hero-05-tecnologia.jpg", img)

    # 06 — acesso corporativo, título à direita sobre foto
    img = placa("b", "n07", (0.45, 0.5))
    escurecer_lateral(img, [(0, .10), (.40, .55), (.66, .93), (1, .99)])
    logo = redimensionar_altura(logos["logo-reverso"], 226)
    colar(img, logo, LW - 84 - logo.width, 100)
    y = titulo(img, LW - 84, 380, ["ACESSO CORPORATIVO"], disp=860, ancora="r", tam_max=52)
    linha_tagline(img, LW - 84, y + 26, fonte("Cinzel.ttf", 22, "Bold"), OURO_CLARO, OURO, 4, "r", sombra=4)
    rodape_fio(img)
    salvar("hero-06-acesso-corporativo.jpg", img)

    # 07 — perímetro monitorado (bokeh de chuva), centralizado com marcos
    img = placa("b", "n06", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, LH, [(0, .80), (.5, .72), (1, .80)]))
    esc = redimensionar_altura(logos["escudo-reverso"], 150)
    colar(img, esc, (LW - esc.width) // 2, 74)
    tam = 56
    f = fonte("Cinzel.ttf", tam, "Bold")
    desenhar_texto(img, LW // 2, 258, "PERÍMETRO MONITORADO", f, BRANCO, 3, "c", sombra=9)
    divisor_horizontal(img, LW // 2 - 60, LW // 2 + 60, 340, cor=OURO, alfa=255, largura=4)
    linha_tagline(img, LW // 2, 366, fonte("Cinzel.ttf", 24, "Bold"), OURO_CLARO, OURO, 5, "c", sombra=6)
    marco_cantos(img, 48, 36, LW - 48, LH - 48, 36, OURO, 3, 200)
    rodape_fio(img)
    salvar("hero-07-perimetro-monitorado.jpg", img)

    # 08 — vigilância noturna, logo pequeno e título central à direita
    img = placa("b", "n01", (0.62, 0.5))
    escurecer_lateral(img, [(0, .97), (.40, .90), (.64, .38), (1, .08)])
    logo = redimensionar_altura(logos["logo-reverso"], 190)
    colar(img, logo, 84, 88)
    y = titulo(img, 84, 330, ["VIGILÂNCIA", "NOTURNA"], disp=700, tam_max=60)
    divisor_horizontal(img, 84, 84 + 200, y + 30, cor=OURO_CLARO, alfa=180, largura=2)
    desenhar_texto(img, 84, y + 52, "presença em todos os turnos", fonte("CormorantItalic.ttf", 34, "SemiBold Italic"),
                   (216, 226, 238), 0, sombra=4)
    rodape_fio(img)
    salvar("hero-08-vigilancia-noturna.jpg", img)

    # 09 — cobertura e rotas com pastilhas de ícone
    img = placa("b", "n09", (0.5, 0.5))
    img.alpha_composite(gradiente_horizontal(LW, LH, [(0, .93), (.48, .86), (.76, .42), (1, .12)]))
    grade_fina(img, 56, BRANCO, 14)
    logo = redimensionar_altura(logos["logo-reverso"], 200)
    colar(img, logo, 84, 78)
    y = titulo(img, 84, 306, ["COBERTURA E ROTAS"], disp=900, tam_max=56)
    for i, nome in enumerate(("01-portaria", "02-ronda", "03-cftv")):
        pastilha_icone(img, nome, 84 + i * 156, y + 40, 132)
    desenhar_texto(img, 84 + 3 * 156 + 16, y + 96, "portaria, ronda e CFTV no mesmo plano",
                   fonte("Cinzel.ttf", 20, "Regular"), OURO_CLARO, 3, sombra=4)
    rodape_fio(img)
    salvar("hero-09-cobertura-rotas.jpg", img)

    # 10 — vigilância ativa, selo central sobre serra
    img = placa("b", "n10", (0.5, 0.5))
    img.alpha_composite(gradiente_vertical(LW, LH, [(0, .62), (.35, .42), (.62, .30), (1, .78)]))
    selo = selo_circular(210, 98)
    colar(img, selo, (LW - selo.width) // 2, 66)
    f = fonte("Cinzel.ttf", 60, "Bold")
    desenhar_texto(img, LW // 2, 322, "VIGILÂNCIA ATIVA", f, BRANCO, 4, "c", sombra=10)
    divisor_horizontal(img, LW // 2 - 70, LW // 2 + 70, 412, cor=OURO, alfa=255, largura=4)
    linha_tagline(img, LW // 2, 440, fonte("Cinzel.ttf", 24, "Bold"), OURO_CLARO, OURO, 5, "c", sombra=6)
    rodape_fio(img)
    salvar("hero-10-vigilancia-ativa.jpg", img)

    for nome, tam in GERADOS:
        print(f"{nome:42s} {tam/1024:6.0f} KB")

"""Lote 22 — 10 thumbnails de serviço para os cards do site (800×500).

Cada peça combina placa fotográfica, ícone de serviço em pastilha, título e linha de apoio.
Sem endereço, telefone ou preço: esses dados ficam no HTML/CSS.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-22.py
Saída: public/site/servicos/*.jpg
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import desenhar_glifo

PLACAS_A = RAIZ / "design/email/fundos/lote-01"
PLACAS_B = RAIZ / "design/email/fundos/lote-16"
SAIDA = RAIZ / "public/site/servicos"
LW, LH = 800, 500
GERADOS = []


def placa(origem, nome, foco=(0.5, 0.5)):
    pasta = PLACAS_A if origem == "a" else PLACAS_B
    return cobrir(Image.open(pasta / f"{nome}.jpg"), LW, LH, foco)


def salvar(nome, img, qualidade=87):
    GERADOS.append((nome, salvar_jpg(img, SAIDA / nome, qualidade)))


def escurecer_base(img, topo=0.10, base=0.86):
    img.alpha_composite(gradiente_vertical(LW, LH, [(0, topo), (.45, .18), (.72, .55), (1, base)]))
    img.alpha_composite(gradiente_horizontal(LW, LH, [(0, .22), (.5, .10), (1, .22)]))


def pastilha(img, glifo, x, y, lado=104, cor_glifo=BRANCO):
    t = Tela(lado, lado)
    t.disco(lado / 2, lado / 2, lado / 2 - 2, MARINHO)
    base = t.resultado()
    base.putalpha(base.getchannel("A").point(lambda v: int(v * 0.80)))
    t2 = Tela(lado, lado)
    t2.anel(lado / 2, lado / 2, lado / 2 - 3, OURO, 3)
    base.alpha_composite(t2.resultado())
    icone = desenhar_glifo(glifo, int(lado * 0.58), cor_glifo, 8, folga=0.02)
    base.alpha_composite(icone, (int((lado - icone.width) / 2), int((lado - icone.height) / 2)))
    img.alpha_composite(base, (int(x), int(y)))


def card(nome_arquivo, origem, placa_nome, glifo, titulo, apoio, foco=(0.5, 0.5), claro=False):
    img = placa(origem, placa_nome, foco)
    if claro:
        img.alpha_composite(gradiente_vertical(LW, LH, [(0, .16), (.45, .10), (1, .30)]))
        img.alpha_composite(gradiente_horizontal(LW, LH, [(0, .34), (.5, .22), (1, .34)], BRANCO))
        img.alpha_composite(gradiente_vertical(LW, LH, [(0, .20), (.54, .62), (1, .88)], BRANCO))  # faixa clara do texto
        cor_t, cor_a = MARINHO, (58, 74, 92)
    else:
        escurecer_base(img)
        cor_t, cor_a = BRANCO, (216, 226, 238)

    pastilha(img, glifo, 48, 44, cor_glifo=MARINHO if claro else BRANCO)
    desenhar_texto(img, 48, 340, titulo, fonte("Cinzel.ttf", 38, "Bold"), cor_t, 2, sombra=0 if claro else 6)
    divisor_horizontal(img, 48, 48 + 78, 392, cor=OURO, alfa=255, largura=3)
    desenhar_texto(img, 48, 410, apoio, fonte("Cinzel.ttf", 19, "Regular"), cor_a, 3, sombra=0 if claro else 4)
    faixa_dourada(img, LH - 5, 5)
    salvar(nome_arquivo, img)


if __name__ == "__main__":
    card("servico-01-monitoramento.jpg", "a", "h02", "monitoramento",
         "MONITORAMENTO 24H", "imagem ao vivo e gravação", foco=(0.5, 0.45))
    card("servico-02-portaria.jpg", "a", "h03", "portaria",
         "PORTARIA E ACESSO", "guarita, catraca e identificação", foco=(0.5, 0.6))
    card("servico-03-ronda.jpg", "b", "n01", "ronda",
         "RONDA E SUPERVISÃO", "rotas registradas ponto a ponto", foco=(0.6, 0.5))
    card("servico-04-cftv.jpg", "b", "n05", "cftv",
         "CFTV E CÂMERAS", "projeto, instalação e manutenção", foco=(0.55, 0.55))
    card("servico-05-acesso.jpg", "b", "n07", "controle-acesso",
         "CONTROLE DE ACESSO", "portas, catracas e biometria", foco=(0.55, 0.5))
    card("servico-06-escolta.jpg", "a", "h04", "escolta",
         "ESCOLTA E VIATURA", "supervisão motorizada", foco=(0.5, 0.72))
    card("servico-07-condominios.jpg", "b", "n02", "clientes",
         "CONDOMÍNIOS", "portaria, zeladoria e áreas comuns", foco=(0.45, 0.55))
    card("servico-08-industria.jpg", "b", "n08", "servicos",
         "INDÚSTRIA E LOGÍSTICA", "perímetro, docas e acesso de veículos", foco=(0.55, 0.5))
    card("servico-09-tecnologia.jpg", "b", "n03", "assistente-ia",
         "TECNOLOGIA E DADOS", "indicadores e relatórios do contrato", foco=(0.5, 0.5))
    card("servico-10-zeladoria.jpg", "a", "h05", "zeladoria",
         "ZELADORIA E CONSERVAÇÃO", "limpeza, jardim e manutenção", foco=(0.5, 0.5), claro=True)

    for nome, tam in GERADOS:
        print(f"{nome:34s} {tam/1024:6.0f} KB")

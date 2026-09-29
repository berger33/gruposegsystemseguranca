"""Lote 14 — 10 peças de marca (escudo, monograma, medalhão e favicon).

Usa o recorte real do logotipo (public/brand/logo/escudo-marinho.png) e a fonte OFL
Cinzel — nenhum elemento de marca é gerado por IA.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-14.py
Saída: public/ui/icones/marca/*.png
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import desenhar_glifo

SAIDA = RAIZ / "public/ui/icones/marca"
GERADOS = []


def salvar(nome, img):
    GERADOS.append((nome, salvar_png(img, SAIDA / nome), img.size))


if __name__ == "__main__":
    # escudos (silhueta real do logotipo, recolorida)
    salvar("icone-marca-01-escudo-marinho-256.png",
           escudo_simples(256, preenchimento=MARINHO, contorno=OURO, contorno_px=10, brilho=True))
    salvar("icone-marca-02-escudo-branco-256.png",
           escudo_simples(256, preenchimento=BRANCO, contorno=OURO, contorno_px=10, brilho=False))
    salvar("icone-marca-03-escudo-dourado-256.png",
           escudo_simples(256, preenchimento=OURO, contorno=OURO_ESCURO, contorno_px=9, brilho=True))
    salvar("icone-marca-04-escudo-navy-chapado-256.png",
           escudo_simples(256, preenchimento=MARINHO, contorno=MARINHO, contorno_px=0, brilho=False, limiar=110))

    # monogramas GS (Cinzel, fonte OFL)
    salvar("icone-marca-05-monograma-marinho-256.png", desenhar_glifo("monograma", 256, MARINHO, 8))
    salvar("icone-marca-06-monograma-branco-256.png", desenhar_glifo("monograma", 256, BRANCO, 8))
    salvar("icone-marca-07-monograma-dourado-256.png", desenhar_glifo("monograma", 256, OURO, 8))

    # medalhões (disco marinho + anel dourado + escudo branco ao centro)
    salvar("icone-marca-08-medalhao-512.png", selo_circular(512, 224))
    salvar("icone-marca-09-medalhao-256.png", selo_circular(256, 112))

    # favicon / atalho de aplicativo
    salvar("icone-marca-10-favicon-escudo-64.png",
           escudo_simples(64, preenchimento=MARINHO, contorno=OURO, contorno_px=3, brilho=False))

    for nome, tam, dim in GERADOS:
        print(f"{nome:46s} {str(dim):12s} {tam/1024:6.1f} KB")

"""Lote 15 — 10 ícones de ação e status (traço marinho, 256 px + derivados 64 px).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-15.py
Saída: public/ui/icones/acoes/*.png
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import gerar_icones, ROTULOS

SAIDA = RAIZ / "public/ui/icones/acoes"
COR, TRACO = MARINHO, 9

NOMES = [
    "busca", "filtro", "editar", "excluir", "imprimir",
    "compartilhar", "sino", "download", "atualizar", "seta-baixo",
]

if __name__ == "__main__":
    itens = gerar_icones(NOMES, SAIDA, COR, TRACO, tamanhos=(256, 64))
    for nome, tam in itens:
        print(f"{nome:46s} {tam/1024:5.1f} KB")
    print(f"{len(itens)} arquivos")

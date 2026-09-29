"""Lote 21 — 10 ícones de navegação em dourado (barra lateral navy e cabeçalhos escuros).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-21.py
Saída: public/ui/icones/navegacao-dourado/*.png
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import gerar_icones

SAIDA = RAIZ / "public/ui/icones/navegacao-dourado"
COR, TRACO = OURO_CLARO, 9

NOMES = [
    "inicio", "painel", "servicos", "clientes", "financeiro",
    "documentos", "usuarios", "configuracoes", "ajuda", "sair",
]

if __name__ == "__main__":
    itens = gerar_icones(NOMES, SAIDA, COR, TRACO, tamanhos=(256, 64))
    for nome, tam in itens:
        print(f"{nome:44s} {tam/1024:5.1f} KB")
    print(f"{len(itens)} arquivos")

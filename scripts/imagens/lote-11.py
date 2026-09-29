"""Lote 11 — 10 ícones de serviço — versão reversa (branco, fundo escuro).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-11.py
Saída: public/ui/icones/ (PNG RGBA 256 px, sem texto embutido)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import gerar_icones, desenhar_glifo, ROTULOS

SAIDA = RAIZ / "public/ui/icones/servicos-reverso"
COR, TRACO = BRANCO, 9

NOMES = [
    "portaria",
    "ronda",
    "cftv",
    "alarme",
    "monitoramento",
    "escolta",
    "controle-acesso",
    "zeladoria",
    "limpeza",
    "jardinagem",
]

if __name__ == "__main__":
    itens = gerar_icones(NOMES, SAIDA, COR, TRACO, tamanhos=(256, 64))
    for nome, tam in itens:
        print(f"{nome:44s} {tam/1024:5.1f} KB")
    print(f"{len(itens)} arquivos — variante marinho")

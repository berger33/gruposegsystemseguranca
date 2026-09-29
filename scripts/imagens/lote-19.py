"""Lote 19 — 10 ícones de módulos e gestão (reverso branco, para fundo escuro).

Treinamento, uniformes, férias, folha de pagamento, contas a receber, contas a pagar,
conciliação bancária, metas/orçamento, assistente de IA e indicadores.

Uso:  /tmp/venv/bin/python scripts/imagens/lote-19.py
Saída: public/ui/icones/modulos-reverso/*.png
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import gerar_icones

SAIDA = RAIZ / "public/ui/icones/modulos-reverso"
COR, TRACO = BRANCO, 9

NOMES = [
    "treinamento", "uniforme", "ferias", "folha-pagamento", "contas-receber",
    "contas-pagar", "conciliacao", "orcamento", "assistente-ia", "indicadores",
]

if __name__ == "__main__":
    itens = gerar_icones(NOMES, SAIDA, COR, TRACO, tamanhos=(256, 64))
    for nome, tam in itens:
        print(f"{nome:46s} {tam/1024:5.1f} KB")
    print(f"{len(itens)} arquivos")

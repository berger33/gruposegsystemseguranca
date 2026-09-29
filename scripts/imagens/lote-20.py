"""Lote 20 — 10 selos de status coloridos (256 px + 64 px).

Aprovado, pendente, atrasado, em análise, concluído, cancelado, em execução, aguardando,
urgente e bloqueado. Cores calibradas para leitura sobre fundo claro e escuro; o glifo interno
usa os ícones de traço (não há texto embutido).

Uso:  /tmp/venv/bin/python scripts/imagens/lote-20.py
Saída: public/ui/icones/status/*.png
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import *  # noqa
from icones import CORES_STATUS, selo_status

SAIDA = RAIZ / "public/ui/icones/status"
GERADOS = []


def salvar(nome, img):
    GERADOS.append((nome, salvar_png(img, SAIDA / nome), img.size))


if __name__ == "__main__":
    for i, status in enumerate(CORES_STATUS, 1):
        for lado in (256, 64):
            salvar(f"icone-status-{i:02d}-{status}-{lado}.png", selo_status(status, lado))
    for nome, tam, dim in GERADOS:
        print(f"{nome:48s} {str(dim):12s} {tam/1024:5.1f} KB")
    print(f"{len(GERADOS)} arquivos")

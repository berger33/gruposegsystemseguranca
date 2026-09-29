"""Empacota os lotes de imagens em ZIPs de entrega.

Uso:  /tmp/venv/bin/python scripts/imagens/entregar.py
Saída: downloads/imagens/lote-NN-*.zip (um por lote) + imagens-seg-system-completo.zip
Cada ZIP leva um LEIA-ME.txt com a lista de arquivos, convenções de marca e limites de uso.
"""
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

sys.path.insert(0, str(Path(__file__).parent))
from comum import RAIZ  # noqa

DESTINO = RAIZ / "downloads/imagens"
EMAIL = RAIZ / "public/email"
UI = RAIZ / "public/ui"
MARCA = RAIZ / "public/brand/logo"


def arquivos_email(prefixo, numeros, pasta=None):
    """Seleciona arquivos como cabecalho-01.. por prefixo e faixa numérica."""
    saida = []
    for p in EMAIL.rglob(f"{prefixo}-*.jpg"):
        if p.stem.startswith(prefixo + "-") and any(p.stem.startswith(f"{prefixo}-{n:02d}") for n in numeros):
            if pasta is None or p.parent.name == pasta:
                saida.append(p)
    return sorted(saida)


def icones(pasta):
    return sorted((UI / "icones" / pasta).glob("*.png"))


def em_marca(nomes):
    return [MARCA / n for n in nomes]


def prazo_numeros(a, b):
    return range(a, b + 1)


LOTES = [
    (1, "email-fundacao", "Cabeçalhos 01–05 e rodapés 01–05 (primeiro conjunto de e-mail)",
     lambda: arquivos_email("cabecalho", prazo_numeros(1, 5)) + arquivos_email("rodape", prazo_numeros(1, 5))),
    (2, "email-cabecalhos-alternativos", "Cabeçalhos 11–20 (variações de layout: espelhado, split, selo, tarja, malha)",
     lambda: arquivos_email("cabecalho", prazo_numeros(11, 20))),
    (3, "email-rodapes-alternativos", "Rodapés 06–15 (glifos de contato, selo, marcos, tarja, bloco legal)",
     lambda: arquivos_email("rodape", prazo_numeros(6, 15))),
    (4, "email-cabecalhos-compactos", "Cabeçalhos 21–30 (1200×200) para respostas e notificações",
     lambda: arquivos_email("cabecalho", prazo_numeros(21, 30))),
    (5, "email-compactos-assinaturas", "Rodapés compactos 16–17, faixas 01–04 e assinaturas 01–04",
     lambda: (arquivos_email("rodape", prazo_numeros(16, 17)) + arquivos_email("faixa", prazo_numeros(1, 4))
              + arquivos_email("assinatura", prazo_numeros(1, 4)))),
    (6, "botoes-institucionais", "Botões 01–10 (primário, gradiente, claro, contorno, dourado, vidro, CTA, barra, flutuante, hover)",
     lambda: [UI / "botoes" / p.name for p in sorted((UI / "botoes").glob("botao-*.png"))
              if p.stem.split("-")[1] in {f"{n:02d}" for n in range(1, 11)}]),
    (7, "botoes-estados-acao", "Botões 11–20 (ações e estados: sucesso, aviso, erro, destrutivo, fantasma, chip, desabilitado, carregando)",
     lambda: [UI / "botoes" / p.name for p in sorted((UI / "botoes").glob("botao-*.png"))
              if p.stem.split("-")[1] in {f"{n:02d}" for n in range(11, 21)}]),
    (8, "icones-servico", "Ícones de serviço 01–10 (traço marinho, 256 px + 64 px)",
     lambda: icones("servicos")),
    (9, "icones-operacao", "Ícones de operação 01–10 (traço marinho, 256 px + 64 px)",
     lambda: icones("operacao")),
    (10, "icones-navegacao", "Ícones de navegação 01–10 (traço marinho, 256 px + 64 px)",
     lambda: icones("navegacao")),
    (11, "icones-servico-reverso", "Ícones de serviço 01–10 reversos (branco, para fundo escuro)",
     lambda: icones("servicos-reverso")),
    (12, "icones-operacao-reverso", "Ícones de operação 01–10 reversos (branco)",
     lambda: icones("operacao-reverso")),
    (13, "icones-navegacao-reverso", "Ícones de navegação 01–10 reversos (branco)",
     lambda: icones("navegacao-reverso")),
    (14, "marca-escudo-monograma", "Peças de marca: escudos, monogramas GS, medalhões, favicon e recortes do logotipo",
     lambda: icones("marca") + em_marca([f"{n}.png" for n in
                 ("logo-marinho", "logo-reverso", "escudo-marinho", "escudo-reverso", "texto-marinho", "texto-reverso")])),
    (15, "icones-acao-status", "Ícones de ação e status 01–10 (busca, filtro, editar, excluir, imprimir, compartilhar, sino, baixar, atualizar, expandir)",
     lambda: icones("acoes")),
    (16, "email-vigilancia-condominios", "Cabeçalhos 31–40 (vigilância noturna, condomínios, infraestrutura, corporativo, central 24h, logística, perímetro, acesso, rotas, vigilância ativa)",
     lambda: arquivos_email("cabecalho", prazo_numeros(31, 40))),
    (17, "site-banners-hero", "10 banners/hero do site (1600×600): institucional, monitoramento, condomínios, logística e portos, tecnologia, acesso, perímetro, vigilância noturna, cobertura e rotas, vigilância ativa",
     lambda: sorted((RAIZ / "public/site/hero").glob("hero-*.jpg"))),
]

LEIA_ME = """GRUPO SEG SYSTEM — {titulo}

Conteúdo ({n} arquivos):
{lista}

Convenções de marca
- O logotipo vem do arquivo real da marca (não é gerado por IA); botões e ícones não têm texto
  embutido — o rótulo é escrito em HTML/CSS, preservando tradução, acessibilidade e foco de teclado.
- Cores amostradas no logotipo: navy #0d2236, navy claro #1e3c5c, dourado #c4a56a,
  dourado claro #e2c78f, dourado escuro #9c7e4a.
- Fundos fotográficos dos e-mails são ilustrações conceituais: não são registros de instalações,
  clientes ou funcionários da empresa. Veículos aparecem sem placa ou identificação legível.
- Contatos, redes sociais e dados legais (razão social, CNPJ, endereço) não estão desenhados nas
  imagens de e-mail: devem ser escritos no HTML da mensagem.

Uso
- Peças de e-mail: JPEG com fundo opaco, 1200 px de largura (exibição a 600 px em tela 2x).
- Botões: PNG com transparência (480×112 padrão; CTA 600×140; chip 320×84; barra 1200×108).
- Ícones: PNG 256×256 para o sistema e 64×64 para menus e atalhos.

Fontes usadas na composição: Cinzel e Cormorant Garamond (Google Fonts, licença OFL) — os arquivos
de fonte não são redistribuídos aqui.
"""


def montar_zip(caminho, titulo, arquivos):
    arquivos = [a for a in arquivos if a.exists()]
    with ZipFile(caminho, "w", ZIP_DEFLATED, compresslevel=9) as z:
        for a in arquivos:
            if str(a).startswith(str(RAIZ / "public")):
                z.write(a, str(a.relative_to(RAIZ / "public")))
            else:
                z.write(a, a.name)
        lista = "\n".join(f"  - {a.name}" for a in arquivos)
        z.writestr("LEIA-ME.txt", LEIA_ME.format(titulo=titulo, n=len(arquivos), lista=lista))
    return len(arquivos), caminho.stat().st_size


def main():
    DESTINO.mkdir(parents=True, exist_ok=True)
    entregas = []
    for num, slug, titulo, selecionar in LOTES:
        arquivos = sorted(selecionar(), key=lambda p: p.name)
        destino = DESTINO / f"lote-{num:02d}-{slug}.zip"
        n, tam = montar_zip(destino, titulo, arquivos)
        entregas.append((num, slug, n, tam))
        print(f"lote-{num:02d}-{slug}.zip  {n:3d} arquivos  {tam/1024:7.0f} KB")

    # pacote completo (todas as peças + galeria + catálogo)
    completos = [p for p in EMAIL.rglob("*.jpg")] + sorted((RAIZ / "public/site/hero").glob("*.jpg")) \
        + [p for p in UI.rglob("*") if p.suffix in (".png", ".html")] \
        + em_marca([f"{n}.png" for n in ("logo-marinho", "logo-reverso", "escudo-marinho", "escudo-reverso",
                                        "texto-marinho", "texto-reverso")]) \
        + [RAIZ / "docs/imagens-catalogo.md"]
    destino = DESTINO / "imagens-seg-system-completo.zip"
    n, tam = montar_zip(destino, "Acervo completo — e-mail, botões, ícones e marca", completos)
    print(f"imagens-seg-system-completo.zip  {n:3d} arquivos  {tam/1024:7.0f} KB")
    return entregas


if __name__ == "__main__":
    main()

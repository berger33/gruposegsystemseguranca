"""Gera a galeria de revisão das peças de e-mail, botões e ícones.

Uso:  /tmp/venv/bin/python scripts/imagens/preview.py
Saída: public/ui/preview.html (abre direto no navegador; caminhos relativos)
"""
import html
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

FAMILIAS_HERO = ("Banners/hero do site (1600×600)", "public/site/hero", "hero-*.jpg")

FAMILIAS_ICONES = [
    ("Ícones de serviço (traço marinho)", "public/ui/icones/servicos"),
    ("Ícones de operação (traço marinho)", "public/ui/icones/operacao"),
    ("Ícones de navegação (traço marinho)", "public/ui/icones/navegacao"),
    ("Ícones de serviço (reverso, branco)", "public/ui/icones/servicos-reverso"),
    ("Ícones de operação (reverso, branco)", "public/ui/icones/operacao-reverso"),
    ("Ícones de navegação (reverso, branco)", "public/ui/icones/navegacao-reverso"),
    ("Ícones de módulos e gestão (traço marinho)", "public/ui/icones/modulos"),
    ("Ícones de módulos e gestão (reverso, branco)", "public/ui/icones/modulos-reverso"),
    ("Ícones de ação e status", "public/ui/icones/acoes"),
    ("Selos de status coloridos", "public/ui/icones/status"),
    ("Peças de marca", "public/ui/icones/marca"),
]


def cartao(caminho_rel, rotulo, classe="", fundo=""):
    estilo = f' style="background:{fundo}"' if fundo else ""
    return (f'<figure class="card {classe}"{estilo}>'
            f'<span class="shot"><img src="{caminho_rel}" alt="{html.escape(rotulo)}" loading="lazy"></span>'
            f'<figcaption>{html.escape(rotulo)}</figcaption></figure>')


def galeria_email():
    blocos = []
    for titulo, pasta, padrao in (
        ("Cabeçalhos de e-mail", "public/email/cabecalhos", "cabecalho-*.jpg"),
        ("Rodapés de e-mail", "public/email/rodapes", "rodape-*.jpg"),
        ("Faixas e divisores", "public/email/faixas", "faixa-*.jpg"),
        ("Assinaturas de e-mail", "public/email/assinaturas", "assinatura-*.jpg"),
    ):
        arquivos = sorted((RAIZ / pasta).glob(padrao))
        if not arquivos:
            continue
        cartoes = "".join(
            cartao(f"../{pasta.split('public/', 1)[1]}/{p.name}", p.stem.replace("-", " "))
            for p in arquivos
        )
        blocos.append(f'<h3>{titulo} <small>{len(arquivos)} arquivos</small></h3><div class="grade wide">{cartoes}</div>')
    return "".join(blocos)


def galeria_site():
    pasta, padrao = FAMILIAS_HERO[1], FAMILIAS_HERO[2]
    arquivos = sorted((RAIZ / pasta).glob(padrao))
    if not arquivos:
        return ""
    cartoes = "".join(
        cartao(f"../{pasta.split('public/', 1)[1]}/{p.name}", p.stem.replace("-", " "))
        for p in arquivos)
    return (f'<h3>{FAMILIAS_HERO[0]} <small>{len(arquivos)} arquivos</small></h3>'
            f'<div class="grade wide">{cartoes}</div>')


def galeria_botoes():
    arquivos = sorted((RAIZ / "public/ui/botoes").glob("*.png"))
    claro = "".join(cartao(f"botoes/{p.name}", p.stem.replace("-", " "), fundo="#f4f6f9") for p in arquivos)
    escuro = "".join(cartao(f"botoes/{p.name}", p.stem.replace("-", " "), fundo="#12233a") for p in arquivos)
    return (f'<h3>Botões — superfícies sobre fundo claro <small>{len(arquivos)} arquivos</small></h3>'
            f'<div class="grade botoes">{claro}</div>'
            f'<h3>Botões — superfícies sobre fundo escuro</h3>'
            f'<div class="grade botoes">{escuro}</div>')


def galeria_icones():
    blocos = []
    for titulo, pasta in FAMILIAS_ICONES:
        arquivos = sorted((RAIZ / pasta).glob("*-256.png"))
        if not arquivos:
            continue
        fundo = "#12233a" if "reverso" in pasta else "#ffffff"
        cartoes = "".join(
            cartao(f"icones/{pasta.split('icones/', 1)[1]}/{p.name}", p.stem.replace("-256", "").replace("-", " "), fundo=fundo)
            for p in arquivos
        )
        blocos.append(f'<h3>{titulo} <small>{len(arquivos)} arquivos (256 px + derivados 64 px)</small></h3>'
                      f'<div class="grade icones">{cartoes}</div>')
    return "".join(blocos)


def galeria_downloads():
    """Lista os ZIPs de entrega (um por lote) com tamanho e link direto."""
    pacotes = sorted((RAIZ / "downloads/imagens").glob("*.zip"))
    if not pacotes:
        return ""
    itens = []
    for p in pacotes:
        kb = p.stat().st_size / 1024
        tam = f"{kb/1024:.1f} MB" if kb > 1024 else f"{kb:.0f} KB"
        github = ("https://github.com/berger33/gruposegsystemseguranca/raw/"
                  f"arena/01a0eb32-gruposegsystemseguranca/downloads/imagens/{p.name}")
        itens.append(
            f'<li><a href="{github}"><strong>{p.stem.replace("-", " ")}</strong><span>{tam} · GitHub</span></a></li>')
    return ('<h2>Pacotes para download</h2>'
            '<p class="nota">Um ZIP por lote, com LEIA-ME (lista de arquivos e convenções de marca). '
            'O pacote completo reúne as 150 peças, a galeria e o catálogo.</p>'
            f'<ul class="pacotes">{"".join(itens)}</ul>')


def main():
    n_email = len([p for d in ("cabecalhos", "rodapes", "faixas", "assinaturas")
                   for p in (RAIZ / "public/email" / d).glob("*.jpg")])
    n_botoes = len(list((RAIZ / "public/ui/botoes").glob("*.png")))
    n_icones = len(list((RAIZ / "public/ui/icones").rglob("*-256.png"))) + len(list((RAIZ / "public/ui/icones/marca").glob("*.png")))
    n_hero = len(list((RAIZ / "public/site/hero").glob("*.jpg")))
    total = n_email + n_hero + n_botoes + len(list((RAIZ / "public/ui/icones").rglob("*.png")))
    por_familia = (f"{n_email} peças de e-mail + {n_hero} banners de site + {n_botoes} botões + {n_icones} ícones e peças de marca")
    html_saida = f"""<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grupo SEG System — galeria de imagens (e-mail, botões e ícones)</title>
<style>
  :root {{ --navy:#0d2236; --navy-2:#1e3c5c; --ouro:#c4a56a; --ouro-claro:#e2c78f; --texto:#22303f; --linha:#e2e8ef; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:'DM Sans',Arial,sans-serif; color:var(--texto); background:#f7f9fc; }}
  header {{ background:linear-gradient(120deg,var(--navy),var(--navy-2)); color:#fff; padding:38px 34px 30px; }}
  header h1 {{ margin:0 0 8px; font-size:26px; letter-spacing:.02em; }}
  header p {{ margin:0; color:#cfdcea; font-size:14px; }}
  header .selo {{ display:inline-block; margin-top:14px; padding:6px 12px; border:1px solid var(--ouro); border-radius:999px;
                  color:var(--ouro-claro); font-size:12px; letter-spacing:.12em; text-transform:uppercase; }}
  main {{ padding:28px 34px 60px; max-width:1500px; margin:0 auto; }}
  h2 {{ margin:40px 0 6px; font-size:20px; color:var(--navy); border-bottom:2px solid var(--ouro); padding-bottom:8px; }}
  h3 {{ margin:26px 0 12px; font-size:15px; color:var(--navy-2); text-transform:uppercase; letter-spacing:.06em; }}
  h3 small {{ color:#7188a0; text-transform:none; letter-spacing:0; font-weight:400; }}
  .grade {{ display:grid; gap:14px; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); }}
  .grade.wide {{ grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); }}
  .grade.icones .card {{ padding:14px; }}
  .grade.icones .card .shot {{ background:transparent !important; }}
  .card {{ margin:0; background:#fff; border:1px solid var(--linha); border-radius:10px; padding:10px;
           display:flex; flex-direction:column; gap:8px; }}
  .card .shot {{ display:flex; align-items:center; justify-content:center; min-height:96px; border-radius:6px;
                 background:repeating-conic-gradient(#eef2f7 0% 25%, #fff 0% 50%) 50%/16px 16px; overflow:hidden; }}
  .card img {{ max-width:100%; max-height:170px; display:block; }}
  .grade.icones img {{ max-height:74px; }}
  figcaption {{ font-size:11px; color:#5d7186; word-break:break-word; }}
  ul.pacotes {{ list-style:none; margin:0; padding:0; display:grid; gap:10px;
                grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); }}
  ul.pacotes a {{ display:flex; justify-content:space-between; align-items:center; gap:10px;
                  background:#fff; border:1px solid var(--linha); border-radius:8px; padding:12px 14px;
                  font-size:13px; color:var(--navy); }}
  ul.pacotes a:hover {{ border-color:var(--ouro); }}
  ul.pacotes span {{ color:#7188a0; font-size:12px; flex:none; }}
  .nota {{ background:#fff; border:1px solid var(--linha); border-left:4px solid var(--ouro); border-radius:8px;
           padding:14px 16px; font-size:13px; line-height:1.6; }}
  footer {{ padding:24px 34px 50px; color:#6b7d91; font-size:12px; }}
</style>
<header>
  <h1>Grupo SEG System — imagens para e-mail, sistema e site</h1>
  <p>{por_familia} — mais derivados 64 px, recortes do logotipo e 16 ZIPs de entrega por lote.
     Logotipo e monograma vêm do arquivo real da marca; botões e ícones não têm texto embutido.</p>
  <span class="selo">17 lotes entregues</span>
</header>
<main>
  <h2>E-mail</h2>
  <p class="nota">Peças geradas a 1200 px de largura (exibição a 600 px em telas 2x), JPEG com fundo opaco para
     compatibilidade. Telefones, endereço e razão social ficam no HTML do e-mail — nunca fixos na imagem.</p>
  {galeria_email()}

  <h2>Site</h2>
  <p class="nota">Banners de página inicial e internas a 1600×600, com logotipo real da marca, fio dourado e
     tagline. O botão de ação entra por CSS/HTML sobre a peça — o banner não embute CTA nem contato.</p>
  {galeria_site()}

  <h2>Botões</h2>
  <p class="nota">Superfícies em PNG com transparência (480×112, CTA 600×140, chip 320×84, barra 1200×108).
     O rótulo é escrito em HTML/CSS, preservando tradução, foco de teclado e estado desabilitado.</p>
  {galeria_botoes()}

  <h2>Ícones</h2>
  <p class="nota">Traço uniforme, 256 px para o sistema e 64 px para menus e atalhos (favicon na pasta de marca).
     Versões marinho, branca e dourada cobrem fundos claros e escuros.</p>
  {galeria_icones()}
  {galeria_downloads()}
</main>
<footer>Arquivos em <code>public/email/</code> e <code>public/ui/</code> · gerados por
  <code>scripts/imagens/</code> (Pillow + NumPy, fontes OFL Cinzel e Cormorant Garamond).</footer>
</html>
"""
    destino = RAIZ / "public/ui/preview.html"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(html_saida, encoding="utf-8")
    print(f"{destino.relative_to(RAIZ)} escrito — {total} arquivos referenciados")


if __name__ == "__main__":
    main()

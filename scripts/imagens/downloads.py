"""Gera a página de downloads das artes (public/downloads.html).

Cada pacote aparece com dois caminhos: o link do GitHub (baixa sem login, funciona fora do
sandbox) e o caminho local servido pela prévia (útil durante a revisão).

Uso:  /tmp/venv/bin/python scripts/imagens/downloads.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comum import RAIZ  # noqa

BRANCH = "arena/01a0eb32-gruposegsystemseguranca"
BASE_GITHUB = f"https://github.com/berger33/gruposegsystemseguranca/raw/{BRANCH}/downloads/imagens"


def humano(bytes_):
    kb = bytes_ / 1024
    return f"{kb/1024:.1f} MB" if kb > 1024 else f"{kb:.0f} KB"


def main():
    pacotes = sorted((RAIZ / "downloads/imagens").glob("*.zip"))
    itens = []
    for p in pacotes:
        titulo = p.stem.replace("lote-", "Lote ").replace("-", " ")
        itens.append(
            f'<li><span class="nome">{titulo}<small>{humano(p.stat().st_size)}</small></span>'
            f'<span class="botoes">'
            f'<a class="baixar" href="{BASE_GITHUB}/{p.name}">Baixar ZIP</a>'
            f'<a class="ver" href="/downloads/imagens/{p.name}">cópia local (prévia)</a>'
            f'<a class="ver" href="https://github.com/berger33/gruposegsystemseguranca/blob/{BRANCH}/downloads/imagens/{p.name}">ver no GitHub</a>'
            f'</span></li>')

    pagina = f"""<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grupo SEG System — downloads das artes</title>
<style>
  :root {{ --navy:#0d2236; --navy-2:#1e3c5c; --ouro:#c4a56a; --ouro-claro:#e2c78f; --texto:#22303f; --linha:#e2e8ef; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:'DM Sans',Arial,sans-serif; color:var(--texto); background:#f7f9fc; }}
  header {{ background:linear-gradient(120deg,var(--navy),var(--navy-2)); color:#fff; padding:34px 30px 28px; }}
  h1 {{ margin:0 0 6px; font-size:23px; }}
  header p {{ margin:0; color:#cfdcea; font-size:13px; max-width:900px; line-height:1.6; }}
  main {{ max-width:1000px; margin:0 auto; padding:24px 30px 60px; }}
  ul {{ list-style:none; margin:0; padding:0; display:grid; gap:10px; }}
  li {{ display:flex; align-items:center; justify-content:space-between; gap:14px; background:#fff;
        border:1px solid var(--linha); border-radius:10px; padding:13px 16px; flex-wrap:wrap; }}
  li span.nome {{ font-size:14px; color:var(--navy); display:flex; flex-direction:column; gap:2px; }}
  li span.nome small {{ color:#7188a0; font-size:12px; }}
  li span.botoes {{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }}
  a.baixar {{ background:var(--navy); color:#fff; text-decoration:none; font-size:13px; font-weight:600;
              padding:9px 15px; border-radius:6px; border:1px solid var(--ouro); white-space:nowrap; }}
  a.baixar:hover {{ background:var(--navy-2); }}
  a.ver {{ font-size:12px; color:#5d7186; text-decoration:none; white-space:nowrap; }}
  a.ver:hover {{ color:var(--navy); }}
  .nota {{ background:#fff; border:1px solid var(--linha); border-left:4px solid var(--ouro);
           border-radius:8px; padding:14px 16px; font-size:13px; line-height:1.65; margin:22px 0 0; }}
  code {{ background:#eef2f7; padding:1px 5px; border-radius:4px; font-size:12px; }}
</style>
<header>
  <h1>Grupo SEG System — download das artes</h1>
  <p>{len(pacotes)} pacotes: 60 peças de e-mail, 10 banners de site, 20 botões, 150 ícones (256 px + derivados 64 px)
     e as peças de marca. Cada ZIP traz um LEIA-ME com a lista de arquivos, convenções de marca e limites de uso.</p>
</header>
<main>
  <ul>{''.join(itens)}</ul>
  <p class="nota">O botão <strong>Baixar ZIP</strong> aponta para o GitHub (repositório público, branch
     <code>{BRANCH}</code>) e funciona sem login, inclusive fora deste ambiente. O link
     <em>cópia local</em> só existe enquanto a prévia estiver no ar. Os arquivos também estão versionados em
     <code>downloads/imagens/</code> no repositório.</p>
</main>
</html>
"""
    destino = RAIZ / "public/downloads.html"
    destino.write_text(pagina, encoding="utf-8")
    print(f"{destino.relative_to(RAIZ)} escrito — {len(pacotes)} pacotes")


if __name__ == "__main__":
    main()

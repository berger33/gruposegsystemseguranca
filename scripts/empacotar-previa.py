"""Empacota as dez interfaces estáticas para avaliação offline.

Execute depois de `npm run build:preview`. Nunca use este ZIP como deploy do sistema.
"""
from html import escape
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / "out"
archive = root / "downloads" / "seg-system-previa.zip"
source = (root / "src/lib/themes.ts").read_text(encoding="utf-8")
themes = re.findall(r'\{ id: "([^"]+)", number: "([^"]+)", name: "([^"]+)", style: "([^"]+)"', source)
if len(themes) != 10 or len({slug for slug, *_ in themes}) != 10:
    raise SystemExit("O catálogo precisa conter exatamente dez temas únicos.")
for slug, *_ in themes:
    filename = "index.html" if slug == "classico" else f"{slug}.html"
    if not (output / filename).is_file():
        raise SystemExit(f"Falta {filename}. Execute npm run build:preview primeiro.")

cards = "".join(
    f'<a class="card card--{escape(slug)}" href="{("index" if slug == "classico" else slug)}.html">'
    f'<span class="num">INTERFACE {escape(number)}</span><strong>{escape(name)} ↗</strong>'
    f'<span class="desc">{escape(style)}{ " · layout aprovado" if slug == "classico" else ""}</span></a>'
    for slug, number, name, style in themes
)
launcher = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grupo SEG System — dez interfaces</title>
<style>*{{box-sizing:border-box}}body{{margin:0;background:#edf3fa;color:#0b2e58;font:16px Arial,sans-serif;padding:36px 20px}}main{{max-width:1080px;margin:auto}}.top{{border-top:6px solid #1d55a4;background:#fff;padding:clamp(26px,5vw,58px)}}small,.num{{color:#2860a4;font-weight:bold;letter-spacing:.15em;font-size:10px}}h1{{font-size:clamp(36px,5vw,64px);line-height:1.07;letter-spacing:-.05em;margin:18px 0}}p{{line-height:1.7;color:#526d8a;max-width:760px}}.cards{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:18px 0}}.card{{display:flex;flex-direction:column;justify-content:space-between;min-height:144px;padding:23px;color:#123966;border:1px solid #cfdeed;background:#fff;text-decoration:none;transition:transform .2s,box-shadow .2s}}.card:hover{{transform:translateY(-3px);box-shadow:0 12px 24px #092a4d22}}.card strong{{font-size:22px;letter-spacing:-.03em;margin:13px 0}}.desc{{font-size:12px;color:#6b8198}}.card--classico{{border-left:5px solid #1b4e99}}.card--tecnologia{{background:#0a223f;color:#e8f4ff}}.card--tecnologia .desc,.card--industrial .desc{{color:#a8c1d9}}.card--minimalista{{background:#fcfcfa}}.card--humano{{background:#e7f0ed;border-radius:18px}}.card--industrial{{background:#0d2b49;color:white;border-left:6px solid #5aa0df}}.card--corporativo{{border-top:4px double #294e80}}.card--editorial strong{{font-family:Georgia,serif;font-weight:normal;font-size:26px}}.card--mobile{{border-radius:22px;background:#e7f1ff}}.card--indicadores{{border-top:5px solid #3384a9;background:#e9f5fa}}.card--campanha{{background:#1b52a6;color:white}}.card--campanha .num,.card--campanha .desc,.card--tecnologia .num,.card--industrial .num{{color:#b4d7ff}}.foot{{font-size:12px;padding:14px 0 30px}}@media(max-width:660px){{.cards{{grid-template-columns:1fr}}}}</style>
</head><body><main><div class="top"><small>GRUPO SEG SYSTEM / BIBLIOTECA DE INTERFACES</small><h1>Uma marca.<br>Dez maneiras de se apresentar.</h1><p>Escolha uma interface abaixo para visualizar. A primeira foi mantida conforme sua aprovação. As demais são propostas diferentes sobre os mesmos serviços e fluxos — esta é uma <strong>prévia estática</strong>, não o sistema em produção.</p></div><div class="cards">{cards}</div><p class="foot">Extraia o ZIP inteiro antes de abrir este arquivo. Se o navegador bloquear interações de arquivos locais, sirva a pasta com um servidor local. A escolha global pelo administrador será implementada na etapa de sistema.</p></main></body></html>"""
readme = """GRUPO SEG SYSTEM — DEZ INTERFACES / PRÉVIA ESTÁTICA\n\nExtraia TODO o ZIP. Abra ABRA-AQUI.html e escolha uma das dez interfaces.\nSe o navegador bloquear scripts de arquivos locais, execute na pasta extraída: python -m http.server 8080\nDepois abra http://localhost:8080/ABRA-AQUI.html em seu próprio computador.\n\nEsta é uma prévia: não há login, CRM, e-mail automático nem armazenamento de leads. O formulário somente prepara uma mensagem para WhatsApp. Não publique como sistema final.\n"""
archive.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=9) as zipped:
    zipped.writestr("ABRA-AQUI.html", launcher)
    zipped.writestr("LEIA-ME.txt", readme)
    for file in sorted(output.rglob("*")):
        if file.is_file():
            zipped.write(file, file.relative_to(output).as_posix())
print(f"Dez interfaces empacotadas: {archive} ({archive.stat().st_size} bytes)")

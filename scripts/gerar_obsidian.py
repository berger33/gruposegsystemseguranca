#!/usr/bin/env python3
"""
Gerador de vault Obsidian: conhecimento atômico + topologia controlada.

Uso:
    python3 scripts/gerar_obsidian.py                     # gera tudo (md + zip)
    python3 scripts/gerar_obsidian.py --densidade 0.12    # grafo mais esparso
    python3 scripts/gerar_obsidian.py --sem-poda          # mantem todos os links
    python3 scripts/gerar_obsidian.py --sem-zip
    python3 scripts/gerar_obsidian.py --so-checar         # valida, nao escreve

Como alimentar:
    JSONs em obsidian/_spec/ — um por eixo (cluster):
      meta.json  -> nome do vault, indice, resumo, como navegar
      <eixo>.json -> {"cluster": {"id","titulo","resumo"}, "notas": [...]}

    Campos de uma nota:
      id, titulo, tags[], sintese, definicao[], como_funciona[], quando_usar[],
      armadilhas[], conexoes[{"alvo","nota"}], veja_tambem[]

Topologia (o "desenho"):
    Cada aresta tem um peso — hub↔ficha = 3, hub↔hub = 3, conexao = 2, travessia = 1.
    A poda remove primeiro as arestas mais fracas (respeitando grau minimo e
    conectividade) ate atingir a densidade alvo. Resultado: nucleo forte, pontes
    visiveis, sem novelo.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC_DIR = ROOT / "obsidian" / "_spec"
OUT_DIR = ROOT / "obsidian"
ZIP_PATH = ROOT / "obsidian-vault-engenharia-software.zip"

HOJE = date.today().isoformat()
WIKILINK = re.compile(r"\[\[([^\]\|#]+)(?:[^\]]*)\]\]")

PESO_HUB = 3
PESO_CONEXAO = 2
PESO_TRAVESSIA = 1


# --------------------------------------------------------------------------- carga
def carregar_spec() -> dict:
    if not SPEC_DIR.is_dir():
        sys.exit(f"spec nao encontrada: {SPEC_DIR}")

    meta = json.loads((SPEC_DIR / "meta.json").read_text(encoding="utf-8"))
    clusters, notas = [], []

    for arquivo in sorted(SPEC_DIR.glob("*.json")):
        if arquivo.name == "meta.json":
            continue
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        cluster = dict(dados["cluster"])
        clusters.append(cluster)
        for nota in dados["notas"]:
            nota = dict(nota)
            nota["_cluster"] = cluster["id"]
            notas.append(nota)

    return {"meta": meta, "clusters": clusters, "notas": notas}


# ---------------------------------------------------------------------------- grafo
def construir_grafo(spec: dict) -> tuple[dict, set, set]:
    """Devolve {aresta: peso}, os titulos (nos) e as arestas fixas (espinha hub)."""
    meta, clusters, notas = spec["meta"], spec["clusters"], spec["notas"]
    indice = meta["indice"]
    nos = {indice} | {c["titulo"] for c in clusters} | {n["titulo"] for n in notas}
    arestas: dict[tuple[str, str], int] = {}

    def add(a: str, b: str, peso: int) -> None:
        if a == b or a not in nos or b not in nos:
            return
        chave = tuple(sorted((a, b)))
        arestas[chave] = max(arestas.get(chave, 0), peso)

    por_cluster = defaultdict(list)
    for n in notas:
        por_cluster[n["_cluster"]].append(n)

    for c in clusters:
        add(indice, c["titulo"], PESO_HUB)
        for n in por_cluster[c["id"]]:
            add(c["titulo"], n["titulo"], PESO_HUB)
    for c1 in clusters:
        for c2 in clusters:
            add(c1["titulo"], c2["titulo"], PESO_HUB)
    for n in notas:
        for cx in n.get("conexoes") or []:
            add(n["titulo"], cx["alvo"], PESO_CONEXAO)
        for vt in n.get("veja_tambem") or []:
            add(n["titulo"], vt, PESO_TRAVESSIA)

    fixas = {k for k, v in arestas.items() if v == PESO_HUB}
    return arestas, nos, fixas


def graus(arestas: dict, nos: set) -> dict:
    g = {n: 0 for n in nos}
    for a, b in arestas:
        g[a] += 1
        g[b] += 1
    return g


def componentes(arestas: dict, nos: set) -> int:
    pai = {n: n for n in nos}

    def find(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x

    for a, b in arestas:
        ra, rb = find(a), find(b)
        if ra != rb:
            pai[ra] = rb
    return len({find(n) for n in nos})


def densidade(n_arestas: int, n_nos: int) -> float:
    return (2 * n_arestas) / (n_nos * (n_nos - 1)) if n_nos > 1 else 0.0


def podar(arestas: dict, nos: set, alvo: float, min_grau: int, fixas: set | None = None) -> dict:
    """Remove as arestas mais fracas mantendo conectividade, grau minimo e a espinha."""
    fixas = fixas or set()
    arestas = dict(arestas)
    g = graus(arestas, nos)

    while densidade(len(arestas), len(nos)) > alvo:
        candidatos = sorted(
            (kv for kv in arestas.items() if kv[0] not in fixas),
            key=lambda kv: (kv[1], min(g[kv[0][0]], g[kv[0][1]]) * -1),
        )
        for (a, b), _peso in candidatos:
            if g[a] <= min_grau or g[b] <= min_grau:
                continue
            sobreviventes = {k: v for k, v in arestas.items() if k != (a, b)}
            if componentes(sobreviventes, nos) != 1:
                continue
            del arestas[(a, b)]
            g[a] -= 1
            g[b] -= 1
            break
        else:
            break  # nao ha mais nada que se possa remover com seguranca
    return arestas


def vizinhos(arestas: dict, titulo: str) -> set:
    saida = set()
    for a, b in arestas:
        if a == titulo:
            saida.add(b)
        elif b == titulo:
            saida.add(a)
    return saida


# ----------------------------------------------------------------------- renderizacao
def frontmatter(campos: dict) -> str:
    linhas = ["---"]
    for chave, valor in campos.items():
        if valor is None:
            continue
        if isinstance(valor, list):
            linhas.append(f"{chave}:")
            linhas += [f"  - {v}" for v in valor]
        else:
            linhas.append(f"{chave}: {valor}")
    linhas.append("---")
    return "\n".join(linhas)


def tags_de(cluster: dict, nota: dict) -> list:
    cruas = ["ficha", f"area/{cluster['id']}"] + list(nota.get("tags") or [])
    vistos, saida = set(), []
    for t in cruas:
        t = t.lstrip("#")
        if t not in vistos:
            vistos.add(t)
            saida.append(t)
    return saida


def render_ficha(nota: dict, cluster: dict, permitidos: set) -> str:
    titulo, hub = nota["titulo"], cluster["titulo"]
    partes = [
        frontmatter(
            {
                "titulo": titulo,
                "tipo": "ficha",
                "area": cluster["id"],
                "hub": f"[[{hub}]]",
                "tags": tags_de(cluster, nota),
                "status": nota.get("status", "rascunho"),
                "criado": nota.get("criado", HOJE),
                "atualizado": HOJE,
            }
        ),
        "",
        f"# {titulo}",
        "",
        f"> {nota['sintese']}",
        "",
    ]

    for rotulo, campo in [
        ("Definição", "definicao"),
        ("Como funciona", "como_funciona"),
        ("Quando usar", "quando_usar"),
        ("Armadilhas", "armadilhas"),
    ]:
        itens = nota.get(campo) or []
        if not itens:
            continue
        partes += [f"## {rotulo}", ""] + [f"- {i}" for i in itens] + [""]

    conexoes = [c for c in (nota.get("conexoes") or []) if c["alvo"] in permitidos]
    if conexoes:
        partes += ["## Conexões", ""]
        for c in conexoes:
            txt = c.get("nota", "")
            partes.append(f"- [[{c['alvo']}]] — {txt}" if txt else f"- [[{c['alvo']}]]")
        partes.append("")

    vistos = {titulo, hub} | {c["alvo"] for c in conexoes}
    extras = []
    for t in nota.get("veja_tambem") or []:
        if t in vistos or t not in permitidos:
            continue
        vistos.add(t)
        extras.append(t)

    partes += ["## Veja também", "", f"- [[{hub}]]"]
    partes += [f"- [[{t}]]" for t in extras]
    partes.append("")
    return "\n".join(partes)


def render_moc(cluster: dict, notas: list, clusters: list, indice: str, permitidos: set) -> str:
    titulo = cluster["titulo"]
    partes = [
        frontmatter(
            {
                "titulo": titulo,
                "tipo": "moc",
                "area": cluster["id"],
                "hub": f"[[{indice}]]",
                "tags": ["moc", f"area/{cluster['id']}"],
                "status": "ativo",
                "atualizado": HOJE,
            }
        ),
        "",
        f"# {titulo}",
        "",
        f"> {cluster['resumo']}",
        "",
        "## Notas deste eixo",
        "",
    ]
    for n in notas:
        if n["titulo"] in permitidos:
            partes.append(f"- [[{n['titulo']}]] — {n['sintese']}")
    partes += ["", "## Travessias para outros eixos", ""]
    for c in clusters:
        if c["titulo"] != titulo and c["titulo"] in permitidos:
            partes.append(f"- [[{c['titulo']}]]")
    partes += ["", "## Voltar", "", f"- [[{indice}]]", ""]
    return "\n".join(partes)


def render_indice(meta: dict, clusters: list, stats: dict) -> str:
    return "\n".join(
        [
            frontmatter(
                {
                    "titulo": meta["indice"],
                    "tipo": "indice",
                    "tags": ["moc", "indice"],
                    "status": "ativo",
                    "atualizado": HOJE,
                }
            ),
            "",
            f"# {meta['indice']}",
            "",
            f"> {meta['resumo']}",
            "",
            "## Eixos (hubs)",
            "",
        ]
        + [f"- [[{c['titulo']}]] — {c['resumo']}" for c in clusters]
        + ["", "## Como navegar", ""]
        + [f"- {i}" for i in meta.get("como_navegar", [])]
        + [
            "",
            "## Saúde do grafo",
            "",
            f"- nós: {stats['nos']} · fichas: {stats['fichas']} · hubs: {stats['hubs']} · arestas: {stats['arestas']}",
            f"- grau médio: {stats['grau_medio']} · grau mínimo: {stats['grau_min']} · densidade: {stats['densidade']}",
            f"- mais conectadas: {', '.join(stats['quentes'])}",
            "",
        ]
    )


def render_readme(meta: dict, stats: dict) -> str:
    return "\n".join(
        [
            "# Como usar este vault",
            "",
            f"> {meta['resumo']}",
            "",
            "## Instalar",
            "",
            "1. Descompacte e copie os arquivos `.md` para dentro do seu vault do Obsidian",
            "   (pode ficar numa subpasta, tipo `Conhecimento/Engenharia/`).",
            "2. Abra o Obsidian e tecle `Ctrl/Cmd + G` para o **Graph View**.",
            "3. Filtros úteis: `tag:#moc` mostra só a espinha; `tag:#ficha` mostra as folhas;",
            "   um grupo por `area` colore cada eixo.",
            "",
            "## Por que o grafo tem forma",
            "",
            "- Cada nota é atômica (um conceito) e se conecta a poucas outras — o grafo é podado",
            "  para manter densidade controlada, preservando as arestas semanticamente fortes.",
            "- Os hubs (`MOC - ...`) formam um anel ligado ao índice: é o núcleo do desenho.",
            "- As pontes que sobraram entre eixos (ex.: evento → outbox → consistência eventual)",
            "  são exatamente o raciocínio que atravessa o conhecimento.",
            "",
            "## Expandindo",
            "",
            "- Edite os JSONs em `_spec/` (um arquivo por eixo) e rode:",
            "  `python3 scripts/gerar_obsidian.py`",
            "- Todo `[[link]]` é validado: apontar para nota inexistente faz o script parar.",
            f"- Ajuste o desenho com `--densidade` (padrão {stats['densidade_alvo']}) e `--min-grau`.",
            "",
            "## Mapa",
            "",
            f"- {stats['fichas']} fichas · {stats['hubs']} hubs · {stats['arestas']} arestas",
            f"- grau médio {stats['grau_medio']} · densidade {stats['densidade']}",
            "",
        ]
    )


PREVIA_HTML = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Prévia do grafo — __VAULT__</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f1115; color: #e6e8ee;
         font: 14px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position: fixed; inset: 0 0 auto 0; padding: 14px 20px;
           background: linear-gradient(#0f1115ee, #0f111500); z-index: 2; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: .2px; }
  .sub { color: #8b93a7; font-size: 12.5px; margin-top: 3px; }
  .stats { margin-top: 8px; display: flex; gap: 16px; flex-wrap: wrap;
           font-size: 12px; color: #9aa3b8; }
  .stats b { color: #e6e8ee; font-weight: 600; }
  #lenda { position: fixed; right: 18px; bottom: 16px; font-size: 12px;
           display: grid; gap: 5px; z-index: 2; }
  #lenda span { display: flex; align-items: center; gap: 7px; color: #b9c0d0; }
  #lenda i { width: 10px; height: 10px; border-radius: 50%; display: block; }
  #info { position: fixed; left: 18px; bottom: 16px; font-size: 12px;
          color: #8b93a7; z-index: 2; max-width: 46ch; }
  canvas { display: block; }
  .node-label { fill: #cfd6e6; font-size: 10px; paint-order: stroke;
                stroke: #0f1115; stroke-width: 3px; stroke-linejoin: round; }
  .node-label.hub { font-size: 12px; font-weight: 600; fill: #ffffff; }
</style>
</head>
<body>
<header>
  <h1>__VAULT__</h1>
  <div class="sub">Prévia do grafo — o Obsidian vai renderizar a mesma topologia no Graph View.</div>
  <div class="stats">
    <span><b>__NOS__</b> nós</span><span><b>__ARESTAS__</b> arestas</span>
    <span>grau médio <b>__GRAU__</b></span><span>densidade <b>__DENS__</b></span>
  </div>
</header>
<div id="lenda"></div>
<div id="info">arraste os nós · scroll para zoom · clique para destacar vizinhos</div>
<canvas id="c"></canvas>
<script>
const DADOS = __DADOS__;
const CORES = __CORES__;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, dpr = window.devicePixelRatio || 1;
let transform = { x: 0, y: 0, k: 1 };
let drag = null, hover = null, destaque = null;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize); resize();

// ---- lenda
const lenda = document.getElementById('lenda');
Object.entries(CORES).forEach(([nome, cor]) => {
  const s = document.createElement('span');
  s.innerHTML = '<i style="background:' + cor + '"></i>' + nome;
  lenda.appendChild(s);
});

// ---- grafo
const nodes = DADOS.nodes.map(n => ({ ...n, x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0 }));
const byId = new Map(nodes.map(n => [n.id, n]));
const links = DADOS.links.map(l => ({ source: byId.get(l.source), target: byId.get(l.target), peso: l.peso }));
const viz = new Map(nodes.map(n => [n.id, new Set()]));
links.forEach(l => { viz.get(l.source.id).add(l.target.id); viz.get(l.target.id).add(l.source.id); });

function step(alpha) {
  const rep = 5200, centro = 0.012;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy || 0.01;
      const f = rep / d2;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
  }
  for (const l of links) {
    const a = l.source, b = l.target;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const alvo = 70 + (3 - l.peso) * 26;
    const f = (d - alvo) * 0.02 * l.peso;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  for (const n of nodes) {
    n.vx += (W / 2 - n.x) * centro;
    n.vy += (H / 2 - n.y) * centro;
    if (n === drag) { n.vx = 0; n.vy = 0; continue; }
    n.vx *= 0.82; n.vy *= 0.82;
    n.x += n.vx * alpha; n.y += n.vy * alpha;
  }
}

function raio(n) { return n.tipo === 'indice' ? 13 : n.tipo === 'moc' ? 10 : 3.5 + n.grau * 0.55; }

function desenhar() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(transform.x, transform.y); ctx.scale(transform.k, transform.k);

  const foco = destaque || (hover && hover.id);
  for (const l of links) {
    const apagado = foco && l.source.id !== foco && l.target.id !== foco;
    ctx.beginPath();
    ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y);
    ctx.strokeStyle = apagado ? 'rgba(120,130,150,0.06)'
      : 'rgba(150,170,210,' + (0.10 + l.peso * 0.07) + ')';
    ctx.lineWidth = (foco && !apagado && (l.source.id === foco || l.target.id === foco)) ? 1.6 : 0.7;
    ctx.stroke();
  }
  for (const n of nodes) {
    const apagado = foco && n.id !== foco && !viz.get(foco).has(n.id);
    const r = raio(n);
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = apagado ? 'rgba(90,98,115,0.25)' : (CORES[n.grupo] || '#8ab4f8');
    ctx.fill();
    if (n.tipo !== 'ficha' || r > 7) {
      ctx.strokeStyle = 'rgba(15,17,21,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  const LabelEm = transform.k > 0.55;
  if (LabelEm) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of nodes) {
      const mostra = n.tipo !== 'ficha' || transform.k > 1.1 || n.id === foco ||
                     (destaque && viz.get(destaque).has(n.id));
      if (!mostra) continue;
      const apagado = foco && n.id !== foco && !viz.get(foco).has(n.id);
      ctx.globalAlpha = apagado ? 0.25 : 1;
      ctx.fillStyle = n.tipo === 'ficha' ? '#cfd6e6' : '#ffffff';
      ctx.font = (n.tipo === 'ficha' ? '10px ' : '600 12px ') +
                 '-apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(n.id, n.x, n.y - raio(n) - 7);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

let alpha = 1;
function loop() {
  step(alpha);
  if (alpha > 0.05) alpha *= 0.994;
  desenhar();
  requestAnimationFrame(loop);
}
loop();

// ---- interação
function paraGrafo(cx, cy) { return { x: (cx - transform.x) / transform.k, y: (cy - transform.y) / transform.k }; }
function achar(p) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (Math.hypot(n.x - p.x, n.y - p.y) <= raio(n) + 4) return n;
  }
  return null;
}
canvas.addEventListener('mousedown', e => { drag = achar(paraGrafo(e.clientX, e.clientY)); if (drag) alpha = Math.max(alpha, 0.5); });
window.addEventListener('mouseup', () => { drag = null; });
canvas.addEventListener('mousemove', e => {
  const p = paraGrafo(e.clientX, e.clientY);
  if (drag) { drag.x = p.x; drag.y = p.y; drag.vx = 0; drag.vy = 0; }
  hover = achar(p);
  canvas.style.cursor = hover ? 'pointer' : 'grab';
  document.getElementById('info').textContent = hover
    ? hover.id + ' · ' + hover.grupo + ' · grau ' + hover.grau
    : 'arraste os nós · scroll para zoom · clique para destacar vizinhos';
});
canvas.addEventListener('click', e => {
  const n = achar(paraGrafo(e.clientX, e.clientY));
  destaque = n && destaque !== n.id ? n.id : null;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const p = paraGrafo(e.clientX, e.clientY);
  const k = Math.min(4, Math.max(0.25, transform.k * (e.deltaY < 0 ? 1.12 : 0.89)));
  transform.k = k;
  transform.x = e.clientX - p.x * k; transform.y = e.clientY - p.y * k;
}, { passive: false });
</script>
</body>
</html>
"""

CORES_GRUPO = {
    "índice": "#f4f6fb",
    "MOC - Arquitetura de Software": "#7dd3fc",
    "MOC - Domínio e Modelagem": "#c4b5fd",
    "MOC - Design de Código": "#86efac",
    "MOC - Dados e Persistência": "#fcd34d",
    "MOC - Testes e Qualidade": "#fca5a5",
    "MOC - Entrega e Operação": "#fdba74",
}


def render_previa(meta: dict, spec: dict, arestas: dict, nos: set, stats: dict) -> str:
    """HTML autocontido com o layout de força do grafo (sem dependencias externas)."""
    fichas = {n["titulo"]: n for n in spec["notas"]}
    hubs = {c["titulo"]: c for c in spec["clusters"]}
    g = graus(arestas, nos)

    def grupo(titulo: str) -> str:
        if titulo == meta["indice"]:
            return "índice"
        if titulo in fichas:
            return next(c["titulo"] for c in spec["clusters"] if c["id"] == fichas[titulo]["_cluster"])
        return titulo

    def tipo(titulo: str) -> str:
        if titulo == meta["indice"]:
            return "indice"
        return "moc" if titulo in hubs else "ficha"

    dados = {
        "nodes": [
            {"id": t, "grupo": grupo(t), "tipo": tipo(t), "grau": g[t]}
            for t in sorted(nos)
        ],
        "links": [{"source": a, "target": b, "peso": p} for (a, b), p in sorted(arestas.items())],
    }
    html = PREVIA_HTML
    for chave, valor in [
        ("__VAULT__", meta["vault"]),
        ("__NOS__", str(stats["nos"])),
        ("__ARESTAS__", str(stats["arestas"])),
        ("__GRAU__", str(stats["grau_medio"])),
        ("__DENS__", str(stats["densidade"])),
        ("__DADOS__", json.dumps(dados, ensure_ascii=False)),
        ("__CORES__", json.dumps(CORES_GRUPO, ensure_ascii=False)),
    ]:
        html = html.replace(chave, valor)
    return html


# ------------------------------------------------------------------------------ main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--densidade", type=float, default=0.17, help="densidade alvo do grafo (0.08–0.20 fica legível)")
    ap.add_argument("--min-grau", type=int, default=4, help="grau mínimo preservado por nó")
    ap.add_argument("--sem-poda", action="store_true")
    ap.add_argument("--sem-zip", action="store_true")
    ap.add_argument("--so-checar", action="store_true")
    args = ap.parse_args()

    spec = carregar_spec()
    meta, clusters, notas = spec["meta"], spec["clusters"], spec["notas"]
    indice = meta["indice"]

    arestas, nos, fixas = construir_grafo(spec)
    total_antes = len(arestas)
    if not args.sem_poda:
        arestas = podar(arestas, nos, args.densidade, args.min_grau, fixas)

    por_cluster = defaultdict(list)
    for n in notas:
        por_cluster[n["_cluster"]].append(n)

    # renderiza
    arquivos = {}
    for n in notas:
        cluster = next(c for c in clusters if c["id"] == n["_cluster"])
        arquivos[n["titulo"]] = render_ficha(n, cluster, vizinhos(arestas, n["titulo"]))
    for c in clusters:
        arquivos[c["titulo"]] = render_moc(
            c, por_cluster[c["id"]], clusters, indice, vizinhos(arestas, c["titulo"])
        )

    # valida: todo wikilink precisa existir
    for origem, corpo in arquivos.items():
        for alvo in WIKILINK.findall(corpo):
            alvo = alvo.strip()
            if alvo not in nos:
                sys.exit(f"❌ link quebrado em [[{origem}]] -> [[{alvo}]]")

    g = graus(arestas, nos)
    stats = {
        "nos": len(nos),
        "fichas": len(notas),
        "hubs": len(clusters),
        "arestas": len(arestas),
        "grau_medio": round(sum(g.values()) / len(g), 2),
        "grau_min": min(g.values()),
        "densidade": round(densidade(len(arestas), len(nos)), 3),
        "quentes": [f"{t} ({d})" for t, d in sorted(g.items(), key=lambda kv: (-kv[1], kv[0]))[:6]],
        "densidade_alvo": args.densidade,
    }

    arquivos[meta["indice"]] = render_indice(meta, clusters, stats)
    arquivos["README"] = render_readme(meta, stats)
    previa = render_previa(meta, spec, arestas, nos, stats)

    print(f"📊 nós {stats['nos']} · fichas {stats['fichas']} · hubs {stats['hubs']}")
    print(f"   arestas: {total_antes} -> {stats['arestas']} (densidade {stats['densidade']}, alvo {args.densidade})")
    print(f"   grau médio {stats['grau_medio']} · mínimo {stats['grau_min']} · componentes {componentes(arestas, nos)}")
    print(f"   mais conectadas: {', '.join(stats['quentes'])}")
    fracos = sorted(t for t, d in g.items() if d < args.min_grau)
    if fracos:
        print(f"   ⚠️  abaixo do grau mínimo: {', '.join(fracos)}")

    if args.so_checar:
        print("\n✅ checagem concluída (nada escrito)")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for titulo, corpo in arquivos.items():
        (OUT_DIR / f"{titulo}.md").write_text(corpo, encoding="utf-8")
    (OUT_DIR / "previa-grafo.html").write_text(previa, encoding="utf-8")
    # index.html so existe para o preview no navegador (nao vai no zip)
    (OUT_DIR / "index.html").write_text(
        '<meta http-equiv="refresh" content="0; url=previa-grafo.html">', encoding="utf-8"
    )
    print(f"\n📝 {len(arquivos)} notas + previa-grafo.html em {OUT_DIR.relative_to(ROOT)}/")

    if not args.sem_zip:
        with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as z:
            for titulo in arquivos:
                z.write(OUT_DIR / f"{titulo}.md", f"{meta['pasta']}/{titulo}.md")
            z.write(OUT_DIR / "previa-grafo.html", f"{meta['pasta']}/previa-grafo.html")
            for f in sorted(SPEC_DIR.glob("*.json")):
                z.write(f, f"{meta['pasta']}/_spec/{f.name}")
        print(f"📦 zip: {ZIP_PATH.relative_to(ROOT)} ({ZIP_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
